/**
 * Safe, read-only Git subprocess runner and NUL-delimited parser.
 *
 * Every git invocation runs without a shell (`spawn` with explicit argv),
 * strips user/system git config/hooks overrides where practical via env guards
 * (`GIT_CONFIG_COUNT=0`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`,
 * `LC_ALL=C`), disables path octal quoting (`-c core.quotePath=false`), and
 * enforces timeouts plus output byte caps.
 *
 * @module dsh-plugin-git-log/host/git
 */

import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";

import {
  ALL_REFS_SENTINEL,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_MAX_DIFF_BYTES,
  DEFAULT_MAX_PAGE_SIZE,
  HEAD_REF,
  parseDecorations,
  parseUnifiedDiff,
} from "../shared/protocol.js";

const GIT_ENV_BASE = {
  GIT_CONFIG_COUNT: "0",
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
};

const SENSITIVE_ENV_RE = /KEY|PASSWORD|SECRET|TOKEN/i;
const BLOCKED_EXACT_ENV = new Set([
  "SSH_ASKPASS",
  "PAGER",
  "EDITOR",
  "VISUAL",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "NODE_OPTIONS",
]);

/**
 * Build a hardened subprocess environment for `git` while preserving OS runtime
 * variables required on Windows (`SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `Path`, etc.).
 *
 * @param {Record<string, string | undefined>} [baseEnv]
 * @param {string} [platform]
 * @returns {Record<string, string>}
 */
export function buildGitEnv(baseEnv = process.env, platform = process.platform) {
  const env = {};
  let hasPath = false;
  let hasHome = false;
  let hasTmpdir = false;

  for (const [key, value] of Object.entries(baseEnv ?? {})) {
    if (typeof value !== "string") continue;
    const upper = key.toUpperCase();
    if (
      SENSITIVE_ENV_RE.test(key)
      || upper.startsWith("DSH_")
      || upper.startsWith("GIT_")
      || upper.startsWith("DYLD_")
      || BLOCKED_EXACT_ENV.has(upper)
    ) {
      continue;
    }
    env[key] = value;
    if (key === "PATH") hasPath = true;
    else if (key === "HOME") hasHome = true;
    else if (key === "TMPDIR") hasTmpdir = true;
  }

  if (platform !== "win32") {
    if (!hasPath) env.PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin";
    if (!hasHome) env.HOME = "";
    if (!hasTmpdir) env.TMPDIR = "";
  }

  return {
    ...env,
    ...GIT_ENV_BASE,
  };
}

const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_BRANCHES = 500;
const MAX_TAGS = 200;
const MAX_DETAIL_FILES = 500;
const MAX_SEARCH_SCAN = 5000;

const COMMIT_FORMAT = "%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s%x00%b";
const DETAIL_FORMAT = "%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%D%x00%s%x00%b";

const SHA_RE = /^[0-9a-f]{4,64}$/i;

/**
 * Trim a sliced UTF-8 Buffer so we never cut inside a multi-byte character.
 *
 * @param {Buffer} buf
 * @param {number} limit
 * @returns {Buffer}
 */
function safeUtf8Slice(buf, limit) {
  if (buf.length <= limit) return buf;
  let end = limit;
  // Walk back over UTF-8 continuation bytes (10xxxxxx), up to 3 bytes.
  let walked = 0;
  while (end > 0 && walked < 3 && (buf[end] & 0xc0) === 0x80) {
    end -= 1;
    walked += 1;
  }
  // If `end` lands on a leading byte whose full sequence doesn't fit inside `limit`, drop it.
  if (end > 0 && end < buf.length) {
    const lead = buf[end];
    let seqLen = 1;
    if ((lead & 0xe0) === 0xc0) seqLen = 2;
    else if ((lead & 0xf0) === 0xe0) seqLen = 3;
    else if ((lead & 0xf8) === 0xf0) seqLen = 4;
    if (end + seqLen > limit) return buf.subarray(0, end);
  }
  return buf.subarray(0, limit);
}

