/**
 * Credential access for the usage board.
 *
 * Two different secrets feed this dashboard, and DSH models them differently:
 *
 * 1. **Provider keys** (`ZAI_CODING_CN_API_KEY`, `KIMI_CODING_API_KEY`, …) are
 *    ordinary credential *references* — environment-variable names resolved
 *    through the layered store (`ctx.credentials.resolve`), which already
 *    covers the launch environment, the stored file, and both `.env` layers.
 *
 * 2. **The DeepSeek Platform account grant** is a credential *record*
 *    (`deepseek-account-platform/default`) holding an OAuth-style device token
 *    in `payload.token`. It has no environment layer by design, so it can only
 *    be read through `ctx.credentials.readRecord`.
 *
 * Both halves degrade instead of throwing: a DSH build without the credentials
 * service, or a host that never signed in, yields `undefined` and the adapters
 * report `not-configured` — which is a first-class state, not an error.
 *
 * @module dsh-plugin-usage-board/host/credentials
 */

/** Scope half of the DeepSeek Platform account record key. */
export const DEEPSEEK_PLATFORM_SCOPE = 'deepseek-account-platform';

/** Id half of the DeepSeek Platform account record used by the desktop profile. */
export const DEEPSEEK_PLATFORM_RECORD_ID = 'default';

/** Pseudo-reference the DeepSeek adapter asks for. */
export const DEEPSEEK_PLATFORM_TOKEN_REF = 'DEEPSEEK_PLATFORM_TOKEN';

/** Session-scoped record id the web profile uses when the browser owns the grant. */
export const DEEPSEEK_PLATFORM_SESSION_PREFIX = 'session-';

/**
 * Build the `getSecret` function the provider adapters receive.
 *
 * Resolution order for a name:
 * 1. `DEEPSEEK_PLATFORM_TOKEN` -> the Platform account record token (any record
 *    whose scope is `deepseek-account-platform`, preferring id `default`).
 * 2. Any other name -> `ctx.credentials.resolve(credentialRef(name))`, which
 *    layers the launch environment over the stored file over `.env` files.
 *
 * @param {object} options
 * @param {any} [options.credentials] The `ctx.credentials` service, when composed.
 * @param {(message: string) => void} [options.log]
 * @returns {(name: string) => Promise<string|undefined>}
 */
export function createSecretReader({ credentials, log = () => undefined }) {
  /** @type {Map<string, string|undefined>} */
  const memo = new Map();
  let platformToken;

  return async function getSecret(name) {
    if (typeof name !== 'string' || name.length === 0) return undefined;
    if (name === DEEPSEEK_PLATFORM_TOKEN_REF) {
      if (platformToken === undefined) platformToken = await readPlatformToken({ credentials, log });
      return platformToken;
    }
    if (memo.has(name)) return memo.get(name);
    const value = await resolveReference({ credentials, log }, name);
    memo.set(name, value);
    return value;
  };
}

/**
 * Resolve one environment-variable-style reference through the credentials seam.
 * @param {{ credentials?: any, log?: (message: string) => void }} deps
 * @param {string} name
 * @returns {Promise<string|undefined>}
 */
async function resolveReference({ credentials, log = () => undefined }, name) {
  if (credentials === undefined || credentials === null) {
    // No credentials service composed: the launch environment is still a valid
    // source, and it costs nothing to consult it.
    const fromEnv = process.env[name];
    return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : undefined;
  }
  try {
    const resolved = await credentials.resolve(name);
    const value = unwrapResolved(resolved);
    if (value !== undefined) return value;
  } catch (error) {
    log(`usage-board: could not resolve credential "${name}" through the credentials service (${describe(error)})`);
  }
  const fromEnv = process.env[name];
  return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : undefined;
}

/**
 * Read the DeepSeek Platform device/session grant token.
 * @param {{ credentials?: any, log?: (message: string) => void }} deps
 * @returns {Promise<string|undefined>}
 */
async function readPlatformToken({ credentials, log = () => undefined }) {
  if (credentials === undefined || credentials === null || typeof credentials.readRecord !== 'function') {
    log('usage-board: the credentials service exposes no record store, so the DeepSeek Platform sign-in cannot be read');
    return undefined;
  }
  const keys = await listPlatformRecordKeys(credentials, log);
  for (const key of keys) {
    try {
      const record = await credentials.readRecord(key);
      const token = extractToken(record);
      if (token !== undefined) return token;
    } catch (error) {
      log(`usage-board: could not read credential record "${key}" (${describe(error)})`);
    }
  }
  return undefined;
}

/**
 * Candidate record keys for the Platform grant, best first.
 *
 * `listRecords()` is preferred because record ids are not part of this plugin's
 * contract; the literal candidates are the fallback for a credentials provider
 * that exposes `readRecord` without `listRecords`.
 *
 * @param {any} credentials
 * @param {(message: string) => void} log
 * @returns {Promise<string[]>}
 */
async function listPlatformRecordKeys(credentials, log) {
  /** @type {string[]} */
  const found = [];
  if (typeof credentials.listRecords === 'function') {
    try {
      const records = await credentials.listRecords();
      if (Array.isArray(records)) {
        for (const entry of records) {
          const key = typeof entry === 'string' ? entry : entry?.key;
          if (typeof key !== 'string') continue;
          if (!key.startsWith(`${DEEPSEEK_PLATFORM_SCOPE}/`)) continue;
          found.push(key);
        }
      }
    } catch (error) {
      log(`usage-board: could not list credential records (${describe(error)})`);
    }
  }
  const preferred = `${DEEPSEEK_PLATFORM_SCOPE}/${DEEPSEEK_PLATFORM_RECORD_ID}`;
  found.sort((left, right) => rank(left, preferred) - rank(right, preferred));
  if (!found.includes(preferred)) found.push(preferred);
  return found;
}

/**
 * Prefer the plain `default` record over session-scoped ones.
 * @param {string} key
 * @param {string} preferred
 * @returns {number}
 */
function rank(key, preferred) {
  if (key === preferred) return 0;
  return key.includes(DEEPSEEK_PLATFORM_SESSION_PREFIX) ? 2 : 1;
}

/**
 * Pull the token out of a stored grant record without assuming one payload shape.
 * @param {unknown} record
 * @returns {string|undefined}
 */
function extractToken(record) {
  const candidates = [
    record?.payload?.token,
    record?.token,
    record?.payload?.access_token,
    record?.payload?.secret,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return undefined;
}

/**
 * Normalize the credentials seam's resolve result, which may be a plain string
 * or a `{ value, source }` envelope.
 * @param {unknown} resolved
 * @returns {string|undefined}
 */
function unwrapResolved(resolved) {
  if (typeof resolved === 'string') return resolved.length > 0 ? resolved : undefined;
  const value = resolved?.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
