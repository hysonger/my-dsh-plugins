import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const macos = join(root, 'macos');
const workflowDir = join(macos, 'quick-action', 'Open in DSH.workflow', 'Contents');

/** plutil -lint a plist file; throws with Apple's message on malformed input. */
function lintPlist(path) {
  return execFileSync('/usr/bin/plutil', ['-lint', path], { encoding: 'utf8' });
}

test('Quick Action Info.plist is a valid plist with the Finder service declared', () => {
  const path = join(workflowDir, 'Info.plist');
  assert.match(lintPlist(path), /OK/);
  const text = readFileSync(path, 'utf8');
  assert.match(text, /<string>runWorkflowAsService<\/string>/);
  assert.match(text, /<string>com\.apple\.finder<\/string>/);
  assert.match(text, /在 DeepSeek Harness 中打开/);
  // Accepts both folders (open directly) and files (open parent dir).
  assert.match(text, /<string>public\.item<\/string>/);
  assert.match(text, /<string>public\.folder<\/string>/);
});

test('Quick Action document.wflow is valid and carries the bin placeholder', () => {
  const path = join(workflowDir, 'document.wflow');
  assert.match(lintPlist(path), /OK/);
  const text = readFileSync(path, 'utf8');
  assert.match(text, /__DSH_OPEN_BIN__/, 'template must keep the install-time placeholder');
  assert.match(text, /Run Shell Script\.action/);
  // inputMethod = 1: receive the Finder selection as arguments ("$@").
  assert.match(text, /<key>inputMethod<\/key>\s*<integer>1<\/integer>/);
});

test('shell scripts pass bash -n', () => {
  for (const script of ['install-quick-action.sh', 'uninstall.sh', 'app/build-app.sh']) {
    execFileSync('/bin/bash', ['-n', join(macos, script)]);
  }
});

test('AppleScript source has both handlers and the bin placeholder', () => {
  const text = readFileSync(join(macos, 'app', 'dsh-open.applescript'), 'utf8');
  assert.match(text, /^on run$/m);
  assert.match(text, /^on open droppedItems$/m);
  assert.match(text, /__DSH_OPEN_BIN__/);
});

test('templates reference no absolute user paths', () => {
  // 模板必须可移植：真实路径由安装/构建脚本注入。
  for (const file of ['Info.plist', 'document.wflow']) {
    const text = readFileSync(join(workflowDir, file), 'utf8');
    assert.doesNotMatch(text, /\/Users\//);
  }
});

test('icon set is committed with every required size', () => {
  const iconset = join(macos, 'app', 'icons', 'DSH Open.iconset');
  for (const points of [16, 32, 128, 256, 512]) {
    for (const suffix of ['', '@2x']) {
      const file = join(iconset, `icon_${points}x${points}${suffix}.png`);
      assert.ok(existsSync(file), `missing ${file}`);
    }
  }
  assert.ok(existsSync(join(macos, 'app', 'icons', 'official-source.png')));
});

test('icon generator defines the documented variants', () => {
  const text = readFileSync(join(macos, 'app', 'make-icons.py'), 'utf8');
  for (const variant of ['slate', 'light', 'blue']) {
    assert.match(text, new RegExp(`"${variant}":`));
  }
  // 默认变体（README 与 build-app.sh 约定一致）。
  assert.match(text, /len\(argv\) > 1 else "slate"/);
});

test('build-app.sh consumes the committed iconset', () => {
  const text = readFileSync(join(macos, 'app', 'build-app.sh'), 'utf8');
  assert.match(text, /DSH Open\.iconset/);
  assert.match(text, /iconutil -c icns/);
  assert.match(text, /DSH_ICON/);
});
