/**
 * Static and behavioural checks for the browser half of dsh-plugin-usage-board.
 *
 * Run with `node --test test/client-bundle.test.js` (or `npm test`).
 *
 * There is no bundler in this package, so `lib/client.js` is assembled by
 * hand from `src/client/protocol-copy.js`, `src/client/panel.js` and
 * `src/client/styles.css`. These tests are what keeps that assembly honest:
 * they re-derive the shared protocol declarations and assert the copy and the
 * bundle still carry them verbatim, then execute the bundle in a VM to check
 * the DSH client-module contract and the registration it performs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

import { createPricingSnapshot } from "../src/host/pricing.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

const sharedSource = read("src/shared/protocol.js");
const copySource = read("src/client/protocol-copy.js");
const panelSource = read("src/client/panel.js");
const styleSource = read("src/client/styles.css");
const bundleSource = read("lib/client.js");
const dashboardSource = read("src/host/web/dashboard.html");
const manifest = JSON.parse(read("package.json"));

const BUNDLE_ID = "dsh-plugin-usage-board";
const NS = "usageBoard";
const PANEL_ID = "usage-board";

/** Module aliases the shell's frozen platform table answers for every bundle. */
const PLATFORM_ALIASES = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
];

/** Every alias this bundle may legally require: platform seed + manifest entries. */
function allowedAliases() {
  const client = manifest.dsh?.client ?? {};
  return new Set([...PLATFORM_ALIASES, ...(client.inject ?? []), ...(client.external ?? [])]);
}

/**
 * Pull one declaration (with the JSDoc block directly above it) out of a module
 * and drop the `export` keyword, which is the only difference the browser copy
 * is allowed to have.
 * @param {string[]} lines
 * @param {string} name
 * @returns {string}
 */
function extractDeclaration(lines, name) {
  const head = new RegExp(`^export (const|function) ${name}\\b`);
  const index = lines.findIndex((line) => head.test(line));
  assert.notEqual(index, -1, `src/shared/protocol.js no longer declares ${name}`);
  let start = index;
  let above = index - 1;
  while (above >= 0 && lines[above].trim() === "") above--;
  if (above >= 0 && lines[above].trim().endsWith("*/")) {
    let cursor = above;
    while (cursor >= 0 && !lines[cursor].trim().startsWith("/**")) cursor--;
    if (cursor >= 0) start = cursor;
  }
  let end = index;
  if (lines[index].startsWith("export function")) {
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor] !== "}") cursor++;
    assert.ok(cursor < lines.length, `unterminated declaration ${name}`);
    end = cursor;
  }
  const block = lines.slice(start, end + 1);
  block[index - start] = block[index - start].replace(/^export /, "");
  return block.join("\n");
}

/** Names the browser copy must mirror, in the shared module's own order. */
const SHARED_DECLARATIONS = [
  "PROTOCOL_VERSION",
  "PROVIDER_IDS",
  "QUOTA_PROVIDER_IDS",
  "SNAPSHOT_PATH",
  "REFRESH_PATH",
  "ROUTE_PREFIX",
  "MAX_DAILY_USAGE_DAYS",
  "makeDailyUsage",
  "makeWindow",
  "makeBalance",
  "makeProvider",
  "makeSnapshot",
  "round1",
  "percentOf",
];

/**
 * Stub modules for the two aliases the bundle requires; the factory only needs
 * their shape, since components are defined rather than rendered here.
 */
function stubModules() {
  const neverCalled = (name) => () => {
    throw new Error(`${name} was called while loading the bundle`);
  };
  return {
    react: {
      useState: neverCalled("useState"),
      useEffect: neverCalled("useEffect"),
      useRef: neverCalled("useRef"),
      useCallback: neverCalled("useCallback"),
    },
    "react/jsx-runtime": {
      jsx: neverCalled("jsx"),
      jsxs: neverCalled("jsxs"),
      Fragment: Symbol("Fragment"),
    },
  };
}

/**
 * Execute lib/client.js in a VM the way DSH's module loader does, and hand back
 * the registration plus the materialized module exports.
 * @returns {{ registration: object, exports: object, requires: string[] }}
 */
function loadBundle() {
  let registration = null;
  const window = {
    __ModuleLoader__: {
      load(entry) {
        assert.equal(registration, null, "the bundle registered twice");
        registration = entry;
      },
    },
  };
  const context = vm.createContext({ window, console });
  new vm.Script(bundleSource, { filename: "lib/client.js" }).runInContext(context);
  assert.ok(registration !== null, "the bundle never called window.__ModuleLoader__.load");
  assert.equal(typeof registration.factory, "function", "factory must be a function");
  const modules = stubModules();
  const requires = [];
  const exports = registration.factory((specifier) => {
    requires.push(specifier);
    assert.ok(
      Object.prototype.hasOwnProperty.call(modules, specifier),
      `the bundle required an unexpected alias: ${specifier}`,
    );
    return modules[specifier];
  });
  return { registration, exports, requires };
}

/**
 * Minimal stand-in for the Cordis context: `effect` runs its callback
 * immediately (as Cordis does), and the locale service really translates, so a
 * wrong namespace or a one-language dictionary fails the test.
 * @returns {object} ctx plus test handles.
 */
function makeContext() {
  const state = { locale: "zh", dictionaries: new Map(), effects: [], injects: [], registrations: [] };
  const interpolate = (text, params) =>
    text.replace(/\{(\w+)\}/g, (match, key) =>
      params !== undefined && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match);
  const translate = (ns, key, params) => {
    const dictionary = state.dictionaries.get(ns);
    const table = dictionary === undefined ? undefined : dictionary[state.locale];
    const value = table !== undefined && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
    return interpolate(String(value), params);
  };
  const ctx = {
    state,
    effect(callback, label) {
      const disposer = callback();
      state.effects.push({ disposer, label });
      return () => {
        if (typeof disposer === "function") disposer();
      };
    },
    locale: {
      register(ns, dictionary) {
        state.dictionaries.set(ns, dictionary);
        return () => {};
      },
      bind(ns) {
        return (key, params) => translate(ns, key, params);
      },
    },
    slots: {
      inject(name, register) {
        const entry = { name, register };
        state.injects.push(entry);
        return () => {};
      },
      register(options, component) {
        const entry = { options, component };
        state.registrations.push(entry);
        return entry;
      },
    },
  };
  return ctx;
}

/**
 * Load the panel body in its own VM scope with the protocol helpers beside it,
 * so the pure formatting and normalization functions become testable.
 * @returns {object} the panel's internal helpers.
 */
function loadPanelUnit() {
  // Element stubs that record instead of rendering: this loader is for the pure
  // helpers, but a component may still be invoked through it (the icon).
  const createElement = (type, props) => (typeof type === "function" ? type(props ?? {}) : { type: String(type), props: props ?? {} });
  const context = vm.createContext({
    react: stubModules().react,
    jsxRuntime: { jsx: createElement, jsxs: createElement, Fragment: "Fragment" },
    console,
  });
  const exposure = [
    "\n;globalThis.__ub = {",
    "  formatMoney, formatPercent, formatAmount, clamp, clampTtl, truncate,",
    "  relativeTime, resetText, windowLabel, statusTone, statusKey,",
    "  normalizeWindow, normalizeBalance, normalizeProvider, normalizeSnapshot,",
    "  describeFailure, collectHosts, translateOf, bindPanelTranslate,",
    "  providerTrend, trendScale, asErrorLike, DAILY_TREND_POINTS,",
    "  normalizePricing, pricingStateAt, pricingWhen, pricingCalendarCaveat,",
    "  providerPricing, PricingReminder, PRICING_PHASES,",
    "  providerMessage, derivedPercentOf,",
    "  UsageBoardPanel, UsageBoardPanelIcon, zh, en,",
    "};",
  ].join("\n");
  new vm.Script(copySource + "\n" + panelSource + exposure, { filename: "panel-body.js" }).runInContext(context);
  return context.__ub;
}

/** A `t` seat over one flat dictionary, matching ctx.locale's echo-the-key fallback. */
function translateSeat(table) {
  return (key, params) =>
    String(
      Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key,
    ).replace(/\{(\w+)\}/g, (match, name) =>
      params !== undefined && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
}

/** Deep-copy a value out of the VM realm so strict deep-equality compares shapes, not realms. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Depth-first walk over the plain element tree the render harness builds. */
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node === "object" && node.props !== undefined) {
    visit(node);
    walk(node.props.children, visit);
  }
}

/** Every visible text node in the tree, joined for substring assertions. */
function treeText(tree) {
  const parts = [];
  walk(tree, (node) => {
    const children = node.props.children;
    if (typeof children === "string" || typeof children === "number") parts.push(String(children));
  });
  return parts.join(" | ");
}

/** First element carrying `className`, or null. */
function findByClass(tree, className) {
  let found = null;
  walk(tree, (node) => {
    const value = node.props.className;
    if (found === null && typeof value === "string" && value.split(" ").includes(className)) found = node;
  });
  return found;
}

/**
 * A stand-in for React: enough of the hook contract to mount UsageBoardPanel,
 * resolve fetches, advance fake timers, and hand back the element tree it
 * renders. The point is to exercise the branches a live host cannot produce on
 * demand — an empty card, a non-ok provider, a failed request, a stale answer,
 * a restored cache, a broken sessionStorage.
 * @param {object} [options] ok/status/body/reject for the fetch stub, `hold` to
 *   leave the request pending, `storage` to install a sessionStorage stand-in
 *   (pass `null` for "no storage at all", or a throwing stub), `browser` to add
 *   a fake `document`, IntersectionObserver and clock so the auto-refresh gate
 *   becomes drivable, `now` to freeze the clock at an instant (the billing
 *   reminder renders from `Date.now()`, so its tests need a chosen moment).
 * @returns {object} mount/settle/advance plus the request log and the storage.
 */
