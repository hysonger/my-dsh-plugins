/**
 * Model-facing query tool for the usage board.
 *
 * The panel and the standalone page read `SnapshotService` over HTTP. This
 * module adds a third consumer that never touches the browser: a DSH Tool the
 * model can call. Sharing the same service instance is the point — one cache,
 * one set of in-flight reads, one degradation path — so asking the AI "how much
 * quota is left" cannot multiply upstream traffic.
 *
 * Two rules shape the output:
 *
 * - **It is a projection, not the wire protocol.** `src/shared/protocol.js` is
 *   frozen for both halves of the plugin; the tool's schema is a model-facing
 *   view that may add fields as the panel grows. Nothing here changes the HTTP
 *   contract or `PROTOCOL_VERSION`.
 * - **A provider failure is data.** A rejected credential or a rate limit is a
 *   row carrying a status and a sentence, never a failed tool call, so the
 *   model can answer "your GLM key was rejected" instead of losing the other
 *   services. Only invalid arguments fail the call.
 *
 * Secrets never enter this module: adapters hand over rows that already exclude
 * credentials, and {@link projectUsage} copies only a whitelist of display
 * fields — no `meta`, no `account`, no upstream body snippets.
 *
 * @module dsh-plugin-usage-board/host/tool
 */

import { MAX_DAILY_USAGE_DAYS, PROVIDER_IDS } from '../shared/protocol.js';
import { PROVIDERS } from './providers/index.js';

/** Tool name the model sees. */
export const TOOL_NAME = 'usage_query';

/** Per-call deadline: one cold aggregate read waits on at most one 12s provider read. */
export const TOOL_TIMEOUT_MS = 25_000;

/** Every status an adapter may report; mirrored from the protocol typedef. */
export const PROVIDER_STATUSES = Object.freeze([
  'ok',
  'not-configured',
  'unauthorized',
  'rate-limited',
  'upstream-error',
  'network-error',
  'invalid-response',
  'disabled',
]);

/** Display names, so the card title and the text agree with the panel. */
const LABELS = new Map(PROVIDERS.map((adapter) => [adapter.id, adapter.label]));

const STRING_SCHEMA = { type: 'string' };
const NUMBER_SCHEMA = { type: 'number' };

/** Shape of one normalized quota window in the tool's value. */
const WINDOW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: {
    id: STRING_SCHEMA,
    label: STRING_SCHEMA,
    unit: STRING_SCHEMA,
    limit: NUMBER_SCHEMA,
    used: NUMBER_SCHEMA,
    remaining: NUMBER_SCHEMA,
    percent: NUMBER_SCHEMA,
    resetAt: NUMBER_SCHEMA,
  },
};

/** Shape of one normalized money balance in the tool's value. */
const BALANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['currency'],
  properties: {
    currency: STRING_SCHEMA,
    available: NUMBER_SCHEMA,
    bonus: NUMBER_SCHEMA,
    totalSpent: NUMBER_SCHEMA,
  },
};

/** Shape of the trailing daily-spend series when `days` is requested. */
const SPEND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['currency', 'days', 'complete', 'points'],
  properties: {
    currency: STRING_SCHEMA,
    days: NUMBER_SCHEMA,
    complete: { type: 'boolean' },
    total: NUMBER_SCHEMA,
    points: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date'],
        properties: {
          date: STRING_SCHEMA,
          cost: NUMBER_SCHEMA,
        },
      },
    },
  },
};

/** Shape of the DeepSeek peak/off-peak projection. */
const BILLING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['phase'],
  properties: {
    phase: { type: 'string', enum: ['peak', 'offpeak'] },
    offPeakMultiplier: NUMBER_SCHEMA,
    nextChangeAt: NUMBER_SCHEMA,
    nextPhase: { type: 'string', enum: ['peak', 'offpeak'] },
  },
};

/** Shape of one provider row in the tool's value. */
const PROVIDER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'status', 'windows', 'balances'],
  properties: {
    id: { type: 'string', enum: [...PROVIDER_IDS] },
    label: STRING_SCHEMA,
    status: { type: 'string', enum: [...PROVIDER_STATUSES] },
    message: STRING_SCHEMA,
    code: STRING_SCHEMA,
    plan: STRING_SCHEMA,
    windows: { type: 'array', items: WINDOW_SCHEMA },
    balances: { type: 'array', items: BALANCE_SCHEMA },
    spend: SPEND_SCHEMA,
    billing: BILLING_SCHEMA,
    fetchedAt: NUMBER_SCHEMA,
  },
};

