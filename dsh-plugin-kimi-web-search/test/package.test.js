import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('bundle manifest exports runtime and display resources', () => {
  assert.equal(pkg.name, 'dsh-plugin-kimi-web-search');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.exports['.'], './index.js');
  assert.equal(pkg.exports['./client'], './client.js');
  assert.equal(pkg.exports['./icon'], './icon.svg');
  for (const file of [
    'index.js',
    'client.js',
    'src/provider.js',
    'cordis.patch.yml',
    'locale/en.json',
    'locale/zh.json',
    'icon.svg',
    'README.md',
    'docs/RESEARCH.md',
    'THIRD_PARTY_NOTICES.md',
  ]) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} must exist`);
  }
});

test('localized display metadata is meaningful', () => {
  for (const locale of ['en', 'zh']) {
    const data = JSON.parse(readFileSync(new URL(`../locale/${locale}.json`, import.meta.url), 'utf8'));
    assert.match(data.meta.title, /Kimi/);
    assert.ok(data.meta.description.length > 20);
  }
});

test('linked Host package declares a 0.2.x peer range instead of an exact pin', () => {
  // The runtime gate feeds this spec straight to semver.satisfies(); an exact
  // version such as "0.2.1-rc.5" matches only itself, so every DSH upgrade
  // silently drops the bundle from the profile. Keep a range.
  const spec = pkg.peerDependencies['@deepseek-ai/dsh-web'];
  assert.match(spec, /^\^0\.2\./, `peer spec ${spec} must stay a 0.2.x caret range`);
  assert.equal(pkg.dependencies?.['@deepseek-ai/dsh-web'], undefined);
});

test('client User-Agent tracks the package version', async () => {
  const { USER_AGENT } = await import('../src/client.js');
  assert.equal(USER_AGENT, `dsh-plugin-kimi-web-search/${pkg.version}`);
});

test('bundle registers Kimi without changing DeepSeek provider selection', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /id: kimi-web-search/);
  assert.match(patch, /name: dsh-plugin-kimi-web-search/);
  assert.equal(patch.includes('searchProvider:'), false);
  assert.equal(patch.includes('deepseek-search-api'), false);
});

test('icon is nontrivial SVG artwork', () => {
  const icon = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8');
  assert.match(icon, /^<svg/);
  assert.match(icon, /<title/);
  assert.ok(Buffer.byteLength(icon) < 256 * 1024);
});
