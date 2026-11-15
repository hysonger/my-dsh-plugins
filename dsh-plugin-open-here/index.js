/**
 * Host half of dsh-plugin-open-here.
 *
 * Bridges the terminal into the GUI: a local `dsh-open <dir>` invocation POSTs
 * the directory to this plugin's routes on the profile's web server; the host
 * resolves (or creates) the workspace, then hands the workspace id to any
 * connected browser half — or parks it as a pending intent until one connects.
 * The browser half performs the actual navigation through `uiWorkspace`, the
 * same service the GUI's own sidebar uses, so opening from the terminal is
 * indistinguishable from clicking the workspace in the sidebar.
 *
 * Security model:
 *
 * - `POST /open-here/open` is the only mutating route. It requires the bearer
 *   token stored in `$DSH_HOME/open-here/token` (mode 0600, generated once on
 *   first activation), a loopback peer unless `allowRemote` is set, a JSON
 *   content type, and no cross-site `Origin` — together these make both local
 *   privilege escalation and browser CSRF impractical.
 * - `GET /open-here/events` (SSE) and `GET /open-here/pending` carry no token:
 *   the browser half cannot read local files, so it cannot present one. They
 *   only disclose workspace ids (unguessable UUIDs) and stay loopback-only by
 *   default; no CORS headers are ever emitted, so cross-origin web pages
 *   cannot read the responses.
 * - `GET /open-here/health` requires the token and lets the CLI validate a
 *   discovery file before trusting its origin.
 *
 * Discovery: the desktop backend binds an ephemeral port that changes every
 * launch, so on activation this plugin writes
 * `$DSH_HOME/open-here/runtime-<profile>.json` (mode 0600) with the origin, a
 * browser-authenticated URL, the pid and the profile name, and removes it on
 * unload. The CLI scans these files to find live instances.
 *
 * No schema library and no runtime dependencies: the config surface is two
 * scalars, validated through a hand-written Standard Schema, so a dependency
 * resolution failure can never stop the bridge from loading.
 *
 * @module dsh-plugin-open-here
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** Plugin version reported by `/open-here/health`. */
export const PLUGIN_VERSION = '0.1.0';

/** Route prefix shared with the CLI and the browser half. */
export const ROUTE_PREFIX = '/open-here';

/** Directory under the DSH home holding the token and runtime files. */
export const STATE_DIR_NAME = 'open-here';

/** File (inside the state directory) holding the CLI bearer token. */
export const TOKEN_FILE_NAME = 'token';

/** Default lifetime of an undelivered open intent: five minutes. */
export const DEFAULT_PENDING_TTL_MS = 5 * 60 * 1000;

/** SSE keep-alive comment cadence; well under typical proxy idle timeouts. */
const SSE_KEEPALIVE_MS = 30 * 1000;

/** Request bodies are tiny (`{"path": "..."}`); refuse anything larger. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Normalize the plugin's configuration.
 *
 * @param {object} [input] Raw config from the loader.
 * @returns {{ allowRemote: boolean, pendingTtlMs: number }}
 */
export function normalizeConfig(input) {
  const raw = input !== null && typeof input === 'object' ? input : {};
  const ttl =
    typeof raw.pendingTtlMs === 'number' && Number.isFinite(raw.pendingTtlMs)
      ? Math.min(Math.max(Math.trunc(raw.pendingTtlMs), 1000), 60 * 60 * 1000)
      : DEFAULT_PENDING_TTL_MS;
  return {
    allowRemote: raw.allowRemote === true,
    pendingTtlMs: ttl,
  };
}

/** Field types the hand-written schema below enforces. */
const ConfigDefaults = {
  allowRemote: false,
  pendingTtlMs: DEFAULT_PENDING_TTL_MS,
};

/**
 * Configuration surface, declared through the Standard Schema interface so
 * Cordis can validate the row config without this package importing a
 * validator.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-plugin-open-here',
    /**
     * @param {unknown} value Raw config from the loader.
     * @returns {{ value: ReturnType<typeof normalizeConfig>, issues?: undefined }
     *   | { issues: Array<{ message: string, path?: string[] }> }}
     */
    validate(value) {
      const raw = value === null || value === undefined ? {} : value;
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        return { issues: [{ message: 'open-here config must be an object', path: [] }] };
      }
      const fields = /** @type {Record<string, unknown>} */ (raw);
      /** @type {Array<{ message: string, path?: string[] }>} */
      const issues = [];
      for (const key of ['allowRemote', 'pendingTtlMs']) {
        const expected = typeof ConfigDefaults[key];
        if (fields[key] !== undefined && typeof fields[key] !== expected) {
          issues.push({ message: `open-here config.${key} must be a ${expected}`, path: [key] });
        }
      }
      if (issues.length > 0) return { issues };
      return { value: normalizeConfig(fields) };
    },
  },
};

