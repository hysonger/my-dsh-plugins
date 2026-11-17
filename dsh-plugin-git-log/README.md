# dsh-plugin-git-log

[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 右侧边栏 Git 提交日志插件。

打开任意关联了本地工作区目录的会话后，可在右侧边栏中直接查看当前仓库的分支状态、提交图谱、提交详情与按文件展开的 Diff 预览，无需切回外部终端。

## 功能特性

- **绑定当前会话工作区**：自动读取当前会话 `cwd` 对应的 Git 仓库，切换会话或工作区时自动切换并刷新；非 Git 目录、未初始化提交（unborn）和无工作区会话均有清晰提示。
- **右侧边栏原生集成**：
  - 注册右侧边栏标签页类型 `git-log`，出现在右侧边栏引导页与 `+` 新建标签页菜单中（位于「工作区文件」旁）；
  - 在会话标题栏右侧、侧边栏展开/收起按钮左侧提供快捷图标按钮（与「变更请求」按钮同一区域）：点击打开或聚焦 Git 日志标签页，标签页已显示时再次点击收起侧边栏；
  - 在「工作区文件」标签页右上角提供一键直达 Git 日志的图标按钮；
  - 注册快捷键 `Ctrl+Shift+G`（可在 DSH 快捷键设置中自定义；Linux Web 端受浏览器热键保留限制默认不预占绑定，仍可点击标题栏按钮或在快捷键设置中自行绑定 `Ctrl+Shift+,`），并绑定 DSH 标签页刷新快捷键（`Cmd+R` / `Ctrl+R`）；
  - 标签页标题实时显示当前分支徽章与工作区未提交变更状态点。
- **分支与搜索筛选**：
  - 支持筛选当前分支 `HEAD`、全部分支与标签（`--all`）、单个本地分支、远程分支或标签；
  - 支持搜索过滤，并可切换范围：**全部**（说明 + 作者 + 哈希前缀 + Ref）、**提交说明**、**作者**、**文件路径**；
  - 支持分页加载历史提交，窗口重新聚焦时自动轻量刷新。
- **提交图谱与详情预览**：
  - 每条提交显示 SVG 拓扑分支图谱、引用徽章（`HEAD` / 分支 / 远程 / 标签）、短哈希、作者与相对时间；
  - 支持键盘 `ArrowUp` / `ArrowDown` 浏览提交、`Escape` 关闭详情面板；
  - 窄边栏下自动采用上下分栏（支持一键放大详情区），宽屏 / 全屏下自动切换为左右分栏；
  - 点击提交查看完整说明、父提交跳转、一键复制完整 SHA、变更文件清单（`A`/`M`/`D`/`R`/`C` 与 `+`/`-` 行数统计）、按文件懒加载的统一 Diff（含行号与大体积安全截断保护），以及在 DSH 文档预览中打开当前工作区文件。

## 安装

以本地路径方式安装到 DSH `desktop` profile（推荐，改源码即生效）：

```bash
dsh plugin --profile desktop add "/Users/songer/Projects/my-dsh-plugins/dsh-plugin-git-log"
```

查看已安装状态与启用情况：

```bash
dsh plugin --profile desktop list
```

如需卸载：

```bash
dsh plugin --profile desktop remove dsh-plugin-git-log
```

> 安装或更新 `package.json` / `cordis.patch.yml` 后，重启 DSH 桌面端或宿主服务以加载新插件。

## 使用方式

1. 打开一个绑定了 Git 仓库工作区的 DSH 会话；
2. 通过以下任意入口打开 **Git 日志** 标签页：
   - 点击会话标题栏右侧、侧边栏展开/收起按钮左侧的 Git 分支快捷按钮（与「变更请求」按钮同一区域）；
   - 点击右侧边栏 `+` 新建标签页 / 引导卡片中的 **Git 日志**；
   - 在右侧边栏 **工作区文件** 顶部工具栏点击 Git 分支图标；
   - 按快捷键 `Ctrl+Shift+G`（Linux Web 默认留空，可在快捷键设置中自行绑定 `Ctrl+Shift+,`）。
3. 在列表中选择任意提交查看详情，点击变更文件名即可展开/折叠该文件的 Diff。

## 配置项

可在 `cordis.patch.yml`（或 DSH 配置中）调整以下参数：

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `allowRemote` | `boolean` | `false` | 是否允许非回环地址访问插件 HTTP 接口 |
| `maxPageSize` | `integer` | `50` | 单页最多加载的提交数（范围 `5` ~ `200`） |
| `maxDiffBytes` | `integer` | `262144` | 单文件 Diff 返回上限字节数（默认 256 KiB，超过后安全截断） |
| `commandTimeoutMs` | `integer` | `10000` | 单次 `git` 子进程调用超时时间（毫秒，`500` ~ `120000`） |

## 架构与安全设计

- **只读最小权限**：插件仅提供 `GET`/`HEAD` 只读查询接口，不包含任何修改仓库（checkout/commit/reset 等）或写文件操作。
- **安全子进程执行**：通过 `spawn('git', ...)` 显式参数数组执行，禁止 shell 拼接；配置 `GIT_CONFIG_COUNT=0`、`GIT_TERMINAL_PROMPT=0`、`GIT_OPTIONAL_LOCKS=0`、`LC_ALL=C`、`--no-ext-diff`；严格校验 commit hash 与 ref 语法并使用 `--` 分隔路径，防止参数注入。
- **本地访问隔离**：默认仅接受回环地址与回环 `Host`，拒绝 `Sec-Fetch-Site: cross-site` 及外部 `Origin`，数据接口校验自定义请求头 `x-dsh-git-log: 1` 与可选 `ctx.connection.requestRejection`，防御 CSRF 与 DNS Rebinding。
- **零第三方运行时依赖**：宿主机侧仅依赖 Node.js 内置模块与系统 `git`；客户端仅使用 DSH 平台模块表内置的 `react`。

## 开发与测试

```bash
# 重新生成 lib/client.js 与 src/client/protocol-copy.js
npm run build

# 检查打包同步并运行全部自动化测试
npm run check
```

## 排障

- **提示「宿主环境未检测到 git 命令」**：确认 `git` 已安装且在 DSH 宿主进程的 `PATH` 中可见（如 macOS Homebrew `/opt/homebrew/bin/git`、Xcode Command Line Tools `/usr/bin/git`，或 Windows Git for Windows 的 `cmd\git.exe`）。
- **右侧边栏未出现「Git 日志」**：确认插件已在目标 profile 启用，且修改 `package.json` 后已完整重启 DSH App；可在设置或终端执行 `dsh plugin --profile desktop list` 排查。
- **切换分支或外部提交后未立即更新**：点击右上角刷新图标、按刷新快捷键 `Cmd+R` / `Ctrl+R`，或将窗口重新切回前台触发自动刷新。
