/**
 * HTTP surface of the usage board.
 *
 * Routes are deliberately small and dependency-free: they read from
 * {@link SnapshotService} and serialize what it returns. Every provider failure
 * is already normalized into a provider row, so these handlers answer 200 for a
 * degraded board and reserve non-2xx codes for transport-level mistakes
 * (unknown method, unknown provider id, malformed query).
 *
 * Two shapes of read exist:
 *
 * - `GET /api/provider?id=…` and `POST /api/provider?id=…` read ONE provider.
 *   These are what let a renderer paint each card the moment its own provider
 *   answers; a slow provider cannot hold the rest of the board back.
 * - `GET /api/snapshot` and `POST /api/refresh` read the whole board. They stay
 *   for compatibility and for consumers that genuinely want one aggregate
 *   body; they are composed from the same per-provider caches.
 *
 * Request-facing security: the DSH web server is unauthenticated on loopback,
 * and this dashboard reads real credentials, so the API routes are additionally
 * restricted to loopback peers by default (see `allowRemote`).
 *
 * @module dsh-plugin-usage-board/host/routes
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PROVIDER_PATH,
  PROVIDER_QUERY_PARAM,
  REFRESH_PATH,
  ROUTE_PREFIX,
  SNAPSHOT_PATH,
} from '../shared/protocol.js';

/**
 * Standalone HTML dashboard path.
 *
 * The browser half is deliberately NOT served from here: DSH's client-module
 * system already publishes it at `/plugins/dsh-plugin-usage-board/client.js`
 * from the `dsh.client` declaration in `package.json`, with combo-script
 * support, revisioned caching, and source maps. A second copy of that route
 * would be duplication with no capability behind it.
 */
export const PAGE_PATH = `${ROUTE_PREFIX}/`;

/** Plugin version reported by the health route; kept in sync with package.json. */
export const HEALTH_PATH = `${ROUTE_PREFIX}/api/health`;

/** Decorative DeepSeek illustration shared by both board renderers. */
export const DEEPSEEK_CASH_PATH = `${ROUTE_PREFIX}/deepseek_cash.png`;

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of the standalone dashboard document. */
const PAGE_FILE = join(HERE, 'web', 'dashboard.html');

/** Absolute path of the illustration served at {@link DEEPSEEK_CASH_PATH}. */
const DEEPSEEK_CASH_FILE = join(HERE, 'web', 'deepseek_cash.png');

/** JSON responses never carry a caller-controlled charset or filename. */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

/**
 * @typedef {object} RouteOptions
 * @property {import('./snapshot.js').SnapshotService} snapshots
 * @property {(message: string) => void} log
 * @property {string} version
 * @property {string|null} [credentialsHint] Non-secret summary of detected credential references.
 * @property {boolean} [allowRemote] Permit non-loopback peers to read the API.
 * @property {boolean} [servePage] Serve the standalone HTML dashboard.
 * @property {(() => { name: string, enabled: boolean, registered: boolean })|null} [toolStatus]
 *   Live state of the model-facing tool, reported additively by the health route.
 */

/**
 * Register every route this plugin owns.
 * @param {import('@deepseek-ai/dsh-host-webserver').WebServer} webServer
 * @param {RouteOptions} options
 * @returns {() => void} Disposer removing every route.
 */
export function registerRoutes(webServer, options) {
  const disposers = [
    webServer.register({
      kind: 'exact',
      path: SNAPSHOT_PATH,
      handler: (req, res) => handleSnapshot(req, res, options, false),
    }),
    webServer.register({
      kind: 'exact',
      path: REFRESH_PATH,
      handler: (req, res) => handleSnapshot(req, res, options, true),
    }),
    webServer.register({
      kind: 'exact',
      path: PROVIDER_PATH,
      handler: (req, res) => handleProvider(req, res, options),
    }),
    webServer.register({
      kind: 'exact',
      path: HEALTH_PATH,
      handler: (req, res) => handleHealth(req, res, options),
    }),
    webServer.register({
      kind: 'exact',
      path: DEEPSEEK_CASH_PATH,
      handler: (req, res) => handleDeepseekCash(req, res, options),
    }),
  ];
  if (options.servePage !== false) {
    disposers.push(
      webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => handlePage(req, res, options),
      }),
    );
  } else {
    // Without the page, the prefix seat is unclaimed and an unknown
    // `/usage-board/...` path would fall through to the SPA. Claim it anyway so
    // a caller always gets this plugin's own 404 shape.
    disposers.push(
      webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => handleUnknown(req, res),
      }),
    );
  }
  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch (error) {
        options.log(`usage-board: route disposal failed (${describe(error)})`);
      }
    }
  };
}

/**
 * Serve the snapshot; `force` bypasses the cache.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {RouteOptions} options
 * @param {boolean} force
 */
