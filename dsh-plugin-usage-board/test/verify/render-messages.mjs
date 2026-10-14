/**
 * Render-truth check for `messageKey` (task-3 round 2, defect D-10).
 *
 * The host classifies a provider failure into a stable `messageKey`; each
 * renderer turns that key into a sentence. This harness asserts what the user
 * actually reads is the sentence for the *correct* diagnosis, by
 * independently deciding the intended key from the row's `status` and `message`
 * and comparing it against the text rendered in a real browser.
 *
 * It is deliberately not a re-implementation of `classifyMessage`: the intent
 * table below is written from the protocol documentation, so a classifier that
 * picks a plausible-but-wrong key fails here.
 *
 * Run: `node test/verify/render-messages.mjs <baseUrl> [panelToken]`
 * The base URL may be a normal instance; with no non-ok rows the harness says so
 * instead of passing vacuously.
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { check, finish, request, sleep, tryJson } from './_lib.mjs';

const BASE = process.argv[2] ?? process.env.QA_DEGRADED_BASE ?? 'http://127.0.0.1:3182';
const TOKEN = process.argv[3] ?? process.env.QA_DEGRADED_TOKEN ?? '';

/**
 * The diagnosis a user should be given for a row, from the protocol's own
 * vocabulary. Status alone decides it here; the message text only separates the
 * `status.*` catch-all from the semantic keys.
 * @param {{status: string, message: string|null}} row
 * @returns {string}
 */
function intendedKey(row) {
  switch (row.status) {
    case 'not-configured':
      return 'notConfigured';
    case 'unauthorized':
      return 'authRejected';
    case 'rate-limited':
      return 'rateLimited';
    case 'network-error':
      return /cancel/i.test(row.message ?? '') ? 'cancelled' : 'unreachable';
    case 'invalid-response':
      return 'badResponse';
    case 'upstream-error':
      return /adapter failed/i.test(row.message ?? '') ? 'adapterFailed' : 'status.upstream-error';
    default:
      return `status.${row.status}`;
  }
}

/** Decode `\uXXXX` escapes and `\"` used by the generated bundle. */
const decode = (text) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/\\"/g, '"');

/** Parse the standalone page's literal dictionary (bare or quoted keys). */
function dictionaryFromDashboard(html) {
  const block = /const MESSAGE_TEXT = \{([\s\S]*?)\n  \};/.exec(html)?.[1] ?? '';
  const entries = {};
  for (const match of block.matchAll(/(?:'([^']+)'|([A-Za-z][\w.-]*)):\s*'([^']*)'/g)) {
    entries[match[1] ?? match[2]] = match[3];
  }
  return entries;
}

/**
 * Parse the React bundle's dictionary (namespaced keys, escaped CJK). The bundle
 * carries the Chinese dictionary first and the English one second, so the first
 * occurrence of a key wins.
 */
function dictionaryFromBundle(js) {
  const entries = {};
  for (const match of js.matchAll(/"(message\.[A-Za-z.]+|status\.[a-z-]+)":\s*"((?:\\u[0-9a-fA-F]{4}|[^"\\])*)"/g)) {
    if (!(match[1] in entries)) entries[match[1]] = decode(match[2]);
  }
  return entries;
}

const ab = (session, args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const strip = (text) => text.replace(/^\s*"|"\s*$/g, '').replace(/\\n/g, '\n');

/**
 * Read the page body until every needle appears (a cold snapshot can take
 * seconds, and a skeleton page has no provider labels at all).
 * @param {string} session
 * @param {string[]} needles
 * @param {number} [timeoutMs]
 * @returns {string}
 */
async function bodyUntil(session, needles, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let text = '';
  for (;;) {
    text = strip(ab(session, ['get', 'text', 'body']));
    if (needles.every((needle) => text.includes(needle))) return text;
    if (Date.now() > deadline) return text;
    await sleep(1000);
  }
}

const LABELS = { deepseek: 'DeepSeek', glm: 'GLM Coding Plan', kimi: 'Kimi Code' };

/**
 * The slice of a rendered page that belongs to one provider's card, so a
 * sentence on another card cannot satisfy this card's assertion. Both renderers
 * put the provider label on its own line; the standalone header line joins all
 * three labels, so it is not mistaken for a card.
 * @param {string} text
 * @param {string} id
 * @returns {string}
 */
function cardText(text, id) {
  const lines = text.split('\n').map((line) => line.trim());
  const label = LABELS[id];
  const labelLines = new Set(Object.values(LABELS));
  let start = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index] === label) {
      start = index;
      break;
    }
  }
  if (start < 0) return '';
  const card = [];
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && labelLines.has(lines[index])) break;
    card.push(lines[index]);
  }
  return card.join(' ');
}

const snapshot = tryJson((await request(`${BASE}/usage-board/api/snapshot`)).text);
if (snapshot === null) {
  check('R0', `snapshot reachable at ${BASE}`, false, 'could not fetch/parse /usage-board/api/snapshot');
  process.exit(finish());
}

