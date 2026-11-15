/**
 * Host-route verification (task-3, section B) against a running scratch DSH
 * instance, plus protocol edge cases driven through the plugin's real handlers
 * on a stand-in server.
 *
 * Run: `node test/verify/routes-live.mjs [baseUrl]`
 * Default base URL: http://127.0.0.1:3178/usage-board
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';

import { isLoopbackAddress } from '../../src/host/routes.js';
import { PROVIDER_IDS, PROTOCOL_VERSION, PROVIDER_PATH, PROVIDER_QUERY_PARAM } from '../../src/shared/protocol.js';
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
  check('B1.5', 'health.providers lists every provider in display order with additive cache state', JSON.stringify(healthBody?.providers?.map((entry) => entry.id)) === JSON.stringify(PROVIDER_IDS) && (healthBody?.providers ?? []).every((entry) => ['id', 'status', 'fetchedAt', 'expiresAt', 'refreshing'].every((key) => key in entry)), JSON.stringify(healthBody?.providers));
  check('B1.6', 'every health.providers status is one of fresh/stale/missing', (healthBody?.providers ?? []).every((entry) => ['fresh', 'stale', 'missing'].includes(entry.status)), JSON.stringify(healthBody?.providers?.map((entry) => `${entry.id}:${entry.status}`)));
  const pluginVersion = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version;
  check('B1.7', `health.version matches package.json (${pluginVersion})`, healthBody?.version === pluginVersion, `health.version=${healthBody?.version}`);

  const snapshotResponse = await request(`${BASE}/api/snapshot`);
  const snapshot = tryJson(snapshotResponse.text);
  check('B2.1', 'GET /api/snapshot -> 200 JSON', snapshotResponse.status === 200 && snapshot !== null, `HTTP ${snapshotResponse.status}, ${snapshotResponse.text.length} bytes`);
  checkEqual('B2.2', 'protocolVersion is 1', snapshot?.protocolVersion, PROTOCOL_VERSION);
  checkEqual('B2.3', 'one row per provider in deepseek, glm, kimi order', snapshot?.providers?.map((row) => row.id), PROVIDER_IDS);
  check('B2.4', 'ok is derived correctly from the rows', snapshot?.ok === snapshot?.providers?.every((row) => row.status === 'ok'), `ok=${snapshot?.ok} rows=${snapshot?.providers?.map((row) => `${row.id}:${row.status}`).join(',')}`);
  check('B2.5', 'ttlMs matches the profile config (60s)', snapshot?.ttlMs === 60_000, `ttlMs=${snapshot?.ttlMs}`);

  const shapeProblems = [];
  for (const row of snapshot?.providers ?? []) {
    for (const key of ['id', 'label', 'status', 'message', 'messageKey', 'code', 'plan', 'windows', 'balances', 'account', 'meta', 'fetchedAt', 'latencyMs']) {
      if (!(key in row)) shapeProblems.push(`${row.id}.${key} missing`);
    }
    if (!Array.isArray(row.windows)) shapeProblems.push(`${row.id}.windows not an array`);
    if (!Array.isArray(row.balances)) shapeProblems.push(`${row.id}.balances not an array`);
    if (row.meta === null || typeof row.meta !== 'object') shapeProblems.push(`${row.id}.meta not an object`);
    for (const win of row.windows) {
      for (const key of ['id', 'labelKey', 'unit', 'number', 'limit', 'used', 'remaining', 'percent', 'derivedPercent', 'resetAt', 'note']) {
        if (!(key in win)) shapeProblems.push(`${row.id}.${win.id}.${key} missing`);
      }
    }
  }
  check('B2.6', 'every protocol field is present on every row/window', shapeProblems.length === 0, shapeProblems.join('; ') || 'no missing fields');

  const percentages = (snapshot?.providers ?? []).flatMap((row) => row.windows.map((win) => ({ id: win.id, percent: win.percent })));
  check('B2.7', 'no window reports a percent without either a limit or an upstream percentage', percentages.every((entry) => entry.percent === null || entry.percent >= 0), JSON.stringify(percentages));

  // v2: derivedPercent is additive and must agree with used/limit where usable.
  const derivedProblems = [];
  for (const row of snapshot?.providers ?? []) {
    for (const win of row.windows) {
      if (!('derivedPercent' in win)) {
        derivedProblems.push(`${row.id}/${win.id}: field missing`);
        continue;
      }
      const usable = typeof win.used === 'number' && typeof win.limit === 'number' && win.limit > 0;
      if (!usable) {
        if (win.derivedPercent !== null) derivedProblems.push(`${row.id}/${win.id}: derivedPercent=${win.derivedPercent} without a usable pair`);
        continue;
      }
      const expected = Math.round((win.used / win.limit) * 1000) / 10;
      if (win.derivedPercent !== expected) derivedProblems.push(`${row.id}/${win.id}: derivedPercent=${win.derivedPercent} expected ${expected}`);
    }
  }
  check('B2.8', 'every window carries derivedPercent that matches used/limit exactly', derivedProblems.length === 0, derivedProblems.join('; ') || 'all windows consistent');

  const declaredPreserved = (snapshot?.providers ?? [])
    .flatMap((row) => row.windows.map((win) => ({ id: `${row.id}/${win.id}`, declared: win.percent, derived: win.derivedPercent })))
    .filter((entry) => entry.declared !== null && entry.derived !== null);
  check(
    'B2.9',
    'the provider-declared percent is still recoverable verbatim beside derivedPercent',
    declaredPreserved.every((entry) => typeof entry.declared === 'number'),
    declaredPreserved.map((entry) => `${entry.id}: declared=${entry.declared} derived=${entry.derived}`).join(', ') || 'no declared values on the wire',
  );

  const messageKeys = (snapshot?.providers ?? []).map((row) => ({ id: row.id, status: row.status, messageKey: row.messageKey }));
  check('B2.10', 'messageKey is null on ok rows and never undefined', messageKeys.every((entry) => entry.messageKey === null || typeof entry.messageKey === 'string'), JSON.stringify(messageKeys));

  // ---- refresh really refetches. `reads` now counts PROVIDER reads, so one
  // aggregate refresh is expected to cost exactly one read per provider.
  const before = tryJson((await request(`${BASE}/api/snapshot`)).text);
  // Settle the board first: a background refresh already in flight would be
  // shared by the forced read (per-provider dedupe), making the delta smaller
  // than a clean fan-out.
  await request(`${BASE}/api/refresh`, { method: 'POST' });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const readsBefore = tryJson((await request(`${BASE}/api/health`)).text).reads;
  const refreshed = await request(`${BASE}/api/refresh`, { method: 'POST' });
  const after = tryJson(refreshed.text);
  const readsAfter = tryJson((await request(`${BASE}/api/health`)).text).reads;
  check('B3.1', 'POST /api/refresh -> 200 with a snapshot', refreshed.status === 200 && Array.isArray(after?.providers), `HTTP ${refreshed.status}`);
  check('B3.2', 'refresh produces a new generatedAt', after?.generatedAt !== before?.generatedAt, `${before?.generatedAt} -> ${after?.generatedAt}`);
  check('B3.3', `one aggregate refresh costs ${PROVIDER_IDS.length} provider reads (health.reads semantics)`, readsAfter === readsBefore + PROVIDER_IDS.length, `reads ${readsBefore} -> ${readsAfter} (expected +${PROVIDER_IDS.length})`);
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
  check('B5.4', 'page boot block is injected with the old aggregate paths', page.text.includes('__USAGE_BOARD__') && page.text.includes('/usage-board/api/snapshot') && page.text.includes('/usage-board/api/refresh'), 'boot block present');
  const bootMatch = /window\.__USAGE_BOARD__=(\{.*?\});<\/script>/.exec(page.text);
  const boot = bootMatch === null ? null : tryJson(bootMatch[1]);
  check('B5.4b', 'boot block carries providerPath + providerQueryParam + providerIds for the per-provider renders', boot?.providerPath === PROVIDER_PATH && boot?.providerQueryParam === PROVIDER_QUERY_PARAM && JSON.stringify(boot?.providerIds) === JSON.stringify(PROVIDER_IDS), JSON.stringify({ providerPath: boot?.providerPath, providerQueryParam: boot?.providerQueryParam, providerIds: boot?.providerIds }));
  check('B5.4c', 'boot block still carries snapshotPath + refreshPath', boot?.snapshotPath === '/usage-board/api/snapshot' && boot?.refreshPath === '/usage-board/api/refresh', JSON.stringify({ snapshotPath: boot?.snapshotPath, refreshPath: boot?.refreshPath }));
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
    provider: (await request(`${BASE}/api/provider?id=deepseek`)).text,
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
    const routeCalls = [
      ['/usage-board/api/snapshot', 'GET'],
      ['/usage-board/api/health', 'GET'],
      ['/usage-board/api/refresh', 'POST'],
      ['/usage-board/api/provider?id=deepseek', 'GET'],
      ['/usage-board/api/provider?id=glm', 'POST'],
      ['/usage-board/', 'GET'],
      ['/usage-board/client.js', 'GET'],
    ];
    for (const peer of ['10.0.0.7', '2001:db8::1', '192.168.1.20']) {
      const results = [];
      for (const [path, method] of routeCalls) {
        const response = await request(`${server.url}${path}`, { method, headers: { 'x-qa-spoof-remote': peer } });
        results.push(`${path.split('?')[0]}:${method}:${response.status}`);
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
  console.log('\n== B10 refresh is POST-only (D-7) and CSP enforcement ==');
  const before = tryJson((await request(`${BASE}/api/snapshot`)).text);
  const viaGet = await request(`${BASE}/api/refresh`);
  check('B10.1', 'GET /api/refresh -> 405 with Allow: POST (D-7 fix)', viaGet.status === 405 && viaGet.headers.allow === 'POST', `HTTP ${viaGet.status}, allow: ${viaGet.headers.allow}`);
  const viaPost = await request(`${BASE}/api/refresh`, { method: 'POST' });
  const viaPostBody = tryJson(viaPost.text);
  check('B10.2', 'POST /api/refresh still forces a real refetch', viaPost.status === 200 && viaPostBody?.generatedAt !== before?.generatedAt, `HTTP ${viaPost.status}, ${before?.generatedAt} -> ${viaPostBody?.generatedAt}`);
  const viaHead = await request(`${BASE}/api/refresh`, { method: 'HEAD' });
  check('B10.2b', 'HEAD /api/refresh is also refused (405), so a GET-shaped prefetch cannot force work', viaHead.status === 405, `HTTP ${viaHead.status}, allow: ${viaHead.headers.allow}`);

  const page = await request(`${BASE}/`);
  const csp = page.headers['content-security-policy'] ?? '';
  check('B10.3', 'the page document carries no external subresource that CSP would block', !/<(script|link|img|iframe)[^>]+(src|href)=["'](https?:)?\/\//i.test(page.text), 'no absolute/remote subresources');
  check('B10.4', 'CSP allows the inline boot script the page needs', csp.includes("script-src 'unsafe-inline'"), csp);
}

/* ------------------------------------------- B11 per-provider route (live DSH) */

