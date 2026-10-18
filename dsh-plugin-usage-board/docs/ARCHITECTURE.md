# 架构说明 · dsh-plugin-usage-board

本文说明这个插件**为什么这样设计**，以及改动它时需要遵守哪些约束。安装与使用见
[README](../README.md)。

---

## 1. 一个插件包，两个半边

DSH 的插件可以同时拥有「主机半边」和「浏览器半边」，本插件两边都用了：

```
dsh-plugin-usage-board/
├── package.json          dsh.bundle.patch + dsh.client 两个声明，决定 DSH 怎么加载它
├── cordis.patch.yml      插件行的 patch 层（id / name / config）
├── lib/
│   ├── index.js          主机半边入口：注册 HTTP 路由
│   └── client.js         浏览器半边：DSH 客户端模块（侧边栏面板）
└── src/
    ├── shared/protocol.js    冻结的线上协议（两边共同的事实来源）
    ├── host/                 主机半边实现
    │   ├── routes.js         HTTP 路由与响应（单家 + 聚合）
    │   ├── credentials.js    凭据读取
    │   ├── fetch-json.js     有界的 JSON HTTP 客户端
    │   ├── snapshot.js       按服务商读取 / 缓存 / 去重 + 信封组装
    │   ├── pricing.js        DeepSeek 峰谷计费规则（时段边界 + 未来切换时刻）
    │   ├── holiday-calendar.js  第三方节假日日历（chinese-days）的可选桥接
    │   ├── providers/        三家服务各自的适配器
    │   └── web/dashboard.html 独立页面（纯 HTML，不依赖面板）
    └── client/               浏览器半边源码（打包进 lib/client.js）
```

**为什么要主机半边？** 三个理由，缺一不可：

1. **密钥不能进浏览器。** 三家的密钥都存在主机侧；浏览器只访问本机插件的接口。
2. **跨域。** 浏览器直接请求 `open.bigmodel.cn` / `api.kimi.com` 会撞上 CORS，主机侧没有这个限制。
3. **统一缓存与降级。** 一个缓存层管住所有上游请求，一次刷新不会把三家接口打多遍。

**为什么还要浏览器半边？** 独立页面能用，但体验是割裂的：它不在 DSH 的界面体系里，不能跟随主题、
语言、窗口布局。浏览器半边把同一份数据渲染成侧边栏面板，才是「DSH 的插件」而不是「挂了个网页」。

---

## 2. 数据流

渲染器按**服务商**读取，而不是等一个聚合响应：

```
浏览器（侧边栏面板 / 独立页面）
        │  GET  /usage-board/api/provider?id=deepseek|glm|kimi   （三家并发，各自返回）
        │  POST /usage-board/api/provider?id=…                  （手动刷新，单家强制）
        ▼
   routes.js ──► snapshot.js（按服务商缓存 + 按服务商 in-flight 合并）
                        │
                        ├─ deepseek.js ─► platform.deepseek.com  账号接口
                        ├─ glm.js      ─► open.bigmodel.cn        额度接口
                        └─ kimi.js     ─► api.kimi.com           订阅用量接口
                        │
                   credentials.js（凭据服务的引用层 + 记录层）
```

兼容的聚合读取仍然存在，并复用同一份按服务商缓存：

```
GET  /usage-board/api/snapshot     （聚合；语义与旧版一致）
POST /usage-board/api/refresh      （聚合强制；语义与旧版一致）
```

### 逐家加载（为什么不再用一个 Promise.all 响应）

最初的设计是「一个快照 = 三家都读完」，因为界面一次性渲染整块面板。它把三家的延迟绑在
了一起：`Promise.all` 必须等最慢的那家（上限 12 秒），只要一家挂起，整块面板就停在旧数据
上。现在把读取单元降到**单个服务商**：

- 主机侧的 `SnapshotService` 为每个服务商维护独立的缓存条目、独立的 in-flight 合并和独立的
  AbortController；`getProvider(id)` 只等这一个服务商。
- 浏览器半边（面板与独立页面）对三家**并发**发请求，每收到一家就合并这一行、只重画对应的
  卡片。慢的那家只让自己的卡片停在骨架/加载态，其余卡片立即显示。
- 首次进入且没有本地缓存时，先按服务商画出占位卡片，谁先返回谁先变成真实数据。
- 手动刷新同样逐家强制：`POST /api/provider?id=…` 三家并发，各自返回后原地替换。

