# Independent verification — `dsh-plugin-usage-board`

**Task:** `task-3` (independent verification + adversarial QA) · **Verifier:** `qa`
**Date:** 2026-10-14 (Asia/Shanghai) · **Rounds:** freeze **v1** (15:08) and freeze **v2** (15:24)
**Write scope used:** `test/verify/**`, `docs/VERIFICATION.md` only. No `src/**`, `lib/**`, or `package.json` file was modified by the verifier.

---

## 0. Verdict on freeze v2

**Ship it, with one caveat worth a five-minute fix.** Every defect I filed in round 1 except the two the
owner deliberately declined is fixed and re-verified, and each fix was attacked independently rather than
accepted on description. The new body-cap work is safe under hostile upstreams, including a gzip bomb. The
`derivedPercent` addition does what it claims without destroying the provider's declared value.

The caveat is a **new, round-2 defect (D-10)**: the host's failure classifier labels three GLM failure modes
as *"no active Coding Plan subscription"* — including the real case of a **rejected GLM key**, which I
triggered live with a bogus credential. A user with an expired key is told to check their subscription. It is
one string-ordering bug in `classifyMessage` and it is in the code path that round 1's D-5 was written to add.

| Suite (v2) | What it covers | Result |
|---|---|---|
| **A** | `node --test test/` + `node test/providers.live.mjs` | **109/109 pass**; live script `ok` for all three providers |
| **B** | Live routes, methods, 404s, CSP, loopback gate, secret-leak scan | **67/67 pass** |
| **C** | Adversarial upstreams + v2 additions (cap/flood/gzip-bomb, hostile windows, messageKey, dispose) | **173/179 pass** — 6 failures are all D-10 |
| **D** | Real browser: sidebar, panel, standalone, console, freshness, derived-percent preference, countdown agreement | **28/28 pass** |
| **R** | Render-truth: does each card show the sentence for the *correct* diagnosis | **6/9 on a degraded live instance** (3 = D-10) · **9/9 on the all-failing fixture** |
| **Leak scan** | full + first-8 + last-8 of all three real secrets against every response and my own deliverables | **clean** |

Open defects: **1 medium (D-10)**, 0 high. Accepted by design: D-4, D-6.

### Frozen revision v2 — all 21 manifest hashes confirmed

Checked at 15:26; nothing moved afterwards. Round-1 hashes are recorded in §2.

```
48f91476a131  lib/client.js                    18330182a2f6  lib/index.js
4d5c6b18bdc5  src/shared/protocol.js           5f061d82d5ca  src/host/fetch-json.js
647a82769763  src/host/credentials.js          94c47d87ab7f  src/host/snapshot.js
ecc3694795ce  src/host/routes.js               5c5d40f1d3ec  src/host/providers/common.js
e4af77468716  src/host/providers/deepseek.js   41ca9e8ae8ae  src/host/providers/glm.js
1230f2fc461b  src/host/providers/kimi.js       39a91f1a8d30  src/host/providers/index.js
a36fcffe564e  src/client/panel.js              e2dbd9879f02  src/client/protocol-copy.js
5e149c2f1ff4  src/client/styles.css            72c328744464  src/host/web/dashboard.html
7b6cfb36a1d0  test/snapshot.test.js            eb9239cce7f6  test/providers.parsing.test.js
3bf9687c537b  test/client-bundle.test.js       7c089de8de10  package.json
3f3cb0fe1395  cordis.patch.yml
```

### Environment and method

macOS arm64, Node **v26.8.2**, DSH CLI from `/Applications/DeepSeek Harness.app/…/runtime/cli/bin/dsh`,
`agent-browser` 0.38.1 (real Chromium). The live instance for round 2 runs from a **clone of the `usage-dev`
profile named `usage-qa`** (identical `link:` to this package) on `127.0.0.1:3181`, because other members'
`pkill -f "profile usage-dev"` killed the verifier's instances twice mid-run in round 1.
**`~/.dsh/profiles/desktop` was never touched.**