function createRenderer(options = {}) {
  const slots = {};
  const effectState = new Map();
  const dirtyEffects = new Set();
  const intervals = [];
  const requests = [];
  const store = new Map();
  let hookIndex = 0;
  let dirty = false;
  let tree = null;
  let nowMs = typeof options.now === "number" ? options.now : 0;
  let timerSeq = 0;
  let renderCount = 0;
  let intervalSeq = 0;
  const timers = new Map();
  let pending = null;
  const ioSink = makeIntersectionObserverSink();
  const fakeDocument = makeFakeDocument();
  let payload = {
    ok: options.ok !== false,
    status: options.status ?? 200,
    body: options.body,
    reject: options.reject === true,
    hold: options.hold === true,
  };

  // A real-enough sessionStorage: the panel must work with one, without one,
  // and with one that throws.
  const storage = options.storage === undefined
    ? {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, String(value));
      },
      removeItem: (key) => {
        store.delete(key);
      },
    }
    : options.storage;

  const react = {
    useState(initial) {
      const key = "s" + String(hookIndex++);
      if (!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial;
      return [slots[key], (next) => {
        slots[key] = typeof next === "function" ? next(slots[key]) : next;
        dirty = true;
      }];
    },
    useRef(initial) {
      const key = "r" + String(hookIndex++);
      if (!(key in slots)) slots[key] = { current: initial };
      return slots[key];
    },
    // Memoised the way React is for `[]` deps, which is every call site in the
    // panel: the FIRST closure wins, so effect dependency arrays see a stable
    // identity across renders instead of re-firing on every draw.
    useCallback(callback) {
      const key = "c" + String(hookIndex++);
      if (!(key in slots)) slots[key] = callback;
      return slots[key];
    },
    useEffect(callback, deps) {
      const key = "e" + String(hookIndex++);
      const depList = Array.isArray(deps) ? deps.slice() : null;
      const previous = effectState.get(key);
      const changed = previous === undefined
        || depList === null
        || previous.deps === null
        || depList.length !== previous.deps.length
        || depList.some((value, index) => !Object.is(value, previous.deps[index]));
      if (changed) {
        if (previous !== undefined && typeof previous.cleanup === "function") previous.cleanup();
        effectState.set(key, { deps: depList, cleanup: undefined, callback: callback });
        dirtyEffects.add(key);
      }
    },
  };
  const createElement = (type, props) => {
    const next = props === undefined || props === null ? {} : props;
    if (typeof type === "function") return type(next);
    const element = { type: String(type), props: next };
    // React attaches host refs at commit time; emulate that so the gate's
    // IntersectionObserver sees a non-null root. The fake element stands in
    // for the DOM node — the gate only checks presence and observes it.
    if (next.ref !== undefined && next.ref !== null && typeof next.ref === "object") {
      next.ref.current = element;
    }
    return element;
  };
  const context = vm.createContext({
    react,
    jsxRuntime: { jsx: createElement, jsxs: createElement, Fragment: "Fragment" },
    fetch(url, init) {
      requests.push({ url: String(url), method: init !== undefined && init.method ? init.method : "GET" });
      if (payload.reject === true) return Promise.reject(new TypeError("Failed to fetch"));
      if (payload.hold === true) {
        return new Promise((resolve) => {
          pending = () => resolve({
            ok: payload.ok,
            status: payload.status,
            json: () => Promise.resolve(payload.body),
          });
        });
      }
      return Promise.resolve({
        ok: payload.ok,
        status: payload.status,
        json: () => Promise.resolve(payload.body),
      });
    },
    AbortController: function AbortController() {
      this.signal = {};
      this.abort = () => {};
    },
    // A deterministic timer queue: the panel's stale follow-up can be fired by
    // advancing time instead of waiting on it. Intervals are RECORDED, never
    // auto-fired — the gate tests trigger them by hand at chosen moments.
    setTimeout: (callback, delay) => {
      const id = ++timerSeq;
      timers.set(id, { callback, at: nowMs + (typeof delay === "number" ? delay : 0) });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    setInterval: (callback, delay) => {
      const id = ++intervalSeq;
      intervals.push({ id, delay, callback });
      return id;
    },
    clearInterval: (id) => {
      const index = intervals.findIndex((entry) => entry.id === id);
      if (index !== -1) intervals.splice(index, 1);
    },
    console,
  });
  if (options.browser === true || typeof options.now === "number") {
    // The gate reads Date.now() for idleness and the billing reminder reads it
    // for the countdown; freeze now() to the harness clock so both are
    // drivable, while keeping a real constructor for `new Date(...)`.
    class HarnessDate extends Date {
      static now() {
        return nowMs;
      }
    }
    context.Date = HarnessDate;
  }
  if (options.browser === true) {
    context.document = fakeDocument;
    context.IntersectionObserver = ioSink.klass;
  }
  if (options.storage === null) {
    // Deliberately leave `sessionStorage` undefined in the VM global.
  } else {
    context.sessionStorage = storage;
  }
  new vm.Script(copySource + "\n" + panelSource + "\n;globalThis.__ub = { UsageBoardPanel, zh, en };", {
    filename: "panel-render.js",
  }).runInContext(context);
  const translate = translateSeat(context.__ub.zh);

  /** Run every effect whose dependencies changed during the latest render. */
  const flushEffects = () => {
    if (dirtyEffects.size === 0) return;
    const keys = [...dirtyEffects];
    dirtyEffects.clear();
    for (const key of keys) {
      const entry = effectState.get(key);
      if (entry === undefined) continue;
      entry.cleanup = entry.callback();
    }
  };

  const draw = () => {
    hookIndex = 0;
    dirty = false;
    renderCount += 1;
    tree = context.__ub.UsageBoardPanel({ t: translate });
    flushEffects();
    return tree;
  };

  return {
    requests,
    storage,
    /** The key the panel is expected to use; asserted rather than hard-coded twice. */
    storeKey: "usage-board:snapshot:v1",
    document: fakeDocument,
    observers: ioSink.observers,
    get renderCount() {
      return renderCount;
    },
    /** Fire every live interval registered with exactly `delay` (ms). */
    fireInterval(delay) {
      for (const entry of [...intervals]) {
        if (entry.delay === delay) entry.callback();
      }
    },
    /** Deliver a DOM event through the fake document's listener registry. */
    fire(type) {
      fakeDocument.fire(type);
    },
    setPayload(next) {
      payload = { ...payload, ...next };
    },
    /** Release a request started with `hold: true`. */
    release() {
      const resolve = pending;
      pending = null;
      if (resolve !== undefined) resolve();
    },
    /** Mount without letting anything settle: this is the first painted frame. */
    mount() {
      return draw();
    },
    /** Flush microtasks and re-render until the tree stops changing. */
    async settle(passes = 6) {
      for (let pass = 0; pass < passes; pass += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (dirty) draw();
      }
      return tree;
    },
    /** Fire every fake timer due within `ms`, then settle. */
    async advance(ms) {
      const until = nowMs + ms;
      let guard = 0;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0 || guard > 50) break;
        guard += 1;
        const [id, timer] = due[0];
        timers.delete(id);
        nowMs = timer.at;
        timer.callback();
        await this.settle(3);
      }
      nowMs = until;
      return this.settle(3);
    },
    /** Mount, let the fetch settle, and render again with the resulting state. */
    async render() {
      this.mount();
      return this.settle();
    },
  };
}

/**
 * Fake IntersectionObserver whose instances the test can drive by hand. Real
 * observers report asynchronously; here the test decides the moment and the
 * value, which is what makes "panel hidden by the sidebar" reproducible.
 * @returns {{ klass: Function, observers: Array<object> }}
 */
function makeIntersectionObserverSink() {
  const observers = [];
  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target) {
      this.observed.push(target);
    }
    disconnect() {
      this.disconnected = true;
    }
    emit(isIntersecting) {
      this.callback([{ isIntersecting }]);
    }
  }
  return { klass: FakeIntersectionObserver, observers };
}

/**
 * A document stub that records listeners so a test can fire visibility and
 * activity events in order, and a mutable visibilityState.
 * @returns {object} addEventListener/removeEventListener/fire/visibilityState.
 */
function makeFakeDocument() {
  const listeners = new Map();
  return {
    visibilityState: "visible",
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type);
      if (list === undefined) return;
      const index = list.indexOf(handler);
      if (index !== -1) list.splice(index, 1);
    },
    fire(type) {
      const list = listeners.get(type);
      if (list === undefined) return;
      for (const handler of [...list]) handler();
    },
  };
}

// --------------------------------------------------------------- assembly ---

test("lib/client.js is assembled from the client sources, byte for byte", () => {
  assert.ok(bundleSource.includes(panelSource), "lib/client.js no longer embeds src/client/panel.js verbatim");
  assert.ok(
    bundleSource.includes(copySource),
    "lib/client.js no longer embeds src/client/protocol-copy.js verbatim",
  );
  assert.ok(bundleSource.includes(styleSource), "lib/client.js no longer embeds src/client/styles.css verbatim");
});

test("the bundle is a valid DSH client-module combo script", () => {
  const { registration, exports } = loadBundle();
  assert.equal(registration.id, BUNDLE_ID);
  assert.equal(typeof exports.apply, "function", "client exports must include apply");
  assert.ok(Array.isArray(exports.inject), "client exports must include an inject array");
  assert.deepEqual([...exports.inject], ["slots", "locale"]);
  assert.equal(exports.NS, NS);
  assert.equal(exports.PANEL_ID, PANEL_ID);
});

test("the bundle requires only aliases the loader can answer", () => {
  const allowed = allowedAliases();
  const { requires } = loadBundle();
  assert.ok(requires.length > 0, "expected the bundle to require its aliases up front");
  for (const specifier of requires) {
    assert.ok(allowed.has(specifier), `require("${specifier}") is not in the client allow-list`);
  }
  const called = [...bundleSource.matchAll(/require\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(called)].sort(), ["react", "react/jsx-runtime"]);
});

test("package.json declares the client half the bundle needs", () => {
  assert.equal(manifest.dsh?.client?.platform, "web");
  assert.equal(manifest.exports?.["./client"]?.default, "./lib/client.js");
  assert.equal(manifest.exports?.["."]?.default, "./lib/index.js");
});

// ------------------------------------------------------- protocol copying ---

test("protocol-copy.js and lib/client.js carry every shared declaration verbatim", () => {
  const lines = sharedSource.split("\n");
  for (const name of SHARED_DECLARATIONS) {
    const expected = extractDeclaration(lines, name);
    assert.ok(
      copySource.includes(expected),
      `src/client/protocol-copy.js drifted from src/shared/protocol.js at ${name}`,
    );
    assert.ok(
      bundleSource.includes(expected),
      `lib/client.js drifted from src/shared/protocol.js at ${name}`,
    );
  }
});

