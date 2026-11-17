# @dingyi222666/dsh-session-notification 0.2.6 — audit record (retained)

- Audited version: `0.2.6` (exact; never a range)
- Audit date: 2026-11-15 (Asia/Shanghai)
- Current status: **not bundled**. Removed from `my-dsh-plugins` on 2026-11-18 when the repository restricted itself to self-authored plugins.
- Former bundle row: id `dsh-session-notification`, no config overrides.

## Artifact and registry metadata

Registry metadata was re-checked against `registry.npmjs.org` on 2026-11-18.

| Field | Value |
|---|---|
| Package | `@dingyi222666/dsh-session-notification` |
| Version | `0.2.6` |
| License | `BSD-3-Clause` |
| `gitHead` | `6e2fabf7cf27fcfd74d2f4f1aab6bd3df4764c64` |
| npm `sha512` (SRI) | `sha512-cyepeRFg376HRHaxaeUEFe/PVUxjb56oPVciE29LnXXk2+Yf1K+ha+9U5MFiPp88l1oaDXDabKv4MrdFbihF1g==` |
| npm `shasum` (SHA-1) | `ac40926069bcd4ab4750e9d5ef9df463bfdd014c` |
| Tarball SHA-256 | `6bdfa423d157efac1512ce244e447376d197f48af3e8692ab1ef54ef9df94e79` |
| Direct runtime dependencies | none declared |
| Lifecycle scripts | `prepare: yarn run build` is declared, although the published tarball already ships compiled `lib/` |

## Verification recorded during the audit

- The tarball was downloaded directly from `registry.npmjs.org`; the declared
  SHA-512 SRI and SHA-1 values matched.
- The npm registry ECDSA signature was verified against npm's public key
  (`keyid` `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`).
- No SLSA provenance attestation was published for `0.2.6`. The registry
  signature binds the artifact to the registry/publisher key; it does not prove
  a reproducible source-to-artifact build.
- The files installed in the audited `desktop` profile matched the downloaded
  `0.2.6` package by hash (baseline comparison); no local modification was
  found.
- The review focused on the `0.2.6` → `0.2.8` upgrade, including a diff of the
  published code. No blocking finding was recorded for the `0.2.6` baseline.
  The only new `0.2.8` behavior found was folding a short excerpt of the latest
  user message (up to about 60 characters) into notification titles, alongside
  the assistant-output excerpt (up to about 160 characters) that already
  existed; browser notifications default to off. No credential reads or
  outbound session/credential transfers were found in the reviewed client code,
  and the Host `apply` was a no-op.
- Verdict at the time: low risk for local single-user use, with a privacy
  caveat for lock-screen, projector, or notification-center previews of
  sensitive sessions.
- Limitations: the review examined the published compiled `lib/` artifacts, not
  a reproducible build from source; no runtime behavior or install-script
  execution was tested.

## Why it is not bundled

The repository now maintains only self-authored plugins. The root
`cordis.patch.yml` row and the exact npm dependency were removed on 2026-11-18;
no form of `my-dsh-plugins` installation pulls this package any more. This
record is kept as evidence and is not a recommendation to install the plugin.

## If installing separately

Pin the exact audited version and re-check the recorded values first:

```sh
npm view @dingyi222666/dsh-session-notification@0.2.6 \
  dist.integrity dist.shasum gitHead license
dsh plugin --profile desktop add @dingyi222666/dsh-session-notification@0.2.6
```

Do not follow `latest` or a semver range. Do not copy the package back into this
repository's root `package.json` or the bundle patch list. Any upgrade requires
a fresh audit; `0.2.8` was the highest published release at audit time.

## Re-verification checklist

1. `npm view <pkg>@<version> dist.integrity dist.shasum gitHead` and compare with
   this record.
2. Download the tarball from `registry.npmjs.org`, verify the SHA-512/SHA-1
   values, and check its SHA-256.
3. Fetch `https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<version>`.
   `0.2.6` has no provenance; if a later release publishes one, verify the DSSE
   signature and subject digest instead of trusting decoded text.
4. Inspect the published `lib/client.js` for network egress, notification
   content, and default settings; confirm the published package has no
   `preinstall` / `install` / `postinstall` script that executes.

## Record history

- 2026-11-15: security audit of the installed baseline and the `0.2.8` upgrade.
- 2026-11-16: pinned into the root bundle at exact `0.2.6`.
- 2026-11-18: removed from the bundle under the self-authored-plugins-only
  policy; audit record retained.
