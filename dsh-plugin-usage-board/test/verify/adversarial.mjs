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
      const baselineUrls = fake.calls.map((call) => call.url).sort();
      fake.calls.length = 0;
      const results = await Promise.all(
        Array.from({ length: 10 }, () => request(`${server.url}/usage-board/api/refresh`, { method: 'POST' })),
      );
      const stormCalls = fake.calls.length;
      const health = tryJson((await request(`${server.url}/usage-board/api/health`)).text);
      return { results, baseline, stormCalls, calls: fake.calls.slice(), baselineUrls, health };
    },
  });
  const envelopes = outcome.results.map((result) => tryJson(result.text));
  const distinctGeneratedAt = new Set(envelopes.map((body) => body.generatedAt));
  const stormUrls = outcome.calls.map((call) => call.url).sort();
  check('C7.1', 'all 10 refreshes answered 200', outcome.results.every((result) => result.status === 200), outcome.results.map((r) => r.status).join(','));
  check('C7.2', '10 parallel refreshes cost exactly one fan-out', outcome.stormCalls === outcome.baseline, `${outcome.stormCalls} upstream calls vs baseline ${outcome.baseline} per fan-out`);
  check('C7.3', 'all 10 responses share one generatedAt', distinctGeneratedAt.size === 1, `${distinctGeneratedAt.size} distinct values`);
  check('C7.4', 'health.reads advanced by exactly one fan-out (baseline + 1)', outcome.health.reads === 2, `reads=${outcome.health.reads}`);
  check('C7.5', 'fan-out is far below the naive 10x', outcome.stormCalls <= outcome.baseline * 1.5, `${outcome.stormCalls} vs naive ${outcome.baseline * 10}`);
  check('C7.6', 'the storm hit exactly the same upstream URLs as one baseline fan-out', JSON.stringify(stormUrls) === JSON.stringify(outcome.baselineUrls), `${outcome.stormCalls} calls: ${outcome.calls.map((call) => new URL(call.url).host + new URL(call.url).pathname).join(', ')}`);

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

/* ============================================================ C0 healthy fixture */

