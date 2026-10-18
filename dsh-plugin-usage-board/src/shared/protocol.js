/**
 * FROZEN WIRE PROTOCOL — `dsh-plugin-usage-board`.
 *
 * This module is the single source of truth for the JSON that the plugin's
 * host half returns and its browser half renders. It is dependency-free plain
 * ESM so the host half can import it directly. The browser half is served as a
 * standalone bundle by DSH's client-module loader and therefore cannot import
 * it; `src/client/protocol-copy.js` carries the byte-identical parse helpers it
 * needs, and `node test/protocol-copy.test.js` fails if the two drift.
 *
 * ## Stability rules
 * - Additive changes only. Never remove or rename a field, never change a
 *   field's meaning or type.
 * - `status` is the only field a consumer may branch on for error handling.
 * - A provider failure is ALWAYS a 200 response carrying
 *   `ok: false` + `providers[].status !== 'ok'`. The HTTP status code describes
 *   the transport, never the upstream provider.
 *
 * @module dsh-plugin-usage-board/shared/protocol
 */

/** Monotonic protocol revision, bumped only for incompatible additions. */
export const PROTOCOL_VERSION = 1;

/** Every provider id this dashboard knows, in display order. */
export const PROVIDER_IDS = ['deepseek', 'glm', 'kimi'];

/** Provider ids whose upstream API is a quota window API rather than a wallet. */
export const QUOTA_PROVIDER_IDS = ['glm', 'kimi'];

/**
 * Wire status of one provider within a snapshot.
 * @typedef {'ok'|'not-configured'|'unauthorized'|'rate-limited'|'upstream-error'|'network-error'|'invalid-response'|'disabled'} ProviderStatus
 */

/**
 * Normalized quota/usage window. Providers express windows differently; the
 * adapter's whole job is to land them on this shape.
 *
 * - `unit` is the provider's own unit code, surfaced verbatim for display
 *   (`GLM`: 3 = 5-hour rolling window, 6 = weekly window — see the adapter).
 * - `limit` is the window's total allowance in `unit`, `used` the consumed
 *   part, `remaining` the rest. All three are numbers; a provider that reports
 *   only two of them gets the third computed by the adapter.
 * - `percent` is 0–100, the consumed share, rounded to 1 decimal, **as the
 *   provider declares it** (or derived when it declares none).
 * - `derivedPercent` is the same share recomputed from `used / limit`, or null
 *   when the pair is unusable. Prefer `derivedPercent ?? percent` for display:
 *   providers round aggressively, and a percentage that contradicts the
 *   `used / limit` printed beside it destroys trust in the whole card.
 * - `number` is the provider's count of windows of this kind (GLM reports
 *   `number: 5` for five 5-hour windows); null when the provider omits it.
 * - `resetAt` is epoch milliseconds, or null when the provider reports no reset.
 *
 * @typedef {object} UsageWindow
 * @property {string} id Stable machine id, e.g. 'glm.5h', 'kimi.weekly'.
 * @property {string} labelKey Translation key resolved through the `usageBoard` locale namespace.
 * @property {string|null} unit Provider unit code or textual unit, verbatim.
 * @property {number|null} number Count of windows of this kind.
 * @property {number|null} limit
 * @property {number|null} used
 * @property {number|null} remaining
 * @property {number|null} percent 0–100 consumed share as the provider declares it.
 * @property {number|null} derivedPercent 0–100 share recomputed from used/limit; prefer this for display.
 * @property {number|null} resetAt Epoch ms.
 * @property {string|null} note Optional provider-supplied caveat.
 */

/**
 * Normalized money balance.
 * @typedef {object} Balance
 * @property {string} currency ISO-4217 code as the provider reports it ('CNY', 'USD').
 * @property {number|null} available Spendable amount now.
 * @property {number|null} bonus Bonus/gift portion, when the provider splits it.
 * @property {number|null} totalSpent Lifetime spend, when the provider reports it.
 */

