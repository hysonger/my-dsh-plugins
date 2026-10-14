/**
 * Adversarial upstream cases (task-3, section C).
 *
 * Every case drives the *real* plugin code — `SnapshotService`, the real
 * adapters, the real `fetch-json.js` and the real route handlers — and only the
 * upstream transport / credential source is controlled. No source file is
 * edited, no real credential is used, and no real network request leaves the
 * machine.
 *
 * Run: `node test/verify/adversarial.mjs`
 */

import { fetchJson } from '../../src/host/fetch-json.js';
import { providerById, PROVIDERS } from '../../src/host/providers/index.js';
import { SnapshotService } from '../../src/host/snapshot.js';
import {
  check,
  checkEqual,
  fakeUpstream,
  finish,
  request,
  startPluginServer,
  tryJson,
  withGlobalFetch,
} from './_lib.mjs';

/* ----------------------------------------------------------------- fixtures */

const DS_SUMMARY = 'https://platform.deepseek.com/api/v0/users/get_user_summary';
const DS_COST_PREFIX = 'https://platform.deepseek.com/api/v0/usage/cost';
const DS_API_BALANCE = 'https://api.deepseek.com/user/balance';
const GLM_CN = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit';
const GLM_INTL = 'https://api.z.ai/api/monitor/usage/quota/limit';
const GLM_SUB = 'https://api.z.ai/api/biz/subscription/list';
const KIMI_CN = 'https://api.kimi.com/coding/v1/usages';
const KIMI_INTL = 'https://api.kimi.ai/coding/v1/usages';

const DS_OK = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: {
      normal_wallets: [{ currency: 'CNY', balance: '33.6528879400000000' }],
      bonus_wallets: [{ currency: 'CNY', balance: '0.00' }],
      total_costs: [{ currency: 'CNY', amount: '12.34' }],
    },
  },
};
const DS_COST_OK = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: [
      {
        currency: 'CNY',
        total: [{ usage: [{ amount: '3.00' }] }],
        days: [
          { date: '2026-10-12', data: [{ usage: [{ amount: '1.00' }] }] },
          { date: '2026-10-13', data: [{ usage: [{ amount: '0.50' }, { amount: '0.25' }] }] },
          { date: '2026-10-14', data: [{ usage: [{ amount: '1.25' }] }] },
          { date: '2026-10-15', data: [] },
        ],
      },
    ],
  },
};
const GLM_OK = {
  code: 200,
  msg: '操作成功',
  success: true,
  data: {
    level: 'lite',
    limits: [
      { type: 'CREDIT_LIMIT', unit: 3, number: 5, usage: 2000, currentValue: 656, remaining: 1343, percentage: 32, nextResetTime: 1791973452542 },
      { type: 'CREDIT_LIMIT', unit: 6, number: 1, usage: 10000, currentValue: 5831, remaining: 4168, percentage: 58, nextResetTime: 1792123975997 },
    ],
  },
};
const GLM_SUB_OK = { code: 200, success: true, data: [{ productName: 'GLM Coding Lite', status: 'VALID' }] };
const KIMI_OK = {
  usage: { limit: '100', used: '43', remaining: '57', resetTime: '2026-10-16T08:11:56Z' },
  limits: [
    { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '36', remaining: '64', resetTime: '2026-10-14T07:11:56Z' } },
  ],
  usages: { limit_5h: { used_ratio: 0.357, reset_time: '2026-10-14T07:11:55Z' }, limit_7d: { used_ratio: 0.4266, reset_time: '2026-10-16T08:11:55Z' } },
  booster_wallet: { status: 'STATUS_DISABLED' },
};

/** Exact-URL fixture table for the healthy path. */
const HEALTHY_ROUTES = {
  [DS_SUMMARY]: { body: DS_OK },
  [GLM_CN]: { body: GLM_OK },
  [GLM_INTL]: { body: GLM_OK },
  [GLM_SUB]: { body: GLM_SUB_OK },
  [KIMI_CN]: { body: KIMI_OK },
  [KIMI_INTL]: { body: KIMI_OK },
};

