import React from "react";
import ReactDOM from "react-dom";
import {
  computePopoverPosition,
  resolveModelDisplay,
} from "./model-info.js";

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

export const inject = ["slots", "locale", "sessions"];

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

export function apply(ctx) {
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
