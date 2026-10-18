/**
 * DeepSeek Platform adapter.
 *
 * This is **not** an `sk-` API-key provider. The dashboard reads the account
 * grant stored by DSH under the `deepseek-account-platform` credential record;
 * the host resolves it to the pseudo-reference `DEEPSEEK_PLATFORM_TOKEN`, which
 * is the only thing this adapter knows about it.
 *
 * Verified live 2026-10-14 against that grant:
 * - `GET https://platform.deepseek.com/api/v0/users/get_user_summary`
 *   header `x-dsh-auth-token: <token>`
 *   -> `{"code":0,"data":{"biz_code":0,"biz_data":{"normal_wallets":[...],
 *       "bonus_wallets":[...],"total_costs":[...]}}}`
 *
 * `account` is always null. The platform can supply a masked email/phone, but
 * an identity chip adds nothing to a usage dashboard and masked personal data
 * is still personal data, so this adapter never even calls
 * `/auth-api/v0/users/current`.
 *
 * An invalid grant answers **HTTP 200** with `{"code":40003,...}`, so
 * authorization is judged from the envelope as well as the HTTP status.
 *
 * DeepSeek Platform exposes no token-usage *window* API (six candidate paths
 * were probed on 2026-10-14 and all 404), so `windows` is always an empty array
 * and usage is never invented. It does expose month-to-date spend history:
 *
 * - `GET https://platform.deepseek.com/api/v0/usage/cost?month=<1-12>&year=<YYYY>`
 *   headers `x-dsh-auth-token`, `x-client-platform: web` — note the platform
 *   rejects `Authorization: Bearer <grant>` here with `code 40003`
 *   -> `data.biz_data[0]` = `{ currency, total[], days[] }`, where each day's
 *      `data[].usage[].amount` is a **money** string in that currency
 *      (verified: the summed days equal the summed `total[]` for the month).
 *   That series is attached as `meta.dailyUsage`; it is history, not a quota
 *   window, and a failure there never affects the row's status.
 *
 * Optional secondary source: when an `sk-` key is configured as
 * `DEEPSEEK_API_KEY`, `GET https://api.deepseek.com/user/balance` is merged in
 * (`meta.source: 'both'`). It is strictly best-effort — a failure there can
 * never turn a good row into a failure.
 *
 * The row also carries the peak/off-peak billing schedule in `meta.pricing`
 * (see `../pricing.js`). It is attached to **every** row, including failures:
 * the schedule describes DeepSeek's list price, not this account, so it is
 * useful even when the credential is missing or rejected. Computing it is local
 * and best-effort; a failure simply omits the field and the browser half hides
 * the reminder.
 *
 * @module dsh-plugin-usage-board/host/providers/deepseek
 */

import { createPricingSnapshot } from '../pricing.js';
import { loadHolidayCalendar } from '../holiday-calendar.js';
import { makeBalance, makeDailyUsage, makeProvider } from '../../shared/protocol.js';
import {
  classifyTransport,
  clock,
  failureFromThrow,
  invalidResponse,
  numberOrNull,
  requestOptions,
  resolveSecret,
} from './common.js';

/** Provider id, a `PROVIDER_IDS` member. */
const ID = 'deepseek';

/** Display name. */
const LABEL = 'DeepSeek';

/** Pseudo-reference the host maps to the stored account grant token. */
const PLATFORM_REF = 'DEEPSEEK_PLATFORM_TOKEN';

/** Optional `sk-` key enabling the second balance source. */
const API_KEY_REF = 'DEEPSEEK_API_KEY';

/** Endpoints on the platform host. */
const SUMMARY_URL = 'https://platform.deepseek.com/api/v0/users/get_user_summary';
const COST_URL = 'https://platform.deepseek.com/api/v0/usage/cost';

/** OpenAI-compatible balance endpoint, used only when an `sk-` key exists. */
const API_BALANCE_URL = 'https://api.deepseek.com/user/balance';

/** Body codes that mean the grant is invalid or expired. */
const AUTH_BODY_CODES = new Set([40003, 401, 403]);

/** Decimal places kept on a summed daily cost, to shed float noise. */
const COST_PRECISION = 6;

/**
 * Body cap for `/usage/cost`. The host's `fetchJson` defaults to 8 KiB, but a
 * full month of six models x five usage types is ~50 KiB, and a truncated body
 * is not parseable JSON. The host helper accepts this per-call override.
 */
const COST_MAX_BODY_BYTES = 256 * 1024;

/**
 * @typedef {import('./common.js').AdapterFailure} AdapterFailure
 * @typedef {import('../../shared/protocol.js').Balance} Balance
 */