/**
 * A plan that answers every provider host with a good body. `/usage/cost` is
 * matched by prefix because its URL carries month/year query parameters.
 * @param {string} url
 */
function healthyPlan(url) {
  if (HEALTHY_ROUTES[url]) return HEALTHY_ROUTES[url];
  if (url.startsWith(DS_COST_PREFIX)) return { body: DS_COST_OK };
  return undefined;
}

const PLATFORM_TOKEN = 'qa-platform-grant-do-not-log';

/** getSecret that resolves the platform grant only. */
const platformOnly = async (name) => (name === 'DEEPSEEK_PLATFORM_TOKEN' ? PLATFORM_TOKEN : undefined);
/** getSecret that resolves everything. */
const allSecrets = async (name) => ({
  DEEPSEEK_PLATFORM_TOKEN: PLATFORM_TOKEN,
  ZAI_CODING_CN_API_KEY: 'qa-glm-key',
  KIMI_CODING_API_KEY: 'qa-kimi-key',
}[name]);

/**
 * Run one adapter directly, with a fake transport but the real fetch-json.
 * @param {string} id
 * @param {{plan: any, getSecret?: Function, signal?: AbortSignal, timeoutMs?: number, abortedCount?: {value: number}}} options
 */
async function direct(id, options) {
  const adapter = providerById(id);
  const fake = fakeUpstream(options.plan);
  const row = await adapter.read({
    getSecret: options.getSecret ?? allSecrets,
    fetchJson: (url, opts = {}) => fetchJson(url, { ...opts, fetchImpl: fake.fetchImpl }),
    signal: options.signal,
    now: () => Date.now(),
    timeoutMs: options.timeoutMs ?? 12_000,
  });
  if (options.abortedCount) options.abortedCount.value = fake.state.aborted;
  return { row, calls: fake.calls };
}

/** Start the real routes on a real HTTP server under a fake upstream. */
async function scenario({ plan, getSecret = allSecrets, config = {}, run }) {
  const fake = fakeUpstream(plan);
  const server = await startPluginServer({ config, getSecret });
  try {
    return await withGlobalFetch(fake.fetchImpl, () => run({ server, fake }));
  } finally {
    await server.close();
  }
}

const rowOf = (snapshot, id) => snapshot.providers.find((row) => row.id === id);
const brief = (row) => JSON.stringify({ status: row.status, code: row.code, message: row.message, meta: row.meta });

/* ============================================================ C1 missing credential */

async function c1() {
  console.log('\n== C1 missing credential -> not-configured, rest of the board still ok ==');
  const { rows, envelope, http } = await scenario({
    plan: healthyPlan,
    getSecret: platformOnly,
    run: async ({ server }) => {
      const response = await request(`${server.url}/usage-board/api/snapshot`);
      const body = tryJson(response.text);
      return { rows: body.providers, envelope: body, http: response.status };
    },
  });

  check('C1.0', 'envelope is still HTTP 200 (provider failure is not a transport failure)', http === 200, `HTTP ${http}`);
  checkEqual('C1.1', 'ok is false because two providers are unconfigured', envelope.ok, false);
  checkEqual('C1.2', 'one row per provider, in deepseek/glm/kimi order', rows.map((row) => row.id), ['deepseek', 'glm', 'kimi']);
  checkEqual('C1.3', 'DeepSeek (configured) stays ok', rowOf(envelope, 'deepseek').status, 'ok');
  const glm = rowOf(envelope, 'glm');
  const kimi = rowOf(envelope, 'kimi');
  check('C1.4', 'GLM row is not-configured', glm.status === 'not-configured', brief(glm));
  check('C1.5', 'GLM message names ZAI_CODING_CN_API_KEY', typeof glm.message === 'string' && glm.message.includes('ZAI_CODING_CN_API_KEY'), glm.message);
  check('C1.6', 'Kimi row is not-configured', kimi.status === 'not-configured', brief(kimi));
  check('C1.7', 'Kimi message names KIMI_CODING_API_KEY', typeof kimi.message === 'string' && kimi.message.includes('KIMI_CODING_API_KEY'), kimi.message);

  const ds = await direct('deepseek', { plan: healthyPlan, getSecret: async () => undefined });
  check('C1.8', 'DeepSeek with no grant is not-configured', ds.row.status === 'not-configured', brief(ds.row));
  check('C1.9', 'DeepSeek message says what to do (sign in / DEEPSEEK_PLATFORM_TOKEN)', ds.row.message.includes('DEEPSEEK_PLATFORM_TOKEN'), ds.row.message);
  check('C1.10', 'an unconfigured provider makes no upstream call at all', ds.calls.length === 0, `${ds.calls.length} calls`);

  const glmDirect = await direct('glm', { plan: healthyPlan, getSecret: async () => undefined });
  check('C1.11', 'GLM not-configured makes no upstream call', glmDirect.calls.length === 0, `${glmDirect.calls.length} calls`);
}

