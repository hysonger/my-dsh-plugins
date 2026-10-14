/**
 * Bounded JSON HTTP client for the usage board's provider adapters.
 *
 * The adapters must be total: this helper therefore NEVER throws and NEVER
 * rejects. Every failure — DNS, TLS, timeout, abort, a body that is not JSON —
 * comes back as a plain result object the adapter maps onto a protocol status.
 *
 * @module dsh-plugin-usage-board/host/fetch-json
 */

/** Default per-request deadline. */
export const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Default raw-body cap.
 *
 * 8 KiB was too small in practice: DeepSeek's month-to-date cost report is
 * ~146 KB (6 models x 5 usage types x 31 days) and truncating it produced
 * unparseable JSON. A cap still exists because an upstream that streams
 * without end must not be able to exhaust host memory.
 */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * @typedef {object} FetchJsonResult
 * @property {boolean} ok True only for a 2xx response with a parsed JSON body.
 * @property {number|null} status HTTP status, or null when no response arrived.
 * @property {Record<string,string>} headers Lower-cased response headers.
 * @property {unknown} json Parsed body, or undefined when parsing failed.
 * @property {string} text Raw body, truncated to the effective cap.
 * @property {boolean} truncated True when the body hit the cap, so a JSON parse failure is explained.
 * @property {{name: string, message: string}|null} error Transport failure, or null.
 * @property {boolean} aborted True when the caller's signal cancelled the request.
 * @property {number} latencyMs
 */

/**
 * Perform one bounded JSON request.
 *
 * @param {string} url Absolute http(s) URL.
 * @param {object} [options]
 * @param {string} [options.method] HTTP method, default GET.
 * @param {Record<string,string>} [options.headers]
 * @param {string} [options.body]
 * @param {AbortSignal} [options.signal] Caller lifetime; combined with the timeout.
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl] Injection seam for tests.
 * @param {number} [options.maxBodyBytes]
 * @returns {Promise<FetchJsonResult>}
 */
export async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers,
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    maxBodyBytes = MAX_BODY_BYTES,
  } = options;

  const started = Date.now();
  /** @type {FetchJsonResult} */
  const result = {
    ok: false,
    status: null,
    headers: {},
    json: undefined,
    text: '',
    truncated: false,
    error: null,
    aborted: false,
    latencyMs: 0,
  };

  if (typeof fetchImpl !== 'function') {
    result.error = { name: 'UnsupportedError', message: 'no fetch implementation available' };
    return result;
  }

  // One controller owns both the deadline and the caller's cancellation, so a
  // caller abort and a timeout are indistinguishable to the adapter's `finally`.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body,
      redirect: 'follow',
      signal: controller.signal,
    });
    result.status = response.status;
    for (const [name, value] of response.headers) result.headers[name.toLowerCase()] = value;

    let text = '';
    try {
      const read = await readBounded(response, maxBodyBytes);
      text = read.text;
      result.truncated = read.truncated;
    } catch (error) {
      result.error = describeError(error);
    }
    result.text = text;

    if (typeof text === 'string' && text.length > 0) {
      try {
        result.json = JSON.parse(text);
      } catch {
        result.json = undefined;
      }
    }
    result.ok = response.status >= 200 && response.status < 300 && result.json !== undefined;
    if (!result.ok && result.json === undefined && result.truncated) {
      // Make the cause explicit instead of leaving the adapter to guess.
      result.error = { name: 'BodyTooLargeError', message: `response body exceeded the ${maxBodyBytes}-byte cap` };
    }
    return result;
  } catch (error) {
    result.aborted = controller.signal.aborted && !timedOut;
    result.error = describeError(error);
    if (timedOut) {
      result.error = { name: 'TimeoutError', message: `request to ${safeHost(url)} exceeded ${timeoutMs}ms` };
    }
    return result;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    result.latencyMs = Date.now() - started;
  }
}

/**
 * Read at most `limit` bytes of a response body, then cancel the rest.
 * @param {Response} response
 * @param {number} limit
 * @returns {Promise<{ text: string, truncated: boolean }>}
 */
async function readBounded(response, limit) {
  if (response.body === null || response.body === undefined) return { text: '', truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      if (chunk === undefined) continue;
      size += chunk.byteLength;
      chunks.push(chunk);
      if (size >= limit) {
        truncated = true;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  const merged = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.byteLength;
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(merged), truncated };
}

/**
 * Flatten any thrown value into a loggable pair.
 * @param {unknown} error
 * @returns {{name: string, message: string}}
 */
export function describeError(error) {
  if (error instanceof Error) return { name: error.name || 'Error', message: error.message };
  return { name: 'Error', message: String(error) };
}

/**
 * The host part of a URL, for diagnostics that must never echo a query string.
 * @param {string} url
 * @returns {string}
 */
export function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown-host';
  }
}