test("the copied constants keep their shared values", () => {
  const line = (source, prefix) => source.split("\n").find((entry) => entry.trim().startsWith(prefix));
  for (const name of ["PROTOCOL_VERSION", "PROVIDER_IDS", "QUOTA_PROVIDER_IDS", "SNAPSHOT_PATH", "REFRESH_PATH", "ROUTE_PREFIX"]) {
    assert.equal(
      line(copySource, `const ${name} =`),
      line(sharedSource, `export const ${name} =`).replace(/^export /, ""),
      `${name} differs between the copy and the shared module`,
    );
  }
});

// ------------------------------------------------------------ registration ---

test("apply() registers the usageBoard dictionaries in both languages", () => {
  const { exports } = loadBundle();
  const ctx = makeContext();
  exports.apply(ctx);
  const dictionaries = ctx.state.dictionaries.get(NS);
  assert.ok(dictionaries !== undefined, `ctx.locale.register("${NS}") was not called`);
  assert.deepEqual(Object.keys(dictionaries).sort(), ["en", "zh"]);
  const zhKeys = Object.keys(dictionaries.zh).sort();
  const enKeys = Object.keys(dictionaries.en).sort();
  assert.deepEqual(enKeys, zhKeys, "zh and en dictionaries must define the same keys");
  assert.ok(zhKeys.includes("panel"));
  assert.ok(zhKeys.length >= 30, "the Chinese dictionary is the primary one and must stay complete");
  assert.ok(ctx.state.effects.some((entry) => entry.label === "usage-board: dictionaries"));
});

test("apply() contributes the sidebar entry and the main panel under one id", () => {
  const { exports } = loadBundle();
  const ctx = makeContext();
  exports.apply(ctx);

  const sidebar = ctx.state.injects.find((entry) => entry.name === "sidebar.panellist");
  assert.ok(sidebar !== undefined, "no sidebar.panellist injection");
  const icon = sidebar.register();
  assert.equal(icon.options.name, "sidebar.panellist");
  assert.equal(icon.options.id, PANEL_ID);
  assert.equal(icon.options.order, 20);
  assert.equal(icon.options.locale, NS);
  assert.equal(typeof icon.options.label, "function");
  assert.equal(typeof icon.component, "function");

  const main = ctx.state.injects.find((entry) => entry.name === "main");
  assert.ok(main !== undefined, "no main injection");
  const page = main.register();
  assert.equal(page.options.name, "main");
  assert.equal(page.options.key, PANEL_ID);
  assert.equal(page.options.locale, NS);
  assert.equal(typeof page.component, "function");
});

test("the sidebar label follows the active UI language", () => {
  const { exports } = loadBundle();
  const ctx = makeContext();
  exports.apply(ctx);
  const icon = ctx.state.injects.find((entry) => entry.name === "sidebar.panellist").register();
  assert.equal(icon.options.label(), "用量看板");
  ctx.state.locale = "en";
  assert.equal(icon.options.label(), "Usage Board");
});

// -------------------------------------------------------------- formatting ---

test("formatters never emit NaN or undefined and use an em dash for null", () => {
  const unit = loadPanelUnit();
  assert.equal(unit.formatMoney(null, "CNY"), "—");
  assert.equal(unit.formatMoney(undefined, "USD"), "—");
  assert.equal(unit.formatMoney(Number.NaN, "USD"), "—");
  assert.equal(unit.formatMoney(33.654, "CNY"), "¥33.65");
  assert.equal(unit.formatMoney(-4.5, "USD"), "-$4.50");
  assert.equal(unit.formatMoney(1234.5, "USD"), "$1,234.50");
  assert.equal(unit.formatMoney(12, "XYZ"), "12.00 XYZ");
  assert.equal(unit.formatPercent(null), "—");
  assert.equal(unit.formatPercent(37.46), "37.5%");
  assert.equal(unit.formatPercent(0), "0.0%");
  assert.equal(unit.formatAmount(null), "—");
  assert.equal(unit.formatAmount(10), "10");
  assert.equal(unit.formatAmount(3.5), "3.5");
  assert.equal(unit.formatAmount(1 / 3), "0.33");

  const values = [null, undefined, Number.NaN, Infinity, -Infinity, 0, -0, 1e9, -1e9, 33.649];
  for (const value of values) {
    for (const rendered of [unit.formatPercent(value), unit.formatAmount(value), unit.formatMoney(value, "CNY")]) {
      assert.equal(typeof rendered, "string");
      assert.ok(!rendered.includes("NaN"), `NaN leaked from ${String(value)}`);
      assert.ok(!rendered.includes("undefined"), `undefined leaked from ${String(value)}`);
      assert.ok(!rendered.includes("Infinity"), `Infinity leaked from ${String(value)}`);
    }
  }
});

test("relative time and reset countdown read naturally and tolerate nulls", () => {
  const unit = loadPanelUnit();
  const t = translateSeat(unit.zh);
  const now = 1_700_000_000_000;
  assert.equal(unit.relativeTime(t, null, now), null);
  assert.equal(unit.relativeTime(t, now - 1_000, now), "刚刚更新");
  assert.equal(unit.relativeTime(t, now - 12_000, now), "12 秒前更新");
  assert.equal(unit.relativeTime(t, now - 5 * 60_000, now), "5 分钟前更新");
  assert.equal(unit.relativeTime(t, now - 3 * 3600_000, now), "3 小时前更新");
  assert.equal(unit.relativeTime(t, now - 2 * 86400_000, now), "2 天前更新");
  assert.equal(unit.resetText(t, null, now), null);
  assert.equal(unit.resetText(t, now - 1, now), "即将重置");
  assert.equal(unit.resetText(t, now + 3 * 3600_000, now), "3 小时后重置");
  assert.equal(unit.resetText(t, now + 45_000, now), "45 秒后重置");
});

test("window labels resolve through labelKey, then id, then the provider unit", () => {
  const unit = loadPanelUnit();
  const t = translateSeat(unit.zh);
  assert.equal(unit.windowLabel(t, { id: "glm.5h", labelKey: null, unit: null }), "5 小时窗口");
  assert.equal(unit.windowLabel(t, { id: "x", labelKey: "glm.weekly", unit: null }), "每周窗口");
  assert.equal(unit.windowLabel(t, { id: "x", labelKey: null, unit: "6" }), "每周窗口");
  assert.equal(unit.windowLabel(t, { id: "kimi.monthly", labelKey: null, unit: null }), "每月窗口");
  assert.equal(unit.windowLabel(t, { id: "custom.window", labelKey: null, unit: null }), "custom window");
});

// ------------------------------------------------------------ normalization ---

test("normalizeProvider survives an empty or hostile row", () => {
  const unit = loadPanelUnit();
  const empty = unit.normalizeProvider({});
  assert.equal(empty.status, "invalid-response");
  assert.equal(empty.code, null);
  assert.deepEqual([...empty.windows], []);
  assert.deepEqual([...empty.balances], []);
  assert.deepEqual(Object.keys(empty.meta), []);

  const garbage = unit.normalizeProvider(null);
  assert.equal(garbage.status, "invalid-response");
  assert.equal(garbage.label, "—");

  const unknown = unit.normalizeProvider({ id: "x", label: "X", status: "totally-new" });
  assert.equal(unknown.status, "invalid-response");
  assert.equal(unknown.code, "totally-new");
});

test("normalizeProvider fills a window's derived fields exactly once", () => {
  const unit = loadPanelUnit();
  const row = unit.normalizeProvider({
    id: "glm",
    label: "GLM",
    status: "ok",
    plan: "lite",
    windows: [{ id: "glm.5h", unit: 3, number: 5, limit: 10, used: 3.5, resetAt: 1_700_000_000_000 }],
    balances: [{ currency: "USD", available: 12, bonus: 2, totalSpent: 40 }],
    meta: { host: "open.bigmodel.cn" },
    account: { masked: "hy****er@example.com" },
  });
  assert.equal(row.status, "ok");
  assert.equal(row.plan, "lite");
  assert.equal(row.windows.length, 1);
  assert.equal(row.windows[0].percent, 35);
  assert.equal(row.windows[0].derivedPercent, 35);
  assert.equal(row.windows[0].remaining, 6.5);
  assert.equal(row.windows[0].labelKey, "glm.5h");
  assert.equal(row.balances[0].currency, "USD");
  assert.equal(row.balances[0].available, 12);
  assert.deepEqual([...unit.collectHosts([row, row])], ["open.bigmodel.cn"]);
  assert.deepEqual([...unit.collectHosts([unit.normalizeProvider({ id: "b", label: "B", status: "ok" })])], []);
});

test("a snapshot's derived ok flag and ttl behave", () => {
  const unit = loadPanelUnit();
  const empty = unit.normalizeSnapshot({ providers: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.protocolVersion, 1);
  const mixed = unit.normalizeSnapshot({
    ttlMs: 1,
    providers: [
      { id: "a", label: "A", status: "ok" },
      { id: "b", label: "B", status: "unauthorized" },
    ],
  });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.ttlMs, 1);
  assert.equal(unit.clampTtl(mixed.ttlMs), 60_000);
  assert.equal(unit.clampTtl(600_000), 300_000);
  assert.equal(unit.clampTtl(null), 60_000);
});