/* ================================================== C2 invalid credential (body code) */

async function c2() {
  console.log('\n== C2 invalid credential hidden behind HTTP 200 business codes ==');

  const ds = await direct('deepseek', {
    plan: { [DS_SUMMARY]: { status: 200, body: { code: 40003, msg: 'Authorization failed' } } },
  });
  check('C2.1', 'DeepSeek HTTP 200 + code 40003 -> unauthorized (status-only check would say ok)', ds.row.status === 'unauthorized', brief(ds.row));
  check('C2.2', 'DeepSeek code is surfaced verbatim', ds.row.code === 'code 40003', `code=${ds.row.code}`);

  const glm = await direct('glm', {
    plan: { [GLM_CN]: { status: 200, body: { code: 1000, msg: '身份验证失败。', success: false } }, [GLM_INTL]: { status: 200, body: { code: 1000, msg: '身份验证失败。', success: false } } },
  });
  check('C2.3', 'GLM HTTP 200 + success:false + code 1000 -> unauthorized', glm.row.status === 'unauthorized', brief(glm.row));
  check('C2.4', 'GLM code is surfaced verbatim', glm.row.code === 'code 1000', `code=${glm.row.code}`);
  check('C2.5', 'GLM tried both regional hosts before giving up', glm.calls.length === 2, `${glm.calls.length} calls`);

  // A response that omits `success` but carries a non-200 code must not slip through.
  const glmCodeOnly = await direct('glm', {
    plan: { default: { status: 200, body: { code: 1002, msg: 'no success flag', data: { limits: GLM_OK.data.limits } } } },
  });
  check('C2.6', 'GLM non-200 code without a success flag -> upstream-error, never a fake ok row', glmCodeOnly.row.status === 'upstream-error', brief(glmCodeOnly.row));

  const kimi = await direct('kimi', {
    plan: { default: { status: 200, body: { error: { type: 'invalid_api_key', message: 'bad key' } } } },
  });
  check('C2.7', 'Kimi HTTP 200 + error.type invalid_api_key -> unauthorized', kimi.row.status === 'unauthorized', brief(kimi.row));

  const dsBiz = await direct('deepseek', {
    plan: { [DS_SUMMARY]: { status: 200, body: { code: 0, data: { biz_code: 40003 } } } },
  });
  check('C2.8', 'DeepSeek code:0 but biz_code 40003 -> unauthorized', dsBiz.row.status === 'unauthorized', brief(dsBiz.row));
}

/* ============================================================ C3 upstream HTTP status */

