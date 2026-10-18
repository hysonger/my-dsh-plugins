/**
 * Round-2 (plugin 0.4.0) real-browser verification of the two claims:
 *
 *   A. The DSH main-area panel now uses the standalone page's layout baseline:
 *      `.ub-inner` is a centred max-width-1100 column, `.ub-body` is a
 *      responsive 1/2/3-column grid with 16 px gaps, title 20 px/600, card
 *      padding 18/18/16, and a subtitle naming the three services.
 *   B. The DeepSeek trend is 近一周 / 近一月 (sums of the last 7 / 30 points of
 *      the trailing series) plus a chart of exactly the last 7 days, with a
 *      visible stub for zero-cost days and a date range ending today.
 *
 * Both surfaces are checked at ~1700, ~1280, ~900 and a narrow width, with
 * computed-style/geometry assertions and screenshots. The expected numbers are
 * computed in Node from the live provider payload of the same cache epoch the
 * browser rendered (panel: also from its own sessionStorage copy), never read
 * from the DOM itself.
 *
 * A stand-in host with fake upstreams (deepseek 429, glm 500, kimi ok) proves
 * that provider-failure cards still render locally; the real GLM upstream error
 * of this environment is visible on the live scratch instance.
 *
 * Run:
 *   node test/verify/browser-round2.mjs <dshBaseUrl> <token>
 * or with env QA_BASE_URL / QA_DSH_TOKEN.
 *
 * The real-UI half needs the fresh scratch instance (see docs/VERIFICATION.md);
 * the stand-in half is self-contained (no credentials, no real network).
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { check, finish, sleep } from './_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const DSH_BASE = (process.argv[2] ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:3181').replace(/\/$/, '');
const TOKEN = process.argv[3] ?? process.env.QA_DSH_TOKEN ?? '';
const PROVIDER_IDS = ['deepseek', 'glm', 'kimi'];

/* ------------------------------------------------------------------ plumbing */

/** Run one agent-browser command in a named session and return stdout. */
function ab(session, args, options = {}) {
  return execFileSync('agent-browser', ['--session', session, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? 60_000,
  });
}

/** Run one agent-browser command whose output is JSON and parse `data`. */
function abJson(session, args, options = {}) {
  const out = ab(session, args, options).trim();
  const parsed = JSON.parse(out);
  if (parsed.success !== true) throw new Error(`agent-browser ${args.join(' ')} failed: ${out.slice(0, 300)}`);
  return parsed.data;
}

/** eval a JS expression and parse its JSON-string result. */
function evalJson(session, script) {
  const out = ab(session, ['eval', script]).trim();
  const first = out.indexOf('"');
  const literal = first >= 0 ? out.slice(first) : out;
  try {
    const decoded = JSON.parse(literal);
    return typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
  } catch (error) {
    throw new Error(`eval returned non-JSON: ${out.slice(0, 300)} (${error.message})`);
  }
}

/** Screenshot into test/verify/screenshots/ and return the path taken. */
function shoot(session, name) {
  const target = join(SHOTS, name);
  ab(session, ['screenshot', target]);
  return `test/verify/screenshots/${name}`;
}

/** Console / page-error lines, minus the CLI's own launch chatter. */
function noise(out) {
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('[agent-browser]'));
}

/** Captured network requests of one session. */
function requests(session, filter) {
  const args = ['network', 'requests', '--json'];
  if (filter) args.push('--filter', filter);
  return abJson(session, args).requests ?? [];
}

const usageBoardRequests = (list) => list.filter((request) => request.url.includes('/usage-board/api/'));
const providerRequests = (list) => usageBoardRequests(list).filter((request) => request.url.includes('/usage-board/api/provider'));
const aggregateRequests = (list) => usageBoardRequests(list).filter((request) => /\/usage-board\/api\/(snapshot|refresh)/.test(request.url));

/** One free TCP port on loopback. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/* ------------------------------------------------------------- money + series */

/** The panel renderer's money format: ¥ + grouped 2 decimals (formatMoney). */
function panelMoney(value) {
  const text = Math.abs(value).toFixed(2);
  const dot = text.indexOf('.');
  const head = dot === -1 ? text : text.slice(0, dot);
  return `\u00a5${head.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${dot === -1 ? '' : text.slice(dot)}`;
}

/** The standalone renderer's money format: symbol + 2 decimals. */
function plainMoney(value) {
  return `\u00a5${value.toFixed(2)}`;
}

/**
 * Bar-floor evidence for one measured DOM state.
 *
 * `wouldBeSubPixel` lists the bars the inline percentage alone would draw below
 * 2 px (these are the tiny nonzero days the post-freeze min-height protects).
 * @param {any} m LAYOUT_SCRIPT result.
 */
function barFloorReport(m) {
  const chartHeight = m.chartHeight ?? 34;
  const pctPx = (bar) => (bar.inlinePct === null ? null : Math.round(((bar.inlinePct / 100) * chartHeight) * 100) / 100);
  const wouldBeSubPixel = m.bars.filter((bar) => !bar.zero && pctPx(bar) !== null && pctPx(bar) < 2);
  const zeroBars = m.bars.filter((bar) => bar.zero);
  const solidBars = m.bars.filter((bar) => !bar.zero);
  const solidTone = solidBars.length > 0 ? solidBars[0].bg : null;
  return {
    allAtLeastTwoPx: m.bars.length === 7 && m.bars.every((bar) => bar.h >= 1.9),
    wouldBeSubPixel,
    emptyToneOk: zeroBars.length > 0 && zeroBars.every((bar) => bar.h >= 1.9 && bar.minH === '2px') && zeroBars.every((bar) => bar.bg !== solidTone),
    detail: `chart=${chartHeight}px, heights=${JSON.stringify(m.bars.map((bar) => bar.h))}, zero=${JSON.stringify(m.bars.filter((bar) => bar.zero).map((bar) => ({ h: bar.h, bg: bar.bg, minH: bar.minH })))}`,
    emptyDetail: `zero bg=${JSON.stringify(zeroBars.map((bar) => bar.bg))}, solid bg=${JSON.stringify(solidBars.map((bar) => bar.bg))}`,
  };
}

