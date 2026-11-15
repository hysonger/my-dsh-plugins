# Kimi Code 网页搜索与抓取

这个插件包含 Host 工具和轻量 Client 卡片，让模型可以按次选择 Kimi，而不改变 DSH 的默认搜索/抓取后端：

| 工具 | 行为 |
|---|---|
| `kimi_web_search` | 通过 Kimi Code Search API 搜索，支持 1–4 个查询、去重、合并和结果上限 |
| `kimi_web_fetch` | 通过 Kimi Code Fetch API 读取公共网页，返回提取后的 Markdown |

现有 `web_search` 和 `web_fetch` 继续由 `dsh-web` 配置选择，当前 desktop profile 中仍是 DeepSeek。旧 `kimi-code-search` Search Provider 仅在 `registerLegacyProvider: true` 时注册，默认关闭，避免未固定 Provider 的 composition 出现自动选择歧义。Kimi Fetch 只通过独立工具暴露，不注册全局 Fetch Provider。

## 凭据与配置

两个工具共用 `KIMI_CODING_API_KEY`，每次调用通过 DSH credentials 重新解析。凭据服务是硬依赖，因此存储值、启动环境和 `.env` 回退均由 DSH 自己处理。

| 字段 | 默认值 | 说明 |
|---|---|---|
| `apiKeyEnv` | `KIMI_CODING_API_KEY` | CredentialRef 名称 |
| `searchEndpoint` | `https://api.kimi.com/coding/v1/search` | 完整 Search API 端点 |
| `fetchEndpoint` | `https://api.kimi.com/coding/v1/fetch` | 完整 Fetch API 端点 |
| `searchTimeoutMs` | `30000` | 搜索全过程超时 |
| `fetchTimeoutMs` | `60000` | 抓取全过程超时 |
| `searchMaxQueries` | `4` | 单次工具调用的查询上限 |
| `searchMaxResults` | `8` | 合并后来源上限 |
| `fetchMaxOutputChars` | `200000` | 包含状态、提示和引用页脚在内的最终模型输出字符上限 |
| `registerLegacyProvider` | `false` | 是否注册 0.1 的 `kimi-code-search` Provider |

全球区可分别改为 `https://api.kimi.ai/coding/v1/search` 与 `/fetch`。API 端点必须是 HTTPS，且不能内嵌用户名或密码。

0.1 原型的 `endpoint` / `timeoutMs` 已拆成 Search/Fetch 独立字段；当前安装使用空配置，无需迁移。

## 与内置工具共存

安装后应同时看到四个工具：

```text
web_search       → 当前默认 Provider（本机为 DeepSeek）
web_fetch        → 当前默认 Provider（本机为 DeepSeek）
kimi_web_search  → 始终直连 Kimi
kimi_web_fetch   → 始终直连 Kimi
```

可以在请求中写“使用 Kimi 搜索”或“用 Kimi 读取这个页面”。这属于模型的工具选择，不是用户 UI 中的强制路由开关。

Client 在 `tool.call.toolview` 为两个 `kimi_web_*` 名称注册独立卡片，展示来源链接、Kimi API 状态和错误正文；文本有中英文 locale。卡片行沿用宿主工具行的度量，而不是自带一套：24px 行高、`--dsh-content-font-size-secondary`（13px）字号、`--dsw-alias-label-tertiary` 的图标与文字、悬停时图标换成箭头、标题与摘要之间用 2px 分隔点；展开体沿用宿主 Web 卡片的来源列表排版。所有这些都通过宿主主题令牌表达，插件不 import 任何内部 UI 包。升级已有页面后需要普通刷新一次，才能加载新的 Client 模块。

## 网络与安全边界

- 仅支持静态 Key；不读取或刷新 Kimi OAuth token。
- 查询或目标 URL 与 Bearer Key 只发送到所配置的 Kimi API 端点。
- 独立工具发送真实的 `X-Msh-Tool-Call-Id`，但不伪造平台或设备身份头。
- API 重定向被拒绝；没有自动重试、跨区域 fallback、DeepSeek fallback 或本地抓取 fallback。
- Fetch 仅接受公共 HTTP(S) URL，不携带目标网站登录态，拒绝 localhost 和直接给出的私有 IP。
- Fetch 返回的 `statusCode` 是 Kimi API 状态，不是目标网站状态；API 不报告最终重定向 URL。
- 所有搜索结果和网页正文都是外部不可信数据，输出保留引用提示。
- 错误使用 DSH 的 WebError，凭据解析异常不会通过 `cause` 泄露密钥。

`peerDependencies` 对 `@deepseek-ai/dsh-web` 使用 `^0.2.2-rc.1` 范围，而不是精确版本。DSH 的兼容性门禁把这个字段直接交给 `semver.satisfies()`，精确版本号等价于单点范围，DSH 一旦升级就会让整个 bundle 被**静默跳过**（工具消失，GUI 无报错）。范围写法接受 0.2.x、拦住 0.3.x，升级时不必再改。运行时该 import 始终解析到 Host 自己的那份（安装包优先于插件目录的 `node_modules`），所以 `WebError` 仍是同一个 HarnessError 类；本地 `node_modules` 只供裸 Node 单测。

## 排障：升级 DSH 后工具消失

先看 profile 的 `package.json` 里 `dsh.profile.bundles` 是否还列着 `dsh-plugin-kimi-web-search`。门禁不通过时 bundle 会被跳过且不打印任何提示，最省事的恢复方式是在 GUI 的插件管理里重新启用该 bundle，或调用 `plugin_manager` 的 `set_bundle`。若启用后仍缺工具，再按 `docs/RESEARCH.md` 的「0.2.1 适配 DSH 0.2.2-rc.1」逐项核对 API。

## 检查与真实冒烟测试

```sh
# 仅为裸 Node 单测准备本地 peer 副本；Host 运行时使用 DSH 自己的包。
npm install --ignore-scripts
npm run check
KIMI_CODING_API_KEY='…' npm run live
KIMI_CODING_API_KEY='…' npm run live:fetch
```

可分别通过 `KIMI_SEARCH_TEST_*` 和 `KIMI_FETCH_TEST_*` 环境变量覆盖测试查询、URL 与端点。脚本不打印密钥。

协议依据和验证记录见 [docs/RESEARCH.md](docs/RESEARCH.md)。