/**
 * Execute `git` with hardened environment, timeout, and bounded output.
 *
 * @param {string} cwd
 * @param {readonly string[]} args
 * @param {{
 *   timeoutMs?: number,
 *   maxBytes?: number,
 *   truncateAtLimit?: boolean
 * }} [options]
 * @returns {Promise<{
 *   exitCode: number | null,
 *   signal: string | null,
 *   stdout: string,
 *   stderr: string,
 *   truncated: boolean,
 *   timedOut: boolean,
 *   enoent: boolean
 * }>}
 */
export function runGit(cwd, args, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_COMMAND_TIMEOUT_MS;
  const maxBytes = Number.isFinite(options.maxBytes) && options.maxBytes > 0
    ? options.maxBytes
    : MAX_METADATA_BYTES;
  const truncateAtLimit = Boolean(options.truncateAtLimit);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let truncated = false;
    let killEscalationTimer = null;

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    const child = spawn("git", ["--no-pager", "-c", "core.quotePath=false", ...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildGitEnv(process.env, process.platform),
    });

    const killChild = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // Process already exited.
      }
      killEscalationTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Process already exited.
        }
      }, 500);
      killEscalationTimer.unref?.();
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, timeoutMs);
    timeoutTimer.unref?.();

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killEscalationTimer) clearTimeout(killEscalationTimer);
      resolve(payload);
    };

    child.stdout.on("data", (chunk) => {
      if (truncated) return;
      if (stdoutBytes + chunk.length > maxBytes) {
        const remaining = maxBytes - stdoutBytes;
        if (remaining > 0) {
          stdoutChunks.push(chunk.subarray(0, remaining));
          stdoutBytes += remaining;
        }
        truncated = true;
        if (truncateAtLimit) {
          killChild();
          return;
        }
        killChild();
        return;
      }
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;
    });

    child.stderr.on("data", (chunk) => {
      if (stderrBytes >= 65536) return;
      const remaining = 65536 - stderrBytes;
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      stderrChunks.push(slice);
      stderrBytes += slice.length;
    });

    child.on("error", (err) => {
      if (err && err.code === "ENOENT") {
        finish({
          exitCode: null,
          signal: null,
          stdout: "",
          stderr: err.message,
          truncated: false,
          timedOut: false,
          enoent: true,
        });
        return;
      }
      if (!settled) {
        settled = true;
        clearTimeout(timeoutTimer);
        if (killEscalationTimer) clearTimeout(killEscalationTimer);
        reject(err);
      }
    });

    child.on("close", (exitCode, signal) => {
      let stdoutBuf = Buffer.concat(stdoutChunks, stdoutBytes);
      if (truncated) {
        stdoutBuf = safeUtf8Slice(stdoutBuf, stdoutBuf.length);
      }
      const stderrBuf = Buffer.concat(stderrChunks, stderrBytes);
      if (truncated && !truncateAtLimit) {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          if (killEscalationTimer) clearTimeout(killEscalationTimer);
          reject(new Error("git command output exceeded maximum buffer limit"));
        }
        return;
      }
      finish({
        exitCode,
        signal,
        stdout: stdoutBuf.toString("utf8"),
        stderr: stderrBuf.toString("utf8"),
        truncated,
        timedOut,
        enoent: false,
      });
    });
  });
}

/**
 * Validate a git commit hash or unambiguous hex prefix.
 *
 * @param {string} hash
 * @returns {boolean}
 */
export function isValidCommitHash(hash) {
  return typeof hash === "string" && SHA_RE.test(hash);
}

/**
 * Basic syntax fence for ref names before asking git to verify them.
 * Rejects leading dashes (flag injection), whitespace, NUL/control bytes,
 * ranges (`..`), rev modifiers, and glob metacharacters.
 *
 * @param {string} ref
 * @returns {boolean}
 */
export function isSafeRefSyntax(ref) {
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 256) return false;
  if (ref.startsWith("-") || ref.startsWith("/") || ref.endsWith("/") || ref.endsWith(".lock")) return false;
  if (ref.includes("..") || ref.includes("@{") || ref.includes("//")) return false;
  return !/[\x00-\x1f\x7f\s~^:?*\[\\]/.test(ref);
}

