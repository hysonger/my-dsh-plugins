import { spawn } from 'node:child_process';

export const CAFFEINATE_PATH = '/usr/bin/caffeinate';
export const CAFFEINATE_ARGS = Object.freeze(['-s']);

const DEFAULT_KILL_GRACE_MS = 2000;
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 5000, 10000, 30000]);

/**
 * Owns the single long-lived caffeinate process used for session-scoped sleep
 * prevention. All process primitives are injectable so tests never create a
 * real power assertion.
 */
export class CaffeinateService {
  constructor(options = {}) {
    this.spawn = options.spawn ?? spawn;
    this.platform = options.platform ?? process.platform;
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
    const desired = shouldRun === true && this.platform === 'darwin';
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
    if (this.disposed || !this.desired || this.child) return;
    let child;
    try {
      child = this.spawn(CAFFEINATE_PATH, [...CAFFEINATE_ARGS], {
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
        this.handleUnexpectedStop(new Error(`caffeinate exited (code=${code}, signal=${signal}).`));
      }
    });
  }

  handleUnexpectedStop(error) {
    if (!this.desired || this.disposed || this.retryTimer) return;
    this.logger?.warn?.(`[sleep-control] caffeinate stopped unexpectedly: ${String(error)}`);
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
      this.logger?.warn?.(`[sleep-control] failed to terminate caffeinate: ${String(error)}`);
    }
    if (child.exitCode !== null || child.signalCode !== null) return;
    const timer = setTimeout(() => {
      this.killTimers.delete(child);
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch (error) {
          this.logger?.warn?.(`[sleep-control] failed to kill caffeinate: ${String(error)}`);
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