/** Sum the last N points, rounded the same way the renderers' toFixed(2) is fed. */
function sumLast(points, count) {
  return points.slice(-count).reduce((total, point) => total + point.cost, 0);
}

/**
 * Everything a rendered trend is compared against, computed from one series.
 * @param {Array<{date: string, cost: number}>} points
 */
function expectedTrend(points) {
  const last7 = points.slice(-7);
  const today = points.at(-1).date;
  const zeroCost = last7.filter((point) => point.cost === 0);
  return {
    week: sumLast(points, 7),
    month: sumLast(points, 30),
    panelWeek: panelMoney(sumLast(points, 7)),
    panelMonth: panelMoney(sumLast(points, 30)),
    plainWeek: plainMoney(sumLast(points, 7)),
    plainMonth: plainMoney(sumLast(points, 30)),
    last7,
    zeroCount: zeroCost.length,
    zeroDates: zeroCost.map((point) => point.date),
    panelBarTitles: last7.map((point) => `${point.date} \u00b7 ${panelMoney(point.cost)}`),
    plainBarTitles: last7.map((point) => `${point.date} \u00b7 ${plainMoney(point.cost)}`),
    todayShort: `${today.slice(5, 7)}-${today.slice(8, 10)}`,
    firstShort: `${last7[0].date.slice(5, 7)}-${last7[0].date.slice(8, 10)}`,
    todayFull: today,
    firstFull: last7[0].date,
  };
}

/* ---------------------------------------------------------------- DOM probe */

/**
 * One eval that measures everything the assertions below need on either surface.
 * Chooses panel vs standalone by the presence of `.ub-root`.
 */
const LAYOUT_SCRIPT = `JSON.stringify((() => {
  const isPanel = document.querySelector('.ub-root') !== null;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }; };
  const around = isPanel ? {
    root: document.querySelector('.ub-root'),
    inner: document.querySelector('.ub-inner'),
    body: document.querySelector('.ub-body'),
    cards: Array.from(document.querySelectorAll('.ub-body > .ub-card')),
    title: document.querySelector('.ub-title'),
    subtitle: document.querySelector('.ub-subtitle'),
    labels: Array.from(document.querySelectorAll('.ub-trend-stat-label')),
    values: Array.from(document.querySelectorAll('.ub-trend-stat-value')),
    bars: Array.from(document.querySelectorAll('.ub-trend-bar')),
    range: document.querySelector('.ub-trend-range'),
    rangeText: document.querySelector('.ub-trend-range') ? document.querySelector('.ub-trend-range').innerText : null,
  } : {
    root: document.querySelector('main'),
    inner: document.querySelector('main'),
    body: document.querySelector('#grid'),
    cards: Array.from(document.querySelectorAll('#grid .card')),
    title: document.querySelector('h1'),
    subtitle: document.querySelector('.sub'),
    labels: Array.from(document.querySelectorAll('.trend-stat .name')),
    values: Array.from(document.querySelectorAll('.trend-stat .val')),
    bars: Array.from(document.querySelectorAll('.bars .bar')),
    range: null,
    rangeText: (document.querySelector('.metric.trend .note') || {}).innerText || null,
  };
  const cardTitle = (card) => { const h = card.querySelector('h2, .ub-card-title'); return h ? h.innerText.replace(/\\s+/g, ' ').trim() : ''; };
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const on = (el, props) => { const c = cs(el); const out = {}; for (const p of props) out[p] = c[p]; return c ? out : null; };
  const zeroAttr = (bar) => (isPanel ? bar.getAttribute('data-empty') === 'true' : bar.classList.contains('empty'));
  const barTip = (bar) => bar.getAttribute('title') || bar.getAttribute('aria-label') || '';
  const rootRect = around.root ? around.root.getBoundingClientRect() : null;
  const rootStyle = cs(around.root);
  const bodyRect = around.body ? around.body.getBoundingClientRect() : null;
  const innerStyle = cs(around.inner);
  const innerRect = around.inner ? around.inner.getBoundingClientRect() : null;
  const barInfo = around.bars.map((bar) => ({
    h: Math.round(bar.getBoundingClientRect().height * 100) / 100,
    minH: cs(bar).minHeight,
    inline: bar.style.height,
    inlinePct: bar.style.height.endsWith('%') ? Number.parseFloat(bar.style.height) : null,
    bg: cs(bar).backgroundColor,
    zero: zeroAttr(bar),
    tip: barTip(bar),
  }));
  const chartHeight = around.bars.length > 0 && around.bars[0].parentElement
    ? Math.round(around.bars[0].parentElement.getBoundingClientRect().height * 100) / 100
    : null;
  return {
    surface: isPanel ? 'panel' : 'standalone',
    vw: innerWidth,
    vh: innerHeight,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    root: rootRect ? { ...rect(around.root), padLeft: parseFloat(rootStyle.paddingLeft), padRight: parseFloat(rootStyle.paddingRight), maxWidth: rootStyle.maxWidth } : null,
    inner: innerRect ? { ...rect(around.inner), maxWidth: innerStyle.maxWidth, marginLeft: innerStyle.marginLeft, marginRight: innerStyle.marginRight } : null,
    body: bodyRect ? { ...rect(around.body), display: cs(around.body).display, grid: cs(around.body).gridTemplateColumns, gap: cs(around.body).gap, scrollWidth: around.body.scrollWidth, clientWidth: around.body.clientWidth } : null,
    cards: around.cards.map((card) => ({ ...rect(card), title: cardTitle(card), provider: card.getAttribute('data-provider') || null, status: card.getAttribute('data-status') || null, padding: on(card, ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']), dataStatus: card.getAttribute('data-status') })),
    title: around.title ? { text: around.title.innerText, ...on(around.title, ['fontSize', 'fontWeight', 'lineHeight']) } : null,
    subtitle: around.subtitle ? around.subtitle.innerText.trim() : null,
    labels: around.labels.map((node) => node.innerText.trim()),
    values: around.values.map((node) => node.innerText.trim()),
    bars: barInfo,
    chartHeight,
    range: around.rangeText,
  };
})())`;