/**
 * Validate and resolve the workspace directory and enclosing git repository.
 *
 * @param {string | undefined} rawCwd
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<
 *   | { ok: true, state: "no-workspace" }
 *   | { ok: true, state: "dir-missing", cwd: string }
 *   | { ok: true, state: "git-missing", cwd: string }
 *   | { ok: true, state: "not-git", cwd: string }
 *   | { ok: true, state: "bare-repo", cwd: string, repoRoot: string }
 *   | { ok: true, state: "ready", cwd: string, repoRoot: string, gitDir: string, repoName: string }
 * >}
 */
export async function resolveRepository(rawCwd, options = {}) {
  if (typeof rawCwd !== "string" || rawCwd.trim() === "") {
    return { ok: true, state: "no-workspace" };
  }
  const trimmed = rawCwd.trim();
  if (!isAbsolute(trimmed)) {
    throw Object.assign(new Error("cwd must be an absolute directory path."), { status: 400, code: "bad-request" });
  }

  let canonicalCwd;
  try {
    const info = await stat(trimmed);
    if (!info.isDirectory()) {
      return { ok: true, state: "dir-missing", cwd: trimmed };
    }
    canonicalCwd = await realpath(trimmed);
  } catch {
    return { ok: true, state: "dir-missing", cwd: trimmed };
  }

  const probe = await runGit(canonicalCwd, ["rev-parse", "--show-toplevel", "--absolute-git-dir", "--is-bare-repository"], options);
  if (probe.enoent) {
    return { ok: true, state: "git-missing", cwd: canonicalCwd };
  }
  if (probe.timedOut) {
    throw Object.assign(new Error("git rev-parse timed out."), { status: 504, code: "timeout" });
  }

  if (probe.exitCode !== 0) {
    if (probe.exitCode === 128 && /not a git repository/i.test(probe.stderr)) {
      return { ok: true, state: "not-git", cwd: canonicalCwd };
    }
    // Check bare repo explicitly because `--show-toplevel` exits 128 inside a bare git dir.
    const bareCheck = await runGit(canonicalCwd, ["rev-parse", "--is-bare-repository", "--absolute-git-dir"], options);
    const bareLines = bareCheck.stdout.trim().split(/\r?\n/);
    if (bareCheck.exitCode === 0 && bareLines[0] === "true") {
      return {
        ok: true,
        state: "bare-repo",
        cwd: canonicalCwd,
        repoRoot: bareLines[1] || canonicalCwd,
      };
    }
    if (bareCheck.exitCode === 128 && /not a git repository/i.test(bareCheck.stderr)) {
      return { ok: true, state: "not-git", cwd: canonicalCwd };
    }
    throw Object.assign(new Error(probe.stderr.trim() || "git rev-parse failed."), { status: 500, code: "git-error" });
  }

  const lines = probe.stdout.replace(/\r?\n$/, "").split(/\r?\n/);
  const repoRoot = lines[0] || canonicalCwd;
  const gitDir = lines[1] || "";
  const isBare = lines[2] === "true";
  if (isBare) {
    return { ok: true, state: "bare-repo", cwd: canonicalCwd, repoRoot };
  }

  return {
    ok: true,
    state: "ready",
    cwd: canonicalCwd,
    repoRoot,
    gitDir,
    repoName: basename(repoRoot) || repoRoot,
  };
}

/**
 * Read known remote names so decorations like `feat/x` aren't confused with `origin/x`.
 *
 * @param {string} repoRoot
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<string[]>}
 */
async function listRemotes(repoRoot, options) {
  const res = await runGit(repoRoot, ["remote"], options);
  if (res.exitCode !== 0 || !res.stdout) return [];
  return res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse git status porcelain v1 NUL-delimited summary counts.
 *
 * @param {string} raw
 * @returns {{ dirty: boolean, staged: number, modified: number, untracked: number, conflicted: number, total: number }}
 */
export function parseStatusSummary(raw) {
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  let conflicted = 0;
  let total = 0;

  if (!raw) {
    return { dirty: false, staged, modified, untracked, conflicted, total };
  }

  const tokens = raw.split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry || entry.length < 3) continue;
    const x = entry[0];
    const y = entry[1];
    total += 1;

    if (x === "?" && y === "?") {
      untracked += 1;
    } else if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      conflicted += 1;
    } else {
      if (x !== " " && x !== "?") staged += 1;
      if (y !== " " && y !== "?") modified += 1;
    }

    // Rename or copy entries emit an extra NUL-terminated destination/source path token.
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      i += 1;
    }
  }

  return {
    dirty: total > 0,
    staged,
    modified,
    untracked,
    conflicted,
    total,
  };
}

