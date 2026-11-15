import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_KIMI_FETCH_ENDPOINT,
  DEFAULT_KIMI_SEARCH_ENDPOINT,
  KimiWebClient,
  mapKimiSearchResponse,
  normalizePublicTargetUrl,
} from '../src/client.js';

function response(status, body, headers = {}) {
  return new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const DEFAULTS = {
  apiKeyEnv: 'KIMI_CODING_API_KEY',
  searchEndpoint: DEFAULT_KIMI_SEARCH_ENDPOINT,
  fetchEndpoint: DEFAULT_KIMI_FETCH_ENDPOINT,
  searchTimeoutMs: 5000,
  fetchTimeoutMs: 5000,
};

function setup(overrides = {}) {
  const calls = [];
  const settings = { ...DEFAULTS, ...overrides.settings };
  const client = new KimiWebClient(() => settings, {
    resolveCredential: overrides.resolveCredential ?? (async () => 'sk-test'),
    fetchImpl:
      overrides.fetchImpl ??
      (async (...args) => {
        calls.push(args);
        return response(200, { search_results: [] });
      }),
  });
  return { client, calls, settings };
}

test('search sends the minimal protocol with a real tool call id and maps valid sources', async () => {
  const { client, calls } = setup({
    fetchImpl: async (...args) => {
      calls.push(args);
      return response(200, {
        search_results: [
          {
            title: 'Example',
            url: 'https://example.com/doc',
            snippet: 'Snippet',
            date: '2026-11-02',
            content: 'not promoted',
          },
          { title: 'duplicate', url: 'https://example.com/doc' },
          { title: 'bad scheme', url: 'javascript:alert(1)' },
          { title: 'missing URL' },
        ],
      });
    },
  });
  const result = await client.search({ query: ' DeepSeek ', toolCallId: 'call-123' });
  assert.deepEqual(result, {
    sources: [
      {
        title: 'Example',
        url: 'https://example.com/doc',
        snippet: 'Snippet',
        publishedAt: '2026-11-02',
      },
    ],
    truncated: false,
  });
  const [endpoint, init] = calls[0];
  assert.equal(endpoint, DEFAULT_KIMI_SEARCH_ENDPOINT);
  assert.equal(init.redirect, 'error');
  assert.deepEqual(JSON.parse(init.body), { text_query: ' DeepSeek ' });
  assert.equal(init.headers.Authorization, 'Bearer sk-test');
  assert.equal(init.headers['X-Msh-Tool-Call-Id'], 'call-123');
  assert.equal(init.headers['User-Agent'], 'dsh-plugin-kimi-web-search/0.2.1');
  assert.equal('X-Msh-Platform' in init.headers, false);
});

test('empty search results and empty fetch bodies are successful', async () => {
  const { client } = setup();
  assert.deepEqual(await client.search({ query: 'none' }), { sources: [], truncated: false });
  const { client: fetchClient } = setup({ fetchImpl: async () => response(200, '') });
  const result = await fetchClient.fetch({ url: 'https://example.com' });
  assert.equal(result.body.content, '');
  assert.equal(result.body.kind, 'text');
});

test('credentials resolve for every operation', async () => {
  const keys = ['sk-first', 'sk-second'];
  const seen = [];
  const { client } = setup({
    resolveCredential: async () => keys.shift(),
    fetchImpl: async (_endpoint, init) => {
      seen.push(init.headers.Authorization);
      return response(200, { search_results: [] });
    },
  });
  await client.search({ query: 'first' });
  await client.search({ query: 'second' });
  assert.deepEqual(seen, ['Bearer sk-first', 'Bearer sk-second']);
});

test('missing credentials fail before dispatch', async () => {
  let called = false;
  const { client } = setup({
    resolveCredential: async () => undefined,
    fetchImpl: async () => {
      called = true;
      return response(200, { search_results: [] });
    },
  });
  await assert.rejects(client.search({ query: 'test' }), { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' });
  assert.equal(called, false);
});

test('credential errors do not leak secrets through message or cause', async () => {
  const { client } = setup({
    resolveCredential: async () => {
      throw new Error('decrypt failed for sk-super-secret');
    },
  });
  await assert.rejects(client.search({ query: 'test' }), (error) => {
    assert.equal(error.code, 'WEB_PROVIDER_ERROR');
    assert.equal(error.message.includes('sk-super-secret'), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

for (const status of [401, 403, 429, 500]) {
  test(`HTTP ${status} has no retry or alternate-provider fallback`, async () => {
    let calls = 0;
    const { client } = setup({
      fetchImpl: async () => {
        calls += 1;
        return response(status, { error: { message: 'upstream detail' } });
      },
    });
    await assert.rejects(client.search({ query: 'test' }), (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR');
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.match(error.message, /upstream detail/);
      return true;
    });
    assert.equal(calls, 1);
  });
}

test('invalid JSON and invalid top-level search responses fail loudly', async (t) => {
  for (const [name, returned] of [
    ['invalid JSON', response(200, '{')],
    ['missing result array', response(200, {})],
  ]) {
    await t.test(name, async () => {
      const { client } = setup({ fetchImpl: async () => returned });
      await assert.rejects(client.search({ query: 'test' }), { code: 'WEB_PROVIDER_ERROR' });
    });
  }
});

test('API availability rejects insecure or credentialed endpoints', () => {
  for (const searchEndpoint of [
    'http://example.com/search',
    'https://user:pass@example.com/search',
    'https://example.com/search#fragment',
    'not a URL',
  ]) {
    const { client } = setup({ settings: { searchEndpoint } });
    assert.equal(client.searchAvailable(), false);
  }
});

test('an already aborted request never resolves credentials', async () => {
  let resolved = false;
  const { client } = setup({
    resolveCredential: async () => {
      resolved = true;
      return 'sk-test';
    },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.search({ query: 'test', signal: controller.signal }), {
    code: 'WEB_ABORTED',
  });
  assert.equal(resolved, false);
});

test('abort during network fetch is normalized', async () => {
  const controller = new AbortController();
  const { client } = setup({
    fetchImpl: (_endpoint, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        setTimeout(() => controller.abort(), 10);
      }),
  });
  await assert.rejects(client.search({ query: 'test', signal: controller.signal }), {
    code: 'WEB_ABORTED',
  });
});

test('timeout covers a slow credential resolver', async () => {
  const started = Date.now();
  const { client } = setup({
    settings: { searchTimeoutMs: 1000 },
    resolveCredential: () => new Promise((resolve) => setTimeout(() => resolve('sk-late'), 1200)),
  });
  await assert.rejects(client.search({ query: 'test' }), { code: 'WEB_PROVIDER_TIMEOUT' });
  assert.ok(Date.now() - started < 1150);
});

test('abort interrupts a credential resolver that never settles', async () => {
  const controller = new AbortController();
  const { client } = setup({ resolveCredential: () => new Promise(() => {}) });
  const pending = client.search({ query: 'test', signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, { code: 'WEB_ABORTED' });
});

test('a cooperative credential abort is not misclassified as a credential failure', async () => {
  const controller = new AbortController();
  const { client } = setup({
    resolveCredential: (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        setTimeout(() => controller.abort(), 10);
      }),
  });
  await assert.rejects(client.search({ query: 'test', signal: controller.signal }), {
    code: 'WEB_ABORTED',
  });
});

test('abort while reading an upstream error body is preserved', async () => {
  const controller = new AbortController();
  const { client } = setup({
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          start() {
            setTimeout(() => controller.abort(), 10);
          },
        }),
        { status: 500 },
      ),
  });
  await assert.rejects(client.search({ query: 'test', signal: controller.signal }), {
    code: 'WEB_ABORTED',
  });
});

test('timeout while reading an upstream error body is preserved', async () => {
  const { client } = setup({
    settings: { searchTimeoutMs: 1000 },
    fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { status: 500 }),
  });
  await assert.rejects(client.search({ query: 'test' }), { code: 'WEB_PROVIDER_TIMEOUT' });
});

test('declared and streamed oversized responses are rejected', async (t) => {
  await t.test('content-length', async () => {
    const { client } = setup({
      fetchImpl: async () =>
        response(200, { search_results: [] }, { 'content-length': String(3 * 1024 * 1024) }),
    });
    await assert.rejects(client.search({ query: 'test' }), /exceeded/);
  });
  await t.test('actual stream bytes', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const { client } = setup({ fetchImpl: async () => new Response(stream, { status: 200 }) });
    await assert.rejects(client.search({ query: 'test' }), /exceeded/);
  });
});

test('small chunks preserve split UTF-8 characters', async () => {
  const bytes = new TextEncoder().encode('{"search_results":[],"note":"汉"}');
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const { client } = setup({ fetchImpl: async () => new Response(stream, { status: 200 }) });
  assert.deepEqual(await client.search({ query: 'unicode' }), { sources: [], truncated: false });
});

test('fetch sends URL to Kimi and returns Markdown with target metadata', async () => {
  const { client, calls } = setup({
    fetchImpl: async (...args) => {
      calls.push(args);
      return response(200, '# Example\n\nMarkdown', { 'content-type': 'text/markdown' });
    },
  });
  const result = await client.fetch({ url: 'https://example.com/page', toolCallId: 'fetch-call' });
  assert.deepEqual(result, {
    url: 'https://example.com/page',
    statusCode: 200,
    body: { kind: 'text', content: '# Example\n\nMarkdown' },
    truncated: false,
  });
  const [endpoint, init] = calls[0];
  assert.equal(endpoint, DEFAULT_KIMI_FETCH_ENDPOINT);
  assert.equal(init.headers.Accept, 'text/markdown');
  assert.equal(init.headers['X-Msh-Tool-Call-Id'], 'fetch-call');
  assert.deepEqual(JSON.parse(init.body), { url: 'https://example.com/page' });
});

test('fetch rejects unsupported, credentialed, loopback, and private targets', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://localhost/admin',
    'http://localhost./admin',
    'http://foo.localhost./admin',
    'http://127.0.0.1/admin',
    'http://192.168.1.1/admin',
    'http://[::1]/admin',
    'http://[::127.0.0.1]/admin',
    'http://[2002:7f00:1::]/admin',
    'http://[64:ff9b::7f00:1]/admin',
    'http://[fec0::1]/admin',
    'not a URL',
  ]) {
    assert.equal(normalizePublicTargetUrl(url), undefined, url);
  }
  assert.equal(normalizePublicTargetUrl('https://example.com'), 'https://example.com/');
});

test('search mapping bounds fields and normalizes duplicate URLs', () => {
  const long = 'x'.repeat(5000);
  const sources = mapKimiSearchResponse({
    search_results: [
      { url: 'https://example.com', title: long, snippet: long, date: long },
      { url: 'https://example.com/', title: 'duplicate' },
    ],
  });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].title.length, 512);
  assert.equal(sources[0].snippet.length, 4000);
  assert.equal(sources[0].publishedAt.length, 100);
});
