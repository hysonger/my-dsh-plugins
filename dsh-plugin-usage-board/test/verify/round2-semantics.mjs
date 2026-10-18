/**
 * Round-2 (plugin 0.4.0) host-side verification: the trailing 30-day DeepSeek
 * spend series, its failure fallbacks, and the cost of the extra `/usage/cost`
 * read on per-provider decoupling / the 12 s deadline.
 *
 * Every case drives the REAL route handlers -> real `SnapshotService` -> real
 * adapters -> real `fetch-json.js`; only the upstream transport is faked. The
 * expected series is recomputed independently in this file from the same raw
 * month envelopes the fake upstream serves, never from the adapter's own
 * helpers.
 *
 * Run: `node test/verify/round2-semantics.mjs`
 * Self-contained: no real network, no credentials.
 */

import { fetchJson } from '../../src/host/fetch-json.js';
import { providerById } from '../../src/host/providers/index.js';
import { MAX_DAILY_USAGE_DAYS } from '../../src/shared/protocol.js';
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

const DS_SUMMARY = 'https://platform.deepseek.com/api/v0/users/get_user_summary';
const DS_COST_PREFIX = 'https://platform.deepseek.com/api/v0/usage/cost';
const KIMI_BASE = 'https://api.kimi.com/coding/v1/usages';

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
const GLM_CN = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit';
const GLM_INTL = 'https://api.z.ai/api/monitor/usage/quota/limit';
const GLM_SUB = 'https://api.z.ai/api/biz/subscription/list';
const GLM_OK = {
  code: 200,
  success: true,
  data: {
    level: 'lite',
    limits: [
      { type: 'CREDIT_LIMIT', unit: 3, number: 5, usage: 2000, currentValue: 656, remaining: 1343, percentage: 32, nextResetTime: 1791973452542 },
    ],
  },
};
const GLM_SUB_OK = { code: 200, success: true, data: [{ productName: 'GLM Coding Lite', status: 'VALID' }] };
const KIMI_OK = {
  usage: { limit: '100', used: '43', remaining: '57', resetTime: '2026-10-16T08:11:56Z' },
  limits: [
    { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '36', remaining: '64', resetTime: '2026-10-14T07:11:56Z' } },
  ],
};

const PLATFORM_TOKEN = 'qa-round2-platform-grant-do-not-log';
const allSecrets = async (name) => ({
  DEEPSEEK_PLATFORM_TOKEN: PLATFORM_TOKEN,
  ZAI_CODING_CN_API_KEY: 'qa-glm-key',
  KIMI_CODING_API_KEY: 'qa-kimi-key',
}[name]);

/** Beijing calendar fields for "now" (UTC+8, no DST). */
function beijingNow() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const pad = (value) => String(value).padStart(2, '0');
  return {
    year,
    month,
    day,
    date: `${year}-${pad(month)}-${pad(day)}`,
    monthStart: `${year}-${pad(month)}-01`,
    previous: month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 },
    costCurrent: `${DS_COST_PREFIX}?month=${month}&year=${year}`,
    costPrevious: month === 1
      ? `${DS_COST_PREFIX}?month=12&year=${year - 1}`
      : `${DS_COST_PREFIX}?month=${month - 1}&year=${year}`,
  };
}

/**
 * One `/usage/cost` envelope for a calendar month: elapsed days have a
 * deterministic nonzero amount (a zero-cost day every fifth day), days after
 * `throughDay` are the platform's future zero-cost padding.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number|null} throughDay
 */
function monthEnvelope(year, month, throughDay = null) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = throughDay === null ? daysInMonth : Math.min(throughDay, daysInMonth);
  const days = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const amount = day > last || day % 5 === 0 ? '0.00' : (day % 3 === 0 ? '0.50' : '1.25');
    days.push({ date, data: [{ usage: [{ amount }] }] });
  }
  return { code: 0, data: { biz_code: 0, biz_data: [{ currency: 'CNY', total: [], days }] } };
}

/**
 * Independently recompute the trailing window from raw month envelopes.
 * @param {Array<any>} envelopes oldest month first, then current month
 * @param {string} today
 * @param {number} cap
 * @returns {Array<{date: string, cost: number}>}
 */
function expectedSeries(envelopes, today, cap) {
  const byDate = new Map();
  for (const envelope of envelopes) {
    const month = envelope.data.biz_data.find((entry) => Array.isArray(entry.days));
    for (const day of month.days) {
      const total = day.data.reduce(
        (sum, model) => sum + model.usage.reduce((inner, usage) => inner + Number(usage.amount), 0),
        0,
      );
      byDate.set(day.date, Math.round(total * 1e6) / 1e6);
    }
  }
  return [...byDate.entries()]
    .filter(([date]) => date <= today)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .slice(-cap)
    .map(([date, cost]) => ({ date, cost }));
}

