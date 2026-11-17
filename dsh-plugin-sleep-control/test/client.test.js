import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const CLIENT_FILE = new URL('../client.js', import.meta.url);
const DARWIN_STATUS = {
  ok: true,
  platform: 'darwin',
  persistentSleep: true,
  sleepDisabled: false,
};
const WINDOWS_STATUS = {
  ok: true,
  platform: 'win32',
  persistentSleep: false,
  sleepDisabled: null,
};

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

function configScope({ writable = true, status = 'ready', set = null } = {}) {
  let snapshot = {
    status,
    value: { caffeinateDuringSessions: false },
    writable,
  };
  const listeners = new Set();
  const calls = [];
  return {
    calls,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(field, value) {
      calls.push([field, value]);
      if (set) return set(field, value, (accepted) => {
        if (accepted) {
          snapshot = {
            ...snapshot,
            value: { ...snapshot.value, [field]: value },
          };
          for (const listener of listeners) listener(snapshot);
        }
        return accepted;
      });
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value } };
      for (const listener of listeners) listener(snapshot);
      return true;
    },
  };
}

test('controller loads the real initial state and notifies subscribers', async () => {
  const { createSleepController } = await loadClient();
  const calls = [];
  const controller = createSleepController(async (kind) => {
    calls.push(kind);
    return DARWIN_STATUS;
  });
  let notifications = 0;
  controller.subscribe(() => {
    notifications += 1;
  });
  await controller.refresh();
  assert.deepEqual(plain(controller.getState()), {
    phase: 'ready',
    platform: 'darwin',
    persistentSleep: true,
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
    return {
      ...DARWIN_STATUS,
      sleepDisabled: kind === 'set' ? payload.sleepDisabled : false,
    };
  });
  await controller.refresh();
  await controller.setSleepDisabled(true);
  assert.equal(controller.getState().phase, 'ready');
  assert.equal(controller.getState().sleepDisabled, true);
  assert.equal(controller.getState().persistentSleep, true);
  assert.deepEqual(plain(calls[1]), ['set', { sleepDisabled: true }]);
  controller.dispose();
});

test('a failed response re-reads once and reflects an actually changed value', async () => {
  const { createSleepController } = await loadClient();
  let statusReads = 0;
  const controller = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('command-failed');
    statusReads += 1;
    return { ...DARWIN_STATUS, sleepDisabled: statusReads > 1 };
  });
  await controller.refresh();
  await controller.setSleepDisabled(true);
  assert.equal(statusReads, 2);
  assert.equal(controller.getState().phase, 'error');
  assert.equal(controller.getState().notice, 'command-failed');
  assert.equal(controller.getState().sleepDisabled, true);
  assert.equal(controller.getState().persistentSleep, true);
  controller.dispose();
});

