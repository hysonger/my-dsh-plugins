# my-dsh-plugins

个人定制的 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness)插件集中存放目录。本目录是统一的 Git 仓库，每个插件子目录仍是一个独立的 DSH 插件包。所有提交和分支在根仓库维护，不要在插件子目录创建嵌套 Git 仓库。

## 目录内容

| 目录 | 说明 |
|---|---|
| `dsh-plugin-usage-board/` | 用量看板插件：在 DSH Web 侧边栏面板中显示 DeepSeek（余额与近 14 天消耗趋势）、GLM Coding Plan 与 Kimi Code（5 小时/每周额度窗口）的用量、额度和余额。数据全部来自三家官方接口，凭据复用 DSH 已保存的授权，密钥不经浏览器。另注册 `usage_query` 工具，让 AI 直接查询同一份用量、额度与余额。详见其 [README](dsh-plugin-usage-board/README.md) 与 [docs/ARCHITECTURE.md](dsh-plugin-usage-board/docs/ARCHITECTURE.md)。 |
| `dsh-plugin-kimi-web-search/` | Kimi Code 网页工具：提供独立的 `kimi_web_search` / `kimi_web_fetch` 与配套 Web 卡片，直连 Kimi Search/Fetch API；旧 `kimi-code-search` Provider 可显式启用，默认不改变内置 DeepSeek 工具选择。详见其 [README](dsh-plugin-kimi-web-search/README.md) 与 [docs/RESEARCH.md](dsh-plugin-kimi-web-search/docs/RESEARCH.md)。 |
| `dsh-plugin-open-here/` | 终端直达插件：提供 `dsh-open [dir]` 命令，从终端（及 Finder 右键快速操作、工具栏按钮、打开方式、Dock 拖放等 macOS 入口）在运行中的 DSH App/Web GUI 中打开目录为工作区。宿主路由 + 客户端 SSE 桥，详见其 [README](dsh-plugin-open-here/README.md)；Finder 集成的模板与脚本在其 `macos/` 目录。 |
| `dsh-plugin-mermaid/` | Mermaid 图表插件：在已完成的助手回复中原位把 `mermaid` / `mmd` fence 渲染为图，支持滚轮/触摸板缩放、拖动平移、独立大图预览、源码/图表切换和复制；本地打包 Mermaid，严格安全配置。详见其 [README](dsh-plugin-mermaid/README.md)。 |
| `dsh-plugin-sleep-control/` | 防睡眠插件：在 DSH 设置的“防睡眠”分区提供会话运行时防睡眠（macOS 使用 `caffeinate -s`，Windows 使用 `SetThreadExecutionState` 辅助进程）与仅 macOS 的“完全关闭睡眠”两种独立方式；后者通过 macOS 原生管理员授权执行固定 `sudo pmset -a disablesleep 1 / 0` 并读回验证，具有全局持久效果和警告提示；通过 `dsh.bundle.platforms` 与插件行 `!!js` 条件仅在 macOS/Windows 启用；不保存凭据、不提供 Agent Tool。详见其 [README](dsh-plugin-sleep-control/README.md)。 |
| `dsh-plugin-opencode-go-session/` | OpenCode Go 过渡修复：通过公开请求头事件为显式协议路由补逐会话标识；安装时用官方配置服务执行受限、一次性的协议迁移，不读取 API Key。DSH 升级后先按 [背景与停用判据](dsh-plugin-opencode-go-session/docs/BACKGROUND.md) 验证再移除；详见其 [README](dsh-plugin-opencode-go-session/README.md)。 |
| `dsh-plugin-git-log/` | Git 日志视图：在 DSH 右侧边栏提供随当前工作区切换的 Git 日志标签页，支持分支/标签筛选、搜索、SVG 提交拓扑图谱与按文件 Diff 预览；详见其 [README](dsh-plugin-git-log/README.md)。 |
| `dsh-plugin-subagent-model/` | 子智能体模型显示：在可继续子智能体会话输入栏的 `conversation.input.right` 插槽中只读显示当前模型、徽标、思考强度及详情卡片；复用 `modelSelection` 投影与目录元数据，不触发受限选择调用；详见其 [README](dsh-plugin-subagent-model/README.md)。 |
| 根 `cordis.patch.yml` | 纳入已通过安全审计并锁定精确版本的第三方插件（`@dingyi222666/dsh-session-notification@0.2.6`、`dsh-codex-connect@0.2.0-alpha.15`），锁定意图为保障供应链安全（`dsh-pet` 由独立仓库维护并单独安装，不纳入本组合包；详见 [README.zh-CN.md](README.zh-CN.md)）。 |

## 约定

- **根组合包**：根目录 `package.json` 将本仓库声明为 DSH 组合包（`my-dsh-plugins`），通过 `dsh.bundle.patch` 列表复用各子插件的 `cordis.patch.yml` 与根目录 `cordis.patch.yml`（因 DSH 按组合包目录而非提升后的 `node_modules` 解析 `dsh.bundle.patch`），并在 `dependencies` 中列出各本地子插件及其运行时 npm 依赖（因 git 安装时 pnpm 不会递归安装 `file:./` 子包的依赖），以及锁定精确版本的已审计第三方插件（满足 pnpm `blockExoticSubdeps: true`，并由安装端 `pnpm-lock.yaml` 校验 `sha512`）。可用 `github:hysonger/my-dsh-plugins`（可加 `#<commit-sha>` 按提交哈希唯一锁定整套组合包）或本地 `file:$PWD` 一次性安装全部插件；根目录不设构建脚本以避免 git 安装触发 `allowBuilds`。
- **新增插件**：在根目录下新建独立目录，作为标准 DSH 插件包（`package.json` 含 `dsh` 字段，`cordis.patch.yml` 为 profile patch 层），并同步加入根目录 `package.json` 的 `dependencies`、`dsh.bundle.patch`（连同其运行时依赖），使用根仓库统一提交，不再独立 `git init`。
- **运行插件**：按单插件开发/调试时继续以插件子目录的本地绝对路径安装进 DSH（`dsh plugin --profile desktop add <绝对路径>`），本地路径安装下改源码即生效；整包本地安装使用 `dsh plugin --profile <name> add "file:$PWD"`。保持现有目录位置及本地链接，不擅自改成远端安装。
- **测试**：根目录运行 `npm run check`（`node --test test/`），各插件进入对应目录运行各自检查（如 `npm --prefix <dir> run check` / `node --test test/`）。
- **文档**：每个插件在自己的 `README.md` 中说明安装、配置与排障；跨插件的公共约定写在根目录本文件。

## 规则

用户可能在本工作区内做添加或更新第三方插件的工作。注意：对于外来插件（以及拟升级至新版本的已纳入第三方插件），安装、纳入组合包或调整 `package.json` 锁定版本前一律先进行系统的**安全性审计**并核对摘要，否则不得实施安装或放宽锁定版本；根组合包对第三方插件固定精确版本（禁用浮动范围）的意图为**保障供应链安全**。

## 单仓库范围与历史

- 根目录 `README.md` 为插件入口，各插件保留独立的 `package.json`、依赖和测试，不依赖根 npm workspace。
- `_upstream/`、`research/`、`.dsh-feasibility-*/`、依赖、缓存和迁移备份为本地材料，由根 `.gitignore` 排除。
- 迁移记录和旧 SHA 对应关系见 `docs/migration/`。旧历史已统一增加插件目录前缀，后续正常使用根仓库提交。
- 创建 GitHub 远程仓库和推送需要用户单独批准；本地整合本身不包含发布。