const dashboard = await readFile(new URL('../../src/host/web/dashboard.html', import.meta.url), 'utf8');
const bundle = await readFile(new URL('../../lib/client.js', import.meta.url), 'utf8');
const pageDict = dictionaryFromDashboard(dashboard);
const panelDict = dictionaryFromBundle(bundle);
check('R1', 'both renderers ship a non-empty message dictionary', Object.keys(pageDict).length >= 8 && Object.keys(panelDict).length >= 8, `page=${Object.keys(pageDict).length} keys, panel=${Object.keys(panelDict).length} keys`);
check('R2', 'every bare key the host can emit exists in the page dictionary', ['notConfigured', 'authRejected', 'noCodingPlan', 'rateLimited', 'unreachable', 'cancelled', 'badResponse', 'adapterFailed', 'noHost'].every((key) => typeof pageDict[key] === 'string'), Object.keys(pageDict).join(', '));
check('R3', 'every bare key has a panel translation under message.*', ['notConfigured', 'authRejected', 'noCodingPlan', 'rateLimited', 'unreachable', 'cancelled', 'badResponse', 'adapterFailed', 'noHost'].every((key) => typeof panelDict[`message.${key}`] === 'string'), Object.keys(panelDict).filter((key) => key.startsWith('message.')).join(', '));

const failed = snapshot.providers.filter((row) => row.status !== 'ok');
console.log(`\n== render truth at ${BASE} — ${failed.length} non-ok row(s) ==`);
if (failed.length === 0) {
  console.log('      no degraded rows on this instance: nothing to render-check (point the harness at a degraded instance).');
}

const expected = failed.map((row) => {
  const key = intendedKey(row);
  // The page resolves a bare key; the panel tries the namespaced form first.
  const pageText = pageDict[key] ?? null;
  const panelText = panelDict[`message.${key}`] ?? panelDict[key] ?? null;
  check(`R4.${row.id}`, `${row.id}: host key matches the intended diagnosis (${key})`, row.messageKey === key, `status=${row.status} messageKey=${JSON.stringify(row.messageKey)} intended=${key}`);
  return { id: row.id, key, pageText, panelText, renderedKey: row.messageKey };
});

if (failed.length > 0) {
  ab('qa-msg-page', ['open', `${BASE}/usage-board/`]);
  ab('qa-msg-page', ['wait', '--load', 'networkidle']);
  const pageText = await bodyUntil('qa-msg-page', Object.values(LABELS));
  for (const entry of expected) {
    const card = cardText(pageText, entry.id);
    const okText = entry.pageText !== null && card.includes(entry.pageText);
    check(`R5.${entry.id}`, `standalone ${entry.id} card shows the ${entry.key} sentence`, okText, okText ? entry.pageText : `card reads: ${JSON.stringify(card.replace(/\s+/g, ' ').slice(0, 120))}`);
    // R7: and it must not carry the sentence of any OTHER diagnosis — the
    // failure mode that made D-10 user-visible was a plausible wrong sentence.
    const wrong = Object.entries(pageDict).filter(([otherKey, sentence]) => otherKey !== entry.key && sentence !== entry.pageText && card.includes(sentence)).map(([otherKey]) => otherKey);
    check(`R7.${entry.id}`, `standalone ${entry.id} card carries no other diagnosis's sentence`, wrong.length === 0, wrong.length === 0 ? `only ${entry.key}` : `also shows: ${wrong.join(', ')}`);
  }
  ab('qa-msg-page', ['close']);

  if (TOKEN !== '') {
    ab('qa-msg-panel', ['open', `${BASE}/?token=${TOKEN}`]);
    ab('qa-msg-panel', ['wait', '--load', 'networkidle']);
    ab('qa-msg-panel', ['find', 'role', 'button', 'click', '--name', '用量看板']);
    const panelText = await bodyUntil('qa-msg-panel', Object.values(LABELS));
    for (const entry of expected) {
      const want = entry.panelText ?? entry.pageText;
      const card = cardText(panelText, entry.id);
      const okText = want !== null && card.includes(want);
      check(`R6.${entry.id}`, `panel ${entry.id} card shows the ${entry.key} sentence`, okText, okText ? want : `card reads: ${JSON.stringify(card.replace(/\s+/g, ' ').slice(0, 140))}`);
      const wrong = Object.entries(panelDict)
        .filter(([otherKey, sentence]) => otherKey.startsWith('message.') && otherKey !== `message.${entry.key}` && sentence !== want && card.includes(sentence))
        .map(([otherKey]) => otherKey.replace('message.', ''));
      check(`R8.${entry.id}`, `panel ${entry.id} card carries no other diagnosis's sentence`, wrong.length === 0, wrong.length === 0 ? `only ${entry.key}` : `also shows: ${wrong.join(', ')}`);
    }
    ab('qa-msg-panel', ['close']);
  } else {
    console.log('      no panel token supplied: React panel render-check skipped (standalone only).');
  }
}

process.exit(finish());
