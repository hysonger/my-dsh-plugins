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
    │   ├── routes.js         HTTP 路由与响应
    │   ├── credentials.js    凭据读取
    │   ├── fetch-json.js     有界的 JSON HTTP 客户端
    │   ├── snapshot.js       快照组装 + 缓存
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

```
浏览器（侧边栏面板 / 独立页面）
        │  GET /usage-board/api/snapshot        POST /usage-board/api/refresh
        ▼
   routes.js ──► snapshot.js（TTL 缓存，同一服务商的并发请求合并为一次）
                        │
                        ├─ deepseek.js ─► platform.deepseek.com  账号接口
                        ├─ glm.js      ─► open.bigmodel.cn        额度接口
                        └─ kimi.js     ─► api.kimi.com           订阅用量接口
                        │
                   credentials.js（凭据服务的引用层 + 记录层）
```

### 缓存与「先显示、后刷新」

- 默认 60 秒（`ttlMs`，可配 15–300 秒）。
- **同一服务商的并发请求会合并**：10 个并发刷新只产生 1 次上游调用。
- `POST /refresh` 绕过缓存，并且**等结果**——它代表用户明确要求「现在就去问」。

`GET /api/snapshot` 走的是另一条路径（`SnapshotService.getServing()`），它的规则是**绝不为了
一次刷新而藏起已有的数据**：

| 缓存状态 | 行为 | 响应字段 |
|---|---|---|
| 有缓存且未过期 | 直接返回缓存 | 无 `stale` |
| 有缓存但已过期 | **立刻**返回旧缓存，同时后台发起刷新 | `stale: true`、`refreshing: true` |
| 完全没有缓存（冷启动） | 等待一次读取 | 无 `stale` |
| 已 dispose | 返回空信封，不发起任何请求 | — |

为什么冷启动仍然要等：那时候没有任何数字可以显示，「假装有数据」比等一次更糟。

`stale` / `refreshing` 是**可选**字段（缺失即为 false），所以不认识它们的消费者会像以前一样正常
渲染；认识的消费者可以据此安排一次自己的补读，而不必等满一个 TTL。前端就是这么做的：看到
`stale: true` 会在约 1.5 秒后补读一次，然后用新数据原地替换。

前端另外把最近一次成功的快照存进 `sessionStorage`，所以**刷新页面后第一帧就有数**，不用等任何
网络往返。存储不可用（隐私模式、配额满）时会退回到原来的加载流程，不影响功能。

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
3. 注册进 `src/host/providers/index.js` 的 `PROVIDERS`。
4. 在浏览器半边的 `src/client/protocol-copy.js` 里加上同名 id 和文案（两边都要），
   然后按 `test/client-bundle.test.js` 的方式重新生成 `lib/client.js`。
5. 补 fixture 测试：正常响应、404、401、429、超时、字段缺失、业务错误码。

---

## 6. 已知限制

- **DeepSeek 的每日趋势依赖平台内部接口**（`/api/v0/usage/...`），不是公开文档化的 API。
  官方若改动路径，这一部分会降级为空，但余额不受影响。
- **Kimi Code 的响应格式正在换代**（社区工具还在解析旧格式）。适配器优先读新格式、回退旧格式，
  两代都失效时会明确报 `invalid-response`，而不是显示错误的数字。
- **没有历史持久化**：刷新只反映「此刻」，重启 DSH 不会保留过去的采样。要看趋势得靠
  DeepSeek 自己的每日数据。
- **`used + remaining` 不等于 `limit`。** GLM 实测 `656 + 1343 = 1999`，而 `usage` 是 `2000`（每周窗口同理：`5831 + 4168 = 9999 / 10000`）。这是上游自己少 1，我们**原样展示，不做任何补偿**——擅自把某个数字加减 1 会让卡片与官方后台对不上，反而更难排查。
- **百分比以「用 `used / limit` 算出来的值」为准。** 上游上报的 `percentage` 是有意取整的（GLM 在 `656 / 2000` 时报 32，实际 32.8%）。协议里 `percent` 保留上游原值、`derivedPercent` 是本地算出的比例，界面优先用后者，这样「百分比」与旁边的 `656 / 2000` 永远自洽。上游原值不丢，便于核对。
- **价格/金额不做汇率换算**：接口给什么币种就显示什么币种。
