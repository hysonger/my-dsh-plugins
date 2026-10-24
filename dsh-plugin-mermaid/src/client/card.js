/**
 * In-place Mermaid card.
 *
 * The official code block remains mounted and is only hidden. The card owns all
 * new DOM, uses textContent for source, and exposes the generated SVG solely
 * through an inert image URL. Both the card and the fullscreen preview share
 * one wheel/drag zoom controller.
 */

import { readPalette, renderMermaid } from './mermaid.js'
import { createZoomController, openMermaidLightbox } from './viewer.js'
import { ZOOM_MAX, ZOOM_MIN, zoomPercent } from './zoom.js'

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(className, text) {
  const node = el('button', className, text)
  node.type = 'button'
  return node
}

/**
 * @param {{ source: string, t: (key: string) => string }} options
 * @returns {{
 *   element: HTMLElement,
 *   destroy: () => void,
 *   updateLabels: (t: (key: string) => string) => void,
 * }}
 */
export function createMermaidCard({ source, t }) {
  let destroyed = false
  let state = 'loading'
  let mode = 'preview'
  let renderController
  let viewportObserver
  let copiedTimer
  let labels = t
  let imageUrl
  let lightboxClose

  const card = el('aside', 'dsh-mermaid-card')
  card.dataset.dshMermaidCard = ''
  card.setAttribute('role', 'group')

  const header = el('div', 'dsh-mermaid-header')
  const title = el('span', 'dsh-mermaid-title', 'Mermaid')
  const actions = el('div', 'dsh-mermaid-actions')

  const zoomControls = el('div', 'dsh-mermaid-zoom-controls')
  zoomControls.hidden = true
  const zoomOut = button('dsh-mermaid-icon-button', '−')
  const zoomReset = button('dsh-mermaid-zoom-readout', '100%')
  const zoomIn = button('dsh-mermaid-icon-button', '+')
  zoomControls.append(zoomOut, zoomReset, zoomIn)

  const expand = button('dsh-mermaid-button', t('open'))
  expand.hidden = true
  const toggle = button('dsh-mermaid-button')
  const copy = button('dsh-mermaid-button')
  actions.append(zoomControls, expand, toggle, copy)
  header.append(title, actions)

  const body = el('div', 'dsh-mermaid-body')
  const status = el('div', 'dsh-mermaid-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const canvas = el('div', 'dsh-mermaid-canvas')
  const viewport = el('div', 'dsh-mermaid-viewport')
  const image = el('img', 'dsh-mermaid-image')
  image.decoding = 'async'
  image.hidden = true
  viewport.append(image)
  canvas.append(viewport)
  const sourceView = el('pre', 'dsh-mermaid-source')
  const sourceCode = el('code')
  sourceCode.textContent = source
  sourceView.append(sourceCode)
  sourceView.hidden = true
  body.append(status, canvas, sourceView)

  card.append(header, body)

  const zoom = createZoomController({
    viewport,
    image,
    label: t('diagram'),
    trapWheel: false,
    allowTouchScroll: true,
    onChange(current) {
      const percent = zoomPercent(current.scale)
      zoomReset.textContent = percent
      zoomReset.setAttribute('aria-label', `${labels('resetZoom')} (${percent})`)
      zoomOut.disabled = current.scale <= ZOOM_MIN
      zoomIn.disabled = current.scale >= ZOOM_MAX
    },
  })
  zoomOut.setAttribute('aria-label', t('zoomOut'))
  zoomReset.setAttribute('aria-label', t('resetZoom'))
  zoomIn.setAttribute('aria-label', t('zoomIn'))

  function closeLightbox() {
    lightboxClose?.()
    lightboxClose = undefined
  }

  function setMode(next) {
    mode = next
    const sourceMode = mode === 'source'
    toggle.textContent = sourceMode ? labels('preview') : labels('source')
    toggle.setAttribute('aria-pressed', String(sourceMode))
    sourceView.hidden = !sourceMode
    canvas.hidden = sourceMode || state !== 'ready'
    status.hidden = state === 'ready' || (sourceMode && state !== 'error')
    zoomControls.hidden = state !== 'ready' || sourceMode
    expand.hidden = state !== 'ready' || sourceMode
  }

  function fail() {
    if (destroyed) return
    state = 'error'
    closeLightbox()
    toggle.hidden = true
    status.textContent = labels('error')
    status.hidden = false
    canvas.hidden = true
    sourceView.hidden = false
    zoomControls.hidden = true
    expand.hidden = true
  }

  function markReady() {
    if (destroyed) return
    state = 'ready'
    image.hidden = false
    status.hidden = true
    canvas.hidden = mode === 'source'
    zoomControls.hidden = mode === 'source'
    expand.hidden = mode === 'source'
  }

  async function start() {
    if (destroyed || state !== 'loading' || renderController !== undefined) return
    const palette = readPalette()
    renderController = new AbortController()
    status.textContent = labels('loading')
    status.hidden = false
    try {
      const url = await renderMermaid(source, { signal: renderController.signal, palette })
      if (destroyed || renderController.signal.aborted) return
      imageUrl = url
      image.onload = markReady
      image.onerror = fail
      image.alt = labels('diagram')
      image.src = url
    } catch {
      if (!destroyed && !renderController.signal.aborted) fail()
    }
  }

  toggle.addEventListener('click', () => {
    if (state === 'error') return
    setMode(mode === 'preview' ? 'source' : 'preview')
  })

  expand.addEventListener('click', () => {
    if (state !== 'ready' || imageUrl === undefined) return
    closeLightbox()
    lightboxClose = openMermaidLightbox({
      imageUrl,
      imageAlt: labels('diagram'),
      t: labels,
      returnFocus: expand,
    }).close
  })

  zoomOut.addEventListener('click', () => zoom.zoomOut())
  zoomIn.addEventListener('click', () => zoom.zoomIn())
  zoomReset.addEventListener('click', () => zoom.reset())

  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(source).then(() => {
      if (destroyed) return
      copy.textContent = labels('copied')
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        if (!destroyed) copy.textContent = labels('copy')
      }, 1200)
    }).catch(() => { /* Clipboard permission denial leaves the label unchanged. */ })
  })

  function applyLabels(next) {
    labels = next
    card.setAttribute('aria-label', labels('diagram'))
    viewport.setAttribute('aria-label', labels('diagram'))
    viewport.title = labels('zoomHint')
    image.alt = labels('diagram')
    copy.textContent = labels('copy')
    expand.textContent = labels('open')
    zoomOut.setAttribute('aria-label', labels('zoomOut'))
    zoomReset.setAttribute('aria-label', `${labels('resetZoom')} (${zoomPercent(zoom.getScale())})`)
    zoomIn.setAttribute('aria-label', labels('zoomIn'))
    if (state === 'error') status.textContent = labels('error')
    else if (state === 'loading') status.textContent = labels('loading')
    if (state !== 'error') setMode(mode)
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    closeLightbox()
    renderController?.abort()
    viewportObserver?.disconnect()
    zoom.destroy()
    clearTimeout(copiedTimer)
    card.remove()
  }

  applyLabels(t)
  setMode('preview')

  if (typeof IntersectionObserver === 'function') {
    viewportObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        viewportObserver?.disconnect()
        viewportObserver = undefined
        void start()
      }
    }, { rootMargin: '200px 0px' })
    viewportObserver.observe(card)
  } else {
    void start()
  }

  return {
    element: card,
    destroy,
    updateLabels: applyLabels,
  }
}
