import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  COMMITS_PATH,
  COMMIT_PATH,
  FILE_DIFF_PATH,
  HEALTH_PATH,
  OVERVIEW_PATH,
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
} from "../src/shared/protocol.js";
import { registerRoutes } from "../src/host/routes.js";

const cleanupHooks = [];
after(async () => {
  for (const fn of cleanupHooks) {
    await fn();
  }
});

function createFakeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "dsh-gl-routes-"));
  cleanupHooks.push(() => rmSync(dir, { recursive: true, force: true }));
  const run = (args) => execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Tester",
      GIT_AUTHOR_EMAIL: "tester@example.com",
      GIT_COMMITTER_NAME: "Tester",
      GIT_COMMITTER_EMAIL: "tester@example.com",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "0",
      LC_ALL: "C",
    },
  }).trim();
  run(["init", "-b", "main"]);
  writeFileSync(join(dir, "index.js"), "console.log(1);\n");
  run(["add", "."]);
  run(["commit", "-m", "init repo"]);
  const oid = run(["rev-parse", "HEAD"]);
  return { dir, oid };
}

function createRouteHarness(routeOptions = {}) {
  const exactRoutes = new Map();
  const webServer = {
    register(spec) {
      if (spec.kind === "exact") {
        exactRoutes.set(spec.path, spec.handler);
        return () => exactRoutes.delete(spec.path);
      }
      return () => {};
    },
  };
  const dispose = registerRoutes(webServer, {
    version: "0.1.0",
    ...routeOptions,
  });
  cleanupHooks.push(() => dispose());

  async function invoke(method, urlPath, headers = {}, remoteAddress = "127.0.0.1") {
    const pathname = new URL(urlPath, "http://127.0.0.1").pathname;
    const handler = exactRoutes.get(pathname);
    assert.ok(handler, `No registered route for ${pathname}`);
    return await new Promise((resolve) => {
      let statusCode = 0;
      const resHeaders = {};
      const req = {
        method,
        url: urlPath,
        socket: { remoteAddress },
        headers: { host: "127.0.0.1:4321", ...headers },
      };
      const res = {
        writeHead(code, hdrs = {}) {
          statusCode = code;
          for (const [k, v] of Object.entries(hdrs)) {
            resHeaders[k.toLowerCase()] = String(v);
          }
        },
        end(chunk) {
          const text = chunk === undefined || chunk === null ? "" : String(chunk);
          resolve({
            status: statusCode,
            headers: resHeaders,
            text,
            json: text ? JSON.parse(text) : null,
          });
        },
      };
      void handler(req, res);
    });
  }

  return { invoke, handlers: exactRoutes };
}

test("routes serve overview, commits, commit detail, and file diff end-to-end", async () => {
  const { dir, oid } = createFakeRepo();
  const { invoke } = createRouteHarness({
    resolveSessionCwd: async (id) => (id === "sess-99" ? dir : undefined),
  });

  const healthRes = await invoke("GET", HEALTH_PATH);
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.json.ok, true);
  assert.equal(healthRes.json.version, "0.1.0");

  // Missing custom header is blocked on data routes.
  const noHdr = await invoke("GET", `${OVERVIEW_PATH}?cwd=${encodeURIComponent(dir)}`);
  assert.equal(noHdr.status, 403);

  const headers = { [REQUEST_HEADER]: REQUEST_HEADER_VALUE };

  // Session fallback resolves cwd when omitted.
  const ovRes = await invoke("GET", `${OVERVIEW_PATH}?sessionId=sess-99`, headers);
  assert.equal(ovRes.status, 200);
  assert.equal(ovRes.json.state, "ready");
  assert.equal(ovRes.json.head.branch, "main");

  const commitsRes = await invoke("GET", `${COMMITS_PATH}?cwd=${encodeURIComponent(dir)}`, headers);
  assert.equal(commitsRes.status, 200);
  assert.equal(commitsRes.json.commits.length, 1);
  assert.equal(commitsRes.json.commits[0].hash, oid);

  const detailRes = await invoke("GET", `${COMMIT_PATH}?cwd=${encodeURIComponent(dir)}&hash=${oid}`, headers);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.json.files[0].path, "index.js");

  const diffRes = await invoke(
    "GET",
    `${FILE_DIFF_PATH}?cwd=${encodeURIComponent(dir)}&hash=${oid}&path=index.js`,
    headers,
  );
  assert.equal(diffRes.status, 200);
  assert.ok(diffRes.json.lines.some((l) => l.type === "add" && l.text === "console.log(1);"));

  // Validation errors return 400
  const badLimit = await invoke("GET", `${COMMITS_PATH}?cwd=${encodeURIComponent(dir)}&limit=0`, headers);
  assert.equal(badLimit.status, 400);

  // HEAD request succeeds without body.
  const headRes = await invoke("HEAD", HEALTH_PATH);
  assert.equal(headRes.status, 200);
  assert.equal(headRes.text, "");

  // POST rejected cleanly with 405.
  const postRes = await invoke("POST", OVERVIEW_PATH, headers);
  assert.equal(postRes.status, 405);
  assert.equal(postRes.headers.allow, "GET, HEAD");
});

test("security fences reject remote peers, DNS rebinding Host, cross-site headers, and foreign Origin", async () => {
  let remoteAllowed = false;
  const { invoke } = createRouteHarness({
    allowRemote: () => remoteAllowed,
  });

  // 1. Remote peer blocked by default
  assert.equal((await invoke("GET", HEALTH_PATH, {}, "10.0.0.5")).status, 403);

  // 2. Host DNS rebinding blocked when !allowRemote
  assert.equal((await invoke("GET", HEALTH_PATH, { host: "attacker.example:4321" })).status, 403);

  // 3. Sec-Fetch-Site: cross-site blocked
  assert.equal(
    (await invoke("GET", HEALTH_PATH, { host: "127.0.0.1:4321", "sec-fetch-site": "cross-site" })).status,
    403,
  );

  // 4. Foreign or opaque Origin blocked, while dsh-app://app and same-host http:// are allowed
  assert.equal(
    (await invoke("GET", HEALTH_PATH, { host: "127.0.0.1:4321", origin: "https://evil.com" })).status,
    403,
  );
  assert.equal(
    (await invoke("GET", HEALTH_PATH, { host: "127.0.0.1:4321", origin: "null" })).status,
    403,
  );
  assert.equal(
    (await invoke("GET", HEALTH_PATH, { host: "127.0.0.1:4321", origin: "dsh-app://app" })).status,
    200,
  );
  assert.equal(
    (await invoke("GET", HEALTH_PATH, { host: "127.0.0.1:4321", origin: "http://127.0.0.1:4321" })).status,
    200,
  );

  // 5. allowRemote: true admits non-loopback peer with matching Host/Origin
  remoteAllowed = true;
  assert.equal(
    (await invoke(
      "GET",
      HEALTH_PATH,
      { host: "dsh.internal:8080", origin: "https://dsh.internal:8080" },
      "10.0.0.5",
    )).status,
    200,
  );
});

test("optional DSH connection.requestRejection enforces 401/403 before route handling", async () => {
  const { invoke } = createRouteHarness({
    requestRejection: (req) => (req.headers.authorization === "bad" ? 401 : undefined),
  });
  assert.equal((await invoke("GET", HEALTH_PATH, { authorization: "bad" })).status, 401);
  assert.equal((await invoke("GET", HEALTH_PATH, {})).status, 200);
});