Adversarial inputs are driven through the *real* stack: replacing `globalThis.fetch` (resolved at call time by
`fetch-json.js`) exercises route handler → `SnapshotService` → adapter → `fetchJson` → transport; credentials
are injected through the real `getSecret` seam; route-level cases run the real `registerRoutes` over
`node:http` with a stand-in `webServer`; the live DSH instance covers the real dispatcher; real Chromium
covers rendering. No harness edits any product file.

---

## 1. What changed in v2, and how each change was attacked

| v2 change | How I attacked it | Outcome |
|---|---|---|
| `derivedPercent` added; clients render `derivedPercent ?? percent` | wire inspection, hostile window inputs, panel-vs-snapshot numeric match, explicit "must not render declared" check | sound; declared value preserved (C0.21–C0.24, B2.8/B2.9, D3.5) |
| `dashboard.html` countdown switched to the panel's rounding | live comparison of both renderers in the 44–49 h band | **fixed** (D4 passes) |
| `messageKey` attached to every non-ok row | HTTP-level key inspection per status, classifier matrix, live degraded render in both renderers | **partly wrong — D-10** |
| Refresh route POST-only | GET/HEAD/DELETE probes | fixed (D-7) |
| `describeSecret()` deleted | grep | fixed (D-8) |
| `#disposed` flag | in-flight dispose unit test | fixed (D-9) |
| `fetchJson` cap 8 KiB → 512 KiB + `truncated`/`BodyTooLargeError` | unbounded stream, 32 MiB real flood, **gzip bomb**, over-cap adapter input, RSS measurement | sound, no exhaustion vector (C14) |

---

## 2. Round 1 (freeze v1) — historical record

Kept as filed: these are the findings that drove the v2 changes, with the revisions they were measured on.

**Frozen v1 manifest (all 19 verified):** `8c07ea352de8 lib/client.js`, `18330182a2f6 lib/index.js`,
`6a2699802df7 src/shared/protocol.js`, `5f061d82d5ca src/host/fetch-json.js`, `53422389a472 credentials.js`,
`7e5fdca79871 snapshot.js`, `cafcb6ce7462 routes.js`, `5c5d40f1d3ec providers/common.js`,
`e4af77468716 deepseek.js`, `41ca9e8ae8ae glm.js`, `1230f2fc461b kimi.js`, `39a91f1a8d30 providers/index.js`,
`32ef7b2c5262 panel.js`, `3af67612a4ad protocol-copy.js`, `414ed8490f5e styles.css`,
`8c938b632b8d dashboard.html`, `b73f60814255 snapshot.test.js`, `9248575f4b54 providers.parsing.test.js`,
`bd5def7d09a0 client-bundle.test.js`.

**v1 results:** A 94/94 · B 63/63 · C 122/122 · D 23/25 · leak scan clean.

v1 highlights that still matter as evidence:

```
PASS [C2.1] DeepSeek HTTP 200 + code 40003 -> unauthorized (status-only check would say ok)
PASS [C2.3] GLM HTTP 200 + success:false + code 1000 -> unauthorized
PASS [C4.huge] GLM 200 KiB non-JSON body is truncated, not echoed whole — rawSnippet len=200
PASS [C5.4] abort actually cancelled the in-flight request — 62 ms; transport saw 1 abort(s)
PASS [C6.1] envelope is HTTP 200 even when every provider fails — HTTP 200
PASS [C7.2] 10 parallel refreshes cost exactly one fan-out — 5 upstream calls vs baseline 5 per fan-out
PASS [B7.KIMI_CODING_API_KEY] no response contains the first 8 chars of KIMI_CODING_API_KEY (sk-k…Age1) — clean
PASS [B8.deny(10.0.0.7)] non-loopback peer refused on every route (403)
FAIL [B6.1] unknown API path returned HTTP 200 text/html (the dashboard)   <- D-1, fixed in the v1 freeze
FAIL [D4.glm/glm.weekly] panel="2 天后重置", standalone="1 天后重置" (45.04 h)  <- D-2, fixed in v2
```

The two round-1 defects that a user would have felt — a provider failure leaking as HTTP 200 HTML (D-1) and
two views of the same quota disagreeing (D-2) — were both real and are both gone.

---

## 3. Round 2 (freeze v2) — results

### 3.1 A — suites