/** Shape of the whole tool value. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['generatedAt', 'ageSeconds', 'ttlMs', 'stale', 'refreshing', 'ok', 'providers'],
  properties: {
    generatedAt: NUMBER_SCHEMA,
    ageSeconds: NUMBER_SCHEMA,
    ttlMs: NUMBER_SCHEMA,
    stale: { type: 'boolean' },
    refreshing: { type: 'boolean' },
    ok: { type: 'boolean' },
    providers: { type: 'array', items: PROVIDER_SCHEMA },
  },
};

/**
 * Build the model-facing tool over an existing snapshot service.
 *
 * @param {object} options
 * @param {import('./snapshot.js').SnapshotService} options.snapshots Shared cache and upstream reads.
 * @param {() => number} [options.now] Clock injection seam for tests.
 * @returns {object} A `ToolDefinition` ready for `ctx.tools.register`.
 */
export function createUsageQueryTool({ snapshots, now = () => Date.now() }) {
  const clock = typeof now === 'function' ? now : () => Date.now();
  return {
    name: TOOL_NAME,
    description:
      "Report the user's current usage, remaining quota and balances for their metered AI services. " +
      'Returns one row per service with status, plan, quota windows (used, limit, remaining, percent, reset time) ' +
      'and balances, plus DeepSeek\'s recent daily spend when requested. ' +
      'Use when the user asks how much quota or balance is left.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: {
          type: 'string',
          enum: [...PROVIDER_IDS],
          description: 'Service to report; omit to report every service.',
        },
        refresh: {
          type: 'boolean',
          description:
            'Read upstream again instead of returning numbers up to the cache lifetime old. ' +
            'Slower, and repeated refreshes can trip provider rate limits. Defaults to false.',
        },
        days: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_DAILY_USAGE_DAYS,
          description:
            'Trailing daily-spend days to include for services that publish history (DeepSeek only). ' +
            'Omit to leave the spend series out.',
        },
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatUsage(value) }],
    },
    timeoutMs: TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => true,
    async execute(args) {
      const request = parseArguments(args, snapshots.providerIds);
      // The serving read is deliberate: a model call must not sit on the
      // slowest provider when a usable cache exists, and every number carries
      // its own age so the answer can say how fresh it is.
      const envelope = request.provider === null
        ? request.refresh
          ? await snapshots.get({ force: true })
          : await snapshots.getServing()
        : await snapshots.getProvider(request.provider, { force: request.refresh });
      return projectUsage(envelope, { days: request.days, now: clock() });
    },
    presentCall(args) {
      const provider = typeof args?.provider === 'string' ? args.provider : null;
      const label = provider === null ? 'All services' : LABELS.get(provider) ?? provider;
      const rawInput = {};
      if (provider !== null) rawInput.provider = provider;
      if (args?.refresh === true) rawInput.refresh = true;
      if (Number.isInteger(args?.days)) rawInput.days = args.days;
      return { card: 'generic', title: `${label} · usage`, kind: 'read', rawInput };
    },
  };
}

/**
 * Normalize and validate the model's arguments.
 *
 * A wrong provider must fail loudly: silently answering "all services" would
 * make the model report the wrong service's numbers. Same for `days` — a
 * clamped window would look like a provider gap.
 *
 * @param {unknown} args Raw tool arguments.
 * @param {readonly string[]} [knownProviders] Providers the service can answer for.
 * @returns {{ provider: string|null, refresh: boolean, days: number|null }}
 */
