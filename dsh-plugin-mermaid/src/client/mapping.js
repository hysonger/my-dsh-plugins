/**
 * Pair raw Mermaid fences with the code blocks DSH rendered.
 *
 * The current DSH CodeBlock deliberately omits an unknown language from the
 * DOM. We therefore match on the exact source text, never on a diagram keyword
 * heuristic. A count mismatch or duplicate-language ambiguity skips the group,
 * leaving the official source block untouched.
 */

import { isMermaidLanguage, normalizeFenceSource } from './fences.js'

/**
 * @typedef {{ lang: string | undefined, value: string }} RawFence
 * @typedef {{ source: string, element: HTMLElement }} DomFence
 */

/** @param {Iterable<RawFence>} raw @param {Iterable<DomFence>} dom */
function groupBySource(raw, dom) {
  /** @type {Map<string, { raws: RawFence[], doms: DomFence[] }>} */
  const groups = new Map()
  for (const fence of raw) {
    const source = normalizeFenceSource(fence.value)
    if (source.trim() === '') continue
    let group = groups.get(source)
    if (group === undefined) {
      group = { raws: [], doms: [] }
      groups.set(source, group)
    }
    group.raws.push(fence)
  }
  for (const block of dom) {
    const source = normalizeFenceSource(block.source)
    if (source.trim() === '') continue
    let group = groups.get(source)
    if (group === undefined) {
      group = { raws: [], doms: [] }
      groups.set(source, group)
    }
    group.doms.push(block)
  }
  return groups
}

/**
 * @param {readonly RawFence[]} rawFences all code fences in the Turn's assistant Markdown
 * @param {readonly DomFence[]} domFences rendered assistant code blocks in the Turn
 * @returns {{
 *   pairs: { raw: RawFence, dom: DomFence }[],
 *   skipped: { source: string, raws: number, doms: number }[],
 * }}
 */
export function pairMermaidFences(rawFences, domFences) {
  const pairs = []
  const skipped = []
  for (const [source, group] of groupBySource(rawFences, domFences)) {
    const mermaidCount = group.raws.filter(fence => isMermaidLanguage(fence.lang)).length
    if (mermaidCount === 0) continue

    // Identical source under different fence languages cannot be assigned to
    // one DOM code block safely. A lone Mermaid fence is fine; a mixed group is
    // left to the official source renderer.
    if (group.raws.length > 1 && mermaidCount !== group.raws.length) {
      skipped.push({ source, raws: group.raws.length, doms: group.doms.length })
      continue
    }

    // Every rendered code block in the group must correspond to exactly one
    // raw fence. Otherwise ordering cannot establish which DOM block is the
    // Mermaid one, so fail closed for this source.
    if (group.raws.length !== group.doms.length) {
      skipped.push({ source, raws: group.raws.length, doms: group.doms.length })
      continue
    }

    for (let index = 0; index < group.raws.length; index += 1) {
      const raw = group.raws[index]
      if (!isMermaidLanguage(raw.lang)) continue
      pairs.push({ raw, dom: group.doms[index] })
    }
  }
  return { pairs, skipped }
}

/**
 * Read the rendered code text from DSH's stable content hook.
 * @param {HTMLElement} block
 * @returns {string | undefined}
 */
export function renderedCodeSource(block) {
  const pre = block.querySelector('[data-code-block-content] pre')
  return typeof pre?.textContent === 'string' ? normalizeFenceSource(pre.textContent) : undefined
}

/**
 * Collect code blocks under the assistant-step wrappers of one Turn.
 *
 * @param {ParentNode} scope
 * @param {number} turnNumber
 * @returns {DomFence[]}
 */
export function collectAssistantCodeBlocks(scope, turnNumber) {
  const selector = `[data-chat-turn="${String(turnNumber)}"][data-chat-flow-kind="assistant-step"]`
  const wrappers = []
  if (scope instanceof Element && scope.matches(selector)) wrappers.push(scope)
  if (scope.querySelectorAll !== undefined) {
    wrappers.push(...scope.querySelectorAll(selector))
  }
  const out = []
  for (const wrapper of wrappers) {
    for (const block of wrapper.querySelectorAll('.md-code-block')) {
      const source = renderedCodeSource(block)
      if (source !== undefined) out.push({ source, element: block })
    }
  }
  return out
}