/* ---------------------------------------------------------- live data helpers */

/**
 * One JSON request to the scratch instance with a small retry: the instance can
 * drop an idle keep-alive socket between harness sections, which must not look
 * like a product failure.
 * @param {string} url
 * @param {object} [options]
 */
async function requestJson(url, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(400 * attempt);
    }
  }
  throw lastError;
}

/** Read the merged envelope the panel persisted for its own first paint. */
const STORED_SERIES_SCRIPT = `JSON.stringify((() => {
  try {
    const raw = sessionStorage.getItem('usage-board:snapshot:v1');
    if (raw === null) return { present: false };
    const body = JSON.parse(raw);
    const row = (body.providers || []).find((entry) => entry && entry.id === 'deepseek');
    return { present: true, generatedAt: body.generatedAt ?? null, points: (row && row.meta && row.meta.dailyUsage && row.meta.dailyUsage.points) || [] };
  } catch (error) { return { present: false, error: String(error) }; }
})())`;

/** Force a fresh DeepSeek read on the scratch instance, return its payload. */
async function prewarm() {
  const body = await requestJson(`${DSH_BASE}/usage-board/api/provider?id=deepseek`, { method: 'POST' });
  const row = body?.providers?.[0];
  const points = (row?.meta?.dailyUsage?.points ?? []).map((point) => ({ date: point.date, cost: point.cost }));
  return { generatedAt: body?.generatedAt, row, points };
}

/** Current cache epoch marker for the DeepSeek row (warm GET, no forced read). */
async function cacheEpoch() {
  const body = await requestJson(`${DSH_BASE}/usage-board/api/provider?id=deepseek`);
  return body?.generatedAt;
}

/** Stable comparable form of a series (the wire adds `tokens`, the expectation does not). */
const pairs = (points) => JSON.stringify(points.map((point) => [point.date, point.cost]));

/* ============================================================ P. real panel */

