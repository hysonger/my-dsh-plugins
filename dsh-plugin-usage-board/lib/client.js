/**
 * dsh-plugin-usage-board — DSH Web client-module bundle.
 *
 * ASSEMBLED FROM, and byte-identical to, these source files:
 *   - src/client/protocol-copy.js  (itself generated from src/shared/protocol.js)
 *   - src/client/panel.js
 *   - src/client/styles.css        (embedded below as the PANEL_CSS string)
 * test/client-bundle.test.js asserts each embedded region still matches its
 * source file byte for byte, so edit the sources and regenerate rather than
 * editing the embedded regions here.
 *
 * Format: DSH's @deepseek-ai/dsh-client-modules serves every package whose
 * package.json declares `dsh.client` as a combo script that calls
 * window.__ModuleLoader__.load({ id, factory }). The factory receives the
 * module-table `require`, returns module.exports, and must export `apply` and
 * `inject`.
 *
 * require() aliases used: "react" and "react/jsx-runtime" only. Both are
 * members of the shell's frozen platform module table, so neither needs a
 * dsh.client.external entry.
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-usage-board",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const jsxRuntime = require("react/jsx-runtime");

    //#region src/client/styles.css — embedded verbatim
    const PANEL_CSS = `/* dsh-plugin-usage-board — client panel styles.
 *
 * Embedded VERBATIM inside lib/client.js (as the PANEL_CSS string literal) and
 * injected once into <head> by the bundle. test/client-bundle.test.js asserts
 * the byte-identical embedding, so edit this file and regenerate the bundle
 * instead of editing the string in lib/client.js.
 *
 * Keep this file free of backticks, and never write a dollar sign immediately
 * before a brace, so it can live inside a template literal untouched.
 *
 * Every DSH token is read as var(<real token>, <literal>) so the panel still
 * renders sensibly where a token is missing. --dsw-alias-border-1 is accepted
 * as a secondary name because older frames publish it; the shipped frame
 * publishes --dsw-alias-border-l1.
 */

