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

const POPOVER_VIEWPORT_MARGIN = 12;
const POPOVER_ANCHOR_GAP = 8;
const POPOVER_DEFAULT_WIDTH = 320;
const POPOVER_MIN_FLIP_HEIGHT = 120;

/** Detect browser support for all CSS Anchor Positioning features used by composer.css. */
function supportsCssAnchorPositioning() {
  if (typeof CSS === "undefined" || CSS === null || typeof CSS.supports !== "function") {
    return false;
  }
  try {
    return CSS.supports("position-anchor", "--ub-anchor")
      && CSS.supports("top", "anchor(top)")
      && CSS.supports("position-try-fallbacks", "none");
  } catch {
    return false;
  }
}

/** Read `--dsh-frame-overlay-top` from computed styles when available, defaulting to 12 px. */
function readOverlayTopPx(element) {
  if (typeof window === "undefined" || window === null || typeof window.getComputedStyle !== "function") {
    return POPOVER_VIEWPORT_MARGIN;
  }
  try {
    const raw = window.getComputedStyle(element).getPropertyValue("--dsh-frame-overlay-top");
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? Math.max(POPOVER_VIEWPORT_MARGIN, parsed) : POPOVER_VIEWPORT_MARGIN;
  } catch {
    return POPOVER_VIEWPORT_MARGIN;
  }
}

/**
 * Compute fixed viewport coordinates mirroring composer.css's three-tier anchor rules
 * (above anchor -> below anchor -> clamped viewport fallback) for browsers without
 * complete CSS Anchor Positioning support.
 */
function computePopoverFallbackStyle(input) {
  const anchorRect = input.anchorRect;
  const popoverRect = input.popoverRect;
  const viewportWidth = input.viewportWidth;
  const viewportHeight = input.viewportHeight;
  const safeTop = Math.max(POPOVER_VIEWPORT_MARGIN, isNum(input.overlayTop) ? input.overlayTop : POPOVER_VIEWPORT_MARGIN);
  const maxWidth = Math.max(0, viewportWidth - POPOVER_VIEWPORT_MARGIN * 2);
  const measuredW = popoverRect && isNum(popoverRect.width) && popoverRect.width > 0
    ? popoverRect.width
    : Math.min(POPOVER_DEFAULT_WIDTH, maxWidth);
  const popoverW = Math.min(measuredW, maxWidth);
  const maxLeft = Math.max(POPOVER_VIEWPORT_MARGIN, viewportWidth - POPOVER_VIEWPORT_MARGIN - popoverW);
  const left = Math.round(Math.min(maxLeft, Math.max(POPOVER_VIEWPORT_MARGIN, anchorRect.left)));

  const spaceAbove = Math.max(0, anchorRect.top - POPOVER_ANCHOR_GAP - safeTop);
  const spaceBelow = Math.max(0, viewportHeight - POPOVER_VIEWPORT_MARGIN - (anchorRect.bottom + POPOVER_ANCHOR_GAP));
  const measuredH = popoverRect && isNum(popoverRect.height) && popoverRect.height > 0 ? popoverRect.height : 0;
  const effectiveH = measuredH > 0 ? measuredH : POPOVER_MIN_FLIP_HEIGHT;

  const placeAbove = function (maxH) {
    return {
      top: "auto",
      right: "auto",
      bottom: String(Math.round(viewportHeight - (anchorRect.top - POPOVER_ANCHOR_GAP))) + "px",
      left: String(left) + "px",
      maxHeight: String(Math.round(Math.max(0, maxH))) + "px",
    };
  };
  const placeBelow = function (maxH) {
    return {
      top: String(Math.round(Math.max(safeTop, anchorRect.bottom + POPOVER_ANCHOR_GAP))) + "px",
      right: "auto",
      bottom: "auto",
      left: String(left) + "px",
      maxHeight: String(Math.round(Math.max(0, maxH))) + "px",
    };
  };

  if (spaceAbove >= effectiveH) return placeAbove(spaceAbove);
  if (spaceBelow >= effectiveH) return placeBelow(spaceBelow);
  if (Math.max(spaceAbove, spaceBelow) >= POPOVER_MIN_FLIP_HEIGHT) {
    return spaceAbove >= spaceBelow ? placeAbove(spaceAbove) : placeBelow(spaceBelow);
  }
  return {
    top: String(Math.round(safeTop)) + "px",
    right: "auto",
    bottom: "auto",
    left: String(left) + "px",
    maxHeight: String(Math.round(Math.max(0, viewportHeight - safeTop - POPOVER_VIEWPORT_MARGIN))) + "px",
  };
}