/**
 * Validate the platform envelope and unwrap `data.biz_data`.
 *
 * @param {unknown} json
 * @param {string} rawBody
 * @returns {{ payload: any }|{ failure: AdapterFailure }}
 */
function parseEnvelope(json, rawBody) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return { failure: invalidResponse('The DeepSeek Platform returned an unexpected body.', rawBody) };
  }

  const body = /** @type {any} */ (json);
  const code = numberOrNull(body.code);

  if (code !== null && code !== 0) {
    if (AUTH_BODY_CODES.has(code)) {
      return {
        failure: {
          status: 'unauthorized',
          code: `code ${code}`,
          message: 'The DeepSeek Platform grant was rejected; re-authorise the account.',
        },
      };
    }
    return {
      failure: {
        status: 'upstream-error',
        code: `code ${code}`,
        message: 'The DeepSeek Platform reported an error.',
      },
    };
  }

  if (code === null) {
    return { failure: invalidResponse('The DeepSeek Platform returned no status code.', rawBody) };
  }

  const data = body.data;
  const bizCode = numberOrNull(data?.biz_code);
  if (bizCode === null) {
    return { failure: invalidResponse('The DeepSeek Platform returned no business status.', rawBody) };
  }
  if (bizCode !== 0) {
    if (AUTH_BODY_CODES.has(bizCode)) {
      return {
        failure: {
          status: 'unauthorized',
          code: `biz_code ${bizCode}`,
          message: 'The DeepSeek Platform grant was rejected; re-authorise the account.',
        },
      };
    }
    return {
      failure: {
        status: 'upstream-error',
        code: `biz_code ${bizCode}`,
        message: 'The DeepSeek Platform reported an error.',
      },
    };
  }

  const payload = data?.biz_data;
  if (payload === null || typeof payload !== 'object') {
    return { failure: invalidResponse('The DeepSeek Platform returned no payload.', rawBody) };
  }
  return { payload };
}

/**
 * Validate the wallet envelope specifically (the summary endpoint). The
 * identity endpoint shares the envelope but has no wallet list, so the shape
 * check must not live in {@link parseEnvelope}.
 *
 * @param {unknown} json
 * @param {string} rawBody
 * @returns {{ payload: any }|{ failure: AdapterFailure }}
 */
function parseSummary(json, rawBody) {
  const parsed = parseEnvelope(json, rawBody);
  if ('failure' in parsed) return parsed;
  if (!Array.isArray(parsed.payload.normal_wallets)) {
    return { failure: invalidResponse('The DeepSeek Platform returned no wallet list.', rawBody) };
  }
  return parsed;
}

/**
 * Index a wallet/cost array by its currency field.
 *
 * @param {unknown} entries
 * @returns {Map<string, any>}
 */
function byCurrency(entries) {
  const index = new Map();
  if (!Array.isArray(entries)) return index;
  for (const entry of entries) {
    const currency = entry?.currency;
    if (typeof currency === 'string' && currency !== '' && !index.has(currency)) index.set(currency, entry);
  }
  return index;
}

/**
 * Normalize `biz_data` wallets into protocol balances: one row per
 * `normal_wallets` entry, enriched from the matching `bonus_wallets` and
 * `total_costs` entries.
 *
 * @param {any} payload
 * @returns {Balance[]}
 */
function balancesFromPayload(payload) {
  const bonus = byCurrency(payload.bonus_wallets);
  const costs = byCurrency(payload.total_costs);
  return payload.normal_wallets
    .filter((wallet) => typeof wallet?.currency === 'string' && wallet.currency !== '')
    .map((wallet) =>
      makeBalance({
        currency: wallet.currency,
        available: numberOrNull(wallet.balance),
        bonus: numberOrNull(bonus.get(wallet.currency)?.balance),
        totalSpent: numberOrNull(costs.get(wallet.currency)?.amount),
      }),
    );
}

/**
 * Merge the `api.deepseek.com/user/balance` rows into the platform rows.
 * Platform values win where both sources report a field; the `sk-` source only
 * fills gaps and adds currencies the platform store does not list.
 *
 * @param {Balance[]} balances
 * @param {any} json
 * @returns {Balance[]}
 */
function mergeApiKeyBalances(balances, json) {
  const infos = Array.isArray(json?.balance_infos) ? json.balance_infos : [];
  const merged = balances.map((entry) => ({ ...entry }));
  for (const info of infos) {
    const currency = typeof info?.currency === 'string' ? info.currency : null;
    if (currency === null) continue;
    const existing = merged.find((entry) => entry.currency === currency);
    const available = numberOrNull(info?.total_balance);
    const bonus = numberOrNull(info?.granted_balance);
    if (existing) {
      if (existing.available === null) existing.available = available;
      if (existing.bonus === null) existing.bonus = bonus;
    } else {
      merged.push(makeBalance({ currency, available, bonus, totalSpent: null }));
    }
  }
  return merged;
}