test("the daily trend renders history, tolerates nulls and never fabricates a scale", () => {
  const unit = loadPanelUnit();
  const absent = unit.normalizeProvider({ id: "glm", label: "GLM", status: "ok", meta: { host: "api.z.ai" } });
  assert.equal(unit.providerTrend(absent), null, "a provider without meta.dailyUsage gets no chart");

  const empty = unit.normalizeProvider({
    id: "d",
    label: "D",
    status: "ok",
    meta: { dailyUsage: { currency: "CNY", days: 30, points: [] } },
  });
  assert.equal(unit.providerTrend(empty), null);

  const series = unit.providerTrend(unit.normalizeProvider({
    id: "d",
    label: "D",
    status: "ok",
    meta: {
      host: "platform.deepseek.com",
      dailyUsage: {
        currency: "CNY",
        days: 30,
        points: [
          { date: "2026-09-30", cost: 0, tokens: 0 },
          { date: "2026-10-01", cost: null, tokens: null },
          { date: "2026-10-02", cost: 1.23, tokens: 45600 },
          { date: "2026-10-03", cost: 4.92, tokens: 120000 },
        ],
      },
    },
  }));
  assert.ok(series !== null);
  const scale = unit.trendScale(series);
  assert.equal(scale.bars.length, 4);
  assert.equal(scale.max, 4.92);
  assert.equal(Math.round(scale.total * 100) / 100, 6.15);
  assert.equal(scale.currency, "CNY");
  for (const bar of scale.bars) {
    assert.equal(typeof bar.cost, "number");
    assert.ok(Number.isFinite(bar.cost), "a null cost must become 0, not NaN");
  }

  const allZero = unit.trendScale(unit.providerTrend(unit.normalizeProvider({
    id: "d",
    label: "D",
    status: "ok",
    meta: { dailyUsage: { currency: "USD", points: [{ date: "2026-10-01", cost: 0 }, { date: "2026-10-02", cost: null }] } },
  })));
  assert.equal(allZero.max, 0);
  assert.equal(allZero.total, 0);
  const t = translateSeat(unit.zh);
  assert.equal(unit.formatMoney(allZero.total, allZero.currency), "$0.00");
  assert.ok(t("daily.title", { n: String(allZero.bars.length) }).includes("2"));
});

test("the trend keeps only the last fourteen points and defaults its currency", () => {
  const unit = loadPanelUnit();
  const points = [];
  for (let day = 1; day <= 30; day += 1) {
    points.push({ date: "2026-09-" + String(day).padStart(2, "0"), cost: day });
  }
  const series = unit.providerTrend(unit.normalizeProvider({
    id: "d",
    label: "D",
    status: "ok",
    meta: { dailyUsage: { points: points } },
  }));
  const scale = unit.trendScale(series);
  assert.equal(scale.bars.length, unit.DAILY_TREND_POINTS);
  assert.equal(scale.bars[0].date, "2026-09-17");
  assert.equal(scale.bars[13].date, "2026-09-30");
  assert.equal(scale.max, 30);
  assert.equal(scale.currency, "CNY");
});

test("failures describe themselves without a stack trace", () => {  const unit = loadPanelUnit();
  const http = Object.assign(new Error("HTTP 500"), { kind: "http", httpStatus: "500" });
  assert.deepEqual(plain(unit.describeFailure(http)), { key: "error.http", params: { code: "500" }, detail: "HTTP 500" });
  const shape = Object.assign(new Error("payload has no providers array"), { kind: "shape" });
  assert.deepEqual(unit.describeFailure(shape).key, "error.invalid");
  const timeout = Object.assign(new Error("aborted"), { kind: "timeout" });
  assert.deepEqual(plain(unit.describeFailure(timeout)), { key: "error.timeout", params: {}, detail: null });
  const off = unit.describeFailure(new TypeError("Failed to fetch"));
  assert.equal(off.key, "error.network");
  assert.ok(!off.detail.includes("\n    at "), "a stack trace leaked into the diagnostic");
  const long = unit.describeFailure(Object.assign(new Error("x".repeat(500)), { kind: "shape" }));
  assert.ok(long.detail.length <= 140);
});

// ------------------------------------------- stale-while-revalidate (task-5) ---

/** A minimal valid envelope for the storage tests. */
function storedEnvelope(overrides = {}) {
  return {
    protocolVersion: 1,
    generatedAt: Date.now(),
    ok: true,
    ttlMs: 60_000,
    providers: [{
      id: "glm",
      label: "GLM Coding Plan",
      status: "ok",
      plan: "GLM Coding Lite",
      windows: [{ id: "glm.5h", labelKey: "glm.5h", unit: 3, limit: 2000, used: 656, remaining: 1343, percent: 32, derivedPercent: 32.8 }],
      balances: [],
    }],
    ...overrides,
  };
}

test("(a) a snapshot restored from sessionStorage paints in the FIRST frame, with no loading state", async () => {
  const renderer = createRenderer({ hold: true, body: storedEnvelope({ providers: [] }) });
  // Prime the cache the way a previous visit would have.
  renderer.storage.setItem(renderer.storeKey, JSON.stringify(storedEnvelope()));

  const first = renderer.mount();
  const firstText = treeText(first);
  assert.match(firstText, /32\.8%/, "the cached numbers must be on screen before any request settles");
  assert.match(firstText, /656 \/ 2,000/);
  assert.match(firstText, /GLM Coding Lite/);
  assert.ok(!firstText.includes("正在读取用量数据"), "a restored snapshot must not show the loading copy");
  assert.equal(findByClass(first, "ub-root").props["data-phase"], "ready");
  // The mount fetch is still allowed to be in flight — the cache is a head
  // start, not a substitute for revalidating.
  assert.equal(renderer.requests.length, 1, "the panel must still revalidate on mount");
});

test("(a2) a genuinely empty visit is the only thing that shows the loading copy", async () => {
  const renderer = createRenderer({ hold: true });
  const first = renderer.mount();
  const text = treeText(first);
  assert.match(text, /正在读取用量数据/);
  assert.equal(findByClass(first, "ub-root").props["data-phase"], "loading");
});

test("(b) a corrupt or wrong-version stored payload falls back to loading without throwing", async () => {
  for (const [label, raw] of [
    ["unparseable JSON", "{not json at all"],
    ["not an envelope", JSON.stringify({ hello: "world" })],
    ["providers is not an array", JSON.stringify({ protocolVersion: 1, providers: "nope" })],
    ["a JSON scalar", JSON.stringify(42)],
    ["null", "null"],
    ["empty string", ""],
    ["a different protocol version", JSON.stringify(storedEnvelope({ protocolVersion: 99 }))],
  ]) {
    const renderer = createRenderer({ hold: true });
    renderer.storage.setItem(renderer.storeKey, raw);
    const first = renderer.mount();
    assert.equal(findByClass(first, "ub-root").props["data-phase"], "loading", `${label} must not be trusted`);
    assert.match(treeText(first), /正在读取用量数据/, label);
  }
});

test("(b2) a corrupt stored payload is replaced once a real answer arrives", async () => {
  const renderer = createRenderer({ body: storedEnvelope() });
  renderer.storage.setItem(renderer.storeKey, "{{{");
  const tree = await renderer.render();
  assert.equal(findByClass(tree, "ub-root").props["data-phase"], "ready");
  assert.match(treeText(tree), /32\.8%/);
  // The good answer is written back for the next visit.
  assert.equal(JSON.parse(renderer.storage.getItem(renderer.storeKey)).protocolVersion, 1);
});

test("(c) an in-flight refresh keeps the previous numbers on screen", async () => {
  const renderer = createRenderer({ hold: true });
  renderer.storage.setItem(renderer.storeKey, JSON.stringify(storedEnvelope()));
  renderer.mount();

  const whileBusy = treeText(renderer.mount());
  assert.match(whileBusy, /32\.8%/, "the previous numbers must survive an in-flight request");
  assert.ok(!whileBusy.includes("正在读取用量数据"));
  assert.match(whileBusy, /正在刷新…/, "busy is expressed on the freshness line, not by blanking the body");
  const button = findByClass(renderer.mount(), "ub-refresh");
  assert.equal(button.props.disabled, true, "the busy state lives on the header control");
  assert.equal(button.props["aria-busy"], "true");
});

test("(c2) a failing background refresh keeps the restored numbers and adds the note", async () => {
  const renderer = createRenderer({ reject: true });
  renderer.storage.setItem(renderer.storeKey, JSON.stringify(storedEnvelope()));
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /32\.8%/, "a failed refresh must not throw away good cached numbers");
  assert.ok(!text.includes("重试"));
  assert.match(text, /刷新失败/);
  assert.equal(findByClass(tree, "ub-root").props["data-phase"], "ready");
});

test("(d) a stale answer earns exactly one follow-up read, and never becomes a poll", async () => {
  const renderer = createRenderer({ hold: true });
  renderer.mount();
  await renderer.settle();
  assert.equal(renderer.requests.length, 1);

  // The host answers from a cache it is refreshing behind.
  renderer.setPayload({ hold: false, body: storedEnvelope({ stale: true, refreshing: true }) });
  renderer.release();
  await renderer.settle();
  assert.equal(renderer.requests.length, 1, "the stale body itself is already the first read");

  await renderer.advance(1400);
  assert.equal(renderer.requests.length, 1, "the follow-up must wait for its delay, not fire immediately");

  // The follow-up fires, and the host answers stale AGAIN: no second follow-up.
  renderer.setPayload({ hold: false, body: storedEnvelope({ stale: true, refreshing: true }) });
  await renderer.advance(200);
  assert.equal(renderer.requests.length, 2, "exactly one follow-up per stale answer");
  await renderer.advance(30_000);
  assert.equal(renderer.requests.length, 2, "a still-stale host must not turn the follow-up into a busy loop");
});

test("(d2) a fresh answer after the follow-up replaces the cached numbers in place", async () => {
  const renderer = createRenderer({ hold: true });
  renderer.mount();
  await renderer.settle();
  renderer.setPayload({ hold: false, body: storedEnvelope({ stale: true }) });
  renderer.release();
  await renderer.settle();
  assert.match(treeText(renderer.mount()), /32\.8%/);

  renderer.setPayload({
    hold: false,
    body: storedEnvelope({
      stale: false,
      providers: [{
        id: "glm",
        label: "GLM Coding Plan",
        status: "ok",
        windows: [{ id: "glm.5h", labelKey: "glm.5h", limit: 2000, used: 1000, remaining: 1000, percent: 50, derivedPercent: 50 }],
        balances: [],
      }],
    }),
  });
  const tree = await renderer.advance(1600);
  const text = treeText(tree);
  assert.match(text, /50\.0%/, "the follow-up must land the fresh numbers");
  assert.match(text, /1,000 \/ 2,000/);
  assert.ok(!text.includes("32.8%"), "the stale reading must be replaced, not merged");
});