async function c3() {
  console.log('\n== C3 upstream HTTP status mapping ==');
  const cases = [
    { status: 401, expected: 'unauthorized' },
    { status: 403, expected: 'unauthorized' },
    { status: 429, expected: 'rate-limited' },
    { status: 500, expected: 'upstream-error' },
    { status: 503, expected: 'upstream-error' },
    { status: 404, expected: 'upstream-error' },
  ];
  for (const testCase of cases) {
    for (const id of ['deepseek', 'glm', 'kimi']) {
      const { row, calls } = await direct(id, { plan: { default: { status: testCase.status, body: { error: 'nope' } } } });
      check(
        `C3.${testCase.status}.${id}`,
        `${id}: HTTP ${testCase.status} -> ${testCase.expected}`,
        row.status === testCase.expected,
        `${row.status} / code=${row.code} after ${calls.length} call(s)`,
      );
    }
  }

  // Mixed regional outcomes must not mask the most specific diagnosis.
  const mixed = await direct('glm', {
    plan: { [GLM_CN]: { status: 429, body: { error: 'slow down' } }, [GLM_INTL]: { status: 500, body: { error: 'boom' } } },
  });
  check('C3.mixed', 'GLM 429 (CN) + 500 (intl) reports rate-limited, not upstream-error', mixed.row.status === 'rate-limited', brief(mixed.row));

  const netFirst = await direct('kimi', {
    plan: { [KIMI_CN]: { status: 503, body: {} }, [KIMI_INTL]: { status: 403, body: {} } },
  });
  check('C3.intl-auth', 'Kimi 503 (CN) + 403 (intl) reports unauthorized (most specific wins)', netFirst.row.status === 'unauthorized', brief(netFirst.row));
}

/* ============================================================ C4 malformed bodies */

async function c4() {
  console.log('\n== C4 malformed 2xx bodies -> invalid-response, rawSnippet, no throw ==');
  for (const id of ['deepseek', 'glm', 'kimi']) {
    const { row } = await direct(id, { plan: { default: { status: 200, body: { hello: 'world' } } } });
    check(`C4.json.${id}`, `${id}: 2xx {"hello":"world"} -> invalid-response`, row.status === 'invalid-response', brief(row));
    check(`C4.snippet.${id}`, `${id}: meta.rawSnippet carries the offending body`, typeof row.meta?.rawSnippet === 'string' && row.meta.rawSnippet.includes('hello'), `rawSnippet=${JSON.stringify(row.meta?.rawSnippet)}`);
  }
  for (const id of ['deepseek', 'glm', 'kimi']) {
    const { row } = await direct(id, { plan: { default: { status: 200, body: '<!doctype html><h1>gateway</h1>', contentType: 'text/html' } } });
    check(`C4.html.${id}`, `${id}: 2xx HTML body -> invalid-response/E_NOT_JSON`, row.status === 'invalid-response' && row.code === 'E_NOT_JSON', brief(row));
    check(`C4.htmlsnippet.${id}`, `${id}: HTML rawSnippet is populated and truncated`, typeof row.meta?.rawSnippet === 'string' && row.meta.rawSnippet.length > 0, `len=${row.meta?.rawSnippet?.length}`);
  }
  const empty = await direct('glm', { plan: { default: { status: 200, body: '', contentType: 'application/json' } } });
  check('C4.empty', 'GLM 2xx empty body -> invalid-response', empty.row.status === 'invalid-response', brief(empty.row));

  const huge = await direct('glm', { plan: { default: { status: 200, body: 'x'.repeat(200_000), contentType: 'text/plain' } } });
  check('C4.huge', 'GLM 200 KiB non-JSON body is truncated, not echoed whole', huge.row.status === 'invalid-response' && String(huge.row.meta?.rawSnippet ?? '').length <= 200, `rawSnippet len=${String(huge.row.meta?.rawSnippet ?? '').length}`);
}

/* ============================================================ C5 transport */