async function c0() {
  console.log('\n== C0 healthy path parses the documented shapes (fixture sanity) ==');
  const ds = await direct('deepseek', { plan: healthyPlan });
  check('C0.1', 'DeepSeek ok from the documented envelope', ds.row.status === 'ok', brief(ds.row));
  checkEqual('C0.2', 'DeepSeek wallet balance parsed from the money string', ds.row.balances[0]?.available, 33.65288794);
  checkEqual('C0.3', 'DeepSeek totalSpent parsed from total_costs', ds.row.balances[0]?.totalSpent, 12.34);
  checkEqual('C0.4', 'DeepSeek account is null (no identity request)', ds.row.account, null);
  const series = ds.row.meta?.dailyUsage;
  check('C0.5', 'daily usage series attached to meta', typeof series === 'object' && series !== null, JSON.stringify(series).slice(0, 140));
  checkEqual('C0.6', 'trailing zero-cost future day is trimmed', series?.days, 3);
  const sum = (series?.points ?? []).reduce((total, point) => total + (point.cost ?? 0), 0);
  checkEqual('C0.7', 'daily costs sum to the fixture total from data[].usage[].amount', Number(sum.toFixed(2)), 3);
  checkEqual('C0.8', 'DeepSeek makes exactly two upstream calls per fan-out', ds.calls.length, 2);

  const glm = await direct('glm', { plan: healthyPlan });
  check('C0.9', 'GLM ok', glm.row.status === 'ok', brief(glm.row));
  checkEqual('C0.10', 'GLM windows are ordered 5h then weekly', glm.row.windows.map((win) => win.id), ['glm.5h', 'glm.weekly']);
  checkEqual('C0.11', 'GLM plan comes from the subscription endpoint, not the bare level', glm.row.plan, 'GLM Coding Lite');
  checkEqual('C0.12', 'GLM meta.level keeps the raw level', glm.row.meta?.level, 'lite');
  checkEqual('C0.13', 'GLM meta.subscriptionStatus is surfaced', glm.row.meta?.subscriptionStatus, 'VALID');
  checkEqual('C0.14', 'GLM makes two calls (quota + subscription) per fan-out', glm.calls.length, 2);
  const fiveHour = glm.row.windows[0];
  check('C0.15', 'GLM 5h limit/used/remaining triples are complete', fiveHour.limit === 2000 && fiveHour.used === 656 && fiveHour.remaining === 1343, JSON.stringify(fiveHour));

  const kimi = await direct('kimi', { plan: healthyPlan });
  check('C0.16', 'Kimi ok', kimi.row.status === 'ok', brief(kimi.row));
  checkEqual('C0.17', 'Kimi windows are 5h then weekly', kimi.row.windows.map((win) => win.id), ['kimi.5h', 'kimi.weekly']);
  checkEqual('C0.18', 'Kimi 5h percent uses the precise ratio (35.7), not 36/100', kimi.row.windows[0].percent, 35.7);
  checkEqual('C0.19', 'Kimi has no balances and no account', [kimi.row.balances.length, kimi.row.account], [0, null]);
  checkEqual('C0.20', 'Kimi makes one call per fan-out (no identity request)', kimi.calls.length, 1);

  // ---- v2: derivedPercent must contradict the declared percent exactly where
  // the providers round, and the declared value must survive beside it.
  const glm5h = glm.row.windows[0];
  const glmWeekly = glm.row.windows[1];
  const kimi5h = kimi.row.windows[0];
  const kimiWeekly = kimi.row.windows[1];
  check('C0.21', 'GLM 5h keeps the declared 32 and derives 32.8', glm5h.percent === 32 && glm5h.derivedPercent === 32.8, `declared=${glm5h.percent} derived=${glm5h.derivedPercent}`);
  check('C0.22', 'GLM weekly keeps the declared 58 and derives 58.3', glmWeekly.percent === 58 && glmWeekly.derivedPercent === 58.3, `declared=${glmWeekly.percent} derived=${glmWeekly.derivedPercent}`);
  check('C0.23', 'Kimi 5h keeps the ratio 35.7 and derives 36 (36/100)', kimi5h.percent === 35.7 && kimi5h.derivedPercent === 36, `declared=${kimi5h.percent} derived=${kimi5h.derivedPercent}`);
  check('C0.24', 'Kimi weekly keeps the ratio 42.7 and derives 43 (43/100)', kimiWeekly.percent === 42.7 && kimiWeekly.derivedPercent === 43, `declared=${kimiWeekly.percent} derived=${kimiWeekly.derivedPercent}`);
  check('C0.25', 'every ok row carries messageKey null', [ds.row, glm.row, kimi.row].every((row) => row.messageKey === null), JSON.stringify([ds.row.messageKey, glm.row.messageKey, kimi.row.messageKey]));
}

/* ============================================== C10 best-effort secondary sources */

