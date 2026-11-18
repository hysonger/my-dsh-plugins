import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

function pluginDirectories() {
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('dsh-plugin-'))
    .map((entry) => entry.name)
    .sort();
}

function parseInsertedEntries(patchContent) {
  const entries = [];
  const lines = patchContent.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const idMatch = /^\s*-\s+id:\s*['"]?([a-z0-9-]+)['"]?(?:\s*#.*)?\s*$/.exec(line);
    if (idMatch) {
      current = { id: idMatch[1], name: undefined };
      entries.push(current);
      continue;
    }
    if (current && current.name === undefined) {
      const nameMatch = /^\s*name:\s*['"]?([^'"#\s]+)['"]?(?:\s*#.*)?\s*$/.exec(line);
      if (nameMatch) current.name = nameMatch[1];
    }
  }
  return entries;
}

test('root package.json declares a valid DSH bundle without build scripts', () => {
  assert.equal(rootPkg.name, 'my-dsh-plugins');
  assert.equal(rootPkg.type, 'module');
  assert.equal(rootPkg.dsh?.manifestVersion, 1);
  assert.ok(Array.isArray(rootPkg.dsh?.bundle?.patch));
  assert.equal(rootPkg.exports?.['./locale/*.json'], './locale/*.json');
  assert.equal(rootPkg.exports?.['./icon'], './icon.svg');
  assert.equal(rootPkg.exports?.['./package.json'], './package.json');

  // Git-hosted packages with prepare/prepublish scripts are blocked by pnpm unless allowBuilds is configured.
  for (const lifecycle of ['prepare', 'prepublish', 'prepublishOnly', 'preinstall', 'install', 'postinstall']) {
    assert.equal(rootPkg.scripts?.[lifecycle], undefined, `root package.json must not define ${lifecycle}`);
  }
});

test('every self-authored plugin directory is wired without duplicate IDs', () => {
  const plugins = pluginDirectories();
  assert.ok(plugins.length >= 7);

  const rootDeps = rootPkg.dependencies ?? {};
  const patchList = rootPkg.dsh.bundle.patch;
  const seenRowIds = new Set();
  const seenPluginNames = new Set();
  const expectedRootDeps = new Set();

  for (const dir of plugins) {
    const pluginPkgPath = join(rootDir, dir, 'package.json');
    assert.ok(existsSync(pluginPkgPath), `${dir}/package.json must exist`);
    const pluginPkg = JSON.parse(readFileSync(pluginPkgPath, 'utf8'));

    assert.equal(
      rootDeps[pluginPkg.name],
      `file:./${dir}`,
      `root dependencies must include ${pluginPkg.name}: file:./${dir}`,
    );
    seenPluginNames.add(pluginPkg.name);
    expectedRootDeps.add(pluginPkg.name);

    const expectedPatchRel = `./${dir}/cordis.patch.yml`;
    assert.ok(patchList.includes(expectedPatchRel), `dsh.bundle.patch must include ${expectedPatchRel}`);

    // pnpm skips transitive dependencies inside file:/link: subpackages on git installs,
    // so runtime dependencies of each plugin must also be hoisted onto root dependencies.
    for (const [depName, depVersion] of Object.entries(pluginPkg.dependencies ?? {})) {
      assert.equal(
        rootDeps[depName],
        depVersion,
        `root dependencies must mirror ${dir} runtime dependency ${depName}@${depVersion}`,
      );
      expectedRootDeps.add(depName);
    }
  }

  // This repository maintains self-authored plugins only: the bundle must not
  // carry a root third-party patch layer, export one, or reference a third-party
  // package from any of its per-plugin patch files.
  assert.equal(patchList.includes('./cordis.patch.yml'), false, 'dsh.bundle.patch must not include a root patch layer');
  assert.equal(existsSync(join(rootDir, 'cordis.patch.yml')), false, 'root cordis.patch.yml must not exist');
  assert.equal(rootPkg.exports?.['./cordis.patch.yml'], undefined, 'root package.json must not export a root patch layer');

  for (const patchRel of patchList) {
    const patchAbs = join(rootDir, patchRel);
    assert.ok(existsSync(patchAbs), `${patchRel} must exist`);
    const inserted = parseInsertedEntries(readFileSync(patchAbs, 'utf8'));
    assert.ok(inserted.length > 0, `${patchRel} must insert at least one entry`);
    for (const row of inserted) {
      assert.ok(row.id && row.name, `${patchRel} entry must declare id and name`);
      assert.equal(seenRowIds.has(row.id), false, `duplicate plugin row id "${row.id}" across bundle patches`);
      seenRowIds.add(row.id);
      assert.ok(seenPluginNames.has(row.name), `${patchRel} row ${row.name} must reference a self-authored plugin`);
    }
  }

  // Audited third-party plugins stay outside the bundle; only their audit
  // records remain in this repository.
  const thirdPartyAuditRecords = {
    '@dingyi222666/dsh-session-notification': 'dsh-session-notification-0.2.6.md',
    'dsh-codex-connect': 'dsh-codex-connect-0.2.0-alpha.15.md',
    'dsh-quorfloat': 'dsh-quorfloat-0.1.10.md',
  };
  for (const [pkgName, record] of Object.entries(thirdPartyAuditRecords)) {
    assert.equal(rootDeps[pkgName], undefined, `third-party plugin ${pkgName} must stay outside the bundle`);
    assert.equal(seenPluginNames.has(pkgName), false, `third-party plugin ${pkgName} must not be patched into the bundle`);
    assert.ok(existsSync(join(rootDir, 'docs', 'audits', record)), `audit record ${record} must be retained`);
  }
  assert.equal(rootDeps['dsh-pet'], undefined, 'dsh-pet must remain outside this bundle');
  assert.deepEqual(
    Object.keys(rootDeps).sort(),
    [...expectedRootDeps].sort(),
    'root dependencies must contain only self-authored plugins and their hoisted runtime dependencies',
  );
});

test('third-party plugin audit records are indexed and retained', () => {
  const auditDir = join(rootDir, 'docs', 'audits');
  const index = readFileSync(join(auditDir, 'README.md'), 'utf8');
  for (const record of [
    'dsh-session-notification-0.2.6.md',
    'dsh-codex-connect-0.2.0-alpha.15.md',
    'dsh-quorfloat-0.1.10.md',
  ]) {
    assert.ok(index.includes(record), `docs/audits/README.md must link ${record}`);
    assert.ok(existsSync(join(auditDir, record)), `docs/audits/${record} must exist`);
  }
});

test('bundle display metadata resources (icon and locales) exist and validate', () => {
  assert.ok(existsSync(join(rootDir, 'icon.svg')));
  for (const locale of ['en', 'zh']) {
    const file = join(rootDir, 'locale', `${locale}.json`);
    assert.ok(existsSync(file), `locale/${locale}.json must exist`);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(typeof parsed.meta?.title === 'string' && parsed.meta.title.length > 0);
    assert.ok(typeof parsed.meta?.description === 'string' && parsed.meta.description.length > 0);
    if (parsed.meta.detail !== undefined) {
      assert.ok(existsSync(join(rootDir, parsed.meta.detail)), `detail doc ${parsed.meta.detail} must exist`);
    }
  }
});
