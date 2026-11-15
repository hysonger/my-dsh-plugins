import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { buildBundleText } from "../scripts/build-client.mjs";
import pluginHost, { Config, apply as applyHost, inject as hostInject } from "../lib/index.js";
import { COMMITS_PATH, OVERVIEW_PATH } from "../src/shared/protocol.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("manifest, locale metadata, cordis patch, icon, and generated client bundle stay in sync", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "dsh-plugin-git-log");
  assert.equal(pkg.dsh?.client?.platform, "web");
  assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
  assert.equal(pkg.exports?.["."]?.default, "./lib/index.js");
  assert.equal(pkg.exports?.["./client"]?.default, "./lib/client.js");

  const zhMeta = JSON.parse(read("locale/zh.json"));
  const enMeta = JSON.parse(read("locale/en.json"));
  assert.ok(zhMeta.meta?.title && zhMeta.meta?.description);
  assert.ok(enMeta.meta?.title && enMeta.meta?.description);

  const patchText = read("cordis.patch.yml");
  assert.match(patchText, /name:\s*'dsh-plugin-git-log'/);
  assert.match(read("icon.svg"), /<svg[^>]+viewBox="0 0 64 64"/);

  const { protocolCopy, bundle } = buildBundleText();
  assert.equal(read("src/client/protocol-copy.js"), protocolCopy, "src/client/protocol-copy.js drifted; run npm run build");
  assert.equal(read("lib/client.js"), bundle, "lib/client.js drifted; run npm run build");
});

test("host Config schema validates defaults and bounds, and apply registers web routes", () => {
  assert.deepEqual(Config(undefined), {
    allowRemote: false,
    maxPageSize: 50,
    maxDiffBytes: 262144,
    commandTimeoutMs: 10000,
  });
  assert.equal(Config["~standard"].validate({ maxPageSize: 25 }).value.maxPageSize, 25);
  assert.ok(Config["~standard"].validate({ maxPageSize: 999 }).issues?.length > 0);
  assert.ok(Config["~standard"].validate({ allowRemote: "yes" }).issues?.length > 0);
  assert.deepEqual(hostInject, ["webServer"]);
  assert.equal(pluginHost.name, "git-log");

  const registeredPaths = [];
  const cleanups = [];
  const mockCtx = {
    webServer: {
      register(spec) {
        registeredPaths.push(spec.path);
        return () => {};
      },
    },
    logger: () => ({ info() {} }),
    effect(fn) {
      cleanups.push(fn());
    },
  };
  applyHost(mockCtx, {});
  assert.ok(registeredPaths.includes(OVERVIEW_PATH));
  assert.ok(registeredPaths.includes(COMMITS_PATH));
  for (const dispose of cleanups) dispose?.();
});

function createMinimalReactMock() {
  const hookValues = [];
  const pendingEffects = [];
  let cursor = 0;
  return {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children } };
    },
    Fragment: Symbol("Fragment"),
    useState(init) {
      const idx = cursor++;
      if (!(idx in hookValues)) {
        hookValues[idx] = typeof init === "function" ? init() : init;
      }
      return [hookValues[idx], (next) => { hookValues[idx] = typeof next === "function" ? next(hookValues[idx]) : next; }];
    },
    useRef(init) {
      const idx = cursor++;
      if (!(idx in hookValues)) hookValues[idx] = { current: init };
      return hookValues[idx];
    },
    useCallback(fn) {
      return fn;
    },
    useMemo(fn) {
      return fn();
    },
    useEffect(fn, deps) {
      const idx = cursor++;
      const prev = hookValues[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        hookValues[idx] = { deps: deps ?? [], cleanup: prev?.cleanup };
        pendingEffects.push({ idx, fn });
      }
    },
    useSyncExternalStore(_sub, getSnap) {
      return getSnap();
    },
    resetCursor() {
      cursor = 0;
    },
    flushEffects() {
      while (pendingEffects.length > 0) {
        const eff = pendingEffects.shift();
        hookValues[eff.idx]?.cleanup?.();
        const cleanup = eff.fn();
        if (hookValues[eff.idx]) hookValues[eff.idx].cleanup = typeof cleanup === "function" ? cleanup : undefined;
      }
    },
  };
}

