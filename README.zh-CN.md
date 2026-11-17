# my-dsh-plugins

[English](README.md) | **简体中文**

个人定制的 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 插件集合。根目录已声明为 DSH 组合包（`my-dsh-plugins`），可通过仓库名一次性安装全部自研插件以及已通过安全性审计、锁定版本的第三方 npm 插件；同时各本地插件目录也继续作为独立的 DSH bundle，保留各自的依赖、版本、测试和文档。

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

## 第三方插件（锁定版本以保障供应链安全）

来自 `desktop` profile、且已发布不可变 npm 版本的上游第三方插件已通过系统安全性审计，并写入根目录 [cordis.patch.yml](<cordis.patch.yml>)，沿用各自上游非侵入式默认配置。需要专门 fork 加固的插件另列于下方记录，**不纳入本组合包**：

| npm 包名 | 锁定版本 | 插件行 ID | 已审计摘要与溯源信息 |
|---|---|---|---|
| `@dingyi222666/dsh-session-notification` | `0.2.6` | `dsh-session-notification` | `BSD-3-Clause`；`gitHead` `6e2fabf7cf27fcfd74d2f4f1aab6bd3df4764c64`；npm `sha512`: `sha512-cyepeRFg376HRHaxaeUEFe/PVUxjb56oPVciE29LnXXk2+Yf1K+ha+9U5MFiPp88l1oaDXDabKv4MrdFbihF1g==`（`sha256`: `6bdfa423d157efac1512ce244e447376d197f48af3e8692ab1ef54ef9df94e79`） |
| `dsh-codex-connect` | `0.2.0-alpha.15` | `llm-openai-codex` | `Apache-2.0`；标签 `v0.2.0-alpha.15` 提交 `16c7b3e99acd194c2ec0b5d5431930d6f7314b94`（与 npm 压缩包逐文件一致；已验 ECDSA 签名及 SLSA v1 构建溯源）；npm `sha512`: `sha512-fUKi1NiEBjiA9BTDtbHtSthYFeXRyUnUy+9yv5uKKbWFzhuGcBvzaoq7Nnl9nCJnKIpZmQ8yg3jAoo/y6abjoA==`（`sha256`: `87ea5a79461922fdf989246c5554b329a4fd37157bec83a81f3792f011039e20`） |
| `dsh-quorfloat` | `0.1.10` | `quorfloat` | `MIT`；标签 `v0.1.10` 提交 `11045069794fc09d361fe428db0835389547f4a3`（npm 压缩包与 CI run `42235226929` 产物逐字节一致；已验 SLSA v1 构建溯源）；npm `sha512`: `sha512-IujK+2If6rwEmL7GloarVj7Lft+d6tIGSHTCUflNZNgwYCYnP375LakLkcTpgWYvENI2IGPtI2NZ2nECh+Tfqw==`（`sha256`: `49a589f34b3d4cc97cf67ad7ea2c5cd6720d571bbd3d147d9bf19eb50dd2140a`）；平台侧车：`@azetus/dsh-quorfloat-darwin@0.1.10` `sha256`: `8ff482f87c8e98ae89516a1f337df13b0881167955df226f6a0584d77ccc357f`，`@azetus/dsh-quorfloat-win32-x64@0.1.10` `sha256`: `99496cd4a49aa20e493795e8bcba483021f5036f6b797e3938f55fa506a4210a` |

### 锁定意图与哈希可行性说明（保障供应链安全）

- **核心意图：保障供应链安全**。第三方插件直接运行在 DSH Node.js 宿主和 Web 前端环境中，具备文件系统、网络与 UI 权限。锁定当前已审计的精确不可变版本（禁止 `^`、`~`、`*`、`latest` 等浮动范围），可防止上游账号劫持、静默发布恶意版本或破坏性依赖升级在不知情时进入本地运行环境。后续如需升级其中任意插件版本，必须在确认重新完成安全性审计后再调整 [package.json](package.json) 锁定版本。
- **为什么使用精确 npm 版本 + profile 锁文件哈希，而非在 `package.json` 中写 Git 提交哈希或 `#sha512` 链接**：
  1. DSH 运行环境所用的 `pnpm v11` 默认开启 `blockExoticSubdeps: true` 安全策略，会拒绝子依赖中的 `github:...#<commit>` 与 `https://...tgz` 外部源（报错 `ERR_PNPM_EXOTIC_SUBDEP`），除非目标 profile 主动放宽全局 `blockExoticSubdeps` 策略（会削弱其余依赖防护）。
  2. 此外，`@dingyi222666/dsh-session-notification` 的 Git 仓库不含编译产物 `lib/` 且带有 `"prepare": "yarn run build"` 脚本，pnpm 会触发 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`；而 pnpm 的 tarball URL 解析器也会忽略 URL 后的 `#sha512-...` 片段。
  3. 相比之下，精确 npm 版本号（`0.2.6`、`0.2.0-alpha.15` 和 `0.1.10`）满足 `blockExoticSubdeps: true`，对应 npm 不可原地篡改的已发布版本，并在安装端 profile 的 `<profile>/pnpm-lock.yaml` 中落地精确的 **SHA-512 SRI 哈希（`integrity`）校验**，同样可防镜像站或传输篡改。（注：`dsh-codex-connect@0.2.0-alpha.15` 对 `undici` 声明的 `^8.12.3` 也会在安装端 `pnpm-lock.yaml` 中被锁定到具体 SHA-512。）