聚合接口仍保留，供脚本或旧消费者使用（`GET /api/snapshot` / `POST /api/refresh`），它仍然
等整块面板；但它是兼容路径，不再是渲染器的热路径。两条路径共用缓存与并发合并，所以从两种
入口刷新都不会把上游多打一遍。

### 缓存与「先显示、后刷新」

- 默认 60 秒（`ttlMs`，可配 15–300 秒），**每个服务商独立计时、独立过期**。
- **同一服务商的并发请求会合并**：10 个并发读取只产生 1 次上游调用；不同服务商互不等待。
- `POST /api/provider?id=…` 绕过该家的缓存，并且**等结果**——它代表用户明确要求「现在就去
  问这一家」。`POST /api/refresh` 是同样的语义，只是问全部。

单家读取 `GET /api/provider?id=…` 是渲染器的热路径，规则是**绝不为了刷新而藏起已有的数字**：

| 该家的缓存状态 | 行为 | 响应字段 |
|---|---|---|
| 有缓存且未过期 | 直接返回缓存 | 无 `stale` |
| 有缓存但已过期 | **立刻**返回旧缓存，同时后台刷新这一家 | `stale: true`、`refreshing: true` |
| 完全没有缓存（该家冷启动） | 只等待这一家的读取 | 无 `stale` |
| 已 dispose | 返回空信封，不发起任何请求 | — |

为什么该家冷启动仍然要等：那时候这张卡片没有任何数字可以显示，「假装有数据」比等一次更糟；
但它只影响这一张卡片，另外两家照常先显示。

聚合读取 `GET /api/snapshot` 保持旧规则：有缓存就立即返回（过期的带 `stale: true` 并后台
刷新）；只有完全没有缓存时才等待；`POST /api/refresh` 等全部结果。

`stale` / `refreshing` 是**可选**字段（缺失即为 false），所以不认识它们的消费者会像以前一样
正常渲染；认识的消费者可以据此安排一次自己的补读。前端就是这么做的：某一家看到
`stale: true` 会在约 1.5 秒后补读**那一家的接口**，然后用新数据原地替换；每个服务商最多补读
一次，所以一个持续返回 stale 的主机不会把补读变成轮询。

**侧边栏面板**另外把最近一次成功的数据（按服务商合并）存进 `sessionStorage`，所以**刷新页面后
第一帧就有数**，不用等任何网络往返。存储不可用（隐私模式、配额满）时会退回到骨架→逐家填充的
流程，不影响功能。独立页面不持久化：它每次打开都先画骨架，再逐家填充（页面本身没有跨会话的
数据要恢复，而面板的挂载/卸载很频繁，才值得缓存第一帧）。

### 客户端的自动刷新闸门（idle gate）

轮询是有成本的：TTL 过期后的每一轮自动刷新都会让主机对三家服务商各发起一次真实读取。所以
前端**不会**在「没人看」的时候按 TTL 空转：

- 只有三个信号同时成立才允许自动刷新——**文档可见**（窗口没有隐藏/最小化）、**面板在视口内**
  （侧边栏切到其他面板时，本面板仍可能处于挂载但 `display: none` 的状态，由 IntersectionObserver
  判定）、**用户最近 3 分钟内有输入**（可见但无人照看的窗口视为空闲）。
- 闸门关闭期间，TTL 定时器照常走时但**直接跳过请求**，除了一次廉价的本地重估（30 秒一次，纯
  计算）外不产生任何网络流量；1 秒的「X 分钟前更新」时钟也随面板离屏而冻结。
- 任何用户动作（移动鼠标、回到窗口、重新选中面板）都会重新打开闸门，而**重开本身就是补读时
  机**——立即对三家各拉一次单家读取，不必等满一个 TTL；主机缓存还新鲜时这些补读几乎免费。
- 手动刷新（`POST /api/provider?id=…`）**不看闸门**，任何时候都可用。

独立页面（`/usage-board/`）内嵌脚本遵循同一策略：可见且有操作才自动刷新，空闲或隐藏时跳过并
等待事件唤醒。

### 降级

这是整个插件最重要的设计约束：**上游的任何一种失败，都必须在界面上表现为「那一张卡片有话说」，
而不是整页打不开。**

所以：

- 每个适配器都是**全函数**——捕获一切异常，永远 resolve 出一个合法的 provider 行，永不 reject。
- 任何一个服务商失败，接口仍然返回 **HTTP 200**，信封里 `ok: false`，出错的那一行带上自己的
  `status` / `message` / `code`。