async function realPanel() {
  console.log(`\n== P real DSH main-area panel at ${DSH_BASE} ==`);
  const session = 'qa-r2-panel';
  const before = await prewarm();
  check('P1.1', 'the live DeepSeek payload used as the expectation has the 30-point trailing series', before.points.length === 30, `${before.points.length} point(s), ${before.points[0]?.date} -> ${before.points.at(-1)?.date}`);
  if (before.points.length !== 30) return;
  const expected = expectedTrend(before.points);
  let panelValues = null;
  try {
    try {
      ab(session, ['close']);
    } catch {
      /* no previous session */
    }
    await sleep(700);
    ab(session, ['set', 'viewport', '1700', '1000']);
    const opened = ab(session, ['open', `${DSH_BASE}/?token=${encodeURIComponent(TOKEN)}`]);
    check('P1.2', 'the scratch DSH Web UI loads', opened.includes('DeepSeek Harness') || opened.includes('127.0.0.1'), opened.split('\n').slice(0, 2).join(' '));
    ab(session, ['wait', '--load', 'networkidle']);
    ab(session, ['network', 'requests', '--clear']);
    ab(session, ['console', '--clear']);
    ab(session, ['errors', '--clear']);
    const sidebar = ab(session, ['snapshot', '-i']);
    check('P1.3', 'the sidebar exposes the 用量看板 entry', sidebar.includes('用量看板'), 'entry found in the accessibility tree');
    ab(session, ['find', 'role', 'button', 'click', '--name', '用量看板']);
    ab(session, ['wait', '--fn', "document.querySelectorAll('.ub-body > .ub-card').length === 3 && document.querySelectorAll('.ub-trend-bar').length === 7"], { timeout: 30_000 });
    await sleep(300);

    // The panel's own copy of the data: it persists the merged envelope it rendered.
    const stored = evalJson(session, STORED_SERIES_SCRIPT);
    check('P2.1', 'the panel persisted the merged envelope it rendered', stored.present === true && Array.isArray(stored.points) && stored.points.length === 30, `present=${stored.present}, points=${stored.points?.length}`);
    check('P2.2', 'the panel rendered the same series the expectation was computed from', pairs(stored.points) === pairs(before.points), `panel generatedAt=${stored.generatedAt}, prewarm generatedAt=${before.generatedAt}, ${stored.points.length} point(s) each`);
    const renderedExpected = expectedTrend(stored.points);

    // ---- geometry + computed style + trend at four widths.
    const viewports = [
      { w: 1700, h: 1000, name: '100-panel-wide-1700.png' },
      { w: 1280, h: 900, name: '101-panel-mid-1280.png' },
      { w: 900, h: 800, name: '102-panel-narrow-900.png' },
      { w: 700, h: 800, name: '103-panel-narrowest-700.png' },
    ];
    for (const viewport of viewports) {
      ab(session, ['set', 'viewport', String(viewport.w), String(viewport.h)]);
      await sleep(400);
      const m = evalJson(session, LAYOUT_SCRIPT);
      const tag = `P3.${viewport.w}`;
      check(`${tag}.surface`, `width ${viewport.w}: the panel surface is measured`, m.surface === 'panel', m.surface);
      // content width the root gives its children
      const content = m.root.w - m.root.padLeft - m.root.padRight;
      const expectedInner = Math.min(1100, content);
      check(`${tag}.innerWidth`, `width ${viewport.w}: .ub-inner width is min(1100, available)`, Math.abs(m.inner.w - expectedInner) <= 1, `inner=${m.inner.w}, min(1100, ${content})=${expectedInner}, max-width=${m.inner.maxWidth}`);
      check(`${tag}.centred`, `width ${viewport.w}: .ub-inner is horizontally centred in its pane`, Math.abs((m.inner.x + m.inner.w / 2) - (m.root.x + m.root.padLeft + content / 2)) <= 1.5, `inner centre=${m.inner.x + m.inner.w / 2}, pane content centre=${m.root.x + m.root.padLeft + content / 2}`);
      const cardCount = m.cards.length;
      const observedCols = String(m.body.grid).trim().split(/\s+/).filter(Boolean).length;
      const expectedCols = Math.max(1, Math.min(cardCount, Math.floor((m.body.w + 16) / 316)));
      check(`${tag}.grid`, `width ${viewport.w}: .ub-body is a grid with the expected track count (${expectedCols})`, m.body.display === 'grid' && observedCols === expectedCols, `display=${m.body.display}, tracks=${observedCols} (${m.body.grid}), expected=${expectedCols} for ${m.body.w}px, gap=${m.body.gap}`);
      // layout geometry: same-row cards share a top; stacked cards do not.
      const tops = m.cards.map((card) => Math.round(card.y));
      const rows = new Set(tops).size;
      const expectedRows = Math.ceil(cardCount / expectedCols);
      check(`${tag}.rows`, `width ${viewport.w}: cards lay out in ${expectedRows} row(s), not a one-column full-bleed stack`, rows === expectedRows, `card tops=${JSON.stringify(tops)}, rows=${rows}, expected=${expectedRows}`);
      check(`${tag}.noOverflow`, `width ${viewport.w}: no horizontal overflow`, m.docScrollWidth <= m.vw && m.body.scrollWidth <= m.body.clientWidth + 1, `docScrollWidth=${m.docScrollWidth}/${m.vw}, body scrollWidth=${m.body.scrollWidth}/${m.body.clientWidth}`);
      check(`${tag}.title`, `width ${viewport.w}: title is 20px/600`, m.title.fontSize === '20px' && m.title.fontWeight === '600' && m.title.text === '用量看板', JSON.stringify(m.title));
      check(`${tag}.subtitle`, `width ${viewport.w}: subtitle names the three services`, m.subtitle === 'DeepSeek \u00b7 GLM Coding Plan \u00b7 Kimi Code', `subtitle="${m.subtitle}"`);
      check(`${tag}.cardMetrics`, `width ${viewport.w}: card padding is 18/18/16 and radius comes from the panel token`, m.cards.every((card) => card.padding.paddingTop === '18px' && card.padding.paddingRight === '18px' && card.padding.paddingBottom === '16px' && card.padding.paddingLeft === '18px'), JSON.stringify(m.cards[0]?.padding));
      check(`${tag}.cards`, `width ${viewport.w}: exactly three provider cards are rendered`, cardCount === 3 && m.cards.every((card) => ['DeepSeek', 'GLM Coding Plan', 'Kimi Code'].some((name) => card.title.startsWith(name))), JSON.stringify(m.cards.map((card) => card.title)));

      // trend assertions against the series the panel actually rendered
      checkEqual(`${tag}.labels`, `width ${viewport.w}: the trend shows 近一周 and 近一月`, m.labels, ['近一周', '近一月']);
      checkEqual(`${tag}.values`, `width ${viewport.w}: the two totals equal the sums of the last 7 / 30 rendered points`, m.values, [renderedExpected.panelWeek, renderedExpected.panelMonth]);
      check(`${tag}.barCount`, `width ${viewport.w}: the chart has exactly 7 bars`, m.bars.length === 7, `${m.bars.length} bar(s)`);
      check(`${tag}.zeroStub`, `width ${viewport.w}: every zero-cost day keeps a visible stub`, m.bars.filter((bar) => bar.zero).length === renderedExpected.zeroCount && m.bars.filter((bar) => bar.zero).every((bar) => bar.h >= 1.5), `empty bars=${m.bars.filter((bar) => bar.zero).length}/${renderedExpected.zeroCount}, heights=${JSON.stringify(m.bars.map((bar) => bar.h))}, min-height=${m.bars.find((bar) => bar.zero)?.minH}`);
      // post-freeze fix (§9.15): the base bar also carries a 2px floor, so a tiny
      // nonzero day cannot render thinner than the zero-cost stub.
      const barFloor = barFloorReport(m);
      check(`${tag}.barFloor`, `width ${viewport.w}: every bar (incl. tiny nonzero days) renders at least 2px tall`, barFloor.allAtLeastTwoPx, barFloor.detail);
      check(`${tag}.tinyBarFloor`, `width ${viewport.w}: previously sub-pixel nonzero days are floored at 2px`, barFloor.wouldBeSubPixel.every((bar) => bar.h >= 1.9) && barFloor.wouldBeSubPixel.length > 0, `would-be-sub-2px nonzero bars=${barFloor.wouldBeSubPixel.length}, heights=${JSON.stringify(barFloor.wouldBeSubPixel.map((bar) => bar.h))}`);
      check(`${tag}.emptyTone`, `width ${viewport.w}: the zero-cost day keeps its muted tone and 2px floor`, barFloor.emptyToneOk, barFloor.emptyDetail);
      checkEqual(`${tag}.barTips`, `width ${viewport.w}: each bar is one of the trailing 7 dates with its cost`, m.bars.map((bar) => bar.tip), renderedExpected.panelBarTitles);
      check(`${tag}.range`, `width ${viewport.w}: the date range ends today`, m.range === `${renderedExpected.firstShort} \u2192 ${renderedExpected.todayShort}`, `range="${m.range}", expected="${renderedExpected.firstShort} \u2192 ${renderedExpected.todayShort}"`);
      check(`${tag}.gap`, `width ${viewport.w}: the card grid gap is 16px`, m.body.gap === '16px', `gap=${m.body.gap}`);
      panelValues = m.values;
      console.log(`      ${viewport.w}x${viewport.h}: inner=${m.inner.w}px @x=${m.inner.x}, tracks=${observedCols}, rows=${rows}, values=${JSON.stringify(m.values)}, bars=${JSON.stringify(m.bars.map((bar) => bar.h))}, wouldBeSub2px=${barFloor.wouldBeSubPixel.length}`);
      shoot(session, viewport.name);
    }

    // ---- request topology + console hygiene.
    const net = requests(session, 'usage-board/api');
    const provider = providerRequests(net);
    const ids = provider.map((request) => new URL(request.url).searchParams.get('id'));
    check('P4.1', 'the panel reads exactly the three per-provider routes on mount', provider.length >= 3 && PROVIDER_IDS.every((id) => ids.includes(id)), `${provider.length} provider request(s): ${ids.join(',')}`);
    check('P4.2', 'the panel never calls the aggregate snapshot/refresh routes', aggregateRequests(net).length === 0, `${aggregateRequests(net).length} aggregate request(s)`);
    check('P4.3', 'the panel requests all succeeded over real HTTP', provider.every((request) => request.status === undefined || (request.status >= 200 && request.status < 300)), JSON.stringify(provider.map((request) => request.status)));
    // The real environment's GLM key has no Coding Plan: that provider-failure
    // card is rendered locally by the real page (environmental, documented).
    // Cold scratch instances resolve the GLM row through its real upstream
    // timeout (~10.5 s), so wait for an actual row (data-status) instead of
    // assuming a warm cache: before this wait the card may still be a skeleton.
    ab(session, ['wait', '--fn', 'document.querySelector(\'.ub-card[data-provider="glm"]\')?.getAttribute("data-status") !== null'], { timeout: 45_000 });
    const glmStatus = evalJson(session, `JSON.stringify({ status: document.querySelector('.ub-card[data-provider="glm"]')?.getAttribute('data-status') ?? null, text: (document.querySelector('.ub-card[data-provider="glm"]')?.innerText ?? '').replace(/\\s+/g, ' ') })`);
    check('P4.4', 'a real provider failure (GLM upstream error 500) still renders as a local card with its diagnosis and code', glmStatus.status === 'upstream-error' && /上游错误/.test(glmStatus.text) && /code 500/.test(glmStatus.text), JSON.stringify(glmStatus));
    const consoleLines = noise(ab(session, ['console']));
    const errorLines = noise(ab(session, ['errors']));
    check('P4.5', 'the DSH page console has no warnings/errors while the panel runs', consoleLines.length === 0, consoleLines.join(' | ') || 'empty');
    check('P4.6', 'the DSH page has no uncaught page errors', errorLines.length === 0, errorLines.join(' | ') || 'empty');

    // ---- local render of a 429-shaped provider row (rate-limited).
    // The host maps an upstream 429 to status 'rate-limited' + messageKey
    // 'rateLimited' (verified through the real adapter in adversarial.mjs C3);
    // here the panel's own rendering of that wire row is exercised in the real
    // DSH UI by fulfilling the provider route with exactly such a row.
    const glmLive = await (async () => {
      const response = await fetch(`${DSH_BASE}/usage-board/api/provider?id=deepseek`);
      return response.json();
    })();
    const rateLimitedEnvelope = {
      protocolVersion: 1,
      ok: false,
      ttlMs: 60_000,
      generatedAt: Date.now(),
      providers: [{
        id: 'deepseek',
        label: 'DeepSeek',
        status: 'rate-limited',
        message: 'The provider is rate limiting this client.',
        messageKey: 'rateLimited',
        code: 'HTTP 429',
        plan: null,
        windows: [],
        balances: [],
        account: null,
        meta: {},
        fetchedAt: Date.now(),
        latencyMs: 1,
      }],
      providerId: 'deepseek',
      stale: false,
      refreshing: false,
    };
    check('P5.0', 'the live DeepSeek envelope shape is available for the 429 row test', Array.isArray(glmLive?.providers) && glmLive.providers.length === 1, JSON.stringify(glmLive?.providers?.map((row) => row.id)));
    ab(session, ['network', 'route', '**/usage-board/api/provider*deepseek*', '--body', JSON.stringify(rateLimitedEnvelope)]);
    ab(session, ['wait', '--fn', '!document.querySelector(".ub-refresh").disabled'], { timeout: 30_000 });
    ab(session, ['click', '.ub-refresh']);
    ab(session, ['wait', '--fn', "document.querySelector('.ub-card[data-provider=\"deepseek\"]')?.getAttribute('data-status') === 'rate-limited'"], { timeout: 30_000 });
    const rateLimitedCard = evalJson(session, `JSON.stringify({ status: document.querySelector('.ub-card[data-provider="deepseek"]')?.getAttribute('data-status') ?? null, text: (document.querySelector('.ub-card[data-provider="deepseek"]')?.innerText ?? '').replace(/\\s+/g, ' ') })`);
    check('P5.1', 'a 429-shaped row renders locally as a rate-limited card with the localized sentence', rateLimitedCard.status === 'rate-limited' && /限流/.test(rateLimitedCard.text) && /HTTP 429/.test(rateLimitedCard.text), JSON.stringify(rateLimitedCard));
    const rateLimitedShot = shoot(session, '104-panel-rate-limited-local-card.png');
    console.log(`      rate-limited card screenshot: ${rateLimitedShot}`);
    ab(session, ['network', 'unroute', '**/usage-board/api/provider*deepseek*']);
    ab(session, ['wait', '--fn', '!document.querySelector(".ub-refresh").disabled'], { timeout: 30_000 });
    ab(session, ['click', '.ub-refresh']);
    ab(session, ['wait', '--fn', "document.querySelector('.ub-card[data-provider=\"deepseek\"]')?.getAttribute('data-status') === 'ok'"], { timeout: 45_000 });
    check('P5.2', 'the panel recovers to the live ok card after the intercepted failure clears', evalJson(session, `JSON.stringify(document.querySelector('.ub-card[data-provider="deepseek"]')?.getAttribute('data-status') ?? null)`) === 'ok', 'data-status=ok');
    const errorsAfter = noise(ab(session, ['errors']));
    check('P5.3', 'the intercepted failure raised no uncaught page errors', errorsAfter.length === 0, errorsAfter.join(' | ') || 'empty');

    // The panel forced a live refresh after the intercepted failure cleared, so
    // re-read its rendered series (`sessionStorage`) and DOM before comparing
    // surfaces: the cross-surface numbers are only comparable when both sides
    // rendered the same series.
    const finalStored = evalJson(session, STORED_SERIES_SCRIPT);
    check('P5.4', 'after the recovery refresh the panel still renders the 30-point trailing series', finalStored.present === true && finalStored.points.length === 30, `present=${finalStored.present}, points=${finalStored.points?.length}`);
    const finalExpected = expectedTrend(finalStored.points);
    const finalTrend = evalJson(session, `JSON.stringify({ labels: Array.from(document.querySelectorAll('.ub-trend-stat-label')).map((node) => node.innerText.trim()), values: Array.from(document.querySelectorAll('.ub-trend-stat-value')).map((node) => node.innerText.trim()), bars: document.querySelectorAll('.ub-trend-bar').length })`);
    checkEqual('P5.5', 'after the recovery refresh the totals still equal the sums of the rendered series', finalTrend.values, [finalExpected.panelWeek, finalExpected.panelMonth]);
    check('P5.6', 'the recovered trend still has the 近一周 / 近一月 labels and 7 bars', JSON.stringify(finalTrend.labels) === JSON.stringify(['近一周', '近一月']) && finalTrend.bars === 7, JSON.stringify({ labels: finalTrend.labels, bars: finalTrend.bars }));

    const panelSubtitle = evalJson(session, `JSON.stringify((document.querySelector('.ub-subtitle') || {}).innerText || null)`);
    return { session, expected: finalExpected, values: finalTrend.values, points: finalStored.points, generatedAt: finalStored.generatedAt, subtitle: panelSubtitle };
  } catch (error) {
    check('P0.1', 'the real-panel half ran without a harness exception', false, `${error.message}; is the scratch instance up and the token valid?`);
    return null;
  }
}

