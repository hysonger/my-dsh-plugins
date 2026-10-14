/**
 * Kimi Code (Kimi For Coding) adapter.
 *
 * Verified live 2026-10-14 with a real `sk-kimi-…` subscription key:
 * ```
 * GET https://api.kimi.com/coding/v1/usages      -> 200 (CN, ~200 ms)
 * GET https://api.kimi.ai/coding/v1/usages       -> 200 (global, ~860 ms)
 * Authorization: Bearer <key>
 * ```
 * Body:
 * ```json
 * {"usage":{"limit":"100","used":"43","remaining":"57","resetTime":"2026-10-16T08:11:56Z"},
 *  "limits":[{"window":{"duration":300,"timeUnit":"TIME_UNIT_MINUTE"},
 *             "detail":{"limit":"100","used":"36","remaining":"64","resetTime":"2026-10-14T07:11:56Z"}}],
 *  "usages":{"limit_5h":{"used_ratio":0.357,"reset_time":"2026-10-14T07:11:55Z"},
 *            "limit_7d":{"used_ratio":0.4266,"reset_time":"2026-10-16T08:11:55Z"}},
 *  "booster_wallet":{... "status":"STATUS_DISABLED" ...}}
 * ```
 *
 * The three representations overlap and are merged rather than picked. The
 * `usages` map is the authoritative source — its `used_ratio` carries the
 * precise fraction (0.357 where `limits[].detail` only gives 36/100 = 0.36) and
 * its `reset_time` was observed updating live while the other two blocks stayed
 * byte-identical across 25 s samples. `limits[]` supplies the 5-hour window's
 * limit/used/remaining and the top-level `usage` the plan (7-day) aggregate;
 * they are fallbacks for `resetAt` and for any field `usages` does not carry.
 * Exactly two windows are expected for this plan ('kimi.5h', 'kimi.weekly').
 *
 * The subscription key is *not* a Moonshot platform key:
 * `api.moonshot.cn/v1/users/me/balance` answers 401 Invalid Authentication for
 * it and is deliberately not shipped. No balance endpoint exists for this key
 * (~40 candidate paths 404 on `api.kimi.com`), so `balances` is always empty
 * and the quota windows are the payload. The `booster_wallet` in this response
 * has no amount, a nil subscription id and a year-2126 sentinel period end, so
 * it is surfaced as `meta.booster`, never as money.
 *
 * `account` is deliberately null: the only identity the API offers is a
 * **phone number** (masked upstream as `155****3753`) and a nickname Kimi
 * derives from it (`登月者3753`, same digits). Neither belongs on a usage
 * dashboard, and `user_level_name` ("Allegretto") is Kimi's gamified account
 * level rather than a coding-plan tier, so `plan` stays null too — a wrong
 * label is worse than no label.
 *
 * @module dsh-plugin-usage-board/host/providers/kimi
 */

import { makeProvider, makeWindow, percentOf } from '../../shared/protocol.js';
import {
  classifyTransport,
  clock,
  completeTriple,
  epochMs,
  failureFromThrow,
  invalidResponse,
  mostSpecificFailure,
  numberOrNull,
  requestOptions,
  resolveSecret,
} from './common.js';

/** Provider id, a `PROVIDER_IDS` member. */
const ID = 'kimi';

/** Display name. */
const LABEL = 'Kimi Code';

/** Credential reference resolved through the host's secret store. */
const CREDENTIAL_REF = 'KIMI_CODING_API_KEY';

/**
 * Regional API bases, in attempt order. `api.kimi.com` is the China host that
 * answered in ~200 ms; `api.kimi.ai` is the international mirror serving an
 * identical body.
 */
const HOSTS = [
  { host: 'api.kimi.com', base: 'https://api.kimi.com/coding/v1' },
  { host: 'api.kimi.ai', base: 'https://api.kimi.ai/coding/v1' },
];

/** Path of the quota endpoint, relative to a host base. */
const USAGES_PATH = '/usages';

/** Two minutes of slack when matching `usage` to a ratio window by reset time. */
const RESET_MATCH_SLACK_MS = 120_000;

