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
 *   - the injected provider contract is honoured, with safe defaults (d12);
 *   - the DeepSeek spend history reads as 近一周/近一月 totals over exactly the
 *     last 7 days of bars, zero-cost days included (d13–d15).
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

const PROVIDER_IDS = ["deepseek", "glm", "kimi", "opencode-go"];
const PROVIDER_COUNT = PROVIDER_IDS.length;
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

/** The spend-trend bar slots of a rendered card, in chart order. */
function chartBars(card) {
  return findAll(card, (node) => node.className === "bar" || node.className === "bar empty");
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
          days: 30,
          // A trailing 30-day series, oldest first (2026-09-19 → 2026-10-18).
          // First 23 days sum 10.50; the last 7 (the chart window) sum 7.50, so
          // the month total (18.00) is distinguishable from the week total and
          // from a 14-point window (also 7.50). Oct 12, 14 and 17 are zero-cost.
          points: [
            { date: "2026-09-19", cost: 0.5, tokens: null },
            { date: "2026-09-20", cost: 0, tokens: null },
            { date: "2026-09-21", cost: 0, tokens: null },
            { date: "2026-09-22", cost: 1, tokens: null },
            { date: "2026-09-23", cost: 0, tokens: null },
            { date: "2026-09-24", cost: 0, tokens: null },
            { date: "2026-09-25", cost: 0, tokens: null },
            { date: "2026-09-26", cost: 2, tokens: null },
            { date: "2026-09-27", cost: 0, tokens: null },
            { date: "2026-09-28", cost: 0, tokens: null },
            { date: "2026-09-29", cost: 0, tokens: null },
            { date: "2026-09-30", cost: 3, tokens: null },
            { date: "2026-10-01", cost: 0, tokens: null },
            { date: "2026-10-02", cost: 0, tokens: null },
            { date: "2026-10-03", cost: 0, tokens: null },
            { date: "2026-10-04", cost: 4, tokens: null },
            { date: "2026-10-05", cost: 0, tokens: null },
            { date: "2026-10-06", cost: 0, tokens: null },
            { date: "2026-10-07", cost: 0, tokens: null },
            { date: "2026-10-08", cost: 0, tokens: null },
            { date: "2026-10-09", cost: 0, tokens: null },
            { date: "2026-10-10", cost: 0, tokens: null },
            { date: "2026-10-11", cost: 0, tokens: null },
            { date: "2026-10-12", cost: 0, tokens: null },
            { date: "2026-10-13", cost: 1.5, tokens: null },
            { date: "2026-10-14", cost: 0, tokens: null },
            { date: "2026-10-15", cost: 2.25, tokens: null },
            { date: "2026-10-16", cost: 3, tokens: null },
            { date: "2026-10-17", cost: 0, tokens: null },
            { date: "2026-10-18", cost: 0.75, tokens: null },
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
  if (id === "opencode-go") {
    return {
      id,
      label: "OpenCode Go",
      status: "ok",
      message: null,
      messageKey: null,
      code: null,
      plan: null,
      // Percent-only windows: no absolute counters exist upstream.
      windows: [
        {
          id: "opencode-go.5h", labelKey: "opencode-go.5h", unit: "5h", number: null,
          limit: null, used: null, remaining: null, percent: 42.5, derivedPercent: null,
          resetAt: nowMs + 3_600_000, note: null,
        },
        {
          id: "opencode-go.weekly", labelKey: "opencode-go.weekly", unit: "weekly", number: null,
          limit: null, used: null, remaining: null, percent: 30, derivedPercent: null,
          resetAt: nowMs + 86_400_000, note: null,
        },
        {
          id: "opencode-go.monthly", labelKey: "opencode-go.monthly", unit: "monthly", number: null,
          limit: null, used: null, remaining: null, percent: 12.5, derivedPercent: null,
          resetAt: nowMs + 2_592_000_000, note: null,
        },
      ],
      balances: [],
      account: null,
      meta: {
        host: "opencode.ai",
        source: "zen-go-usage-api",
        windowStatus: { "opencode-go.5h": "ok", "opencode-go.weekly": "ok", "opencode-go.monthly": "ok" },
      },
      fetchedAt: nowMs,
      latencyMs: 180,
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
  for (const id of ["grid", "updated", "footer", "refresh", "subtitle", "empty"]) elements.set(id, makeNode());
  // The empty-state paragraph carries its copy in the document markup; this DOM
  // stub does not parse HTML, so seed the same text here.
  elements.get("empty").textContent = "实例还没有配置任何服务。";

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
  assert.equal(quiet, PROVIDER_COUNT * 4, "the ttl schedule reads every provider until the idle budget passes, then pauses");
  assert.ok(page.requests.every((request) => request.method === "GET"), "auto refresh reads providers with GET");

  page.fire("pointerdown");
  await page.flush();
  assert.equal(page.requests.length, quiet + PROVIDER_COUNT, "activity after idling out must reload every provider immediately");
});

test("(d2) a stale answer schedules exactly one follow-up per provider and never chains", async () => {
  const page = await boot({ stale: true });
  assert.equal(page.requests.length, PROVIDER_COUNT);

  await page.advance(STALE_FOLLOW_UP_MS + 1_000);
  assert.equal(page.requests.length, PROVIDER_COUNT * 2, "the bounded follow-up fires once for each stale provider");
  assert.ok(
    page.requests.slice(PROVIDER_COUNT).every((request) => request.method === "GET"),
    "the follow-up is a serving GET",
  );

  // The follow-ups themselves came back stale; they must not schedule another.
  await page.advance(10_000);
  assert.equal(page.requests.length, PROVIDER_COUNT * 2, "a stale follow-up response must not chain");
});

test("(d3) a follow-up is not sent while the page is hidden", async () => {
  const page = await boot({ stale: true });
  assert.equal(page.requests.length, PROVIDER_COUNT);

  page.document.visibilityState = "hidden";
  page.fire("visibilitychange");
  await page.advance(3_000);
  assert.equal(page.requests.length, PROVIDER_COUNT, "a hidden page must not send the follow-ups");

  page.document.visibilityState = "visible";
  page.fire("visibilitychange");
  await page.flush();
  assert.equal(page.requests.length, PROVIDER_COUNT * 2, "coming back to the window fetches every provider immediately");
});

test("(d4) a hidden page still skips its ttl reads until it is visible again", async () => {
  const page = await boot();
  assert.equal(page.requests.length, PROVIDER_COUNT);

  page.document.visibilityState = "hidden";
  page.fire("visibilitychange");
  await page.advance(TTL_MS + 5_000);
  assert.equal(page.requests.length, PROVIDER_COUNT, "no polling while hidden");

  page.document.visibilityState = "visible";
  page.fire("visibilitychange");
  await page.flush();
  assert.equal(page.requests.length, PROVIDER_COUNT * 2, "the reopen catch-up refreshes every provider");
});

test("(d5) a delayed provider never holds back the cards that already answered", async () => {
  const page = await boot({ hold: ["deepseek"] });
  await page.flush();
  assert.equal(page.requests.length, PROVIDER_COUNT, "every provider read starts at boot instead of one after another");

  const slots = page.slots();
  assert.equal(slots.length, PROVIDER_COUNT, "one stable slot per provider keeps the display order");
  assert.equal(slots[0].children[0].className, "skeleton", "the slow provider is still a skeleton");
  assert.equal(slots[1].children[0].className, "card", "GLM answered and painted on its own card");
  assert.equal(slots[2].children[0].className, "card", "Kimi answered and painted on its own card");
  assert.equal(slots[3].children[0].className, "card", "OpenCode Go answered and painted on its own card");
  assert.match(page.slotText(1), /GLM Coding Plan/);
  assert.match(page.slotText(2), /Kimi Code/);
  assert.match(page.slotText(3), /OpenCode Go/);
  assert.match(page.elements.get("updated").textContent, /正在刷新…/, "the header says the board is still filling in");
  assert.equal(page.elements.get("refresh").disabled, true, "refresh stays disabled while any read is in flight");

  const glmCard = slots[1].children[0];
  page.releaseProvider("deepseek");
  await page.flush();
  assert.equal(slots[0].children[0].className, "card", "the delayed provider's own card appears when it answers");
  assert.match(page.slotText(0), /DeepSeek/);
  assert.equal(slots[1].children[0], glmCard, "an answered card is not rebuilt when another provider lands");
  assert.deepEqual(
    page.labels(),
    ["DeepSeek", "GLM Coding Plan", "Kimi Code", "OpenCode Go"],
    "cards stay in providerIds order",
  );
  assert.equal(page.elements.get("updated").textContent, "刚刚更新");
  assert.equal(page.elements.get("refresh").disabled, false);
});

test("(d6) manual refresh POSTs every provider concurrently and locks the button", async () => {
  const page = await boot();
  await page.flush();
  assert.equal(page.requests.length, PROVIDER_COUNT);

  page.holdProvider("glm");
  page.clickRefresh();
  await page.flush();
  const forced = page.requests.slice(PROVIDER_COUNT);
  assert.equal(forced.length, PROVIDER_COUNT, "one forced read per provider");
  assert.deepEqual(forced.map((request) => request.id), PROVIDER_IDS);
  assert.ok(forced.every((request) => request.method === "POST"), "manual refresh forces fresh per-provider reads");
  assert.equal(page.elements.get("refresh").disabled, true, "the button stays locked while a provider read is in flight");

  page.releaseProvider("glm");
  await page.flush();
  assert.equal(page.requests.length, PROVIDER_COUNT * 2, "nothing beyond the requested cycle was fired");
  assert.equal(page.elements.get("refresh").disabled, false);
});

test("(d7) a provider failure is a card and a degraded header, not a transport error", async () => {
  const page = await boot({
    providerStatus: { glm: { status: "unauthorized", message: "credentials rejected", messageKey: "authRejected", code: "401" } },
  });
  await page.flush();
  assert.equal(page.requests.length, PROVIDER_COUNT, "a degraded provider still counts as an answered read");
  assert.equal(page.slots()[1].children[0].className, "card");
  assert.match(page.slotText(1), /GLM Coding Plan/);
  assert.match(page.slotText(1), /未授权/);
  assert.match(page.slotText(1), /凭据被服务方拒绝，可能已过期或填错。/, "the messageKey translation is preserved");
  assert.equal(page.elements.get("updated").textContent, "刚刚更新 · 部分服务异常");
  assert.equal(page.elements.get("footer").textContent, "插件 vtest · 缓存 60 秒 · 协议 v1");
});

test("(d7b) an unconfigured provider has no card and does not degrade the board", async () => {
  const page = await boot({
    providerStatus: {
      glm: {
        status: "not-configured",
        message: "Set ZAI_CODING_CN_API_KEY to show the GLM Coding Plan quota.",
        messageKey: "notConfigured",
        windows: [],
        balances: [],
      },
    },
  });
  await page.flush();
  const slots = page.slots();
  assert.equal(slots.length, PROVIDER_COUNT, "the slot stays so a later credential can paint into it");
  assert.equal(slots[1].children.length, 0, "the unconfigured slot paints nothing at all");
  assert.deepEqual(page.labels().filter(Boolean), ["DeepSeek", "Kimi Code", "OpenCode Go"]);
  assert.ok(!page.slotText(1).includes("未配置"), "there is no placeholder card to read");
  assert.equal(page.elements.get("empty").hidden, true, "other providers have cards, so the board is not empty");
  assert.equal(page.elements.get("subtitle").textContent, "DeepSeek · Kimi Code · OpenCode Go");
  assert.equal(
    page.elements.get("updated").textContent,
    "刚刚更新",
    "a missing credential is not a degraded service",
  );
});

test("(d7c) a board whose every provider is unconfigured shows the empty state", async () => {
  const unconfigured = {
    status: "not-configured",
    message: "no credential",
    messageKey: "notConfigured",
    windows: [],
    balances: [],
  };
  const page = await boot({
    providerStatus: Object.fromEntries(PROVIDER_IDS.map((id) => [id, unconfigured])),
  });
  await page.flush();
  assert.equal(page.elements.get("empty").hidden, false);
  assert.match(page.elements.get("empty").textContent, /实例还没有配置任何服务/);
  assert.deepEqual(page.labels().filter(Boolean), [], "no provider owns a card");
  assert.equal(page.elements.get("subtitle").textContent, "", "a settled empty board names no service");
  assert.equal(page.elements.get("updated").textContent, "刚刚更新");
});

test("(d8) a transport failure paints only that provider's card", async () => {
  const page = await boot({ transportFail: ["glm"] });
  await page.flush();
  assert.equal(page.requests.length, PROVIDER_COUNT, "every provider still gets its own read");
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
  assert.equal(page.slots().length, PROVIDER_COUNT, "one failure card per provider");
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
  assert.equal(page.requests.length, PROVIDER_COUNT * 2);
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
  assert.equal(legacy.requests.length, PROVIDER_COUNT, "a boot object without provider fields still reads every provider");
  assert.ok(legacy.requests.every((request) => request.url.startsWith(PROVIDER_PATH + "?")), "the default provider route is used");
  assert.ok(legacy.requests.every((request) => request.method === "GET"));
  assert.deepEqual(legacy.requests.map((request) => request.id), PROVIDER_IDS);
  assert.equal(legacy.elements.get("updated").textContent, "刚刚更新");
});

test("(d13) the DeepSeek spend trend is 近一周/近一月 history over the last 7 days", async () => {
  const page = await boot();
  await page.flush();
  const card = page.slots()[0].children[0];
  const text = page.slotText(0);
  assert.match(text, /近一周 ¥7\.50/, "the week stat sums the trailing 7 points");
  assert.match(text, /近一月 ¥18\.00/, "the month stat sums the trailing 30 points, not the plotted window");
  assert.match(text, /2026-10-12 → 2026-10-18/, "the range note covers exactly the plotted window");
  assert.ok(!/近 \d+ 天消耗/.test(text), "the old single-total trend header is gone");
  assert.ok(!/剩余|额度|配额/.test(text), "spend history must never read as remaining allowance");

  const bars = chartBars(card);
  assert.equal(bars.length, 7, "the chart draws exactly the last 7 days");
  assert.deepEqual(
    bars.map((bar) => bar.className === "bar empty"),
    [true, false, true, false, false, true, false],
    "zero-cost days keep their slot instead of shortening the chart",
  );
  assert.ok(bars.every((bar) => /^2026-10-\d{2} · ¥\d+\.\d{2}$/.test(bar.title)), "every bar keeps its date + amount tooltip");
});

test("(d14) zero-cost days keep a visible stub and the chart describes itself", async () => {
  const page = await boot();
  await page.flush();
  const card = page.slots()[0].children[0];

  for (const bar of chartBars(card)) {
    const percent = Number(/height:([\d.]+)%/.exec(bar.style)?.[1]);
    assert.ok(Number.isFinite(percent) && percent >= 2, "every bar, zero-cost days included, has a visible inline height");
  }
  assert.match(dashboardSource, /\.bar\.empty\s*\{[^}]*min-height:\s*2px/, "the empty stub keeps a 2px floor in a short chart");

  const chart = findAll(card, (node) => node.className === "bars")[0];
  assert.ok(chart, "the chart container exists");
  const label = chart["aria-label"];
  assert.match(label, /近 7 天消耗趋势（2026-10-12 → 2026-10-18）/, "the label names the plotted window");
  assert.match(label, /近一周 ¥7\.50/);
  assert.match(label, /近一月 ¥18\.00/);
  assert.ok(!/剩余|额度|配额|remaining|allowance/i.test(label), "the label is history, never allowance");
});

test("(d15) a shorter series totals only the points the host shipped", async () => {
  const points = [
    { date: "2026-10-16", cost: 1.25, tokens: null },
    { date: "2026-10-17", cost: 0, tokens: null },
    { date: "2026-10-18", cost: 2.5, tokens: null },
  ];
  const page = await boot({
    providerStatus: { deepseek: { meta: { dailyUsage: { currency: "CNY", days: 7, points } } } },
  });
  await page.flush();
  const text = page.slotText(0);
  assert.match(text, /近一周 ¥3\.75/, "a week window shorter than 7 days sums what exists");
  assert.match(text, /近一月 ¥3\.75/, "a month window shorter than 30 days sums what exists");
  assert.match(text, /2026-10-16 → 2026-10-18/, "the range note follows the shorter series");
  assert.equal(chartBars(page.slots()[0].children[0]).length, 3, "the chart never invents missing days");
});

test("(d16) the 5-hour windows also print the exact reset clock time", async () => {
  const page = await boot();
  await page.flush();

  // GLM: the 5-hour window keeps its countdown and gains the local reset clock
  // time to the minute; the weekly window keeps the compact countdown only.
  const glm = page.slotText(1);
  assert.match(glm, /5 小时窗口/);
  assert.match(glm, /\d{2}:\d{2} 重置（2 小时后）/, "the 5-hour reset gives both the exact minute and the countdown");
  assert.match(glm, /3 天后重置/, "the weekly window still shows its countdown");
  assert.ok(!/3 天后重置（/.test(glm), "a weekly reset does not grow the exact-time parenthesis");

  // Kimi's 5-hour window gets the same treatment.
  assert.match(page.slotText(2), /\d{2}:\d{2} 重置（1 小时后）/);

  // The renderers that carry that decision live in the page itself.
  assert.match(dashboardSource, /function windowResetText\(win\)/);
  assert.match(dashboardSource, /function resetClockText\(resetAt\)/);
  assert.match(dashboardSource, /function isFiveHourWindow\(win\)/);
});