/** Cordis service dependencies: the HTTP carrier and the workspace registry. */
export const inject = ['webServer', 'workspaceRegistry'];

/**
 * Resolve the DSH home directory without importing the shipped helper: the
 * profile context carries it when available, the `DSH_HOME` environment
 * variable overrides the default, and `~/.dsh` is the fallback.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx Plugin context.
 * @returns {string}
 */
export function resolveDshHome(ctx) {
  const profileHome = ctx.get?.('profileContext')?.home;
  if (typeof profileHome === 'string' && profileHome.length > 0) return profileHome;
  if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0) {
    return process.env.DSH_HOME;
  }
  return join(homedir(), '.dsh');
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx Plugin context.
 * @returns {string} Profile name for the runtime file, or "unknown".
 */
export function resolveProfileName(ctx) {
  const name = ctx.get?.('profileContext')?.name;
  return typeof name === 'string' && name.length > 0 ? name : 'unknown';
}

/**
 * Whether a peer address is loopback. Mirrors the convention used by the
 * usage-board plugin: the API is local-only unless the profile opts out.
 *
 * @param {string | undefined} address `req.socket.remoteAddress`.
 * @returns {boolean}
 */
export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return false;
  let normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  // URL.host keeps the brackets on IPv6 literals.
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized === '::1' || normalized === '127.0.0.1') return true;
  if (normalized.startsWith('127.')) return true;
  return false;
}

/**
 * Whether a request Origin may legitimately call the mutating route. The CLI
 * sends no Origin at all; the GUI itself never calls this route. Anything from
 * a web page on another origin is cross-site request forgery by definition.
 *
 * @param {string | undefined} origin The request's `Origin` header.
 * @param {string} hostOrigin The web server's own origin (e.g. http://127.0.0.1:3080).
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, hostOrigin) {
  if (origin === undefined || origin === null || origin === '' || origin === 'null') return true;
  if (origin === hostOrigin) return true;
  // The desktop App serves the GUI from this custom scheme.
  if (origin.startsWith('dsh-app://')) return true;
  try {
    const parsed = new URL(origin);
    return isLoopbackAddress(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Constant-time bearer-token comparison that tolerates malformed input.
 *
 * @param {string | undefined} header The `Authorization` header value.
 * @param {string} token The expected token.
 * @returns {boolean}
 */
export function verifyBearer(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const presented = Buffer.from(header.slice(7).trim(), 'utf8');
  const expected = Buffer.from(token, 'utf8');
  if (presented.length !== expected.length || presented.length === 0) return false;
  return timingSafeEqual(presented, expected);
}

/**
 * Validate an open-request payload. Kept separate from the route so the rules
 * are unit-testable without a server.
 *
 * @param {unknown} body Parsed JSON body.
 * @returns {{ ok: true, path: string } | { ok: false, message: string }}
 */
export function validateOpenRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'body must be a JSON object' };
  }
  const path = /** @type {{ path?: unknown }} */ (body).path;
  if (typeof path !== 'string' || path.length === 0) {
    return { ok: false, message: 'body.path must be a non-empty string' };
  }
  if (path.includes('\0')) {
    return { ok: false, message: 'body.path must not contain NUL bytes' };
  }
  if (!isAbsolute(path)) {
    return { ok: false, message: 'body.path must be an absolute path' };
  }
  return { ok: true, path };
}

/**
 * One undelivered or in-flight open intent.
 * @typedef {{ workspaceId: string, path: string, requestedAt: number }} OpenIntent
 */

/**
 * Tracks the single pending intent with a TTL. "Latest wins": a newer open
 * replaces an undelivered older one rather than queueing behind it.
 */
export class PendingIntents {
  /** @param {number} ttlMs Intent lifetime in milliseconds. */
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    /** @type {OpenIntent | null} */
    this.pending = null;
  }

  /** @param {OpenIntent} intent @returns {void} */
  store(intent) {
    this.pending = intent;
  }

  /**
   * Take the pending intent when it is still fresh; consumes it either way.
   * @returns {OpenIntent | null}
   */
  take() {
    const intent = this.pending;
    this.pending = null;
    if (intent === null) return null;
    if (Date.now() - intent.requestedAt > this.ttlMs) return null;
    return intent;
  }

  /** Drop the pending intent once it outlives the TTL. @returns {void} */
  sweep() {
    if (this.pending !== null && Date.now() - this.pending.requestedAt > this.ttlMs) {
      this.pending = null;
    }
  }
}

