# 用量看板 · dsh-plugin-usage-board

一个 **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件**：在 DSH Web 界面的侧边栏里，用一块面板同时显示三家服务的**用量、额度和余额**。

| 服务 | 显示内容 | 数据来源 |
|---|---|---|
| **DeepSeek** | 账户余额、累计消耗、近 14 天每日消耗趋势，以及**峰谷计费时段提示**（高峰 / 空闲 · 5 折 + 距切换倒计时） | `platform.deepseek.com` 账号接口（复用 DSH 已登录的授权） |
| **GLM Coding Plan** | 套餐名、5 小时窗口、每周窗口（已用 / 总量 / 剩余 / 重置倒计时） | `open.bigmodel.cn` 官方额度接口 |
| **Kimi Code** | 5 小时窗口、每周窗口（已用百分比 / 剩余 / 重置倒计时） | `api.kimi.com` Kimi Code 订阅接口 |

三家的数据全部来自**官方接口**，插件不做页面抓取，也不需要你手动填任何密钥——它直接读取 DSH 已经保存好的凭据。

![用量看板面板](docs/images/panel.png)

上图是真实运行截图：DeepSeek 卡片显示余额与近 14 天消耗柱状图，GLM 卡片显示 5 小时/每周两条额度条与重置倒计时，Kimi 卡片显示同样两条额度条。

DeepSeek 卡片顶部新增了一个**峰谷计费时段提示器**：当前是高峰还是空闲、对应什么价格档位，以及距下次涨价/降价的倒计时。提示语是个谐音梗——高峰时段是「现在是**梁文峰**时段！」，空闲时段把创始人的名字换成「**梁文谷**」：

| 高峰（标准价） | 空闲（5 折） |
|---|---|
| ![高峰时段提示](docs/images/pricing-reminder-peak.png) | ![空闲时段提示](docs/images/pricing-reminder-offpeak.png) |