async function c10() {
  console.log('\n== C10 a failing best-effort source must not degrade a good row ==');
  const dsCostDown = await direct('deepseek', {
    plan: (url) => (url.startsWith(DS_COST_PREFIX) ? { status: 500, body: { error: 'cost down' } } : healthyPlan(url)),
  });
  check('C10.1', 'DeepSeek stays ok when the spend-history call fails', dsCostDown.row.status === 'ok', brief(dsCostDown.row));
  check('C10.2', 'the failure is recorded as meta.dailyUsageError', typeof dsCostDown.row.meta?.dailyUsageError === 'string', `dailyUsageError=${dsCostDown.row.meta?.dailyUsageError}`);
  check('C10.3', 'no fabricated dailyUsage series', dsCostDown.row.meta?.dailyUsage === undefined, JSON.stringify(dsCostDown.row.meta));

  const glmSubDown = await direct('glm', {
    plan: (url) => (url === GLM_SUB ? { status: 500, body: { error: 'sub down' } } : healthyPlan(url)),
  });
  check('C10.4', 'GLM stays ok when the subscription call fails', glmSubDown.row.status === 'ok', brief(glmSubDown.row));
  checkEqual('C10.5', 'GLM plan falls back to the bare level', glmSubDown.row.plan, 'lite');
  check('C10.6', 'the failure is recorded as meta.subscriptionError', typeof glmSubDown.row.meta?.subscriptionError === 'string', `subscriptionError=${glmSubDown.row.meta?.subscriptionError}`);

  const withSkKey = async (name) => (name === 'DEEPSEEK_API_KEY' ? 'qa-sk-key' : allSecrets(name));
  const secondaryDown = await direct('deepseek', {
    plan: (url) => (url === DS_API_BALANCE ? { status: 401, body: { error: 'bad sk key' } } : healthyPlan(url)),
    getSecret: withSkKey,
  });
  check('C10.7', 'DeepSeek stays ok when the optional sk- balance source is rejected', secondaryDown.row.status === 'ok', brief(secondaryDown.row));
  check('C10.8', 'the optional-source failure is recorded, not hidden', typeof secondaryDown.row.meta?.secondarySource === 'string', `secondarySource=${secondaryDown.row.meta?.secondarySource}`);

  const bothSources = await direct('deepseek', {
    plan: (url) => (url === DS_API_BALANCE ? { status: 200, body: { balance_infos: [{ currency: 'CNY', total_balance: '9.99', granted_balance: '1.00' }] } } : healthyPlan(url)),
    getSecret: withSkKey,
  });
  check('C10.9', 'a working sk- source merges without overwriting platform values', bothSources.row.status === 'ok' && bothSources.row.balances[0].available === 33.65288794, brief(bothSources.row));
  checkEqual('C10.10', 'merge reports source "both"', bothSources.row.meta?.source, 'both');
}

/* ================================================ C11 disposal / plugin unload */

async function c11() {
  console.log('\n== C11 dispose() during an in-flight fan-out ==');
  const { PROVIDERS } = await import('../../src/host/providers/index.js');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const adapter = {
    id: 'glm',
    label: 'Slow stub',
    credentialRefs: [],
    async read() {
      calls += 1;
      await gate;
      return { id: 'glm', label: 'Slow stub', status: 'ok' };
    },
  };
  const saved = PROVIDERS.slice();
  PROVIDERS.length = 0;
  PROVIDERS.push(adapter);
  try {
    const service = new SnapshotService({ getSecret: async () => undefined, now: () => Date.now() });
    const pending = service.get();
    await new Promise((resolve) => setTimeout(resolve, 20));
    service.dispose();
    release();
    const afterDispose = await pending;
    check('C11.1', 'an in-flight read still resolves after dispose (no hang)', afterDispose?.providers?.length === 1, `${afterDispose?.providers?.length} row(s)`);
    const second = await service.get();
    check('C11.2', 'v2: the disposed service refuses to serve the pre-dispose snapshot from cache', calls === 2, `${calls} upstream call(s) — 2 means the finishing read was not cached, 1 would mean it was`);
    check('C11.3', 'the next get() after dispose is a fresh read, not the stale snapshot', second.generatedAt >= afterDispose.generatedAt, `${afterDispose.generatedAt} / ${second.generatedAt}`);
    console.log('      v2: `#disposed` blocks the finishing read from re-caching, so a disposed service cannot hand out the snapshot built before disposal.');
  } finally {
    PROVIDERS.length = 0;
    PROVIDERS.push(...saved);
  }
}

/* ================================== C12 hostile window inputs / derivedPercent */