```
$ node --test test/
ℹ tests 109
ℹ suites 4
ℹ pass 109
ℹ fail 0
ℹ skipped 0

$ node test/providers.live.mjs        # exit=0
── DeepSeek (deepseek) ─────────────────────────
   status  : ok
── GLM Coding Plan (glm) ─────────────────────────
   status  : ok
   plan    : GLM Coding Lite
   window  : glm.5h 32% [656/2000 (1343 left)] unit=3 reset 2026-10-14T10:24:12.542Z (in 179m)
   window  : glm.weekly 58% [5831/10000 (4168 left)] unit=6 reset 2026-10-16T04:12:55.997Z (in 2688m)
── Kimi Code (kimi) ─────────────────────────
   status  : ok
   window  : kimi.5h 0% [0/100 (100 left)] unit=TIME_UNIT_MINUTE reset 2026-10-14T12:11:55Z (in 287m)
   window  : kimi.weekly 42.7% [43/100 (57 left)] unit=7d reset 2026-10-16T08:11:56Z (in 2927m)
all providers ok (or not configured)
```

### 3.2 B — live routes (`node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board`)

```
PASS [B2.6] every protocol field is present on every row/window — no missing fields
PASS [B2.8] every window carries derivedPercent that matches used/limit exactly — all windows consistent
PASS [B2.9] the provider-declared percent is still recoverable verbatim beside derivedPercent —
     glm/glm.5h: declared=32 derived=32.8, glm/glm.weekly: declared=58 derived=58.3,
     kimi/kimi.5h: declared=0 derived=0, kimi/kimi.weekly: declared=42.7 derived=43
PASS [B2.10] messageKey is null on ok rows and never undefined
PASS [B6.1] unknown API path -> 404 JSON with error.code not-found
PASS [B6.2] unknown non-API path -> 404 HTML, not a 200 dashboard
PASS [B6.5] a reflected path cannot inject markup (percent-encoded, never decoded)
PASS [B6.8] the plugin does not double-serve the browser bundle (DSH client-module route owns it)
PASS [B7.ZAI_CODING_CN_API_KEY] …(d628…9wrM) — clean
PASS [B7.KIMI_CODING_API_KEY] …(sk-k…Age1) — clean
PASS [B7.DEEPSEEK_PLATFORM_TOKEN] …(eEiC…TwZK) — clean
PASS [B7.bearer] no response echoes a Bearer token
PASS [B7.token] no response contains the literal grant token
PASS [B8.isLoopback(::ffff:127.0.0.1)] allowed   PASS [B8.isLoopback(127.0.0.5)] allowed
PASS [B8.isLoopback(::1)] allowed                PASS [B8.isLoopback(10.0.0.7)] denied
PASS [B8.isLoopback(::ffff:8.8.8.8)] denied      PASS [B8.isLoopback(undefined)] denied (fail-closed)
PASS [B8.deny(10.0.0.7)] non-loopback peer refused on every route (403)
PASS [B8.deny(2001:db8::1)] 403   PASS [B8.deny(192.168.1.20)] 403
PASS [B8.allowRemote] allowRemote:true is what opens the route to a non-loopback peer
PASS [B10.1] GET /api/refresh -> 405 with Allow: POST (D-7 fix) — HTTP 405, allow: POST
PASS [B10.2] POST /api/refresh still forces a real refetch
PASS [B10.2b] HEAD /api/refresh is also refused (405)

SUMMARY: 67/67 checks passed
```

Wire sample from the same instance (money is live; this session spends DeepSeek credit):

```
ok: true protocolVersion: 1 ttlMs: 60000
deepseek ok messageKey: null
glm ok messageKey: null
    glm.5h percent: 32 derivedPercent: 32.8 limit: 2000 used: 656 remaining: 1343 sum: 1999
    glm.weekly percent: 58 derivedPercent: 58.3 limit: 10000 used: 5831 remaining: 4168 sum: 9999
kimi ok messageKey: null
    kimi.5h percent: 0 derivedPercent: 0 limit: 100 used: 0 remaining: 100 sum: 100
    kimi.weekly percent: 42.7 derivedPercent: 43 limit: 100 used: 43 remaining: 57 sum: 100
```

`/usage-board/api/*` needs no token; `/plugins/??…dsh-plugin-usage-board/client.js&rev=…` (DSH's own
client-module route) answers 200 — the duplicate route removal is correct, and a stale `rev` 404s as intended.