/**
 * Normalized snapshot for one provider.
 *
 * @typedef {object} ProviderSnapshot
 * @property {string} id PROVIDER_IDS member.
 * @property {string} label Display name.
 * @property {ProviderStatus} status
 * @property {string|null} message Host-written English diagnostic; null on success. The untranslatable fallback.
 * @property {string|null} messageKey Stable key the browser half localizes instead of showing `message`
 *   (`notConfigured`, `authRejected`, `noCodingPlan`, `rateLimited`, `unreachable`, `cancelled`,
 *   `badResponse`, `adapterFailed`, `noHost`, or `status.<status>`). Null on success. Additive:
 *   a consumer that does not know a key must fall back to `message`.
 * @property {string|null} code Provider/HTTP code for diagnostics, verbatim.
 * @property {string|null} plan Subscription/plan name when reported.
 * @property {UsageWindow[]} windows Empty array, never null.
 * @property {Balance[]} balances Empty array, never null.
 * @property {object|null} account Non-secret account identity, e.g. `{ masked: 'hy****er@hotmail.com' }`.
 * @property {object} meta Adapter-specific extras that have no normalized home, e.g.
 *   `{ host: 'open.bigmodel.cn', source: 'quota-api' }`. Never null. The
 *   DeepSeek row additionally carries `pricing`, the peak/off-peak billing
 *   schedule documented as {@link PricingSchedule} below.
 * @property {number|null} fetchedAt Epoch ms of the upstream read backing this row.
 * @property {number|null} latencyMs
 */

/**
 * The complete dashboard payload.
 *
 * @typedef {object} UsageSnapshot
 * @property {number} protocolVersion PROTOCOL_VERSION at production time.
 * @property {number} generatedAt Epoch ms.
 * @property {boolean} ok True when EVERY enabled provider reported `ok`.
 * @property {number} ttlMs How long the host will serve this snapshot before refetching.
 * @property {ProviderSnapshot[]} providers PROVIDER_IDS order, one row per configured provider.
 *   A {@link PROVIDER_PATH} response is the same envelope narrowed to exactly one row, so a
 *   consumer's envelope parsing keeps working; everything else in the body keeps its meaning.
 * @property {boolean} [stale] Additive. True when this body came from a cache the host is
 *   refreshing behind the response, so the numbers may be older than `ttlMs`. A consumer that
 *   does not know this field renders the body normally; one that does can schedule its own
 *   follow-up read instead of waiting a whole TTL for the fresh numbers.
 * @property {boolean} [refreshing] Additive. True while a background read is in flight.
 */

/** HTTP path the host half serves the snapshot on (GET). */
export const SNAPSHOT_PATH = '/usage-board/api/snapshot';

/**
 * HTTP path the host half serves a forced refresh on (POST). Returns the same
 * body as {@link SNAPSHOT_PATH}.
 */
export const REFRESH_PATH = '/usage-board/api/refresh';

/**
 * HTTP path the host half serves ONE provider's envelope on.
 *
 * This is the decoupled read that lets a renderer paint each provider the
 * moment *that* provider answers: a slow or hanging upstream holds back its own
 * card only, never the whole board.
 *
 * - `GET` is the serving read and follows the same never-hide-numbers rule as
 *   {@link SNAPSHOT_PATH}: a fresh cached row is returned at once, an expired
 *   row is returned with `stale: true` while the host refreshes it behind the
 *   response, and only a provider with no cached row makes the caller wait.
 * - `POST` forces a fresh read of that one provider and waits for it.
 *
 * The body is a {@link UsageSnapshot} narrowed to exactly one row
 * (`providers.length === 1`, `ok` derived from it, same `ttlMs`/`stale`/
 * `refreshing` fields). The provider is selected by the `id` query parameter
 * ({@link PROVIDER_QUERY_PARAM}); a missing or unknown id is a transport-level
 * 400, never a provider failure, so it must not be rendered as a degraded row.
 */
export const PROVIDER_PATH = '/usage-board/api/provider';

/** Query parameter selecting the provider for {@link PROVIDER_PATH}. */
export const PROVIDER_QUERY_PARAM = 'id';

/** HTTP prefix owning every route this plugin registers. */
export const ROUTE_PREFIX = '/usage-board';

/**
 * Maximum number of trailing days an adapter may put in `meta.dailyUsage`.
 * The UI renders the last 14; the cap keeps a snapshot small.
 */
export const MAX_DAILY_USAGE_DAYS = 31;

/**
 * One day of metered spend, oldest first within a series.
 * @typedef {object} DailyUsagePoint
 * @property {string} date `YYYY-MM-DD` as the provider reports it.
 * @property {number|null} cost Amount spent that day, in `currency`.
 * @property {number|null} tokens Total tokens that day; null when the provider splits them by type.
 */

