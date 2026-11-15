/**
 * dsh-plugin-git-log — DSH Web client-module bundle.
 *
 * ASSEMBLED FROM (and checked by scripts/build-client.mjs --check):
 *   - src/client/styles.css
 *   - src/client/protocol-copy.js (derived from src/shared/protocol.js)
 *   - src/client/panel.js
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-git-log",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");

    //#region src/client/styles.css — embedded verbatim
    const GIT_LOG_CSS = `/* dsh-plugin-git-log — right sidebar tab styles.
 * Embedded verbatim into lib/client.js as GIT_LOG_CSS.
 * Keep free of backticks and dollar-brace sequences.
 */

.dsh-gl-root {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.45;
  background: var(--dsw-alias-bg-base, transparent);
}

.dsh-gl-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.dsh-gl-title-icon {
  flex: none;
  color: var(--dsw-alias-label-secondary, currentColor);
}

.dsh-gl-title-branch {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--dsw-alias-label-secondary, #57606a);
  background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.12));
}

.dsh-gl-title-dirty {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-state-warn-primary, #d97706);
}

/* Header strip aligned with sidebar-files 38px row */
.dsh-gl-header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 4px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.2));
  box-sizing: border-box;
}

.dsh-gl-repo-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}

.dsh-gl-repo-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  font-size: 12.5px;
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-gl-head-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 140px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 17px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--dsw-alias-state-business-primary, #2563eb);
  background: var(--dsw-alias-state-business-tertiary, rgba(37, 99, 235, 0.1));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
}

.dsh-gl-head-pill--detached {
  color: var(--dsw-alias-state-warn-primary, #d97706);
  background: var(--dsw-alias-state-warn-tertiary, rgba(217, 119, 6, 0.12));
}

.dsh-gl-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 17px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-state-warn-label, #b45309);
  background: var(--dsw-alias-state-warn-tertiary, rgba(217, 119, 6, 0.12));
  cursor: default;
}

.dsh-gl-header-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.dsh-gl-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #57606a);
  cursor: pointer;
  flex: none;
}

.dsh-gl-icon-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-gl-icon-btn[aria-pressed="true"],
.dsh-gl-icon-btn[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-active, rgba(128, 128, 128, 0.16));
  color: var(--dsw-alias-state-business-primary, #2563eb);
}

.dsh-gl-icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.dsh-gl-icon-btn:focus-visible,
.dsh-gl-select:focus-visible,
.dsh-gl-search-scope:focus-visible,
.dsh-gl-commit-row:focus-visible,
.dsh-gl-file-btn:focus-visible,
.dsh-gl-btn:focus-visible,
.dsh-gl-hash-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary, #2563eb);
  outline-offset: -1px;
}

@keyframes dsh-gl-spin {
  to {
    transform: rotate(360deg);
  }
}

.dsh-gl-spinning {
  animation: dsh-gl-spin 0.8s linear infinite;
}

/* Filter bar: branch selector + search input */
.dsh-gl-controls {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.18));
  background: var(--dsw-alias-bg-base, transparent);
}

.dsh-gl-controls-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dsh-gl-select {
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  border-radius: var(--dsw-radius-md, 7px);
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.dsh-gl-search-box {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  border-radius: var(--dsw-radius-md, 7px);
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
}

.dsh-gl-search-box:focus-within {
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
}

.dsh-gl-search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 12px;
}

.dsh-gl-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #6e7781);
}

.dsh-gl-search-scope {
  flex: none;
  height: 20px;
  padding: 0 4px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.2));
  border-radius: 4px;
  background: var(--dsw-alias-bg-base, transparent);
  color: var(--dsw-alias-label-secondary, #57606a);
  font-size: 11px;
  cursor: pointer;
}

/* Main workspace area: master/detail */
.dsh-gl-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.dsh-gl-body--wide {
  flex-direction: row;
}

.dsh-gl-list-pane {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.dsh-gl-body--split:not(.dsh-gl-body--wide) .dsh-gl-list-pane {
  flex: 1 1 50%;
  min-height: 140px;
}

.dsh-gl-body--wide.dsh-gl-body--split .dsh-gl-list-pane {
  flex: 0 0 46%;
  min-width: 280px;
}

.dsh-gl-body--detail-max .dsh-gl-list-pane {
  display: none;
}

.dsh-gl-commit-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 2px 0;
  list-style: none;
}

.dsh-gl-commit-row {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 0 10px 0 6px;
  border: none;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.1));
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}

.dsh-gl-commit-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
}

.dsh-gl-commit-row--selected {
  background: var(--dsw-alias-interactive-bg-active, rgba(37, 99, 235, 0.12));
}

.dsh-gl-graph-cell {
  flex: none;
  display: flex;
  align-items: stretch;
}

.dsh-gl-commit-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  padding: 6px 0;
}

.dsh-gl-commit-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.dsh-gl-ref-badge {
  display: inline-flex;
  align-items: center;
  max-width: 140px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10.5px;
  line-height: 16px;
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-gl-ref-badge--head {
  color: var(--dsw-alias-state-business-primary, #2563eb);
  background: var(--dsw-alias-state-business-tertiary, rgba(37, 99, 235, 0.14));
  border: 0.5px solid var(--dsw-alias-state-business-primary, rgba(37, 99, 235, 0.35));
}

.dsh-gl-ref-badge--branch {
  color: var(--dsw-alias-state-success-primary, #16a34a);
  background: var(--dsw-alias-state-success-tertiary, rgba(22, 163, 74, 0.12));
}

.dsh-gl-ref-badge--remote {
  color: var(--dsw-alias-label-secondary, #57606a);
  background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.14));
}

.dsh-gl-ref-badge--tag {
  color: var(--dsw-alias-state-warn-label, #b45309);
  background: var(--dsw-alias-state-warn-tertiary, rgba(217, 119, 6, 0.12));
}

.dsh-gl-commit-subject {
  flex: 1 1 120px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-gl-commit-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #6e7781);
}

.dsh-gl-hash-chip {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary, #57606a);
}

.dsh-gl-commit-author {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-gl-commit-time {
  flex: none;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.dsh-gl-load-more-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #6e7781);
}

.dsh-gl-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.06));
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.dsh-gl-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.12));
}

.dsh-gl-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Detail pane */
.dsh-gl-detail-pane {
  display: flex;
  flex: 1 1 50%;
  flex-direction: column;
  min-width: 0;
  min-height: 160px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  background: var(--dsw-alias-bg-base, transparent);
}

.dsh-gl-body--wide .dsh-gl-detail-pane {
  flex: 1 1 auto;
  border-top: none;
  border-left: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
}

.dsh-gl-body--detail-max .dsh-gl-detail-pane {
  flex: 1 1 auto;
  border-top: none;
}

.dsh-gl-detail-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.18));
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.04));
}

.dsh-gl-detail-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
}

.dsh-gl-hash-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.22));
  border-radius: 5px;
  background: var(--dsw-alias-bg-base, transparent);
  color: var(--dsw-alias-label-secondary, #57606a);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  cursor: pointer;
}

.dsh-gl-hash-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-gl-detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 12px 16px;
}

.dsh-gl-detail-subject {
  margin: 0 0 6px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dsh-gl-detail-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 10px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #57606a);
}

.dsh-gl-parent-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.dsh-gl-detail-body {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.16));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dsh-gl-section-label {
  margin: 0 0 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #57606a);
}

.dsh-gl-files-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dsh-gl-file-item {
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.18));
  border-radius: var(--dsw-radius-md, 6px);
  overflow: hidden;
  background: var(--dsw-alias-bg-base, transparent);
}

.dsh-gl-file-header {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 2px 6px;
}

