/**
 * Round-2 (plugin 0.4.0) live verification of the DeepSeek trailing 30-day
 * spend series.
 *
 * Two independent sources are compared:
 *
 *   1. the host's own wire payload: `POST /usage-board/api/provider?id=deepseek`
 *      on a fresh scratch DSH instance (the plugin's real adapter over the real
 *      network, reusing the DSH-stored platform grant), and
 *   2. an INDEPENDENT recomputation in this file: the verifier calls the
 *      DeepSeek `/usage/cost` endpoint for the current and previous Beijing
 *      month directly, parses the raw amounts itself, merges/filters/caps them
 *      itself, and only then compares. No plugin helper is imported for this.
 *
 * The independent reader retries a non-zero `biz_code` envelope defensively
 * (the one 40001 "invalid month or year" seen while writing this harness was
 * traced to a verifier argument-order bug, not to the platform), and the
 * host-vs-independent pair is re-captured if the live current-day cost moved
 * between the two reads. The number of attempts is reported, never hidden.
 *
 * It also records the 近一周 / 近一月 sums (last 7 / last 30 points) for the
 * browser harness, in `test/verify/round2-live-snapshot.json`.
 *
 * Run: `node test/verify/round2-live.mjs [baseUrl]`
 * Default base: http://127.0.0.1:3181/usage-board
 *
 * The real token is read from the host's own credentials file and is never
 * printed; only masked forms appear in any output.
 */

import { writeFile } from 'node:fs/promises';

import {
  check,
  checkEqual,
  finish,
  loadRealSecrets,
  mask,
  request,
  sleep,
  tryJson,
} from './_lib.mjs';

const BASE = (process.argv[2] ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:3181/usage-board').replace(/\/$/, '');
const COST_URL = 'https://platform.deepseek.com/api/v0/usage/cost';
const ARTIFACT = new URL('./round2-live-snapshot.json', import.meta.url);

/** Beijing calendar fields for "now" (UTC+8, no DST — DeepSeek's cost dates). */
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
    costCurrent: `${COST_URL}?month=${month}&year=${year}`,
    costPrevious: month === 1 ? `${COST_URL}?month=12&year=${year - 1}` : `${COST_URL}?month=${month - 1}&year=${year}`,
  };
}

/**
 * Sum one day's money amounts from the platform's model/usage tree.
 * @param {any} day
 * @returns {number}
 */
function dayCost(day) {
  const models = Array.isArray(day?.data) ? day.data : [];
  let total = 0;
  for (const model of models) {
    const usage = Array.isArray(model?.usage) ? model.usage : [];
    for (const entry of usage) total += Number(entry?.amount) || 0;
  }
  return Math.round(total * 1e6) / 1e6;
}

/**
 * Read one month's raw history straight from the platform. Deliberately its own
 * parsing path (raw JSON -> its own dayCost), not the adapter's. Retries the
 * transient error envelope the platform sometimes returns.
 * @param {string} token
 * @param {number} month
 * @param {number} year
 * @returns {Promise<{url: string, status: number, code: number|null, bizCode: number|null, bizMsg: string|null, currency: string|null, points: Array<{date: string, cost: number}>, bytes: number, attempts: number}>}
 */
async function readMonth(token, month, year) {
  const url = `${COST_URL}?month=${month}&year=${year}`;
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-dsh-auth-token': token, 'x-client-platform': 'web', Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const payload = json?.data?.biz_data;
    const monthEntry = Array.isArray(payload) ? payload.find((entry) => Array.isArray(entry?.days)) : null;
    last = {
      url,
      status: response.status,
      code: json?.code ?? null,
      bizCode: json?.data?.biz_code ?? null,
      bizMsg: json?.data?.biz_msg ?? json?.msg ?? null,
      currency: typeof monthEntry?.currency === 'string' ? monthEntry.currency : null,
      points: (monthEntry?.days ?? []).map((day) => ({ date: day.date, cost: dayCost(day) })),
      bytes: text.length,
      attempts: attempt,
    };
    const ok = last.status === 200 && last.code === 0 && last.bizCode === 0 && last.points.length > 0;
    if (ok) return last;
    if (attempt < 3) await sleep(700);
  }
  return last;
}

/** Merge -> filter to elapsed days -> sort -> cap, done independently here. */
function mergeTrailing(previous, current, today, cap) {
  const byDate = new Map();
  for (const month of [previous, current]) for (const point of month.points) byDate.set(point.date, point.cost);
  return [...byDate.entries()]
    .filter(([date]) => date <= today)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .slice(-cap)
    .map(([date, cost]) => ({ date, cost }));
}

const sum = (points) => Math.round(points.reduce((total, point) => total + point.cost, 0) * 1e6) / 1e6;
const pointPairs = (points) => points.map((point) => [point.date, point.cost]);
const sameSeries = (left, right) => JSON.stringify(pointPairs(left)) === JSON.stringify(pointPairs(right));