/**
 * Fan-out hub for the SSE stream. Each connected browser half registers its
 * response here; intents are written as `data:` frames.
 */
export class IntentHub {
  constructor() {
    /** @type {Set<import('node:http').ServerResponse>} */
    this.clients = new Set();
  }

  /**
   * @param {import('node:http').ServerResponse} res SSE response to add.
   * @returns {() => void} Disposer removing the client.
   */
  add(res) {
    this.clients.add(res);
    return () => this.clients.delete(res);
  }

  /**
   * Write an intent to every connected client.
   * @param {OpenIntent} intent
   * @returns {number} How many clients received it.
   */
  broadcast(intent) {
    const frame = `data: ${JSON.stringify(intent)}\n\n`;
    let delivered = 0;
    for (const res of this.clients) {
      try {
        res.write(frame);
        delivered += 1;
      } catch {
        /* a half-closed socket is removed by its own close handler */
      }
    }
    return delivered;
  }

  /** End every client stream (plugin unload). @returns {void} */
  closeAll() {
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
        /* already closed */
      }
    }
    this.clients.clear();
  }
}

/**
 * Load the CLI token from the state directory, generating and persisting one
 * (mode 0600) on first activation. Reused across restarts so the CLI never
 * needs re-provisioning.
 *
 * @param {string} stateDir Absolute state directory path.
 * @returns {Promise<string>} The token.
 */
export async function loadOrCreateToken(stateDir) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const tokenPath = join(stateDir, TOKEN_FILE_NAME);
  try {
    const existing = (await readFile(tokenPath, 'utf8')).trim();
    if (existing.length >= 16) return existing;
  } catch (error) {
    if (/** @type {{ code?: string }} */ (error).code !== 'ENOENT') throw error;
  }
  const token = randomBytes(32).toString('hex');
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
  await chmod(tokenPath, 0o600).catch(() => undefined);
  return token;
}

/**
 * Write the runtime discovery file (one key per line so a dependency-free
 * shell reader can extract values), mode 0600.
 *
 * @param {string} stateDir Absolute state directory path.
 * @param {string} profile Profile name.
 * @param {Record<string, string | number>} fields Flat serializable values.
 * @returns {Promise<string>} The written file path.
 */
