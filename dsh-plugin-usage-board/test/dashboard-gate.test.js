/**
 * Behavioural checks for the standalone page's auto-refresh gate and its
 * per-provider progressive rendering.
 *
 * `src/host/web/dashboard.html` is served as one self-contained HTML file, so
 * its script has no importable module. These tests execute the committed inline
 * script in a VM with a tiny DOM/timer/fetch stand-in and drive it like a
 * browser: fake clock, fake visibility, fake per-provider HTTP. That is enough
 * to pin the behaviours that are easy to regress:
 *
 *   - the page reads ONE provider per request (`/api/provider?id=…`), so a slow
 *     or hanging upstream holds back only its own card (d0, d5);
 *   - after idling out, the first input triggers one immediate catch-up read
 *     instead of waiting for the next ttl tick (d1);
 *   - stale follow-ups are single-shot (d2), gated (d3), and scale per provider;
 *   - a hidden page / idle page stops reading altogether (d4);
 *   - manual refresh POSTs every provider concurrently and locks the button
 *     while any read is in flight (d6);
 *   - provider failures are rows (HTTP 200) while transport failures become
 *     per-provider failure cards, and a failed refresh never blanks numbers
 *     already on screen (d7–d10);
 *   - replacing the DeepSeek card drops its billing repaint with it (d11);
 *   - the injected provider contract is honoured, with safe defaults (d12).
 *
 * The harness is deliberately not a browser: it only implements what this page
 * touches (getElementById/createElement/appendChild/replaceChildren, activity +
 * visibility listeners, timers, per-provider fetch). Anything that needs real
 * layout/paint belongs in the browser e2e harness, not here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardSource = readFileSync(join(ROOT, "src/host/web/dashboard.html"), "utf8");

const SCRIPT = (() => {
  const blocks = [...dashboardSource.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(blocks.length > 0, "dashboard.html must contain the inline script under test");
  return blocks[blocks.length - 1];
})();

const PROVIDER_IDS = ["deepseek", "glm", "kimi"];
const PROVIDER_PATH = "/usage-board/api/provider";
const PROVIDER_QUERY_PARAM = "id";
const TTL_MS = 60_000;
const IDLE_AFTER_MS = 3 * 60 * 1000;
/** The page's polling constants, asserted against the source by (d0). */
const DASHBOARD_GATE_RECHECK_MS = 30_000;
const STALE_FOLLOW_UP_MS = 1500;