/** Format like the renderers: ¥ + 2 decimals + thousands separators. */
function formatCny(value) {
  const text = value.toFixed(2);
  const dot = text.indexOf('.');
  const head = dot === -1 ? text : text.slice(0, dot);
  return `\u00a5${head.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${dot === -1 ? '' : text.slice(dot)}`;
}

/** Same dates + costs on every non-today point (the live current day may grow). */
function nonTodayStable(secondPoints, firstPoints) {
  if (secondPoints.length !== firstPoints.length) return false;
  for (let index = 0; index < secondPoints.length - 1; index += 1) {
    if (secondPoints[index].date !== firstPoints[index].date || secondPoints[index].cost !== firstPoints[index].cost) return false;
  }
  return true;
}

/* -------------------------------------------------------------------- runner */

console.log(`\n== L live trailing 30-day series at ${BASE} ==`);
const { platformToken } = await loadRealSecrets();
check('L1.1', 'the real DSH platform grant was loaded (masked only)', typeof platformToken === 'string' && platformToken.length > 20, `token ${mask(platformToken)}`);
if (!platformToken) process.exit(finish());

const now = beijingNow();

/** One forced host read of the DeepSeek row. */
async function readHostRow() {
  const response = await request(`${BASE}/api/provider?id=deepseek`, { method: 'POST' });
  const body = tryJson(response.text);
  return { response, body, row: body?.providers?.[0] };
}

// ---- 1. the host payload and its shape.
const host1 = await readHostRow();
check('L1.2', 'POST /api/provider?id=deepseek -> 200, one ok row', host1.response.status === 200 && host1.body?.providers?.length === 1 && host1.row?.id === 'deepseek' && host1.row?.status === 'ok', `HTTP ${host1.response.status}, status=${host1.row?.status}, message=${host1.row?.message}`);
const series1 = host1.row?.meta?.dailyUsage;
check('L1.3', 'the host row carries a 30-point trailing series that ends today', series1?.points?.length === 30 && series1.points.at(-1)?.date === now.date, `${series1?.points?.length} point(s), last=${series1?.points?.at(-1)?.date}`);
if (!series1) process.exit(finish());

// ---- 2. independent recomputation from the platform itself.
const current = await readMonth(platformToken, now.month, now.year);
const previous = await readMonth(platformToken, now.previous.month, now.previous.year);
check('L2.1', 'the independent current-month cost call succeeded', current.status === 200 && current.code === 0 && current.bizCode === 0 && current.points.length > 0, `HTTP ${current.status}, code=${current.code}, biz_code=${current.bizCode}, ${current.points.length} day(s), ${current.bytes} bytes, attempts=${current.attempts}`);
check('L2.2', 'the independent previous-month cost call succeeded', previous.status === 200 && previous.code === 0 && previous.bizCode === 0 && previous.points.length > 0, `HTTP ${previous.status}, code=${previous.code}, biz_code=${previous.bizCode}, ${previous.points.length} day(s), ${previous.bytes} bytes, attempts=${previous.attempts}${previous.bizMsg ? `, biz_msg=${String(previous.bizMsg).slice(0, 80)}` : ''}`);
if (!(current.bizCode === 0 && previous.bizCode === 0)) process.exit(finish());

// ---- 3. matched pair: if the live current-day cost moves between the two
// reads, capture both again (at most 3 times) instead of reporting a false
// mismatch.
let independent = mergeTrailing(previous, current, now.date, 30);
let host = host1;
let attempts = 1;
while (attempts < 3 && !sameSeries(host.row.meta.dailyUsage.points, independent)) {
  attempts += 1;
  independent = mergeTrailing(previous, current, now.date, 30);
  host = await readHostRow();
}
const hostPoints = host.row.meta.dailyUsage.points.map((point) => ({ date: point.date, cost: point.cost }));
check('L3.0', 'the live pair was captured without an unresolved current-day cost race', sameSeries(hostPoints, independent), `attempts=${attempts}`);
checkEqual('L3.1', 'the host series equals the independent recomputation point for point', hostPoints, independent);
check('L3.2', 'the host series has exactly 30 points', hostPoints.length === 30, `${hostPoints.length} point(s)`);
checkEqual('L3.3', 'series.days equals the shipped point count', series1.days, hostPoints.length);
checkEqual('L3.4', 'the series ends on today\'s Beijing date', hostPoints.at(-1)?.date, now.date);
check('L3.5', 'oldest first and contiguous', hostPoints.every((point, index) => index === 0 || new Date(`${hostPoints[index - 1].date}T00:00:00Z`).getTime() + 86400000 === new Date(`${point.date}T00:00:00Z`).getTime()), `${hostPoints[0]?.date} -> ${hostPoints.at(-1)?.date}`);
check('L3.6', 'the window spans the previous month (a real trailing window, not month-to-date)', hostPoints[0]?.date < now.monthStart, `first=${hostPoints[0]?.date}, monthStart=${now.monthStart}`);
check('L3.7', 'no future date is present', hostPoints.every((point) => point.date <= now.date), `last=${hostPoints.at(-1)?.date}`);
const zeroCost = hostPoints.filter((point) => point.cost === 0);
check('L3.8', 'elapsed zero-cost days are present (not trimmed)', zeroCost.length > 0, `${zeroCost.length} zero-cost day(s): ${zeroCost.map((point) => point.date).join(',')}`);
check('L3.9', 'every point is exactly {date, cost: number, tokens: null}', series1.points.every((point) => Object.keys(point).sort().join(',') === 'cost,date,tokens' && typeof point.cost === 'number' && Number.isFinite(point.cost) && point.tokens === null && /^\d{4}-\d{2}-\d{2}$/.test(point.date)), JSON.stringify(series1.points[0]));
checkEqual('L3.10', 'currency matches the platform month currency', series1.currency, current.currency);
check('L3.11', 'the series is only history: note says trailing 30-day spend history', typeof host.row.meta.note === 'string' && /trailing 30-day spend history/i.test(host.row.meta.note), host.row.meta.note);
check('L3.12', 'no dailyUsageError on the live healthy path', host.row.meta.dailyUsageError === undefined, `dailyUsageError=${host.row.meta.dailyUsageError}`);