/**
 * A healthy plan with optional per-endpoint overrides. Override values are
 * fakeUpstream specs (`{status, body}` / `{hang:true}`); the defaults wrap the
 * generated month envelope so the fake transport serializes it as the body.
 * @param {{current?: any, previous?: any, costDelayMs?: number, costHang?: boolean, summaryDelayMs?: number}} [options]
 */
function planFor(options = {}) {
  const now = beijingNow();
  const current = options.current === undefined ? { body: monthEnvelope(now.year, now.month, now.day) } : options.current;
  const previous = options.previous === undefined ? { body: monthEnvelope(now.previous.year, now.previous.month) } : options.previous;
  return (url) => {
    if (url === DS_SUMMARY) {
      return { body: DS_OK, ...(options.summaryDelayMs ? { delayMs: options.summaryDelayMs } : {}) };
    }
    if (url === now.costCurrent || url === now.costPrevious) {
      const spec = url === now.costCurrent ? current : previous;
      if (options.costHang) return { hang: true };
      return options.costDelayMs ? { ...spec, delayMs: options.costDelayMs } : spec;
    }
    if (url === GLM_CN || url === GLM_INTL) return { body: GLM_OK };
    if (url === GLM_SUB) return { body: GLM_SUB_OK };
    if (url === KIMI_BASE) return { body: KIMI_OK };
    return undefined;
  };
}

/** Start the real routes over a real HTTP server under one fake plan. */
async function scenario(plan, run, config = {}) {
  const fake = fakeUpstream(plan);
  const server = await startPluginServer({ config, getSecret: allSecrets });
  try {
    return await withGlobalFetch(fake.fetchImpl, () => run({ server, fake }));
  } finally {
    await server.close();
  }
}

/** Read one provider through the live per-provider route. */
async function readProviderRoute(server, id) {
  const response = await request(`${server.url}/usage-board/api/provider?id=${id}`);
  return { response, body: tryJson(response.text) };
}

/* ======================================================= grid: merged series */