- 三家里的两家挂了，第三家照常显示。

---

## 3. 冻结的线上协议

`src/shared/protocol.js` 是两边共同的事实来源。改动它要遵守三条规矩：

1. **只增不改。** 不删字段、不改字段含义、不改字段类型。
2. **`status` 是唯一的错误分支依据。** 取值为
   `ok` / `not-configured` / `unauthorized` / `rate-limited` / `upstream-error` / `network-error` / `invalid-response` / `disabled`。
3. **失败永远是 HTTP 200 + `ok: false`。** HTTP 状态码只描述传输层，不描述上游服务商。

浏览器半边**不能** `require` 这个文件（它不是 DSH 客户端模块加载器认识的模块），所以
`src/client/protocol-copy.js` 是它的逐字副本，`test/client-bundle.test.js` 负责守住两者不漂移。

### 路由与信封

| 方法与路径 | 含义 | 响应 |
|---|---|---|
| `GET /usage-board/api/provider?id=<id>` | 单家读取（渲染器热路径） | 只有一行的快照信封；可能带 `stale` / `refreshing` |
| `POST /usage-board/api/provider?id=<id>` | 强制读取这一家并等结果 | 一行的快照信封 |
| `GET /usage-board/api/snapshot` | 聚合读取（兼容路径） | 全部服务商的快照信封 |
| `POST /usage-board/api/refresh` | 聚合强制读取并等结果 | 全部服务商的快照信封 |
| `GET /usage-board/api/health` | 诊断（不含密钥） | `{ ok, version, ttlMs, reads, backgroundReads, fresh, providers[], credentials }` |

- 单家路由的信封就是 `UsageSnapshot` 收窄到 `providers.length === 1`：字段含义完全不变，
  `ok` 由这一行推导，`ttlMs` / `generatedAt` 照常（`generatedAt` 是这一家本次读取的开始时刻；
  聚合信封取最新一行的开始时刻）。这样已有的信封解析代码不需要第二套形状。
- `id` 缺失或不是注册过的服务商 → **400** `{ ok: false, error: { code: 'unknown-provider' } }`。
  这是传输层错误（调用方要的东西不存在），不是服务商失败，不能渲染成一张降级卡片。
- 方法不对 → **405**，`Allow: GET, HEAD, POST`。
- 新增路由是**增量**的，所以 `PROTOCOL_VERSION` 保持 1：不认识新路由的消费者继续用聚合接口，
  行为不变。

### 每行的形状

```jsonc
{
  "id": "glm",                       // deepseek | glm | kimi
  "label": "GLM Coding Plan",
  "status": "ok",
  "message": null,                   // 失败时的一句话说明
  "code": null,                      // 诊断用：'HTTP 401'、'code 40003' 等
  "plan": "GLM Coding Lite",
  "windows": [                       // 额度窗口；该服务商不提供时为空数组
    { "id": "glm.5h", "labelKey": "glm.5h", "unit": 3, "number": 5,
      "limit": 2000, "used": 656, "remaining": 1343, "percent": 32,
      "resetAt": 1791973452542, "note": null }
  ],
  "balances": [                      // 金额；不提供时为空数组
    { "currency": "CNY", "available": 29.9, "bonus": 0, "totalSpent": 126.11 }
  ],
  "account": null,                   // 非机密的账号标识（可选）
  "meta": {                          // 归一化装不下的东西
    "host": "open.bigmodel.cn",
    "source": "quota-api",
    "dailyUsage": {                  // 仅有历史、没有额度窗口的服务商（DeepSeek）
      "currency": "CNY", "days": 30,
      "points": [ { "date": "2026-10-01", "cost": 1.23, "tokens": 45600 } ]
    }
  },
  "fetchedAt": 1791960891068,
  "latencyMs": 187
}
```

`meta` 里唯一有形状约定的扩展是 DeepSeek 行的 `pricing`（详见 `src/shared/protocol.js` 的
`PricingSchedule`）：`phase`（当前时段）、`asOf`、`utcOffsetMinutes`（480，规则固定按北京时间）、
`offPeakMultiplier`（0.5）、`holidayCalendar`（第三方日历、已覆盖到哪一年、是否覆盖整个计划区间）、以及 `transitions[]`
（未来 14 天的绝对切换时刻，按时间升序）。它只增不改、缺失即「没有时段数据」，不认识它的消费者
忽略即可。

