/**
 * Route-level tests for the usage board's HTTP surface.
 *
 * These drive the real `registerRoutes` handlers over a real HTTP server with a
 * stand-in `webServer` service and a stub `SnapshotService`, so the transport
 * contract is pinned independently of the cache implementation and of any
 * upstream provider:
 *
 *   - the per-provider route parses `id`, maps GET/POST to serving/force, and
 *     answers 400 for a missing/unknown id and 405 for a wrong method;
 *   - the aggregate routes keep their old method contract;
 *   - health exposes the additive per-provider diagnostics;
 *   - the standalone page is injected with the per-provider boot paths;
 *   - loopback-only protection applies to the new route too.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';

import { registerRoutes } from '../src/host/routes.js';
import { makeProvider, makeSnapshot } from '../src/shared/protocol.js';

/** Every provider id the stub service knows, in display order. */
const IDS = ['deepseek', 'glm', 'kimi'];

/** An aggregate envelope the stub service serves. */
const AGGREGATE = makeSnapshot({
  generatedAt: 1_000,
  ttlMs: 60_000,
  providers: IDS.map((id) => makeProvider({ id, label: `Stub ${id}`, status: 'ok' })),
});

/**
 * One provider's envelope, exactly as `SnapshotService.getProvider` builds it.
 * @param {string} id
 */
function oneRow(id) {
  return makeSnapshot({
    generatedAt: 2_000,
    ttlMs: 60_000,
    providers: [AGGREGATE.providers.find((row) => row.id === id)],
  });
}

/**
 * Stub `SnapshotService`: records calls and answers deterministic envelopes.
 * @returns {object} the service double with a `calls` log.
 */
function makeSnapshots() {
  /** @type {object[]} */
  const calls = [];
  return {
    calls,
    ttlMs: 60_000,
    readCount: 4,
    backgroundReadCount: 1,
    providerIds: IDS.slice(),
    isFresh: () => true,
    providerStates: () =>
      IDS.map((id) => ({
        id,
        status: id === 'glm' ? 'stale' : 'fresh',
        fetchedAt: id === 'glm' ? null : 1_000,
        expiresAt: id === 'glm' ? null : 61_000,
        refreshing: false,
      })),
    async get(options = {}) {
      calls.push({ kind: 'get', force: options.force === true });
      return AGGREGATE;
    },
    async getServing() {
      calls.push({ kind: 'getServing' });
      return AGGREGATE;
    },
    async getProvider(id, options = {}) {
      calls.push({ kind: 'getProvider', id, force: options.force === true });
      return oneRow(id);
    },
  };
}

/**
 * A stand-in for the DSH `webServer` service: exact routes match by pathname,
 * prefix routes by path segment — the same dispatch contract the plugin relies
 * on in production.
 */
function createStandInWebServer() {
  /** @type {{kind: string, path: string, handler: Function}[]} */
  const routes = [];
  return {
    routes,
    register(spec) {
      routes.push(spec);
      return () => {
        const index = routes.indexOf(spec);
        if (index >= 0) routes.splice(index, 1);
      };
    },
    dispatch(req, res) {
      const pathname = new URL(req.url ?? '/', 'http://stand-in').pathname;
      const exact = routes.find((route) => route.kind === 'exact' && route.path === pathname);
      if (exact) return exact.handler(req, res);
      const prefix = routes
        .filter((route) => route.kind === 'prefix' && (pathname === route.path || pathname.startsWith(`${route.path}/`)))
        .sort((left, right) => right.path.length - left.path.length)[0];
      if (prefix) return prefix.handler(req, res);
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('stand-in 404');
    },
  };
}

/**
 * Start the plugin's routes on a real HTTP server.
 * @param {{ snapshots?: object, allowRemote?: boolean, servePage?: boolean, spoofPeer?: string }} [options]
 */
