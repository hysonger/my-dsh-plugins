/**
 * Client half of dsh-plugin-mermaid.
 *
 * No Host RPC or remote renderer is used. The plugin watches only completed
 * assistant Turns through the official turnTail slot, maps raw Mermaid fences
 * to the exact code blocks DSH rendered, and replaces their presentation with
 * an in-place card. Any mismatch leaves the official source untouched.
 */

import * as React from 'react'
import cssText from './styles.css'
import { createTurnEnhancer } from './enhance.js'

export const inject = ['slots', 'locale', 'theme']

const NS = 'mermaid'

const ZH = {
  diagram: 'Mermaid 图表',
  loading: '正在渲染图表…',
  error: '无法渲染此图表，源码如下。',
  source: '源码',
  preview: '图表',
  copy: '复制',
  copied: '已复制',
  open: '大图',
  close: '关闭',
  zoomIn: '放大',
  zoomOut: '缩小',
  resetZoom: '重置缩放',
  zoomHint: '滚轮或双指缩放，拖动平移，双击复位',
}

const EN = {
  diagram: 'Mermaid diagram',
  loading: 'Rendering diagram…',
  error: 'Unable to render this diagram. Source is shown below.',
  source: 'Source',
  preview: 'Preview',
  copy: 'Copy',
  copied: 'Copied',
  open: 'Large view',
  close: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetZoom: 'Reset zoom',
  zoomHint: 'Scroll or pinch to zoom, drag to pan, double-click to reset',
}

let themeRevision = 0
const themeListeners = new Set()

function subscribeTheme(listener) {
  themeListeners.add(listener)
  return () => themeListeners.delete(listener)
}

function getThemeRevision() {
  return themeRevision
}

function notifyTheme() {
  themeRevision += 1
  for (const listener of [...themeListeners]) listener()
}

/** Compare the only raw data this plugin consumes. */
function sameAssistantData(left, right) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].key !== right[index].key || left[index].blocks !== right[index].blocks) return false
  }
  return true
}

/**
 * Select settled assistant blocks for this Turn in anchor order.
 * @param {any} chat
 * @param {number} turnNumber
 */
function settledAssistantData(chat, turnNumber) {
  const keys = chat?.locations?.getTurn?.(turnNumber) ?? []
  const out = []
  for (const key of keys) {
    const node = chat.nodes?.get?.(key)
    if (node?.kind !== 'assistant-step' || node?.data?.status !== 'settled') continue
    const blocks = node.data.blocks
    if (!Array.isArray(blocks) || blocks.length === 0) continue
    out.push({ key: node.key, blocks })
  }
  return out
}

function MermaidTurnTail({ turn, useChat, t }) {
  const turnNumber = turn.turn
  const assistantData = useChat(
    chat => settledAssistantData(chat, turnNumber),
    sameAssistantData,
  )
  const revision = React.useSyncExternalStore(subscribeTheme, getThemeRevision, getThemeRevision)
  const anchorRef = React.useRef(null)

  React.useEffect(() => {
    const anchor = anchorRef.current
    if (anchor === null) return
    const scope = anchor.closest('[data-conversation-scroll]')
      ?? document.querySelector('[data-conversation-scroll]')
      ?? document.body
    const blocks = assistantData.flatMap(entry => entry.blocks)
    const enhancer = createTurnEnhancer({ scope, turnNumber, blocks, t })
    return () => enhancer.dispose()
  }, [assistantData, revision, t, turnNumber])

  return React.createElement('span', {
    'data-dsh-mermaid-anchor': '',
    hidden: true,
    ref: anchorRef,
  })
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'mermaid: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-plugin-mermaid'
    style.textContent = cssText
    document.head.append(style)
    return () => style.remove()
  }, 'mermaid: styles')
  ctx.effect(() => ctx.on('theme/change', notifyTheme), 'mermaid: theme revision')
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'mermaid-inline',
    order: 30,
    locale: NS,
  }, MermaidTurnTail))
}