async function c5() {
  console.log('\n== C5 transport failure: DNS, abort, timeout ==');

  // (a) unresolvable host: real DNS resolution through the real fetch stack.
  const realFetch = globalThis.fetch;
  const rewriteHost = (url) => String(url).replace(/^https:\/\/platform\.deepseek\.com/, 'https://nxdomain-qa.invalid');
  const adapter = providerById('deepseek');
  const dnsRow = await adapter.read({
    getSecret: allSecrets,
    fetchJson: (url, opts = {}) => fetchJson(rewriteHost(url), { ...opts, fetchImpl: realFetch }),
    now: () => Date.now(),
  });
  check('C5.1', 'unresolvable host -> network-error', dnsRow.status === 'network-error', brief(dnsRow));
  check('C5.2', 'network-error carries the transport error name as code', typeof dnsRow.code === 'string' && dnsRow.code.length > 0, `code=${dnsRow.code}`);

  // (a2) the Kimi regional loop must also fail over on a transport error.
  const kimiAdapter = providerById('kimi');
  const kimiDnsRow = await kimiAdapter.read({
    getSecret: allSecrets,
    fetchJson: (url, opts = {}) => fetchJson(String(url).replace(/^https:\/\/api\.kimi\.(com|ai)/, 'https://nxdomain-qa.invalid'), { ...opts, fetchImpl: realFetch }),
    now: () => Date.now(),
  });
  check('C5.2b', 'Kimi DNS failure -> network-error after trying both hosts', kimiDnsRow.status === 'network-error', brief(kimiDnsRow));

  // (b) caller abort must cancel the in-flight request, not wait for 12s.
  const controller = new AbortController();
  const aborted = { value: 0 };
  const started = Date.now();
  const hangPlan = { default: { hang: true } };
  const pending = direct('glm', { plan: hangPlan, signal: controller.signal, abortedCount: aborted });
  setTimeout(() => controller.abort(new DOMException('qa abort', 'AbortError')), 60);
  const abortedResult = await pending;
  const elapsed = Date.now() - started;
  check('C5.3', 'aborted signal -> network-error/ABORTED', abortedResult.row.status === 'network-error' && abortedResult.row.code === 'ABORTED', brief(abortedResult.row));
  check('C5.4', 'abort actually cancelled the in-flight request (< 1000 ms, not the 12 s timeout)', elapsed < 1000, `${elapsed} ms; transport saw ${aborted.value} abort(s)`);

  // (c) the 12s deadline is honored (shortened here via the host seam).
  const startedTimeout = Date.now();
  const timeoutResult = await direct('kimi', { plan: hangPlan, timeoutMs: 300 });
  const timeoutElapsed = Date.now() - startedTimeout;
  check('C5.5', 'a hanging upstream hits the deadline instead of hanging forever', timeoutElapsed < 2000 && timeoutResult.row.status === 'network-error', `${timeoutElapsed} ms / ${brief(timeoutResult.row)}`);
  check('C5.6', 'deadline failure is reported as TimeoutError', timeoutResult.row.code === 'TimeoutError', `code=${timeoutResult.row.code}`);

  // (d) an already-aborted signal must not start a request.
  const pre = new AbortController();
  pre.abort();
  const preResult = await direct('kimi', { plan: healthyPlan, signal: pre.signal });
  check('C5.7', 'already-aborted signal -> network-error with zero upstream calls', preResult.row.status === 'network-error' && preResult.calls.length === 0, `${brief(preResult.row)}; ${preResult.calls.length} call(s)`);
}

/* ============================================================ C6 all three failing */

async function c6() {
  console.log('\n== C6 all three providers failing at once ==');
  // Every provider host answers 503; nothing else is routed (so an unexpected
  // extra upstream call would throw and fail the case loudly).
  const outage = (url) => (healthyPlan(url) ? { status: 503, body: { error: 'total outage' } } : undefined);
  const outcome = await scenario({
    plan: outage,
    run: async ({ server }) => {
      const snapshot = await request(`${server.url}/usage-board/api/snapshot`);
      const page = await request(`${server.url}/usage-board/`);
      return { snapshot, page };
    },
  });
  const envelope = tryJson(outcome.snapshot.text);
  check('C6.1', 'envelope is HTTP 200 even when every provider fails', outcome.snapshot.status === 200, `HTTP ${outcome.snapshot.status}`);
  check('C6.2', 'ok is false', envelope.ok === false, `ok=${envelope.ok}`);
  checkEqual('C6.3', 'three rows, protocol order preserved', envelope.providers.map((row) => row.id), ['deepseek', 'glm', 'kimi']);
  check('C6.4', 'every row has a non-ok status', envelope.providers.every((row) => row.status !== 'ok'), envelope.providers.map((row) => `${row.id}:${row.status}`).join(', '));
  check('C6.5', 'every row carries a human-readable message', envelope.providers.every((row) => typeof row.message === 'string' && row.message.length > 0), 'all rows have a message');
  check('C6.6', 'rows keep their latency accounting', envelope.providers.every((row) => typeof row.latencyMs === 'number'), envelope.providers.map((row) => row.latencyMs).join(', '));
  check('C6.7', 'the standalone page still answers HTTP 200 with the renderer', outcome.page.status === 200 && outcome.page.text.includes('用量看板'), `HTTP ${outcome.page.status}, ${outcome.page.text.length} bytes`);
  console.log('      all-failing envelope: ' + JSON.stringify(envelope.providers.map((row) => ({ id: row.id, status: row.status, message: row.message }))));
}

