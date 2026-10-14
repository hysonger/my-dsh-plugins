# Independent verification — `dsh-plugin-usage-board`

**Task:** `task-3` (independent verification + adversarial QA) · **Verifier:** `qa`
**Date:** 2026-10-14 (Asia/Shanghai) · **Revision:** frozen by `lead` at 15:08–15:09
**Write scope used:** `test/verify/**`, `docs/VERIFICATION.md` only. No `src/**`, `lib/**`, or `package.json` file was modified by the verifier.

---

## 0. Verdict

**Ship it.** No security, credential-handling, protocol, or numeric-correctness defect survived on the frozen
revision. One finding I raised earlier (unknown API path served the dashboard with HTTP 200) was fixed *inside*
the freeze and is re-verified below. Seven small defects remain open; none of them can make the board report a
wrong status, leak a secret, hang, or double-count upstream calls. Three of them are user-visible number/text
inconsistencies worth fixing in a follow-up.

| Suite | What it covers | Result |
|---|---|---|
| **A** | `node --test test/` + `node test/providers.live.mjs` | **94/94 pass**; live script `ok` for all three providers |
| **B** | Live routes, methods, HEAD, 404s, CSP, loopback gate, secret-leak scan | **63/63 pass** |
| **C** | Adversarial upstreams (missing/invalid credential, HTTP codes, malformed bodies, transport, outage, storm, TTL, best-effort sources, dispose) | **122/122 pass** |
| **D** | Real browser: sidebar entry, panel, standalone renderer, console, freshness, degraded paths | **23/25 pass** — the 2 failures are the one real defect (D-2) |
| **Leak scan** | First 8 chars of all three real secrets + full grant token against every live response | **clean** |

Open defects: **0 high, 0 medium, 7 low** (D-2…D-8 below).

### Frozen revision — every manifest hash confirmed

`lead`'s manifest was checked file-by-file at 15:11. All 19 hashes matched exactly; nothing moved afterwards.

```
8c07ea352de8  lib/client.js                    18330182a2f6  lib/index.js
6a2699802df7  src/shared/protocol.js           5f061d82d5ca  src/host/fetch-json.js
53422389a472  src/host/credentials.js          7e5fdca79871  src/host/snapshot.js
cafcb6ce7462  src/host/routes.js               5c5d40f1d3ec  src/host/providers/common.js
e4af77468716  src/host/providers/deepseek.js   41ca9e8ae8ae  src/host/providers/glm.js
1230f2fc461b  src/host/providers/kimi.js       39a91f1a8d30  src/host/providers/index.js
32ef7b2c5262  src/client/panel.js              3af67612a4ad  src/client/protocol-copy.js
414ed8490f5e  src/client/styles.css            8c938b632b8d  src/host/web/dashboard.html
b73f60814255  test/snapshot.test.js            9248575f4b54  test/providers.parsing.test.js
bd5def7d09a0  test/client-bundle.test.js
```

### Environment

- macOS (darwin 25.x, arm64), Node **v26.8.2** at `/opt/homebrew/bin/node`
- DSH CLI: `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`
- Real credentials present in `/Users/songer/.dsh/.credentials.yaml` (never printed; masked as `abcd…wxyz`)
- Scratch profile used for the live instance: a **clone of `usage-dev` named `usage-qa`**
  (`/Users/songer/.dsh/profiles/usage-qa`, same `link:` to the plugin directory), booted on
  `127.0.0.1:3181`. Reason: other members were running `pkill -f "profile usage-dev"`, which killed the
  verifier's own instances twice mid-run. A clone keeps the verification instance immune to that pattern while
  testing the identical package. **`~/.dsh/profiles/desktop` was never touched.**
- Browser: `agent-browser` 0.38.1 (real Chromium), sessions `qa-*`.

### How adversarial inputs were driven (no source edits)

`src/host/fetch-json.js` resolves `globalThis.fetch` at call time, so replacing `globalThis.fetch` drives the
**real** stack — route handler → `SnapshotService` → adapter → `fetchJson` → transport — with a controlled
upstream. Credentials were injected through the real `getSecret` seam. Route-level cases that need a real HTTP
server run the plugin's real `registerRoutes` on a stand-in `webServer` (exact-then-longest-prefix dispatch)
over `node:http`; the live DSH instance was used for the real dispatcher's semantics. Every harness prints
`PASS`/`FAIL` per case and a summary.

---

## 1. A — existing suites

```
$ node --test test/
ℹ tests 94
ℹ suites 4
ℹ pass 94
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 84.842041
```

```
$ node test/providers.live.mjs          # exit=0, real credentials, real network
── DeepSeek (deepseek) ─────────────────────────
   status  : ok
   plan    : -
   windows : (none)
── GLM Coding Plan (glm) ─────────────────────────
   status  : ok
   plan    : GLM Coding Lite
   window  : glm.5h 32% [656/2000 (1343 left)] unit=3 reset 2026-10-14T10:24:12.542Z (in 194m)
   window  : glm.weekly 58% [5831/10000 (4168 left)] unit=6 reset 2026-10-16T04:12:55.997Z (in 2703m)
── Kimi Code (kimi) ─────────────────────────
   status  : ok
   plan    : -
   window  : kimi.5h 35.7% [36/100 (64 left)] unit=TIME_UNIT_MINUTE reset 2026-10-14T07:11:56Z (in 2m)
   window  : kimi.weekly 42.7% [43/100 (57 left)] unit=7d reset 2026-10-16T08:11:56Z (in 2942m)
── summary (1.43s) ─────────────────────────────
all providers ok (or not configured)
```

