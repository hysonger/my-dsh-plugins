import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { apply as hostApply } from "../index.js";
import { buildBundleText } from "../scripts/build-client.mjs";
import {
  computePopoverPosition,
  pickSubagentSelection,
  resolveEffortLabel,
  resolveLocalizedText,
  resolveModelDisplay,
} from "../src/client/model-info.js";

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return fs.readFileSync(path.join(PLUGIN_DIR, relPath), "utf8");
}

function readJson(relPath) {
  return JSON.parse(read(relPath));
}

function createMinimalReactMock() {
  let activeInstance = null;

  function ensureState() {
    if (!activeInstance) {
      return { hooks: [], idx: 0, effects: [] };
    }
    return activeInstance;
  }

  function renderWithInstance(Component, props, existing) {
    const inst = existing ?? { hooks: [], idx: 0, effects: [], cleanups: [] };
    inst.idx = 0;
    inst.effects = [];
    const prev = activeInstance;
    activeInstance = inst;
    try {
      const tree = Component(props);
      return { tree, instance: inst };
    } finally {
      activeInstance = prev;
    }
  }

  function flushEffects(inst) {
    for (const cleanup of inst.cleanups.splice(0)) {
      if (typeof cleanup === "function") cleanup();
    }
    for (const fn of inst.effects) {
      const cleanup = fn();
      if (typeof cleanup === "function") inst.cleanups.push(cleanup);
    }
    inst.effects = [];
  }

  function useState(initial) {
    const st = ensureState();
    const i = st.idx++;
    if (!(i in st.hooks)) {
      st.hooks[i] = typeof initial === "function" ? initial() : initial;
    }
    const setState = (next) => {
      st.hooks[i] = typeof next === "function" ? next(st.hooks[i]) : next;
    };
    return [st.hooks[i], setState];
  }

  function useRef(initial) {
    const st = ensureState();
    const i = st.idx++;
    if (!(i in st.hooks)) st.hooks[i] = { current: initial };
    return st.hooks[i];
  }

  function useMemo(factory) {
    const st = ensureState();
    const i = st.idx++;
    if (!(i in st.hooks)) st.hooks[i] = factory();
    return st.hooks[i];
  }

  function useCallback(fn) {
    return fn;
  }

  function useEffect(fn) {
    const st = ensureState();
    st.effects.push(fn);
  }

  function useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot();
  }

  function useId() {
    return "sam-test-id";
  }

  function createElement(type, props, ...children) {
    const flatChildren = children
      .flat(Infinity)
      .filter((c) => c !== false && c !== null && c !== undefined);
    const nextProps = { ...(props ?? {}) };
    if (flatChildren.length === 1) {
      nextProps.children = flatChildren[0];
    } else if (flatChildren.length > 1) {
      nextProps.children = flatChildren;
    }
    return { type, props: nextProps };
  }

  return {
    renderWithInstance,
    flushEffects,
    useState,
    useRef,
    useMemo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    useSyncExternalStore,
    useId,
    createElement,
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

function collectText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  return collectText(node.props?.children);
}

test("manifest, locales, cordis.patch.yml, host entry, and generated bundle match", () => {
  assert.equal(typeof hostApply, "function");
  assert.doesNotThrow(() => hostApply({}));

  const pkg = readJson("package.json");
  assert.equal(pkg.name, "dsh-plugin-subagent-model");
  assert.equal(pkg.exports["./client"], "./lib/client.js");
  assert.equal(pkg.dsh?.client?.platform, "web");
  assert.equal(pkg.dsh?.client?.immediately, true);
  assert.ok(pkg.dsh?.client?.inject?.includes("@deepseek-ai/dsh-client-ui-model-selection"));

  const patchText = read("cordis.patch.yml");
  assert.match(patchText, /id:\s*subagent-model/);
  assert.match(patchText, /name:\s*dsh-plugin-subagent-model/);

  const enMeta = readJson("locale/en.json");
  const zhMeta = readJson("locale/zh.json");
  assert.ok(enMeta.meta?.title && enMeta.meta?.description);
  assert.ok(zhMeta.meta?.title && zhMeta.meta?.description);

  assert.equal(read("lib/client.js"), buildBundleText());
});