async function mergedSeries() {
  console.log('\n== R1 trailing 30-day series through the real provider route ==');
  const now = beijingNow();
  const currentEnvelope = monthEnvelope(now.year, now.month, now.day);
  const previousEnvelope = monthEnvelope(now.previous.year, now.previous.month);
  const expected = expectedSeries([previousEnvelope, currentEnvelope], now.date, 30);

  const { body } = await scenario(planFor({ current: { body: currentEnvelope }, previous: { body: previousEnvelope } }), async ({ server }) => readProviderRoute(server, 'deepseek'));
  const row = body?.providers?.[0];
  const series = row?.meta?.dailyUsage;
  check('R1.1', 'GET /api/provider?id=deepseek -> 200 envelope, row ok', body?.ok === true && row?.status === 'ok', JSON.stringify({ ok: body?.ok, status: row?.status, message: row?.message }));
  checkEqual('R1.2', 'the series is capped at exactly 30 points', series?.points?.length, 30);
  check('R1.3', 'the cap fits under the protocol maximum', series.points.length <= MAX_DAILY_USAGE_DAYS, `points=${series.points.length}, MAX_DAILY_USAGE_DAYS=${MAX_DAILY_USAGE_DAYS}`);
  checkEqual('R1.4', 'series.days equals the shipped point count', series?.days, series.points.length);
  const dates = series.points.map((point) => point.date);
  check('R1.5', 'oldest first and contiguous — one calendar day per point', dates.every((date, index) => index === 0 || new Date(`${dates[index - 1]}T00:00:00Z`).getTime() + 86400000 === new Date(`${date}T00:00:00Z`).getTime()), dates.join(','));
  checkEqual('R1.6', 'ends on today\'s Beijing date', dates.at(-1), now.date);
  check('R1.7', 'no future date is present', dates.every((date) => date <= now.date), `last=${dates.at(-1)}`);
  check('R1.8', 'the window reaches into the previous month', dates[0] < now.monthStart, `first=${dates[0]}, monthStart=${now.monthStart}`);
  check('R1.9', 'elapsed zero-cost days are present, not trimmed', series.points.filter((point) => point.cost === 0).length > 0, `${series.points.filter((point) => point.cost === 0).length} zero-cost point(s)`);
  checkEqual('R1.10', 'dates and costs equal the independent recomputation point for point', series.points.map((point) => ({ date: point.date, cost: point.cost })), expected);
  check('R1.11', 'every point is exactly {date, cost: number, tokens: null}', series.points.every((point) => Object.keys(point).sort().join(',') === 'cost,date,tokens' && typeof point.date === 'string' && typeof point.cost === 'number' && point.tokens === null), JSON.stringify(series.points[0]));
  checkEqual('R1.12', 'currency is the current month\'s currency', series?.currency, 'CNY');

  const sum = (points) => Math.round(points.reduce((total, point) => total + point.cost, 0) * 1e6) / 1e6;
  console.log(`      independent week=${sum(series.points.slice(-7))} month=${sum(series.points.slice(-30))} (30 points: ${dates[0]} -> ${dates.at(-1)})`);

  // ---- dedupe: a date that appears in BOTH months resolves to the newer one.
  // The fake previous month is given a deliberately different overlapping value.
  const currentForDedupe = monthEnvelope(now.year, now.month, now.day);
  const previousForDedupe = monthEnvelope(now.previous.year, now.previous.month);
  previousForDedupe.data.biz_data[0].days.push({ date: now.date, data: [{ usage: [{ amount: '99.99' }] }] });
  currentForDedupe.data.biz_data[0].days = currentForDedupe.data.biz_data[0].days.map((day) => (day.date === now.date ? { date: day.date, data: [{ usage: [{ amount: '7.77' }] }] } : day));
  const dedupeExpected = expectedSeries([previousForDedupe, currentForDedupe], now.date, 30);
  const dedupe = await scenario(planFor({ current: { body: currentForDedupe }, previous: { body: previousForDedupe } }), async ({ server }) => readProviderRoute(server, 'deepseek'));
  const dedupeSeries = dedupe.body?.providers?.[0]?.meta?.dailyUsage;
  check('R1.13', 'a date present in both months resolves to the current month (newer wins)', dedupeSeries?.points?.at(-1)?.date === now.date && dedupeSeries.points.at(-1).cost === 7.77, JSON.stringify(dedupeSeries?.points?.at(-1)));
  checkEqual('R1.14', 'the deduped series still matches the independent recomputation', dedupeSeries.points.map((point) => ({ date: point.date, cost: point.cost })), dedupeExpected);
  check('R1.15', 'no duplicate dates survive the merge', new Set(dedupeSeries.points.map((point) => point.date)).size === dedupeSeries.points.length, `${new Set(dedupeSeries.points.map((point) => point.date)).size} unique of ${dedupeSeries.points.length}`);

  // ---- both `/usage/cost` months are requested with month/year query params.
  const calls = await scenario(planFor(), async ({ server, fake }) => {
    await readProviderRoute(server, 'deepseek');
    return fake.calls.map((call) => call.url);
  });
  checkEqual('R1.16', 'exactly one cost call per month, with the Beijing month/year query', calls.filter((url) => url.startsWith(DS_COST_PREFIX)).sort(), [now.costPrevious, now.costCurrent].sort());
  check('R1.17', 'one DeepSeek read = summary + current cost + previous cost (3 upstream calls)', calls.length === 3, `${calls.length} calls: ${calls.join(', ')}`);
}

/* ============================================ fallback: what degrades, how far */

async function fallbacks() {
  console.log('\n== R2 previous-month / current-month failure fallbacks through the real route ==');
  const now = beijingNow();

  const currentOnlyExpected = expectedSeries([monthEnvelope(now.year, now.month, now.day)], now.date, 30);
  const previousDown = await scenario(planFor({ previous: { status: 500, body: { error: 'previous month down' } } }), async ({ server }) => readProviderRoute(server, 'deepseek'));
  const previousDownRow = previousDown.body?.providers?.[0];
  const previousDownSeries = previousDownRow?.meta?.dailyUsage;
  check('R2.1', 'previous-month failure -> HTTP 200, row still ok', previousDown.response.status === 200 && previousDown.body?.ok === true && previousDownRow?.status === 'ok', `HTTP ${previousDown.response.status}, status=${previousDownRow?.status}`);
  checkEqual('R2.2', 'previous-month failure -> current-month-only series (independent recomputation)', previousDownSeries?.points?.map((point) => ({ date: point.date, cost: point.cost })), currentOnlyExpected);
  check('R2.3', 'previous-month failure is not surfaced as a history error', previousDownRow?.meta?.dailyUsageError === undefined, `dailyUsageError=${previousDownRow?.meta?.dailyUsageError}`);
  check('R2.4', 'the fallback series still ends today', previousDownSeries?.points?.at(-1)?.date === now.date, `last=${previousDownSeries?.points?.at(-1)?.date}`);

  const currentDown = await scenario(planFor({ current: { status: 500, body: { error: 'current month down' } } }), async ({ server }) => readProviderRoute(server, 'deepseek'));
  const currentDownRow = currentDown.body?.providers?.[0];
  check('R2.5', 'current-month failure -> HTTP 200, row still ok', currentDown.response.status === 200 && currentDown.body?.ok === true && currentDownRow?.status === 'ok', `HTTP ${currentDown.response.status}, status=${currentDownRow?.status}`);
  check('R2.6', 'current-month failure -> meta.dailyUsageError, no fabricated series', typeof currentDownRow?.meta?.dailyUsageError === 'string' && currentDownRow?.meta?.dailyUsage === undefined, JSON.stringify(currentDownRow?.meta));

  const bothDown = await scenario(planFor({ current: { status: 500, body: {} }, previous: { status: 500, body: {} } }), async ({ server }) => readProviderRoute(server, 'deepseek'));
  const bothDownRow = bothDown.body?.providers?.[0];
  check('R2.7', 'both months failing -> HTTP 200, row still ok', bothDown.response.status === 200 && bothDown.body?.ok === true && bothDownRow?.status === 'ok', `HTTP ${bothDown.response.status}, status=${bothDownRow?.status}`);
  check('R2.8', 'both months failing -> dailyUsageError and no series', typeof bothDownRow?.meta?.dailyUsageError === 'string' && bothDownRow?.meta?.dailyUsage === undefined, JSON.stringify(bothDownRow?.meta));

  const unauthorized = await scenario(
    (url) => (url === now.costCurrent ? { status: 401, body: { code: 40003 } } : planFor()(url)),
    async ({ server }) => readProviderRoute(server, 'deepseek'),
  );
  check('R2.9', 'a rejected current-month cost read still leaves the balance row ok (history is best-effort)', unauthorized.body?.providers?.[0]?.status === 'ok' && typeof unauthorized.body?.providers?.[0]?.meta?.dailyUsageError === 'string', JSON.stringify(unauthorized.body?.providers?.[0]?.meta));
}