/** The smallest DOM node that survives `el()`/`paintSkeletons()`/`loadProvider()`. */
function makeNode() {
  const handlers = new Map();
  return {
    className: "",
    textContent: "",
    title: "",
    disabled: false,
    style: {},
    children: [],
    childElementCount: 0,
    setAttribute(name, value) {
      this[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      this.childElementCount = this.children.length;
      return child;
    },
    replaceChildren(...next) {
      this.children = next;
      this.childElementCount = next.length;
    },
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    dispatch(type) {
      for (const handler of [...(handlers.get(type) ?? [])]) handler();
    },
  };
}

/** Concatenated text of a rendered subtree, like `textContent` over a real DOM. */
function textOf(node) {
  if (node === undefined || node === null) return "";
  if (node.children.length === 0) return node.textContent;
  return node.children.map(textOf).join(" ");
}

/** Whitespace-normalized text, so assertions do not depend on node boundaries. */
function normText(node) {
  return textOf(node).replace(/\s+/g, " ").trim();
}

/** Every descendant (including `node`) matching `predicate`. */
function findAll(node, predicate, found = []) {
  if (node === undefined || node === null) return found;
  if (predicate(node)) found.push(node);
  for (const child of node.children) findAll(child, predicate, found);
  return found;
}

/**
 * One row per provider, shaped like the host's normalized snapshot (fixtures are
 * inline because this harness never reads the upstream capture files — it drives
 * the page, not the adapters).
 * @param {string} id
 * @param {number} nowMs
 * @returns {object}
 */
function fixtureRow(id, nowMs) {
  if (id === "deepseek") {
    return {
      id,
      label: "DeepSeek",
      status: "ok",
      message: null,
      messageKey: null,
      code: null,
      plan: "按量付费",
      windows: [],
      balances: [{ currency: "CNY", available: 42.5, bonus: 5, totalSpent: 12.25 }],
      account: null,
      meta: {
        host: "platform.deepseek.com",
        pricing: {
          phase: "peak",
          asOf: nowMs,
          utcOffsetMinutes: 480,
          offPeakMultiplier: 0.5,
          holidayCalendar: { source: "chinese-days", through: 2027, coversHorizon: true },
          transitions: [{ at: nowMs + 3_600_000, phase: "offpeak" }],
        },
        dailyUsage: {
          currency: "CNY",
          days: 3,
          points: [
            { date: "2026-10-16", cost: 1.25, tokens: null },
            { date: "2026-10-17", cost: 0, tokens: null },
            { date: "2026-10-18", cost: 2.5, tokens: null },
          ],
        },
      },
      fetchedAt: nowMs,
      latencyMs: 120,
    };
  }
  if (id === "glm") {
    return {
      id,
      label: "GLM Coding Plan",
      status: "ok",
      message: null,
      messageKey: null,
      code: null,
      plan: "Coding Plan",
      windows: [
        {
          id: "glm.5h", labelKey: "glm.5h", unit: 3, number: 5,
          limit: 2000, used: 656, remaining: 1344, percent: 32, derivedPercent: 32.8,
          resetAt: nowMs + 7_200_000, note: null,
        },
        {
          id: "glm.weekly", labelKey: "glm.weekly", unit: 6, number: null,
          limit: 5000, used: 100, remaining: 4900, percent: 2, derivedPercent: 2,
          resetAt: nowMs + 259_200_000, note: null,
        },
      ],
      balances: [],
      account: null,
      meta: { host: "open.bigmodel.cn" },
      fetchedAt: nowMs,
      latencyMs: 240,
    };
  }
  return {
    id,
    label: "Kimi Code",
    status: "ok",
    message: null,
    messageKey: null,
    code: null,
    plan: "Code",
    windows: [{
      id: "kimi.5h", labelKey: "kimi.5h", unit: 3, number: null,
      limit: 100, used: 10, remaining: 90, percent: 10, derivedPercent: 10,
      resetAt: nowMs + 3_600_000, note: null,
    }],
    balances: [],
    account: null,
    meta: { host: "api.moonshot.cn" },
    fetchedAt: nowMs,
    latencyMs: 300,
  };
}

/**
 * Execute the page's inline script against a deterministic clock, DOM, and
 * per-provider HTTP stub.
 *
 * @param {{
 *   now?: number,
 *   hidden?: boolean,
 *   stale?: boolean,
 *   hold?: string[],
 *   transportFail?: string[],
 *   failOnRefresh?: string[],
 *   providerStatus?: Record<string, object>,
 *   providerIds?: string[],
 *   providerPath?: string,
 *   providerQueryParam?: string,
 *   legacyBoot?: boolean,
 * }} [options]
 * @returns {Promise<object>} booted page harness (requests/slots/fire/advance/...).
 */
async function boot(options = {}) {
  let nowMs = typeof options.now === "number" ? options.now : 1_000_000;
  let timerSeq = 0;
  const timers = new Map();
  const requests = [];
  const listeners = new Map();

  const flush = async () => {
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
  };

  const clock = {
    setTimeout(callback, delay) {
      const id = ++timerSeq;
      timers.set(id, { at: nowMs + (typeof delay === "number" ? delay : 0), delay: typeof delay === "number" ? delay : 0, callback, interval: false });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(callback, delay) {
      const step = Math.max(1, typeof delay === "number" ? delay : 1);
      const id = ++timerSeq;
      timers.set(id, { at: nowMs + step, delay: step, callback, interval: true });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
  };

  async function advance(ms) {
    const until = nowMs + ms;
    for (let guard = 0; guard < 100_000; guard += 1) {
      let next = null;
      for (const [id, timer] of timers) {
        if (timer.at <= until && (next === null || timer.at < next.timer.at)) next = { id, timer };
      }
      if (next === null) break;
      nowMs = next.timer.at;
      if (next.timer.interval) next.timer.at = nowMs + next.timer.delay;
      else timers.delete(next.id);
      next.timer.callback();
      await flush();
    }
    nowMs = until;
    await flush();
  }

  const elements = new Map();
  for (const id of ["grid", "updated", "footer", "refresh"]) elements.set(id, makeNode());

  const document = {
    visibilityState: options.hidden === true ? "hidden" : "visible",
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    createElement() {
      return makeNode();
    },
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
  };

  const providerPath = typeof options.providerPath === "string" ? options.providerPath : PROVIDER_PATH;
  const providerQueryParam = typeof options.providerQueryParam === "string" ? options.providerQueryParam : PROVIDER_QUERY_PARAM;
  const bootProviderIds = options.providerIds ?? PROVIDER_IDS;

  const window = {
    // `legacyBoot` is a page served by a host build from before the
    // per-provider split: only the aggregate paths are injected.
    __USAGE_BOARD__: options.legacyBoot === true
      ? { snapshotPath: "/usage-board/api/snapshot", refreshPath: "/usage-board/api/refresh", version: "test" }
      : { snapshotPath: "/usage-board/api/snapshot", refreshPath: "/usage-board/api/refresh", providerPath, providerQueryParam, providerIds: bootProviderIds, version: "test" },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
  };

  const heldProviders = new Set(options.hold ?? []);
  const releases = new Map();
  const transportFail = new Set(options.transportFail ?? []);
  const failOnRefresh = new Set(options.failOnRefresh ?? []);
  const providerStatus = options.providerStatus ?? {};

  /** The provider row the stub synthesizes, with any per-test override applied. */
  function rowFor(id) {
    const base = fixtureRow(id, nowMs);
    const patch = providerStatus[id];
    return patch === undefined ? base : { ...base, ...patch };
  }

  /** The one-row envelope the host contract promises for a provider read. */
  function envelopeFor(id, method) {
    const row = rowFor(id);
    return {
      protocolVersion: 1,
      generatedAt: nowMs,
      ok: row.status === "ok",
      ttlMs: TTL_MS,
      // GET may serve a cache the host is refreshing behind; POST forces a wait.
      stale: options.stale === true && method !== "POST",
      providers: [row],
    };
  }

  class HarnessDate extends Date {
    static now() {
      return nowMs;
    }
  }

  function holdProvider(id) {
    heldProviders.add(id);
  }
  function releaseProvider(id) {
    heldProviders.delete(id);
    const release = releases.get(id);
    releases.delete(id);
    if (typeof release === "function") release();
  }

  const context = vm.createContext({
    window,
    document,
    console,
    Date: HarnessDate,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    fetch: async (url, init = {}) => {
      const method = typeof init.method === "string" ? init.method : "GET";
      let parsed = null;
      try {
        parsed = new URL(String(url), "http://usage-board.test");
      } catch {
        parsed = null;
      }
      const id = parsed === null ? null : parsed.searchParams.get(providerQueryParam);
      requests.push({ url: String(url), path: parsed === null ? null : parsed.pathname, id, method, at: nowMs });
      if (transportFail.has(id)) throw new Error("simulated transport failure");
      if (method === "POST" && failOnRefresh.has(id)) throw new Error("simulated refresh failure");
      // A held provider answers only when the test releases it, which is how a
      // slow/hanging upstream is simulated without a real clock.
      if (heldProviders.has(id)) await new Promise((resolve) => { releases.set(id, resolve); });
      return { ok: true, status: 200, json: async () => envelopeFor(id, method) };
    },
  });

  new vm.Script(SCRIPT, { filename: "dashboard-inline.js" }).runInContext(context);
  await flush();

  const slots = () => elements.get("grid").children;

  return {
    requests,
    document,
    elements,
    now: () => nowMs,
    advance,
    flush,
    slots,
    fire(type) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
    clickRefresh() {
      elements.get("refresh").dispatch("click");
    },
    holdProvider,
    releaseProvider,
    /** Text of one provider slot, in display order. */
    slotText(index) {
      const slot = slots()[index];
      return slot === undefined ? "" : normText(slot);
    },
    /** Provider label painted in each slot; null while that slot is a skeleton. */
    labels() {
      return slots().map((slot) => {
        const painted = slot.children[0];
        if (painted === undefined) return null;
        const heading = painted.children[0];
        const label = heading === undefined ? undefined : heading.children[0];
        return label === undefined ? null : label.textContent;
      });
    },
  };
}

test("(d0) the page carries the constants and per-provider contract these tests rely on", () => {
  assert.match(dashboardSource, /const IDLE_AFTER_MS\s*=\s*3 \* 60 \* 1000;/);
  assert.match(dashboardSource, /const GATE_RECHECK_MS\s*=\s*30 \* 1000;/);
  assert.match(dashboardSource, /setInterval\(evaluateGate,\s*GATE_RECHECK_MS\)/);
  assert.match(dashboardSource, /loadProvider\(id, false, true\)/, "the stale follow-up must be identifiable as a follow-up");
  assert.match(dashboardSource, /boot\.providerPath/);
  assert.match(dashboardSource, /boot\.providerIds/);
  assert.ok(!SCRIPT.includes(".innerHTML"), "cards must be built with textContent, never innerHTML");
  assert.ok(!SCRIPT.includes("snapshotPath"), "the page reads one provider per request, not the aggregate snapshot route");
  assert.ok(!SCRIPT.includes("refreshPath"), "the page must not fall back to the aggregate refresh route");
});

test("(d1) the first input after idling out triggers one immediate catch-up read per provider", async () => {
  const page = await boot();
  assert.deepEqual(page.requests.map((request) => request.id), PROVIDER_IDS, "the initial load reads every provider once");
  assert.ok(page.requests.every((request) => request.path === PROVIDER_PATH), "reads go through the per-provider route");
  assert.ok(page.requests.every((request) => request.method === "GET"), "the serving read is a GET");

  // Idle out and let one skipped ttl tick record the closed gate: reads at
  // 60/120/180 s, the 240 s tick is skipped.
  await page.advance(IDLE_AFTER_MS + TTL_MS);
  const quiet = page.requests.length;
  assert.equal(quiet, 12, "the ttl schedule reads all three providers until the idle budget passes, then pauses");
  assert.ok(page.requests.every((request) => request.method === "GET"), "auto refresh reads providers with GET");

  page.fire("pointerdown");
  await page.flush();
  assert.equal(page.requests.length, quiet + 3, "activity after idling out must reload every provider immediately");
});

test("(d2) a stale answer schedules exactly one follow-up per provider and never chains", async () => {
  const page = await boot({ stale: true });
  assert.equal(page.requests.length, 3);

  await page.advance(STALE_FOLLOW_UP_MS + 1_000);
  assert.equal(page.requests.length, 6, "the bounded follow-up fires once for each stale provider");
  assert.deepEqual(page.requests.slice(3).map((request) => request.method), ["GET", "GET", "GET"], "the follow-up is a serving GET");

  // The follow-ups themselves came back stale; they must not schedule another.
  await page.advance(10_000);
  assert.equal(page.requests.length, 6, "a stale follow-up response must not chain");
});

test("(d3) a follow-up is not sent while the page is hidden", async () => {
  const page = await boot({ stale: true });
  assert.equal(page.requests.length, 3);

  page.document.visibilityState = "hidden";
  page.fire("visibilitychange");
  await page.advance(3_000);
  assert.equal(page.requests.length, 3, "a hidden page must not send the follow-ups");

  page.document.visibilityState = "visible";
  page.fire("visibilitychange");
  await page.flush();
  assert.equal(page.requests.length, 6, "coming back to the window fetches every provider immediately");
});

test("(d4) a hidden page still skips its ttl reads until it is visible again", async () => {
  const page = await boot();
  assert.equal(page.requests.length, 3);

  page.document.visibilityState = "hidden";
  page.fire("visibilitychange");
  await page.advance(TTL_MS + 5_000);
  assert.equal(page.requests.length, 3, "no polling while hidden");

  page.document.visibilityState = "visible";
  page.fire("visibilitychange");
  await page.flush();
  assert.equal(page.requests.length, 6, "the reopen catch-up refreshes every provider");
});

test("(d5) a delayed provider never holds back the cards that already answered", async () => {
  const page = await boot({ hold: ["deepseek"] });
  await page.flush();
  assert.equal(page.requests.length, 3, "every provider read starts at boot instead of one after another");

  const slots = page.slots();
  assert.equal(slots.length, 3, "one stable slot per provider keeps the display order");
  assert.equal(slots[0].children[0].className, "skeleton", "the slow provider is still a skeleton");
  assert.equal(slots[1].children[0].className, "card", "GLM answered and painted on its own card");
  assert.equal(slots[2].children[0].className, "card", "Kimi answered and painted on its own card");
  assert.match(page.slotText(1), /GLM Coding Plan/);
  assert.match(page.slotText(2), /Kimi Code/);
  assert.match(page.elements.get("updated").textContent, /正在刷新…/, "the header says the board is still filling in");
  assert.equal(page.elements.get("refresh").disabled, true, "refresh stays disabled while any read is in flight");

  const glmCard = slots[1].children[0];
  page.releaseProvider("deepseek");
  await page.flush();
  assert.equal(slots[0].children[0].className, "card", "the delayed provider's own card appears when it answers");
  assert.match(page.slotText(0), /DeepSeek/);
  assert.equal(slots[1].children[0], glmCard, "an answered card is not rebuilt when another provider lands");
  assert.deepEqual(page.labels(), ["DeepSeek", "GLM Coding Plan", "Kimi Code"], "cards stay in providerIds order");
  assert.equal(page.elements.get("updated").textContent, "刚刚更新");
  assert.equal(page.elements.get("refresh").disabled, false);
});

test("(d6) manual refresh POSTs every provider concurrently and locks the button", async () => {
  const page = await boot();
  await page.flush();
  assert.equal(page.requests.length, 3);

  page.holdProvider("glm");
  page.clickRefresh();
  await page.flush();
  const forced = page.requests.slice(3);
  assert.equal(forced.length, 3, "one forced read per provider");
  assert.deepEqual(forced.map((request) => request.id), PROVIDER_IDS);
  assert.ok(forced.every((request) => request.method === "POST"), "manual refresh forces fresh per-provider reads");
  assert.equal(page.elements.get("refresh").disabled, true, "the button stays locked while a provider read is in flight");

  page.releaseProvider("glm");
  await page.flush();
  assert.equal(page.requests.length, 6, "nothing beyond the requested cycle was fired");
  assert.equal(page.elements.get("refresh").disabled, false);
});

test("(d7) a provider failure is a card and a degraded header, not a transport error", async () => {
  const page = await boot({
    providerStatus: { glm: { status: "unauthorized", message: "credentials rejected", messageKey: "authRejected", code: "401" } },
  });
  await page.flush();
  assert.equal(page.requests.length, 3, "a degraded provider still counts as an answered read");
  assert.equal(page.slots()[1].children[0].className, "card");
  assert.match(page.slotText(1), /GLM Coding Plan/);
  assert.match(page.slotText(1), /未授权/);
  assert.match(page.slotText(1), /凭据被服务方拒绝，可能已过期或填错。/, "the messageKey translation is preserved");
  assert.equal(page.elements.get("updated").textContent, "刚刚更新 · 部分服务异常");
  assert.equal(page.elements.get("footer").textContent, "插件 vtest · 缓存 60 秒 · 协议 v1");
});

test("(d8) a transport failure paints only that provider's card", async () => {
  const page = await boot({ transportFail: ["glm"] });
  await page.flush();
  assert.equal(page.requests.length, 3, "every provider still gets its own read");
  assert.equal(page.slots()[0].children[0].className, "card");
  assert.equal(page.slots()[1].children[0].className, "card");
  assert.match(page.slotText(1), /GLM Coding Plan/);
  assert.match(page.slotText(1), /读取失败/);
  assert.match(page.slotText(1), /无法读取该服务的用量数据。/, "the failure card keeps the page's Chinese wording");
  assert.match(page.slotText(1), /simulated transport failure/);
  assert.match(page.slotText(2), /Kimi Code/);
  assert.equal(page.elements.get("updated").textContent, "刚刚更新 · 部分服务异常");
});

test("(d9) a board where nothing answered reports failure instead of a false age", async () => {
  const page = await boot({ transportFail: PROVIDER_IDS });
  await page.flush();
  assert.equal(page.elements.get("updated").textContent, "读取失败");
  assert.equal(page.slots().length, 3, "one failure card per provider");
  assert.match(page.slotText(0), /无法读取该服务的用量数据。/);
  assert.equal(page.elements.get("footer").textContent, "", "no envelope answered, so the footer stays empty");
});

test("(d10) a failed forced refresh keeps the numbers already on screen", async () => {
  const page = await boot({ failOnRefresh: ["glm"] });
  await page.flush();
  const glmCard = page.slots()[1].children[0];
  const before = page.slotText(1);
  assert.match(before, /656/, "the GLM card showed its quota numbers");

  page.clickRefresh();
  await page.flush();
  assert.equal(page.requests.length, 6);
  assert.equal(page.slots()[1].children[0], glmCard, "the failed refresh did not blank the known numbers");
  assert.equal(page.slotText(1), before);
  assert.equal(page.elements.get("updated").textContent, "刚刚更新 · 部分服务异常");
  assert.equal(page.elements.get("refresh").disabled, false);
});

test("(d11) replacing the DeepSeek card unregisters its billing repaint", async () => {
  const page = await boot();
  await page.flush();
  const slot = page.slots()[0];
  const oldCard = slot.children[0];
  const oldPrice = findAll(oldCard, (node) => typeof node.className === "string" && node.className.startsWith("price"))[0];
  assert.ok(oldPrice, "the DeepSeek card carries the peak/off-peak reminder");
  const detachedChildren = oldPrice.children;

  page.holdProvider("deepseek");
  page.clickRefresh();
  await page.flush();
  page.releaseProvider("deepseek");
  await page.flush();
  assert.notEqual(slot.children[0], oldCard, "the DeepSeek card was replaced in place");
  assert.ok(
    findAll(slot.children[0], (node) => node.className === "price peak" || node.className === "price offpeak").length > 0,
    "the new card still ticks",
  );

  await page.advance(2_000);
  assert.equal(oldPrice.children, detachedChildren, "the detached card's once-a-second repaint was dropped with it");
});

test("(d12) the injected provider contract is used, with safe defaults for an older host", async () => {
  const custom = await boot({ providerIds: ["glm", "kimi"], providerPath: "/custom/provider", providerQueryParam: "provider" });
  await custom.flush();
  assert.deepEqual(custom.requests.map((request) => request.id), ["glm", "kimi"], "only the injected providers are read");
  assert.ok(custom.requests.every((request) => request.url.startsWith("/custom/provider?provider=")), "the injected path and query parameter are used");
  assert.deepEqual(custom.labels(), ["GLM Coding Plan", "Kimi Code"]);

  const legacy = await boot({ legacyBoot: true });
  await legacy.flush();
  assert.equal(legacy.requests.length, 3, "a boot object without provider fields still reads every provider");
  assert.ok(legacy.requests.every((request) => request.url.startsWith(PROVIDER_PATH + "?")), "the default provider route is used");
  assert.ok(legacy.requests.every((request) => request.method === "GET"));
  assert.deepEqual(legacy.requests.map((request) => request.id), PROVIDER_IDS);
  assert.equal(legacy.elements.get("updated").textContent, "刚刚更新");
});