### 3.3 C — adversarial upstreams (`node test/verify/adversarial.mjs`)

**173/179 checks passed; the 6 failures are all D-10.** Sections C0–C11 and the C1–C8 protocol matrix are
unchanged from round 1 and still pass in full. New sections:

```
== C12 derivedPercent under hostile window inputs (makeWindow is the funnel) ==
PASS [C12.limit 0] / [C12.negative limit] / [C12.limit NaN] / [C12.limit Infinity] / [C12.limit string "100"]
     / [C12.limit null] / [C12.used NaN] / [C12.used null] -> derivedPercent null
PASS [C12.zero usage] -> 0        PASS [C12.over quota (150/100)] -> 150
PASS [C12.normal] -> 33.3         PASS [C12.both null] -> null
PASS [C12.huge] extreme values never reach the payload as NaN/Infinity — derivedPercent=null (MAX_VALUE/MIN_VALUE)
PASS [C12.serialize] a hostile window still serializes as valid JSON
PASS [C12.explicit-wins] an explicit derivedPercent seed is not overwritten
SUMMARY: 16/16 checks passed

== C14 512 KiB body cap: truncation, cancellation, memory ==
PASS [C14.1] an unbounded 200 response is cut at the cap — text=524288 bytes, truncated=true
PASS [C14.2] the reader stopped pulling instead of draining the stream — 9 chunk(s) pulled (64 KiB each)
PASS [C14.3] the stream was cancelled (socket released) — cancelled=true
PASS [C14.4] a truncated JSON body reports BodyTooLargeError, not a bare parse failure
PASS [C14.5] a real 32 MiB flood body is bounded at the cap — text=524288, truncated=true
PASS [C14.6] the flood does not stall the event loop — 23 ms
PASS [C14.7] hostile-body memory growth stays far below the flood size — RSS delta 11.2 MiB for a 32 MiB flood
PASS [C14.8] the flood body is reported as BodyTooLargeError too
PASS [C14.9] a normal body under the cap still parses and is not marked truncated
PASS [C14.11] a gzip bomb is cut at the decompressed cap — text=524288, truncated=true
PASS [C14.12] the gzip bomb does not balloon memory or stall — RSS delta 12.2 MiB, 76 ms for a 64 MiB expansion
PASS [C14.10] an over-cap upstream body becomes invalid-response, never a throw or a fake ok row
SUMMARY: 12/12 checks passed

== C11 dispose() during an in-flight fan-out ==
PASS [C11.2] v2: the disposed service refuses to serve the pre-dispose snapshot from cache — 2 upstream call(s)
SUMMARY: 3/3 checks passed
```

**Answer to "can the larger cap be turned into a memory-exhaustion vector?"** No. The cap applies to the
*decompressed* stream (undici transparently inflates gzip), reading stops at 512 KiB, the reader is cancelled
so the socket is released, and both a 32 MiB flood and a 64 MiB decompression bomb cost ~12 MiB of RSS and
under 80 ms. The only behaviour change a user sees is that a pathological body is reported as
`invalid-response` with `BodyTooLargeError` instead of a bare parse error.

### 3.4 C13 / R — the messageKey path (this is where D-10 lives)

`classifyMessage` is applied in `SnapshotService.runAdapter`, so the key a client sees is attached host-side:

