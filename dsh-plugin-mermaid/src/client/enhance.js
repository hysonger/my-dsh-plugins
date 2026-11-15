/**
 * Reconcile one completed Turn's raw Mermaid fences with its rendered code
 * blocks. Everything here is scoped to that Turn and fails closed.
 */

import { extractAssistantCodeFences } from './fences.js'
import { collectAssistantCodeBlocks, pairMermaidFences } from './mapping.js'
import { createMermaidCard } from './card.js'

/**
 * @param {{
 *   scope: ParentNode,
 *   turnNumber: number,
 *   blocks: readonly any[],
 *   t: (key: string) => string,
 * }} options
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function createTurnEnhancer({ scope, turnNumber, blocks, t }) {
  /** @type {Map<HTMLElement, { card: ReturnType<typeof createMermaidCard>, originalDisplay: string, source: string }>} */
  const records = new Map()
  let disposed = false
  let scheduled = false

  function destroyRecord(block, record) {
    record.card.destroy()
    if (block.isConnected) block.style.display = record.originalDisplay
    records.delete(block)
  }

  function sync() {
    scheduled = false
    if (disposed) return

    const domBlocks = collectAssistantCodeBlocks(scope, turnNumber)
    const rawFences = extractAssistantCodeFences(blocks)
    const { pairs } = pairMermaidFences(rawFences, domBlocks)
    const wanted = new Set(pairs.map(pair => pair.dom.element))

    for (const [block, record] of [...records]) {
      if (!wanted.has(block) || !block.isConnected) destroyRecord(block, record)
    }

    for (const pair of pairs) {
      const block = pair.dom.element
      const existing = records.get(block)
      if (existing !== undefined) {
        if (existing.source !== pair.raw.value) {
          // A React replacement reused the element but changed its source.
          destroyRecord(block, existing)
        } else {
          continue
        }
      }

      const originalDisplay = block.style.display
      const card = createMermaidCard({ source: pair.raw.value, t })
      block.style.display = 'none'
      block.insertAdjacentElement('afterend', card.element)
      records.set(block, { card, originalDisplay, source: pair.raw.value })
    }
  }

  function schedule() {
    if (disposed || scheduled) return
    scheduled = true
    queueMicrotask(sync)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(scope, { childList: true, subtree: true })
  sync()

  return {
    sync,
    dispose() {
      if (disposed) return
      disposed = true
      observer.disconnect()
      for (const [block, record] of records) {
        record.card.destroy()
        if (block.isConnected) block.style.display = record.originalDisplay
      }
      records.clear()
    },
  }
}
