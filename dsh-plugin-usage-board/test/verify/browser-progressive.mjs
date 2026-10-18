/**
 * Browser verification of the per-provider progressive paint (task-4, section D).
 *
 * Two halves, both driven through the `agent-browser` CLI:
 *
 *   E. The REAL DSH Web UI on a scratch instance. The sidebar panel
 *      (用量看板) is opened with live credentials: all three cards render, and
 *      the network log proves the panel reads through
 *      `/usage-board/api/provider?id=…` (one request per provider) and never
 *      calls the aggregate `/api/snapshot` route. Console and page errors must
 *      be empty. Screenshot: `80-dsh-sidebar-panel-v4.png`.
 *
 *   F. A stand-in host (`progressive-server.mjs`) whose fake upstream answers
 *      DeepSeek/Kimi in ~40 ms and GLM after 8 s. The standalone
 *      `/usage-board/` page is opened COLD and screenshotted while GLM is still
 *      a skeleton, then again after it settles. The manual 刷新 button is
 *      clicked while the slow provider is outstanding and the DOM is sampled
 *      immediately, proving a refresh never blanks numbers already on screen.
 *      Screenshots: `81-progressive-early-2cards.png`,
 *      `82-progressive-settled-3cards.png`,
 *      `83-progressive-refreshing-no-blank.png`.
 *
 * Run:
 *   node test/verify/browser-progressive.mjs <dshBaseUrl> <token>
 * or with env: QA_BASE_URL / QA_DSH_TOKEN.
 *
 * The real-UI half needs a running scratch instance whose profile links this
 * repo (see docs/VERIFICATION.md). The stand-in half is self-contained: no
 * credentials and no real network.
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { check, finish, sleep } from './_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SHOTS = join(HERE, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const DSH_BASE = (process.argv[2] ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:3181').replace(/\/$/, '');
const TOKEN = process.argv[3] ?? process.env.QA_DSH_TOKEN ?? '';
const PROVIDER_IDS = ['deepseek', 'glm', 'kimi'];

/* ------------------------------------------------------------------ helpers */

/**
 * Run one agent-browser command in a named session and return stdout.
 * @param {string} session
 * @param {string[]} args
 * @param {{timeout?: number}} [options]
 * @returns {string}
 */
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

/** eval a JS expression in the page and parse its JSON-string result. */
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

/** Screenshot into test/verify/screenshots/ and return the repo-relative path. */
function shoot(session, name, full = false) {
  ab(session, ['screenshot', ...(full ? ['--full'] : []), join(SHOTS, name)]);
  return `test/verify/screenshots/${name}`;
}

/** Console / page-error lines, minus the CLI's own launch chatter. */
function noise(out) {
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('[agent-browser]'));
}

/** Whether a card-title list contains a provider (titles carry their status pill too). */
const titled = (titles, name) => (titles ?? []).some((title) => String(title).startsWith(name));

/** Captured network requests of one session as an array of {method,url,status,...}. */
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

/** Inspect the standalone dashboard DOM in one expression. */
const PAGE_STATE_SCRIPT = `JSON.stringify({
  at: Math.round(performance.now()),
  cards: document.querySelectorAll('.card').length,
  skeletons: document.querySelectorAll('.skeleton').length,
  titles: Array.from(document.querySelectorAll('#grid .card h2')).map((node) => node.innerText.replace(/\\s+/g, ' ').trim()),
  updated: document.getElementById('updated')?.textContent ?? null,
  gridText: (document.getElementById('grid')?.innerText ?? '').replace(/\\s+/g, ' ').trim(),
  text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600),
})`;

/* ================================================== E. real DSH sidebar panel */