function collectNodes(node, predicate, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  if (node.props?.children) collectNodes(node.props.children, predicate, out);
  return out;
}

function collectTreeText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectTreeText).join("");
  if (typeof node.type === "function") {
    return collectTreeText(node.type(node.props ?? {}));
  }
  return collectTreeText(node.props?.children);
}

test("client bundle obeys DSH __ModuleLoader__ contract, registers sidebar tab & shortcut, and renders states cleanly", () => {
  const bundleCode = read("lib/client.js");
  const reactMock = createMinimalReactMock();
  const requiredAliases = [];
  let loadedEntry = null;

  const appendedStyles = [];
  const headEl = {
    querySelector: () => appendedStyles.find((s) => s.attrs["data-plugin"] === "dsh-plugin-git-log") ?? null,
    appendChild(el) {
      appendedStyles.push(el);
    },
  };
  const fakeDocument = {
    head: headEl,
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        attrs: {},
        textContent: "",
        setAttribute(k, v) { el.attrs[k] = v; },
        remove() {
          const i = appendedStyles.indexOf(el);
          if (i !== -1) appendedStyles.splice(i, 1);
        },
      };
      return el;
    },
  };

  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(entry) {
          loadedEntry = entry;
        },
      },
      addEventListener() {},
      removeEventListener() {},
    },
    document: fakeDocument,
    URLSearchParams,
    Date,
    Set,
    Map,
    Error,
    setTimeout,
    clearTimeout,
    AbortController,
  };

  vm.runInNewContext(bundleCode, sandbox);
  assert.equal(loadedEntry?.id, "dsh-plugin-git-log");

  const moduleExports = loadedEntry.factory((alias) => {
    requiredAliases.push(alias);
    if (alias === "react") return reactMock;
    throw new Error(`Unexpected require alias: ${alias}`);
  });

  assert.deepEqual(requiredAliases, ["react"]);
  assert.ok(Array.isArray(moduleExports.inject));
  assert.equal(typeof moduleExports.apply, "function");

  const disposers = [];
  const tabDefinitions = [];
  const registeredSlots = [];
  const registeredShortcuts = [];
  const registeredLocales = {};
  const openedTabs = [];
  const hiddenTabs = [];

  const mockCtx = {
    effect(fn) {
      const d = fn();
      if (typeof d === "function") disposers.push(d);
    },
    inject(services, cb) {
      if (services.includes("shortcuts")) {
        cb({
          shortcuts: {
            register(def) {
              registeredShortcuts.push(def);
              return () => {};
            },
          },
          effect(fn) {
            const d = fn();
            if (typeof d === "function") disposers.push(d);
          },
        });
      }
    },
    locale: {
      register(ns, dicts) {
        registeredLocales[ns] = dicts;
        return () => {};
      },
      bind(ns) {
        return (key) => registeredLocales[ns]?.en?.[key] ?? key;
      },
    },
    sidebarRightTabs: {
      register(def) {
        tabDefinitions.push(def);
        return () => {};
      },
    },
    sidebarRight: {
      commandTarget(el) {
        return el?.dataset?.session ? { host: "dock", sessionId: el.dataset.session } : undefined;
      },
      openTabFromTarget(kind, target) {
        openedTabs.push({ kind, target });
      },
      openTab(kind) {
        openedTabs.push({ kind });
      },
      tabsIn(sessionId) {
        return sessionId === "s1" ? [{ id: "tab-1", kind: "git-log" }] : [];
      },
      hide(tabId) {
        hiddenTabs.push(tabId);
      },
    },
    slots: {
      inject(name, factory) {
        return factory();
      },
      register(meta, component) {
        registeredSlots.push({ meta, component });
        return () => {};
      },
    },
  };

  moduleExports.apply(mockCtx);

  // Verify style tag injected cleanly
  assert.equal(appendedStyles.length, 1);
  assert.match(appendedStyles[0].textContent, /\.dsh-gl-root/);

  // Verify zh & en dictionary parity
  const dicts = registeredLocales.gitLog;
  assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort());

  // Check every t("...") key literal used in src/client/panel.js exists in both locales
  const panelSrc = read("src/client/panel.js");
  for (const match of panelSrc.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)) {
    const key = match[1];
    assert.ok(key in dicts.en, `Missing en locale key: ${key}`);
    assert.ok(key in dicts.zh, `Missing zh locale key: ${key}`);
  }

  // Verify tab definition + guide entry
  assert.equal(tabDefinitions.length, 1);
  assert.equal(tabDefinitions[0].id, "dsh-plugin-git-log");
  assert.equal(tabDefinitions[0].kind, "git-log");
  assert.equal(tabDefinitions[0].guide[0].commandId, "workspace.gitLog");

  // Verify slots registered
  const bodySlot = registeredSlots.find((s) => s.meta.name === "sidebar.right.pane.tab");
  const titleSlot = registeredSlots.find((s) => s.meta.name === "sidebar.right.pane.tab.title");
  const filesActionSlot = registeredSlots.find((s) => s.meta.name === "sidebar.right.tab.files.actions");
  const headerActionSlot = registeredSlots.find((s) => s.meta.name === "conversation.session.header.utilities");
  assert.ok(bodySlot && titleSlot && filesActionSlot && headerActionSlot);
  assert.equal(headerActionSlot.meta.id, "git-log");
  assert.equal(headerActionSlot.meta.order, 0);

  // Verify shortcut command behavior
  assert.equal(registeredShortcuts.length, 1);
  const shortcut = registeredShortcuts[0];
  assert.equal(shortcut.id, "workspace.gitLog");
  assert.equal(shortcut.resolve({ target: {} }).status, "blocked");
  const handled = shortcut.resolve({ target: { dataset: { session: "s1" } } });
  assert.equal(handled.status, "handled");
  handled.run();
  assert.deepEqual(openedTabs, [{ kind: "git-log", target: { host: "dock", sessionId: "s1" } }]);

  // Verify component render output for no-workspace & title & files action
  reactMock.resetCursor();
  const bodyVNode = bodySlot.component({
    sessionId: "s1",
    useTabInfo: () => ({
      tab: { id: "tab-1", title: "Git Log", visible: true, actions: { bindCommands: () => () => {}, openResource() {} } },
      panel: { id: "pane-1", isFloating: false },
    }),
    useSessions: (selector) => selector({ byId: {} }),
    t: (k) => dicts.en[k] ?? k,
  });
  assert.match(collectTreeText(bodyVNode), /No workspace directory/);

  reactMock.resetCursor();
  const titleVNode = titleSlot.component({
    useTabInfo: () => ({ tab: { id: "tab-1", title: "Git Log" } }),
  });
  assert.match(collectTreeText(titleVNode), /Git Log/);

  const filesBtnVNode = filesActionSlot.component({
    sidebarRight: mockCtx.sidebarRight,
    t: (k) => dicts.en[k] ?? k,
  });
  assert.equal(filesBtnVNode.props["data-git-log-files-action"], "true");

  // Header shortcut opens the tab, then collapses it while the tab is visible.
  reactMock.resetCursor();
  const headerVNode = headerActionSlot.component({
    sessionId: "s1",
    sidebarRight: mockCtx.sidebarRight,
    t: (k) => dicts.en[k] ?? k,
  });
  assert.equal(headerVNode.props["data-git-log-header-action"], "true");
  assert.equal(headerVNode.props["aria-pressed"], false);
  openedTabs.length = 0;
  headerVNode.props.onClick({ stopPropagation() {} });
  assert.deepEqual(openedTabs, [{ kind: "git-log" }]);

  reactMock.flushEffects();
  reactMock.resetCursor();
  const pressedHeaderVNode = headerActionSlot.component({
    sessionId: "s1",
    sidebarRight: mockCtx.sidebarRight,
    t: (k) => dicts.en[k] ?? k,
  });
  assert.equal(pressedHeaderVNode.props["aria-pressed"], true);
  hiddenTabs.length = 0;
  pressedHeaderVNode.props.onClick({ stopPropagation() {} });
  assert.deepEqual(hiddenTabs, ["tab-1"]);
  assert.equal(openedTabs.length, 1);

  // Verify cleanup removes injected stylesheet
  for (const d of disposers) d();
  assert.equal(appendedStyles.length, 0);
});