test("(d3) a manual refresh that answers stale still earns its one follow-up", async () => {
  const renderer = createRenderer({ hold: true });
  renderer.mount();
  await renderer.settle();
  renderer.setPayload({ hold: false, body: storedEnvelope({ stale: true }) });
  renderer.release();
  await renderer.settle();
  await renderer.advance(2000);
  const afterStaleCycle = renderer.requests.length;
  assert.equal(afterStaleCycle, 2);

  // Now the user presses refresh; the POST waits server-side, so a stale flag
  // there is unusual, but the follow-up contract still holds.
  renderer.setPayload({ hold: false, body: storedEnvelope({ stale: true }) });
  const tree = renderer.mount();
  findByClass(tree, "ub-refresh").props.onClick();
  await renderer.settle();
  assert.equal(renderer.requests.length, 3);
  assert.equal(renderer.requests[2].url, "/usage-board/api/refresh");
  assert.equal(renderer.requests[2].method, "POST");
});

// ------------------------------------------- auto-refresh gate (idle pause) ---
//
// An open DSH window polling its TTL keeps every provider API awake even when
// nobody is looking. These tests drive the gate with the fake browser env
// (`browser: true`): a fake document whose visibility and events the test
// fires by hand, a fake IntersectionObserver for "panel not on screen", and a
// frozen clock where `advance()` moves idleness deterministically.

const AUTO_REFRESH_INTERVAL_MS = 60_000;
const GATE_RECHECK_INTERVAL_MS = 30_000;
const TICKER_INTERVAL_MS = 1000;
const IDLE_TEST_MS = 4 * 60 * 1000;

test("(g1) an idle panel skips the auto poll, and one input event picks it back up", async () => {
  const renderer = createRenderer({ browser: true, body: storedEnvelope() });
  await renderer.render();
  assert.equal(renderer.requests.length, 1, "the mount read still happens");

  // Walk away: no input at all, the clock runs past the idle budget, the gate
  // recheck (no events announce idling out) closes the gate.
  await renderer.advance(IDLE_TEST_MS);
  renderer.fireInterval(GATE_RECHECK_INTERVAL_MS);
  const quiet = renderer.requests.length;
  renderer.fireInterval(AUTO_REFRESH_INTERVAL_MS);
  await renderer.settle();
  assert.equal(renderer.requests.length, quiet, "an idle panel must skip the upstream read");

  // Come back: a single input reopens the gate, and the reopen itself is the
  // catch-up read — no waiting a full ttl first.
  renderer.fire("pointerdown");
  await renderer.settle();
  assert.equal(renderer.requests.length, quiet + 1, "activity must trigger the catch-up read");
  assert.equal(renderer.requests[quiet].url, "/usage-board/api/snapshot");

  // The ordinary ttl schedule resumes from there.
  await renderer.advance(AUTO_REFRESH_INTERVAL_MS + 1000);
  renderer.fireInterval(AUTO_REFRESH_INTERVAL_MS);
  await renderer.settle();
  assert.equal(renderer.requests.length, quiet + 2, "the ttl schedule resumes once the gate is open");
});

test("(g2) a hidden document stops the poll even with fresh activity", async () => {
  const renderer = createRenderer({ browser: true, body: storedEnvelope() });
  await renderer.render();
  assert.equal(renderer.requests.length, 1);

  renderer.document.visibilityState = "hidden";
  renderer.fire("visibilitychange");
  await renderer.settle();
  const quiet = renderer.requests.length;
  renderer.fireInterval(AUTO_REFRESH_INTERVAL_MS);
  await renderer.settle();
  assert.equal(renderer.requests.length, quiet, "a hidden document must not poll");

  renderer.document.visibilityState = "visible";
  renderer.fire("visibilitychange");
  await renderer.settle();
  assert.equal(renderer.requests.length, quiet + 1, "coming back to the window must pick the data up");
});

test("(g3) a panel the sidebar hides stops polling until it is shown again", async () => {
  const renderer = createRenderer({ browser: true, body: storedEnvelope() });
  await renderer.render();
  assert.equal(renderer.observers.length, 1, "the panel root is observed");
  assert.equal(renderer.observers[0].observed.length, 1);

  renderer.observers[0].emit(false); // another sidebar panel selected
  await renderer.settle();
  const quiet = renderer.requests.length;
  renderer.fireInterval(AUTO_REFRESH_INTERVAL_MS);
  await renderer.settle();
  assert.equal(renderer.requests.length, quiet, "an off-screen panel must not poll");

  renderer.observers[0].emit(true); // selected again
  await renderer.settle();
  assert.equal(renderer.requests.length, quiet + 1, "reselecting the panel must refresh it");
});

test("(g4) the one-second freshness ticker freezes with the panel off-screen", async () => {
  const renderer = createRenderer({ browser: true, body: storedEnvelope() });
  await renderer.render();

  renderer.fireInterval(TICKER_INTERVAL_MS);
  await renderer.settle();
  renderer.fireInterval(TICKER_INTERVAL_MS);
  await renderer.settle();
  const ticking = renderer.renderCount;
  assert.ok(ticking >= 2, "an on-screen panel keeps its clock ticking (it re-renders)");

  renderer.observers[0].emit(false);
  await renderer.settle();
  const frozen = renderer.renderCount;
  renderer.fireInterval(TICKER_INTERVAL_MS);
  await renderer.settle();
  assert.equal(renderer.renderCount, frozen, "an off-screen panel must not re-render every second");
});

test("(g5) a pending stale follow-up is dropped while the gate is closed", async () => {
  const renderer = createRenderer({ browser: true, body: storedEnvelope({ stale: true }) });
  await renderer.render();
  assert.equal(renderer.requests.length, 1, "the mount read resolves and schedules a follow-up");

  // Walk away before the 1.5 s follow-up fires: closing the gate must cancel it.
  renderer.document.visibilityState = "hidden";
  renderer.fire("visibilitychange");
  await renderer.settle();
  await renderer.advance(3000);
  assert.equal(renderer.requests.length, 1, "a hidden panel must not send the follow-up read");

  // The reopen catch-up replaces it: one read, immediately, instead of waiting
  // for the ordinary ttl.
  renderer.document.visibilityState = "visible";
  renderer.fire("visibilitychange");
  await renderer.settle();
  assert.equal(renderer.requests.length, 2, "coming back must issue the catch-up read instead");
});

test("(e) storage being unavailable never breaks the panel", async () => {
  const throwing = {
    getItem() {
      throw new Error("SecurityError: storage is disabled");
    },
    setItem() {
      throw new Error("QuotaExceededError: storage is full");
    },
    removeItem() {
      throw new Error("nope");
    },
  };
  for (const [label, storage] of [["no sessionStorage at all", null], ["a throwing sessionStorage", throwing]]) {
    const renderer = createRenderer({ storage, body: storedEnvelope() });
    const tree = await renderer.render();
    assert.equal(findByClass(tree, "ub-root").props["data-phase"], "ready", label);
    assert.match(treeText(tree), /32\.8%/, label);
  }
  // A read that finds nothing but a write that throws (storage full) must still
  // leave a working panel.
  const fullStorage = {
    getItem: () => null,
    setItem() {
      throw new Error("QuotaExceededError: storage is full");
    },
    removeItem: () => {},
  };
  const renderer = createRenderer({ storage: fullStorage, body: storedEnvelope() });
  const tree = await renderer.render();
  assert.equal(findByClass(tree, "ub-root").props["data-phase"], "ready");
  assert.match(treeText(tree), /32\.8%/);
});

// ------------------------------------------------------------- rendering ---

test("an ok provider with no windows and no balances reads as an explanation, not an error", async () => {
  const renderer = createRenderer({
    body: { protocolVersion: 1, ok: true, ttlMs: 60_000, providers: [{ id: "x", label: "X", status: "ok" }] },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /该服务不提供用量窗口/);
  assert.ok(!text.includes("重试"), "an empty card must not offer a retry");
  assert.ok(!text.includes("error."), "no locale key leaked into the render");
  assert.equal(findByClass(tree, "ub-card").props["data-status"], "ok");
  assert.equal(findByClass(tree, "ub-root").props["data-phase"], "ready");
});

test("a wallet-only provider explains itself and never calls the trend an allowance", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: true,
      ttlMs: 60_000,
      providers: [{
        id: "deepseek",
        label: "DeepSeek",
        status: "ok",
        windows: [],
        balances: [{ currency: "CNY", available: 27.747, bonus: 0, totalSpent: 128.25 }],
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /¥27\.75/);
  assert.match(text, /总消耗 ¥128\.25/);
  assert.match(text, /该服务按余额计费，不提供用量窗口/);
  assert.ok(!text.includes("剩余"), "a wallet has no remainder to report");
  assert.ok(!text.includes("额度"));
});

test("a provider with a daily trend shows the chart and drops the wallet-only note", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: true,
      ttlMs: 60_000,
      providers: [{
        id: "deepseek",
        label: "DeepSeek",
        status: "ok",
        windows: [],
        balances: [{ currency: "CNY", available: 27.75, totalSpent: 128.25 }],
        meta: {
          host: "platform.deepseek.com",
          dailyUsage: {
            currency: "CNY",
            days: 14,
            points: [
              { date: "2026-10-01", cost: 1.23 },
              { date: "2026-10-02", cost: 4.92 },
              { date: "2026-10-03", cost: null },
            ],
          },
        },
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  // The title names the window it actually drew, and the range makes the window
  // explicit so the total can never be read as the lifetime spend above it.
  assert.match(text, /近 3 天消耗/);
  assert.match(text, /10-01 → 10-03/);
  assert.match(text, /¥6\.15/);
  assert.ok(!text.includes("不提供用量窗口"), "the trend answers the question the note was covering");
  const bars = findByClass(tree, "ub-trend-bars");
  assert.equal(bars.props.children.length, 3);
  for (const bar of bars.props.children) {
    assert.equal(typeof bar.props.style.height, "string");
    assert.ok(!bar.props.style.height.includes("NaN"));
  }
  assert.equal(bars.props.children[2].props["data-empty"], "true");
});

test("a failed first request renders the error state with a retry control", async () => {
  const renderer = createRenderer({ reject: true });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /无法连接实例的用量服务/);
  assert.equal(findByClass(tree, "ub-root").props["data-phase"], "error");
  assert.ok(findByClass(tree, "ub-retry") !== null, "the error state must offer a retry");
  assert.ok(!text.includes("at Object."), "a stack trace reached the panel");
});

test("a non-2xx answer is reported with its status code and the retry control", async () => {
  const renderer = createRenderer({ ok: false, status: 503 });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /实例返回了 HTTP 503/);
  assert.equal(findByClass(tree, "ub-code").props.children, "HTTP 503");
  assert.ok(findByClass(tree, "ub-retry") !== null);
});

