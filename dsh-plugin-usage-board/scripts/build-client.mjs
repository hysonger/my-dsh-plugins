/**
 * Regenerate `lib/client.js` from the browser-half sources.
 *
 * This package deliberately ships no bundler: `lib/client.js` is a
 * hand-assembled DSH client-module combo script whose factory embeds five
 * sources byte for byte:
 *
 *   - `src/client/styles.css`      inside the `PANEL_CSS` template literal
 *   - `src/client/composer.css`    inside the `COMPOSER_CSS` template literal
 *   - `src/client/protocol-copy.js` between its `//#region` markers
 *   - `src/client/panel.js`         between its `//#region` markers
 *   - `src/client/composer.js`      between its `//#region` markers
 *
 * `test/client-bundle.test.js` already fails when the embedding drifts, but
 * fixing that by hand is where mistakes come from. This script performs the
 * replacement in place and refuses to write when an assumption breaks.
 *
 * Usage:
 *   node scripts/build-client.mjs           # rewrite lib/client.js
 *   node scripts/build-client.mjs --check   # exit 1 when a rewrite is needed
 *
 * @module dsh-plugin-usage-board/scripts/build-client
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'lib/client.js');

/** The embedded stylesheet literals, in bundle order. */
const CSS_BLOCKS = [
  { prefix: '    const PANEL_CSS = `', source: 'src/client/styles.css' },
  { prefix: '    const COMPOSER_CSS = `', source: 'src/client/composer.css' },
];

/** The embedded code regions, in bundle order. */
const REGIONS = [
  { marker: '    //#region src/client/protocol-copy.js — embedded verbatim (generated)', source: 'src/client/protocol-copy.js' },
  { marker: '    //#region src/client/panel.js — embedded verbatim', source: 'src/client/panel.js' },
  { marker: '    //#region src/client/composer.js — embedded verbatim', source: 'src/client/composer.js' },
];

const CSS_TERMINATOR = '`;';

/**
 * Replace one marked region's body with `body`.
 *
 * @param {string[]} lines Bundle lines, mutated in place.
 * @param {number} start Index of the line after the opening marker.
 * @param {number} end Index of the closing `//#endregion` line.
 * @param {string} body Replacement text, must end with a newline.
 * @returns {void}
 */
function replaceRegion(lines, start, end, body) {
  const replacement = body.split('\n');
  // A trailing newline in `body` yields one empty trailing element that belongs
  // to the `//#endregion` line's own break, not to a line of its own.
  if (replacement[replacement.length - 1] === '') replacement.pop();
  lines.splice(start, end - start, ...replacement);
}

/**
 * Rewrite the bundle text.
 *
 * @param {string} bundle
 * @returns {string}
 */
function rebuild(bundle) {
  const lines = bundle.split('\n');

  // CSS first: it is inside a template literal, so it needs escaping rules the
  // other regions do not.
  for (const block of CSS_BLOCKS) {
    const cssOpen = lines.findIndex((line) => line.startsWith(block.prefix));
    if (cssOpen === -1) throw new Error(`lib/client.js: the template literal starting ${JSON.stringify(block.prefix)} moved or was renamed`);
    const cssClose = lines.findIndex((line, index) => index > cssOpen && line === CSS_TERMINATOR);
    if (cssClose === -1) throw new Error(`lib/client.js: the template literal starting ${JSON.stringify(block.prefix)} is not terminated by \`;`);
    const css = readFileSync(join(ROOT, block.source), 'utf8');
    if (css.includes('`') || css.includes('${')) {
      throw new Error(`${block.source} contains a backtick or \${, which cannot be embedded unescaped`);
    }
    lines.splice(cssOpen, cssClose - cssOpen + 1, `${block.prefix}${css}${CSS_TERMINATOR}`);
  }

  for (const region of REGIONS) {
    const open = lines.findIndex((line) => line === region.marker);
    if (open === -1) throw new Error(`lib/client.js: region marker not found: ${region.marker}`);
    const close = lines.findIndex((line, index) => index > open && line === '    //#endregion');
    if (close === -1) throw new Error(`lib/client.js: region is not closed: ${region.marker}`);
    const body = readFileSync(join(ROOT, region.source), 'utf8');
    replaceRegion(lines, open + 1, close, body);
  }

  return lines.join('\n');
}

const current = readFileSync(BUNDLE, 'utf8');
const next = rebuild(current);

if (process.argv.includes('--check')) {
  if (current !== next) {
    console.error('lib/client.js is out of date with the client sources; run: node scripts/build-client.mjs');
    process.exit(1);
  }
  console.log('lib/client.js matches the client sources');
} else if (current === next) {
  console.log('lib/client.js already matches the client sources');
} else {
  writeFileSync(BUNDLE, next);
  console.log(`lib/client.js rewritten (${current.length} -> ${next.length} bytes)`);
}