test("model-info helpers prioritize lastUsed, resolve catalog/efforts cleanly, and position popovers", () => {
  assert.deepEqual(pickSubagentSelection(null), { selection: null, source: "none" });
  assert.deepEqual(
    pickSubagentSelection({
      lastUsed: { provider: "deepseek-account", model: "deepseek-reasoner", reasoningEffort: "high" },
      next: { provider: "openai", model: "gpt-4o" },
    }),
    {
      selection: { provider: "deepseek-account", model: "deepseek-reasoner", reasoningEffort: "high" },
      source: "lastUsed",
    },
  );
  assert.deepEqual(
    pickSubagentSelection({
      lastUsed: null,
      next: { provider: "deepseek-account", model: "deepseek-chat" },
    }),
    {
      selection: { provider: "deepseek-account", model: "deepseek-chat" },
      source: "next",
    },
  );

  const t = (key) => ({
    "provider.account": "DeepSeek 账号",
    "effort.providerDefault": "默认",
    "trigger.pending": "模型加载中...",
  }[key] ?? key);

  const catalogGroups = [
    {
      id: "deepseek-account",
      name: "deepseek-account",
      models: [
        {
          id: "deepseek-reasoner",
          name: "DeepSeek Reasoner",
          badge: { tone: "info", text: { en: "Reasoning", "zh-CN": "深度思考" } },
          reasoning: {
            defaultEffort: "medium",
            efforts: [
              { id: "medium", name: "Medium" },
              { id: "high", name: "High" },
            ],
          },
        },
        {
          id: "deepseek-chat",
          name: "DeepSeek Chat",
          reasoning: {
            efforts: [{ id: "high", name: "High" }],
          },
        },
      ],
    },
  ];

  // Full catalog match with explicit effort
  const resolved = resolveModelDisplay({
    projection: {
      lastUsed: { provider: "deepseek-account", model: "deepseek-reasoner", reasoningEffort: "high" },
      next: null,
    },
    groups: catalogGroups,
    running: false,
    t,
    resolveText: (dict) => dict["zh-CN"],
  });
  assert.equal(resolved.visible, true);
  assert.equal(resolved.providerName, "DeepSeek 账号");
  assert.equal(resolved.modelName, "DeepSeek Reasoner");
  assert.deepEqual(resolved.badge, { tone: "info", text: "深度思考" });
  assert.equal(resolved.effortLabel, "High");
  assert.equal(resolved.inCatalog, true);

  // Provider default when model has reasoning metadata without defaultEffort or explicit choice
  const defaultEffort = resolveModelDisplay({
    projection: { lastUsed: { provider: "deepseek-account", model: "deepseek-chat" }, next: null },
    groups: catalogGroups,
    running: false,
    t,
  });
  assert.equal(defaultEffort.effortLabel, "默认");

  // Unknown/retired model not in current catalog falls back to raw IDs + explicit effort
  const fallbackDisplay = resolveModelDisplay({
    projection: { lastUsed: { provider: "custom", model: "claude-opus-4", reasoningEffort: "max" }, next: null },
    groups: catalogGroups,
    running: false,
    t,
  });
  assert.equal(fallbackDisplay.providerName, "custom");
  assert.equal(fallbackDisplay.modelName, "claude-opus-4");
  assert.equal(fallbackDisplay.effortLabel, "max");
  assert.equal(fallbackDisplay.inCatalog, false);

  // Running before first request shows pending; idle with no selection hides
  assert.equal(resolveModelDisplay({ projection: { lastUsed: null, next: null }, groups: [], running: true, t }).pending, true);
  assert.equal(resolveModelDisplay({ projection: { lastUsed: null, next: null }, groups: [], running: false, t }).visible, false);

  // Effort helper and localized fallback
  assert.equal(resolveEffortLabel({ reasoning: undefined, reasoningEffort: undefined, t }), undefined);
  assert.equal(resolveLocalizedText({ en: "Beta" }), "Beta");

  // Popover positioning prefers above; flips below when cramped at top
  assert.deepEqual(
    computePopoverPosition({ top: 500, bottom: 528, left: 600, right: 740 }, { width: 1000, height: 700 }, { width: 260, height: 160 }),
    { top: 332, left: 480 },
  );
  assert.deepEqual(
    computePopoverPosition({ top: 40, bottom: 68, left: 600, right: 740 }, { width: 1000, height: 700 }, { width: 260, height: 160 }),
    { top: 76, left: 480 },
  );
});