function samePopoverFallbackStyle(left, right) {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
    && left.left === right.left
    && left.maxHeight === right.maxHeight;
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
  const [fallbackStyle, setFallbackStyle] = useState(null);
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

  useEffect(function () {
    if (!open || supportsCssAnchorPositioning()) {
      setFallbackStyle(function (previous) {
        return previous === null ? previous : null;
      });
      return undefined;
    }
    const anchorEl = usage.rootRef.current ?? triggerRef.current;
    const popoverEl = popoverRef.current;
    if (
      typeof window === "undefined"
      || window === null
      || anchorEl === null
      || anchorEl === undefined
      || popoverEl === null
      || popoverEl === undefined
      || typeof anchorEl.getBoundingClientRect !== "function"
    ) {
      return undefined;
    }
    const updatePosition = function () {
      const currentAnchor = usage.rootRef.current ?? triggerRef.current;
      const currentPopover = popoverRef.current;
      if (
        currentAnchor === null
        || currentAnchor === undefined
        || currentPopover === null
        || currentPopover === undefined
        || typeof currentAnchor.getBoundingClientRect !== "function"
      ) {
        return;
      }
      const anchorRect = currentAnchor.getBoundingClientRect();
      if (!anchorRect || (anchorRect.width <= 0 && anchorRect.height <= 0)) return;
      const popoverRect = typeof currentPopover.getBoundingClientRect === "function"
        ? currentPopover.getBoundingClientRect()
        : { width: currentPopover.offsetWidth || 0, height: currentPopover.offsetHeight || 0 };
      const docEl = typeof document !== "undefined" && document !== null ? document.documentElement : null;
      const viewportWidth = isNum(window.innerWidth) && window.innerWidth > 0
        ? window.innerWidth
        : docEl && isNum(docEl.clientWidth) ? docEl.clientWidth : 0;
      const viewportHeight = isNum(window.innerHeight) && window.innerHeight > 0
        ? window.innerHeight
        : docEl && isNum(docEl.clientHeight) ? docEl.clientHeight : 0;
      if (viewportWidth <= 0 || viewportHeight <= 0) return;
      const next = computePopoverFallbackStyle({
        anchorRect: anchorRect,
        popoverRect: popoverRect,
        viewportWidth: viewportWidth,
        viewportHeight: viewportHeight,
        overlayTop: readOverlayTopPx(currentPopover),
      });
      setFallbackStyle(function (previous) {
        return samePopoverFallbackStyle(previous, next) ? previous : next;
      });
    };
    updatePosition();
    if (typeof window.addEventListener === "function") {
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
    }
    let observer = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(updatePosition);
      observer.observe(anchorEl);
      observer.observe(popoverEl);
    }
    return function () {
      if (typeof window.removeEventListener === "function") {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      }
      if (observer !== null && typeof observer.disconnect === "function") {
        observer.disconnect();
      }
    };
  }, [open, row, usage.failure, usage.pending]);

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

  const popoverStyle = open && fallbackStyle !== null
    ? Object.assign({ positionAnchor: anchorName }, fallbackStyle)
    : { positionAnchor: anchorName };

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
        style: popoverStyle,
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
