import assert from 'node:assert/strict';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { WebError } from '@deepseek-ai/dsh-web';
import test from 'node:test';
import { apply, CONFIG_DEFAULTS, Config, normalizeConfig } from '../index.js';

function valid(value) {
  const result = Config['~standard'].validate(value);
  assert.equal(result.issues, undefined);
  return result.value;
}

test('Standard Schema applies independent search and fetch defaults', () => {
  assert.deepEqual(valid(undefined), CONFIG_DEFAULTS);
  assert.deepEqual(normalizeConfig(null), CONFIG_DEFAULTS);
  assert.equal(CONFIG_DEFAULTS.searchEndpoint, 'https://api.kimi.com/coding/v1/search');
  assert.equal(CONFIG_DEFAULTS.fetchEndpoint, 'https://api.kimi.com/coding/v1/fetch');
});

test('Standard Schema rejects invalid strings, integer bounds, and non-objects', () => {
  for (const value of [
    [],
    { apiKeyEnv: '' },
    { searchEndpoint: 42 },
    { fetchEndpoint: '' },
    { searchTimeoutMs: 999 },
    { fetchTimeoutMs: 180001 },
    { searchMaxQueries: 0 },
    { searchMaxResults: 1.5 },
    { fetchMaxOutputChars: 999 },
    { registerLegacyProvider: 'yes' },
  ]) {
    assert.ok(Config['~standard'].validate(value).issues.length > 0);
  }
});

function hostContext() {
  const providers = new Map([['deepseek-search-api', { id: 'deepseek-search-api' }]]);
  const tools = new Map([
    ['web_search', { name: 'web_search' }],
    ['web_fetch', { name: 'web_fetch' }],
  ]);
  const cleanups = [];
  const selection = { searchProvider: 'deepseek-search-api', fetchProvider: 'deepseek-fetch-api' };
  const credentialReads = [];
  const ctx = {
    credentials: {
      async resolve(ref) {
        credentialReads.push(ref);
        return { value: 'sk-test' };
      },
    },
    web: {
      registerSearchProvider(provider) {
        assert.equal(providers.has(provider.id), false);
        providers.set(provider.id, provider);
        return () => providers.delete(provider.id);
      },
    },
    tools: {
      register(definition) {
        assert.equal(tools.has(definition.name), false);
        tools.set(definition.name, definition);
        return () => tools.delete(definition.name);
      },
      get(name) {
        return tools.get(name);
      },
    },
    systemPrompt: {
      getSectionOrder: () => 100,
      section(section) {
        this.current = section;
        return () => {
          this.current = undefined;
        };
      },
    },
    effect(callback) {
      const cleanup = callback();
      cleanups.push(cleanup);
      return cleanup;
    },
  };
  return { ctx, providers, tools, selection, credentialReads, cleanups };
}

test('Host mounts both independent tools without changing DeepSeek selection', () => {
  const { ctx, providers, tools, selection, credentialReads, cleanups } = hostContext();
  apply(ctx, valid({}));
  assert.deepEqual([...providers.keys()], ['deepseek-search-api']);
  assert.deepEqual([...tools.keys()], ['web_search', 'web_fetch', 'kimi_web_search', 'kimi_web_fetch']);
  assert.deepEqual(selection, { searchProvider: 'deepseek-search-api', fetchProvider: 'deepseek-fetch-api' });
  assert.match(ctx.systemPrompt.current.text({}), /kimi_web_fetch/);
  assert.deepEqual(credentialReads, []);

  for (const cleanup of cleanups) cleanup();
  assert.deepEqual([...providers.keys()], ['deepseek-search-api']);
  assert.deepEqual([...tools.keys()], ['web_search', 'web_fetch']);
});

test('legacy Provider is opt-in and resolves credentials per operation', async () => {
  const { ctx, providers, credentialReads } = hostContext();
  apply(ctx, valid({ registerLegacyProvider: true }));
  assert.deepEqual([...providers.keys()], ['deepseek-search-api', 'kimi-code-search']);
  const provider = providers.get('kimi-code-search');
  await provider.resolveCredential();
  await provider.resolveCredential();
  assert.deepEqual(credentialReads, ['KIMI_CODING_API_KEY', 'KIMI_CODING_API_KEY']);
});

test('Provider and direct tools preserve real WebError/HarnessError identity', async () => {
  const { ctx, providers, tools } = hostContext();
  apply(ctx, valid({ registerLegacyProvider: true }));
  await assert.rejects(providers.get('kimi-code-search').search({ query: '' }), (error) => {
    assert.ok(error instanceof WebError);
    assert.ok(error instanceof HarnessError);
    assert.equal(error.code, 'WEB_PROVIDER_ERROR');
    return true;
  });
  await assert.rejects(
    tools.get('kimi_web_fetch').execute(
      { url: 'http://127.0.0.1' },
      { callId: 'call', signal: new AbortController().signal },
    ),
    (error) => {
      assert.ok(error instanceof WebError);
      assert.ok(error instanceof HarnessError);
      assert.equal(error.code, 'WEB_INVALID_URL');
      return true;
    },
  );
});