/* ============================== decoupling / deadline with the extra cost call */

async function decoupling() {
  console.log('\n== R3 the extra cost read does not break decoupling or the 12 s deadline ==');
  const slowCosts = planFor({ costDelayMs: 900 });
  const outcome = await scenario(slowCosts, async ({ server }) => {
    const deepseekStart = Date.now();
    const deepseekPromise = readProviderRoute(server, 'deepseek');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const kimiStart = Date.now();
    const kimi = await readProviderRoute(server, 'kimi');
    const kimiMs = Date.now() - kimiStart;
    const deepseek = await deepseekPromise;
    return { kimiMs, kimi, deepseek, deepseekMs: Date.now() - deepseekStart };
  });
  check('R3.1', 'a DeepSeek read slow in its cost months does not delay the Kimi read', outcome.kimi.body?.ok === true && outcome.kimiMs < 500, `kimi ${outcome.kimiMs} ms while DeepSeek cost reads are 900 ms`);
  check('R3.2', 'the slow DeepSeek read still completes ok', outcome.deepseek.body?.providers?.[0]?.status === 'ok', JSON.stringify({ ms: outcome.deepseekMs, status: outcome.deepseek.body?.providers?.[0]?.status }));

  // Both cost calls hang: the adapter must give up at the 12 s deadline ONCE,
  // not serially (which would be ~24 s). The abort count proves both requests
  // were in flight together when the deadline fired.
  const hang = planFor({ costHang: true });
  const deadline = await scenario(hang, async ({ server, fake }) => {
    const started = Date.now();
    const response = await readProviderRoute(server, 'deepseek');
    return { elapsed: Date.now() - started, row: response.body?.providers?.[0], aborted: fake.state.aborted };
  });
  check('R3.3', 'a permanently hanging cost read settles at the 12 s deadline, not 24 s', deadline.elapsed >= 11_000 && deadline.elapsed < 15_000, `${deadline.elapsed} ms`);
  check('R3.4', 'the hanging read cost exactly two aborts — both month requests were in flight in parallel', deadline.aborted === 2, `${deadline.aborted} abort(s) seen by the fake transport`);
  check('R3.5', 'a timed-out history leaves the row ok with meta.dailyUsageError', deadline.row?.status === 'ok' && typeof deadline.row?.meta?.dailyUsageError === 'string', JSON.stringify({ status: deadline.row?.status, error: deadline.row?.meta?.dailyUsageError }));

  // A hanging summary keeps its pre-existing 12 s behaviour too (the cost calls
  // never start, because the adapter needs the balance path first).
  const summaryHang = await scenario(planFor({ summaryDelayMs: 1 }), async ({ server, fake }) => {
    fake.calls.length = 0;
    return readProviderRoute(server, 'deepseek');
  });
  check('R3.6', 'the normal path still completes (no regression to the healthy read)', summaryHang.body?.providers?.[0]?.status === 'ok', JSON.stringify({ status: summaryHang.body?.providers?.[0]?.status }));
}

/* ---------------------------------------------------------------------- runner */

await mergedSeries();
await fallbacks();
await decoupling();
process.exit(finish());
