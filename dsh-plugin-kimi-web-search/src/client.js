import { isIP } from 'node:net';

export const KIMI_CODE_SEARCH_PROVIDER_ID = 'kimi-code-search';
export const DEFAULT_KIMI_SEARCH_ENDPOINT = 'https://api.kimi.com/coding/v1/search';
export const DEFAULT_KIMI_FETCH_ENDPOINT = 'https://api.kimi.com/coding/v1/fetch';
export const GLOBAL_KIMI_SEARCH_ENDPOINT = 'https://api.kimi.ai/coding/v1/search';
export const GLOBAL_KIMI_FETCH_ENDPOINT = 'https://api.kimi.ai/coding/v1/fetch';
export const DEFAULT_KIMI_SEARCH_TIMEOUT_MS = 30_000;
export const DEFAULT_KIMI_FETCH_TIMEOUT_MS = 60_000;

export const USER_AGENT = 'dsh-plugin-kimi-web-search/0.2.1';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_RESPONSE_BYTES = 16 * 1024;
const MAX_ERROR_DETAIL_CHARS = 500;
const MAX_SOURCE_URL_CHARS = 2048;
const MAX_SOURCE_TITLE_CHARS = 512;
const MAX_SOURCE_SNIPPET_CHARS = 4000;
const MAX_SOURCE_DATE_CHARS = 100;

function defaultCreateError(message, code, options = {}) {
  const error = new Error(message, options);
  error.name = 'KimiWebError';
  error.code = code;
  return error;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validTimeout(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 180000;
}

/** API endpoints receive the Bearer key and therefore require HTTPS. */
export function normalizeApiEndpoint(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '') {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function boundedText(value, maxChars) {
  if (typeof value !== 'string' || value === '') return undefined;
  if (value.length <= maxChars) return value;
  return Array.from(value).slice(0, maxChars).join('');
}

function sourceUrl(value) {
  if (typeof value !== 'string' || value === '' || value.length > MAX_SOURCE_URL_CHARS) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function privateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Validate a target URL before disclosing it to the remote Kimi Fetch service. */
export function normalizePublicTargetUrl(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 8192) return undefined;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
      return undefined;
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return undefined;
    const family = isIP(hostname);
    if (family === 4 && privateIpv4(hostname)) return undefined;
    if (
      family === 6 &&
      (hostname.startsWith('::') ||
        hostname.startsWith('fc') ||
        hostname.startsWith('fd') ||
        hostname.startsWith('fe8') ||
        hostname.startsWith('fe9') ||
        hostname.startsWith('fea') ||
        hostname.startsWith('feb') ||
        hostname.startsWith('fec') ||
        hostname.startsWith('ff') ||
        hostname.startsWith('2002:') ||
        hostname.startsWith('64:ff9b:'))
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

/** Read at most maxBytes without quadratic string concatenation. */
async function readBoundedText(response, maxBytes) {
  const declaredRaw = response.headers.get('content-length');
  const declared = declaredRaw === null ? 0 : Number(declaredRaw);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Kimi response exceeded the ${maxBytes}-byte limit.`);
  }
  if (response.body === null) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error(`Kimi response exceeded the ${maxBytes}-byte limit.`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const buffer = new Uint8Array(maxBytes);
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Kimi response exceeded the ${maxBytes}-byte limit.`);
      }
      buffer.set(value, bytes);
      bytes += value.byteLength;
    }
    return new TextDecoder().decode(buffer.subarray(0, bytes));
  } finally {
    reader.releaseLock();
  }
}

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** Race an asynchronous phase while observing late settlement without leaks. */
function abortable(operation, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function redact(value, secret) {
  const text = String(value);
  return secret === '' ? text : text.split(secret).join('[redacted]');
}

function errorDetail(text, secret) {
  const trimmed = redact(text.trim(), secret);
  if (trimmed === '') return '';
  let detail = trimmed;
  try {
    const body = JSON.parse(trimmed);
    if (isRecord(body)) {
      detail =
        (typeof body.error === 'string' && body.error) ||
        (isRecord(body.error) && typeof body.error.message === 'string' && body.error.message) ||
        (typeof body.message === 'string' && body.message) ||
        '';
    }
  } catch {
    // Plain-text diagnostics are retained in bounded form.
  }
  detail = redact(detail, secret).replace(/\s+/g, ' ').trim();
  return detail === '' ? '' : `: ${detail.slice(0, MAX_ERROR_DETAIL_CHARS)}`;
}

/** Map Kimi results defensively, skipping bad entries and duplicate URLs. */
export function mapKimiSearchResponse(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.search_results)) {
    throw new Error('Kimi returned an invalid search response: search_results must be an array.');
  }
  const seen = new Set();
  const sources = [];
  for (const item of payload.search_results) {
    if (!isRecord(item)) continue;
    const url = sourceUrl(item.url);
    if (url === undefined || seen.has(url)) continue;
    seen.add(url);
    const title = boundedText(item.title, MAX_SOURCE_TITLE_CHARS);
    const snippet = boundedText(item.snippet, MAX_SOURCE_SNIPPET_CHARS);
    const publishedAt = boundedText(item.date, MAX_SOURCE_DATE_CHARS);
    sources.push({
      url,
      ...(title !== undefined ? { title } : {}),
      ...(snippet !== undefined ? { snippet } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
    });
  }
  return sources;
}

