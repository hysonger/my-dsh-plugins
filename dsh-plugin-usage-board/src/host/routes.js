/**
 * HTTP surface of the usage board.
 *
 * Routes are deliberately small and dependency-free: they read a snapshot from
 * {@link SnapshotService} and serialize it. Every provider failure is already
 * normalized into the snapshot itself, so these handlers answer 200 for a
 * degraded dashboard and reserve non-2xx codes for transport-level mistakes
 * (unknown method, malformed query).
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

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of the standalone dashboard document. */
const PAGE_FILE = join(HERE, 'web', 'dashboard.html');

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
      path: HEALTH_PATH,
      handler: (req, res) => handleHealth(req, res, options),
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
    const snapshot = await options.snapshots.get({ force });
    sendJson(res, 200, snapshot, req);
  } catch (error) {
    options.log(`usage-board: snapshot route failed (${describe(error)})`);
    sendError(res, 500, 'snapshot-failed', 'The usage snapshot could not be assembled.');
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
      reads: options.snapshots.readCount,
      credentials: options.credentialsHint ?? null,
    },
    req,
  );
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
