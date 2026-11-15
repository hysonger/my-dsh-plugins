import assert from 'node:assert/strict';
import test from 'node:test';
import { createKimiFetchTool, createKimiSearchTool, registerKimiTools } from '../src/tools.js';

const SETTINGS = {
  searchMaxQueries: 4,
  searchMaxResults: 3,
  searchTimeoutMs: 5000,
  fetchMaxOutputChars: 1000,
  fetchTimeoutMs: 5000,
};

function exec(callId = 'call-1') {
  return { callId, signal: new AbortController().signal };
}

function searchClient(results) {
  const calls = [];
  return {
    calls,
    async search(input) {
      calls.push(input);
      return typeof results === 'function' ? results(input) : results;
    },
  };
}

test('search tool calls Kimi directly, forwards call id, and enforces max results', async () => {
  const client = searchClient({
    sources: [1, 2, 3, 4].map((n) => ({ url: `https://example.com/${n}`, title: `R${n}` })),
    truncated: false,
  });
  const tool = createKimiSearchTool(client, SETTINGS);
  const result = await tool.execute({ queries: ['one'] }, exec('real-call'));
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].toolCallId, 'real-call');
  assert.equal(result.sources.length, 3);
  assert.equal(result.truncated, true);
  const text = tool.output.render({}, result)[0].text;
  assert.match(text, /untrusted data/);
  assert.match(text, /Showing the first 3 sources/);
});

test('search tool validates query count and content before calling Kimi', async () => {
  const client = searchClient({ sources: [], truncated: false });
  const tool = createKimiSearchTool(client, SETTINGS);
  for (const args of [{}, { queries: [] }, { queries: [''] }, { queries: ['1', '2', '3', '4', '5'] }]) {
    await assert.rejects(tool.execute(args, exec()));
  }
  assert.equal(client.calls.length, 0);
  await tool.execute({ queries: ['same', 'same'] }, exec());
  assert.equal(client.calls.length, 1);
});

test('multi-query search deduplicates and merges by rank', async () => {
  const client = searchClient(({ query }) => ({
    sources:
      query === 'a'
        ? [
            { url: 'https://a/1', title: 'a1' },
            { url: 'https://shared', title: 'shared-a' },
          ]
        : [
            { url: 'https://shared', title: 'shared-b' },
            { url: 'https://b/1', title: 'b1' },
          ],
    truncated: false,
  }));
  const tool = createKimiSearchTool(client, SETTINGS);
  const result = await tool.execute({ queries: ['a', 'b'] }, exec());
  assert.deepEqual(
    result.sources.map((source) => source.url),
    ['https://a/1', 'https://shared', 'https://b/1'],
  );
  assert.equal(result.sources[1].title, 'shared-b');
});

test('one failed query aborts siblings and returns the first failure', async () => {
  let aborted = false;
  const client = {
    async search({ query, signal }) {
      if (query === 'bad') throw new Error('failed');
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });
    },
  };
  const tool = createKimiSearchTool(client, SETTINGS);
  await assert.rejects(tool.execute({ queries: ['slow', 'bad'] }, exec()), /failed/);
  assert.equal(aborted, true);
});

test('search presentation uses the DSH web search card', async () => {
  const client = searchClient({ sources: [{ url: 'https://example.com' }], truncated: false });
  const tool = createKimiSearchTool(client, SETTINGS);
  const value = await tool.execute({ queries: ['query'] }, exec());
  const meta = tool.output.presentationMeta({}, value);
  assert.deepEqual(meta, { sources: [{ url: 'https://example.com' }], truncated: false });
  assert.deepEqual(tool.presentResult({ queries: ['query'] }, { isError: false, meta }), {
    card: 'web',
    kind: 'search',
    title: 'query',
    sources: [{ url: 'https://example.com' }],
    truncated: false,
  });
});