时段规则取自 [DeepSeek 官方价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)：北京时间周一至周五（不含法定节假日）09:00–12:00、14:00–18:00 为高峰，其余时间（含周末与节假日全天）为空闲、价格为高峰价的一半。法定节假日由第三方日历库 [`chinese-days`](https://github.com/vsme/chinese-days) 判定，不需要手工维护节假日表。

---

## 1. 安装

插件是一个标准的 DSH 插件包，安装方式就是把**本目录的绝对路径**交给 DSH。

### 方式 A：用 DSH 图形界面安装（推荐）

> **先装依赖。** 本插件用第三方包 `chinese-days` 判定中国法定节假日，DSH 的本地路径安装
> （pnpm `link:`）不会替插件安装依赖，所以第一次安装前要先在插件目录里执行一次 `npm install`：
>
> ```bash
> cd /path/to/dsh-plugin-usage-board
> npm install
> ```

1. 打开 DeepSeek Harness，在左侧边栏点 **插件 / Plugins**。
2. 点 **添加插件 / Add plugin**。
3. 在输入框里粘贴本目录的绝对路径：

   ```
   /Users/songer/Documents/deepseek-harness/default-workspace/dsh-plugin-usage-board
   ```

4. 勾选信任确认框，点 **安装 / Install**。
5. 安装完成后点 **立即启用 / Enable now**。
6. DSH 会重新组装插件树，侧边栏出现 **用量看板** 一项。

> 本插件是本地路径安装（pnpm `link:`），所以之后**直接改源码即可生效**，不需要重新安装。

### 方式 B：命令行安装（DSH Desktop 关闭时）

```bash
cd /path/to/dsh-plugin-usage-board
npm install   # 必须先装：chinese-days 不会由 DSH 代为安装

DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add \
  /Users/songer/Documents/deepseek-harness/default-workspace/dsh-plugin-usage-board
```

> `--profile desktop` 由桌面应用独占管理。DSH **正在运行也可以执行**（它会等锁），但
> DSH 必须先登录过一次、profile 目录已初始化。若提示
> `profile "desktop" is managed exclusively by the Electron application`，说明 DSH 完全没启动过，
> 先打开一次 DSH 再执行。

### 卸载

图形界面：插件页 → 本插件 → **卸载**。
命令行：

```bash
"$DSH" plugin --profile desktop remove dsh-plugin-usage-board
```

---

## 2. 使用

侧边栏点 **用量看板**，或用独立页面 <http://127.0.0.1:19387/usage-board/>（端口取决于 DSH 实际监听端口）。

- **峰谷提示**：DeepSeek 卡片顶部显示当前计费时段与距下次切换的倒计时，高峰/空闲分别按标准价、5 折计；跨到周末或法定节假日时倒计时会直接指向下一个工作日的切换点。
- **逐家加载，谁先回来谁先显示**：面板和独立页面都**不再等三家接口全部返回**。首次进入（本地还没有任何数字）时先画出三张占位卡片，每家的接口一返回就立刻把那张卡片换成真实数据；手动刷新同样逐家进行、逐家原地更新。某一家接口慢、挂起或超时只会让**那一张**卡片继续等待/报错，另外两家照常显示和刷新，不会被单点拖住。
- **打开即有数**：进入面板先显示上次成功拿到并存在浏览器本地的数据，再逐家后台刷新，新数据到了原地替换，不会先清空再等。
- **自动刷新**：默认 60 秒一次，但只在「有人看」的时候才刷——窗口可见、面板在屏幕上、且最近 3 分钟内有鼠标/键盘操作。DSH 空闲（无操作超时）、切到其他侧边栏面板、或窗口隐藏时自动暂停，不会有任何上游请求；恢复操作（动一下鼠标、切回面板、回到窗口）会立刻补刷一次。手动刷新不受此限制，随时可用。
- **手动刷新**：面板右上角 **刷新** 按钮，会绕过缓存、对三家并发发起单家请求，每家返回后只更新自己那张卡片。
- **每张卡片**右上角的彩色标签是这家服务的状态：绿色「正常」、灰色「未配置」、红色「未授权 / 上游错误 / 网络错误」。
- 卡片底部小字是诊断信息：实际命中的接口域名、本次请求耗时。

### 各家的具体表现

**DeepSeek** — 显示余额（¥）与累计消耗，并画出近 14 天的每日消耗柱状图。DeepSeek 官方**没有**提供「额度窗口」类接口，所以这张卡片没有进度条，只有余额和趋势。

卡片顶部的**峰谷计费时段提示器**用来回答「现在调用贵不贵」：

- 左边是时段与一句玩梗：高峰「现在是梁文峰时段！」，空闲「现在是梁文谷时段！」（把「峰」换成「谷」）。
- 右边是价格档位：**高峰 · 标准价** / **空闲 · 5 折**。
- 第二行是**距下次切换的倒计时**：高峰时说「距降价」，空闲时说「距涨价」，并注明按北京时间计算。
- 时段由主机侧按官方规则计算后随快照下发（`meta.pricing`），浏览器只按绝对时刻推算，所以面板/独立页面在缓存快照上也能准时翻转，周末和法定节假日不会误报高峰。鼠标悬停可以看到完整规则；如果节假日日历还没覆盖当前年份（或 12 月的计划区间伸进了次年），会明确标注「暂按工作日估算」。

**GLM Coding Plan** — 两条进度条：5 小时滚动窗口和每周窗口，显示「已用 / 总量」、「剩余」、「X 小时后重置」。套餐名直接取自 GLM 的订阅接口（例如 `GLM Coding Lite`）。

**Kimi Code** — 两条进度条：5 小时滚动窗口和每周窗口。Kimi Code 订阅**不提供余额接口**，所以这张卡片只有用量，没有金额。

---

## 3. 凭据从哪里来

插件**不会**向你索取密钥，也不会把密钥写到任何地方。它通过 DSH 的凭据服务读取你**已经配置好**的凭据：

| 服务 | 读取的凭据 | 在哪里配置 |
|---|---|---|
| GLM Coding Plan | `ZAI_CODING_CN_API_KEY` | DSH 设置 → 模型 / 凭据，或 `~/.dsh/.credentials.yaml` |
| Kimi Code | `KIMI_CODING_API_KEY` | 同上 |
| DeepSeek | `deepseek-account-platform/default` 账号授权记录 | 在 DSH 里登录 DeepSeek 账号后自动写入 |

只要你在 DSH 里已经能用这三家的模型，这个面板就能直接出数，**无需任何额外配置**。

### 安全边界

- 接口默认**只允许本机回环地址**访问（`allowRemote: false`）。局域网内其他机器读不到你的用量与余额。
- 任何响应、日志、错误信息里都**不会**出现完整密钥。健康检查接口只报告「是否已配置」。
- 密钥**不会**经过浏览器：网页只请求本机插件的 HTTP 接口，由插件在主机侧去调用三家的官方 API。
- 独立页面带 `Content-Security-Policy` 响应头，禁止加载任何外部资源。

---

## 4. 配置

配置写在 DSH 插件的 profile patch 层里，改完由 DSH 重新加载。

```yaml
- id: usage-board
  name: 'dsh-plugin-usage-board'
  config:
    ttlMs: 60000        # 缓存时长（毫秒），允许范围 15000–300000
    servePage: true     # 是否同时提供 /usage-board/ 独立页面
    allowRemote: false  # 是否允许非本机地址访问接口（不建议打开）
    verbose: false      # 打开后会把每次请求的结果写进 DSH 日志
```

### 节假日日历（第三方依赖）

峰谷时段要区分「工作日的高峰」和「法定节假日全天空闲」，节假日表不能硬编码——国务院每年都会
重新公布放假与调休安排，手写一份表过一年就会在长假期间给出错误结论。所以判断交给
[`chinese-days`](https://github.com/vsme/chinese-days)（MIT、零传递依赖）：

- **精确锁版本。** `package.json` 里写的是 `1.5.9` 而不是 `^1.5.9`：节假日数据决定计费提示的
  对错，一次不经意的重装不应该悄悄换掉它。
- **更新。** 等国务院公布下一年安排、上游库发版后，在插件目录执行
  `npm run update-holidays`（等价于 `npm install chinese-days@latest --save-exact` 再跑一遍节假日
  测试），然后**重载插件（或重启 DSH）**：主机侧对依赖的 `import` 在进程内只做一次，刷新浏览器
  不会重新加载它。
- **自检。** `node --test test/holidays.test.js` 会拿官方 2026 年放假表逐日核对（含 19 个落在
  工作日的节假日和 6 个调休上班日），并检查「数据没覆盖该年时降级为按工作日估算」的提示。
- **依赖缺失也不崩。** 日历是可选增强：没有 `node_modules` 时插件照常工作，只按周一至周五估算，
  面板会显示「未安装节假日日历，暂按工作日估算」；不会把整个看板拖垮。

---

## 5. 出问题时

| 现象 | 原因与处理 |
|---|---|
| 卡片显示「未配置」 | 该服务的密钥不在 DSH 凭据里。在 DSH 设置里补上对应密钥即可，不需要重启插件。 |
| GLM 显示「未授权」 | 密钥过期或不是 Coding Plan 的密钥。注意：GLM 在鉴权失败时**也返回 HTTP 200**，插件是靠响应体里的业务码判断的。 |
| GLM 提示没有 Coding Plan | 这个密钥是普通 API 计费密钥，不是编码套餐。套餐接口对非订阅用户不可用。 |
| DeepSeek 显示「未授权」 | DSH 里的 DeepSeek 登录已失效，重新登录即可。 |
| 独立页面打不开 | 检查 DSH 是否在运行，以及实际端口（`allowRemote: false` 时只接受本机访问）。 |
| 数字长时间不变 | 缓存未过期属正常；点「刷新」可强制更新。若 `verbose: true`，DSH 日志里能看到每次刷新结果。 |
| 某一张卡片一直显示「加载中」 | 只有这一家的接口慢或不可达，另外两张不受影响。等它自己的 12 秒超时后会显示具体错误；`curl -s …/usage-board/api/health` 的 `providers` 字段能看到哪一家还在刷新。 |
| 时段提示显示「节假日日历尚未覆盖完整计划区间」 | 上游节假日库还没收录该年（通常是 12 月，计划区间伸进了次年），或依赖没装。先 `npm install`，再按上一节更新 `chinese-days` 并重载插件。 |
| 卡片没有时段提示器 | 主机侧没算出来（`snapshot` 里 DeepSeek 行的 `meta.pricing` 缺失）或客户端 bundle 未刷新。先确认 `curl -s …/usage-board/api/snapshot` 里有 `pricing`，再刷新 DSH 页面。 |

自检接口：

```bash
curl -s http://127.0.0.1:19387/usage-board/api/health          # 插件状态 + 每家的缓存/刷新状态
curl -s 'http://127.0.0.1:19387/usage-board/api/provider?id=glm'  # 单家读取（GET 可带缓存，POST 强制刷新）
curl -s http://127.0.0.1:19387/usage-board/api/snapshot         # 兼容的聚合读取
```

几个刻意的取舍，避免你对数字产生怀疑：

- **「立即显示」是怎么做到的。** 主机侧把读取拆成了两层：`GET /api/provider?id=<id>` 单家读取，`GET /api/snapshot` 聚合读取。浏览器半边（侧边栏面板与独立页面）对三家**并发**发起单家请求，谁先返回就先画谁——一家慢不会拖住另外两家。单家读取本身也不等上游：只要这家有缓存就立即返回（缓存过期则返回旧数字并带 `stale: true`，同时在后台刷新它），所以进入面板/手动刷新不会清空已有数字；只有「这家完全没有缓存」的那张卡片才需要等它自己的第一次读取。
- **聚合接口仍然保留。** `GET /api/snapshot` / `POST /api/refresh` 的语义没变，供脚本或旧消费者使用；它们由同一份按服务商缓存组合而成，因此和逐家加载共用上游请求，不会把接口多打一遍。
- **百分比与「已用 / 总量」永远一致。** 上游上报的百分比是取整过的（GLM 在 656/2000 时报 32%），界面显示的是按 656/2000 重新算出的 32.8%，所以百分比和旁边的分数不会互相打脸。
- **`已用 + 剩余` 可能比总量少 1。** 例如 GLM 实测 656 + 1343 = 1999，而总量是 2000。这是上游数据本身如此，我们原样展示，不做任何加减。
- **倒计时四舍五入到最近的单位。** 侧边栏面板和独立页面用同一套规则，同一个重置时间在两处显示一致。
- **`刷新` 只接受 POST。** 避免浏览器里其他页面用 GET 触发一次真实的上游请求。逐家刷新接口同样遵循这条：`POST /api/provider?id=<id>` 才会强制上游读取，GET 只做「有缓存就返回、没有才读」。

---

## 6. 开发与验证

```bash
cd dsh-plugin-usage-board

npm install                        # chinese-days（节假日日历）等依赖
npm run build                      # 由 src/client/* 重新生成 lib/client.js
npm test                           # 全部单元测试与静态检查（离线）
node test/providers.live.mjs       # 用真实凭据打三家官方接口，打印实际数值
```

峰谷计费相关的测试分两层：`test/pricing.test.js` 用桩日历覆盖时段边界、周末/节假日/调休与
跨年切换；`test/holidays.test.js` 用真实 `chinese-days` 数据核对官方 2026 年放假表、验证时区
无关性，并守住「依赖精确锁版本」这条约束。

架构、协议、以及为什么这样设计，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；
独立验证报告见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

---

## 7. 许可

MIT。