/**
 * Parse NUL-delimited commits produced by `git log -z`.
 *
 * @param {string} stdout
 * @param {readonly string[]} remotes
 * @returns {Array<{
 *   hash: string,
 *   shortHash: string,
 *   parents: string[],
 *   authorName: string,
 *   authorEmail: string,
 *   authorTime: number,
 *   commitTime: number,
 *   decorations: ReturnType<typeof parseDecorations>,
 *   subject: string,
 *   body: string,
 *   isMerge: boolean
 * }>}
 */
export function parseCommitRecords(stdout, remotes = []) {
  if (!stdout) return [];
  const fields = stdout.split("\0");
  // Expect exact multiples of 10 fields plus a trailing empty element from git log -z.
  const FIELDS_PER_COMMIT = 10;
  const commits = [];

  for (let i = 0; i + FIELDS_PER_COMMIT - 1 < fields.length; i += FIELDS_PER_COMMIT) {
    const hash = fields[i];
    if (!hash) break;
    const shortHash = fields[i + 1] ?? "";
    const parentStr = fields[i + 2] ?? "";
    const authorName = fields[i + 3] ?? "";
    const authorEmail = fields[i + 4] ?? "";
    const authorTime = Number(fields[i + 5]) || 0;
    const commitTime = Number(fields[i + 6]) || authorTime;
    const decorationRaw = fields[i + 7] ?? "";
    const subject = fields[i + 8] ?? "";
    const body = (fields[i + 9] ?? "").replace(/\r?\n+$/, "");
    const parents = parentStr ? parentStr.split(/\s+/).filter(Boolean) : [];

    commits.push({
      hash,
      shortHash,
      parents,
      authorName,
      authorEmail,
      authorTime,
      commitTime,
      decorations: parseDecorations(decorationRaw, remotes),
      subject,
      body,
      isMerge: parents.length > 1,
    });
  }

  return commits;
}

/**
 * Inspect repository HEAD, branches, tags, and dirty status summary.
 *
 * @param {string | undefined} rawCwd
 * @param {{ timeoutMs?: number }} [options]
 */
export async function getOverview(rawCwd, options = {}) {
  const repo = await resolveRepository(rawCwd, options);
  if (repo.state !== "ready") return repo;

  const { repoRoot, gitDir, repoName, cwd } = repo;

  const [headRev, symRef, refsRes, statusRes, remotes] = await Promise.all([
    runGit(repoRoot, ["rev-parse", "--verify", "--short", "HEAD"], options),
    runGit(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], options),
    runGit(
      repoRoot,
      [
        "for-each-ref",
        `--count=${MAX_BRANCHES + MAX_TAGS}`,
        "--sort=-committerdate",
        "--format=%(refname)%00%(refname:short)%00%(objectname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)",
        "refs/heads",
        "refs/remotes",
        "refs/tags",
      ],
      options,
    ),
    runGit(repoRoot, ["status", "--porcelain=v1", "-z"], options),
    listRemotes(repoRoot, options),
  ]);

  const unborn = headRev.exitCode !== 0;
  const oid = unborn ? "" : headRev.stdout.trim();
  const symBranch = symRef.exitCode === 0 ? symRef.stdout.trim() : "";
  const detached = !unborn && symBranch === "";

  const branches = [];
  const tags = [];

  if (refsRes.exitCode === 0 && refsRes.stdout) {
    for (const line of refsRes.stdout.split(/\r?\n/)) {
      if (!line) continue;
      const [fullRef = "", shortName = "", refOid = "", headMark = "", upstream = "", track = ""] = line.split("\0");
      if (fullRef.startsWith("refs/heads/")) {
        if (branches.length >= MAX_BRANCHES) continue;
        const aheadMatch = /ahead (\d+)/.exec(track);
        const behindMatch = /behind (\d+)/.exec(track);
        branches.push({
          name: shortName,
          ref: fullRef,
          kind: "local",
          oid: refOid,
          current: headMark.trim() === "*" || (!detached && shortName === symBranch),
          upstream: upstream || "",
          ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
          behind: behindMatch ? Number(behindMatch[1]) : 0,
        });
      } else if (fullRef.startsWith("refs/remotes/")) {
        if (shortName.endsWith("/HEAD")) continue;
        if (branches.length >= MAX_BRANCHES) continue;
        branches.push({
          name: shortName,
          ref: fullRef,
          kind: "remote",
          oid: refOid,
          current: false,
          upstream: "",
          ahead: 0,
          behind: 0,
        });
      } else if (fullRef.startsWith("refs/tags/")) {
        if (tags.length >= MAX_TAGS) continue;
        tags.push({
          name: shortName,
          ref: fullRef,
          oid: refOid,
        });
      }
    }
  }

  return {
    ok: true,
    state: "ready",
    cwd,
    repoRoot,
    gitDir,
    repoName,
    remotes,
    head: {
      branch: symBranch,
      oid,
      detached,
      unborn,
    },
    status: parseStatusSummary(statusRes.exitCode === 0 ? statusRes.stdout : ""),
    branches,
    tags,
  };
}

