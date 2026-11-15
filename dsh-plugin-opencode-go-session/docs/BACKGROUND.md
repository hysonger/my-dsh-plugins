# 背景、Discussion 归纳与升级停用标准

核查日期：2026-11-15。适用本机基线：DSH Desktop 0.2.2-rc.3 / `@earendil-works/pi-ai` 1.3.0。这里将社区报告和本机验证分开，不能把历史 workaround 当作当前接口。

## 本机因果链

`opencode-go` 内置目录混用了多种 API。当前目录没有 `hy4`、`kimi-k3.1-pro`、`gemini-4-argon`。解析逻辑是：

```js
const api = request.api ?? base?.api ?? routeApi;
```

多协议目录没有唯一 `routeApi`，因此未知模型需要路由级显式协议。当前 DSH 仅在 `spec.api === undefined` 时复用内置 Provider；显式声明走 `createProvider(PROTOCOLS[api]())`。内置 OpenCode Provider 的 `withOpenCodeSessionHeader()` 包装因此丢失。会话 ID 本身仍被 DSH 传给 pi-ai，只是没有转成所需的 HTTP 头。

这也解释了两个互相看似矛盾的现象：删 `api` 时新模型加载失败；加 `api` 时既有 DeepSeek Flash 返回 `MissingSessionID`。源码和相同端点下的对照调用共同支持该结论，见[本机调查报告](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/REPORT.md>)。

## 查过哪些 Discussions

通过 GitHub CLI 的只读 GraphQL 查询官方仓库 `deepseek-ai/deepseek-harness`，使用 `search(type: DISCUSSION)` 检索 `MissingSessionID`、`opencode`、`hy4`、`gemini-4-argon`、`kimi-k3`、`403`、`api openai-completions`；另按编号读取 #5495 的主帖及全部 48 条一级评论，`hasNextPage: false`，并用官方网页交叉核对关键帖子。没有发帖或修改任何远程内容。该检索未找到明确以 Hy4 为主题的同故障报告；不代表全站不存在未命中的帖子。

### 最贴近：#12238，2026-11-05