/**
 * DeepSeek Platform adapter.
 *
 * @type {import('./common.js').ProviderAdapter}
 */
export const deepseekAdapter = {
  id: ID,
  label: LABEL,
  credentialRefs: [PLATFORM_REF, API_KEY_REF],

  /**
   * Read the live wallet balance (and, when available, the masked identity).
   *
   * @param {import('./common.js').AdapterReadContext} context
   * @returns {Promise<import('../../shared/protocol.js').ProviderSnapshot>}
   */
  async read({ getSecret, credentials, fetchJson, signal, now, timeoutMs } = {}) {
    const startedAt = Date.now();
    const nowMs = clock(now);

    // Billing schedule: computed once per read, from the host clock and the
    // optional third-party holiday calendar. It is deliberately allowed to
    // fail to null — the reminder is decoration on top of the balance, never a
    // reason for the row to fail.
    /** @type {import('../../shared/protocol.js').PricingSchedule|null} */
    let pricing = null;
    try {
      pricing = createPricingSnapshot(nowMs, await loadHolidayCalendar());
    } catch {
      pricing = null;
    }

    const row = (seed) =>
      makeProvider({
        id: ID,
        label: LABEL,
        fetchedAt: nowMs,
        latencyMs: Date.now() - startedAt,
        ...seed,
        // Spread first so the pricing key survives every failure branch, then
        // merge the branch's own diagnostics over it.
        meta: { ...(pricing === null ? {} : { pricing }), ...(seed.meta ?? {}) },
      });

    const auth = { getSecret, credentials };
    /** @type {string|undefined} */
    let token;
    /** @type {string|undefined} */
    let apiKey;
    try {
      token = await resolveSecret(auth, PLATFORM_REF);
      apiKey = await resolveSecret(auth, API_KEY_REF);
    } catch (error) {
      return row({ ...failureFromThrow(error), meta: { env: PLATFORM_REF } });
    }

    if (typeof token !== 'string' || token === '') {
      return row({
        status: 'not-configured',
        message: `Sign in to DeepSeek Platform to store the ${PLATFORM_REF} grant.`,
        meta: { env: PLATFORM_REF },
      });
    }

    if (signal?.aborted) {
      return row({
        status: 'network-error',
        code: 'ABORTED',
        message: 'The read was cancelled.',
        meta: { env: PLATFORM_REF },
      });
    }

    /** @type {import('./common.js').FetchJsonResult} */
    let result;
    try {
      result = await fetchJson(
        SUMMARY_URL,
        requestOptions(signal, { 'x-dsh-auth-token': token, Accept: 'application/json' }, timeoutMs),
      );
    } catch (error) {
      return row({ ...failureFromThrow(error), meta: { env: PLATFORM_REF } });
    }

    const transportFailure = classifyTransport(result);
    if (transportFailure) {
      return row({
        status: transportFailure.status,
        code: transportFailure.code,
        message: transportFailure.message,
        meta: { env: PLATFORM_REF, ...(transportFailure.rawSnippet ? { rawSnippet: transportFailure.rawSnippet } : {}) },
      });
    }

    const parsed = parseSummary(result.json, result.text);
    if ('failure' in parsed) {
      return row({
        status: parsed.failure.status,
        code: parsed.failure.code,
        message: parsed.failure.message,
        meta: { env: PLATFORM_REF, ...(parsed.failure.rawSnippet ? { rawSnippet: parsed.failure.rawSnippet } : {}) },
      });
    }

    let balances = balancesFromPayload(parsed.payload);
    /** @type {Record<string, unknown>} */
    const meta = {
      host: 'platform.deepseek.com',
      source: 'platform-account-api',
      note: 'DeepSeek Platform exposes no quota windows; meta.dailyUsage carries month-to-date spend history.',
    };
    // No identity: the platform's masked email/phone is personal data that adds
    // nothing to a usage dashboard, so the endpoint behind it is never called.
    const account = null;

    // Month-to-date history. Best-effort: the balance above is the primary
    // payload and must survive a failure here.
    const daily = await readDailyUsage({ fetchJson, signal, timeoutMs, token, nowMs: clock(now) });
    if (daily.ok) meta.dailyUsage = daily.series;
    else meta.dailyUsageError = daily.code;

    // Secondary, strictly best-effort source.
    if (typeof apiKey === 'string' && apiKey !== '') {
      const secondary = await readApiKeyBalances({ fetchJson, signal, timeoutMs, apiKey });
      if (secondary.ok) {
        balances = mergeApiKeyBalances(balances, secondary.json);
        meta.source = 'both';
      } else {
        meta.secondarySource = secondary.code;
      }
    }

    return row({
      status: 'ok',
      balances,
      windows: [],
      account,
      meta,
    });
  },
};

