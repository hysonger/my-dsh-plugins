/**
 * Shared protocol constants and pure formatting/graph utilities used by both the
 * Node host (`src/host/*`) and the browser right-sidebar client (`src/client/*`).
 *
 * `scripts/build-client.mjs` derives `src/client/protocol-copy.js` from this
 * file by stripping `export ` prefixes, so keep exports strictly in top-level
 * `export const` / `export function` form.
 *
 * @module dsh-plugin-git-log/shared/protocol
 */

export const PROTOCOL_VERSION = 1;

export const ROUTE_PREFIX = "/git-log";
export const API_PREFIX = "/git-log/api";
export const OVERVIEW_PATH = "/git-log/api/overview";
export const COMMITS_PATH = "/git-log/api/commits";
export const COMMIT_PATH = "/git-log/api/commit";
export const FILE_DIFF_PATH = "/git-log/api/file-diff";
export const HEALTH_PATH = "/git-log/api/health";

/** Custom header attached by our browser client; desktop preserves custom headers across forwarding. */
export const REQUEST_HEADER = "x-dsh-git-log";
export const REQUEST_HEADER_VALUE = "1";

/** Sentinel ref meaning `git log --all` (local + remote branches + tags). */
export const ALL_REFS_SENTINEL = "__ALL__";
export const HEAD_REF = "HEAD";

export const DEFAULT_MAX_PAGE_SIZE = 50;
export const DEFAULT_MAX_DIFF_BYTES = 262144;
export const DEFAULT_COMMAND_TIMEOUT_MS = 10000;

export const SEARCH_SCOPES = ["all", "message", "author", "path"];

/**
 * Parse a `git log` `%D` decoration string into structured badges.
 *
 * @param {string} raw
 * @param {readonly string[]} [remotes] Known remote names (e.g. `["origin"]`).
 * @returns {Array<{ kind: "head" | "branch" | "remote" | "tag", label: string, raw: string, current: boolean }>}
 */
export function parseDecorations(raw, remotes = ["origin"]) {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const remoteSet = new Set(Array.isArray(remotes) ? remotes : []);
  const out = [];
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.startsWith("HEAD -> ")) {
      const target = part.slice("HEAD -> ".length).trim();
      out.push({ kind: "head", label: target || "HEAD", raw: part, current: true });
      continue;
    }
    if (part === "HEAD") {
      out.push({ kind: "head", label: "HEAD", raw: part, current: true });
      continue;
    }
    if (part.startsWith("tag: ")) {
      const tag = part.slice("tag: ".length).trim();
      if (tag) out.push({ kind: "tag", label: tag, raw: part, current: false });
      continue;
    }
    if (part === "grafted" || part === "replaced") {
      continue;
    }
    const slashIdx = part.indexOf("/");
    const firstSeg = slashIdx === -1 ? "" : part.slice(0, slashIdx);
    const isRemote = slashIdx > 0 && (remoteSet.has(firstSeg) || part.endsWith("/HEAD"));
    out.push({
      kind: isRemote ? "remote" : "branch",
      label: part,
      raw: part,
      current: false,
    });
  }
  return out;
}

/**
 * Compute deterministic lane layout for a topologically ordered commit list.
 * Each entry describes the commit's column, passing-through lanes, incoming
 * upper connectors (`y: 0 -> H/2`), and outgoing lower connectors (`y: H/2 -> H`).
 *
 * @param {readonly Array<{ hash: string, parents?: readonly string[] }>} commits
 * @returns {{
 *   maxLanes: number,
 *   rows: Array<{
 *     col: number,
 *     colorIdx: number,
 *     isMerge: boolean,
 *     isRoot: boolean,
 *     passCols: number[],
 *     inEdges: Array<{ fromCol: number, colorIdx: number }>,
 *     outEdges: Array<{ toCol: number, colorIdx: number }>
 *   }>
 * }}
 */