[《yaml配置的时候，catalog 里已有的 provider 不要写 api》](https://github.com/deepseek-ai/deepseek-harness/discussions/12238) 直接描述显式协议分支：

> “写了会让 DSH 走 createProvider 裸协议分支，绕过 pi-ai 自带的 x-opencode-session 注入。”

这与本机完全一致。不过“不要写 api”只能解决已经在目录内的模型；本机三个目录外模型仍需要显式协议，不能直接照搬删字段。

该帖还称：

> “pi-ai 1.4.0 才加入、按 opencode.ai 域名补 header 的兜底。”

这是**社区对其他版本的报告**，本次未安装或运行 1.4.0；本机确认为 1.3.0。它提供升级排查方向，不构成自动卸载本插件的依据。

### 长期主帖：#5495，2026-09-03 起

[《Please send x-opencode-session header on API requests》](https://github.com/deepseek-ai/deepseek-harness/discussions/5495) 的发帖人自称 OpenCode Go 运营方，要求每会话稳定标识；身份表述按原帖引用，不把全部社区回帖视为 DSH 官方承诺。

2026-09-18 的[评论永久链接](https://github.com/deepseek-ai/deepseek-harness/discussions/5495#discussioncomment-18498814) 明确把两条路径区分开：

> “The one piece a bump does **not** cover: a hand-declared or protocol-overridden route.”
>
> “a route that sets `api:` — or a second route declared for a model the catalog has not shipped — still sends no session header even after the upgrade.”

2026-09-22 的[插件侧补充](https://github.com/deepseek-ai/deepseek-harness/discussions/5495#discussioncomment-18548613) 也报告：

> “Anyone here who sets `api:` ... has to keep sending the header themselves, or drop the `api:` override once the catalog covers the models they use.”

因此，“普通 catalog 聊天已经修复”和“显式 api 仍需补头”可以同时成立。本机无显式 api 的 DeepSeek Flash 已 200，不属于早期所有路径都缺头的历史状态。

### 相似实际故障：#7887，2026-09-25

[《自定义 OpenCode Go 提供方报 400 MissingSessionID、上下文窗口缩水到 262144 的原因与解决办法》](https://github.com/deepseek-ai/deepseek-harness/discussions/7887) 报告：

> “最初为了解决「内置 opencode-go 提供方看不到最新模型」而手动添加了上述自定义路由”
>
> “所有补全请求返回 400 MissingSessionID”

与本机“新模型 → 手动协议 → 缺会话头”的操作链相似。但该文针对 0.1.7-rc.2，其固定 header、旧容量回退数字和重启要求不能照搬到当前版本。本插件保留逐会话 ID，不使用所有会话共享的常量。

### 辅助调用是另一类缺口

2026-10-20 的[Auto review 评论](https://github.com/deepseek-ai/deepseek-harness/discussions/5495#discussioncomment-19055788) 报告 0.2.1-rc.2 的审查请求构造没有 `sessionId`：

> “builds its GenerateOptions without sessionId”

有 sessionId 却丢包装器，与调用方根本没传 sessionId，是不同问题。本插件只解决前者；后者应由调用方传入所属会话 ID。没有编造常量或给每次请求重新生成 UUID 的 fallback。也没有把讨论中的 UUID/后端路由推断当作必要条件；本机测试使用原生样式的可打印会话字符串即可成功。

### 相邻目录问题：#11847，2026-11-02

[关于 Kimi K3.1 Pro 的讨论](https://github.com/deepseek-ai/deepseek-harness/discussions/11847) 中，回帖指出：

> “kimi-coding 的模型来自 pi-ai 安装包里的静态 catalog，不是从端点实时拉的”
>
> “models 会整份替换该 route 的 catalog（不是追加）”

这是另一个提供商的相邻问题，不是本机 OpenCode Go 的直接复现。它说明重新导入密钥通常不会更新静态模型目录；本插件因此保留现有 models 和凭据引用，不尝试重录密钥。

## 为什么选择这个扩展点

当前版本公开了 `llm-pi-ai/request-headers` waterfall，参数自带 provider、baseURL、sessionId、purpose；监听器修改请求专属 Headers 后调用 `next()`。它直接覆盖所有 pi-ai 推理协议，不需要改安装包、monkey-patch 全局 fetch、复制 SDK 或读取认证值。

Go 的官方要求仍是：

> “Send a stable session ID with every request ... Go requires it.”
>
> ——[OpenCode Harnesses](https://opencode.ai/docs/console/harnesses/)

## 升级后的停用判据

**优先看实际行为，不仅看版本号。**

1. 记录新 DSH 与实际安装的 pi-ai 版本，不拿源码 lockfile 代替 Desktop 包内版本。本插件声明 `>=0.2.2-rc.3 <0.3.0`；跨出范围升级前先停用，核实原生能力或重新审查适配，不盲目授予版本豁免。
2. 先确认本插件的迁移标志已是 `false`，再在 Plugin Manager 停用插件。
3. 保留显式 `api: openai-completions`，经 DSH 内部渠道分别对 `hy4` 和 `deepseek-v4.1-flash` 发送一条小提示词。必须得到正常文本，不只是模型列表或 HTTP 200 空流。
4. 对 DeepSeek 做第二轮带原生 replay 的回放；若实际使用自动审查、标题或其他辅助调用，也覆盖那些路径。调用方必须传会话身份。
5. 如仍有 MissingSessionID，重新启用插件。不要为了测试提取 API Key 或改静态常量头。
6. 如只在“删除 api”后成功，应确认新目录确实包含全部手写模型，才能移除该覆盖；否则原始 `needs an api` 会回来。
7. 以上检查通过才移除 bundle；保留本背景、报告和版本记录。无需修改任何 App ASAR 文件。

`hy4-preview` 的 403 权限拒绝、GLM Flash 因微小输出预算耗尽而结束，都不能用来判断会话头补丁是否生效。也不要因“已经没有 400”就绕过服务端权限或隐私设置。
