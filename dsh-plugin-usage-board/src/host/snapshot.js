/**
 * Snapshot assembly and caching for the usage board.
 *
 * One `SnapshotService` per plugin instance owns every upstream read. Callers
 * (the HTTP routes, and any future Remote surface) can ask for:
 *
 * - **one provider** (`getProvider`) — the decoupled read behind
 *   `GET/POST /usage-board/api/provider`. A slow or hanging provider holds back
 *   its own caller only; every other provider's read proceeds independently.
 * - **the whole board** (`get`, `getServing`) — the compatibility aggregate
 *   behind `/api/snapshot` and `/api/refresh`, composed from the same
 *   per-provider caches.
 *
 * Cache and in-flight state are per provider. Concurrent callers share a single
 * in-flight read *per provider*, so both a refresh storm and a renderer that
 * asks for each provider separately cannot multiply upstream traffic.
 *
 * @module dsh-plugin-usage-board/host/snapshot
 */

import { PROVIDERS, providerById } from './providers/index.js';
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
 * @typedef {object} CachedRow
 * @property {import('../shared/protocol.js').ProviderSnapshot} row
 * @property {number} startedAt Epoch ms at which the read backing the row began.
 * @property {number} expiresAt Epoch ms after which the row is stale.
 */

/**
 * @typedef {object} ProviderState
 * @property {string} id
 * @property {'fresh'|'stale'|'missing'} status
 * @property {number|null} fetchedAt Read start time, or null when nothing is cached.
 * @property {number|null} expiresAt
 * @property {boolean} refreshing True while a read for this provider is in flight.
 */

/**
 * @typedef {object} SnapshotServiceOptions
 * @property {(name: string) => Promise<string|undefined>} getSecret Resolves a credential reference.
 * @property {number} [ttlMs]
 * @property {(message: string) => void} [log] Diagnostics sink.
 * @property {number} [now] Clock injection seam for tests.
 * @property {typeof import('./providers/index.js').PROVIDERS[number]['read']} [readProvider] Adapter injection seam for tests.
 */

/**
 * Owns the per-provider caches and builds the envelopes the routes serve.
 */
export class SnapshotService {
  #getSecret;
  #ttlMs;
  #log;
  #now;
  #readProvider;
  /** @type {Map<string, CachedRow>} */
  #rows = new Map();
  /** @type {Map<string, Promise<{ row: import('../shared/protocol.js').ProviderSnapshot, startedAt: number }>>} */
  #inflight = new Map();
  /** @type {Set<AbortController>} One controller per in-flight provider read. */
  #controllers = new Set();
  /** Set by `dispose()`; a read that finishes afterwards must not cache. */
  #disposed = false;
  /** Background refreshes started, for diagnostics. */
  #backgroundReads = 0;
  /** Upstream provider reads performed, for diagnostics. */
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

  /** Provider ids the current registry exposes, in display order. */
  get providerIds() {
    return PROVIDERS.map((adapter) => adapter.id);
  }

  /** How many provider reads this instance has performed, for diagnostics. */
  get readCount() {
    return this.#reads;
  }

  /** How many of those were background refreshes behind a served response. */
  get backgroundReadCount() {
    return this.#backgroundReads;
  }

  /**
   * Per-provider cache state, without touching a provider or a credential.
   * Additive diagnostics for the health route; the values are plain data.
   * @returns {ProviderState[]}
   */
  providerStates() {
    return PROVIDERS.map((adapter) => {
      const entry = this.#rows.get(adapter.id);
      const refreshing = this.#inflight.has(adapter.id);
      if (entry === undefined) {
        return { id: adapter.id, status: 'missing', fetchedAt: null, expiresAt: null, refreshing };
      }
      const fresh = entry.expiresAt > this.#now();
      return {
        id: adapter.id,
        status: fresh ? 'fresh' : 'stale',
        fetchedAt: entry.startedAt,
        expiresAt: entry.expiresAt,
        refreshing,
      };
    });
  }

