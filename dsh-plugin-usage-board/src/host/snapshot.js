/**
 * Snapshot assembly and caching for the usage board.
 *
 * One `SnapshotService` per plugin instance owns every upstream read. Callers
 * (the HTTP routes, and any future Remote surface) ask for a snapshot and get
 * either the cached one or a fresh one; concurrent callers share a single
 * in-flight read per provider so a refresh storm never multiplies upstream
 * traffic.
 *
 * @module dsh-plugin-usage-board/host/snapshot
 */

import { PROVIDERS } from './providers/index.js';
import { fetchJson } from './fetch-json.js';
import { makeProvider, makeSnapshot, SNAPSHOT_PATH } from '../shared/protocol.js';

/** Default cache lifetime. */
export const DEFAULT_TTL_MS = 60_000;

/** Hard ceiling on the cache lifetime; the client clamps to the same window. */
export const MAX_TTL_MS = 300_000;

/** Lower bound so a misconfigured `ttlMs` cannot turn into a busy loop. */
export const MIN_TTL_MS = 15_000;

/** Per-provider upstream deadline. */
export const PROVIDER_TIMEOUT_MS = 12_000;

/**
 * @typedef {object} SnapshotServiceOptions
 * @property {(name: string) => Promise<string|undefined>} getSecret Resolves a credential reference.
 * @property {number} [ttlMs]
 * @property {(message: string) => void} [log] Diagnostics sink.
 * @property {number} [now] Clock injection seam for tests.
 * @property {typeof import('./providers/index.js').PROVIDERS[number]['read']} [readProvider] Adapter injection seam for tests.
 */

/**
 * Owns the cached dashboard snapshot.
 */
export class SnapshotService {
  #getSecret;
  #ttlMs;
  #log;
  #now;
  #readProvider;
  #cache = null;
  #inflight = null;
  /** @type {AbortController|null} */
  #controller = null;
  /** Set by `dispose()`; a read that finishes afterwards must not cache. */
  #disposed = false;
  /** @type {Map<string, Promise<import('../shared/protocol.js').ProviderSnapshot>>} */
  #perProvider = new Map();
  #reads = 0;

  /**
   * @param {SnapshotServiceOptions} options
   */
  constructor(options) {
    this.#getSecret = options.getSecret;
    this.#ttlMs = clampTtl(options.ttlMs);
    this.#log = options.log ?? (() => undefined);
    this.#now = options.now ?? (() => Date.now());
    this.#readProvider = options.readProvider ?? null;
  }

  /** Effective cache lifetime in milliseconds. */
  get ttlMs() {
    return this.#ttlMs;
  }

  /** How many upstream fan-outs this instance has performed, for diagnostics. */
  get readCount() {
    return this.#reads;
  }

  /**
   * Return the cached snapshot when it is still fresh, otherwise read upstream.
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async get(options = {}) {
    const { force = false } = options;
    if (!force && this.#cache !== null && this.#cache.expiresAt > this.#now()) return this.#cache.snapshot;
    if (this.#inflight !== null) return this.#inflight;
    const pending = this.#read().finally(() => {
      this.#inflight = null;
    });
    this.#inflight = pending;
    return pending;
  }

  /** Drop the cache so the next `get()` reads upstream. */
  invalidate() {
    this.#cache = null;
  }

  /**
   * Fan out over every adapter and assemble the envelope.
   *
   * The read owns one AbortController for its whole fan-out and aborts it in a
   * `finally`, so an adapter that ignores its result still releases its socket
   * instead of holding a listener until process exit. Disposal mid-read is
   * bounded by the same signal.
   *
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async #read() {
    this.#reads += 1;
    const started = this.#now();
    const controller = new AbortController();
    this.#controller = controller;
    try {
      const rows = await Promise.all(
        PROVIDERS.map((adapter) => this.#readOne(adapter, controller.signal)),
      );
      const ttlMs = this.#ttlMs;
      const snapshot = makeSnapshot({ generatedAt: started, ttlMs, providers: rows });
      // A read that finishes after disposal must not resurrect the cache and
      // hand a disposed service a fresh snapshot to serve.
      if (!this.#disposed) this.#cache = { snapshot, expiresAt: this.#now() + ttlMs };
      const failed = rows.filter((row) => row.status !== 'ok').map((row) => `${row.id}:${row.status}`);
      this.#log(
        `usage-board: snapshot built in ${this.#now() - started}ms (${rows.length} providers${failed.length === 0 ? '' : `, ${failed.join(', ')}`})`,
      );
      return snapshot;
    } finally {
      if (this.#controller === controller) this.#controller = null;
      controller.abort();
    }
  }

  /**
   * Release the service: abort any in-flight fan-out and refuse to cache again.
   * Called on plugin disposal; idempotent, and a no-op when idle.
   */
  dispose() {
    this.#disposed = true;
    this.#controller?.abort();
    this.#controller = null;
    this.#cache = null;
  }

