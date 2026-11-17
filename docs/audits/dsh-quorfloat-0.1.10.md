# dsh-quorfloat 0.1.10 — pinning decision and audit record

- Decision date: 2026-11-18 (Asia/Shanghai)
- Decision: **accept the plugin into this bundle at the exact pinned version `0.1.10`**, with the limitations in §5 recorded and accepted.
- Audited artifacts: `dsh-quorfloat@0.1.10` plus its platform sidecars `@azetus/dsh-quorfloat-darwin@0.1.10` and `@azetus/dsh-quorfloat-win32-x64@0.1.10`.
- Audit host: DSH `0.2.2-rc.3`, macOS (darwin arm64), Node `24.21.0`. Nothing was installed, imported or executed during the audit; the native sidecar was never run.

## 1. What the plugin is

A system-level floating conversation window for DSH (macOS and Windows): a global hotkey summons an always-on-top Tauri panel that can start new sessions, follow existing ones, read/write conversation content, switch model and permission presets, and answer tool approvals and user questions. The DSH host plugin communicates with the native panel over a stdio JSON-RPC channel; the panel itself is a separately published platform package.

Because of that design, the plugin is **equivalent to another local DSH client**, not a sandboxed widget: a compromised binary could create sessions, raise permissions to `danger-full-access`, answer approvals, and read conversation history. It does not receive the model API key (the host builds a strict environment allowlist) and its webview cannot open arbitrary network connections (`connect-src` is limited to the IPC scheme); its only egress is loading remote images referenced by Markdown.

## 2. Supply-chain evidence

- Registry: official npm registry; maintainer `azetus`; `latest` = `0.1.10`; 9 published versions.
- Published tarballs were downloaded directly from `registry.npmjs.org`; SHA-512 SRI and SHA-1 verified; archives extracted with absolute-path, `..`, link and special-file rejection.
- npm provenance: all three packages carry SLSA v1 attestations. The DSSE signature was verified against the embedded Fulcio leaf certificate (issuer `sigstore-intermediate`; SAN `https://github.com/Azetus/dsh-quorfloat/.github/workflows/publish-npm.yml@refs/tags/v0.1.10`; OIDC issuer `token.actions.githubusercontent.com`), and each subject digest matches the downloaded tarball. Build commit `11045069794fc09d361fe428db0835389547f4a3` equals the repository `main` HEAD; release workflow run `42235226929` succeeded.
- **CI artifact byte comparison**: the `npm-native-darwin-0.1.10` artifact of that run (id `13512985942`) contains a tarball whose SHA-256 equals the npm-published one, i.e. the registry artifact is byte-identical to what CI produced.
- Source is public and MIT-licensed in the same repository (`quorfloat/` holds the Rust sidecar and React frontend); npm only ships compiled artifacts.

## 3. Pinned digests

| Artifact | SHA-256 |
|---|---|
| `dsh-quorfloat@0.1.10` tarball | `49a589f34b3d4cc97cf67ad7ea2c5cd6720d571bbd3d147d9bf19eb50dd2140a` |
| `@azetus/dsh-quorfloat-darwin@0.1.10` tarball | `8ff482f87c8e98ae89516a1f337df13b0881167955df226f6a0584d77ccc357f` |
| `@azetus/dsh-quorfloat-win32-x64@0.1.10` tarball | `99496cd4a49aa20e493795e8bcba483021f5036f6b797e3938f55fa506a4210a` |
| macOS sidecar `bin/dsh-quorfloat` (universal) | `e6b11f60b9710e94a12427ae679253def4153c76580201c9b15e3925255e51c2` |

`dsh-quorfloat@0.1.10` npm `sha512`: `sha512-IujK+2If6rwEmL7GloarVj7Lft+d6tIGSHTCUflNZNgwYCYnP375LakLkcTpgWYvENI2IGPtI2NZ2nECh+Tfqw==`.

Compatibility: `engines.dsh = ">=0.2.0-rc.2"`; satisfies the running `0.2.2-rc.3` compatibility gate, so no `allow-version` exemption is needed.

## 4. Code review findings

