/**
 * DSH host entry for `dsh-plugin-git-log`.
 *
 * Registers read-only HTTP routes on `ctx.webServer` so the right-sidebar
 * client tab can inspect git status, branches, tags, commits, and file diffs
 * for the active session's workspace directory.
 *
 * Zero external runtime dependencies: `Config` implements the Standard Schema
 * (`~standard`) interface directly, following DSH plugin conventions.
 *
 * @module dsh-plugin-git-log
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_MAX_DIFF_BYTES,
  DEFAULT_MAX_PAGE_SIZE,
} from "../src/shared/protocol.js";
import { registerRoutes } from "../src/host/routes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const name = "git-log";
export const inject = ["webServer"];

function boundedInt(val, fallback, min, max, label) {
  if (val === undefined) return { value: fallback };
  if (typeof val !== "number" || !Number.isInteger(val) || val < min || val > max) {
    return { issue: { message: `${label} must be an integer between ${min} and ${max}`, path: [label] } };
  }
  return { value: val };
}

/**
 * Hand-written Standard Schema validator for Cordis plugin config.
 *
 * @param {unknown} raw
 */
export function Config(raw) {
  const input = raw === undefined ? {} : raw;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("git-log config must be an object");
  }
  const obj = /** @type {Record<string, unknown>} */ (input);
  if (obj.allowRemote !== undefined && typeof obj.allowRemote !== "boolean") {
    throw new Error("git-log allowRemote must be a boolean");
  }
  const pageRes = boundedInt(obj.maxPageSize, DEFAULT_MAX_PAGE_SIZE, 5, 200, "maxPageSize");
  if (pageRes.issue) throw new Error(pageRes.issue.message);
  const diffRes = boundedInt(obj.maxDiffBytes, DEFAULT_MAX_DIFF_BYTES, 4096, 4 * 1024 * 1024, "maxDiffBytes");
  if (diffRes.issue) throw new Error(diffRes.issue.message);
  const timeoutRes = boundedInt(obj.commandTimeoutMs, DEFAULT_COMMAND_TIMEOUT_MS, 500, 120000, "commandTimeoutMs");
  if (timeoutRes.issue) throw new Error(timeoutRes.issue.message);

  return {
    allowRemote: obj.allowRemote ?? false,
    maxPageSize: pageRes.value,
    maxDiffBytes: diffRes.value,
    commandTimeoutMs: timeoutRes.value,
  };
}

Config["~standard"] = {
  version: 1,
  vendor: "dsh-plugin-git-log",
  validate(raw) {
    try {
      return { value: Config(raw) };
    } catch (err) {
      return { issues: [{ message: err instanceof Error ? err.message : String(err) }] };
    }
  },
};

/**
 * Cordis plugin activation hook.
 *
 * @param {any} ctx
 * @param {ReturnType<typeof Config>} config
 */
export function apply(ctx, config) {
  const resolved = Config(config);
  const version = readPackageVersion();
  const logger = ctx.logger?.("git-log");
  const log = (message) => {
    try {
      logger?.info?.(message);
    } catch {
      // Ignore logger errors.
    }
  };

  /** Optional host fallback to resolve a sessionId to cwd when omitted on query. */
  async function resolveSessionCwd(sessionId) {
    try {
      const liveSession = ctx.sessions?.get?.(sessionId);
      const liveCwd = liveSession?.header?.cwd ?? liveSession?.cwd;
      if (typeof liveCwd === "string" && liveCwd) return liveCwd;
    } catch {
      // Ignore unavailable sessions service.
    }
    try {
      const persisted = await ctx.sessionPersistence?.header?.(sessionId);
      if (typeof persisted?.cwd === "string" && persisted.cwd) return persisted.cwd;
    } catch {
      // Ignore unavailable persistence service.
    }
    return undefined;
  }

  ctx.effect(() => registerRoutes(ctx.webServer, {
    version,
    allowRemote: () => resolved.allowRemote,
    maxPageSize: () => resolved.maxPageSize,
    maxDiffBytes: () => resolved.maxDiffBytes,
    commandTimeoutMs: () => resolved.commandTimeoutMs,
    requestRejection: (req) => ctx.connection?.requestRejection?.(req),
    resolveSessionCwd,
    log,
  }), "git-log: routes");
}

export default { name, inject, Config, apply };
