import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertMermaidSource, assertSafeMermaidDiagram, createSerialQueue, MAX_SOURCE_CHARS,
} from '../src/client/runtime-core.js'

test('runs tasks serially and recovers after failure', async () => {
  const enqueue = createSerialQueue()
  const order = []
  const first = enqueue(async () => {
    order.push('first:start')
    await new Promise(resolve => setTimeout(resolve, 15))
    order.push('first:end')
    return 1
  })
  const second = enqueue(async () => {
    order.push('second')
    return 2
  })
  assert.deepEqual(await Promise.all([first, second]), [1, 2])
  assert.deepEqual(order, ['first:start', 'first:end', 'second'])

  await assert.rejects(enqueue(async () => { throw new Error('boom') }), /boom/)
  assert.equal(await enqueue(async () => 3), 3)
})

test('validates source size and emptiness', () => {
  assert.throws(() => assertMermaidSource(''), /empty/)
  assert.throws(() => assertMermaidSource('x'.repeat(MAX_SOURCE_CHARS + 1)), /large/)
  assert.doesNotThrow(() => assertMermaidSource('flowchart LR\nA-->B'))
})

test('rejects flowchart image nodes before layout', () => {
  const diagram = {
    type: 'flowchart-v2',
    db: { getVertices: () => new Map([['A', { id: 'A' }], ['B', { id: 'B', img: 'https://example.test/x.png' }]]) },
  }
  assert.throws(() => assertSafeMermaidDiagram(diagram), /image nodes/)
})

test('accepts a flowchart without image nodes', () => {
  const diagram = {
    type: 'flowchart-v2',
    db: { getVertices: () => new Map([['A', { id: 'A' }]]) },
  }
  assert.doesNotThrow(() => assertSafeMermaidDiagram(diagram))
})

test('fails closed when flowchart nodes cannot be inspected', () => {
  assert.throws(() => assertSafeMermaidDiagram({ type: 'flowchart', db: {} }), /inspect/)
  assert.throws(() => assertSafeMermaidDiagram({ type: 'flowchart' }), /inspect/)
})

test('does not inspect non-flowchart diagram types', () => {
  assert.doesNotThrow(() => assertSafeMermaidDiagram({ type: 'sequence' }))
})
