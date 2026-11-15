/**
 * dsh-plugin-usage-board — DSH Web client-module bundle.
 *
 * ASSEMBLED FROM, and byte-identical to, these source files:
 *   - src/client/protocol-copy.js  (itself generated from src/shared/protocol.js)
 *   - src/client/panel.js
 *   - src/client/composer.js
 *   - src/client/styles.css        (embedded below as the PANEL_CSS string)
 *   - src/client/composer.css      (embedded below as the COMPOSER_CSS string)
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
 * require() aliases used: "react", "react-dom" and "react/jsx-runtime" only.
 * All three are members of the shell's frozen platform module table, so none
 * needs a dsh.client.external entry.
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-usage-board",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const reactDom = require("react-dom");
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
  /* 14px matches the standalone page's cards; the literal fallback keeps the
     panel identical when the DSH frame publishes no radius token at all. */
  --ub-radius-panel: var(--dsw-radius-panel, 14px);
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

/* ---------- layout shell ---------- */

/* The DSH main-area slot is wide; the standalone page is the reading-width
   baseline the user chose. The .ub-inner rule centres the whole panel at that width
   (header, subtitle, card grid, footer) while still filling the slot's height,
   so the body scrolls but the footer stays pinned below it. */
.ub-inner {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ---------- header ---------- */

.ub-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding-left: var(--dsh-frame-leading-clearance, 0px);
  padding-bottom: 6px;
}

.ub-head-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ub-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--ub-fg);
}

.ub-updated {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--ub-fg-tertiary);
  font-variant-numeric: tabular-nums;
}

/* The services this board covers, exactly the standalone page's subtitle line.
   The 20px bottom margin is that page's spacer between the title block and the
   card grid; keeping it here makes the two surfaces share one vertical rhythm. */
.ub-subtitle {
  margin: 0 0 20px;
  font-size: 12px;
  line-height: 18px;
  color: var(--ub-fg-tertiary);
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
  /* The standalone page's card grid: as many equal-width columns as fit, one
     column when the pane is narrow, and rows that shrink to their content
     instead of stretching to fill a short pane. */
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  align-content: start;
  padding-right: 2px;
}

/* The grid's direct children are normally provider cards. A board-level note
   (a failed refresh) or the whole-board failure is not a card and must not be
   squeezed into one column: it spans the full row. */
.ub-body > .ub-note,
.ub-body > .ub-failure {
  grid-column: 1 / -1;
}

/* DeepSeek's illustration occupies the blank row below all provider cards.
   Cap its width so the whole 16:9 image fits a typical desktop pane without
   distorting it; the body still scrolls naturally in shorter panes. */
.ub-cash {
  grid-column: 1 / -1;
  min-width: 0;
  margin: 0;
  display: flex;
  justify-content: center;
}

.ub-cash-image {
  display: block;
  width: 100%;
  max-width: 960px;
  height: auto;
  border-radius: var(--ub-radius-panel);
}

/* 14px radius, 18/18/16 padding and a 16px gap are the standalone page's card
   metrics; the panel copies them so a wide main-area render reads as the same
   product, not as a different one. */
.ub-card {
  border: 0.5px solid var(--ub-border);
  border-radius: var(--ub-radius-panel, 14px);
  background: var(--ub-layer);
  padding: 18px 18px 16px;
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

/* ---------- first-paint skeletons ---------- */

/* One placeholder card per provider until that provider's own row lands. A
   single global "loading…" line would hide which services are still coming;
   these lines keep the card's rhythm so the numbers do not jump in later. */
.ub-card[data-skeleton="true"] {
  min-height: 104px;
}

.ub-skeleton-line,
.ub-skeleton-bar {
  display: block;
  border-radius: 4px;
  background: var(--ub-layer-3);
}

.ub-skeleton-line {
  height: 10px;
}

.ub-skeleton-line[data-width="short"] {
  width: 38%;
}

.ub-skeleton-line[data-width="wide"] {
  width: 88%;
}

.ub-skeleton-bar {
  height: 6px;
  border-radius: 999px;
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

/* Two trailing spend windows side by side: the label stays quiet, the amount
   carries the emphasis, and both use tabular numerals so the pair lines up
   across every card. These sizes are the standalone page's trend stats. */
.ub-trend-stats {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 18px;
  font-variant-numeric: tabular-nums;
}

.ub-trend-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.ub-trend-stat-label {
  font-size: 11px;
  line-height: 16px;
  color: var(--ub-fg-secondary);
  white-space: nowrap;
}

.ub-trend-stat-value {
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
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
  /* Both ends of the range matter: a zero-cost day is still a day, and a tiny
     nonzero day must not shrink below the same 2px floor as the zero stub —
     otherwise a ¥0.10 day reads as an empty slot. */
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--ub-info);
}

/* A zero-spend day is still a day. The min-height floor keeps all seven slots
   visible even when the week was mostly idle, so a sparse window cannot be
   mistaken for a chart that lost its data. */
.ub-trend-bar[data-empty="true"] {
  background: var(--ub-border-strong);
  min-height: 2px;
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

/* ---------- DeepSeek peak / off-peak billing reminder ---------- */

.ub-price {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--ub-radius);
  font-variant-numeric: tabular-nums;
}

.ub-price[data-phase="peak"] {
  background: var(--ub-warn-soft);
}

.ub-price[data-phase="offpeak"] {
  background: var(--ub-ok-soft);
}

.ub-price-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ub-price-icon {
  display: inline-flex;
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--ub-warn);
}

.ub-price[data-phase="offpeak"] .ub-price-icon {
  color: var(--ub-ok);
}

.ub-price-slogan {
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 18px;
  color: var(--ub-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ub-price-chip {
  flex: none;
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ub-layer-3);
  color: var(--ub-fg-secondary);
  font-size: 10.5px;
  line-height: 16px;
  white-space: nowrap;
}

.ub-price[data-phase="peak"] .ub-price-chip {
  color: var(--ub-warn);
}

.ub-price[data-phase="offpeak"] .ub-price-chip {
  color: var(--ub-ok);
}

.ub-price-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  font-size: 11px;
  line-height: 15px;
  color: var(--ub-fg-tertiary);
}

.ub-price-when {
  color: var(--ub-fg-secondary);
}

.ub-price-caveat {
  color: var(--ub-warn);
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

/* Below one 300px grid track plus the shell's horizontal padding, a single
   column is the only layout that cannot overflow horizontally. */
@media (max-width: 380px) {
  .ub-body {
    grid-template-columns: 1fr;
  }
}
`;
    const COMPOSER_CSS = `/* dsh-plugin-usage-board — composer usage strip styles.
 *
 * Embedded VERBATIM inside lib/client.js (as the COMPOSER_CSS string literal)
 * by scripts/build-client.mjs. Keep this file free of backticks and of a
 * dollar sign immediately before a brace.
 *
 * The trigger sits in the composer tool row, just before the model selector;
 * the popover portals to document.body (the docked composer is the containing
 * block for fixed descendants), so both scopes carry the custom properties
 * they need on their own roots. Colors follow the shared panel rules: below
 * 70% ok, 70-89% warn, 90%+ danger, unknown idle.
 */

.ub-composer,
.ub-composer-popover {
  --ub-fg: var(--dsw-alias-label-primary, #1f1f1f);
  --ub-fg-secondary: var(--dsw-alias-label-secondary, #5c5c5c);
  --ub-fg-tertiary: var(--dsw-alias-label-tertiary, #8a8a8a);
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
  --ub-radius: var(--dsw-radius-md, 8px);
  --ub-focus: var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #2f6fed));

  box-sizing: border-box;
}

@media (prefers-color-scheme: dark) {
  .ub-composer,
  .ub-composer-popover {
    --ub-fg: var(--dsw-alias-label-primary, #ececec);
    --ub-fg-secondary: var(--dsw-alias-label-secondary, #b0b0b0);
    --ub-fg-tertiary: var(--dsw-alias-label-tertiary, #8a8a8a);
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
  }
}

.ub-composer *,
.ub-composer *::before,
.ub-composer *::after,
.ub-composer-popover *,
.ub-composer-popover *::before,
.ub-composer-popover *::after {
  box-sizing: border-box;
}

/* ---------- compact trigger (left of the model selector) ---------- */

.ub-composer {
  display: inline-flex;
  flex: none;
  min-width: 0;
}

.ub-composer-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  max-width: 100%;
  min-height: 28px;
  padding: 1px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--ub-fg-tertiary);
  font-family: inherit;
  /* Retain the stats-sized compact text after moving into the tool row:
     one pixel below the secondary content size (12px by default). */
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  font-variant-numeric: tabular-nums;
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  white-space: nowrap;
  cursor: pointer;
}

.ub-composer-trigger[aria-expanded="true"] {
  background: var(--ub-hover);
  color: var(--ub-fg-secondary);
}

@media (hover: hover) {
  .ub-composer-trigger:hover {
    background: var(--ub-hover);
    color: var(--ub-fg-secondary);
  }
}

.ub-composer-trigger:focus-visible,
.ub-composer-refresh:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--ub-focus);
  outline-offset: 1px;
}

.ub-composer-route {
  min-width: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ub-fg-secondary);
}

.ub-composer-window-short {
  flex: none;
}

.ub-composer-percent {
  flex: none;
  color: var(--ub-fg);
  font-weight: 500;
}

.ub-composer-reading {
  min-width: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ub-composer-more {
  flex: none;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ub-layer-3);
  color: var(--ub-fg-tertiary);
  font-size: 10.5px;
  line-height: 14px;
}

.ub-composer-alert {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--ub-danger-soft);
  color: var(--ub-danger);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.ub-composer[data-state="degraded"] .ub-composer-reading,
.ub-composer[data-state="unauthorized"] .ub-composer-reading,
.ub-composer[data-state="upstream-error"] .ub-composer-reading,
.ub-composer[data-state="network-error"] .ub-composer-reading,
.ub-composer[data-state="invalid-response"] .ub-composer-reading {
  color: var(--ub-danger);
}

/* ---------- quota ring ---------- */

.ub-composer-ring {
  display: inline-flex;
  flex: none;
}

.ub-composer-ring-track {
  fill: none;
  stroke: var(--ub-border-strong);
  stroke-width: 2;
}

.ub-composer-ring-fill {
  fill: none;
  stroke: var(--ub-idle);
  stroke-width: 2;
  stroke-linecap: round;
  transition: stroke-dasharray 240ms ease-out;
}

.ub-composer-ring[data-level="ok"] .ub-composer-ring-fill {
  stroke: var(--ub-ok);
}

.ub-composer-ring[data-level="warn"] .ub-composer-ring-fill {
  stroke: var(--ub-warn);
}

.ub-composer-ring[data-level="danger"] .ub-composer-ring-fill {
  stroke: var(--ub-danger);
}

.ub-composer-ring[data-level="unknown"] .ub-composer-ring-fill {
  stroke: var(--ub-idle);
}

@media (prefers-reduced-motion: reduce) {
  .ub-composer-ring-fill {
    transition: none;
  }
}

/* ---------- popover ---------- */

.ub-composer-popover {
  position: fixed;
  z-index: 1100;
  width: min(320px, calc(100vw - 24px));
  max-width: calc(100vw - 24px);
  max-height: calc(100dvh - 12px - max(12px, var(--dsh-frame-overlay-top, 12px)));
  height: fit-content;
  min-height: 0;
  margin: 0;
  padding: 12px;
  border: 0;
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-bg-overlay, #ffffff);
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(20px));
  --dsw-elevation-stroke-color: var(--ub-border);
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.12));
  font-size: 12px;
  line-height: 20px;
  color: var(--ub-fg-secondary);
  cursor: default;
  overflow-x: hidden;
  overflow-y: auto;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2, rgba(0, 0, 0, 0.2));
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2, rgba(0, 0, 0, 0.3));
  position-area: none;
  top: max(12px, var(--dsh-frame-overlay-top, 12px));
  bottom: max(12px, calc(anchor(top) + 8px));
  left: max(12px, anchor(left));
  right: 12px;
  position-try-fallbacks: --ub-composer-below, --ub-composer-viewport;
  align-self: end;
  justify-self: start;
}

@position-try --ub-composer-below {
  top: max(12px, calc(anchor(bottom) + 8px));
  bottom: 12px;
  align-self: start;
}