  /**
   * Read one provider's envelope.
   *
   * This is the decoupled path the renderer uses. `force: false` is the serving
   * read: a fresh cached row is returned at once, an expired row is returned at
   * once while a refresh is started behind it (`stale: true`), and only a
   * provider with no cached row makes the caller wait. `force: true` waits for a
   * fresh upstream read of this provider.
   *
   * The result is always a one-row {@link import('../shared/protocol.js').UsageSnapshot};
   * the caller must have validated `id` against {@link providerIds}.
   *
   * @param {string} id `PROVIDER_IDS` member.
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async getProvider(id, options = {}) {
    const { force = false } = options;
    const adapter = providerById(id);
    if (adapter === undefined) throw new UnknownProviderError(id);
    if (this.#disposed) {
      const cached = this.#rows.get(id);
      return cached === undefined ? this.#disposedEnvelope() : this.#oneRow(cached);
    }
    if (force) return this.#oneRow(await this.#readOne(adapter));

    const cached = this.#rows.get(id);
    if (cached === undefined) return this.#oneRow(await this.#readOne(adapter));

    const fresh = cached.expiresAt > this.#now();
    if (!fresh) this.#startBackgroundRead(adapter);
    return this.#oneRow(cached, {
      stale: !fresh,
      refreshing: !fresh && this.#inflight.has(id),
    });
  }

  /**
   * Return the aggregate snapshot: fresh rows where they exist, and a read for
   * every provider whose row is missing or expired.
   *
   * This is the compatibility read behind `GET /api/snapshot` and
   * `POST /api/refresh`; it waits for the whole board by definition. Renderers
   * that want progressive paint use {@link getProvider} instead.
   *
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async get(options = {}) {
    const { force = false } = options;
    if (this.#disposed) return this.#composeFromCache();
    const adapters = PROVIDERS;
    const entries = await Promise.all(
      adapters.map((adapter) => (force ? this.#readOne(adapter) : this.#ensureRow(adapter))),
    );
    return this.#aggregate(entries);
  }

  /** Drop every cached row so the next read goes upstream. */
  invalidate() {
    this.#rows.clear();
  }