/** Display rank so the 5-hour window always precedes the weekly one. */
const WINDOW_RANK = new Map([
  ['kimi.5h', 0],
  ['kimi.weekly', 1],
]);

/**
 * @typedef {import('./common.js').AdapterFailure} AdapterFailure
 * @typedef {import('../../shared/protocol.js').UsageWindow} UsageWindow
 */

/**
 * @typedef {object} WindowSeed
 * @property {string} id
 * @property {number|null} limit
 * @property {number|null} used
 * @property {number|null} remaining
 * @property {number|null} resetAt
 * @property {number|null} ratioPercent Provider-reported fraction as 0–100.
 * @property {string|null} ratioUnit Textual unit from the `usages` key ('5h'), used
 *   when no `limits[].window` descriptor covers the same window.
 * @property {string|null} unit
 * @property {number} rank
 * @property {number} index
 */

/**
 * Window id for a duration in minutes: the two windows Kimi Code actually
 * exposes get stable ids ('kimi.5h', 'kimi.weekly'), anything else is still
 * emitted under a duration-derived id.
 *
 * @param {number} minutes
 * @returns {string}
 */
function idFromMinutes(minutes) {
  if (minutes === 300) return 'kimi.5h';
  if (minutes === 10080) return 'kimi.weekly';
  if (minutes % 1440 === 0) return `kimi.${minutes / 1440}d`;
  if (minutes % 60 === 0) return `kimi.${minutes / 60}h`;
  return `kimi.${minutes}m`;
}

/**
 * Window id for a `usages` map key such as `limit_5h` / `limit_7d`.
 *
 * @param {string} key
 * @returns {string}
 */
function idFromRatioKey(key) {
  const suffix = key.replace(/^limit_/, '');
  const match = /^(\d+)([hdm])$/.exec(suffix);
  if (match) {
    const amount = Number(match[1]);
    if (match[2] === 'h') return idFromMinutes(amount * 60);
    if (match[2] === 'd') return idFromMinutes(amount * 1440);
    return idFromMinutes(amount);
  }
  return `kimi.${suffix}`;
}

/**
 * Textual unit from a `usages` key such as `limit_5h` -> '5h', used as the
 * window's `unit` when no `limits[].window` descriptor covers the same window.
 *
 * @param {string} key
 * @returns {string|null}
 */
function unitFromRatioKey(key) {
  const suffix = key.replace(/^limit_/, '');
  return /^\d+[hdm]$/.test(suffix) ? suffix : null;
}

/**
 * Window id for a `limits[].window` descriptor. Recognized units are converted
 * to minutes so the two real windows land on their stable ids; an unrecognized
 * unit is *not* silently assumed to be minutes — it keeps its own id so a new
 * Zhipu-style window type can never be mistaken for a known one.
 *
 * @param {any} window
 * @returns {{ id: string, unit: string|null }}
 */
function windowIdFromWindow(window) {
  const unit = typeof window?.timeUnit === 'string' && window.timeUnit !== '' ? window.timeUnit : null;
  const duration = numberOrNull(window?.duration);
  if (duration === null) return { id: 'kimi.window', unit };
  const perUnit = {
    TIME_UNIT_SECOND: 1 / 60,
    TIME_UNIT_MINUTE: 1,
    TIME_UNIT_HOUR: 60,
    TIME_UNIT_DAY: 1440,
    TIME_UNIT_WEEK: 10080,
  }[unit ?? ''];
  if (perUnit === undefined) {
    const token = (unit ?? 'unit').replace(/^TIME_UNIT_/, '').toLowerCase() || 'unit';
    return { id: `kimi.window.${duration}${token}`, unit };
  }
  return { id: idFromMinutes(duration * perUnit), unit };
}

/**
 * Merge the three overlapping quota representations into normalized windows.
 *
 * @param {any} json Parsed `/usages` body.
 * @param {string} rawBody
 * @returns {{ windows: UsageWindow[] }|{ failure: AdapterFailure }}
 */
