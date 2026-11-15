# DSH 防睡眠

在 DeepSeek Harness（DSH）设置窗口新增“防睡眠”分区，提供两种彼此独立、可同时使用的 macOS 防睡眠方式：会话运行期间使用 `caffeinate -s`，或通过管理员授权执行 `pmset` 完全关闭系统睡眠。

## 功能

### 会话运行时防睡眠

- 位于 **设置 → 防睡眠 → 会话运行时防睡眠**，默认关闭，配置持久化到当前 DSH profile。
- Host 通过 `ctx.agents.list()` 和 `agent/status` / `agent/created` / `agent/disposed` 事件跟踪所有实时 Agent，包括多个会话和子 Agent。
- 第一个 Agent 进入 `running` 时启动固定命令 `/usr/bin/caffeinate -s`；重复状态事件不会重复启动进程。
- 最后一个 Agent 离开 `running`、关闭配置或正常卸载插件时停止进程。异常退出会记录日志并退避重启，避免密集重启。
- 不需要管理员权限，不修改全局 `pmset` 设置。

**局限：开盖时可阻止系统睡眠；合盖时只有接入电源才有效，电池供电且合盖时不生效。**

### 完全关闭睡眠

- 位于 **设置 → 防睡眠 → 完全关闭睡眠**，页面以警告色、警告图标和持久状态徽章提示其影响。
- 开启：`sudo pmset -a disablesleep 1`。
- 关闭：`sudo pmset -a disablesleep 0`。
- 每次切换都请求 macOS 原生管理员授权，密码不经过插件或 DSH。
- 页面挂载时通过 `pmset -g` 读取真实 `SleepDisabled`；命令结束后再次读取并验证，不以按钮点击直接推断成功。
- 等待授权、取消和失败时显示状态；失败后可重试读取。

**警告：此方式效果最强，但修改的是全局持久电源设置。关闭开关以外的操作——包括退出 DSH 或卸载插件——不会自动恢复原设置。忘记改回可能导致系统异常耗电。**

两种方式不互斥。开启“完全关闭睡眠”不会隐式修改“会话运行时防睡眠”的配置或进程。

## 安装

在 DSH 插件管理器中以本地目录安装本包，或使用命令行（将路径替换为本目录的绝对路径）：

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-plugin-sleep-control
```

Host 和 Client 均无构建步骤。Host 使用 `@deepseek-ai/schemastery` 声明可由 DSH 设置系统实时编辑的 volatile 配置；本地路径安装下修改源码即生效。

## 使用与授权

打开 **DSH 设置 → 防睡眠**：

1. 需要仅在会话运行时防睡眠时，打开“会话运行时防睡眠”。设置由 Host 接受后才会显示为新值。
2. 需要最强的全局防睡眠时，打开“完全关闭睡眠”。macOS 会显示系统管理员授权窗口，由用户本人输入凭据；可能显示 `osascript` 请求修改系统设置，这是 AppleScript 提权的正常表现。

`pmset` 使用以下固定命令之一，参数不接受外部拼接：

```applescript
do shell script "/usr/bin/sudo /usr/bin/pmset -a disablesleep 1" with administrator privileges
```

关闭时使用 `0`。普通状态读取不需要管理员权限。

若已开启“完全关闭睡眠”，请通过同一开关关闭，或手动执行：

```bash
sudo pmset -a disablesleep 0
```

可用以下命令检查当前值：

```bash
pmset -g
```

输出中的 `SleepDisabled 1` 表示已完全关闭系统睡眠，`0` 表示允许系统睡眠。

## 安全边界

- Client 的 pmset 操作只能访问两个同源接口：`GET /sleep-control/api/status` 和 `POST /sleep-control/api/set`；没有新增 HTTP 路由。
- 接口仅接受 loopback 连接；状态接口向当前 Client 下发仅保存在内存中的随机 mutation token，修改接口必须携带该令牌。
- 修改接口还校验同源 Fetch Metadata；存在 Origin 时要求精确 DSH Origin（或 Desktop 的 `dsh-app://app`）。Desktop 转发会剥离 Origin 和 Fetch Metadata，因此以自定义请求头中的 mutation token 维持 CSRF 防护。
- 请求体限制为 1024 字节，超限立即拒绝并关闭连接；进程错误只向浏览器返回固定文案。
- 不开放 CORS，不缓存状态响应。
- `caffeinate` 使用固定可执行文件和固定参数直接 `spawn`，不经过 shell；会话配置只能通过 DSH 设置系统编辑。
- 不注册 Agent Tool，模型没有专用接口可代替用户切换设置或请求管理员授权。
- Host 同时只允许一个 pmset 提权操作，避免叠加多个系统授权弹窗；禁用或卸载插件会中止仍在等待的受管子进程，超时会先发送 SIGTERM、再升级为 SIGKILL。
- 密码只由 macOS 系统授权窗口处理，插件不读取、记录或保存。
- 仅支持 macOS；其他平台不执行任何电源命令。

## 当前限制

- 不监听其他应用对 `SleepDisabled` 的后续修改。设置页挂载时会读取一次，本插件操作后会读回验证；若其他应用在页面打开期间改变设置，重新进入页面或点击失败后的“重试”可重新读取。
- `caffeinate` 的正常启停依赖 Host 生命周期和 Agent 状态事件；页面是否打开、当前选中哪个会话不影响判断。
- `caffeinate` 只负责运行期间的临时电源断言；`pmset` 则是全局持久设置。两者都不要求 DSH 页面保持在前台，但 `pmset` 在 DSH 退出后依然有效。

## 开发与测试

```bash
npm install
npm test
npm run check
```

测试通过注入伪进程执行器、伪 `caffeinate` 子进程和伪 Agent 注册表，覆盖命令构造、状态解析、授权取消、读回验证、并发限制、配置更新、进程启停与清理、API 输入校验和 Client 状态转换；正常运行测试不会调用真实 `sudo`、`pmset` 或 `caffeinate`，也不会修改电源设置。

真实验收可在一个或多个会话开始/结束运行时检查进程与电源断言：

```bash
pgrep -fl caffeinate
pmset -g assertions
```

涉及真实 `pmset` 的验收应先记录原始 `SleepDisabled`，在 macOS 授权窗口中完成开启/关闭测试，并在结束后恢复原值。