export function parseArguments(args, knownProviders) {
  const input = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const ids = Array.isArray(knownProviders) && knownProviders.length > 0
    ? knownProviders
    : PROVIDER_IDS;

  let provider = null;
  if (input.provider !== undefined && input.provider !== null) {
    if (typeof input.provider !== 'string' || !ids.includes(input.provider)) {
      throw new Error(
        `Unknown usage provider ${formatArgument(input.provider)}. Known providers: ${ids.join(', ')}.`,
      );
    }
    provider = input.provider;
  }

  if (input.refresh !== undefined && typeof input.refresh !== 'boolean') {
    throw new Error('refresh must be a boolean.');
  }

  let days = null;
  if (input.days !== undefined && input.days !== null) {
    if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_DAILY_USAGE_DAYS) {
      throw new Error(`days must be an integer from 1 to ${MAX_DAILY_USAGE_DAYS}.`);
    }
    days = input.days;
  }

  return { provider, refresh: input.refresh === true, days };
}

/**
 * Project one snapshot envelope onto the tool's model-facing value.
 *
 * Only whitelisted display fields survive; `meta`, `account`, `messageKey` and
 * upstream body snippets never do. Fields with no value are omitted rather than
 * emitted as `null`, which keeps the payload small and the schema simple.
 *
 * @param {import('../shared/protocol.js').UsageSnapshot} envelope
 * @param {{ days?: number|null, now?: number }} [options]
 * @returns {object}
 */
export function projectUsage(envelope, options = {}) {
  const now = finite(options.now) ?? Date.now();
  const days = Number.isInteger(options.days) ? options.days : null;
  const providers = Array.isArray(envelope?.providers) ? envelope.providers : [];
  let oldestAgeMs = 0;
  const rows = providers.map((row) => {
    const reference = finite(row?.fetchedAt) ?? finite(envelope?.generatedAt) ?? now;
    oldestAgeMs = Math.max(oldestAgeMs, Math.max(0, now - reference));
    return projectRow(row, { days, now });
  });

  return {
    generatedAt: finite(envelope?.generatedAt) ?? now,
    // The age of the OLDEST row: "how stale can this answer be", not "how
    // recently did the fastest provider answer".
    ageSeconds: Math.round(oldestAgeMs / 1000),
    ttlMs: finite(envelope?.ttlMs) ?? 0,
    stale: envelope?.stale === true,
    refreshing: envelope?.refreshing === true,
    ok: providers.length > 0 && rows.every((row) => row.status === 'ok'),
    providers: rows,
  };
}

/**
 * Project one provider row.
 * @param {import('../shared/protocol.js').ProviderSnapshot} row
 * @param {{ days: number|null, now: number }} options
 * @returns {object}
 */
function projectRow(row, options) {
  const id = typeof row?.id === 'string' ? row.id : '';
  const projected = {
    id,
    label: typeof row?.label === 'string' && row.label !== '' ? row.label : LABELS.get(id) ?? id,
    status: PROVIDER_STATUSES.includes(row?.status) ? row.status : 'upstream-error',
    windows: projectWindows(row?.windows),
    balances: projectBalances(row?.balances),
  };
  if (typeof row?.message === 'string' && row.message !== '') projected.message = row.message;
  if (typeof row?.code === 'string' && row.code !== '') projected.code = row.code;
  if (typeof row?.plan === 'string' && row.plan !== '') projected.plan = row.plan;
  const spend = projectSpend(row, options.days);
  if (spend !== null) projected.spend = spend;
  const billing = projectBilling(row, options.now);
  if (billing !== null) projected.billing = billing;
  const fetchedAt = finite(row?.fetchedAt);
  if (fetchedAt !== null) projected.fetchedAt = fetchedAt;
  return projected;
}

/**
 * Project quota windows, preferring the share derived from `used / limit`.
 * @param {unknown} windows
 * @returns {object[]}
 */
function projectWindows(windows) {
  if (!Array.isArray(windows)) return [];
  return windows.map((window) => {
    const id = typeof window?.id === 'string' ? window.id : String(window?.id ?? 'window');
    const projected = { id, label: windowLabel(id) };
    if (window?.unit !== undefined && window?.unit !== null && window.unit !== '') {
      projected.unit = String(window.unit);
    }
    for (const key of ['limit', 'used', 'remaining']) {
      const value = finite(window?.[key]);
      if (value !== null) projected[key] = value;
    }
    // The fraction wins over the provider's declared percentage, for the same
    // reason the panel does: a percentage that contradicts the `used / limit`
    // printed beside it destroys trust in every number on the row.
    const percent = finite(window?.derivedPercent) ?? finite(window?.percent);
    if (percent !== null) projected.percent = percent;
    const resetAt = finite(window?.resetAt);
    if (resetAt !== null) projected.resetAt = resetAt;
    return projected;
  });
}