function parseUsages(json, rawBody) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return { failure: invalidResponse('The Kimi Code API returned an unexpected body.', rawBody) };
  }

  const errorType = json.error?.type;
  if (typeof errorType === 'string' && errorType !== '') {
    const authLike = /auth|unauthor|invalid_api_key|expired/i.test(errorType);
    return {
      failure: {
        status: authLike ? 'unauthorized' : 'upstream-error',
        code: errorType,
        message: authLike
          ? 'The Kimi Code credential was rejected; check KIMI_CODING_API_KEY.'
          : 'The Kimi Code API reported an error.',
      },
    };
  }

  /** @type {Map<string, WindowSeed>} */
  const seeds = new Map();
  /**
   * @param {string} id
   * @returns {WindowSeed}
   */
  const add = (id) => {
    let seed = seeds.get(id);
    if (!seed) {
      seed = {
        id,
        limit: null,
        used: null,
        remaining: null,
        resetAt: null,
        ratioPercent: null,
        ratioUnit: null,
        unit: null,
        rank: WINDOW_RANK.get(id) ?? 2,
        index: seeds.size,
      };
      seeds.set(id, seed);
    }
    return seed;
  };

  // 1) Authoritative source: precise fractions keyed by window
  //    (`usages.limit_5h`, `usages.limit_7d`). Its `reset_time` is the freshest
  //    reset the API exposes, so it also wins over the other two blocks' values.
  const ratios = json.usages;
  if (ratios !== null && typeof ratios === 'object' && !Array.isArray(ratios)) {
    for (const [key, value] of Object.entries(ratios)) {
      const seed = add(idFromRatioKey(key));
      const ratio = numberOrNull(value?.used_ratio);
      seed.ratioPercent = ratio === null ? null : ratio * 100;
      seed.ratioUnit = seed.ratioUnit ?? unitFromRatioKey(key);
      seed.resetAt = seed.resetAt ?? epochMs(value?.reset_time ?? value?.resetTime);
    }
  }

  // 2) Window details: `limits[].window` + `.detail` (the 5-hour window).
  //    Fallbacks only — `seed.X ?? candidate` keeps the `usages` values.
  const limits = Array.isArray(json.limits) ? json.limits : [];
  for (const entry of limits) {
    const descriptor = windowIdFromWindow(entry?.window);
    const seed = add(descriptor.id);
    seed.unit = descriptor.unit ?? seed.unit;
    const detail = entry?.detail;
    if (detail !== null && typeof detail === 'object') {
      seed.limit = seed.limit ?? numberOrNull(detail.limit);
      seed.used = seed.used ?? numberOrNull(detail.used);
      seed.remaining = seed.remaining ?? numberOrNull(detail.remaining);
      seed.resetAt = seed.resetAt ?? epochMs(detail.resetTime);
    }
  }

  // 3) Plan aggregate: the top-level `usage`, matched to whichever window
  //    shares its reset time (live: `limit_7d`), else emitted on its own.
  const usage = json.usage;
  if (usage !== null && typeof usage === 'object' && !Array.isArray(usage)) {
    const planReset = epochMs(usage.resetTime);
    const matched =
      planReset === null
        ? undefined
        : [...seeds.values()].find(
            (seed) => seed.resetAt !== null && Math.abs(seed.resetAt - planReset) <= RESET_MATCH_SLACK_MS,
          );
    const seed = matched ?? add(planReset === null ? 'kimi.plan' : 'kimi.weekly');
    seed.limit = seed.limit ?? numberOrNull(usage.limit);
    seed.used = seed.used ?? numberOrNull(usage.used);
    seed.remaining = seed.remaining ?? numberOrNull(usage.remaining);
    seed.resetAt = seed.resetAt ?? planReset;
  }

  const windows = [...seeds.values()]
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(windowFromSeed);

  if (windows.length === 0) {
    return { failure: invalidResponse('The Kimi Code API returned no quota windows.', rawBody) };
  }
  return { windows };
}

/**
 * Normalize one merged seed.
 *
 * @param {WindowSeed} seed
 * @returns {UsageWindow}
 */
