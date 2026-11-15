/**
 * Static checks for the plugin's DISPLAY metadata.
 *
 * DSH's plugin manager and settings read a plugin's title and description from
 * exported locale JSON and its icon from an exported package resource, without
 * activating the plugin. Both are user-visible: without them the inventory row
 * falls back to the raw package name, the English package.json description and
 * the generic artwork — which is exactly what this file prevents from quietly
 * coming back.
 *
 * Run with `node --test test/display-metadata.test.js` (or `npm test`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');
const manifest = JSON.parse(read('package.json'));

/** Largest icon DSH accepts for a plugin. */
const ICON_MAX_BYTES = 256 * 1024;

/**
 * Normalize one package export target: an exports entry may be a bare path or a
 * conditions object with a `default`/`import` leaf.
 * @param {unknown} value
 * @returns {string|null}
 */
function exportedPath(value) {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const leaves = /** @type {Record<string, unknown>} */ (value);
    for (const key of ['default', 'import', 'require']) {
      if (typeof leaves[key] === 'string') return leaves[key];
    }
  }
  return null;
}

test('the manifest exports the display resources DSH reads before activation', () => {
  const exportsField = manifest.exports ?? {};
  assert.equal(exportedPath(exportsField['./icon']), './icon.svg');
  assert.equal(exportedPath(exportsField['./locale/*.json']), './locale/*.json');

  // Publishable bundles also need the resources in `files`; a linked local
  // install bypasses `files`, so this is what keeps a packed install honest.
  const files = manifest.files ?? [];
  assert.ok(files.includes('icon.svg'), 'icon.svg must be in package.json files');
  assert.ok(files.includes('locale/*.json'), 'locale JSON must be in package.json files');
});

test('en and zh locale JSON carry a real, localized title and description', () => {
  const expected = [['zh', '用量看板'], ['en', 'Usage Board']];
  for (const [locale, title] of expected) {
    const meta = JSON.parse(read(`locale/${locale}.json`)).meta;
    assert.ok(meta !== null && typeof meta === 'object', `${locale}: meta object missing`);
    assert.equal(meta.title, title, `${locale}: meta.title`);
    assert.equal(typeof meta.description, 'string', `${locale}: meta.description must be a string`);
    assert.ok(
      meta.description.trim().length >= 20,
      `${locale}: meta.description is too thin to explain what the plugin shows`,
    );
  }
  const zh = JSON.parse(read('locale/zh.json')).meta;
  const en = JSON.parse(read('locale/en.json')).meta;
  assert.notEqual(zh.description, en.description, 'the two locales must not ship identical copy');
  assert.match(zh.description, /[\u4e00-\u9fff]/, 'the Chinese description must be Chinese');
});

test('the icon is a self-contained square SVG inside the size cap', () => {
  const svg = read('icon.svg');
  const bytes = statSync(join(ROOT, 'icon.svg')).size;
  assert.ok(bytes > 0 && bytes <= ICON_MAX_BYTES, `icon.svg is ${bytes} bytes (cap ${ICON_MAX_BYTES})`);
  assert.match(svg, /<svg\b/, 'icon.svg must be an SVG document');
  assert.match(svg, /viewBox="0 0 64 64"/, 'the icon is authored on a 64x64 grid');
  assert.match(svg, /role="img"/, 'the icon must declare its role');
  assert.match(svg, /aria-label="[^"]+"/, 'the icon needs an accessible label');
  assert.ok(svg.trimEnd().endsWith('</svg>'), 'the SVG must be complete');

  // DSH renders the file as an image: no scripts, no raster passthrough, and no
  // external fetch may live inside it. The SVG namespace declaration is the
  // one allowed URL.
  assert.ok(!/<script\b/i.test(svg), 'the icon must not carry script');
  assert.ok(!/<image\b/i.test(svg), 'the icon must not embed raster images');
  assert.ok(!/(?:href|src)\s*=/i.test(svg), 'the icon must not reference other resources');
  const withoutNamespace = svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  assert.ok(!/https?:\/\//i.test(withoutNamespace), 'the icon must stay self-contained');
  assert.ok(!/url\(\s*['"]?https?:/i.test(svg), 'the icon must not load external paint servers');
});

test('the reported plugin version matches package.json', () => {
  const host = read('lib/index.js');
  const match = /export const PLUGIN_VERSION = '([^']+)'/.exec(host);
  assert.ok(match !== null, 'lib/index.js must export PLUGIN_VERSION');
  assert.equal(match[1], manifest.version, 'package.json and PLUGIN_VERSION drifted apart');
});
