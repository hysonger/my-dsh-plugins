import assert from 'node:assert/strict';
import test from 'node:test';

import { apply, hasRunningSession, isCaffeinateEnabled } from '../index.js';

function hostHarness({ enabled = false, agents = [] } = {}) {
  let currentEnabled = enabled;
  let currentAgents = agents;
  const events = new Map();
  const effects = [];
  const decisions = [];
  const routes = new Set();
  let caffeinateDisposed = false;
  let sleepDisposed = false;
  const caffeinate = {
    reconcile(value) { decisions.push(value); },
    dispose() { caffeinateDisposed = true; },
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
  apply(ctx, config, { caffeinate, sleepService });
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
    get caffeinateDisposed() { return caffeinateDisposed; },
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
  assert.equal(host.caffeinateDisposed, true);
  assert.equal(host.sleepDisposed, true);
});
