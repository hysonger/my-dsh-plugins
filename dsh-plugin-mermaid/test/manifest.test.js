import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('manifest is a DSH bundle with a Client half', () => {
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-chat'))
  assert.equal(pkg.exports['./client'], './lib/client.js')
})

test('patch inserts the expected plugin row', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: mermaid/)
  assert.match(patch, /name: dsh-plugin-mermaid/)
})

test('display resources exist for both languages', () => {
  for (const locale of ['zh', 'en']) {
    const file = join(root, 'locale', `${locale}.json`)
    assert.ok(existsSync(file))
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.ok(parsed.meta.title.length > 0)
    assert.ok(parsed.meta.description.length > 0)
  }
  assert.ok(existsSync(join(root, 'icon.svg')))
})

test('built artifact is a DSH Client module without external chunks', () => {
  const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8')
  assert.match(bundle, /^window\.__ModuleLoader__\.load\(\{/)
  assert.match(bundle, /id: 'dsh-plugin-mermaid'/)
  assert.match(bundle, /return module\.exports;/)
  assert.equal(bundle.includes('import('), false)
  assert.equal(bundle.includes('https://cdn'), false)
})

