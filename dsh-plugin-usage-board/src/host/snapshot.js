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
import { makeProvider, makeSnapshot, projectSnapshot, SNAPSHOT_PATH } from '../shared/protocol.js';

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
  /** Background refreshes started, for diagnostics. */
  #backgroundReads = 0;
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

  /** How many of those were background refreshes behind a served response. */
  get backgroundReadCount() {
    return this.#backgroundReads;
  }

  /**
   * Return the cached snapshot when it is still fresh, otherwise read upstream.
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async get(options = {}) {
    const { force = false } = options;
    if (!force && this.#cache !== null && this.#cache.expiresAt > this.#now()) return this.#cache.snapshot;
    // Keep awaiting a read that was already running when disposal happened
    // (the caller asked for it before the plugin went away); only refuse a new one.
    if (this.#disposed && this.#inflight === null) {
      return this.#cache === null ? this.#disposedEnvelope() : this.#cache.snapshot;
    }
    return this.#beginRead({ blocking: true });
  }

  /** Drop the cache so the next `get()` reads upstream. */
  invalidate() {
    this.#cache = null;
  }

  /**
   * Answer without waiting on any provider whenever the cache can carry the
   * response.
   *
   * This is what makes entering the panel feel instant. When a cached snapshot
   * exists but its TTL has passed, the stale copy is returned immediately and a
   * background read is started to replace it — the caller gets numbers now and
   * the freshness of the next answer, instead of blocking on the slowest
   * provider. Only a genuinely empty cache blocks, because there is nothing
   * honest to serve.
   *
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async getServing() {
    if (this.#disposed) return this.#cache === null ? this.#disposedEnvelope() : this.#cache.snapshot;
    if (this.#cache === null) {
      // Cold start: no numbers exist yet, so this caller waits for the first read.
      return await this.#beginRead({ blocking: true });
    }
    const fresh = this.#cache.expiresAt > this.#now();
    if (!fresh) this.#startBackgroundRefresh();
    return projectSnapshot(this.#cache.snapshot, {
      stale: !fresh,
      refreshing: this.#controller !== null && !fresh,
    });
  }

  /**
   * A last-resort envelope for a disposed service with no cache: an explicit,
   * empty answer rather than a read that a disposed plugin has no business
   * starting.
   * @returns {import('../shared/protocol.js').UsageSnapshot}
   */
  #disposedEnvelope() {
    return makeSnapshot({ ttlMs: this.#ttlMs, providers: [] });
  }

  /**
   * Whether a cached snapshot exists and is still inside its TTL.
   * @returns {boolean}
   */
  isFresh() {
    return this.#cache !== null && this.#cache.expiresAt > this.#now();
  }

  /**
   * Refresh behind an already-delivered response, at most one at a time.
   * A failed background read leaves the stale cache in place: the next caller
   * still gets numbers, and the read that failed is reported through the rows.
   */
  #startBackgroundRefresh() {
    if (this.#controller !== null || this.#disposed) return;
    void this.#beginRead({ blocking: false }).catch(() => undefined);
  }

  /**
   * Start one shared read. All callers of a single fan-out await the same
   * promise, so a background refresh and a caller that arrived at the same
   * moment cannot double the upstream traffic.
   *
   * @param {{ blocking: boolean }} options
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  #beginRead({ blocking }) {
    if (this.#inflight !== null) return this.#inflight;
    const pending = this.#read({ blocking }).finally(() => {
      this.#inflight = null;
    });
    this.#inflight = pending;
    return pending;
  }

  /**
   * Fan out over every adapter and assemble the envelope.
   *
   * The read owns one AbortController for its whole fan-out and aborts it in a
   * `finally`, so an adapter that ignores its result still releases its socket
   * instead of holding a listener until process exit. Disposal mid-read is
   * bounded by the same signal.
   *
   * @param {{ blocking?: boolean }} [options]
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async #read(options = {}) {
    const { blocking = true } = options;
    this.#reads += 1;
    const started = this.#now();
    if (!blocking) this.#backgroundReads += 1;
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
  // The status decides first. A phrase test placed before these branches would
  // swallow every diagnostic that merely mentions the provider's name — GLM's
  // own copy says "GLM Coding Plan", so an ordering mistake here relabels a
  // rejected key, an unset key and an adapter crash alike as "no subscription".
  if (status === 'not-configured') return 'notConfigured';
  if (status === 'unauthorized') return 'authRejected';
  if (status === 'rate-limited') return 'rateLimited';
  if (status === 'network-error') return text.includes('cancel') ? 'cancelled' : 'unreachable';
  if (status === 'invalid-response') return 'badResponse';
  if (status === 'upstream-error') {
    // The adapter-crash wrapper is generated by this module and carries the
    // adapter label, which for GLM contains the phrase too — so it is checked
    // before the phrase, not after.
    if (text.includes('could not complete') || text.includes('adapter failed')) return 'adapterFailed';
    if (text.includes('no upstream')) return 'noHost';
    // Only a valid key on a non-subscription plan reaches here with this phrase.
    if (text.includes('coding plan')) return 'noCodingPlan';
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