Real DeepSeek values from the same script (money is live and moving, because this very session spends it):

```json
{"available": 23.49083978, "currency": "CNY", "totalSpent": 132.51155626}
"dailyUsage": {"currency":"CNY","days":14,"points":[…{"date":"2026-10-14","cost":13.168306}…]}
```

**Verdict: PASS.** Both suites green on the frozen revision. Note the suite was briefly red (5–6 failures,
`lib/client.js` byte-for-byte drift) at 14:57 while `ui` was mid-edit; it was green from 14:59 onwards and
the frozen bundle regenerates byte-identically (`test/client-bundle.test.js` passes).

*(Verifier note: `test/verify/*.mjs` are deliberately excluded from `node --test test/`; this was probed
explicitly — a top-level `console.log` in `test/verify/` never appears in the runner's output.)*

---

## 2. B — host routes on a live scratch instance

Command: `node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board` → **SUMMARY: 63/63 checks passed**

### B1–B5 — envelope, health, refresh, methods, page

```
PASS [B1.1] GET /api/health -> 200 {ok:true} — HTTP 200 {"ok":true,"plugin":"dsh-plugin-usage-board","version":"0.1.0",
     "protocolVersion":1,"ttlMs":60000,"reads":1,"credentials":{"providers":[{"id":"deepseek","label":"DeepSeek",
     "refs":["DEEPSEEK_PLATFORM_TOKEN","DEEPSEEK_API_KEY"]},{"id":"glm",…"refs":["ZAI_CODING_CN_API_KEY"]},
     {"id":"kimi",…"refs":["KIMI_CODING_API_KEY"]}]}}
PASS [B1.2] health reports protocolVersion 1 and a ttl — protocolVersion=1 ttlMs=60000
PASS [B1.3] health exposes a configured-style summary, not credential values
PASS [B1.4] health reads counter is a number — reads=1
PASS [B2.1] GET /api/snapshot -> 200 JSON — HTTP 200, 2536 bytes
PASS [B2.2] protocolVersion is 1 — = 1
PASS [B2.3] one row per provider in deepseek, glm, kimi order — = ["deepseek","glm","kimi"]
PASS [B2.4] ok is derived correctly from the rows — ok=true rows=deepseek:ok,glm:ok,kimi:ok
PASS [B2.5] ttlMs matches the profile config (60s) — ttlMs=60000
PASS [B2.6] every protocol field is present on every row/window — no missing fields
PASS [B2.7] no window reports a percent without either a limit or an upstream percentage
PASS [B3.1] POST /api/refresh -> 200 with a snapshot — HTTP 200
PASS [B3.2] refresh produces a new generatedAt — 1791961244150 -> 1791961302392
PASS [B3.3] refresh increments health.reads — reads 1 -> 2
PASS [B3.4] the refreshed snapshot is served from cache (generatedAt stable)
PASS [B4.1] DELETE /api/snapshot -> 405 — HTTP 405
PASS [B4.2] 405 carries an Allow header listing GET, HEAD — allow: GET, HEAD
PASS [B4.3] POST /api/snapshot -> 405 (refresh has its own path)
PASS [B4.4] DELETE /api/health -> 405
PASS [B4.5] DELETE /api/refresh -> 405 — allow: POST, GET
PASS [B4.6] HEAD /api/snapshot -> 200, no body, content-length set — HTTP 200 len=2536
PASS [B4.7] HEAD /usage-board/ -> 200, no body — HTTP 200
PASS [B5.1] GET /usage-board/ -> 200 HTML — HTTP 200
PASS [B5.2] CSP header present on the page — default-src 'none'; connect-src 'self'; img-src 'self' data:;
     style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'
PASS [B5.3] CSP forbids remote script/style/frame
PASS [B5.4] page boot block is injected with the protocol paths
PASS [B5.5] page is self-contained (no external subresource)
```

### B6 — 404s, prefix boundary, and the re-verification of my earlier finding

**Defect D-1 (unknown path → 200 dashboard HTML) is fixed and re-verified.**

```
PASS [B6.1] unknown API path -> 404 JSON with error.code not-found — HTTP 404 {"ok":false,"error":{"code":"not-found",
     "message":"No usage board API route matches /usage-board/api/does-not-exist."}}
PASS [B6.2] unknown non-API path -> 404 HTML, not a 200 dashboard — HTTP 404, 183 bytes
PASS [B6.3] the dashboard answers at both /usage-board and /usage-board/ — HTTP 200 for /usage-board
PASS [B6.4] HEAD on an unknown path -> 404 with no body — HTTP 404, body 0 bytes
PASS [B6.5] a reflected path cannot inject markup (percent-encoded, never decoded)
PASS [B6.6] an encoded traversal attempt is a plain 404 with no file content — HTTP 404
PASS [B6.6b] a raw markup path is encoded by the HTTP parser and cannot inject — HTTP 404
PASS [B6.7] a sibling path outside the prefix does not match the plugin — HTTP 404 from /usage-board-sibling
PASS [B6.8] the plugin does not double-serve the browser bundle (DSH client-module route owns it) — HTTP 404
```

Raw XSS probe (`--path-as-is`, raw `<` in the request line) — Node's parser percent-encodes it and
`requestPath()` drops the query string entirely:

```
$ curl -sS --path-as-is 'http://127.0.0.1:3181/usage-board/<script>alert(1)</script>'
HTTP 404
<!doctype html><meta charset="utf-8"><title>404</title><h1>404</h1><p>No usage board route matches
<code>/usage-board/%3Cscript%3Ealert(1)%3C/script%3E</code>.</p><p><a href="/usage-board/">用量看板</a></p>
```

Route-inventory change confirmed (D-1's sibling): `/usage-board/client.js` is now **404**, and the browser
half is served by DSH's own client-module route — proven in the browser network log (D1.3):

```
GET http://127.0.0.1:3181/plugins/??@deepseek-ai/dsh-client-ui-deliverables/client.js,
    dsh-plugin-usage-board/client.js,…&rev=24978b845fa9   (Script) 200
```

A stale `rev` 404s, which is correct revisioned-cache behaviour, not a regression.

### B7 — credential-leak scan (P0 check)

Every live response (`snapshot`, `health`, `page`, `refresh`, unknown-path 404) was grepped for the **first 8
characters** of each real secret and for the full grant token, in-process, without printing them:

```
PASS [B7.ZAI_CODING_CN_API_KEY] no response contains the first 8 chars of ZAI_CODING_CN_API_KEY (d628…9wrM) — clean
PASS [B7.KIMI_CODING_API_KEY] no response contains the first 8 chars of KIMI_CODING_API_KEY (sk-k…Age1) — clean
PASS [B7.DEEPSEEK_PLATFORM_TOKEN] no response contains the first 8 chars of DEEPSEEK_PLATFORM_TOKEN (eEiC…TwZK) — clean
PASS [B7.bearer] no response echoes a Bearer token — no Bearer material in any response
PASS [B7.token] no response contains the literal grant token — grant token absent
```

`/health` exposes only credential **reference names** (`ZAI_CODING_CN_API_KEY`, …) and never a value.
Provider `meta` carries hosts, sources, levels, subscription status and `rawSnippet`s of *response* bodies —
never request headers. This is the two-finding class a user would actually be hurt by, and it is clean.

### B8 — loopback gate / `allowRemote`

The decision is exactly `isLoopbackAddress(req.socket.remoteAddress)` unless `allowRemote === true`:

```
PASS [B8.isLoopback(127.0.0.1)]        allowed
PASS [B8.isLoopback(::ffff:127.0.0.1)] allowed     (IPv4-mapped IPv6 normalised)
PASS [B8.isLoopback(127.0.0.5)]        allowed     (127/8 is loopback per RFC 1122)
PASS [B8.isLoopback(127.1.2.3)]        allowed
PASS [B8.isLoopback(::1)]              allowed
PASS [B8.isLoopback(10.0.0.7)]         denied
PASS [B8.isLoopback(192.168.1.20)]     denied
PASS [B8.isLoopback(::ffff:8.8.8.8)]   denied      (mapped public address is not loopback)
PASS [B8.isLoopback(2001:db8::1)]      denied
PASS [B8.isLoopback(undefined)]        denied      (fail-closed)
PASS [B8.deny(10.0.0.7)]     non-loopback peer refused on every route (403) —
     /api/snapshot:403 /api/health:403 /api/refresh:403 /:403 /client.js:403
PASS [B8.deny(2001:db8::1)]  same 403s
PASS [B8.deny(192.168.1.20)] same 403s
PASS [B8.allow(loopback)] ::ffff:127.0.0.1:200 127.0.0.5:200 ::1:200
PASS [B8.allowRemote] allowRemote:true is what opens the route to a non-loopback peer — HTTP 200 for 10.0.0.7
```

For the deny cases the peer address was spoofed in the stand-in server (the real DSH server binds loopback
only, so a remote peer cannot even open a connection):

```
$ lsof -nP -iTCP:3181 -sTCP:LISTEN
DeepSeek  <pid>  songer  IPv4  TCP 127.0.0.1:3181 (LISTEN)
```

**Answer to "could a non-loopback peer ever read the API?"** Not with the frozen defaults on this build:
the socket is bound to `127.0.0.1`, and even if a peer reached the handler (e.g. a reverse proxy in front of
DSH) every route independently returns 403 unless the composition sets `allowRemote: true`. The gate is
fail-closed for an unknown/absent address.

### B9–B10 — config and misc

```
PASS [B9.1] page route absent when servePage:false — HTTP 404   (prefix seat now answers handleUnknown)
PASS [B9.2] API still answers when servePage:false — HTTP 200
PASS [B10.1] GET /api/refresh is accepted and forces a refetch — HTTP 200, 1791961980343 -> 1791961980794
PASS [B10.2] DELETE /api/refresh still carries Allow: POST, GET
PASS [B10.3] the page document carries no external subresource that CSP would block
PASS [B10.4] CSP allows the inline boot script the page needs
```

---

## 3. C — adversarial upstream cases

Command: `node test/verify/adversarial.mjs` → **SUMMARY: 122/122 checks passed** (119 in the main run plus
the 3 `c11` dispose checks).

Headline results, with the raw evidence that matters:

### C1 missing credential → `not-configured`, board still serves

```
PASS [C1.0] envelope is still HTTP 200 (provider failure is not a transport failure) — HTTP 200
PASS [C1.1] ok is false because two providers are unconfigured — = false
PASS [C1.3] DeepSeek (configured) stays ok
PASS [C1.4] GLM row is not-configured — {"status":"not-configured","message":"Set ZAI_CODING_CN_API_KEY
     to show the GLM Coding Plan quota.","meta":{"source":"quota-api","env":"ZAI_CODING_CN_API_KEY"}}
PASS [C1.6] Kimi row is not-configured — "Set KIMI_CODING_API_KEY to show the Kimi Code quota."
PASS [C1.8] DeepSeek with no grant is not-configured — "Sign in to DeepSeek Platform to store the
     DEEPSEEK_PLATFORM_TOKEN grant."
PASS [C1.10] an unconfigured provider makes no upstream call at all — 0 calls
PASS [C1.11] GLM not-configured makes no upstream call — 0 calls
```

### C2 invalid credential hidden behind HTTP 200 business codes (the trap)

```
PASS [C2.1] DeepSeek HTTP 200 + code 40003 -> unauthorized (status-only check would say ok) —
     {"status":"unauthorized","code":"code 40003","message":"The DeepSeek Platform grant was rejected; …"}
PASS [C2.3] GLM HTTP 200 + success:false + code 1000 -> unauthorized — code "code 1000"
PASS [C2.5] GLM tried both regional hosts before giving up — 2 calls
PASS [C2.6] GLM non-200 code without a success flag -> upstream-error, never a fake ok row
PASS [C2.7] Kimi HTTP 200 + error.type invalid_api_key -> unauthorized
PASS [C2.8] DeepSeek code:0 but biz_code 40003 -> unauthorized
```

The body-code path is genuinely taken: a `status >= 200 && < 300` shortcut would have reported `ok` for both
DeepSeek and GLM, and it does not. This was also observed against the **real** providers with a bogus key
(`ZAI_CODING_CN_API_KEY=qa-bogus…` launched instance): GLM answered `code 401`, Kimi `HTTP 401`,
DeepSeek stayed `ok`.

### C3 upstream status mapping (all three providers, six statuses)

```
HTTP 401 -> unauthorized (DS 1 call, GLM 2, Kimi 2)     HTTP 429 -> rate-limited
HTTP 403 -> unauthorized                                 HTTP 500 -> upstream-error
HTTP 404 -> upstream-error                               HTTP 503 -> upstream-error
PASS [C3.mixed] GLM 429 (CN) + 500 (intl) reports rate-limited, not upstream-error
PASS [C3.intl-auth] Kimi 503 (CN) + 403 (intl) reports unauthorized (most specific wins)
```

### C4 malformed 2xx bodies → `invalid-response`, `rawSnippet`, no throw

```
PASS [C4.json.*]    2xx {"hello":"world"} -> invalid-response + meta.rawSnippet for all three providers
PASS [C4.html.*]    2xx HTML -> invalid-response/E_NOT_JSON + rawSnippet (len 31)
PASS [C4.empty]     GLM 2xx empty body -> invalid-response
PASS [C4.huge]      GLM 200 KiB non-JSON body is truncated, not echoed whole — rawSnippet len=200
```

### C5 transport failure: DNS, abort, deadline, pre-aborted

```
PASS [C5.1]  unresolvable host -> network-error — {"status":"network-error","code":"TypeError",…}
PASS [C5.2b] Kimi DNS failure -> network-error after trying both hosts
PASS [C5.3]  aborted signal -> network-error/ABORTED
PASS [C5.4]  abort actually cancelled the in-flight request (< 1000 ms, not the 12 s timeout)
             — 62 ms; transport saw 1 abort(s)
PASS [C5.5]  a hanging upstream hits the deadline instead of hanging forever — 602 ms
PASS [C5.6]  deadline failure is reported as TimeoutError
PASS [C5.7]  already-aborted signal -> network-error with zero upstream calls
```

### C6 all three failing at once

```
PASS [C6.1] envelope is HTTP 200 even when every provider fails — HTTP 200
PASS [C6.2] ok is false
PASS [C6.3] three rows, protocol order preserved = ["deepseek","glm","kimi"]
PASS [C6.4] every row has a non-ok status — deepseek:upstream-error, glm:upstream-error, kimi:upstream-error
PASS [C6.5] every row carries a human-readable message
PASS [C6.7] the standalone page still answers HTTP 200 with the renderer — 13642 bytes
all-failing envelope: [{"id":"deepseek","status":"upstream-error","message":"The provider returned HTTP 503."}, …]
```

Rendered proof: `test/verify/screenshots/42-standalone-outage-frozen.png` — three readable cards, each
`上游错误` + message + `HTTP 503`, header reads `刚刚更新 · 部分服务异常`. No blank screen, no console error.

### C7 refresh storm — measured, not assumed

```
PASS [C7.1] all 10 refreshes answered 200 — 200,200,…,200
PASS [C7.2] 10 parallel refreshes cost exactly one fan-out — 5 upstream calls vs baseline 5 per fan-out
PASS [C7.3] all 10 responses share one generatedAt — 1 distinct value
PASS [C7.4] health.reads advanced by exactly one fan-out (baseline + 1) — reads=2
PASS [C7.5] fan-out is far below the naive 10x — 5 vs naive 50
PASS [C7.6] the storm hit exactly the same upstream URLs as one baseline fan-out
PASS [C7.7] cold cache + 10 parallel GETs still fans out once — 5 upstream calls vs baseline 5
```

One fan-out on the frozen revision is 5 calls: DeepSeek `get_user_summary` + `usage/cost`, GLM
`quota/limit` + `api.z.ai/api/biz/subscription/list`, Kimi `coding/v1/usages`. The storm's call multiset is
byte-identical to a single sequential fan-out, so the shared-in-flight guard holds under a real 10-way
parallel POST storm over HTTP.

### C8 cache boundary

```
PASS [C8.1] two GETs inside ttl return byte-identical bodies — generatedAt 1791961324985 / …985
PASS [C8.2] generatedAt is unchanged inside ttl
PASS [C8.3] the second GET inside ttl makes zero upstream calls — 5 -> 5
PASS [C8.4] POST /refresh ignores a fresh cache
PASS [C8.4b] the forced refresh cost exactly one more fan-out — 10 calls after force (expected 10)
PASS [C8.5] past the ttl the snapshot is refetched — …985 -> …711  (15 s ttl, real wait)
PASS [C8.7] snapshot carries the configured ttl — ttlMs=15000
```

### C9–C11 — health hygiene, best-effort sources, disposal

```
PASS [C9.*]  /health ok:true, ref names only, no token echo, HEAD has content-length and no body, 3 providers
PASS [C10.1] DeepSeek stays ok when the spend-history call fails — meta.dailyUsageError="HTTP 500"
PASS [C10.3] no fabricated dailyUsage series
PASS [C10.4] GLM stays ok when the subscription call fails — plan falls back to "lite",
             meta.subscriptionError="HTTP 500"
PASS [C10.7] DeepSeek stays ok when the optional sk- balance source is rejected
PASS [C10.10] merge reports source "both"
PASS [C11.1] an in-flight read still resolves after dispose (no hang)
PASS [C11.2] a disposed service does not re-run upstream on the next get() — 1 upstream call
```

A failing *secondary* source never degrades a good row — the class of bug that would have turned a healthy
DeepSeek wallet into an error card. (See D-9 for the disposal nit this exposed.)

---

## 4. D — browser end-to-end (real Chromium)

Command:
`node test/verify/browser-e2e.mjs http://127.0.0.1:3181 <token>` → **23/25 pass** (2 failures = D-2)

### Sidebar and panel

```
PASS [D0.0] target instance answers /usage-board/api/health — HTTP 200
PASS [D0.1] console capture channel is live (probe visible) — [warning] qa-console-probe
PASS [D1.1] sidebar exposes a 用量看板 entry
PASS [D1.2] sidebar entry sits in the global-panel navigation next to 插件
PASS [D1.3] DSH serves the browser half from the client-module route (HTTP 200)
PASS [D2.1] panel renders all three provider cards
PASS [D2.2] every provider is marked 正常 (ok) — 3 × 正常
PASS [D2.3] panel shows the DeepSeek money balance — ¥23.09 ¥132.92 ¥30.32
PASS [D2.4] panel shows quota percentages — 32.0% 58.0% 35.7% 42.7%
PASS [D2.5] panel shows reset countdowns — 小时后重置 天后重置 分钟后重置 天后重置
```

Screenshots (frozen revision):

- `test/verify/screenshots/30-sidebar-frozen.png` — sidebar with the **用量看板** entry under 插件
- `test/verify/screenshots/31-panel-frozen.png` — panel: DeepSeek ¥23.09 / 总消耗 ¥132.92 / 近 14 天消耗 ¥30.32
  sparkline; GLM Coding Lite 5 小时窗口 32.0% 656/2,000 剩余 1,343 · 每周窗口 58.0% 5,831/10,000 剩余 4,168;
  Kimi Code 5 小时窗口 35.7% 36/100 剩余 64 · 每周窗口 42.7% 43/100 剩余 57
- `test/verify/screenshots/32-standalone-frozen.png` — the second renderer, same snapshot

### Console (verbatim)

```
$ agent-browser --session qa-e2e-panel console      # after load + panel open
(empty)
$ agent-browser --session qa-e2e-panel errors
(empty)
$ agent-browser --session qa-e2e-page console       # standalone page
(empty)
$ agent-browser --session qa-e2e-page errors
(empty)
```

The capture channel itself was proven live with a synthetic warning (`[warning] qa-console-probe`), so the
empty output is a genuine absence of errors, not a broken pipe. No React key warnings, no CSP violations
(`Refused to execute inline script…`), no unhandled rejections, in either renderer — including in the
degraded runs.

### Two-renderer cross-check (same `generatedAt`, proven)

```
PASS [D3.1] both renderers read the same cached snapshot (generatedAt stable) — 1791961823268 / …268
PASS [D3.2] panel text agrees with the raw snapshot for every number — 14 values matched
PASS [D3.3] standalone text agrees with the raw snapshot for every number — 14 values matched
PASS [D3.4] the two renderers agree on provider order and status
```

Every money, percent, used and remaining value rendered by both views was matched against the raw snapshot
JSON. The derived "近 14 天消耗" total was audited separately: the panel showed **¥30.32** while
`sum(meta.dailyUsage.points[].cost)` on the same snapshot was **30.32** — the derived number is right.

The only cross-renderer disagreement is the countdown text (defect **D-2**):

```
FAIL [D4.glm/glm.weekly]  both renderers show the same day countdown — panel="2 天后重置", standalone="1 天后重置"  (45.04 h)
FAIL [D4.kimi/kimi.weekly] both renderers show the same day countdown — panel="2 天后重置", standalone="1 天后重置"  (49.02 h)
```

### Freshness and unattended refresh (the "stale generatedAt presented as live" check)

```
PASS [D6.1] panel states the snapshot age — panel says "9 秒前更新"
PASS [D6.2] the page 刷新 button forces a real refetch — …268 -> …307
PASS [D6.3] the page still renders providers after a manual refresh
      waiting 75 s without touching the page to test the refresh schedule (age now: 刚刚更新)
PASS [D7.1] the page refetches by itself within the ttl window (no user action) — …307 -> …300
PASS [D7.2] the displayed age is a fresh value, not a frozen string
```

The countdown is recomputed on every refresh and the page really does re-read upstream every 60 s while
idle; nothing on screen is presented as live while frozen.

### Degraded path — via config/credentials only, never by editing source

The plugin exposes **no config knob for upstream hosts** (only `ttlMs`, `servePage`, `allowRemote`,
`verbose`), so the honest way to degrade it is (a) credentials, and (b) a transport-level fixture:

1. **Live, partial outage**: `dsh --profile usage-qa --port 3182` launched with
   `ZAI_CODING_CN_API_KEY=qa-bogus… KIMI_CODING_API_KEY=qa-bogus…` (env outranks the stored file through the
   real credentials seam).
   `test/verify/screenshots/40-panel-degraded-frozen.png`: DeepSeek card `正常 ¥22.65 总消耗 ¥133.35
   近 14 天消耗 ¥30.75`; GLM `未授权` + `The GLM Coding Plan credential was rejected; check
   ZAI_CODING_CN_API_KEY.` + `code 401`; Kimi `未授权` + `The stored credential was rejected by the
   provider.` + `HTTP 401`. Sidebar and layout intact; console/errors empty.
   `test/verify/screenshots/41-standalone-degraded-frozen.png`: same data in the standalone renderer with
   `20 秒前 · 部分服务异常` in the header.
2. **Total outage**: `node test/verify/degraded-server.mjs 3199` runs the plugin's real routes and real
   `dashboard.html` over a transport that answers 503 for every provider host.
   `test/verify/screenshots/42-standalone-outage-frozen.png`: three `上游错误` cards, each with
   `The provider returned HTTP 503.` / `HTTP 503`, header `刚刚更新 · 部分服务异常`; console/errors empty.

Both degraded paths stay readable and per-provider — no blank page, no thrown render error.

---

## 5. E — does this actually help the user? (product judgment)

The target user holds a DeepSeek wallet, a GLM Coding Plan and a Kimi Code subscription. At a glance:

- **Money left — yes.** DeepSeek's card leads with `¥23.09` (available), `总消耗 ¥132.92` and a 14-day spend
  sparkline. This is exactly the wallet question, answered in one line, from the real Platform grant.
- **Quota left — yes.** GLM shows both windows (`5 小时窗口 ×5`, `每周窗口`) with `656 / 2,000`,
  `剩余 1,343` and a bar; Kimi shows both windows with `36 / 100`, `剩余 64`.
- **When it resets — yes.** Every window carries `3 小时后重置` / `2 天后重置` style text, recomputed on each
  refresh, and it does refresh by itself.
- **Overall health — yes.** Each card has a status pill (`正常` / `未授权` / `上游错误`), the header says
  `部分服务异常` when any provider fails, and the footer names the actual hosts.

What a picky user will notice (all low severity, details in §6):

1. Two views of the same data can print different countdowns (`2 天后重置` vs `1 天后重置`) — D-2.
2. `32.0%` sits next to `656 / 2,000`, which is 32.8% — D-3.
3. `656` + `剩余 1,343` = 1,999, not 2,000 — D-4.
4. The only actionable error text is English in an otherwise Chinese UI — D-5.
5. Kimi's `36 / 100` denominator is never explained (it is not tokens) — D-6.
6. A never-updating countdown was specifically hunted for and **not** found: the panel/page re-reads
   upstream every 60 s and recomputes, verified over a 75 s idle window (D7.1/D7.2).

Nothing on the board is invented: DeepSeek has no quota window, the adapter says so in `meta.note`, and the
UI shows balance + history instead of a fake bar.

---

## 6. Defect list (numbered, by severity)

### D-1 — **P1, FIXED IN FREEZE** — unknown `/usage-board/api/*` path returned HTTP 200 + the dashboard HTML

- **Observed (pre-freeze):** `GET /usage-board/api/does-not-exist` → `200 text/html`, body = the 用量看板 page.
  An API consumer or a typo'd client route would silently parse HTML, and the prefix route also swallowed
  every unknown non-API path.
- **Repro:** `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3178/usage-board/api/does-not-exist` → was `200`.
- **Status:** fixed by `lead` in the freeze (prefix route now owns the namespace and 404s what it does not
  own). Re-verified: `404 application/json` `{"ok":false,"error":{"code":"not-found",…}}` for API paths,
  `404 text/html` otherwise, page still served at `/usage-board` and `/usage-board/`. Checks B6.1–B6.8.

### D-2 — **P3, OPEN** — the two renderers print different countdowns for the same `resetAt`

- **Observed:** with 45.04 h remaining on `glm.weekly`, the React panel says `2 天后重置` and the standalone
  page says `1 天后重置`. Same for `kimi.weekly` at 49.02 h. `src/client/panel.js` uses `Math.round` for
  days/hours/minutes; `src/host/web/dashboard.html` uses `Math.floor`. For a 47 h window the standalone view
  understates by nearly a day.
- **Repro:** `node test/verify/browser-e2e.mjs <base> <token>` → `FAIL [D4.*]`; or open both views and compare
  the GLM weekly line.
- **Fix (owner's choice):** one shared formatter, or make the standalone `Math.round` like the panel.

### D-3 — **P3, OPEN** — displayed percentage can contradict the displayed fraction

- **Observed:** GLM 5h bar/`32.0%` beside `656 / 2,000` (true 32.8%); GLM weekly `58.0%` beside
  `5,831 / 10,000` (58.31%); Kimi 5h `35.7%` beside `36 / 100` (36.0%). `percentOf()` prefers the
  provider-reported percentage/ratio (the GLM `percentage` field, Kimi `used_ratio`) over `used/limit`, so the
  bar and the fraction can tell different stories by up to 0.8 pp.
- **Repro:** `curl -s .../usage-board/api/snapshot` and compare `windows[].percent` with `used/limit`.
- **Assessment:** defensible (the provider's own accounting wins) but worth a tooltip or a consistent source.

### D-4 — **P3, OPEN (upstream)** — GLM's three numbers do not add up

- **Observed:** `used 656 + remaining 1,343 = 1,999` against `limit 2,000`; weekly `5,831 + 4,168 = 9,999`
  against `10,000`. The adapter surfaces upstream values verbatim (correctly — it must not invent numbers),
  but the user sees an off-by-one.
- **Repro:** same snapshot; `node -e` sum above.

### D-5 — **P3, OPEN** — the actionable text is English in a Chinese UI

- **Observed:** `未授权` pill next to `The GLM Coding Plan credential was rejected; check
  ZAI_CODING_CN_API_KEY.`; `not-configured` state says `Set KIMI_CODING_API_KEY to show the Kimi Code quota.`
  The protocol carries one `message` string, and the host writes English.
- **Repro:** `test/verify/screenshots/40-panel-degraded-frozen.png` (or launch with a bogus key).
- **Assessment:** the user in question reads Chinese; this is the one screen where they must act. A
  `messageKey` (like `labelKey`) would let the client localise without breaking the frozen wire shape
  (additive field).

### D-6 — **P3, OPEN** — Kimi's denominator is unlabelled

- **Observed:** `5 小时窗口 36 / 100 · 剩余 64`. Those are the upstream `limit`/`used` counters (percent
  scaled), while `unit` on the window is `TIME_UNIT_MINUTE` — the window *duration*, not the quota unit. A
  user can read `36 / 100` as tokens or requests.
- **Repro:** Kimi card, or `windows[0]` in the snapshot (`unit: "TIME_UNIT_MINUTE"`, `limit: 100`).

### D-7 — **P3, OPEN** — `GET /usage-board/api/refresh` forces upstream work

- **Observed:** the refresh route allows `POST, GET`. A cross-origin `GET` is a no-preflight simple request,
  so any page the user visits can trigger a fan-out at `127.0.0.1:3178` (the response is unreadable without
  CORS, but the side effect happens). Blast radius is 5 upstream calls per hit; loopback-only keeps it local.
- **Repro:** `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3181/usage-board/api/refresh` → 200 and
  `reads` increments.
- **Fix:** drop `GET` from the allow list for the refresh route (`Allow: POST` only).

### D-8 — **P3 nit, OPEN** — dead `describeSecret()` helper

- **Observed:** `describeSecret()` in `src/host/credentials.js` is exported but referenced nowhere; it also
  reveals `first4…last2` of a secret, so wiring it into `/health` later would be a regression. `/health`
  currently exposes reference names only, which is correct.
- **Repro:** `grep -rn describeSecret src/ lib/` → definition only.

### D-9 — **P3 nit, OPEN** — `SnapshotService.dispose()` can be undone by its own in-flight read

- **Observed:** `dispose()` aborts and nulls `#cache`, but the in-flight `#read()` still finishes and assigns
  `this.#cache = {…}` afterwards, so a disposed service serves a cached snapshot on the next `get()` without
  re-reading upstream (calls=1, proven). No user impact while the route table is gone; the intent of
  `dispose()` is just not fully met. A `#disposed` flag checked before caching would close it.
- **Repro:** `node test/verify/adversarial.mjs c11` → C11.1–C11.3 pass with the note printed.

---

## 7. What I could NOT verify (and why)

1. **The user's live desktop profile / packaged app.** I verified the package in a scratch profile only;
   `~/.dsh/profiles/desktop` was never touched, by instruction. Plugin composition, ordering against other
   bundles, and the packaged app's own client-module cache are therefore unverified here.
2. **A real non-loopback client hitting the API.** DSH binds `127.0.0.1` on this build, so the 403 path was
   proven with a spoofed peer address in a stand-in server plus the exported predicate — not with a second
   machine. A deployment behind a reverse proxy or with `allowRemote: true` is untested by construction.
3. **Real upstream 429/5xx/HTML/business-code-1000 responses from the live providers.** Those cases were
   driven through the real code with a controlled transport. Only 401 (bogus key) and the happy path were
   observed against the real APIs; nobody should provoke a production 429 to test a dashboard.
4. **TLS-specific and HTTP/2-specific transport failures.** DNS failure, timeout and abort were exercised;
   certificate failure and protocol downgrade were not.
5. **The `verbose: true` config branch.** The debug logging path (per-fan-out log lines) was exercised at the
   default `verbose: false` only; log lines were never checked for secret material with verbose on.
6. **The `allowRemote: true` composition end-to-end in DSH.** Verified on the stand-in server (a spoofed
   `10.0.0.7` gets 200 with the flag on), not against a real remote peer.
7. **Locale switching in the panel.** I verified both dictionary registrations, that the sidebar label follows
   the active language (existing unit test) and that no Japanese-only kanji (実) remains in the shipped
   bundle/source, but I did not drive DSH's language switcher in the browser.
8. **Long-run soak / drift.** The dashboard was observed for roughly ten minutes; multi-hour behaviour
   (memory, timer drift, the 60 s auto-refresh over hours) is out of scope for this pass.
9. **Windows/Linux.** All findings are from macOS arm64 / Node 26.8.2.
10. **Plugin unload in a live DSH process.** `dispose()` was tested at the unit level (C11), not by unloading
    the plugin from a running web profile and re-requesting the routes.
11. **`test/providers.live.mjs` under adverse real-network conditions** (captive portal, slow DNS) — one clean
    run only.

---

## 8. Reproduce everything

```bash
cd /Users/songer/Documents/deepseek-harness/default-workspace/dsh-plugin-usage-board

# A — existing suites
node --test test/
node test/providers.live.mjs

# live instance (any profile that links this package; the report used a usage-dev clone on 3181)
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --profile usage-qa --port 3181 --no-open
# ^ prints  dsh web: http://127.0.0.1:3181/?token=…   (needed for the SPA/sidebar; the API and /usage-board/ need no token)

# B — routes, 404s, methods, loopback, leak scan
node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board

# C — adversarial upstreams (self-contained; no network, no credentials)
node test/verify/adversarial.mjs            # 122 checks
node test/verify/adversarial.mjs c2         # one section only

# D — real browser (needs the token from the boot line)
node test/verify/browser-e2e.mjs http://127.0.0.1:3181 <token>

# degraded paths
ZAI_CODING_CN_API_KEY=qa-bogus KIMI_CODING_API_KEY=qa-bogus \
  "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --profile usage-qa --port 3182 --no-open
node test/verify/degraded-server.mjs 3199   # all-providers-failing fixture host, stays alive
```

Harness files: `test/verify/_lib.mjs` (shared plumbing), `adversarial.mjs` (C), `routes-live.mjs` (B),
`browser-e2e.mjs` (D), `degraded-server.mjs` (fixture host).
Screenshots: `test/verify/screenshots/*-frozen.png`; pre-freeze captures kept in
`test/verify/screenshots/archive/`.

### Honesty notes on this report

- Every quoted output is from a command run by the verifier on the frozen hashes above. Where output is
  abridged it is marked with `…`; nothing was re-typed from memory.
- Two failures in this report are **my harness's**, not the product's, and were fixed during the pass: a
  fixture `default` rule that swallowed the harness's own localhost requests (C6 showed a spurious 500), and
  a digit-grouping mismatch (`1,343` vs `1343`) that made the panel look like it disagreed with the snapshot.
  Both are noted here so the numbers above are not read as product defects.
- One P0-class check (credential leakage) was run as an adversary *against myself* as well: no harness output
  in this document contains a full secret, and the leak scan compares against in-memory values only.
