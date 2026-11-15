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
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'));
  assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'));
  assert.equal(manifest.dependencies['@deepseek-ai/schemastery'], '3.18.5');
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
    assert.equal(dict.sleepControl.nav, locale === 'zh' ? '防睡眠' : 'Sleep Control');
    assert.equal(typeof dict.sleepControl.label, 'string');
    assert.equal(typeof dict.sleepControl.waiting, 'string');
    assert.equal(typeof dict.sleepControl.cancelled, 'string');
    assert.match(dict.sleepControl.caffeinateHelp, /caffeinate -s/);
    assert.match(dict.sleepControl.fullSleepHelp, /pmset/);
    assert.equal(typeof dict.sleepControl.warning, 'string');
  }
});

test('the Host intentionally registers no model-facing tool', async () => {
  const host = await readFile(new URL('index.js', root), 'utf8');
  assert.doesNotMatch(host, /ctx\.tools\.register/);
  assert.match(host, /inject = \['webServer', 'agents'\]/);
});

test('session caffeinate preference is volatile and defaults to off', async () => {
  const { Config, isCaffeinateEnabled } = await import('../index.js');
  const value = Config({});
  assert.equal(isCaffeinateEnabled(value), false);
  assert.equal(Config.dict.caffeinateDuringSessions.meta.volatile, true);
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  assert.match(patch, /caffeinateDuringSessions: false/);
});