/**
 * Project money balances.
 * @param {unknown} balances
 * @returns {object[]}
 */
function projectBalances(balances) {
  if (!Array.isArray(balances)) return [];
  const projected = [];
  for (const balance of balances) {
    const currency = balance?.currency;
    if (typeof currency !== 'string' || currency === '') continue;
    const row = { currency };
    for (const key of ['available', 'bonus', 'totalSpent']) {
      const value = finite(balance?.[key]);
      if (value !== null) row[key] = value;
    }
    projected.push(row);
  }
  return projected;
}

/**
 * Project the trailing daily-spend series when the caller asked for it.
 * @param {import('../shared/protocol.js').ProviderSnapshot} row
 * @param {number|null} days
 * @returns {object|null}
 */
function projectSpend(row, days) {
  if (!Number.isInteger(days)) return null;
  const series = row?.meta?.dailyUsage;
  if (series === null || typeof series !== 'object' || !Array.isArray(series.points)) return null;
  const points = series.points.slice(-days).map((point) => {
    const date = typeof point?.date === 'string' ? point.date : String(point?.date ?? '');
    const cost = finite(point?.cost);
    return cost === null ? { date } : { date, cost };
  });
  const projected = {
    currency: typeof series.currency === 'string' && series.currency !== '' ? series.currency : 'CNY',
    days,
    // The history endpoint pads only elapsed days, so a short series means the
    // window genuinely reaches further back than the data does.
    complete: series.points.length >= days,
    points,
  };
  const total = points.reduce((sum, point) => sum + (finite(point.cost) ?? 0), 0);
  if (points.some((point) => finite(point.cost) !== null)) projected.total = roundMoney(total);
  return projected;
}

/**
 * Project DeepSeek's peak/off-peak schedule onto the two facts a model needs:
 * which phase is active now and when it changes next.
 *
 * Phases are recomputed from the absolute transition instants at call time, so
 * a cached snapshot (up to `ttlMs` old) still answers correctly across a phase
 * boundary without the tool re-reading upstream.
 *
 * @param {import('../shared/protocol.js').ProviderSnapshot} row
 * @param {number} now
 * @returns {object|null}
 */
function projectBilling(row, now) {
  const pricing = row?.meta?.pricing;
  if (pricing === null || typeof pricing !== 'object') return null;

  let phase = pricingPhase(pricing.phase);
  let next = null;
  for (const transition of Array.isArray(pricing.transitions) ? pricing.transitions : []) {
    const at = finite(transition?.at);
    const transitionPhase = pricingPhase(transition?.phase);
    if (at === null || transitionPhase === null) continue;
    if (at <= now) {
      // Transitions arrive ascending; the last one at or before `now` wins.
      phase = transitionPhase;
    } else if (next === null || at < next.at) {
      next = { at, phase: transitionPhase };
    }
  }
  if (phase === null) return null;

  const projected = { phase };
  const multiplier = finite(pricing.offPeakMultiplier);
  if (multiplier !== null) projected.offPeakMultiplier = multiplier;
  if (next !== null) {
    projected.nextChangeAt = next.at;
    projected.nextPhase = next.phase;
  }
  return projected;
}

/**
 * Narrow a pricing phase string.
 * @param {unknown} value
 * @returns {'peak'|'offpeak'|null}
 */
function pricingPhase(value) {
  return value === 'peak' || value === 'offpeak' ? value : null;
}

/**
 * Human label for a window id.
 *
 * The adapters give windows stable ids (`glm.5h`, `kimi.weekly`,
 * `opencode-go.monthly`, `kimi.3d`); deriving the label here keeps the host
 * free of the client's locale dictionary while still saying something a model
 * can print. An unrecognized id is returned verbatim rather than guessed.
 *
 * @param {string} id
 * @returns {string}
 */
