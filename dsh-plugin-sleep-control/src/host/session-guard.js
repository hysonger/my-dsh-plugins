import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { win32 } from 'node:path';

import { isSupportedPlatform } from './platform.js';

export const MACOS_CAFFEINATE_PATH = '/usr/bin/caffeinate';
export const MACOS_CAFFEINATE_ARGS = Object.freeze(['-s']);

/**
 * Fixed Windows helper script. It requests the ES_CONTINUOUS | ES_SYSTEM_REQUIRED
 * execution state on its own thread and then stays alive, so the assertion lasts
 * exactly as long as this process and disappears when it exits. No user input is
 * ever interpolated into it.
 */
export const WINDOWS_SLEEP_GUARD_SCRIPT = `$ErrorActionPreference = 'Stop'
$signature = '[DllImport("kernel32.dll", SetLastError = true)] public static extern uint SetThreadExecutionState(uint esFlags);'
try {
  $kernel32 = Add-Type -Namespace DshSleepControl -Name Kernel32 -MemberDefinition $signature -PassThru
  $previous = $kernel32::SetThreadExecutionState([uint32]2147483649)
  if ($previous -eq 0) { throw 'SetThreadExecutionState failed.' }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
while ($true) { Start-Sleep -Seconds 3600 }
`;

/** PowerShell reads -EncodedCommand as base64 of a UTF-16LE string. */
export const WINDOWS_SLEEP_GUARD_COMMAND = Buffer.from(WINDOWS_SLEEP_GUARD_SCRIPT, 'utf16le')
  .toString('base64');

export const WINDOWS_SLEEP_GUARD_ARGS = Object.freeze([
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-EncodedCommand',
  WINDOWS_SLEEP_GUARD_COMMAND,
]);

/** Windows PowerShell 5.1 is present on every supported Windows installation. */
export function windowsPowerShellPath(systemRoot = process.env.SystemRoot ?? 'C:\\Windows') {
  return win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** Resolve the fixed long-lived command that holds the session sleep assertion. */
export function sessionGuardCommand(platform, options = {}) {
  if (platform === 'darwin') {
    return { file: MACOS_CAFFEINATE_PATH, args: MACOS_CAFFEINATE_ARGS };
  }
  if (platform === 'win32') {
    return { file: windowsPowerShellPath(options.systemRoot), args: WINDOWS_SLEEP_GUARD_ARGS };
  }
  return null;
}

const DEFAULT_KILL_GRACE_MS = 2000;
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 5000, 10000, 30000]);

/**
 * Owns the single long-lived OS process used for session-scoped sleep
 * prevention: `caffeinate -s` on macOS and an execution-state PowerShell helper
 * on Windows. All process primitives are injectable so tests never create a
 * real power assertion.
 */
export class SessionSleepGuard {
  constructor(options = {}) {
    this.spawn = options.spawn ?? spawn;
    this.platform = options.platform ?? process.platform;
    this.command = options.command
      ?? (isSupportedPlatform(this.platform)
        ? sessionGuardCommand(this.platform, { systemRoot: options.systemRoot })
        : null);
    this.logger = options.logger;
    this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.child = null;
    this.desired = false;
    this.disposed = false;
    this.retryAttempt = 0;
    this.retryTimer = null;
    this.killTimers = new Map();
  }

  /** Reconcile the process with the current enabled/running-session decision. */
  reconcile(shouldRun) {
    if (this.disposed) return;
    const desired = shouldRun === true && this.command !== null;
    if (desired !== this.desired) {
      this.desired = desired;
      this.retryAttempt = 0;
    }
    if (!desired) {
      this.cancelRetry();
      this.stop();
      return;
    }
    if (this.child || this.retryTimer) return;
    this.start();
  }

  start() {
    const command = this.command;
    if (this.disposed || !this.desired || this.child || !command) return;
    let child;
    try {
      child = this.spawn(command.file, [...command.args], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (error) {
      this.handleUnexpectedStop(error);
      return;
    }

    this.child = child;
    child.once('error', (error) => {
      const wasCurrent = this.child === child;
      if (wasCurrent) this.child = null;
      this.clearKillTimer(child);
      if (wasCurrent && this.desired && !this.disposed) this.handleUnexpectedStop(error);
    });
    child.once('exit', (code, signal) => {
      const wasCurrent = this.child === child;
      if (wasCurrent) this.child = null;
      this.clearKillTimer(child);
      if (wasCurrent && this.desired && !this.disposed) {
        this.handleUnexpectedStop(new Error(`sleep guard exited (code=${code}, signal=${signal}).`));
      }
    });
  }

  handleUnexpectedStop(error) {
    if (!this.desired || this.disposed || this.retryTimer) return;
    this.logger?.warn?.(`[sleep-control] session sleep guard stopped unexpectedly: ${String(error)}`);
    const delays = this.retryDelaysMs.length > 0 ? this.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
    const delay = delays[Math.min(this.retryAttempt, delays.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.desired && !this.disposed) this.start();
    }, delay);
    this.retryTimer.unref?.();
  }

  cancelRetry() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  clearKillTimer(child) {
    const timer = this.killTimers.get(child);
    if (timer !== undefined) clearTimeout(timer);
    this.killTimers.delete(child);
  }

  stop() {
    this.cancelRetry();
    const child = this.child;
    if (!child) return;
    this.child = null;
    try {
      child.kill('SIGTERM');
    } catch (error) {
      this.logger?.warn?.(`[sleep-control] failed to terminate the session sleep guard: ${String(error)}`);
    }
    if (child.exitCode !== null || child.signalCode !== null) return;
    const timer = setTimeout(() => {
      this.killTimers.delete(child);
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch (error) {
          this.logger?.warn?.(`[sleep-control] failed to kill the session sleep guard: ${String(error)}`);
        }
      }
    }, this.killGraceMs);
    timer.unref?.();
    this.killTimers.set(child, timer);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.desired = false;
    this.stop();
  }
}
