window.__ModuleLoader__.load({
  id: "dsh-plugin-subagent-model",
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, "__esModule", { value: true });
    const React = require("react");
    const ReactDOM = require("react-dom");
    const STYLES = ".dsh-sam-root {\n  position: relative;\n  display: flex;\n  align-items: center;\n  min-width: 0;\n}\n\n.dsh-sam-trigger {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  min-width: 0;\n  max-width: 360px;\n  height: 28px;\n  padding: 0 7px 0 8px;\n  border: none;\n  border-radius: var(--dsw-radius-sm, 6px);\n  outline: none;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary, #5c6066);\n  font-family: var(--dsw-font-family, inherit);\n  font-size: 13px;\n  line-height: 20px;\n  font-weight: 400;\n  cursor: pointer;\n  user-select: none;\n  transition: background-color 100ms ease, color 100ms ease;\n}\n\n.dsh-sam-trigger[data-pending=\"true\"] {\n  color: var(--dsw-alias-label-caption, #81858c);\n}\n\n@media (hover: hover) {\n  .dsh-sam-trigger:hover,\n  .dsh-sam-trigger[aria-expanded=\"true\"] {\n    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));\n    color: var(--dsw-alias-label-primary, #1f2329);\n  }\n}\n\n.dsh-sam-trigger:focus-visible {\n  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3964fe));\n}\n\n.dsh-sam-trigger-icon {\n  display: var(--dsh-composer-model-icon-display, none);\n  flex: 0 0 auto;\n}\n\n.dsh-sam-trigger-label {\n  display: var(--dsh-composer-model-text-display, block);\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dsh-sam-trigger-effort {\n  display: var(--dsh-composer-model-text-display, block);\n  flex-shrink: 1000;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-caption, #81858c);\n}\n\n.dsh-sam-trigger-lock {\n  display: var(--dsh-composer-model-text-display, inline-flex);\n  align-items: center;\n  justify-content: center;\n  flex: 0 0 auto;\n  color: var(--dsw-alias-label-caption, #81858c);\n  opacity: 0.78;\n}\n\n.dsh-sam-badged {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  max-width: 100%;\n  vertical-align: baseline;\n  white-space: nowrap;\n}\n\n.dsh-sam-badged-text {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.dsh-sam-badge {\n  display: inline-flex;\n  align-items: center;\n  flex: none;\n  padding: 1px 5px;\n  border-radius: var(--dsw-radius-xs, 4px);\n  font-size: 11px;\n  line-height: 14px;\n  font-weight: 500;\n  background: var(--dsw-alias-fill-tsp-secondary, rgba(128, 128, 128, 0.12));\n  color: var(--dsw-alias-label-secondary, #5c6066);\n}\n\n.dsh-sam-badge[data-tone=\"info\"],\n.dsh-sam-badge[data-tone=\"accent\"] {\n  background: var(--dsw-alias-state-business-tertiary, rgba(57, 100, 254, 0.12));\n  color: var(--dsw-alias-state-business-primary, #3964fe);\n}\n\n.dsh-sam-badge[data-tone=\"warning\"] {\n  background: var(--dsw-alias-bg-module-platform, rgba(245, 158, 11, 0.14));\n  color: var(--dsw-alias-state-warn-label, #b45309);\n}\n\n.dsh-sam-badge[data-tone=\"danger\"] {\n  background: var(--dsw-alias-interactive-bg-hover-danger, rgba(239, 68, 68, 0.12));\n  color: var(--dsw-alias-state-error-primary, #dc2626);\n}\n\n.dsh-sam-popover {\n  box-sizing: border-box;\n  position: fixed;\n  z-index: 1120;\n  min-width: min(248px, calc(100vw - 24px));\n  max-width: min(340px, calc(100vw - 24px));\n  padding: 10px 12px;\n  border-radius: var(--dsw-radius-lg, 12px);\n  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));\n  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, #ffffff));\n  backdrop-filter: var(--dsw-menu-backdrop-filter, none);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, none);\n  box-shadow: var(--dsw-elevation-prominent, 0 12px 32px rgba(0, 0, 0, 0.14));\n  color: var(--dsw-alias-label-primary, #1f2329);\n  font-family: var(--dsw-font-family, inherit);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.dsh-sam-popover-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 8px;\n  padding-bottom: 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06));\n}\n\n.dsh-sam-popover-title {\n  font-size: 12px;\n  line-height: 16px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary, #1f2329);\n}\n\n.dsh-sam-readonly-tag {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 1px 6px;\n  border-radius: 999px;\n  background: var(--dsw-alias-fill-tsp-secondary, rgba(128, 128, 128, 0.12));\n  color: var(--dsw-alias-label-tertiary, #6b7280);\n  font-size: 11px;\n  line-height: 15px;\n  font-weight: 500;\n}\n\n.dsh-sam-rows {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.dsh-sam-row {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.dsh-sam-row-label {\n  flex: none;\n  color: var(--dsw-alias-label-caption, #81858c);\n}\n\n.dsh-sam-row-value {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  text-align: right;\n  color: var(--dsw-alias-label-primary, #1f2329);\n  font-weight: 500;\n}\n\n.dsh-sam-row-mono {\n  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 11px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-secondary, #5c6066);\n}\n\n.dsh-sam-popover-note {\n  margin-top: 8px;\n  padding-top: 6px;\n  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06));\n  color: var(--dsw-alias-label-caption, #81858c);\n  font-size: 11px;\n  line-height: 15px;\n}\n";

    function preferredLocaleOrder() {
      const lang = (
        (typeof document !== "undefined" && document.documentElement?.lang)
        || (typeof navigator !== "undefined" && navigator.language)
        || ""
      ).toLowerCase();
      if (lang.startsWith("zh")) return ["zh-CN", "zh", "zh-TW", "en"];
      return ["en", "en-US", "zh-CN", "zh"];
    }

    /**
     * Pick the effective model selection recorded for a subagent session.
     * Prefers `lastUsed` (the latest executed request header) over `next`
     * (`pending ?? lastUsed`) so stale inherited selections never override
     * what the subagent actually ran with, and avoids falling back to the
     * global default model.
     */
    function pickSubagentSelection(projection) {
      if (!projection || typeof projection !== "object") {
        return { selection: null, source: "none" };
      }
      if (isValidSelection(projection.lastUsed)) {
        return { selection: projection.lastUsed, source: "lastUsed" };
      }
      if (isValidSelection(projection.next)) {
        return { selection: projection.next, source: "next" };
      }
      return { selection: null, source: "none" };
    }

    function isValidSelection(value) {
      return Boolean(
        value
        && typeof value === "object"
        && typeof value.provider === "string"
        && value.provider.length > 0
        && typeof value.model === "string"
        && value.model.length > 0,
      );
    }

    /**
     * Resolve localized catalog badge text (plain string or locale dictionary).
     */
    function resolveLocalizedText(text, localeResolver) {
      if (text == null) return "";
      if (typeof text === "string") return text;
      if (typeof localeResolver === "function") {
        const resolved = localeResolver(text);
        if (typeof resolved === "string" && resolved.length > 0) return resolved;
      }
      if (typeof text === "object") {
        for (const key of preferredLocaleOrder()) {
          if (typeof text[key] === "string" && text[key].length > 0) return text[key];
        }
        for (const val of Object.values(text)) {
          if (typeof val === "string" && val.length > 0) return val;
        }
      }
      return "";
    }

    /**
     * Match native ModelSelect provider display naming.
     */
    function resolveProviderName(group, providerId, accountProviderName) {
      if (providerId === "deepseek-account") {
        return accountProviderName || group?.name || providerId;
      }
      return group?.name || providerId;
    }

    /**
     * Resolve the reasoning effort label consistently with ModelSelect.
     */
    function resolveEffortLabel({ reasoning, reasoningEffort, t }) {
      if (reasoning !== undefined && reasoning !== null) {
        const effective = reasoningEffort ?? reasoning.defaultEffort;
        if (effective === undefined) {
          return typeof t === "function" ? t("effort.providerDefault") : "Default";
        }
        const matched = Array.isArray(reasoning.efforts)
          ? reasoning.efforts.find((item) => item && item.id === effective)
          : undefined;
        return matched?.name ?? effective;
      }
      if (typeof reasoningEffort === "string" && reasoningEffort.length > 0) {
        return reasoningEffort;
      }
      return undefined;
    }

    /**
     * Build display metadata for the subagent read-only model badge and popover.
     */
    function resolveModelDisplay({ projection, groups, running, t, resolveText }) {
      const { selection, source } = pickSubagentSelection(projection);
      if (!selection) {
        const showPending = Boolean(running);
        return {
          visible: showPending,
          pending: showPending,
          source: "none",
          providerId: "",
          providerName: "",
          modelId: "",
          modelName: showPending ? t("trigger.pending") : "",
          badge: null,
          effortId: undefined,
          effortLabel: undefined,
          inCatalog: false,
        };
      }

      const list = Array.isArray(groups) ? groups : [];
      const group = list.find((item) => item && item.id === selection.provider);
      const catalogModel = group && Array.isArray(group.models)
        ? group.models.find((item) => item && item.id === selection.model)
        : undefined;

      const providerName = resolveProviderName(group, selection.provider, t("provider.account"));
      const modelName = catalogModel?.name || selection.model;
      const badgeText = catalogModel?.badge
        ? resolveLocalizedText(catalogModel.badge.text, resolveText)
        : "";
      const badge = badgeText
        ? { tone: catalogModel.badge.tone || "neutral", text: badgeText }
        : null;
      const effortId = selection.reasoningEffort ?? catalogModel?.reasoning?.defaultEffort;
      const effortLabel = resolveEffortLabel({
        reasoning: catalogModel?.reasoning,
        reasoningEffort: selection.reasoningEffort,
        t,
      });

      return {
        visible: true,
        pending: false,
        source,
        providerId: selection.provider,
        providerName,
        modelId: selection.model,
        modelName,
        badge,
        effortId,
        effortLabel,
        inCatalog: Boolean(catalogModel),
      };
    }

    /**
     * Compute fixed viewport coordinates for the read-only details popover,
     * preferring placement right-aligned above the trigger and flipping below
     * when there is insufficient room above.
     */
    function computePopoverPosition(triggerRect, viewport, popoverSize) {
      const margin = 12;
      const gap = 8;
      const width = popoverSize?.width || 280;
      const height = popoverSize?.height || 170;
      const vw = viewport?.width || 800;
      const vh = viewport?.height || 600;

      let left = (triggerRect?.right || 0) - width;
      const maxLeft = Math.max(margin, vw - width - margin);
      if (left > maxLeft) left = maxLeft;
      if (left < margin) left = margin;

      const aboveTop = (triggerRect?.top || 0) - gap - height;
      const belowTop = (triggerRect?.bottom || 0) + gap;
      const fitsAbove = aboveTop >= margin;
      const fitsBelow = belowTop + height <= vh - margin;

      let top = fitsAbove || !fitsBelow ? aboveTop : belowTop;
      const maxTop = Math.max(margin, vh - height - margin);
      if (top > maxTop) top = maxTop;
      if (top < margin) top = margin;

      return {
        top: Math.round(top),
        left: Math.round(left),
      };
    }

    const PLUGIN_ID = "dsh-plugin-subagent-model";
    const LOCALE_NS = "subagentModel";
    const EMPTY_GROUPS = [];
    const EMPTY_SNAPSHOT = () => null;
    const NOOP_SUBSCRIBE = () => () => {};

    const LOCALES = {
      en: {
        "provider.account": "DeepSeek Account",
        "effort.providerDefault": "Default",
        "trigger.pending": "Loading model...",
        "trigger.pendingTitle": "Waiting for first model request",
        "trigger.ariaPrefix": "Subagent model (read-only):",
        "popover.title": "Subagent Model",
        "popover.readonly": "Read-only",
        "popover.provider": "Provider",
        "popover.model": "Model",
        "popover.modelId": "Model ID",
        "popover.effort": "Reasoning",
        "popover.sourceLastUsed": "Observed from this subagent's recorded request header.",
        "popover.sourceNext": "Seeded selection before the first model request completes.",
        "popover.sourcePending": "Subagent is running; model info appears once the first request starts.",
        "popover.fixedNote": "Subagent models are fixed at creation and cannot be switched mid-session.",
      },
      zh: {
        "provider.account": "DeepSeek 账号",
        "effort.providerDefault": "默认",
        "trigger.pending": "模型加载中...",
        "trigger.pendingTitle": "等待首次模型请求完成",
        "trigger.ariaPrefix": "子智能体模型（只读）：",
        "popover.title": "子智能体模型",
        "popover.readonly": "只读",
        "popover.provider": "供应商",
        "popover.model": "模型",
        "popover.modelId": "模型 ID",
        "popover.effort": "思考强度",
        "popover.sourceLastUsed": "来自该子智能体已记录的请求头信息。",
        "popover.sourceNext": "首次请求完成前的预设模型选择。",
        "popover.sourcePending": "子智能体正在运行，首次发起模型请求后将显示具体模型。",
        "popover.fixedNote": "子智能体模型在创建时确定，无法在当前会话中切换。",
      },
    };

    const inject = ["slots", "locale", "sessions"];

    function getStylesText() {
      return typeof STYLES === "string" ? STYLES : "";
    }

    function installStyles() {
      if (typeof document === "undefined" || !document.head) return () => {};
      let styleEl = document.head.querySelector(`style[data-plugin="${PLUGIN_ID}"]`);
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.setAttribute("data-plugin", PLUGIN_ID);
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = getStylesText();
      return () => {
        styleEl?.remove();
      };
    }

    function ModelCompactIcon({ className }) {
      return React.createElement(
        "svg",
        {
          className,
          width: 16,
          height: 16,
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
        },
        React.createElement("path", {
          d: "M8 2.25 13 5l-5 2.75L3 5l5-2.75Z",
          stroke: "currentColor",
          strokeWidth: 1.35,
          strokeLinejoin: "round",
        }),
        React.createElement("path", {
          d: "M3 8l5 2.75L13 8",
          stroke: "currentColor",
          strokeWidth: 1.35,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
        React.createElement("path", {
          d: "M3 11l5 2.75L13 11",
          stroke: "currentColor",
          strokeWidth: 1.35,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    }

    function LockGlyph({ className, size = 11 }) {
      return React.createElement(
        "svg",
        {
          className,
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
        },
        React.createElement("path", {
          d: "M5 7V5.25a3 3 0 0 1 6 0V7",
          stroke: "currentColor",
          strokeWidth: 1.4,
          strokeLinecap: "round",
        }),
        React.createElement("rect", {
          x: 3.25,
          y: 7,
          width: 9.5,
          height: 6.75,
          rx: 1.75,
          stroke: "currentColor",
          strokeWidth: 1.4,
        }),
      );
    }

    function renderTriggerLabel(display) {
      if (!display.badge) return display.modelName;
      return React.createElement(
        "span",
        { className: "dsh-sam-badged" },
        React.createElement(
          "span",
          { className: "dsh-sam-badge", "data-tone": display.badge.tone },
          display.badge.text,
        ),
        React.createElement("span", { className: "dsh-sam-badged-text" }, display.modelName),
      );
    }

    function renderPopover({ display, t, popoverId, popoverRef, position }) {
      const sourceNote = display.pending
        ? t("popover.sourcePending")
        : display.source === "next"
          ? t("popover.sourceNext")
          : t("popover.sourceLastUsed");

      const rows = [];
      if (!display.pending) {
        rows.push(
          React.createElement(
            "div",
            { key: "provider", className: "dsh-sam-row" },
            React.createElement("span", { className: "dsh-sam-row-label" }, t("popover.provider")),
            React.createElement(
              "span",
              { className: "dsh-sam-row-value", title: display.providerName },
              display.providerName,
            ),
          ),
          React.createElement(
            "div",
            { key: "model", className: "dsh-sam-row" },
            React.createElement("span", { className: "dsh-sam-row-label" }, t("popover.model")),
            React.createElement(
              "span",
              { className: "dsh-sam-row-value", title: display.modelName },
              display.badge
                ? React.createElement(
                  "span",
                  { className: "dsh-sam-badged" },
                  React.createElement("span", { className: "dsh-sam-badged-text" }, display.modelName),
                  React.createElement(
                    "span",
                    { className: "dsh-sam-badge", "data-tone": display.badge.tone },
                    display.badge.text,
                  ),
                )
                : display.modelName,
            ),
          ),
          React.createElement(
            "div",
            { key: "modelId", className: "dsh-sam-row" },
            React.createElement("span", { className: "dsh-sam-row-label" }, t("popover.modelId")),
            React.createElement(
              "span",
              { className: "dsh-sam-row-value dsh-sam-row-mono", title: display.modelId },
              display.modelId,
            ),
          ),
        );
        if (display.effortLabel !== undefined) {
          rows.push(
            React.createElement(
              "div",
              { key: "effort", className: "dsh-sam-row" },
              React.createElement("span", { className: "dsh-sam-row-label" }, t("popover.effort")),
              React.createElement(
                "span",
                { className: "dsh-sam-row-value" },
                display.effortLabel,
              ),
            ),
          );
        }
      }

      return React.createElement(
        "div",
        {
          ref: popoverRef,
          id: popoverId,
          role: "dialog",
          "aria-label": t("popover.title"),
          className: "dsh-sam-popover",
          style: {
            top: `${position ? position.top : 0}px`,
            left: `${position ? position.left : 0}px`,
            visibility: position ? "visible" : "hidden",
          },
        },
        React.createElement(
          "div",
          { className: "dsh-sam-popover-head" },
          React.createElement("span", { className: "dsh-sam-popover-title" }, t("popover.title")),
          React.createElement(
            "span",
            { className: "dsh-sam-readonly-tag" },
            React.createElement(LockGlyph, { size: 10 }),
            t("popover.readonly"),
          ),
        ),
        rows.length > 0 && React.createElement("div", { className: "dsh-sam-rows" }, ...rows),
        React.createElement(
          "div",
          { className: "dsh-sam-popover-note" },
          sourceNote,
          " ",
          t("popover.fixedNote"),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(installStyles);
      ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALES));

      let cachedCatalog = null;
      let catalogPromise = null;

      function fetchPassiveCatalog(remote) {
        const fn = remote?.session?.modelCatalog;
        if (typeof fn !== "function") return null;
        if (cachedCatalog) return Promise.resolve(cachedCatalog);
        if (!catalogPromise) {
          catalogPromise = Promise.resolve()
            .then(() => fn.call(remote.session))
            .then((res) => {
              if (res?.ok && res.value) {
                cachedCatalog = res.value;
                return cachedCatalog;
              }
              return null;
            })
            .catch(() => null)
            .finally(() => {
              catalogPromise = null;
            });
        }
        return catalogPromise;
      }

      function SubagentModelIndicator(props) {
        const { sessionId, useProjection, useSession, t } = props;
        const translate = typeof t === "function" ? t : (key) => LOCALES.en[key] ?? key;
        const modelDirectories = typeof ctx.get === "function"
          ? ctx.get("modelDirectories")
          : ctx.modelDirectories;
        const remote = typeof ctx.get === "function" ? ctx.get("remote") : ctx.remote;

        const directory = React.useMemo(() => {
          if (!modelDirectories || typeof modelDirectories.directoryFor !== "function") {
            return null;
          }
          try {
            return modelDirectories.directoryFor(sessionId);
          } catch {
            return null;
          }
        }, [modelDirectories, sessionId]);

        const directoryState = React.useSyncExternalStore(
          directory?.store?.subscribe ?? NOOP_SUBSCRIBE,
          directory?.store?.getSnapshot ?? EMPTY_SNAPSHOT,
          directory?.store?.getSnapshot ?? EMPTY_SNAPSHOT,
        );

        const [passiveCatalog, setPassiveCatalog] = React.useState(cachedCatalog);
        const hasDirectoryGroups = Boolean(directoryState?.groups?.length);

        React.useEffect(() => {
          if (hasDirectoryGroups || cachedCatalog) {
            if (cachedCatalog && !passiveCatalog) setPassiveCatalog(cachedCatalog);
            return;
          }
          const pending = fetchPassiveCatalog(remote);
          if (!pending) return;
          let cancelled = false;
          pending.then((value) => {
            if (!cancelled && value) setPassiveCatalog(value);
          });
          return () => {
            cancelled = true;
          };
        }, [hasDirectoryGroups, remote, passiveCatalog]);

        const [open, setOpen] = React.useState(false);
        const [position, setPosition] = React.useState(null);
        const triggerRef = React.useRef(null);
        const popoverRef = React.useRef(null);
        const popoverId = React.useId ? React.useId() : "dsh-sam-popover";

        const projection = typeof useProjection === "function"
          ? useProjection("modelSelection")
          : undefined;
        const running = typeof useSession === "function"
          ? Boolean(useSession((session) => session?.running))
          : false;

        const groups = directoryState?.groups?.length
          ? directoryState.groups
          : (passiveCatalog?.groups ?? EMPTY_GROUPS);

        const display = resolveModelDisplay({
          projection,
          groups,
          running,
          t: translate,
          resolveText: ctx.locale?.resolveText,
        });

        const updatePosition = React.useCallback(() => {
          if (!triggerRef.current || typeof window === "undefined") return;
          const triggerRect = triggerRef.current.getBoundingClientRect();
          const popRect = popoverRef.current?.getBoundingClientRect();
          const next = computePopoverPosition(
            triggerRect,
            { width: window.innerWidth, height: window.innerHeight },
            { width: popRect?.width || 280, height: popRect?.height || 170 },
          );
          setPosition((prev) =>
            prev && prev.top === next.top && prev.left === next.left ? prev : next,
          );
        }, []);

        const useIsoLayoutEffect = typeof window !== "undefined" && typeof React.useLayoutEffect === "function"
          ? React.useLayoutEffect
          : React.useEffect;

        useIsoLayoutEffect(() => {
          if (!open) {
            setPosition(null);
            return;
          }
          updatePosition();
        }, [open, display.modelId, display.effortLabel, updatePosition]);

        React.useEffect(() => {
          if (!open || typeof document === "undefined" || typeof window === "undefined") {
            return;
          }
          const onPointerDown = (event) => {
            const target = event?.target;
            if (
              triggerRef.current?.contains(target)
              || popoverRef.current?.contains(target)
            ) {
              return;
            }
            setOpen(false);
          };
          const onKeyDown = (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              triggerRef.current?.focus?.();
            }
          };
          document.addEventListener("mousedown", onPointerDown);
          document.addEventListener("keydown", onKeyDown);
          window.addEventListener("resize", updatePosition);
          window.addEventListener("scroll", updatePosition, true);
          return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
          };
        }, [open, updatePosition]);

        React.useEffect(() => {
          if (!display.visible && open) setOpen(false);
        }, [display.visible, open]);

        if (!display.visible) return null;

        const summary = display.pending
          ? display.modelName
          : display.effortLabel !== undefined
            ? `${display.modelName} · ${display.effortLabel}`
            : display.modelName;

        const titleText = display.pending
          ? translate("trigger.pendingTitle")
          : summary;

        const ariaText = `${translate("trigger.ariaPrefix")} ${summary}`;

        const popoverNode = open
          ? renderPopover({
            display,
            t: translate,
            popoverId: `${popoverId}-dialog`,
            popoverRef,
            position,
          })
          : null;

        const portalTarget = typeof document !== "undefined" ? document.body : null;
        const portaledPopover = popoverNode
          ? (typeof ReactDOM?.createPortal === "function" && portalTarget
            ? ReactDOM.createPortal(popoverNode, portalTarget)
            : popoverNode)
          : null;

        return React.createElement(
          "div",
          {
            className: "dsh-sam-root",
            "data-provider-id": display.providerId || undefined,
            "data-model-id": display.modelId || undefined,
          },
          React.createElement(
            "button",
            {
              ref: triggerRef,
              type: "button",
              className: "dsh-sam-trigger",
              "data-pending": display.pending ? "true" : undefined,
              "aria-label": ariaText,
              "aria-haspopup": "dialog",
              "aria-expanded": open,
              "aria-controls": open ? `${popoverId}-dialog` : undefined,
              title: titleText,
              onClick: () => setOpen((prev) => !prev),
            },
            React.createElement(ModelCompactIcon, { className: "dsh-sam-trigger-icon" }),
            React.createElement(
              "span",
              { className: "dsh-sam-trigger-label" },
              renderTriggerLabel(display),
            ),
            display.effortLabel !== undefined
              && React.createElement(
                "span",
                { className: "dsh-sam-trigger-effort" },
                display.effortLabel,
              ),
            React.createElement(LockGlyph, { className: "dsh-sam-trigger-lock", size: 11 }),
          ),
          portaledPopover,
        );
      }

      function SubagentModelSlot(props) {
        const sessionId = props?.sessionId;
        if (!sessionId || typeof ctx.sessions?.subagentAddress !== "function") {
          return null;
        }
        const address = ctx.sessions.subagentAddress(sessionId);
        if (address === undefined) {
          return null;
        }
        return React.createElement(SubagentModelIndicator, { ...props, key: sessionId });
      }

      ctx.slots.inject("conversation.input.right", () =>
        ctx.slots.register(
          {
            name: "conversation.input.right",
            id: "subagent-model",
            order: 200,
            locale: LOCALE_NS,
          },
          SubagentModelSlot,
        ),
      );
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