.ub-root {
  --ub-fg: var(--dsw-alias-label-primary, #1f1f1f);
  --ub-fg-secondary: var(--dsw-alias-label-secondary, #5c5c5c);
  --ub-fg-tertiary: var(--dsw-alias-label-tertiary, #8a8a8a);
  --ub-layer: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03));
  --ub-layer-3: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.06));
  --ub-border: var(--dsw-alias-border-l1, var(--dsw-alias-border-1, rgba(0, 0, 0, 0.08)));
  --ub-border-strong: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.16));
  --ub-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  --ub-ok: var(--dsw-alias-state-success-primary, #1f9d55);
  --ub-ok-soft: var(--dsw-alias-state-success-tertiary, rgba(31, 157, 85, 0.12));
  --ub-warn: var(--dsw-alias-state-warn-primary, #c77700);
  --ub-warn-soft: var(--dsw-alias-state-warn-tertiary, rgba(199, 119, 0, 0.14));
  --ub-danger: var(--dsw-alias-state-error-primary, #d92d20);
  --ub-danger-soft: var(--dsw-alias-state-error-secondary, rgba(217, 45, 32, 0.12));
  --ub-idle: var(--dsw-alias-state-idle-primary, #8a8a8a);
  --ub-info: var(--dsw-alias-state-business-primary, #2f6fed);
  --ub-radius: var(--dsw-radius-md, 8px);
  --ub-radius-panel: var(--dsw-radius-panel, 12px);
  --ub-focus: var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #2f6fed));

  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding: var(--dsh-frame-top-clearance, 48px) clamp(16px, 2.4vw, 32px) 16px;
  background: transparent;
  color: var(--ub-fg);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  line-height: 20px;
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  .ub-root {
    --ub-fg: var(--dsw-alias-label-primary, #ececec);
    --ub-fg-secondary: var(--dsw-alias-label-secondary, #b0b0b0);
    --ub-fg-tertiary: var(--dsw-alias-label-tertiary, #8a8a8a);
    --ub-layer: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.05));
    --ub-layer-3: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.09));
    --ub-border: var(--dsw-alias-border-l1, var(--dsw-alias-border-1, rgba(255, 255, 255, 0.12)));
    --ub-border-strong: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.2));
    --ub-hover: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
    --ub-ok: var(--dsw-alias-state-success-primary, #4ade80);
    --ub-ok-soft: var(--dsw-alias-state-success-tertiary, rgba(74, 222, 128, 0.16));
    --ub-warn: var(--dsw-alias-state-warn-primary, #f5b544);
    --ub-warn-soft: var(--dsw-alias-state-warn-tertiary, rgba(245, 181, 68, 0.16));
    --ub-danger: var(--dsw-alias-state-error-primary, #f87171);
    --ub-danger-soft: var(--dsw-alias-state-error-secondary, rgba(248, 113, 113, 0.16));
    --ub-idle: var(--dsw-alias-state-idle-primary, #9a9a9a);
    --ub-info: var(--dsw-alias-state-business-primary, #7aa2ff);
  }
}

.ub-root *,
.ub-root *::before,
.ub-root *::after {
  box-sizing: border-box;
}

/* ---------- header ---------- */

.ub-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding-left: var(--dsh-frame-leading-clearance, 0px);
  padding-bottom: 12px;
}

.ub-head-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ub-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  color: var(--ub-fg);
}

.ub-updated {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--ub-fg-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ---------- refresh controls ---------- */

.ub-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 30px;
  padding: 0 12px;
  border: 0.5px solid var(--ub-border-strong);
  border-radius: var(--ub-radius);
  background: var(--ub-layer);
  color: var(--ub-fg);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.ub-refresh:hover:not(:disabled) {
  background: var(--ub-hover);
}

.ub-refresh:disabled {
  cursor: default;
  opacity: 0.55;
}

.ub-refresh:focus-visible,
.ub-retry:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--ub-focus);
  outline-offset: 1px;
}

.ub-spin {
  display: inline-flex;
  width: 14px;
  height: 14px;
  flex: none;
  color: currentColor;
}

.ub-spin.is-on {
  animation: ub-spin 900ms linear infinite;
}

@keyframes ub-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ub-spin.is-on {
    animation: none;
    opacity: 0.6;
  }
}

/* ---------- body / cards ---------- */

.ub-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.ub-card {
  border: 0.5px solid var(--ub-border);
  border-radius: var(--ub-radius-panel);
  background: var(--ub-layer);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ub-card[data-status="ok"] {
  border-color: var(--ub-border);
}

.ub-card[data-status="rate-limited"],
.ub-card[data-status="not-configured"],
.ub-card[data-status="disabled"] {
  background: transparent;
}

.ub-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ub-card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ub-card-title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.ub-card-title {
  margin: 0;
  min-width: 0;
  flex: 0 1 auto;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--ub-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ub-plan {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: var(--dsw-radius-sm, 4px);
  background: var(--ub-layer-3);
  color: var(--ub-fg-secondary);
  overflow-wrap: anywhere;
}

.ub-account {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 11px;
  line-height: 18px;
  color: var(--ub-fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

/* ---------- status pill ---------- */

.ub-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 20px;
  white-space: nowrap;
  background: var(--ub-layer-3);
  color: var(--ub-fg-secondary);
}

.ub-pill[data-tone="ok"] {
  background: var(--ub-ok-soft);
  color: var(--ub-ok);
}

.ub-pill[data-tone="warn"] {
  background: var(--ub-warn-soft);
  color: var(--ub-warn);
}

.ub-pill[data-tone="danger"] {
  background: var(--ub-danger-soft);
  color: var(--ub-danger);
}

.ub-pill[data-tone="idle"] {
  background: var(--ub-layer-3);
  color: var(--ub-idle);
}

.ub-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}

/* ---------- quota window ---------- */

.ub-metric {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ub-metric-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.ub-metric-label {
  min-width: 0;
  font-size: 12.5px;
  color: var(--ub-fg-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ub-metric-value {
  flex: none;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ub-fg);
}

.ub-bar {
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: var(--ub-layer-3);
  overflow: hidden;
}

.ub-bar-fill {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: 999px;
  background: var(--ub-info);
  transition: width 240ms ease-out;
}

.ub-bar-fill[data-level="ok"] {
  background: var(--ub-ok);
}

.ub-bar-fill[data-level="warn"] {
  background: var(--ub-warn);
}

.ub-bar-fill[data-level="danger"] {
  background: var(--ub-danger);
}

.ub-bar-fill[data-level="unknown"] {
  background: var(--ub-idle);
  min-width: 0;
}

.ub-bar-fill[data-empty="true"] {
  min-width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ub-bar-fill {
    transition: none;
  }
}

.ub-metric-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  font-size: 11.5px;
  line-height: 16px;
  color: var(--ub-fg-tertiary);
  font-variant-numeric: tabular-nums;
}

.ub-nums {
  color: var(--ub-fg-secondary);
}

.ub-hint {
  color: var(--ub-fg-tertiary);
  font-style: normal;
}

/* ---------- daily spend trend (history, never allowance) ---------- */

.ub-trend {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ub-trend-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.ub-trend-title {
  min-width: 0;
  font-size: 11.5px;
  line-height: 16px;
  color: var(--ub-fg-secondary);
}

.ub-trend-total {
  flex: none;
  font-size: 12.5px;
  line-height: 16px;
  color: var(--ub-fg);
  font-variant-numeric: tabular-nums;
}

.ub-trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 34px;
  padding: 0 1px;
  border-bottom: 0.5px solid var(--ub-border);
}

.ub-trend-bar {
  flex: 1 1 0;
  min-width: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--ub-info);
}

.ub-trend-bar[data-empty="true"] {
  background: var(--ub-border-strong);
}

.ub-trend-range {
  font-size: 11px;
  line-height: 15px;
  color: var(--ub-fg-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ---------- balances ---------- */

.ub-balances {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ub-balance {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.ub-balance-value {
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
  color: var(--ub-fg);
  font-variant-numeric: tabular-nums;
}

.ub-balance-meta {
  font-size: 11.5px;
  line-height: 16px;
  color: var(--ub-fg-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ---------- notes, diagnostics, failures ---------- */

.ub-note {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--ub-fg-tertiary);
}

.ub-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ub-state-line {
  margin: 0;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--ub-fg-secondary);
  overflow-wrap: anywhere;
}

.ub-code {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  line-height: 16px;
  color: var(--ub-fg-tertiary);
  overflow-wrap: anywhere;
}

.ub-failure {
  border: 0.5px solid var(--ub-border-strong);
  border-radius: var(--ub-radius-panel);
  background: var(--ub-layer);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.ub-failure-line {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--ub-danger);
}

.ub-failure-note {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--ub-fg-secondary);
}

.ub-retry {
  height: 28px;
  padding: 0 12px;
  border: 0.5px solid var(--ub-border-strong);
  border-radius: var(--ub-radius);
  background: transparent;
  color: var(--ub-fg);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.ub-retry:hover:not(:disabled) {
  background: var(--ub-hover);
}

.ub-retry:disabled {
  cursor: default;
  opacity: 0.55;
}

/* ---------- footer ---------- */

/* One child only — the host line. The refresh control lives in the header, so
   this row needs no distribution, just the divider and the muted text. */
.ub-foot {
  flex: none;
  display: flex;
  align-items: center;
  padding-top: 10px;
  margin-top: 2px;
  border-top: 0.5px solid var(--ub-border);
}

.ub-source {
  min-width: 0;
  font-size: 11.5px;
  line-height: 16px;
  color: var(--ub-fg-tertiary);
  overflow-wrap: anywhere;
}

/* ---------- narrow main column ---------- */

@media (max-width: 520px) {
  .ub-head {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
}
`;
    const PANEL_CSS_ID = "dsh-plugin-usage-board/panel.css";

    /** Install the panel stylesheet once, guarded against a second registration. */
    function injectPanelStyles() {
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(PANEL_CSS_ID) + "]") !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-usage-board";
      tag.dataset.pluginCss = PANEL_CSS_ID;
      tag.textContent = PANEL_CSS;
      document.head.appendChild(tag);
    }

    injectPanelStyles();
    //#endregion

    //#region src/client/protocol-copy.js — embedded verbatim (generated)
/**
 * GENERATED COPY — do not edit by hand.
 *
 * Carries the constants and the parse helpers of `src/shared/protocol.js`
 * verbatim, minus the `export` keyword, because the browser half is served as
 * a standalone DSH client bundle and cannot import that module. The text below
 * is embedded byte-identically in `lib/client.js`; nothing imports this file.
 *
 * `test/client-bundle.test.js` fails when any declaration here — or in the
 * bundle — drifts from `src/shared/protocol.js`. Keep the order and the shape
 * of every declaration identical to the shared module.
 *
 * Body fragment: no import/export statements of its own.
 */

/** Monotonic protocol revision, bumped only for incompatible additions. */
const PROTOCOL_VERSION = 1;

/** Every provider id this dashboard knows, in display order. */
const PROVIDER_IDS = ['deepseek', 'glm', 'kimi'];

/** Provider ids whose upstream API is a quota window API rather than a wallet. */
const QUOTA_PROVIDER_IDS = ['glm', 'kimi'];

/** HTTP path the host half serves the snapshot on (GET). */
const SNAPSHOT_PATH = '/usage-board/api/snapshot';

/**
 * HTTP path the host half serves a forced refresh on (POST). Returns the same
 * body as {@link SNAPSHOT_PATH}.
 */
const REFRESH_PATH = '/usage-board/api/refresh';

/** HTTP prefix owning every route this plugin registers. */
const ROUTE_PREFIX = '/usage-board';

/**
 * Maximum number of trailing days an adapter may put in `meta.dailyUsage`.
 * The UI renders the last 14; the cap keeps a snapshot small.
 */
const MAX_DAILY_USAGE_DAYS = 31;

/**
 * Build one daily-usage series, trimming to the cap and filling both numeric
 * fields so the UI never sees `undefined`.
 * @param {{ currency?: string, days?: number, points?: Array<Partial<DailyUsagePoint> & { date: string }> }} seed
 * @returns {DailyUsageSeries}
 */
function makeDailyUsage(seed) {
  const points = (seed.points ?? [])
    .slice(-MAX_DAILY_USAGE_DAYS)
    .map((point) => ({
      date: point.date,
      cost: typeof point.cost === 'number' && Number.isFinite(point.cost) ? point.cost : null,
      tokens: typeof point.tokens === 'number' && Number.isFinite(point.tokens) ? point.tokens : null,
    }));
  return {
    currency: seed.currency ?? 'CNY',
    days: seed.days ?? points.length,
    points,
  };
}

/**
 * Build an empty window; adapters copy this and fill the fields they have, so
 * every emitted window carries every key.
 * @param {Partial<UsageWindow> & { id: string }} seed
 * @returns {UsageWindow}
 */
function makeWindow(seed) {
  return {
    id: seed.id,
    labelKey: seed.labelKey ?? seed.id,
    unit: seed.unit ?? null,
    number: seed.number ?? null,
    limit: seed.limit ?? null,
    used: seed.used ?? null,
    remaining: seed.remaining ?? null,
    percent: seed.percent ?? null,
    derivedPercent: seed.derivedPercent ?? derivedPercentOf(seed.used, seed.limit),
    resetAt: seed.resetAt ?? null,
    note: seed.note ?? null,
  };
}

/**
 * Build an empty balance.
 * @param {Partial<Balance> & { currency: string }} seed
 * @returns {Balance}
 */
function makeBalance(seed) {
  return {
    currency: seed.currency,
    available: seed.available ?? null,
    bonus: seed.bonus ?? null,
    totalSpent: seed.totalSpent ?? null,
  };
}

/**
 * Build one provider row.
 * @param {Partial<ProviderSnapshot> & { id: string, label: string, status: ProviderStatus }} seed
 * @returns {ProviderSnapshot}
 */
function makeProvider(seed) {
  return {
    id: seed.id,
    label: seed.label,
    status: seed.status,
    message: seed.message ?? null,
    // Carried through the builder, not only spread on afterwards: a consumer
    // that builds a row *through* makeProvider must not silently lose the key
    // that tells the client which translation to render.
    messageKey: seed.messageKey ?? null,
    code: seed.code ?? null,
    plan: seed.plan ?? null,
    windows: seed.windows ?? [],
    balances: seed.balances ?? [],
    account: seed.account ?? null,
    meta: seed.meta ?? {},
    fetchedAt: seed.fetchedAt ?? null,
    latencyMs: seed.latencyMs ?? null,
  };
}

/**
 * Build the envelope. `ok` is derived, never passed in.
 * @param {{ generatedAt?: number, ttlMs: number, providers: ProviderSnapshot[] }} seed
 * @returns {UsageSnapshot}
 */
function makeSnapshot(seed) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    generatedAt: seed.generatedAt ?? Date.now(),
    ok: seed.providers.length > 0 && seed.providers.every((row) => row.status === 'ok'),
    ttlMs: seed.ttlMs,
    ...(seed.stale === true ? { stale: true } : {}),
    ...(seed.refreshing === true ? { refreshing: true } : {}),
    providers: seed.providers,
  };
}

/**
 * Round to one decimal, tolerating null.
 * @param {number|null|undefined} value
 * @returns {number|null}
 */
function round1(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

/**
 * Consumed share as a 0–100 number.
 *
 * **The fraction wins over the provider's declared percentage.** Providers round
 * aggressively — GLM reports `percentage: 32` beside `currentValue: 656,
 * usage: 2000`, which is 32.8%, so trusting the declared value puts a number on
 * screen that visibly contradicts the `656 / 2000` printed right next to it.
 * Deriving from the raw pair makes the card self-consistent; the declared value
 * is only used when there is no usable numerator/denominator to divide.
 *
 * @param {number|null|undefined} used
 * @param {number|null|undefined} limit
 * @param {number|null|undefined} declared Provider-reported percentage; the fallback.
 * @returns {number|null}
 */
function percentOf(used, limit, explicit) {
  const reported = round1(explicit);
  if (reported !== null) return reported;
  if (typeof used !== 'number' || typeof limit !== 'number' || limit <= 0) return null;
  return round1((used / limit) * 100);
}

/**
 * The share implied by a window's own numbers, ignoring what the provider
 * declared. Adapters echo this into `UsageWindow.derivedPercent` so a consumer
 * can render `derivedPercent ?? percent` and never print a percentage that
 * visibly contradicts the `used / limit` beside it.
 *
 * GLM is the motivating case: it reports `percentage: 32` next to
 * `currentValue: 656, usage: 2000`, which is 32.8%.
 *
 * @param {number|null|undefined} used
 * @param {number|null|undefined} limit
 * @returns {number|null} null when there is no usable pair to divide.
 */
function derivedPercentOf(used, limit) {
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return null;
  return round1((used / limit) * 100);
}
    //#endregion

    //#region src/client/panel.js — embedded verbatim
/* ------------------------------------------------------------------------- *
 * dsh-plugin-usage-board — DSH Web client panel body.
 *
 * This file is a PLAIN-JS BODY FRAGMENT, not a module: it is embedded verbatim
 * inside the `__ModuleLoader__` factory in lib/client.js.
 * test/client-bundle.test.js asserts the byte-identical embedding, so edit this
 * file and regenerate the bundle rather than editing the copy inside it.
 *
 * Free variables the embedding factory provides:
 *   react                 the "react" module
 *   jsxRuntime            the "react/jsx-runtime" module
 *   ROUTE_PREFIX, SNAPSHOT_PATH, REFRESH_PATH, PROVIDER_IDS, PROTOCOL_VERSION
 *   makeWindow, makeBalance, makeProvider, makeSnapshot, round1, percentOf
 *     — from src/client/protocol-copy.js, itself a verbatim copy of
 *       src/shared/protocol.js.
 *
 * No JSX (there is no compiler in this package), no `require` outside the two
 * aliases above, and no dependency on anything the host half serves other than
 * the three documented JSON routes.
 * ------------------------------------------------------------------------- */

const { useState, useEffect, useRef, useCallback } = react;
const { jsx, jsxs } = jsxRuntime;

/** Locale namespace registered through `ctx.locale.register`. */
const NS = "usageBoard";

/** Panel id shared by the `sidebar.panellist` entry and the `main` keyed slot. */
const PANEL_ID = "usage-board";

/** Sidebar position; plugin-manager uses 0, so 20 sits just below it. */
const PANEL_ORDER = 20;

/** Host-served JSON routes (see src/shared/protocol.js). */
const SNAPSHOT_URL = ROUTE_PREFIX + "/api/snapshot";
const REFRESH_URL = ROUTE_PREFIX + "/api/refresh";

/** Auto-refresh bounds: the host's ttl is honoured inside 60s … 5min. */
const TTL_MIN_MS = 60 * 1000;
const TTL_MAX_MS = 5 * 60 * 1000;

/** How long a single request may hang before it is reported as a timeout. */
const REQUEST_TIMEOUT_MS = 20 * 1000;

/** sessionStorage key holding the last successful envelope, for the first paint. */
const SNAPSHOT_STORE_KEY = "usage-board:snapshot:v1";

/**
 * How long to wait before the one bounded follow-up read a `stale: true` answer
 * earns. Short enough to beat the eye, long enough for the host's background
 * refresh to have landed.
 */
const STALE_FOLLOW_UP_MS = 1500;

/** Longest diagnostic string rendered next to a failure. */
const DIAGNOSTIC_MAX = 140;

/** How many trailing days of `meta.dailyUsage` the trend chart draws. */
const DAILY_TREND_POINTS = 14;

/** Currency symbol per ISO-4217 code; unknown codes render the code itself. */
const CURRENCY_SYMBOLS = {
  CNY: "\u00a5",
  USD: "$",
  JPY: "\u00a5",
  EUR: "\u20ac",
  GBP: "\u00a3",
  HKD: "HK$",
};

/** Diagnostic pill tone per protocol status. */
const STATUS_TONES = {
  ok: "ok",
  "not-configured": "idle",
  disabled: "idle",
  "rate-limited": "warn",
  unauthorized: "danger",
  "upstream-error": "danger",
  "network-error": "danger",
  "invalid-response": "danger",
};

/** Provider unit codes whose windows get a generic label when labelKey is unknown. */
const UNIT_LABEL_KEYS = {
  "3": "unit.glm.5h",
  "5": "unit.glm.5h",
  "6": "unit.glm.weekly",
  weekly: "unit.weekly",
  monthly: "unit.monthly",
  hourly: "unit.hourly",
};

const zh = {
  panel: "\u7528\u91cf\u770b\u677f",
  "action.refresh": "\u5237\u65b0",
  "action.refreshing": "\u5237\u65b0\u4e2d\u2026",
  "action.retry": "\u91cd\u8bd5",
  "state.loading": "\u6b63\u5728\u8bfb\u53d6\u7528\u91cf\u6570\u636e\u2026",
  "state.empty": "\u5b9e\u4f8b\u8fd8\u6ca1\u6709\u914d\u7f6e\u4efb\u4f55\u670d\u52a1\u3002",
  "state.noWindows": "\u8be5\u670d\u52a1\u4e0d\u63d0\u4f9b\u7528\u91cf\u7a97\u53e3",
  "state.balanceOnly": "\u8be5\u670d\u52a1\u6309\u4f59\u989d\u8ba1\u8d39\uff0c\u4e0d\u63d0\u4f9b\u7528\u91cf\u7a97\u53e3",
  "state.refreshFailed": "\u5237\u65b0\u5931\u8d25\uff1a{reason}",
  "updated.none": "\u5c1a\u672a\u540c\u6b65",
  "updated.refreshing": "\u6b63\u5728\u5237\u65b0\u2026",
  "updated.justNow": "\u521a\u521a\u66f4\u65b0",
  "updated.seconds": "{n} \u79d2\u524d\u66f4\u65b0",
  "updated.minutes": "{n} \u5206\u949f\u524d\u66f4\u65b0",
  "updated.hours": "{n} \u5c0f\u65f6\u524d\u66f4\u65b0",
  "updated.days": "{n} \u5929\u524d\u66f4\u65b0",
  "window.usage": "{used} / {limit}",
  "window.remaining": "\u5269\u4f59 {value}",
  "window.reset.due": "\u5373\u5c06\u91cd\u7f6e",
  "window.reset.seconds": "{n} \u79d2\u540e\u91cd\u7f6e",
  "window.reset.minutes": "{n} \u5206\u949f\u540e\u91cd\u7f6e",
  "window.reset.hours": "{n} \u5c0f\u65f6\u540e\u91cd\u7f6e",
  "window.reset.days": "{n} \u5929\u540e\u91cd\u7f6e",
  "balance.bonus": "\u8d60\u9001 {value}",
  "balance.spent": "\u603b\u6d88\u8017 {value}",
  "source.host": "\u6570\u636e\u6765\u6e90\uff1a{host}",
  "source.none": "\u6570\u636e\u6765\u6e90\uff1a\u672c\u673a\u5b9e\u4f8b",
  "error.network": "\u65e0\u6cd5\u8fde\u63a5\u5b9e\u4f8b\u7684\u7528\u91cf\u670d\u52a1",
  "error.http": "\u5b9e\u4f8b\u8fd4\u56de\u4e86 HTTP {code}",
  "error.invalid": "\u5b9e\u4f8b\u8fd4\u56de\u7684\u6570\u636e\u683c\u5f0f\u4e0d\u6b63\u786e",
  "error.timeout": "\u8bf7\u6c42\u8d85\u65f6",
  "status.ok": "\u6b63\u5e38",
  "status.not-configured": "\u672a\u914d\u7f6e",
  "status.unauthorized": "\u672a\u6388\u6743",
  "status.rate-limited": "\u9650\u6d41",
  "status.upstream-error": "\u4e0a\u6e38\u9519\u8bef",
  "status.network-error": "\u7f51\u7edc\u9519\u8bef",
  "status.invalid-response": "\u54cd\u5e94\u5f02\u5e38",
  "status.disabled": "\u5df2\u505c\u7528",
  "message.notConfigured": "\u5c1a\u672a\u914d\u7f6e\u8fd9\u5bb6\u670d\u52a1\u7684\u51ed\u636e\uff0c\u8bf7\u5728 DSH \u8bbe\u7f6e\u91cc\u586b\u5199\u5bf9\u5e94\u5bc6\u94a5\u3002",
  "message.authRejected": "\u51ed\u636e\u88ab\u670d\u52a1\u65b9\u62d2\u7edd\uff0c\u53ef\u80fd\u5df2\u8fc7\u671f\u6216\u586b\u9519\u3002",
  "message.noCodingPlan": "\u8fd9\u4e2a\u5bc6\u94a5\u6ca1\u6709\u6709\u6548\u7684 Coding Plan \u5957\u9910\u3002",
  "message.rateLimited": "\u670d\u52a1\u65b9\u6b63\u5728\u9650\u6d41\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  "message.unreachable": "\u65e0\u6cd5\u8fde\u63a5\u5b9e\u4f8b\u7684\u7528\u91cf\u670d\u52a1\u3002",
  "message.cancelled": "\u672c\u6b21\u8bfb\u53d6\u5df2\u53d6\u6d88\u3002",
  "message.badResponse": "\u670d\u52a1\u65b9\u8fd4\u56de\u4e86\u65e0\u6cd5\u89e3\u6790\u7684\u5185\u5bb9\u3002",
  "message.adapterFailed": "\u8bfb\u53d6\u8fc7\u7a0b\u4e2d\u51fa\u73b0\u610f\u5916\u9519\u8bef\u3002",
  "message.noHost": "\u6ca1\u6709\u53ef\u7528\u7684\u4e0a\u6e38\u5730\u5740\u3002",
  "unit.glm.5h": "5 \u5c0f\u65f6\u7a97\u53e3",
  "unit.glm.weekly": "\u6bcf\u5468\u7a97\u53e3",
  "unit.hourly": "\u6bcf\u5c0f\u65f6\u7a97\u53e3",
  "unit.weekly": "\u6bcf\u5468\u7a97\u53e3",
  "unit.monthly": "\u6bcf\u6708\u7a97\u53e3",
  "glm.5h": "5 \u5c0f\u65f6\u7a97\u53e3",
  "glm.weekly": "\u6bcf\u5468\u7a97\u53e3",
  "glm.monthly": "\u6bcf\u6708\u7a97\u53e3",
  "kimi.5h": "5 \u5c0f\u65f6\u7a97\u53e3",
  "kimi.weekly": "\u6bcf\u5468\u7a97\u53e3",
  "kimi.monthly": "\u6bcf\u6708\u7a97\u53e3",
  "deepseek.balance": "\u4f59\u989d",
  "daily.title": "\u8fd1 {n} \u5929\u6d88\u8017",
  "daily.range": "{from} \u2192 {to}",
  "daily.pointTip": "{date} \u00b7 {cost}",
  "daily.tokens": "{value} tokens",
};

const en = {
  panel: "Usage Board",
  "action.refresh": "Refresh",
  "action.refreshing": "Refreshing\u2026",
  "action.retry": "Retry",
  "state.loading": "Reading usage data\u2026",
  "state.empty": "The host reports no configured provider.",
  "state.noWindows": "This service exposes no usage window.",
  "state.balanceOnly": "This service bills by balance and exposes no usage window.",
  "state.refreshFailed": "Refresh failed: {reason}",
  "updated.none": "Not synced yet",
  "updated.refreshing": "refreshing\u2026",
  "updated.justNow": "Updated just now",
  "updated.seconds": "Updated {n}s ago",
  "updated.minutes": "Updated {n} min ago",
  "updated.hours": "Updated {n} h ago",
  "updated.days": "Updated {n} d ago",
  "window.usage": "{used} / {limit}",
  "window.remaining": "{value} left",
  "window.reset.due": "Resets shortly",
  "window.reset.seconds": "Resets in {n}s",
  "window.reset.minutes": "Resets in {n} min",
  "window.reset.hours": "Resets in {n} h",
  "window.reset.days": "Resets in {n} d",
  "balance.bonus": "Bonus {value}",
  "balance.spent": "Spent {value}",
  "source.host": "Source: {host}",
  "source.none": "Source: local host",
  "error.network": "Cannot reach the host usage service",
  "error.http": "The host answered HTTP {code}",
  "error.invalid": "The host returned an unexpected payload",
  "error.timeout": "The request timed out",
  "status.ok": "OK",
  "status.not-configured": "Not configured",
  "status.unauthorized": "Unauthorized",
  "status.rate-limited": "Rate limited",
  "status.upstream-error": "Upstream error",
  "status.network-error": "Network error",
  "status.invalid-response": "Invalid response",
  "status.disabled": "Disabled",
  "message.notConfigured": "No credential is configured for this service. Add the matching key in DSH settings.",
  "message.authRejected": "The provider rejected this credential; it may be expired or mistyped.",
  "message.noCodingPlan": "This key has no active Coding Plan subscription.",
  "message.rateLimited": "The provider is rate limiting; try again shortly.",
  "message.unreachable": "Cannot reach the host usage service.",
  "message.cancelled": "This read was cancelled.",
  "message.badResponse": "The provider returned content that could not be parsed.",
  "message.adapterFailed": "An unexpected error occurred while reading.",
  "message.noHost": "No upstream address is available.",
  "unit.glm.5h": "5-hour window",
  "unit.glm.weekly": "Weekly window",
  "unit.hourly": "Hourly window",
  "unit.weekly": "Weekly window",
  "unit.monthly": "Monthly window",
  "glm.5h": "5-hour window",
  "glm.weekly": "Weekly window",
  "glm.monthly": "Monthly window",
  "kimi.5h": "5-hour window",
  "kimi.weekly": "Weekly window",
  "kimi.monthly": "Monthly window",
  "deepseek.balance": "Balance",
  "daily.title": "Spend, last {n} days",
  "daily.range": "{from} \u2192 {to}",
  "daily.pointTip": "{date} \u00b7 {cost}",
  "daily.tokens": "{value} tokens",
};

/** Translate seat bound in `apply`, used when the slot renderer passes no `t`. */
let boundTranslate = null;

/**
 * Bind the namespace translate seat that `apply` obtains from the locale service.
 * @param {Function} translate Bound `t` for {@link NS}.
 */
function bindPanelTranslate(translate) {
  boundTranslate = typeof translate === "function" ? translate : null;
}

/** Identity translate, the last-resort seat when neither `props.t` nor apply ran. */
function identityTranslate(key) {
  return key;
}

/**
 * Resolve the translate seat a rendering component should use.
 * @param {object} props Slot props.
 * @returns {Function}
 */
function translateOf(props) {
  if (props !== null && props !== undefined && typeof props.t === "function") return props.t;
  return boundTranslate === null ? identityTranslate : boundTranslate;
}

/** @param {unknown} value @returns {boolean} whether `value` is a usable finite number. */
function isNum(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** @param {unknown} value @returns {string|null} `value` when it is a non-empty string. */
function strOrNull(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** @param {unknown} value @returns {number|null} `value` when it is a finite number. */
function numOrNull(value) {
  return isNum(value) ? value : null;
}

/**
 * Drop null/undefined/false entries so element arrays never carry holes.
 * @param {Array<unknown>} list
 * @returns {Array<unknown>}
 */
function compact(list) {
  return list.filter(function (entry) {
    return entry !== null && entry !== undefined && entry !== false;
  });
}

/** Group the integer part of a numeric string in threes. */
function groupDigits(text) {
  const dot = text.indexOf(".");
  const head = dot === -1 ? text : text.slice(0, dot);
  const tail = dot === -1 ? "" : text.slice(dot);
  return head.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + tail;
}

/**
 * Money with exactly two decimals and the currency symbol; null renders as an em dash.
 * @param {number|null} value
 * @param {string|null} currency ISO-4217 code.
 * @returns {string}
 */
function formatMoney(value, currency) {
  if (!isNum(value)) return "\u2014";
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const symbol = Object.prototype.hasOwnProperty.call(CURRENCY_SYMBOLS, code) ? CURRENCY_SYMBOLS[code] : null;
  const sign = value < 0 ? "-" : "";
  const amount = groupDigits(Math.abs(value).toFixed(2));
  if (symbol !== null) return sign + symbol + amount;
  return code === "" ? sign + amount : sign + amount + " " + code;
}

/**
 * Percent with one decimal; null renders as an em dash so a missing field never
 * becomes NaN.
 * @param {number|null} value
 * @returns {string}
 */
function formatPercent(value) {
  return isNum(value) ? value.toFixed(1) + "%" : "\u2014";
}

/**
 * A window quantity: integers stay integral, fractions keep at most two decimals.
 * @param {number|null} value
 * @returns {string}
 */
function formatAmount(value) {
  if (!isNum(value)) return "\u2014";
  if (Number.isInteger(value)) return groupDigits(String(value));
  return groupDigits(String(Math.round(value * 100) / 100));
}

/** Clamp `value` into [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** `2026-10-01` as `10-01`; anything else is returned untouched. */
function shortDate(date) {
  const value = String(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(5) : value;
}

/**
 * Clamp the host ttl into the supported auto-refresh band.
 * @param {number|null} ttlMs
 * @returns {number}
 */
function clampTtl(ttlMs) {
  if (!isNum(ttlMs) || ttlMs <= 0) return TTL_MIN_MS;
  return clamp(Math.round(ttlMs), TTL_MIN_MS, TTL_MAX_MS);
}

/** Truncate a diagnostic so a pathological message cannot dominate the card. */
function truncate(text) {
  const value = typeof text === "string" ? text : String(text);
  return value.length <= DIAGNOSTIC_MAX ? value : value.slice(0, DIAGNOSTIC_MAX - 1) + "\u2026";
}

/**
 * Relative "last updated" sentence in the active language.
 * @param {Function} t
 * @param {number|null} then Epoch ms.
 * @param {number} now Epoch ms.
 * @returns {string|null}
 */
function relativeTime(t, then, now) {
  if (!isNum(then)) return null;
  const diff = now - then;
  if (diff < 5000) return t("updated.justNow");
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t("updated.seconds", { n: String(seconds) });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("updated.minutes", { n: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("updated.hours", { n: String(hours) });
  return t("updated.days", { n: String(Math.floor(hours / 24)) });
}

/**
 * Reset countdown sentence, or null when the provider reports no reset.
 * @param {Function} t
 * @param {number|null} resetAt Epoch ms.
 * @param {number} now Epoch ms.
 * @returns {string|null}
 */
function resetText(t, resetAt, now) {
  if (!isNum(resetAt)) return null;
  const diff = resetAt - now;
  if (diff <= 0) return t("window.reset.due");
  const seconds = Math.ceil(diff / 1000);
  if (seconds < 60) return t("window.reset.seconds", { n: String(seconds) });
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return t("window.reset.minutes", { n: String(minutes) });
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return t("window.reset.hours", { n: String(hours) });
  return t("window.reset.days", { n: String(Math.round(diff / 86400000)) });
}

/**
 * Localized window title: the protocol's `labelKey` first, then the provider
 * unit code, then a humanized id. `ctx.locale` echoes an unknown key, which is
 * how a missing translation is detected here.
 * @param {Function} t
 * @param {object} window Normalized UsageWindow.
 * @returns {string}
 */
function windowLabel(t, window) {
  const candidates = [strOrNull(window.labelKey), strOrNull(window.id)];
  for (const candidate of candidates) {
    if (candidate === null) continue;
    const translated = t(candidate);
    if (typeof translated === "string" && translated !== candidate) return translated;
  }
  const unitKey = Object.prototype.hasOwnProperty.call(UNIT_LABEL_KEYS, String(window.unit))
    ? UNIT_LABEL_KEYS[String(window.unit)]
    : null;
  if (unitKey !== null) {
    const byUnit = t(unitKey);
    if (typeof byUnit === "string" && byUnit !== unitKey) return byUnit;
  }
  const fallback = candidates[1] === null ? candidates[0] : candidates[1];
  return String(fallback === null ? window.id : fallback).replace(/[._-]+/g, " ");
}

/** @returns {string} pill tone for a protocol status. */
function statusTone(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_TONES, status) ? STATUS_TONES[status] : "idle";
}

/** @returns {string} locale key for a protocol status. */
function statusKey(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_TONES, status) ? "status." + status : "status.invalid-response";
}

/**
 * The explanation a non-ok card shows: a KNOWN `messageKey` first, then the
 * host's own English sentence, then the status word.
 *
 * Both namespaces are tried because the host may send either a semantic key
 * (`authRejected`) or a bare `status.<status>` one. `noCodingPlan` stays a
 * separate string from `authRejected`: a key without a subscription is not an
 * expired credential, and the wording must not imply it is.
 *
 * @param {Function} t
 * @param {object} provider Normalized provider row.
 * @returns {string}
 */
function providerMessage(t, provider) {
  const key = strOrNull(provider.messageKey);
  if (key !== null) {
    for (const candidate of [key, "message." + key]) {
      const translated = t(candidate);
      if (typeof translated === "string" && translated !== candidate) return translated;
    }
  }
  if (provider.message !== null) return provider.message;
  return t(statusKey(provider.status));
}

/**
 * Coerce one wire window onto the frozen shape; a malformed member becomes a
 * window whose fields are all null rather than a thrown render.
 * @param {object} raw
 * @param {number} index
 * @returns {object}
 */
function normalizeWindow(raw, index) {
  const source = raw !== null && typeof raw === "object" ? raw : {};
  const used = numOrNull(source.used);
  const limit = numOrNull(source.limit);
  const reportedRemaining = numOrNull(source.remaining);
  const remaining = reportedRemaining !== null
    ? reportedRemaining
    : used !== null && limit !== null
      ? limit - used
      : null;
  return makeWindow({
    id: strOrNull(source.id) === null ? "window-" + String(index) : source.id,
    labelKey: strOrNull(source.labelKey),
    unit: source.unit === null || source.unit === undefined ? null : String(source.unit),
    number: numOrNull(source.number),
    limit: limit,
    used: used,
    remaining: remaining,
    // `percent` keeps the provider's declaration verbatim and `derivedPercent`
    // keeps the fraction its own numbers imply; the two stay separate fields so
    // the renderer can prefer the arithmetic and the declared value stays
    // available as the diagnostic that says the upstream rounded. makeWindow
    // fills derivedPercent from used/limit when an older host omits it.
    percent: percentOf(used, limit, numOrNull(source.percent)),
    derivedPercent: numOrNull(source.derivedPercent),
    resetAt: numOrNull(source.resetAt),
    note: strOrNull(source.note),
  });
}

/**
 * Coerce one wire balance onto the frozen shape.
 * @param {object} raw
 * @returns {object}
 */
function normalizeBalance(raw) {
  const source = raw !== null && typeof raw === "object" ? raw : {};
  return makeBalance({
    currency: strOrNull(source.currency) === null ? "CNY" : source.currency,
    available: numOrNull(source.available),
    bonus: numOrNull(source.bonus),
    totalSpent: numOrNull(source.totalSpent),
  });
}

/**
 * Coerce one wire provider row onto the frozen shape. An unknown status is
 * surfaced as `invalid-response` with the raw value kept in `code` so the card
 * still explains itself instead of rendering nothing.
 * @param {object} raw
 * @returns {object}
 */
function normalizeProvider(raw) {
  const source = raw !== null && typeof raw === "object" ? raw : {};
  const rawStatus = strOrNull(source.status);
  const known = rawStatus !== null && Object.prototype.hasOwnProperty.call(STATUS_TONES, rawStatus);
  const status = known ? rawStatus : "invalid-response";
  const code = source.code === null || source.code === undefined ? null : String(source.code);
  return makeProvider({
    id: strOrNull(source.id) === null ? "unknown" : source.id,
    label: strOrNull(source.label) === null ? (strOrNull(source.id) === null ? "\u2014" : source.id) : source.label,
    status: status,
    message: strOrNull(source.message),
    messageKey: strOrNull(source.messageKey),
    code: known || code !== null ? code : rawStatus,
    plan: strOrNull(source.plan),
    windows: Array.isArray(source.windows) ? source.windows.map(normalizeWindow) : [],
    balances: Array.isArray(source.balances) ? source.balances.map(normalizeBalance) : [],
    account: source.account !== null && typeof source.account === "object" && !Array.isArray(source.account)
      ? source.account
      : null,
    meta: source.meta !== null && typeof source.meta === "object" && !Array.isArray(source.meta) ? source.meta : {},
    fetchedAt: numOrNull(source.fetchedAt),
    latencyMs: numOrNull(source.latencyMs),
  });
}

/**
 * Coerce a whole snapshot; the caller has already checked `providers` is an array.
 * @param {object} body
 * @returns {object}
 */
function normalizeSnapshot(body) {
  return makeSnapshot({
    generatedAt: numOrNull(body.generatedAt) === null ? Date.now() : body.generatedAt,
    ttlMs: numOrNull(body.ttlMs) === null ? TTL_MIN_MS : body.ttlMs,
    providers: body.providers.map(normalizeProvider),
  });
}

/**
 * The transport-level check for a snapshot envelope: an object whose `providers`
 * is an array. Shared by the live request path and the restored-from-storage
 * path so a payload that came off disk is held to the same bar as one off the
 * wire.
 * @param {unknown} value
 * @returns {boolean}
 */
function isSnapshotBody(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.providers);
}

/**
 * Persist the last successful envelope so the next mount can paint before its
 * first request lands.
 *
 * sessionStorage may be absent (server render, hardened browsers), disabled
 * (private modes), or full. A cache write is an optimisation, never a
 * requirement, so every access is wrapped and a failure is silently dropped.
 * @param {object} body The envelope exactly as the host sent it, so its
 *   `protocolVersion` survives for the read-side check.
 */
function writeStoredSnapshot(body) {
  try {
    if (typeof sessionStorage === "undefined" || sessionStorage === null) return;
    sessionStorage.setItem(SNAPSHOT_STORE_KEY, JSON.stringify(body));
  } catch (error) {
    // Deliberately ignored: the panel works without a cache.
  }
}

/**
 * The stored envelope as a normalized snapshot, or null when there is none or
 * it cannot be trusted.
 *
 * Rejected on purpose: unparseable JSON, a payload that is not an envelope, and
 * a payload written under a different PROTOCOL_VERSION — a snapshot from
 * another protocol revision may carry fields whose meaning changed, and showing
 * it would be worse than showing nothing.
 * @returns {object|null}
 */
function readStoredSnapshot() {
  try {
    if (typeof sessionStorage === "undefined" || sessionStorage === null) return null;
    const raw = sessionStorage.getItem(SNAPSHOT_STORE_KEY);
    if (typeof raw !== "string" || raw.length === 0) return null;
    const body = JSON.parse(raw);
    if (!isSnapshotBody(body)) return null;
    if (body.protocolVersion !== PROTOCOL_VERSION) return null;
    return normalizeSnapshot(body);
  } catch (error) {
    return null;
  }
}

/**
 * Fetch JSON from a host route, enforcing the transport contract: a non-2xx
 * answer or a body whose `providers` is not an array is a failure.
 * @param {string} url
 * @param {object} [options] Extra fetch init merged over the defaults.
 * @returns {Promise<object>}
 */
function requestJson(url, options) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller === null ? null : setTimeout(function () {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const init = Object.assign(
    {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    },
    options === undefined ? {} : options,
  );
  if (controller !== null) init.signal = controller.signal;
  const settle = function () {
    if (timer !== null) clearTimeout(timer);
  };
  return fetch(url, init).then(
    function (response) {
      if (response.ok !== true) {
        const failure = new Error("HTTP " + String(response.status));
        failure.kind = "http";
        failure.httpStatus = String(response.status);
        throw failure;
      }
      return response.json().then(
        function (body) {
          return body;
        },
        function () {
          const failure = new Error("response body is not valid JSON");
          failure.kind = "shape";
          throw failure;
        },
      );
    },
    function (error) {
      const failure = asErrorLike(error);
      if (failure.name === "AbortError") failure.kind = "timeout";
      throw failure;
    },
  ).then(function (body) {
    if (!isSnapshotBody(body)) {
      const failure = new Error("payload has no providers array");
      failure.kind = "shape";
      throw failure;
    }
    return body;
  }).then(
    function (body) {
      settle();
      return body;
    },
    function (error) {
      settle();
      throw error;
    },
  );
}

/**
 * Anything throwable reduced to an error-like object with a `message`. Duck
 * typing rather than `instanceof Error`, which is false for a value crossing a
 * realm boundary and would silently misreport a real failure.
 * @param {unknown} error
 * @returns {object}
 */
function asErrorLike(error) {
  if (error !== null && typeof error === "object" && typeof error.message === "string") return error;
  return new Error(String(error));
}

/**
 * Turn a thrown failure into renderable copy: a locale key plus a short
 * diagnostic string. Never a stack trace, never a credential.
 * @param {unknown} error
 * @returns {{ key: string, params: object, detail: string|null }}
 */
function describeFailure(error) {
  const failure = asErrorLike(error);
  const kind = typeof failure.kind === "string" ? failure.kind : null;
  if (kind === "http") {
    return {
      key: "error.http",
      params: { code: failure.httpStatus === undefined ? "?" : failure.httpStatus },
      detail: truncate(failure.message),
    };
  }
  if (kind === "shape") return { key: "error.invalid", params: {}, detail: truncate(failure.message) };
  if (kind === "timeout") return { key: "error.timeout", params: {}, detail: null };
  return { key: "error.network", params: {}, detail: truncate(failure.message) };
}

/** Distinct non-empty `meta.host` values across the snapshot, in provider order. */
function collectHosts(providers) {
  const hosts = [];
  for (const provider of providers) {
    const host = provider.meta !== null && typeof provider.meta === "object" ? strOrNull(provider.meta.host) : null;
    if (host !== null && hosts.indexOf(host) === -1) hosts.push(host);
  }
  return hosts;
}

/**
 * The trailing daily-spend series a provider may attach to `meta.dailyUsage`.
 * This is HISTORY, never allowance: it is drawn as a trend and is never labelled
 * as a quota or a remainder.
 * @param {object} provider Normalized provider row.
 * @returns {object|null} series with at least one point, else null.
 */
function providerTrend(provider) {
  const meta = provider.meta !== null && typeof provider.meta === "object" ? provider.meta : null;
  const raw = meta === null ? null : meta.dailyUsage;
  if (raw === null || typeof raw !== "object" || !Array.isArray(raw.points) || raw.points.length === 0) return null;
  const series = makeDailyUsage({
    currency: strOrNull(raw.currency) === null ? "CNY" : raw.currency,
    days: numOrNull(raw.days) === null ? raw.points.length : raw.days,
    points: raw.points,
  });
  return series.points.length === 0 ? null : series;
}

/**
 * The trend's scale and total: the tallest bar is the scale, a series of zeros
 * or nulls collapses to a flat baseline instead of an empty chart.
 * @param {object} series
 * @returns {{ bars: Array<{date: string, cost: number, tokens: number|null}>, max: number, total: number, currency: string }}
 */
function trendScale(series) {
  const points = series.points.slice(-DAILY_TREND_POINTS);
  const bars = points.map(function (point) {
    return {
      date: strOrNull(point.date) === null ? "" : point.date,
      cost: isNum(point.cost) ? point.cost : 0,
      tokens: numOrNull(point.tokens),
    };
  });
  let max = 0;
  let total = 0;
  for (const bar of bars) {
    if (bar.cost > max) max = bar.cost;
    total += bar.cost;
  }
  return { bars: bars, max: max, total: total, currency: series.currency };
}

/**
 * A compact bar chart of recent daily spend, with the window total beside it.
 * @param {object} props series, t
 */
function DailyTrend(props) {
  const t = props.t;
  const series = props.series;
  const scale = trendScale(series);
  const bars = scale.bars.map(function (bar, index) {
    const ratio = scale.max > 0 ? bar.cost / scale.max : 0;
    // A zero day keeps a visible stub, so an all-zero series reads as a flat
    // baseline rather than as a chart that failed to load.
    const height = scale.max > 0 ? Math.max(3, Math.round(ratio * 100)) : 3;
    const tip = t("daily.pointTip", { date: bar.date, cost: formatMoney(bar.cost, scale.currency) }) +
      (bar.tokens === null ? "" : " \u00b7 " + t("daily.tokens", { value: formatAmount(bar.tokens) }));
    return jsx("span", {
      className: "ub-trend-bar",
      "data-empty": bar.cost > 0 ? undefined : "true",
      style: { height: String(height) + "%" },
      title: tip,
    }, bar.date + "-" + String(index));
  });
  const first = scale.bars.length === 0 ? "" : scale.bars[0].date;
  const last = scale.bars.length === 0 ? "" : scale.bars[scale.bars.length - 1].date;
  // The window is spelled out so the chart total can never be mistaken for the
  // lifetime spend the card also carries.
  const range = first === "" || last === "" || scale.bars.length < 2
    ? null
    : t("daily.range", { from: shortDate(first), to: shortDate(last) });
  return jsxs("div", {
    className: "ub-trend",
    children: [
      jsxs("div", {
        key: "head",
        className: "ub-trend-head",
        children: [
          jsx("span", { className: "ub-trend-title", children: t("daily.title", { n: String(bars.length) }) }),
          jsx("span", { className: "ub-trend-total", children: formatMoney(scale.total, scale.currency) }),
        ],
      }),
      jsx("div", {
        key: "bars",
        className: "ub-trend-bars",
        role: "img",
        "aria-label": t("daily.title", { n: String(bars.length) }) + " " + formatMoney(scale.total, scale.currency) +
          (range === null ? "" : " " + range),
        children: bars,
      }),
      range === null ? null : jsx("span", { key: "range", className: "ub-trend-range", children: range }),
    ],
  });
}

/**
 * The panel's data source: one snapshot, one in-flight request at a time,
 * auto-refresh on the host ttl, and a refetch whenever the page becomes visible.
 *
 * Stale-while-revalidate: the last successful envelope is restored from
 * sessionStorage synchronously, so the first render already has numbers, and no
 * in-flight request ever blanks them. A `stale: true` answer (the host served a
 * cache it is refreshing behind) earns exactly one bounded follow-up read.
 *
 * @returns {object} state, busy flag, `refresh` action and the ticking `now`.
 */
function useUsageBoard() {
  const [state, setState] = useState(function () {
    // Runs during the first render, before any effect: a stored snapshot paints
    // in the very first frame instead of after a round trip.
    const restored = readStoredSnapshot();
    if (restored === null) return { phase: "loading", snapshot: null, failure: null };
    return { phase: "ready", snapshot: restored, failure: null };
  });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(function () {
    return Date.now();
  });
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const followUpRef = useRef(null);

  useEffect(function () {
    mountedRef.current = true;
    return function () {
      mountedRef.current = false;
      if (followUpRef.current !== null) {
        clearTimeout(followUpRef.current);
        followUpRef.current = null;
      }
    };
  }, []);

  const run = useCallback(function (kind) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const manual = kind === "manual";
    let settled;
    try {
      settled = requestJson(manual ? REFRESH_URL : SNAPSHOT_URL, manual ? { method: "POST" } : undefined);
    } catch (error) {
      settled = Promise.reject(error);
    }
    settled.then(
      function (body) {
        busyRef.current = false;
        if (!mountedRef.current) return;
        setBusy(false);
        setNow(Date.now());
        writeStoredSnapshot(body);
        setState({ phase: "ready", snapshot: normalizeSnapshot(body), failure: null });
        // A stale answer means the host handed us a cache it is refreshing
        // behind. One short follow-up picks up the fresh numbers without the
        // user acting. A follow-up that is *itself* stale schedules nothing, so
        // a host that keeps answering from cache cannot turn this into a poll —
        // the ordinary ttl schedule takes over from there.
        if (body.stale === true && kind !== "followup" && followUpRef.current === null) {
          followUpRef.current = setTimeout(function () {
            followUpRef.current = null;
            run("followup");
          }, STALE_FOLLOW_UP_MS);
        }
      },
      function (error) {
        busyRef.current = false;
        if (!mountedRef.current) return;
        setBusy(false);
        const failure = describeFailure(error);
        setState(function (previous) {
          // A failed refresh keeps the last good numbers on screen; only a
          // failure with nothing to show becomes the panel's whole state.
          if (previous.snapshot === null) return { phase: "error", snapshot: null, failure: failure };
          return { phase: previous.phase, snapshot: previous.snapshot, failure: failure };
        });
      },
    );
  }, []);

  const ttlMs = clampTtl(state.snapshot === null ? null : state.snapshot.ttlMs);

  useEffect(function () {
    const timer = setInterval(function () {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      run("auto");
    }, ttlMs);
    return function () {
      clearInterval(timer);
    };
  }, [ttlMs, run]);

  useEffect(function () {
    run("auto");
    if (typeof document === "undefined") return undefined;
    const onVisibility = function () {
      if (document.visibilityState === "visible") run("auto");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return function () {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run]);

  useEffect(function () {
    const timer = setInterval(function () {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setNow(Date.now());
    }, 1000);
    return function () {
      clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(function () {
    run("manual");
  }, [run]);

  return { state: state, busy: busy, now: now, refresh: refresh };
}

/** Circular-arrow glyph shared by both refresh affordances. */
function RefreshGlyph() {
  return jsxs("svg", {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
    children: [
      jsx("path", { key: "arc", d: "M13.2 8a5.2 5.2 0 1 1-1.9-4" }),
      jsx("path", { key: "head", d: "M13.6 1.6v3.2h-3.2" }),
    ],
  });
}

/**
 * The panel's single refresh control, in the header. The footer deliberately has
 * no second one: two controls for one action is noise, not convenience.
 * @param {Function} t
 * @param {object} board
 */
function refreshButton(t, board) {
  return jsxs("button", {
    type: "button",
    className: "ub-refresh",
    onClick: board.refresh,
    disabled: board.busy,
    "aria-busy": board.busy ? "true" : undefined,
    "aria-label": t("action.refresh"),
    children: [
      jsx("span", {
        key: "glyph",
        className: board.busy ? "ub-spin is-on" : "ub-spin",
        "aria-hidden": "true",
        children: jsx(RefreshGlyph, {}),
      }),
      jsx("span", { key: "label", children: board.busy ? t("action.refreshing") : t("action.refresh") }),
    ],
  });
}

/** One quota window: label, progress bar, used/limit, remaining, reset countdown. */
function WindowRow(props) {
  const t = props.t;
  const window = props.window;
  // The fraction the window's own numbers imply wins over what the provider
  // declared, so the percentage can never contradict the used/limit printed
  // beside it. `window.percent` stays the declared diagnostic and is the
  // fallback only when there is no usable pair (see normalizeWindow).
  const percent = isNum(window.derivedPercent) ? window.derivedPercent : window.percent;
  const width = isNum(percent) ? clamp(percent, 0, 100) : 0;
  const level = !isNum(percent) ? "unknown" : percent >= 90 ? "danger" : percent >= 70 ? "warn" : "ok";
  const label = windowLabel(t, window);
  const count = isNum(window.number) && window.number > 1 ? " \u00d7" + String(window.number) : "";
  const reset = resetText(t, window.resetAt, props.now);
  const foot = compact([
    jsx("span", { key: "usage", className: "ub-nums", children: t("window.usage", {
      used: formatAmount(window.used),
      limit: formatAmount(window.limit),
    }) }),
    window.remaining === null
      ? null
      : jsx("span", { key: "rest", className: "ub-rest", children: t("window.remaining", {
        value: formatAmount(window.remaining),
      }) }),
    reset === null ? null : jsx("span", { key: "reset", className: "ub-reset", children: reset }),
    window.note === null ? null : jsx("span", { key: "note", className: "ub-hint", children: window.note }),
  ]);
  return jsxs("div", {
    className: "ub-metric",
    children: [
      jsxs("div", {
        key: "head",
        className: "ub-metric-head",
        children: [
          jsx("span", { className: "ub-metric-label", title: label, children: label + count }),
          jsx("span", { className: "ub-metric-value", children: formatPercent(percent) }),
        ],
      }),
      jsx("div", {
        key: "bar",
        className: "ub-bar",
        role: "progressbar",
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": isNum(percent) ? Math.round(width) : undefined,
        "aria-valuetext": formatPercent(percent),
        children: jsx("span", {
          className: "ub-bar-fill",
          "data-level": level,
          // A true 0% is data, not an absence: it prints 0.0% and draws an
          // empty track rather than the minimum-width stub a small share gets.
          "data-empty": width > 0 ? undefined : "true",
          style: { width: width.toFixed(1) + "%" },
        }),
      }),
      jsx("div", { key: "foot", className: "ub-metric-foot", children: foot }),
    ],
  });
}

/** One money balance: amount, bonus portion and lifetime spend when reported. */
function BalanceRow(props) {
  const t = props.t;
  const balance = props.balance;
  const meta = compact([
    isNum(balance.bonus) && balance.bonus !== 0
      ? t("balance.bonus", { value: formatMoney(balance.bonus, balance.currency) })
      : null,
    balance.totalSpent === null ? null : t("balance.spent", { value: formatMoney(balance.totalSpent, balance.currency) }),
  ]);
  return jsxs("div", {
    className: "ub-balance",
    children: [
      jsx("span", { key: "value", className: "ub-balance-value", children: formatMoney(balance.available, balance.currency) }),
      meta.length === 0 ? null : jsx("span", { key: "meta", className: "ub-balance-meta", children: meta.join(" \u00b7 ") }),
    ],
  });
}

/** One provider card, in protocol order. */
function ProviderCard(props) {
  const t = props.t;
  const provider = props.provider;
  const ok = provider.status === "ok";
  const trend = ok ? providerTrend(provider) : null;
  const masked = provider.account !== null && typeof provider.account === "object"
    ? strOrNull(provider.account.masked)
    : null;
  const body = [];
  if (!ok) {
    body.push(jsxs("div", {
      key: "state",
      className: "ub-state",
      children: compact([
        jsx("p", { key: "line", className: "ub-state-line", children: providerMessage(t, provider) }),
        provider.code === null ? null : jsx("code", { key: "code", className: "ub-code", children: provider.code }),
      ]),
    }));
  } else {
    for (const window of provider.windows) {
      body.push(jsx(WindowRow, { window: window, t: t, now: props.now }, window.id));
    }
    if (provider.balances.length > 0) {
      body.push(jsx("div", {
        key: "balances",
        className: "ub-balances",
        children: provider.balances.map(function (balance, index) {
          return jsx(BalanceRow, { balance: balance, t: t }, balance.currency + "-" + String(index));
        }),
      }));
    }
    if (trend !== null) {
      body.push(jsx(DailyTrend, { series: trend, t: t }, "trend"));
    }
    if (provider.windows.length === 0 && trend === null) {
      // A quota-less provider is not a failure. A wallet-only service explains
      // itself; a card with nothing at all uses the protocol's own wording.
      body.push(jsx("p", {
        key: "no-windows",
        className: "ub-note",
        children: provider.balances.length === 0 ? t("state.noWindows") : t("state.balanceOnly"),
      }));
    }
  }
  return jsxs("article", {
    className: "ub-card",
    "data-status": provider.status,
    "data-provider": provider.id,
    children: [
      jsxs("div", {
        key: "head",
        className: "ub-card-head",
        children: [
          jsxs("div", {
            className: "ub-card-title-row",
            children: compact([
              jsx("h2", { key: "title", className: "ub-card-title", children: provider.label }),
              provider.plan === null ? null : jsx("span", { key: "plan", className: "ub-plan", children: provider.plan }),
              masked === null ? null : jsx("span", { key: "account", className: "ub-account", title: masked, children: masked }),
            ]),
          }),
          jsxs("span", {
            key: "pill",
            className: "ub-pill",
            "data-tone": statusTone(provider.status),
            children: [
              jsx("i", { key: "dot", className: "ub-dot", "aria-hidden": "true" }),
              jsx("span", { key: "text", children: t(statusKey(provider.status)) }),
            ],
          }),
        ],
      }),
      jsx("div", { key: "body", className: "ub-card-body", children: body }),
    ],
  });
}

/** The whole panel: header, provider cards, footer. */
function UsageBoardPanel(props) {
  const t = translateOf(props);
  const board = useUsageBoard();
  const snapshot = board.state.snapshot;
  const providers = snapshot === null ? [] : snapshot.providers;
  const failure = board.state.failure;
  const hosts = collectHosts(providers);
  const updated = relativeTime(t, snapshot === null ? null : snapshot.generatedAt, board.now);
  // While a snapshot is on screen, being busy is said here and on the refresh
  // button — never by emptying the body the user is reading.
  const freshness = snapshot !== null && board.busy
    ? (updated === null ? t("updated.none") : updated) + " \u00b7 " + t("updated.refreshing")
    : (updated === null ? t("updated.none") : updated);

  const body = [];
  if (board.state.phase === "loading") {
    body.push(jsx("p", { key: "loading", className: "ub-note", children: t("state.loading") }));
  } else if (board.state.phase === "error") {
    body.push(jsxs("div", {
      key: "failure",
      className: "ub-failure",
      children: compact([
        jsx("p", { key: "line", className: "ub-failure-line", children: failure === null ? t("error.network") : t(failure.key, failure.params) }),
        failure === null || failure.detail === null ? null : jsx("code", { key: "detail", className: "ub-code", children: failure.detail }),
        jsx("button", {
          key: "retry",
          type: "button",
          className: "ub-retry",
          onClick: board.refresh,
          disabled: board.busy,
          children: t("action.retry"),
        }),
      ]),
    }));
  } else {
    if (failure !== null) {
      const reason = failure.detail === null ? t(failure.key, failure.params) : failure.detail;
      body.push(jsx("p", {
        key: "refresh-failure",
        className: "ub-note",
        role: "status",
        children: t("state.refreshFailed", { reason: reason }),
      }));
    }
    if (providers.length === 0) {
      body.push(jsx("p", { key: "empty", className: "ub-note", children: t("state.empty") }));
    }
    for (const provider of providers) {
      body.push(jsx(ProviderCard, { provider: provider, t: t, now: board.now }, provider.id));
    }
  }

  return jsxs("section", {
    className: "ub-root",
    "data-phase": board.state.phase,
    "aria-label": t("panel"),
    children: [
      jsxs("header", {
        key: "head",
        className: "ub-head",
        children: [
          jsxs("div", {
            className: "ub-head-text",
            children: [
              jsx("h1", { className: "ub-title", children: t("panel") }),
              jsx("p", {
                className: "ub-updated",
                children: freshness,
              }),
            ],
          }),
          refreshButton(t, board),
        ],
      }),
      jsx("div", { key: "body", className: "ub-body", children: body }),
      jsx("footer", {
        key: "foot",
        className: "ub-foot",
        children: jsx("span", {
          className: "ub-source",
          children: hosts.length === 0 ? t("source.none") : t("source.host", { host: hosts.join(" \u00b7 ") }),
        }),
      }),
    ],
  });
}

/** Sidebar glyph: three rising bars, the usage-board mark. */
function UsageBoardPanelIcon(props) {
  const size = isNum(props === null || props === undefined ? null : props.size) ? props.size : 16;
  return jsxs("svg", {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
    children: [
      jsx("rect", { key: "a", x: 1.5, y: 8.5, width: 3.2, height: 6, rx: 1, fill: "currentColor", opacity: 0.55 }),
      jsx("rect", { key: "b", x: 6.4, y: 5, width: 3.2, height: 9.5, rx: 1, fill: "currentColor", opacity: 0.8 }),
      jsx("rect", { key: "c", x: 11.3, y: 1.5, width: 3.2, height: 13, rx: 1, fill: "currentColor" }),
    ],
  });
}
    //#endregion

    //#region dsh-plugin-usage-board: client registration
    /**
     * Required Cordis services: `slots` carries both registrations, `locale`
     * carries the `usageBoard` namespace the panel and sidebar label read.
     */
    const inject = ["slots", "locale"];

    /**
     * Contribute the 用量看板 sidebar entry and the panel it opens.
     * @param {object} ctx browser plugin context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "usage-board: dictionaries");
      bindPanelTranslate(t);
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => t("panel"),
        locale: NS,
      }, UsageBoardPanelIcon));
      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main",
        key: PANEL_ID,
        locale: NS,
      }, UsageBoardPanel));
    }
    //#endregion

    exports.NS = NS;
    exports.PANEL_ID = PANEL_ID;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
