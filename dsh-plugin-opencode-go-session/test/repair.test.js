import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { repairProtocol } from '../src/repair.js';
import { apply } from '../index.js';

function fixture(profile = { baseURL: 'https://opencode.ai/inference/go/openai/v1', models: [{ id: 'hy4' }] }) {
  const writes = [];
  const entry = {};
  const ctx = {
    llm: { listConfigurableProviders: () => [{ provider: 'opencode-go', settingsNs: 'include:llm-pi-ai' }] },
    settings: {
      describe(options) {
        assert.deepEqual(options, { redactSecrets: true });
        return [{ ns: 'include:llm-pi-ai', revision: 7, value: { providers: { 'opencode-go': profile } } }];
      },
      async mutate(ns, ops, revision) { writes.push({ ns, ops, revision }); },
    },
    configEditor: { async edit(target, change) {
      assert.equal(target, entry);
      writes.push({ ownConfig: change({ repairProtocolOnLoad: true, anotherSetting: 'preserve' }) });
    } },
  };
  return { ctx, writes, entry, profile };
}

test('persists exactly one provider path, uses the read revision, then consumes its own flag', async () => {
  const { ctx, writes, entry, profile } = fixture();
  const before = structuredClone(profile);
  await repairProtocol(ctx, entry);
  assert.deepEqual(writes, [
    { ns: 'include:llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'opencode-go', 'api'], value: 'openai-completions' }], revision: 7 },
    { ownConfig: { repairProtocolOnLoad: false, anotherSetting: 'preserve' } },
  ]);
  assert.deepEqual(profile, before);
});

test('does not rewrite an already-correct protocol', async () => {
  const f = fixture({ baseURL: 'https://opencode.ai/inference/go/openai/v1', models: [{ id: 'hy4' }], api: 'openai-completions' });
  await repairProtocol(f.ctx, f.entry);
  assert.deepEqual(f.writes, [{ ownConfig: { repairProtocolOnLoad: false, anotherSetting: 'preserve' } }]);
});

for (const [label, profile] of [
  ['another protocol', { baseURL: 'https://opencode.ai/inference/go/openai/v1', models: [{ id: 'x' }], api: 'anthropic-messages' }],
  ['another endpoint', { baseURL: 'https://example.com/v1', models: [{ id: 'x' }] }],
  ['an empty model list', { baseURL: 'https://opencode.ai/inference/go/openai/v1', models: [] }],
]) {
  test(`refuses ${label} without writes`, async () => {
    const f = fixture(profile);
    await assert.rejects(repairProtocol(f.ctx, f.entry));
    assert.equal(f.writes.length, 0);
  });
}

test('fails closed if the namespace or own entry is missing', async () => {
  const f = fixture();
  await assert.rejects(repairProtocol(f.ctx, undefined), /profile-owned/);
  f.ctx.settings.describe = () => [];
  await assert.rejects(repairProtocol(f.ctx, f.entry), /existing OpenCode Go/);
  assert.equal(f.writes.length, 0);
});

test('does not clear the migration flag after a settings conflict', async () => {
  const f = fixture();
  f.ctx.settings.mutate = async () => { throw new Error('conflict'); };
  await assert.rejects(repairProtocol(f.ctx, f.entry), /conflict/);
  assert.equal(f.writes.length, 0);
});

test('can retry flag consumption after provider repair already succeeded', async () => {
  const f = fixture({ baseURL: 'https://opencode.ai/inference/go/openai/v1', models: [{ id: 'x' }], api: 'openai-completions' });
  f.ctx.configEditor.edit = async () => { throw new Error('save failed'); };
  await assert.rejects(repairProtocol(f.ctx, f.entry), /save failed/);
  assert.equal(f.writes.length, 0);
});

test('a new tool-result dispatch escapes the install async context and runs the migration once', { timeout: 2000 }, async () => {
  const transaction = new AsyncLocalStorage();
  const f = fixture();
  let listener;
  let removed = 0;
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  const edit = f.ctx.configEditor.edit;
  f.ctx.configEditor.edit = async (...args) => { await edit(...args); finish(); };
  const mutate = f.ctx.settings.mutate;
  f.ctx.settings.mutate = async (...args) => {
    assert.equal(transaction.getStore(), undefined, 'must not inherit install transaction');
    await mutate(...args);
  };
  const root = {
    fiber: {}, on() {},
    inject(deps, callback) {
      assert.deepEqual(deps, ['settings', 'configEditor']);
      callback({ ...f.ctx,
        on(event, handler) {
          assert.equal(event, 'tools/result'); listener = handler;
          return () => { listener = undefined; removed++; };
        }, logger: { warn() { assert.fail('unexpected warning'); } },
      });
    },
  };
  transaction.run(true, () => assert.equal(apply(root, { repairProtocolOnLoad: true }), undefined));
  assert.equal(f.writes.length, 0, 'activation never writes inside the install transaction');
  assert.equal(typeof listener, 'function');
  root.fiber.entry = f.entry; // Loader metadata can become available after apply.
  listener();
  await done;
  assert.equal(removed, 1);
  assert.equal(listener, undefined);
  assert.equal(f.writes.length, 2);
});