/**
 * Resolve the git log revision selection (`HEAD`, `--all`, or a verified branch/tag).
 *
 * @param {string} repoRoot
 * @param {string | undefined} rawRef
 * @param {{ timeoutMs?: number }} options
 * @returns {Promise<{ mode: "all" } | { mode: "single", refArg: string, unborn: boolean }>}
 */
async function resolveLogTarget(repoRoot, rawRef, options) {
  if (rawRef === ALL_REFS_SENTINEL) {
    return { mode: "all" };
  }
  const requested = typeof rawRef === "string" && rawRef.trim() !== "" ? rawRef.trim() : HEAD_REF;
  if (requested === HEAD_REF) {
    const headCheck = await runGit(repoRoot, ["rev-parse", "--verify", "HEAD"], options);
    return { mode: "single", refArg: HEAD_REF, unborn: headCheck.exitCode !== 0 };
  }
  if (!isSafeRefSyntax(requested)) {
    throw Object.assign(new Error("Invalid git ref syntax."), { status: 400, code: "bad-request" });
  }
  const verified = await runGit(repoRoot, ["rev-parse", "--verify", `${requested}^{commit}`], options);
  if (verified.exitCode !== 0) {
    throw Object.assign(new Error(`Unknown git ref: ${requested}`), { status: 400, code: "bad-request" });
  }
  return { mode: "single", refArg: verified.stdout.trim(), unborn: false };
}

/**
 * Escape POSIX ERE metacharacters for literal matching in `git log --author`.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Query paginated commit history with optional ref, search query, and scope filter.
 *
 * @param {string | undefined} rawCwd
 * @param {{
 *   ref?: string,
 *   query?: string,
 *   scope?: "all" | "message" | "author" | "path",
 *   skip?: number,
 *   limit?: number,
 *   maxPageSize?: number,
 *   timeoutMs?: number
 * }} [params]
 */
