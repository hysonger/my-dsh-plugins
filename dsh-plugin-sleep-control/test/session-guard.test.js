import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { win32 } from 'node:path';
import test from 'node:test';

import {
  MACOS_CAFFEINATE_ARGS,
  MACOS_CAFFEINATE_PATH,
  SessionSleepGuard,
  WINDOWS_SLEEP_GUARD_ARGS,
  WINDOWS_SLEEP_GUARD_SCRIPT,
  sessionGuardCommand,
  windowsPowerShellPath,
} from '../src/host/session-guard.js';

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.kills = [];
  }

  kill(signal) {
    this.kills.push(signal);
    return true;
  }
}

function harness(options = {}) {
  const calls = [];
  const children = [];
  const warnings = [];
  const service = new SessionSleepGuard({
    platform: 'darwin',
    killGraceMs: 5,
    retryDelaysMs: [5, 10],
    ...options,
    spawn(file, args, spawnOptions) {
      const child = new FakeChild();
      calls.push({ file, args, options: spawnOptions });
      children.push(child);
      return child;
    },
    logger: { warn: (message) => warnings.push(message) },
  });
  return { service, calls, children, warnings };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('macOS uses one fixed caffeinate process and stops on loss of demand', () => {
  const { service, calls, children } = harness();
  service.reconcile(true);
  service.reconcile(true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, MACOS_CAFFEINATE_PATH);
  assert.deepEqual(calls[0].args, ['-s']);
  assert.deepEqual(MACOS_CAFFEINATE_ARGS, ['-s']);
  assert.equal(calls[0].options.stdio, 'ignore');

  service.reconcile(false);
  service.reconcile(false);
  assert.deepEqual(children[0].kills, ['SIGTERM']);
  assert.equal(service.child, null);
  children[0].emit('exit', null, 'SIGTERM');
  assert.equal(service.retryTimer, null);
  service.dispose();
});

test('Windows holds one execution-state helper instead of caffeinate', () => {
  const { service, calls } = harness({ platform: 'win32', systemRoot: 'C:\\Windows' });
  service.reconcile(true);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].file,
    win32.join('C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  );
  assert.deepEqual(calls[0].args, [...WINDOWS_SLEEP_GUARD_ARGS]);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.stdio, 'ignore');
  service.reconcile(false);
  service.dispose();
});

test('the Windows command encodes the fixed execution-state script', () => {
  const index = WINDOWS_SLEEP_GUARD_ARGS.indexOf('-EncodedCommand');
  assert.notEqual(index, -1);
  const encoded = WINDOWS_SLEEP_GUARD_ARGS[index + 1];
  assert.equal(Buffer.from(encoded, 'base64').toString('utf16le'), WINDOWS_SLEEP_GUARD_SCRIPT);
  assert.match(WINDOWS_SLEEP_GUARD_SCRIPT, /SetThreadExecutionState/);
  // ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001).
  assert.match(WINDOWS_SLEEP_GUARD_SCRIPT, /\[uint32\]2147483649/);
  assert.match(WINDOWS_SLEEP_GUARD_SCRIPT, /Start-Sleep/);
  assert.ok(WINDOWS_SLEEP_GUARD_ARGS.includes('-NoProfile'));
  assert.ok(WINDOWS_SLEEP_GUARD_ARGS.includes('-NonInteractive'));
  assert.ok(WINDOWS_SLEEP_GUARD_ARGS.includes('-NoLogo'));
});

test('sessionGuardCommand resolves per platform and rejects others', () => {
  assert.deepEqual(sessionGuardCommand('darwin'), {
    file: MACOS_CAFFEINATE_PATH,
    args: MACOS_CAFFEINATE_ARGS,
  });
  const windows = sessionGuardCommand('win32', { systemRoot: 'D:\\Windows' });
  assert.equal(windows.file, windowsPowerShellPath('D:\\Windows'));
  assert.deepEqual(windows.args, [...WINDOWS_SLEEP_GUARD_ARGS]);
  assert.equal(sessionGuardCommand('linux'), null);
  assert.equal(sessionGuardCommand('freebsd'), null);
});

test('unsupported platforms never spawn even when requested', () => {
  const { service, calls } = harness({ platform: 'linux' });
  service.reconcile(true);
  assert.equal(calls.length, 0);
  assert.equal(service.desired, false);
  service.dispose();
});

test('unexpected exits restart with bounded backoff, not a tight loop', async () => {
  const { service, calls, children, warnings } = harness();
  service.reconcile(true);
  children[0].emit('exit', 1, null);
  assert.equal(calls.length, 1);
  assert.equal(warnings.length, 1);
  await wait(9);
  assert.equal(calls.length, 2);

  children[1].emit('exit', 1, null);
  await wait(7);
  assert.equal(calls.length, 2);
  await wait(7);
  assert.equal(calls.length, 3);
  service.dispose();
});

test('disabling during a retry delay cancels the restart', async () => {
  const { service, calls, children } = harness();
  service.reconcile(true);
  children[0].emit('exit', 1, null);
  assert.notEqual(service.retryTimer, null);
  service.reconcile(false);
  assert.equal(service.retryTimer, null);
  await wait(12);
  assert.equal(calls.length, 1);
  service.dispose();
});

test('a stale exit cannot clear or restart over a replacement process', () => {
  const { service, children, calls } = harness();
  service.reconcile(true);
  const first = children[0];
  service.reconcile(false);
  service.reconcile(true);
  const second = children[1];
  assert.equal(calls.length, 2);
  first.emit('exit', null, 'SIGTERM');
  assert.equal(service.child, second);
  assert.equal(service.retryTimer, null);
  service.dispose();
});

test('termination escalates to SIGKILL only after the grace period', async () => {
  const { service, children } = harness();
  service.reconcile(true);
  service.reconcile(false);
  assert.deepEqual(children[0].kills, ['SIGTERM']);
  await wait(10);
  assert.deepEqual(children[0].kills, ['SIGTERM', 'SIGKILL']);
  service.dispose();
});

test('synchronous spawn failures are logged and retried without throwing', async () => {
  const warnings = [];
  let calls = 0;
  const service = new SessionSleepGuard({
    platform: 'darwin',
    retryDelaysMs: [5],
    spawn() {
      calls += 1;
      throw new Error('spawn unavailable');
    },
    logger: { warn: (message) => warnings.push(message) },
  });
  service.reconcile(true);
  assert.equal(calls, 1);
  assert.equal(warnings.length, 1);
  await wait(9);
  assert.equal(calls, 2);
  service.dispose();
});

test('dispose stops an active process and prevents all future starts', () => {
  const { service, children, calls } = harness();
  service.reconcile(true);
  service.dispose();
  assert.deepEqual(children[0].kills, ['SIGTERM']);
  service.reconcile(true);
  service.dispose();
  assert.equal(calls.length, 1);
  assert.equal(service.retryTimer, null);
});
