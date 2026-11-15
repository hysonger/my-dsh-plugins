import test from 'node:test'
import assert from 'node:assert/strict'
import { pairMermaidFences } from '../src/client/mapping.js'

const mermaid = value => ({ lang: 'mermaid', value })
const mmd = value => ({ lang: 'mmd', value })
const code = value => ({ lang: 'js', value })
const dom = (source, id) => ({ source, element: { id } })

test('pairs unique source while leaving other code blocks alone', () => {
  const result = pairMermaidFences(
    [code('const x = 1'), mermaid('flowchart LR\nA-->B')],
    [dom('const x = 1', 'code'), dom('flowchart LR\nA-->B', 'chart')],
  )
  assert.equal(result.pairs.length, 1)
  assert.equal(result.pairs[0].dom.element.id, 'chart')
  assert.deepEqual(result.skipped, [])
})

test('pairs duplicate Mermaid sources in order', () => {
  const source = 'flowchart LR\nA-->B'
  const result = pairMermaidFences(
    [mermaid(source), mmd(source)],
    [dom(source, 'first'), dom(source, 'second')],
  )
  assert.deepEqual(result.pairs.map(pair => pair.dom.element.id), ['first', 'second'])
})

test('fails closed when counts differ', () => {
  const source = 'flowchart LR\nA-->B'
  const result = pairMermaidFences(
    [mermaid(source)],
    [dom(source, 'first'), dom(source, 'second')],
  )
  assert.deepEqual(result.pairs, [])
  assert.equal(result.skipped.length, 1)
})

test('fails closed when the same source mixes Mermaid and another language', () => {
  const source = 'flowchart LR\nA-->B'
  const result = pairMermaidFences(
    [mermaid(source), code(source)],
    [dom(source, 'first'), dom(source, 'second')],
  )
  assert.deepEqual(result.pairs, [])
  assert.equal(result.skipped.length, 1)
})

test('same-source normal code only is ignored', () => {
  const result = pairMermaidFences(
    [code('flowchart LR\nA-->B')],
    [dom('flowchart LR\nA-->B', 'code')],
  )
  assert.deepEqual(result.pairs, [])
})

test('normalizes line endings when pairing', () => {
  const result = pairMermaidFences(
    [mermaid('graph TD\r\nA-->B\r\n')],
    [dom('graph TD\nA-->B', 'chart')],
  )
  assert.equal(result.pairs.length, 1)
})