export function windowLabel(id) {
  const suffix = typeof id === 'string' ? id.split('.').pop() ?? '' : '';
  if (suffix === 'weekly') return 'Weekly window';
  if (suffix === 'monthly') return 'Monthly window';
  if (suffix === 'window') return 'Usage window';
  const match = /^(\d+)([hdm])$/.exec(suffix);
  if (match !== null) {
    const amount = Number(match[1]);
    const unit = { h: 'hour', d: 'day', m: 'minute' }[match[2]];
    return `${amount}-${unit} window`;
  }
  return suffix === '' ? 'Usage window' : id;
}

/**
 * Render the value as compact Markdown for the model.
 *
 * This is the model's whole view of the board, so it must stay bounded and
 * self-contained: no `null`, no locale keys, no raw JSON, and no fact that the
 * model would have to re-derive by hand (reset instants in ISO-8601 UTC plus a
 * relative duration, Beijing time for the billing rule that is defined there).
 *
 * @param {object} value A {@link projectUsage} result.
 * @param {{ now?: number }} [options]
 * @returns {string}
 */
export function formatUsage(value, options = {}) {
  const now = finite(options.now) ?? Date.now();
  const providers = Array.isArray(value?.providers) ? value.providers : [];
  const header = [
    `Usage board — ${providers.length} ${providers.length === 1 ? 'service' : 'services'}`,
    value?.ageSeconds > 0 ? `oldest number ${formatAge(value.ageSeconds * 1000)} old` : 'up to date',
    `cache ${Math.max(0, Math.round((finite(value?.ttlMs) ?? 0) / 1000))}s`,
  ];
  if (value?.refreshing === true) header.push('refreshing in the background');
  else if (value?.stale === true) header.push('cached');

  const lines = [header.join(' · ')];
  if (providers.length === 0) {
    lines.push('', 'No metered services are registered.');
    return lines.join('\n');
  }

  let includesSpend = false;
  for (const row of providers) {
    lines.push('');
    lines.push(row.plan ? `${row.label} (${row.status}, plan: ${row.plan})` : `${row.label} (${row.status})`);
    if (row.status !== 'ok') {
      if (row.message) lines.push(`  ${row.message}`);
      if (row.code) lines.push(`  Code: ${row.code}`);
      continue;
    }
    for (const balance of row.balances ?? []) lines.push(`  Balance: ${formatBalance(balance)}`);
    for (const window of row.windows ?? []) lines.push(`  ${formatWindow(window, now)}`);
    if ((row.balances ?? []).length === 0 && (row.windows ?? []).length === 0) {
      lines.push('  This service reports neither balances nor quota windows.');
    }
    if (row.billing) lines.push(`  Billing: ${formatBilling(row.billing, now)}`);
    if (row.spend) {
      includesSpend = true;
      lines.push(`  Spend: ${formatSpend(row.spend)}`);
    }
  }
  if (includesSpend) {
    lines.push('', "Spend totals are local sums of daily costs, not the provider's bill.");
  }
  return lines.join('\n');
}

/**
 * Render one money balance.
 * @param {object} balance
 * @returns {string}
 */
function formatBalance(balance) {
  const parts = [];
  if (finite(balance?.available) !== null) parts.push(`${balance.currency} ${formatMoney(balance.available)} available`);
  else parts.push(`${balance.currency} balance not reported`);
  if (finite(balance?.bonus) !== null) parts.push(`bonus ${formatMoney(balance.bonus)}`);
  if (finite(balance?.totalSpent) !== null) parts.push(`lifetime spend ${formatMoney(balance.totalSpent)}`);
  return parts.join('; ');
}

/**
 * Render one quota window, coping with providers that report only a percentage.
 * @param {object} window
 * @param {number} now
 * @returns {string}
 */
function formatWindow(window, now) {
  const parts = [];
  const used = finite(window?.used);
  const limit = finite(window?.limit);
  const remaining = finite(window?.remaining);
  const percent = finite(window?.percent);

  if (used !== null && limit !== null) {
    parts.push(`${formatQuantity(used)} / ${formatQuantity(limit)} used${percent === null ? '' : ` (${percent}%)`}`);
    if (remaining !== null) parts.push(`${formatQuantity(remaining)} remaining`);
  } else if (percent !== null) {
    parts.push(`${percent}% used`);
    if (remaining !== null) parts.push(`${formatQuantity(remaining)} remaining`);
  } else if (remaining !== null) {
    parts.push(`${formatQuantity(remaining)} remaining`);
  } else {
    parts.push('usage not reported');
  }

  const resetAt = finite(window?.resetAt);
  if (resetAt !== null) parts.push(`resets ${formatInstant(resetAt, now)}`);
  return `${window.label}: ${parts.join(' · ')}`;
}