```
$ node test/verify/adversarial.mjs c13
FAIL [C13.http:glm not-configured] glm not-configured -> notConfigured — messageKey="noCodingPlan",
     message="Set ZAI_CODING_CN_API_KEY to show the GLM Coding Plan quota."
PASS [C13.http:kimi not-configured] kimi -> notConfigured
PASS [C13.http:deepseek not-configured] deepseek -> notConfigured
FAIL [C13.http:glm unauthorized (body code 1000)] -> authRejected — messageKey="noCodingPlan",
     message="The GLM Coding Plan credential was rejected; check ZAI_CODING_CN_API_KEY."
PASS [C13.http:glm unauthorized (http 401)] -> authRejected        (generic transport sentence)
PASS [C13.http:kimi unauthorized (http 401)] -> authRejected
PASS [C13.http:deepseek unauthorized (code 40003)] -> authRejected
PASS [C13.http:glm rate-limited] -> rateLimited
PASS [C13.http:kimi rate-limited] -> rateLimited
PASS [C13.http:kimi invalid-response (html)] -> badResponse
PASS [C13.http:kimi unreachable (transport throw)] -> unreachable
PASS [C13.http:deepseek unreachable (transport throw)] -> unreachable
PASS [C13.ok-null] ok rows carry messageKey null
FAIL [C13.adapter-throw] GLM adapter throw -> adapterFailed — messageKey="noCodingPlan",
     message="The GLM Coding Plan adapter failed: qa explosion"
FAIL [C13.classify:notConfigured] classifyMessage(not-configured, "Set ZAI_CODING_CN_API_KEY …") -> got "noCodingPlan"
FAIL [C13.classify:authRejected] classifyMessage(unauthorized, "The GLM Coding Plan credential was rejected …") -> got "noCodingPlan"
FAIL [C13.classify:adapterFailed] classifyMessage(upstream-error, "The GLM Coding Plan adapter failed: boom") -> got "noCodingPlan"
```

Live confirmation with a **real rejected key** (`ZAI_CODING_CN_API_KEY=qa-bogus…` instance on 3182):

```
$ curl -s http://127.0.0.1:3182/usage-board/api/snapshot
ok: false
  deepseek | ok           | messageKey= null           | null
  glm      | unauthorized | messageKey= "noCodingPlan" | "The GLM Coding Plan credential was rejected; check ZAI_CODING_CN_API_KEY."
  kimi     | unauthorized | messageKey= "authRejected" | "The stored credential was rejected by the provider."
```

Render-truth harness (`node test/verify/render-messages.mjs http://127.0.0.1:3182 <token>`), which decides the
*intended* key from the protocol vocabulary and checks the sentence each renderer actually shows:

```
PASS [R1] both renderers ship a non-empty message dictionary — page=16 keys, panel=17 keys
PASS [R2] every bare key the host can emit exists in the page dictionary
PASS [R3] every bare key has a panel translation under message.*
FAIL [R4.glm] glm: host key matches the intended diagnosis (authRejected) — messageKey="noCodingPlan"
PASS [R4.kimi] kimi: host key matches the intended diagnosis (authRejected)
FAIL [R5.glm] standalone glm card shows the authRejected sentence —
     card reads: "GLM Coding Plan 未授权 这个密钥没有有效的 Coding Plan 套餐。 code 401 2440 ms"
PASS [R5.kimi] standalone kimi card shows the authRejected sentence — 凭据被服务方拒绝，可能已过期或填错。
FAIL [R6.glm] panel glm card shows the authRejected sentence —
     card reads: "GLM Coding Plan 未授权 这个密钥没有有效的 Coding Plan 套餐。 code 401"
PASS [R6.kimi] panel kimi card shows the authRejected sentence — 凭据被服务方拒绝，可能已过期或填错。
SUMMARY: 6/9 checks passed

$ node test/verify/render-messages.mjs http://127.0.0.1:3199     # all-failing fixture (503 everywhere)
PASS [R4.*] all three rows -> status.upstream-error (the documented fallback)
PASS [R5.*] standalone cards show 上游服务返回错误。 for deepseek, glm and kimi
SUMMARY: 9/9 checks passed
```

So the *fallback* branch is correct and renders Chinese; the defect is purely which key GLM's prose selects.
Screenshots: `test/verify/screenshots/50-panel-bad-glm-key-v2.png` (wrong GLM explanation beside the correct
Kimi one), `51-standalone-bad-glm-key-v2.png`, `52-standalone-outage-v2.png` (fallback path).

### 3.5 D — real browser (`node test/verify/browser-e2e.mjs http://127.0.0.1:3181 <token>`)