/* ============================================================ C7 refresh storm */

async function c7() {
  console.log('\n== C7 10 parallel refreshes must not fan out 10x ==');
  const slowPlan = (url) => { const spec = healthyPlan(url); return spec ? { ...spec, delayMs: 150 } : undefined; };
  const outcome = await scenario({
    plan: slowPlan,
    run: async ({ server, fake }) => {
      // Baseline: one sequential refresh = one fan-out. The exact number of
      // upstream calls per fan-out is the adapters' business, so the storm is
      // compared against a measured baseline instead of a hard-coded count.
      await request(`${server.url}/usage-board/api/refresh`, { method: 'POST' });
      const baseline = fake.calls.length;
      fake.calls.length = 0;
      const results = await Promise.all(
        Array.from({ length: 10 }, () => request(`${server.url}/usage-board/api/refresh`, { method: 'POST' })),
      );
      const stormCalls = fake.calls.length;
      const health = tryJson((await request(`${server.url}/usage-board/api/health`)).text);
      return { results, baseline, stormCalls, calls: fake.calls.slice(), health };
    },
  });
  const envelopes = outcome.results.map((result) => tryJson(result.text));
  const distinctGeneratedAt = new Set(envelopes.map((body) => body.generatedAt));
  const hosts = outcome.calls.map((call) => new URL(call.url).host);
  check('C7.1', 'all 10 refreshes answered 200', outcome.results.every((result) => result.status === 200), outcome.results.map((r) => r.status).join(','));
  check('C7.2', '10 parallel refreshes cost exactly one fan-out', outcome.stormCalls === outcome.baseline, `${outcome.stormCalls} upstream calls vs baseline ${outcome.baseline} per fan-out`);
  check('C7.3', 'all 10 responses share one generatedAt', distinctGeneratedAt.size === 1, `${distinctGeneratedAt.size} distinct values`);
  check('C7.4', 'health.reads advanced by exactly one fan-out (baseline + 1)', outcome.health.reads === 2, `reads=${outcome.health.reads}`);
  check('C7.5', 'fan-out is far below the naive 10x', outcome.stormCalls <= outcome.baseline * 1.5, `${outcome.stormCalls} vs naive ${outcome.baseline * 10}`);
  check('C7.6', 'every baseline upstream host was hit exactly once in the storm', new Set(hosts).size === hosts.length, hosts.join(', '));

  // Adversarial variant: cold cache + 10 parallel GETs.
  const cold = await scenario({
    plan: slowPlan,
    run: async ({ server, fake }) => {
      const results = await Promise.all(Array.from({ length: 10 }, () => request(`${server.url}/usage-board/api/snapshot`)));
      return { fake, results, calls: fake.calls.length };
    },
  });
  const baselineCold = await scenario({
    plan: slowPlan,
    run: async ({ server, fake }) => {
      await request(`${server.url}/usage-board/api/snapshot`);
      return { calls: fake.calls.length };
    },
  });
  check('C7.7', 'cold cache + 10 parallel GETs still fans out once', cold.calls === baselineCold.calls, `${cold.calls} upstream calls vs baseline ${baselineCold.calls}`);
}

/* ============================================================ C8 cache boundary */