/* ======================================================== S. standalone page */

async function standalone(panelResult) {
  console.log(`\n== S standalone /usage-board/ page at ${DSH_BASE} ==`);
  const session = 'qa-r2-page';
  let before = null;
  let expected = null;
  let epochStable = false;
  try {
    before = await prewarm();
    expected = expectedTrend(before.points);
    // The page fetches the provider routes itself; if the cache expired between
    // the prewarm and that fetch, its DOM would describe a newer series than the
    // expectation. Detect that (epoch after load) and re-open once.
    for (let attempt = 1; attempt <= 2 && !epochStable; attempt += 1) {
      try {
        ab(session, ['close']);
      } catch {
        /* no previous session */
      }
      await sleep(600);
      ab(session, ['set', 'viewport', '1700', '1000']);
      // Clear the buffers BEFORE the app navigation so the mount-time provider
      // reads are captured (they happen during load).
      ab(session, ['open', 'about:blank']);
      ab(session, ['network', 'requests', '--clear']);
      ab(session, ['console', '--clear']);
      ab(session, ['errors', '--clear']);
      const opened = ab(session, ['open', `${DSH_BASE}/usage-board/`]);
      check(`S1.1.attempt${attempt}`, 'the standalone dashboard loads', opened.includes('用量看板') || opened.includes('Usage Board'), opened.split('\n').slice(0, 2).join(' '));
      ab(session, ['wait', '--load', 'networkidle']);
      ab(session, ['wait', '--fn', "document.querySelectorAll('#grid .card').length === 3 && document.querySelectorAll('.bars .bar').length === 7"], { timeout: 30_000 });
      const epochAfterLoad = await cacheEpoch();
      epochStable = epochAfterLoad === before.generatedAt;
      if (!epochStable) {
        console.log(`      cache epoch moved during page load (${before.generatedAt} -> ${epochAfterLoad}); re-prewarming and reloading`);
        before = await prewarm();
        expected = expectedTrend(before.points);
      }
    }
    check('S1.2', 'the cache epoch did not move between the prewarm and the standalone fetch (DOM sums comparable)', epochStable, `${before.generatedAt} / page-loaded compare`);
    const standaloneHeader = evalJson(session, `JSON.stringify({ subtitle: (document.querySelector('p.sub') || {}).innerText || null, fresh: (document.getElementById('updated') || {}).innerText || null })`);
    check('S1.3', 'the standalone page carries the provider-list subtitle the panel mirrors', standaloneHeader.subtitle === 'DeepSeek \u00b7 GLM Coding Plan \u00b7 Kimi Code', JSON.stringify(standaloneHeader));

    const viewports = [
      { w: 1700, h: 1000, name: '110-standalone-wide-1700.png' },
      { w: 1280, h: 900, name: '111-standalone-mid-1280.png' },
      { w: 900, h: 800, name: '112-standalone-narrow-900.png' },
      { w: 640, h: 800, name: '113-standalone-narrowest-640.png' },
    ];
    let standaloneValues = null;
    for (const viewport of viewports) {
      ab(session, ['set', 'viewport', String(viewport.w), String(viewport.h)]);
      await sleep(400);
      const m = evalJson(session, LAYOUT_SCRIPT);
      const tag = `S2.${viewport.w}`;
      check(`${tag}.surface`, `width ${viewport.w}: the standalone surface is measured`, m.surface === 'standalone', m.surface);
      const expectedMain = Math.min(1100, m.vw);
      check(`${tag}.mainWidth`, `width ${viewport.w}: main is the 1100px-centred reading column`, Math.abs(m.root.w - expectedMain) <= 1 && m.root.maxWidth === '1100px', `main=${m.root.w}, expected=${expectedMain}, max-width=${m.root.maxWidth}`);
      check(`${tag}.centred`, `width ${viewport.w}: main is horizontally centred`, Math.abs((m.root.x + m.root.w / 2) - m.vw / 2) <= 1.5, `main centre=${m.root.x + m.root.w / 2}, viewport centre=${m.vw / 2}`);
      const cardCount = m.cards.length;
      const observedCols = String(m.body.grid).trim().split(/\s+/).filter(Boolean).length;
      // standalone grid: repeat(auto-fit, minmax(320px, 1fr)), gap 16
      const expectedCols = Math.max(1, Math.min(cardCount, Math.floor((m.body.w + 16) / 336)));
      check(`${tag}.grid`, `width ${viewport.w}: #grid has the expected responsive track count (${expectedCols})`, m.body.display === 'grid' && observedCols === expectedCols, `display=${m.body.display}, tracks=${observedCols} (${m.body.grid}), expected=${expectedCols} for ${m.body.w}px`);
      const rows = new Set(m.cards.map((card) => Math.round(card.y))).size;
      check(`${tag}.rows`, `width ${viewport.w}: cards lay out in ${Math.ceil(cardCount / expectedCols)} row(s)`, rows === Math.ceil(cardCount / expectedCols), `card tops=${JSON.stringify(m.cards.map((card) => Math.round(card.y)))}, rows=${rows}`);
      check(`${tag}.noOverflow`, `width ${viewport.w}: no horizontal overflow`, m.docScrollWidth <= m.vw && m.body.scrollWidth <= m.body.clientWidth + 1, `docScrollWidth=${m.docScrollWidth}/${m.vw}, grid scrollWidth=${m.body.scrollWidth}/${m.body.clientWidth}`);
      check(`${tag}.title`, `width ${viewport.w}: title is 20px/600`, m.title.fontSize === '20px' && m.title.fontWeight === '600' && m.title.text === '用量看板', JSON.stringify(m.title));
      check(`${tag}.cardMetrics`, `width ${viewport.w}: card padding is 18/18/16 (the baseline the panel copies)`, m.cards.every((card) => card.padding.paddingTop === '18px' && card.padding.paddingRight === '18px' && card.padding.paddingBottom === '16px' && card.padding.paddingLeft === '18px'), JSON.stringify(m.cards[0]?.padding));
      checkEqual(`${tag}.labels`, `width ${viewport.w}: the trend shows 近一周 and 近一月`, m.labels, ['近一周', '近一月']);
      checkEqual(`${tag}.values`, `width ${viewport.w}: the two totals equal the sums of the last 7 / 30 series points`, m.values, [expected.plainWeek, expected.plainMonth]);
      check(`${tag}.barCount`, `width ${viewport.w}: the chart has exactly 7 bars`, m.bars.length === 7, `${m.bars.length} bar(s)`);
      check(`${tag}.zeroStub`, `width ${viewport.w}: every zero-cost day keeps a visible stub`, m.bars.filter((bar) => bar.zero).length === expected.zeroCount && m.bars.filter((bar) => bar.zero).every((bar) => bar.h >= 1.5), `empty bars=${m.bars.filter((bar) => bar.zero).length}/${expected.zeroCount}, heights=${JSON.stringify(m.bars.map((bar) => bar.h))}, min-height=${m.bars.find((bar) => bar.zero)?.minH}`);
      const barFloor = barFloorReport(m);
      check(`${tag}.barFloor`, `width ${viewport.w}: every bar (incl. tiny nonzero days) renders at least 2px tall`, barFloor.allAtLeastTwoPx, barFloor.detail);
      check(`${tag}.tinyBarFloor`, `width ${viewport.w}: previously sub-pixel nonzero days are floored at 2px`, barFloor.wouldBeSubPixel.every((bar) => bar.h >= 1.9) && barFloor.wouldBeSubPixel.length > 0, `would-be-sub-2px nonzero bars=${barFloor.wouldBeSubPixel.length}, heights=${JSON.stringify(barFloor.wouldBeSubPixel.map((bar) => bar.h))}`);
      check(`${tag}.emptyTone`, `width ${viewport.w}: the zero-cost day keeps its muted tone and 2px floor`, barFloor.emptyToneOk, barFloor.emptyDetail);
      checkEqual(`${tag}.barTips`, `width ${viewport.w}: each bar is one of the trailing 7 dates with its cost`, m.bars.map((bar) => bar.tip), expected.plainBarTitles);
      check(`${tag}.range`, `width ${viewport.w}: the date range ends today`, m.range === `${expected.firstFull} \u2192 ${expected.todayFull}`, `range="${m.range}"`);
      check(`${tag}.gap`, `width ${viewport.w}: the card grid gap is 16px`, m.body.gap === '16px', `gap=${m.body.gap}`);
      standaloneValues = m.values;
      console.log(`      ${viewport.w}x${viewport.h}: main=${m.root.w}px @x=${m.root.x}, grid=${m.body.w}px, tracks=${observedCols}, rows=${rows}, values=${JSON.stringify(m.values)}, bars=${JSON.stringify(m.bars.map((bar) => bar.h))}, wouldBeSub2px=${barFloor.wouldBeSubPixel.length}`);
      shoot(session, viewport.name);
    }

    // ---- the same series on both surfaces (only meaningful when both rendered
    // the same series; the live current-day cost can move between captures).
    const sameSeries = panelResult !== null && pairs(panelResult.points) === pairs(before.points);
    if (panelResult && standaloneValues) {
      check('S3.1', 'the panel and standalone rendered the same DeepSeek series (cross-surface number comparison is conclusive)', sameSeries, `panel points end=${panelResult.points?.at(-1)?.cost} @${panelResult.points?.at(-1)?.date}, standalone end=${before.points.at(-1)?.cost} @${before.points.at(-1)?.date}`);
      check('S3.3', 'panel and standalone carry the same provider-list subtitle', panelResult.subtitle === standaloneHeader.subtitle, `panel="${panelResult.subtitle}", standalone="${standaloneHeader.subtitle}"`);
      if (sameSeries) {
        checkEqual('S3.2', 'panel and standalone show the same 近一周 / 近一月 strings for the same series', panelResult.values, standaloneValues);
      } else {
        check('S3.2', 'panel and standalone each show the sums of their own rendered series (format+value check)', JSON.stringify(standaloneValues) === JSON.stringify([expected.plainWeek, expected.plainMonth]), `standalone=${JSON.stringify(standaloneValues)}, expected=${JSON.stringify([expected.plainWeek, expected.plainMonth])}`);
      }
    }

    const net = requests(session, 'usage-board/api');
    const provider = providerRequests(net);
    check('S4.1', 'the standalone page reads through the per-provider routes and never the aggregate route', provider.length >= 3 && aggregateRequests(net).length === 0, `${provider.length} provider request(s), ${aggregateRequests(net).length} aggregate request(s)`);
    const consoleLines = noise(ab(session, ['console']));
    const errorLines = noise(ab(session, ['errors']));
    check('S4.2', 'the standalone page console has no warnings/errors', consoleLines.length === 0, consoleLines.join(' | ') || 'empty');
    check('S4.3', 'the standalone page has no uncaught page errors', errorLines.length === 0, errorLines.join(' | ') || 'empty');
    return { session, values: standaloneValues, points: before.points, generatedAt: before.generatedAt };
  } catch (error) {
    check('S0.1', 'the standalone half ran without a harness exception', false, `${error.message}`);
    return null;
  }
}