async function startServer(options = {}) {
  const webServer = createStandInWebServer();
  const snapshots = options.snapshots ?? makeSnapshots();
  const logs = [];
  const dispose = registerRoutes(webServer, {
    snapshots,
    log: (message) => logs.push(message),
    version: '0.3.0-test',
    credentialsHint: {
      providers: IDS.map((id) => ({ id, label: `Stub ${id}`, refs: [] })),
    },
    allowRemote: options.allowRemote === true,
    servePage: options.servePage !== false,
  });
  const server = http.createServer((req, res) => {
    // The test peer is always loopback; spoof a non-loopback address through a
    // header when a case needs the allowRemote gate.
    if (options.spoofPeer === true && typeof req.headers['x-test-peer'] === 'string') {
      Object.defineProperty(req.socket, 'remoteAddress', { value: req.headers['x-test-peer'], configurable: true });
    }
    try {
      webServer.dispatch(req, res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(error?.stack ?? error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {{port: number}} */ (server.address());
  return {
    url: `http://127.0.0.1:${port}`,
    snapshots,
    logs,
    close: async () => {
      dispose();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * One request with a JSON body parsed when possible.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string> }} [options]
 */
async function request(url, options = {}) {
  const response = await fetch(url, { method: options.method ?? 'GET', headers: options.headers });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, text, json };
}

/* --------------------------------------------------- per-provider route */

test('GET /api/provider?id=… serves exactly that provider', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/provider?id=glm`);
    assert.equal(response.status, 200);
    assert.equal(response.json.providers.length, 1);
    assert.equal(response.json.providers[0].id, 'glm');
    assert.equal(response.json.protocolVersion, 1);
    assert.deepEqual(server.snapshots.calls, [{ kind: 'getProvider', id: 'glm', force: false }]);
  } finally {
    await server.close();
  }
});

test('POST /api/provider?id=… forces that one provider and waits for it', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/provider?id=deepseek`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(response.json.providers[0].id, 'deepseek');
    assert.deepEqual(server.snapshots.calls, [{ kind: 'getProvider', id: 'deepseek', force: true }]);
  } finally {
    await server.close();
  }
});

test('the provider id is read from the query string, with other parameters ignored', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/provider?from=panel&id=kimi`);
    assert.equal(response.status, 200);
    assert.equal(server.snapshots.calls[0].id, 'kimi');
  } finally {
    await server.close();
  }
});

test('a missing provider id is a 400, not a degraded provider row', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/provider`);
    assert.equal(response.status, 400);
    assert.equal(response.json.ok, false);
    assert.equal(response.json.error.code, 'unknown-provider');
    assert.match(response.json.error.message, /id/);
    assert.deepEqual(server.snapshots.calls, [], 'the service is never asked for an invalid id');
  } finally {
    await server.close();
  }
});

test('an unknown provider id is a 400 that names the known providers', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/provider?id=openai`);
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, 'unknown-provider');
    assert.match(response.json.error.message, /openai/);
    assert.match(response.json.error.message, /deepseek, glm, kimi/);
    assert.deepEqual(server.snapshots.calls, []);
  } finally {
    await server.close();
  }
});

test('an unsupported method on the provider route is a 405 with the allowed set', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/provider?id=glm`, { method: 'PUT' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD, POST');
    assert.deepEqual(server.snapshots.calls, []);
  } finally {
    await server.close();
  }
});

test('HEAD on the provider route runs the read but sends no body', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/provider?id=glm`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.text, '');
    assert.equal(server.snapshots.calls[0].id, 'glm');
  } finally {
    await server.close();
  }
});

test('a service-level failure on the provider route is a 500, not a fake provider row', async () => {
  const snapshots = makeSnapshots();
  snapshots.getProvider = async () => {
    throw new Error('boom');
  };
  const server = await startServer({ snapshots });
  try {
    const response = await request(`${server.url}/usage-board/api/provider?id=glm`);
    assert.equal(response.status, 500);
    assert.equal(response.json.error.code, 'provider-failed');
    assert.equal(server.logs.length, 1);
    assert.match(server.logs[0], /boom/);
  } finally {
    await server.close();
  }
});

/* ---------------------------------------------------- aggregate routes */

test('GET /api/snapshot keeps its serving contract', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/snapshot`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.json.providers.map((row) => row.id), IDS);
    assert.deepEqual(server.snapshots.calls, [{ kind: 'getServing' }]);
  } finally {
    await server.close();
  }
});

