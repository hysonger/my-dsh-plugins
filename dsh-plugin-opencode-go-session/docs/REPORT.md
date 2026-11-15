# OpenCode Go 调查与实施报告

日期：2026-11-15（Asia/Shanghai）。本机：DSH Desktop 0.2.2-rc.3 / pi-ai 1.3.0。

## 调查结论与社区交叉验证

目录外新模型需要显式协议，但当前显式协议分支绕过 OpenCode Provider 的会话头包装，导致 `400 MissingSessionID`。完整原因、Discussion 检索范围、关键原文和升级停用判据见[背景文档](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/BACKGROUND.md>)。

同类报告包括 [#12238](https://github.com/deepseek-ai/deepseek-harness/discussions/12238)、[#7887](https://github.com/deepseek-ai/deepseek-harness/discussions/7887)，以及 [#5495 的明确分支说明](https://github.com/deepseek-ai/deepseek-harness/discussions/5495#discussioncomment-18498814)：

> “The one piece a bump does **not** cover: a hand-declared or protocol-overridden route.”

这与本机对照结果一致。普通 catalog 聊天路径已修复不意味着显式 api 路径也已修复；社区提到 pi-ai 1.4.0 的兜底应按实际安装版本及功能测试核实，不能仅依据帖子卸载补丁。

## 第一阶段：修复前的 DSH 内部最小推理

使用同一 Desktop 的 Electron runtime，调用已安装 DSH 的 `ctx.llm.stream()`、官方 pi-ai 适配器和官方凭据插件。诊断程序没有读取凭据文档、没有调用凭据 resolve/readRecord、没有获取或输出 API Key，也没有自己构造模型 HTTP 请求。单个小提示词，无项目文件、历史会话、图片或工具；通常 64-token 输出预算，无 SDK/Agent 自动重试。

| 对照 | 结果 |
|---|---|
| 原配置，不写 api，DeepSeek V4.1 Flash | 200，回复 2 |
| 只增加 api，DeepSeek Flash / Hy4 | 均 400 MissingSessionID |
| api + 每会话动态补头 | DeepSeek Flash、Hy4、Kimi K3.1 Pro、Kimi K3、Gemini 4 Argon、GLM-5.3 均 200、回复 2 |
| GLM-5.3-Flash | 首次 200 但 64-token 思考预算耗尽；256-token 重试正常回复 2 |
| Hy4 preview | 403 Model access is disabled，独立的服务端访问权限问题 |
| DeepSeek 两轮原生 reasoning/replay | 均 200，依次回复 2、3 |

> “Request is missing x-opencode-session and cannot be routed efficiently.”
>
> ——[修复前实际失败对照](</Users/songer/Projects/my-dsh-plugins/research/opencode-go-20261115/explicit.jsonl#L2-L3>)

此阶段共 14 次请求：11 次 HTTP 200（含一次预算耗尽）、2 次 HTTP 400 对照、1 次 HTTP 403；上游累计报告总 tokens 789，其中缓存读取 73。该统计不包括调查主会话或研究子代理自身的用量。

原始详细记录保存在本机工作区的[第一阶段报告](</Users/songer/Projects/my-dsh-plugins/research/opencode-go-20261115/REPORT.md>)及其相邻 JSONL 文件。该目录属于被 Git 忽略的本地调查材料；本报告和背景文档保存在未被忽略的插件目录中，可随代码一并提交，避免只留下临时笔记。

## 第二阶段：已实现的最小修复

- Host-only，零依赖；公开 request-headers 事件，逐会话补缺失头，严格限定 provider 与官方 origin，保留已有头。
- 一次性、受限的 settings.mutate 配置修复，随后消费自身迁移开关；不改密钥、模型列表、其他提供商或服务端授权。
- 无全局 fetch patch、HTTP endpoint、Agent Tool 或 ASAR 修改。
- 包内提供背景、Discussion 原文和永久评论链接、升级复测停用流程与安全边界。

以下为实际执行过的安装、独立审查和修复后验证记录；未列为通过的能力不作扩大保证。

### 安装验证捕获的迁移缺陷

首次安装返回 `application: applied`，但实际 api 仍未保存，迁移标志也未消费；因此没有把安装成功当成修复成功。追踪本机 HMR 源码发现 `runExclusive()` 用 `AsyncLocalStorage<boolean>` 拒绝继承的嵌套事务：在安装期间创建的 0ms timer 仍会继承该上下文，延迟执行也无法退出事务。

已把触发器改为下一次公开 `tools/result` 完成事件的单次被动监听：安装期只注册，工具完成后在新的执行上下文中保存配置，触发立即撤销监听，不读工具内容、不修改工具结果。新增了 timer 继承上下文的负对照，以及工具事件逃逸安装上下文、只执行一次的回归测试。同时将自身 Loader entry 的读取推迟到事件触发时，避免同步 apply 阶段 metadata 尚未附着。下列最终配置与调用验证已确认新版实现生效。

### 最终安装与配置结果

**已安装并启用 `dsh-plugin-opencode-go-session@0.1.1`，Desktop profile，保持本地链接。** 通过 Plugin Manager 管理；修订源码后正常停用/重新启用 bundle 触发重新组合，两次均返回 `application: applied`、无激活警告，没有重启 App 或修改 ASAR。第一次重复调用 install 被管理器以 already-installed 拒绝，未绕过检查或手改 profile manifest。

官方配置服务已持久保存：

```yaml
# 原有 opencode-go provider 内仅增加：
api: openai-completions

# 本插件自己的 profile 覆盖：
repairProtocolOnLoad: false
```

与修复前保存的配置对象哈希逐行比较：撤回上述 api 字段后，所有旧 profile 行的对象哈希完全一致。模型列表、容量、推理档位、凭据引用、其他提供商和子代理授权清单均未改变。正常新增内容只有 bundle/dependency 登记及本插件自己的消费标志。

> `"allPreviousRowsUnchangedExceptTargetApi": true`
>
> ——[配置验证记录](</Users/songer/Projects/my-dsh-plugins/research/opencode-go-20261115/installation-verification.json>)

### 最终验证结果

- **31 项离线测试全部通过**：host/协议/provider 边界、已有头保留、会话隔离、CRLF/Unicode 等非法值、一次性路径编辑与 revision、失败后不消费标志、ALS 安装上下文负对照和外部工具事件触发。
- 当前 Desktop 的真实 Cordis runtime 离线集成检查通过：启用补头、停用撤销、重新启用及其他头保留。
- 包装与资源检查通过：零依赖/安装脚本，语法与 JSON、本地导出路径、实际 dry-run 文件清单、SVG 自包含 XML、中英文标题/说明和详情文档均可读取。
- 独立代码安全与 UX 复核完成，未发现 P0/P1 安装阻塞；安装暴露迁移问题后，再次复核新的被动工具完成事件方案。首个 Kimi 审查代理异常退出无结论，没有计作通过；替代复核使用 OpenAI GPT-6-Luna。
- **当前运行中的 Desktop 实例**经 `opencode-go/deepseek-v4.1-flash` 的真实子代理调用正常完成，最终输出仅 `2`，未调用工具。这验证了当前 Host 的显式 api + 已挂载监听器链路，而不只是隔离探针。
- **从实际 profile 解析已安装插件**（不是探针内联补头）后，Hy4、GLM-5.3-Flash、Kimi K3.1 Pro、Kimi K3、Gemini 4 Argon、GLM-5.3 全部 HTTP 200、`finish: stop`、回复 `2`。DeepSeek Flash 的两轮 reasoning/replay 也均 HTTP 200，依次回复 `2`、`3`。

> `"pluginLoadedFromProfile": true`
>
> `"model":"hy4" ... "status":200 ... "finish":"stop","text":"2"`
>
> ——[已安装插件的实际模型验证](</Users/songer/Projects/my-dsh-plugins/research/opencode-go-20261115/installed-models.jsonl#L1-L2>)，为便于阅读截取相应字段。

本阶段隔离原生探针共 **8 次网络推理请求，7 个模型，全部正常完成，上游累计报告 583 tokens**；不包括上述当前 Host 子代理调用、调查或审查代理自身的用量。未再请求已知被禁用的 Hy4 preview，也未更改其权限。

具体记录：[六个模型](</Users/songer/Projects/my-dsh-plugins/research/opencode-go-20261115/installed-models.jsonl>)、[DeepSeek 双轮](</Users/songer/Projects/my-dsh-plugins/research/opencode-go-20261115/installed-replay.jsonl>)、[配置保存](</Users/songer/Projects/my-dsh-plugins/research/opencode-go-20261115/installation-verification.json>)。所有推理仍由 DSH 原生服务、适配器与凭据插件处理，没有提取、解密、打印或复制 API Key。

### 仍需用户注意

1. Hy4 preview 的 403 模型访问关闭问题仍在；这是 Console 权限，不绕过、不自动启用。
2. 没有扩充子代理模型授权清单。模型在一般 provider 配置中存在，不表示它自动获得子代理选择权限。
3. 无已认证页面的浏览器控制，本次没有搜索认证令牌或个人浏览器数据。Plugin Manager 实际渲染、深浅主题及图标像素外观**未验证**；已核对安装资源及双语元数据，Host-only 插件没有新面板。
4. 没有覆盖图片、所有推理档位、工具调用、长上下文或无 sessionId 的辅助调用。后者须由调用方提供会话身份。
5. 插件代码、根目录入口文档、背景和本报告由根仓库统一版本管理；本次不推送远程。升级后按[停用检查表](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/BACKGROUND.md>)复测，再决定是否移除补丁。