async function c12() {
  console.log('\n== C12 derivedPercent under hostile window inputs (makeWindow is the funnel) ==');
  const { makeWindow, derivedPercentOf } = await import('../../src/shared/protocol.js');
  const cases = [
    ['limit 0', { used: 5, limit: 0 }, null],
    ['negative limit', { used: 5, limit: -100 }, null],
    ['limit NaN', { used: 5, limit: Number.NaN }, null],
    ['limit Infinity', { used: 5, limit: Number.POSITIVE_INFINITY }, null],
    ['limit string "100"', { used: '5', limit: '100' }, null],
    ['limit null', { used: 5, limit: null }, null],
    ['used NaN', { used: Number.NaN, limit: 100 }, null],
    ['used null', { used: null, limit: 100 }, null],
    ['zero usage', { used: 0, limit: 100 }, 0],
    ['over quota (150/100)', { used: 150, limit: 100 }, 150],
    ['normal', { used: 1, limit: 3 }, 33.3],
    ['both null', { used: null, limit: null }, null],
  ];
  for (const [label, seed, expected] of cases) {
    const win = makeWindow({ id: 'qa.window', ...seed });
    const ok = win.derivedPercent === expected && (win.derivedPercent === null || Number.isFinite(win.derivedPercent));
    check(`C12.${label}`, `makeWindow(${label}) -> derivedPercent ${JSON.stringify(expected)}`, ok, `got ${JSON.stringify(win.derivedPercent)}`);
  }

  const nasty = makeWindow({
    id: 'qa.nasty',
    used: Number.MAX_VALUE,
    limit: Number.MIN_VALUE,
    percent: Number.NaN,
    unit: { toString: () => 'sneaky' },
  });
  check('C12.huge', 'extreme values never reach the payload as NaN/Infinity (round1 rejects non-finite)', nasty.derivedPercent === null || Number.isFinite(nasty.derivedPercent), `derivedPercent=${nasty.derivedPercent} (null is the safe answer for MAX_VALUE/MIN_VALUE)`);
  check('C12.serialize', 'a hostile window still serializes as valid JSON', (() => { try { JSON.parse(JSON.stringify(nasty)); return true; } catch { return false; } })(), 'JSON round-trip');
  checkEqual('C12.pure', 'derivedPercentOf is a pure function of its two arguments', derivedPercentOf(656, 2000), 32.8);
  check('C12.explicit-wins', 'an explicit derivedPercent seed is not overwritten', makeWindow({ id: 'qa.explicit', used: 1, limit: 4, derivedPercent: 99 }).derivedPercent === 99, 'seed honoured');
}

/* ============================================== C13 messageKey coverage by status */