test('fetch tool forwards call id and bounds the complete model-visible output', async () => {
  const client = {
    calls: [],
    async fetch(input) {
      this.calls.push(input);
      return {
        url: input.url,
        statusCode: 200,
        body: { kind: 'text', content: 'x'.repeat(1200) },
        truncated: false,
      };
    },
  };
  const tool = createKimiFetchTool(client, SETTINGS);
  const result = await tool.execute({ url: 'https://example.com' }, exec('fetch-id'));
  assert.equal(client.calls[0].toolCallId, 'fetch-id');
  assert.equal(result.body.content.length, 1200);
  assert.equal(result.truncated, true);
  const text = tool.output.render({}, result)[0].text;
  assert.ok(Array.from(text).length <= SETTINGS.fetchMaxOutputChars);
  assert.match(text, /Kimi API HTTP 200; target status unavailable/);
  assert.match(text, /Content truncated/);
  const meta = tool.output.presentationMeta({}, result);
  assert.deepEqual(tool.presentResult({ url: 'https://example.com' }, { isError: false, meta }), {
    card: 'web',
    kind: 'fetch',
    title: 'https://example.com',
    url: 'https://example.com',
    statusCode: 200,
    truncated: true,
  });
});

test('fetch truncation preserves its notice and citation when metadata is long', async () => {
  const url = `https://example.com/${'p'.repeat(700)}`;
  const client = {
    async fetch(input) {
      return { url: input.url, statusCode: 200, body: { kind: 'text', content: 'small body' }, truncated: false };
    },
  };
  const tool = createKimiFetchTool(client, SETTINGS);
  const result = await tool.execute({ url }, exec());
  assert.equal(result.truncated, true);
  const text = tool.output.render({}, result)[0].text;
  assert.ok(Array.from(text).length <= SETTINGS.fetchMaxOutputChars);
  assert.match(text, /Content truncated/);
  assert.match(text, /Cite the page/);
});

test('fetch tool rejects invalid targets without calling the client', async () => {
  let called = false;
  const client = {
    createError(message, code) {
      const error = new Error(message);
      error.code = code;
      return error;
    },
    async fetch() {
      called = true;
    },
  };
  const tool = createKimiFetchTool(client, SETTINGS);
  await assert.rejects(tool.execute({ url: 'http://127.0.0.1' }, exec()), { code: 'WEB_INVALID_URL' });
  assert.equal(called, false);
});

test('pending-call raw input remains a display string', () => {
  const search = createKimiSearchTool(searchClient({ sources: [], truncated: false }), SETTINGS);
  const fetch = createKimiFetchTool({}, SETTINGS);
  assert.equal(search.presentCall({ queries: ['a', 'b'] }).rawInput, 'a, b');
  assert.equal(fetch.presentCall({ url: 'https://example.com' }).rawInput, 'https://example.com');
});

test('tool input and output schemas use standard JSON Schema required arrays', () => {
  const search = createKimiSearchTool(searchClient({ sources: [], truncated: false }), SETTINGS);
  const fetch = createKimiFetchTool({}, SETTINGS);
  assert.deepEqual(search.parameters.required, ['queries']);
  assert.deepEqual(search.output.schema.required, ['sources', 'truncated']);
  assert.deepEqual(search.output.schema.properties.sources.items.required, ['url']);
  assert.deepEqual(fetch.parameters.required, ['url']);
  assert.deepEqual(fetch.output.schema.required, ['url', 'statusCode', 'body', 'truncated']);
  assert.deepEqual(fetch.output.schema.properties.body.required, ['kind', 'content']);
  assert.equal(JSON.stringify(search).includes('"required":true'), false);
  assert.equal(JSON.stringify(fetch).includes('"required":true'), false);
});

test('registration adds independent tools and prompt, then disposes only its own contributions', () => {
  const tools = new Map([
    ['web_search', {}],
    ['web_fetch', {}],
  ]);
  let prompt;
  const ctx = {
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
        prompt = section;
        return () => {
          prompt = undefined;
        };
      },
    },
  };
  const dispose = registerKimiTools(ctx, {}, SETTINGS);
  assert.deepEqual([...tools.keys()], ['web_search', 'web_fetch', 'kimi_web_search', 'kimi_web_fetch']);
  assert.match(prompt.text({}), /kimi_web_search/);
  assert.match(prompt.text({}), /untrusted/);
  dispose();
  assert.deepEqual([...tools.keys()], ['web_search', 'web_fetch']);
  assert.equal(prompt, undefined);
});