.dsh-gl-file-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 3px 2px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dsh-gl-file-btn:hover {
  color: var(--dsw-alias-state-business-primary, #2563eb);
}

.dsh-gl-file-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dsh-gl-file-badge--A {
  color: var(--dsw-alias-state-success-primary, #16a34a);
  background: var(--dsw-alias-state-success-tertiary, rgba(22, 163, 74, 0.14));
}

.dsh-gl-file-badge--M {
  color: var(--dsw-alias-state-business-primary, #2563eb);
  background: var(--dsw-alias-state-business-tertiary, rgba(37, 99, 235, 0.14));
}

.dsh-gl-file-badge--D {
  color: var(--dsw-alias-state-error-primary, #dc2626);
  background: rgba(239, 68, 68, 0.14);
}

.dsh-gl-file-badge--R,
.dsh-gl-file-badge--C {
  color: var(--dsw-alias-state-warn-label, #b45309);
  background: var(--dsw-alias-state-warn-tertiary, rgba(217, 119, 6, 0.14));
}

.dsh-gl-file-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
}

.dsh-gl-file-stats {
  flex: none;
  display: inline-flex;
  gap: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dsh-gl-stat-add {
  color: var(--dsw-alias-state-success-primary, #16a34a);
}

.dsh-gl-stat-del {
  color: var(--dsw-alias-state-error-primary, #dc2626);
}

/* Diff viewer */
.dsh-gl-diff-box {
  border-top: 0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.18));
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.03));
  overflow-x: auto;
}

.dsh-gl-diff-note {
  padding: 8px 10px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #57606a);
}

.dsh-gl-diff-table {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  tab-size: 4;
}

.dsh-gl-diff-row--hunk {
  background: var(--dsw-alias-state-business-tertiary, rgba(37, 99, 235, 0.08));
  color: var(--dsw-alias-label-secondary, #57606a);
}

.dsh-gl-diff-row--add {
  background: var(--dsw-alias-file-diff-added-bg, rgba(34, 197, 94, 0.13));
}

.dsh-gl-diff-row--del {
  background: var(--dsw-alias-file-diff-deleted-bg, rgba(239, 68, 68, 0.13));
}

.dsh-gl-diff-row--meta {
  color: var(--dsw-alias-label-tertiary, #6e7781);
}

.dsh-gl-diff-ln {
  width: 34px;
  min-width: 34px;
  padding: 0 5px;
  text-align: right;
  user-select: none;
  color: var(--dsw-alias-label-tertiary, #6e7781);
  font-variant-numeric: tabular-nums;
}

.dsh-gl-diff-row--add .dsh-gl-diff-ln {
  background: var(--dsw-alias-file-diff-added-gutter, rgba(34, 197, 94, 0.2));
}

.dsh-gl-diff-row--del .dsh-gl-diff-ln {
  background: var(--dsw-alias-file-diff-deleted-gutter, rgba(239, 68, 68, 0.2));
}

.dsh-gl-diff-marker {
  width: 14px;
  min-width: 14px;
  padding: 0 2px;
  text-align: center;
  user-select: none;
}

.dsh-gl-diff-row--add .dsh-gl-diff-marker {
  color: var(--dsw-alias-file-diff-added-marker, #16a34a);
}

.dsh-gl-diff-row--del .dsh-gl-diff-marker {
  color: var(--dsw-alias-file-diff-deleted-marker, #dc2626);
}

.dsh-gl-diff-code {
  padding: 0 8px 0 2px;
  white-space: pre;
}

.dsh-gl-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 18px;
  text-align: center;
  color: var(--dsw-alias-label-secondary, #57606a);
}

.dsh-gl-empty-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-gl-empty-sub {
  margin: 0;
  max-width: 320px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #6e7781);
  overflow-wrap: anywhere;
}

.dsh-gl-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 8px 10px 0;
  padding: 7px 10px;
  border-radius: var(--dsw-radius-md, 6px);
  border: 0.5px solid var(--dsw-alias-state-error-primary, #dc2626);
  background: rgba(239, 68, 68, 0.08);
  color: var(--dsw-alias-state-error-primary, #dc2626);
  font-size: 12px;
}
`;
    //#endregion

    //#region src/client/protocol-copy.js — embedded verbatim
// GENERATED FROM src/shared/protocol.js by scripts/build-client.mjs — do not edit directly.
/**
 * Shared protocol constants and pure formatting/graph utilities used by both the
 * Node host (`src/host/*`) and the browser right-sidebar client (`src/client/*`).
 *
 * `scripts/build-client.mjs` derives `src/client/protocol-copy.js` from this
 * file by stripping `export ` prefixes, so keep exports strictly in top-level
 * `export const` / `export function` form.
 *
 * @module dsh-plugin-git-log/shared/protocol
 */

const PROTOCOL_VERSION = 1;

const ROUTE_PREFIX = "/git-log";
const API_PREFIX = "/git-log/api";
const OVERVIEW_PATH = "/git-log/api/overview";
const COMMITS_PATH = "/git-log/api/commits";
const COMMIT_PATH = "/git-log/api/commit";
const FILE_DIFF_PATH = "/git-log/api/file-diff";
const HEALTH_PATH = "/git-log/api/health";

/** Custom header attached by our browser client; desktop preserves custom headers across forwarding. */
const REQUEST_HEADER = "x-dsh-git-log";
const REQUEST_HEADER_VALUE = "1";

/** Sentinel ref meaning `git log --all` (local + remote branches + tags). */
const ALL_REFS_SENTINEL = "__ALL__";
const HEAD_REF = "HEAD";

const DEFAULT_MAX_PAGE_SIZE = 50;
const DEFAULT_MAX_DIFF_BYTES = 262144;
const DEFAULT_COMMAND_TIMEOUT_MS = 10000;

const SEARCH_SCOPES = ["all", "message", "author", "path"];

/**
 * Parse a `git log` `%D` decoration string into structured badges.
 *
 * @param {string} raw
 * @param {readonly string[]} [remotes] Known remote names (e.g. `["origin"]`).
 * @returns {Array<{ kind: "head" | "branch" | "remote" | "tag", label: string, raw: string, current: boolean }>}
 */
function parseDecorations(raw, remotes = ["origin"]) {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const remoteSet = new Set(Array.isArray(remotes) ? remotes : []);
  const out = [];
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.startsWith("HEAD -> ")) {
      const target = part.slice("HEAD -> ".length).trim();
      out.push({ kind: "head", label: target || "HEAD", raw: part, current: true });
      continue;
    }
    if (part === "HEAD") {
      out.push({ kind: "head", label: "HEAD", raw: part, current: true });
      continue;
    }
    if (part.startsWith("tag: ")) {
      const tag = part.slice("tag: ".length).trim();
      if (tag) out.push({ kind: "tag", label: tag, raw: part, current: false });
      continue;
    }
    if (part === "grafted" || part === "replaced") {
      continue;
    }
    const slashIdx = part.indexOf("/");
    const firstSeg = slashIdx === -1 ? "" : part.slice(0, slashIdx);
    const isRemote = slashIdx > 0 && (remoteSet.has(firstSeg) || part.endsWith("/HEAD"));
    out.push({
      kind: isRemote ? "remote" : "branch",
      label: part,
      raw: part,
      current: false,
    });
  }
  return out;
}

/**
 * Compute deterministic lane layout for a topologically ordered commit list.
 * Each entry describes the commit's column, passing-through lanes, incoming
 * upper connectors (`y: 0 -> H/2`), and outgoing lower connectors (`y: H/2 -> H`).
 *
 * @param {readonly Array<{ hash: string, parents?: readonly string[] }>} commits
 * @returns {{
 *   maxLanes: number,
 *   rows: Array<{
 *     col: number,
 *     colorIdx: number,
 *     isMerge: boolean,
 *     isRoot: boolean,
 *     passCols: number[],
 *     inEdges: Array<{ fromCol: number, colorIdx: number }>,
 *     outEdges: Array<{ toCol: number, colorIdx: number }>
 *   }>
 * }}
 */
function computeCommitGraph(commits) {
  if (!Array.isArray(commits) || commits.length === 0) {
    return { maxLanes: 1, rows: [] };
  }

  /** @type {(string | null)[]} */
  let lanes = [];
  const rows = [];
  let maxLanes = 1;

  for (let rowIndex = 0; rowIndex < commits.length; rowIndex++) {
    const commit = commits[rowIndex];
    const hash = commit?.hash ?? "";
    const parents = Array.isArray(commit?.parents) ? commit.parents.filter(Boolean) : [];

    const matchingCols = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === hash) matchingCols.push(i);
    }

    let col;
    if (matchingCols.length > 0) {
      col = matchingCols[0];
    } else {
      const freeSlot = lanes.indexOf(null);
      col = freeSlot === -1 ? lanes.length : freeSlot;
      if (col === lanes.length) lanes.push(null);
    }

    const inEdges = [];
    const passCols = [];
    if (rowIndex > 0) {
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] === null) continue;
        if (lanes[i] === hash) {
          inEdges.push({ fromCol: i, colorIdx: i });
        } else {
          passCols.push(i);
        }
      }
    } else {
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] !== null && lanes[i] !== hash) {
          passCols.push(i);
        }
      }
    }

    const nextLanes = lanes.slice();
    for (const m of matchingCols) {
      nextLanes[m] = null;
    }

    const outEdges = [];
    if (parents.length > 0) {
      const firstParent = parents[0];
      const existingFirst = nextLanes.indexOf(firstParent);
      if (existingFirst !== -1) {
        outEdges.push({ toCol: existingFirst, colorIdx: col });
      } else {
        nextLanes[col] = firstParent;
        outEdges.push({ toCol: col, colorIdx: col });
      }

      for (let p = 1; p < parents.length; p++) {
        const mergeParent = parents[p];
        const existingMerge = nextLanes.indexOf(mergeParent);
        if (existingMerge !== -1) {
          outEdges.push({ toCol: existingMerge, colorIdx: existingMerge });
        } else {
          let freeSlot = nextLanes.indexOf(null);
          if (freeSlot === -1) {
            freeSlot = nextLanes.length;
            nextLanes.push(null);
          }
          nextLanes[freeSlot] = mergeParent;
          outEdges.push({ toCol: freeSlot, colorIdx: freeSlot });
        }
      }
    }

    while (nextLanes.length > 0 && nextLanes[nextLanes.length - 1] === null) {
      nextLanes.pop();
    }

    let rowWidth = col + 1;
    for (const c of passCols) rowWidth = Math.max(rowWidth, c + 1);
    for (const e of inEdges) rowWidth = Math.max(rowWidth, e.fromCol + 1);
    for (const e of outEdges) rowWidth = Math.max(rowWidth, e.toCol + 1);
    if (rowWidth > maxLanes) maxLanes = rowWidth;

    rows.push({
      col,
      colorIdx: col,
      isMerge: parents.length > 1,
      isRoot: parents.length === 0,
      passCols,
      inEdges,
      outEdges,
    });

    lanes = nextLanes;
  }

  return { maxLanes, rows };
}