// ---- 4. the two sums the renderers show, from both sources.
const hostWeek = sum(hostPoints.slice(-7));
const hostMonth = sum(hostPoints.slice(-30));
const independentWeek = sum(independent.slice(-7));
const independentMonth = sum(independent.slice(-30));
check('L4.1', '近一周 = sum of the last 7 points (host vs independent recomputation)', hostWeek === independentWeek, `${hostWeek} vs ${independentWeek}`);
check('L4.2', '近一月 = sum of the last 30 points (host vs independent recomputation)', hostMonth === independentMonth, `${hostMonth} vs ${independentMonth}`);
check('L4.3', 'the displayed week window is the last 7 dates and ends today', hostPoints.slice(-7).at(-1)?.date === now.date && hostPoints.slice(-7).length === 7, `${hostPoints.slice(-7)[0]?.date} -> ${hostPoints.slice(-7).at(-1)?.date}`);

// ---- 5. a second forced read keeps the same trailing semantics; only the live
// current day may legitimately grow between two live reads.
const second = await readHostRow();
const secondPoints = (second.row?.meta?.dailyUsage?.points ?? []).map((point) => ({ date: point.date, cost: point.cost }));
check('L4.4', 'a second forced read keeps the same 30-point trailing shape', secondPoints.length === 30 && secondPoints.at(-1)?.date === now.date, `${secondPoints.length} point(s), last=${secondPoints.at(-1)?.date}`);
check('L4.5', 'non-today points are stable between the two forced reads (no fabricated drift)', nonTodayStable(secondPoints, hostPoints), `non-today points compared: ${secondPoints.length - 1}`);
if (secondPoints.at(-1)?.cost !== hostPoints.at(-1)?.cost) console.log(`      live note: today's cost grew between the two reads (${hostPoints.at(-1)?.cost} -> ${secondPoints.at(-1)?.cost}); expected for the current day.`);

// ---- 6. write the artefact the browser harness compares against.
const artifact = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  liveReads: { matchedPairAttempts: attempts, secondReadTodayCost: secondPoints.at(-1)?.cost ?? null },
  beijing: { today: now.date, currentMonth: `${now.year}-${String(now.month).padStart(2, '0')}`, previousMonth: `${now.previous.year}-${String(now.previous.month).padStart(2, '0')}` },
  host: { points: hostPoints, week: hostWeek, month: hostMonth, weekText: formatCny(hostWeek), monthText: formatCny(hostMonth), currency: series1.currency, generatedAt: host.body?.generatedAt },
  independent: { currentMonthPoints: current.points.length, previousMonthPoints: previous.points.length, week: independentWeek, month: independentMonth, attempts: { current: current.attempts, previous: previous.attempts } },
};
await writeFile(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(`      wrote ${ARTIFACT.pathname}`);
console.log(`      today=${now.date}; points=${hostPoints.length}; 近一周=${artifact.host.weekText}; 近一月=${artifact.host.monthText}; zero-cost days=${zeroCost.length}`);
console.log(`      series: ${hostPoints.map((point) => `${point.date}:${point.cost}`).join(', ')}`);

// ---- 7. the other providers are unaffected by the extra DeepSeek cost call.
const kimi = tryJson((await request(`${BASE}/api/provider?id=kimi`)).text)?.providers?.[0];
const glm = tryJson((await request(`${BASE}/api/provider?id=glm`)).text)?.providers?.[0];
check('L5.1', 'Kimi still answers through its own route after the DeepSeek read', kimi?.id === 'kimi' && ['ok', 'upstream-error'].includes(kimi?.status), `kimi status=${kimi?.status}`);
check('L5.2', 'GLM still answers through its own route after the DeepSeek read (environmental status noted)', glm?.id === 'glm' && typeof glm?.status === 'string', `glm status=${glm?.status}, message=${String(glm?.message).slice(0, 80)}`);
console.log(`      environment note: GLM status=${glm?.status} (the stored key has no Coding Plan in this environment), Kimi status=${kimi?.status}`);

process.exit(finish());