```
PASS [D1.1] sidebar exposes a 用量看板 entry        PASS [D1.3] DSH serves the browser half (200)
PASS [D2.1] panel renders all three provider cards  PASS [D2.2] 3 × 正常
PASS [D2.3] panel shows the DeepSeek money balance — ¥18.75 ¥137.25 ¥34.65
PASS [D2.4] panel shows quota percentages — 32.8% 58.3% 0.0% 43.0%
PASS [D3.1] both renderers read the same cached snapshot (generatedAt stable)
PASS [D3.2] panel text agrees with the raw snapshot for every number — 14 values matched
PASS [D3.3] standalone text agrees with the raw snapshot for every number — 14 values matched
      declared vs derived: glm/glm.5h 32.0%->32.8%, glm/glm.weekly 58.0%->58.3%, kimi/kimi.weekly 42.7%->43.0%
PASS [D3.5.glm/glm.5h]     renders the derived share 32.8%, not the declared 32.0%
PASS [D3.5.glm/glm.weekly] renders the derived share 58.3%, not the declared 58.0%
PASS [D3.5.kimi/kimi.weekly] renders the derived share 43.0%, not the declared 42.7%
      reset deltas (h): glm/glm.5h=2.84, glm/glm.weekly=44.65, kimi/kimi.5h=4.64, kimi/kimi.weekly=48.64
PASS [D4.glm/glm.weekly] both renderers show the same day countdown (44.65 h) — panel="2 天后重置", standalone="2 天后重置"
PASS [D4.kimi/kimi.weekly] both renderers show the same day countdown (48.64 h) — panel="2 天后重置", standalone="2 天后重置"
PASS [D5.1..D5.4] panel and standalone console and error logs empty
PASS [D6.1] panel states the snapshot age — "33 秒前更新"
PASS [D6.2] the page 刷新 button forces a real refetch — …666 -> …563
PASS [D7.1] the page refetches by itself within the ttl window (no user action)
SUMMARY: 28/28 checks passed
```

The console capture channel is proven live with a synthetic probe before every run, so "empty" is a real
absence of warnings, React key warnings, unhandled rejections and CSP violations — not a dead pipe.

Screenshots (frozen v2): `60-sidebar-v2.png`, `61-panel-v2.png` (DeepSeek money + 14-day spend, GLM
`32.8%` beside `656 / 2,000`, Kimi windows), `62-standalone-v2.png`. Round-1 captures live in
`screenshots/archive/`.

### 3.6 Product state at v2

- Money left, quota left, reset time and per-provider health are all present and **now self-consistent**:
  the bar, the percentage and the fraction finally agree; the two renderers agree on countdowns.
- A rejected GLM key produces a **wrong explanation** (D-10) while the identical Kimi condition produces the
  right one — the one place where a user is actively misdirected.
- A not-configured GLM key produces the same wrong explanation, so the "set your key" instruction never
  appears for GLM.
- Accepted-by-design gaps remain honest rather than pretty: GLM's ±1 unit (D-4) and Kimi's unnamed
  denominator (D-6).

---

## 4. Defect ledger

Statuses: **FIXED-IN-V1** / **FIXED-IN-V2** / **ACCEPTED-BY-DESIGN** / **OPEN**.