async function c13() {
  console.log('\n== C13 messageKey: HTTP rows the client sees, plus the classifier matrix (D-5) ==');
  const { classifyMessage } = await import('../../src/host/snapshot.js');

  /**
   * Fetch one HTTPS-served snapshot under a controlled upstream + credential set.
   * This is what the browser half actually consumes; raw `adapter.read()` rows
   * do not carry `messageKey` because the host attaches it in `runAdapter`.
   * @param {{plan: any, getSecret?: Function}} options
   */
  async function httpRows({ plan, getSecret = allSecrets }) {
    const fake = fakeUpstream(plan);
    const server = await startPluginServer({ getSecret });
    try {
      return await withGlobalFetch(fake.fetchImpl, async () => {
        const body = tryJson((await request(`${server.url}/usage-board/api/snapshot`)).text);
        return body.providers;
      });
    } finally {
      await server.close();
    }
  }
  const rowFrom = (rows, id) => rows.find((row) => row.id === id);

  // --- semantically correct key per failure mode, over HTTP ------------------
  const cases = [
    ['glm not-configured', { plan: healthyPlan, getSecret: platformOnly }, 'glm', 'notConfigured'],
    ['kimi not-configured', { plan: healthyPlan, getSecret: platformOnly }, 'kimi', 'notConfigured'],
    ['deepseek not-configured', { plan: healthyPlan, getSecret: async () => undefined }, 'deepseek', 'notConfigured'],
    ['glm unauthorized (body code 1000)', { plan: { default: { status: 200, body: { code: 1000, success: false } } } }, 'glm', 'authRejected'],
    ['glm unauthorized (http 401)', { plan: { default: { status: 401, body: {} } } }, 'glm', 'authRejected'],
    ['kimi unauthorized (http 401)', { plan: { default: { status: 401, body: {} } } }, 'kimi', 'authRejected'],
    ['deepseek unauthorized (code 40003)', { plan: { [DS_SUMMARY]: { status: 200, body: { code: 40003 } } } }, 'deepseek', 'authRejected'],
    ['glm rate-limited', { plan: { default: { status: 429, body: {} } } }, 'glm', 'rateLimited'],
    ['kimi rate-limited', { plan: { default: { status: 429, body: {} } } }, 'kimi', 'rateLimited'],
    ['kimi invalid-response (html)', { plan: { default: { status: 200, body: '<html>oops</html>', contentType: 'text/html' } } }, 'kimi', 'badResponse'],
    ['kimi unreachable (transport throw)', { plan: {}, getSecret: allSecrets }, 'kimi', 'unreachable'],
    ['deepseek unreachable (transport throw)', { plan: {}, getSecret: allSecrets }, 'deepseek', 'unreachable'],
  ];
  const observed = {};
  for (const [label, options, id, expected] of cases) {
    const rows = await httpRows(options);
    const row = rowFrom(rows, id);
    observed[label] = { status: row.status, key: row.messageKey, message: row.message };
    check(
      `C13.http:${label}`,
      `${label} -> ${expected} (status ${row.status})`,
      row.messageKey === expected,
      `messageKey=${JSON.stringify(row.messageKey)}, message=${JSON.stringify((row.message ?? '').slice(0, 70))}`,
    );
  }

  // --- ok rows carry no key --------------------------------------------------
  const healthy = await httpRows({ plan: healthyPlan });
  check('C13.ok-null', 'ok rows carry messageKey null', healthy.every((row) => row.messageKey === null), JSON.stringify(healthy.map((row) => [row.id, row.messageKey])));

  // --- the genuine "valid key, no subscription" path (GLM code 500 + CN msg) --
  // This is the one branch that is *supposed* to reach `noCodingPlan`; a fix that
  // reorders the phrase test must not break it.
  const noPlanRows = await httpRows({
    plan: { default: { status: 200, body: { code: 500, success: false, msg: '当前用户不存在coding plan' } } },
  });
  const noPlanGlm = rowFrom(noPlanRows, 'glm');
  check('C13.http:glm no-subscription', 'GLM valid key without a plan -> noCodingPlan', noPlanGlm.messageKey === 'noCodingPlan', `status=${noPlanGlm.status}, messageKey=${JSON.stringify(noPlanGlm.messageKey)}, message=${JSON.stringify(noPlanGlm.message)}`);
  const noPlanKimi = rowFrom(noPlanRows, 'kimi');
  check('C13.http:kimi no-subscription-benign', 'the same body for Kimi is not mislabelled as a plan problem', noPlanKimi.messageKey !== 'noCodingPlan', `kimi messageKey=${JSON.stringify(noPlanKimi.messageKey)}`);

  // --- the adapter-throw path, with the REAL GLM label -----------------------
  const { PROVIDERS } = await import('../../src/host/providers/index.js');
  const saved = PROVIDERS.slice();
  PROVIDERS.length = 0;
  PROVIDERS.push({
    id: 'glm',
    label: 'GLM Coding Plan',
    credentialRefs: [],
    async read() {
      throw new Error('qa explosion');
    },
  });
  try {
    const rows = await httpRows({ plan: healthyPlan });
    check('C13.adapter-throw', 'GLM adapter throw -> adapterFailed', rows[0].messageKey === 'adapterFailed', `messageKey=${JSON.stringify(rows[0].messageKey)}, message=${JSON.stringify(rows[0].message.slice(0, 70))}`);
  } finally {
    PROVIDERS.length = 0;
    PROVIDERS.push(...saved);
  }

  // --- the classifier matrix, including the phrase-ordering hazard -----------
  const matrix = [
    ['not-configured', 'Set ZAI_CODING_CN_API_KEY to show the GLM Coding Plan quota.', 'notConfigured'],
    ['unauthorized', 'The GLM Coding Plan credential was rejected; check ZAI_CODING_CN_API_KEY.', 'authRejected'],
    ['not-configured', 'Set KIMI_CODING_API_KEY to show the Kimi Code quota.', 'notConfigured'],
    ['unauthorized', 'The stored credential was rejected by the provider.', 'authRejected'],
    ['rate-limited', 'The provider is rate limiting this account; retry later.', 'rateLimited'],
    ['network-error', 'The read was cancelled.', 'cancelled'],
    ['network-error', 'The provider could not be reached.', 'unreachable'],
    ['invalid-response', 'The provider returned a body that is not valid JSON.', 'badResponse'],
    // The provider-name trap: every one of these mentions GLM's own name.
    ['upstream-error', 'The GLM Coding Plan adapter failed: boom', 'adapterFailed'],
    ['upstream-error', 'The GLM Coding Plan adapter could not complete the upstream read.', 'adapterFailed'],
    ['upstream-error', 'This Zhipu key has no GLM Coding Plan subscription.', 'noCodingPlan'],
    ['upstream-error', 'The GLM quota API reported an error.', 'status.upstream-error'],
    ['upstream-error', 'No upstream host was attempted.', 'noHost'],
  ];
  for (const [status, message, expected] of matrix) {
    const actual = classifyMessage(status, message);
    check(`C13.classify:${expected}`, `classifyMessage(${status}, ${JSON.stringify(message.slice(0, 40))}…) -> ${expected}`, actual === expected, `got ${JSON.stringify(actual)}`);
  }

  // --- the four GLM failure modes must be four DISTINCT keys ------------------
  const glmModes = {
    unset: classifyMessage('not-configured', 'Set ZAI_CODING_CN_API_KEY to show the GLM Coding Plan quota.'),
    rejected: classifyMessage('unauthorized', 'The GLM Coding Plan credential was rejected; check ZAI_CODING_CN_API_KEY.'),
    crashed: classifyMessage('upstream-error', 'The GLM Coding Plan adapter failed: boom'),
    noPlan: classifyMessage('upstream-error', 'This Zhipu key has no GLM Coding Plan subscription.'),
  };
  check('C13.glm-distinct', 'GLM unset / rejected / crashed / no-plan produce four distinct keys', new Set(Object.values(glmModes)).size === 4, JSON.stringify(glmModes));
  check('C13.glm-correct', 'and they are the four correct keys', glmModes.unset === 'notConfigured' && glmModes.rejected === 'authRejected' && glmModes.crashed === 'adapterFailed' && glmModes.noPlan === 'noCodingPlan', JSON.stringify(glmModes));

  const keysSeen = new Set([...Object.values(observed).map((entry) => entry.key), ...healthy.map((row) => row.messageKey), noPlanGlm.messageKey].filter(Boolean));
  console.log(`      keys observed over HTTP: ${[...keysSeen].sort().join(', ')}`);
  console.log('      NOTE: `cancelled` and `noHost` have no HTTP trigger in this build (the fan-out controller only aborts after every adapter has settled); they are covered by the classifyMessage matrix above and by both client dictionaries, not by a live render.');
}