test("client bundle registers slot cleanly, gates root vs subagent sessions, toggles popover, and cleans up styles", () => {
  const bundleCode = read("lib/client.js");
  const reactMock = createMinimalReactMock();
  const requiredAliases = [];
  let loadedEntry = null;

  const appendedStyles = [];
  const docListeners = new Map();
  const winListeners = new Map();
  const fakeBody = { nodeType: 1 };

  const fakeDocument = {
    body: fakeBody,
    documentElement: { lang: "en" },
    head: {
      querySelector: () => appendedStyles.find((s) => s.attrs["data-plugin"] === "dsh-plugin-subagent-model") ?? null,
      appendChild(el) {
        appendedStyles.push(el);
      },
    },
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
    addEventListener(type, fn) {
      docListeners.set(type, fn);
    },
    removeEventListener(type) {
      docListeners.delete(type);
    },
  };

  const sandbox = {
    window: {
      innerWidth: 1024,
      innerHeight: 768,
      __ModuleLoader__: {
        load(entry) {
          loadedEntry = entry;
        },
      },
      addEventListener(type, fn) {
        winListeners.set(type, fn);
      },
      removeEventListener(type) {
        winListeners.delete(type);
      },
    },
    document: fakeDocument,
    Error,
    Promise,
    Object,
    Array,
    Math,
  };

  vm.runInNewContext(bundleCode, sandbox);
  assert.equal(loadedEntry?.id, "dsh-plugin-subagent-model");

  const portaledNodes = [];
  const reactDomMock = {
    createPortal(node, target) {
      const portal = { type: "__PORTAL__", props: { children: node, target } };
      portaledNodes.push(portal);
      return portal;
    },
  };

  const moduleExports = loadedEntry.factory((alias) => {
    requiredAliases.push(alias);
    if (alias === "react") return reactMock;
    if (alias === "react-dom") return reactDomMock;
    throw new Error(`Unexpected require: ${alias}`);
  });

  assert.deepEqual(requiredAliases, ["react", "react-dom"]);
  assert.deepEqual(Array.from(moduleExports.inject), ["slots", "locale", "sessions"]);
  assert.equal(typeof moduleExports.apply, "function");

  const disposers = [];
  const registeredLocales = {};
  const registeredSlots = [];
  let directoryLoadCalled = 0;

  const catalogGroups = [
    {
      id: "glm",
      name: "GLM Coding Plan",
      models: [
        {
          id: "glm-5",
          name: "GLM-5",
          badge: { tone: "accent", text: { en: "New", zh: "新" } },
          reasoning: {
            defaultEffort: "high",
            efforts: [{ id: "high", name: "High" }],
          },
        },
      ],
    },
  ];

  const subagentAddresses = {
    "root-session": undefined,
    "sub-session-1": { parentSessionId: "root-session", mode: "continuable" },
  };

  const mockCtx = {
    effect(fn) {
      const d = fn();
      if (typeof d === "function") disposers.push(d);
    },
    locale: {
      register(ns, dicts) {
        registeredLocales[ns] = dicts;
        return () => {};
      },
      resolveText(text) {
        return typeof text === "string" ? text : text.en;
      },
    },
    sessions: {
      subagentAddress(sessionId) {
        return subagentAddresses[sessionId];
      },
    },
    get(name) {
      if (name === "modelDirectories") {
        return {
          directoryFor(sessionId) {
            if (sessionId === "root-session") {
              throw new Error("Should never inspect directory for root session");
            }
            return {
              store: {
                subscribe: () => () => {},
                getSnapshot: () => ({ groups: catalogGroups, status: "ready" }),
              },
              load() {
                directoryLoadCalled += 1;
              },
            };
          },
        };
      }
      if (name === "remote") return null;
      return undefined;
    },
    slots: {
      inject(_name, factory) {
        return factory();
      },
      register(meta, component) {
        registeredSlots.push({ meta, component });
        return () => {};
      },
    },
  };

  moduleExports.apply(mockCtx);

  // Verify styles and locale dictionaries
  assert.equal(appendedStyles.length, 1);
  assert.match(appendedStyles[0].textContent, /\.dsh-sam-trigger/);

  const dicts = registeredLocales.subagentModel;
  assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort());

  const panelSrc = read("src/client/panel.js") + "\n" + read("src/client/model-info.js");
  for (const match of panelSrc.matchAll(/\b(?:t|translate)\("([a-zA-Z0-9_.]+)"/g)) {
    const key = match[1];
    assert.ok(key in dicts.en, `Missing en locale key: ${key}`);
    assert.ok(key in dicts.zh, `Missing zh locale key: ${key}`);
  }

  assert.equal(registeredSlots.length, 1);
  const slot = registeredSlots[0];
  assert.equal(slot.meta.name, "conversation.input.right");
  assert.equal(slot.meta.id, "subagent-model");
  assert.equal(slot.meta.order, 200);
  assert.equal(slot.meta.locale, "subagentModel");

  const tEn = (key) => dicts.en[key] ?? key;

  // Root session returns null without calling directoryFor
  const rootTree = slot.component({
    sessionId: "root-session",
    useProjection: () => ({ lastUsed: { provider: "glm", model: "glm-5" }, next: null }),
    useSession: () => false,
    t: tEn,
  });
  assert.equal(rootTree, null);

  // Continuable subagent renders indicator wrapping element
  const subWrapper = slot.component({
    sessionId: "sub-session-1",
    useProjection: () => ({ lastUsed: { provider: "glm", model: "glm-5" }, next: null }),
    useSession: () => false,
    t: tEn,
  });
  assert.ok(subWrapper && typeof subWrapper.type === "function");

  const Indicator = subWrapper.type;
  const { tree: rendered1, instance } = reactMock.renderWithInstance(Indicator, subWrapper.props);
  reactMock.flushEffects(instance);

  assert.equal(directoryLoadCalled, 0, "must never call directory.load() on a subagent");
  const buttons = collectNodes(rendered1, (n) => n.type === "button");
  assert.equal(buttons.length, 1);
  assert.match(collectText(buttons[0]), /NewGLM-5High/);
  assert.equal(buttons[0].props["aria-label"], "Subagent model (read-only): GLM-5 · High");
  assert.equal(buttons[0].props["aria-expanded"], false);

  // Toggle open -> renders portaled dialog
  buttons[0].props.onClick();
  const { tree: rendered2 } = reactMock.renderWithInstance(Indicator, subWrapper.props, instance);
  reactMock.flushEffects(instance);

  const buttonsOpen = collectNodes(rendered2, (n) => n.type === "button");
  assert.equal(buttonsOpen[0].props["aria-expanded"], true);
  assert.equal(portaledNodes.length, 1);
  assert.equal(portaledNodes[0].props.target, fakeBody);

  const dialogs = collectNodes(rendered2, (n) => n.type === "div" && n.props?.role === "dialog");
  assert.equal(dialogs.length, 1);
  const dialogText = collectText(dialogs[0]);
  assert.match(dialogText, /GLM Coding Plan/);
  assert.match(dialogText, /GLM-5/);
  assert.match(dialogText, /glm-5/);
  assert.match(dialogText, /High/);
  assert.match(dialogText, /Read-only/);

  // Outside click closes popover
  docListeners.get("mousedown")({ target: fakeBody });
  const { tree: renderedClosed } = reactMock.renderWithInstance(Indicator, subWrapper.props, instance);
  assert.equal(collectNodes(renderedClosed, (n) => n.props?.role === "dialog").length, 0);

  // Re-open then Escape key dismisses popover
  reactMock.flushEffects(instance);
  collectNodes(renderedClosed, (n) => n.type === "button")[0].props.onClick();
  reactMock.renderWithInstance(Indicator, subWrapper.props, instance);
  reactMock.flushEffects(instance);
  docListeners.get("keydown")({ key: "Escape", preventDefault() {} });
  const { tree: rendered3 } = reactMock.renderWithInstance(Indicator, subWrapper.props, instance);
  assert.equal(collectNodes(rendered3, (n) => n.props?.role === "dialog").length, 0);

  // Cleanup removes injected style element
  for (const dispose of disposers) dispose();
  assert.equal(appendedStyles.length, 0);
});

