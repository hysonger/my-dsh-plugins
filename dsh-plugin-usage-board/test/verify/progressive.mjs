/**
 * Progressive per-provider loading verification (task-4, section C).
 *
 * Drives the REAL plugin stack — the real route handlers, the real
 * `SnapshotService`, the real adapters and the real `fetch-json.js` transport —
 * with only the upstream transport replaced by `fakeUpstream`. No source file
 * is edited, no real credential is used, and no real network request leaves the
 * machine: every provider URL is answered by the fake plan, and the harness's
 * own traffic to its stand-in HTTP server passes through to the real fetch.
 *
 * What it proves:
 *
 *   A. Contract, all providers fast: each `GET /api/provider?id=…` returns a
 *      one-row envelope in provider order with a derived `ok`, a fresh answer
 *      omits `stale`/`refreshing`, the aggregate routes and `health.reads`
 *      keep their documented behaviour, and the page boot block carries the
 *      per-provider paths.
 *   B. One provider SLOW (GLM 2 500 ms): the DeepSeek and Kimi endpoints answer
 *      in tens of milliseconds while the GLM read is still pending; the GLM
 *      endpoint and the aggregate snapshot settle only when GLM does.
 *   C. One provider HANGING (GLM CN host never answers): the same decoupling,
 *      with GLM degrading through the real 12 000 ms provider deadline and then
 *      answering from its healthy intl host, and the aggregate snapshot waiting
 *      for it (compatibility behaviour, documented).
 *   D. Per-provider stale-while-revalidate with a controlled clock: an expired
 *      row is served immediately with `stale:true` + `refreshing:true`, the
 *      background refresh is per provider, and a provider that has just been
 *      refreshed answers fresh while a not-yet-refreshed sibling still answers
 *      stale — flags never leak across providers.
 *   E. Forced reads are isolated: `POST /api/provider?id=…` forces only that
 *      provider and touches no other provider's upstream.
 *
 * Run: `node test/verify/progressive.mjs`
 * Exit code 0 = every check passed.
 */

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