  /**
   * Answer the aggregate without waiting on any provider whenever the cache can
   * carry the response.
   *
   * This is what makes entering the board feel instant when the aggregate route
   * is used directly. Fresh rows are served as they are; expired rows are served
   * immediately while a background refresh replaces them — the caller gets
   * numbers now instead of blocking on the slowest provider. Only providers with
   * no cached row at all block, because there is nothing honest to serve for
   * them.
   *
   * @returns {Promise<import('../shared/protocol.js').UsageSnapshot>}
   */
  async getServing() {
    if (this.#disposed) return this.#composeFromCache();
    const adapters = PROVIDERS;
    /** @type {import('./providers/index.js').ProviderAdapter[]} */
    const missing = [];
    for (const adapter of adapters) {
      const cached = this.#rows.get(adapter.id);
      if (cached === undefined) {
        missing.push(adapter);
        continue;
      }
      if (cached.expiresAt <= this.#now()) this.#startBackgroundRead(adapter);
    }
    // Cold start (or a provider that only exists in the registry now): wait for
    // the missing rows concurrently. Anything else is served from cache.
    if (missing.length > 0) {
      await Promise.all(missing.map((adapter) => this.#readOne(adapter)));
    }
    return this.#composeFromCache({ flagStaleness: true });
  }

  /**
   * A one-row envelope for a provider read. `refreshing` says a background
   * refresh is already running behind a stale answer, so a consumer knows its
   * stale follow-up will find fresher numbers.
   *
   * @param {CachedRow|{ row: import('../shared/protocol.js').ProviderSnapshot, startedAt: number }} entry
   * @param {{ stale?: boolean, refreshing?: boolean }} [flags]
   * @returns {import('../shared/protocol.js').UsageSnapshot}
   */
  #oneRow(entry, flags = {}) {
    return makeSnapshot({
      generatedAt: entry.startedAt,
      ttlMs: this.#ttlMs,
      providers: [entry.row],
      stale: flags.stale === true,
      refreshing: flags.refreshing === true,
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
   * Build the aggregate envelope from whatever is cached right now.
   *
   * `flagStaleness` is true for a serving read: each row's own age is reported
   * and an expired row starts its own background refresh. The disposed and
   * cold-start paths pass `false` because they have just read (or must not
   * read), so their rows are fresh by construction.
   *
   * @param {{ flagStaleness?: boolean }} [options]
   * @returns {import('../shared/protocol.js').UsageSnapshot}
   */
  #composeFromCache(options = {}) {
    const { flagStaleness = false } = options;
    /** @type {CachedRow[]} */
    const entries = [];
    for (const adapter of PROVIDERS) {
      const cached = this.#rows.get(adapter.id);
      if (cached === undefined) continue;
      if (flagStaleness && cached.expiresAt <= this.#now() && !this.#disposed) {
        this.#startBackgroundRead(adapter);
      }
      entries.push(cached);
    }
    if (entries.length === 0) return this.#disposedEnvelope();
    const anyStale = flagStaleness && entries.some((entry) => entry.expiresAt <= this.#now());
    return this.#aggregate(entries, {
      stale: anyStale,
      refreshing: anyStale && this.#inflight.size > 0,
    });
  }

  /**
   * Compose rows into the aggregate envelope.
   * @param {Array<CachedRow|{ row: import('../shared/protocol.js').ProviderSnapshot, startedAt: number }>} entries
   * @param {{ stale?: boolean, refreshing?: boolean }} [flags]
   * @returns {import('../shared/protocol.js').UsageSnapshot}
   */
  #aggregate(entries, flags = {}) {
    // A clock injected in tests may legitimately start at 0, so seed from the
    // first row rather than from a sentinel that could pass for a real instant.
    let generatedAt = entries.length === 0 ? this.#now() : entries[0].startedAt;
    for (const entry of entries) generatedAt = Math.max(generatedAt, entry.startedAt);
    return makeSnapshot({
      generatedAt,
      ttlMs: this.#ttlMs,
      providers: entries.map((entry) => entry.row),
      stale: flags.stale === true,
      refreshing: flags.refreshing === true,
    });
  }

  /**
   * Whether every registered provider has a cached row inside its ttl.
   * @returns {boolean}
   */
  isFresh() {
    const ids = this.providerIds;
    if (ids.length === 0) return false;
    return ids.every((id) => {
      const cached = this.#rows.get(id);
      return cached !== undefined && cached.expiresAt > this.#now();
    });
  }

  /**
   * Return a provider's cached row when it is still fresh, otherwise wait for a
   * read. Used by the aggregate path, which by contract waits rather than
   * serving stale rows.
   * @param {import('./providers/index.js').ProviderAdapter} adapter
   * @returns {Promise<CachedRow|{ row: import('../shared/protocol.js').ProviderSnapshot, startedAt: number }>}
   */
  async #ensureRow(adapter) {
    const cached = this.#rows.get(adapter.id);
    if (cached !== undefined && cached.expiresAt > this.#now()) return cached;
    return await this.#readOne(adapter);
  }

  /**
   * Refresh one provider behind an already-delivered response, at most one at a
   * time. A failed background read leaves the stale row in place: the next
   * caller still gets numbers, and the failure is reported through the row the
   * background read produced.
   * @param {import('./providers/index.js').ProviderAdapter} adapter
   */
  #startBackgroundRead(adapter) {
    if (this.#disposed || this.#inflight.has(adapter.id)) return;
    this.#backgroundReads += 1;
    void this.#readOne(adapter).catch(() => undefined);
  }

  /**
   * Read one provider, sharing the in-flight read with any concurrent caller.
   *
   * Each provider read owns its own AbortController and aborts it in a
   * `finally`, so an adapter that ignores its result still releases its socket
   * instead of holding a listener until process exit. Disposal cancels every
   * controller, which bounds the whole service by the same signal.
   *
   * @param {import('./providers/index.js').ProviderAdapter} adapter
   * @returns {Promise<{ row: import('../shared/protocol.js').ProviderSnapshot, startedAt: number }>}
   */
  #readOne(adapter) {
    const existing = this.#inflight.get(adapter.id);
    if (existing !== undefined) return existing;
    const started = this.#now();
    const controller = new AbortController();
    this.#controllers.add(controller);
    this.#reads += 1;
    const read = adapter.read ?? this.#readProvider;
    const pending = runAdapter(adapter, read, {
      getSecret: this.#getSecret,
      signal: controller.signal,
      now: this.#now,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    }).then((row) => {
      // A read that finishes after disposal must not resurrect the cache and
      // hand a disposed service a fresh row to serve.
      if (!this.#disposed) {
        this.#rows.set(adapter.id, { row, startedAt: started, expiresAt: this.#now() + this.#ttlMs });
      }
      this.#log(
        `usage-board: ${adapter.id} read in ${this.#now() - started}ms` +
          (row.status === 'ok' ? '' : ` (${row.status})`),
      );
      return { row, startedAt: started };
    }).finally(() => {
      this.#controllers.delete(controller);
      this.#inflight.delete(adapter.id);
      controller.abort();
    });
    this.#inflight.set(adapter.id, pending);
    return pending;
  }

  /**
   * Release the service: abort every in-flight provider read and refuse to
   * cache again. Called on plugin disposal; idempotent, and a no-op when idle.
   */
  dispose() {
    this.#disposed = true;
    for (const controller of this.#controllers) {
      try {
        controller.abort();
      } catch {
        /* an abort must never make disposal fail */
      }
    }
    this.#controllers.clear();
    this.#rows.clear();
  }
}

/**
 * Thrown when a caller asks for a provider that is not registered. This is a
 * programming/transport error (the route validates first and answers 400), not
 * a provider failure, so it must never be repaired into a degraded row.
 */
export class UnknownProviderError extends Error {
  /**
   * @param {string} id
   */
  constructor(id) {
    super(`No usage board provider with id "${id}" is registered.`);
    this.name = 'UnknownProviderError';
    this.code = 'unknown-provider';
    this.providerId = id;
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
