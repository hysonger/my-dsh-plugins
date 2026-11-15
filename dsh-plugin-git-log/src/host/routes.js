/**
 * Host HTTP API routes for `dsh-plugin-git-log`.
 *
 * Security model:
 * - Read-only GET/HEAD JSON endpoints.
 * - Restricted to loopback peers and loopback Host headers unless `allowRemote: true`.
 * - Rejects `Sec-Fetch-Site: cross-site` and foreign `Origin` headers.
 * - Repo data routes require `x-dsh-git-log: 1` (preserved by DSH Desktop forwarding
 *   even when `Origin`/`Sec-Fetch-Site` are stripped, and guaranteed to trigger a
 *   denied CORS preflight from any cross-origin browser page).
 *
 * @module dsh-plugin-git-log/host/routes
 */

import { URL } from "node:url";

import {
  COMMITS_PATH,
  COMMIT_PATH,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_MAX_DIFF_BYTES,
  DEFAULT_MAX_PAGE_SIZE,
  FILE_DIFF_PATH,
  HEALTH_PATH,
  PROTOCOL_VERSION,
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
  OVERVIEW_PATH,
} from "../shared/protocol.js";
import { getCommitDetail, getCommits, getFileDiff, getOverview } from "./git.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

/**
 * Determine whether a socket address belongs to host loopback.
 *
 * @param {string | undefined} address
 * @returns {boolean}
 */
export function isLoopbackAddress(address) {
  if (typeof address !== "string" || address.length === 0) return false;
  let normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized === "::1" || normalized === "127.0.0.1" || normalized.startsWith("127.");
}

/**
 * Determine whether a Host header names a loopback authority (DNS rebinding guard).
 *
 * @param {string | undefined} hostHeader
 * @returns {boolean}
 */
export function isLoopbackHostHeader(hostHeader) {
  if (typeof hostHeader !== "string" || hostHeader.trim() === "") return false;
  try {
    const parsed = new URL(`http://${hostHeader.trim()}`);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1" || hostname.startsWith("127.");
  } catch {
    return false;
  }
}

/**
 * Validate `Origin` against the DSH desktop shell or same HTTP(S) Host authority.
 *
 * @param {string | undefined} origin
 * @param {string | undefined} hostHeader
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, hostHeader) {
  if (origin === undefined) return true;
  if (typeof origin !== "string" || origin.trim() === "" || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "dsh-app:") return parsed.host === "app";
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (typeof hostHeader !== "string" || hostHeader.trim() === "") return false;
    const expected = new URL(`${parsed.protocol}//${hostHeader.trim()}`);
    return parsed.host === expected.host;
  } catch {
    return false;
  }
}

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...JSON_HEADERS,
    "content-length": Buffer.byteLength(body),
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

function sendError(req, res, status, code, message) {
  sendJson(req, res, status, { ok: false, error: { code, message } });
}

function guardRequest(req, res, options, requireClientHeader) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = JSON.stringify({
      ok: false,
      error: { code: "method-not-allowed", message: "Only GET and HEAD are supported." },
    });
    res.writeHead(405, {
      ...JSON_HEADERS,
      allow: "GET, HEAD",
      "content-length": Buffer.byteLength(body),
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return false;
  }

  if (typeof options.requestRejection === "function") {
    const rejection = options.requestRejection(req);
    if (rejection === 401 || rejection === 403) {
      sendError(req, res, rejection, rejection === 401 ? "unauthorized" : "forbidden", "Request rejected by DSH connection trust fence.");
      return false;
    }
  }

  const allowRemote = Boolean(options.allowRemote?.());
  if (!allowRemote) {
    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      sendError(req, res, 403, "forbidden", "Git log API is restricted to local DSH clients.");
      return false;
    }
    const hostHeader = typeof req.headers.host === "string" ? req.headers.host : undefined;
    if (!isLoopbackHostHeader(hostHeader)) {
      sendError(req, res, 403, "forbidden", "Untrusted Host header.");
      return false;
    }
  }

  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite === "cross-site") {
    sendError(req, res, 403, "forbidden", "Cross-site requests are not allowed.");
    return false;
  }

  const hostHeader = typeof req.headers.host === "string" ? req.headers.host : undefined;
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!isAllowedOrigin(originHeader, hostHeader)) {
    sendError(req, res, 403, "forbidden", "Untrusted Origin header.");
    return false;
  }

  if (requireClientHeader && req.headers[REQUEST_HEADER] !== REQUEST_HEADER_VALUE) {
    sendError(req, res, 403, "forbidden", `Missing required ${REQUEST_HEADER} header.`);
    return false;
  }

  return true;
}

function parseQuery(req) {
  try {
    const url = new URL(String(req.url ?? "/"), "http://localhost");
    return url.searchParams;
  } catch {
    return null;
  }
}

function parseNonNegInt(raw, fallback) {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
}

async function resolveCwd(searchParams, options) {
  const cwdParam = searchParams.get("cwd");
  if (typeof cwdParam === "string" && cwdParam.trim() !== "") {
    return cwdParam;
  }
  const sessionId = searchParams.get("sessionId");
  if (typeof sessionId === "string" && sessionId.trim() !== "" && typeof options.resolveSessionCwd === "function") {
    return await options.resolveSessionCwd(sessionId.trim());
  }
  return undefined;
}

function handleCaughtError(req, res, err, options) {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const code = typeof err?.code === "string" ? err.code : "internal-error";
  const message = err instanceof Error ? err.message : String(err);
  if (status >= 500) {
    options.log?.(`git-log route error (${code}): ${message}`);
  }
  sendError(req, res, status, code, message);
}

/**
 * Register all host routes on `webServer`.
 *
 * @param {{ register: (spec: object) => () => void }} webServer
 * @param {{
 *   version: string,
 *   allowRemote?: () => boolean,
 *   maxPageSize?: () => number,
 *   maxDiffBytes?: () => number,
 *   commandTimeoutMs?: () => number,
 *   resolveSessionCwd?: (sessionId: string) => Promise<string | undefined> | string | undefined,
 *   log?: (msg: string) => void
 * }} options
 * @returns {() => void}
 */