/**
 * Render the DeepSeek billing projection.
 * @param {object} billing
 * @param {number} now
 * @returns {string}
 */
function formatBilling(billing, now) {
  const multiplier = finite(billing?.offPeakMultiplier);
  let text = billing.phase === 'peak'
    ? 'peak now (standard price)'
    : `off-peak now${multiplier === null ? '' : ` (${multiplier}× peak price)`}`;
  const nextAt = finite(billing?.nextChangeAt);
  if (nextAt !== null && (billing.nextPhase === 'peak' || billing.nextPhase === 'offpeak')) {
    const starts = billing.nextPhase === 'peak' ? 'peak starts' : 'off-peak starts';
    text += `; ${starts} ${formatBeijing(nextAt)} Beijing time (UTC+8, ${formatUntil(nextAt, now)})`;
  }
  return text;
}

/**
 * Render the trailing daily-spend series.
 * @param {object} spend
 * @returns {string}
 */
function formatSpend(spend) {
  const total = finite(spend?.total);
  const windowText = total === null
    ? `${spend.days} trailing days, costs not reported`
    : `${spend.currency} ${formatMoney(total)} over the last ${spend.days} ${spend.days === 1 ? 'day' : 'days'}`;
  const points = Array.isArray(spend?.points) ? spend.points : [];
  const series = points
    .map((point) => `${String(point?.date).slice(5)}: ${finite(point?.cost) === null ? 'n/a' : formatMoney(point.cost)}`)
    .join(', ');
  const incomplete = spend?.complete === false
    ? ` (only ${points.length} ${points.length === 1 ? 'day' : 'days'} available)`
    : '';
  return series === '' ? `${windowText}${incomplete}` : `${windowText}${incomplete}; ${series}`;
}

/**
 * An absolute instant, relative to the caller, plus ISO-8601 UTC.
 * @param {number} epochMs
 * @param {number} now
 * @returns {string}
 */
function formatInstant(epochMs, now) {
  const iso = new Date(epochMs).toISOString();
  return epochMs > now ? `in ${formatDuration(epochMs - now)} (${iso})` : `at ${iso}`;
}

/**
 * The same instant in Beijing time, where DeepSeek defines its billing rule.
 * @param {number} epochMs
 * @returns {string} `YYYY-MM-DD HH:mm` (UTC+8, no zone suffix).
 */
function formatBeijing(epochMs) {
  const shifted = new Date(epochMs + 8 * 3_600_000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`;
}

/**
 * Relative time until an instant, for a sentence that already names it.
 * @param {number} target
 * @param {number} now
 * @returns {string}
 */
function formatUntil(target, now) {
  return target > now ? `in ${formatDuration(target - now)}` : 'now';
}

/**
 * Age of the oldest number: seconds while that is still useful, then coarse.
 * @param {number} ms
 * @returns {string}
 */
function formatAge(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : formatDuration(ms);
}

/**
 * Coarse, timezone-free duration: `2d 3h`, `45m`, `under a minute`.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return 'under a minute';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (rest > 0 && days === 0) parts.push(`${rest}m`);
  return parts.join(' ');
}

/**
 * Money and counts: integers stay bare, everything else is trimmed to 2 places.
 * @param {number} value
 * @returns {string}
 */
function formatQuantity(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * Money with the two decimals the panel shows.
 * @param {number} value
 * @returns {string}
 */
function formatMoney(value) {
  return Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

/**
 * Round a locally summed amount to cents; the providers report 6+ decimals.
 * @param {number} value
 * @returns {number}
 */
function roundMoney(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/**
 * Describe a bad argument without ever printing `[object Object]`.
 * @param {unknown} value
 * @returns {string}
 */
function formatArgument(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * A finite number, or null.
 * @param {unknown} value
 * @returns {number|null}
 */
function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
