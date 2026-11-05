/**
 * OpenCode Go adapter.
 *
 * Upstream: the OpenCode Go subscription usage route behind a Go API key.
 * The route is **not described by OpenCode's public documentation** (the docs
 * only point at the console); it was verified live 2026-11-05 with the key DSH
 * already stores for its `opencode-go` model provider:
 *
 * ```
 * GET https://opencode.ai/zen/go/v1/usage
 * Authorization: Bearer <OPENCODE_GO_API_KEY>
 * Accept: application/json
 * ```
 *
 * ```json
 * {"usage":{
 *   "rolling":{"status":"ok","percent":0,"resetsAt":"2026-11-05T13:01:55.000Z"},
 *   "weekly": {"status":"ok","percent":0,"resetsAt":"2026-11-09T00:00:00.000Z"},
 *   "monthly":{"status":"ok","percent":0,"resetsAt":"2026-12-05T07:56:09.000Z"}}}
 * ```
 *
 * `percent` is the used share in **percentage units** (0–100; fractions such as
 * `0.5` mean half a percent), `resetsAt` an ISO-8601 instant, and `status`
 * usually `ok` or `rate-limited`. A window missing from `usage` means the plan
 * does not report that window and must NOT be shown as 0%. An unknown window
 * key is still emitted rather than dropped, so a new allowance type cannot
 * silently disappear.
 *
 * **The route reports percentages only.** OpenCode's pricing page defines the
 * windows as dollar amounts ($12 / $30 / $60 for Go) and the console shows the
 * per-model monthly limits, but this reply carries neither dollars nor model
 * attribution. The row therefore leaves `limit`/`used`/`remaining` null and
 * ships the declared `percent`; the renderers print the percentage and never
 * invent a dollar allowance.
 *
 * Failures observed / documented by community tools:
 * - HTTP 401 `{"type":"error","error":{"type":"AuthError",...}}` — the key is
 *   missing or unknown.
 * - HTTP 403 `EntitlementError` — a valid key with no Go subscription behind
 *   it. That is a missing plan, not an expired credential, so it maps to
 *   `upstream-error` and lets `classifyMessage` pick the "no coding plan" copy.
 * - HTTP 429 — the account is rate limited at the transport level.
 *
 * @module dsh-plugin-usage-board/host/providers/opencode-go
 */

import { makeProvider, makeWindow } from '../../shared/protocol.js';
import {
  classifyTransport,
  clock,
  epochMs,
  failureFromThrow,
  invalidResponse,
  numberOrNull,
  requestOptions,
  resolveSecret,
} from './common.js';

/** Provider id, a `PROVIDER_IDS` member. */
const ID = 'opencode-go';

/** Display name. */
const LABEL = 'OpenCode Go';

/** Credential reference resolved through the host's secret store. */
const CREDENTIAL_REF = 'OPENCODE_GO_API_KEY';

/** Host the usage route lives on, for `meta.host` and diagnostics. */
const HOST = 'opencode.ai';

/** The one route this adapter reads. */
const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

/** Prefix every window id this provider emits. */
const WINDOW_PREFIX = 'opencode-go';

/**
 * Known usage entries, in display order. `rolling` is the 5-hour rolling
 * window, `weekly` the weekly window and `monthly` the subscription month.
 * The textual `unit` doubles as the fallback label for an older client.
 */
const WINDOW_SPECS = [
  { key: 'rolling', id: `${WINDOW_PREFIX}.5h`, labelKey: `${WINDOW_PREFIX}.5h`, unit: '5h' },
  { key: 'weekly', id: `${WINDOW_PREFIX}.weekly`, labelKey: `${WINDOW_PREFIX}.weekly`, unit: 'weekly' },
  { key: 'monthly', id: `${WINDOW_PREFIX}.monthly`, labelKey: `${WINDOW_PREFIX}.monthly`, unit: 'monthly' },
];

/** `meta.source` value for every row this adapter emits. */
const SOURCE = 'zen-go-usage-api';

/**
 * @typedef {import('./common.js').AdapterFailure} AdapterFailure
 * @typedef {import('../../shared/protocol.js').UsageWindow} UsageWindow
 */

/**
 * Whether a parsed JSON value is a plain object (not null, not an array).
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Map an upstream `error.type` onto a snapshot failure. Some proxies answer a
 * 2xx with an error envelope; the 401/403 status branches are handled by the
 * caller, so this is the body-level fallback.
 *
 * @param {unknown} json Parsed body.
 * @returns {AdapterFailure|null} null when the body carries no error type.
 */
function failureFromErrorBody(json) {
  if (!isRecord(json) || !isRecord(json.error)) return null;
  const type = typeof json.error.type === 'string' && json.error.type !== '' ? json.error.type : null;
  if (type === null) return null;
  if (/entitlement|subscription/i.test(type)) {
    return {
      status: 'upstream-error',
      code: type,
      message: 'This OpenCode key has no Go coding plan subscription, or the key lacks usage access.',
    };
  }
  if (/auth|unauthor|invalid_api_key|expired/i.test(type)) {
    return {
      status: 'unauthorized',
      code: type,
      message: 'The OpenCode Go credential was rejected; check OPENCODE_GO_API_KEY.',
    };
  }
  return { status: 'upstream-error', code: type, message: 'The OpenCode usage API reported an error.' };
}

/**
 * Normalize one `usage.<key>` entry. The route has no absolute counters, so
 * limit/used/remaining stay null and the declared percentage is the payload.
 *
 * @param {{ id: string, labelKey: string, unit: string }} spec
 * @param {any} entry
 * @returns {UsageWindow}
 */
