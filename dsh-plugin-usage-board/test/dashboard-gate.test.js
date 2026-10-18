/**
 * Behavioural checks for the standalone page's auto-refresh gate.
 *
 * `src/host/web/dashboard.html` is served as one self-contained HTML file, so
 * its gate has no importable module. These tests execute the committed inline
 * script in a VM with a tiny DOM/timer stand-in and drive it like a browser:
 * fake clock, fake visibility, fake fetch. That is enough to pin the two
 * behaviours that used to be wrong:
 *
 *   - after idling out, the first input triggers one immediate catch-up read
 *     instead of waiting for the next ttl tick (d1);
 *   - the stale follow-up is single-shot (d2) and never fires while the gate is
 *     closed (d3) — a hidden tab used to keep the 1.5 s chain alive.
 *
 * The harness is deliberately not a browser: it only implements what this page
 * touches (getElementById/createElement/appendChild/replaceChildren, activity +
 * visibility listeners, timers). Anything that needs real layout/paint belongs
 * in the browser e2e harness, not here.
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

const TTL_MS = 60_000;
const IDLE_AFTER_MS = 3 * 60 * 1000;
/** The page's polling constants, asserted against the source by (d0). */
const DASHBOARD_GATE_RECHECK_MS = 30_000;
const STALE_FOLLOW_UP_MS = 1500;

/** The smallest DOM node that survives `el()`/`skeletons()`/`load()`. */
function makeNode() {
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
    addEventListener() {},
  };
}

/**
 * Execute the page's inline script against a deterministic clock and DOM.
 * @param {{ stale?: boolean, hidden?: boolean, now?: number }} [options]
 * @returns {Promise<object>} booted page harness (requests/fire/advance/...).
 */
async function boot(options = {}) {
  let nowMs = typeof options.now === "number" ? options.now : 1_000_000;
  let timerSeq = 0;
  const timers = new Map();
  const requests = [];
  const listeners = new Map();

  const flush = async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
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

  const window = {
    __USAGE_BOARD__: {
      snapshotPath: "/usage-board/api/snapshot",
      refreshPath: "/usage-board/api/refresh",
      version: "test",
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
  };

  const envelope = () => ({
    protocolVersion: 1,
    generatedAt: nowMs,
    ok: true,
    ttlMs: TTL_MS,
    stale: options.stale === true,
    providers: [],
  });

  class HarnessDate extends Date {
    static now() {
      return nowMs;
    }
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
    fetch: async (url) => {
      requests.push({ url: String(url), at: nowMs });
      return { ok: true, status: 200, json: async () => envelope() };
    },
  });

  new vm.Script(SCRIPT, { filename: "dashboard-inline.js" }).runInContext(context);
  await flush();

  return {
    requests,
    document,
    elements,
    now: () => nowMs,
    advance,
    flush,
    fire(type) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
  };
}

test("(d0) the page carries the gate constants these tests rely on", () => {
  assert.match(dashboardSource, /const IDLE_AFTER_MS\s*=\s*3 \* 60 \* 1000;/);
  assert.match(dashboardSource, /const GATE_RECHECK_MS\s*=\s*30 \* 1000;/);
  assert.match(dashboardSource, /setInterval\(evaluateGate,\s*GATE_RECHECK_MS\)/);
  assert.match(dashboardSource, /load\(false,\s*true\)/, "the stale follow-up must be identifiable as a follow-up");
});

test("(d1) the first input after idling out triggers one immediate catch-up read", async () => {
  const page = await boot();
  assert.equal(page.requests.length, 1, "the initial load still happens");

  // Idle out and let one skipped ttl tick record the closed gate: reads at
  // 60/120/180 s, the 240 s tick is skipped.
  await page.advance(IDLE_AFTER_MS + TTL_MS);
  const quiet = page.requests.length;
  assert.equal(quiet, 4, "the ttl schedule reads until the idle budget passes, then pauses");

  page.fire("pointerdown");
  await page.flush();
  assert.equal(page.requests.length, quiet + 1, "activity after idling out must reload immediately");
});

test("(d2) a stale answer schedules exactly one follow-up read", async () => {
  const page = await boot({ stale: true });
  assert.equal(page.requests.length, 1);

  await page.advance(STALE_FOLLOW_UP_MS + 1000);
  assert.equal(page.requests.length, 2, "the one bounded follow-up fires");

  // The follow-up itself came back stale; it must not schedule another one.
  await page.advance(10_000);
  assert.equal(page.requests.length, 2, "a stale follow-up response must not chain");
});

test("(d3) a follow-up is not sent while the page is hidden", async () => {
  const page = await boot({ stale: true });
  assert.equal(page.requests.length, 1);

  page.document.visibilityState = "hidden";
  page.fire("visibilitychange");
  await page.advance(3_000);
  assert.equal(page.requests.length, 1, "a hidden page must not send the follow-up");

  page.document.visibilityState = "visible";
  page.fire("visibilitychange");
  await page.flush();
  assert.equal(page.requests.length, 2, "coming back to the window fetches immediately");
});

test("(d4) a hidden page still skips its ttl reads until it is visible again", async () => {
  const page = await boot();
  assert.equal(page.requests.length, 1);

  page.document.visibilityState = "hidden";
  page.fire("visibilitychange");
  await page.advance(TTL_MS + 5_000);
  assert.equal(page.requests.length, 1, "no polling while hidden");

  page.document.visibilityState = "visible";
  page.fire("visibilitychange");
  await page.flush();
  assert.equal(page.requests.length, 2, "the reopen catch-up refreshes the stale numbers");
});