export async function getCommits(rawCwd, params = {}) {
  const options = { timeoutMs: params.timeoutMs };
  const repo = await resolveRepository(rawCwd, options);
  if (repo.state !== "ready") return repo;

  const { repoRoot, repoName, cwd } = repo;
  const maxPageSize = Number.isInteger(params.maxPageSize) && params.maxPageSize > 0
    ? params.maxPageSize
    : DEFAULT_MAX_PAGE_SIZE;
  const limit = Math.max(1, Math.min(maxPageSize, Number.isInteger(params.limit) ? params.limit : maxPageSize));
  const skip = Math.max(0, Number.isInteger(params.skip) ? params.skip : 0);
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const scope = params.scope && ["all", "message", "author", "path"].includes(params.scope) ? params.scope : "all";

  if (query.includes("\0") || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(query)) {
    throw Object.assign(new Error("Search query contains unsupported control characters."), { status: 400, code: "bad-request" });
  }

  const target = await resolveLogTarget(repoRoot, params.ref, options);
  if (target.mode === "single" && target.unborn) {
    return {
      ok: true,
      state: "ready",
      cwd,
      repoRoot,
      repoName,
      unborn: true,
      commits: [],
      hasMore: false,
      skip,
      limit,
    };
  }

  const remotes = await listRemotes(repoRoot, options);
  const baseArgs = ["log", "--topo-order", "-z", `--format=${COMMIT_FORMAT}`];
  if (target.mode === "all") {
    baseArgs.push("--all");
  }

  if (query !== "" && scope === "all") {
    const scanArgs = [...baseArgs, `--max-count=${MAX_SEARCH_SCAN}`];
    if (target.mode === "single") scanArgs.push(target.refArg);
    const logRes = await runGit(repoRoot, scanArgs, options);
    if (logRes.exitCode !== 0 && !/does not have any commits/i.test(logRes.stderr)) {
      throw Object.assign(new Error(logRes.stderr.trim() || "git log failed."), { status: 500, code: "git-error" });
    }
    const scanned = parseCommitRecords(logRes.stdout, remotes);
    const needle = query.toLowerCase();
    const matches = scanned.filter((c) => (
      c.hash.toLowerCase().startsWith(needle) ||
      c.shortHash.toLowerCase().startsWith(needle) ||
      c.subject.toLowerCase().includes(needle) ||
      c.body.toLowerCase().includes(needle) ||
      c.authorName.toLowerCase().includes(needle) ||
      c.authorEmail.toLowerCase().includes(needle) ||
      c.decorations.some((d) => d.label.toLowerCase().includes(needle))
    ));

    // If the user typed a valid commit SHA that sits older than MAX_SEARCH_SCAN, surface it directly.
    if (matches.length === 0 && isValidCommitHash(query)) {
      const exactRes = await runGit(repoRoot, ["rev-parse", "--verify", `${query}^{commit}`], options);
      if (exactRes.exitCode === 0) {
        const oid = exactRes.stdout.trim();
        let reachable = true;
        if (target.mode === "single") {
          const ancRes = await runGit(repoRoot, ["merge-base", "--is-ancestor", oid, target.refArg], options);
          reachable = ancRes.exitCode === 0;
        }
        if (reachable) {
          const singleRes = await runGit(repoRoot, ["log", "-n", "1", "-z", `--format=${COMMIT_FORMAT}`, oid], options);
          if (singleRes.exitCode === 0) {
            matches.push(...parseCommitRecords(singleRes.stdout, remotes));
          }
        }
      }
    }

    const page = matches.slice(skip, skip + limit);
    return {
      ok: true,
      state: "ready",
      cwd,
      repoRoot,
      repoName,
      unborn: false,
      commits: page,
      hasMore: matches.length > skip + limit,
      searchScanned: scanned.length,
      searchScanCapped: scanned.length >= MAX_SEARCH_SCAN,
      skip,
      limit,
    };
  }

  const args = [...baseArgs, `--skip=${skip}`, `--max-count=${limit + 1}`];
  if (query !== "" && scope === "message") {
    args.push(`--grep=${query}`, "--fixed-strings", "--regexp-ignore-case");
  } else if (query !== "" && scope === "author") {
    args.push(`--author=${escapeRegex(query)}`, "--regexp-ignore-case");
  }

  if (target.mode === "single") {
    args.push(target.refArg);
  }
  if (query !== "" && scope === "path") {
    // Strip leading ./ for git pathspec friendliness; `--` guarantees path cannot act as a flag.
    const normalizedPath = query.replace(/^(?:\.\/)+/, "");
    args.push("--", normalizedPath);
  }

  const logRes = await runGit(repoRoot, args, options);
  if (logRes.exitCode !== 0) {
    if (/does not have any commits yet/i.test(logRes.stderr)) {
      return {
        ok: true,
        state: "ready",
        cwd,
        repoRoot,
        repoName,
        unborn: true,
        commits: [],
        hasMore: false,
        skip,
        limit,
      };
    }
    throw Object.assign(new Error(logRes.stderr.trim() || "git log failed."), { status: 500, code: "git-error" });
  }

  const parsed = parseCommitRecords(logRes.stdout, remotes);
  const hasMore = parsed.length > limit;
  const page = hasMore ? parsed.slice(0, limit) : parsed;

  return {
    ok: true,
    state: "ready",
    cwd,
    repoRoot,
    repoName,
    unborn: false,
    commits: page,
    hasMore,
    skip,
    limit,
  };
}

