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
export function pickSubagentSelection(projection) {
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
export function resolveLocalizedText(text, localeResolver) {
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
export function resolveProviderName(group, providerId, accountProviderName) {
  if (providerId === "deepseek-account") {
    return accountProviderName || group?.name || providerId;
  }
  return group?.name || providerId;
}

/**
 * Resolve the reasoning effort label consistently with ModelSelect.
 */
export function resolveEffortLabel({ reasoning, reasoningEffort, t }) {
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
export function resolveModelDisplay({ projection, groups, running, t, resolveText }) {
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
export function computePopoverPosition(triggerRect, viewport, popoverSize) {
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