export async function writeRuntimeFile(stateDir, profile, fields) {
  const filePath = join(stateDir, `runtime-${profile}.json`);
  const entries = Object.entries(fields).map(
    ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  const text = `{\n${entries.join(',\n')}\n}\n`;
  await writeFile(filePath, text, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return filePath;
}

/**
 * Read a request body up to the size cap.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`${JSON.stringify(body)}\n`);
}

/**
 * Mount the open-here bridge.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx Plugin context.
 * @param {object} [config] Resolved configuration.
 */
export function apply(ctx, config) {
  const resolved = normalizeConfig(config);

  const log = (message) => {
    try {
      ctx.logger?.info?.(`[open-here] ${message}`);
    } catch {
      /* a logging failure must never break the bridge */
    }
  };

  const stateDir = join(resolveDshHome(ctx), STATE_DIR_NAME);
  const profile = resolveProfileName(ctx);
  const hub = new IntentHub();
  const intents = new PendingIntents(resolved.pendingTtlMs);

  ctx.effect(() => {
    let disposed = false;
    /** @type {string | null} */
    let token = null;
    /** @type {string | null} */
    let runtimePath = null;
    const registrations = [];
    /** @type {Set<ReturnType<typeof setInterval>>} */
    const keepalives = new Set();

    const requirePeer = (req) =>
      resolved.allowRemote === true || isLoopbackAddress(req.socket?.remoteAddress);

    const requireToken = (req) =>
      token !== null && verifyBearer(req.headers.authorization, token);

    const handleOpen = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      if (!requirePeer(req)) {
        sendJson(res, 403, { ok: false, message: 'open-here is loopback-only' });
        return;
      }
      if (!requireToken(req)) {
        sendJson(res, 401, { ok: false, message: 'missing or invalid bearer token' });
        return;
      }
      if (!isAllowedOrigin(req.headers.origin, ctx.webServer.getOrigin())) {
        sendJson(res, 403, { ok: false, message: 'cross-origin requests are not allowed' });
        return;
      }
      const contentType = req.headers['content-type'] ?? '';
      if (!String(contentType).toLowerCase().startsWith('application/json')) {
        sendJson(res, 415, { ok: false, message: 'content-type must be application/json' });
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { ok: false, message: 'body must be valid JSON' });
        return;
      }
      const request = validateOpenRequest(body);
      if (!request.ok) {
        sendJson(res, 400, { ok: false, message: request.message });
        return;
      }
      let stats;
      try {
        stats = await stat(request.path);
      } catch {
        sendJson(res, 400, { ok: false, message: `path does not exist: ${request.path}` });
        return;
      }
      if (!stats.isDirectory()) {
        sendJson(res, 400, { ok: false, message: `not a directory: ${request.path}` });
        return;
      }
      try {
        const existing = await ctx.workspaceRegistry.resolveByPath(request.path);
        const workspace = existing ?? (await ctx.workspaceRegistry.create(request.path));
        /** @type {OpenIntent} */
        const intent = {
          workspaceId: workspace.id,
          path: workspace.path,
          requestedAt: Date.now(),
        };
        intents.sweep();
        const delivered = hub.broadcast(intent);
        if (delivered === 0) intents.store(intent);
        sendJson(res, 200, {
          ok: true,
          workspaceId: intent.workspaceId,
          path: intent.path,
          created: existing === undefined,
          delivered,
        });
        log(
          `open ${intent.path} -> workspace ${intent.workspaceId}` +
            ` (${existing === undefined ? 'created' : 'existing'},` +
            ` delivered to ${delivered} client${delivered === 1 ? '' : 's'})`,
        );
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const handleEvents = (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' });
        res.end();
        return;
      }
      if (!requirePeer(req)) {
        sendJson(res, 403, { ok: false, message: 'open-here is loopback-only' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(': open-here\n\n');
      const remove = hub.add(res);
      const keepalive = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch {
          /* closed sockets clean up through the close handler */
        }
      }, SSE_KEEPALIVE_MS);
      keepalives.add(keepalive);
      req.on('close', () => {
        clearInterval(keepalive);
        keepalives.delete(keepalive);
        remove();
      });
      // A GUI that connects after the POST still gets the intent, once.
      intents.sweep();
      const replayed = intents.take();
      if (replayed !== null) {
        res.write(`data: ${JSON.stringify(replayed)}\n\n`);
        log(`replayed pending intent ${replayed.path} to a newly connected client`);
      }
    };

    const handlePending = (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' });
        res.end();
        return;
      }
      if (!requirePeer(req)) {
        sendJson(res, 403, { ok: false, message: 'open-here is loopback-only' });
        return;
      }
      intents.sweep();
      sendJson(res, 200, { intent: intents.take() });
    };

    const handleHealth = (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' });
        res.end();
        return;
      }
      if (!requirePeer(req)) {
        sendJson(res, 403, { ok: false, message: 'open-here is loopback-only' });
        return;
      }
      if (!requireToken(req)) {
        sendJson(res, 401, { ok: false, message: 'missing or invalid bearer token' });
        return;
      }
      sendJson(res, 200, { ok: true, profile, version: PLUGIN_VERSION });
    };

    registrations.push(
      ctx.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/open`, handler: handleOpen }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_PREFIX}/events`,
        handler: handleEvents,
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_PREFIX}/pending`,
        handler: handlePending,
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_PREFIX}/health`,
        handler: handleHealth,
      }),
    );

    // Token first, then the discovery file: a CLI that sees the file must be
    // able to authenticate against the instance that wrote it.
    void (async () => {
      try {
        token = await loadOrCreateToken(stateDir);
      } catch (error) {
        log(`cannot prepare token under ${stateDir}: ${error}`);
        return;
      }
      if (disposed) return;
      /** @type {Record<string, string | number>} */
      const fields = {
        version: 1,
        profile,
        pid: process.pid,
        pluginVersion: PLUGIN_VERSION,
        updatedAt: new Date().toISOString(),
      };
      try {
        fields.origin = ctx.webServer.getOrigin();
      } catch (error) {
        log(`web server origin unavailable, discovery file skipped: ${error}`);
        return;
      }
      try {
        const connection = ctx.get?.('connection');
        if (connection !== undefined && typeof connection.authenticatedUrl === 'function') {
          fields.url = connection.authenticatedUrl(fields.origin);
        }
      } catch (error) {
        log(`authenticated URL unavailable, continuing without it: ${error}`);
      }
      if (disposed) return;
      try {
        runtimePath = await writeRuntimeFile(stateDir, profile, fields);
        log(`ready — profile ${profile}, routes under ${ROUTE_PREFIX}, discovery ${runtimePath}`);
      } catch (error) {
        log(`cannot write discovery file under ${stateDir}: ${error}`);
      }
    })();

    return () => {
      disposed = true;
      for (const dispose of registrations.splice(0)) dispose();
      for (const keepalive of keepalives) clearInterval(keepalive);
      keepalives.clear();
      hub.closeAll();
      if (runtimePath !== null) {
        void rm(runtimePath, { force: true }).catch(() => undefined);
      }
    };
  }, 'open-here: http routes');
}
