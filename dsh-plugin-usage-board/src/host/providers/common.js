/**
 * Shared plumbing for the usage board's provider adapters.
 *
 * Every adapter is *total*: it resolves a `ProviderSnapshot` and never rejects.
 * The three things every adapter must agree on live here so they cannot
 * drift: credential resolution, transport/status classification, and the small
 * numeric coercions the upstream bodies need.
 *
 * Nothing in this module ever logs, and nothing it returns can contain a
 * credential — callers pass secrets straight into a request header and drop
 * them immediately afterwards.
 *
 * @module dsh-plugin-usage-board/host/providers/common
 */

/**
 * @typedef {import('../../shared/protocol.js').ProviderStatus} ProviderStatus
 * @typedef {import('../../shared/protocol.js').ProviderSnapshot} ProviderSnapshot
 */

/**
 * The adapter contract the host's `SnapshotService` calls. `protocol.js` is
 * frozen and does not carry this typedef, so it lives here.
 *
 * @typedef {object} ProviderAdapter
 * @property {string} id
 * @property {string} label
 * @property {string[]} credentialRefs Credential reference names this adapter needs.
 * @property {(context: AdapterReadContext) => Promise<ProviderSnapshot>} read Total: never rejects.
 */

/**
 * @typedef {object} AdapterReadContext
 * @property {(name: string) => Promise<string|undefined>} [getSecret]
 * @property {{ resolve?: (name: string) => Promise<string|undefined> }} [credentials] Host fallback accessor.
 * @property {(url: string, options?: object) => Promise<FetchJsonResult>} fetchJson
 * @property {AbortSignal} [signal]
 * @property {(() => number)|number} [now]
 * @property {number} [timeoutMs]
 */

/**
 * @typedef {object} AdapterFailure
 * @property {ProviderStatus} status
 * @property {string|null} code
 * @property {string} message One short English sentence.
 * @property {string} [rawSnippet] First 200 chars of the body, for 'invalid-response'.
 */

/**
 * Host fetchJson result, mirrored here so the adapters stay testable without
 * importing the host module.
 *
 * @typedef {object} FetchJsonResult
 * @property {boolean} ok
 * @property {number|null} status
 * @property {Record<string,string>} headers
 * @property {unknown} json
 * @property {string} text
 * @property {{name: string, message: string}|null} error
 * @property {boolean} [aborted]
 * @property {number} [latencyMs]
 */

/** Per-request deadline handed to the host's `fetchJson`. */
export const REQUEST_TIMEOUT_MS = 12_000;

/** How much of an unparseable body travels in `meta.rawSnippet`. */
export const RAW_SNIPPET_LENGTH = 200;

/**
 * Failure precedence when several upstream attempts fail: the lower the rank,
 * the more specific the diagnosis, and the more useful it is to the user.
 * A 401 from the China host beats a DNS failure from the international one.
 */
const FAILURE_RANK = {
  unauthorized: 0,
  'rate-limited': 1,
  'invalid-response': 2,
  'upstream-error': 3,
  'network-error': 4,
};

/**
 * Coerce an upstream value to a finite number, or null.
 * Upstream money and quota fields arrive as strings ("33.6528879400000000").
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function numberOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Epoch milliseconds from either an epoch number (seconds or milliseconds, as
 * GLM's `nextResetTime` is ms while some providers use seconds) or an ISO-8601
 * timestamp string (as Kimi's `resetTime`/`reset_time` are).
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function epochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (/^\d+$/.test(trimmed)) return epochMs(Number(trimmed));
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Fill in whichever of limit/used/remaining the provider omitted, so a window
 * that reports two of the three still renders a full bar.
 *
 * @param {{ limit: number|null, used: number|null, remaining: number|null }} triple
 * @returns {{ limit: number|null, used: number|null, remaining: number|null }}
 */
export function completeTriple(triple) {
  let { limit, used, remaining } = triple;
  if (limit === null && used !== null && remaining !== null) limit = used + remaining;
  else if (used === null && limit !== null && remaining !== null) used = Math.max(0, limit - remaining);
  else if (remaining === null && limit !== null && used !== null) remaining = Math.max(0, limit - used);
  return { limit, used, remaining };
}

/**
 * The first `limit` characters of a raw body, verbatim. Used for
 * `meta.rawSnippet` so a shape failure is diagnosable without logging secrets
 * (bodies never contain credentials; they are sent, not received).
 *
 * @param {unknown} text
 * @param {number} [limit]
 * @returns {string}
 */
export function snippetOf(text, limit = RAW_SNIPPET_LENGTH) {
  if (typeof text !== 'string') return '';
  return text.slice(0, limit);
}

/**
 * Build an `invalid-response` failure from a body that parsed but did not have
 * the shape the adapter needs.
 *
 * @param {string} message
 * @param {string|null} [body]
 * @param {string} [code]
 * @returns {AdapterFailure}
 */
