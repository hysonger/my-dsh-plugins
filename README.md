# my-dsh-plugins

**English** | [简体中文](README.zh-CN.md)

A collection of plugins for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). The repository root is declared as a DSH bundle (`my-dsh-plugins`) so all self-authored plugins and the audited, version-pinned third-party npm plugins can be installed together in one command, while each local plugin directory also remains an independent DSH bundle with its own dependencies, version, tests, and documentation.

## Self-authored plugins

| Directory | Version | Features |
|---|---|---|
| [dsh-plugin-usage-board](dsh-plugin-usage-board/README.md) | 0.7.0 | Usage dashboard for DeepSeek, GLM Coding Plan, Kimi Code, and OpenCode Go; a quota strip below the composer; and the `usage_query` tool |
| [dsh-plugin-kimi-web-search](dsh-plugin-kimi-web-search/README.md) | 0.2.1 | Independent `kimi_web_search` and `kimi_web_fetch` tools with result cards |
| [dsh-plugin-open-here](dsh-plugin-open-here/README.md) | 0.1.0 | Open local workspaces in DSH from the terminal or Finder |
| [dsh-plugin-mermaid](dsh-plugin-mermaid/README.md) | 0.2.0 | Mermaid diagram rendering with zoom, pan, and a large preview |
| [dsh-plugin-sleep-control](dsh-plugin-sleep-control/README.md) | 0.1.0 | Prevent sleep during active sessions and manage macOS sleep settings with administrator authorization |
| [dsh-plugin-opencode-go-session](dsh-plugin-opencode-go-session/README.md) | 0.1.1 | Repair explicit-protocol OpenCode Go session headers; includes a guarded one-time protocol migration and upstream retirement notes |
| [dsh-plugin-git-log](dsh-plugin-git-log/README.md) | 0.1.0 | Right-sidebar Git commit log tab bound to the active workspace, with commit graph, branch/ref/search filters, and file diff preview |
| [dsh-plugin-subagent-model](dsh-plugin-subagent-model/README.md) | 0.1.0 | Read-only model indicator and details popover inside the composer bar for continuable subagent sessions |

## Third-party plugins (pinned for supply-chain security)

