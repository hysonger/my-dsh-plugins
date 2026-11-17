# my-dsh-plugins

[English](README.md) | **简体中文**

个人定制的 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 自研插件集合。根目录已声明为 DSH 组合包（`my-dsh-plugins`），可通过仓库名一次性安装全部自研插件；各本地插件目录继续作为独立的 DSH bundle，保留各自的依赖、版本、测试和文档。第三方插件不纳入本组合包，其审计记录统一保留在 [docs/audits/](docs/audits/README.md)。

## 自研插件

| 目录 | 当前版本 | 功能 |
|---|---|---|
| [dsh-plugin-usage-board](dsh-plugin-usage-board/README.md) | 0.7.0 | DeepSeek、GLM Coding Plan、Kimi Code 和 OpenCode Go 用量看板、输入框额度信息条及 `usage_query` 工具 |
| [dsh-plugin-kimi-web-search](dsh-plugin-kimi-web-search/README.md) | 0.2.1 | 独立的 `kimi_web_search` / `kimi_web_fetch` 工具及结果卡片 |
| [dsh-plugin-open-here](dsh-plugin-open-here/README.md) | 0.1.0 | 从终端和 Finder 在 DSH 中打开本地工作区 |
| [dsh-plugin-mermaid](dsh-plugin-mermaid/README.md) | 0.2.0 | Mermaid 图表渲染、缩放、平移和大图预览 |
| [dsh-plugin-sleep-control](dsh-plugin-sleep-control/README.md) | 0.2.0 | 会话运行时防睡眠（macOS/Windows）及仅 macOS 的经管理员授权睡眠控制 |
| [dsh-plugin-opencode-go-session](dsh-plugin-opencode-go-session/README.md) | 0.1.1 | 修复显式协议 OpenCode Go 路由的会话头，含受限的一次性协议迁移及升级停用背景 |
| [dsh-plugin-git-log](dsh-plugin-git-log/README.md) | 0.1.0 | 绑定当前会话工作区的右侧边栏 Git 日志标签页，支持分支/引用筛选、提交图谱、搜索与按文件 Diff 预览 |
| [dsh-plugin-subagent-model](dsh-plugin-subagent-model/README.md) | 0.1.0 | 在可继续子智能体会话的输入栏中只读显示当前模型、思考强度与详情卡片 |

## 第三方插件（已审计，但不纳入组合包）

本仓库只维护自研插件，组合包不安装任何第三方插件：原先的根 patch 层（`cordis.patch.yml`）与两条精确 npm 依赖均已移除，任何 `my-dsh-plugins` 安装方式都不会再拉取上游插件。

已审计插件的记录保留在 [docs/audits/](docs/audits/README.md)：包括组合包此前锁定的两个插件，以及在本策略调整前已撤销纳入的 `dsh-quorfloat`。保留记录只代表审计证据，不代表推荐安装：

| npm 包名 | 已审计版本 | 记录 |
|---|---|---|
| `@dingyi222666/dsh-session-notification` | `0.2.6` | [记录](docs/audits/dsh-session-notification-0.2.6.md) |
| `dsh-codex-connect` | `0.2.0-alpha.15` | [记录](docs/audits/dsh-codex-connect-0.2.0-alpha.15.md) |
| `dsh-quorfloat` | `0.1.10` | [记录](docs/audits/dsh-quorfloat-0.1.10.md) |

如确实需要单独安装，只能使用已审计的精确版本，并先复核记录中的摘要与溯源信息；不要把它们重新加回本组合包：

```sh
dsh plugin --profile desktop add @dingyi222666/dsh-session-notification@0.2.6
dsh plugin --profile desktop add dsh-codex-connect@0.2.0-alpha.15
```

> [!NOTE]
> 此前安装过旧版本组合包的 profile 会通过依赖树带入这两个插件；更新或重装组合包后它们不会再被提供，如仍需使用请按上面的精确版本单独安装。审计记录与安装边界见 [docs/audits/](docs/audits/README.md)。

## 独立维护的安全加固 fork（不纳入本组合包）

这些插件属于个人 DSH 配置的一部分，但需要独立仓库、专门的安全补丁、构建审查记录和安装生命周期。上游公开 npm 包不包含这些加固，直接替换会丢失保护；因此它们均不写入本组合包的 dependencies 或补丁层。单独安装也避免了为容纳 GitHub 子依赖而放宽 pnpm 的 `blockExoticSubdeps` 防护。

