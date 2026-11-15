/**
 * Markdown fence extraction shared by the browser bundle and unit tests.
 *
 * DSH does not retain the source language of an unknown fence in the rendered
 * DOM, so the plugin pairs raw assistant Markdown with the code blocks that
 * DSH rendered. This module owns only the Markdown side of that pairing.
 */

import { fromMarkdown } from 'mdast-util-from-markdown'

const FENCE_LANGUAGE = /^[\w-]+/

/**
 * Normalize a fence info string the same way DSH's renderer does: the first
 * word is the language hint, and matching is case-insensitive for our purposes.
 *
 * @param {unknown} language
 * @returns {string | undefined}
 */
export function normalizeLanguage(language) {
  if (typeof language !== 'string') return undefined
  const token = FENCE_LANGUAGE.exec(language)?.[0]
  return token === undefined ? undefined : token.toLowerCase()
}

/** @param {unknown} language */
export function isMermaidLanguage(language) {
  const normalized = normalizeLanguage(language)
  return normalized === 'mermaid' || normalized === 'mmd'
}

/**
 * Normalize line endings and the single terminating newline that CodeBlock
 * removes before rendering. A DOM `pre.textContent` read therefore compares
 * byte-for-byte with the parsed fence value.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeFenceSource(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '')
}

/**
 * Walk an mdast tree in document order and collect code nodes.
 * @param {any} node
 * @param {{ lang: string | undefined, value: string }[]} out
 */
function walkCodeNodes(node, out) {
  if (node === null || typeof node !== 'object') return
  if (node.type === 'code') {
    out.push({
      lang: normalizeLanguage(node.lang),
      value: normalizeFenceSource(node.value),
    })
    return
  }
  if (!Array.isArray(node.children)) return
  for (const child of node.children) walkCodeNodes(child, out)
}

/**
 * Extract every fenced/indented code node from one Markdown source.
 * Fences nested in blockquotes or list items are included.
 *
 * @param {string} markdown
 * @returns {{ lang: string | undefined, value: string }[]}
 */
export function extractCodeFences(markdown) {
  if (typeof markdown !== 'string' || markdown === '') return []
  const tree = fromMarkdown(markdown)
  const out = []
  walkCodeNodes(tree, out)
  return out
}

/**
 * Extract raw code fences from the assistant blocks of one Turn.
 * Only text and reasoning blocks are Markdown; tool calls and images are not.
 *
 * @param {readonly { kind?: string, text?: string }[]} blocks
 * @returns {{ lang: string | undefined, value: string }[]}
 */
export function extractAssistantCodeFences(blocks) {
  const out = []
  for (const block of blocks) {
    if (block?.kind !== 'text' && block?.kind !== 'reasoning') continue
    if (typeof block.text !== 'string' || block.text.trim() === '') continue
    out.push(...extractCodeFences(block.text))
  }
  return out
}