const DS_SUMMARY_OK = {
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

/** Every provider host answers a healthy body; `/usage/cost` is prefix-matched. */
function basePlan(url) {
  if (url === DS_SUMMARY) return { body: DS_SUMMARY_OK };
  if (url.startsWith(DS_COST_PREFIX)) return { body: DS_COST_OK };
  if (url === DS_API_BALANCE) return { status: 401, body: {} };
  if (url === GLM_CN || url === GLM_INTL) return { body: GLM_OK };
  if (url === GLM_SUB) return { body: GLM_SUB_OK };
  if (url === KIMI_CN || url === KIMI_INTL) return { body: KIMI_OK };
  return undefined;
}

/**
 * Healthy plan with per-host knobs for the slow / hanging cases.
 * @param {{ glmDelayMs?: number, glmCnHang?: boolean, kimiDelayMs?: number, deepseekDelayMs?: number }} [knobs]
 */
function planWith(knobs = {}) {
  const { glmDelayMs = 0, glmCnHang = false, kimiDelayMs = 0, deepseekDelayMs = 0 } = knobs;
  return (url) => {
    const spec = basePlan(url);
    if (spec === undefined) return undefined;
    if (url === GLM_CN) return glmCnHang ? { hang: true } : { ...spec, delayMs: glmDelayMs };
    if (url === GLM_INTL) return { ...spec, delayMs: glmDelayMs };
    if (url === GLM_SUB) return { ...spec, delayMs: Math.min(glmDelayMs, 300) };
    if (url === KIMI_CN) return { ...spec, delayMs: kimiDelayMs };
    if (url === KIMI_INTL) return { ...spec, delayMs: kimiDelayMs };
    if (url === DS_SUMMARY || url.startsWith(DS_COST_PREFIX)) return { ...spec, delayMs: deepseekDelayMs };
    return spec;
  };
}

/** getSecret resolving all three fake credentials; no real value is used. */
const allSecrets = async (name) =>
  ({
    DEEPSEEK_PLATFORM_TOKEN: 'qa-platform-grant-do-not-log',
    ZAI_CODING_CN_API_KEY: 'qa-glm-key',
    KIMI_CODING_API_KEY: 'qa-kimi-key',
  })[name];

const PROVIDER_IDS = ['deepseek', 'glm', 'kimi'];

/* ------------------------------------------------------------------ utilities */

/** Wall-clock milliseconds around one awaited operation. */
async function timed(fn) {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}

/** Round for display only; checks use the raw number. */
const r = (value) => Math.round(value);

/**
 * Count recorded fake-upstream calls that hit a provider's hosts.
 * @param {{url: string}[]} calls
 * @param {string[]} hosts
 */
function callsTo(calls, hosts) {
  return calls.filter((call) => hosts.some((host) => call.url.startsWith(`https://${host}/`))).length;
}

const DS_HOSTS = ['platform.deepseek.com', 'api.deepseek.com'];
const GLM_HOSTS = ['open.bigmodel.cn', 'api.z.ai'];
const KIMI_HOSTS = ['api.kimi.com', 'api.kimi.ai'];

/** Parse one provider's envelope, returning null instead of throwing. */
function bodyOf(response) {
  return tryJson(response.text);
}

/**
 * Assert the one-row envelope contract every PROVIDER_PATH answer must satisfy.
 * @param {string} id
 * @param {object|null} body
 * @param {number} ttlMs
 * @param {{ stale?: boolean, refreshing?: boolean }} [flags]
 * @returns {object|null} the single provider row, for further checks
 */
function providerEnvelope(id, body, ttlMs, flags = {}) {
  const tag = `envelope(${id})`;
  const row = body?.providers?.[0];
  check(`${tag}.protocolVersion`, `protocolVersion is 1 for ${id}`, body?.protocolVersion === 1, `protocolVersion=${body?.protocolVersion}`);
  check(`${tag}.ttlMs`, `ttlMs is the configured ${ttlMs} for ${id}`, body?.ttlMs === ttlMs, `ttlMs=${body?.ttlMs}`);
  check(`${tag}.oneRow`, `${id} envelope carries exactly one row with that id`, body?.providers?.length === 1 && row?.id === id, `${body?.providers?.length} row(s), ids=${JSON.stringify(body?.providers?.map((entry) => entry?.id))}`);
  if (row) {
    check(`${tag}.okDerived`, `ok is derived from the ${id} row`, body.ok === (row.status === 'ok'), `ok=${body.ok}, status=${row.status}`);
    for (const key of ['id', 'label', 'status', 'message', 'messageKey', 'code', 'plan', 'windows', 'balances', 'account', 'meta', 'fetchedAt', 'latencyMs']) {
      if (!(key in row)) check(`${tag}.field.${key}`, `${id} row carries ${key}`, false, 'missing');
    }
  }
  if (flags.stale === false) {
    check(`${tag}.noStale`, `fresh ${id} answer omits stale`, body !== null && !('stale' in body), `stale=${JSON.stringify(body?.stale)}`);
  }
  if (flags.refreshing === false) {
    check(`${tag}.noRefreshing`, `fresh ${id} answer omits refreshing`, body !== null && !('refreshing' in body), `refreshing=${JSON.stringify(body?.refreshing)}`);
  }
  return row;
}

/** Poll /api/health until `id` stops refreshing (or the deadline passes). */
async function waitSettled(base, id, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    const health = tryJson((await request(`${base}/usage-board/api/health`)).text);
    const entry = health?.providers?.find((provider) => provider.id === id);
    if (entry !== undefined && entry.refreshing === false) {
      return { ms: Date.now() - started, health, entry };
    }
    if (Date.now() - started > timeoutMs) return { ms: Date.now() - started, health, entry };
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/* ============================================================ A. contract, all fast */

async function scenarioContract() {
  console.log('\n== A contract: one-row envelopes, aggregate compatibility, health, boot ==');
  const ttlMs = 60_000;
  const fake = fakeUpstream(planWith());
  const server = await startPluginServer({ getSecret: allSecrets, config: { ttlMs } });
  const base = server.url;
  try {
    await withGlobalFetch(fake.fetchImpl, async () => {
      // --- a cold storm for one provider is deduped into one upstream read ---
      const coldStorm = await Promise.all(
        Array.from({ length: 5 }, () => request(`${base}/usage-board/api/provider?id=deepseek`)),
      );
      check('A0.1', 'five concurrent cold GETs for one provider all answer 200 one-row envelopes', coldStorm.every((response) => response.status === 200 && bodyOf(response)?.providers?.length === 1), coldStorm.map((response) => response.status).join(','));
      const stormBodies = coldStorm.map((response) => bodyOf(response));
      check('A0.2', 'the deduped storm shares one read (all five report the same generatedAt)', new Set(stormBodies.map((body) => body?.generatedAt)).size === 1, JSON.stringify(stormBodies.map((body) => body?.generatedAt)));
      checkEqual('A0.3', 'five concurrent cold GETs cost exactly one provider read', tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads, 1);
      check('A0.4', 'the storm hit one DeepSeek read, not five', callsTo(fake.calls, DS_HOSTS) <= 3, `${callsTo(fake.calls, DS_HOSTS)} upstream DeepSeek call(s) for five concurrent GETs (a naive 5x would be 10+)`);

      // --- cold GET for each provider: one row, order preserved, ok derived ---
      for (const id of PROVIDER_IDS) {
        const response = await request(`${base}/usage-board/api/provider?id=${id}`);
        const body = bodyOf(response);
        check(`A1.${id}.http`, `GET provider?id=${id} -> 200 JSON`, response.status === 200 && body !== null, `HTTP ${response.status}, ${response.text.length} bytes`);
        const row = providerEnvelope(id, body, ttlMs, { stale: false, refreshing: false });
        check(`A1.${id}.status`, `${id} row is ok from the healthy fixture`, row?.status === 'ok', `status=${row?.status}, message=${JSON.stringify((row?.message ?? '').slice(0, 60))}`);
        if (id === 'deepseek') {
          check('A1.deepseek.balance', 'DeepSeek row carries the fixture balance', row?.balances?.[0]?.available === 33.65288794, JSON.stringify(row?.balances));
        }
        if (id === 'glm') {
          check('A1.glm.windows', 'GLM row carries both quota windows', row?.windows?.length === 2, `${row?.windows?.length} window(s)`);
        }
        if (id === 'kimi') {
          check('A1.kimi.windows', 'Kimi row carries both quota windows', row?.windows?.length === 2, `${row?.windows?.length} window(s)`);
        }
      }
      checkEqual('A1.reads.afterThreeCold', 'three cold provider reads cost exactly three provider reads', tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads, 3);

      // --- a fresh second GET is served from cache, no upstream traffic ---
      const beforeCacheHit = fake.calls.length;
      const cacheHit = bodyOf(await request(`${base}/usage-board/api/provider?id=glm`));
      check('A2.1', 'a fresh provider GET is served from cache (zero upstream calls)', fake.calls.length === beforeCacheHit, `${beforeCacheHit} -> ${fake.calls.length} upstream calls`);
      check('A2.2', 'the cached GET still returns the same row', cacheHit?.providers?.[0]?.fetchedAt === undefined || cacheHit?.providers?.[0]?.status === 'ok', `status=${cacheHit?.providers?.[0]?.status}`);

      // --- aggregate GET is composed from the same per-provider caches ---
      const readsBeforeAggregate = tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads;
      const aggregate = bodyOf(await request(`${base}/usage-board/api/snapshot`));
      check('A3.1', 'GET /api/snapshot -> 200 aggregate with every provider', aggregate !== null && aggregate.providers?.length === 3, `${aggregate?.providers?.length} row(s)`);
      checkEqual('A3.2', 'aggregate rows are in deepseek, glm, kimi order', aggregate?.providers?.map((row) => row.id), PROVIDER_IDS);
      check('A3.3', 'aggregate ok is derived from all rows', aggregate?.ok === (aggregate?.providers?.every((row) => row.status === 'ok') ?? false), `ok=${aggregate?.ok}`);
      check('A3.4', 'aggregate GET made no upstream calls while every row was fresh', tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads === readsBeforeAggregate, `reads ${readsBeforeAggregate} -> ${tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads}`);

      // --- aggregate POST /api/refresh forces every provider: +3 reads ---
      const readsBeforeRefresh = tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads;
      const before = aggregate;
      const refreshed = bodyOf(await request(`${base}/usage-board/api/refresh`, { method: 'POST' }));
      const healthAfterRefresh = tryJson((await request(`${base}/usage-board/api/health`)).text);
      check('A4.1', 'POST /api/refresh -> 200 aggregate', refreshed !== null && refreshed.providers?.length === 3, `${refreshed?.providers?.length} row(s)`);
      check('A4.2', 'POST /api/refresh produces a new aggregate generatedAt', refreshed?.generatedAt !== before?.generatedAt, `${before?.generatedAt} -> ${refreshed?.generatedAt}`);
      checkEqual('A4.3', 'one aggregate refresh counts as three provider reads', healthAfterRefresh?.reads, readsBeforeRefresh + 3);
      check('A4.4', 'every provider row is ok after the forced aggregate refresh', refreshed?.providers?.every((row) => row.status === 'ok') === true, JSON.stringify(refreshed?.providers?.map((row) => `${row.id}:${row.status}`)));

      // --- health additive fields ---
      const health = tryJson((await request(`${base}/usage-board/api/health`)).text);
      check('A5.1', 'health keeps its old fields', health?.ok === true && typeof health?.version === 'string' && health?.protocolVersion === 1 && typeof health?.ttlMs === 'number' && typeof health?.reads === 'number' && typeof health?.backgroundReads === 'number' && typeof health?.fresh === 'boolean', JSON.stringify({ ok: health?.ok, version: health?.version, protocolVersion: health?.protocolVersion, ttlMs: health?.ttlMs, reads: health?.reads, backgroundReads: health?.backgroundReads, fresh: health?.fresh }));
      checkEqual('A5.2', 'health.providers lists all three in order', health?.providers?.map((entry) => entry.id), PROVIDER_IDS);
      check('A5.3', 'every health.providers entry carries {id,status,fetchedAt,expiresAt,refreshing}', (health?.providers ?? []).every((entry) => ['id', 'status', 'fetchedAt', 'expiresAt', 'refreshing'].every((key) => key in entry)), JSON.stringify(health?.providers));
      check('A5.4', 'every provider is fresh with a numeric fetchedAt/expiresAt after a full refresh', (health?.providers ?? []).every((entry) => entry.status === 'fresh' && typeof entry.fetchedAt === 'number' && typeof entry.expiresAt === 'number' && entry.refreshing === false), JSON.stringify(health?.providers));
      check('A5.5', 'health.fresh is true when every row is fresh', health?.fresh === true, `fresh=${health?.fresh}`);

      // --- POST /api/provider forces only that one provider -----------------
      const beforeForcedReads = tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads;
      const deepseekCallsBefore = callsTo(fake.calls, DS_HOSTS);
      const glmCallsBefore = callsTo(fake.calls, GLM_HOSTS);
      const kimiCallsBefore = callsTo(fake.calls, KIMI_HOSTS);
      const forced = bodyOf(await request(`${base}/usage-board/api/provider?id=glm`, { method: 'POST' }));
      const afterForcedReads = tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads;
      providerEnvelope('glm', forced, ttlMs, { stale: false, refreshing: false });
      check('A6.1', 'POST provider?id=glm forces a fresh GLM read (+1 provider read)', afterForcedReads === beforeForcedReads + 1, `reads ${beforeForcedReads} -> ${afterForcedReads}`);
      check('A6.2', 'POST provider?id=glm did not touch DeepSeek upstream', callsTo(fake.calls, DS_HOSTS) === deepseekCallsBefore, `deepseek calls ${deepseekCallsBefore} -> ${callsTo(fake.calls, DS_HOSTS)}`);
      check('A6.3', 'POST provider?id=glm did not touch Kimi upstream', callsTo(fake.calls, KIMI_HOSTS) === kimiCallsBefore, `kimi calls ${kimiCallsBefore} -> ${callsTo(fake.calls, KIMI_HOSTS)}`);
      check('A6.4', 'POST provider?id=glm did reach GLM upstream', callsTo(fake.calls, GLM_HOSTS) > glmCallsBefore, `glm calls ${glmCallsBefore} -> ${callsTo(fake.calls, GLM_HOSTS)}`);

      // --- error / method / HEAD contract -----------------------------------
      const missing = await request(`${base}/usage-board/api/provider`);
      const missingBody = bodyOf(missing);
      check('A7.1', 'missing id -> 400 {ok:false,error.code:unknown-provider}', missing.status === 400 && missingBody?.ok === false && missingBody?.error?.code === 'unknown-provider', `HTTP ${missing.status} ${missing.text.slice(0, 120)}`);
      const unknown = await request(`${base}/usage-board/api/provider?id=solar`);
      check('A7.2', 'unknown id -> 400 unknown-provider', unknown.status === 400 && bodyOf(unknown)?.error?.code === 'unknown-provider', `HTTP ${unknown.status} ${unknown.text.slice(0, 120)}`);
      for (const method of ['PUT', 'DELETE', 'PATCH']) {
        const response = await request(`${base}/usage-board/api/provider?id=glm`, { method });
        check(`A7.3.${method}`, `${method} provider -> 405 with Allow: GET, HEAD, POST`, response.status === 405 && response.headers.allow === 'GET, HEAD, POST', `HTTP ${response.status}, allow=${response.headers.allow}`);
      }
      const head = await request(`${base}/usage-board/api/provider?id=deepseek`, { method: 'HEAD' });
      check('A7.4', 'HEAD provider?id=deepseek -> 200 with no body and a content-length', head.status === 200 && head.text === '' && head.headers['content-length'] !== undefined, `HTTP ${head.status}, body ${head.text.length} bytes, len=${head.headers['content-length']}`);
      const aggregateWrongMethod = await request(`${base}/usage-board/api/snapshot`, { method: 'DELETE' });
      check('A7.5', 'aggregate /api/snapshot still refuses DELETE with 405', aggregateWrongMethod.status === 405, `HTTP ${aggregateWrongMethod.status}, allow=${aggregateWrongMethod.headers.allow}`);

      // --- standalone page boot injection -----------------------------------
      const page = await request(`${base}/usage-board/`);
      const match = /window\.__USAGE_BOARD__=(\{.*?\});<\/script>/.exec(page.text);
      let boot = null;
      try {
        boot = match === null ? null : JSON.parse(match[1]);
      } catch {
        boot = null;
      }
      check('A8.1', 'the standalone page answers 200 with an injected boot object', page.status === 200 && boot !== null, `HTTP ${page.status}, boot=${JSON.stringify(boot)?.slice(0, 160)}`);
      check('A8.2', 'boot carries providerPath + providerQueryParam + providerIds', boot?.providerPath === '/usage-board/api/provider' && boot?.providerQueryParam === 'id' && JSON.stringify(boot?.providerIds) === JSON.stringify(PROVIDER_IDS), JSON.stringify({ providerPath: boot?.providerPath, providerQueryParam: boot?.providerQueryParam, providerIds: boot?.providerIds }));
      check('A8.3', 'boot still carries the old snapshotPath + refreshPath', boot?.snapshotPath === '/usage-board/api/snapshot' && boot?.refreshPath === '/usage-board/api/refresh', JSON.stringify({ snapshotPath: boot?.snapshotPath, refreshPath: boot?.refreshPath }));
    });
  } finally {
    await server.close();
  }
}

/* =================================================== B. one provider is slow */

async function scenarioSlow() {
  console.log('\n== B decoupling: GLM delayed 2 500 ms, DeepSeek + Kimi fast ==');
  const GLM_DELAY_MS = 2500;
  const fake = fakeUpstream(planWith({ glmDelayMs: GLM_DELAY_MS }));
  const server = await startPluginServer({ getSecret: allSecrets, config: { ttlMs: 60_000 } });
  const base = server.url;
  const timings = {};
  try {
    await withGlobalFetch(fake.fetchImpl, async () => {
      let glmSettled = false;
      let aggregateSettled = false;
      // Cold cache. Fire the slow provider FIRST so a fast answer cannot be
      // explained by an already-warm cache: DeepSeek/Kimi each start their own
      // read after GLM's is already in flight.
      const glmPromise = timed(() => request(`${base}/usage-board/api/provider?id=glm`));
      glmPromise.then(() => {
        glmSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const aggregatePromise = timed(() => request(`${base}/usage-board/api/snapshot`));
      aggregatePromise.then(() => {
        aggregateSettled = true;
      });
      const deepseekStart = performance.now();
      const deepseekPromise = request(`${base}/usage-board/api/provider?id=deepseek`);
      const kimiStart = performance.now();
      const kimiPromise = request(`${base}/usage-board/api/provider?id=kimi`);
      const deepseekResponse = await deepseekPromise;
      const deepseekMs = performance.now() - deepseekStart;
      const kimiResponse = await kimiPromise;
      const kimiMs = performance.now() - kimiStart;
      timings.deepseekMs = deepseekMs;
      timings.kimiMs = kimiMs;
      const slowStillPending = glmSettled === false;
      const aggregateStillPending = aggregateSettled === false;
      const healthWhilePending = tryJson((await request(`${base}/usage-board/api/health`)).text);
      const glmStateWhilePending = healthWhilePending?.providers?.find((entry) => entry.id === 'glm');

      check('B1.1', 'GET provider?id=deepseek answers while the 2 500 ms GLM read is pending', deepseekResponse.status === 200, `HTTP ${deepseekResponse.status} after ${r(deepseekMs)} ms`);
      check('B1.2', 'GET provider?id=kimi answers while the GLM read is pending', kimiResponse.status === 200, `HTTP ${kimiResponse.status} after ${r(kimiMs)} ms`);
      check('B1.3', 'the DeepSeek answer is not delayed by GLM (well under the 2 500 ms delay)', deepseekMs < 1000, `${r(deepseekMs)} ms vs GLM delay ${GLM_DELAY_MS} ms`);
      check('B1.4', 'the Kimi answer is not delayed by GLM (well under the 2 500 ms delay)', kimiMs < 1000, `${r(kimiMs)} ms vs GLM delay ${GLM_DELAY_MS} ms`);
      check('B1.5', 'the GLM read really was still in flight when they answered', slowStillPending, `glmSettled=${glmSettled}`);
      check('B1.6', 'the aggregate snapshot was also still waiting for GLM', aggregateStillPending, `aggregateSettled=${aggregateSettled}`);
      check('B1.7', 'health reports glm refreshing:true/status:missing while the others are already fresh', glmStateWhilePending?.refreshing === true && glmStateWhilePending?.status === 'missing', JSON.stringify(glmStateWhilePending));
      check('B1.8', 'health shows DeepSeek and Kimi fresh while GLM is still missing', ['deepseek', 'kimi'].every((id) => healthWhilePending?.providers?.find((entry) => entry.id === id)?.status === 'fresh'), JSON.stringify(healthWhilePending?.providers?.map((entry) => `${entry.id}:${entry.status}`)));
      providerEnvelope('deepseek', bodyOf(deepseekResponse), 60_000, { stale: false, refreshing: false });
      providerEnvelope('kimi', bodyOf(kimiResponse), 60_000, { stale: false, refreshing: false });

      const glm = await glmPromise;
      const aggregate = await aggregatePromise;
      timings.glmMs = glm.ms;
      timings.aggregateMs = aggregate.ms;
      const glmBody = bodyOf(glm.value);
      const glmRow = providerEnvelope('glm', glmBody, 60_000, { stale: false, refreshing: false });
      check('B2.1', 'the slow GLM endpoint eventually answers a valid ok row', glm.value.status === 200 && glmRow?.status === 'ok', `HTTP ${glm.value.status} after ${r(glm.ms)} ms, status=${glmRow?.status}`);
      check('B2.2', 'the GLM answer took at least the fake delay, so it really waited', glm.ms >= GLM_DELAY_MS - 100, `${r(glm.ms)} ms >= ${GLM_DELAY_MS} ms`);
      const aggregateBody = bodyOf(aggregate.value);
      check('B2.3', 'the aggregate GET waits for the slow provider (documented compatibility behaviour)', aggregate.ms >= GLM_DELAY_MS - 100, `${r(aggregate.ms)} ms`);
      check('B2.4', 'the aggregate body has all three rows once it settles', JSON.stringify(aggregateBody?.providers?.map((row) => row.id)) === JSON.stringify(PROVIDER_IDS), JSON.stringify(aggregateBody?.providers?.map((row) => `${row.id}:${row.status}`)));
      check('B2.5', 'the aggregate left no header flags set on this all-fresh response', aggregateBody?.stale === undefined && aggregateBody?.refreshing === undefined, JSON.stringify({ stale: aggregateBody?.stale, refreshing: aggregateBody?.refreshing }));
      const totalReads = tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads;
      check('B2.6', 'the interleaved reads still cost one provider read each (no duplicated upstream work)', totalReads === 3, `reads=${totalReads}`);
      check('B2.7', 'with every row settled the board is fully fresh', tryJson((await request(`${base}/usage-board/api/health`)).text)?.fresh === true, 'fresh=true');
    });
  } finally {
    await server.close();
  }
  console.log(`      timings: deepseek=${r(timings.deepseekMs)}ms kimi=${r(timings.kimiMs)}ms glm=${r(timings.glmMs)}ms aggregate=${r(timings.aggregateMs)}ms`);
  check('B3.summary', 'fast providers answered in tens/hundreds of ms while GLM took ~2.5 s', timings.deepseekMs < 1000 && timings.kimiMs < 1000 && timings.glmMs >= 2400, JSON.stringify({ deepseekMs: r(timings.deepseekMs), kimiMs: r(timings.kimiMs), glmMs: r(timings.glmMs) }));
  return timings;
}

/* ================================================ C. one provider is hanging */

async function scenarioHanging() {
  console.log('\n== C hanging provider: GLM CN host never answers, intl host healthy ==');
  const fake = fakeUpstream(planWith({ glmCnHang: true }));
  const server = await startPluginServer({ getSecret: allSecrets, config: { ttlMs: 60_000 } });
  const base = server.url;
  const timings = {};
  try {
    await withGlobalFetch(fake.fetchImpl, async () => {
      let glmSettled = false;
      const glmPromise = timed(() => request(`${base}/usage-board/api/provider?id=glm`));
      glmPromise.then(() => {
        glmSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const deepseekStart = performance.now();
      const deepseekResponse = await request(`${base}/usage-board/api/provider?id=deepseek`);
      const deepseekMs = performance.now() - deepseekStart;
      const kimiStart = performance.now();
      const kimiResponse = await request(`${base}/usage-board/api/provider?id=kimi`);
      const kimiMs = performance.now() - kimiStart;
      timings.deepseekMs = deepseekMs;
      timings.kimiMs = kimiMs;
      check('C1.1', 'DeepSeek answers while the GLM read is HUNG', deepseekResponse.status === 200 && glmSettled === false, `HTTP ${deepseekResponse.status} after ${r(deepseekMs)} ms; glmSettled=${glmSettled}`);
      check('C1.2', 'Kimi answers while the GLM read is HUNG', kimiResponse.status === 200 && glmSettled === false, `HTTP ${kimiResponse.status} after ${r(kimiMs)} ms; glmSettled=${glmSettled}`);
      check('C1.3', 'the hung provider does not delay the fast ones (< 1 s)', deepseekMs < 1000 && kimiMs < 1000, `deepseek=${r(deepseekMs)} ms, kimi=${r(kimiMs)} ms`);

      // Now let the real 12 s provider deadline fire.
      const glm = await glmPromise;
      timings.glmMs = glm.ms;
      const glmBody = bodyOf(glm.value);
      const glmRow = providerEnvelope('glm', glmBody, 60_000, { stale: false, refreshing: false });
      check('C2.1', 'GLM degrades through its real deadline and then answers from its healthy intl host', glm.value.status === 200 && glmRow?.status === 'ok' && glmRow?.meta?.host === 'api.z.ai', `after ${r(glm.ms)} ms: status=${glmRow?.status}, host=${glmRow?.meta?.host}, attempted=${JSON.stringify(glmRow?.meta?.attemptedHosts)}`);
      check('C2.2', 'the hang was actually aborted by the 12 000 ms provider deadline', fake.state.aborted >= 1, `${fake.state.aborted} abort(s) seen by the fake transport`);
      check('C2.3', 'the GLM read settled at the 12 s deadline (not instantly, not never)', glm.ms >= 11_500 && glm.ms < 14_000, `${r(glm.ms)} ms`);
      const reads = tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads;
      check('C2.4', 'the hang cost exactly one provider read (timeout is not retried into a second read)', reads === 3, `reads=${reads}`);
    });
  } finally {
    await server.close();
  }
  console.log(`      timings: deepseek=${r(timings.deepseekMs)}ms kimi=${r(timings.kimiMs)}ms glm(deadline+intl)=${r(timings.glmMs)}ms`);
  return timings;
}

/* ================================= D. per-provider stale-while-revalidate */

async function scenarioStale() {
  console.log('\n== D per-provider stale-while-revalidate with a controlled clock ==');
  // A real clock would need a 15 s sleep to expire the cache. The service's own
  // documented `now` injection seam lets the harness advance time instead.
  let fakeNow = Date.now();
  const ttlMs = 15_000;
  // A 500 ms upstream gives the harness a window to observe a background
  // refresh as `refreshing:true` in /api/health; serving the stale row stays
  // immediate because it never waits for that refresh.
  const fake = fakeUpstream(planWith({ deepseekDelayMs: 500, glmDelayMs: 500, kimiDelayMs: 500 }));
  const server = await startPluginServer({
    getSecret: allSecrets,
    config: { ttlMs },
    snapshotOptions: { now: () => fakeNow },
  });
  const base = server.url;
  try {
    await withGlobalFetch(fake.fetchImpl, async () => {
      // Warm all three rows with a single aggregate read.
      const warm = bodyOf(await request(`${base}/usage-board/api/snapshot`));
      const warmRows = new Map((warm?.providers ?? []).map((row) => [row.id, row]));
      check('D1.1', 'warm-up aggregate read cached three ok rows', warm?.providers?.length === 3 && warm.providers.every((row) => row.status === 'ok'), JSON.stringify(warm?.providers?.map((row) => row.id)));
      const warmReads = tryJson((await request(`${base}/usage-board/api/health`)).text)?.reads;
      const warmHealth = tryJson((await request(`${base}/usage-board/api/health`)).text);
      check('D1.2', 'all three provider caches report fresh', warmHealth?.providers?.every((entry) => entry.status === 'fresh'), JSON.stringify(warmHealth?.providers?.map((entry) => `${entry.id}:${entry.status}`)));

      // Advance past the ttl: every row is now expired but still on disk.
      fakeNow += ttlMs + 1_000;

      // First serving read for glm: stale answer at once + background refresh.
      const staleStart = performance.now();
      const staleResponse = await request(`${base}/usage-board/api/provider?id=glm`);
      const staleMs = performance.now() - staleStart;
      const staleBody = bodyOf(staleResponse);
      const staleRow = providerEnvelope('glm', staleBody, ttlMs);
      check('D2.1', 'an expired GLM row is served at once, not waited for', staleMs < 150, `${r(staleMs)} ms`);
      check('D2.2', 'the stale response carries stale:true', staleBody?.stale === true, `stale=${JSON.stringify(staleBody?.stale)}`);
      check('D2.3', 'the stale response carries refreshing:true while the host refreshes behind it', staleBody?.refreshing === true, `refreshing=${JSON.stringify(staleBody?.refreshing)}`);
      check('D2.4', 'the stale response still carries the cached numbers', JSON.stringify(staleRow?.windows) === JSON.stringify(warmRows.get('glm')?.windows), `windows unchanged=${JSON.stringify(staleRow?.windows) === JSON.stringify(warmRows.get('glm')?.windows)}`);

      const glmSettle = await waitSettled(base, 'glm');
      check('D2.5', 'GLM\'s own background refresh settles and the provider turns fresh', glmSettle.entry?.status === 'fresh' && glmSettle.entry?.refreshing === false, `after ${glmSettle.ms} ms: ${JSON.stringify(glmSettle.entry)}`);

      // GLM was refreshed at the advanced clock, so its new row expires a full
      // ttl after DeepSeek/Kimi's original rows. At the current fake instant
      // DeepSeek/Kimi are still expired while GLM is fresh: refresh ONLY
      // DeepSeek and observe that the sibling GLM row is served fresh.
      const deepseekStaleStart = performance.now();
      const deepseekStaleResponse = await request(`${base}/usage-board/api/provider?id=deepseek`);
      const deepseekStaleMs = performance.now() - deepseekStaleStart;
      const deepseekStaleBody = bodyOf(deepseekStaleResponse);
      check('D3.1', 'a second expired provider (DeepSeek) is also served at once', deepseekStaleMs < 150, `${r(deepseekStaleMs)} ms`);
      check('D3.2', 'DeepSeek stale answer carries stale:true + refreshing:true', deepseekStaleBody?.stale === true && deepseekStaleBody?.refreshing === true, JSON.stringify({ stale: deepseekStaleBody?.stale, refreshing: deepseekStaleBody?.refreshing }));

      const glmFreshResponse = await request(`${base}/usage-board/api/provider?id=glm`);
      const glmFreshBody = bodyOf(glmFreshResponse);
      check('D3.3', 'the already-refreshed GLM sibling answers fresh (no stale flag) while DeepSeek is stale', glmFreshBody?.providers?.[0]?.status === 'ok' && glmFreshBody?.stale === undefined && glmFreshBody?.refreshing === undefined, JSON.stringify({ stale: glmFreshBody?.stale, refreshing: glmFreshBody?.refreshing, status: glmFreshBody?.providers?.[0]?.status }));
      const midHealth = tryJson((await request(`${base}/usage-board/api/health`)).text);
      const state = (id) => midHealth?.providers?.find((entry) => entry.id === id);
      check('D3.4', 'health shows the stale provider refreshing and its siblings not', state('deepseek')?.status === 'stale' && state('deepseek')?.refreshing === true, `deepseek=${JSON.stringify(state('deepseek'))}`);
      check('D3.5', 'GLM is fresh and refreshing:false while DeepSeek is still stale', state('glm')?.status === 'fresh' && state('glm')?.refreshing === false, `glm=${JSON.stringify(state('glm'))}`);
      check('D3.6', 'Kimi is stale but NOT refreshing (nobody asked it to refresh, and its flags are its own)', state('kimi')?.status === 'stale' && state('kimi')?.refreshing === false, `kimi=${JSON.stringify(state('kimi'))}`);

      const deepseekSettle = await waitSettled(base, 'deepseek');
      check('D3.7', 'DeepSeek\'s background refresh settles on its own', deepseekSettle.entry?.status === 'fresh', `after ${deepseekSettle.ms} ms: ${JSON.stringify(deepseekSettle.entry)}`);
      const deepseekFresh = bodyOf(await request(`${base}/usage-board/api/provider?id=deepseek`));
      check('D3.8', 'the follow-up read finds a fresh number without another upstream wait', deepseekFresh?.stale === undefined && deepseekFresh?.providers?.[0]?.status === 'ok', JSON.stringify({ stale: deepseekFresh?.stale, status: deepseekFresh?.providers?.[0]?.status }));

      // The aggregate keeps its stale/refreshing flags when any row is stale.
      fakeNow += ttlMs + 1_000;
      const aggregateStale = bodyOf(await request(`${base}/usage-board/api/snapshot`));
      check('D4.1', 'the aggregate GET reports stale:true when every row has expired', aggregateStale?.stale === true, `stale=${JSON.stringify(aggregateStale?.stale)}, refreshing=${JSON.stringify(aggregateStale?.refreshing)}`);
      check('D4.2', 'the aggregate still returns all three cached rows (never blanks the board)', aggregateStale?.providers?.length === 3, `${aggregateStale?.providers?.length} row(s)`);
      await Promise.all([waitSettled(base, 'deepseek'), waitSettled(base, 'glm'), waitSettled(base, 'kimi')]);
    });
  } finally {
    await server.close();
  }
  console.log('      per-provider stale flags verified without sleeping a real ttl (injected clock).');
}

/* ============================================================ runner */

await scenarioContract();
await scenarioSlow();
await scenarioHanging();
await scenarioStale();
process.exit(finish());
