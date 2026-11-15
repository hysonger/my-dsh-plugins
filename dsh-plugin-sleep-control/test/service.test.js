import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdministratorScript,
  isAuthorizationCancellation,
  parseSleepDisabled,
  PMSET_PATH,
  OSASCRIPT_PATH,
  SleepControlService,
} from '../src/host/service.js';

const PMSET_OFF = `System-wide power settings:\n SleepDisabled\t\t0\nCurrently in use:\n sleep 10\n`;
const PMSET_ON = PMSET_OFF.replace('SleepDisabled\t\t0', 'SleepDisabled\t\t1');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('parseSleepDisabled accepts only the global 0/1 field', () => {
  assert.equal(parseSleepDisabled(PMSET_OFF), false);
  assert.equal(parseSleepDisabled(PMSET_ON), true);
  assert.equal(parseSleepDisabled(' sleep 0\n'), null);
  assert.equal(parseSleepDisabled('SleepDisabled 2\n'), null);
  assert.equal(parseSleepDisabled('SleepDisabled yes\n'), null);
  assert.equal(parseSleepDisabled(null), null);
});

test('administrator scripts are fixed sudo pmset commands', () => {
  assert.equal(
    buildAdministratorScript(true),
    'do shell script "/usr/bin/sudo /usr/bin/pmset -a disablesleep 1" with administrator privileges',
  );
  assert.equal(
    buildAdministratorScript(false),
    'do shell script "/usr/bin/sudo /usr/bin/pmset -a disablesleep 0" with administrator privileges',
  );
  assert.throws(() => buildAdministratorScript('1; rm -rf /'), { code: 'bad-request' });
});

test('cancellation recognizes AppleScript -128 failures', () => {
  assert.equal(isAuthorizationCancellation(new Error('Command failed: User canceled. (-128)')), true);
  assert.equal(isAuthorizationCancellation(new Error('pmset: permission denied')), false);
});

test('getStatus runs unprivileged pmset and parses its output', async () => {
  const calls = [];
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async (...args) => {
      calls.push(args);
      return { stdout: PMSET_OFF, stderr: '' };
    },
  });
  assert.deepEqual(await service.getStatus(), { sleepDisabled: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], PMSET_PATH);
  assert.deepEqual(calls[0][1], ['-g']);
  assert.equal(calls[0][2].timeout, 5000);
});

test('getStatus rejects missing values and process failures without guessing', async () => {
  const missing = new SleepControlService({
    platform: 'darwin',
    exec: async () => ({ stdout: 'sleep 0\n', stderr: '' }),
  });
  await assert.rejects(missing.getStatus(), { code: 'status-unavailable' });

  const failed = new SleepControlService({
    platform: 'darwin',
    exec: async () => {
      throw new Error('pmset unavailable');
    },
  });
  await assert.rejects(failed.getStatus(), { code: 'status-unavailable' });
});

test('non-macOS platforms never spawn a process', async () => {
  let calls = 0;
  const service = new SleepControlService({
    platform: 'linux',
    exec: async () => {
      calls += 1;
      return { stdout: PMSET_OFF, stderr: '' };
    },
  });
  await assert.rejects(service.getStatus(), { code: 'unsupported' });
  await assert.rejects(service.setSleepDisabled(true), { code: 'unsupported' });
  assert.equal(calls, 0);
});

test('setSleepDisabled authorizes and then verifies the requested value', async () => {
  const calls = [];
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async (file, args) => {
      calls.push([file, args]);
      if (file === OSASCRIPT_PATH) return { stdout: '', stderr: '' };
      return { stdout: PMSET_ON, stderr: '' };
    },
  });
  assert.deepEqual(await service.setSleepDisabled(true), { sleepDisabled: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], OSASCRIPT_PATH);
  assert.deepEqual(calls[0][1], ['-e', buildAdministratorScript(true)]);
  assert.equal(calls[1][0], PMSET_PATH);
});

test('cancelled authorization does not run a verification command', async () => {
  let calls = 0;
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async () => {
      calls += 1;
      const error = new Error('Command failed');
      error.stderr = 'User canceled. (-128)';
      throw error;
    },
  });
  await assert.rejects(service.setSleepDisabled(true), { code: 'cancelled' });
  assert.equal(calls, 1);
});

test('privileged command failures retain their stable code', async () => {
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async () => {
      throw new Error('authorization denied');
    },
  });
  await assert.rejects(service.setSleepDisabled(false), { code: 'command-failed' });
});

test('a mismatched readback is a verification failure', async () => {
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async (file) => ({
      stdout: file === PMSET_PATH ? PMSET_OFF : '',
      stderr: '',
    }),
  });
  await assert.rejects(service.setSleepDisabled(true), { code: 'verification-failed' });
});

test('an unreadable readback is also a verification failure', async () => {
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async (file) => {
      if (file === PMSET_PATH) throw new Error('read failed');
      return { stdout: '', stderr: '' };
    },
  });
  await assert.rejects(service.setSleepDisabled(true), { code: 'verification-failed' });
});

test('concurrent changes cannot open a second authorization flow', async () => {
  const pending = deferred();
  let adminCalls = 0;
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async (file) => {
      if (file === OSASCRIPT_PATH) {
        adminCalls += 1;
        return pending.promise;
      }
      return { stdout: PMSET_ON, stderr: '' };
    },
  });
  const first = service.setSleepDisabled(true);
  await assert.rejects(service.setSleepDisabled(false), { code: 'busy' });
  assert.equal(adminCalls, 1);
  pending.resolve({ stdout: '', stderr: '' });
  assert.deepEqual(await first, { sleepDisabled: true });
  assert.equal(service.inFlight, null);
});

test('invalid values are rejected before any process starts', async () => {
  let calls = 0;
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async () => {
      calls += 1;
      return { stdout: PMSET_OFF, stderr: '' };
    },
  });
  await assert.rejects(service.setSleepDisabled('0'), { code: 'bad-request' });
  assert.equal(calls, 0);
});

test('dispose aborts a pending authorization and prevents readback', async () => {
  let calls = 0;
  let authorizationSignal;
  const service = new SleepControlService({
    platform: 'darwin',
    exec: async (file, args, options) => {
      calls += 1;
      authorizationSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });
  const pending = service.setSleepDisabled(true);
  assert.equal(authorizationSignal.aborted, false);
  service.dispose();
  assert.equal(authorizationSignal.aborted, true);
  await assert.rejects(pending, { code: 'disposed' });
  assert.equal(calls, 1);
  assert.equal(service.inFlight, null);
  await assert.rejects(service.getStatus(), { code: 'disposed' });
});

test('real exec wrapper aborts a bounded child process', async () => {
  const { execFileAsync } = await import('../src/host/service.js');
  const controller = new AbortController();
  const pending = execFileAsync('/bin/sh', ['-c', 'sleep 5'], {
    timeout: 5000,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});
