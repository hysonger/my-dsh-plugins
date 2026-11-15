#!/usr/bin/env node
/**
 * Live end-to-end verification for the usage board's four provider adapters.
 *
 * Run it directly — it is NOT part of the offline test suite:
 * ```sh
 * node test/providers.live.mjs          # human-readable table + raw JSON
 * node test/providers.live.mjs --json   # raw JSON only
 * ```
 *
 * It reads real credentials from `~/.dsh/.credentials.yaml` (override with
 * `DSH_CREDENTIALS_FILE`) with plain `node:fs` + regex — no YAML dependency —
 * and wires them into the same `getSecret`/`fetchJson` pair the host shell
 * provides. It talks to the real upstream APIs.
 *
 * Secrets are never printed: only `key.slice(0, 4) + '…' + key.slice(-4)`. As a
 * belt-and-braces check, the script greps every printed string for the raw
 * credential values and fails loudly (without echoing them) if one leaks.
 *
 * Exit code: 0 when every provider is `ok` or `not-configured`; 1 when any
 * provider reports a transport/shape failure, so this doubles as a smoke test.
 *
 * @module dsh-plugin-usage-board/test/providers.live
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROVIDERS } from '../src/host/providers/index.js';

/** Default credential store written by DSH. */
const DEFAULT_CREDENTIALS_FILE = path.join(os.homedir(), '.dsh', '.credentials.yaml');

/** Name of the credential record holding the DeepSeek Platform account grant. */
const DEEPSEEK_RECORD = 'deepseek-account-platform/default';

/**
 * Real host helper. `fetch-json.js` is the module `SnapshotService` uses, so
 * the live script exercises the production transport. If it is ever missing,
 * fall back to an equivalent inline implementation rather than crashing.
 */
async function loadFetchJson() {
  try {
    const module = await import('../src/host/fetch-json.js');
    if (typeof module.fetchJson === 'function') return { fetchJson: module.fetchJson, source: 'src/host/fetch-json.js' };
  } catch {
    /* fall through to the inline implementation */
  }
  return { fetchJson: fallbackFetchJson, source: 'inline fallback' };
}

/**
 * Minimal equivalent of the host helper, used only when it cannot be imported.
 *
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string,string>, body?: string, signal?: AbortSignal, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number|null, headers: Record<string,string>, json: unknown, text: string, error: {name: string, message: string}|null, aborted: boolean, latencyMs: number }>}
 */
async function fallbackFetchJson(url, options = {}) {
  const { method = 'GET', headers, body, signal, timeoutMs = 12_000 } = options;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  /** @type {any} */
  const result = { ok: false, status: null, headers: {}, json: undefined, text: '', error: null, aborted: false, latencyMs: 0 };
  try {
    const response = await fetch(url, { method, headers, body, redirect: 'follow', signal: controller.signal });
    result.status = response.status;
    for (const [name, value] of response.headers) result.headers[name.toLowerCase()] = value;
    result.text = (await response.text()).slice(0, 8192);
    try {
      result.json = JSON.parse(result.text);
    } catch {
      result.json = undefined;
    }
    result.ok = response.status >= 200 && response.status < 300 && result.json !== undefined;
  } catch (error) {
    result.aborted = controller.signal.aborted;
    result.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error) };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    result.latencyMs = Date.now() - started;
  }
  return result;
}

/**
 * Read `refs.<name>: <value>` out of the credential YAML without a YAML parser.
 *
 * @param {string} text
 * @param {string} name
 * @returns {string|undefined}
 */
function readRef(text, name) {
  const match = text.match(new RegExp(`^[ \\t]+${name}:[ \\t]*(\\S+)[ \\t]*$`, 'm'));
  return match?.[1];
}

/**
 * Read `<record>`'s `payload.token` out of the credential YAML.
 *
 * @param {string} text
 * @param {string} record
 * @returns {string|undefined}
 */