test('POST /api/refresh forces every provider through the aggregate read', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/refresh`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.deepEqual(server.snapshots.calls, [{ kind: 'get', force: true }]);
  } finally {
    await server.close();
  }
});

/* -------------------------------------------------------------- health */

test('health reports per-provider cache state additively', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/health`);
    assert.equal(response.status, 200);
    const body = response.json;
    assert.equal(body.ok, true);
    assert.equal(body.version, '0.3.0-test');
    assert.equal(body.ttlMs, 60_000);
    assert.equal(body.reads, 4);
    assert.equal(body.backgroundReads, 1);
    assert.equal(body.fresh, true);
    assert.deepEqual(body.providers.map((entry) => entry.id), IDS);
    assert.deepEqual(body.providers.map((entry) => entry.status), ['fresh', 'stale', 'fresh']);
    assert.deepEqual(body.credentials.providers.map((entry) => entry.id), IDS);
    assert.deepEqual(server.snapshots.calls, [], 'health never reads upstream');
  } finally {
    await server.close();
  }
});

/* -------------------------------------------------- standalone page boot */

test('the standalone page is injected with the per-provider boot contract', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const boot = /window\.__USAGE_BOARD__=(\{.*?\});<\/script>/s.exec(response.text);
    assert.ok(boot !== null, 'the page must carry its boot object');
    const injected = JSON.parse(boot[1]);
    assert.equal(injected.providerPath, '/usage-board/api/provider');
    assert.equal(injected.providerQueryParam, 'id');
    assert.deepEqual(injected.providerIds, IDS);
    // The aggregate paths stay injected for compatibility.
    assert.equal(injected.snapshotPath, '/usage-board/api/snapshot');
    assert.equal(injected.refreshPath, '/usage-board/api/refresh');
    assert.equal(injected.version, '0.3.0-test');
    assert.deepEqual(server.snapshots.calls, [], 'page rendering never reads upstream');
  } finally {
    await server.close();
  }
});

/* ---------------------------------------------------- loopback policy */

test('the per-provider route is loopback-only unless allowRemote is set', async () => {
  const blocked = await startServer({ spoofPeer: true });
  try {
    const response = await request(`${blocked.url}/usage-board/api/provider?id=glm`, {
      headers: { 'x-test-peer': '203.0.113.9' },
    });
    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, 'forbidden');
    assert.deepEqual(blocked.snapshots.calls, []);
  } finally {
    await blocked.close();
  }

  const open = await startServer({ spoofPeer: true, allowRemote: true });
  try {
    const response = await request(`${open.url}/usage-board/api/provider?id=glm`, {
      headers: { 'x-test-peer': '203.0.113.9' },
    });
    assert.equal(response.status, 200);
  } finally {
    await open.close();
  }
});

/* ------------------------------------------------------- unknown paths */

test('an unknown API path under the prefix stays a JSON 404', async () => {
  const server = await startServer();
  try {
    const response = await request(`${server.url}/usage-board/api/nope`);
    assert.equal(response.status, 404);
    assert.equal(response.json.error.code, 'not-found');
    assert.deepEqual(server.snapshots.calls, []);
  } finally {
    await server.close();
  }
});

test('disposing the routes removes every one of them', async () => {
  const webServer = createStandInWebServer();
  const snapshots = makeSnapshots();
  const dispose = registerRoutes(webServer, {
    snapshots,
    log: () => undefined,
    version: 'test',
    servePage: false,
  });
  const registered = webServer.routes.length;
  assert.equal(
    registered,
    5,
    'snapshot, refresh, provider, health, plus the prefix seat (servePage: false claims it for the plugin 404)',
  );
  dispose();
  assert.equal(webServer.routes.length, 0);
});