| 项目／上游基线 | 个人 fork 与安全边界 | 本机安装／版本 |
|---|---|---|
| `dsh-pet`／`0.4.9` | [hysonger/dsh-pet](https://github.com/hysonger/dsh-pet)，[加固说明](https://github.com/hysonger/dsh-pet/blob/harden-plugin-http/HARDENING.md)：Host HTTP 仅限已认证 owner、Electron 下载独立校验、Helper 环境收敛与依赖加固 | 独立检出目录 `/Users/songer/Projects/dsh-pet`，插件包位于 `dsh-pet/`；清单版本 `0.4.9`，本地加固修订 `f0bf01a0fea9f7d40a69cc53c295897b5bc8b099`，不是未修改的 npm 公开版 |
| `@michengai/dsh-btw`／release `v1.3.11`（`6db748c8c021101eb4878f5b32edd0469e240843`） | [hysonger/dsh-btw](https://github.com/hysonger/dsh-btw)，[加固说明](https://github.com/hysonger/dsh-btw/blob/hardening/v1.3.11/HARDENING.md)：禁止模型主动回传主会话、渲染层禁图／HTML、选区动作及草稿写入隔离 | 独立检出目录 `/Users/songer/Projects/dsh-btw`；加固版本 `1.3.11-hardened.1`，维护分支 `hardening/v1.3.11` |

BTW 加固版记录：[v1.3.11-hardened.1](https://github.com/hysonger/dsh-btw/releases/tag/v1.3.11-hardened.1)，[已审查提交 `279739d`](https://github.com/hysonger/dsh-btw/commit/279739d5c38bcb43f7d6c0dd697c6cadc6f59b35)；安装包 SHA-256 `dacb9509618738485c23762dc47a4d6352a17e898d67301b625df373ff7333df`。该 release 附摘要清单与验证记录，仅适用于这个个人 fork，不是上游 npm 包的摘要。

安装 `my-dsh-plugins` **不会**自动安装上述 fork；应单独安装经过审查的本地检出。BTW fork 有意保留上游包名与插件身份，不要同时启用上游版和加固版。每次更新都需审查与上游的加固差异、重新构建并核对制品摘要；不要用 `@latest` 覆盖本地检出，也不要为此放宽组合包依赖策略。

```sh
dsh plugin --profile desktop add /Users/songer/Projects/dsh-pet/dsh-pet
dsh plugin --profile desktop add /Users/songer/Projects/dsh-btw
```

## 组合包一键安装（一次安装全部自研插件）

通过 CLI 或 DSH 插件管理页（**添加插件**）输入 GitHub 仓库标识，即可一次性安装全部自研插件。40 位提交哈希形式可把组合包本身锁定到已验证提交：

```sh
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins
# 或按 40 位 Git 提交哈希精确锁定整包版本：
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins#<40-char-commit-sha>
```

DSH 同样接受 `https://github.com/hysonger/my-dsh-plugins` 或 `git+ssh://git@github.com/hysonger/my-dsh-plugins.git`（注意：不带 `github:` 前缀的裸 `owner/repo` 会被 DSH 安装规约校验拒绝）。

如从本地检出目录整包安装，请带上 `file:` 前缀，使 pnpm 一并安装子插件及运行时依赖：

```sh
dsh plugin --profile desktop add "file:$PWD"
```

注意：不要在同一 profile 中同时启用整库组合包 `my-dsh-plugins` 与重复的单个 `dsh-plugin-*` 组合包，以免补丁注入重复插件 ID。

## 单插件本地安装

仍可按单个插件目录的本地绝对路径单独安装。将仓库放在固定位置后，在仓库根目录运行：

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-mermaid"
```

其他插件同理，替换最后的目录名即可。在新环境中，先按对应插件 README 安装其依赖。当前工作区已有的本地链接和依赖可以继续使用，整合仓库后不需要重新安装。

各本地插件目录保持自包含，不依赖根目录的 npm workspace；各插件的 `lib/`、图标和其他运行资源继续随源码保存。根目录 [package.json](package.json) 通过 `"dsh": { "bundle": { "patch": [...] } }` 复用各本地插件的 `cordis.patch.yml`，并汇总声明子插件的运行时依赖，无需在安装阶段执行构建脚本；根组合包没有自己的 patch 层，也不包含第三方插件依赖。修改和构建方式见各自 README。

## 检查

在仓库根目录运行组合包检查及各插件现有检查：

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

这些命令使用各插件现有的离线测试。真实上游 API 冒烟测试使用单独的 `live` 脚本，按需执行。

## 版本控制与历史

提交和分支统一在本仓库管理，插件子目录不再各自维护 `.git`。建议每次提交聚焦一个插件，并在提交说明中写明插件名或功能范围。

2026-11-15 从五个本地插件仓库整合而来：原有 21 个提交保留为目录前缀统一后的历史；Kimi 插件和防睡眠插件尚未提交的开发成果分别建立快照提交。原提交与新提交的对应关系见 [迁移说明](docs/migration/README.md) 和 [提交映射](docs/migration/commit-map.tsv)。

`_upstream/`、`research/`、`.dsh-feasibility-*/`、依赖和缓存属于本地材料，由根目录 `.gitignore` 排除。

第三方插件审计记录保存在 [docs/audits/](docs/audits/README.md)；插件从组合包移除或撤销纳入时，不删除对应记录。

## 许可证

许可证沿用各插件的声明、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`；本次整合不调整代码、图标或第三方资源的授权范围。