// ------------------------------------------- declared vs derived percentage ---

test("a window keeps the declared percent and the derived percent apart", () => {
  const unit = loadPanelUnit();
  const row = unit.normalizeProvider({
    id: "glm",
    label: "GLM",
    status: "ok",
    windows: [{ id: "glm.5h", limit: 2000, used: 656, percent: 32 }],
  });
  // GLM declares 32 next to 656/2000, which is 32.8%: both survive normalization.
  assert.equal(row.windows[0].percent, 32, "the provider's declaration must stay available as a diagnostic");
  assert.equal(row.windows[0].derivedPercent, 32.8, "the arithmetic must win for display");

  // An older host that omits derivedPercent still gets the arithmetic, because
  // makeWindow computes it from the pair.
  const legacy = unit.normalizeProvider({
    id: "kimi",
    label: "Kimi",
    status: "ok",
    windows: [{ id: "kimi.5h", limit: 100, used: 36, percent: 35.7 }],
  });
  assert.equal(legacy.windows[0].percent, 35.7);
  assert.equal(legacy.windows[0].derivedPercent, 36);

  // No usable pair at all: the declaration is all there is, so it is used.
  const solo = unit.normalizeProvider({
    id: "x",
    label: "X",
    status: "ok",
    windows: [{ id: "x.w", limit: null, used: null, percent: 12.5 }],
  });
  assert.equal(solo.windows[0].derivedPercent, null);
  assert.equal(solo.windows[0].percent, 12.5);
  assert.equal(unit.derivedPercentOf(0, 0), null);
  assert.equal(unit.derivedPercentOf(1, 3), 33.3);
});

test("the printed percentage matches the fraction beside it (D-3)", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: true,
      ttlMs: 60_000,
      providers: [{
        id: "glm",
        label: "GLM Coding Plan",
        status: "ok",
        windows: [
          { id: "glm.5h", labelKey: "glm.5h", unit: 3, number: 5, limit: 2000, used: 656, remaining: 1343, percent: 32, derivedPercent: 32.8 },
          { id: "glm.weekly", labelKey: "glm.weekly", unit: 6, number: 1, limit: 10000, used: 5831, remaining: 4168, percent: 58, derivedPercent: 58.3 },
        ],
        balances: [],
      }, {
        id: "kimi",
        label: "Kimi Code",
        status: "ok",
        windows: [
          { id: "kimi.5h", labelKey: "kimi.5h", limit: 100, used: 36, remaining: 64, percent: 35.7, derivedPercent: 36 },
          { id: "kimi.weekly", labelKey: "kimi.weekly", limit: 100, used: 43, remaining: 57, percent: 42.7, derivedPercent: 43 },
        ],
        balances: [],
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /32\.8%/, "GLM 5h must print the fraction its own numbers imply");
  assert.match(text, /58\.3%/);
  assert.match(text, /36\.0%/, "Kimi 5h declares 35.7 beside 36/100");
  assert.match(text, /43\.0%/);
  assert.ok(!text.includes("32.0%"), "the declared 32 must not be printed beside 656 / 2,000");
  assert.ok(!text.includes("35.7%"), "the declared 35.7 must not be printed beside 36 / 100");
  const fills = [];
  walk(tree, (node) => {
    const className = node.props.className;
    if (typeof className === "string" && className.split(" ").includes("ub-bar-fill")) fills.push(node.props.style.width);
  });
  assert.deepEqual(fills, ["32.8%", "58.3%", "36.0%", "43.0%"], "the bar width must follow the same figure");
});

// ------------------------------------------------------------ message keys ---

test("every messageKey the host can emit has copy in both languages", () => {
  const unit = loadPanelUnit();
  // Mirrors classifyMessage() in src/host/snapshot.js.
  const hostKeys = [
    "notConfigured",
    "authRejected",
    "noCodingPlan",
    "rateLimited",
    "cancelled",
    "unreachable",
    "badResponse",
    "adapterFailed",
    "noHost",
  ];
  // Mirrors the `status.<status>` fallback and every ProviderStatus.
  const statuses = [
    "ok",
    "not-configured",
    "unauthorized",
    "rate-limited",
    "upstream-error",
    "network-error",
    "invalid-response",
    "disabled",
  ];
  const required = [...hostKeys.map((key) => "message." + key), ...statuses.map((status) => "status." + status)];
  for (const locale of ["zh", "en"]) {
    for (const key of required) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(unit[locale], key),
        `${locale} dictionary is missing ${key}, which the host can send`,
      );
      assert.ok(unit[locale][key].length > 0, `${locale}.${key} is empty`);
    }
  }
  // The two failure modes must never collapse into one string.
  assert.notEqual(unit.zh["message.authRejected"], unit.zh["message.noCodingPlan"]);
  assert.notEqual(unit.en["message.authRejected"], unit.en["message.noCodingPlan"]);
});

test("a known messageKey is translated, an unknown one falls back to the host prose", () => {
  const unit = loadPanelUnit();
  const t = translateSeat(unit.zh);
  const withKey = (key) => unit.normalizeProvider({
    id: "glm",
    label: "GLM",
    status: "unauthorized",
    messageKey: key,
    message: "The GLM credential was rejected by the provider.",
  });
  assert.equal(unit.providerMessage(t, withKey("authRejected")), "凭据被服务方拒绝，可能已过期或填错。");
  assert.equal(unit.providerMessage(t, withKey("noCodingPlan")), "这个密钥没有有效的 Coding Plan 套餐。");
  assert.equal(unit.providerMessage(t, withKey("notConfigured")), "尚未配置这家服务的凭据，请在 DSH 设置里填写对应密钥。");
  assert.equal(unit.providerMessage(t, withKey("rateLimited")), "服务方正在限流，请稍后重试。");
  assert.equal(unit.providerMessage(t, withKey("unreachable")), "无法连接实例的用量服务。");
  assert.equal(unit.providerMessage(t, withKey("cancelled")), "本次读取已取消。");
  assert.equal(unit.providerMessage(t, withKey("badResponse")), "服务方返回了无法解析的内容。");
  assert.equal(unit.providerMessage(t, withKey("adapterFailed")), "读取过程中出现意外错误。");
  assert.equal(unit.providerMessage(t, withKey("noHost")), "没有可用的上游地址。");
  // The bare `status.<status>` form the host may also send.
  assert.equal(unit.providerMessage(t, withKey("status.unauthorized")), "未授权");
  // Unrecognised key: the host's own sentence survives untranslated.
  assert.equal(unit.providerMessage(t, withKey("somethingBrandNew")), "The GLM credential was rejected by the provider.");
  // Nothing at all: the status word.
  const bare = unit.normalizeProvider({ id: "glm", label: "GLM", status: "unauthorized" });
  assert.equal(unit.providerMessage(t, bare), "未授权");
  // Missing messageKey entirely with an English message still shows that message.
  const noKey = unit.normalizeProvider({ id: "glm", label: "GLM", status: "upstream-error", message: "Upstream said 500." });
  assert.equal(unit.providerMessage(t, noKey), "Upstream said 500.");
});

test("messageKey survives normalization and noCodingPlan never reads as an expired credential", () => {
  const unit = loadPanelUnit();
  const row = unit.normalizeProvider({ id: "glm", label: "GLM", status: "not-configured", messageKey: "noCodingPlan" });
  assert.equal(row.messageKey, "noCodingPlan");
  const t = translateSeat(unit.zh);
  const plan = unit.providerMessage(t, row);
  const auth = unit.providerMessage(t, unit.normalizeProvider({ id: "g", label: "G", status: "unauthorized", messageKey: "authRejected" }));
  assert.notEqual(plan, auth, "a missing subscription must not share the rejected-credential wording");
  assert.ok(!/过期|填错/.test(plan), "noCodingPlan must not imply the key is expired or mistyped");
  assert.match(plan, /Coding Plan/);
  assert.equal(unit.normalizeProvider({ id: "x", label: "X", status: "ok" }).messageKey, null);
});

test("a non-ok provider renders its explanation and diagnostic code", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: false,
      ttlMs: 60_000,
      providers: [{
        id: "glm",
        label: "GLM Coding Plan",
        status: "unauthorized",
        code: "401",
        windows: [],
        balances: [],
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /未授权/);
  assert.match(text, /401/);
  assert.equal(findByClass(tree, "ub-card").props["data-status"], "unauthorized");
  assert.equal(findByClass(tree, "ub-pill").props["data-tone"], "danger");
});

test("quota windows render a labelled bar, used/limit, remainder and reset countdown", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: true,
      ttlMs: 60_000,
      providers: [{
        id: "glm",
        label: "GLM Coding Plan",
        status: "ok",
        plan: "GLM Coding Lite",
        windows: [{
          id: "glm.5h",
          labelKey: "glm.5h",
          unit: 3,
          number: 5,
          limit: 2000,
          used: 656,
          remaining: 1343,
          percent: 32,
          resetAt: Date.now() + 3 * 3600_000,
        }],
        balances: [],
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /5 小时窗口 ×5/);
  // 656/2000 is 32.8%, so the card must not print the declared 32.0%.
  assert.match(text, /32\.8%/);
  assert.match(text, /656 \/ 2,000/);
  assert.match(text, /剩余 1,343/);
  assert.match(text, /3 小时后重置/);
  assert.match(text, /GLM Coding Lite/);
  const bar = findByClass(tree, "ub-bar");
  assert.equal(bar.props.role, "progressbar");
  assert.equal(bar.props["aria-valuenow"], 33);
  assert.equal(findByClass(tree, "ub-bar-fill").props.style.width, "32.8%");
  assert.equal(findByClass(tree, "ub-bar-fill").props["data-level"], "ok");
});

