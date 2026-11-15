import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/**
 * Build `lib/client.js` as a DSH client module.
 *
 * Mermaid and mdast are bundled into the artifact so the installed plugin has
 * no runtime network dependency. React stays external and is supplied by the
 * Harness browser module table.
 *
 * Usage:
 *   node scripts/build-client.mjs
 *   node scripts/build-client.mjs --check
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'lib/client.js')

const result = await build({
  absWorkingDir: ROOT,
  entryPoints: ['src/client/index.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120'],
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  minify: true,
  logLevel: 'warning',
})

const js = result.outputFiles.find(file => file.path.endsWith('.js') || file.path === '<stdout>')
if (js === undefined) throw new Error('esbuild produced no JavaScript output')

const bundle = [
  'window.__ModuleLoader__.load({',
  "  id: 'dsh-plugin-mermaid',",
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  js.text,
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n')

const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''

if (process.argv.includes('--check')) {
  if (current !== bundle) {
    console.error('lib/client.js is out of date; run: npm run build')
    process.exit(1)
  }
  console.log('lib/client.js matches the client sources')
} else if (current === bundle) {
  console.log('lib/client.js already up to date')
} else {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, bundle)
  console.log(`lib/client.js written (${bundle.length} bytes)`)
}
