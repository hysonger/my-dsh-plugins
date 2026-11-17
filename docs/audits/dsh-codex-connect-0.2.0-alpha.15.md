# dsh-codex-connect 0.2.0-alpha.15 — audit record (retained)

- Audited version: `0.2.0-alpha.15` (exact; the npm `alpha` dist-tag)
- Audit date: 2026-11-15 (Asia/Shanghai), registry/provenance re-checked 2026-11-18
- Current status: **not bundled**. Removed from `my-dsh-plugins` on 2026-11-18 when the repository restricted itself to self-authored plugins.
- Former bundle row: id `llm-openai-codex`, with upstream defaults disabled by config (`enableProxy`, `enableSearch`, `enableReserveFallback`, `enableNativeCompaction`, `enableImageTool`, `enableImageGeneration`, and `enableAutoReview` all `false`).

## Artifact and registry metadata

| Field | Value |
|---|---|
| Package | `dsh-codex-connect` |
| Version | `0.2.0-alpha.15` |
| License | `Apache-2.0` |
| Release tag | `v0.2.0-alpha.15` → commit `16c7b3e99acd194c2ec0b5d5431930d6f7314b94` |
| npm `sha512` (SRI) | `sha512-fUKi1NiEBjiA9BTDtbHtSthYFeXRyUnUy+9yv5uKKbWFzhuGcBvzaoq7Nnl9nCJnKIpZmQ8yg3jAoo/y6abjoA==` |
| npm `shasum` (SHA-1) | `03f797470d9ec65e1065665e0b9bdf64d000647f` |
| Tarball SHA-256 | `87ea5a79461922fdf989246c5754b329a4fd37157bec83a81f3792f011039e20` |
| Direct runtime dependencies | `@deepseek-ai/schemastery` `3.18.4`, `@earendil-works/pi-ai` `0.85.1`, `undici` `^8.12.3` |
| Lifecycle scripts | only `prepublishOnly`; no `prepare` / `preinstall` / `install` / `postinstall` |

The npm tarball's SHA-256 above was recomputed on 2026-11-18. The value
previously written in the root README (`...c5554b...`) contained a one-nibble
typo and is superseded by this record; the SHA-512 SRI and SHA-1 values were
already correct.

## Verification recorded during the audit

- The npm tarball was downloaded directly from `registry.npmjs.org`; the
  SHA-512 SRI and SHA-1 values matched.
- npm registry ECDSA signatures were present for the release.
- An SLSA v1 provenance attestation was published by GitHub Actions for
  `.github/workflows/release.yml` (workflow dispatch, run `43606236883`). On
  2026-11-18 the attestation was re-checked: its subject SHA-512 digest matches
  the npm tarball's integrity value, and its resolved dependency commit
  `16c7b3e99acd194c2ec0b5d5431930d6f7314b94` matches the release tag.
- The audit recorded the CI artifact for the tag as byte-identical to the npm
  tarball.
- `latest` points to the older `0.2.0-alpha.10`; the `alpha` dist-tag points to
  `0.2.0-alpha.15`. Following `latest` would downgrade the plugin, so the exact
  version was pinned rather than a tag or range.
- Transitive dependency surface: `@earendil-works/pi-ai@0.85.1` pulls
  `@google/genai@1.52.0` and `protobufjs@7.6.6`. pnpm skips/blocks their install
  scripts on a fresh profile (`ERR_PNPM_IGNORED_BUILDS`); the audit confirmed
  neither needs to run its install script for this DSH use, so `allowBuilds` was
  set to `false` for both in the installing profile.
- Limitations: this is an alpha-channel release. The retained evidence covers
  registry integrity, signatures, SLSA provenance, dependency declarations, and
  install-script behavior; it does not contain a separate line-by-line source
  review document, and runtime behavior was not exercised.

## Why it is not bundled

The repository now maintains only self-authored plugins. The root
`cordis.patch.yml` row and the exact npm dependency were removed on 2026-11-18;
no form of `my-dsh-plugins` installation pulls this package any more. This
record is kept as evidence and is not a recommendation to install the plugin.

## If installing separately

Pin the exact audited version and re-check the recorded values first:

```sh
npm view dsh-codex-connect@0.2.0-alpha.15 \
  dist.integrity dist.shasum dist.tarball
dsh plugin --profile desktop add dsh-codex-connect@0.2.0-alpha.15
```

Do not follow `latest` (it is older). If pnpm reports `ERR_PNPM_IGNORED_BUILDS`
for `@google/genai` / `protobufjs`, set both to `false` in the profile's
`pnpm-workspace.yaml` under `allowBuilds`. Do not copy the package back into this
repository's root `package.json` or the bundle patch list. Any upgrade requires
a fresh audit.

## Re-verification checklist

1. `npm view <pkg>@<version> dist.integrity dist.shasum` and compare with this
   record.
2. Download the tarball from `registry.npmjs.org`, verify SHA-512/SHA-1, and
   compare SHA-256 with `87ea5a79461922fdf989246c5754b329a4fd37157bec83a81f3792f011039e20`.
3. Fetch `https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<version>`,
   verify the DSSE signature, and compare the subject digest with the tarball
   integrity value.
4. Check the provenance resolved-dependency `gitCommit` against the release tag
   commit and the expected repository/workflow.
5. Confirm the published package still has no `prepare` / `preinstall` /
   `install` / `postinstall` script, and review the dependency list for changes.

## Record history

- 2026-11-15: provenance and registry audit of `0.2.0-alpha.15`.
- 2026-11-16: pinned into the root bundle at exact `0.2.0-alpha.15`.
- 2026-11-18: removed from the bundle under the self-authored-plugins-only
  policy; registry/provenance values re-checked and the SHA-256 typo corrected;
  audit record retained.
