# OpenCode Go 会话修复

适用于已复现问题的 **DSH Desktop 0.2.2-rc.3 / pi-ai 1.3.0**。这是过渡修复，不是 OpenCode 官方插件；升级后请先看[背景与停用判据](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/BACKGROUND.md>)，不要永久叠加补丁。

## 修复什么

内置目录不认识 `hy4` 等新模型时，需要显式 `api: openai-completions`。但这版 DSH 的显式协议路径绕过 OpenCode Provider 的会话头包装器，导致 `400 MissingSessionID`。插件通过公开的 `llm-pi-ai/request-headers` 事件补充缺失的 `x-opencode-session`，使用该请求已有的、逐会话稳定的 `sessionId`。

仅作用于 **`opencode-go` + `https://opencode.ai`**。已有同名头优先；其他提供商、其他主机和没有会话 ID 的调用不变。不读取 API Key，不注册 Agent 工具、HTTP 路由或 UI 面板，不修改安装包或全局 `fetch`。

## 安装及一次性配置修复

通过 DSH Plugin Manager 以本目录的本地绝对路径安装，或：

```sh
dsh plugin --profile desktop add /Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session
```

保持目录位置不变；安装会保留本地链接。插件无外部依赖、构建步骤或安装脚本。

首次安装的 `repairProtocolOnLoad: true` 会通过 DSH 官方 `settings.mutate()`，在已有的、基础 URL 恰为 `https://opencode.ai/inference/go/openai/v1` 且模型列表非空的 `opencode-go` 路由中，将**尚未设置**的 `api` 设为 `openai-completions`。已有其他显式协议会被拒绝覆盖。它不新增提供商，不修改 URL、密钥引用、模型列表、容量、推理档位或其他提供商。

随后通过 `configEditor.edit()` 将插件自己的开关持久保存为 `repairProtocolOnLoad: false`；后续启动不会反复恢复 `api`。两次保存均使用 DSH 配置服务及其正常校验、锁和原子写入，不直接读写 profile 文件。迁移监听下一次 Host `tools/result` 完成事件，然后立即撤销这个一次性监听器，在安装/HMR 事务之外保存配置；不读取或修改工具参数与结果，不做后台轮询。由 Agent 工具安装时，安装工具自身的完成事件即可触发；若从 GUI 安装且开关仍为 true，可先让一个已可用模型执行一次只读工具。仅用定时器延迟不够：它仍会继承 HMR 的 AsyncLocalStorage 事务上下文。

确认修复完成时应同时看到：

- 目标路由已有 `api: openai-completions`；
- 插件自己的 `repairProtocolOnLoad` 已变为 `false`；
- Hy4 与 DeepSeek Flash 的最小推理正常。

若迁移未完成，只会记录不含配置值或凭据的警告，开关保持 `true`；本次单次监听已经撤销，不会每个工具完成后反复写配置。检查配置后，在 Plugin Manager 停用再启用本插件，即可为下一次工具完成事件重新挂载单次监听，无需重复安装 bundle。不要把“插件已安装”当作配置已成功保存。该开关是安装迁移标志，不提供通用自动表单；日常开关插件使用 Plugin Manager。

## 升级、停用与回滚

1. 按[升级检查表](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/BACKGROUND.md>)，确认新版是否同时覆盖目录外模型、显式协议路径及所用辅助调用。
2. 在 Plugin Manager **先停用**本插件，再用 DSH 内部渠道测试 Hy4 和 DeepSeek Flash。失败时重新启用；不修改密钥。
3. 如果新目录已包含全部自定义模型，可通过 DSH 的配置界面/配置服务移除路由的 `api` 覆盖，再测一次原生目录路径。不要仅凭“pi-ai 版本较新”就卸载。
4. 确认原生路径通过后移除本地 bundle。停用/卸载只移除监听器，**不会**删除模型或自动撤回已持久化的 `api`。若需要回到修复前状态，还须撤回该字段；目录外模型仍存在时，原始加载错误也会回来。

## 限制与排障

- `hy4-preview` 的 `403 Model access is disabled` 是服务端模型权限，与此补丁无关；需在 Console 的 Models 页面处理。
- 无 `sessionId` 的手工辅助调用需要调用方传入其所属会话 ID；插件不伪造固定值或每次随机值。
- 仅支持当前 `opencode-go` 路由名，不自动扩大到自定义别名/其他域名。遇到已配置的固定会话头，插件遵守显式配置优先；请先移除那个固定值。
- 最小文本推理成功不代表图片、长上下文、所有推理档位和工具调用均已验证。
- Host-only 插件没有可交互面板；Plugin Manager 中应显示“OpenCode Go 会话修复”和链路修复图标。

## 开发检查

```sh
npm --prefix dsh-plugin-opencode-go-session run check
# 在当前 Desktop 提供的 Electron/ASAR-aware runtime 中检查 Cordis 生命周期：
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" dsh-plugin-opencode-go-session/scripts/check-dsh-runtime.mjs
```

背景来源、社区讨论与退役标准见[背景文档](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/BACKGROUND.md>)；本机实测与实施记录见[调查报告](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/REPORT.md>)；权限及数据流见[安全说明](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/SECURITY.md>)。