/**
 * Sum one day's amounts across every model and usage type. `/usage/cost`
 * reports money (split by the token type that money bought), so a day's cost is
 * the sum of every `amount`; there are no token counts on this endpoint, which
 * is why `tokens` stays null in the series.
 *
 * @param {any} day
 * @returns {number} Cost in the payload's currency.
 */
function dayCost(day) {
  let total = 0;
  const models = Array.isArray(day?.data) ? day.data : [];
  for (const model of models) {
    const usage = Array.isArray(model?.usage) ? model.usage : [];
    for (const entry of usage) total += numberOrNull(entry?.amount) ?? 0;
  }
  return Math.round(total * 10 ** COST_PRECISION) / 10 ** COST_PRECISION;
}

/**
 * Build the trailing daily-spend series from `data.biz_data[0]`, dropping the
 * all-zero future days the platform pads the month with.
 *
 * @param {any} payload `data.biz_data` — an array on this endpoint.
 * @returns {import('../../shared/protocol.js').DailyUsageSeries|null}
 */
function dailyUsageFromPayload(payload) {
  const month = Array.isArray(payload) ? payload.find((entry) => Array.isArray(entry?.days)) : null;
  if (!month) return null;

  /** @type {Array<{ date: string, cost: number }>} */
  const points = month.days
    .filter((day) => typeof day?.date === 'string' && day.date !== '')
    .map((day) => ({ date: day.date, cost: dayCost(day) }));

  // The month is padded with zero-cost days that have not happened yet.
  let end = points.length;
  while (end > 0 && points[end - 1].cost === 0) end -= 1;

  return makeDailyUsage({
    currency: typeof month.currency === 'string' && month.currency !== '' ? month.currency : 'CNY',
    days: end,
    points: points.slice(0, end).map((point) => ({ date: point.date, cost: point.cost, tokens: null })),
  });
}

/**
 * Best-effort read of the month-to-date daily spend history.
 *
 * @param {{ fetchJson: Function, signal?: AbortSignal, timeoutMs?: number, token: string, nowMs: number }} context
 * @returns {Promise<{ ok: true, series: import('../../shared/protocol.js').DailyUsageSeries }|{ ok: false, code: string }>}
 */
async function readDailyUsage({ fetchJson, signal, timeoutMs, token, nowMs }) {
  try {
    const today = new Date(nowMs);
    const url = `${COST_URL}?month=${today.getMonth() + 1}&year=${today.getFullYear()}`;
    const result = await fetchJson(url, {
      // No Authorization header: the platform rejects the grant sent as a
      // bearer token on this route with code 40003.
      ...requestOptions(
        signal,
        { 'x-dsh-auth-token': token, 'x-client-platform': 'web', Accept: 'application/json' },
        timeoutMs,
      ),
      maxBodyBytes: COST_MAX_BODY_BYTES,
    });
    const transportFailure = classifyTransport(result);
    if (transportFailure) return { ok: false, code: transportFailure.code ?? 'E_TRANSPORT' };
    const parsed = parseEnvelope(result.json, result.text);
    if ('failure' in parsed) return { ok: false, code: parsed.failure.code ?? 'E_ENVELOPE' };
    const series = dailyUsageFromPayload(parsed.payload);
    if (!series) return { ok: false, code: 'E_BAD_SHAPE' };
    return { ok: true, series };
  } catch {
    return { ok: false, code: 'E_INTERNAL' };
  }
}

/**
 * Best-effort read of the optional `sk-` balance source.
 *
 * @param {{ fetchJson: Function, signal?: AbortSignal, timeoutMs?: number, apiKey: string }} context
 * @returns {Promise<{ ok: true, json: any }|{ ok: false, code: string }>}
 */
async function readApiKeyBalances({ fetchJson, signal, timeoutMs, apiKey }) {
  try {
    const result = await fetchJson(
      API_BALANCE_URL,
      requestOptions(signal, { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, timeoutMs),
    );
    const transportFailure = classifyTransport(result);
    if (transportFailure) return { ok: false, code: transportFailure.code ?? transportFailure.status };
    if (!Array.isArray(/** @type {any} */ (result.json)?.balance_infos)) {
      return { ok: false, code: 'E_BAD_SHAPE' };
    }
    return { ok: true, json: result.json };
  } catch {
    return { ok: false, code: 'E_INTERNAL' };
  }
}

export default deepseekAdapter;