/**
 * Parse `git show --format= --first-parent -m -z --name-status -M` output.
 *
 * @param {string} stdout
 * @returns {Array<{ status: string, path: string, oldPath: string | null }>}
 */
export function parseNameStatusZ(stdout) {
  if (!stdout) return [];
  const tokens = stdout.split("\0");
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i];
    if (!code) continue;
    const kind = code[0];
    if (kind === "R" || kind === "C") {
      const oldPath = tokens[i + 1] ?? "";
      const newPath = tokens[i + 2] ?? "";
      i += 2;
      if (newPath) {
        out.push({ status: kind, path: newPath, oldPath: oldPath || null });
      }
    } else {
      const path = tokens[i + 1] ?? "";
      i += 1;
      if (path) {
        out.push({ status: kind, path, oldPath: null });
      }
    }
  }
  return out;
}

/**
 * Parse `git show --format= --first-parent -m -z --numstat -M` output into a map keyed by current file path.
 *
 * @param {string} stdout
 * @returns {Map<string, { insertions: number | null, deletions: number | null, binary: boolean }>}
 */
export function parseNumstatZ(stdout) {
  const map = new Map();
  if (!stdout) return map;
  const tokens = stdout.split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry) continue;
    const tab1 = entry.indexOf("\t");
    if (tab1 === -1) continue;
    const tab2 = entry.indexOf("\t", tab1 + 1);
    if (tab2 === -1) continue;

    const addStr = entry.slice(0, tab1);
    const delStr = entry.slice(tab1 + 1, tab2);
    const restPath = entry.slice(tab2 + 1);

    let filePath = restPath;
    if (restPath === "") {
      // Rename or copy emits empty third tab field followed by `oldPath\0newPath\0`.
      const newPath = tokens[i + 2] ?? "";
      filePath = newPath;
      i += 2;
    }

    if (!filePath) continue;
    const binary = addStr === "-" && delStr === "-";
    map.set(filePath, {
      insertions: binary ? null : Number(addStr) || 0,
      deletions: binary ? null : Number(delStr) || 0,
      binary,
    });
  }
  return map;
}

/**
 * Load full commit metadata and changed files list for a commit hash.
 *
 * @param {string | undefined} rawCwd
 * @param {string | undefined} hash
 * @param {{ timeoutMs?: number }} [options]
 */
export async function getCommitDetail(rawCwd, hash, options = {}) {
  if (!isValidCommitHash(hash)) {
    throw Object.assign(new Error("Invalid commit hash."), { status: 400, code: "bad-request" });
  }
  const repo = await resolveRepository(rawCwd, options);
  if (repo.state !== "ready") return repo;

  const { repoRoot, repoName, cwd } = repo;
  const verified = await runGit(repoRoot, ["rev-parse", "--verify", `${hash}^{commit}`], options);
  if (verified.exitCode !== 0) {
    throw Object.assign(new Error(`Commit not found: ${hash}`), { status: 404, code: "not-found" });
  }
  const oid = verified.stdout.trim();

  const [remotes, metaRes, statusRes, numstatRes] = await Promise.all([
    listRemotes(repoRoot, options),
    runGit(repoRoot, ["log", "-n", "1", "-z", `--format=${DETAIL_FORMAT}`, oid], options),
    runGit(repoRoot, ["show", "--format=", "--first-parent", "-m", "-z", "--name-status", "-M", oid], options),
    runGit(repoRoot, ["show", "--format=", "--first-parent", "-m", "-z", "--numstat", "-M", oid], options),
  ]);

  if (metaRes.exitCode !== 0 || !metaRes.stdout) {
    throw Object.assign(new Error(metaRes.stderr.trim() || "Failed to read commit metadata."), { status: 500, code: "git-error" });
  }

  const fields = metaRes.stdout.split("\0");
  const parents = (fields[2] ?? "").split(/\s+/).filter(Boolean);
  const nameEntries = parseNameStatusZ(statusRes.exitCode === 0 ? statusRes.stdout : "");
  const statsMap = parseNumstatZ(numstatRes.exitCode === 0 ? numstatRes.stdout : "");

  const filesTruncated = nameEntries.length > MAX_DETAIL_FILES;
  const limited = filesTruncated ? nameEntries.slice(0, MAX_DETAIL_FILES) : nameEntries;
  const files = limited.map((item) => {
    const stat = statsMap.get(item.path);
    return {
      status: item.status,
      path: item.path,
      oldPath: item.oldPath,
      insertions: stat ? stat.insertions : 0,
      deletions: stat ? stat.deletions : 0,
      binary: stat ? stat.binary : false,
    };
  });

  return {
    ok: true,
    state: "ready",
    cwd,
    repoRoot,
    repoName,
    commit: {
      hash: fields[0] ?? oid,
      shortHash: fields[1] ?? oid.slice(0, 7),
      parents,
      authorName: fields[3] ?? "",
      authorEmail: fields[4] ?? "",
      authorTime: Number(fields[5]) || 0,
      committerName: fields[6] ?? "",
      committerEmail: fields[7] ?? "",
      commitTime: Number(fields[8]) || 0,
      decorations: parseDecorations(fields[9] ?? "", remotes),
      subject: fields[10] ?? "",
      body: (fields[11] ?? "").replace(/\r?\n+$/, ""),
      isMerge: parents.length > 1,
    },
    files,
    filesTruncated,
    totalFiles: nameEntries.length,
  };
}

