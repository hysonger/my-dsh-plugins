import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAssistantCodeFences, extractCodeFences, isMermaidLanguage,
  normalizeFenceSource, normalizeLanguage,
} from '../src/client/fences.js'

test('normalizes fence languages and Mermaid aliases', () => {
  assert.equal(normalizeLanguage('Mermaid'), 'mermaid')
  assert.equal(normalizeLanguage('mmd title="x"'), 'mmd')
  assert.equal(normalizeLanguage(undefined), undefined)
  assert.equal(isMermaidLanguage('MERMAID'), true)
  assert.equal(isMermaidLanguage('mmd'), true)
  assert.equal(isMermaidLanguage('javascript'), false)
})

test('normalizes CRLF and one terminating newline', () => {
  assert.equal(normalizeFenceSource('a\r\nb\r\n'), 'a\nb')
  assert.equal(normalizeFenceSource('a\n\n'), 'a\n')
})

test('extracts Mermaid from ordinary and nested Markdown', () => {
  const markdown = [
    '# Diagram',
    '',
    '```mermaid',
    'flowchart LR',
    '  A["one"] --> B["two"]',
    '```',
    '',
    '> ```mmd',
    '> sequenceDiagram',
    '>   A->>B: hi',
    '> ```',
    '',
    '- item',
    '',
    '  ```Mermaid',
    '  graph TD',
    '    X --> Y',
    '  ```',
  ].join('\n')
  const fences = extractCodeFences(markdown)
  assert.equal(fences.length, 3)
  assert.equal(fences[0].lang, 'mermaid')
  assert.equal(fences[1].lang, 'mmd')
  assert.equal(fences[2].lang, 'mermaid')
  assert.match(fences[0].value, /flowchart LR/)
  assert.match(fences[1].value, /sequenceDiagram/)
})

test('leaves non-code and non-Mermaid fences alone', () => {
  const fences = extractCodeFences([
    'Text',
    '',
    '```js',
    'console.log(1)',
    '```',
    '',
    '````markdown',
    '```mermaid',
    'inside a code block',
    '```',
    '````',
  ].join('\n'))
  assert.equal(fences.length, 2)
  assert.equal(fences[0].lang, 'js')
  assert.equal(fences[1].lang, 'markdown')
  assert.match(fences[1].value, /```mermaid/)
})

test('extracts only text and reasoning assistant blocks', () => {
  const fences = extractAssistantCodeFences([
    { kind: 'text', text: '```mermaid\nflowchart LR\nA-->B\n```' },
    { kind: 'reasoning', text: '```mmd\ngraph TD\nA-->B\n```' },
    { kind: 'tool-call', text: '```mermaid\nnot markdown\n```' },
    { kind: 'image' },
  ])
  assert.deepEqual(fences.map(fence => fence.lang), ['mermaid', 'mmd'])
})

test('handles empty input', () => {
  assert.deepEqual(extractCodeFences(''), [])
  assert.deepEqual(extractAssistantCodeFences([]), [])
})