/**
 * Parse a unified diff into line-numbered display rows grouped cleanly across hunks.
 *
 * @param {string} patch
 * @returns {Array<{
 *   type: "hunk" | "add" | "del" | "context" | "meta",
 *   oldLine: number | null,
 *   newLine: number | null,
 *   text: string
 * }>}
 */
function parseUnifiedDiff(patch) {
  if (typeof patch !== "string" || patch === "") return [];
  const rawLines = patch.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }

  const lines = [];
  let inHunk = false;
  let oldNum = 0;
  let newNum = 0;

  for (const line of rawLines) {
    if (line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        inHunk = true;
        oldNum = Number(match[1]);
        newNum = Number(match[2]);
        lines.push({ type: "hunk", oldLine: null, newLine: null, text: line });
        continue;
      }
    }

    if (!inHunk) {
      if (
        line.startsWith("diff --git ") ||
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("new file mode") ||
        line.startsWith("deleted file mode") ||
        line.startsWith("rename from ") ||
        line.startsWith("rename to ") ||
        line.startsWith("similarity index ") ||
        line.startsWith("copy from ") ||
        line.startsWith("copy to ") ||
        line.startsWith("Binary files ")
      ) {
        lines.push({ type: "meta", oldLine: null, newLine: null, text: line });
      }
      continue;
    }

    if (line.startsWith("+")) {
      lines.push({ type: "add", oldLine: null, newLine: newNum, text: line.slice(1) });
      newNum += 1;
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", oldLine: oldNum, newLine: null, text: line.slice(1) });
      oldNum += 1;
    } else if (line.startsWith("\\")) {
      lines.push({ type: "meta", oldLine: null, newLine: null, text: line });
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      lines.push({ type: "context", oldLine: oldNum, newLine: newNum, text: content });
      oldNum += 1;
      newNum += 1;
    }
  }

  return lines;
}

/**
 * Build a `dsh-resource://file/session/<sessionId>/<path>` address matching
 * DSH's workspace file resource grammar.
 *
 * @param {string} sessionId
 * @param {string} filePath
 * @returns {string}
 */
function buildSessionFileAddress(sessionId, filePath) {
  const encodeSegment = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ":");
  const normalized = String(filePath).replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  const encodedPath = normalized.split("/").map(encodeSegment).join("/");
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${encodedPath}`;
}
    //#endregion

    //#region src/client/panel.js — embedded verbatim
/* ------------------------------------------------------------------------- *
 * dsh-plugin-git-log — DSH Web right-sidebar client implementation.
 *
 * This file is a PLAIN-JS BODY FRAGMENT embedded verbatim inside the
 * `window.__ModuleLoader__.load({ id, factory })` wrapper in `lib/client.js`.
 * Edit this file (and `src/client/styles.css` / `src/shared/protocol.js`)
 * and run `npm run build` rather than editing `lib/client.js` directly.
 *
 * Free variables provided by `lib/client.js`:
 *   react               the "react" module
 *   GIT_LOG_CSS         embedded verbatim from src/client/styles.css
 *   PROTOCOL_VERSION, OVERVIEW_PATH, COMMITS_PATH, COMMIT_PATH, FILE_DIFF_PATH,
 *   REQUEST_HEADER, REQUEST_HEADER_VALUE, ALL_REFS_SENTINEL, HEAD_REF,
 *   SEARCH_SCOPES, parseDecorations, computeCommitGraph, parseUnifiedDiff,
 *   buildSessionFileAddress
 *     — from src/client/protocol-copy.js (derived from src/shared/protocol.js)
 * ------------------------------------------------------------------------- */

const { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } = react;
const h = react.createElement;
const Fragment = react.Fragment;

const NS = "gitLog";
const PLUGIN_ID = "dsh-plugin-git-log";
const GIT_LOG_ID = "dsh-plugin-git-log";
const GIT_LOG_KIND = "git-log";
const SHORTCUT_ID = "workspace.gitLog";
const PAGE_SIZE = 50;
const AUTO_REFRESH_MIN_GAP_MS = 4000;
const WIDE_LAYOUT_MIN_PX = 720;

const GRAPH_PALETTE = [
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#c084fc",
  "#fb7185",
  "#60a5fa",
  "#2dd4bf",
  "#f97316",
];

const LOCALES = {
  zh: {
    "tab.title": "Git 日志",
    "guide.title": "Git 日志",
    "guide.description": "查看当前工作区仓库的分支、提交图谱、提交详情与文件 Diff。",
    "shortcut.label": "打开 Git 日志",
    "shortcut.noSession": "当前没有关联工作区的会话",
    "filesAction.tooltip": "查看 Git 日志",
    "empty.noWorkspace.title": "当前会话未绑定工作区目录",
    "empty.noWorkspace.sub": "选择或打开包含本地目录的会话后，将自动加载该目录的 Git 提交历史。",
    "empty.notGit.title": "当前目录不是 Git 仓库",
    "empty.notGit.sub": "未检测到 .git 仓库元数据：",
    "empty.bareRepo.title": "暂不支持裸仓库（Bare Repository）",
    "empty.gitMissing.title": "宿主环境未检测到 git 命令",
    "empty.gitMissing.sub": "请先在系统 PATH 中安装 git 后重试。",
    "empty.dirMissing.title": "工作区目录不存在",
    "empty.unborn.title": "仓库尚无提交记录",
    "empty.unborn.sub": "当前分支尚未产生任何 commit，创建首次提交后会在此显示历史图谱。",
    "empty.noMatches.title": "未找到匹配的提交",
    "empty.noMatches.sub": "请尝试调整搜索关键词、筛选范围或分支选择。",
    "header.refresh": "刷新 Git 日志",
    "header.searchToggle": "显示或隐藏搜索栏",
    "header.detached": "游离 HEAD",
    "header.unborn": "无提交",
    "header.dirtyTooltip": "工作区有未提交变更：已暂存 {staged}、已修改 {modified}、未跟踪 {untracked}、冲突 {conflicted}",
    "header.dirtyShort": "{total} 项变更",
    "ref.currentHead": "当前分支",
    "ref.allBranches": "全部分支与标签 (--all)",
    "ref.groupLocal": "本地分支",
    "ref.groupRemote": "远程分支",
    "ref.groupTags": "标签",
    "search.placeholder": "搜索提交说明、作者、哈希或路径…",
    "search.clear": "清除搜索",
    "search.scope.all": "全部",
    "search.scope.message": "说明",
    "search.scope.author": "作者",
    "search.scope.path": "路径",
    "list.loading": "正在加载提交记录…",
    "list.loadMore": "加载更多",
    "list.loadingMore": "加载中…",
    "list.count": "已显示 {count} 条提交",
    "list.scanNote": "（已扫描最近 {scanned} 条）",
    "detail.title": "提交详情",
    "detail.loading": "正在加载提交详情…",
    "detail.close": "关闭详情",
    "detail.maximize": "放大详情区",
    "detail.restore": "恢复分栏视图",
    "detail.copyHash": "复制完整哈希",
    "detail.copied": "已复制",
    "detail.author": "作者",
    "detail.committer": "提交者",
    "detail.parents": "父提交",
    "detail.filesChanged": "变更文件（{count}）",
    "detail.filesTruncated": "文件过多，仅显示前 {shown} 个（共 {total} 个）",
    "detail.noFiles": "此提交没有文件变更（空提交）。",
    "detail.openFile": "在文档预览中打开工作区当前文件",
    "detail.diffLoading": "正在加载 Diff…",
    "detail.diffBinary": "二进制文件变更，不支持文本 Diff 预览。",
    "detail.diffEmpty": "无可显示的文本 Diff 内容（例如仅权限/空文件或纯重命名）。",
    "detail.diffTruncated": "Diff 体积超过上限，已截断显示前段内容。",
    "error.retry": "重试",
    "time.justNow": "刚刚",
    "time.minutesAgo": "{n} 分钟前",
    "time.hoursAgo": "{n} 小时前",
    "time.daysAgo": "{n} 天前",
  },
  en: {
    "tab.title": "Git Log",
    "guide.title": "Git Log",
    "guide.description": "Inspect branches, commit graph, commit details and file diffs for the active workspace.",
    "shortcut.label": "Open Git Log",
    "shortcut.noSession": "No active session with a workspace",
    "filesAction.tooltip": "Open Git Log",
    "empty.noWorkspace.title": "No workspace directory",
    "empty.noWorkspace.sub": "Bind a workspace folder to this session to view its Git commit history.",
    "empty.notGit.title": "Not a Git repository",
    "empty.notGit.sub": "No Git metadata found under:",
    "empty.bareRepo.title": "Bare repositories are not supported",
    "empty.gitMissing.title": "Git executable not found on host",
    "empty.gitMissing.sub": "Install git in PATH on the host machine and retry.",
    "empty.dirMissing.title": "Workspace directory missing",
    "empty.unborn.title": "No commits yet",
    "empty.unborn.sub": "Create an initial commit on this branch to see its history here.",
    "empty.noMatches.title": "No matching commits",
    "empty.noMatches.sub": "Try clearing filters or changing the selected branch.",
    "header.refresh": "Refresh Git Log",
    "header.searchToggle": "Toggle search filter",
    "header.detached": "detached",
    "header.unborn": "unborn",
    "header.dirtyTooltip": "Working tree changes: {staged} staged, {modified} modified, {untracked} untracked, {conflicted} conflicted",
    "header.dirtyShort": "{total} dirty",
    "ref.currentHead": "Current",
    "ref.allBranches": "All branches & tags (--all)",
    "ref.groupLocal": "Local branches",
    "ref.groupRemote": "Remote branches",
    "ref.groupTags": "Tags",
    "search.placeholder": "Search message, author, hash or path…",
    "search.clear": "Clear search",
    "search.scope.all": "All",
    "search.scope.message": "Msg",
    "search.scope.author": "Author",
    "search.scope.path": "Path",
    "list.loading": "Loading commits…",
    "list.loadMore": "Load more",
    "list.loadingMore": "Loading…",
    "list.count": "{count} commits loaded",
    "list.scanNote": "(scanned {scanned} commits)",
    "detail.title": "Commit",
    "detail.loading": "Loading commit details…",
    "detail.close": "Close detail",
    "detail.maximize": "Expand detail pane",
    "detail.restore": "Restore split view",
    "detail.copyHash": "Copy full SHA",
    "detail.copied": "Copied",
    "detail.author": "Author",
    "detail.committer": "Committer",
    "detail.parents": "Parents",
    "detail.filesChanged": "Changed files ({count})",
    "detail.filesTruncated": "Showing first {shown} of {total} files",
    "detail.noFiles": "No file changes in this commit.",
    "detail.openFile": "Open current workspace file in preview",
    "detail.diffLoading": "Loading diff…",
    "detail.diffBinary": "Binary file changed (text diff unavailable).",
    "detail.diffEmpty": "No textual diff hunks (e.g. pure rename, mode change, or empty file).",
    "detail.diffTruncated": "Diff output exceeded size limit and was truncated.",
    "error.retry": "Retry",
    "time.justNow": "just now",
    "time.minutesAgo": "{n}m ago",
    "time.hoursAgo": "{n}h ago",
    "time.daysAgo": "{n}d ago",
  },
};

function formatMessage(template, vars) {
  if (!vars || typeof template !== "string") return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function makeFallbackTranslate() {
  return (key, vars) => {
    const lang = typeof navigator !== "undefined" && /^zh/i.test(navigator.language ?? "") ? "zh" : "en";
    const dict = LOCALES[lang] ?? LOCALES.en;
    const raw = dict[key] ?? LOCALES.en[key] ?? key;
    return formatMessage(raw, vars);
  };
}

/**
 * Lightweight shared map from sidebar tabId -> live branch/dirty badge so
 * `GitLogTitle` renders the current branch pill beside the tab title.
 */
function createTabBadgeStore() {
  const map = new Map();
  const listeners = new Set();
  return {
    set(tabId, info) {
      if (!tabId) return;
      const prev = map.get(tabId);
      if (prev && prev.branch === info?.branch && prev.dirty === info?.dirty) return;
      if (info) map.set(tabId, info);
      else map.delete(tabId);
      for (const fn of listeners) fn();
    },
    get(tabId) {
      return map.get(tabId);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

function ensureStyles() {
  if (typeof document === "undefined" || !document.head) return;
  let style = document.head.querySelector(`style[data-plugin="${PLUGIN_ID}"]`);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("data-plugin", PLUGIN_ID);
    document.head.appendChild(style);
  }
  if (style.textContent !== GIT_LOG_CSS) {
    style.textContent = GIT_LOG_CSS;
  }
}

function removeStyles() {
  if (typeof document === "undefined" || !document.head) return;
  const style = document.head.querySelector(`style[data-plugin="${PLUGIN_ID}"]`);
  if (style) style.remove();
}

async function fetchGitJson(path, queryObj, signal) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(queryObj)) {
    if (v !== undefined && v !== null && v !== "") {
      params.set(k, String(v));
    }
  }
  const url = `${path}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { [REQUEST_HEADER]: REQUEST_HEADER_VALUE },
    credentials: "same-origin",
    signal,
  });
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok || !payload || payload.ok === false) {
    const msg = payload?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return payload;
}