test("ready-state client flow fetches overview, commits, commit detail, and inline file diff", async () => {
  const bundleCode = read("lib/client.js");
  const reactMock = createMinimalReactMock();
  let loadedEntry = null;
  const fetchCalls = [];
  const openedResources = [];

  const sampleOverview = {
    ok: true,
    state: "ready",
    cwd: "/repo/demo",
    repoRoot: "/repo/demo",
    repoName: "demo",
    head: { branch: "main", oid: "abc1234", detached: false, unborn: false },
    status: { dirty: true, staged: 1, modified: 1, untracked: 0, conflicted: 0, total: 2 },
    branches: [{ name: "main", ref: "refs/heads/main", kind: "local", oid: "abc1234", current: true }],
    tags: [{ name: "v0.1.0", ref: "refs/tags/v0.1.0", oid: "abc1234" }],
  };
  const sampleCommits = {
    ok: true,
    state: "ready",
    commits: [
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        shortHash: "aaaaaaa",
        parents: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        authorName: "Alice",
        authorEmail: "alice@example.com",
        authorTime: Math.floor(Date.now() / 1000) - 120,
        commitTime: Math.floor(Date.now() / 1000) - 120,
        decorations: [{ kind: "head", label: "main", raw: "HEAD -> main", current: true }],
        subject: "feat: build git log panel",
        body: "",
        isMerge: false,
      },
      {
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        shortHash: "bbbbbbb",
        parents: [],
        authorName: "Alice",
        authorEmail: "alice@example.com",
        authorTime: Math.floor(Date.now() / 1000) - 3600,
        commitTime: Math.floor(Date.now() / 1000) - 3600,
        decorations: [],
        subject: "chore: init repo",
        body: "",
        isMerge: false,
      },
    ],
    hasMore: false,
  };
  const sampleDetail = {
    ok: true,
    state: "ready",
    commit: {
      ...sampleCommits.commits[0],
      committerName: "Alice",
      committerEmail: "alice@example.com",
      body: "Full body paragraph",
    },
    files: [{ status: "M", path: "src/app.js", oldPath: null, insertions: 3, deletions: 1, binary: false }],
    filesTruncated: false,
    totalFiles: 1,
  };
  const sampleDiff = {
    ok: true,
    state: "ready",
    binary: false,
    truncated: false,
    lines: [
      { type: "hunk", oldLine: null, newLine: null, text: "@@ -1,2 +1,4 @@" },
      { type: "del", oldLine: 2, newLine: null, text: "oldLine();" },
      { type: "add", oldLine: null, newLine: 2, text: "newLine();" },
    ],
  };

  const sandbox = {
    window: {
      __ModuleLoader__: { load(entry) { loadedEntry = entry; } },
      addEventListener() {},
      removeEventListener() {},
    },
    fetch: async (url, init) => {
      fetchCalls.push({ url, headers: init?.headers });
      const data = url.startsWith("/git-log/api/overview")
        ? sampleOverview
        : url.startsWith("/git-log/api/commits")
          ? sampleCommits
          : url.startsWith("/git-log/api/commit?")
            ? sampleDetail
            : sampleDiff;
      return { ok: true, status: 200, async json() { return data; } };
    },
    URLSearchParams,
    Date,
    Set,
    Map,
    Error,
    setTimeout,
    clearTimeout,
    AbortController,
  };
  vm.runInNewContext(bundleCode, sandbox);
  const exports = loadedEntry.factory(() => reactMock);

  const slots = {};
  const dicts = {};
  exports.apply({
    effect(fn) { return fn(); },
    inject() {},
    locale: {
      register(ns, d) { dicts[ns] = d; return () => {}; },
      bind(ns) { return (k) => dicts[ns]?.en?.[k] ?? k; },
    },
    sidebarRightTabs: { register() { return () => {}; } },
    sidebarRight: { commandTarget: () => undefined, openTabFromTarget() {} },
    slots: {
      inject(_name, fn) { return fn(); },
      register(meta, comp) { slots[meta.name] = comp; return () => {}; },
    },
  });

  const renderBody = () => {
    reactMock.resetCursor();
    return slots["sidebar.right.pane.tab"]({
      sessionId: "sess-1",
      useTabInfo: () => ({
        tab: {
          id: "tab-git",
          title: "Git Log",
          visible: true,
          actions: {
            bindCommands: () => () => {},
            openResource: (addr, opt) => openedResources.push({ addr, opt }),
          },
        },
        panel: { id: "pane-1", isFloating: false },
      }),
      useSessions: (sel) => sel({ byId: { "sess-1": { cwd: "/repo/demo" } } }),
      t: (k) => dicts.gitLog.en[k] ?? k,
    });
  };

  // Pass 1: mount & trigger overview fetch
  let tree = renderBody();
  reactMock.flushEffects();
  await new Promise((r) => setTimeout(r, 10));

  // Pass 2: overview ready triggers commits fetch
  tree = renderBody();
  reactMock.flushEffects();
  await new Promise((r) => setTimeout(r, 10));

  // Pass 3: commits rendered with graph SVG & branch pill in tab title
  tree = renderBody();
  reactMock.flushEffects();
  const bodyText = collectTreeText(tree);
  assert.match(bodyText, /demo/);
  assert.match(bodyText, /feat: build git log panel/);
  assert.match(bodyText, /chore: init repo/);
  assert.ok(fetchCalls.every((c) => c.headers?.["x-dsh-git-log"] === "1"));

  reactMock.resetCursor();
  const titleText = collectTreeText(
    slots["sidebar.right.pane.tab.title"]({ useTabInfo: () => ({ tab: { id: "tab-git", title: "Git Log" } }) }),
  );
  assert.match(titleText, /main/);

  // Click first commit row -> fetch commit detail
  const commitButtons = collectNodes(tree, (n) => n.type === "button" && n.props?.className?.includes("dsh-gl-commit-row"));
  assert.equal(commitButtons.length, 2);
  commitButtons[0].props.onClick();
  await new Promise((r) => setTimeout(r, 10));

  tree = renderBody();
  const detailText = collectTreeText(tree);
  assert.match(detailText, /Full body paragraph/);
  assert.match(detailText, /src\/app\.js/);

  // Click preview file button -> opens dsh-resource://file URI
  const openBtn = collectNodes(tree, (n) => n.type === "button" && n.props?.title === dicts.gitLog.en["detail.openFile"])[0];
  openBtn.props.onClick({ stopPropagation() {} });
  assert.equal(openedResources.length, 1);
  assert.equal(openedResources[0].addr, "dsh-resource://file/session/sess-1//repo/demo/src/app.js");

  // Expand file row -> loads inline diff
  const fileBtn = collectNodes(tree, (n) => n.type === "button" && n.props?.className === "dsh-gl-file-btn")[0];
  fileBtn.props.onClick();
  await new Promise((r) => setTimeout(r, 10));
  tree = renderBody();
  assert.match(collectTreeText(tree), /newLine\(\);/);
});
