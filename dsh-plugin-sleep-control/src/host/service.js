import { execFile } from 'node:child_process';

export const PMSET_PATH = '/usr/bin/pmset';
export const OSASCRIPT_PATH = '/usr/bin/osascript';
export const SUDO_PATH = '/usr/bin/sudo';

const DEFAULT_MAX_BUFFER = 64 * 1024;
const KILL_GRACE_MS = 2000;

/** Error with a stable, Client-safe code. */
export class SleepControlError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'SleepControlError';
    this.code = code;
  }
}

/**
 * Promise wrapper kept injectable so tests never execute real power commands.
 * Abort and timeout first send SIGTERM, then escalate to SIGKILL.
 */
export function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    let child;
    let timeout = null;
    let killTimeout = null;
    let settled = false;
    let aborted = false;
    let timedOut = false;
    const signal = options.signal;

    const cleanup = () => {
      if (timeout !== null) clearTimeout(timeout);
      if (killTimeout !== null) clearTimeout(killTimeout);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const terminate = () => {
      if (!child || child.exitCode !== null || child.signalCode !== null || killTimeout !== null) {
        return;
      }
      child.kill('SIGTERM');
      killTimeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, KILL_GRACE_MS);
      killTimeout.unref?.();
    };
    const onAbort = () => {
      aborted = true;
      terminate();
    };

    try {
      child = execFile(
        file,
        args,
        {
          maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
          windowsHide: true,
          killSignal: 'SIGTERM',
        },
        (error, stdout, stderr) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            if (aborted) error.name = 'AbortError';
            if (timedOut && !error.code) error.code = 'ETIMEDOUT';
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }

    if (typeof options.timeout === 'number' && options.timeout > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        terminate();
      }, options.timeout);
      timeout.unref?.();
    }
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/** Parse only the global SleepDisabled setting, never the similarly named sleep row. */
export function parseSleepDisabled(output) {
  if (typeof output !== 'string') return null;
  const match = output.match(/^\s*SleepDisabled\s+([01])\s*$/m);
  return match ? match[1] === '1' : null;
}

/** Build one of exactly two constant privileged commands. */
export function buildAdministratorScript(sleepDisabled) {
  if (typeof sleepDisabled !== 'boolean') {
    throw new SleepControlError('bad-request', 'sleepDisabled must be a boolean.');
  }
  const value = sleepDisabled ? '1' : '0';
  return `do shell script "${SUDO_PATH} ${PMSET_PATH} -a disablesleep ${value}" with administrator privileges`;
}

function errorText(error) {
  if (!error || typeof error !== 'object') return String(error);
  return [error.message, error.stderr, error.stdout]
    .filter((part) => typeof part === 'string')
    .join('\n');
}

export function isAuthorizationCancellation(error) {
  const text = errorText(error);
  return /(?:User canceled|User cancelled|用户取消|用户已取消|\(\s*-128\s*\)|:\s*-128\b)/i.test(text);
}

function wasDisposed(service, error) {
  return service.disposed || error?.name === 'AbortError';
}

/**
 * Owns all pmset access. There is one privileged operation at a time so a
 * second view cannot stack native administrator dialogs.
 */
export class SleepControlService {
  constructor(options = {}) {
    this.exec = options.exec ?? execFileAsync;
    this.platform = options.platform ?? process.platform;
    this.statusTimeoutMs = options.statusTimeoutMs ?? 5000;
    this.authorizationTimeoutMs = options.authorizationTimeoutMs ?? 180000;
    this.inFlight = null;
    this.disposed = false;
    this.activeControllers = new Set();
  }

  assertSupported() {
    if (this.disposed) {
      throw new SleepControlError('disposed', 'Sleep control has been unloaded.');
    }
    if (this.platform !== 'darwin') {
      throw new SleepControlError('unsupported', 'Sleep control is available only on macOS.');
    }
  }

  async execute(file, args, options) {
    this.assertSupported();
    const controller = new AbortController();
    this.activeControllers.add(controller);
    try {
      return await this.exec(file, args, { ...options, signal: controller.signal });
    } finally {
      this.activeControllers.delete(controller);
    }
  }

  async getStatus() {
    this.assertSupported();
    let result;
    try {
      result = await this.execute(PMSET_PATH, ['-g'], { timeout: this.statusTimeoutMs });
    } catch (error) {
      if (wasDisposed(this, error)) {
        throw new SleepControlError('disposed', 'Sleep control has been unloaded.', { cause: error });
      }
      throw new SleepControlError(
        'status-unavailable',
        'Unable to read macOS power settings.',
        { cause: error },
      );
    }
    const sleepDisabled = parseSleepDisabled(result.stdout);
    if (sleepDisabled === null) {
      throw new SleepControlError(
        'status-unavailable',
        'pmset output did not contain a recognizable SleepDisabled value.',
      );
    }
    return { sleepDisabled };
  }

  async setSleepDisabled(sleepDisabled) {
    if (typeof sleepDisabled !== 'boolean') {
      throw new SleepControlError('bad-request', 'sleepDisabled must be a boolean.');
    }
    this.assertSupported();
    if (this.inFlight) {
      throw new SleepControlError(
        'busy',
        'Another sleep-setting change is already waiting for authorization.',
      );
    }

    const operation = (async () => {
      try {
        await this.execute(OSASCRIPT_PATH, ['-e', buildAdministratorScript(sleepDisabled)], {
          timeout: this.authorizationTimeoutMs,
        });
      } catch (error) {
        if (wasDisposed(this, error)) {
          throw new SleepControlError('disposed', 'Sleep control has been unloaded.', { cause: error });
        }
        if (isAuthorizationCancellation(error)) {
          throw new SleepControlError(
            'cancelled',
            'Administrator authorization was cancelled; the setting was not changed.',
            { cause: error },
          );
        }
        throw new SleepControlError(
          'command-failed',
          'The privileged pmset command failed.',
          { cause: error },
        );
      }

      let status;
      try {
        status = await this.getStatus();
      } catch (error) {
        if (wasDisposed(this, error)) throw error;
        throw new SleepControlError(
          'verification-failed',
          'The command finished, but the resulting SleepDisabled value could not be read.',
          { cause: error },
        );
      }
      if (status.sleepDisabled !== sleepDisabled) {
        throw new SleepControlError(
          'verification-failed',
          'The resulting SleepDisabled value did not match the requested value.',
        );
      }
      return status;
    })();

    this.inFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.inFlight === operation) this.inFlight = null;
    }
  }

  /** Abort every managed process, including a pending native authorization. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.activeControllers) controller.abort();
    this.activeControllers.clear();
  }
}