async function handleSnapshot(req, res, options, force) {
  if (!isAllowedMethod(req, res, force ? ['POST'] : ['GET', 'HEAD'])) return;
  if (!isAllowedPeer(req, options)) return sendError(res, 403, 'forbidden', 'This route is restricted to loopback clients.');
  try {
    // GET is the "show me the dashboard" read: it must not sit on the slowest
    // provider when a usable cached snapshot exists. POST /refresh is the
    // explicit "go ask the providers" read, so that one waits.
    const snapshot = force
      ? await options.snapshots.get({ force: true })
      : await options.snapshots.getServing();
    sendJson(res, 200, snapshot, req);
  } catch (error) {
    options.log(`usage-board: snapshot route failed (${describe(error)})`);
    sendError(res, 500, 'snapshot-failed', 'The usage snapshot could not be assembled.');
  }
}

/**
 * Serve ONE provider's envelope; `POST` forces a fresh read of that provider.
 *
 * This is the progressive-paint route: the response carries a single provider
 * row, so a renderer can show/update that card while the other providers are
 * still in flight. A missing or unknown `id` is a transport-level 400 — the
 * caller asked for something that does not exist, which is not a provider
 * failure and must not be rendered as a degraded row.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {RouteOptions} options
 */
async function handleProvider(req, res, options) {
  const method = req.method ?? 'GET';
  if (!isAllowedMethod(req, res, ['GET', 'HEAD', 'POST'])) return;
  if (!isAllowedPeer(req, options)) return sendError(res, 403, 'forbidden', 'This route is restricted to loopback clients.');
  const id = providerIdOf(req);
  const known = options.snapshots.providerIds;
  if (id === null || !known.includes(id)) {
    return sendError(
      res,
      400,
      'unknown-provider',
      id === null
        ? `Missing "${PROVIDER_QUERY_PARAM}" query parameter. Known providers: ${known.join(', ')}.`
        : `No usage board provider with id "${id}". Known providers: ${known.join(', ')}.`,
    );
  }
  try {
    // GET is the serving read: a cached row is returned immediately (stale
    // rows are flagged while they refresh behind the response). POST is the
    // explicit "go ask this provider" read, so that one waits.
    const snapshot = method === 'POST'
      ? await options.snapshots.getProvider(id, { force: true })
      : await options.snapshots.getProvider(id);
    sendJson(res, 200, snapshot, req);
  } catch (error) {
    // A provider adapter never throws out of SnapshotService (it repairs the
    // throw into a row); reaching here means the service itself failed.
    options.log(`usage-board: provider route failed for ${id} (${describe(error)})`);
    sendError(res, 500, 'provider-failed', 'The provider snapshot could not be assembled.');
  }
}

/**
 * Report plugin state without touching any provider or credential value.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {RouteOptions} options
 */
async function handleHealth(req, res, options) {
  if (!isAllowedMethod(req, res, ['GET', 'HEAD'])) return;
  if (!isAllowedPeer(req, options)) return sendError(res, 403, 'forbidden', 'This route is restricted to loopback clients.');
  sendJson(
    res,
    200,
    {
      ok: true,
      plugin: 'dsh-plugin-usage-board',
      version: options.version,
      protocolVersion: 1,
      ttlMs: options.snapshots.ttlMs,
      // Additive: whether the model-facing `usage_query` tool is configured and
      // actually registered in this process. A composition without a Tool
      // registry reports `registered: false` without failing anything.
      tool: options.toolStatus?.() ?? null,
      // Additive as of the per-provider split: `reads` counts provider reads
      // (one aggregate refresh is now one read per provider), and `providers`
      // reports each provider's cache state so a diagnostics caller can see
      // which card is waiting on which upstream.
      reads: options.snapshots.readCount,
      backgroundReads: options.snapshots.backgroundReadCount,
      fresh: options.snapshots.isFresh(),
      providers: options.snapshots.providerStates(),
      credentials: options.credentialsHint ?? null,
    },
    req,
  );
}

/**
 * Serve the decorative illustration below the board. This asset has its own
 * exact route so it remains available when the standalone page is disabled.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {RouteOptions} options
 */
async function handleDeepseekCash(req, res, options) {
  if (!isAllowedMethod(req, res, ['GET', 'HEAD'])) return;
  if (!isAllowedPeer(req, options)) return sendError(res, 403, 'forbidden', 'This asset is restricted to loopback clients.');
  let image;
  try {
    image = await readFile(DEEPSEEK_CASH_FILE);
  } catch (error) {
    options.log(`usage-board: DeepSeek illustration unavailable at ${DEEPSEEK_CASH_FILE} (${describe(error)})`);
    return sendError(res, 500, 'asset-missing', 'The DeepSeek illustration is not installed.');
  }
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': image.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else res.end(image);
}

