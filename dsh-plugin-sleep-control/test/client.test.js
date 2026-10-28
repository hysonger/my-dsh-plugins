import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const CLIENT_FILE = new URL('../client.js', import.meta.url);

async function loadClient(sandbox = {}) {
  const source = await readFile(CLIENT_FILE, 'utf8');
  let definition;
  const context = {
    window: {
      __ModuleLoader__: {
        load(value) {
          definition = value;
        },
      },
    },
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    ...sandbox,
  };
  vm.runInNewContext(source, context, { filename: 'client.js' });
  assert.equal(definition.id, 'dsh-plugin-sleep-control');
  return definition.factory(() => ({}));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function failure(code) {
  const error = new Error(code);
  error.clientCode = code;
  return error;
}

test('controller loads the real initial state and notifies subscribers', async () => {
  const { createSleepController } = await loadClient();
  const calls = [];
  const controller = createSleepController(async (kind) => {
    calls.push(kind);
    return { ok: true, sleepDisabled: false };
  });
  let notifications = 0;
  controller.subscribe(() => {
    notifications += 1;
  });
  await controller.refresh();
  assert.deepEqual(plain(controller.getState()), {
    phase: 'ready',
    sleepDisabled: false,
    notice: null,
  });
  assert.deepEqual(calls, ['status']);
  assert.ok(notifications >= 2);
  controller.dispose();
});

test('a successful toggle publishes only the Host-verified value', async () => {
  const { createSleepController } = await loadClient();
  const calls = [];
  const controller = createSleepController(async (kind, payload) => {
    calls.push([kind, payload]);
    return { ok: true, sleepDisabled: kind === 'set' ? payload.sleepDisabled : false };
  });
  await controller.refresh();
  await controller.setSleepDisabled(true);
  assert.equal(controller.getState().phase, 'ready');
  assert.equal(controller.getState().sleepDisabled, true);
  assert.deepEqual(plain(calls[1]), ['set', { sleepDisabled: true }]);
  controller.dispose();
});

test('a failed response re-reads once and reflects an actually changed value', async () => {
  const { createSleepController } = await loadClient();
  let statusReads = 0;
  const controller = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('command-failed');
    statusReads += 1;
    return { ok: true, sleepDisabled: statusReads > 1 };
  });
  await controller.refresh();
  await controller.setSleepDisabled(true);
  assert.equal(statusReads, 2);
  assert.equal(controller.getState().phase, 'error');
  assert.equal(controller.getState().notice, 'command-failed');
  assert.equal(controller.getState().sleepDisabled, true);
  controller.dispose();
});

test('cancellation retains the previous value if the confirmation read fails', async () => {
  const { createSleepController } = await loadClient();
  const controller = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('cancelled');
    return { ok: true, sleepDisabled: false };
  });
  await controller.refresh();
  let failStatus = true;
  const cancelled = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('cancelled');
    if (failStatus) {
      failStatus = false;
      return { ok: true, sleepDisabled: false };
    }
    throw failure('network-error');
  });
  await cancelled.refresh();
  await cancelled.setSleepDisabled(true);
  assert.equal(cancelled.getState().phase, 'cancelled');
  assert.equal(cancelled.getState().sleepDisabled, false);
  assert.equal(cancelled.getState().notice, 'cancelled');
  controller.dispose();
  cancelled.dispose();
});

test('an ambiguous failure with no readback becomes unknown, not optimistic', async () => {
  const { createSleepController } = await loadClient();
  let initial = true;
  const controller = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('verification-failed');
    if (initial) {
      initial = false;
      return { ok: true, sleepDisabled: false };
    }
    throw failure('network-error');
  });
  await controller.refresh();
  await controller.setSleepDisabled(true);
  assert.equal(controller.getState().phase, 'error');
  assert.equal(controller.getState().sleepDisabled, null);
  controller.dispose();
});

test('unsupported state disables further mutation attempts', async () => {
  const { createSleepController } = await loadClient();
  let calls = 0;
  const controller = createSleepController(async () => {
    calls += 1;
    throw failure('unsupported');
  });
  await controller.refresh();
  const before = calls;
  await controller.setSleepDisabled(true);
  assert.equal(controller.getState().phase, 'unsupported');
  assert.equal(controller.getState().sleepDisabled, null);
  assert.equal(calls, before);
  controller.dispose();
});

test('client registers the composer switch and transient status dock', async () => {
  const registrations = [];
  const effects = [];
  const client = await loadClient({
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true, sleepDisabled: false, mutationToken: 'test-token' }),
    }),
  });
  const ctx = {
    locale: {
      bind: () => (key) => key,
      register: () => () => undefined,
    },
    effect(callback) {
      effects.push(callback());
    },
    slots: {
      inject(name, callback) {
        assert.equal(typeof callback, 'function');
        callback();
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => undefined;
      },
    },
  };
  client.apply(ctx);
  assert.deepEqual(
    registrations.map(({ options }) => [options.name, options.id]),
    [
      ['conversation.input.right', 'sleep-control'],
      ['conversation.composer.dock', 'sleep-control-status'],
    ],
  );
  assert.deepEqual(plain(client.inject), ['slots', 'locale']);
  await new Promise((resolve) => setImmediate(resolve));
  for (const dispose of effects.reverse()) {
    if (typeof dispose === 'function') dispose();
  }
});

test('request transport forwards the latest in-memory token on every mutation', async () => {
  const { createSleepRequest } = await loadClient();
  const calls = [];
  let token = 'token-a';
  const transport = createSleepRequest(async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        sleepDisabled: options.method === 'POST' ? true : false,
        ...(options.method === 'GET' ? { mutationToken: token } : {}),
      }),
    };
  });
  await transport.request('status');
  await transport.request('set', { sleepDisabled: true });
  assert.equal(calls[1].options.headers['x-dsh-sleep-control-token'], 'token-a');

  token = 'token-b';
  await transport.request('status');
  await transport.request('set', { sleepDisabled: true });
  assert.equal(calls[3].options.headers['x-dsh-sleep-control-token'], 'token-b');
  transport.dispose();
  await assert.rejects(transport.request('status'), { clientCode: 'network-error' });
});