export function invalidResponse(message, body = null, code = 'E_BAD_SHAPE') {
  /** @type {AdapterFailure} */
  const failure = { status: 'invalid-response', code, message };
  if (typeof body === 'string' && body.length > 0) failure.rawSnippet = snippetOf(body);
  return failure;
}

/**
 * Map an unexpected thrown value onto a snapshot failure. Adapters catch
 * everything, so this is the last line of defence and must not leak the value
 * (a thrown error could, in principle, embed a request).
 *
 * @param {unknown} error
 * @returns {AdapterFailure}
 */
export function failureFromThrow(error) {
  const name = error instanceof Error && error.name ? error.name : 'Error';
  return {
    status: 'upstream-error',
    code: name === 'Error' ? 'E_INTERNAL' : name,
    message: 'The adapter could not complete the upstream read.',
  };
}

/**
 * Classify a host `fetchJson` result at the transport level.
 *
 * @param {FetchJsonResult} result
 * @returns {AdapterFailure|null} null when the response is a 2xx JSON body that
 *   the adapter should shape-check itself.
 */
export function classifyTransport(result) {
  const status = typeof result?.status === 'number' ? result.status : null;

  if (status === null) {
    if (result?.aborted === true) {
      return { status: 'network-error', code: 'ABORTED', message: 'The read was cancelled.' };
    }
    const name = typeof result?.error?.name === 'string' && result.error.name ? result.error.name : 'NetworkError';
    return { status: 'network-error', code: name, message: 'The provider could not be reached.' };
  }

  if (status === 401 || status === 403) {
    return { status: 'unauthorized', code: `HTTP ${status}`, message: 'The stored credential was rejected by the provider.' };
  }
  if (status === 429) {
    return { status: 'rate-limited', code: 'HTTP 429', message: 'The provider is rate limiting this account; retry later.' };
  }
  if (status < 200 || status >= 300) {
    return { status: 'upstream-error', code: `HTTP ${status}`, message: `The provider returned HTTP ${status}.` };
  }
  if (result.json === undefined) {
    return invalidResponse('The provider returned a body that is not valid JSON.', result.text, 'E_NOT_JSON');
  }
  return null;
}

/**
 * Pick the most specific failure out of several attempts at the same provider
 * (GLM and Kimi each have a China host and an international fallback; OpenCode
 * Go currently exposes a single host).
 *
 * @param {AdapterFailure[]} failures
 * @returns {AdapterFailure}
 */
export function mostSpecificFailure(failures) {
  if (failures.length === 0) {
    return { status: 'upstream-error', code: 'E_NO_ATTEMPT', message: 'No upstream host was attempted.' };
  }
  return failures.reduce((best, current) => {
    const bestRank = FAILURE_RANK[best.status] ?? 99;
    const currentRank = FAILURE_RANK[current.status] ?? 99;
    return currentRank < bestRank ? current : best;
  });
}

/**
 * Resolve one credential reference through whichever accessor the host wired.
 *
 * The frozen adapter contract passes `getSecret`; the `credentials.resolve`
 * fallback exists only so the adapters keep working if the host shell wires the
 * raw credential context instead. A throw is propagated — the adapter's outer
 * catch turns it into a snapshot failure rather than silently claiming the
 * provider is unconfigured.
 *
 * @param {{ getSecret?: (name: string) => Promise<string|undefined>|string|undefined, credentials?: { resolve?: (name: string) => Promise<string|undefined>|string|undefined } }} auth
 * @param {string} ref Credential reference name, e.g. 'ZAI_CODING_CN_API_KEY'.
 * @returns {Promise<string|undefined>}
 */
export async function resolveSecret(auth, ref) {
  if (auth && typeof auth.getSecret === 'function') return await auth.getSecret(ref);
  if (auth && auth.credentials && typeof auth.credentials.resolve === 'function') {
    return await auth.credentials.resolve(ref);
  }
  return undefined;
}

/**
 * A monotonic-ish clock for `fetchedAt`, tolerating a host that passes either
 * a function or a fixed epoch number as `now`.
 *
 * @param {(() => number)|number|undefined} now
 * @returns {number}
 */
export function clock(now) {
  if (typeof now === 'function') {
    const value = now();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  return Date.now();
}

/**
 * Shared request options for every upstream call.
 *
 * @param {AbortSignal|undefined} signal
 * @param {Record<string,string>} headers
 * @param {number} [timeoutMs] Host-supplied override of {@link REQUEST_TIMEOUT_MS}.
 * @returns {{ method: string, headers: Record<string,string>, signal: AbortSignal|undefined, timeoutMs: number }}
 */
export function requestOptions(signal, headers, timeoutMs) {
  return {
    method: 'GET',
    headers,
    signal,
    timeoutMs: typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : REQUEST_TIMEOUT_MS,
  };
}
