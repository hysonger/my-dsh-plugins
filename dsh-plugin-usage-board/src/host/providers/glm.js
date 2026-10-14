/**
 * GLM Coding Plan adapter.
 *
 * Upstream: the Zhipu quota API behind a coding-plan JWT. Two regional hosts
 * serve the same payload; the China host is tried first and the international
 * host second, because a coding-plan key is only valid on the region it was
 * bought in and we cannot tell which one that is from the key alone.
 *
 * Verified live 2026-10-14 against `ZAI_CODING_CN_API_KEY` (both hosts 200):
 * ```json
 * {"code":200,"msg":"操作成功","success":true,
 *  "data":{"level":"lite","limits":[
 *    {"type":"CREDIT_LIMIT","unit":3,"number":5,"usage":2000,"currentValue":656,
 *     "remaining":1343,"percentage":32,"nextResetTime":1791973452542},
 *    {"type":"CREDIT_LIMIT","unit":6,"number":1,"usage":10000,"currentValue":5831,
 *     "remaining":4168,"percentage":58,"nextResetTime":1792123975997}]}}
 * ```
 *
 * An expired or foreign-region key does **not** return 401: the API answers
 * `200 {"code":1000,"msg":"身份验证失败。","success":false}`, so authorization is
 * judged from the body as well as the HTTP status.
 *
 * `unit` 3 is the 5-hour rolling window, `unit` 6 the weekly window; any other
 * unit is still emitted (as `glm.unit.<n>`) rather than dropped, because a new
 * Zhipu window type appearing must not silently hide quota.
 *
 * @module dsh-plugin-usage-board/host/providers/glm
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
const ID = 'glm';

/** Display name. */
const LABEL = 'GLM Coding Plan';

/** Credential reference resolved through the host's secret store. */
const CREDENTIAL_REF = 'ZAI_CODING_CN_API_KEY';

/** Regional hosts, in the order they are attempted. */
const HOSTS = [
  { host: 'open.bigmodel.cn', url: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit' },
  { host: 'api.z.ai', url: 'https://api.z.ai/api/monitor/usage/quota/limit' },
];

/**
 * Subscription endpoint giving the real plan display name ("GLM Coding Lite"
 * rather than the bare level "lite"). It lives on `api.z.ai` but accepts a
 * China-region key as well, so it is tried after either quota host answers.
 */
const SUBSCRIPTION_URL = 'https://api.z.ai/api/biz/subscription/list';

/** Zhipu `unit` code -> normalized window id. */
const UNIT_WINDOW_IDS = new Map([
  [3, 'glm.5h'],
  [6, 'glm.weekly'],
]);

/**
 * Display rank. Windows are classified by `unit`, never by `nextResetTime`
 * (late in a cycle the weekly window resets *before* the 5-hour one, so a time
 * sort silently swaps them); the rank then guarantees a stable 5h-then-weekly
 * order regardless of the order the API lists them in.
 */
const WINDOW_RANK = new Map([
  ['glm.5h', 0],
  ['glm.weekly', 1],
]);

/** Body codes that mean "the credential is not valid here". */
const AUTH_BODY_CODES = new Set([1000, 1001, 401, 403]);

/**
 * Body codes that mean "the credential is valid but has no Coding Plan". This
 * is deliberately NOT folded into `unauthorized`: the user's key is fine, the
 * subscription is missing, and the fix is different.
 */
const NO_PLAN_BODY_CODES = new Set([500]);

/**
 * @typedef {import('./common.js').AdapterFailure} AdapterFailure
 * @typedef {import('../../shared/protocol.js').UsageWindow} UsageWindow
 */

/**
 * Validate the Zhipu envelope and pull out the quota payload.
 *
 * @param {unknown} json Parsed response body.
 * @param {string} rawBody Raw body, for `meta.rawSnippet`.
 * @returns {{ windows: UsageWindow[], plan: string|null }|{ failure: AdapterFailure }}
 */
function parseQuota(json, rawBody) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return { failure: invalidResponse('The GLM quota API returned an unexpected body.', rawBody) };
  }

  const code = numberOrNull(/** @type {any} */ (json).code);
  const success = /** @type {any} */ (json).success;

  // Business-level failure, delivered with HTTP 200.
  if (success === false || (code !== null && code !== 200)) {
    const message = typeof /** @type {any} */ (json).msg === 'string' ? /** @type {any} */ (json).msg : '';
    if (code !== null && AUTH_BODY_CODES.has(code)) {
      return {
        failure: {
          status: 'unauthorized',
          code: `code ${code}`,
          message: 'The GLM Coding Plan credential was rejected; check ZAI_CODING_CN_API_KEY.',
        },
      };
    }
    // A valid key that simply has no coding plan is a different problem: the
    // credential is fine, so it must not read as an expired key.
    if (code !== null && NO_PLAN_BODY_CODES.has(code) && /coding\s*plan/i.test(message)) {
      return {
        failure: {
          status: 'upstream-error',
          code: `code ${code}`,
          message: 'This Zhipu key has no GLM Coding Plan subscription.',
        },
      };
    }
    return {
      failure: {
        status: 'upstream-error',
        code: code === null ? 'E_BAD_SHAPE' : `code ${code}`,
        message: 'The GLM quota API reported an error.',
      },
    };
  }

  const data = /** @type {any} */ (json).data;
  const limits = data?.limits;
  if (!Array.isArray(limits) || limits.length === 0) {
    return { failure: invalidResponse('The GLM quota API returned no quota windows.', rawBody) };
  }

  return {
    windows: limits
      .map(windowFromLimit)
      .sort((a, b) => (WINDOW_RANK.get(a.id) ?? 2) - (WINDOW_RANK.get(b.id) ?? 2)),
    plan: typeof data?.level === 'string' && data.level !== '' ? data.level : null,
  };
}

