/**
 * Local Mermaid runtime.
 *
 * The bundle is generated with Mermaid pinned and inlined: dialog content is
 * never sent to a remote renderer. A single queue serializes Mermaid's global
 * initialization/render state, and generated SVG is exposed only as an inert
 * image data URL.
 */

import mermaidImport from 'mermaid'
import {
  assertMermaidSource, assertSafeMermaidDiagram, createSerialQueue,
} from './runtime-core.js'

const mermaid = mermaidImport?.default ?? mermaidImport
const enqueue = createSerialQueue()
let nextDiagramId = 0

const SURFACE_FALLBACK = '#ffffff'
const TEXT_FALLBACK = '#1f2328'

function isDarkColor(value) {
  const normalized = String(value).trim().toLowerCase()
  let red
  let green
  let blue
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1)
    if (hex.length === 3) {
      red = Number.parseInt(hex[0] + hex[0], 16)
      green = Number.parseInt(hex[1] + hex[1], 16)
      blue = Number.parseInt(hex[2] + hex[2], 16)
    } else if (hex.length >= 6) {
      red = Number.parseInt(hex.slice(0, 2), 16)
      green = Number.parseInt(hex.slice(2, 4), 16)
      blue = Number.parseInt(hex.slice(4, 6), 16)
    }
  } else {
    const match = /rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i.exec(normalized)
    if (match !== null) {
      red = Number(match[1])
      green = Number(match[2])
      blue = Number(match[3])
    }
  }
  if (![red, green, blue].every(Number.isFinite)) return false
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance < 0.45
}

/** @param {string} name @param {string} fallback */
function readToken(name, fallback) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/**
 * Read the active Harness palette. The values are concrete colors because an
 * SVG loaded through an image URL cannot inherit page CSS variables.
 *
 * @returns {{ background: string, surface: string, text: string, border: string, line: string, dark: boolean }}
 */
export function readPalette() {
  const background = readToken('--dsw-alias-bg-base', SURFACE_FALLBACK)
  const surface = readToken('--dsw-alias-bg-layer-2', background)
  const text = readToken('--dsw-alias-label-primary', TEXT_FALLBACK)
  const border = readToken('--dsw-alias-border-l1', text)
  const line = readToken('--dsw-alias-label-secondary', text)
  return { background, surface, text, border, line, dark: isDarkColor(background) }
}

/** @param {ReturnType<typeof readPalette>} palette */
export function paletteKey(palette) {
  return JSON.stringify(palette)
}

/** @param {ReturnType<typeof readPalette>} palette */
function initialize(palette) {
  mermaid.initialize({
    theme: 'base',
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 64 * 1024,
    maxEdges: 1000,
    themeVariables: {
      darkMode: palette.dark,
      background: palette.background,
      primaryColor: palette.surface,
      primaryTextColor: palette.text,
      primaryBorderColor: palette.border,
      secondaryColor: palette.surface,
      tertiaryColor: palette.surface,
      lineColor: palette.line,
      textColor: palette.text,
      actorBkg: palette.surface,
      actorBorder: palette.border,
      actorTextColor: palette.text,
      actorLineColor: palette.border,
      signalColor: palette.line,
      signalTextColor: palette.text,
      labelBoxBkgColor: palette.surface,
      labelTextColor: palette.text,
      edgeLabelBackground: palette.background,
    },
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    // These settings cannot be overridden by source-level %%{init}%% blocks.
    secure: [
      'secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
      'suppressErrorRendering', 'theme', 'themeVariables', 'themeCSS',
      'htmlLabels', 'flowchart',
    ],
  })
}

async function renderOne(source, signal, palette) {
  assertMermaidSource(source)
  signal?.throwIfAborted()
  initialize(palette)

  // Parsing here gives us the DB before layout. Mermaid image nodes can issue
  // network requests during layout, before the generated SVG is image-isolated.
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(source)
  signal?.throwIfAborted()
  assertSafeMermaidDiagram(diagram)

  const stage = document.createElement('div')
  stage.setAttribute('aria-hidden', 'true')
  stage.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;'
  document.body.append(stage)
  try {
    const { svg } = await mermaid.render(`dsh-mermaid-${nextDiagramId++}`, source, stage)
    signal?.throwIfAborted()

    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
    const viewBox = root.getAttribute('viewBox')
    if (viewBox !== null) {
      const parts = viewBox.trim().split(/\s+/)
      if (parts.length === 4) {
        root.setAttribute('width', parts[2])
        root.setAttribute('height', parts[3])
      }
    }
    const serialized = new XMLSerializer().serializeToString(root)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`
  } finally {
    stage.remove()
  }
}

/**
 * Render complete Mermaid source as an inert SVG image URL.
 *
 * @param {string} source
 * @param {{ signal?: AbortSignal, palette: ReturnType<typeof readPalette> }} options
 * @returns {Promise<string>}
 */
export function renderMermaid(source, { signal, palette } = {}) {
  return enqueue(() => renderOne(source, signal, palette ?? readPalette()))
}