/**
 * Load bounded unified diff for one changed file inside a commit.
 *
 * @param {string | undefined} rawCwd
 * @param {string | undefined} hash
 * @param {string | undefined} filePath
 * @param {{ oldPath?: string, maxDiffBytes?: number, timeoutMs?: number }} [options]
 */
export async function getFileDiff(rawCwd, hash, filePath, options = {}) {
  if (!isValidCommitHash(hash)) {
    throw Object.assign(new Error("Invalid commit hash."), { status: 400, code: "bad-request" });
  }
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")) {
    throw Object.assign(new Error("A valid repository-relative file path is required."), { status: 400, code: "bad-request" });
  }
  const repo = await resolveRepository(rawCwd, options);
  if (repo.state !== "ready") return repo;

  const { repoRoot, cwd } = repo;
  const verified = await runGit(repoRoot, ["rev-parse", "--verify", `${hash}^{commit}`], options);
  if (verified.exitCode !== 0) {
    throw Object.assign(new Error(`Commit not found: ${hash}`), { status: 404, code: "not-found" });
  }
  const oid = verified.stdout.trim();
  const maxBytes = Number.isFinite(options.maxDiffBytes) && options.maxDiffBytes > 0
    ? options.maxDiffBytes
    : DEFAULT_MAX_DIFF_BYTES;

  const pathArgs = [filePath];
  if (typeof options.oldPath === "string" && options.oldPath !== "" && !options.oldPath.includes("\0")) {
    pathArgs.push(options.oldPath);
  }

  const diffRes = await runGit(
    repoRoot,
    ["show", "--format=", "--first-parent", "-m", "-p", "--no-ext-diff", "-M", "--unified=3", oid, "--", ...pathArgs],
    { timeoutMs: options.timeoutMs, maxBytes, truncateAtLimit: true },
  );

  // If truncated, runGit killed child after hitting maxBytes, so signal/exitCode can be SIGTERM.
  if (!diffRes.truncated && diffRes.exitCode !== 0) {
    throw Object.assign(new Error(diffRes.stderr.trim() || "Failed to load file diff."), { status: 500, code: "git-error" });
  }

  let patch = diffRes.stdout;
  if (diffRes.truncated) {
    const lastNl = patch.lastIndexOf("\n");
    if (lastNl > 0) patch = patch.slice(0, lastNl + 1);
  }

  const binary = /^(?:Binary files .* differ|GIT binary patch)$/m.test(patch);
  const lines = binary ? [] : parseUnifiedDiff(patch);

  return {
    ok: true,
    state: "ready",
    cwd,
    repoRoot,
    hash: oid,
    path: filePath,
    binary,
    truncated: diffRes.truncated,
    patch,
    lines,
  };
}
