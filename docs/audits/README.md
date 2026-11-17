# Third-party plugin audit records

This repository maintains **self-authored plugins only**. The root bundle
`my-dsh-plugins` installs no third-party plugin: `package.json` lists no
third-party plugin dependency, and the root `cordis.patch.yml` patch layer that
used to insert upstream rows has been removed. Third-party plugins can still be
installed into a DSH profile separately; they are simply outside this
repository's bundle and installation lifecycle.

The records in this directory are retained as audit evidence and history. They
exist because these packages were reviewed while they were part of the bundle or
were proposed for it. Keeping a record is neither an endorsement nor an
instruction to install: every plugin must be re-evaluated against its own trust
boundary, and an exact version must be pinned, before it is installed.

## Records

| Package | Audited version | Bundle status | Record |
|---|---|---|---|
| `@dingyi222666/dsh-session-notification` | `0.2.6` | Removed from the bundle on 2026-11-18 | [record](dsh-session-notification-0.2.6.md) |
| `dsh-codex-connect` | `0.2.0-alpha.15` | Removed from the bundle on 2026-11-18 | [record](dsh-codex-connect-0.2.0-alpha.15.md) |
| `dsh-quorfloat` | `0.1.10` | Bundle inclusion reverted on 2026-11-18; record retained | [record](dsh-quorfloat-0.1.10.md) |

The hardened forks `dsh-pet` and `@michengai/dsh-btw` are maintained in their
own repositories and installed independently. Their review links and artifact
checksums are recorded in the [root README](../../README.md#independently-maintained-hardened-forks-outside-this-bundle).

## Installation boundary

These packages are not installed by `dsh plugin --profile <name> add
github:hysonger/my-dsh-plugins` or by the local `file:` form of this bundle. To
install one separately, use its exact audited version, for example:

```sh
dsh plugin --profile desktop add @dingyi222666/dsh-session-notification@0.2.6
dsh plugin --profile desktop add dsh-codex-connect@0.2.0-alpha.15
```

Never follow a floating `latest` tag or a semver range for these packages.
Verify the registry `sha512` / `sha256` values and provenance recorded in the
individual record first. Do not copy them back into the root `package.json` or
the bundle patch list.

## Historical pinning rationale

While the bundle still shipped third-party plugins, exact npm versions were used
instead of Git commit hashes or `#sha512` tarball URLs because:

1. DSH invokes pnpm v11 with `blockExoticSubdeps: true` by default, which
   rejects `github:...#<commit>` and `https://...tgz` URLs inside a bundle's
   subdependencies (`ERR_PNPM_EXOTIC_SUBDEP`) unless the consumer weakens the
   profile's global dependency policy.
2. `@dingyi222666/dsh-session-notification`'s Git tree omits compiled `lib/` and
   defines a `prepare` build script, which pnpm blocks
   (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`); pnpm's tarball resolver also does
   not verify `#sha512-...` URL fragments.
3. An exact npm version resolves an immutable published release and instructs
   pnpm in the installing profile to record and enforce the release's **SHA-512
   SRI integrity hash** in `<profile>/pnpm-lock.yaml`, which protects against
   registry or mirror tampering.

This rationale applies only to how a third-party plugin should be pinned if one
is installed separately. The bundle itself no longer contains any third-party
plugin.

## Retention rule

Removing a third-party plugin from the bundle, or reverting its inclusion, never
deletes its audit record. New records may be added when a third-party plugin is
audited for separate installation; they must state the audited version, the
verification evidence, the accepted limitations, and the re-verification steps.
