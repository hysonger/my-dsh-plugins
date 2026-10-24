/**
 * Pan/zoom view controller and fullscreen preview.
 *
 * The same controller powers the inline card and the modal so wheel, trackpad,
 * drag, double-click, and zoom-button behavior are identical in both places.
 */

import {
  ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, panBy, wheelDeltaPixels, wheelZoomFactor, zoomAtPoint, zoomPercent,
} from './zoom.js'

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(className, text, label) {
  const node = el('button', className, text)
  node.type = 'button'
  if (label !== undefined) node.setAttribute('aria-label', label)
  return node
}

/**
 * Attach wheel/drag/keyboard zoom behavior to one image inside one viewport.
 *
 * @param {{
 *   viewport: HTMLElement,
 *   image: HTMLImageElement,
 *   label: string,
 *   trapWheel?: boolean,
 *   allowTouchScroll?: boolean,
 *   onChange?: (state: { scale: number, x: number, y: number }) => void,
 * }} options
 */
export function createZoomController({
  viewport, image, label, trapWheel = true, allowTouchScroll = false, onChange,
}) {
  let state = { scale: 1, x: 0, y: 0 }
  let drag = null
  const events = new AbortController()
  const signal = events.signal

  viewport.tabIndex = 0
  viewport.setAttribute('aria-label', label)
  viewport.style.touchAction = allowTouchScroll ? 'pan-y' : 'none'
  image.draggable = false
  image.style.transformOrigin = 'center center'

  function apply() {
    image.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`
    viewport.dataset.zoomed = state.scale > 1 ? 'true' : 'false'
    viewport.dataset.dragging = drag === null ? 'false' : 'true'
    // At fit, an inline card must leave vertical touch scrolling to the chat;
    // once zoomed, drag gestures belong to the diagram.
    viewport.style.touchAction = allowTouchScroll && state.scale <= 1 ? 'pan-y' : 'none'
    onChange?.(state)
  }

  function setState(next) {
    if (next === state) return
    state = next
    apply()
  }

  /** @param {number} factor */
  function zoomAtCenter(factor) {
    const rect = viewport.getBoundingClientRect()
    setState(zoomAtPoint(
      state,
      factor,
      { x: rect.width / 2, y: rect.height / 2 },
      { width: rect.width, height: rect.height },
    ))
  }

  function reset() {
    setState({ scale: 1, x: 0, y: 0 })
  }

  viewport.addEventListener('wheel', (event) => {
    const pinchGesture = event.ctrlKey || event.metaKey
    const factor = wheelZoomFactor(wheelDeltaPixels(event))
    if (factor === 1) {
      if (trapWheel || pinchGesture) event.preventDefault()
      return
    }
    const rect = viewport.getBoundingClientRect()
    const next = zoomAtPoint(
      state,
      factor,
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
    )
    if (next === state) {
      // At the fit/max boundary, let the card fall through to normal chat
      // scrolling. The modal and trackpad pinch always own the gesture.
      if (trapWheel || pinchGesture) event.preventDefault()
      return
    }
    // The diagram owns this wheel gesture; required so mouse-wheel and
    // trackpad pinch zoom do not simultaneously scroll the chat.
    event.preventDefault()
    setState(next)
  }, { passive: false, signal })

  viewport.addEventListener('dblclick', (event) => {
    event.preventDefault()
    reset()
  }, { signal })

  viewport.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomAtCenter(ZOOM_STEP)
    } else if (event.key === '-') {
      event.preventDefault()
      zoomAtCenter(1 / ZOOM_STEP)
    } else if (event.key === '0') {
      event.preventDefault()
      reset()
    }
  }, { signal })

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || state.scale <= 1) return
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: state.x,
      originY: state.y,
    }
    viewport.setPointerCapture?.(event.pointerId)
    viewport.dataset.dragging = 'true'
    event.preventDefault()
  }, { signal })

  viewport.addEventListener('pointermove', (event) => {
    if (drag === null || drag.pointerId !== event.pointerId) return
    setState(panBy(
      { scale: state.scale, x: drag.originX, y: drag.originY },
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    ))
  }, { signal })

  function endDrag(event) {
    if (drag === null || drag.pointerId !== event.pointerId) return
    viewport.releasePointerCapture?.(event.pointerId)
    drag = null
    apply()
  }

  viewport.addEventListener('pointerup', endDrag, { signal })
  viewport.addEventListener('pointercancel', endDrag, { signal })

  // Apply the initial transform after the listeners are installed.
  apply()

  return {
    zoomIn() {
      zoomAtCenter(ZOOM_STEP)
    },
    zoomOut() {
      zoomAtCenter(1 / ZOOM_STEP)
    },
    reset,
    getScale() {
      return state.scale
    },
    destroy() {
      events.abort()
      drag = null
      image.style.transform = ''
      viewport.removeAttribute('data-zoomed')
      viewport.removeAttribute('data-dragging')
    },
  }
}

/** The one open fullscreen preview, if any. */
let activeClose = null

/**
 * Open a fullscreen Mermaid preview with the same zoom behavior as the card.
 *
 * @param {{
 *   imageUrl: string,
 *   imageAlt: string,
 *   t: (key: string) => string,
 *   returnFocus?: HTMLElement | null,
 * }} options
 * @returns {{ close: () => void }}
 */
export function openMermaidLightbox({ imageUrl, imageAlt, t, returnFocus }) {
  activeClose?.()

  const previouslyFocused = document.activeElement
  const previousOverflow = document.body.style.overflow
  const events = new AbortController()
  const overlay = el('div', 'dsh-mermaid-lightbox')
  overlay.dataset.dshMermaidLightbox = ''
  const backdrop = el('div', 'dsh-mermaid-lightbox-backdrop')
  const panel = el('section', 'dsh-mermaid-lightbox-panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', imageAlt)

  const header = el('header', 'dsh-mermaid-lightbox-header')
  const title = el('span', 'dsh-mermaid-lightbox-title', 'Mermaid')
  const controls = el('div', 'dsh-mermaid-lightbox-controls')
  const zoomOut = button('dsh-mermaid-icon-button', '−', t('zoomOut'))
  const readout = button('dsh-mermaid-zoom-readout', '100%', t('resetZoom'))
  const zoomIn = button('dsh-mermaid-icon-button', '+', t('zoomIn'))
  const closeButton = button('dsh-mermaid-icon-button dsh-mermaid-lightbox-close', '×', t('close'))
  controls.append(zoomOut, readout, zoomIn, closeButton)
  header.append(title, controls)

  const viewport = el('div', 'dsh-mermaid-lightbox-viewport')
  const image = el('img', 'dsh-mermaid-lightbox-image')
  image.src = imageUrl
  image.alt = imageAlt
  image.decoding = 'async'
  viewport.append(image)

  const hint = el('div', 'dsh-mermaid-lightbox-hint', t('zoomHint'))
  panel.append(header, viewport, hint)
  overlay.append(backdrop, panel)
  document.body.append(overlay)
  document.body.style.overflow = 'hidden'
  overlay.classList.add('is-open')

  let closed = false
  const zoom = createZoomController({
    viewport,
    image,
    label: imageAlt,
    onChange(state) {
      readout.textContent = zoomPercent(state.scale)
      zoomOut.disabled = state.scale <= ZOOM_MIN
      zoomIn.disabled = state.scale >= ZOOM_MAX
    },
  })

  function close() {
    if (closed) return
    closed = true
    events.abort()
    zoom.destroy()
    overlay.remove()
    document.body.style.overflow = previousOverflow
    if (activeClose === close) activeClose = null
    const focusTarget = returnFocus ?? previouslyFocused
    if (focusTarget instanceof HTMLElement && focusTarget.isConnected) focusTarget.focus()
  }

  activeClose = close

  zoomOut.addEventListener('click', () => zoom.zoomOut(), { signal: events.signal })
  zoomIn.addEventListener('click', () => zoom.zoomIn(), { signal: events.signal })
  readout.addEventListener('click', () => zoom.reset(), { signal: events.signal })
  closeButton.addEventListener('click', close, { signal: events.signal })
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target === backdrop) close()
  }, { signal: events.signal })

  // Wheel outside the image should not scroll the chat behind the dialog.
  overlay.addEventListener('wheel', (event) => event.preventDefault(), {
    passive: false,
    signal: events.signal,
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...panel.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(node => node instanceof HTMLElement && node.getClientRects().length > 0)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }, { signal: events.signal })

  closeButton.focus({ preventScroll: true })
  return { close }
}