export class KimiWebClient {
  constructor(readSettings, hooks) {
    this.readSettings = readSettings;
    this.resolveCredential = hooks.resolveCredential;
    this.fetchImpl = hooks.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.createError = hooks.createError ?? defaultCreateError;
  }

  searchAvailable() {
    const settings = this.readSettings();
    return normalizeApiEndpoint(settings.searchEndpoint) !== undefined && validTimeout(settings.searchTimeoutMs);
  }

  fetchAvailable() {
    const settings = this.readSettings();
    return normalizeApiEndpoint(settings.fetchEndpoint) !== undefined && validTimeout(settings.fetchTimeoutMs);
  }

  async search({ query, toolCallId, signal }) {
    const settings = this.readSettings();
    const endpoint = normalizeApiEndpoint(settings.searchEndpoint);
    if (endpoint === undefined || !validTimeout(settings.searchTimeoutMs)) {
      throw this.createError('Kimi search has an invalid endpoint or timeout configuration.', 'WEB_PROVIDER_ERROR');
    }
    if (typeof query !== 'string' || query.trim() === '') {
      throw this.createError('Kimi search requires a non-empty query.', 'WEB_PROVIDER_ERROR');
    }
    const text = await this.request({
      operation: 'search',
      endpoint,
      timeoutMs: settings.searchTimeoutMs,
      accept: 'application/json',
      body: { text_query: query },
      toolCallId,
      signal,
    });
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw this.createError('Kimi returned invalid JSON.', 'WEB_PROVIDER_ERROR');
    }
    try {
      return { sources: mapKimiSearchResponse(payload), truncated: false };
    } catch (error) {
      throw this.createError(error instanceof Error ? error.message : String(error), 'WEB_PROVIDER_ERROR');
    }
  }

  async fetch({ url, toolCallId, signal }) {
    const settings = this.readSettings();
    const endpoint = normalizeApiEndpoint(settings.fetchEndpoint);
    const target = normalizePublicTargetUrl(url);
    if (endpoint === undefined || !validTimeout(settings.fetchTimeoutMs)) {
      throw this.createError('Kimi fetch has an invalid endpoint or timeout configuration.', 'WEB_PROVIDER_ERROR');
    }
    if (target === undefined) {
      throw this.createError(
        'Kimi fetch requires an absolute public HTTP(S) URL without credentials, loopback, or private IP destinations.',
        'WEB_INVALID_URL',
      );
    }
    const content = await this.request({
      operation: 'fetch',
      endpoint,
      timeoutMs: settings.fetchTimeoutMs,
      accept: 'text/markdown',
      body: { url: target },
      toolCallId,
      signal,
    });
    return {
      url: url.trim(),
      statusCode: 200,
      body: { kind: 'text', content },
      truncated: false,
    };
  }

  async request({ operation, endpoint, timeoutMs, accept, body, toolCallId, signal }) {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else if (signal !== undefined) signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`Kimi ${operation} timed out.`));
    }, timeoutMs);
    let apiKey = '';

    const abortedError = () =>
      this.createError(
        timedOut ? `Kimi ${operation} timed out.` : `Kimi ${operation} aborted.`,
        timedOut ? 'WEB_PROVIDER_TIMEOUT' : 'WEB_ABORTED',
      );

    try {
      if (controller.signal.aborted) throw abortedError();
      try {
        apiKey = await abortable(
          Promise.resolve().then(() => this.resolveCredential(controller.signal)),
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) throw abortedError();
        // Credential backends can include secrets in their own errors. Do not chain them.
        throw this.createError('Kimi credential resolution failed.', 'WEB_PROVIDER_ERROR');
      }
      if (typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw this.createError(
          `Kimi ${operation} has no API key for "${this.readSettings().apiKeyEnv}". Configure it through the DSH credentials service.`,
          'WEB_PROVIDER_CREDENTIAL_MISSING',
        );
      }
      apiKey = apiKey.trim();

      const response = await abortable(
        this.fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: accept,
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
            ...(typeof toolCallId === 'string' && toolCallId !== ''
              ? { 'X-Msh-Tool-Call-Id': toolCallId }
              : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        controller.signal,
      );

      if (response.status !== 200) {
        let detail = '';
        try {
          detail = errorDetail(
            await abortable(readBoundedText(response, MAX_ERROR_RESPONSE_BYTES), controller.signal),
            apiKey,
          );
        } catch (error) {
          if (controller.signal.aborted) throw abortedError();
        }
        throw this.createError(
          redact(
            `Kimi ${operation} request failed (HTTP ${response.status}) at ${endpoint}. No OAuth, regional, or local-fetch fallback was attempted.${detail}`,
            apiKey,
          ),
          'WEB_PROVIDER_ERROR',
        );
      }

      return await abortable(readBoundedText(response, MAX_RESPONSE_BYTES), controller.signal);
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('WEB_')) throw error;
      if (controller.signal.aborted) throw abortedError();
      throw this.createError(
        redact(
          `Kimi ${operation} transport or response processing failed for ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
          apiKey,
        ),
        'WEB_PROVIDER_ERROR',
      );
    } finally {
      clearTimeout(timer);
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    }
  }
}