- **`dsh-quorfloat` 自带预编译原生侧车（已审计，接受其局限）**：源码在锁定标签/提交上完整公开，npm 压缩包与 CI 产物逐字节一致，但 macOS 侧车无法在本地逐字节复现（SDK/链接器/绝对路径/签名差异）。审计做到同 rustc 重建的指令级等价（仅 2 条指令差异，归因于 CI 的 SDK/clang 版本）与内嵌 WebView 资源逐字节一致；**依赖/工具链层与运行时行为未审计**。应把它当作另一个本地 DSH 客户端：可创建/读取会话、切换权限预设（含 `danger-full-access`）、代答工具审批；不要在多人共享主机上安装。详见 [docs/audits/dsh-quorfloat-0.1.10.md](docs/audits/dsh-quorfloat-0.1.10.md)。
- **整包顶层提交哈希锁定**：在向 profile 安装本组合包本身时，可直接按 40 位 Git 提交哈希唯一锁定整套组合包：
  `dsh plugin --profile desktop add github:hysonger/my-dsh-plugins#<40-char-commit-sha>`

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

## 组合包一键安装（通过仓库名安装组合包内插件）

通过 CLI 或 DSH 插件管理页（**添加插件**）输入 GitHub 仓库标识，即可一次性安装全部插件：

```sh
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins
# 或按 40 位 Git 提交哈希精确锁定整包版本：
dsh plugin --profile desktop add github:hysonger/my-dsh-plugins#<40-char-commit-sha>
```

DSH 同样接受 `https://github.com/hysonger/my-dsh-plugins` 或 `git+ssh://git@github.com/hysonger/my-dsh-plugins.git`（注意：不带 `github:` 前缀的裸 `owner/repo` 会被 DSH 安装规约校验拒绝）。

如从本地检出目录整包安装，请带上 `file:` 前缀，使 pnpm 一并安装子插件、锁定的第三方插件及运行时依赖：

```sh
dsh plugin --profile desktop add "file:$PWD"
```

> [!NOTE]
> `dsh-codex-connect` 会通过 `@earendil-works/pi-ai@0.85.1` 传递引入 `@google/genai@1.52.0` 与 `protobufjs@7.6.6`；在全新 profile 首次安装时，pnpm 会因默认拦截生命周期脚本报 `ERR_PNPM_IGNORED_BUILDS`。经审计二者无需在 DSH 中执行安装脚本，建议在 `<profile>/pnpm-workspace.yaml` 的 `allowBuilds` 中将其设为 `false`。若 CLI 执行 `dsh plugin add` 因此中止且已在 `<profile>/package.json` 写入依赖，请将两项设为 `false` 后执行 `dsh plugin --profile <name> remove my-dsh-plugins` 再重新 `add`，以确保 `my-dsh-plugins` 正确写入 `dsh.profile.bundles`。

注意：不要在同一 profile 中同时启用整库组合包 `my-dsh-plugins` 与重复的单个 `dsh-plugin-*` 或独立安装的 `dsh-session-notification` / `dsh-codex-connect` 组合包，以免补丁注入重复插件 ID。

## 单插件本地安装

仍可按单个插件目录的本地绝对路径单独安装。将仓库放在固定位置后，在仓库根目录运行：

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-mermaid"
```

其他插件同理，替换最后的目录名即可。在新环境中，先按对应插件 README 安装其依赖。当前工作区已有的本地链接和依赖可以继续使用，整合仓库后不需要重新安装。

各本地插件目录保持自包含，不依赖根目录的 npm workspace；各插件的 `lib/`、图标和其他运行资源继续随源码保存。根目录 [package.json](package.json) 通过 `"dsh": { "bundle": { "patch": [...] } }` 复用各本地插件的 `cordis.patch.yml` 以及根目录 [cordis.patch.yml](cordis.patch.yml)（用于加载被 profile 提升安装到 `node_modules` 的锁定第三方插件），并汇总声明子插件的运行时依赖，无需在安装阶段执行构建脚本。修改和构建方式见各自 README。

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

## 许可证

许可证沿用各插件的声明、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`；本次整合不调整代码、图标或第三方资源的授权范围。