/**
 * Normalize one `data.limits[]` entry.
 *
 * @param {any} limit
 * @returns {UsageWindow}
 */
function windowFromLimit(limit) {
  const unit = numberOrNull(limit?.unit);
  const id = (unit !== null ? UNIT_WINDOW_IDS.get(unit) : undefined) ?? `glm.unit.${unit ?? 'unknown'}`;
  const triple = completeTriple({
    limit: numberOrNull(limit?.usage),
    used: numberOrNull(limit?.currentValue),
    remaining: numberOrNull(limit?.remaining),
  });
  return makeWindow({
    id,
    labelKey: id,
    unit,
    number: numberOrNull(limit?.number),
    limit: triple.limit,
    used: triple.used,
    remaining: triple.remaining,
    percent: percentOf(triple.used, triple.limit, numberOrNull(limit?.percentage)),
    resetAt: epochMs(limit?.nextResetTime),
  });
}

/**
 * Best-effort read of the subscription display name, so the card shows
 * "GLM Coding Lite" rather than the bare level "lite". A failure here never
 * changes the row's status — the quota payload is the primary result.
 *
 * @param {{ fetchJson: Function, signal?: AbortSignal, timeoutMs?: number, apiKey: string }} context
 * @returns {Promise<{ ok: true, plan: string, status: string|null }|{ ok: false, code: string }>}
 */
async function readPlanName({ fetchJson, signal, timeoutMs, apiKey }) {
  try {
    const result = await fetchJson(
      SUBSCRIPTION_URL,
      requestOptions(signal, { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, timeoutMs),
    );
    const transportFailure = classifyTransport(result);
    if (transportFailure) return { ok: false, code: transportFailure.code ?? 'E_TRANSPORT' };
    const entries = /** @type {any} */ (result.json)?.data;
    const subscription = Array.isArray(entries)
      ? entries.find((entry) => typeof entry?.productName === 'string' && entry.productName !== '')
      : null;
    if (!subscription) return { ok: false, code: 'E_BAD_SHAPE' };
    return {
      ok: true,
      plan: subscription.productName,
      status: typeof subscription.status === 'string' && subscription.status !== '' ? subscription.status : null,
    };
  } catch {
    return { ok: false, code: 'E_INTERNAL' };
  }
}

/**
 * GLM Coding Plan adapter.
 *
 * @type {import('./common.js').ProviderAdapter}
 */
export const glmAdapter = {
  id: ID,
  label: LABEL,
  credentialRefs: [CREDENTIAL_REF],

  /**
   * Read the live quota from whichever Zhipu host answers.
   *
   * @param {import('./common.js').AdapterReadContext} context
   * @returns {Promise<import('../../shared/protocol.js').ProviderSnapshot>}
   */
  async read({ getSecret, credentials, fetchJson, signal, now, timeoutMs } = {}) {
    const startedAt = Date.now();
    const fetchedAt = () => clock(now);
    const row = (seed) =>
      makeProvider({ id: ID, label: LABEL, fetchedAt: fetchedAt(), latencyMs: Date.now() - startedAt, ...seed });

    /** @type {string|undefined} */
    let apiKey;
    try {
      apiKey = await resolveSecret({ getSecret, credentials }, CREDENTIAL_REF);
    } catch (error) {
      return row({ ...failureFromThrow(error), meta: { source: 'quota-api', env: CREDENTIAL_REF } });
    }

    if (typeof apiKey !== 'string' || apiKey === '') {
      return row({
        status: 'not-configured',
        message: `Set ${CREDENTIAL_REF} to show the GLM Coding Plan quota.`,
        meta: { source: 'quota-api', env: CREDENTIAL_REF },
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
        result = await fetchJson(target.url, requestOptions(signal, headers, timeoutMs));
      } catch (error) {
        failures.push(failureFromThrow(error));
        continue;
      }

      const transportFailure = classifyTransport(result);
      if (transportFailure) {
        failures.push(transportFailure);
        continue;
      }

      const parsed = parseQuota(result.json, result.text);
      if ('failure' in parsed) {
        failures.push(parsed.failure);
        continue;
      }

      const named = await readPlanName({ fetchJson, signal, timeoutMs, apiKey });
      /** @type {Record<string, unknown>} */
      const meta = { host: target.host, source: 'quota-api' };
      if (parsed.plan !== null) meta.level = parsed.plan;
      if (named.ok) {
        if (named.status !== null) meta.subscriptionStatus = named.status;
      } else {
        meta.subscriptionError = named.code;
      }

      return row({
        status: 'ok',
        plan: named.ok ? named.plan : parsed.plan,
        windows: parsed.windows,
        meta,
      });
    }

    const failure = mostSpecificFailure(failures);
    return row({
      status: failure.status,
      code: failure.code,
      message: failure.message,
      meta: {
        source: 'quota-api',
        env: CREDENTIAL_REF,
        attemptedHosts: HOSTS.map((entry) => entry.host),
        attempts: failures.map((entry) => entry.code),
        ...(failure.rawSnippet ? { rawSnippet: failure.rawSnippet } : {}),
      },
    });
  },
};

export default glmAdapter;