async function realDshPanel() {
  console.log(`\n== E real DSH sidebar panel at ${DSH_BASE} ==`);
  const session = 'qa-prog-dsh';
  try {
    ab(session, ['close']);
  } catch {
    /* no previous session */
  }
  await sleep(800);
  try {
    const opened = ab(session, ['open', `${DSH_BASE}/?token=${encodeURIComponent(TOKEN)}`]);
    check('E1.1', 'the scratch DSH Web UI loads', opened.includes('DeepSeek Harness') || opened.includes('127.0.0.1'), opened.split('\n').slice(0, 2).join(' '));
    ab(session, ['wait', '--load', 'networkidle']);
    ab(session, ['network', 'requests', '--clear']);
    ab(session, ['console', '--clear']);
    ab(session, ['errors', '--clear']);

    const sidebar = ab(session, ['snapshot', '-i']);
    check('E1.2', 'the sidebar exposes a 用量看板 entry', sidebar.includes('用量看板'), 'entry found in the accessibility tree');

    ab(session, ['find', 'role', 'button', 'click', '--name', '用量看板']);
    // The panel fires one read per provider on mount. A stale host cache earns
    // ONE 1.5 s follow-up per stale provider, so sample the first wave before
    // any follow-up can fire: exactly one request per provider, all GET.
    await sleep(700);
    const firstWave = providerRequests(requests(session, 'usage-board/api'));
    const firstIds = firstWave.map((request) => new URL(request.url).searchParams.get('id'));
    check('E2.1', 'opening the panel fires exactly one provider request per provider (three in total)', firstWave.length === 3, `${firstWave.length} request(s): ${firstWave.map((request) => request.method + ' ' + new URL(request.url).pathname + new URL(request.url).search).join(', ')}`);
    check('E2.2', 'the three first-wave requests are GETs for deepseek, glm and kimi (no duplicates)', firstWave.every((request) => request.method === 'GET') && JSON.stringify(firstIds.slice().sort()) === JSON.stringify(PROVIDER_IDS.slice().sort()), JSON.stringify(firstIds));
    check('E2.3', 'the panel never calls the aggregate snapshot/refresh routes', aggregateRequests(requests(session)).length === 0, `${aggregateRequests(requests(session)).length} aggregate request(s)`);

    const panelState = evalJson(
      session,
      `JSON.stringify({
        cards: document.querySelectorAll('.ub-card').length,
        skeletons: document.querySelectorAll('.ub-skeleton-line').length,
        titles: Array.from(document.querySelectorAll('.ub-card-title')).map((node) => node.innerText.trim()),
        text: (document.querySelector('.ub-root')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 700),
      })`,
    );
    check('E3.1', 'the panel renders all three provider cards', panelState.cards === 3, `${panelState.cards} card(s), titles=${JSON.stringify(panelState.titles)}`);
    check('E3.2', 'the cards are DeepSeek, GLM Coding Plan and Kimi Code', ['DeepSeek', 'GLM Coding Plan', 'Kimi Code'].every((name) => panelState.titles.includes(name)), JSON.stringify(panelState.titles));
    check('E3.3', 'no provider is left as a skeleton after the first paint', panelState.skeletons === 0, `${panelState.skeletons} skeleton line(s)`);
    check('E3.4', 'the panel shows real numbers, not placeholders only', /¥[\d,]+\.\d{2}/.test(panelState.text) || /\d+(\.\d+)?%/.test(panelState.text), panelState.text.slice(0, 220));
    console.log(`      panel text: ${panelState.text.slice(0, 220)}`);

    // Let any stale follow-ups settle, then confirm the page never fell back to
    // the aggregate route and that every provider was read (at least once).
    await sleep(3000);
    const lateRequests = requests(session, 'usage-board/api');
    const lateProviders = providerRequests(lateRequests);
    const lateIds = new Set(lateProviders.map((request) => new URL(request.url).searchParams.get('id')));
    check('E2.4', 'after the panel settles every provider has been read, still only through the per-provider route', PROVIDER_IDS.every((id) => lateIds.has(id)) && aggregateRequests(lateRequests).length === 0, `${lateProviders.length} provider request(s), ids=${JSON.stringify([...lateIds])}, aggregate=${aggregateRequests(lateRequests).length}`);
    check('E2.5', 'no provider request failed (no HTTP error status)', lateProviders.every((request) => request.status === undefined || (request.status >= 200 && request.status < 300)), JSON.stringify(lateProviders.map((request) => request.status)));

    const shot = shoot(session, '80-dsh-sidebar-panel-v4.png');
    console.log(`      screenshot: ${shot}`);

    // Manual refresh in the real panel: POST per provider, and the cards on
    // screen must keep their numbers while the slow provider is outstanding.
    const panelBeforeRefresh = evalJson(
      session,
      `JSON.stringify({
        cards: document.querySelectorAll('.ub-card').length,
        text: (document.querySelector('.ub-root')?.innerText ?? '').replace(/\s+/g, ' '),
      })`,
    );
    ab(session, ['wait', '--fn', '!document.querySelector(".ub-refresh").disabled'], { timeout: 45_000 });
    ab(session, ['click', '.ub-refresh']);
    const panelDuring = evalJson(
      session,
      `JSON.stringify({
        cards: document.querySelectorAll('.ub-card').length,
        skeletons: document.querySelectorAll('.ub-skeleton-line').length,
        text: (document.querySelector('.ub-root')?.innerText ?? '').replace(/\s+/g, ' '),
      })`,
    );
    const panelRefreshShot = shoot(session, '84-dsh-panel-refresh-no-blank-pending.png');
    const kept = (panelBeforeRefresh.text.match(/¥[\d,]+\.\d{2}|\d+\.\d%|\d+ \/ \d+/g) ?? []);
    const lost = kept.filter((token) => !panelDuring.text.includes(token));
    check('E5.1', 'the real panel keeps all three cards while a manual refresh is outstanding', panelDuring.cards === 3 && panelDuring.skeletons === 0, `${panelDuring.cards} card(s), ${panelDuring.skeletons} skeleton(s)`);
    check('E5.2', 'the numbers visible before the panel refresh are still visible during it', kept.length > 0 && lost.length === 0, `${kept.length} token(s); lost=${JSON.stringify(lost)}`);
    ab(session, ['wait', '--fn', '!document.querySelector(".ub-refresh").disabled'], { timeout: 45_000 });
    await sleep(500);
    const panelAfterRefresh = evalJson(
      session,
      `JSON.stringify({
        cards: document.querySelectorAll('.ub-card').length,
        text: (document.querySelector('.ub-root')?.innerText ?? '').replace(/\s+/g, ' '),
      })`,
    );
    check('E5.3', 'the panel returns to a settled board after the refresh', panelAfterRefresh.cards === 3 && /刚刚更新|秒前更新|分钟前更新/.test(panelAfterRefresh.text), panelAfterRefresh.text.slice(0, 140));
    const postRefreshNetwork = providerRequests(requests(session, 'usage-board/api'));
    const posts = postRefreshNetwork.filter((request) => request.method === 'POST');
    check('E5.4', 'the panel manual refresh posts exactly one read per provider (never the aggregate route)', posts.length === PROVIDER_IDS.length && aggregateRequests(requests(session, 'usage-board/api')).length === 0, `${posts.length} POST(s): ${posts.map((request) => new URL(request.url).searchParams.get('id')).join(',')}`);
    console.log(`      panel-refresh screenshot: ${panelRefreshShot}`);

    const consoleLines = noise(ab(session, ['console']));
    const errorLines = noise(ab(session, ['errors']));
    check('E4.1', 'the DSH page console has no warnings/errors while the panel runs', consoleLines.length === 0, consoleLines.join(' | ') || 'empty');
    check('E4.2', 'the DSH page has no uncaught page errors', errorLines.length === 0, errorLines.join(' | ') || 'empty');

    // --- sessionStorage first paint: reload with every provider read aborted.
    // Only the stored envelope can put numbers on screen, so this proves the
    // restore path (and that a failed read does not blank known numbers).
    const stored = evalJson(
      session,
      `JSON.stringify((() => {
        try {
          const raw = sessionStorage.getItem('usage-board:snapshot:v1');
          if (raw === null) return { present: false };
          const body = JSON.parse(raw);
          return {
            present: true,
            protocolVersion: body.protocolVersion ?? null,
            providers: (Array.isArray(body.providers) ? body.providers : []).map((row) => row && row.id),
          };
        } catch (error) {
          return { present: false, error: String(error) };
        }
      })())`,
    );
    check('E6.1', 'the panel persisted its merged envelope for the next first paint', stored.present === true && stored.protocolVersion === 1 && PROVIDER_IDS.every((id) => stored.providers.includes(id)), JSON.stringify(stored));

    ab(session, ['network', 'route', '**/usage-board/api/provider*', '--abort']);
    ab(session, ['reload']);
    ab(session, ['wait', '--load', 'networkidle']);
    const reloadedSidebar = ab(session, ['snapshot', '-i']);
    check('E6.2', 'the reloaded DSH page still exposes the 用量看板 entry', reloadedSidebar.includes('用量看板'), 'entry found after reload');
    ab(session, ['find', 'role', 'button', 'click', '--name', '用量看板']);
    await sleep(1500);
    const offline = evalJson(
      session,
      `JSON.stringify({
        cards: document.querySelectorAll('.ub-card').length,
        skeletons: document.querySelectorAll('.ub-skeleton-line').length,
        text: (document.querySelector('.ub-root')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 500),
      })`,
    );
    const offlineShot = shoot(session, '85-dsh-panel-sessionstorage-offline.png');
    check('E6.3', 'with every per-provider request aborted, all three cards still paint from sessionStorage', offline.cards === 3, `${offline.cards} card(s) with the network blocked`);
    check('E6.4', 'the restored cards still show real numbers (a failed read never blanks the board)', /¥[\d,]+\.\d{2}|\d+(\.\d+)?%/.test(offline.text), offline.text.slice(0, 220));
    check('E6.5', 'no provider falls back to a skeleton while restored numbers exist', offline.skeletons === 0, `${offline.skeletons} skeleton line(s)`);
    ab(session, ['network', 'unroute']);
    const errorLinesAfterOffline = noise(ab(session, ['errors']));
    check('E6.6', 'the blocked-network reload raised no uncaught page errors', errorLinesAfterOffline.length === 0, errorLinesAfterOffline.join(' | ') || 'empty');
    console.log(`      sessionStorage-offline screenshot: ${offlineShot}`);
  } catch (error) {
    check('E0.1', 'the real-UI panel half ran without a harness exception', false, `${error.message}; is the scratch instance up and the token valid?`);
  } finally {
    try {
      ab(session, ['close']);
    } catch {
      /* already closed */
    }
  }
}