function readRecordToken(text, record) {
  const escaped = record.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const block = text.match(new RegExp(`^[ \\t]{2}${escaped}:[ \\t]*\\n((?:[ \\t]+.*\\n?)*)`, 'm'));
  return block?.[1]?.match(/^[ \t]+token:[ \t]*(\S+)[ \t]*$/m)?.[1];
}

/**
 * Mask a secret for display: first four and last four characters only.
 *
 * @param {string|undefined} value
 * @returns {string}
 */
function mask(value) {
  if (typeof value !== 'string' || value === '') return '(missing)';
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

/**
 * Pad a value to a fixed column width.
 *
 * @param {unknown} value
 * @param {number} width
 * @returns {string}
 */
function pad(value, width) {
  const text = value === null || value === undefined ? '-' : String(value);
  return text.length >= width ? text.slice(0, width) : text.padEnd(width);
}

/**
 * One line describing a window.
 *
 * @param {import('../src/shared/protocol.js').UsageWindow} window
 * @param {number} now
 * @returns {string}
 */
function describeWindow(window, now) {
  const percent = window.percent === null ? '?' : `${window.percent}%`;
  const counts = `${window.used ?? '?'}/${window.limit ?? '?'}${window.remaining !== null ? ` (${window.remaining} left)` : ''}`;
  let reset = '';
  if (window.resetAt !== null) {
    const minutes = Math.round((window.resetAt - now) / 60_000);
    const when = new Date(window.resetAt).toISOString().replace('.000Z', 'Z');
    reset = ` reset ${when} (in ${minutes}m)`;
  }
  return `${window.id} ${percent} [${counts}] unit=${window.unit ?? '-'}${reset}`;
}

/**
 * One line describing a balance.
 *
 * @param {import('../src/shared/protocol.js').Balance} balance
 * @returns {string}
 */
function describeBalance(balance) {
  return `${balance.currency} available=${balance.available ?? '-'} bonus=${balance.bonus ?? '-'} spent=${balance.totalSpent ?? '-'}`;
}

/**
 * Walk a JSON value and report any string that contains a raw secret.
 *
 * @param {unknown} value
 * @param {string[]} secrets
 * @param {string} [at]
 * @returns {string[]} Paths of leaking values.
 */
function findLeaks(value, secrets, at = '$') {
  const found = [];
  if (typeof value === 'string') {
    for (const secret of secrets) {
      if (secret.length >= 8 && value.includes(secret)) found.push(at);
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => found.push(...findLeaks(entry, secrets, `${at}[${index}]`)));
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) found.push(...findLeaks(entry, secrets, `${at}.${key}`));
  }
  return found;
}

/**
 * Run the four adapters against the live APIs.
 */
