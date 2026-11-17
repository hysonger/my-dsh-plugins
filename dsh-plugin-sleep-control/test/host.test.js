import assert from 'node:assert/strict';
import test from 'node:test';

import { apply, hasRunningSession, isCaffeinateEnabled } from '../index.js';

function hostHarness({ enabled = false, agents = [], platform = 'darwin' } = {}) {
  let currentEnabled = enabled;
  let currentAgents = agents;
  const events = new Map();
  const effects = [];
  const decisions = [];
  const routes = new Set();
  let sessionGuardDisposed = false;
  let sleepDisposed = false;
  const sessionGuard = {
    reconcile(value) { decisions.push(value); },
    dispose() { sessionGuardDisposed = true; },
  };
  const sleepService = { dispose() { sleepDisposed = true; } };
  const ctx = {
    agents: { list: () => currentAgents },
    webServer: {
      getOrigin: () => 'http://127.0.0.1:1',
      register(route) {
        routes.add(route.path);
        return () => routes.delete(route.path);
      },
    },
    logger: { info() {}, warn() {} },
    fiber: {},
    on(name, listener) {
      events.set(name, listener);
      return () => events.delete(name);
    },
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') effects.push(dispose);
    },
    inject(names) {
      assert.deepEqual(names, ['settings']);
    },
  };
  const config = {
    caffeinateDuringSessions: { get: () => currentEnabled },
  };
  apply(ctx, config, { sessionGuard, sleepService, platform });
  return {
    decisions,
    events,
    setEnabled(value) { currentEnabled = value; },
    setAgents(value) { currentAgents = value; },
    emit(name) { events.get(name)?.({}); },
    dispose() {
      for (const effect of effects.reverse()) effect();
    },
    get routes() { return routes; },
    get sessionGuardDisposed() { return sessionGuardDisposed; },
    get sleepDisposed() { return sleepDisposed; },
  };
}

const running = (id) => ({ id, status: 'running' });
const idle = (id) => ({ id, status: 'idle' });

test('volatile config helpers accept refs and detect every running Agent', () => {
  assert.equal(isCaffeinateEnabled({ caffeinateDuringSessions: { get: () => true } }), true);
  assert.equal(isCaffeinateEnabled({ caffeinateDuringSessions: false }), false);
  assert.equal(hasRunningSession({ list: () => [idle('a'), running('b')] }), true);
  assert.equal(hasRunningSession({ list: () => [idle('a')] }), false);
});

test('host reconciles an already-running session at startup', () => {
  const host = hostHarness({ enabled: true, agents: [running('existing')] });
  assert.deepEqual(host.decisions, [true]);
  host.dispose();
});

test('Windows mounts the same session guard and settings routes', () => {
  const host = hostHarness({ enabled: true, agents: [running('a')], platform: 'win32' });
  assert.deepEqual(host.decisions, [true]);
  assert.deepEqual([...host.routes].sort(), [
    '/sleep-control/api/set',
    '/sleep-control/api/status',
  ]);
  host.dispose();
});

test('unsupported platforms mount nothing and never reconcile', () => {
  const routes = [];
  const infos = [];
  const events = [];
  const effects = [];
  const ctx = {
    agents: { list: () => [running('a')] },
    webServer: {
      getOrigin: () => 'http://127.0.0.1:1',
      register(route) {
        routes.push(route.path);
        return () => undefined;
      },
    },
    logger: { info: (message) => infos.push(message), warn() {} },
    fiber: {},
    on(name) { events.push(name); return () => undefined; },
    effect(callback) { effects.push(callback); },
    inject() { throw new Error('unsupported platforms must not inject settings'); },
  };
  apply(
    ctx,
    { caffeinateDuringSessions: { get: () => true } },
    {
      platform: 'linux',
      sessionGuard: { reconcile() { throw new Error('must not reconcile'); }, dispose() {} },
      sleepService: { dispose() {} },
    },
  );
  assert.deepEqual(routes, []);
  assert.deepEqual(events, []);
  assert.deepEqual(effects, []);
  assert.match(infos.at(-1), /linux/);
});

test('multiple sessions stay protected until the last one becomes idle', () => {
  const host = hostHarness({ enabled: true, agents: [running('a'), running('b')] });
  host.setAgents([idle('a'), running('b')]);
  host.emit('agent/status');
  assert.equal(host.decisions.at(-1), true);
  host.setAgents([idle('a'), idle('b')]);
  host.emit('agent/status');
  assert.equal(host.decisions.at(-1), false);
  host.dispose();
});

test('volatile updates enable and disable protection without a plugin reload', () => {
  const host = hostHarness({ enabled: false, agents: [running('a')] });
  assert.deepEqual(host.decisions, [false]);
  host.setEnabled(true);
  host.emit('loader/volatile-update');
  assert.equal(host.decisions.at(-1), true);
  host.setEnabled(false);
  host.emit('loader/volatile-update');
  assert.equal(host.decisions.at(-1), false);
  host.dispose();
});

test('Agent creation and disposal use the latest registry contents', () => {
  const host = hostHarness({ enabled: true });
  host.setAgents([running('child')]);
  host.emit('agent/created');
  assert.equal(host.decisions.at(-1), true);
  host.setAgents([]);
  host.emit('agent/disposed');
  assert.equal(host.decisions.at(-1), false);
  host.dispose();
});

test('disposal releases routes and both host services', () => {
  const host = hostHarness({ enabled: true, agents: [running('a')] });
  assert.deepEqual([...host.routes].sort(), [
    '/sleep-control/api/set',
    '/sleep-control/api/status',
  ]);
  host.dispose();
  assert.equal(host.routes.size, 0);
  assert.equal(host.sessionGuardDisposed, true);
  assert.equal(host.sleepDisposed, true);
});