/* ============================================ C14 body cap + memory exhaustion */

async function c14() {
  console.log('\n== C14 512 KiB body cap: truncation, cancellation, memory ==');
  const { fetchJson } = await import('../../src/host/fetch-json.js');

  // (a) an unbounded stream must stop at the cap and be cancelled.
  let pulled = 0;
  let cancelled = false;
  const chunk = new Uint8Array(64 * 1024).fill(65);
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 1000) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  const fakeFetch = async () => new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
  const capped = await fetchJson('https://qa.invalid/huge', { fetchImpl: fakeFetch, maxBodyBytes: 512 * 1024 });
  check('C14.1', 'an unbounded 200 response is cut at the cap', capped.truncated === true && capped.text.length <= 512 * 1024 && capped.text.length > 512 * 1024 - 2 * 64 * 1024, `text=${capped.text.length} bytes, truncated=${capped.truncated}`);
  check('C14.2', 'the reader stopped pulling instead of draining the stream', pulled <= 10, `${pulled} chunk(s) pulled (64 KiB each)`);
  check('C14.3', 'the stream was cancelled (socket released)', cancelled === true, `cancelled=${cancelled}`);
  check('C14.4', 'a truncated JSON body reports BodyTooLargeError, not a bare parse failure', capped.error?.name === 'BodyTooLargeError', `error=${JSON.stringify(capped.error)}`);

  // (b) the same attack through the real undici fetch against a local server.
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    const block = 'x'.repeat(64 * 1024);
    let sent = 0;
    const timer = setInterval(() => {
      if (sent >= 512) {
        clearInterval(timer);
        res.end();
        return;
      }
      sent += 1;
      res.write(block);
    }, 0);
    req.on('close', () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const before = process.memoryUsage().rss;
  const started = Date.now();
  const real = await fetchJson(`http://127.0.0.1:${port}/flood`);
  const elapsed = Date.now() - started;
  const rssDelta = process.memoryUsage().rss - before;
  await new Promise((resolve) => server.close(resolve));
  check('C14.5', 'a real 32 MiB flood body is bounded at the cap', real.truncated === true && real.text.length <= 512 * 1024, `text=${real.text.length}, truncated=${real.truncated}`);
  check('C14.6', 'the flood does not stall the event loop (returns promptly)', elapsed < 5000, `${elapsed} ms`);
  check('C14.7', 'hostile-body memory growth stays far below the flood size', rssDelta < 64 * 1024 * 1024, `RSS delta ${(rssDelta / 1024 / 1024).toFixed(1)} MiB for a 32 MiB flood`);
  check('C14.8', 'the flood body is reported as BodyTooLargeError too', real.error?.name === 'BodyTooLargeError', `error=${JSON.stringify(real.error)}`);

  // (c) a valid JSON body under the cap still parses.
  const small = await fetchJson('https://qa.invalid/small', { fetchImpl: async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }) });
  check('C14.9', 'a normal body under the cap still parses and is not marked truncated', small.ok === true && small.truncated === false && small.json?.ok === 1, `ok=${small.ok} truncated=${small.truncated}`);

  // (c2) a gzip bomb: undici decompresses transparently, so the cap has to
  // apply to the *decompressed* bytes or a 64 KiB body could balloon.
  const zlib = await import('node:zlib');
  const bombServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
    const gzip = zlib.createGzip();
    gzip.pipe(res);
    const block = Buffer.alloc(64 * 1024);
    let written = 0;
    const timer = setInterval(() => {
      if (written >= 1024) {
        clearInterval(timer);
        gzip.end();
        return;
      }
      written += 1;
      gzip.write(block);
    }, 0);
    req.on('close', () => {
      clearInterval(timer);
      gzip.destroy();
    });
  });
  await new Promise((resolve) => bombServer.listen(0, '127.0.0.1', resolve));
  const bombPort = bombServer.address().port;
  const bombBefore = process.memoryUsage().rss;
  const bombStarted = Date.now();
  const bomb = await fetchJson(`http://127.0.0.1:${bombPort}/bomb`);
  const bombElapsed = Date.now() - bombStarted;
  const bombRss = process.memoryUsage().rss - bombBefore;
  await new Promise((resolve) => bombServer.close(resolve));
  check('C14.11', 'a gzip bomb is cut at the decompressed cap', bomb.truncated === true && bomb.text.length <= 512 * 1024, `text=${bomb.text.length}, truncated=${bomb.truncated}`);
  check('C14.12', 'the gzip bomb does not balloon memory or stall', bombRss < 64 * 1024 * 1024 && bombElapsed < 5000, `RSS delta ${(bombRss / 1024 / 1024).toFixed(1)} MiB, ${bombElapsed} ms for a 64 MiB expansion`);

  // (d) an adapter must map the oversized body onto a protocol status, not throw.
  const glmHuge = await direct('glm', {
    plan: {
      default: {
        status: 200,
        body: `{"code":200,"success":true,"data":{"level":"lite","limits":[]},"pad":"${'x'.repeat(600 * 1024)}"}`,
        contentType: 'application/json',
      },
    },
  });
  check('C14.10', 'an over-cap upstream body becomes invalid-response, never a throw or a fake ok row', glmHuge.row.status === 'invalid-response', brief(glmHuge.row));
}

/* ---------------------------------------------------------------------- runner */

const only = process.argv[2];
const sections = { c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14 };
for (const [name, section] of Object.entries(sections)) {
  if (only && only !== name) continue;
  await section();
}
process.exit(finish());