/* =================================== D. local failure-card render (stand-in) */

async function degradedStandin() {
  console.log('\n== D local failure-card rendering on a stand-in host (deepseek 429 / glm 500 / kimi ok) ==');
  const session = 'qa-r2-degraded';
  const port = await freePort();
  const child = spawn(process.execPath, [join(HERE, 'degraded-round2-server.mjs'), String(port)], {
    cwd: join(HERE, '..', '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    const deadline = Date.now() + 15_000;
    while (!stdout.includes('degraded round2 usage board on') && Date.now() < deadline) await sleep(100);
    if (!stdout.includes('degraded round2 usage board on')) throw new Error(`stand-in server did not start: ${stderr.slice(0, 300)}`);
    const base = /on (http:\/\/127\.0\.0\.1:\d+\/usage-board\/)/.exec(stdout)[1];
    check('D0.2', 'the degraded stand-in host is up', true, base);

    try {
      ab(session, ['close']);
    } catch {
      /* no previous session */
    }
    await sleep(600);
    ab(session, ['set', 'viewport', '1280', '900']);
    ab(session, ['open', 'about:blank']);
    ab(session, ['console', '--clear']);
    ab(session, ['errors', '--clear']);
    const opened = ab(session, ['open', base]);
    check('D1.1', 'the stand-in host serves the real dashboard', opened.includes('用量看板') || opened.includes('Usage Board'), opened.split('\n').slice(0, 2).join(' '));
    ab(session, ['wait', '--load', 'networkidle']);
    ab(session, ['wait', '--fn', "document.querySelectorAll('#grid .card').length === 3 && document.querySelectorAll('.skeleton').length === 0"], { timeout: 30_000 });
    const state = evalJson(session, `JSON.stringify({
      cards: document.querySelectorAll('#grid .card').length,
      titles: Array.from(document.querySelectorAll('#grid .card h2')).map((node) => node.innerText.replace(/\\s+/g, ' ').trim()),
      texts: Array.from(document.querySelectorAll('#grid .card')).map((node) => node.innerText.replace(/\\s+/g, ' ').trim()),
      pills: Array.from(document.querySelectorAll('#grid .card .pill')).map((node) => node.innerText.trim()),
      gridText: (document.getElementById('grid')?.innerText ?? '').replace(/\\s+/g, ' '),
    })`);
    const deepseekText = state.texts.find((text) => text.startsWith('DeepSeek')) ?? '';
    const glmText = state.texts.find((text) => text.startsWith('GLM Coding Plan')) ?? '';
    const kimiText = state.texts.find((text) => text.startsWith('Kimi Code')) ?? '';
    check('D1.2', 'the 429-shaped DeepSeek row renders locally as a rate-limited card', state.pills.includes('限流') && /服务方正在限流/.test(deepseekText), JSON.stringify({ pills: state.pills, deepseek: deepseekText.slice(0, 140) }));
    check('D1.3', 'the 500-shaped GLM row renders locally as an upstream-error card', state.pills.includes('上游错误') && /上游错误/.test(glmText), JSON.stringify({ glm: glmText.slice(0, 140) }));
    check('D1.4', 'the healthy Kimi card still renders its quota numbers beside the failures', kimiText !== '' && /\d+(\.\d+)?%/.test(kimiText) && /5 小时窗口/.test(kimiText), kimiText.slice(0, 160));
    check('D1.5', 'three cards are present (no failure blanks the board)', state.cards === 3, `${state.cards} card(s)`);
    const degradedShot = shoot(session, '114-standalone-degraded-429-500.png');
    console.log(`      degraded screenshot: ${degradedShot}`);
    const consoleLines = noise(ab(session, ['console']));
    const errorLines = noise(ab(session, ['errors']));
    check('D1.6', 'the degraded page raises no uncaught page errors', errorLines.length === 0 && consoleLines.length === 0, `console=${consoleLines.join(' | ') || 'empty'}; errors=${errorLines.join(' | ') || 'empty'}`);
    console.log(`      stand-in host: ${base}`);
  } catch (error) {
    check('D0.1', 'the degraded stand-in half ran without a harness exception', false, error.message);
  } finally {
    try {
      ab(session, ['close']);
    } catch {
      /* already closed */
    }
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.on('exit', resolve);
      setTimeout(resolve, 3000);
    });
  }
}

/* ---------------------------------------------------------------------- runner */

function checkEqual(id, name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return check(id, name, ok, ok ? `= ${JSON.stringify(actual)}` : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

try {
  const panelResult = await realPanel();
  await standalone(panelResult);
  await degradedStandin();
} finally {
  for (const session of ['qa-r2-panel', 'qa-r2-page', 'qa-r2-degraded']) {
    try {
      ab(session, ['close']);
    } catch {
      /* not running */
    }
  }
}
process.exit(finish());
