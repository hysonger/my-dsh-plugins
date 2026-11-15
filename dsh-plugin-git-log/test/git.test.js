import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ALL_REFS_SENTINEL,
  buildSessionFileAddress,
  computeCommitGraph,
  parseDecorations,
  parseUnifiedDiff,
} from "../src/shared/protocol.js";
import {
  getCommitDetail,
  getCommits,
  getFileDiff,
  getOverview,
  isSafeRefSyntax,
  isValidCommitHash,
  parseStatusSummary,
} from "../src/host/git.js";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix = "dsh-git-log-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function gitSync(cwd, args, envExtra = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: envExtra.GIT_AUTHOR_NAME ?? "Alice Developer",
      GIT_AUTHOR_EMAIL: envExtra.GIT_AUTHOR_EMAIL ?? "alice@example.com",
      GIT_COMMITTER_NAME: envExtra.GIT_COMMITTER_NAME ?? "Alice Developer",
      GIT_COMMITTER_EMAIL: envExtra.GIT_COMMITTER_EMAIL ?? "alice@example.com",
      GIT_AUTHOR_DATE: envExtra.GIT_AUTHOR_DATE ?? "2026-10-01T10:00:00Z",
      GIT_COMMITTER_DATE: envExtra.GIT_COMMITTER_DATE ?? "2026-10-01T10:00:00Z",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "0",
      LC_ALL: "C",
    },
  }).trim();
}

test("pure protocol parsers handle decorations, file addresses, diffs and graph lanes", () => {
  const decs = parseDecorations("HEAD -> main, tag: v1.2.0, origin/main, feat/ui", ["origin"]);
  assert.deepEqual(
    decs.map((d) => [d.kind, d.label]),
    [
      ["head", "main"],
      ["tag", "v1.2.0"],
      ["remote", "origin/main"],
      ["branch", "feat/ui"],
    ],
  );

  assert.equal(
    buildSessionFileAddress("sess-1", "src/测试 file.js"),
    "dsh-resource://file/session/sess-1/src/%E6%B5%8B%E8%AF%95%20file.js",
  );

  const patch = [
    "diff --git a/a.txt b/a.txt",
    "index 111..222 100644",
    "--- a/a.txt",
    "+++ b/a.txt",
    "@@ -1,3 +1,3 @@",
    " keep",
    "-old",
    "+new",
    " tail",
    "\\ No newline at end of file",
  ].join("\n");
  const lines = parseUnifiedDiff(patch);
  assert.equal(lines.find((l) => l.type === "del")?.oldLine, 2);
  assert.equal(lines.find((l) => l.type === "add")?.newLine, 2);
  assert.equal(lines[lines.length - 1].type, "meta");

  // DAG: merge commit c4 (parents c2, c3) -> c3 forked off c1 -> c2 -> c1
  const graph = computeCommitGraph([
    { hash: "c4", parents: ["c2", "c3"] },
    { hash: "c3", parents: ["c1"] },
    { hash: "c2", parents: ["c1"] },
    { hash: "c1", parents: [] },
  ]);
  assert.equal(graph.maxLanes, 2);
  assert.equal(graph.rows[0].isMerge, true);
  assert.equal(graph.rows[0].outEdges.length, 2);
  assert.equal(graph.rows[2].outEdges[0].toCol, 1);
  assert.equal(graph.rows[3].isRoot, true);
  assert.equal(graph.rows[3].inEdges.length, 1);
});

test("input validators and status summary handle invalid inputs safely", () => {
  assert.equal(isValidCommitHash("deadbeef"), true);
  assert.equal(isValidCommitHash("abc"), false);
  assert.equal(isValidCommitHash("--version"), false);

  assert.equal(isSafeRefSyntax("main"), true);
  assert.equal(isSafeRefSyntax("feat/sub-branch"), true);
  assert.equal(isSafeRefSyntax("-n"), false);
  assert.equal(isSafeRefSyntax("a..b"), false);
  assert.equal(isSafeRefSyntax("branch@{0}"), false);
  assert.equal(isSafeRefSyntax("a\nb"), false);

  const summary = parseStatusSummary("M  staged.js\0 M unstaged.js\0?? new.txt\0R  old.txt\0new.txt\0");
  assert.deepEqual(summary, {
    dirty: true,
    staged: 2,
    modified: 1,
    untracked: 1,
    conflicted: 0,
    total: 4,
  });
});