test("passive remote.session.modelCatalog fallback resolves names when directory has empty groups", async () => {
  const bundleCode = read("lib/client.js");
  const reactMock = createMinimalReactMock();
  let loadedEntry = null;
  const fakeDocument = {
    body: { nodeType: 1 },
    documentElement: { lang: "en" },
    head: { querySelector: () => null, appendChild() {} },
    createElement: () => ({ attrs: {}, setAttribute() {}, remove() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  const sandbox = {
    window: {
      innerWidth: 1024,
      innerHeight: 768,
      __ModuleLoader__: { load(entry) { loadedEntry = entry; } },
      addEventListener() {},
      removeEventListener() {},
    },
    document: fakeDocument,
    Error,
    Promise,
    Object,
    Array,
    Math,
  };
  vm.runInNewContext(bundleCode, sandbox);
  const moduleExports = loadedEntry.factory((alias) => {
    if (alias === "react") return reactMock;
    if (alias === "react-dom") return { createPortal: (node) => node };
    throw new Error(`Unexpected require: ${alias}`);
  });

  let slotEntry = null;
  let remoteCalls = 0;
  moduleExports.apply({
    effect() {},
    locale: { register: () => () => {} },
    sessions: { subagentAddress: () => ({ parentSessionId: "r", mode: "continuable" }) },
    get(name) {
      if (name === "modelDirectories") return undefined;
      if (name === "remote") {
        return {
          session: {
            async modelCatalog() {
              remoteCalls += 1;
              return {
                ok: true,
                value: {
                  groups: [
                    {
                      id: "openai",
                      name: "OpenAI",
                      models: [{ id: "gpt-5", name: "GPT-5" }],
                    },
                  ],
                },
              };
            },
          },
        };
      }
      return undefined;
    },
    slots: {
      inject: (_name, fn) => fn(),
      register(_meta, component) {
        slotEntry = component;
        return () => {};
      },
    },
  });

  const wrapper = slotEntry({
    sessionId: "sub-passive",
    useProjection: () => ({ lastUsed: { provider: "openai", model: "gpt-5" }, next: null }),
    useSession: () => false,
    t: (k) => k,
  });
  const Indicator = wrapper.type;
  const r1 = reactMock.renderWithInstance(Indicator, wrapper.props);
  assert.match(collectText(r1.tree), /gpt-5/);
  reactMock.flushEffects(r1.instance);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(remoteCalls, 1);

  const r2 = reactMock.renderWithInstance(Indicator, wrapper.props, r1.instance);
  assert.match(collectText(r2.tree), /GPT-5/);
});