function formatRelativeTime(unixSec, translate) {
  if (!unixSec || !Number.isFinite(unixSec)) return "";
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, nowSec - unixSec);
  if (diff < 60) return translate("time.justNow");
  if (diff < 3600) return formatMessage(translate("time.minutesAgo", { n: Math.floor(diff / 60) }), { n: Math.floor(diff / 60) });
  if (diff < 86400) return formatMessage(translate("time.hoursAgo", { n: Math.floor(diff / 3600) }), { n: Math.floor(diff / 3600) });
  if (diff < 86400 * 30) return formatMessage(translate("time.daysAgo", { n: Math.floor(diff / 86400) }), { n: Math.floor(diff / 86400) });
  const d = new Date(unixSec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFullTimestamp(unixSec) {
  if (!unixSec || !Number.isFinite(unixSec)) return "";
  try {
    return new Date(unixSec * 1000).toLocaleString();
  } catch {
    return new Date(unixSec * 1000).toISOString();
  }
}

function joinRepoPath(repoRoot, relPath) {
  const root = String(repoRoot || "").replace(/[\\/]+$/, "");
  const rel = String(relPath || "").replace(/^[\\/]+/, "");
  return root ? `${root}/${rel}` : rel;
}

async function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") return;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    area.remove();
  }
}

/* ---------- Icons ---------- */

function GitBranchIcon({ size = 14, className }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className,
      "aria-hidden": "true",
    },
    h("circle", { cx: 4.5, cy: 3.5, r: 1.75 }),
    h("circle", { cx: 4.5, cy: 12.5, r: 1.75 }),
    h("circle", { cx: 11.5, cy: 5.5, r: 1.75 }),
    h("path", { d: "M4.5 5.25v5.5M11.5 7.25c0 2.5-3.25 2.5-7 3.75" }),
  );
}

function RefreshIcon({ size = 14, spinning = false }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className: spinning ? "dsh-gl-spinning" : undefined,
      "aria-hidden": "true",
    },
    h("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.45-3.73" }),
    h("path", { d: "M13.5 2.75v2.75h-2.75" }),
  );
}

function SearchIcon({ size = 14 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    h("circle", { cx: 7, cy: 7, r: 4.5 }),
    h("path", { d: "M10.5 10.5L13.75 13.75" }),
  );
}

function CloseIcon({ size = 14 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      "aria-hidden": "true",
    },
    h("path", { d: "M4 4l8 8M12 4l-8 8" }),
  );
}

function ExpandIcon({ size = 14, maximized = false }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    maximized
      ? h("path", { d: "M6 2.5v3.5H2.5M10 13.5V10h3.5M13.5 6H10V2.5M2.5 10H6v3.5" })
      : h("path", { d: "M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" }),
  );
}

function CopyIcon({ size = 12 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    h("rect", { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5 }),
    h("path", { d: "M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" }),
  );
}

function OpenFileIcon({ size = 13 }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    h("path", { d: "M9.5 2.5h4v4M13.5 2.5L7.5 8.5" }),
    h("path", { d: "M12.5 9v3.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H7" }),
  );
}

function GitLogGuideIcon({ size = 24, className }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.75,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className,
      "aria-hidden": "true",
    },
    h("circle", { cx: 7, cy: 6, r: 2.5 }),
    h("circle", { cx: 7, cy: 18, r: 2.5 }),
    h("circle", { cx: 17, cy: 9, r: 2.5 }),
    h("path", { d: "M7 8.5v7M17 11.5c0 3.5-4.5 3.5-10 5" }),
  );
}

/* ---------- Graph SVG Row ---------- */

function CommitGraphCell({ row, maxLanes }) {
  const cappedLanes = Math.max(1, Math.min(maxLanes, 8));
  const laneWidth = 14;
  const padLeft = 8;
  const height = 46;
  const cy = height / 2;
  const width = padLeft * 2 + (cappedLanes - 1) * laneWidth;
  const xOf = (c) => padLeft + Math.min(c, cappedLanes - 1) * laneWidth;
  const colorOf = (idx) => GRAPH_PALETTE[idx % GRAPH_PALETTE.length];

  const elements = [];
  for (const lane of row.passCols) {
    if (lane >= cappedLanes) continue;
    const x = xOf(lane);
    elements.push(
      h("line", {
        key: `p-${lane}`,
        x1: x,
        y1: 0,
        x2: x,
        y2: height,
        stroke: colorOf(lane),
        strokeWidth: 1.75,
        strokeOpacity: 0.85,
      }),
    );
  }

  for (let i = 0; i < row.inEdges.length; i++) {
    const edge = row.inEdges[i];
    const x1 = xOf(edge.fromCol);
    const x2 = xOf(row.col);
    const color = colorOf(edge.colorIdx);
    if (x1 === x2) {
      elements.push(
        h("line", {
          key: `in-${i}`,
          x1,
          y1: 0,
          x2,
          y2: cy,
          stroke: color,
          strokeWidth: 1.75,
        }),
      );
    } else {
      elements.push(
        h("path", {
          key: `in-${i}`,
          d: `M ${x1} 0 C ${x1} ${cy * 0.55}, ${x2} ${cy * 0.45}, ${x2} ${cy}`,
          fill: "none",
          stroke: color,
          strokeWidth: 1.75,
        }),
      );
    }
  }

  for (let i = 0; i < row.outEdges.length; i++) {
    const edge = row.outEdges[i];
    const x1 = xOf(row.col);
    const x2 = xOf(edge.toCol);
    const color = colorOf(edge.colorIdx);
    if (x1 === x2) {
      elements.push(
        h("line", {
          key: `out-${i}`,
          x1,
          y1: cy,
          x2,
          y2: height,
          stroke: color,
          strokeWidth: 1.75,
        }),
      );
    } else {
      elements.push(
        h("path", {
          key: `out-${i}`,
          d: `M ${x1} ${cy} C ${x1} ${cy + cy * 0.55}, ${x2} ${cy + cy * 0.45}, ${x2} ${height}`,
          fill: "none",
          stroke: color,
          strokeWidth: 1.75,
        }),
      );
    }
  }

  const cx = xOf(row.col);
  const nodeColor = colorOf(row.colorIdx);
  if (row.isMerge) {
    elements.push(
      h("circle", {
        key: "node-outer",
        cx,
        cy,
        r: 4.4,
        fill: "var(--dsw-alias-bg-base, #fff)",
        stroke: nodeColor,
        strokeWidth: 1.8,
      }),
      h("circle", {
        key: "node-inner",
        cx,
        cy,
        r: 1.8,
        fill: nodeColor,
      }),
    );
  } else {
    elements.push(
      h("circle", {
        key: "node",
        cx,
        cy,
        r: 3.6,
        fill: nodeColor,
        stroke: "var(--dsw-alias-bg-base, #fff)",
        strokeWidth: 1.4,
      }),
    );
  }

  return h(
    "span",
    { className: "dsh-gl-graph-cell", style: { width: `${width}px` } },
    h("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" }, ...elements),
  );
}