test("the panel renders exactly ONE refresh control, and it is in the header", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: true,
      ttlMs: 60_000,
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          status: "ok",
          windows: [],
          balances: [{ currency: "CNY", available: 27.75 }],
          meta: { host: "platform.deepseek.com" },
        },
        { id: "glm", label: "GLM Coding Plan", status: "ok", windows: [{ id: "glm.5h", limit: 2000, used: 656 }], balances: [] },
      ],
    },
  });
  const tree = await renderer.render();

  // Every control that would trigger a refresh, by class and by accessible name.
  const refreshControls = [];
  walk(tree, (node) => {
    const className = node.props.className;
    if (typeof className === "string" && className.split(" ").includes("ub-refresh")) refreshControls.push(node);
    else if (node.props["aria-label"] === "刷新") refreshControls.push(node);
  });
  assert.equal(refreshControls.length, 1, "the duplicate footer refresh button must not come back");
  assert.equal(refreshControls[0].type, "button");
  assert.equal(refreshControls[0].props.className, "ub-refresh");
  assert.ok(!refreshControls[0].props.className.includes("ub-refresh--foot"), "the footer variant is gone");

  // It lives in the header, next to the title — exactly once.
  const header = findByClass(tree, "ub-head");
  let headerControls = 0;
  walk(header, (node) => {
    if (typeof node.props.className === "string" && node.props.className.split(" ").includes("ub-refresh")) {
      headerControls += 1;
    }
  });
  assert.equal(headerControls, 1);

  // The footer holds only the host line: no button, no control of any kind.
  const footer = findByClass(tree, "ub-foot");
  assert.ok(footer !== null, "the footer still renders the source line");
  const footerChildren = Array.isArray(footer.props.children) ? footer.props.children : [footer.props.children];
  assert.equal(footerChildren.filter(Boolean).length, 1, "the footer must hold exactly one child");
  assert.equal(footerChildren[0].type, "span");
  assert.equal(footerChildren[0].props.className, "ub-source");
  let footerButtons = 0;
  walk(footer, (node) => {
    if (node.type === "button") footerButtons += 1;
  });
  assert.equal(footerButtons, 0, "no button may live in the footer");
  assert.match(treeText(footer), /数据来源/);
});

test("a true 0% is data, not an absence: it prints 0.0% and draws an empty bar", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: true,
      ttlMs: 60_000,
      providers: [{
        id: "kimi",
        label: "Kimi Code",
        status: "ok",
        windows: [{ id: "kimi.5h", labelKey: "kimi.5h", limit: 100, used: 0, remaining: 100, percent: 0, derivedPercent: 0 }],
        balances: [],
      }, {
        id: "glm",
        label: "GLM Coding Plan",
        status: "ok",
        // No usable pair at all: the em dash is the only honest answer here.
        windows: [{ id: "glm.5h", labelKey: "glm.5h", limit: null, used: null, percent: null, derivedPercent: null }],
        balances: [],
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /0\.0%/, "a zero share must print 0.0%, not fall through to no-data");
  assert.match(text, /0 \/ 100/);
  assert.match(text, /剩余 100/);

  const fills = [];
  walk(tree, (node) => {
    const className = node.props.className;
    if (typeof className === "string" && className.split(" ").includes("ub-bar-fill")) fills.push(node.props);
  });
  assert.equal(fills.length, 2);
  assert.equal(fills[0].style.width, "0.0%");
  assert.equal(fills[0]["data-empty"], "true", "a 0% bar must collapse, not show the minimum-width stub");
  assert.equal(fills[0]["data-level"], "ok", "0% used is healthy, not unknown");
  const bars = [];
  walk(tree, (node) => {
    if (node.props.role === "progressbar") bars.push(node.props);
  });
  assert.equal(bars[0]["aria-valuenow"], 0);
  assert.equal(bars[0]["aria-valuetext"], "0.0%");
  // The genuinely unknown window still renders the em dash and carries no value.
  assert.match(text, /—/);
  assert.equal(fills[1]["data-level"], "unknown");
  assert.equal(fills[1]["data-empty"], "true");
  assert.equal(bars[1]["aria-valuenow"], undefined);
  assert.equal(bars[1]["aria-valuetext"], "—");
});

test("a non-ok card shows Chinese copy for a known messageKey (D-5)", async () => {
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: false,
      ttlMs: 60_000,
      providers: [{
        id: "glm",
        label: "GLM Coding Plan",
        status: "unauthorized",
        messageKey: "authRejected",
        message: "The GLM credential was rejected by the provider.",
        code: "401",
        windows: [],
        balances: [],
      }, {
        id: "kimi",
        label: "Kimi Code",
        status: "not-configured",
        messageKey: "noCodingPlan",
        message: "The Kimi key has no Coding Plan subscription.",
        windows: [],
        balances: [],
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /凭据被服务方拒绝/);
  assert.match(text, /这个密钥没有有效的 Coding Plan 套餐/);
  assert.ok(
    !text.includes("The GLM credential was rejected"),
    "the host's English sentence must not reach a Chinese UI when the key is known",
  );
  assert.ok(!text.includes("The Kimi key has no Coding Plan"));
  assert.ok(!/凭据被服务方拒绝[^|]*Kimi/.test(text), "the two keys must not share wording");
});

test("a fourteen-point trend is labelled as a fourteen-day window", async () => {
  const points = [];
  for (let day = 1; day <= 14; day += 1) {
    points.push({ date: "2026-10-" + String(day).padStart(2, "0"), cost: day });
  }
  const renderer = createRenderer({
    body: {
      protocolVersion: 1,
      ok: true,
      ttlMs: 60_000,
      providers: [{
        id: "deepseek",
        label: "DeepSeek",
        status: "ok",
        windows: [],
        balances: [{ currency: "CNY", available: 25.38, totalSpent: 130.62 }],
        meta: { dailyUsage: { currency: "CNY", days: 14, points } },
      }],
    },
  });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /近 14 天消耗/);
  assert.match(text, /10-01 → 10-14/);
  assert.match(text, /¥105\.00/);
  assert.match(text, /总消耗 ¥130\.62/);
  assert.equal(findByClass(tree, "ub-trend-bars").props.children.length, 14);
});

test("the sidebar glyph renders at the size the sidebar asks for", () => {
  const unit = loadPanelUnit();
  const small = unit.UsageBoardPanelIcon({ size: 16, active: false });
  const large = unit.UsageBoardPanelIcon({ size: 18, active: true });
  assert.equal(small.props.width, 16);
  assert.equal(large.props.width, 18);
  assert.equal(unit.UsageBoardPanelIcon({}).props.width, 16);
  assert.equal(small.props.children.length, 3);
});



// -------------------------------------------------------------------- CSS ---

test("the stylesheet styles with DSH alias tokens and always keeps a fallback", () => {
  const required = [
    "--dsw-alias-label-primary",
    "--dsw-alias-label-secondary",
    "--dsw-alias-label-tertiary",
    "--dsw-alias-bg-layer-2",
    "--dsw-radius-md",
    "--dsw-radius-panel",
    "--dsh-frame-top-clearance",
  ];
  for (const token of required) {
    assert.ok(styleSource.includes(token), `styles.css stopped using ${token}`);
  }
  assert.ok(
    styleSource.includes("var(--dsw-alias-border-l1, var(--dsw-alias-border-1,"),
    "styles.css must accept both published names for the 1px border alias",
  );
  // Panel-local --ub-* aliases are deliberately defined on .ub-root, so only
  // the frame's own tokens must carry an inline fallback here.
  const bare = [...styleSource.matchAll(/var\(\s*(--d(?:sw|sh)-[a-zA-Z0-9-]+)\s*\)/g)].map((match) => match[1]);
  assert.deepEqual(bare, [], `these frame tokens are read without a fallback: ${bare.join(", ")}`);
  assert.ok(!styleSource.includes("`") && !styleSource.includes("${"), "styles.css must stay embeddable");
});

// --------------------------------------- DeepSeek peak / off-peak reminder ---

/**
 * A Beijing wall-clock instant as epoch ms. The tests spell times in Beijing
 * time because that is the timezone the official rule is defined in; reading
 * them in the local timezone would make the suite TZ-dependent.
 * @param {string} iso e.g. '2026-10-19T08:59:30'
 * @returns {number}
 */
const bj = (iso) => Date.parse(`${iso}+08:00`);

/** Stub holiday calendar: the 2026 arrangement is "covered", nothing is a holiday. */
const weekdayCalendar = {
  source: "stub-calendar",
  isWorkday(dateKey) {
    const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  },
  coversYear(year) {
    return year <= 2026;
  },
};

/**
 * One-provider envelope with the billing schedule the host would attach.
 * @param {number} nowMs The host read instant (and the pricing schedule's asOf).
 * @param {{calendar?: object|null, status?: string, provider?: object, includePricing?: boolean}} [options]
 */
function billingBody(nowMs, options = {}) {
  const status = options.status ?? "ok";
  const provider = options.provider ?? {
    id: "deepseek",
    label: "DeepSeek",
    status,
    balances: status === "ok" ? [{ currency: "CNY", available: 43.38, bonus: 44.59, totalSpent: 163.84 }] : [],
    windows: [],
  };
  const meta = { host: "platform.deepseek.com" };
  if (options.includePricing !== false) {
    meta.pricing = createPricingSnapshot(nowMs, options.calendar === undefined ? weekdayCalendar : options.calendar);
  }
  return {
    protocolVersion: 1,
    ok: status === "ok",
    ttlMs: 60_000,
    providers: [{ ...provider, meta }],
  };
}

test("the DeepSeek card reminds you which side of the peak the bill is on", async () => {
  const now = bj("2026-10-19T10:00:00"); // Monday, inside the 09:00–12:00 peak
  const renderer = createRenderer({ now, body: billingBody(now) });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /现在是梁文峰时段！/, "the peak slogan (the 峰 pun) must be on the card");
  assert.match(text, /高峰 · 标准价/);
  assert.match(text, /距降价 2 小时/, "peak ends at 12:00, so the next move is a price drop");
  assert.match(text, /北京时间/);
  const reminder = findByClass(tree, "ub-price");
  assert.ok(reminder !== null, "the reminder must render on the DeepSeek card");
  assert.equal(reminder.props["data-phase"], "peak");
  assert.match(reminder.props.title, /周一至周五 09:00–12:00、14:00–18:00/);
  assert.equal(findByClass(tree, "ub-card").props["data-provider"], "deepseek");
});

test("off-peak renders the valley pun, the 5折 chip and a rise countdown", async () => {
  const now = bj("2026-10-18T10:51:57"); // Sunday: off-peak all day
  const renderer = createRenderer({ now, body: billingBody(now) });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /现在是梁文谷时段！/, "off-peak swaps 峰 for 谷 in the founder's name");
  assert.match(text, /空闲 · 5 折/);
  assert.match(text, /距涨价/, "the next change is Monday 09:00, a price rise");
  const reminder = findByClass(tree, "ub-price");
  assert.equal(reminder.props["data-phase"], "offpeak");
  assert.ok(!text.includes("现在是梁文峰时段！"), "the two slogans are mutually exclusive per render");
});