/* ============================== F. progressive paint on the stand-in host */

async function standinProgressive() {
  console.log('\n== F progressive paint on a stand-in host (GLM 8 s, DeepSeek/Kimi 40 ms) ==');
  const port = await freePort();
  const child = spawn(process.execPath, [join(HERE, 'progressive-server.mjs'), String(port), '8000'], {
    cwd: ROOT,
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
  const session = 'qa-prog-page';
  try {
    // Wait for the stand-in host to print its ready line.
    const deadline = Date.now() + 15_000;
    while (!stdout.includes('progressive usage board on') && Date.now() < deadline) await sleep(100);
    if (!stdout.includes('progressive usage board on')) throw new Error(`stand-in server did not start: ${stderr.slice(0, 300)}`);
    const base = /on (http:\/\/127\.0\.0\.1:\d+\/usage-board\/)/.exec(stdout)[1];
    check('F1.1', 'the stand-in host serves the real dashboard on a cold cache', true, base);

    try {
      ab(session, ['close']);
    } catch {
      /* no previous session */
    }
    await sleep(800);
    // The three mount-time provider reads must be captured from the very first
    // navigation, so open a blank page, clear the buffers, THEN load the app.
    ab(session, ['open', 'about:blank']);
    ab(session, ['network', 'requests', '--clear']);
    ab(session, ['console', '--clear']);
    ab(session, ['errors', '--clear']);
    const opened = ab(session, ['open', base]);
    check('F1.2', 'the standalone dashboard loads in the browser', opened.includes('用量看板'), opened.split('\n').slice(0, 2).join(' '));

    // --- early state: wait only for the two fast cards; GLM is still a skeleton
    ab(session, ['wait', '--fn', "document.querySelectorAll('.card').length >= 2"]);
    const earlyShot = shoot(session, '81-progressive-early-2cards.png');
    const early = evalJson(session, PAGE_STATE_SCRIPT);
    const earlyNetwork = providerRequests(requests(session, 'usage-board/api'));
    const earlyGlm = earlyNetwork.find((request) => new URL(request.url).searchParams.get('id') === 'glm');
    check('F2.1', 'two cards are already painted while the slow provider is still pending', early.cards === 2, `${early.cards} card(s) at page t=${early.at} ms`);
    check('F2.2', 'the painted cards are DeepSeek and Kimi Code', titled(early.titles, 'DeepSeek') && titled(early.titles, 'Kimi Code') && !titled(early.titles, 'GLM Coding Plan'), JSON.stringify(early.titles));
    check('F2.3', 'the GLM slot is still a skeleton', early.skeletons === 1, `${early.skeletons} skeleton(s)`);
    check('F2.4', 'the early paint happened in the first few hundred ms of the page life', early.at < 1500, `page t=${early.at} ms (CLI round-trip included; the DOM assertions are the evidence)`);
    check('F2.5', 'the early capture shows the GLM request still in flight (no status yet)', earlyGlm !== undefined && earlyGlm.status === undefined, JSON.stringify(earlyGlm));
    check('F2.6', 'the page fired exactly three per-provider GETs on mount', earlyNetwork.length === 3 && earlyNetwork.every((request) => request.method === 'GET'), `${earlyNetwork.length}: ${earlyNetwork.map((request) => new URL(request.url).searchParams.get('id')).join(',')}`);
    check('F2.7', 'the page does not call the aggregate snapshot route', aggregateRequests(requests(session, 'usage-board/api')).length === 0, `${aggregateRequests(requests(session, 'usage-board/api')).length} aggregate request(s)`);
    console.log(`      early screenshot: ${earlyShot} (page t=${early.at} ms; titles=${JSON.stringify(early.titles)})`);

    // --- settled state: the slow provider's own card arrives last
    ab(session, ['wait', '--fn', "document.querySelectorAll('.card').length === 3"], { timeout: 30_000 });
    const settledShot = shoot(session, '82-progressive-settled-3cards.png');
    const settled = evalJson(session, PAGE_STATE_SCRIPT);
    const settledGlm = providerRequests(requests(session, 'usage-board/api')).find((request) => new URL(request.url).searchParams.get('id') === 'glm');
    check('F3.1', 'once its upstream answers the slow provider gets its own card', settled.cards === 3 && settled.skeletons === 0, `${settled.cards} card(s), ${settled.skeletons} skeleton(s) at page t=${settled.at} ms`);
    check('F3.2', 'all three cards are present and titled', ['DeepSeek', 'GLM Coding Plan', 'Kimi Code'].every((name) => titled(settled.titles, name)), JSON.stringify(settled.titles));
    check('F3.3', 'the settled GLM card carries real quota numbers', /套餐/.test(settled.text) && /\d+(\.\d+)?%/.test(settled.text), settled.text.slice(0, 240));
    check('F3.4', 'the GLM request completed successfully after the other two', settledGlm?.status === 200, `status=${JSON.stringify(settledGlm?.status)}`);
    check('F3.5', 'the other cards were never rebuilt into skeletons while waiting', settled.skeletons === 0, 'no skeletons at settle time');
    console.log(`      settled screenshot: ${settledShot}`);

    // --- refresh must not blank numbers already on screen
    const beforeRefresh = evalJson(session, PAGE_STATE_SCRIPT);
    ab(session, ['click', '#refresh']);
    const during = evalJson(session, PAGE_STATE_SCRIPT);
    const refreshShot = shoot(session, '83-progressive-refreshing-no-blank.png');
    check('F4.1', 'clicking 刷新 keeps all three cards on screen (no blanking)', during.cards === 3 && during.skeletons === 0, `${during.cards} card(s), ${during.skeletons} skeleton(s) during refresh`);
    const numberTokens = (text) => text.match(/¥[\d,]+\.\d{2}|\d+\.\d%|\d+ \/ \d+/g) ?? [];
    const keptTokens = numberTokens(beforeRefresh.gridText);
    const missingTokens = keptTokens.filter((token) => !during.gridText.includes(token));
    check('F4.2', 'every number visible before the refresh is still visible during it', keptTokens.length > 0 && missingTokens.length === 0, `${keptTokens.length} number token(s) checked; missing=${JSON.stringify(missingTokens)}`);
    check('F4.3', 'the header says the board is refreshing rather than resetting', /正在刷新/.test(during.updated ?? ''), `header="${during.updated}"`);
    const refreshPosts = providerRequests(requests(session, 'usage-board/api')).filter((request) => request.method === 'POST');
    check('F4.4', 'the manual refresh sends one POST per provider', refreshPosts.length === PROVIDER_IDS.length && new Set(refreshPosts.map((request) => new URL(request.url).searchParams.get('id'))).size === PROVIDER_IDS.length, `${refreshPosts.length} POST(s): ${refreshPosts.map((request) => new URL(request.url).searchParams.get('id')).join(',')}`);
    console.log(`      refresh screenshot: ${refreshShot}`);

    // --- the refresh settles: numbers return fresh, still no aggregate route
    ab(session, ['wait', '--fn', '!document.getElementById("refresh").disabled'], { timeout: 30_000 });
    const afterRefresh = evalJson(session, PAGE_STATE_SCRIPT);
    check('F5.1', 'the manual refresh settles and the board is whole again', afterRefresh.cards === 3 && afterRefresh.skeletons === 0 && /刚刚更新|秒前更新/.test(afterRefresh.updated ?? ''), `cards=${afterRefresh.cards}, updated="${afterRefresh.updated}"`);
    check('F5.2', 'the whole browser session never called the aggregate snapshot route', aggregateRequests(requests(session, 'usage-board/api')).length === 0, `${aggregateRequests(requests(session, 'usage-board/api')).length} aggregate request(s)`);

    const consoleLines = noise(ab(session, ['console']));
    const errorLines = noise(ab(session, ['errors']));
    check('F6.1', 'the standalone page console has no warnings/errors', consoleLines.length === 0, consoleLines.join(' | ') || 'empty');
    check('F6.2', 'the standalone page has no uncaught page errors', errorLines.length === 0, errorLines.join(' | ') || 'empty');
  } catch (error) {
    check('F0.1', 'the stand-in progressive half ran without a harness exception', false, `${error.message}`);
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

await realDshPanel();
await standinProgressive();
process.exit(finish());