**`windows` 和 `balances` 都可以为空，而且这是正常状态，不是错误。** 这正是三家的差异所在：
GLM 和 Kimi 只有额度窗口，DeepSeek 只有余额和历史。界面必须能干净地渲染「这家不提供这类数据」，
而不是把它当成失败。

---

## 4. 三家服务商的差异（实现时踩过的坑）

这些都由真实接口探测得出，改动适配器前请先读这一节。

### GLM Coding Plan

- 域名：`open.bigmodel.cn`（国内）/ `api.z.ai`（国际），**同一个后端、同一个响应格式**。先试国内，
  失败再试国际，命中的域名记在 `meta.host`。
- **鉴权失败也返回 HTTP 200**，必须看响应体里的 `success` / `code`：
  - 鉴权失败 → `code: 1001`（没带 header）或 `code: 401`（票据不对）
  - **密钥有效但没有编码套餐** → `code: 500`，`msg` 含「coding plan」。这是「没买套餐」，
    不是「密钥错」，界面文案必须区分。
- 窗口**只能按 `unit` 分类，绝不能按 `nextResetTime` 排序**：套餐周期后段，每周窗口的重置时间会
  早于 5 小时窗口，按时间排序会把两个窗口**静默对调**。`unit: 3` 是 5 小时，`unit: 6` 是每周
  （`number` 可能是 `1` 也可能是 `7`）。未知 `unit` 也要输出，不能丢。
- 套餐名另有一个接口 `api.z.ai/api/biz/subscription/list` → `data[0].productName`，
  拿不到就退回 `data.level`。

### DeepSeek

- **不是 `sk-` API key。** DSH 里登录 DeepSeek 账号后写入的是一条账号授权记录
  （`deepseek-account-platform/default`），调用时放在 `x-dsh-auth-token` 头里。
  实测把它当 `Bearer` 用会被拒（`code: 40003`，且**HTTP 200**）。
- 余额：`/api/v0/users/get_user_summary` → `data.biz_data.normal_wallets` / `bonus_wallets` /
  `total_costs`。
- 每日历史：`/api/v0/usage/cost?month=&year=` → `data.biz_data[0].days[]`，31 天，金额是**字符串**。
- 信封规则固定：`code === 0 && data.biz_code === 0`，载荷在 `data.biz_data`。
- **没有额度窗口接口**，所以 `windows` 永远为空。不要为了「看起来完整」而编造一个。
- **峰谷计费由主机侧计算、随快照下发。** 官方规则是：北京时间周一至周五（不含中国法定节假日）
  09:00–12:00、14:00–18:00 为高峰，其余时间（含周末与节假日全天）为空闲，空闲价为高峰价的一半
  （核对于 2026-10-18，来源见 `src/host/pricing.js` 的 `PRICING_SOURCE_URL`）。适配器把
  `meta.pricing` 附加到**每一行**（包括失败行——这是 DeepSeek 的挂牌价，不是账户状态），其中
  `transitions` 是未来 14 天的绝对切换时刻。前端不实现规则、也不带节假日表，只按浏览器时钟在
  `transitions` 上取当前阶段和下次切换：这样缓存或从 `sessionStorage` 恢复的旧快照也能准时翻转，
  并且两个渲染器读的是同一份数据，不会各算各的。
- **节假日用第三方库，不手写表。** `chinese-days`（MIT、零传递依赖、精确锁版本）提供国务院公布的
  放假与调休安排；`holiday-calendar.js` 用受保护的动态 `import()` 桥接它。依赖缺失、API 变形或
  日历没覆盖当前年份时，规则降级为「只看周一至周五」，并把这个事实写进
  `meta.pricing.holidayCalendar`（null，或 `coversHorizon: false`——12 月的计划区间会伸进尚未公布
  放假的次年），界面据此显示「暂按工作日估算」，
  而不是假装知道。调休上班日虽然被日历标为工作日，但规则只认周一至周五，所以它们保持空闲价。

### Kimi Code

- 域名 `api.kimi.com`（国内）/ `api.kimi.ai`（国际），路径 `/coding/v1/usages`。
- 这是**订阅**接口，和 Moonshot 开放平台（`api.moonshot.cn`）是两套独立体系，密钥不通用：
  把 Kimi Code 的密钥拿去打 `api.moonshot.cn/v1/users/me/balance` 会直接 401。