### D-1 · P1 · FIXED-IN-V1 · re-verified in v2
Unknown `/usage-board/api/*` returned HTTP 200 with the dashboard HTML.
Repro: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3181/usage-board/api/does-not-exist` → `404`
with `{"ok":false,"error":{"code":"not-found",…}}`; `/usage-board/whatever` → 404 html; the page still answers
at both `/usage-board` and `/usage-board/`. Checks B6.1–B6.8, including a reflected-markup and a traversal probe.

### D-2 · P3 · FIXED-IN-V2
The two renderers printed different countdowns for the same `resetAt` (`Math.floor` vs `Math.round`).
Repro: `node test/verify/browser-e2e.mjs <base> <token>` → D4 passes at 44.65 h and 48.64 h, the exact band
that used to fail. `dashboard.html` now uses ceil-seconds / round-minutes/hours/days, matching `panel.js`.

### D-3 · P3 · FIXED-IN-V2
`32.0%` used to sit beside `656 / 2,000` (= 32.8%).
Repro: wire shows `percent: 32, derivedPercent: 32.8` (B2.9); the panel renders `32.8%` and does **not**
contain `32.0%` (D3.5). The declared value is preserved verbatim as the diagnostic, which is exactly the
non-destructive shape the frozen protocol required — I verified the field is still on the wire, not just
in the builder.

### D-4 · P3 · ACCEPTED-BY-DESIGN (owner decision)
GLM `used + remaining` is 1,999 against a limit of 2,000 (and 9,999 / 10,000 weekly).
Verified rendering the upstream numbers verbatim on the v2 wire (sample above) and in both cards.
I agree with the reasoning: inventing a ±1 correction would make the card disagree with GLM's own console.
Documented in `docs/ARCHITECTURE.md` and the README so it is not "fixed" later.

### D-5 · P3 · SUPERSEDED BY D-10
English-only diagnostics in a Chinese UI. The mechanism (stable `messageKey` + per-language dictionaries in
both renderers) is now in place and verified; the remaining gap is that GLM selects a *wrong* key — filed
separately as D-10 rather than counted twice.

### D-6 · P3 · ACCEPTED-BY-DESIGN (owner decision)
Kimi shows `36 / 100` with no unit name. I independently confirmed the owner's reason: `unit` comes from the
window descriptor (`limits[].window.timeUnit = TIME_UNIT_MINUTE`, i.e. a 5-hour duration descriptor), while
the `100` is `detail.limit` — a provider quota point value with no name. Labelling the fraction with
`TIME_UNIT_MINUTE` would be actively wrong. The window headings (`5 小时窗口` / `每周窗口`) are the honest
maximum available from the payload.

### D-7 · P3 · FIXED-IN-V2
`GET /usage-board/api/refresh` forced an upstream fan-out (a no-preflight cross-origin GET from any local page
could trigger it). Repro: `curl -si http://127.0.0.1:3181/usage-board/api/refresh | head -1` → `HTTP/1.1 405`
with `allow: POST`; POST still refetches (B10.1/B10.2/B10.2b).

### D-8 · P3 nit · FIXED-IN-V2
Dead `describeSecret()` (which would have leaked `first4…last2` had it been wired into `/health`) is deleted;
`grep -rn describeSecret src lib` returns nothing.

### D-9 · P3 nit · FIXED-IN-V2
`dispose()` could be undone by its own in-flight read re-caching. Repro:
`node test/verify/adversarial.mjs c11` → the next `get()` after disposal performs a fresh upstream read
(calls=2), proving the pre-dispose snapshot is not served from cache.

### D-10 · **P2 · OPEN (new in v2)** — GLM failures are explained as "no Coding Plan subscription"
`classifyMessage()` tests `message.includes('coding plan')` **before** it looks at `status`, and every GLM
diagnostic contains the phrase "GLM Coding Plan". Three real states are therefore mislabelled:

| status | host message | emitted key | should be |
|---|---|---|---|
| `not-configured` | `Set ZAI_CODING_CN_API_KEY to show the GLM Coding Plan quota.` | `noCodingPlan` | `notConfigured` |
| `unauthorized` (body code, the real bad-key path) | `The GLM Coding Plan credential was rejected; check ZAI_CODING_CN_API_KEY.` | `noCodingPlan` | `authRejected` |
| `upstream-error` (adapter throw) | `The GLM Coding Plan adapter failed: …` | `noCodingPlan` | `adapterFailed` |

User impact: with a genuinely rejected GLM key both renderers say **“这个密钥没有有效的 Coding Plan 套餐。”**
("This key has no active Coding Plan subscription") instead of "the credential was rejected; it may be
expired or mistyped" — and a GLM user with *no* key configured is never told to set one. Kimi, in the same
panel and the same failure class, gets the correct sentence, so the inconsistency is visible on one screen.

Repro (one line, live):
`ZAI_CODING_CN_API_KEY=bogus dsh --profile usage-qa --port 3182 --no-open` then
`curl -s .../usage-board/api/snapshot | grep -o '"id":"glm".*messageKey":"[^"]*"'` → `noCodingPlan`.
Harness repro: `node test/verify/adversarial.mjs c13` (6 failures) and
`node test/verify/render-messages.mjs http://127.0.0.1:3182 <token>` (R4/R5/R6 glm).