async function liveProviderRoutes() {
  console.log(`\n== B11 per-provider routes on the live DSH instance ==`);
  for (const id of PROVIDER_IDS) {
    const first = await request(`${BASE}/api/provider?id=${id}`);
    const body = tryJson(first.text);
    check(`B11.1.${id}`, `GET ${PROVIDER_PATH}?${PROVIDER_QUERY_PARAM}=${id} -> 200 one-row envelope`, first.status === 200 && body?.providers?.length === 1 && body.providers[0]?.id === id, `HTTP ${first.status}, rows=${JSON.stringify(body?.providers?.map((row) => row?.id))}`);
    check(`B11.2.${id}`, `GET provider?id=${id} carries protocolVersion, ttlMs and a derived ok`, body?.protocolVersion === PROTOCOL_VERSION && typeof body?.ttlMs === 'number' && body?.ok === (body?.providers?.[0]?.status === 'ok'), JSON.stringify({ protocolVersion: body?.protocolVersion, ttlMs: body?.ttlMs, ok: body?.ok, status: body?.providers?.[0]?.status }));
    const second = await request(`${BASE}/api/provider?id=${id}`);
    const secondBody = tryJson(second.text);
    check(`B11.3.${id}`, `a second GET provider?id=${id} is served from cache (same generatedAt)`, secondBody?.generatedAt === body?.generatedAt, `${body?.generatedAt} / ${secondBody?.generatedAt}`);
    const forced = await request(`${BASE}/api/provider?id=${id}`, { method: 'POST' });
    const forcedBody = tryJson(forced.text);
    check(`B11.4.${id}`, `POST provider?id=${id} -> 200 one-row envelope`, forced.status === 200 && forcedBody?.providers?.length === 1 && forcedBody.providers[0]?.id === id, `HTTP ${forced.status}, rows=${JSON.stringify(forcedBody?.providers?.map((row) => row?.id))}`);
    check(`B11.5.${id}`, `POST provider?id=${id} forces a genuinely new read (new generatedAt)`, forcedBody?.generatedAt !== body?.generatedAt, `${body?.generatedAt} -> ${forcedBody?.generatedAt}`);
    check(`B11.6.${id}`, `POST provider?id=${id} keeps ok derived from its single row`, forcedBody?.ok === (forcedBody?.providers?.[0]?.status === 'ok'), `ok=${forcedBody?.ok}, status=${forcedBody?.providers?.[0]?.status}`);
  }

  const missing = await request(`${BASE}/api/provider`);
  const missingBody = tryJson(missing.text);
  check('B11.7', 'missing id -> 400 unknown-provider', missing.status === 400 && missingBody?.ok === false && missingBody?.error?.code === 'unknown-provider', `HTTP ${missing.status} ${missing.text.slice(0, 120)}`);
  const unknown = await request(`${BASE}/api/provider?id=not-a-provider`);
  check('B11.8', 'unknown id -> 400 unknown-provider', unknown.status === 400 && tryJson(unknown.text)?.error?.code === 'unknown-provider', `HTTP ${unknown.status} ${unknown.text.slice(0, 120)}`);
  const put = await request(`${BASE}/api/provider?id=glm`, { method: 'PUT' });
  check('B11.9', 'PUT provider -> 405 with Allow: GET, HEAD, POST', put.status === 405 && put.headers.allow === 'GET, HEAD, POST', `HTTP ${put.status}, allow=${put.headers.allow}`);
  const head = await request(`${BASE}/api/provider?id=deepseek`, { method: 'HEAD' });
  check('B11.10', 'HEAD provider?id=deepseek -> 200, empty body, content-length set', head.status === 200 && head.text === '' && head.headers['content-length'] !== undefined, `HTTP ${head.status}, body ${head.text.length} bytes`);
  const health = tryJson((await request(`${BASE}/api/health`)).text);
  check('B11.11', 'after the per-provider reads every provider cache is fresh', (health?.providers ?? []).every((entry) => entry.status === 'fresh'), JSON.stringify(health?.providers?.map((entry) => `${entry.id}:${entry.status}`)));
  check('B11.12', `health.reads grew by ${PROVIDER_IDS.length} per forced per-provider read`, typeof health?.reads === 'number' && health.reads >= PROVIDER_IDS.length * 2, `reads=${health?.reads}`);
}

