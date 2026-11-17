import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  isAllowedOrigin,
  isLoopbackAddress,
  MUTATION_HEADER,
  registerRoutes,
  SET_PATH,
  STATUS_PATH,
} from '../src/host/routes.js';

const TEST_TOKEN = 'test-only-mutation-token';

async function withRouteServer(service, run) {
  const routes = new Map();
  let origin;
  const webServer = {
    getOrigin: () => origin,
    register(route) {
      routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    },
  };
  const dispose = registerRoutes(webServer, service, { mutationToken: TEST_TOKEN });
  const server = http.createServer((req, res) => {
    const handler = routes.get(new URL(req.url ?? '/', origin).pathname);
    if (!handler) {
      res.writeHead(404);
      res.end();
      return;
    }
    void handler(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  try {
    await run(origin);
  } finally {
    dispose();
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(origin, body, options = {}) {
  const headers = {
    origin,
    'content-type': 'application/json',
    [MUTATION_HEADER]: TEST_TOKEN,
    ...options.headers,
  };
  for (const name of options.omitHeaders ?? []) delete headers[name];
  return fetch(`${origin}${SET_PATH}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('loopback and Origin checks are strict', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('127.4.5.6'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('10.0.0.2'), false);
  assert.equal(isLoopbackAddress(undefined), false);

  assert.equal(isAllowedOrigin('http://127.0.0.1:49335', 'http://127.0.0.1:49335'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:49335/', 'http://127.0.0.1:49335'), true);
  assert.equal(isAllowedOrigin('dsh-app://app', 'http://127.0.0.1:49335'), true);
  assert.equal(isAllowedOrigin('dsh-app://main', 'http://127.0.0.1:49335'), false);
  assert.equal(isAllowedOrigin('https://example.com', 'http://127.0.0.1:49335'), false);
  assert.equal(isAllowedOrigin(undefined, 'http://127.0.0.1:49335'), false);
  assert.equal(isAllowedOrigin('null', 'http://127.0.0.1:49335'), false);
});

test('GET and HEAD status return the service value without caching', async () => {
  let calls = 0;
  await withRouteServer(
    {
      async getStatus() {
        calls += 1;
        return { platform: 'darwin', persistentSleep: true, sleepDisabled: false };
      },
    },
    async (origin) => {
      const response = await fetch(`${origin}${STATUS_PATH}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.deepEqual(await response.json(), {
        ok: true,
        platform: 'darwin',
        persistentSleep: true,
        sleepDisabled: false,
        mutationToken: TEST_TOKEN,
      });

      const head = await fetch(`${origin}${STATUS_PATH}`, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      assert.equal(calls, 2);
    },
  );
});

test('Windows capability and persistent denial use stable codes', async () => {
  await withRouteServer(
    {
      async getStatus() {
        return { platform: 'win32', persistentSleep: false, sleepDisabled: null };
      },
      async setSleepDisabled() {
        const error = new Error('not macOS');
        error.code = 'persistent-unsupported';
        throw error;
      },
    },
    async (origin) => {
      const status = await fetch(`${origin}${STATUS_PATH}`);
      assert.equal(status.status, 200);
      assert.deepEqual(await status.json(), {
        ok: true,
        platform: 'win32',
        persistentSleep: false,
        sleepDisabled: null,
        mutationToken: TEST_TOKEN,
      });

      const set = await post(origin, { sleepDisabled: true });
      assert.equal(set.status, 501);
      const body = await set.json();
      assert.equal(body.error.code, 'persistent-unsupported');
      assert.match(body.error.message, /macOS/);
    },
  );
});

test('POST set accepts one boolean from the exact DSH Origin', async () => {
  const values = [];
  await withRouteServer(
    {
      async setSleepDisabled(value) {
        values.push(value);
        return { sleepDisabled: value };
      },
    },
    async (origin) => {
      const on = await post(origin, { sleepDisabled: true });
      assert.equal(on.status, 200);
      assert.deepEqual(await on.json(), { ok: true, sleepDisabled: true });
      const off = await post(origin, { sleepDisabled: false });
      assert.equal(off.status, 200);
      assert.deepEqual(await off.json(), { ok: true, sleepDisabled: false });
      assert.deepEqual(values, [true, false]);
    },
  );
});

test('Desktop forwarding without Origin or Sec-Fetch-Site accepts a valid token', async () => {
  await withRouteServer(
    { async setSleepDisabled(value) { return { sleepDisabled: value }; } },
    async (origin) => {
      const response = await post(origin, { sleepDisabled: true }, {
        omitHeaders: ['origin', 'sec-fetch-site'],
      });
      assert.equal(response.status, 200);
    },
  );
});

test('Desktop forwarding without Origin still rejects a missing token', async () => {
  let calls = 0;
  await withRouteServer(
    {
      async setSleepDisabled(value) {
        calls += 1;
        return { sleepDisabled: value };
      },
    },
    async (origin) => {
      const response = await post(origin, { sleepDisabled: true }, {
        omitHeaders: ['origin', 'sec-fetch-site', MUTATION_HEADER],
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'forbidden');
      assert.equal(calls, 0);
    },
  );
});

test('cross-origin and cross-site mutations are rejected before the service', async () => {
  let calls = 0;
  await withRouteServer(
    {
      async setSleepDisabled(value) {
        calls += 1;
        return { sleepDisabled: value };
      },
    },
    async (origin) => {
      const crossOrigin = await post(origin, { sleepDisabled: true }, {
        headers: { origin: 'https://example.com' },
      });
      assert.equal(crossOrigin.status, 403);
      assert.equal((await crossOrigin.json()).error.code, 'forbidden');

      const crossSite = await post(origin, { sleepDisabled: true }, {
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      assert.equal(crossSite.status, 403);
      assert.equal(calls, 0);
    },
  );
});

test('POST requires JSON and a strict one-field boolean body', async () => {
  let calls = 0;
  await withRouteServer(
    {
      async setSleepDisabled(value) {
        calls += 1;
        return { sleepDisabled: value };
      },
    },
    async (origin) => {
      const wrongType = await post(origin, 'sleepDisabled=true', {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      assert.equal(wrongType.status, 400);

      for (const body of [
        '{bad json',
        { sleepDisabled: 'true' },
        { sleepDisabled: true, extra: 1 },
        {},
        null,
        [],
      ]) {
        const response = await post(origin, body);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'bad-request');
      }
      const oversized = await post(origin, `{${' '.repeat(1100)}}`);
      assert.equal(oversized.status, 400);
      assert.equal(calls, 0);
    },
  );
});

test('unsupported methods and service failures use stable codes', async () => {
  await withRouteServer(
    {
      async getStatus() {
        const error = new Error('not macOS');
        error.code = 'unsupported';
        throw error;
      },
      async setSleepDisabled() {
        const error = new Error('already busy');
        error.code = 'busy';
        throw error;
      },
    },
    async (origin) => {
      const method = await fetch(`${origin}${STATUS_PATH}`, { method: 'POST' });
      assert.equal(method.status, 405);
      assert.match(method.headers.get('allow'), /GET/);

      const unsupported = await fetch(`${origin}${STATUS_PATH}`);
      assert.equal(unsupported.status, 501);
      assert.equal((await unsupported.json()).error.code, 'unsupported');

      const busy = await post(origin, { sleepDisabled: true });
      assert.equal(busy.status, 409);
      assert.equal((await busy.json()).error.code, 'busy');
    },
  );
});

test('a wrong token is rejected even with the exact Origin', async () => {
  let calls = 0;
  await withRouteServer(
    {
      async setSleepDisabled(value) {
        calls += 1;
        return { sleepDisabled: value };
      },
    },
    async (origin) => {
      const response = await post(origin, { sleepDisabled: true }, {
        headers: { [MUTATION_HEADER]: 'wrong-token' },
      });
      assert.equal(response.status, 403);
      assert.equal(calls, 0);
    },
  );
});

test('service diagnostics and local paths are not returned to the browser', async () => {
  await withRouteServer(
    {
      async getStatus() {
        const error = new Error('failed in /Users/private-name/secret-path');
        error.code = 'command-failed';
        throw error;
      },
    },
    async (origin) => {
      const response = await fetch(`${origin}${STATUS_PATH}`);
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.error.message, 'The privileged pmset command failed.');
      assert.doesNotMatch(JSON.stringify(body), /private-name|secret-path/);
    },
  );
});

test('a partial route registration failure disposes the first route', () => {
  let disposed = 0;
  const webServer = {
    register(route) {
      if (route.path === SET_PATH) throw new Error('duplicate route');
      return () => {
        disposed += 1;
      };
    },
  };
  assert.throws(() => registerRoutes(webServer, {}), /duplicate route/);
  assert.equal(disposed, 1);
});

test('the HTTP handler rejects a non-loopback peer before service access', async () => {
  let handler;
  let serviceCalls = 0;
  const webServer = {
    register(route) {
      if (route.path === STATUS_PATH) handler = route.handler;
      return () => undefined;
    },
  };
  registerRoutes(webServer, {
    async getStatus() {
      serviceCalls += 1;
      return { sleepDisabled: false };
    },
  }, { mutationToken: TEST_TOKEN });
  const req = { method: 'GET', headers: {}, socket: { remoteAddress: '10.0.0.2' } };
  let status;
  const res = {
    writeHead(value) { status = value; },
    end() {},
  };
  await handler(req, res);
  assert.equal(status, 403);
  assert.equal(serviceCalls, 0);
});
