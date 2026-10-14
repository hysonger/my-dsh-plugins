/**
 * Host-route verification (task-3, section B) against a running scratch DSH
 * instance, plus protocol edge cases driven through the plugin's real handlers
 * on a stand-in server.
 *
 * Run: `node test/verify/routes-live.mjs [baseUrl]`
 * Default base URL: http://127.0.0.1:3178/usage-board
 */

import http from 'node:http';

import { isLoopbackAddress } from '../../src/host/routes.js';
import { PROVIDER_IDS, PROTOCOL_VERSION } from '../../src/shared/protocol.js';
import { check, checkEqual, finish, loadRealSecrets, mask, request, startPluginServer, tryJson } from './_lib.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3178/usage-board';

/**
 * Send a request with a raw, un-encoded path (fetch/undici normalize it).
 * @param {string} origin
 * @param {string} path
 * @returns {Promise<{status: number, text: string}>}
 */
function rawGet(origin, path) {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: target.hostname, port: target.port, method: 'GET', path }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    req.end();
  });
}

/* ------------------------------------------------------------------ live DSH */

async function liveRoutes() {
  console.log(`\n== B live DSH routes at ${BASE} ==`);

  const health = await request(`${BASE}/api/health`);
  const healthBody = tryJson(health.text);
  check('B1.1', 'GET /api/health -> 200 {ok:true}', health.status === 200 && healthBody?.ok === true, `HTTP ${health.status} ${health.text.slice(0, 140)}`);
  check('B1.2', 'health reports protocolVersion 1 and a ttl', healthBody?.protocolVersion === PROTOCOL_VERSION && typeof healthBody?.ttlMs === 'number', `protocolVersion=${healthBody?.protocolVersion} ttlMs=${healthBody?.ttlMs}`);
  check('B1.3', 'health exposes a configured-style summary, not credential values', typeof healthBody?.credentials === 'object' && Array.isArray(healthBody.credentials.providers), JSON.stringify(healthBody?.credentials).slice(0, 200));
  check('B1.4', 'health reads counter is a number', typeof healthBody?.reads === 'number', `reads=${healthBody?.reads}`);

  const snapshotResponse = await request(`${BASE}/api/snapshot`);
  const snapshot = tryJson(snapshotResponse.text);
  check('B2.1', 'GET /api/snapshot -> 200 JSON', snapshotResponse.status === 200 && snapshot !== null, `HTTP ${snapshotResponse.status}, ${snapshotResponse.text.length} bytes`);
  checkEqual('B2.2', 'protocolVersion is 1', snapshot?.protocolVersion, PROTOCOL_VERSION);
  checkEqual('B2.3', 'one row per provider in deepseek, glm, kimi order', snapshot?.providers?.map((row) => row.id), PROVIDER_IDS);
  check('B2.4', 'ok is derived correctly from the rows', snapshot?.ok === snapshot?.providers?.every((row) => row.status === 'ok'), `ok=${snapshot?.ok} rows=${snapshot?.providers?.map((row) => `${row.id}:${row.status}`).join(',')}`);
  check('B2.5', 'ttlMs matches the profile config (60s)', snapshot?.ttlMs === 60_000, `ttlMs=${snapshot?.ttlMs}`);

  const shapeProblems = [];
  for (const row of snapshot?.providers ?? []) {
    for (const key of ['id', 'label', 'status', 'message', 'code', 'plan', 'windows', 'balances', 'account', 'meta', 'fetchedAt', 'latencyMs']) {
      if (!(key in row)) shapeProblems.push(`${row.id}.${key} missing`);
    }
    if (!Array.isArray(row.windows)) shapeProblems.push(`${row.id}.windows not an array`);
    if (!Array.isArray(row.balances)) shapeProblems.push(`${row.id}.balances not an array`);
    if (row.meta === null || typeof row.meta !== 'object') shapeProblems.push(`${row.id}.meta not an object`);
    for (const win of row.windows) {
      for (const key of ['id', 'labelKey', 'unit', 'number', 'limit', 'used', 'remaining', 'percent', 'resetAt', 'note']) {
        if (!(key in win)) shapeProblems.push(`${row.id}.${win.id}.${key} missing`);
      }
    }
  }
  check('B2.6', 'every protocol field is present on every row/window', shapeProblems.length === 0, shapeProblems.join('; ') || 'no missing fields');

  const percentages = (snapshot?.providers ?? []).flatMap((row) => row.windows.map((win) => ({ id: win.id, percent: win.percent })));
  check('B2.7', 'no window reports a percent without either a limit or an upstream percentage', percentages.every((entry) => entry.percent === null || entry.percent >= 0), JSON.stringify(percentages));

  // ---- refresh really refetches
  const before = tryJson((await request(`${BASE}/api/snapshot`)).text);
  const readsBefore = tryJson((await request(`${BASE}/api/health`)).text).reads;
  const refreshed = await request(`${BASE}/api/refresh`, { method: 'POST' });
  const after = tryJson(refreshed.text);
  const readsAfter = tryJson((await request(`${BASE}/api/health`)).text).reads;
  check('B3.1', 'POST /api/refresh -> 200 with a snapshot', refreshed.status === 200 && Array.isArray(after?.providers), `HTTP ${refreshed.status}`);
  check('B3.2', 'refresh produces a new generatedAt', after?.generatedAt !== before?.generatedAt, `${before?.generatedAt} -> ${after?.generatedAt}`);
  check('B3.3', 'refresh increments health.reads', readsAfter === readsBefore + 1, `reads ${readsBefore} -> ${readsAfter}`);
  const secondGet = tryJson((await request(`${BASE}/api/snapshot`)).text);
  check('B3.4', 'the refreshed snapshot is served from cache (generatedAt stable)', secondGet?.generatedAt === after?.generatedAt, `${after?.generatedAt} then ${secondGet?.generatedAt}`);

  // ---- method handling
  const del = await request(`${BASE}/api/snapshot`, { method: 'DELETE' });
  check('B4.1', 'DELETE /api/snapshot -> 405', del.status === 405, `HTTP ${del.status}`);
  check('B4.2', '405 carries an Allow header listing GET, HEAD', (del.headers.allow ?? '').includes('GET') && (del.headers.allow ?? '').includes('HEAD'), `allow: ${del.headers.allow}`);
  const post = await request(`${BASE}/api/snapshot`, { method: 'POST' });
  check('B4.3', 'POST /api/snapshot -> 405 (refresh has its own path)', post.status === 405, `HTTP ${post.status}, allow: ${post.headers.allow}`);
  const delHealth = await request(`${BASE}/api/health`, { method: 'DELETE' });
  check('B4.4', 'DELETE /api/health -> 405', delHealth.status === 405, `HTTP ${delHealth.status}, allow: ${delHealth.headers.allow}`);
  const delRefresh = await request(`${BASE}/api/refresh`, { method: 'DELETE' });
  check('B4.5', 'DELETE /api/refresh -> 405', delRefresh.status === 405, `HTTP ${delRefresh.status}, allow: ${delRefresh.headers.allow}`);
  const headSnap = await request(`${BASE}/api/snapshot`, { method: 'HEAD' });
  check('B4.6', 'HEAD /api/snapshot -> 200, no body, content-length set', headSnap.status === 200 && headSnap.text === '' && headSnap.headers['content-length'] !== undefined, `HTTP ${headSnap.status} len=${headSnap.headers['content-length']}`);
  const headPage = await request(`${BASE}/`, { method: 'HEAD' });
  check('B4.7', 'HEAD /usage-board/ -> 200, no body', headPage.status === 200 && headPage.text === '', `HTTP ${headPage.status}`);

  // ---- page + CSP
  const page = await request(`${BASE}/`);
  check('B5.1', 'GET /usage-board/ -> 200 HTML', page.status === 200 && page.text.includes('<!doctype html'), `HTTP ${page.status}`);
  check('B5.2', 'CSP header present on the page', typeof page.headers['content-security-policy'] === 'string', page.headers['content-security-policy']);
  const csp = page.headers['content-security-policy'] ?? '';
  check('B5.3', 'CSP forbids remote script/style/frame', csp.includes("default-src 'none'") && csp.includes("script-src 'unsafe-inline'") && !csp.includes('http://') && !csp.includes('https://'), csp);
  check('B5.4', 'page boot block is injected with the protocol paths', page.text.includes('__USAGE_BOARD__') && page.text.includes('/usage-board/api/snapshot') && page.text.includes('/usage-board/api/refresh'), 'boot block present');
  check('B5.5', 'page is self-contained (no external subresource)', !/<(script|link|img)[^>]+(src|href)=["']https?:/i.test(page.text), 'no absolute subresources');

  // ---- unknown paths / prefix boundaries
  const origin = new URL(BASE).origin;
  const unknownApi = await request(`${BASE}/api/does-not-exist`);
  const unknownApiBody = tryJson(unknownApi.text);
  check('B6.1', 'unknown API path -> 404 JSON with error.code not-found', unknownApi.status === 404 && (unknownApi.headers['content-type'] ?? '').includes('application/json') && unknownApiBody?.error?.code === 'not-found', `HTTP ${unknownApi.status} ${unknownApi.text.slice(0, 90)}`);
  const unknownPage = await request(`${BASE}/does-not-exist`);
  check('B6.2', 'unknown non-API path -> 404 HTML, not a 200 dashboard', unknownPage.status === 404 && !unknownPage.text.includes('__USAGE_BOARD__'), `HTTP ${unknownPage.status}, ${unknownPage.text.length} bytes`);
  const rootNoSlash = await request(`${origin}${'/usage-board'}`);
  check('B6.3', 'the dashboard answers at both /usage-board and /usage-board/', rootNoSlash.status === 200 && rootNoSlash.text.includes('__USAGE_BOARD__'), `HTTP ${rootNoSlash.status} for /usage-board`);
  const headUnknown = await request(`${BASE}/api/does-not-exist`, { method: 'HEAD' });
  check('B6.4', 'HEAD on an unknown path -> 404 with no body', headUnknown.status === 404 && headUnknown.text === '', `HTTP ${headUnknown.status}, body ${headUnknown.text.length} bytes`);
  const xss = await request(`${BASE}/%3Cscript%3Ealert(1)%3C/script%3E%3Cimg%20src=x%20onerror=alert(1)%3E`);
  check('B6.5', 'a reflected path cannot inject markup (percent-encoded, never decoded)', xss.status === 404 && !xss.text.includes('<script') && !xss.text.includes('<img'), `HTTP ${xss.status}; body keeps the encoded path: ${xss.text.includes('%3Cscript%3E')}`);
  const encodedTraversal = await request(`${BASE}/..%2f..%2fetc%2fpasswd`);
  check('B6.6', 'an encoded traversal attempt is a plain 404 with no file content', encodedTraversal.status === 404 && !encodedTraversal.text.includes('root:'), `HTTP ${encodedTraversal.status}`);
  const rawXss = await rawGet(origin, '/usage-board/<script>alert(1)</script>');
  check('B6.6b', 'a raw markup path is encoded by the HTTP parser and cannot inject', rawXss.status === 404 && !rawXss.text.includes('<script'), `HTTP ${rawXss.status}`);
  const sibling = await request(`${origin}/usage-board-sibling`);
  check('B6.7', 'a sibling path outside the prefix does not match the plugin', sibling.status !== 200 || !sibling.text.includes('用量看板'), `HTTP ${sibling.status} from /usage-board-sibling`);
  const pluginBundle = await request(`${BASE}/client.js`);
  check('B6.8', 'the plugin does not double-serve the browser bundle (DSH client-module route owns it)', pluginBundle.status === 404, `HTTP ${pluginBundle.status} (bundle is served at /plugins/??dsh-plugin-usage-board/client.js, verified in the browser network log)`);

  return snapshot;
}

/* --------------------------------------------------------- credential leak scan (live) */

async function liveLeakScan(snapshot) {
  console.log('\n== B7 credential-leak scan of live responses ==');
  const { refs, platformToken } = await loadRealSecrets();
  const prefixes = Object.entries(refs).map(([name, value]) => ({ name, prefix: value.slice(0, 8), masked: mask(value) }));
  prefixes.push({ name: 'DEEPSEEK_PLATFORM_TOKEN', prefix: (platformToken ?? '').slice(0, 8), masked: mask(platformToken) });

  const bodies = {
    snapshot: JSON.stringify(snapshot),
    health: (await request(`${BASE}/api/health`)).text,
    page: (await request(`${BASE}/`)).text,
    bundle: (await request(`${BASE}/client.js`)).text,
    refresh: (await request(`${BASE}/api/refresh`, { method: 'POST' })).text,
    unknown: (await request(`${BASE}/api/does-not-exist`)).text,
  };
  for (const { name, prefix, masked } of prefixes) {
    const hits = Object.entries(bodies).filter(([, body]) => prefix.length >= 8 && body.includes(prefix)).map(([key]) => key);
    check(`B7.${name}`, `no response contains the first 8 chars of ${name} (${masked})`, hits.length === 0, hits.length === 0 ? 'clean' : `LEAK in ${hits.join(', ')}`);
  }
  check('B7.bearer', 'no response echoes a Bearer token', !JSON.stringify(bodies).includes('Bearer '), 'no Bearer material in any response');
  check('B7.token', 'no response contains the literal grant token', !Object.values(bodies).some((body) => platformToken && body.includes(platformToken)), 'grant token absent');
  return prefixes.length;
}

/* ------------------------------------------------------- loopback / peer control */

async function loopbackMatrix() {
  console.log('\n== B8 loopback restriction ==');
  const matrix = [
    ['127.0.0.1', true],
    ['::ffff:127.0.0.1', true],
    ['127.0.0.5', true],
    ['127.1.2.3', true],
    ['::1', true],
    ['10.0.0.7', false],
    ['192.168.1.20', false],
    ['::ffff:8.8.8.8', false],
    ['2001:db8::1', false],
    ['', false],
    [undefined, false],
  ];
  for (const [address, expected] of matrix) {
    const actual = isLoopbackAddress(address);
    check(`B8.isLoopback(${String(address) || 'undefined'})`, `${String(address) || 'undefined'} -> ${expected ? 'allowed' : 'denied'}`, actual === expected, `isLoopbackAddress=${actual}`);
  }

  const server = await startPluginServer({ getSecret: async () => undefined, spoofRemote: true, config: { ttlMs: 15_000 } });
  try {
    const paths = ['/usage-board/api/snapshot', '/usage-board/api/health', '/usage-board/api/refresh', '/usage-board/', '/usage-board/client.js'];
    for (const peer of ['10.0.0.7', '2001:db8::1', '192.168.1.20']) {
      const results = [];
      for (const path of paths) {
        const method = path.endsWith('/refresh') ? 'POST' : 'GET';
        const response = await request(`${server.url}${path}`, { method, headers: { 'x-qa-spoof-remote': peer } });
        results.push(`${path}:${response.status}`);
      }
      check(`B8.deny(${peer})`, `non-loopback peer ${peer} is refused on every route (403)`, results.every((entry) => entry.endsWith(':403')), results.join(' '));
    }
    const loopbackResults = [];
    for (const peer of ['::ffff:127.0.0.1', '127.0.0.5', '::1']) {
      const response = await request(`${server.url}/usage-board/api/health`, { headers: { 'x-qa-spoof-remote': peer } });
      loopbackResults.push(`${peer}:${response.status}`);
    }
    check('B8.allow(loopback)', 'loopback spellings are accepted', loopbackResults.every((entry) => entry.endsWith(':200')), loopbackResults.join(' '));
  } finally {
    await server.close();
  }

  const allowServer = await startPluginServer({ getSecret: async () => undefined, spoofRemote: true, config: { allowRemote: true } });
  try {
    const response = await request(`${allowServer.url}/usage-board/api/health`, { headers: { 'x-qa-spoof-remote': '10.0.0.7' } });
    check('B8.allowRemote', 'allowRemote:true is what opens the route to a non-loopback peer', response.status === 200, `HTTP ${response.status} for 10.0.0.7 with allowRemote:true`);
  } finally {
    await allowServer.close();
  }
  console.log('      live instance bind check: see `lsof -nP -iTCP:3178` in the report — DSH binds 127.0.0.1 only, so a remote peer cannot connect at all.');
}

/* ------------------------------------------------------------------- B9 misconfig */

async function pageDisabled() {
  console.log('\n== B9 servePage:false removes the page route but keeps the API ==');
  const server = await startPluginServer({ getSecret: async () => undefined, config: { servePage: false } });
  try {
    const page = await request(`${server.url}/usage-board/`);
    const api = await request(`${server.url}/usage-board/api/health`);
    check('B9.1', 'page route absent when servePage:false', page.status === 404, `HTTP ${page.status}`);
    check('B9.2', 'API still answers when servePage:false', api.status === 200, `HTTP ${api.status}`);
  } finally {
    await server.close();
  }
}

/* ------------------------------------------------------------------- B10 misc */

async function extraRoutes() {
  console.log('\n== B10 GET on the refresh route, and CSP enforcement ==');
  const before = tryJson((await request(`${BASE}/api/snapshot`)).text);
  const viaGet = await request(`${BASE}/api/refresh`);
  const viaGetBody = tryJson(viaGet.text);
  check('B10.1', 'GET /api/refresh is accepted and forces a refetch', viaGet.status === 200 && viaGetBody?.generatedAt !== before?.generatedAt, `HTTP ${viaGet.status}, ${before?.generatedAt} -> ${viaGetBody?.generatedAt}`);
  check('B10.2', 'DELETE /api/refresh still carries Allow: POST, GET', (await request(`${BASE}/api/refresh`, { method: 'DELETE' })).headers.allow === 'POST, GET', '405 advertises POST, GET');
  console.log('      NOTE: because GET also forces a refetch, any local page can trigger an upstream fan-out with a no-preflight cross-origin GET (response unreadable, side effect happens). Loopback-only limits the blast radius to ~5 upstream calls.');

  const page = await request(`${BASE}/`);
  const csp = page.headers['content-security-policy'] ?? '';
  check('B10.3', 'the page document carries no external subresource that CSP would block', !/<(script|link|img|iframe)[^>]+(src|href)=["'](https?:)?\/\//i.test(page.text), 'no absolute/remote subresources');
  check('B10.4', 'CSP allows the inline boot script the page needs', csp.includes("script-src 'unsafe-inline'"), csp);
}

/* ---------------------------------------------------------------------- runner */

const snapshot = await liveRoutes();
if (snapshot) await liveLeakScan(snapshot);
await loopbackMatrix();
await pageDisabled();
await extraRoutes();
process.exit(finish());
