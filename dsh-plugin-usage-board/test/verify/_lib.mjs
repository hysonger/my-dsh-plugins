/**
 * Shared plumbing for the independent verification harnesses (task-3).
 *
 * This file is NOT a test file and is deliberately named `_lib.mjs`: the
 * project's `node --test test/` must not execute the verification harnesses
 * (they do real network/browser work). Verified: files under `test/verify/*.mjs`
 * are not picked up by the runner.
 *
 * Nothing in here is imported by src/ — the verifier's harnesses are additive
 * and read-only with respect to the plugin.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';

import { registerRoutes } from '../../src/host/routes.js';
import { SnapshotService } from '../../src/host/snapshot.js';
import { PROVIDERS } from '../../src/host/providers/index.js';

/* ------------------------------------------------------------------ reporting */

/** @type {{id: string, name: string, detail: string}[]} */
const failures = [];
let checks = 0;

/**
 * Record one PASS/FAIL line.
 * @param {string} id Case id, e.g. 'C2'.
 * @param {string} name Human-readable case name.
 * @param {boolean} ok
 * @param {string} [detail] Observed value / reproduction detail.
 */
export function check(id, name, ok, detail = '') {
  checks += 1;
  const line = `${ok ? 'PASS' : 'FAIL'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures.push({ id, name, detail });
  return ok;
}

/**
 * Assert equality and record the result.
 * @param {string} id
 * @param {string} name
 * @param {unknown} actual
 * @param {unknown} expected
 */
export function checkEqual(id, name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return check(id, name, ok, ok ? `= ${JSON.stringify(actual)}` : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Print the roll-up and return the process exit code. */
export function finish() {
  console.log('');
  console.log(`SUMMARY: ${checks - failures.length}/${checks} checks passed`);
  if (failures.length > 0) {
    console.log('FAILED CHECKS:');
    for (const failure of failures) console.log(`  - [${failure.id}] ${failure.name}${failure.detail ? ` — ${failure.detail}` : ''}`);
  }
  return failures.length === 0 ? 0 : 1;
}

/* --------------------------------------------------------------- masking / leak */

/**
 * Mask a secret for display: first 4 + ellipsis + last 4. Never print a secret
 * through any other path in these harnesses.
 * @param {string|undefined|null} value
 * @returns {string}
 */
export function mask(value) {
  if (typeof value !== 'string' || value.length === 0) return '(unset)';
  if (value.length <= 10) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/* ------------------------------------------------------------- fake upstream */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build a `fetch` implementation from a plan.
 *
 * plan: `(url, options) => spec` or `{ [url]: spec, default: spec }`.
 * spec: `{ status, body, contentType, headers, delayMs, hang }`.
 *
 * Returns `{ fetchImpl, calls }` where `calls` records url + auth header only
 * (never body or token values beyond the header the adapter itself set).
 *
 * @param {any} plan
 */
export function fakeUpstream(plan, passthroughPrefix = 'http://127.0.0.1') {
  const realFetch = globalThis.fetch;
  /** @type {{url: string, method: string, auth: string|null, at: number}[]} */
  const calls = [];
  /** @type {{aborted: number}} */
  const state = { aborted: 0 };
  const fetchImpl = async (url, options = {}) => {
    // The harness talks to its own stand-in HTTP server over the same global
    // fetch; those requests must reach the real implementation, before the
    // plan (including its `default` entry) is consulted.
    if (String(url).startsWith(passthroughPrefix)) return realFetch(url, options);
    const spec = typeof plan === 'function' ? plan(String(url), options) : (plan[String(url)] ?? plan.default);
    const auth = options.headers?.Authorization ?? options.headers?.authorization ?? null;
    calls.push({ url: String(url), method: options.method ?? 'GET', auth: typeof auth === 'string' ? `Bearer ${mask(auth.replace(/^Bearer\s+/, ''))}` : null, at: Date.now() });
    if (!spec) throw new TypeError(`fetch failed: no fake route for ${url}`);
    if (spec.hang) {
      return await new Promise((_resolve, reject) => {
        const signal = options.signal;
        const onAbort = () => {
          state.aborted += 1;
          reject(signal?.reason ?? new DOMException('This operation was aborted', 'AbortError'));
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    if (typeof spec.delayMs === 'number' && spec.delayMs > 0) await sleep(spec.delayMs);
    const body = typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body ?? {});
    return new Response(body, {
      status: spec.status ?? 200,
      headers: { 'content-type': spec.contentType ?? 'application/json', ...(spec.headers ?? {}) },
    });
  };
  return { fetchImpl, calls, state };
}

/**
 * Run `fn` with `globalThis.fetch` replaced. `fetch-json.js` reads
 * `globalThis.fetch` at call time, so this drives the *real* transport stack
 * (routes -> SnapshotService -> adapter -> fetchJson -> fetch) without editing
 * any source file.
 * @template T
 * @param {typeof fetch} fetchImpl
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withGlobalFetch(fetchImpl, fn) {
  const saved = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = saved;
  }
}

/* --------------------------------------------------------- stand-in host server */

/**
 * A faithful-enough stand-in for the DSH `webServer` service: exact routes
 * match by path, prefix routes match by path segment. The live instance is used
 * for the real DSH dispatcher's semantics (see routes-live.mjs); this exists so
 * adversarial upstream cases can be driven over real HTTP.
 */
function createStandInWebServer() {
  /** @type {{kind: string, path: string, handler: Function}[]} */
  const routes = [];
  return {
    routes,
    register(spec) {
      routes.push(spec);
      return () => {
        const index = routes.indexOf(spec);
        if (index >= 0) routes.splice(index, 1);
      };
    },
    dispatch(req, res) {
      const pathname = new URL(req.url, 'http://stand-in').pathname;
      const exact = routes.find((route) => route.kind === 'exact' && route.path === pathname);
      if (exact) return exact.handler(req, res);
      const prefix = routes
        .filter((route) => route.kind === 'prefix' && (pathname === route.path || pathname.startsWith(`${route.path}/`)))
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (prefix) return prefix.handler(req, res);
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('stand-in 404');
    },
  };
}

/**
 * Start the plugin's real routes on a real HTTP server, with a stand-in
 * webServer and a real SnapshotService.
 *
 * @param {object} [options]
 * @param {object} [options.config] Plugin config: `{ ttlMs, allowRemote, servePage, devMode }`.
 * @param {(name: string) => Promise<string|undefined>} [options.getSecret]
 * @param {boolean} [options.spoofRemote] Honor `x-qa-spoof-remote` to fake the peer address.
 * @returns {Promise<{ url: string, port: number, snapshots: any, close: () => Promise<void>, logs: string[], routes: any[] }>}
 */
export async function startPluginServer(options = {}) {
  const { config = {}, getSecret = async () => undefined, spoofRemote = false } = options;
  const logs = [];
  const webServer = createStandInWebServer();
  const snapshots = new SnapshotService({
    getSecret,
    ttlMs: config.ttlMs ?? 15_000,
    log: (message) => logs.push(message),
  });
  const dispose = registerRoutes(webServer, {
    snapshots,
    log: (message) => logs.push(message),
    version: '0.1.0-verify',
    credentialsHint: {
      providers: PROVIDERS.map((adapter) => ({ id: adapter.id, label: adapter.label, refs: adapter.credentialRefs ?? [] })),
    },
    allowRemote: config.allowRemote === true,
    servePage: config.servePage !== false,
    devMode: config.devMode !== false,
  });
  const server = http.createServer((req, res) => {
    if (spoofRemote && typeof req.headers['x-qa-spoof-remote'] === 'string') {
      Object.defineProperty(req.socket, 'remoteAddress', { value: req.headers['x-qa-spoof-remote'], configurable: true });
    }
    try {
      webServer.dispatch(req, res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(error?.stack ?? error));
    }
  });
  await new Promise((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    snapshots,
    logs,
    routes: webServer.routes,
    close: async () => {
      dispose();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/* ------------------------------------------------------------------ http client */

/**
 * One HTTP request returning status, headers and text.
 * @param {string} url
 * @param {{method?: string, headers?: Record<string,string>}} [options]
 */
export async function request(url, options = {}) {
  const response = await fetch(url, { method: options.method ?? 'GET', headers: options.headers, redirect: 'manual' });
  const text = await response.text();
  return { status: response.status, headers: Object.fromEntries(response.headers), text };
}

/** Parse JSON or return null (never throws). */
export function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Load the real credential values without ever printing them.
 * @returns {Promise<{ refs: Record<string,string>, platformToken: string|null }>}
 */
export async function loadRealSecrets() {
  const raw = await readFile(`${process.env.HOME}/.dsh/.credentials.yaml`, 'utf8');
  const refs = {};
  for (const name of ['ZAI_CODING_CN_API_KEY', 'KIMI_CODING_API_KEY']) {
    const match = new RegExp(`^\\s+${name}:\\s*(\\S+)\\s*$`, 'm').exec(raw);
    refs[name] = match ? match[1].replace(/^["']|["']$/g, '') : '';
  }
  const tokenMatch = /^\s+token:\s*(\S+)\s*$/m.exec(raw);
  return { refs, platformToken: tokenMatch ? tokenMatch[1].replace(/^["']|["']$/g, '') : null };
}