/**
 * A trailing daily-spend series attached to `meta.dailyUsage` by a provider
 * that exposes history but no quota window (DeepSeek Platform).
 *
 * This is NOT a quota window: it is history. The UI draws it as a trend and
 * must never present it as "remaining allowance".
 *
 * @typedef {object} DailyUsageSeries
 * @property {string} currency
 * @property {number} days Count of trailing days requested.
 * @property {DailyUsagePoint[]} points At most {@link MAX_DAILY_USAGE_DAYS}, oldest first.
 */

/**
 * DeepSeek's peak / off-peak billing phase.
 *
 * Peak is Beijing time (UTC+8), Monday–Friday excluding Chinese statutory
 * holidays, 09:00–12:00 and 14:00–18:00; everything else — weekends and
 * holidays all day included — is off-peak, at half the peak price.
 *
 * @typedef {'peak'|'offpeak'} PricingPhase
 */

/**
 * One upcoming billing phase change, as an absolute instant.
 * @typedef {object} PricingTransition
 * @property {number} at Epoch ms at which `phase` starts.
 * @property {PricingPhase} phase
 */

/**
 * Peak/off-peak billing schedule attached to the DeepSeek row as
 * `meta.pricing`. Additive metadata: a consumer that does not know it ignores
 * it, and its absence means "no schedule available", never an error.
 *
 * All instants are absolute epoch milliseconds and the rule is fixed to Beijing
 * time (`utcOffsetMinutes`), so a renderer needs only its own clock. The host
 * recomputes the schedule on every read and ships a rolling horizon of
 * transitions; a renderer walks them to find the phase at *its* current instant
 * and the next change, which keeps the reminder live on a cached snapshot and
 * spares the browser half from carrying a holiday calendar.
 *
 * @typedef {object} PricingSchedule
 * @property {PricingPhase} phase Phase at `asOf`.
 * @property {number} asOf Epoch ms the schedule was computed for.
 * @property {number} utcOffsetMinutes 480 — the rule is defined in Beijing time.
 * @property {number} offPeakMultiplier 0.5 — off-peak price / peak price.
 * @property {{ source: string, through: number, coversHorizon: boolean }|null}
 *   holidayCalendar The third-party holiday calendar backing the rule, the
 *   latest announced year it covers, and whether that covers every instant in
 *   `transitions` (`coversHorizon` is false when the shipped horizon reaches
 *   into a year with no announced arrangement yet). Null when no calendar was
 *   available at all, in which case the schedule fell back to the plain
 *   weekday rule (and the UI says so).
 * @property {PricingTransition[]} transitions Upcoming phase changes, oldest first.
 */

/**
 * Build one daily-usage series, trimming to the cap and filling both numeric
 * fields so the UI never sees `undefined`.
 * @param {{ currency?: string, days?: number, points?: Array<Partial<DailyUsagePoint> & { date: string }> }} seed
 * @returns {DailyUsageSeries}
 */
export function makeDailyUsage(seed) {
  const points = (seed.points ?? [])
    .slice(-MAX_DAILY_USAGE_DAYS)
    .map((point) => ({
      date: point.date,
      cost: typeof point.cost === 'number' && Number.isFinite(point.cost) ? point.cost : null,
      tokens: typeof point.tokens === 'number' && Number.isFinite(point.tokens) ? point.tokens : null,
    }));
  return {
    currency: seed.currency ?? 'CNY',
    days: seed.days ?? points.length,
    points,
  };
}

/**
 * Build an empty window; adapters copy this and fill the fields they have, so
 * every emitted window carries every key.
 * @param {Partial<UsageWindow> & { id: string }} seed
 * @returns {UsageWindow}
 */
export function makeWindow(seed) {
  return {
    id: seed.id,
    labelKey: seed.labelKey ?? seed.id,
    unit: seed.unit ?? null,
    number: seed.number ?? null,
    limit: seed.limit ?? null,
    used: seed.used ?? null,
    remaining: seed.remaining ?? null,
    percent: seed.percent ?? null,
    derivedPercent: seed.derivedPercent ?? derivedPercentOf(seed.used, seed.limit),
    resetAt: seed.resetAt ?? null,
    note: seed.note ?? null,
  };
}

/**
 * Build an empty balance.
 * @param {Partial<Balance> & { currency: string }} seed
 * @returns {Balance}
 */
