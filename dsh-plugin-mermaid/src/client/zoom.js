/**
 * Pure pan/zoom math shared by the inline card and the fullscreen preview.
 * Coordinates are CSS pixels relative to the viewport's top-left corner.
 */

export const ZOOM_MIN = 1
export const ZOOM_MAX = 8
export const ZOOM_STEP = 1.35

/** @param {number} scale */
export function clampZoom(scale) {
  if (!Number.isFinite(scale)) return ZOOM_MIN
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale))
}

/** @param {number} scale */
export function zoomPercent(scale) {
  return `${Math.round(clampZoom(scale) * 100)}%`
}

/**
 * Convert a wheel event's delta into pixels. Trackpads usually report pixels,
 * while a mouse wheel may report lines or pages.
 *
 * @param {{ deltaY: number, deltaMode?: number }} event
 * @returns {number}
 */
export function wheelDeltaPixels(event) {
  const mode = event.deltaMode ?? 0
  const multiplier = mode === 1 ? 16 : mode === 2 ? 800 : 1
  return event.deltaY * multiplier
}

/**
 * Convert a wheel delta into a scale multiplier. The exponential curve keeps
 * small trackpad deltas smooth and clamps a single extreme wheel event.
 *
 * @param {number} deltaPixels
 * @returns {number}
 */
export function wheelZoomFactor(deltaPixels) {
  if (!Number.isFinite(deltaPixels) || deltaPixels === 0) return 1
  const factor = Math.exp(-deltaPixels * 0.0015)
  return Math.min(1.35, Math.max(1 / 1.35, factor))
}

/**
 * Zoom around a viewport-relative point so the diagram content under the
 * pointer stays under it. A transform with origin at the image center is
 * `translate(x, y) scale(scale)`.
 *
 * @param {{ scale: number, x: number, y: number }} state
 * @param {number} factor
 * @param {{ x: number, y: number }} point viewport-relative pointer position
 * @param {{ width: number, height: number }} viewport
 * @returns {{ scale: number, x: number, y: number }}
 */
export function zoomAtPoint(state, factor, point, viewport) {
  const scale = clampZoom(state.scale * factor)
  if (scale === state.scale) return state
  if (scale === ZOOM_MIN) return { scale: ZOOM_MIN, x: 0, y: 0 }

  const centerX = viewport.width / 2
  const centerY = viewport.height / 2
  const relativeX = point.x - centerX
  const relativeY = point.y - centerY
  const ratio = scale / state.scale
  return {
    scale,
    x: relativeX - (relativeX - state.x) * ratio,
    y: relativeY - (relativeY - state.y) * ratio,
  }
}

/**
 * Move a zoomed diagram. At fit scale there is nothing to pan.
 *
 * @param {{ scale: number, x: number, y: number }} state
 * @param {number} dx
 * @param {number} dy
 * @returns {{ scale: number, x: number, y: number }}
 */
export function panBy(state, dx, dy) {
  if (state.scale <= ZOOM_MIN) return state
  return { ...state, x: state.x + dx, y: state.y + dy }
}

/**
 * @param {number} scale
 * @param {number} factor
 * @returns {{ scale: number, x: number, y: number }}
 */
export function zoomCentered(scale, factor) {
  return zoomAtPoint(
    { scale, x: 0, y: 0 },
    factor,
    { x: 0, y: 0 },
    { width: 0, height: 0 },
  )
}