test("getOverview and getCommits handle no-workspace, missing dir, non-git, and unborn repo", async () => {
  assert.deepEqual(await getOverview(undefined), { ok: true, state: "no-workspace" });

  const nonExistent = join(tmpdir(), `missing-${Date.now()}-${Math.random()}`);
  assert.equal((await getOverview(nonExistent)).state, "dir-missing");

  const plainDir = makeTempDir("plain-");
  assert.equal((await getOverview(plainDir)).state, "not-git");

  await assert.rejects(() => getOverview("relative/path"), /absolute/);

  const unbornRepo = makeTempDir("unborn-");
  gitSync(unbornRepo, ["init", "-b", "main"]);
  const unbornOverview = await getOverview(unbornRepo);
  assert.equal(unbornOverview.state, "ready");
  assert.equal(unbornOverview.head.unborn, true);
  assert.equal(unbornOverview.head.branch, "main");

  const unbornLog = await getCommits(unbornRepo);
  assert.equal(unbornLog.unborn, true);
  assert.deepEqual(unbornLog.commits, []);
});

test("real git repo: root commit, unicode paths, rename, merge, branches, tags, search, pagination, diff & truncation", async () => {
  const repo = makeTempDir("repo-");
  gitSync(repo, ["init", "-b", "main"]);

  // 1. Root commit with multi-line body & CJK file
  writeFileSync(join(repo, "hello.txt"), "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\n");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "docs/中文说明.md"), "# 标题\n初始内容\n");
  gitSync(repo, ["add", "."]);
  gitSync(repo, ["commit", "-m", "chore: initial commit", "-m", "Detailed body line 1\nBody line 2 with 'quotes' and \"double quotes\"."], {
    GIT_AUTHOR_DATE: "2026-10-01T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-10-01T10:00:00Z",
  });
  const c1 = gitSync(repo, ["rev-parse", "HEAD"]);

  // 2. Branch off main -> feature commit by Bob
  gitSync(repo, ["checkout", "-b", "feat/search-ui"]);
  writeFileSync(join(repo, "feature.txt"), "feature line 1\nfeature line 2\n");
  gitSync(repo, ["add", "feature.txt"]);
  gitSync(repo, ["commit", "-m", "feat: add search bar"], {
    GIT_AUTHOR_NAME: "Bob Reviewer",
    GIT_AUTHOR_EMAIL: "bob@example.com",
    GIT_COMMITTER_NAME: "Bob Reviewer",
    GIT_COMMITTER_EMAIL: "bob@example.com",
    GIT_AUTHOR_DATE: "2026-10-02T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-10-02T10:00:00Z",
  });
  const cFeat = gitSync(repo, ["rev-parse", "HEAD"]);

  // 3. Back to main -> rename + modify + binary asset
  gitSync(repo, ["checkout", "main"]);
  gitSync(repo, ["mv", "hello.txt", "greeting.txt"]);
  writeFileSync(join(repo, "greeting.txt"), "line 1\nline TWO\nline 3\nline 4\nline 5\nline 6\nline 7\n");
  writeFileSync(join(repo, "icon.bin"), Buffer.from([0, 1, 2, 3, 255, 0, 10]));
  gitSync(repo, ["add", "."]);
  gitSync(repo, ["commit", "-m", "refactor: rename hello to greeting"], {
    GIT_AUTHOR_DATE: "2026-10-03T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-10-03T10:00:00Z",
  });
  const cRename = gitSync(repo, ["rev-parse", "HEAD"]);

  // 4. Merge feature branch & tag it
  gitSync(repo, ["merge", "--no-ff", "feat/search-ui", "-m", "merge: integrate feat/search-ui"], {
    GIT_AUTHOR_DATE: "2026-10-04T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-10-04T10:00:00Z",
  });
  const cMerge = gitSync(repo, ["rev-parse", "HEAD"]);
  gitSync(repo, ["tag", "v0.1.0", cMerge]);

  // 5. Large file commit to test diff truncation
  const bigLines = Array.from({ length: 400 }, (_, i) => `const row_${i} = "${"x".repeat(40)}";`).join("\n") + "\n";
  writeFileSync(join(repo, "big.js"), bigLines);
  gitSync(repo, ["add", "big.js"]);
  gitSync(repo, ["commit", "-m", "perf: large generated file"], {
    GIT_AUTHOR_DATE: "2026-10-05T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-10-05T10:00:00Z",
  });
  const cBig = gitSync(repo, ["rev-parse", "HEAD"]);

  // Make working tree dirty
  writeFileSync(join(repo, "untracked.tmp"), "dirty");

  // Overview checks
  const overview = await getOverview(repo);
  assert.equal(overview.state, "ready");
  assert.equal(overview.head.branch, "main");
  assert.equal(overview.head.detached, false);
  assert.equal(overview.status.dirty, true);
  assert.equal(overview.status.untracked, 1);
  assert.ok(overview.branches.some((b) => b.name === "main" && b.current));
  assert.ok(overview.branches.some((b) => b.name === "feat/search-ui"));
  assert.ok(overview.tags.some((t) => t.name === "v0.1.0"));

  // Pagination checks (total 5 commits reachable from HEAD)
  const page1 = await getCommits(repo, { limit: 2, skip: 0 });
  assert.equal(page1.commits.length, 2);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.commits[0].hash, cBig);
  assert.equal(page1.commits[1].hash, cMerge);
  assert.equal(page1.commits[1].isMerge, true);

  const page2 = await getCommits(repo, { limit: 2, skip: 2 });
  assert.equal(page2.commits.length, 2);
  assert.equal(page2.hasMore, true);

  const page3 = await getCommits(repo, { limit: 2, skip: 4 });
  assert.equal(page3.commits.length, 1);
  assert.equal(page3.hasMore, false);
  assert.equal(page3.commits[0].hash, c1);

  // Branch filter (--all & feature branch)
  const allRes = await getCommits(repo, { ref: ALL_REFS_SENTINEL });
  assert.equal(allRes.commits.length, 5);
  const featOnly = await getCommits(repo, { ref: "feat/search-ui" });
  assert.equal(featOnly.commits.length, 2);
  assert.equal(featOnly.commits[0].hash, cFeat);

  // Ref injection rejected
  await assert.rejects(() => getCommits(repo, { ref: "--upload-pack=evil" }), { status: 400 });

  // Search scopes: all, message, author, path, hash prefix
  const searchMsg = await getCommits(repo, { query: "search bar", scope: "message" });
  assert.equal(searchMsg.commits.length, 1);
  assert.equal(searchMsg.commits[0].hash, cFeat);

  const searchAuthor = await getCommits(repo, { query: "Bob", scope: "author" });
  assert.equal(searchAuthor.commits.length, 1);
  assert.equal(searchAuthor.commits[0].hash, cFeat);

  const searchPath = await getCommits(repo, { query: "docs/中文说明.md", scope: "path" });
  assert.equal(searchPath.commits.length, 1);
  assert.equal(searchPath.commits[0].hash, c1);

  const searchAllByHash = await getCommits(repo, { query: cRename.slice(0, 8), scope: "all" });
  assert.equal(searchAllByHash.commits.length, 1);
  assert.equal(searchAllByHash.commits[0].hash, cRename);

  // Root commit detail (files populated!)
  const rootDetail = await getCommitDetail(repo, c1);
  assert.match(rootDetail.commit.body, /Detailed body line 1/);
  assert.ok(rootDetail.files.some((f) => f.path === "docs/中文说明.md" && f.status === "A"));

  // Rename + binary commit detail
  const renameDetail = await getCommitDetail(repo, cRename);
  const renamedFile = renameDetail.files.find((f) => f.path === "greeting.txt");
  assert.equal(renamedFile?.status, "R");
  assert.equal(renamedFile?.oldPath, "hello.txt");
  const binFile = renameDetail.files.find((f) => f.path === "icon.bin");
  assert.equal(binFile?.binary, true);

  // Merge commit detail
  const mergeDetail = await getCommitDetail(repo, cMerge);
  assert.equal(mergeDetail.commit.isMerge, true);
  assert.ok(mergeDetail.files.some((f) => f.path === "feature.txt"));

  // File diff text, binary, and size truncation
  const textDiff = await getFileDiff(repo, cRename, "greeting.txt", { oldPath: "hello.txt" });
  assert.equal(textDiff.binary, false);
  assert.equal(textDiff.truncated, false);
  assert.ok(textDiff.lines.some((l) => l.type === "del" && l.text === "line 2"));
  assert.ok(textDiff.lines.some((l) => l.type === "add" && l.text === "line TWO"));

  const binDiff = await getFileDiff(repo, cRename, "icon.bin");
  assert.equal(binDiff.binary, true);

  const truncDiff = await getFileDiff(repo, cBig, "big.js", { maxDiffBytes: 1200 });
  assert.equal(truncDiff.truncated, true);
  assert.ok(Buffer.byteLength(truncDiff.patch, "utf8") <= 1200);
});