- 响应里有**两代编码**，同一份数据写了两遍：
  - 新的 `usages.limit_5h` / `usages.limit_7d`：`used_ratio` 是 **0–1 的小数**（不是百分数），
    `reset_time` 是 ISO-8601。**优先用这一份**，精度更高、重置时间实时更新。
  - 旧的 `limits[0].detail`（5 小时）与 `usage`（每周）：绝对值，字符串。
- **没有余额接口**。`booster_wallet` 里的 `monthlyChargeLimit` 是**消费上限，不是余额**，
  不能当成钱显示。
- 没有真正的套餐等级字段。`/v1/me` 里的 `user_level_name`（如 `Allegretto`）是 Kimi 账号的
  游戏化等级，**不是编码套餐档位**，不能当 `plan` 用。

---

## 5. 扩展：加第四家服务商

1. 在 `src/shared/protocol.js` 的 `PROVIDER_IDS` 里加上 id（只增不改）。
2. 在 `src/host/providers/` 下新建适配器，实现：

   ```js
   export const myAdapter = {
     id: 'myservice',
     label: 'My Service',
     credentialRefs: ['MY_SERVICE_API_KEY'],
     async read({ getSecret, fetchJson, signal, now, timeoutMs }) { /* 返回一个 provider 行 */ },
   };
   ```

   必须用 `makeProvider` / `makeWindow` / `makeBalance` 构造返回值，这样每个字段都一定有值。
3. 注册进 `src/host/providers/index.js` 的 `PROVIDERS`。**逐家加载会自动覆盖新服务商**：
   `SnapshotService` 按注册表逐个缓存/读取，`GET|POST /api/provider?id=myservice` 和聚合接口
   都会带上它，渲染器按 `PROVIDER_IDS` 顺序并发请求；不需要新增任何路由。
4. 在浏览器半边的 `src/client/protocol-copy.js` 里加上同名 id 和文案（两边都要），
   然后按 `test/client-bundle.test.js` 的方式重新生成 `lib/client.js`。
5. 补 fixture 测试：正常响应、404、401、429、超时、字段缺失、业务错误码；并补一条
   `test/snapshot.test.js` 的逐家并发断言（慢的服务商不能拖住其他服务商）。

---

## 6. 已知限制

- **每个服务商各自为政，没有「整板同时刷新」的原子性。** 这是逐家加载的代价，也是它的目的：
  三张卡片的更新时间可能相差几秒（各自读取耗时的差异）。卡片底部的耗时和整体更新时间都以
  各自那次读取为准；不接受这一点就只能退回「等最慢的一家」。
- **DeepSeek 的每日趋势依赖平台内部接口**（`/api/v0/usage/...`），不是公开文档化的 API。
  官方若改动路径，这一部分会降级为空，但余额不受影响。
- **Kimi Code 的响应格式正在换代**（社区工具还在解析旧格式）。适配器优先读新格式、回退旧格式，
  两代都失效时会明确报 `invalid-response`，而不是显示错误的数字。
- **没有历史持久化**：刷新只反映「此刻」，重启 DSH 不会保留过去的采样。要看趋势得靠
  DeepSeek 自己的每日数据。
- **`used + remaining` 不等于 `limit`。** GLM 实测 `656 + 1343 = 1999`，而 `usage` 是 `2000`（每周窗口同理：`5831 + 4168 = 9999 / 10000`）。这是上游自己少 1，我们**原样展示，不做任何补偿**——擅自把某个数字加减 1 会让卡片与官方后台对不上，反而更难排查。
- **百分比以「用 `used / limit` 算出来的值」为准。** 上游上报的 `percentage` 是有意取整的（GLM 在 `656 / 2000` 时报 32，实际 32.8%）。协议里 `percent` 保留上游原值、`derivedPercent` 是本地算出的比例，界面优先用后者，这样「百分比」与旁边的 `656 / 2000` 永远自洽。上游原值不丢，便于核对。
- **价格/金额不做汇率换算**：接口给什么币种就显示什么币种。
- **峰谷规则与节假日数据都会变。** 高峰窗口取自 DeepSeek 官方价格页（核对于 2026-10-18），官方
  调整时段后要同步改 `src/host/pricing.js`；国务院每年重新公布放假安排，插件把 `chinese-days`
  精确锁版本，需要按 README 的步骤主动升级，否则新一年的法定节假日会先按工作日估算（界面有明确
  标注）。`test/holidays.test.js` 用官方 2026 年放假表逐日核对，并故意断言「2027 年数据尚未收录」，
  升级依赖时这条断言会提醒你重新核对。