  /**
   * Run one adapter, sharing an in-flight read with any concurrent caller.
   * @param {import('./providers/index.js').ProviderAdapter} adapter
   * @param {AbortSignal} signal
   * @returns {Promise<import('../shared/protocol.js').ProviderSnapshot>}
   */
  #readOne(adapter, signal) {
    const existing = this.#perProvider.get(adapter.id);
    if (existing !== undefined) return existing;
    const read = adapter.read ?? this.#readProvider;
    const pending = runAdapter(adapter, read, {
      getSecret: this.#getSecret,
      signal,
      now: this.#now,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    }).finally(() => {
      this.#perProvider.delete(adapter.id);
    });
    this.#perProvider.set(adapter.id, pending);
    return pending;
  }
}

/**
 * Attach a localization key to a provider row.
 *
 * Provider diagnostics are written by the host in English. A `messageKey` lets
 * the browser half translate the common failures without re-deriving them from
 * prose, while `message` stays the untranslatable fallback for anything the
 * mapping does not recognise — a provider's own error text, for instance.
 *
 * @param {import('../shared/protocol.js').ProviderSnapshot} row
 * @returns {import('../shared/protocol.js').ProviderSnapshot}
 */
function withMessageKey(row) {
  if (row.status === 'ok' || row.message === null) return row;
  return { ...row, messageKey: classifyMessage(row.status, row.message) };
}

/**
 * Map a row's status and diagnostic text onto a stable key.
 * @param {string} status ProviderStatus.
 * @param {string} message Host-written English diagnostic.
 * @returns {string}
 */
export function classifyMessage(status, message) {
  const text = String(message).toLowerCase();
  if (text.includes('coding plan')) return 'noCodingPlan';
  if (status === 'not-configured') return 'notConfigured';
  if (status === 'unauthorized') return 'authRejected';
  if (status === 'rate-limited') return 'rateLimited';
  if (status === 'network-error') return text.includes('cancel') ? 'cancelled' : 'unreachable';
  if (status === 'invalid-response') return 'badResponse';
  if (status === 'upstream-error') {
    if (text.includes('could not complete')) return 'adapterFailed';
    if (text.includes('no upstream')) return 'noHost';
  }
  return `status.${status}`;
}

/**
 * Run one adapter and repair a rejected or malformed result into a protocol row.
 * @param {import('./providers/index.js').ProviderAdapter} adapter
 * @param {(context: object) => Promise<import('../shared/protocol.js').ProviderSnapshot>} read
 * @param {{ getSecret: Function, signal: AbortSignal, now: () => number, timeoutMs: number }} context
 * @returns {Promise<import('../shared/protocol.js').ProviderSnapshot>}
 */
async function runAdapter(adapter, read, context) {
  const started = context.now();
  try {
    const row = await read({
      getSecret: context.getSecret,
      fetchJson,
      signal: context.signal,
      now: context.now,
      timeoutMs: context.timeoutMs,
    });
    const repaired = makeProvider({ ...row, id: adapter.id, label: row?.label ?? adapter.label });
    return withMessageKey({
      ...repaired,
      latencyMs: row?.latencyMs ?? context.now() - started,
    });
  } catch (error) {
    return withMessageKey(
      makeProvider({
        id: adapter.id,
        label: adapter.label,
        status: 'upstream-error',
        message: `The ${adapter.label} adapter failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'ADAPTER_THROW',
        meta: { via: SNAPSHOT_PATH },
        latencyMs: context.now() - started,
      }),
    );
  }
}

/**
 * Clamp a configured TTL into the supported window.
 * @param {number|undefined} value
 * @returns {number}
 */
export function clampTtl(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.round(value)));
}