- Host plugin (`lib/*.js`, compiled from `src/*.ts`): no HTTP routes, no tools, no credential reads; only `ctx.logger` and `ctx.get` service probing. It spawns the sidecar with an absolute path, `shell: false`, piped stdio, `cwd` = home, and an **allowlisted environment** that excludes API keys and tokens.
- Host↔sidecar protocol is stdio JSON-RPC with a 1 MiB frame cap, a 4 MiB write buffer bound, handshake version negotiation, heartbeats and a restart budget.
- File writes are limited to `~/.dsh-quorfloat/` (diagnostics dir `0700`, files `0600`); diagnostics are a whitelist projection that never reads conversation text.
- Browser-facing `quorfloat/*` Remote endpoints (status, panel lifecycle, presence report, diagnostics export) are reachable only by an authenticated DSH browser peer; they cannot write configuration or arbitrary paths.
- Approval routing is fail-safe: the panel only claims an approval when no DSH window is visible/focused and the panel shows that session, with a deadline and delivery-matched answers.
- Markdown rendering: `markdown-it({ html: false })`, images replaced with inert placeholders, DOMPurify with `img` forbidden, links restricted to http(s).
- Native sidecar: Tauri capabilities limited to `core:default` + window dragging; CSP `script-src 'self'`, `connect-src ipc:`; no updater; navigation fenced to the embedded document; Rust source contains no process spawning, no HTTP client use, no unsafe blocks (one `unsafe impl Send` marker required by `global-hotkey`); writes limited to `~/.dsh-quorfloat/`.
- Binary capability check: no `socket`/`connect`/`getaddrinfo`/`execve`/`system`/`popen`/Keychain imports; the only process-spawn primitives come from the opener plugin, which is restricted to opening validated `http(s)` URLs in the system browser.

## 5. Accepted limitations

1. **The native sidecar is a prebuilt binary and cannot be reproduced byte-for-byte locally.** Rebuilding with the same rustc (`1.99.1`) and full `--remap-path-prefix` yields identical `__cstring` and 10 of 21 sections; the instruction stream differs in exactly 2 places (an Objective-C++ TU in `objc2-exception-helper` whose layout depends on the CI clang/libc++/SDK version, plus one 2-instruction `udf` padding). The remaining gap is the `CARGO_MANIFEST_DIR` literal embedded in `__const` (not remappable), the CI SDK 15.5/linker version (not installed locally), and `LC_UUID` + ad-hoc signature sensitivity. The published macOS sidecar is ad-hoc signed and not notarized; the Windows executable has no Authenticode signature.
2. **Dependencies and toolchain were not audited** (478 crates in `Cargo.lock`, rustc/LLVM/Xcode, frontend npm build dependencies). Byte-level comparison cannot detect a poisoned dependency that both builds share.
3. **Runtime behavior was not verified** (the sidecar was not executed; no network-blocked or syscall-traced run).
4. The plugin can drive sessions and switch to `danger-full-access`; treat it as a local DSH client and do not install it on multi-user shared hosts.

## 6. Upgrade policy

- The dependency stays at the exact version `0.1.10` (never a range). Changing it requires a fresh security audit of the target release, re-verification of the SLSA attestations and digests, and an update to this record.
- The platform sidecars are pulled by the plugin's own `optionalDependencies` at exact `0.1.10`; do not override them or install a sidecar from another source.
- Users who do not accept limitation §5.1 can build the sidecar from the pinned tag and point `config.quorfloatPath` / `DSH_QUORFLOAT_PATH` at their own artifact.

## 7. How to re-verify a future release

1. `npm view dsh-quorfloat@<version> dist.integrity dist.shasum` and compare with a fresh tarball download.
2. `https://registry.npmjs.org/-/npm/v1/attestations/dsh-quorfloat@<version>`: require SLSA v1 provenance, verify the DSSE signature and check that the subject digest equals the tarball.
3. `gh api repos/Azetus/dsh-quorfloat/actions/runs/<run>/artifacts`: download the `npm-native-darwin-<version>` artifact and compare its tarball hash with npm.
4. Rebuild the host half with `npm run toolchain --silent && node scripts/tsc.mjs -p tsconfig.json && node scripts/build-client.mjs` and compare `lib/` with the published package.
5. Re-run the native capability scan (`nm -u` for network/exec/Keychain imports, `strings` for URLs/IPs) and the instruction-level comparison against a same-rustc rebuild.