test('cancellation retains the previous value if the confirmation read fails', async () => {
  const { createSleepController } = await loadClient();
  const controller = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('cancelled');
    return DARWIN_STATUS;
  });
  await controller.refresh();
  let failStatus = true;
  const cancelled = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('cancelled');
    if (failStatus) {
      failStatus = false;
      return DARWIN_STATUS;
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

test('status text preserves cancellation and failure notices with a known value', async () => {
  const { sleepStatusText } = await loadClient();
  const t = (key) => key;
  assert.equal(
    sleepStatusText({ phase: 'cancelled', platform: 'darwin', persistentSleep: true, sleepDisabled: false, notice: 'cancelled' }, t),
    'cancelled',
  );
  assert.equal(
    sleepStatusText({ phase: 'error', platform: 'darwin', persistentSleep: true, sleepDisabled: true, notice: 'verification-failed' }, t),
    'verificationFailed',
  );
  assert.equal(
    sleepStatusText({ phase: 'ready', platform: 'darwin', persistentSleep: true, sleepDisabled: true, notice: null }, t),
    'enabled',
  );
  assert.equal(
    sleepStatusText({ phase: 'ready', platform: 'win32', persistentSleep: false, sleepDisabled: null, notice: null }, t),
    'persistentUnsupported',
  );
});

test('presentation keeps an unknown capability away from unsupported wording', async () => {
  const { sleepPresentation } = await loadClient();
  assert.deepEqual(plain(sleepPresentation({ phase: 'loading', platform: null, persistentSleep: null })), {
    persistentUnsupported: false,
    persistentSupported: false,
    sessionHelpKey: null,
    persistentHelpKey: null,
  });
  assert.deepEqual(plain(sleepPresentation({ phase: 'loading', platform: 'darwin', persistentSleep: null })), {
    persistentUnsupported: false,
    persistentSupported: false,
    sessionHelpKey: 'caffeinateHelp',
    persistentHelpKey: null,
  });
  assert.deepEqual(plain(sleepPresentation({ phase: 'ready', platform: 'darwin', persistentSleep: true })), {
    persistentUnsupported: false,
    persistentSupported: true,
    sessionHelpKey: 'caffeinateHelp',
    persistentHelpKey: 'fullSleepHelp',
  });
  assert.deepEqual(plain(sleepPresentation({ phase: 'ready', platform: 'win32', persistentSleep: false })), {
    persistentUnsupported: true,
    persistentSupported: false,
    sessionHelpKey: 'windowsSessionHelp',
    persistentHelpKey: 'persistentUnsupportedHelp',
  });
});

test('an ambiguous failure with no readback becomes unknown, not optimistic', async () => {
  const { createSleepController } = await loadClient();
  let initial = true;
  const controller = createSleepController(async (kind) => {
    if (kind === 'set') throw failure('verification-failed');
    if (initial) {
      initial = false;
      return DARWIN_STATUS;
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
  assert.deepEqual(plain(controller.getState()), {
    phase: 'unsupported',
    platform: null,
    persistentSleep: null,
    sleepDisabled: null,
    notice: 'unsupported',
  });
  assert.equal(calls, before);
  controller.dispose();
});

test('Windows capability is ready but never allows a persistent toggle', async () => {
  const { createSleepController } = await loadClient();
  const calls = [];
  const controller = createSleepController(async (kind) => {
    calls.push(kind);
    return WINDOWS_STATUS;
  });
  await controller.refresh();
  assert.deepEqual(plain(controller.getState()), {
    phase: 'ready',
    platform: 'win32',
    persistentSleep: false,
    sleepDisabled: null,
    notice: null,
  });
  await controller.setSleepDisabled(true);
  assert.deepEqual(calls, ['status']);
  controller.dispose();
});

test('a transient status failure keeps the last verified platform capability', async () => {
  const { createSleepController } = await loadClient();
  for (const [status, platform, persistentSleep] of [
    [DARWIN_STATUS, 'darwin', true],
    [WINDOWS_STATUS, 'win32', false],
  ]) {
    let fail = false;
    const controller = createSleepController(async () => {
      if (fail) throw failure('network-error');
      return status;
    });
    await controller.refresh();
    fail = true;
    await controller.refresh();
    const state = controller.getState();
    assert.equal(state.phase, 'error');
    assert.equal(state.notice, 'network-error');
    assert.equal(state.platform, platform);
    assert.equal(state.persistentSleep, persistentSleep);
    assert.equal(state.sleepDisabled, null);
    controller.dispose();
  }
});

test('caffeinate preference writes the exact volatile field after Host acceptance', async () => {
  const { createCaffeinatePreference } = await loadClient();
  const scope = configScope();
  const preference = createCaffeinatePreference(scope);
  assert.equal(await preference.setEnabled(true), true);
  assert.deepEqual(scope.calls, [['caffeinateDuringSessions', true]]);
  assert.equal(preference.getState().value.caffeinateDuringSessions, true);
  assert.equal(preference.getState().saving, false);
  assert.equal(preference.getState().notice, null);
  preference.dispose();
});

test('caffeinate preference is not optimistic while a write is pending', async () => {
  const { createCaffeinatePreference } = await loadClient();
  let complete;
  const scope = configScope({
    set: (field, value, accept) => new Promise((resolve) => {
      complete = () => resolve(accept(true));
    }),
  });
  const preference = createCaffeinatePreference(scope);
  const pending = preference.setEnabled(true);
  assert.equal(preference.getState().saving, true);
  assert.equal(preference.getState().value.caffeinateDuringSessions, false);
  complete();
  assert.equal(await pending, true);
  assert.equal(preference.getState().value.caffeinateDuringSessions, true);
  assert.equal(preference.getState().saving, false);
  preference.dispose();
});

test('rejected and failed config writes preserve the accepted value and show an error', async () => {
  const { createCaffeinatePreference } = await loadClient();
  const rejectedScope = configScope({ set: () => false });
  const rejected = createCaffeinatePreference(rejectedScope);
  assert.equal(await rejected.setEnabled(true), false);
  assert.equal(rejected.getState().value.caffeinateDuringSessions, false);
  assert.equal(rejected.getState().notice, 'save-failed');
  rejected.dispose();

  const failedScope = configScope({ set: () => { throw new Error('offline'); } });
  const failed = createCaffeinatePreference(failedScope);
  assert.equal(await failed.setEnabled(true), false);
  assert.equal(failed.getState().value.caffeinateDuringSessions, false);
  assert.equal(failed.getState().notice, 'save-failed');
  failed.dispose();
});

test('read-only or unavailable config cannot be mutated', async () => {
  const { createCaffeinatePreference } = await loadClient();
  for (const options of [{ writable: false }, { status: 'unavailable' }]) {
    const scope = configScope(options);
    const preference = createCaffeinatePreference(scope);
    assert.equal(await preference.setEnabled(true), false);
    assert.equal(scope.calls.length, 0);
    preference.dispose();
  }
});

test('client registers only the named sleep-control settings section', async () => {
  const registrations = [];
  const effects = [];
  let dictionaries;
  const scope = {
    getSnapshot: () => ({
      status: 'ready',
      value: { caffeinateDuringSessions: false },
      writable: true,
    }),
    subscribe: () => () => undefined,
  };
  const client = await loadClient({
    fetch: async () => ({
      ok: true,
      json: async () => ({ ...DARWIN_STATUS, mutationToken: 'test-token' }),
    }),
  });
  const ctx = {
    locale: {
      bind: () => (key) => key,
      register: (namespace, values) => {
        assert.equal(namespace, 'sleepControl');
        dictionaries = values;
        return () => undefined;
      },
    },
    configForms: {
      get(id) {
        assert.equal(id, 'sleep-control');
        return scope;
      },
    },
    effect(callback) {
      effects.push(callback());
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'settings.section');
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
    registrations.map(({ options }) => [options.name, options.id, options.order]),
    [['settings.section', 'sleep-control', 5]],
  );
  assert.equal(registrations[0].options.label(), 'nav');
  assert.equal(dictionaries.zh.nav, '防睡眠');
  assert.match(dictionaries.zh.caffeinateHelp, /开盖.*合盖.*接入电源/);
  assert.match(dictionaries.zh.windowsSessionHelp, /SetThreadExecutionState/);
  assert.match(dictionaries.zh.fullSleepHelp, /全局持久.*异常耗电/);
  assert.match(dictionaries.zh.persistentUnsupported, /macOS/);
  assert.match(dictionaries.zh.persistentUnsupportedHelp, /pmset/);
  assert.equal(dictionaries.zh.warning, '警告');
  assert.deepEqual(plain(client.inject), ['slots', 'locale', 'configForms']);
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
        ...DARWIN_STATUS,
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

test('status responses must carry a consistent platform capability', async () => {
  const { createSleepRequest } = await loadClient();
  const windows = createSleepRequest(async () => ({
    ok: true,
    json: async () => ({ ...WINDOWS_STATUS, mutationToken: 'test-token' }),
  }));
  assert.equal((await windows.request('status')).platform, 'win32');
  windows.dispose();

  const invalid = [
    { ok: true, platform: 'linux', persistentSleep: false, sleepDisabled: null, mutationToken: 't' },
    { ok: true, platform: 'win32', persistentSleep: false, sleepDisabled: false, mutationToken: 't' },
    { ok: true, platform: 'darwin', persistentSleep: true, sleepDisabled: null, mutationToken: 't' },
    { ok: true, platform: 'win32', sleepDisabled: null, mutationToken: 't' },
    { ok: true, platform: 'win32', persistentSleep: false, sleepDisabled: null },
  ];
  for (const payload of invalid) {
    const transport = createSleepRequest(async () => ({ ok: true, json: async () => payload }));
    await assert.rejects(transport.request('status'), { clientCode: 'request-failed' });
    transport.dispose();
  }
});