async function main() {
  const jsonOnly = process.argv.includes('--json');
  const credentialsFile = process.env.DSH_CREDENTIALS_FILE ?? DEFAULT_CREDENTIALS_FILE;
  const text = fs.readFileSync(credentialsFile, 'utf8');

  /** @type {Record<string, string|undefined>} */
  const secrets = {
    ZAI_CODING_CN_API_KEY: readRef(text, 'ZAI_CODING_CN_API_KEY'),
    KIMI_CODING_API_KEY: readRef(text, 'KIMI_CODING_API_KEY'),
    OPENCODE_GO_API_KEY: readRef(text, 'OPENCODE_GO_API_KEY'),
    DEEPSEEK_API_KEY: readRef(text, 'DEEPSEEK_API_KEY'),
    DEEPSEEK_PLATFORM_TOKEN: readRecordToken(text, DEEPSEEK_RECORD),
  };

  /**
   * The host's secret accessor: reference name -> value, `undefined` when absent.
   *
   * @param {string} name
   * @returns {Promise<string|undefined>}
   */
  const getSecret = async (name) => secrets[name];

  const { fetchJson, source: transportSource } = await loadFetchJson();

  if (!jsonOnly) {
    console.log('usage-board live provider check');
    console.log(`credentials : ${credentialsFile}`);
    console.log(`transport   : ${transportSource}`);
    console.log(`node        : ${process.version}`);
    for (const [name, value] of Object.entries(secrets)) console.log(`credential  : ${pad(name, 26)} ${mask(value)}`);
    console.log('');
  }

  const signal = AbortSignal.timeout(30_000);
  const startedAt = Date.now();
  const snapshots = await Promise.all(
    PROVIDERS.map(async (adapter) => {
      try {
        return await adapter.read({ getSecret, fetchJson, signal, now: Date.now });
      } catch (error) {
        // Adapters are total; a rejection here is a hard contract violation.
        return {
          id: adapter.id,
          label: adapter.label,
          status: 'upstream-error',
          message: `adapter rejected: ${error?.name ?? 'Error'}`,
          code: 'E_CONTRACT',
          plan: null,
          windows: [],
          balances: [],
          account: null,
          meta: { contract: 'read() must never reject' },
          fetchedAt: null,
          latencyMs: null,
        };
      }
    }),
  );
  const elapsed = Date.now() - startedAt;
  const now = Date.now();

  if (!jsonOnly) {
    for (const snapshot of snapshots) {
      console.log(`── ${snapshot.label} (${snapshot.id}) ─────────────────────────`);
      console.log(`   status  : ${snapshot.status}${snapshot.code ? `  [${snapshot.code}]` : ''}`);
      if (snapshot.message) console.log(`   message : ${snapshot.message}`);
      console.log(`   plan    : ${snapshot.plan ?? '-'}`);
      console.log(`   account : ${snapshot.account ? JSON.stringify(snapshot.account) : '-'}`);
      console.log(`   latency : ${snapshot.latencyMs ?? '-'} ms`);
      console.log(`   meta    : ${JSON.stringify(snapshot.meta)}`);
      if (snapshot.windows.length === 0) console.log('   windows : (none)');
      for (const window of snapshot.windows) console.log(`   window  : ${describeWindow(window, now)}`);
      if (snapshot.balances.length === 0) console.log('   balances: (none)');
      for (const balance of snapshot.balances) console.log(`   balance : ${describeBalance(balance)}`);
      console.log('');
    }

    console.log(`── summary (${(elapsed / 1000).toFixed(2)}s) ─────────────────────────────`);
    console.log(
      `${pad('provider', 12)} ${pad('status', 16)} ${pad('plan', 8)} ${pad('windows', 9)} ${pad('balances', 9)} ${pad('code', 12)} host`,
    );
    for (const snapshot of snapshots) {
      console.log(
        `${pad(snapshot.id, 12)} ${pad(snapshot.status, 16)} ${pad(snapshot.plan, 8)} ${pad(snapshot.windows.length, 9)} ${pad(snapshot.balances.length, 9)} ${pad(snapshot.code, 12)} ${snapshot.meta?.host ?? '-'}`,
      );
    }
    console.log('');
    console.log('raw snapshots:');
  }

  const payload = JSON.stringify({ generatedAt: now, elapsedMs: elapsed, providers: snapshots }, null, 2);
  console.log(payload);

  // Belt and braces: nothing printed may contain a raw credential.
  const secretValues = Object.values(secrets).filter((value) => typeof value === 'string' && value !== '');
  const leaks = findLeaks(payload, secretValues);
  if (leaks.length > 0) {
    console.error(`\nSECRET LEAK DETECTED in the snapshot at: ${leaks.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const bad = snapshots.filter((snapshot) => !['ok', 'not-configured'].includes(snapshot.status));
  if (bad.length > 0) {
    console.error(`\nfailed providers: ${bad.map((snapshot) => `${snapshot.id}=${snapshot.status}`).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (!jsonOnly) console.log('\nall providers ok (or not configured)');
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  await main();
}