function windowFromSeed(seed) {
  const triple = completeTriple({ limit: seed.limit, used: seed.used, remaining: seed.remaining });
  // The provider's own 0–1 fraction from `usages` is the precise number (it
  // resolved 0.357 where the other blocks only had 36/100) and wins; the
  // used/limit pair is the fallback when only `limits[]`/`usage` are present.
  const percent = percentOf(triple.used, triple.limit, seed.ratioPercent);

  return makeWindow({
    id: seed.id,
    labelKey: seed.id,
    unit: seed.unit ?? seed.ratioUnit,
    number: null,
    limit: triple.limit,
    used: triple.used,
    remaining: triple.remaining,
    percent,
    resetAt: seed.resetAt,
  });
}

/**
 * Kimi Code adapter.
 *
 * @type {import('./common.js').ProviderAdapter}
 */
export const kimiAdapter = {
  id: ID,
  label: LABEL,
  credentialRefs: [CREDENTIAL_REF],

  /**
   * Read the live Kimi Code quota.
   *
   * @param {import('./common.js').AdapterReadContext} context
   * @returns {Promise<import('../../shared/protocol.js').ProviderSnapshot>}
   */
  async read({ getSecret, credentials, fetchJson, signal, now, timeoutMs } = {}) {
    const startedAt = Date.now();
    const row = (seed) =>
      makeProvider({ id: ID, label: LABEL, fetchedAt: clock(now), latencyMs: Date.now() - startedAt, ...seed });

    /** @type {string|undefined} */
    let apiKey;
    try {
      apiKey = await resolveSecret({ getSecret, credentials }, CREDENTIAL_REF);
    } catch (error) {
      return row({ ...failureFromThrow(error), meta: { source: 'coding-usages-api', env: CREDENTIAL_REF } });
    }

    if (typeof apiKey !== 'string' || apiKey === '') {
      return row({
        status: 'not-configured',
        message: `Set ${CREDENTIAL_REF} to show the Kimi Code quota.`,
        meta: { source: 'coding-usages-api', env: CREDENTIAL_REF },
      });
    }

    const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
    /** @type {AdapterFailure[]} */
    const failures = [];

    for (const target of HOSTS) {
      if (signal?.aborted) {
        failures.push({ status: 'network-error', code: 'ABORTED', message: 'The read was cancelled.' });
        break;
      }
      /** @type {import('./common.js').FetchJsonResult} */
      let result;
      try {
        result = await fetchJson(`${target.base}${USAGES_PATH}`, requestOptions(signal, headers, timeoutMs));
      } catch (error) {
        failures.push(failureFromThrow(error));
        continue;
      }

      const transportFailure = classifyTransport(result);
      if (transportFailure) {
        failures.push(transportFailure);
        continue;
      }

      const parsed = parseUsages(result.json, result.text);
      if ('failure' in parsed) {
        failures.push(parsed.failure);
        continue;
      }

      return row({
        status: 'ok',
        plan: null,
        windows: parsed.windows,
        balances: [],
        account: null,
        meta: {
          host: target.host,
          source: 'coding-usages-api',
          note: 'Kimi Code reports quota windows only; no spendable balance is exposed.',
          ...boosterMeta(result.json),
        },
      });
    }

    const failure = mostSpecificFailure(failures);
    return row({
      status: failure.status,
      code: failure.code,
      message: failure.message,
      meta: {
        source: 'coding-usages-api',
        env: CREDENTIAL_REF,
        attemptedHosts: HOSTS.map((entry) => entry.host),
        attempts: failures.map((entry) => entry.code),
        ...(failure.rawSnippet ? { rawSnippet: failure.rawSnippet } : {}),
      },
    });
  },
};

/**
 * Describe the `booster_wallet` as metadata only. For this plan it is a
 * disabled wallet with no amount, a nil subscription id and a year-2126
 * sentinel period end — its `monthlyChargeLimit` is a spending cap, not money
 * held, so it must never reach `balances`.
 *
 * @param {any} json Parsed `/usages` body.
 * @returns {Record<string, unknown>} Extra meta keys (empty when absent).
 */
function boosterMeta(json) {
  const wallet = json?.booster_wallet;
  if (wallet === null || typeof wallet !== 'object') return {};
  const status = typeof wallet.status === 'string' && wallet.status !== '' ? wallet.status : 'unknown';
  return { booster: status === 'STATUS_DISABLED' ? 'disabled' : status };
}

export default kimiAdapter;