function windowFromEntry(spec, entry) {
  return makeWindow({
    id: spec.id,
    labelKey: spec.labelKey,
    unit: spec.unit,
    percent: numberOrNull(entry.percent),
    resetAt: epochMs(entry.resetsAt),
  });
}

/**
 * Record a window's upstream status under its normalized id. Kept in `meta`
 * rather than the protocol window shape: `rate-limited` is useful diagnostics,
 * and a window at 100% already communicates the same thing on the card.
 *
 * @param {Record<string, string>} statuses
 * @param {string} id
 * @param {unknown} status
 */
function recordStatus(statuses, id, status) {
  if (typeof status === 'string' && status !== '') statuses[id] = status;
}

/**
 * Parse the OpenCode Go usage reply.
 *
 * @param {unknown} json Parsed body.
 * @param {string} rawBody
 * @returns {{ windows: UsageWindow[], windowStatus: Record<string, string> }|{ failure: AdapterFailure }}
 */
function parseUsage(json, rawBody) {
  if (!isRecord(json)) {
    return { failure: invalidResponse('The OpenCode usage API returned an unexpected body.', rawBody) };
  }

  const bodyFailure = failureFromErrorBody(json);
  if (bodyFailure !== null) return { failure: bodyFailure };

  const usage = json.usage;
  if (!isRecord(usage)) {
    return { failure: invalidResponse('The OpenCode usage API returned no usage windows.', rawBody) };
  }

  /** @type {UsageWindow[]} */
  const windows = [];
  /** @type {Record<string, string>} */
  const windowStatus = {};
  const handled = new Set();

  // Known keys first: their order is the display order regardless of the order
  // the upstream object happens to serialize them in.
  for (const spec of WINDOW_SPECS) {
    if (!Object.prototype.hasOwnProperty.call(usage, spec.key)) continue;
    const entry = usage[spec.key];
    handled.add(spec.key);
    if (!isRecord(entry)) continue;
    windows.push(windowFromEntry(spec, entry));
    recordStatus(windowStatus, spec.id, entry.status);
  }

  // Any new allowance type the provider adds is surfaced, not dropped.
  for (const [key, entry] of Object.entries(usage)) {
    if (handled.has(key) || !isRecord(entry)) continue;
    const spec = {
      id: `${WINDOW_PREFIX}.${key}`,
      labelKey: `${WINDOW_PREFIX}.${key}`,
      unit: key,
    };
    windows.push(windowFromEntry(spec, entry));
    recordStatus(windowStatus, spec.id, entry.status);
  }

  if (windows.length === 0) {
    return { failure: invalidResponse('The OpenCode usage API returned no usage windows.', rawBody) };
  }
  return { windows, windowStatus };
}

/**
 * OpenCode Go adapter.
 *
 * @type {import('./common.js').ProviderAdapter}
 */
export const opencodeGoAdapter = {
  id: ID,
  label: LABEL,
  credentialRefs: [CREDENTIAL_REF],

  /**
   * Read the live OpenCode Go allowance windows.
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
      return row({ ...failureFromThrow(error), meta: { source: SOURCE, env: CREDENTIAL_REF } });
    }

    if (typeof apiKey !== 'string' || apiKey === '') {
      return row({
        status: 'not-configured',
        message: `Set ${CREDENTIAL_REF} to show the OpenCode Go usage.`,
        meta: { source: SOURCE, env: CREDENTIAL_REF },
      });
    }

    const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
    // A read cancelled before it starts never reaches the network.
    if (signal?.aborted) {
      return row({
        status: 'network-error',
        code: 'ABORTED',
        message: 'The read was cancelled.',
        meta: { host: HOST, source: SOURCE, env: CREDENTIAL_REF },
      });
    }
    /** @type {import('./common.js').FetchJsonResult} */
    let result;
    try {
      result = await fetchJson(USAGE_URL, requestOptions(signal, headers, timeoutMs));
    } catch (error) {
      return row({ ...failureFromThrow(error), meta: { host: HOST, source: SOURCE, env: CREDENTIAL_REF } });
    }

    // 403 is a *subscription* problem, not a rejected credential: the key is
    // valid but has no Go plan behind it (or no usage permission). Mapping it
    // through classifyTransport would wrongly print "credential rejected".
    if (result.status === 403) {
      return row({
        status: 'upstream-error',
        code: 'HTTP 403',
        message: 'This OpenCode key has no Go coding plan subscription, or the key lacks usage access.',
        meta: { host: HOST, source: SOURCE, env: CREDENTIAL_REF },
      });
    }

    const transportFailure = classifyTransport(result);
    if (transportFailure) {
      return row({ ...transportFailure, meta: { host: HOST, source: SOURCE, env: CREDENTIAL_REF } });
    }

    const parsed = parseUsage(result.json, result.text);
    if ('failure' in parsed) {
      return row({
        ...parsed.failure,
        meta: {
          host: HOST,
          source: SOURCE,
          env: CREDENTIAL_REF,
          ...(parsed.failure.rawSnippet ? { rawSnippet: parsed.failure.rawSnippet } : {}),
        },
      });
    }

    return row({
      status: 'ok',
      plan: null,
      windows: parsed.windows,
      balances: [],
      account: null,
      meta: { host: HOST, source: SOURCE, windowStatus: parsed.windowStatus },
    });
  },
};

export default opencodeGoAdapter;
