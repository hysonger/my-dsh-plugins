# dsh-plugin-open-here

从终端一键在 DeepSeek Harness 中打开目录：

```bash
dsh-open          # 在 DSH 中打开当前目录
dsh-open ~/code/x # 打开指定目录
```

行为与在 GUI 侧边栏点击工作区完全一致：目录已注册为工作区则直接切换，未注册则自动创建后切换；主视图会复用该工作区的空白会话或新建一个会话。

- **App 优先**：正在运行的桌面 App 收到请求后跳转，并通过 `dsh://open` 深链把窗口带到前台；App 未运行时脚本会自动启动它，等后端就绪后完成打开。
- **Web 兜底**：桌面后端不可达、但有运行中的 `dsh web` 实例（且同样安装了本插件）时，自动改用该实例，并在浏览器中打开带认证的 URL。

## 工作原理

```
终端 dsh-open ──POST(带令牌)──▶ 宿主路由 POST /open-here/open
                                   │ workspaceRegistry.resolveByPath ?? create
                                   ▼
                       pending 意图 + SSE 广播 /open-here/events
                                   │
  App webview / 浏览器中的客户端半 ◀──SSE / 启动时拉取 /open-here/pending
                                   │ ctx.uiWorkspace.openWorkspace(workspaceId)
                                   ▼
                         GUI 切换到目标工作区
```

- 桌面后端端口是每次启动随机分配的临时端口，插件激活时把 origin、认证 URL、pid、profile 名写入发现文件 `$DSH_HOME/open-here/runtime-<profile>.json`（0600），卸载时删除。
- 首次激活生成令牌 `$DSH_HOME/open-here/token`（0600），之后复用，脚本无需重新配置。
- GUI 不在线时意图进入 pending 槽（默认 5 分钟 TTL，最新覆盖最旧），GUI 启动/重连后补送。

## 安装

### 1. 安装插件（desktop profile）

在 DSH 会话中通过插件管理器以本地路径安装本目录，或：

```bash
dsh plugin --profile desktop add /Users/songer/Projects/my-dsh-plugins/dsh-plugin-open-here
```

本地路径安装下改源码即生效。可选：为 web 兜底再装进 web profile：

```bash
dsh plugin --profile web add /Users/songer/Projects/my-dsh-plugins/dsh-plugin-open-here
```

### 2. 安装终端命令

```bash
ln -sf /Users/songer/Projects/my-dsh-plugins/dsh-plugin-open-here/bin/dsh-open /usr/local/bin/dsh-open
```

（或 `~/bin` 等任何在 `PATH` 中的目录。）

### 3. 让 DSH 运行一次

启动 App（或 `dsh web`），插件激活后会生成令牌与发现文件。之后即可在任意终端使用 `dsh-open`。

## 配置

profile 行配置（见 `cordis.patch.yml`）：

| 键 | 默认 | 说明 |
|---|---|---|
| `allowRemote` | `false` | 放开后非环回地址也可调用 API（仍受令牌保护）。一般保持默认。 |
| `pendingTtlMs` | `300000` | 无 GUI 在线时意图的保留时长（1s–1h）。 |

脚本选项：`--app` 只考虑桌面 App；`--web` 只考虑运行中的 `dsh web` 实例。

## 安全模型

- `POST /open-here/open`（唯一的写操作）：要求 Bearer 令牌 + 环回地址（除非 `allowRemote`）+ `Content-Type: application/json` + 拒绝跨站 `Origin`，四重条件共同挡住本地提权与浏览器 CSRF。
- `GET /open-here/events` / `/pending` 不验令牌（浏览器端读不到本地令牌文件），但只暴露 workspaceId（UUID），仅环回可达，且不下发任何 CORS 头，跨源网页无法读取响应。
- 令牌与发现文件均为 0600，存于 `$DSH_HOME/open-here/`。

## 排障

| 现象 | 排查 |
|---|---|
| `no token at ~/.dsh/open-here/token` | 插件未安装，或安装后 DSH 尚未运行过一次。 |
| `no reachable DSH instance` | App 未运行且自动启动失败；手动打开 App，或运行 `dsh web`。 |
| 请求成功但 GUI 未跳转 | GUI 可能尚未加载客户端半：刷新 GUI 页面；意图在 TTL 内会补送。 |
| App 启动了但脚本超时 | 后端启动慢于 45s，重跑一次 `dsh-open` 即可。 |
| 换了 `DSH_HOME` | 脚本与插件都读 `DSH_HOME` 环境变量，保持一致即可。 |

## 测试

```bash
node --test test/
```

## 平台

目前仅支持 macOS（窗口聚焦/启动依赖 `open` 命令与 `dsh://` 深链注册）。
