# my-dsh-plugins

**English** | [简体中文](README.zh-CN.md)

A collection of self-authored plugins for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). The repository root is declared as a DSH bundle (`my-dsh-plugins`) so all self-authored plugins can be installed together in one command, while each local plugin directory also remains an independent DSH bundle with its own dependencies, version, tests, and documentation. Third-party plugins are outside this bundle; their audit records are retained under [docs/audits/](docs/audits/README.md).

## Self-authored plugins

| Directory | Version | Features |
|---|---|---|
| [dsh-plugin-usage-board](dsh-plugin-usage-board/README.md) | 0.7.0 | Usage dashboard for DeepSeek, GLM Coding Plan, Kimi Code, and OpenCode Go; a quota strip below the composer; and the `usage_query` tool |
| [dsh-plugin-kimi-web-search](dsh-plugin-kimi-web-search/README.md) | 0.2.1 | Independent `kimi_web_search` and `kimi_web_fetch` tools with result cards |
| [dsh-plugin-open-here](dsh-plugin-open-here/README.md) | 0.1.0 | Open local workspaces in DSH from the terminal or Finder |
| [dsh-plugin-mermaid](dsh-plugin-mermaid/README.md) | 0.2.0 | Mermaid diagram rendering with zoom, pan, and a large preview |
| [dsh-plugin-sleep-control](dsh-plugin-sleep-control/README.md) | 0.2.0 | Prevent sleep during active sessions on macOS and Windows; macOS-only persistent sleep disable with administrator authorization |
| [dsh-plugin-opencode-go-session](dsh-plugin-opencode-go-session/README.md) | 0.1.1 | Repair explicit-protocol OpenCode Go session headers; includes a guarded one-time protocol migration and upstream retirement notes |
| [dsh-plugin-git-log](dsh-plugin-git-log/README.md) | 0.1.0 | Right-sidebar Git commit log tab bound to the active workspace, with commit graph, branch/ref/search filters, and file diff preview |
| [dsh-plugin-subagent-model](dsh-plugin-subagent-model/README.md) | 0.1.0 | Read-only model indicator and details popover inside the composer bar for continuable subagent sessions |

## Third-party plugins (audited, not bundled)

This repository maintains only self-authored plugins. Its bundle installs no third-party plugin: the former root patch layer (`cordis.patch.yml`) and the two exact npm dependencies have been removed, so no installation form of `my-dsh-plugins` pulls an upstream plugin.

Audit records are retained under [docs/audits/](docs/audits/README.md). They cover the two plugins the bundle previously pinned and `dsh-quorfloat`, whose bundle inclusion was reverted before this policy change. A retained record is audit evidence, not an endorsement or an instruction to install:

| Package | Audited version | Record |
|---|---|---|
| `@dingyi222666/dsh-session-notification` | `0.2.6` | [record](docs/audits/dsh-session-notification-0.2.6.md) |
| `dsh-codex-connect` | `0.2.0-alpha.15` | [record](docs/audits/dsh-codex-connect-0.2.0-alpha.15.md) |
| `dsh-quorfloat` | `0.1.10` | [record](docs/audits/dsh-quorfloat-0.1.10.md) |

Install one separately only at its exact audited version, after re-checking the recorded digests and provenance. Do not add it back to this bundle:

```sh
dsh plugin --profile desktop add @dingyi222666/dsh-session-notification@0.2.6
dsh plugin --profile desktop add dsh-codex-connect@0.2.0-alpha.15
```

> [!NOTE]
> A profile that previously installed an older revision of this bundle acquired these two plugins through the bundle dependency tree. Updating or reinstalling the bundle no longer provides them; install them separately at the exact versions above if they are still wanted. The audit records and installation boundary are documented in [docs/audits/](docs/audits/README.md).

## Independently maintained hardened forks (outside this bundle)

These plugins are tracked alongside this collection, but have their own repositories, security patches, build/review history, and installation lifecycle. The public upstream npm packages do not contain our dedicated hardening, so substituting an upstream release would silently discard it. Neither fork is listed in this bundle's dependencies or patch layers. Keeping them separate also avoids weakening pnpm's `blockExoticSubdeps` policy to accommodate GitHub subdependencies.