test("the reminder flips on the boundary from the panel's own clock, without a refetch", async () => {
  const now = bj("2026-10-19T08:59:30"); // 30s before the Monday peak opens
  const renderer = createRenderer({ now, body: billingBody(now) });
  let tree = await renderer.render();
  assert.match(treeText(tree), /现在是梁文谷时段！/);
  assert.match(treeText(tree), /距涨价 30 秒/);
  assert.equal(renderer.requests.length, 1);

  await renderer.advance(30_000); // now == 09:00:00 Beijing
  renderer.fireInterval(1000); // the panel's one-second clock
  tree = await renderer.settle();

  assert.match(treeText(tree), /现在是梁文峰时段！/, "the banner must flip exactly on the boundary");
  assert.match(treeText(tree), /距降价 3 小时/);
  assert.equal(findByClass(tree, "ub-price").props["data-phase"], "peak");
  assert.equal(renderer.requests.length, 1, "flipping the banner must not trigger a request");
});

test("the reminder only ever appears on the DeepSeek card", async () => {
  const now = bj("2026-10-19T10:00:00");
  const renderer = createRenderer({
    now,
    body: billingBody(now, {
      provider: { id: "glm", label: "GLM Coding Plan", status: "ok", windows: [], balances: [] },
    }),
  });
  const tree = await renderer.render();
  assert.equal(findByClass(tree, "ub-price"), null, "a schedule must not leak onto another provider's card");
});

test("a host without the additive schedule renders the card without the reminder", async () => {
  const now = bj("2026-10-19T10:00:00");
  const renderer = createRenderer({ now, body: billingBody(now, { includePricing: false }) });
  const tree = await renderer.render();
  assert.equal(findByClass(tree, "ub-price"), null);
  assert.match(treeText(tree), /余额/, "the rest of the DeepSeek card still renders");
});

test("the reminder survives a non-ok DeepSeek row: the list price is not account state", async () => {
  const now = bj("2026-10-19T10:00:00");
  const renderer = createRenderer({
    now,
    body: billingBody(now, {
      status: "unauthorized",
      provider: { id: "deepseek", label: "DeepSeek", status: "unauthorized", code: "401", windows: [], balances: [] },
    }),
  });
  const tree = await renderer.render();
  assert.match(treeText(tree), /现在是梁文峰时段！/);
  assert.match(treeText(tree), /未授权/);
});

test("a holiday calendar that does not cover the year is disclosed, never silently trusted", async () => {
  const now = bj("2026-10-19T10:00:00");
  const staleCalendar = { ...weekdayCalendar, coversYear: (year) => year <= 2025 };
  const renderer = createRenderer({ now, body: billingBody(now, { calendar: staleCalendar }) });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /节假日日历尚未覆盖完整计划区间，暂按工作日估算。/);
  assert.match(text, /现在是梁文峰时段！/, "the weekday estimate still renders");
  const reminder = findByClass(tree, "ub-price");
  assert.match(reminder.props.title, /暂按工作日估算/, "the caveat is also in the hover description");
});

test("a countdown that reaches an unannounced year is disclosed as an estimate", async () => {
  // Mid-December: the shipped horizon reaches into 2027, which the 2026-only
  // calendar cannot vouch for. The banner must keep the countdown but add the
  // caveat — otherwise it would promise a cheap window on New Year's Day.
  const now = bj("2026-12-18T10:00:00");
  const renderer = createRenderer({ now, body: billingBody(now) });
  const tree = await renderer.render();
  const text = treeText(tree);
  assert.match(text, /现在是梁文峰时段！/);
  assert.match(text, /节假日日历尚未覆盖完整计划区间，暂按工作日估算。/);
  assert.match(text, /距降价|距涨价/, "the countdown is still shown");
  void renderer;
});

test("no holiday calendar at all is disclosed as an estimate", async () => {
  const now = bj("2026-10-19T10:00:00");
  const renderer = createRenderer({ now, body: billingBody(now, { calendar: null }) });
  const tree = await renderer.render();
  assert.match(treeText(tree), /未安装节假日日历，暂按工作日估算。/);
  assert.equal(findByClass(tree, "ub-price").props["data-phase"], "peak");
});

test("normalizePricing rejects a schedule this build cannot read", () => {
  const unit = loadPanelUnit();
  for (const hostile of [null, undefined, 42, "peak", [], {}, { phase: "cheap" }, { phase: null }]) {
    assert.equal(unit.normalizePricing(hostile), null, `accepted ${JSON.stringify(hostile)}`);
  }
  const normalized = plain(unit.normalizePricing({
    phase: "offpeak",
    asOf: 1000,
    utcOffsetMinutes: 480,
    transitions: [
      { at: 3000, phase: "peak" },
      { at: 2000, phase: "offpeak" },
      { at: "nope", phase: "peak" },
      { at: 4000, phase: "weird" },
    ],
    holidayCalendar: { source: "chinese-days", through: 2026, coversHorizon: true },
  }));
  assert.equal(normalized.phase, "offpeak");
  assert.deepEqual(normalized.transitions.map((entry) => entry.at), [2000, 3000], "transitions are sorted and hostile rows dropped");
  assert.deepEqual(normalized.holidayCalendar, { source: "chinese-days", through: 2026, coversHorizon: true });
  // A malformed calendar is treated as "no calendar" rather than half-used.
  assert.equal(plain(unit.normalizePricing({ phase: "peak", holidayCalendar: { through: "2026" } })).holidayCalendar, null);
});

test("pricingStateAt and the countdown strings cover the units a user can see", () => {
  const unit = loadPanelUnit();
  const schedule = plain(unit.normalizePricing({
    phase: "offpeak",
    transitions: [{ at: 10_000, phase: "peak" }, { at: 20_000, phase: "offpeak" }],
  }));
  assert.deepEqual(plain(unit.pricingStateAt(schedule, 5_000)), { phase: "offpeak", nextAt: 10_000, nextPhase: "peak" });
  assert.deepEqual(plain(unit.pricingStateAt(schedule, 10_000)), { phase: "peak", nextAt: 20_000, nextPhase: "offpeak" });
  assert.deepEqual(plain(unit.pricingStateAt(schedule, 25_000)), { phase: "offpeak", nextAt: null, nextPhase: null });

  const t = translateSeat(unit.zh);
  const startsAt = (offset) => 1_000_000 + offset;
  const now = 1_000_000;
  assert.equal(unit.pricingWhen(t, startsAt(45_000), now), "45 秒");
  assert.equal(unit.pricingWhen(t, startsAt(65_000), now), "1 分钟", "65s must not round up to 2 minutes");
  assert.equal(unit.pricingWhen(t, startsAt(30 * 60_000), now), "30 分钟");
  assert.equal(unit.pricingWhen(t, startsAt(3 * 3_600_000), now), "3 小时");
  assert.equal(unit.pricingWhen(t, startsAt((2 * 60 + 8) * 60_000), now), "2 小时 8 分");
  assert.equal(unit.pricingWhen(t, startsAt((24 * 3_600 - 1) * 1000), now), "23 小时 59 分", "one second short of a day is not 1 天");
  assert.equal(unit.pricingWhen(t, startsAt(26 * 3_600_000), now), "1 天 2 小时");
  assert.equal(unit.pricingWhen(t, startsAt(48 * 3_600_000), now), "2 天");
  assert.equal(unit.pricingWhen(t, now - 1, now), "即将切换");
  assert.equal(unit.pricingWhen(t, now + 400, now), "即将切换", "the last second reads as imminent, not 0 秒");
});

test("both renderers ship the same DeepSeek billing copy and honour the schedule", () => {
  const unit = loadPanelUnit();
  for (const key of ["pricing.peakSlogan", "pricing.offpeakSlogan", "pricing.peakChip", "pricing.offpeakChip"]) {
    assert.ok(dashboardSource.includes(unit.zh[key]), `standalone page lost the zh copy for ${key}`);
  }
  for (const phrase of ["距涨价", "距降价", "北京时间"]) {
    assert.ok(dashboardSource.includes(phrase), `standalone page lost the countdown wording: ${phrase}`);
  }
  // Both renderers must derive the live phase from the host-shipped transitions
  // instead of trusting `asOf`; a static slogan alone would go stale.
  assert.ok(dashboardSource.includes("pricingStateAt"));
  assert.ok(dashboardSource.includes("row.meta.pricing"));
  assert.ok(dashboardSource.includes("coversHorizon"), "both renderers must honour the horizon-coverage flag");
});

test("the billing reminder is styled for both phases", () => {
  assert.ok(styleSource.includes(".ub-price[data-phase=\"peak\"]"));
  assert.ok(styleSource.includes(".ub-price[data-phase=\"offpeak\"]"));
  assert.ok(styleSource.includes(".ub-price-slogan"));
  assert.ok(styleSource.includes(".ub-price-chip"));
  assert.ok(styleSource.includes("var(--ub-warn-soft)"));
  assert.ok(styleSource.includes("var(--ub-ok-soft)"));
});

test("the reminder has complete English copy too", () => {
  const unit = loadPanelUnit();
  const now = bj("2026-10-18T10:51:57");
  const tree = unit.PricingReminder({
    pricing: createPricingSnapshot(now, weekdayCalendar),
    now,
    t: translateSeat(unit.en),
  });
  const text = treeText(tree);
  assert.match(text, /It's Liang Wengu hour!/);
  assert.match(text, /Off-peak · 50% off/);
  assert.match(text, /Price rises in /);
  assert.match(text, /Beijing time/);
  // The peak branch uses the other transliteration and the full-price chip.
  const peak = unit.PricingReminder({
    pricing: createPricingSnapshot(bj("2026-10-19T10:00:00"), weekdayCalendar),
    now: bj("2026-10-19T10:00:00"),
    t: translateSeat(unit.en),
  });
  assert.match(treeText(peak), /It's Liang Wenfeng hour!/);
  assert.match(treeText(peak), /Peak · full price/);
  assert.match(treeText(peak), /Price drops in /);
});