/* ---------- Inline Diff Table ---------- */

function DiffViewer({ diffState, t }) {
  if (!diffState) return null;
  if (diffState.loading) {
    return h("div", { className: "dsh-gl-diff-box" }, h("div", { className: "dsh-gl-diff-note" }, t("detail.diffLoading")));
  }
  if (diffState.error) {
    return h("div", { className: "dsh-gl-diff-box" }, h("div", { className: "dsh-gl-diff-note" }, diffState.error));
  }
  const data = diffState.data;
  if (!data) return null;
  if (data.binary) {
    return h("div", { className: "dsh-gl-diff-box" }, h("div", { className: "dsh-gl-diff-note" }, t("detail.diffBinary")));
  }
  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    return h("div", { className: "dsh-gl-diff-box" }, h("div", { className: "dsh-gl-diff-note" }, t("detail.diffEmpty")));
  }

  const rows = data.lines.map((line, idx) => {
    const marker = line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "context" ? " " : "";
    return h(
      "tr",
      { key: idx, className: `dsh-gl-diff-row--${line.type}` },
      h("td", { className: "dsh-gl-diff-ln" }, line.oldLine ?? ""),
      h("td", { className: "dsh-gl-diff-ln" }, line.newLine ?? ""),
      h("td", { className: "dsh-gl-diff-marker" }, marker),
      h("td", { className: "dsh-gl-diff-code" }, line.text),
    );
  });

  return h(
    "div",
    { className: "dsh-gl-diff-box" },
    data.truncated ? h("div", { className: "dsh-gl-diff-note" }, t("detail.diffTruncated")) : null,
    h("table", { className: "dsh-gl-diff-table" }, h("tbody", null, ...rows)),
  );
}

/* ---------- Main Body Component ---------- */

