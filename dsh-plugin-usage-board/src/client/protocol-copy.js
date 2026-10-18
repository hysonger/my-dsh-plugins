/**
 * GENERATED COPY — do not edit by hand.
 *
 * Carries the constants and the parse helpers of `src/shared/protocol.js`
 * verbatim, minus the `export` keyword, because the browser half is served as
 * a standalone DSH client bundle and cannot import that module. The text below
 * is embedded byte-identically in `lib/client.js`; nothing imports this file.
 *
 * `test/client-bundle.test.js` fails when any declaration here — or in the
 * bundle — drifts from `src/shared/protocol.js`. Keep the order and the shape
 * of every declaration identical to the shared module.
 *
 * Body fragment: no import/export statements of its own.
 */

/** Monotonic protocol revision, bumped only for incompatible additions. */
const PROTOCOL_VERSION = 1;

/** Every provider id this dashboard knows, in display order. */
const PROVIDER_IDS = ['deepseek', 'glm', 'kimi'];

/** Provider ids whose upstream API is a quota window API rather than a wallet. */
const QUOTA_PROVIDER_IDS = ['glm', 'kimi'];

/** HTTP path the host half serves the snapshot on (GET). */
const SNAPSHOT_PATH = '/usage-board/api/snapshot';

/**
 * HTTP path the host half serves a forced refresh on (POST). Returns the same
 * body as {@link SNAPSHOT_PATH}.
 */
const REFRESH_PATH = '/usage-board/api/refresh';

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
const PROVIDER_PATH = '/usage-board/api/provider';

/** Query parameter selecting the provider for {@link PROVIDER_PATH}. */
const PROVIDER_QUERY_PARAM = 'id';

/** HTTP prefix owning every route this plugin registers. */
const ROUTE_PREFIX = '/usage-board';

/**
 * Maximum number of trailing days an adapter may put in `meta.dailyUsage`.
 * The UI renders the last 14; the cap keeps a snapshot small.
 */
const MAX_DAILY_USAGE_DAYS = 31;

/**
 * Build one daily-usage series, trimming to the cap and filling both numeric
 * fields so the UI never sees `undefined`.
 * @param {{ currency?: string, days?: number, points?: Array<Partial<DailyUsagePoint> & { date: string }> }} seed
 * @returns {DailyUsageSeries}
 */
function makeDailyUsage(seed) {
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
function makeWindow(seed) {
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
function makeBalance(seed) {
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
function makeProvider(seed) {
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
function makeSnapshot(seed) {
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
 * Round to one decimal, tolerating null.
 * @param {number|null|undefined} value
 * @returns {number|null}
 */
function round1(value) {
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
function percentOf(used, limit, explicit) {
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
function derivedPercentOf(used, limit) {
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return null;
  return round1((used / limit) * 100);
}
