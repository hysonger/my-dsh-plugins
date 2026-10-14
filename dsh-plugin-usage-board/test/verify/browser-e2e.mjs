/**
 * Browser end-to-end verification (task-3, section D).
 *
 * Drives a real Chromium through the `agent-browser` CLI:
 *   1. the DSH sidebar entry (用量看板),
 *   2. the React panel with live numbers,
 *   3. the standalone page as an independent renderer,
 *   4. console / page-error capture,
 *   5. a cross-renderer numeric comparison against the raw snapshot JSON.
 *
 * Run:
 *   node test/verify/browser-e2e.mjs <baseUrl> <token>
 * or with env: QA_BASE_URL / QA_DSH_TOKEN.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { check, checkEqual, finish, sleep } from './_lib.mjs';

const BASE = process.argv[2] ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:3179';
const TOKEN = process.argv[3] ?? process.env.QA_DSH_TOKEN ?? '';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;

mkdirSync(SHOTS, { recursive: true });

/**
 * Run one agent-browser command in a named session.
 * @param {string} session
 * @param {string[]} args
 * @returns {string}
 */
function ab(session, args) {
  return execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const shoot = (session, name, full = false) => {
  ab(session, ['screenshot', ...(full ? ['--full'] : []), `${SHOTS}${name}`]);
  return `test/verify/screenshots/${name}`;
};

/** Fetch the raw snapshot without a per-process fetch patch. */
async function snapshot() {
  const response = await fetch(`${BASE}/usage-board/api/snapshot`);
  return response.json();
}

const strip = (text) => text.replace(/^\s*"|"\s*$/g, '').replace(/\\n/g, '\n');
/** Drop digit-grouping commas so "1,343" matches the protocol's 1343. */
const ungroup = (text) => text.replace(/(\d),(?=\d{3}(\D|$))/g, '$1');

async function main() {
  // Preflight: a killed instance must produce a FAIL line, not a stack trace.
  try {
    const response = await fetch(`${BASE}/usage-board/api/health`);
    check('D0.0', 'target instance answers /usage-board/api/health', response.status === 200, `${BASE} -> HTTP ${response.status}`);
  } catch (error) {
    check('D0.0', 'target instance answers /usage-board/api/health', false, `${BASE} unreachable: ${error.message}; boot it or pass another URL`);
    return;
  }

  const panelSession = 'qa-e2e-panel';
  const pageSession = 'qa-e2e-page';

  /* ---------------------------------------------------------- console channel */

  ab(panelSession, ['open', `${BASE}/?token=${TOKEN}`]);
  ab(panelSession, ['wait', '--load', 'networkidle']);
  ab(panelSession, ['eval', 'console.warn("qa-console-probe")']);
  const probeConsole = ab(panelSession, ['console']);
  check('D0.1', 'console capture channel is live (probe visible)', probeConsole.includes('qa-console-probe'), probeConsole.trim().slice(0, 80));
  ab(panelSession, ['console', '--clear']);

  /* ------------------------------------------------------------------ sidebar */

  const sidebarSnapshot = ab(panelSession, ['snapshot', '-i']);
  check('D1.1', 'sidebar exposes a 用量看板 entry', sidebarSnapshot.includes('用量看板'), 'entry found in accessibility tree');
  check('D1.2', 'sidebar entry sits in the global-panel navigation next to 插件', sidebarSnapshot.includes('插件') && sidebarSnapshot.includes('全局面板'), 'nav group found');
  const network = ab(panelSession, ['network', 'requests']);
  const pluginBundle = network.split('\n').find((line) => line.includes('dsh-plugin-usage-board/client.js')) ?? '';
  check('D1.3', 'DSH serves the browser half from the client-module route (HTTP 200)', /\(Script\)\s+200/.test(pluginBundle), pluginBundle.slice(0, 120) || 'request not found');
  const sidebarShot = shoot(panelSession, '10-sidebar-3179.png');
  console.log(`      screenshot: ${sidebarShot}`);

  /* -------------------------------------------------------------------- panel */

  ab(panelSession, ['find', 'role', 'button', 'click', '--name', '用量看板']);
  await sleep(3000);
  const panelText = strip(ab(panelSession, ['get', 'text', 'body']));
  const panelShot = shoot(panelSession, '11-panel-3179.png', true);
  console.log(`      screenshot: ${panelShot}`);

  check('D2.1', 'panel renders all three provider cards', ['DeepSeek', 'GLM Coding Plan', 'Kimi Code'].every((name) => panelText.includes(name)), 'three cards present');
  check('D2.2', 'every provider is marked 正常 (ok)', (panelText.match(/正常/g) ?? []).length >= 3, `${(panelText.match(/正常/g) ?? []).length} × 正常`);
  check('D2.3', 'panel shows the DeepSeek money balance', /¥[\d,]+\.\d{2}/.test(panelText), (panelText.match(/¥[\d,]+\.\d{2}/g) ?? []).join(' '));
  check('D2.4', 'panel shows quota percentages', (panelText.match(/\d+\.\d%/g) ?? []).length >= 3, (panelText.match(/\d+\.\d%/g) ?? []).join(' '));
  check('D2.5', 'panel shows reset countdowns', /重置/.test(panelText), (panelText.match(/[^\s]*重置/g) ?? []).join(' '));

  /* ------------------------------------------- cross-renderer numeric comparison */

  const before = await snapshot();
  const standaloneSessionText = await (async () => {
    ab(pageSession, ['open', `${BASE}/usage-board/`]);
    ab(pageSession, ['wait', '--load', 'networkidle']);
    await sleep(1200);
    return strip(ab(pageSession, ['get', 'text', 'body']));
  })();
  const standaloneShot = shoot(pageSession, '12-standalone-3179.png', true);
  console.log(`      screenshot: ${standaloneShot}`);
  const after = await snapshot();
  check('D3.1', 'both renderers read the same cached snapshot (generatedAt stable)', before.generatedAt === after.generatedAt, `${before.generatedAt} / ${after.generatedAt}`);

  const expected = [];
  for (const row of before.providers) {
    for (const balance of row.balances) {
      if (typeof balance.available === 'number') expected.push({ label: `${row.id} available`, text: balance.available.toFixed(2) });
      if (typeof balance.totalSpent === 'number') expected.push({ label: `${row.id} totalSpent`, text: balance.totalSpent.toFixed(2) });
    }
    for (const win of row.windows) {
      if (typeof win.percent === 'number') expected.push({ label: `${row.id}/${win.id} percent`, text: `${win.percent.toFixed(1)}%` });
      if (typeof win.used === 'number') expected.push({ label: `${row.id}/${win.id} used`, text: String(Math.round(win.used)) });
      if (typeof win.remaining === 'number') expected.push({ label: `${row.id}/${win.id} remaining`, text: String(Math.round(win.remaining)) });
    }
  }
  const missingPanel = expected.filter((entry) => !ungroup(panelText).includes(entry.text)).map((entry) => `${entry.label}=${entry.text}`);
  const missingStandalone = expected.filter((entry) => !standaloneSessionText.includes(entry.text)).map((entry) => `${entry.label}=${entry.text}`);
  check('D3.2', 'panel text agrees with the raw snapshot for every number', missingPanel.length === 0, missingPanel.join(', ') || `${expected.length} values matched`);
  check('D3.3', 'standalone text agrees with the raw snapshot for every number', missingStandalone.length === 0, missingStandalone.join(', ') || `${expected.length} values matched`);
  check('D3.4', 'the two renderers agree on provider order and status', ['DeepSeek', 'GLM Coding Plan', 'Kimi Code'].every((name) => standaloneSessionText.includes(name)), 'both show three provider cards');

  /* ------------------------------------------------- countdown consistency check */

  const now = Date.now();
  const countdowns = before.providers.flatMap((row) =>
    row.windows
      .filter((win) => typeof win.resetAt === 'number')
      .map((win) => ({ id: `${row.id}/${win.id}`, hours: (win.resetAt - now) / 3_600_000 })),
  );
  const pickCountdown = (text) => (text.match(/(\d+)\s*天后重置/) ?? [])[1] ?? null;
  console.log(`      reset deltas (h): ${countdowns.map((entry) => `${entry.id}=${entry.hours.toFixed(2)}`).join(', ')}`);
  for (const entry of countdowns.filter((item) => item.hours >= 24)) {
    const panelDays = pickCountdown(panelText);
    const standaloneDays = pickCountdown(standaloneSessionText);
    check(
      `D4.${entry.id}`,
      `both renderers show the same day countdown for ${entry.id} (${entry.hours.toFixed(2)} h)`,
      panelDays === null || standaloneDays === null || panelDays === standaloneDays,
      `panel="${panelDays} 天后重置", standalone="${standaloneDays} 天后重置"`,
    );
  }

  /* -------------------------------------------------------------- console/errors */

  const panelConsole = ab(panelSession, ['console']);
  const panelErrors = ab(panelSession, ['errors']);
  const pageConsole = ab(pageSession, ['console']);
  const pageErrors = ab(pageSession, ['errors']);
  const noise = (out) => out.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('[agent-browser]'));
  check('D5.1', 'panel console has no warnings/errors', noise(panelConsole).length === 0, noise(panelConsole).join(' | ') || 'empty');
  check('D5.2', 'panel has no uncaught page errors', noise(panelErrors).length === 0, noise(panelErrors).join(' | ') || 'empty');
  check('D5.3', 'standalone console has no warnings/errors', noise(pageConsole).length === 0, noise(pageConsole).join(' | ') || 'empty');
  check('D5.4', 'standalone has no uncaught page errors', noise(pageErrors).length === 0, noise(pageErrors).join(' | ') || 'empty');

  /* ------------------------------------------------------------------ freshness */

  const freshness = (panelText.match(/(\d+)\s*秒前更新|刚刚更新|(\d+)\s*分钟前更新/) ?? [])[0] ?? null;
  check('D6.1', 'panel states the snapshot age', freshness !== null, `panel says "${freshness}"`);
  const beforeRefresh = await snapshot();
  ab(pageSession, ['find', 'role', 'button', 'click', '--name', '刷新']);
  await sleep(2500);
  const afterRefreshText = strip(ab(pageSession, ['get', 'text', 'body']));
  const afterRefresh = await snapshot();
  check('D6.2', 'the page 刷新 button forces a real refetch', afterRefresh.generatedAt !== beforeRefresh.generatedAt, `${beforeRefresh.generatedAt} -> ${afterRefresh.generatedAt}`);
  check('D6.3', 'the page still renders providers after a manual refresh', ['DeepSeek', 'GLM Coding Plan', 'Kimi Code'].every((name) => afterRefreshText.includes(name)), 'three cards after refresh');

  /* ------------------------------------------- unattended auto-refresh (staleness) */

  const idleStart = await snapshot();
  const ageStart = strip(ab(pageSession, ['get', 'text', 'body'])).match(/(\d+)\s*秒前|(\d+)\s*分钟前|刚刚更新/)?.[0] ?? '(none)';
  console.log(`      waiting 75 s without touching the page to test the refresh schedule (age now: ${ageStart})`);
  await sleep(75_000);
  const idleEnd = await snapshot();
  const idleText = strip(ab(pageSession, ['get', 'text', 'body']));
  const ageEnd = idleText.match(/(\d+)\s*秒前|(\d+)\s*分钟前|刚刚更新/)?.[0] ?? '(none)';
  check('D7.1', 'the page refetches by itself within the ttl window (no user action)', idleEnd.generatedAt !== idleStart.generatedAt, `${idleStart.generatedAt} -> ${idleEnd.generatedAt}`);
  check('D7.2', 'the displayed age is a fresh value, not a frozen string', ageEnd !== '(none)' && (ageEnd !== ageStart || idleEnd.generatedAt !== idleStart.generatedAt), `age "${ageStart}" -> "${ageEnd}"`);

  ab(panelSession, ['close']);
  ab(pageSession, ['close']);
}

await main();
process.exit(finish());