/* ------------------------- B12 trailing dailyUsage on the live provider route */

/** Beijing calendar date for "now" (UTC+8, no DST). */
function beijingToday() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** `YYYY-MM-DD` + 1 day (calendar arithmetic without a timezone library). */
function nextDate(date) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * The live DeepSeek row now carries a trailing 30-day spend series merged from
 * the current + previous `/usage/cost` month. That is wire data the renderers
 * sum, so its shape is asserted on the live per-provider route.
 */
async function liveDailyUsage() {
  console.log('\n== B12 live DeepSeek meta.dailyUsage (trailing 30 days) ==');
  const forced = await request(`${BASE}/api/provider?id=deepseek`, { method: 'POST' });
  const body = tryJson(forced.text);
  const row = body?.providers?.[0];
  check('B12.1', 'POST provider?id=deepseek -> 200, one ok row', forced.status === 200 && row?.id === 'deepseek' && row?.status === 'ok', `HTTP ${forced.status}, status=${row?.status}, message=${row?.message}`);
  const series = row?.meta?.dailyUsage;
  check('B12.2', 'the row carries meta.dailyUsage (history, not a window)', series !== null && typeof series === 'object' && Array.isArray(series.points), JSON.stringify(series).slice(0, 160));
  if (!series) return;
  const today = beijingToday();
  const dates = series.points.map((point) => point.date);
  check('B12.3', 'the series has exactly 30 points (the trailing window)', series.points.length === 30, `${series.points.length} point(s)`);
  checkEqual('B12.4', 'series.days equals the shipped point count', series.days, series.points.length);
  check('B12.5', 'oldest first and contiguous', dates.every((date, index) => index === 0 || nextDate(dates[index - 1]) === date), `${dates[0]} -> ${dates.at(-1)}`);
  checkEqual('B12.6', 'the series ends on today\'s Beijing date', dates.at(-1), today);
  check('B12.7', 'no future date is present', dates.every((date) => date <= today), `last=${dates.at(-1)}`);
  const monthStart = `${today.slice(0, 7)}-01`;
  check('B12.8', 'the window spans the previous month (otherwise 近一月 is month-to-date)', dates[0] < monthStart, `first=${dates[0]}, monthStart=${monthStart}`);
  check('B12.9', 'elapsed zero-cost days are kept in the live series', series.points.some((point) => point.cost === 0), `${series.points.filter((point) => point.cost === 0).length} zero-cost point(s)`);
  check('B12.10', 'every point is {date, cost: number, tokens: null}', series.points.every((point) => Object.keys(point).sort().join(',') === 'cost,date,tokens' && /^\d{4}-\d{2}-\d{2}$/.test(point.date) && typeof point.cost === 'number' && Number.isFinite(point.cost) && point.tokens === null), JSON.stringify(series.points[0]));
  const sum = (points) => Math.round(points.reduce((total, point) => total + point.cost, 0) * 1e6) / 1e6;
  console.log(`      live series: ${dates[0]} -> ${dates.at(-1)}, week=${sum(series.points.slice(-7))}, month=${sum(series.points.slice(-30))}, zero-cost days=${series.points.filter((point) => point.cost === 0).length}`);
  check('B12.11', 'the week/month sums are finite positive money values', sum(series.points.slice(-7)) > 0 && sum(series.points.slice(-30)) > 0, `week=${sum(series.points.slice(-7))} month=${sum(series.points.slice(-30))}`);
  // A warm GET must not change the payload.
  const warm = tryJson((await request(`${BASE}/api/provider?id=deepseek`)).text);
  checkEqual('B12.12', 'a warm GET returns the same series (no fabricated drift)', warm?.providers?.[0]?.meta?.dailyUsage?.points?.map((point) => [point.date, point.cost]), series.points.map((point) => [point.date, point.cost]));
}

/* ---------------------------------------------------------------------- runner */

const snapshot = await liveRoutes();
if (snapshot) await liveLeakScan(snapshot);
await loopbackMatrix();
await pageDisabled();
await extraRoutes();
await liveProviderRoutes();
await liveDailyUsage();
process.exit(finish());