export function registerRoutes(webServer, options) {
  const getTimeout = () => {
    const val = options.commandTimeoutMs?.();
    return Number.isFinite(val) && val > 0 ? val : DEFAULT_COMMAND_TIMEOUT_MS;
  };
  const getMaxPageSize = () => {
    const val = options.maxPageSize?.();
    return Number.isInteger(val) && val > 0 ? val : DEFAULT_MAX_PAGE_SIZE;
  };
  const getMaxDiffBytes = () => {
    const val = options.maxDiffBytes?.();
    return Number.isFinite(val) && val > 0 ? val : DEFAULT_MAX_DIFF_BYTES;
  };

  const disposers = [
    webServer.register({
      kind: "exact",
      path: HEALTH_PATH,
      handler: (req, res) => {
        if (!guardRequest(req, res, options, false)) return;
        sendJson(req, res, 200, {
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          version: options.version,
        });
      },
    }),

    webServer.register({
      kind: "exact",
      path: OVERVIEW_PATH,
      handler: async (req, res) => {
        if (!guardRequest(req, res, options, true)) return;
        const params = parseQuery(req);
        if (!params) {
          sendError(req, res, 400, "bad-request", "Malformed request URL.");
          return;
        }
        try {
          const cwd = await resolveCwd(params, options);
          const data = await getOverview(cwd, { timeoutMs: getTimeout() });
          sendJson(req, res, 200, data);
        } catch (err) {
          handleCaughtError(req, res, err, options);
        }
      },
    }),

    webServer.register({
      kind: "exact",
      path: COMMITS_PATH,
      handler: async (req, res) => {
        if (!guardRequest(req, res, options, true)) return;
        const params = parseQuery(req);
        if (!params) {
          sendError(req, res, 400, "bad-request", "Malformed request URL.");
          return;
        }
        const skip = parseNonNegInt(params.get("skip"), 0);
        const limit = parseNonNegInt(params.get("limit"), getMaxPageSize());
        if (skip === null || limit === null || limit === 0) {
          sendError(req, res, 400, "bad-request", "skip must be >= 0 and limit must be a positive integer.");
          return;
        }
        try {
          const cwd = await resolveCwd(params, options);
          const data = await getCommits(cwd, {
            ref: params.get("ref") ?? undefined,
            query: params.get("q") ?? undefined,
            scope: params.get("scope") ?? undefined,
            skip,
            limit,
            maxPageSize: getMaxPageSize(),
            timeoutMs: getTimeout(),
          });
          sendJson(req, res, 200, data);
        } catch (err) {
          handleCaughtError(req, res, err, options);
        }
      },
    }),

    webServer.register({
      kind: "exact",
      path: COMMIT_PATH,
      handler: async (req, res) => {
        if (!guardRequest(req, res, options, true)) return;
        const params = parseQuery(req);
        if (!params) {
          sendError(req, res, 400, "bad-request", "Malformed request URL.");
          return;
        }
        const hash = params.get("hash") ?? "";
        try {
          const cwd = await resolveCwd(params, options);
          const data = await getCommitDetail(cwd, hash, { timeoutMs: getTimeout() });
          sendJson(req, res, 200, data);
        } catch (err) {
          handleCaughtError(req, res, err, options);
        }
      },
    }),

    webServer.register({
      kind: "exact",
      path: FILE_DIFF_PATH,
      handler: async (req, res) => {
        if (!guardRequest(req, res, options, true)) return;
        const params = parseQuery(req);
        if (!params) {
          sendError(req, res, 400, "bad-request", "Malformed request URL.");
          return;
        }
        const hash = params.get("hash") ?? "";
        const filePath = params.get("path") ?? "";
        const oldPath = params.get("oldPath") ?? undefined;
        try {
          const cwd = await resolveCwd(params, options);
          const data = await getFileDiff(cwd, hash, filePath, {
            oldPath,
            maxDiffBytes: getMaxDiffBytes(),
            timeoutMs: getTimeout(),
          });
          sendJson(req, res, 200, data);
        } catch (err) {
          handleCaughtError(req, res, err, options);
        }
      },
    }),
  ];

  return () => {
    for (const dispose of disposers) {
      try {
        dispose?.();
      } catch {
        // Ignore route cleanup errors on shutdown.
      }
    }
  };
}