/**
 * Serve the standalone dashboard document.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {RouteOptions} options
 */
async function handlePage(req, res, options) {
  if (!isAllowedMethod(req, res, ['GET', 'HEAD'])) return;
  if (!isAllowedPeer(req, options)) return sendError(res, 403, 'forbidden', 'This page is restricted to loopback clients.');
  // This route owns the whole `/usage-board` prefix, so it also answers paths
  // the page does not own. Serve the document only for the prefix root and
  // `/usage-board/`; everything else gets this plugin's own 404 rather than a
  // confusingly successful HTML page.
  const pathname = requestPath(req);
  if (pathname !== ROUTE_PREFIX && pathname !== PAGE_PATH) return handleUnknown(req, res);
  let html;
  try {
    html = await readFile(PAGE_FILE, 'utf8');
  } catch (error) {
    options.log(`usage-board: dashboard document unavailable at ${PAGE_FILE} (${describe(error)})`);
    return sendError(res, 500, 'page-missing', 'The usage board page is not installed.');
  }
  const inject = `<script>window.__USAGE_BOARD__=${JSON.stringify({
    snapshotPath: SNAPSHOT_PATH,
    refreshPath: REFRESH_PATH,
    providerPath: PROVIDER_PATH,
    providerQueryParam: PROVIDER_QUERY_PARAM,
    providerIds: options.snapshots.providerIds,
    version: options.version,
  })};</script>`;
  const body = html.includes('<!--USAGE_BOARD_BOOT-->')
    ? html.replace('<!--USAGE_BOARD_BOOT-->', inject)
    : html;
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    // The document is self-contained; forbid anything it did not ask for.
    'content-security-policy':
      "default-src 'none'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

/**
 * Answer a path under this plugin's prefix that no route owns.
 *
 * The prefix seat exists so that `/usage-board/anything` reaches this plugin
 * instead of the SPA fallback. It must therefore be a real 404 with a JSON body
 * for API-looking paths, not a 200 carrying the dashboard document.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function handleUnknown(req, res) {
  const pathname = requestPath(req);
  // An API caller asked for JSON-looking data; answer in kind.
  const wantsJson = pathname.startsWith(`${ROUTE_PREFIX}/api/`);
  if (wantsJson) {
    return sendError(res, 404, 'not-found', `No usage board API route matches ${pathname}.`);
  }
  const body = `<!doctype html><meta charset="utf-8"><title>404</title><h1>404</h1><p>No usage board route matches <code>${escapeHtml(pathname)}</code>.</p><p><a href="${ROUTE_PREFIX}/">用量看板</a></p>`;
  res.writeHead(404, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

/**
 * The request's pathname, never its query string.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
function requestPath(req) {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

/**
 * The provider id selected by the query string, or null when absent/blank.
 * Kept beside {@link requestPath} so both parse `req.url` the same way.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string|null}
 */
function providerIdOf(req) {
  try {
    const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get(PROVIDER_QUERY_PARAM);
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Escape text for the one HTML attribute-free context above.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Restrict a route to loopback peers unless the composition opted out.
 * @param {import('node:http').IncomingMessage} req
 * @param {RouteOptions} options
 * @returns {boolean} True when the caller may proceed.
 */
function isAllowedPeer(req, options) {
  if (options.allowRemote === true) return true;
  return isLoopbackAddress(req.socket?.remoteAddress);
}

/**
 * Whether an `net` peer address is a loopback address.
 * @param {string|undefined} address
 * @returns {boolean}
 */
export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return false;
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (normalized === '::1' || normalized === '127.0.0.1') return true;
  if (normalized.startsWith('127.')) return true;
  return false;
}

/**
 * Reject an unsupported method with 405 and the allowed set.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string[]} allowed
 * @returns {boolean} True when the method is allowed.
 */
function isAllowedMethod(req, res, allowed) {
  const method = req.method ?? 'GET';
  if (allowed.includes(method)) return true;
  res.writeHead(405, { allow: allowed.join(', '), 'content-type': 'text/plain; charset=utf-8' });
  res.end(`405 method not allowed: ${method}\n`);
  return false;
}

/**
 * Send a JSON payload, honoring HEAD.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 * @param {import('node:http').IncomingMessage} [req]
 */
function sendJson(res, status, payload, req) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { ...JSON_HEADERS, 'content-length': Buffer.byteLength(body) });
  if (req?.method === 'HEAD') res.end();
  else res.end(body);
}

/**
 * Send a normalized JSON error envelope.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
function sendError(res, status, code, message) {
  const body = JSON.stringify({ ok: false, error: { code, message } });
  res.writeHead(status, { ...JSON_HEADERS, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