| Project / upstream baseline | Personal fork and security notes | Local installation / version |
|---|---|---|
| `dsh-pet` / `0.4.9` | [hysonger/dsh-pet](https://github.com/hysonger/dsh-pet), [hardening notes](https://github.com/hysonger/dsh-pet/blob/harden-plugin-http/HARDENING.md): owner-only Host HTTP admission, verified Electron downloads, restricted Helper environment, and dependency hardening | Independent checkout `/Users/songer/Projects/dsh-pet`, plugin package `dsh-pet/`; package version `0.4.9`, local hardened revision `f0bf01a0fea9f7d40a69cc53c295897b5bc8b099` (not the unmodified npm release) |
| `@michengai/dsh-btw` / release `v1.3.11` (`6db748c8c021101eb4878f5b32edd0469e240843`) | [hysonger/dsh-btw](https://github.com/hysonger/dsh-btw), [hardening notes](https://github.com/hysonger/dsh-btw/blob/hardening/v1.3.11/HARDENING.md): prohibit model-initiated parent messages, block rendered images/HTML, isolate selection actions and draft writes | Independent checkout `/Users/songer/Projects/dsh-btw`; hardened version `1.3.11-hardened.1`, maintained on `hardening/v1.3.11` |

BTW release record: [v1.3.11-hardened.1](https://github.com/hysonger/dsh-btw/releases/tag/v1.3.11-hardened.1), [reviewed commit `279739d`](https://github.com/hysonger/dsh-btw/commit/279739d5c38bcb43f7d6c0dd697c6cadc6f59b35); archive SHA-256 `dacb9509618738485c23762dc47a4d6352a17e898d67301b625df373ff7333df`. Checksums and the verification manifest are attached to that release; they apply to this fork, not the upstream npm package.

Install the reviewed local checkouts separately; installing `my-dsh-plugins` alone does **not** install these forks. Do not install an upstream and hardened BTW bundle together: the fork intentionally retains the upstream package/plugin identities. Review the hardening delta and rebuild/hash the artifacts before every update; do not replace either checkout with `@latest` or relax the bundle's dependency policy.

```sh
dsh plugin --profile desktop add /Users/songer/Projects/dsh-pet/dsh-pet
dsh plugin --profile desktop add /Users/songer/Projects/dsh-btw
```

## Bundle installation (all self-authored plugins at once)

Install all self-authored plugins at once from the GitHub repository via CLI or the DSH Plugin Manager UI (**Add plugin**). The 40-character commit form locks the bundle itself to a verified revision:

```sh
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins
# Or lock the bundle itself to a verified Git commit hash:
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins#<40-char-commit-sha>
```

Equivalent URL forms accepted by DSH include `https://github.com/hysonger/my-dsh-plugins` and `git+ssh://git@github.com/hysonger/my-dsh-plugins.git` (note: a bare `owner/repo` without `github:` is rejected by DSH).

To install the whole bundle from a local checkout so pnpm resolves all sub-plugins and runtime dependencies, use the `file:` prefix:

```sh
dsh plugin --profile desktop add "file:$PWD"
```

Avoid keeping both the root bundle `my-dsh-plugins` and duplicate individual `dsh-plugin-*` bundles enabled in the same profile simultaneously.

## Per-plugin local installation

Each plugin directory can still be installed individually by its local absolute path (keep the repository in a fixed location):

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-mermaid"
```

Replace the directory name to install another plugin. On a new machine, install the plugin's dependencies first, following its README. Existing local links and dependencies in this workspace continue to work without reinstallation after repository consolidation.

Each local plugin directory is self-contained and does not depend on a root npm workspace. Its `lib/`, icons, and other runtime assets are kept alongside the source; the root [package.json](package.json) declares `"dsh": { "bundle": { "patch": [...] } }` reusing each local plugin's `cordis.patch.yml`, and mirrors local plugins' runtime dependencies so GitHub/file bundle installs resolve everything cleanly without build scripts. The root bundle has no patch layer of its own and no third-party plugin dependencies. See each plugin's README for development and build instructions.

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

Third-party plugin audit records are kept under [docs/audits/](docs/audits/README.md). Removing a plugin from the bundle, or reverting its inclusion, does not remove its record.

## License

License terms remain defined by each plugin's declarations, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. Repository consolidation does not change the licensing of code, icons, or third-party assets.