function createGitLogComponents(tabBadgeStore, resolveTranslate) {
  function GitLogTitle({ useTabInfo }) {
    const { tab } = useTabInfo();
    const badge = useSyncExternalStore(
      tabBadgeStore.subscribe,
      () => tabBadgeStore.get(tab.id),
      () => undefined,
    );
    return h(
      "span",
      { className: "dsh-gl-title-wrap" },
      h(GitBranchIcon, { size: 14, className: "dsh-gl-title-icon" }),
      h("span", null, tab.title),
      badge?.branch ? h("span", { className: "dsh-gl-title-branch", title: badge.branch }, badge.branch) : null,
      badge?.dirty ? h("span", { className: "dsh-gl-title-dirty", "aria-hidden": "true" }) : null,
    );
  }

  function GitLogBody({ useTabInfo, sessionId, useSessions, t: slotT }) {
    const t = useCallback((key, vars) => {
      const fn = slotT ?? resolveTranslate();
      const raw = fn(key, vars);
      return formatMessage(raw, vars);
    }, [slotT]);

    const { tab, panel } = useTabInfo();
    const cwd = useSessions((sessions) => sessions.byId[sessionId]?.cwd);

    const rootRef = useRef(null);
    const listPaneRef = useRef(null);
    const searchInputRef = useRef(null);
    const overviewAbortRef = useRef(null);
    const commitsAbortRef = useRef(null);
    const detailAbortRef = useRef(null);
    const diffInFlightRef = useRef(new Set());
    const copyTimerRef = useRef(null);
    const lastRefreshAtRef = useRef(0);

    const [paneWidth, setPaneWidth] = useState(400);
    const [overviewState, setOverviewState] = useState({ loading: false, data: null, error: null });
    const [selectedRef, setSelectedRef] = useState(HEAD_REF);
    const [searchOpen, setSearchOpen] = useState(false);
    const [draftQuery, setDraftQuery] = useState("");
    const [appliedQuery, setAppliedQuery] = useState("");
    const [searchScope, setSearchScope] = useState("all");

    const [commitsState, setCommitsState] = useState({
      loading: false,
      loadingMore: false,
      commits: [],
      hasMore: false,
      searchScanned: 0,
      unborn: false,
      error: null,
    });

    const [selectedHash, setSelectedHash] = useState(null);
    const [detailMaximized, setDetailMaximized] = useState(false);
    const [detailState, setDetailState] = useState({ loading: false, data: null, error: null });
    const [expandedFiles, setExpandedFiles] = useState({});
    const [copiedHash, setCopiedHash] = useState("");

    const isWide = paneWidth >= WIDE_LAYOUT_MIN_PX;

    useEffect(() => {
      ensureStyles();
    }, []);

    useEffect(() => {
      const el = rootRef.current;
      if (!el || typeof ResizeObserver !== "function") return;
      const update = () => setPaneWidth(el.clientWidth || 400);
      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      const overview = overviewState.data;
      if (!cwd || !overview || overview.state !== "ready") {
        tabBadgeStore.set(tab.id, null);
        return;
      }
      const headLabel = overview.head?.unborn
        ? t("header.unborn")
        : overview.head?.detached
          ? overview.head.oid
          : overview.head?.branch;
      tabBadgeStore.set(tab.id, {
        branch: headLabel || "",
        dirty: Boolean(overview.status?.dirty),
      });
    }, [tab.id, cwd, overviewState.data, t]);

    useEffect(() => () => {
      tabBadgeStore.set(tab.id, null);
      overviewAbortRef.current?.abort();
      commitsAbortRef.current?.abort();
      detailAbortRef.current?.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      diffInFlightRef.current.clear();
    }, [tab.id]);

    const loadOverview = useCallback(async (targetCwd, targetSessionId) => {
      overviewAbortRef.current?.abort();
      if (!targetCwd) {
        setOverviewState({ loading: false, data: { state: "no-workspace" }, error: null });
        return null;
      }
      const ac = new AbortController();
      overviewAbortRef.current = ac;
      setOverviewState((prev) => ({ loading: true, data: prev.data, error: null }));
      try {
        const data = await fetchGitJson(OVERVIEW_PATH, { cwd: targetCwd, sessionId: targetSessionId }, ac.signal);
        if (ac.signal.aborted) return null;
        setOverviewState({ loading: false, data, error: null });
        return data;
      } catch (err) {
        if (ac.signal.aborted) return null;
        setOverviewState({
          loading: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    }, []);

    const loadCommits = useCallback(async (opts) => {
      const {
        targetCwd,
        targetSessionId,
        ref,
        query,
        scope,
        skip = 0,
        append = false,
      } = opts;
      commitsAbortRef.current?.abort();
      if (!targetCwd) {
        setCommitsState({
          loading: false,
          loadingMore: false,
          commits: [],
          hasMore: false,
          searchScanned: 0,
          unborn: false,
          error: null,
        });
        return;
      }
      const ac = new AbortController();
      commitsAbortRef.current = ac;
      setCommitsState((prev) => ({
        ...prev,
        loading: !append,
        loadingMore: append,
        error: null,
      }));
      try {
        const data = await fetchGitJson(
          COMMITS_PATH,
          {
            cwd: targetCwd,
            sessionId: targetSessionId,
            ref,
            q: query,
            scope,
            skip,
            limit: PAGE_SIZE,
          },
          ac.signal,
        );
        if (ac.signal.aborted) return;
        setCommitsState((prev) => ({
          loading: false,
          loadingMore: false,
          commits: append ? [...prev.commits, ...(data.commits ?? [])] : (data.commits ?? []),
          hasMore: Boolean(data.hasMore),
          searchScanned: data.searchScanned ?? 0,
          unborn: Boolean(data.unborn),
          error: null,
        }));
      } catch (err) {
        if (ac.signal.aborted) return;
        setCommitsState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }, []);

    const loadCommitDetail = useCallback(async (targetCwd, targetSessionId, hash) => {
      detailAbortRef.current?.abort();
      diffInFlightRef.current.clear();
      if (!targetCwd || !hash) {
        setDetailState({ loading: false, data: null, error: null });
        return;
      }
      const ac = new AbortController();
      detailAbortRef.current = ac;
      setDetailState({ loading: true, data: null, error: null });
      setExpandedFiles({});
      try {
        const data = await fetchGitJson(
          COMMIT_PATH,
          { cwd: targetCwd, sessionId: targetSessionId, hash },
          ac.signal,
        );
        if (ac.signal.aborted) return;
        setDetailState({ loading: false, data, error: null });
      } catch (err) {
        if (ac.signal.aborted) return;
        setDetailState({
          loading: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, []);

    // Reset state cleanly whenever workspace `cwd` changes.
    useEffect(() => {
      setSelectedRef(HEAD_REF);
      setDraftQuery("");
      setAppliedQuery("");
      setSearchScope("all");
      setSelectedHash(null);
      setDetailMaximized(false);
      setDetailState({ loading: false, data: null, error: null });
      setExpandedFiles({});
      lastRefreshAtRef.current = Date.now();
      void loadOverview(cwd, sessionId);
    }, [cwd, sessionId, loadOverview]);

    // Fetch commits whenever overview becomes ready or filter changes.
    const repoState = overviewState.data?.state;
    const repoRoot = overviewState.data?.repoRoot;
    useEffect(() => {
      if (!cwd || repoState !== "ready") return;
      void loadCommits({
        targetCwd: cwd,
        targetSessionId: sessionId,
        ref: selectedRef,
        query: appliedQuery,
        scope: searchScope,
        skip: 0,
        append: false,
      });
    }, [cwd, sessionId, repoState, selectedRef, appliedQuery, searchScope, loadCommits]);

    // Debounce typing in search bar.
    useEffect(() => {
      const timer = setTimeout(() => {
        setAppliedQuery(draftQuery.trim());
      }, 250);
      return () => clearTimeout(timer);
    }, [draftQuery]);

    const refreshAll = useCallback(async () => {
      if (!cwd) return;
      lastRefreshAtRef.current = Date.now();
      const ov = await loadOverview(cwd, sessionId);
      if (ov?.state === "ready") {
        await loadCommits({
          targetCwd: cwd,
          targetSessionId: sessionId,
          ref: selectedRef,
          query: appliedQuery,
          scope: searchScope,
          skip: 0,
          append: false,
        });
        if (selectedHash) {
          await loadCommitDetail(cwd, sessionId, selectedHash);
        }
      }
    }, [cwd, sessionId, selectedRef, appliedQuery, searchScope, selectedHash, loadOverview, loadCommits, loadCommitDetail]);

    useEffect(
      () => tab.actions.bindCommands({ refresh: () => { void refreshAll(); } }),
      [tab.actions, refreshAll],
    );

    // Refresh softly when window regains focus or tab becomes visible again.
    useEffect(() => {
      if (typeof window === "undefined") return;
      const maybeRefresh = () => {
        if (!tab.visible || !cwd) return;
        if (Date.now() - lastRefreshAtRef.current < AUTO_REFRESH_MIN_GAP_MS) return;
        void refreshAll();
      };
      window.addEventListener("focus", maybeRefresh);
      return () => window.removeEventListener("focus", maybeRefresh);
    }, [tab.visible, cwd, refreshAll]);

    const selectCommit = useCallback((hash) => {
      if (!hash || !cwd) return;
      setSelectedHash(hash);
      void loadCommitDetail(cwd, sessionId, hash);
    }, [cwd, sessionId, loadCommitDetail]);

    const handleToggleFileDiff = useCallback(async (file) => {
      const key = file.path;
      const targetCommitHash = detailState.data?.commit?.hash;
      const existing = expandedFiles[key];
      if (existing && (existing.data || existing.loading)) {
        setExpandedFiles((prev) => ({
          ...prev,
          [key]: { ...prev[key], open: !prev[key].open },
        }));
        return;
      }
      if (diffInFlightRef.current.has(key)) {
        setExpandedFiles((prev) => ({
          ...prev,
          [key]: { ...prev[key], open: !prev[key]?.open },
        }));
        return;
      }

      setExpandedFiles((prev) => ({
        ...prev,
        [key]: { open: true, loading: true, data: null, error: null },
      }));
      if (!cwd || !targetCommitHash) return;
      diffInFlightRef.current.add(key);
      try {
        const data = await fetchGitJson(FILE_DIFF_PATH, {
          cwd,
          sessionId,
          hash: targetCommitHash,
          path: file.path,
          oldPath: file.oldPath ?? undefined,
        });
        if (!diffInFlightRef.current.has(key)) return;
        setExpandedFiles((prev) => ({
          ...prev,
          [key]: { open: true, loading: false, data, error: null },
        }));
      } catch (err) {
        if (!diffInFlightRef.current.has(key)) return;
        setExpandedFiles((prev) => ({
          ...prev,
          [key]: {
            open: true,
            loading: false,
            data: null,
            error: err instanceof Error ? err.message : String(err),
          },
        }));
      } finally {
        diffInFlightRef.current.delete(key);
      }
    }, [cwd, sessionId, detailState.data, expandedFiles]);

    const handleCopyHash = useCallback(async (hash) => {
      if (!hash) return;
      try {
        await copyText(hash);
        setCopiedHash(hash);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => {
          setCopiedHash((cur) => (cur === hash ? "" : cur));
        }, 1600);
      } catch {
        // Ignore clipboard errors in headless environments.
      }
    }, []);

    const handleListKeyDown = useCallback((event) => {
      if (event.key === "Escape" && selectedHash) {
        event.preventDefault();
        setSelectedHash(null);
        setDetailMaximized(false);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const list = commitsState.commits;
      if (!list.length) return;
      event.preventDefault();
      const idx = list.findIndex((c) => c.hash === selectedHash);
      const nextIdx = event.key === "ArrowDown"
        ? (idx === -1 ? 0 : Math.min(list.length - 1, idx + 1))
        : (idx === -1 ? 0 : Math.max(0, idx - 1));
      const nextHash = list[nextIdx].hash;
      selectCommit(nextHash);
      const rowEl = listPaneRef.current?.querySelector(`[data-commit-hash="${nextHash}"]`);
      rowEl?.scrollIntoView?.({ block: "nearest" });
    }, [commitsState.commits, selectedHash, selectCommit]);

    const graph = useMemo(() => computeCommitGraph(commitsState.commits), [commitsState.commits]);

    if (!cwd || overviewState.data?.state === "no-workspace") {
      return h(
        "div",
        { ref: rootRef, className: "dsh-gl-root", "data-git-log-state": "no-workspace" },
        h(
          "div",
          { className: "dsh-gl-empty" },
          h(GitBranchIcon, { size: 24 }),
          h("p", { className: "dsh-gl-empty-title" }, t("empty.noWorkspace.title")),
          h("p", { className: "dsh-gl-empty-sub" }, t("empty.noWorkspace.sub")),
        ),
      );
    }

    if (overviewState.error && !overviewState.data) {
      return h(
        "div",
        { ref: rootRef, className: "dsh-gl-root", "data-git-log-state": "error" },
        h(
          "div",
          { className: "dsh-gl-empty" },
          h("p", { className: "dsh-gl-empty-title" }, overviewState.error),
          h("button", { type: "button", className: "dsh-gl-btn", onClick: () => { void refreshAll(); } }, t("error.retry")),
        ),
      );
    }

    const stateKind = overviewState.data?.state;
    if (stateKind && stateKind !== "ready") {
      const titleKey = stateKind === "not-git"
        ? "empty.notGit.title"
        : stateKind === "bare-repo"
          ? "empty.bareRepo.title"
          : stateKind === "git-missing"
            ? "empty.gitMissing.title"
            : "empty.dirMissing.title";
      const subText = stateKind === "not-git"
        ? `${t("empty.notGit.sub")} ${cwd}`
        : stateKind === "git-missing"
          ? t("empty.gitMissing.sub")
          : cwd;
      return h(
        "div",
        { ref: rootRef, className: "dsh-gl-root", "data-git-log-state": stateKind },
        h(
          "div",
          { className: "dsh-gl-empty" },
          h(GitBranchIcon, { size: 24 }),
          h("p", { className: "dsh-gl-empty-title" }, t(titleKey)),
          h("p", { className: "dsh-gl-empty-sub" }, subText),
          h(
            "button",
            { type: "button", className: "dsh-gl-btn", onClick: () => { void refreshAll(); } },
            h(RefreshIcon, { size: 12, spinning: overviewState.loading }),
            t("error.retry"),
          ),
        ),
      );
    }

    const overview = overviewState.data;
    const isBusy = overviewState.loading || commitsState.loading;
    const localBranches = (overview?.branches ?? []).filter((b) => b.kind === "local");
    const remoteBranches = (overview?.branches ?? []).filter((b) => b.kind === "remote");
    const tags = overview?.tags ?? [];

    const headText = !overview
      ? ""
      : overview.head?.unborn
        ? `${overview.head.branch || "HEAD"} (${t("header.unborn")})`
        : overview.head?.detached
          ? `${t("header.detached")} @ ${overview.head.oid}`
          : overview.head?.branch || "HEAD";

    const dirtyStatus = overview?.status;
    const dirtyTooltip = dirtyStatus?.dirty ? t("header.dirtyTooltip", dirtyStatus) : undefined;

    const headerEl = h(
      "div",
      { className: "dsh-gl-header" },
      h(
        "div",
        { className: "dsh-gl-repo-info" },
        h("span", { className: "dsh-gl-repo-name", title: overview?.repoRoot || cwd }, overview?.repoName || cwd),
        headText
          ? h(
            "span",
            {
              className: `dsh-gl-head-pill${overview?.head?.detached ? " dsh-gl-head-pill--detached" : ""}`,
              title: headText,
            },
            h(GitBranchIcon, { size: 11 }),
            headText,
          )
          : null,
        dirtyStatus?.dirty
          ? h("span", { className: "dsh-gl-status-pill", title: dirtyTooltip }, t("header.dirtyShort", { total: dirtyStatus.total }))
          : null,
      ),
      h(
        "div",
        { className: "dsh-gl-header-actions" },
        h(
          "button",
          {
            type: "button",
            className: "dsh-gl-icon-btn",
            "aria-label": t("header.searchToggle"),
            "aria-expanded": searchOpen ? "true" : "false",
            title: t("header.searchToggle"),
            onClick: () => {
              const next = !searchOpen;
              setSearchOpen(next);
              if (next) {
                setTimeout(() => searchInputRef.current?.focus(), 0);
              } else {
                setDraftQuery("");
                setAppliedQuery("");
              }
            },
          },
          h(SearchIcon, { size: 14 }),
        ),
        h(
          "button",
          {
            type: "button",
            className: "dsh-gl-icon-btn",
            "aria-label": t("header.refresh"),
            "aria-keyshortcuts": tab.refreshShortcut?.aria,
            title: t("header.refresh"),
            onClick: () => { void refreshAll(); },
          },
          h(RefreshIcon, { size: 14, spinning: isBusy }),
        ),
      ),
    );

    const controlsEl = h(
      "div",
      { className: "dsh-gl-controls" },
      h(
        "div",
        { className: "dsh-gl-controls-row" },
        h(
          "select",
          {
            className: "dsh-gl-select",
            "aria-label": t("ref.currentHead"),
            value: selectedRef,
            onChange: (event) => {
              setSelectedRef(event.target.value);
              setSelectedHash(null);
            },
          },
          h("option", { value: HEAD_REF }, `${t("ref.currentHead")}${overview?.head?.branch ? ` (${overview.head.branch})` : ""}`),
          h("option", { value: ALL_REFS_SENTINEL }, t("ref.allBranches")),
          localBranches.length
            ? h(
              "optgroup",
              { label: t("ref.groupLocal") },
              ...localBranches.map((b) => h("option", { key: b.ref, value: b.ref }, `${b.name}${b.current ? " *" : ""}`)),
            )
            : null,
          remoteBranches.length
            ? h(
              "optgroup",
              { label: t("ref.groupRemote") },
              ...remoteBranches.map((b) => h("option", { key: b.ref, value: b.ref }, b.name)),
            )
            : null,
          tags.length
            ? h(
              "optgroup",
              { label: t("ref.groupTags") },
              ...tags.map((tg) => h("option", { key: tg.ref, value: tg.ref }, tg.name)),
            )
            : null,
        ),
      ),
      searchOpen
        ? h(
          "div",
          { className: "dsh-gl-controls-row" },
          h(
            "div",
            { className: "dsh-gl-search-box" },
            h(SearchIcon, { size: 12 }),
            h("input", {
              ref: searchInputRef,
              type: "search",
              className: "dsh-gl-search-input",
              value: draftQuery,
              placeholder: t("search.placeholder"),
              onChange: (e) => setDraftQuery(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  setAppliedQuery(draftQuery.trim());
                } else if (e.key === "Escape") {
                  setDraftQuery("");
                  setAppliedQuery("");
                  setSearchOpen(false);
                }
              },
            }),
            h(
              "select",
              {
                className: "dsh-gl-search-scope",
                value: searchScope,
                onChange: (e) => setSearchScope(e.target.value),
              },
              ...SEARCH_SCOPES.map((sc) => h("option", { key: sc, value: sc }, t(`search.scope.${sc}`))),
            ),
            draftQuery
              ? h(
                "button",
                {
                  type: "button",
                  className: "dsh-gl-icon-btn",
                  style: { width: "20px", height: "20px" },
                  "aria-label": t("search.clear"),
                  title: t("search.clear"),
                  onClick: () => {
                    setDraftQuery("");
                    setAppliedQuery("");
                    searchInputRef.current?.focus();
                  },
                },
                h(CloseIcon, { size: 12 }),
              )
              : null,
          ),
        )
        : null,
    );

    const listRows = commitsState.commits.map((commit, idx) => {
      const rowLayout = graph.rows[idx] ?? { col: 0, colorIdx: 0, isMerge: false, isRoot: false, passCols: [], inEdges: [], outEdges: [] };
      const isSelected = commit.hash === selectedHash;
      return h(
        "li",
        { key: commit.hash },
        h(
          "button",
          {
            type: "button",
            className: `dsh-gl-commit-row${isSelected ? " dsh-gl-commit-row--selected" : ""}`,
            "aria-pressed": isSelected ? "true" : "false",
            "data-commit-hash": commit.hash,
            onClick: () => selectCommit(commit.hash),
          },
          h(CommitGraphCell, { row: rowLayout, maxLanes: graph.maxLanes }),
          h(
            "span",
            { className: "dsh-gl-commit-content" },
            h(
              "span",
              { className: "dsh-gl-commit-top" },
              ...(commit.decorations ?? []).map((dec, di) =>
                h(
                  "span",
                  { key: `${di}-${dec.raw}`, className: `dsh-gl-ref-badge dsh-gl-ref-badge--${dec.kind}`, title: dec.raw },
                  dec.label,
                ),
              ),
              h("span", { className: "dsh-gl-commit-subject", title: commit.subject }, commit.subject),
            ),
            h(
              "span",
              { className: "dsh-gl-commit-meta" },
              h("span", { className: "dsh-gl-hash-chip" }, commit.shortHash),
              h("span", { className: "dsh-gl-commit-author" }, commit.authorName),
              h(
                "span",
                { className: "dsh-gl-commit-time", title: formatFullTimestamp(commit.authorTime) },
                formatRelativeTime(commit.authorTime, t),
              ),
            ),
          ),
        ),
      );
    });

    const listPaneEl = h(
      "div",
      {
        ref: listPaneRef,
        className: "dsh-gl-list-pane",
        tabIndex: 0,
        onKeyDown: handleListKeyDown,
      },
      commitsState.error
        ? h(
          "div",
          { className: "dsh-gl-error-banner" },
          h("span", null, commitsState.error),
          h("button", { type: "button", className: "dsh-gl-btn", onClick: () => { void refreshAll(); } }, t("error.retry")),
        )
        : null,
      commitsState.loading && commitsState.commits.length === 0
        ? h("div", { className: "dsh-gl-empty" }, h("p", { className: "dsh-gl-empty-sub" }, t("list.loading")))
        : commitsState.unborn
          ? h(
            "div",
            { className: "dsh-gl-empty" },
            h("p", { className: "dsh-gl-empty-title" }, t("empty.unborn.title")),
            h("p", { className: "dsh-gl-empty-sub" }, t("empty.unborn.sub")),
          )
          : commitsState.commits.length === 0
            ? h(
              "div",
              { className: "dsh-gl-empty" },
              h("p", { className: "dsh-gl-empty-title" }, t("empty.noMatches.title")),
              h("p", { className: "dsh-gl-empty-sub" }, t("empty.noMatches.sub")),
            )
            : h(
              Fragment,
              null,
              h("ul", { className: "dsh-gl-commit-list" }, ...listRows),
              h(
                "div",
                { className: "dsh-gl-load-more-wrap" },
                h(
                  "span",
                  null,
                  t("list.count", { count: commitsState.commits.length }),
                  commitsState.searchScanned > 0 ? ` ${t("list.scanNote", { scanned: commitsState.searchScanned })}` : "",
                ),
                commitsState.hasMore
                  ? h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-gl-btn",
                      disabled: commitsState.loadingMore,
                      onClick: () => {
                        void loadCommits({
                          targetCwd: cwd,
                          targetSessionId: sessionId,
                          ref: selectedRef,
                          query: appliedQuery,
                          scope: searchScope,
                          skip: commitsState.commits.length,
                          append: true,
                        });
                      },
                    },
                    commitsState.loadingMore ? t("list.loadingMore") : t("list.loadMore"),
                  )
                  : null,
              ),
            ),
    );

    const commitDetail = detailState.data?.commit;
    const commitFiles = detailState.data?.files ?? [];

    const detailPaneEl = selectedHash
      ? h(
        "div",
        { className: "dsh-gl-detail-pane" },
        h(
          "div",
          { className: "dsh-gl-detail-header" },
          h(
            "div",
            { className: "dsh-gl-detail-title" },
            h("span", null, t("detail.title")),
            h(
              "button",
              {
                type: "button",
                className: "dsh-gl-hash-btn",
                title: t("detail.copyHash"),
                onClick: () => { void handleCopyHash(commitDetail?.hash ?? selectedHash); },
              },
              h("span", null, commitDetail?.shortHash ?? selectedHash.slice(0, 7)),
              h(CopyIcon, { size: 11 }),
              copiedHash === (commitDetail?.hash ?? selectedHash) ? h("span", null, t("detail.copied")) : null,
            ),
          ),
          h(
            "div",
            { className: "dsh-gl-header-actions" },
            !isWide
              ? h(
                "button",
                {
                  type: "button",
                  className: "dsh-gl-icon-btn",
                  title: detailMaximized ? t("detail.restore") : t("detail.maximize"),
                  "aria-label": detailMaximized ? t("detail.restore") : t("detail.maximize"),
                  "aria-pressed": detailMaximized ? "true" : "false",
                  onClick: () => setDetailMaximized((v) => !v),
                },
                h(ExpandIcon, { size: 13, maximized: detailMaximized }),
              )
              : null,
            h(
              "button",
              {
                type: "button",
                className: "dsh-gl-icon-btn",
                title: t("detail.close"),
                "aria-label": t("detail.close"),
                onClick: () => {
                  setSelectedHash(null);
                  setDetailMaximized(false);
                },
              },
              h(CloseIcon, { size: 13 }),
            ),
          ),
        ),
        h(
          "div",
          { className: "dsh-gl-detail-scroll" },
          detailState.loading
            ? h("div", { className: "dsh-gl-diff-note" }, t("detail.loading"))
            : detailState.error
              ? h("div", { className: "dsh-gl-error-banner" }, detailState.error)
              : commitDetail
                ? h(
                  Fragment,
                  null,
                  h("h4", { className: "dsh-gl-detail-subject" }, commitDetail.subject),
                  h(
                    "div",
                    { className: "dsh-gl-detail-meta" },
                    h(
                      "div",
                      null,
                      `${t("detail.author")}: ${commitDetail.authorName} <${commitDetail.authorEmail}> · ${formatFullTimestamp(commitDetail.authorTime)}`,
                    ),
                    commitDetail.committerEmail && commitDetail.committerEmail !== commitDetail.authorEmail
                      ? h(
                        "div",
                        null,
                        `${t("detail.committer")}: ${commitDetail.committerName} <${commitDetail.committerEmail}>`,
                      )
                      : null,
                    commitDetail.parents.length > 0
                      ? h(
                        "div",
                        { className: "dsh-gl-parent-row" },
                        h("span", null, `${t("detail.parents")}:`),
                        ...commitDetail.parents.map((p) =>
                          h(
                            "button",
                            {
                              key: p,
                              type: "button",
                              className: "dsh-gl-hash-btn",
                              onClick: () => selectCommit(p),
                            },
                            p.slice(0, 7),
                          ),
                        ),
                      )
                      : null,
                  ),
                  commitDetail.body ? h("pre", { className: "dsh-gl-detail-body" }, commitDetail.body) : null,
                  h(
                    "p",
                    { className: "dsh-gl-section-label" },
                    t("detail.filesChanged", { count: detailState.data?.totalFiles ?? commitFiles.length }),
                  ),
                  detailState.data?.filesTruncated
                    ? h(
                      "div",
                      { className: "dsh-gl-diff-note" },
                      t("detail.filesTruncated", { shown: commitFiles.length, total: detailState.data.totalFiles }),
                    )
                    : null,
                  commitFiles.length === 0
                    ? h("div", { className: "dsh-gl-diff-note" }, t("detail.noFiles"))
                    : h(
                      "div",
                      { className: "dsh-gl-files-list" },
                      ...commitFiles.map((file) => {
                        const fileDiff = expandedFiles[file.path];
                        const isOpen = Boolean(fileDiff?.open);
                        const labelText = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
                        const canPreview = file.status !== "D" && sessionId && repoRoot;
                        return h(
                          "div",
                          { key: file.path, className: "dsh-gl-file-item" },
                          h(
                            "div",
                            { className: "dsh-gl-file-header" },
                            h(
                              "button",
                              {
                                type: "button",
                                className: "dsh-gl-file-btn",
                                "aria-expanded": isOpen ? "true" : "false",
                                onClick: () => { void handleToggleFileDiff(file); },
                              },
                              h("span", { className: `dsh-gl-file-badge dsh-gl-file-badge--${file.status}` }, file.status),
                              h("span", { className: "dsh-gl-file-path", title: labelText }, labelText),
                              !file.binary
                                ? h(
                                  "span",
                                  { className: "dsh-gl-file-stats" },
                                  file.insertions > 0 ? h("span", { className: "dsh-gl-stat-add" }, `+${file.insertions}`) : null,
                                  file.deletions > 0 ? h("span", { className: "dsh-gl-stat-del" }, `-${file.deletions}`) : null,
                                )
                                : null,
                            ),
                            canPreview
                              ? h(
                                "button",
                                {
                                  type: "button",
                                  className: "dsh-gl-icon-btn",
                                  style: { width: "22px", height: "22px" },
                                  title: t("detail.openFile"),
                                  "aria-label": t("detail.openFile"),
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    const abs = joinRepoPath(repoRoot, file.path);
                                    const addr = buildSessionFileAddress(sessionId, abs);
                                    tab.actions.openResource(addr, panel.isFloating ? undefined : { paneId: panel.id });
                                  },
                                },
                                h(OpenFileIcon, { size: 12 }),
                              )
                              : null,
                          ),
                          isOpen ? h(DiffViewer, { diffState: fileDiff, t }) : null,
                        );
                      }),
                    ),
                )
                : null,
        ),
      )
      : null;

    const bodyClasses = [
      "dsh-gl-body",
      isWide ? "dsh-gl-body--wide" : "",
      selectedHash ? "dsh-gl-body--split" : "",
      selectedHash && !isWide && detailMaximized ? "dsh-gl-body--detail-max" : "",
    ].filter(Boolean).join(" ");

    return h(
      "div",
      { ref: rootRef, className: "dsh-gl-root", "data-git-log-state": "ready" },
      headerEl,
      controlsEl,
      h("div", { className: bodyClasses }, listPaneEl, detailPaneEl),
    );
  }

  function FilesGitLogAction({ t: slotT, sidebarRight }) {
    const t = slotT ?? resolveTranslate();
    return h(
      "button",
      {
        type: "button",
        className: "dsh-gl-icon-btn",
        style: { width: "24px", height: "24px" },
        title: t("filesAction.tooltip"),
        "aria-label": t("filesAction.tooltip"),
        "data-git-log-files-action": "true",
        onClick: (event) => {
          const target = sidebarRight?.commandTarget?.(event.currentTarget);
          if (target !== undefined) {
            sidebarRight.openTabFromTarget(GIT_LOG_KIND, target);
          }
        },
      },
      h(GitBranchIcon, { size: 14 }),
    );
  }

  return { GitLogTitle, GitLogBody, FilesGitLogAction };
}

const inject = ["slots", "locale", "sidebarRightTabs", "sidebarRight", "sessions"];

function apply(ctx) {
  ensureStyles();
  ctx.effect(() => () => { removeStyles(); }, "git-log: styles");

  const t = ctx.locale?.bind ? ctx.locale.bind(NS) : makeFallbackTranslate();
  const tabBadgeStore = createTabBadgeStore();
  const { GitLogTitle, GitLogBody, FilesGitLogAction } = createGitLogComponents(tabBadgeStore, () => t);

  ctx.effect(() => ctx.locale.register(NS, LOCALES), "git-log: locale");

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: GIT_LOG_ID,
    kind: GIT_LOG_KIND,
    priority: "extension",
    multiple: false,
    keepMounted: true,
    title: () => t("tab.title"),
    guide: [{
      id: "git-log",
      commandId: SHORTCUT_ID,
      order: 18,
      title: () => t("guide.title"),
      description: () => t("guide.description"),
      icon: GitLogGuideIcon,
    }],
  }), "git-log: tab type");

  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: GIT_LOG_ID,
    locale: NS,
  }, GitLogBody)), "git-log: tab body");

  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
    name: "sidebar.right.pane.tab.title",
    key: GIT_LOG_ID,
  }, GitLogTitle)), "git-log: tab title");

  ctx.effect(() => ctx.slots.inject("sidebar.right.tab.files.actions", () => ctx.slots.register({
    name: "sidebar.right.tab.files.actions",
    id: "git-log",
    locale: NS,
    inject: () => ({ sidebarRight: ctx.sidebarRight }),
  }, FilesGitLogAction)), "git-log: files action");

  ctx.inject(["shortcuts"], (scoped) => {
    scoped.effect(() => scoped.shortcuts.register({
      id: SHORTCUT_ID,
      label: () => t("shortcut.label"),
      aliases: ["git log", "git history", "commits", "git"],
      defaults: {
        "desktop:macos": { code: "KeyG", modifiers: ["control", "shift"] },
        "desktop:windows": { code: "KeyG", modifiers: ["control", "shift"] },
        "desktop:linux": { code: "KeyG", modifiers: ["control", "shift"] },
        "web:macos": { code: "KeyG", modifiers: ["control", "shift"] },
        "web:windows": { code: "KeyG", modifiers: ["control", "shift"] },
      },
      regions: ["page", "editable", "terminal"],
      modals: [],
      resolve: ({ target: element }) => {
        const target = ctx.sidebarRight.commandTarget(element);
        if (target === undefined) {
          return { status: "blocked", reason: t("shortcut.noSession") };
        }
        return {
          status: "handled",
          run: () => { ctx.sidebarRight.openTabFromTarget(GIT_LOG_KIND, target); },
        };
      },
    }), "git-log: shortcut");
  });
}

Object.assign(exports, { inject, apply });
    //#endregion

    return module.exports;
  },
});
