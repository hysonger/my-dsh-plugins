import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  CAFFEINATE_ARGS,
  CAFFEINATE_PATH,
  CaffeinateService,
} from '../src/host/caffeinate.js';

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
  const service = new CaffeinateService({
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

test('caffeinate uses one fixed process and stops on loss of demand', () => {
  const { service, calls, children } = harness();
  service.reconcile(true);
  service.reconcile(true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, CAFFEINATE_PATH);
  assert.deepEqual(calls[0].args, ['-s']);
  assert.deepEqual(CAFFEINATE_ARGS, ['-s']);
  assert.equal(calls[0].options.stdio, 'ignore');

  service.reconcile(false);
  service.reconcile(false);
  assert.deepEqual(children[0].kills, ['SIGTERM']);
  assert.equal(service.child, null);
  children[0].emit('exit', null, 'SIGTERM');
  assert.equal(service.retryTimer, null);
  service.dispose();
});

test('non-macOS never spawns even when requested', () => {
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
  const service = new CaffeinateService({
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