async function c8() {
  console.log('\n== C8 cache boundary: identical bytes inside ttl, new snapshot after ==');
  const server = await startPluginServer({ config: { ttlMs: 15_000 }, getSecret: allSecrets });
  const fake = fakeUpstream(healthyPlan);
  try {
    await withGlobalFetch(fake.fetchImpl, async () => {
      const first = await request(`${server.url}/usage-board/api/snapshot`);
      const fanOut = fake.calls.length;
      const second = await request(`${server.url}/usage-board/api/snapshot`);
      const afterSecond = fake.calls.length;
      const forced = await request(`${server.url}/usage-board/api/refresh`, { method: 'POST' });
      const afterForced = fake.calls.length;
      const firstBody = tryJson(first.text);
      const secondBody = tryJson(second.text);
      check('C8.1', 'two GETs inside ttl return byte-identical bodies', first.text === second.text, `generatedAt ${firstBody.generatedAt} / ${secondBody.generatedAt}`);
      check('C8.2', 'generatedAt is unchanged inside ttl', firstBody.generatedAt === secondBody.generatedAt, `${firstBody.generatedAt} === ${secondBody.generatedAt}`);
      check('C8.3', 'the second GET inside ttl makes zero upstream calls', afterSecond === fanOut, `${fanOut} -> ${afterSecond} upstream calls (one fan-out = ${fanOut})`);
      check('C8.4', 'POST /refresh ignores a fresh cache', tryJson(forced.text).generatedAt !== firstBody.generatedAt, `forced generatedAt ${tryJson(forced.text).generatedAt}`);
      check('C8.4b', 'the forced refresh cost exactly one more fan-out', afterForced === fanOut * 2, `${afterForced} calls after force (expected ${fanOut * 2})`);
      const before = fake.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 15_250));
      const third = await request(`${server.url}/usage-board/api/snapshot`);
      const thirdBody = tryJson(third.text);
      check('C8.5', 'past the ttl the snapshot is refetched', thirdBody.generatedAt !== firstBody.generatedAt, `${firstBody.generatedAt} -> ${thirdBody.generatedAt}`);
      check('C8.6', 'the refetch is a real upstream read', fake.calls.length > before, `${before} -> ${fake.calls.length} upstream calls`);
      check('C8.7', 'snapshot carries the configured ttl', thirdBody.ttlMs === 15_000, `ttlMs=${thirdBody.ttlMs}`);
    });
  } finally {
    await server.close();
  }
}

/* -------------------------------------------------------------------- extra: health */

async function c9() {
  console.log('\n== C9 /health shape and credential hygiene ==');
  const outcome = await scenario({
    plan: healthyPlan,
    run: async ({ server }) => {
      const health = await request(`${server.url}/usage-board/api/health`);
      const head = await request(`${server.url}/usage-board/api/health`, { method: 'HEAD' });
      return { health, head };
    },
  });
  const body = tryJson(outcome.health.text);
  check('C9.1', '/health answers ok:true', body.ok === true, JSON.stringify(body).slice(0, 120));
  check('C9.2', '/health lists credential reference names, never values', JSON.stringify(body).includes('ZAI_CODING_CN_API_KEY') && !JSON.stringify(body).includes('qa-glm-key'), 'ref names only');
  check('C9.3', '/health does not echo the platform token', !outcome.health.text.includes(PLATFORM_TOKEN), 'token absent');
  check('C9.4', 'HEAD /health has no body but a content-length', outcome.head.text === '' && outcome.head.headers['content-length'] !== undefined, `len=${outcome.head.headers['content-length']}`);
  check('C9.5', 'every provider is represented in the health hint', body.credentials.providers.length === PROVIDERS.length, `${body.credentials.providers.length} providers`);
}

/* ---------------------------------------------------------------------- runner */

const only = process.argv[2];
const sections = { c1, c2, c3, c4, c5, c6, c7, c8, c9 };
for (const [name, section] of Object.entries(sections)) {
  if (only && only !== name) continue;
  await section();
}
process.exit(finish());