Audited third-party npm plugins from the `desktop` profile are pinned to exact immutable versions and wired into the root bundle via [cordis.patch.yml](cordis.patch.yml) with non-intrusive upstream defaults (`dsh-pet` is maintained in its own standalone hardened fork repository and installed independently, because pnpm v11's default `blockExoticSubdeps: true` blocks GitHub subdependencies and upstream npm `dsh-pet@0.4.9` lacks our security hardening):

| Package | Pinned Version | Plugin Row ID | Audited Digests / Provenance |
|---|---|---|---|
| `@dingyi222666/dsh-session-notification` | `0.2.6` | `dsh-session-notification` | `BSD-3-Clause`; `gitHead` `6e2fabf7cf27fcfd74d2f4f1aab6bd3df4764c64`; npm `sha512`: `sha512-cyepeRFg376HRHaxaeUEFe/PVUxjb56oPVciE29LnXXk2+Yf1K+ha+9U5MFiPp88l1oaDXDabKv4MrdFbihF1g==` (`sha256`: `6bdfa423d157efac1512ce244e447376d197f48af3e8692ab1ef54ef9df94e79`) |
| `dsh-codex-connect` | `0.2.0-alpha.15` | `llm-openai-codex` | `Apache-2.0`; tag `v0.2.0-alpha.15` commit `16c7b3e99acd194c2ec0b5d5431930d6f7314b94` (byte-identical to npm tarball; ECDSA signed + SLSA v1 provenance); npm `sha512`: `sha512-fUKi1NiEBjiA9BTDtbHtSthYFeXRyUnUy+9yv5uKKbWFzhuGcBvzaoq7Nnl9nCJnKIpZmQ8yg3jAoo/y6abjoA==` (`sha256`: `87ea5a79461922fdf989246c5554b329a4fd37157bec83a81f3792f011039e20`) |

### Why versions are pinned (supply-chain security rationale)

- **Intent — safeguard supply-chain security**: Third-party plugins run directly inside the DSH Node.js host and Web GUI with filesystem/network/UI reach. Pinning exact immutable versions prevents floating semver ranges (`^`, `~`, `latest`) from silently pulling a hijacked upstream publish, malicious post-install/runtime payload, or breaking dependency bump. Before any version bump in [package.json](package.json), the target release must undergo a fresh security audit.
- **Why exact npm versions instead of Git commit hashes or `#sha512` URLs in `package.json`**:
  1. DSH invokes `pnpm` v11 with `blockExoticSubdeps: true` by default, which rejects `github:...#<commit>` and `https://...tgz` URLs inside a bundle's subdependencies (`ERR_PNPM_EXOTIC_SUBDEP`) unless the consumer weakens the profile's global `blockExoticSubdeps` policy.
  2. `@dingyi222666/dsh-session-notification`'s Git tree also omits compiled `lib/` and defines a `prepare` build script, which pnpm blocks (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`), and pnpm's tarball resolver does not verify `#sha512-...` URL fragments.
  3. Pinning exact npm versions (`0.2.6` and `0.2.0-alpha.15`) works under `blockExoticSubdeps: true`, resolves immutable published npm releases, and instructs pnpm in each installing profile to record and enforce exact **SHA-512 SRI integrity hashes** in `<profile>/pnpm-lock.yaml` against registry/mirror tampering. (Note: `dsh-codex-connect@0.2.0-alpha.15` retains its own upstream `^8.12.3` range on `undici`, which the installing profile's `pnpm-lock.yaml` still locks by SHA-512 after resolution.)
- **Optional top-level commit-hash pinning**: When installing this bundle itself, you may pin the root bundle by its 40-character Git commit SHA: `dsh plugin --profile desktop add github:hysonger/my-dsh-plugins#<commit-sha>`.

## Bundle installation (all plugins at once)

Install all plugins at once from the GitHub repository via CLI or the DSH Plugin Manager UI (**Add plugin**):

```sh
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins
# Or lock the bundle itself to a verified Git commit hash:
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins#<40-char-commit-sha>
```

Equivalent URL forms accepted by DSH include `https://github.com/hysonger/my-dsh-plugins` and `git+ssh://git@github.com/hysonger/my-dsh-plugins.git` (note: a bare `owner/repo` without `github:` is rejected by DSH).

To install the whole bundle from a local checkout so pnpm resolves all sub-plugins, pinned external plugins, and runtime dependencies, use the `file:` prefix:

```sh
dsh plugin --profile desktop add "file:$PWD"
```

> [!NOTE]
> `dsh-codex-connect` transitively pulls `@google/genai@1.52.0` and `protobufjs@7.6.6` (via `@earendil-works/pi-ai@0.85.1`), whose install scripts pnpm skips/blocks on a fresh profile (`ERR_PNPM_IGNORED_BUILDS`). Setting them to `false` in `<profile>/pnpm-workspace.yaml` under `allowBuilds` is recommended (audit confirmed neither needs build scripts here). If a CLI `dsh plugin add` run stops on `ERR_PNPM_IGNORED_BUILDS` after editing `package.json`, set both keys to `false` in `<profile>/pnpm-workspace.yaml`, run `dsh plugin --profile <name> remove my-dsh-plugins`, and re-run `dsh plugin --profile <name> add ...` so `my-dsh-plugins` is activated in `dsh.profile.bundles`.

Avoid keeping both the root bundle `my-dsh-plugins` and duplicate individual `dsh-plugin-*` or standalone `dsh-session-notification` / `dsh-codex-connect` bundles enabled in the same profile simultaneously.

## Per-plugin local installation

Each plugin directory can still be installed individually by its local absolute path (keep the repository in a fixed location):

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-mermaid"
```

Replace the directory name to install another plugin. On a new machine, install the plugin's dependencies first, following its README. Existing local links and dependencies in this workspace continue to work without reinstallation after repository consolidation.

Each local plugin directory is self-contained and does not depend on a root npm workspace. Its `lib/`, icons, and other runtime assets are kept alongside the source; the root [package.json](package.json) declares `"dsh": { "bundle": { "patch": [...] } }` reusing each local plugin's `cordis.patch.yml` plus the root [cordis.patch.yml](cordis.patch.yml) (for the pinned third-party plugins, since DSH resolves bundle patches relative to the bundle root rather than hoisted `node_modules`), and mirrors local plugins' runtime dependencies so GitHub/file bundle installs resolve everything cleanly without build scripts. See each plugin's README for development and build instructions.

## Checks

Run the root bundle check and each plugin's existing checks from the repository root:

```sh
npm run check
npm --prefix dsh-plugin-usage-board run check
npm --prefix dsh-plugin-kimi-web-search run check
npm --prefix dsh-plugin-open-here test
npm --prefix dsh-plugin-mermaid run check
npm --prefix dsh-plugin-sleep-control run check
npm --prefix dsh-plugin-opencode-go-session run check
npm --prefix dsh-plugin-git-log run check
npm --prefix dsh-plugin-subagent-model run check
```

These commands run each plugin's offline tests. Live upstream API smoke tests use separate `live` scripts and can be run when needed.

## Version control and history

Commits and branches are managed in this repository; plugin directories no longer have their own `.git` directories. Prefer commits focused on one plugin, with the plugin name or feature scope in the commit message.

The five local plugin repositories were consolidated on November 15, 2026. All 21 existing commits were preserved with plugin directory prefixes added to their paths. Previously uncommitted work in the Kimi and sleep-control plugins was saved in separate snapshot commits. See the [migration notes](docs/migration/README.md) and [commit map](docs/migration/commit-map.tsv) for the correspondence between original and rewritten commits.

`_upstream/`, `research/`, `.dsh-feasibility-*/`, dependencies, and caches are local materials excluded by the root `.gitignore`.

## License

License terms remain defined by each plugin's declarations, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. Repository consolidation does not change the licensing of code, icons, or third-party assets.
