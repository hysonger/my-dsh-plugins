# my-dsh-plugins

**English** | [简体中文](README.zh-CN.md)

A collection of personal plugins for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). All plugins are maintained in one Git repository. Each plugin directory remains an independent DSH bundle with its own dependencies, version, tests, and documentation.

## Plugins

| Directory | Version | Features |
|---|---|---|
| [dsh-plugin-usage-board](dsh-plugin-usage-board/README.md) | 0.7.0 | Usage dashboard for DeepSeek, GLM Coding Plan, Kimi Code, and OpenCode Go; a quota strip below the composer; and the `usage_query` tool |
| [dsh-plugin-kimi-web-search](dsh-plugin-kimi-web-search/README.md) | 0.2.1 | Independent `kimi_web_search` and `kimi_web_fetch` tools with result cards |
| [dsh-plugin-open-here](dsh-plugin-open-here/README.md) | 0.1.0 | Open local workspaces in DSH from the terminal or Finder |
| [dsh-plugin-mermaid](dsh-plugin-mermaid/README.md) | 0.2.0 | Mermaid diagram rendering with zoom, pan, and a large preview |
| [dsh-plugin-sleep-control](dsh-plugin-sleep-control/README.md) | 0.1.0 | Prevent sleep during active sessions and manage macOS sleep settings with administrator authorization |

## Local installation

Install each plugin into DSH using its local absolute path. Keep the repository in a fixed location and select the plugin directory you need. For example, run this from the repository root:

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-mermaid"
```

Replace the directory name to install another plugin. On a new machine, install the plugin's dependencies first, following its README. Existing local links and dependencies in this workspace continue to work without reinstallation after repository consolidation.

Each plugin is self-contained and does not depend on a root npm workspace. Its `lib/`, icons, and other runtime assets are kept alongside the source. See each plugin's README for development and build instructions.

## Checks

Run the existing checks from the repository root:

```sh
npm --prefix dsh-plugin-usage-board run check
npm --prefix dsh-plugin-kimi-web-search run check
npm --prefix dsh-plugin-open-here test
npm --prefix dsh-plugin-mermaid run check
npm --prefix dsh-plugin-sleep-control run check
```

These commands run each plugin's offline tests. Live upstream API smoke tests use separate `live` scripts and can be run when needed.

## Version control and history

Commits and branches are managed in this repository; plugin directories no longer have their own `.git` directories. Prefer commits focused on one plugin, with the plugin name or feature scope in the commit message.

The five local plugin repositories were consolidated on November 15, 2026. All 21 existing commits were preserved with plugin directory prefixes added to their paths. Previously uncommitted work in the Kimi and sleep-control plugins was saved in separate snapshot commits. See the [migration notes](docs/migration/README.md) and [commit map](docs/migration/commit-map.tsv) for the correspondence between original and rewritten commits.

`_upstream/`, `research/`, `.dsh-feasibility-*/`, dependencies, and caches are local materials excluded by the root `.gitignore`.

## License

License terms remain defined by each plugin's declarations, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. Repository consolidation does not change the licensing of code, icons, or third-party assets.
