import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('manifest exposes the Host, Client, locales and original icon', async () => {
  const manifest = await readJson('package.json');
  assert.equal(manifest.name, 'dsh-plugin-sleep-control');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'));
  for (const path of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md']) {
    assert.ok(manifest.files.includes(path), `${path} is packaged`);
    assert.ok((await stat(new URL(path, root))).isFile(), `${path} exists`);
  }
  assert.ok(manifest.files.includes('src/'));
  const icon = await readFile(new URL('icon.svg', root));
  assert.ok(icon.length < 256 * 1024);
  assert.match(icon.toString('utf8'), /^<svg[\s>]/);
});

test('English and Chinese metadata describe the delivered capability', async () => {
  for (const locale of ['en', 'zh']) {
    const dict = await readJson(`locale/${locale}.json`);
    assert.equal(typeof dict.meta.title, 'string');
    assert.ok(dict.meta.title.length > 0);
    assert.match(dict.meta.description, /macOS/);
    assert.equal(typeof dict.sleepControl.label, 'string');
    assert.equal(typeof dict.sleepControl.waiting, 'string');
    assert.equal(typeof dict.sleepControl.cancelled, 'string');
  }
});

test('the Host intentionally registers no model-facing tool', async () => {
  const host = await readFile(new URL('index.js', root), 'utf8');
  assert.doesNotMatch(host, /ctx\.tools\.register/);
  assert.match(host, /inject = \['webServer'\]/);
});