export function makeBalance(seed) {
  return {
    currency: seed.currency,
    available: seed.available ?? null,
    bonus: seed.bonus ?? null,
    totalSpent: seed.totalSpent ?? null,
  };
}

/**
 * Build one provider row.
 * @param {Partial<ProviderSnapshot> & { id: string, label: string, status: ProviderStatus }} seed
 * @returns {ProviderSnapshot}
 */
export function makeProvider(seed) {
  return {
    id: seed.id,
    label: seed.label,
    status: seed.status,
    message: seed.message ?? null,
    // Carried through the builder, not only spread on afterwards: a consumer
    // that builds a row *through* makeProvider must not silently lose the key
    // that tells the client which translation to render.
    messageKey: seed.messageKey ?? null,
    code: seed.code ?? null,
    plan: seed.plan ?? null,
    windows: seed.windows ?? [],
    balances: seed.balances ?? [],
    account: seed.account ?? null,
    meta: seed.meta ?? {},
    fetchedAt: seed.fetchedAt ?? null,
    latencyMs: seed.latencyMs ?? null,
  };
}

/**
 * Build the envelope. `ok` is derived, never passed in.
 * @param {{ generatedAt?: number, ttlMs: number, providers: ProviderSnapshot[] }} seed
 * @returns {UsageSnapshot}
 */
export function makeSnapshot(seed) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    generatedAt: seed.generatedAt ?? Date.now(),
    ok: seed.providers.length > 0 && seed.providers.every((row) => row.status === 'ok'),
    ttlMs: seed.ttlMs,
    ...(seed.stale === true ? { stale: true } : {}),
    ...(seed.refreshing === true ? { refreshing: true } : {}),
    providers: seed.providers,
  };
}

/**
 * Re-stamp an already-built envelope for one response.
 *
 * The cached snapshot stays pristine; each response gets its own shallow copy
 * carrying the freshness of *that* answer. Provider rows are shared by
 * reference because nothing mutates them after a read.
 *
 * @param {UsageSnapshot} snapshot A previously built envelope.
 * @param {{ stale?: boolean, refreshing?: boolean }} [flags]
 * @returns {UsageSnapshot}
 */
export function projectSnapshot(snapshot, flags = {}) {
  return {
    protocolVersion: snapshot.protocolVersion,
    generatedAt: snapshot.generatedAt,
    ok: snapshot.ok,
    ttlMs: snapshot.ttlMs,
    ...(flags.stale === true ? { stale: true } : {}),
    ...(flags.refreshing === true ? { refreshing: true } : {}),
    providers: snapshot.providers,
  };
}

/**
 * Round to one decimal, tolerating null.
 * @param {number|null|undefined} value
 * @returns {number|null}
 */
export function round1(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

/**
 * Consumed share as a 0–100 number.
 *
 * **The fraction wins over the provider's declared percentage.** Providers round
 * aggressively — GLM reports `percentage: 32` beside `currentValue: 656,
 * usage: 2000`, which is 32.8%, so trusting the declared value puts a number on
 * screen that visibly contradicts the `656 / 2000` printed right next to it.
 * Deriving from the raw pair makes the card self-consistent; the declared value
 * is only used when there is no usable numerator/denominator to divide.
 *
 * @param {number|null|undefined} used
 * @param {number|null|undefined} limit
 * @param {number|null|undefined} declared Provider-reported percentage; the fallback.
 * @returns {number|null}
 */
export function percentOf(used, limit, explicit) {
  const reported = round1(explicit);
  if (reported !== null) return reported;
  if (typeof used !== 'number' || typeof limit !== 'number' || limit <= 0) return null;
  return round1((used / limit) * 100);
}

/**
 * The share implied by a window's own numbers, ignoring what the provider
 * declared. Adapters echo this into `UsageWindow.derivedPercent` so a consumer
 * can render `derivedPercent ?? percent` and never print a percentage that
 * visibly contradicts the `used / limit` beside it.
 *
 * GLM is the motivating case: it reports `percentage: 32` next to
 * `currentValue: 656, usage: 2000`, which is 32.8%.
 *
 * @param {number|null|undefined} used
 * @param {number|null|undefined} limit
 * @returns {number|null} null when there is no usable pair to divide.
 */
export function derivedPercentOf(used, limit) {
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return null;
  return round1((used / limit) * 100);
}