export function computeCommitGraph(commits) {
  if (!Array.isArray(commits) || commits.length === 0) {
    return { maxLanes: 1, rows: [] };
  }

  /** @type {(string | null)[]} */
  let lanes = [];
  const rows = [];
  let maxLanes = 1;

  for (let rowIndex = 0; rowIndex < commits.length; rowIndex++) {
    const commit = commits[rowIndex];
    const hash = commit?.hash ?? "";
    const parents = Array.isArray(commit?.parents) ? commit.parents.filter(Boolean) : [];

    const matchingCols = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === hash) matchingCols.push(i);
    }

    let col;
    if (matchingCols.length > 0) {
      col = matchingCols[0];
    } else {
      const freeSlot = lanes.indexOf(null);
      col = freeSlot === -1 ? lanes.length : freeSlot;
      if (col === lanes.length) lanes.push(null);
    }

    const inEdges = [];
    const passCols = [];
    if (rowIndex > 0) {
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] === null) continue;
        if (lanes[i] === hash) {
          inEdges.push({ fromCol: i, colorIdx: i });
        } else {
          passCols.push(i);
        }
      }
    } else {
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] !== null && lanes[i] !== hash) {
          passCols.push(i);
        }
      }
    }

    const nextLanes = lanes.slice();
    for (const m of matchingCols) {
      nextLanes[m] = null;
    }

    const outEdges = [];
    if (parents.length > 0) {
      const firstParent = parents[0];
      const existingFirst = nextLanes.indexOf(firstParent);
      if (existingFirst !== -1) {
        outEdges.push({ toCol: existingFirst, colorIdx: col });
      } else {
        nextLanes[col] = firstParent;
        outEdges.push({ toCol: col, colorIdx: col });
      }

      for (let p = 1; p < parents.length; p++) {
        const mergeParent = parents[p];
        const existingMerge = nextLanes.indexOf(mergeParent);
        if (existingMerge !== -1) {
          outEdges.push({ toCol: existingMerge, colorIdx: existingMerge });
        } else {
          let freeSlot = nextLanes.indexOf(null);
          if (freeSlot === -1) {
            freeSlot = nextLanes.length;
            nextLanes.push(null);
          }
          nextLanes[freeSlot] = mergeParent;
          outEdges.push({ toCol: freeSlot, colorIdx: freeSlot });
        }
      }
    }

    while (nextLanes.length > 0 && nextLanes[nextLanes.length - 1] === null) {
      nextLanes.pop();
    }

    let rowWidth = col + 1;
    for (const c of passCols) rowWidth = Math.max(rowWidth, c + 1);
    for (const e of inEdges) rowWidth = Math.max(rowWidth, e.fromCol + 1);
    for (const e of outEdges) rowWidth = Math.max(rowWidth, e.toCol + 1);
    if (rowWidth > maxLanes) maxLanes = rowWidth;

    rows.push({
      col,
      colorIdx: col,
      isMerge: parents.length > 1,
      isRoot: parents.length === 0,
      passCols,
      inEdges,
      outEdges,
    });

    lanes = nextLanes;
  }

  return { maxLanes, rows };
}

/**
 * Parse a unified diff into line-numbered display rows grouped cleanly across hunks.
 *
 * @param {string} patch
 * @returns {Array<{
 *   type: "hunk" | "add" | "del" | "context" | "meta",
 *   oldLine: number | null,
 *   newLine: number | null,
 *   text: string
 * }>}
 */
export function parseUnifiedDiff(patch) {
  if (typeof patch !== "string" || patch === "") return [];
  const rawLines = patch.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }

  const lines = [];
  let inHunk = false;
  let oldNum = 0;
  let newNum = 0;

  for (const line of rawLines) {
    if (line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        inHunk = true;
        oldNum = Number(match[1]);
        newNum = Number(match[2]);
        lines.push({ type: "hunk", oldLine: null, newLine: null, text: line });
        continue;
      }
    }

    if (!inHunk) {
      if (
        line.startsWith("diff --git ") ||
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("new file mode") ||
        line.startsWith("deleted file mode") ||
        line.startsWith("rename from ") ||
        line.startsWith("rename to ") ||
        line.startsWith("similarity index ") ||
        line.startsWith("copy from ") ||
        line.startsWith("copy to ") ||
        line.startsWith("Binary files ")
      ) {
        lines.push({ type: "meta", oldLine: null, newLine: null, text: line });
      }
      continue;
    }

    if (line.startsWith("+")) {
      lines.push({ type: "add", oldLine: null, newLine: newNum, text: line.slice(1) });
      newNum += 1;
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", oldLine: oldNum, newLine: null, text: line.slice(1) });
      oldNum += 1;
    } else if (line.startsWith("\\")) {
      lines.push({ type: "meta", oldLine: null, newLine: null, text: line });
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      lines.push({ type: "context", oldLine: oldNum, newLine: newNum, text: content });
      oldNum += 1;
      newNum += 1;
    }
  }

  return lines;
}

/**
 * Build a `dsh-resource://file/session/<sessionId>/<path>` address matching
 * DSH's workspace file resource grammar.
 *
 * @param {string} sessionId
 * @param {string} filePath
 * @returns {string}
 */
export function buildSessionFileAddress(sessionId, filePath) {
  const encodeSegment = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ":");
  const normalized = String(filePath).replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  const encodedPath = normalized.split("/").map(encodeSegment).join("/");
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${encodedPath}`;
}