Suggested fix (owner's choice, not mine to make): evaluate the status-based branches first and keep the
phrase test only as a narrow last resort for `upstream-error`, e.g.
`if (status === 'upstream-error' && /\bno (active )?coding plan\b|coding plan (has )?expired/i.test(text)) return 'noCodingPlan';`
The verified behaviour to preserve is that a genuine "no subscription" answer stays distinct from
`authRejected` — I checked that intent in the harness (`C13.distinct`).

---

## 5. What I could NOT verify

1. **The user's live desktop profile / packaged app.** Everything was measured in a scratch profile
   (`usage-qa`); `~/.dsh/profiles/desktop` was never touched. Plugin composition order against other bundles
   and the packaged app's client-module cache are unverified here.
2. **A real non-loopback client.** DSH binds `127.0.0.1` on this build, so the 403 path was proven with a
   spoofed peer address in a stand-in server plus the exported predicate. A deployment behind a proxy or with
   `allowRemote: true` is untested by construction.
3. **Real 429/5xx/HTML/business-code-1000 responses from the live providers.** Those were driven through the
   real code with a controlled transport; the only *real* upstream failures observed were 401s from GLM and
   Kimi with a deliberately bogus key, and the happy path.
4. **TLS-specific and HTTP/2-specific transport failures** (DNS failure, timeout and abort were exercised).
5. **The `verbose: true` log branch** — log lines were never checked for secret material with verbose on.
6. **`cancelled` and `noHost` messageKeys have no HTTP trigger in this build.** The fan-out controller only
   aborts after every adapter has settled, and no adapter reports "no upstream host". Both are covered by the
   classifier matrix and by dictionary presence in both renderers, not by a live render.
7. **The React panel's rendering of the `status.*` fallback.** The standalone page was render-checked for
   `status.upstream-error` against the all-failing fixture (9/9); the panel needs a DSH-served snapshot with
   that state and was only render-checked for `authRejected`/`noCodingPlan` (bogus-key instance).
8. **Locale switching in the panel.** Both dictionaries and the key→sentence path were verified in Chinese;
   I did not drive DSH's language switcher, so the English branch is only checked by dictionary presence.
9. **Long-run soak.** ~15 minutes of observation; multi-hour memory/timer behaviour is out of scope.
10. **Windows/Linux.** All results are macOS arm64 / Node 26.8.2.
11. **Plugin unload inside a running DSH process** — `dispose()` was tested at unit level (C11).

---

## 6. Reproduce

```bash
cd /Users/songer/Documents/deepseek-harness/default-workspace/dsh-plugin-usage-board

# A — suites
node --test test/
node test/providers.live.mjs

# live instances (a clone profile keeps the verifier independent of other members' pkill)
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --profile usage-qa --port 3181 --no-open
ZAI_CODING_CN_API_KEY=qa-bogus KIMI_CODING_API_KEY=qa-bogus \
  "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --profile usage-qa --port 3182 --no-open

# B — routes, 404s, methods, loopback, leak scan
node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board

# C — adversarial upstreams (self-contained: no network, no credentials)
node test/verify/adversarial.mjs          # 179 checks; c13 carries the D-10 failures
node test/verify/adversarial.mjs c14      # body cap / flood / gzip bomb

# D — real browser (token from the boot line)
node test/verify/browser-e2e.mjs http://127.0.0.1:3181 <token>

# R — does each card show the sentence for the correct diagnosis
node test/verify/render-messages.mjs http://127.0.0.1:3182 <token>   # degraded live instance
node test/verify/degraded-server.mjs 3199 &                          # all-failing fixture host
node test/verify/render-messages.mjs http://127.0.0.1:3199
```

Harnesses: `_lib.mjs` (plumbing), `adversarial.mjs` (C), `routes-live.mjs` (B), `browser-e2e.mjs` (D),
`render-messages.mjs` (R), `degraded-server.mjs` (fixture host).

### Honesty notes

- Every quoted line is from a command the verifier ran on the hashes above; abridgements are marked with `…`.
- Three failures inside my own harnesses were found and fixed during this engagement and are **not** product
  defects: a fixture `default` rule that swallowed the harness's own localhost calls, a digit-grouping mismatch
  (`1,343` vs `1343`), and a browser-session click that landed on a stale tab (fixed by closing sessions at
  startup and polling for the refetch). They are listed so the numbers above are not misread.
- The verifier scanned its own deliverables for all three real secrets (full, first-8, last-8): clean.
