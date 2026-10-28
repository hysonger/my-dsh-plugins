# DSH 防睡眠开关

在 DeepSeek Harness（DSH）聊天主界面的 composer 工具栏中增加“防睡眠”开关，通过 macOS 的 `pmset disablesleep` 控制系统睡眠。每次切换都会请求 macOS 原生管理员授权，密码不经过插件或 DSH。

## 功能

- 开关位于输入框工具栏、发送按钮之前；窄屏下收起文字，仅显示月亮图标和开关。
- 开启：`sudo pmset -a disablesleep 1`。
- 关闭：`sudo pmset -a disablesleep 0`。
- 初次加载通过 `pmset -g` 读取真实 `SleepDisabled` 值。
- 命令结束后再次读取并验证，不以按钮点击直接推断成功。
- 等待授权、取消和失败时，在 composer 下方显示临时状态；失败后可重试读取。
- 同一 DSH 页面中的多个会话共享开关状态。
- 仅支持 macOS；其他平台显示不支持且不执行命令。

## 安装

在 DSH 插件管理器中以本地目录安装本包，或使用命令行（将路径替换为本目录的绝对路径）：

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-plugin-sleep-control
```

本包无第三方运行时依赖，也无构建步骤。Host 和 Client 文件均直接由 DSH 加载。

## 使用与授权

打开任意会话，在主界面输入框工具栏点击“防睡眠”。macOS 会显示系统管理员授权窗口；由用户本人输入凭据。可能显示 `osascript` 请求修改系统设置，这是 macOS 执行 AppleScript 提权的正常表现。

实现使用以下固定命令之一，参数不接受外部拼接：

```applescript
do shell script "/usr/bin/sudo /usr/bin/pmset -a disablesleep 1" with administrator privileges
```

关闭时使用 `0`。普通状态读取不需要管理员权限。

**关闭开关、退出 DSH 或卸载插件不会自动恢复系统睡眠设置。** 若已开启防睡眠，请通过开关关闭，或手动执行：

```bash
sudo pmset -a disablesleep 0
```

可用以下命令检查当前值：

```bash
pmset -g
```

输出中的 `SleepDisabled 1` 表示已阻止系统睡眠，`0` 表示允许系统睡眠。

## 安全边界

- Client 只能访问两个同源接口：`GET /sleep-control/api/status` 和 `POST /sleep-control/api/set`。
- 接口仅接受 loopback 连接；状态接口向当前 Client 下发仅保存在内存中的随机 mutation token，修改接口必须携带该令牌。
- 修改接口还校验同源 Fetch Metadata；存在 Origin 时要求精确 DSH Origin（或 Desktop 的 `dsh-app://app`）。Desktop 转发会剥离 Origin 和 Fetch Metadata，因此以自定义请求头中的 mutation token 维持 CSRF 防护。
- 请求体限制为 1024 字节，超限立即拒绝并关闭连接；进程错误只向浏览器返回固定文案。
- 不开放 CORS，不缓存状态响应。
- 不注册 Agent Tool，模型没有专用接口可代替用户切换或请求管理员授权。
- Host 同时只允许一个提权操作，避免叠加多个系统授权弹窗；禁用或卸载插件会中止仍在等待的受管子进程，超时会先发送 SIGTERM、再升级为 SIGKILL。
- 密码只由 macOS 系统授权窗口处理，插件不读取、记录或保存。

## 当前限制

本期不监听其他应用对 `SleepDisabled` 的后续修改。页面挂载时会读取一次，本插件操作后会读回验证；若其他应用在页面打开期间改变设置，本开关不会实时跟随。重新挂载页面或点击失败后的“重试”可重新读取。

该开关控制的是 macOS 全局电源设置，不是单个 DSH 会话的临时 caffeinate 进程。DSH 退出后设置仍然有效。

## 开发与测试

```bash
node --test test/
npm run check
```

测试通过注入伪进程执行器覆盖命令构造、状态解析、授权取消、读回验证、并发限制、API 输入校验和 Client 状态转换；正常运行测试不会调用真实 `sudo` 或修改电源设置。

真实验收应由用户记录原始 `SleepDisabled`，在 macOS 授权窗口中完成开启/关闭测试，并恢复原值。
