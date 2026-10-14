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
      this.#cache = { snapshot, expiresAt: this.#now() + ttlMs };
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
   * Abort an in-flight fan-out. Called on plugin disposal; a no-op when idle.
   */
  dispose() {
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
    return { ...makeProvider({ ...row, id: adapter.id, label: row?.label ?? adapter.label }), latencyMs: row?.latencyMs ?? context.now() - started };
  } catch (error) {
    return makeProvider({
      id: adapter.id,
      label: adapter.label,
      status: 'upstream-error',
      message: `The ${adapter.label} adapter failed: ${error instanceof Error ? error.message : String(error)}`,
      code: 'ADAPTER_THROW',
      meta: { via: SNAPSHOT_PATH },
      latencyMs: context.now() - started,
    });
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