@position-try --ub-composer-viewport {
  position-area: none;
  inset: max(12px, var(--dsh-frame-overlay-top, 12px)) 12px 12px;
  margin: 0;
  align-self: safe start;
  justify-self: safe end;
}

.ub-composer-popover-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
}

.ub-composer-popover-title {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.ub-composer-popover-provider {
  font-size: 13px;
  line-height: 18px;
  color: var(--ub-fg);
}

.ub-composer-model {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  color: var(--ub-fg-tertiary);
}

.ub-composer-popover-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ub-composer-window {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ub-composer-window-detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ub-composer-window-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.ub-composer-window-label {
  min-width: 0;
  color: var(--ub-fg-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ub-composer-window-percent {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--ub-fg);
  font-weight: 500;
}

.ub-composer-window-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  font-size: 11px;
  line-height: 16px;
  color: var(--ub-fg-tertiary);
  font-variant-numeric: tabular-nums;
}

.ub-composer-note {
  margin: 0;
  color: var(--ub-fg-tertiary);
  overflow-wrap: anywhere;
}

.ub-composer-error {
  margin: 0;
  color: var(--ub-danger);
  overflow-wrap: anywhere;
}

.ub-composer-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ub-composer-popover-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 0.5px solid var(--ub-border);
}

.ub-composer-updated {
  min-width: 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--ub-fg-tertiary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ub-composer-refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  height: 24px;
  padding: 0 10px;
  border: 0.5px solid var(--ub-border-strong);
  border-radius: var(--ub-radius);
  background: transparent;
  color: var(--ub-fg);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

@media (hover: hover) {
  .ub-composer-refresh:hover:not(:disabled) {
    background: var(--ub-hover);
  }
}

.ub-composer-refresh:disabled {
  cursor: default;
  opacity: 0.55;
}

/* On narrow viewports the window's short label is the first thing to go. */
@media (max-width: 640px) {
  .ub-composer-window-short {
    display: none;
  }

  .ub-composer-route {
    max-width: 96px;
  }
}

/* The host tool row is an inline-size container, including in narrow sidebar
   conversations on a wide screen. Hide redundant labels, not the quota or
   trigger: the full provider/window names remain in the accessible name and
   popover. This leaves room for the adjacent model selector and Send. */
@container (max-width: 560px) {
  .ub-composer-route,
  .ub-composer-window-short {
    display: none;
  }
}
`;

    /** Install one plugin stylesheet once, guarded against a second registration. */
    function injectPluginStyles(id, css) {
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(id) + "]") !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-usage-board";
      tag.dataset.pluginCss = id;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    injectPluginStyles("dsh-plugin-usage-board/panel.css", PANEL_CSS);
    injectPluginStyles("dsh-plugin-usage-board/composer.css", COMPOSER_CSS);
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
const PROVIDER_IDS = ['deepseek', 'glm', 'kimi', 'opencode-go'];

/** Provider ids whose upstream API is a quota window API rather than a wallet. */
const QUOTA_PROVIDER_IDS = ['glm', 'kimi', 'opencode-go'];

/** HTTP path the host half serves the snapshot on (GET). */
const SNAPSHOT_PATH = '/usage-board/api/snapshot';

/**
 * HTTP path the host half serves a forced refresh on (POST). Returns the same
 * body as {@link SNAPSHOT_PATH}.
 */
const REFRESH_PATH = '/usage-board/api/refresh';

/**
 * HTTP path the host half serves ONE provider's envelope on.
 *
 * This is the decoupled read that lets a renderer paint each provider the
 * moment *that* provider answers: a slow or hanging upstream holds back its own
 * card only, never the whole board.
 *
 * - `GET` is the serving read and follows the same never-hide-numbers rule as
 *   {@link SNAPSHOT_PATH}: a fresh cached row is returned at once, an expired
 *   row is returned with `stale: true` while the host refreshes it behind the
 *   response, and only a provider with no cached row makes the caller wait.
 * - `POST` forces a fresh read of that one provider and waits for it.
 *
 * The body is a {@link UsageSnapshot} narrowed to exactly one row
 * (`providers.length === 1`, `ok` derived from it, same `ttlMs`/`stale`/
 * `refreshing` fields). The provider is selected by the `id` query parameter
 * ({@link PROVIDER_QUERY_PARAM}); a missing or unknown id is a transport-level
 * 400, never a provider failure, so it must not be rendered as a degraded row.
 */
const PROVIDER_PATH = '/usage-board/api/provider';

/** Query parameter selecting the provider for {@link PROVIDER_PATH}. */
const PROVIDER_QUERY_PARAM = 'id';

/** HTTP prefix owning every route this plugin registers. */
const ROUTE_PREFIX = '/usage-board';

/**
 * Maximum number of trailing days an adapter may put in `meta.dailyUsage`.
 * The UI draws the last 7 and sums the last 30, so the cap keeps a snapshot
 * small while still covering a full month of history.
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
 *   PROVIDER_PATH, PROVIDER_QUERY_PARAM, PROVIDER_IDS, PROTOCOL_VERSION
 *   makeWindow, makeBalance, makeProvider, makeSnapshot, round1, percentOf
 *     — from src/client/protocol-copy.js, itself a verbatim copy of
 *       src/shared/protocol.js.
 *
 * No JSX (there is no compiler in this package), no `require` outside the two
 * aliases above, and no dependency on anything the host half serves other than
 * the per-provider JSON route (`PROVIDER_PATH` + `PROVIDER_QUERY_PARAM`).
 *
 * The aggregate route (`SNAPSHOT_PATH` + `REFRESH_PATH`) still exists for older
 * clients, but this panel deliberately never calls it: one aggregate read is
 * exactly the "wait for the slowest provider" behaviour the per-provider route
 * removes.
 * ------------------------------------------------------------------------- */

const { useState, useEffect, useRef, useCallback } = react;
const { jsx, jsxs } = jsxRuntime;

/** Locale namespace registered through `ctx.locale.register`. */
const NS = "usageBoard";

/** Panel id shared by the `sidebar.panellist` entry and the `main` keyed slot. */
const PANEL_ID = "usage-board";

/** Sidebar position; plugin-manager uses 0, so 20 sits just below it. */
const PANEL_ORDER = 20;

/** Same-origin asset served by the host, shown below the provider cards. */
const DEEPSEEK_CASH_URL = ROUTE_PREFIX + "/deepseek_cash.png";

/**
 * Display names for the providers this build knows. Only used before that
 * provider's first row arrives (its skeleton or local failure card); a real row
 * always renders its own host-provided `label`. Kept in step with the host
 * adapters' LABEL constants.
 */
const PROVIDER_LABELS = {
  deepseek: "DeepSeek",
  glm: "GLM Coding Plan",
  kimi: "Kimi Code",
  "opencode-go": "OpenCode Go",
};

/** Auto-refresh bounds: the host's ttl is honoured inside 60s … 5min. */
const TTL_MIN_MS = 60 * 1000;
const TTL_MAX_MS = 5 * 60 * 1000;

/**
 * Auto refresh pauses after this long without any user input. A visible but
 * unattended window is idle: nobody is reading the numbers, so nobody benefits
 * from the upstream reads each expired poll would trigger.
 */
const IDLE_AFTER_MS = 3 * 60 * 1000;

/**
 * How often the gate re-evaluates while mounted. Pure bookkeeping — no
 * requests — and the only transition no DOM event announces is idling out, so
 * this is what closes the gate when the user walks away mid-activity.
 */
const GATE_RECHECK_MS = 30 * 1000;

/** DOM events that count as the user being present at the app. */
const ACTIVITY_EVENT_NAMES = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

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

/**
 * The two spend-history windows the DeepSeek card reports.
 *
 * `meta.dailyUsage.points` is a trailing daily-spend series, oldest first, up
 * to 30 points (see the host adapter). The chart draws only the last week, but
 * both totals come from the same series so the headline numbers can never
 * disagree with the bars next to them. A young account simply has fewer points;
 * both windows then use what exists instead of inventing zero days.
 */
const WEEK_TREND_POINTS = 7;
const MONTH_TREND_POINTS = 30;

/** Billing phases the DeepSeek reminder understands. */
const PRICING_PHASES = ["peak", "offpeak"];

/** Beijing offset assumed when a host omits `meta.pricing.utcOffsetMinutes`. */
const PRICING_DEFAULT_OFFSET_MINUTES = 480;

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
  // Countdown phrase without its verb, shared by the plain countdown
  // ("{after}重置") and the 5-hour window's exact-reset line ("{at}（{after}）").
  "window.after.seconds": "{n} \u79d2\u540e",
  "window.after.minutes": "{n} \u5206\u949f\u540e",
  "window.after.hours": "{n} \u5c0f\u65f6\u540e",
  "window.after.days": "{n} \u5929\u540e",
  "window.reset.relative": "{after}\u91cd\u7f6e",
  // Absolute local clock time of the reset, minute precision. The day is named
  // only when the instant is not today, because a 5-hour window can cross midnight.
  "window.reset.at": "{time} \u91cd\u7f6e",
  "window.reset.tomorrow": "\u660e\u65e5 {time} \u91cd\u7f6e",
  "window.reset.day": "{month} \u6708 {day} \u65e5 {time} \u91cd\u7f6e",
  "window.reset.exact": "{at}\uff08{after}\uff09",
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
  "opencode-go.5h": "5 \u5c0f\u65f6\u7a97\u53e3",
  "opencode-go.weekly": "\u6bcf\u5468\u7a97\u53e3",
  "opencode-go.monthly": "\u6bcf\u6708\u7a97\u53e3",
  "deepseek.balance": "\u4f59\u989d",
  // Spend history, never allowance: the week/month labels are window totals of
  // money already spent, not a quota and not something that "remains".
  "daily.week": "\u8fd1\u4e00\u5468",
  "daily.month": "\u8fd1\u4e00\u6708",
  "daily.range": "{from} \u2192 {to}",
  "daily.pointTip": "{date} \u00b7 {cost}",
  "daily.tokens": "{value} tokens",
  "pricing.peakChip": "\u9ad8\u5cf0 \u00b7 \u6807\u51c6\u4ef7",
  "pricing.offpeakChip": "\u7a7a\u95f2 \u00b7 5 \u6298",
  "pricing.peakSlogan": "\u73b0\u5728\u662f\u6881\u6587\u5cf0\u65f6\u6bb5\uff01",
  "pricing.offpeakSlogan": "\u73b0\u5728\u662f\u6881\u6587\u8c37\u65f6\u6bb5\uff01",
  "pricing.countdown.raise": "\u8ddd\u6da8\u4ef7 {when}",
  "pricing.countdown.drop": "\u8ddd\u964d\u4ef7 {when}",
  "pricing.when.soon": "\u5373\u5c06\u5207\u6362",
  "pricing.when.seconds": "{n} \u79d2",
  "pricing.when.minutes": "{n} \u5206\u949f",
  "pricing.when.hours": "{h} \u5c0f\u65f6 {m} \u5206",
  "pricing.when.hoursExact": "{h} \u5c0f\u65f6",
  "pricing.when.days": "{d} \u5929 {h} \u5c0f\u65f6",
  "pricing.when.daysExact": "{d} \u5929",
  "pricing.timeZone": "\u5317\u4eac\u65f6\u95f4",
  "pricing.rule": "\u5317\u4eac\u65f6\u95f4\u5468\u4e00\u81f3\u5468\u4e94 09:00\u201312:00\u300114:00\u201318:00 \u4e3a\u9ad8\u5cf0\u65f6\u6bb5\uff1b\u5176\u4f59\u65f6\u95f4\uff08\u542b\u5468\u672b\u4e0e\u6cd5\u5b9a\u8282\u5047\u65e5\uff09\u4e3a\u7a7a\u95f2\u65f6\u6bb5\uff0c\u7a7a\u95f2\u4ef7\u4e3a\u9ad8\u5cf0\u4ef7\u7684\u4e00\u534a\u3002",
  "pricing.calendarUnavailable": "\u672a\u5b89\u88c5\u8282\u5047\u65e5\u65e5\u5386\uff0c\u6682\u6309\u5de5\u4f5c\u65e5\u4f30\u7b97\u3002",
  "pricing.calendarStale": "\u8282\u5047\u65e5\u65e5\u5386\u5c1a\u672a\u8986\u76d6\u5b8c\u6574\u8ba1\u5212\u533a\u95f4\uff0c\u6682\u6309\u5de5\u4f5c\u65e5\u4f30\u7b97\u3002",
  "composer.window.5h": "5 小时",
  "composer.window.weekly": "每周",
  "composer.window.monthly": "每月",
  "composer.balance": "余额 {value}",
  "composer.loading": "读取中…",
  "composer.unavailable": "不可用",
  "composer.noQuota": "无配额",
  "composer.noData": "暂无用量数据。",
  "composer.more": "还有 {n} 个额度窗口",
  "composer.stale": "刷新失败，显示上次成功读取的数据。",
  "composer.aria": "{provider} 用量：{reading}",
  "composer.popup": "{provider} 用量详情",
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
  "window.after.seconds": "in {n}s",
  "window.after.minutes": "in {n} min",
  "window.after.hours": "in {n} h",
  "window.after.days": "in {n} d",
  "window.reset.relative": "Resets {after}",
  "window.reset.at": "Resets at {time}",
  "window.reset.tomorrow": "Resets tomorrow at {time}",
  "window.reset.day": "Resets {month}/{day} at {time}",
  "window.reset.exact": "{at} ({after})",
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
  "opencode-go.5h": "5-hour window",
  "opencode-go.weekly": "Weekly window",
  "opencode-go.monthly": "Monthly window",
  "deepseek.balance": "Balance",
  "daily.week": "Last 7 days",
  "daily.month": "Last 30 days",
  "daily.range": "{from} \u2192 {to}",
  "daily.pointTip": "{date} \u00b7 {cost}",
  "daily.tokens": "{value} tokens",
  "pricing.peakChip": "Peak \u00b7 full price",
  "pricing.offpeakChip": "Off-peak \u00b7 50% off",
  // The Chinese verbatim the slogan translates: the founder's name 梁文峰
  // (Liang Wenfeng) contains 峰 ("peak"), so off-peak becomes 梁文谷 — swapping
  // that one character for 谷 ("valley") is the whole joke. English keeps a
  // literal transliteration; there is nothing better to do with a name pun.
  "pricing.peakSlogan": "It's Liang Wenfeng hour!",
  "pricing.offpeakSlogan": "It's Liang Wengu hour!",
  "pricing.countdown.raise": "Price rises in {when}",
  "pricing.countdown.drop": "Price drops in {when}",
  "pricing.when.soon": "moments",
  "pricing.when.seconds": "{n}s",
  "pricing.when.minutes": "{n} min",
  "pricing.when.hours": "{h} h {m} min",
  "pricing.when.hoursExact": "{h} h",
  "pricing.when.days": "{d} d {h} h",
  "pricing.when.daysExact": "{d} d",
  "pricing.timeZone": "Beijing time",
  "pricing.rule": "Peak: Beijing time, Monday\u2013Friday 09:00\u201312:00 and 14:00\u201318:00, excluding Chinese statutory holidays. All other times, including weekends and holidays, are off-peak at half the peak price.",
  "pricing.calendarUnavailable": "No holiday calendar is installed; weekday estimate only.",
  "pricing.calendarStale": "The holiday calendar does not cover the full shipped window yet; weekday estimate only.",
  "composer.window.5h": "5h",
  "composer.window.weekly": "Weekly",
  "composer.window.monthly": "Monthly",
  "composer.balance": "Balance {value}",
  "composer.loading": "Reading…",
  "composer.unavailable": "Unavailable",
  "composer.noQuota": "No quota",
  "composer.noData": "No usage data yet.",
  "composer.more": "{n} more quota windows",
  "composer.stale": "Refresh failed; showing the last successful reading.",
  "composer.aria": "{provider} usage: {reading}",
  "composer.popup": "{provider} usage details",
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

/** Zero-pad one local clock component to the two digits a time display needs. */
function pad2(value) {
  return value < 10 ? "0" + String(value) : String(value);
}

/**
 * Whether a window is one of the providers' five-hour rolling quota windows.
 *
 * The adapters give those windows stable ids (`glm.5h`, `kimi.5h`,
 * `opencode-go.5h`), which is the primary signal. `unit` is the provider's own
 * code (GLM `3`, Kimi's / OpenCode Go's textual `5h`); it is only a fallback for
 * a row shaped by an older host.
 * @param {object} window Normalized UsageWindow.
 * @returns {boolean}
 */
function isFiveHourWindow(window) {
  if (window === null || typeof window !== "object") return false;
  const id = strOrNull(window.id);
  if (id === "glm.5h" || id === "kimi.5h" || id === "opencode-go.5h") return true;
  const unit = strOrNull(window.unit === null || window.unit === undefined ? null : String(window.unit));
  if (unit === null) return false;
  return unit === "3" || unit.toLowerCase() === "5h";
}

/**
 * Countdown phrase WITHOUT its verb, so the plain countdown and the 5-hour
 * window's exact-reset line share one rounding rule: "2 小时后" / "in 2 h".
 * @param {Function} t
 * @param {number} diff Milliseconds until the reset; positive.
 * @returns {string}
 */
function resetAfter(t, diff) {
  const seconds = Math.ceil(diff / 1000);
  if (seconds < 60) return t("window.after.seconds", { n: String(seconds) });
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return t("window.after.minutes", { n: String(minutes) });
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return t("window.after.hours", { n: String(hours) });
  return t("window.after.days", { n: String(Math.round(diff / 86400000)) });
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
  return t("window.reset.relative", { after: resetAfter(t, diff) });
}

/**
 * The reset instant as a local wall-clock time, precise to the minute:
 * "16:35 重置", "明日 01:20 重置" or "10 月 26 日 06:11 重置".
 *
 * The day is named whenever the instant is not on the current local day, so a
 * five-hour window that rolls over midnight can never be misread as today. All
 * comparisons use local calendar fields, and the clock is the browser's own:
 * providers report absolute instants, so the reader's timezone is the one that
 * decides what "16:35" means on their screen.
 *
 * @param {Function} t
 * @param {number|null} resetAt Epoch ms.
 * @param {number} now Epoch ms, for the day comparison.
 * @returns {string|null}
 */
function resetClockText(t, resetAt, now) {
  if (!isNum(resetAt)) return null;
  const target = new Date(resetAt);
  const current = new Date(now);
  const time = pad2(target.getHours()) + ":" + pad2(target.getMinutes());
  const sameDay = target.getFullYear() === current.getFullYear()
    && target.getMonth() === current.getMonth()
    && target.getDate() === current.getDate();
  if (sameDay) return t("window.reset.at", { time: time });
  const tomorrow = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  const isTomorrow = target.getFullYear() === tomorrow.getFullYear()
    && target.getMonth() === tomorrow.getMonth()
    && target.getDate() === tomorrow.getDate();
  if (isTomorrow) return t("window.reset.tomorrow", { time: time });
  return t("window.reset.day", {
    month: String(target.getMonth() + 1),
    day: String(target.getDate()),
    time: time,
  });
}

/**
 * The reset line for one quota window, or null when it reports no reset.
 *
 * Every window keeps its countdown; a FIVE-HOUR window additionally gets the
 * exact local reset instant, because "3 小时后重置" alone cannot answer the one
 * question that window exists to answer — at which minute the allowance comes
 * back. Weekly windows keep the compact countdown: their reset is days away and
 * the precise minute adds noise without adding a decision.
 *
 * @param {Function} t
 * @param {object} window Normalized UsageWindow.
 * @param {number} now Epoch ms.
 * @returns {string|null}
 */
function windowResetText(t, window, now) {
  if (window === null || typeof window !== "object" || !isNum(window.resetAt)) return null;
  const diff = window.resetAt - now;
  if (diff <= 0) return t("window.reset.due");
  if (!isFiveHourWindow(window)) return resetText(t, window.resetAt, now);
  return t("window.reset.exact", {
    at: resetClockText(t, window.resetAt, now),
    after: resetAfter(t, diff),
  });
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
 * The URL of ONE provider's envelope.
 *
 * The provider id is the only caller-controlled value here and always comes
 * from PROVIDER_IDS, but it is still encoded: a future id must not be able to
 * smuggle extra query parameters into a request that reads credentials.
 * @param {string} id
 * @returns {string}
 */
function providerUrl(id) {
  return PROVIDER_PATH + "?" + PROVIDER_QUERY_PARAM + "=" + encodeURIComponent(id);
}

/**
 * The row a `PROVIDER_PATH` envelope carries for `id`, normalized; null when
 * the body is not an envelope or does not carry that row.
 *
 * The host contract narrows the envelope to exactly one row, so a body with no
 * matching row is a transport-level shape failure, never a provider failure.
 * Returning null (instead of fabricating a row) keeps the card honest: it shows
 * its local failure note rather than invented numbers.
 * @param {object} body
 * @param {string} id
 * @returns {object|null}
 */
function providerRowOf(body, id) {
  if (!isSnapshotBody(body)) return null;
  for (const raw of body.providers) {
    if (raw !== null && typeof raw === "object" && raw.id === id) return normalizeProvider(raw);
  }
  return null;
}

/**
 * A provider's display name for the states that have no row to read it from.
 * @param {string} id
 * @returns {string}
 */
function providerLabelFor(id) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, id) ? PROVIDER_LABELS[id] : id;
}

/**
 * An empty board state. The maps are null-prototype objects because provider
 * ids come off the wire: a provider literally named "__proto__" must be a key
 * like any other, not a prototype mutation.
 * @returns {object}
 */
function emptyView() {
  return {
    providers: Object.create(null),
    updatedAt: Object.create(null),
    failures: Object.create(null),
    pending: Object.create(null),
    ttl: Object.create(null),
    ttlMs: null,
  };
}

/**
 * Build the first board state, restoring the last merged envelope
 * synchronously so the very first frame paints whatever a previous visit saw.
 * @returns {object}
 */
function initialView() {
  const restored = readStoredSnapshot();
  const view = emptyView();
  if (restored === null) return view;
  for (const provider of restored.providers) {
    view.providers[provider.id] = provider;
    view.updatedAt[provider.id] = restored.generatedAt;
    view.ttl[provider.id] = restored.ttlMs;
  }
  view.ttlMs = restored.ttlMs;
  return view;
}

/**
 * Copy the bookkeeping maps so every publish is a new state object. Provider
 * rows are shared by reference: nothing mutates a row after normalization.
 * @param {object} view
 * @returns {object}
 */
function copyView(view) {
  return {
    providers: Object.assign(Object.create(null), view.providers),
    updatedAt: Object.assign(Object.create(null), view.updatedAt),
    failures: Object.assign(Object.create(null), view.failures),
    pending: Object.assign(Object.create(null), view.pending),
    ttl: Object.assign(Object.create(null), view.ttl),
    ttlMs: view.ttlMs,
  };
}

/**
 * Every provider id the panel renders a slot for, in display order:
 * PROVIDER_IDS first, then rows this build does not know, in the order they
 * were stored.
 *
 * Unknown rows can only come from a restored cache written by a build that knew
 * more providers; showing them (instead of dropping them) keeps a rollback from
 * silently losing a card, and appending them keeps the known cards stable.
 * @param {object} view
 * @returns {string[]}
 */
function slotIds(view) {
  const ids = PROVIDER_IDS.slice();
  for (const id of Object.keys(view.providers)) {
    if (ids.indexOf(id) === -1) ids.push(id);
  }
  return ids;
}

/**
 * The known provider rows in display order (unknown stored rows appended).
 * @param {object} view
 * @returns {object[]}
 */
function orderedProviders(view) {
  const rows = [];
  for (const id of slotIds(view)) {
    if (view.providers[id] !== undefined) rows.push(view.providers[id]);
  }
  return rows;
}

/**
 * A provider the user has not configured. Its row is still stored (so a later
 * refresh can reveal it the moment the credential appears), but the board
 * renders no card, no skeleton and no failure slot for it.
 * @param {unknown} row Normalized provider row.
 * @returns {boolean}
 */
function isUnconfigured(row) {
  return row !== null && row !== undefined && row.status === "not-configured";
}

/**
 * The rows that actually own a card on screen, in display order. The subtitle
 * and the board-wide failure note read this rather than the full roster, so a
 * hidden provider cannot make the board look degraded.
 * @param {object} view
 * @returns {object[]}
 */
function visibleProviders(view) {
  return orderedProviders(view).filter(function (row) {
    return !isUnconfigured(row);
  });
}

/**
 * One render slot per provider, in display order: the card when its row is on
 * screen, its local transport-failure card when the last read failed with no
 * row to keep, or the first-paint skeleton otherwise.
 *
 * Unconfigured providers are filtered out entirely: they are not a degraded
 * card, they are simply not part of the board until a credential is configured.
 * @param {object} view
 * @returns {Array<{kind: string, id: string, provider?: object, failure?: object}>}
 */
function panelSlots(view) {
  return slotIds(view)
    .map(function (id) {
      if (view.providers[id] !== undefined) return { kind: "provider", id: id, provider: view.providers[id] };
      if (view.failures[id] !== undefined) return { kind: "failure", id: id, failure: view.failures[id] };
      return { kind: "skeleton", id: id };
    })
    .filter(function (slot) {
      return slot.kind !== "provider" || !isUnconfigured(slot.provider);
    });
}

/**
 * The newest moment any row landed — what the header's relative "last updated"
 * line describes. Restored rows count from the stored envelope's generatedAt.
 * @param {object} view
 * @returns {number|null}
 */
function latestUpdatedAt(view) {
  let newest = null;
  for (const id of Object.keys(view.updatedAt)) {
    const at = view.updatedAt[id];
    if (isNum(at) && (newest === null || at > newest)) newest = at;
  }
  return newest;
}

/**
 * The auto-refresh cadence: the shortest ttl any provider promised, clamped to
 * the supported band. All providers normally share the host ttl; tracking each
 * row's promise keeps a future per-provider cadence from being ignored.
 * @param {object} view
 * @returns {number}
 */
function viewTtlMs(view) {
  let shortest = null;
  for (const id of Object.keys(view.ttl)) {
    const ttl = numOrNull(view.ttl[id]);
    if (ttl !== null && (shortest === null || ttl < shortest)) shortest = ttl;
  }
  return clampTtl(shortest === null ? numOrNull(view.ttlMs) : shortest);
}

/**
 * The board-level phase:
 * - `ready` whenever a visible row is on screen, even if other providers are
 *   still loading or failed — one slow provider must not downgrade the whole
 *   board;
 * - `ready` also when the only rows are unconfigured ones: the board settled,
 *   and the panel renders the empty state instead of a spinner;
 * - `error` when nothing has ever loaded and every attempt failed;
 * - `loading` otherwise (first paint, or retries in flight).
 * @param {object} view
 * @returns {'loading'|'ready'|'error'}
 */
function boardPhase(view) {
  if (visibleProviders(view).length > 0) return "ready";
  if (Object.keys(view.pending).length > 0) return "loading";
  if (orderedProviders(view).length > 0) return "ready";
  if (Object.keys(view.failures).length > 0) return "error";
  return "loading";
}

/** The most recent failure of any provider. */
function latestFailure(view) {
  let latest = null;
  for (const id of Object.keys(view.failures)) {
    const failure = view.failures[id];
    if (latest === null || failure.at > latest.at) latest = failure;
  }
  return latest;
}

/**
 * The most recent failure that happened while its provider's OLD numbers were
 * still on screen. That is the only failure the panel reports globally: a
 * failed refresh must never blank numbers, and this is the note that says they
 * are older than they look. A failure with no numbers to keep is that
 * provider's own local failure card instead.
 */
function retainedFailure(view) {
  let latest = null;
  for (const id of Object.keys(view.failures)) {
    const row = view.providers[id];
    // An unconfigured provider has no card, so its old row is not "numbers on
    // screen" and a failure about it must not become the board-wide note.
    if (row === undefined || isUnconfigured(row)) continue;
    const failure = view.failures[id];
    if (latest === null || failure.at > latest.at) latest = failure;
  }
  return latest;
}

/**
 * The envelope to persist for the next visit: every row currently on screen, in
 * display order, stamped with the newest per-provider receive time. A partial
 * first load therefore caches whatever arrived instead of nothing.
 * @param {object} view
 * @returns {object|null}
 */
function mergedEnvelope(view) {
  const providers = orderedProviders(view);
  if (providers.length === 0) return null;
  const generatedAt = latestUpdatedAt(view);
  return makeSnapshot({
    generatedAt: generatedAt === null ? Date.now() : generatedAt,
    ttlMs: isNum(view.ttlMs) ? view.ttlMs : TTL_MIN_MS,
    providers: providers,
  });
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
 * The trailing daily-spend series a provider may attach to `meta.dailyUsage`:
 * one point per calendar day, oldest first, up to 30 days. This is HISTORY,
 * never allowance: it is drawn as a trend and is never labelled as a quota or a
 * remainder. {@link trendScale} derives the week/month totals and the chart
 * window from it.
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
 * The trend's windows and bar scale, all derived from the same trailing series.
 *
 * The month total sums the last 30 points, the week total the last 7, and the
 * chart draws exactly those last 7 points — so the bars and the week number
 * always describe the same days. A shorter series (a young account, or an older
 * host that capped the history lower) uses what exists rather than padding
 * zero days the host never sent.
 *
 * @param {object} series
 * @returns {{ bars: Array<{date: string, cost: number, tokens: number|null}>, max: number, weekTotal: number, monthTotal: number, currency: string }}
 */
function trendScale(series) {
  const bars = series.points.slice(-WEEK_TREND_POINTS).map(function (point) {
    return {
      date: strOrNull(point.date) === null ? "" : point.date,
      cost: isNum(point.cost) ? point.cost : 0,
      tokens: numOrNull(point.tokens),
    };
  });
  let max = 0;
  let weekTotal = 0;
  for (const bar of bars) {
    if (bar.cost > max) max = bar.cost;
    weekTotal += bar.cost;
  }
  let monthTotal = 0;
  for (const point of series.points.slice(-MONTH_TREND_POINTS)) {
    monthTotal += isNum(point.cost) ? point.cost : 0;
  }
  return { bars: bars, max: max, weekTotal: weekTotal, monthTotal: monthTotal, currency: series.currency };
}

/**
 * Coerce `provider.meta.pricing` (host-shipped, additive) onto the shape the
 * reminder renders. A row without it, or with a phase this build does not
 * understand, yields null and the reminder simply does not render: an unknown
 * schedule is not an error worth a card of its own.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizePricing(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const phase = strOrNull(raw.phase);
  if (phase === null || PRICING_PHASES.indexOf(phase) === -1) return null;
  const transitions = [];
  if (Array.isArray(raw.transitions)) {
    for (const entry of raw.transitions) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
      const at = numOrNull(entry.at);
      const target = strOrNull(entry.phase);
      if (at === null || target === null || PRICING_PHASES.indexOf(target) === -1) continue;
      transitions.push({ at: at, phase: target });
    }
  }
  transitions.sort(function (left, right) {
    return left.at - right.at;
  });
  const offset = numOrNull(raw.utcOffsetMinutes);
  const calendar = raw.holidayCalendar !== null && typeof raw.holidayCalendar === "object" && !Array.isArray(raw.holidayCalendar)
    ? {
      source: strOrNull(raw.holidayCalendar.source),
      through: numOrNull(raw.holidayCalendar.through),
      // Optional additive flag: an older host omits it, and the caveat below
      // then falls back to the current-year check.
      coversHorizon: typeof raw.holidayCalendar.coversHorizon === "boolean" ? raw.holidayCalendar.coversHorizon : null,
    }
    : null;
  return {
    phase: phase,
    asOf: numOrNull(raw.asOf),
    utcOffsetMinutes: offset === null ? PRICING_DEFAULT_OFFSET_MINUTES : offset,
    holidayCalendar: calendar !== null && calendar.through !== null ? calendar : null,
    transitions: transitions,
  };
}

/**
 * The phase at `nowMs` and the next change, derived from the host-shipped
 * absolute transitions rather than from `asOf`.
 *
 * This is what keeps the reminder honest on a cached or restored snapshot: the
 * host's read may be minutes old, but the browser clock decides where in the
 * schedule "now" falls, so the banner flips exactly on the boundary.
 *
 * @param {object} pricing Normalized schedule.
 * @param {number} nowMs Epoch ms.
 * @returns {{ phase: string, nextAt: number|null, nextPhase: string|null }}
 */
function pricingStateAt(pricing, nowMs) {
  let phase = pricing.phase;
  for (const transition of pricing.transitions) {
    if (transition.at <= nowMs) {
      phase = transition.phase;
      continue;
    }
    return { phase: phase, nextAt: transition.at, nextPhase: transition.phase };
  }
  // Beyond the shipped horizon (a snapshot older than the horizon): keep the
  // last known phase and show no countdown instead of inventing one.
  return { phase: phase, nextAt: null, nextPhase: null };
}

/**
 * Human-readable duration until the next phase change, at most two units.
 * @param {Function} t
 * @param {number} nextAt Epoch ms.
 * @param {number} nowMs Epoch ms.
 * @returns {string}
 */
function pricingWhen(t, nextAt, nowMs) {
  const remaining = nextAt - nowMs;
  if (!isNum(remaining) || remaining <= 0) return t("pricing.when.soon");
  // Count completed units, not rounded-up ones: a countdown that says "2 分钟"
  // with 65 seconds left, or "1 天" with one second short of a day, reads like
  // a glitch. The last second before a switch is "即将切换".
  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return seconds === 0 ? t("pricing.when.soon") : t("pricing.when.seconds", { n: String(seconds) });
  const totalMinutes = Math.floor(remaining / 60000);
  if (totalMinutes < 60) return t("pricing.when.minutes", { n: String(totalMinutes) });
  const totalHours = Math.floor(remaining / 3600000);
  if (totalHours < 24) {
    const hours = totalHours;
    const minutes = Math.floor((remaining - totalHours * 3600000) / 60000);
    if (minutes === 0) return t("pricing.when.hoursExact", { h: String(hours) });
    return t("pricing.when.hours", { h: String(hours), m: String(minutes) });
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0) return t("pricing.when.daysExact", { d: String(days) });
  return t("pricing.when.days", { d: String(days), h: String(hours) });
}

/**
 * The caveat shown when the schedule is only a weekday estimate: no calendar
 * at all, or one that has not been updated to the current Beijing year.
 *
 * The wording matters — the host's fallback still bills ordinary weekdays as
 * peak, so a stale calendar must never read as "today is definitely cheap".
 *
 * @param {Function} t
 * @param {object} pricing Normalized schedule.
 * @param {number} nowMs Epoch ms.
 * @returns {string|null}
 */
function pricingCalendarCaveat(t, pricing, nowMs) {
  const calendar = pricing.holidayCalendar;
  if (calendar === null) return t("pricing.calendarUnavailable");
  // The host ships a rolling horizon, so in late December the countdown can
  // point at an unannounced next year while the current phase is still
  // accurate. `coversHorizon` is the host's answer to that; the year comparison
  // is the fallback for a host that predates the field.
  if (calendar.coversHorizon === false) return t("pricing.calendarStale");
  if (calendar.coversHorizon === null) {
    const year = new Date(nowMs + pricing.utcOffsetMinutes * 60000).getUTCFullYear();
    if (calendar.through < year) return t("pricing.calendarStale");
  }
  return null;
}

/**
 * The raw `meta.pricing` of a provider row, only for DeepSeek (the one provider
 * with a published peak/off-peak schedule). Other rows return null so the
 * reminder can never leak onto a card it has nothing to do with.
 * @param {object} provider Normalized provider row.
 * @returns {unknown}
 */
function providerPricing(provider) {
  if (provider.id !== "deepseek") return null;
  const meta = provider.meta;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta.pricing === undefined ? null : meta.pricing;
}

/**
 * A compact bar chart of the last week's daily spend, with the two trailing
 * spend totals beside it.
 *
 * This is HISTORY, never allowance: the numbers answer "how much was spent"
 * and never "how much is left". The week total and the bars describe the same
 * seven days, while the month total widens the same series to 30 days, so a
 * reader never has to guess which window a number belongs to.
 *
 * @param {object} props series, t
 */
function DailyTrend(props) {
  const t = props.t;
  const series = props.series;
  const scale = trendScale(series);
  const bars = scale.bars.map(function (bar, index) {
    const ratio = scale.max > 0 ? bar.cost / scale.max : 0;
    // A zero-cost day keeps a visible stub so a sparse week still reads as seven
    // days rather than as a chart that failed to load. The 3% base is floored by
    // `.ub-trend-bar[data-empty]`'s min-height, the same recipe the standalone
    // page draws its bars with.
    const height = Math.max(bar.cost > 0 ? 2 : 3, scale.max > 0 ? Math.round(ratio * 100) : 0);
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
  // The window is spelled out so neither total can be mistaken for the other,
  // or for the lifetime spend the card also carries.
  const range = first === "" || last === "" || scale.bars.length < 2
    ? null
    : t("daily.range", { from: shortDate(first), to: shortDate(last) });
  const week = formatMoney(scale.weekTotal, scale.currency);
  const month = formatMoney(scale.monthTotal, scale.currency);
  return jsxs("div", {
    className: "ub-trend",
    children: [
      jsxs("div", {
        key: "stats",
        className: "ub-trend-stats",
        children: [
          jsxs("span", {
            key: "week",
            className: "ub-trend-stat",
            children: [
              jsx("span", { key: "label", className: "ub-trend-stat-label", children: t("daily.week") }),
              jsx("span", { key: "value", className: "ub-trend-stat-value", children: week }),
            ],
          }),
          jsxs("span", {
            key: "month",
            className: "ub-trend-stat",
            children: [
              jsx("span", { key: "label", className: "ub-trend-stat-label", children: t("daily.month") }),
              jsx("span", { key: "value", className: "ub-trend-stat-value", children: month }),
            ],
          }),
        ],
      }),
      jsx("div", {
        key: "bars",
        className: "ub-trend-bars",
        role: "img",
        "aria-label": t("daily.week") + " " + week + ", " + t("daily.month") + " " + month +
          (range === null ? "" : " " + range),
        children: bars,
      }),
      range === null ? null : jsx("span", { key: "range", className: "ub-trend-range", children: range }),
    ],
  });
}

/* ------------------------------------------------------------------------- *
 * DeepSeek peak / off-peak billing reminder
 *
 * DeepSeek bills 09:00–12:00 and 14:00–18:00 Beijing time on workdays at full
 * price, and every other instant (nights, weekends, statutory holidays) at
 * half price. The host computes the schedule and ships it as
 * `meta.pricing.transitions`; this half only walks those absolute instants
 * against the panel's ticking clock, so the banner is live even on a snapshot
 * restored from sessionStorage.
 * ------------------------------------------------------------------------- */

/** Sun: the peak-price marker. */
function PeakGlyph() {
  return jsxs("svg", {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    "aria-hidden": "true",
    focusable: "false",
    children: [
      jsx("circle", { key: "disc", cx: 8, cy: 8, r: 3.1 }),
      jsx("path", { key: "rays", d: "M8 1.3v1.5M8 13.2v1.5M1.3 8h1.5M13.2 8h1.5M3.3 3.3l1 1M11.7 11.7l1 1M12.7 3.3l-1 1M4.3 11.7l-1 1" }),
    ],
  });
}

/** Crescent: the off-peak (cheap) marker. */
function OffpeakGlyph() {
  return jsx("svg", {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
    children: jsx("path", { d: "M12.7 10a5.4 5.4 0 0 1-6.3-6.6 5.4 5.4 0 1 0 6.3 6.6Z" }),
  });
}

/**
 * The DeepSeek billing reminder: current phase, the punny slogan the user asked
 * for, and a live countdown to the next price change.
 *
 * The Chinese slogan swaps one character of DeepSeek founder 梁文峰's name:
 * peak (峰) keeps it, off-peak (谷) makes him 梁文谷. The English dictionary
 * transliterates the same swap.
 *
 * @param {object} props `pricing` (raw meta.pricing), `now` (epoch ms), `t`.
 */
function PricingReminder(props) {
  const t = props.t;
  const pricing = normalizePricing(props.pricing);
  if (pricing === null) return null;
  const nowMs = isNum(props.now) ? props.now : Date.now();
  const state = pricingStateAt(pricing, nowMs);
  const peak = state.phase === "peak";
  const caveat = pricingCalendarCaveat(t, pricing, nowMs);
  const countdown = state.nextAt === null
    ? null
    : t(state.nextPhase === "peak" ? "pricing.countdown.raise" : "pricing.countdown.drop", {
      when: pricingWhen(t, state.nextAt, nowMs),
    });
  const foot = compact([
    countdown === null ? null : jsx("span", { key: "when", className: "ub-price-when", children: countdown }),
    jsx("span", { key: "tz", className: "ub-price-tz", children: t("pricing.timeZone") }),
    caveat === null ? null : jsx("span", { key: "caveat", className: "ub-price-caveat", children: caveat }),
  ]);
  const title = caveat === null ? t("pricing.rule") : t("pricing.rule") + " " + caveat;
  return jsxs("div", {
    className: "ub-price",
    "data-phase": peak ? "peak" : "offpeak",
    title: title,
    children: [
      jsxs("div", {
        key: "main",
        className: "ub-price-main",
        children: [
          jsx("span", {
            key: "icon",
            className: "ub-price-icon",
            "aria-hidden": "true",
            children: peak ? jsx(PeakGlyph, {}) : jsx(OffpeakGlyph, {}),
          }),
          jsx("span", {
            key: "slogan",
            className: "ub-price-slogan",
            children: t(peak ? "pricing.peakSlogan" : "pricing.offpeakSlogan"),
          }),
          jsx("span", {
            key: "chip",
            className: "ub-price-chip",
            children: t(peak ? "pricing.peakChip" : "pricing.offpeakChip"),
          }),
        ],
      }),
      jsx("div", { key: "foot", className: "ub-price-foot", children: foot }),
    ],
  });
}

/**
 * Whether the panel may spend upstream traffic on its own behalf.
 *
 * Auto refresh is a polling cost paid to every provider; it is only worth pay-
 * ing while somebody can actually see the numbers. The gate therefore watches
 * three signals and answers "yes" only to all of them:
 *
 *   - the document is visible (tab/window not hidden or minimised);
 *   - the panel's own element intersects the viewport — in the sidebar another
 *     panel may be selected, leaving this one mounted but `display: none`, and
 *     a panel nobody can see has no reason to poll;
 *   - the user interacted recently, so a visible but unattended window counts
 *     as idle and stops paying for freshness nobody is watching.
 *
 * The answer is event-driven: activity, visibility and intersection events
 * recompute it immediately, and a slow interval catches the one transition no
 * event announces — idling out. A closed gate costs nothing: no requests, and
 * no timers beyond the recheck. Anything the user does — moving the mouse,
 * coming back to the window, selecting the panel — reopens it, and the reopen
 * itself is what triggers the catch-up read.
 *
 * Every DOM access is guarded: the test harness (and a server render) has no
 * `document`, and an old browser may lack IntersectionObserver, in which case
 * the panel falls back to document visibility alone.
 *
 * @param {{ current: Element|null }} rootRef Ref attached to the panel root.
 * @returns {{ open: boolean, allows: { current: boolean }, onScreen: { current: boolean }}}
 *   `open` is the rendered gate state (drives the catch-up-read effect);
 *   `allows` and `onScreen` are refs the timer callbacks read synchronously.
 */
function useAutoRefreshGate(rootRef) {
  const [open, setOpen] = useState(true);
  const allowsRef = useRef(true);
  const onScreenRef = useRef(true);
  const documentVisibleRef = useRef(true);
  const intersectingRef = useRef(true);
  const activityAtRef = useRef(0);

  useEffect(function () {
    if (typeof document === "undefined" || document === null) return undefined;
    activityAtRef.current = Date.now();
    documentVisibleRef.current = document.visibilityState !== "hidden";
    onScreenRef.current = documentVisibleRef.current;

    const evaluate = function () {
      const idle = Date.now() - activityAtRef.current > IDLE_AFTER_MS;
      onScreenRef.current = documentVisibleRef.current && intersectingRef.current;
      const next = onScreenRef.current && idle !== true;
      const previous = allowsRef.current;
      allowsRef.current = next;
      if (previous !== next) setOpen(next);
      return next;
    };

    // High-frequency events only bump a timestamp; the state update is
    // throttled to once per second so streaming the pointer across the window
    // cannot churn renders.
    let lastEvaluate = 0;
    const markActivity = function () {
      activityAtRef.current = Date.now();
      if (activityAtRef.current - lastEvaluate >= 1000) {
        lastEvaluate = activityAtRef.current;
        evaluate();
      }
    };

    const onVisibility = function () {
      documentVisibleRef.current = document.visibilityState !== "hidden";
      // Returning to the window is presence, even without an input event yet —
      // otherwise a hidden-then-shown window would stay gated until the first
      // click or keystroke.
      if (documentVisibleRef.current) {
        activityAtRef.current = Date.now();
        lastEvaluate = activityAtRef.current;
      }
      evaluate();
    };

    let observer = null;
    if (typeof IntersectionObserver === "function" && rootRef.current !== null && rootRef.current !== undefined) {
      observer = new IntersectionObserver(function (entries) {
        const entry = entries[entries.length - 1];
        intersectingRef.current = entry !== undefined && entry.isIntersecting === true;
        evaluate();
      });
      observer.observe(rootRef.current);
    }

    const removeActivity = ACTIVITY_EVENT_NAMES.map(function (name) {
      document.addEventListener(name, markActivity, { passive: true, capture: true });
      return function () {
        document.removeEventListener(name, markActivity, { capture: true });
      };
    });
    document.addEventListener("visibilitychange", onVisibility);
    const recheck = setInterval(evaluate, GATE_RECHECK_MS);

    return function () {
      clearInterval(recheck);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const remove of removeActivity) remove();
      if (observer !== null) observer.disconnect();
    };
  }, []);

  return { open: open, allows: allowsRef, onScreen: onScreenRef };
}

/**
 * The panel's data source: one independent read per provider, merged into one
 * board state as each answer lands.
 *
 * The decoupling is the point. `PROVIDER_PATH` returns exactly one provider's
 * envelope, so each card paints the moment *its* upstream answers: a slow,
 * hanging or failed provider holds back only its own slot, never the whole
 * board. The aggregate snapshot routes still exist for older clients, but this
 * panel never calls them — one aggregate read is exactly the "wait for the
 * slowest provider" behaviour this design removes.
 *
 * Stale-while-revalidate, preserved per provider: the last merged envelope is
 * restored from sessionStorage synchronously, so the first render already has
 * every cached row; a successful row replaces only its own card and never
 * blanks numbers already on screen; and a `stale: true` answer (the host served
 * a cache it is refreshing behind) earns exactly one bounded follow-up read FOR
 * THAT PROVIDER. A follow-up that is itself stale schedules nothing, so a host
 * that keeps answering from cache cannot turn this into a poll.
 *
 * Auto refresh is gated by {@link useAutoRefreshGate}: while DSH sits idle, the
 * panel is off-screen, or the window is hidden, the ttl timer keeps its
 * schedule but skips the fetches, and reopening the gate (any user activity)
 * triggers one catch-up read per provider immediately instead of waiting out
 * the ttl. Manual refresh never consults the gate and forces a fresh read of
 * every provider (POST).
 *
 * @returns {object} render-ready board state plus the `refresh` action, the
 *   ticking `now`, and the `rootRef` the gate observes.
 */
function useUsageBoard() {
  const [view, setView] = useState(initialView);
  const [now, setNow] = useState(function () {
    return Date.now();
  });
  // The mutable mirror every request callback reads. React state is only a
  // render input: an answer that lands between two renders must merge into the
  // latest state, not into the snapshot captured when the request was fired.
  const viewRef = useRef(view);
  const mountedRef = useRef(true);
  const followUpsRef = useRef(null);
  const startProviderRef = useRef(null);
  const rootRef = useRef(null);
  const gate = useAutoRefreshGate(rootRef);
  const gateAllowsRef = gate.allows;
  const gateOnScreenRef = gate.onScreen;

  /** Publish one immutable state transition. */
  const commit = useCallback(function (mutate) {
    const next = copyView(viewRef.current);
    mutate(next);
    viewRef.current = next;
    setView(next);
  }, []);

  /** Cancel every pending stale follow-up timer (gate close, unmount). */
  function clearFollowUps() {
    const timers = followUpsRef.current;
    if (timers === null) return;
    for (const id of Object.keys(timers)) clearTimeout(timers[id]);
    followUpsRef.current = Object.create(null);
  }

  /** Drop one provider's pending follow-up: a newer read supersedes it. */
  function cancelFollowUp(id) {
    const timers = followUpsRef.current;
    if (timers === null || timers[id] === undefined) return;
    clearTimeout(timers[id]);
    delete timers[id];
  }

  /** Persist the merged board so the next mount paints from cache. */
  function persist() {
    const envelope = mergedEnvelope(viewRef.current);
    if (envelope !== null) writeStoredSnapshot(envelope);
  }

  /** Record one provider's transport failure; its last good row stays on screen. */
  function recordFailure(id, error) {
    const failure = describeFailure(error);
    commit(function (next) {
      next.failures[id] = Object.assign({}, failure, { at: Date.now() });
      delete next.pending[id];
    });
  }

  /** Merge one provider's fresh row into its own slot only. */
  function recordRow(id, row, body, kind) {
    commit(function (next) {
      next.providers[id] = row;
      next.updatedAt[id] = Date.now();
      const ttl = numOrNull(body.ttlMs);
      if (ttl !== null) {
        next.ttl[id] = ttl;
        next.ttlMs = ttl;
      }
      delete next.failures[id];
      delete next.pending[id];
    });
    persist();
    // A stale answer earns one short follow-up that picks up the fresh numbers
    // without the user acting. One timer per provider, and a follow-up response
    // never schedules another (see the kind check): a host that keeps answering
    // from cache cannot turn this into a poll.
    //
    // The follow-up is still an automatic read, so it only exists while the
    // gate is open: a gate closed since the stale answer arrived means nobody
    // can see the fresh numbers, and the reopen catch-up will pick them up.
    if (body.stale === true && kind !== "followup") scheduleFollowUp(id);
  }

  /** One bounded, gate-checked follow-up read for a provider that answered stale. */
  function scheduleFollowUp(id) {
    if (followUpsRef.current === null) followUpsRef.current = Object.create(null);
    const timers = followUpsRef.current;
    if (timers[id] !== undefined) return;
    if (gateAllowsRef.current !== true) return;
    timers[id] = setTimeout(function () {
      delete timers[id];
      // The gate may have closed while the timer was pending; the closing
      // effect clears timers too, but the callback re-checks for the gap.
      if (gateAllowsRef.current !== true) return;
      if (startProviderRef.current !== null) startProviderRef.current(id, "followup");
    }, STALE_FOLLOW_UP_MS);
  }

  /** Fire one read for one provider, unless that provider already has one in flight. */
  const startProvider = useCallback(function (id, kind) {
    if (viewRef.current.pending[id] === true) return;
    // A newer read (manual, gate reopen, the ordinary ttl) supersedes a stale
    // answer's pending follow-up for this provider: keeping both would fetch the
    // same row twice for no new information.
    cancelFollowUp(id);
    const manual = kind === "manual";
    commit(function (next) {
      next.pending[id] = true;
      // Retrying supersedes this provider's previous transport failure: its
      // slot returns to a skeleton until the new attempt answers.
      delete next.failures[id];
    });
    let settled;
    try {
      settled = requestJson(providerUrl(id), manual ? { method: "POST" } : undefined);
    } catch (error) {
      settled = Promise.reject(error);
    }
    settled.then(
      function (body) {
        if (!mountedRef.current) return;
        const row = providerRowOf(body, id);
        if (row === null) {
          const failure = new Error("payload carries no row for " + id);
          failure.kind = "shape";
          recordFailure(id, failure);
          return;
        }
        recordRow(id, row, body, kind);
      },
      function (error) {
        if (!mountedRef.current) return;
        recordFailure(id, error);
      },
    );
  }, []);
  // The stale follow-up timer only knows the provider id; it calls back through
  // this ref so it always reaches the current (stable) starter.
  startProviderRef.current = startProvider;

  useEffect(function () {
    mountedRef.current = true;
    return function () {
      mountedRef.current = false;
      clearFollowUps();
    };
  }, []);

  /** Read every provider concurrently. `kind` decides GET (automatic) vs POST (manual). */
  const run = useCallback(function (kind) {
    for (const id of PROVIDER_IDS) startProvider(id, kind);
  }, []);

  const ttlMs = viewTtlMs(view);

  useEffect(function () {
    const timer = setInterval(function () {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      // Nobody is watching: keep the schedule, skip the upstream reads. The
      // catch-up happens when the gate reopens, not on the next tick.
      if (gateAllowsRef.current !== true) return;
      run("auto");
    }, ttlMs);
    return function () {
      clearInterval(timer);
    };
  }, [ttlMs, run]);

  useEffect(function () {
    // The gate opening — mount, an input after idling out, the window coming
    // back, the panel being selected again — is the moment to pick up fresh
    // numbers for every provider. Each provider answers from its own cache when
    // it still can, so this is cheap even when several gates reopen in quick
    // succession.
    if (gate.open !== true) {
      // A closing gate cancels every pending stale follow-up: those reads would
      // land where nobody can see them, and the reopen catch-up supersedes them.
      clearFollowUps();
      return undefined;
    }
    run("auto");
    return undefined;
  }, [gate.open, run]);

  useEffect(function () {
    const timer = setInterval(function () {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      // Off-screen panels are re-rendered by nothing: freeze the clock while
      // the panel cannot be seen and refresh it on the first tick back.
      if (gateOnScreenRef.current !== true) return;
      setNow(Date.now());
    }, 1000);
    return function () {
      clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(function () {
    run("manual");
  }, []);

  const providers = visibleProviders(view);
  return {
    phase: boardPhase(view),
    slots: panelSlots(view),
    providers: providers,
    updatedAt: latestUpdatedAt(view),
    // With rows on screen a failure is a note about numbers that are still
    // shown; with nothing loaded yet it is the whole board's error state. When
    // the only rows are unconfigured ones the board is empty, not broken, so a
    // failure against a hidden row must not become the board-wide note.
    failure: providers.length > 0
      ? retainedFailure(view)
      : orderedProviders(view).length > 0
        ? null
        : latestFailure(view),
    busy: Object.keys(view.pending).length > 0,
    now: now,
    refresh: refresh,
    rootRef: rootRef,
  };
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

/**
 * One quota window: label, progress bar, used/limit, remaining, and the reset
 * line. A 5-hour window also prints the exact reset clock time — see
 * {@link windowResetText}.
 */
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
  // Same fallback as the billing reminder: a caller that renders a row without
  // the board's ticking clock still gets a real "now" instead of NaN dates.
  const reset = windowResetText(t, window, isNum(props.now) ? props.now : Date.now());
  // A provider that reports only a percentage (OpenCode Go) has no absolute
  // counters. Printing "— / —" would read like a broken fraction, so the line
  // is omitted and the percentage beside it carries the window.
  const hasCounters = isNum(window.used) || isNum(window.limit);
  const foot = compact([
    hasCounters
      ? jsx("span", { key: "usage", className: "ub-nums", children: t("window.usage", {
        used: formatAmount(window.used),
        limit: formatAmount(window.limit),
      }) })
      : null,
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
  // The billing reminder belongs to the DeepSeek card and to every state of it:
  // the schedule describes DeepSeek's list price, not this account, so it is
  // still true when the credential is missing or the upstream failed.
  const pricing = providerPricing(provider);
  if (pricing !== null) {
    body.push(jsx(PricingReminder, { pricing: pricing, t: t, now: props.now }, "pricing"));
  }
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

/**
 * First-paint placeholder for one provider whose first row has not arrived yet.
 * One card per provider (not one global loading paragraph) so the panel says
 * which services are still coming instead of hiding them behind one line.
 */
function ProviderSkeletonCard(props) {
  const label = providerLabelFor(props.id);
  return jsxs("article", {
    className: "ub-card",
    "data-provider": props.id,
    "data-skeleton": "true",
    "aria-busy": "true",
    "aria-label": label + " \u00b7 " + props.t("state.loading"),
    children: [
      jsx("div", {
        key: "head",
        className: "ub-card-head",
        children: jsx("div", {
          className: "ub-card-title-row",
          children: jsx("h2", { className: "ub-card-title", children: label }),
        }),
      }),
      jsxs("div", {
        key: "body",
        className: "ub-card-body",
        children: [
          jsx("span", { key: "line-a", className: "ub-skeleton-line", "data-width": "short" }),
          jsx("span", { key: "bar", className: "ub-skeleton-bar" }),
          jsx("span", { key: "line-b", className: "ub-skeleton-line", "data-width": "wide" }),
        ],
      }),
    ],
  });
}

/**
 * Which protocol status explains a transport-level failure, for the pill and
 * the card's tone. The HTTP/shape failures are the host, not the provider, so
 * "network error" only fits a failed or timed-out fetch.
 * @param {object} failure
 * @returns {string}
 */
function failureStatus(failure) {
  return failure.key === "error.network" || failure.key === "error.timeout" ? "network-error" : "invalid-response";
}

/**
 * A provider's own card for a transport-level failure: the host returned
 * nothing usable for that one provider. The other cards are unaffected — one
 * provider's transport error never degrades the whole board — and the panel
 * keeps rendering this slot so the missing card is visible as a failure rather
 * than silently absent.
 */
function ProviderFailureCard(props) {
  const t = props.t;
  const failure = props.failure;
  const status = failureStatus(failure);
  return jsxs("article", {
    className: "ub-card",
    "data-provider": props.id,
    "data-status": status,
    children: [
      jsxs("div", {
        key: "head",
        className: "ub-card-head",
        children: [
          jsx("div", {
            className: "ub-card-title-row",
            children: jsx("h2", { className: "ub-card-title", children: providerLabelFor(props.id) }),
          }),
          jsxs("span", {
            key: "pill",
            className: "ub-pill",
            "data-tone": statusTone(status),
            children: [
              jsx("i", { key: "dot", className: "ub-dot", "aria-hidden": "true" }),
              jsx("span", { key: "text", children: t(statusKey(status)) }),
            ],
          }),
        ],
      }),
      jsx("div", {
        key: "body",
        className: "ub-card-body",
        children: jsxs("div", {
          className: "ub-state",
          children: compact([
            jsx("p", {
              key: "line",
              className: "ub-state-line",
              children: t(failure.key, failure.params),
            }),
            failure.detail === null ? null : jsx("code", { key: "detail", className: "ub-code", children: failure.detail }),
          ]),
        }),
      }),
    ],
  });
}

/**
 * The subtitle under the panel title: the services that actually own a card
 * right now, in protocol order. Spelled from PROVIDER_IDS + PROVIDER_LABELS
 * rather than a locale key so the panel and the standalone page name the same
 * services in the same order, and so a provider added to the protocol cannot
 * silently go unannounced here.
 *
 * Unconfigured providers are omitted: naming a service with no card would
 * contradict the board. Before any row has arrived (first paint) the full
 * roster is the only honest answer, so it is used as the fallback.
 *
 * @param {object[]} [providers] Rows currently rendered.
 * @returns {string}
 */
function providerSubtitle(providers) {
  if (!Array.isArray(providers)) {
    return PROVIDER_IDS.map(providerLabelFor).join(" \u00b7 ");
  }
  return providers.map(function (row) {
    return providerLabelFor(row.id);
  }).join(" \u00b7 ");
}

/**
 * The whole panel: header, subtitle, one card per provider slot, footer.
 *
 * The section is the full-bleed pane DSH gives the `main` slot; `.ub-inner`
 * centres its content at the standalone page's reading width, and `.ub-body`
 * lays the cards out as that page's responsive grid. The panel deliberately
 * mirrors the standalone page's metrics — same max width, same card padding,
 * same grid gap — so the two surfaces read as one product.
 */
function UsageBoardPanel(props) {
  const t = translateOf(props);
  const board = useUsageBoard();
  const providers = board.providers;
  const failure = board.failure;
  const hosts = collectHosts(providers);
  const updated = relativeTime(t, board.updatedAt, board.now);
  // While rows are on screen, being busy is said here and on the refresh
  // button — never by emptying the body the user is reading.
  const freshness = providers.length > 0 && board.busy
    ? (updated === null ? t("updated.none") : updated) + " \u00b7 " + t("updated.refreshing")
    : (updated === null ? t("updated.none") : updated);

  const body = [];
  if (board.phase === "error") {
    // Nothing has ever loaded: the board itself is the failure. Any old numbers
    // would have taken the `ready` path above, where they are never blanked.
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
    if (board.phase === "ready" && failure !== null) {
      // A refresh failed while its provider's previous numbers are still shown.
      // The note explains why the screen is older than the clock claims; it
      // never replaces the numbers themselves.
      const reason = failure.detail === null ? t(failure.key, failure.params) : failure.detail;
      body.push(jsx("p", {
        key: "refresh-failure",
        className: "ub-note",
        role: "status",
        children: t("state.refreshFailed", { reason: reason }),
      }));
    }
    if (board.phase === "ready" && board.slots.length === 0) {
      // Every provider is unconfigured: the board settled with no card to
      // show, which is a state, not a spinner and not an error.
      body.push(jsx("p", {
        key: "empty",
        className: "ub-note",
        role: "status",
        children: t("state.empty"),
      }));
    }
    for (const slot of board.slots) {
      if (slot.kind === "provider") {
        body.push(jsx(ProviderCard, { provider: slot.provider, t: t, now: board.now }, slot.id));
      } else if (slot.kind === "failure") {
        body.push(jsx(ProviderFailureCard, { id: slot.id, failure: slot.failure, t: t }, slot.id));
      } else {
        body.push(jsx(ProviderSkeletonCard, { id: slot.id, t: t }, slot.id));
      }
    }
  }

  // The illustration is a full-width grid row, after every provider card but
  // still inside the scrollable body, so the source footer remains pinned.
  body.push(jsx("figure", {
    key: "deepseek-cash",
    className: "ub-cash",
    children: jsx("img", {
      className: "ub-cash-image",
      src: DEEPSEEK_CASH_URL,
      alt: "DeepSeek 鲸元券",
      width: 1280,
      height: 720,
      decoding: "async",
    }),
  }));

  return jsxs("section", {
    className: "ub-root",
    // Observed by the auto-refresh gate: a panel the sidebar keeps mounted but
    // hidden (another panel selected) must not keep polling.
    ref: board.rootRef,
    "data-phase": board.phase,
    "aria-label": t("panel"),
    children: jsxs("div", {
      // `.ub-inner` is what makes the wide main-area panel look like the
      // standalone page instead of a full-bleed stack: a centred, max-width
      // reading column that still owns the whole pane's height so the footer
      // sits above the body's scroll edge.
      className: "ub-inner",
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
        jsx("p", {
          key: "subtitle",
          className: "ub-subtitle",
          // Before the first row arrives the full roster is the only honest
          // answer; once settled, only the services with a card are named (a
          // board whose providers are all unconfigured therefore has none).
          children: providerSubtitle(
            board.phase === "loading" && providers.length === 0 ? undefined : providers,
          ),
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
    }),
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

    //#region src/client/composer.js — embedded verbatim
/* ------------------------------------------------------------------------- *
 * dsh-plugin-usage-board — selected-provider composer usage.
 *
 * Plain-JS body fragment embedded after panel.js in lib/client.js. It reuses
 * the panel's protocol, normalization, formatting and refresh-gate helpers.
 * The only network route is the existing single-provider endpoint.
 *
 * Extra free variables the embedding factory provides beyond panel.js's:
 *   reactDom  the "react-dom" module (createPortal for the body popover).
 * ------------------------------------------------------------------------- */

const { useSyncExternalStore, useId } = react;

/** createPortal from the embedding factory's `reactDom` free variable. */
function portalToBody(element) {
  return reactDom.createPortal(element, document.body);
}

/** Safe Element.contains against stub elements in the offline render harness. */
function containsElement(root, target) {
  return root !== null && root !== undefined && typeof root.contains === "function" && root.contains(target);
}

/** The right accessory list renders immediately before the model selector. */
const COMPOSER_SLOT_ID = "usage-board-provider";
const COMPOSER_SLOT_ORDER = 100;

/** DSH provider-route id -> usage-board provider id. No name heuristics. */
const USAGE_PROVIDER_BY_ROUTE = {
  "deepseek-account": "deepseek",
  "deepseek-official": "deepseek",
  "kimi-coding": "kimi",
  "zai": "glm",
  "zai-coding-cn": "glm",
  "opencode-go": "opencode-go",
};

/** Let a hover cross from the trigger to its body-portalled popover. */
const COMPOSER_CLOSE_DELAY_MS = 140;
const COMPOSER_CLOCK_MS = 30 * 1000;

/** Resolve the board row for an exact DSH route, or null for an unsupported one. */
function usageProviderForRoute(route) {
  return typeof route === "string" && Object.prototype.hasOwnProperty.call(USAGE_PROVIDER_BY_ROUTE, route)
    ? USAGE_PROVIDER_BY_ROUTE[route]
    : null;
}

/**
 * Match the model selector's source of truth, with the durable projection as a
 * loading/subagent fallback. `current` already includes the catalog default.
 */
function composerSelection(directoryState, projection) {
  if (directoryState !== null && directoryState !== undefined && directoryState.current !== null && directoryState.current !== undefined) {
    return directoryState.current;
  }
  if (projection === null || projection === undefined) return null;
  return projection.next ?? projection.lastUsed ?? null;
}

/** Provider name from the model catalog when available, else a stable fallback. */
function composerRouteLabel(selection, directoryState) {
  const groups = directoryState !== null && directoryState !== undefined && Array.isArray(directoryState.groups)
    ? directoryState.groups
    : [];
  for (const group of groups) {
    if (group !== null && typeof group === "object" && group.id === selection.provider && typeof group.name === "string") {
      return group.name;
    }
  }
  const usageId = usageProviderForRoute(selection.provider);
  return usageId === null ? selection.provider : providerLabelFor(usageId);
}

/** Display share, preferring the counters' arithmetic over the upstream rounding. */
function composerWindowPercent(window) {
  return isNum(window.derivedPercent) ? window.derivedPercent : window.percent;
}

/** The compact trigger leads with the five-hour window, then the first readable one. */
function primaryUsageWindow(provider) {
  if (provider === null || provider === undefined || !Array.isArray(provider.windows)) return null;
  const windows = provider.windows.filter(function (window) {
    return window !== null && typeof window === "object";
  });
  for (const window of windows) {
    if (isFiveHourWindow(window) && isNum(composerWindowPercent(window))) return window;
  }
  for (const window of windows) {
    if (isNum(composerWindowPercent(window))) return window;
  }
  return windows.length === 0 ? null : windows[0];
}

/** Short trigger label; the popover continues to use the full localized label. */
function composerWindowShortLabel(t, window) {
  if (isFiveHourWindow(window)) return t("composer.window.5h");
  const id = strOrNull(window.id) ?? "";
  if (id.includes("weekly")) return t("composer.window.weekly");
  if (id.includes("monthly")) return t("composer.window.monthly");
  return windowLabel(t, window);
}

/** Same severity thresholds as the full board. */
function composerLevel(percent) {
  return !isNum(percent) ? "unknown" : percent >= 90 ? "danger" : percent >= 70 ? "warn" : "ok";
}

/** SVG ring with accessible values; only geometry is clamped, never the reading. */
function QuotaRing(props) {
  const percent = props.percent;
  const size = isNum(props.size) ? props.size : 14;
  const value = isNum(percent) ? clamp(percent, 0, 100) : 0;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const level = composerLevel(percent);
  return jsxs("svg", {
    className: "ub-composer-ring",
    "data-level": level,
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    role: "progressbar",
    "aria-label": props.label,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": isNum(percent) ? Math.round(value * 10) / 10 : undefined,
    "aria-valuetext": formatPercent(percent),
    children: [
      jsx("circle", {
        key: "track",
        className: "ub-composer-ring-track",
        cx: 10,
        cy: 10,
        r: radius,
      }),
      // A true 0% is data, not a dot: draw no arc at all, exactly like the
      // board's zero-width bar fills. Unknown percentages do the same.
      value <= 0 ? null : jsx("circle", {
        key: "fill",
        className: "ub-composer-ring-fill",
        cx: 10,
        cy: 10,
        r: radius,
        strokeDasharray: String(circumference * value / 100) + " " + String(circumference),
        transform: "rotate(-90 10 10)",
      }),
    ],
  });
}

/** Read only the selected row from the panel's existing first-paint cache. */
function storedComposerProvider(id) {
  if (id === null) return null;
  const snapshot = readStoredSnapshot();
  if (snapshot === null) return null;
  for (const provider of snapshot.providers) {
    if (provider.id === id) return provider;
  }
  return null;
}

/**
 * One selected provider, with the panel's stale-while-revalidate and visibility
 * semantics. A keyed remount plus generation guard prevents cross-route writes.
 */
function useComposerProvider(id) {
  const [state, setState] = useState(function () {
    return { row: storedComposerProvider(id), failure: null, pending: false, ttlMs: TTL_MIN_MS };
  });
  const stateRef = useRef(state);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const followUpRef = useRef(null);
  const startRef = useRef(null);
  const rootRef = useRef(null);
  const gate = useAutoRefreshGate(rootRef);
  const gateAllowsRef = gate.allows;

  const commit = useCallback(function (mutate) {
    const next = Object.assign({}, stateRef.current);
    mutate(next);
    stateRef.current = next;
    setState(next);
  }, []);

  function clearFollowUp() {
    if (followUpRef.current !== null) clearTimeout(followUpRef.current);
    followUpRef.current = null;
  }

  function scheduleFollowUp() {
    if (followUpRef.current !== null || gateAllowsRef.current !== true) return;
    followUpRef.current = setTimeout(function () {
      followUpRef.current = null;
      if (gateAllowsRef.current === true && startRef.current !== null) startRef.current("followup");
    }, STALE_FOLLOW_UP_MS);
  }

  const start = useCallback(function (kind) {
    if (id === null || stateRef.current.pending === true) return;
    clearFollowUp();
    const generation = ++generationRef.current;
    commit(function (next) {
      next.pending = true;
      next.failure = null;
    });
    let request;
    try {
      request = requestJson(providerUrl(id), kind === "manual" ? { method: "POST" } : undefined);
    } catch (error) {
      request = Promise.reject(error);
    }
    request.then(function (body) {
      if (mountedRef.current !== true || generation !== generationRef.current) return;
      const row = providerRowOf(body, id);
      if (row === null) {
        const failure = new Error("payload carries no row for " + id);
        failure.kind = "shape";
        throw failure;
      }
      commit(function (next) {
        next.row = row;
        next.failure = null;
        next.pending = false;
        next.ttlMs = clampTtl(numOrNull(body.ttlMs));
      });
      if (body.stale === true && kind !== "followup") scheduleFollowUp();
    }, function (error) {
      if (mountedRef.current !== true || generation !== generationRef.current) return;
      commit(function (next) {
        next.failure = describeFailure(error);
        next.pending = false;
      });
    });
  }, [id]);
  startRef.current = start;

  useEffect(function () {
    mountedRef.current = true;
    return function () {
      mountedRef.current = false;
      ++generationRef.current;
      clearFollowUp();
    };
  }, []);

  useEffect(function () {
    if (gate.open === true) start("auto");
    else clearFollowUp();
  }, [gate.open, start]);

  useEffect(function () {
    const timer = setInterval(function () {
      if (gateAllowsRef.current === true) start("auto");
    }, clampTtl(state.ttlMs));
    return function () {
      clearInterval(timer);
    };
  }, [state.ttlMs, start]);

  return {
    row: state.row,
    failure: state.failure,
    pending: state.pending,
    rootRef: rootRef,
    read: useCallback(function () { start("auto"); }, [start]),
    refresh: useCallback(function () { start("manual"); }, [start]),
  };
}

/** One full popover quota row: ring, exact counters and reset information. */
function ComposerWindow(props) {
  const window = props.window;
  const t = props.t;
  const percent = composerWindowPercent(window);
  const label = windowLabel(t, window);
  const hasCounters = isNum(window.used) || isNum(window.limit);
  const reset = windowResetText(t, window, isNum(props.now) ? props.now : Date.now());
  const foot = compact([
    hasCounters ? jsx("span", { key: "usage", children: t("window.usage", {
      used: formatAmount(window.used),
      limit: formatAmount(window.limit),
    }) }) : null,
    window.remaining === null ? null : jsx("span", { key: "remaining", children: t("window.remaining", {
      value: formatAmount(window.remaining),
    }) }),
    reset === null ? null : jsx("span", { key: "reset", children: reset }),
    window.note === null ? null : jsx("span", { key: "note", children: window.note }),
  ]);
  return jsxs("div", {
    className: "ub-composer-window",
    "data-window": window.id,
    children: [
      jsx(QuotaRing, { key: "ring", percent: percent, label: label, size: 38 }),
      jsxs("div", {
        key: "detail",
        className: "ub-composer-window-detail",
        children: [
          jsxs("div", {
            key: "head",
            className: "ub-composer-window-head",
            children: [
              jsx("span", { className: "ub-composer-window-label", title: label, children: label }),
              jsx("span", { className: "ub-composer-window-percent", children: formatPercent(percent) }),
            ],
          }),
          foot.length === 0 ? null : jsx("div", { key: "foot", className: "ub-composer-window-foot", children: foot }),
        ],
      }),
    ],
  });
}

/**
 * Hide the whole strip for a provider route the board cannot serve.
 *
 * This is a hook-free gate in front of {@link ComposerProviderUsageBody}: an
 * unsupported route renders nothing at all, so the toolbar reserves no space
 * and no "not linked" placeholder ever appears. The gate also means the
 * data component's hooks are never skipped for a route that later becomes
 * supported (the bar above keys this element by provider/model anyway).
 */
function ComposerProviderUsage(props) {
  if (usageProviderForRoute(props.selection.provider) === null) return null;
  return jsx(ComposerProviderUsageBody, props);
}

/** Selected provider trigger and its hover/focus/click popover. */
function ComposerProviderUsageBody(props) {
  const t = props.t;
  const selection = props.selection;
  // Never null here: the gate above only mounts this component for a mapped
  // route. The lookup stays, so the data path cannot silently read another row.
  const usageId = usageProviderForRoute(selection.provider);
  const usage = useComposerProvider(usageId);
  const row = usage.row;
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [now, setNow] = useState(function () { return Date.now(); });
  const closeTimerRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const refreshRef = useRef(null);
  const anchorName = "--ub-composer-" + useId().replaceAll(":", "");
  const popoverId = "ub-composer-popover-" + useId().replaceAll(":", "");

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }
  function show() {
    clearCloseTimer();
    setOpen(true);
  }
  function close() {
    clearCloseTimer();
    setOpen(false);
    setPinned(false);
  }
  function scheduleClose() {
    if (pinned) return;
    clearCloseTimer();
    closeTimerRef.current = setTimeout(function () {
      closeTimerRef.current = null;
      setOpen(false);
    }, COMPOSER_CLOSE_DELAY_MS);
  }
  function leave() {
    if (!pinned) scheduleClose();
  }

  useEffect(function () {
    return clearCloseTimer;
  }, []);

  useEffect(function () {
    if (!open) return undefined;
    setNow(Date.now());
    const timer = setInterval(function () { setNow(Date.now()); }, COMPOSER_CLOCK_MS);
    return function () { clearInterval(timer); };
  }, [open]);

  useEffect(function () {
    if (open) usage.read();
  }, [open, usage.read]);

  useEffect(function () {
    if (!open || typeof document === "undefined" || document === null) return undefined;
    const onPointerDown = function (event) {
      const target = event.target;
      if (containsElement(usage.rootRef.current, target)) return;
      if (containsElement(popoverRef.current, target)) return;
      close();
    };
    const onKeyDown = function (event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      if (triggerRef.current !== null && typeof triggerRef.current.focus === "function") triggerRef.current.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return function () {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, pinned]);

  const providerLabel = row === null ? composerRouteLabel(selection, props.directoryState) : row.label;
  const primary = row !== null && row.status === "ok" ? primaryUsageWindow(row) : null;
  const primaryPercent = primary === null ? null : composerWindowPercent(primary);
  const additional = row !== null && primary !== null ? Math.max(0, row.windows.length - 1) : 0;
  const firstBalance = row !== null && row.balances.length > 0 ? row.balances[0] : null;
  let reading;
  if (primary !== null) reading = formatPercent(primaryPercent);
  else if (row !== null && row.status !== "ok") reading = t(statusKey(row.status));
  else if (firstBalance !== null) reading = t("composer.balance", { value: formatMoney(firstBalance.available, firstBalance.currency) });
  else if (usage.failure !== null && row === null) reading = t("composer.unavailable");
  else if (row === null) reading = t("composer.loading");
  else reading = t("composer.noQuota");

  const triggerChildren = [
    jsx("span", { key: "provider", className: "ub-composer-route", children: providerLabel }),
  ];
  if (primary !== null) {
    triggerChildren.push(jsx("span", { key: "window", className: "ub-composer-window-short", children: composerWindowShortLabel(t, primary) }));
    triggerChildren.push(jsx(QuotaRing, { key: "ring", percent: primaryPercent, label: windowLabel(t, primary), size: 14 }));
    triggerChildren.push(jsx("span", { key: "percent", className: "ub-composer-percent", children: formatPercent(primaryPercent) }));
    if (additional > 0) {
      triggerChildren.push(jsx("span", {
        key: "more",
        className: "ub-composer-more",
        title: t("composer.more", { n: String(additional) }),
        children: "+" + String(additional),
      }));
    }
  } else {
    triggerChildren.push(jsx("span", { key: "reading", className: "ub-composer-reading", children: reading }));
  }
  if (usage.failure !== null) {
    triggerChildren.push(jsx("span", {
      key: "alert",
      className: "ub-composer-alert",
      role: "img",
      "aria-label": t("composer.stale"),
      title: t("composer.stale"),
      children: "!",
    }));
  }

  const body = [];
  if (usage.failure !== null) {
    body.push(jsx("p", {
      key: "failure",
      className: "ub-composer-error",
      role: "status",
      children: t("state.refreshFailed", { reason: usage.failure.detail ?? t(usage.failure.key, usage.failure.params) }),
    }));
  }
  if (row === null) {
    body.push(jsx("p", {
      key: "loading",
      className: "ub-composer-note",
      role: "status",
      children: usage.pending || usage.failure === null ? t("state.loading") : t("composer.noData"),
    }));
  } else if (row.status !== "ok") {
    body.push(jsxs("div", {
      key: "status",
      className: "ub-composer-state",
      children: compact([
        jsx("p", { key: "message", className: "ub-composer-note", children: providerMessage(t, row) }),
        row.code === null ? null : jsx("code", { key: "code", className: "ub-code", children: row.code }),
      ]),
    }));
  } else {
    for (const window of row.windows) {
      body.push(jsx(ComposerWindow, { key: window.id, window: window, t: t, now: now }));
    }
    if (row.balances.length > 0) {
      body.push(jsx("div", {
        key: "balances",
        className: "ub-balances",
        children: row.balances.map(function (balance, index) {
          return jsx(BalanceRow, { balance: balance, t: t }, balance.currency + "-" + String(index));
        }),
      }));
    }
    if (row.windows.length === 0 && row.balances.length === 0) {
      body.push(jsx("p", { key: "empty", className: "ub-composer-note", children: t("state.noWindows") }));
    }
  }

  return jsxs("span", {
    className: "ub-composer",
    ref: usage.rootRef,
    style: { anchorName: anchorName },
    "data-provider": selection.provider,
    "data-usage-provider": usageId,
    "data-state": usage.failure !== null ? "degraded" : row === null ? "loading" : row.status,
    onMouseEnter: show,
    onMouseLeave: leave,
    children: [
      jsxs("button", {
        key: "trigger",
        ref: triggerRef,
        type: "button",
        className: "ub-composer-trigger",
        "aria-label": t("composer.aria", { provider: providerLabel, reading: reading }),
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "aria-controls": popoverId,
        onFocus: show,
        onBlur: function (event) {
          const next = event.relatedTarget;
          if (next !== null && containsElement(popoverRef.current, next)) return;
          leave();
        },
        onClick: function () {
          clearCloseTimer();
          if (open && pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        },
        // The popover portals to body, so plain Tab would leave it behind.
        // ArrowDown/ArrowUp is the explicit keyboard path into its one action.
        onKeyDown: function (event) {
          if (!open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          if (refreshRef.current === null || typeof refreshRef.current.focus !== "function") return;
          event.preventDefault();
          refreshRef.current.focus();
        },
        children: triggerChildren,
      }),
      open ? portalToBody(jsxs("div", {
        id: popoverId,
        ref: popoverRef,
        className: "ub-composer-popover",
        style: { positionAnchor: anchorName },
        role: "dialog",
        "aria-label": t("composer.popup", { provider: providerLabel }),
        onMouseEnter: show,
        onMouseLeave: leave,
        children: [
          jsxs("div", {
            key: "head",
            className: "ub-composer-popover-head",
            children: [
              jsxs("div", {
                key: "title",
                className: "ub-composer-popover-title",
                children: [
                  jsx("strong", { className: "ub-composer-popover-provider", children: providerLabel }),
                  row !== null && row.plan !== null ? jsx("span", { className: "ub-plan", children: row.plan }) : null,
                  jsx("span", { className: "ub-composer-model", title: selection.model, children: selection.model }),
                ],
              }),
              row !== null && row.status !== "ok" ? jsx("span", {
                key: "status",
                className: "ub-pill",
                "data-tone": statusTone(row.status),
                children: t(statusKey(row.status)),
              }) : null,
            ],
          }),
          jsx("div", { key: "body", className: "ub-composer-popover-body", children: body }),
          jsxs("div", {
            key: "foot",
            className: "ub-composer-popover-foot",
            children: [
              jsx("span", {
                key: "updated",
                className: "ub-composer-updated",
                children: row === null || !isNum(row.fetchedAt) ? t("updated.none") : relativeTime(t, row.fetchedAt, now),
              }),
              jsxs("button", {
                key: "refresh",
                ref: refreshRef,
                type: "button",
                className: "ub-composer-refresh",
                disabled: usage.pending,
                "aria-busy": usage.pending ? "true" : undefined,
                onClick: usage.refresh,
                children: [
                  jsx("span", {
                    key: "glyph",
                    className: usage.pending ? "ub-spin is-on" : "ub-spin",
                    "aria-hidden": "true",
                    children: jsx(RefreshGlyph, {}),
                  }),
                  jsx("span", { key: "label", children: usage.pending ? t("action.refreshing") : t("action.refresh") }),
                ],
              }),
            ],
          }),
        ],
      })) : null,
    ],
  });
}

/** Resolve the model directory once, then key the data view by exact route. */
function ComposerUsageBar(props) {
  const t = translateOf(props);
  const directoryState = useSyncExternalStore(
    function (fn) { return props.directory.subscribe(fn); },
    function () { return props.directory.getSnapshot(); },
  );
  const projection = props.useProjection("modelSelection");
  useEffect(function () {
    if (props.available === true && typeof props.load === "function") props.load();
  }, [props.available, props.load]);
  const selection = composerSelection(directoryState, projection);
  if (selection === null) return null;
  return jsx(ComposerProviderUsage, {
    selection: selection,
    directoryState: directoryState,
    t: t,
  }, selection.provider + "/" + selection.model);
}

/** Optional contribution: the full board remains usable without model selection. */
function registerComposerUsage(ctx) {
  ctx.inject(["modelDirectories", "sessions"], function (scope) {
    const models = scope.modelDirectories;
    const sessions = scope.sessions;
    scope.slots.inject("conversation.input.right", function () {
      return scope.slots.register({
        name: "conversation.input.right",
        id: COMPOSER_SLOT_ID,
        order: COMPOSER_SLOT_ORDER,
        locale: NS,
        inject: function (sessionId) {
          const directory = models.directoryFor(sessionId);
          const available = sessions.subagentAddress(sessionId) === undefined;
          return {
            directory: directory.store,
            available: available,
            load: function () {
              if (available) directory.load().catch(function () { /* the directory store carries the error */ });
            },
          };
        },
      }, ComposerUsageBar);
    });
  });
}
    //#endregion

    //#region dsh-plugin-usage-board: client registration
    /**
     * Required Cordis services: `slots` carries the registrations, `locale`
     * carries the `usageBoard` namespace the panel and sidebar label read.
     * The composer strip's `modelDirectories`/`sessions` dependencies are
     * optional and resolved through `ctx.inject` at mount time.
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
      // The selected-provider strip below the composer is optional: it mounts
      // only when the model-selection client services are composed, and the
      // sidebar board above never depends on them.
      registerComposerUsage(ctx);
    }
    //#endregion

    exports.NS = NS;
    exports.PANEL_ID = PANEL_ID;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
