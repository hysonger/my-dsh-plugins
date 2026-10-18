# Independent verification — `dsh-plugin-usage-board`

**Task:** `task-3` (independent verification + adversarial QA) · **Verifier:** `qa`
**Date:** 2026-10-14 (Asia/Shanghai) · **Rounds:** freeze **v1** (15:08) · **v2** (15:24) · **v3** (15:43, D-10 only)
**Write scope used:** `test/verify/**`, `docs/VERIFICATION.md` only. No `src/**`, `lib/**`, or `package.json` file was modified by the verifier.

---

## 0. Verdict — final, on freeze v3

**Ship it. No open defects.** The round-2 finding (D-10) is fixed and re-verified against the exact live
scenario that exposed it, with the *absence* of the wrong sentence asserted in both renderers — not just the
presence of the right one. The fix also covers a second instance of the same bug class that the owner found
while reordering the classifier (the adapter-crash wrapper carries GLM's label), and the genuine "valid key,
no subscription" branch still reaches `noCodingPlan`, which I verified through the real adapter with an
upstream body that triggers it.

| Suite (v3) | What it covers | Result |
|---|---|---|
| **A** | `node --test test/` + `node test/providers.live.mjs` | **111/111 pass**; live script `ok` for all three providers |
| **B** | Live routes, methods, 404s, CSP, loopback gate, secret-leak scan | **67/67 pass** (run on v3) |
| **C** | Adversarial upstreams incl. the D-10 matrix, cap/flood/gzip-bomb, hostile windows, dispose | **186/186 pass** |
| **D** | Real browser: sidebar, panel, standalone, console, freshness, derived-percent preference, countdown agreement | **28/28 pass** (v2 run; the healthy path is untouched by the v3 change) |
| **R** | Render-truth: each card shows the sentence for the *correct* diagnosis **and no other diagnosis's** | **13/13 on the live bogus-key instance** · **9/9 on the all-failing fixture** |
| **Leak scan** | full + first-8 + last-8 of all three real secrets against every response and my own deliverables | **clean** |

Defect ledger: D-1 · D-2 · D-3 · D-7 · D-8 · D-9 · **D-10** all FIXED; D-4 · D-6 ACCEPTED-BY-DESIGN; D-5
superseded by D-10. Nothing open.

### Frozen revision v3 — change surface confirmed

Only two files moved from v2, exactly as stated; the other 19 hashes were re-checked and match v2 byte-for-byte.

```
25d63866c1c5  src/host/snapshot.js        (was 94c47d87ab7f — classifyMessage reordered)
43afb51398e1  test/snapshot.test.js       (was 7b6cfb36a1d0 — the two new regression tests)
```

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
| `fetchJson` cap 8 KiB → 512 KiB + `truncated`/`BodyTooLargeError` | unbounded stream, 32 MiB real flood, **gzip bomb**, over-adapter input, RSS measurement | sound, no exhaustion vector (C14) |

## 1b. What changed in v3, and how it was attacked

| v3 change | How I attacked it | Outcome |
|---|---|---|
| `classifyMessage` reordered: status first, crash-wrapper before the "coding plan" phrase | HTTP-level key per GLM state, the four-modes-distinct assertion, two crash-wrapper phrasings, the genuine no-plan body driven through the real GLM adapter, live bogus-key render in both renderers **plus absence of every other diagnosis's sentence** | **fixed** — C13 31/31, R 13/13, D-10 closed |

The second bug class the owner found while fixing this (the `The ${label} adapter failed: …` wrapper also
carrying GLM's name) is covered by two independent checks I wrote before knowing about it:
`C13.adapter-throw` drives a throwing adapter labelled `GLM Coding Plan` through the real `SnapshotService`,
and the classifier matrix now includes both `adapter failed` and `could not complete` phrasings.

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

### 3.7 Round 3 (freeze v3) — targeted re-verification of D-10

Scope as requested: `adversarial.mjs c13` (expanded) plus `render-messages.mjs` against a live instance
booted with a **genuinely bogus GLM key** (and, for the strongest before/after, a bogus Kimi key too — the
exact configuration in which round 2 exposed the defect). I also re-ran A, B and the full C suite because they
are cheap and they prove the one-function change did not disturb anything else.

Classifier matrix — 31/31:

```
$ node test/verify/adversarial.mjs c13
PASS [C13.http:glm not-configured]            glm -> notConfigured
PASS [C13.http:kimi not-configured]           kimi -> notConfigured
PASS [C13.http:deepseek not-configured]       deepseek -> notConfigured
PASS [C13.http:glm unauthorized (body code)]  glm -> authRejected        <- was noCodingPlan in v2
PASS [C13.http:glm unauthorized (http 401)]   glm -> authRejected
PASS [C13.http:kimi unauthorized (http 401)]  kimi -> authRejected
PASS [C13.http:deepseek unauthorized]         deepseek -> authRejected
PASS [C13.http:glm rate-limited] / [kimi rate-limited] -> rateLimited
PASS [C13.http:kimi invalid-response (html)] -> badResponse
PASS [C13.http:kimi unreachable] / [deepseek unreachable] -> unreachable
PASS [C13.ok-null] ok rows carry messageKey null
PASS [C13.http:glm no-subscription] GLM valid key without a plan -> noCodingPlan —
     status=upstream-error, message="This Zhipu key has no GLM Coding Plan subscription."
     (driven with the real body {"code":500,"success":false,"msg":"当前用户不存在coding plan"})
PASS [C13.http:kimi no-subscription-benign] the same body for Kimi is not mislabelled — badResponse
PASS [C13.adapter-throw] GLM adapter throw -> adapterFailed                <- was noCodingPlan in v2
PASS [C13.classify:adapterFailed] both crash-wrapper phrasings -> adapterFailed
PASS [C13.classify:noCodingPlan] genuine no-plan sentence -> noCodingPlan
PASS [C13.classify:status.upstream-error] GLM error without the phrase -> status.upstream-error
PASS [C13.classify:noHost] / [cancelled] / [unreachable] / [badResponse] / [rateLimited] -> correct keys
PASS [C13.glm-distinct] GLM unset / rejected / crashed / no-plan produce four distinct keys
     — {"unset":"notConfigured","rejected":"authRejected","crashed":"adapterFailed","noPlan":"noCodingPlan"}
PASS [C13.glm-correct] and they are the four correct keys
SUMMARY: 31/31 checks passed
```

Live wire, both keys bogus (the round-2 failure configuration):

```
$ curl -s http://127.0.0.1:3182/usage-board/api/snapshot
ok: false
  deepseek | ok           | messageKey= null
  glm      | unauthorized | messageKey= "authRejected"     <- was "noCodingPlan" in v2
  kimi     | unauthorized | messageKey= "authRejected"
```

Render-truth, both renderers, with the new **absence** assertions (R7/R8: a card must not carry any other
diagnosis's sentence — the property that made D-10 user-visible):

```
$ node test/verify/render-messages.mjs http://127.0.0.1:3182 <token>
PASS [R1] both renderers ship a non-empty message dictionary — page=16 keys, panel=17 keys
PASS [R2] every bare key the host can emit exists in the page dictionary
PASS [R3] every bare key has a panel translation under message.*
PASS [R4.glm]  glm:  host key matches the intended diagnosis (authRejected)
PASS [R4.kimi] kimi: host key matches the intended diagnosis (authRejected)
PASS [R5.glm]  standalone glm card shows the authRejected sentence — 凭据被服务方拒绝，可能已过期或填错。
PASS [R7.glm]  standalone glm card carries no other diagnosis's sentence — only authRejected
PASS [R5.kimi] standalone kimi card shows the authRejected sentence — 凭据被服务方拒绝，可能已过期或填错。
PASS [R7.kimi] standalone kimi card carries no other diagnosis's sentence — only authRejected
PASS [R6.glm]  panel glm card shows the authRejected sentence — 凭据被服务方拒绝，可能已过期或填错。
PASS [R8.glm]  panel glm card carries no other diagnosis's sentence — only authRejected
PASS [R6.kimi] panel kimi card shows the authRejected sentence — 凭据被服务方拒绝，可能已过期或填错。
PASS [R8.kimi] panel kimi card carries no other diagnosis's sentence — only authRejected
SUMMARY: 13/13 checks passed
```

Direct DOM check on the standalone page — the wrong sentence appears **zero** times:

```
$ agent-browser ... get text body | grep -c "这个密钥没有有效的 Coding Plan 套餐"
0
$ agent-browser ... get text body | grep -c "凭据被服务方拒绝"
1
```

`/usage-board/api/*` on the same instance answered without console warnings or page errors in both renderers.
Screenshots: `test/verify/screenshots/73-panel-bogus-keys-v3.png` (GLM and Kimi both `未授权` with the correct
sentence), `72-standalone-bogus-keys-v3.png`.

Full suites re-run on v3 (unchanged files, so this is regression insurance rather than new coverage):

```
$ node --test test/                 → ℹ tests 111  ℹ pass 111  ℹ fail 0
$ node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board  → SUMMARY: 67/67 checks passed
$ node test/verify/adversarial.mjs  → SUMMARY: 186/186 checks passed
$ node test/verify/render-messages.mjs http://127.0.0.1:3199          → SUMMARY: 9/9 checks passed
```

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

### 3.6 Product state at v2 (and what v3 changed)

- Money left, quota left, reset time and per-provider health were already present and **self-consistent**:
  the bar, the percentage and the fraction agree; the two renderers agree on countdowns.
- **v2:** a rejected GLM key produced a **wrong explanation** (D-10) while the identical Kimi condition
  produced the right one — the one place where a user was actively misdirected, and the same wrong sentence
  covered a not-configured GLM key, so the "set your key" instruction never appeared for GLM.
- **v3:** both states now produce the correct sentence in both renderers
  (「凭据被服务方拒绝，可能已过期或填错。」), the wrong sentence appears zero times, and GLM's four failure
  modes are four distinct keys. `notConfigured` now reaches GLM users with no key configured.
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

### D-10 · **P2 · FIXED-IN-V3** — GLM failures were explained as "no Coding Plan subscription"

**As found in v2** (kept as the record of what was wrong): `classifyMessage()` tested
`message.includes('coding plan')` **before** it looked at `status`, and every GLM diagnostic contains the
phrase "GLM Coding Plan". Three real states were mislabelled:

| status | host message | emitted key (v2) | should be |
|---|---|---|---|
| `not-configured` | `Set ZAI_CODING_CN_API_KEY to show the GLM Coding Plan quota.` | `noCodingPlan` | `notConfigured` |
| `unauthorized` (body code, the real bad-key path) | `The GLM Coding Plan credential was rejected; check ZAI_CODING_CN_API_KEY.` | `noCodingPlan` | `authRejected` |
| `upstream-error` (adapter throw) | `The GLM Coding Plan adapter failed: …` | `noCodingPlan` | `adapterFailed` |

User impact: with a genuinely rejected GLM key both renderers said **“这个密钥没有有效的 Coding Plan 套餐。”**
instead of "the credential was rejected; it may be expired or mistyped" — and a GLM user with *no* key
configured was never told to set one. Kimi, in the same panel and the same failure class, got the correct
sentence, so the inconsistency was visible on one screen. v2 repro:
`ZAI_CODING_CN_API_KEY=bogus dsh --profile usage-qa --port 3182 --no-open` →
`glm | unauthorized | messageKey="noCodingPlan"`.

**Fix verified in v3.** The owner reordered the classifier (status branches first; then, inside
`upstream-error`, the crash wrapper `could not complete` / `adapter failed`, then `no upstream`, and only then
the phrase). I re-ran the exact live scenario plus expanded attacks:

- `glm | unauthorized | messageKey="authRejected"`, and both renderers print
  「凭据被服务方拒绝，可能已过期或填错。」 — with `grep -c` proving the wrong sentence appears **0** times.
- The four GLM failure modes now produce four distinct, correct keys:
  `{unset: notConfigured, rejected: authRejected, crashed: adapterFailed, noPlan: noCodingPlan}` (C13.glm-distinct / C13.glm-correct).
- The genuine "valid key, no subscription" branch is preserved: I drove the real GLM adapter with
  `{"code":500,"success":false,"msg":"当前用户不存在coding plan"}` → `upstream-error` + `noCodingPlan`
  (C13.http:glm no-subscription), so the fix did not simply delete the branch.
- The second instance of the same bug class that the owner found while fixing it — the adapter-crash wrapper
  `The ${adapter.label} adapter failed: …` also carrying GLM's name — is independently covered by
  `C13.adapter-throw` (real `SnapshotService`, adapter labelled `GLM Coding Plan`) and by two crash-wrapper
  phrasings in the classifier matrix. Both pass.
- New absence assertions (`R7`/`R8`) check that each card carries **no other diagnosis's** sentence, which is
  the property that made the defect user-visible.

Repro (v3, all passing): `node test/verify/adversarial.mjs c13` → 31/31 · 
`node test/verify/render-messages.mjs http://127.0.0.1:3182 <token>` → 13/13.
Screenshots: `73-panel-bogus-keys-v3.png`, `72-standalone-bogus-keys-v3.png`.

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
   classifier matrix and by dictionary presence in both renderers, not by a live render. (By contrast
   `noCodingPlan` *is* reachable over HTTP and was verified end-to-end in v3 with
   `{"code":500,"success":false,"msg":"当前用户不存在coding plan"}`.)
7. **The React panel's rendering of the `status.*` fallback.** In v3 the panel was render-checked live for
   `authRejected` (bogus key, both renderers, incl. the absence assertions), and the standalone page was
   render-checked for `status.upstream-error` against the all-failing fixture (9/9). The panel's rendering of a
   `status.*` key needs a DSH-served snapshot in that state and remains unverified.
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

# v3 targeted re-verification of D-10 (the actual v3 scope)
node test/verify/adversarial.mjs c13                                 # 31/31 classifier + HTTP matrix
ZAI_CODING_CN_API_KEY=qa-bogus KIMI_CODING_API_KEY=qa-bogus \
  "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --profile usage-qa --port 3182 --no-open
node test/verify/render-messages.mjs http://127.0.0.1:3182 <token>   # 13/13 incl. absence assertions
```

Harnesses: `_lib.mjs` (plumbing), `adversarial.mjs` (C), `routes-live.mjs` (B), `browser-e2e.mjs` (D),
`render-messages.mjs` (R), `degraded-server.mjs` (fixture host).

### Honesty notes

- Every quoted line is from a command the verifier ran on the hashes above; abridgements are marked with `…`.
- Three failures inside my own harnesses were found and fixed during this engagement and are **not** product
  defects: a fixture `default` rule that swallowed the harness's own localhost calls, a digit-grouping mismatch
  (`1,343` vs `1343`), and a browser-session click that landed on a stale tab (fixed by closing sessions at
  startup and polling for the refetch). Two more harness defects were caught by the D-10 work itself: the
  render-truth card extractor initially sliced from the standalone page's *header* line (making a GLM check
  read Kimi's sentence), and it captured a loading skeleton instead of the rendered cards — both fixed by
  line-anchored card slicing and content polling before any of the numbers above were produced.
- The verifier scanned its own deliverables for all three real secrets (full, first-8, last-8): clean.

---

## 7. Addendum — DeepSeek peak / off-peak billing reminder (2026-10-18)

**Feature:** both renderers show the current DeepSeek billing phase, a punny slogan
(`现在是梁文峰时段！` in peak, `现在是梁文谷时段！` in off-peak), the price tier, and a live countdown to
the next change. The rule is computed on the host from the official pricing page and a third-party holiday
calendar; the browser halves only walk the host-shipped absolute transition instants.

### What was verified

| # | Check | Evidence |
|---|---|---|
| 1 | Unit / contract suite | `npm test` → **169/169 pass**, including 13 new pricing-policy cases (boundaries, weekends, National-Day break, make-up Saturday, year rollover, horizon coverage, calendar-null fallback), 8 holiday-calendar cases, and 14 new renderer cases (both slogans, countdown, phase flip at the boundary, non-ok row, stale/missing calendar caveat) |
| 2 | Bundle assembly | `node scripts/build-client.mjs --check` → `lib/client.js matches the client sources` |
| 3 | Live host integration in the desktop DSH instance | `GET /usage-board/api/snapshot` carried `meta.pricing` on the DeepSeek row: `phase: offpeak`, `holidayCalendar: {source: 'chinese-days', through: 2026}`, 40 transitions; the sidebar panel rendered the banner from that row |
| 4 | Real browser — sidebar panel | off-peak: `现在是梁文谷时段！` / `空闲 · 5 折` / `距涨价 21 小时 55 分` / `北京时间`; then the page clock was forced to Monday 10:00 Beijing and the same panel flipped to `现在是梁文峰时段！` / `高峰 · 标准价` / `距降价 2 小时` without a refetch. The schedule was the real host read; only `Date.now` was overridden for the peak shot. |
| 5 | Real browser — standalone page | same banner in light and dark media, countdown repainting once per second |
| 6 | Holiday truth | `chinese-days@1.5.9` matches the official 2026 arrangement: all 19 weekday holidays are off, the 6 make-up workdays are workdays to the calendar (and still off-peak to this rule, which keys on Mon–Fri), Oct 8 is peak again |
| 7 | Timezone independence | the same instant yields the same phase under `TZ=Asia/Shanghai`, `UTC`, `America/New_York`, `Pacific/Kiritimati` (child-process probe in `test/holidays.test.js`) |
| 8 | Degradation | missing/broken calendar → weekday estimate with `holidayCalendar: null` or `through < current year`, and the UI says `暂按工作日估算`; covered by unit tests, not forced in a live browser |
| 9 | Offline adversarial suite | `node test/verify/adversarial.mjs` → **186/186 pass** |

Screenshots (real desktop sidebar panel):

- `docs/images/pricing-reminder-peak.png`
- `docs/images/pricing-reminder-offpeak.png`

### Independent review and fixes (same day)

An independent verifier re-ran the suites and the policy invariants (525,600 minute-level checks across
2026 against the official notice, 17,247 transitions over 486 snapshots, 5 timezones), plus a live
headless-browser check of the standalone page. It found no blockers and three issues, all fixed before
commit:

1. **Cross-year coverage caveat ignored the horizon.** In mid/late December the host legitimately ships
   transitions into the next year, but the renderers only compared `holidayCalendar.through` with the
   *current* year. A snapshot on 2026-12-31 would render a confident "距涨价 15 小时" toward 2027-01-01
   09:00 — New Year's Day, i.e. off-peak — with no caveat. Fixed by adding `coversHorizon` to
   `meta.pricing.holidayCalendar` on the host (does the calendar cover every shipped transition?) and
   making both renderers show the estimate caveat when it is false; the field stays additive and older
   hosts fall back to the year comparison. New tests cover 2026-12-01 (covered) vs 2026-12-18 (horizon
   crosses into unannounced 2027) in both the policy and the renderer, and the fix was re-checked
   end-to-end against a pinned-clock demo host at 2026-12-18: the snapshot reports
   `coversHorizon: false` and the standalone banner shows the caveat under the countdown.
2. **README overstated reload semantics.** A dependency update cannot be picked up by a browser refresh:
   the host imports `chinese-days` once per process. The README now says "reload the plugin / restart DSH"
   and quotes the actual caveat strings.
3. **Countdown rounded up across unit boundaries** (65 s → "2 分钟", 23:59:59 → "1 天"). Both formatters
   now truncate to completed units (65 s → "1 分钟", 23:59:59 → "23 小时 59 分", last second →
   "即将切换"), with unit tests for the boundaries.

The verifier also confirmed the incidental `test/verify/adversarial.mjs` C11 correction mentioned at the
end of this addendum.

### What this addendum did NOT verify

1. **2027 holiday data.** The State Council announces the next year's arrangement in late autumn; the
   installed calendar only covers 2026, so 2027 weekdays fall back to the estimate. The test pins
   `coversYear(2027) === false` on purpose so upgrading the dependency becomes a deliberate act, and the
   UI now flags a horizon that crosses into the unannounced year (`coversHorizon: false`). This is verified
   by unit and renderer tests at a forced December instant, not by a live clock set to December.
2. **English copy in a real UI.** Both dictionaries carry the slogans and countdown strings (asserted by
   tests); the panel was only exercised in Chinese.
3. **The exact host-half reload trigger.** After the host sources changed and the GUI was reloaded, the live
   instance served `meta.pricing`; whether the plugin manager remounted the host or the reload was incidental
   was not instrumented.
4. **`browser-e2e.mjs` / `routes-live.mjs` on a fresh QA profile.** This addendum used the desktop instance
   read-only through an authenticated local browser session; the earlier harnesses cover route and message
   behaviour that this change does not touch.
5. **Dark mode in the sidebar panel.** Dark mode was checked on the standalone page; the panel uses the same
   DSH theme tokens and was not separately screenshotted in dark mode.

Incidental finding while re-running the offline verification: the baseline commit also fails `C11.2` in
`test/verify/adversarial.mjs` (its expectation predates the shipped v2 dispose envelope). The check was
corrected to assert the documented contract — a disposed service answers with an empty envelope and starts
no read — and the suite is now 186/186 on both the baseline and the current tree.

### Reproduce

```bash
cd /path/to/dsh-plugin-usage-board
npm install
npm test
node scripts/build-client.mjs --check

# real calendar + rule spot checks
node --test test/holidays.test.js test/pricing.test.js

# offline adversarial suite
node test/verify/adversarial.mjs
```

---

## 8. Addendum — per-provider progressive loading (2026-10-18)

**Task:** `task-4` (independent verification of the per-provider split) · **Verifier:** `verifier`
**Date:** 2026-10-18 (Asia/Shanghai) · **Round:** one freeze (working tree, `HEAD c86ced7` + the uncommitted
change surface pinned below) · **Write scope used:** `test/verify/**`, `docs/VERIFICATION.md` only. No `src/**`,
`lib/**`, `test/*.test.js`, `README.md`, `docs/ARCHITECTURE.md` or `package.json` file was modified by the
verifier; nothing was staged or committed. All findings below were driven by the verifier against the real
code — implementer summaries were treated as claims, not evidence.

### 8.1 Verdict — PASS, no open product defects

The per-provider change does what it claims: each provider's card is read through its own
`/usage-board/api/provider?id=…` request, a slow or hanging provider holds back only its own card, and the
aggregate routes still work for compatibility. No product defect was found. Two *verifier-owned* harness
expectations were stale against the new `health.reads` semantics and were updated (§8.7) — those were harness
defects, not product defects.

| Suite | Command | Result |
|---|---|---|
| **A** | `node --test test/` | **215/215 pass** (incl. the new `test/routes.test.js`) |
| **A** | `node scripts/build-client.mjs --check` | `lib/client.js matches the client sources` |
| **B** | `node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board` | **95/95 pass** on a fresh scratch DSH instance |
| **C** | `node test/verify/progressive.mjs` (self-contained) | **135/135 pass** |
| **D** | `node test/verify/adversarial.mjs` | **187/187 pass** |
| **E** | `node test/verify/browser-progressive.mjs http://127.0.0.1:3181 <token>` | **45/45 pass** (real DSH UI + stand-in host) |
| live | `lsof -nP -iTCP:3181 -sTCP:LISTEN` · `/usage-board/api/health` | listens on **127.0.0.1 only**; every provider cache **fresh** |

### 8.2 Frozen surface confirmed

Working tree off `HEAD c86ced7` (`usage board: close idle-gate P1 gaps…`). The product files under test
(sha256, first 12 chars; the whole tree is pinned in §8.10's manifest command):

```
c7478b98dd11  lib/client.js                 086368384f00  src/host/routes.js
b51c620a5e22  lib/index.js                  f1ea6460a942  src/host/snapshot.js
525cca4f46cd  src/client/panel.js           fd2a5f0193f7  src/host/web/dashboard.html
5c8fff462c0c  src/client/protocol-copy.js   6b28ae305baf  src/shared/protocol.js
164b2ee57f29  src/client/styles.css         281bbabb5b6e  package.json
```

Verifier-owned harness files created/changed for this round (not part of the product):
`test/verify/progressive.mjs` (new), `test/verify/progressive-server.mjs` (new),
`test/verify/browser-progressive.mjs` (new), plus targeted updates to `test/verify/_lib.mjs`,
`test/verify/routes-live.mjs`, `test/verify/adversarial.mjs` (§8.7).

### 8.3 Environment and method

- macOS arm64, Node **v26.8.2**, `agent-browser` **0.38.1** (real Chromium), DSH CLI from
  `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`.
- A **fresh scratch profile** `~/.dsh/profiles/usage-verify` was created as a copy of `usage-qa` and repointed
  at this repo (`"dsh-plugin-usage-board": "link:/Users/songer/Projects/my-dsh-plugins/dsh-plugin-usage-board"`,
  then the bundled pnpm install; `node_modules/dsh-plugin-usage-board` resolves to this repo). The old
  `usage-qa`/`usage-dev` profiles were left untouched.
- Scratch instance: `dsh --profile usage-verify --port 3181 --no-open`; the `?token=…` was read from the boot
  line and used only for the browser session. **The live desktop DSH on 127.0.0.1:54295 that hosts this
  session was never started, stopped, or restarted.**
- Real credentials came from the host's own `~/.dsh/.credentials.yaml`; no secret was printed by any
  harness, and the route leak scan (§8.4) was re-run on the live instance: the first-8-character prefixes of all
  three secrets are absent from every response, no response echoes a Bearer token, and the grant token is
  absent.
- The offline halves (`progressive.mjs`, `progressive-server.mjs`, `adversarial.mjs`) are self-contained:
  fake upstream via `fakeUpstream`, fake credentials, no real network. `_lib.mjs` gained an optional
  `snapshotOptions` seam so a controlled clock can be injected into the real `SnapshotService` without
  editing source.

### 8.4 Attack 1 — routes over real HTTP (scratch DSH instance + stand-in real-adapter server)

| # | Attack | Result |
|---|---|---|
| 1 | `GET /api/provider?id=<each of deepseek, glm, kimi>` | 200, **exactly one row** with that id, `protocolVersion:1`, `ttlMs:60000`, `ok` derived from the row; rows carry the full protocol shape |
| 2 | `POST /api/provider?id=<each id>` | 200 one-row envelope, **new `generatedAt`** for each (genuinely forced), `ok` derived |
| 3 | Missing `id` | **400** `{"ok":false,"error":{"code":"unknown-provider","message":"Missing \"id\" query parameter…"}}` |
| 4 | Unknown `id` | **400** `unknown-provider` (`No usage board provider with id "not-a-provider"…`) |
| 5 | `PUT` / `DELETE` / `PATCH /api/provider` | **405**, `Allow: GET, HEAD, POST` |
| 6 | `HEAD /api/provider?id=deepseek` | **200**, empty body, `content-length` set |
| 7 | Aggregate unchanged | `GET /api/snapshot` 200 aggregate (3 rows, deepseek/glm/kimi order, derived `ok`, no flags on an all-fresh answer); `POST /api/refresh` 200, new `generatedAt` |
| 8 | `health` additive fields | `providers:[{id,status:'fresh'|'stale'|'missing',fetchedAt,expiresAt,refreshing}]` for all three in order; old fields (`ok/version/protocolVersion/ttlMs/reads/backgroundReads/fresh/credentials`) intact |
| 9 | `health.reads` semantics | one aggregate refresh = **+3** provider reads: live run `reads 30 -> 33`; stand-in run `3 -> 6` |
| 10 | Page boot injection | `window.__USAGE_BOARD__` = `{"snapshotPath":"/usage-board/api/snapshot","refreshPath":"/usage-board/api/refresh","providerPath":"/usage-board/api/provider","providerQueryParam":"id","providerIds":["deepseek","glm","kimi"],"version":"0.3.0"}` — old and new keys together |
| 11 | Loopback-only | non-loopback peers (`10.0.0.7`, `192.168.1.20`, `2001:db8::1`) get **403 on every route including `GET` and `POST /api/provider`**; `allowRemote:true` opens them; live instance binds `127.0.0.1:3181` only |

Note: `health.reads` is a diagnostic counter, not protocol wire data; its documented meaning changed from
"aggregate fan-outs" to "provider reads". No frozen-protocol field changed meaning (all protocol changes are
additive: `PROVIDER_PATH`/`PROVIDER_QUERY_PARAM`, `stale`/`refreshing`, `health.providers`).

### 8.5 Attack 2 — decoupling under a slow / hanging upstream (the core claim)

Driven through the **real** route handlers → real `SnapshotService` → real adapters → real `fetch-json.js`;
only the upstream transport is faked. Cold cache each time; the slow provider is read **first** so a fast
answer cannot be explained by an already-warm cache.

| Case | DeepSeek endpoint | Kimi endpoint | GLM endpoint | Aggregate `GET /api/snapshot` |
|---|---|---|---|---|
| GLM deliberately delayed **2 500 ms** | **2 ms** | **2 ms** | 2 829 ms (ok row) | 2 798 ms — waits for the slow one (compatibility behaviour) |
| GLM CN host **hangs** (intl host healthy) | **2 ms** | **1 ms** | 12 026 ms — real 12 000 ms provider deadline fired (1 abort observed), then answered `ok` from `api.z.ai` | waits by construction on a cold start |

Additional facts captured in the same runs:

- While DeepSeek/Kimi answered, the GLM read was verifiably **still pending** (`glmSettled=false`) and
  `health` showed `glm:{status:'missing',refreshing:true}` beside `deepseek:fresh, kimi:fresh`.
- The hang cost **exactly one provider read** (`reads=3`) — the 12 s deadline is not retried into a second read.
- Interleaved aggregate + per-provider reads cost **one read per provider** (dedupe works across both paths);
  five concurrent cold GETs for one provider cost **one read** and share one `generatedAt`.
- `POST /api/provider?id=glm` on warm caches: GLM upstream calls `4 -> 6`, DeepSeek `4 -> 4`, Kimi `2 -> 2`,
  `health.reads` `+1` — a forced read touches that provider only.
- **Per-provider stale-while-revalidate** (controlled clock, real service): an expired GLM row is served in
  **1 ms** with `stale:true` + `refreshing:true` and its cached numbers unchanged, while the host refreshes
  behind the response. A provider that had just been refreshed answered **fresh/no flags** while its
  not-yet-refreshed sibling answered stale: `health` showed `deepseek:{status:'stale',refreshing:true}`,
  `glm:{status:'fresh',refreshing:false}`, `kimi:{status:'stale',refreshing:false}` — the flags are
  per-provider and never leak. The aggregate reports `stale:true` and still returns all three cached rows
  (never blanks the board).
- A warm aggregate GET makes **zero** upstream calls; `ok` and provider order are preserved.

### 8.6 Attack 3 — real browser, real DSH UI, and a stand-in progressive host

Real DSH UI (fresh scratch instance, real credentials, headless Chromium via `agent-browser`):

| # | Check | Evidence |
|---|---|---|
| 1 | Sidebar 用量看板 panel opens and renders | 3 `.ub-card` cards: DeepSeek, GLM Coding Plan, Kimi Code; numbers present (`¥43.38 …`, `0.0%`, `9.0%`); 0 skeletons after first paint |
| 2 | Reads only the per-provider route | first wave after opening the panel: **exactly 3 requests**, `GET /usage-board/api/provider?id=deepseek|glm|kimi`; **0** requests to `/api/snapshot` or `/api/refresh` for the whole session |
| 3 | Stale follow-ups are bounded | after settling: 4 provider requests total (the 3 first-wave GETs + **one** stale follow-up for the one stale provider), still no aggregate route |
| 4 | Manual refresh is per-provider | panel 刷新 → **3 POSTs** (one per provider), no aggregate route; cards stay 3, skeletons 0, and all 8 number tokens visible before the refresh are still visible while it is outstanding |
| 5 | No console/page errors | DSH console and page-error buffers empty |
| 6 | `sessionStorage` first paint survives a dead network | the panel persisted `{"protocolVersion":1,"providers":["deepseek","glm","kimi"]}`; after reloading with **all `/api/provider` requests aborted**, all 3 cards still painted from storage with numbers intact, 0 skeletons, a `刷新失败：Failed to fetch` note (retained failure, no blanking), and no uncaught page errors |

Stand-in host (`progressive-server.mjs`): identical real routes + real `dashboard.html`, fake upstream where
DeepSeek/Kimi answer in ~40 ms and GLM takes **8 s**, opened COLD so no cache can mask the paint order:

| # | Check | Evidence |
|---|---|---|
| 7 | Fast cards paint before the slow one answers | at page `t=321 ms`: **2 cards** (DeepSeek, Kimi Code) + **1 skeleton** (GLM), GLM request still in flight; screenshot `81-progressive-early-2cards.png` |
| 8 | The slow card arrives last, in its own slot | 3 cards / 0 skeletons at page `t≈8.35 s` when the GLM upstream answered (HTTP 200); other cards were never rebuilt into skeletons; screenshot `82-progressive-settled-3cards.png` |
| 9 | Only three per-provider GETs, never the aggregate | mount network log: 3× `GET …provider?id=…`; 0 aggregate requests |
| 10 | Manual refresh keeps numbers on screen | click 刷新 with the 8 s provider outstanding: 3 cards, 0 skeletons, header `8 秒前更新 · 正在刷新…`, **all 11 number tokens** visible before the refresh still visible during it; 3× POST (one per provider); screenshot `83-progressive-refreshing-no-blank.png` |
| 11 | No console/page errors | empty in both early and settled states |

Screenshots (all under `test/verify/screenshots/`, new names — old evidence untouched):

- `80-dsh-sidebar-panel-v4.png` — real DSH sidebar panel, 3 cards
- `81-progressive-early-2cards.png` — cold stand-in page at ~321 ms: DeepSeek + Kimi painted, GLM skeleton
- `82-progressive-settled-3cards.png` — after the slow GLM upstream answered
- `83-progressive-refreshing-no-blank.png` — manual refresh in flight, numbers retained
- `84-dsh-panel-refresh-no-blank-pending.png` — real panel refresh in flight, numbers retained
- `85-dsh-panel-sessionstorage-offline.png` — real panel reloaded with every provider request aborted:
  restored numbers + retained-failure note

### 8.7 Defects found

**Product defects: none.** The behaviours the implementation claims were all observed. Three defects were
found in *verifier-owned harnesses* during this round and are recorded here for honesty (none touches
`src/`/`lib/`, and none was caused by the product):

1. **`test/verify/adversarial.mjs` C7.4 was stale against the new `reads` semantics** — it expected `reads`
   to advance by one fan-out; it now advances by one *provider read* per provider. Updated to
   `2 × PROVIDERS.length` (= 6) and a `health.providers` assertion added. The suite is now 187/187.
2. **`test/verify/routes-live.mjs` B3.3 had the same stale expectation** (`+1` read per aggregate refresh) and
   its boot-block check only knew the old paths. B3.3 now asserts `+3` and settles the cache before measuring
   (an in-flight background refresh would otherwise be shared by the forced read); B5.4b/c assert
   `providerPath/providerQueryParam/providerIds` *and* the old `snapshotPath/refreshPath`; B8 covers
   `GET`/`POST /api/provider`; a new **B11** section exercises per-provider GET/POST/400/405/HEAD on the live
   instance. Suite is now 95/95.
3. **`test/verify/_lib.mjs`** reported a stale version string (`0.2.0-verify`) and could not inject a clock;
   it now reports `0.3.0-verify` and accepts `snapshotOptions` (used for the stale-while-revalidate case
   without sleeping a real TTL).

My own new harnesses also had assertion bugs that were found and fixed before any numbers in this addendum
were produced: card titles include the status pill (`"DeepSeek 正常"`, not `"DeepSeek"`); comparing whole
`body.innerText` for "numbers unchanged" also compared the header line (fixed to compare number tokens); and
the per-provider stale-flag observation raced an instant fake upstream (fixed by giving that scenario a 500 ms
upstream delay so `refreshing:true` is observable). `HEAD /api/provider` with a missing id returns a 400 with
`content-length` and no body (Node strips HEAD bodies) — verified, not a defect.

### 8.8 What could NOT be verified honestly

1. **A real hanging upstream over the network.** The 12 000 ms deadline/degrade path was exercised through
   the real `SnapshotService` + routes + real `fetch-json.js` with a fake transport, not with a real host that
   stops answering. The browser-level "slow provider" proof uses an 8 s *delayed* (not hanging) fake upstream.
2. **Visual progressive paint inside the real DSH panel.** The real panel half proves the request topology
   (3 per-provider GETs, no aggregate), all three cards, no errors, retained numbers on refresh/failure, and
   the `sessionStorage` restore. It did **not** capture skeleton→card timing for the real panel, because the
   real sample's cache was warm/stale and the verifier cannot make a real upstream's GLM card slow on demand;
   the paint-order evidence is from the identical stand-in host.
3. **The 20 s panel request-timeout boundary.** The panel aborts a single read at 20 s; a pathological host
   read can exceed that (e.g. DeepSeek does summary+cost+balance sequentially, each with the 12 s deadline).
   Retained-number behaviour after a failed read *is* verified (§8.6 #6), but no test forces a real read past
   20 s, so the exact boundary/timeout copy is unverified.
4. **`browser-e2e.mjs` (task-3 harness, incl. its 75 s unattended-auto-refresh assertions) was not re-run** —
   its flow targets the pre-change renderer interactions; the changed behaviour is covered by the new
   `browser-progressive.mjs` and the extended `routes-live.mjs`.
5. **English locale, dark mode, Windows/Linux, hot plugin reload/remount** — not re-verified; the scratch
   instance was booted fresh with the new link, not hot-reloaded.
6. **GLM "ok" rows came from fake upstreams.** The real stored Zhipu key in this environment has no Coding
   Plan (`status: upstream-error`, `code 500` on the live instance); as in the previous addendum, all GLM
   happy-path numbers come from fixtures. This is environmental, not a route defect.

### 8.9 Remaining risks

- **Aggregate cold start still blocks** on the slowest provider (by contract, and verified at ~2.8 s / 12 s).
  The shipped renderers never call it, but an older client or a script that polls `GET /api/snapshot` on a
  cold cache inherits the old wait.
- **`health.reads` meaning changed** for diagnostics consumers. Anything that computed "fan-outs" from it now
  sees provider reads (×3). It is health-only data; no protocol field changed.
- **Manual refresh can be slow for a pathological provider** (multiple sequential upstream calls per read);
  the browser keeps numbers and shows a retained-failure note if it gives up, but the user may wait.
- **The 12 s deadline bounds each upstream request, not a whole provider read** (an adapter may make several
  sequential requests). This is pre-existing behaviour, not introduced by the split.

### 8.10 Reproduce

```bash
cd /Users/songer/Projects/my-dsh-plugins/dsh-plugin-usage-board

# --- A. suites + bundle (no network, no credentials) ---
node --test test/                                  # 215/215
node scripts/build-client.mjs --check              # bundle matches sources

# --- C/D. self-contained offline verification (no network, no credentials) ---
node test/verify/progressive.mjs                   # 135/135 — decoupling, stale flags, isolation, routes
node test/verify/adversarial.mjs                   # 187/187 — upstreams, cap/flood, dispose, messageKey

# --- scratch DSH instance (a COPY of usage-qa, repointed at this repo) ---
#   ~/.dsh/profiles/usage-verify/package.json:
#     "dsh-plugin-usage-board": "link:/Users/songer/Projects/my-dsh-plugins/dsh-plugin-usage-board"
NODE=/Users/songer/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node
PNPM=/Users/songer/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs
(cd ~/.dsh/profiles/usage-verify && "$NODE" "$PNPM" install)
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  --profile usage-verify --port 3181 --no-open      # copy the ?token=… from the boot line

# --- B. live routes over real HTTP (95/95) ---
node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board

# --- E. real browser (token required) + cold stand-in progressive host (45/45) ---
node test/verify/browser-progressive.mjs http://127.0.0.1:3181 '<token>'
# its stand-in half is spawned by the harness itself; to poke it manually:
node test/verify/progressive-server.mjs 3198 8000   # real dashboard + fake upstream, GLM delayed 8 s

# --- live instance facts quoted in §8.3/§8.4 ---
lsof -nP -iTCP:3181 -sTCP:LISTEN                    # 127.0.0.1:3181 only
curl -s http://127.0.0.1:3181/usage-board/api/health

# --- freeze manifest (product files) ---
git rev-parse HEAD
find src lib -type f | sort | xargs shasum -a 256
```

Harnesses: `_lib.mjs` (plumbing + fakeUpstream + stand-in server), `progressive.mjs` (C — decoupling),
`progressive-server.mjs` (fixture host for the visual proof), `browser-progressive.mjs` (E),
`routes-live.mjs` (B, extended), `adversarial.mjs` (D, extended).

### Honesty notes

- Every number quoted in this addendum comes from a command the verifier ran on the tree pinned in §8.2; the
  exact command output is reproducible with §8.10. The early-screenshot page time (`t=321 ms`) is the
  browser's own `performance.now()` at the DOM probe, and it includes the CLI round-trip between
  `open` and `eval`; the primary evidence for "fast cards before slow" is the DOM state (2 cards + 1
  skeleton) plus the still-pending GLM network entry, not the millisecond figure alone.
- The verifier did not modify any product file and did not stage/commit anything.
- The desktop DSH instance hosting this session (127.0.0.1:54295) was left untouched and was never used as a
  test target.

---

## 9. Addendum — panel layout baseline + trailing week/month trend (2026-10-18)

**Task:** `task-8` (independent verification of round 2) · **Verifier:** `verifier-2`
**Date:** 2026-10-18 (Asia/Shanghai) · **Round:** one freeze — working tree
`HEAD 9641e95b141891701c47ff205ab772b9cbe12af6` plus the uncommitted round-2 change surface pinned in §9.2,
then the Lead's post-freeze chart-bar fix re-verified in §9.15.
**Write scope used:** `test/verify/**`, `docs/VERIFICATION.md` only. No `src/**`, `lib/**`,
`test/*.test.js`, `README.md`, `docs/ARCHITECTURE.md` or `package.json` file was modified by the verifier;
nothing was staged or committed. The implementer's summary was treated as a claim, not evidence: every number
below came from a command the verifier ran against the real code, and the live DeepSeek series was recomputed
independently from the platform's own `/usage/cost` endpoint before it was compared with the host payload.

### 9.1 Verdict — PASS, no open product defects

Round 2 does what it claims on both surfaces. The host builds a real trailing 30-calendar-day DeepSeek series
from the current **and** previous `/usage/cost` month (one read = 3 upstream calls), and the exact series was
reproduced independently from the live platform API, point for point. Both renderers show `近一周` /
`近一月` totals that equal the sums of the last 7 / last 30 points of the same series, draw exactly 7 bars
with a visible stub for zero-cost days, and end the range on today (Beijing). The main-area panel now uses the
standalone page's layout baseline: `.ub-inner` is a centred max-width-1100 column and `.ub-body` is a
responsive grid (3 / 2 / 1 columns measured at 1700 / 900 / 700 px viewport), so the old full-bleed one-column
stack is gone. Failure paths degrade honestly: previous-month failure -> month-to-date series with the row still
`ok`; current-month failure -> `meta.dailyUsageError` and no series, row still `ok`; both -> same. The extra
cost call did not break per-provider decoupling or the 12 s deadline (a permanently hanging cost read settled
at 12 005 ms with 2 abort(s), i.e. both months were in flight in parallel, not serial ~24 s).
A post-freeze fix (Lead, after the freeze above) floors every chart bar at 2 px; it was re-verified on a fresh
scratch instance and is recorded in **§9.15** — no open defects remain.

| Suite | Command | Result |
|---|---|---|
| **A** | `node --test test/` | **221/221 pass** (4 suites, 0 fail) |
| **A** | `node scripts/build-client.mjs --check` | `lib/client.js matches the client sources` (exit 0) |
| **B** | `node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board` | **108/108 pass** (B1.7 version 0.4.0; new **B12** live `meta.dailyUsage`) |
| **C** | `node test/verify/progressive.mjs` | **135/135 pass** (unmodified; its `≤3` DeepSeek-call allowance already fit the third call) |
| **D** | `node test/verify/adversarial.mjs` | **210/210 pass** (C0.6/C0.8 updated to the new semantics; new **C15**) |
| **E** | `node test/verify/round2-semantics.mjs` (new) | **32/32 pass** — route-level series + fallbacks + decoupling/deadline |
| **F** | `node test/verify/round2-live.mjs` (new) | **25/25 pass** — host series vs independent live recomputation |
| **G** | `node test/verify/browser-round2.mjs http://127.0.0.1:3181 <token>` (new) | **162/162 pass** at the round-2 freeze; **186/186 pass** on the post-freeze tree — real DSH panel + standalone + stand-in failure host incl. the §9.15 bar-floor assertions |
| **H** | `node test/verify/browser-progressive.mjs http://127.0.0.1:3181 <token>` | **45/45 pass** — round-1 progressive browser regression, re-run unchanged |

### 9.2 Frozen surface confirmed

All product-file sha256 hashes were captured at the start and re-checked after every suite; nothing moved
during the run. The Lead then applied the post-freeze chart-bar fix (§9.15), which changed **exactly four**
product files — their rows below are re-pinned to the fixed tree with the pre-fix hash in parentheses; every
other row was re-checked and still matches the freeze byte-for-byte (first 12 hex chars; the tree is pinned in
§9.13's manifest command):

```
ce8908e3469a  lib/client.js (was 1eeceedfe62d)   086368384f00  src/host/routes.js
3caf65a63502  lib/index.js                      f1ea6460a942  src/host/snapshot.js
e68531f653ae  src/host/providers/deepseek.js    275541e344d2  src/host/web/dashboard.html (was 5c735ae9dca0)
41ca9e8ae8ae  src/host/providers/glm.js         1230f2fc461b  src/host/providers/kimi.js
39a91f1a8d30  src/host/providers/index.js       5c5d40f1d3ec  src/host/providers/common.js
70efe9043ce7  src/client/panel.js               000b179958c7  src/client/styles.css (was 4b21986cafde)
1f055f8265bb  src/client/protocol-copy.js       4ed37428a18b  src/shared/protocol.js
647a82769763  src/host/credentials.js           5f061d82d5ca  src/host/fetch-json.js
a18ce43c6b93  src/host/holiday-calendar.js      4d0bd8b92309  src/host/pricing.js
134ef0733d47  package.json                      fbeefe7ed8c7  package-lock.json
df220aad17c2  README.md                         fe81ea63f501  docs/ARCHITECTURE.md
b3a552bbb7b3  scripts/build-client.mjs          20a636d5299d  test/client-bundle.test.js (was 5d53df440666)
ff8a249878f7  test/providers.parsing.test.js    fd2c4b34b802  test/dashboard-gate.test.js
73b9a56946b8  test/routes.test.js               ba60fed825d4  test/fixtures/_manifest.json
53c2f94c6309  test/fixtures/deepseek-cost-prev.json (new fixture)   3a7da6a5f115  test/fixtures/deepseek-cost.json
3f3cb0fe1395  cordis.patch.yml
```

Verifier-owned files created/changed for this round (NOT part of the product):
`test/verify/round2-semantics.mjs` (new), `test/verify/round2-live.mjs` (new),
`test/verify/browser-round2.mjs` (new), `test/verify/degraded-round2-server.mjs` (new),
`test/verify/round2-live-snapshot.json` (generated artifact), targeted updates to
`test/verify/adversarial.mjs`, `test/verify/routes-live.mjs`, `test/verify/_lib.mjs` (§9.9).

### 9.3 Environment and method

- macOS arm64, Node **v26.8.2**, `agent-browser` **0.38.1** (real Chromium), DSH CLI from
  `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`. The desktop DSH that hosts this
  session (127.0.0.1:59476) was **never started, stopped, restarted or used as a test target**.
- A **fresh scratch DSH instance** was booted for this round from the existing scratch profile
  `~/.dsh/profiles/usage-verify` (its `node_modules/dsh-plugin-usage-board` symlink resolves to this repo) with
  `dsh --profile usage-verify --port 3181 --no-open`, so the new host code was loaded fresh. `lsof` confirmed it
  listened on **127.0.0.1:3181 only**. The `?token=…` was copied from the boot line; the instance was closed after
  the run.
- Real credentials came from the host's own `~/.dsh/.credentials.yaml`; `round2-live.mjs` re-used the platform
  grant through `loadRealSecrets()`/`mask()` and printed only `eEiC…TwZK`-style masked forms. `routes-live.mjs`
  B7 re-ran the leak scan on the live instance: no response contains the first 8 chars of any real secret, no
  `Bearer ` material, and the literal grant token is absent.
- Offline halves drive the **real** route handlers -> real `SnapshotService` -> real adapters -> real
  `fetch-json.js`, with only the upstream transport faked (`fakeUpstream`) and fake credentials; the live
  recomputation calls `https://platform.deepseek.com/api/v0/usage/cost` directly with the real grant and parses
  the raw amounts itself. The browser halves use real Chromium; the stand-in failure host serves the real routes
  and real `dashboard.html` from a child process with a fake upstream (deepseek 429 / glm 500 / kimi ok).
- Live data moves: the platform's current-day cost grew during the verification window
  (2026-10-18: 14.431017 -> 14.552323 -> 15.008303 -> 15.105254 in successive reads). Every comparison below is
  against the payload captured in the same read/epoch, and the host series equalled the independent
  recomputation **exactly each time** — the absolute totals are snapshots, the semantics are what was verified.

### 9.4 Attack 1 — host trailing series vs an independent live recomputation

`round2-live.mjs` forced a fresh `POST /usage-board/api/provider?id=deepseek` on the live scratch instance and
then called the platform's cost API itself for the current (10/2026) and previous (09/2026) Beijing month,
parsing `data[].usage[].amount` into its own date -> cost map, merging/filtering/capping in its own code.

| Check | Observed |
|---|---|
| Host series = independent recomputation | **exact equality, 30/30 points** (dates and costs) |
| Points / order / contiguity | **30** points, oldest first, one calendar day per point, **2026-09-19 -> 2026-10-18** |
| Ends on today (Beijing) | **2026-10-18** (Beijing UTC+8, no DST) |
| Spans the previous month | first point **2026-09-19** < month start 2026-10-01 (12 Sep + 18 Oct days) |
| No future dates | all points `<= 2026-10-18` (the platform's future zero padding was dropped by date) |
| Elapsed zero-cost days kept | **8** zero-cost days: 09-19, 09-21, 10-05, 10-06, 10-07, 10-09, 10-11, 10-17 |
| Point shape | every point exactly `{date, cost: number, tokens: null}`; `currency=CNY` |
| `近一周` = sum(last 7) | host **61.504452** = independent **61.504452** |
| `近一月` = sum(last 30) | host **99.027556** = independent **99.027556** |
| Independent API reads | current month **31** day rows / 49 738 bytes; previous month **30** day rows / 48 596 bytes; `code 0`, `biz_code 0` |
| Second forced read | same 30-point shape, same end date; all 29 non-today points stable (only the live current day may grow) |

Live route-level shape (`routes-live.mjs` **B12**, forced POST on the real instance): exactly **30** points,
oldest-first contiguous, ends today, first point in the previous month, **8** zero-cost points, every point
`{date, cost: number, tokens: null}`; a warm follow-up GET returned the identical series (no fabricated drift).
At that read: `week=61.625758`, `month=99.148862`.
The generated evidence file is `test/verify/round2-live-snapshot.json` (host points/sums plus the independent
current/previous day-row counts and attempts).

### 9.5 Attack 2 — failure fallbacks and the cost of the extra `/usage/cost` call

Driven through the real adapter (adversarial **C15**) and the real per-provider route (round2-semantics **R2**) with
`fakeUpstream` controls; row status and error fields read back from the wire envelope.

| Case | Observed |
|---|---|
| Previous month 500 | HTTP 200, row **ok**; series degrades to **current-month-only** (2026-10-01 -> 2026-10-18, 18 points, independently recomputed) and ends today; **no** `meta.dailyUsageError` |
| Current month 500 | HTTP 200, row **ok**; `meta.dailyUsageError = "HTTP 500"`; **no** `meta.dailyUsage` (no fabricated series) |
| Both months 500 | same as current-month failure (row ok, `dailyUsageError`, no series) |
| Previous month malformed (200, empty `biz_data`) | treated as unavailable -> current-month-only series, row ok |
| Current month 401 / code 40003 | row ok, `dailyUsageError = "HTTP 401"`, no series (history is best-effort; the balance survives) |
| Three upstream calls | one DeepSeek read = summary + `cost?month=10&year=2026` + `cost?month=9&year=2026` — exactly 3 |
| Cost calls are parallel | two 400 ms fake responses -> whole read **403 ms** (serial would be ~800 ms); request start spread **0 ms** |
| Dedupe by date | a date present in both months resolves to the **current** month (crafted 99.99 vs 7.77 -> 7.77) |
| 30-point cap | `slice(-30)` -> exactly 30 points from the 48 elapsed days; `days === points.length` |
| Per-provider decoupling | while DeepSeek's cost months took 900 ms, a Kimi read answered in **2 ms**; the DeepSeek read still completed ok in 903 ms |
| 12 s deadline with both cost months hanging | whole read settled at **12 005 ms** (not ~24 s), fake transport saw **2 aborts** — both month requests were in flight in parallel when the deadline fired; row stayed **ok** with `meta.dailyUsageError = "TimeoutError"` |

### 9.6 Attack 3 — real browser: the panel layout baseline

Real DSH UI on the scratch instance (real Chromium via `agent-browser`), panel opened from the sidebar
(`用量看板`). `.ub-inner`/`.ub-body` geometry and computed styles were measured at four viewports; the expected
track count is `max(1, min(3, floor((bodyWidth + 16) / 316)))` for `repeat(auto-fit, minmax(300px, 1fr))` and the
expected `.ub-inner` width is `min(1100, root content width)`.

| Viewport | DSH pane content | `.ub-inner` width / x (centre) | Grid tracks (px) | Rows | Overflow | 近一周 / 近一月 |
|---|---|---|---|---|---|---|
| 1700x1000 | 1356 px (root 1420, padding 32/32) | **1100** @ x=440 (centre 990 = pane centre 990) | **3** (355.328 x3) | 1 | none (`scrollWidth == 1700`) | ¥62.18 / ¥99.70 |
| 1280x900 | 938.56 px | **938.56** @ x=310.72 (centre 780 = pane centre 780) | **3** (301.516 x3) | 1 | none | ¥62.18 / ¥99.70 |
| 900x800 | 800.81 px (sidebar collapsed to 56 px icon rail) | **800.81** @ x=77.59 (centre 478 = pane centre 478) | **2** (391.406 x2) | 2 (Kimi wraps) | none | ¥62.18 / ¥99.70 |
| 700x800 | 610.41 px | **610.41** @ x=72.8 (centre 378 = pane centre 378) | **1** (608.4) | 3 | none | ¥62.18 / ¥99.70 |

Measured at every width: `.ub-title` **20 px / weight 600** (line-height 28 px) with text `用量看板`;
`.ub-subtitle` exactly `DeepSeek · GLM Coding Plan · Kimi Code`; every card `padding: 18px 18px 16px`; grid
`gap: 16px`; exactly 3 cards; no horizontal overflow at any width. Card tops were identical within a row and
distinct across rows (1 / 2 / 3 rows), proving the grid, not a one-column stack.
Before/after comparison: the round-1 screenshot `80-dsh-sidebar-panel-v4.png` (1280 px viewport) shows the old
full-bleed single-column stack; `101-panel-mid-1280.png` is the same width after the change — 3 centred columns.

### 9.7 Attack 4 — real browser: 近一周 / 近一月 and the 7-day chart (both surfaces)

Expected values in the browser run were computed in Node from the **same DeepSeek series the page rendered**
(panel: its persisted `usage-board:snapshot:v1` envelope; standalone: the provider payload of the same cache
epoch), never from the DOM.

| Check | Panel (real DSH) | Standalone page |
|---|---|---|
| Labels | exactly `["近一周", "近一月"]` at all four widths | exactly `["近一周", "近一月"]` at all four widths |
| Totals = sum(last 7) / sum(last 30) | **¥62.18 / ¥99.70** = sums of its rendered series | **¥62.18 / ¥99.70** = sums of the same series |
| Bars | exactly **7**, one per trailing day (titles `2026-10-12 · ¥0.20` … `2026-10-18 · ¥15.11`) | exactly **7**, same dates/costs |
| Zero-cost day stub | 1 empty bar (10-17, ¥0.00): measured **2.0 px** tall, `min-height: 2px` | same: **2.0 px** tall, `min-height: 2px` |
| Range ends today | `10-12 → 10-18` | `2026-10-12 → 2026-10-18` |
| Overflow / console | no overflow; console and page-error buffers empty | no overflow; console and page-error buffers empty |
| Network topology | 3x `GET /api/provider?id=…` (deepseek/glm/kimi), **0** aggregate `snapshot`/`refresh` requests | same per-provider-only topology, 0 aggregate requests |
| Cross-surface | panel series end = **15.105254 @ 2026-10-18** = standalone's; same totals strings; same provider subtitle | (same) |

Screenshots: `100`/`101`/`102`/`103` (panel 1700/1280/900/700), `110`/`111`/`112`/`113` (standalone
1700/1280/900/640), plus `104` (panel 429 card) and `114` (stand-alone degraded host) below.

### 9.8 Attack 5 — failure cards still render locally

| # | Check | Evidence |
|---|---|---|
| 1 | Real 500 provider failure as a local card in the **real panel** | the live GLM row is genuinely `upstream-error` (`code 500`, "no Coding Plan" for the stored key): card rendered with `上游错误`, the no-plan sentence and `code 500`; no page errors |
| 2 | 429-shaped row rendered locally by the **real panel** | provider route fulfilled with a wire row `status:"rate-limited"`, `messageKey:"rateLimited"`, `code:"HTTP 429"`; the panel's card shows `限流` + `服务方正在限流，请稍后重试。` + `HTTP 429` locally (screenshot `104`); after unroute + refresh it recovered to the live ok card; no page errors |
| 3 | 429 / 500 on a **stand-in host with fake upstream** (real routes + real page) | deepseek upstream 429 -> card pill `限流` + localized sentence + `HTTP 429`; glm upstream 500 -> pill `上游错误` + `上游服务返回错误。` + `HTTP 500`; Kimi healthy card still shows 36.0% / 43.0%; 3 cards, no skeleton, console/page-error clean (screenshot `114`) |

### 9.9 Defects found

**Product defects: none open.** Round-2 behaviour matched every claim I could drive.

The one **visual nit** recorded at the freeze — in the 7-day chart the inline bar height is a percentage of a
34 px area, so a *tiny nonzero* day could render thinner than the 2 px floor kept for a *zero-cost* day
(measured **0.66–1.02 px** for some nonzero days vs 2.0 px for the zero day), which is related to the user's
"only 2 days visible" complaint — is **FIXED** by the Lead after the freeze: base `.ub-trend-bar` (panel) and
base `.bar` (standalone) now carry `min-height: 2px`, so all seven bars render at least 2 px. Re-verified on the
post-freeze tree in §9.15: measured before -> after on the panel `[0.66, 1.97, 33, 0.66, 0.98, 2, 11.55]` ->
`[2, 2, 33, 2, 2, 2, 11.88]` and on the standalone page `[0.67, 2.03, 34, 0.67, 1.02, 2, 11.89]` ->
`[2, 2.03, 34, 2, 2, 2, 12.23]`; the zero-cost day keeps its muted tone. Status: FIXED, no residual product
defect (see §9.15 for the residual *limitation* of any visible floor).

**Verifier-owned harness defects found and fixed** (not product defects; none touched `src/`/`lib/`):

1. `test/verify/adversarial.mjs` C0.6/C0.8 were stale against the new host semantics: the old suite expected
   trailing zero-cost days to be *trimmed* and a DeepSeek read to cost **2** upstream calls. Updated to assert
   elapsed zero-cost days are kept, only future padding dropped, and **3** calls (summary + current + previous
   Beijing month with exact URLs); added the whole **C15** section for the trailing-series source/fallback
   matrix. Suite is now 210/210.
2. `test/verify/routes-live.mjs` did not check the new version/data: added **B1.7** (`health.version` equals
   `package.json`'s `0.4.0`) and **B12** (live forced DeepSeek `meta.dailyUsage` shape: 30 points, order,
   contiguity, Beijing today, previous-month span, zero-cost days, point shape, warm-GET stability). Suite is now
   108/108.
3. `test/verify/_lib.mjs`'s stand-in host still advertised the round-1 label `0.3.0-verify`; now
   `0.4.0-verify` (visible in stand-in footers, not wire data).
4. `test/verify/round2-live.mjs`, written for this round, had two verifier bugs caught before any evidence was
   used: a `readMonth(token, month, year)` call with the arguments swapped (the platform's own
   `biz_code 40001 / "invalid month or year"` exposed it — this was **my** bug, not platform flakiness; the
   retry is kept as defensive plumbing and the header comment says so), and a self-comparison in the second-read
   check; both fixed and re-run.
5. `test/verify/browser-round2.mjs` initially (a) launched the stand-in host **in-process**, which dead-locked
   because `execFileSync` blocks the event loop the host needs to answer the browser (fixed by a separate
   `degraded-round2-server.mjs` child process), (b) cleared the network log *after* navigation so the standalone
   mount reads were lost (now opens `about:blank`, clears, then navigates), and (c) compared server `generatedAt`
   bookkeeping between two independent live reads instead of the series itself (now compares the series; the
   cross-surface check compares the same series endpoints and totals).
6. `test/verify/round2-semantics.mjs` R1.5 had a `Date` + number coercion bug in its contiguity assertion (fixed
   to `.getTime()` arithmetic).

`test/verify/progressive.mjs` needed **no** change: its `≤ 3` DeepSeek-call allowance already accommodated the
third `/usage/cost` call, and it passed 135/135 unmodified.

### 9.10 Docs spot-check

| Doc claim | Observed |
|---|---|
| README:7 — DeepSeek shows 余额 + 累计消耗 + 近一周/近一月 + 近 7 天趋势 | panel and standalone both show exactly that (§9.7) |
| README:87 — panel uses the standalone layout: centred, max-width 1100, 1/2/3 columns, no full-bleed stack | measured §9.6: centred 1100 (or pane width), 3/2/1 tracks at 1700/900/700, rows 1/2/3, zero overflow; old 80-vs-new 101 visual pair |
| README:97 — host merges 平台当前月 + 上个月 into 最近 30 个自然日; browser sums; zero-consumption days keep a bar slot | §9.4 host series + independent recomputation; §9.7 stub bar 2.0 px |
| ARCHITECTURE:251-256 — adapter reads both months in parallel, dedupes by date, drops future zero padding, keeps elapsed zero days (Beijing today); previous-month failure widens-degrades to month-to-date, current-month failure -> `meta.dailyUsageError` without touching the row; renderer last-7 chart + 7/30 sums + visible zero bars | §9.4 and §9.5 exactly as written |
| ARCHITECTURE:322-328 — "近一月 is last 30 calendar days, not month-to-date"; degraded cases still labelled 近一月; sums are local, not an official bill | consistent with §9.5 (no fabricated series, documented degradation) and the renderer labels |
| Version consistency | `package.json` 0.4.0 = `lib/index.js` `PLUGIN_VERSION` 0.4.0 = live `/api/health` 0.4.0 (routes-live B1.7) |

No mismatch found. One nuance worth stating: the two surfaces share the layout *system* (max width, centring,
16 px gaps, 18/18/16 card metrics, same title/subtitle), but their grid track minimums differ
(`minmax(300px,1fr)` panel vs `minmax(320px,1fr)` standalone), so their column breakpoints are not byte-identical —
that matches the shipped CSS and does not contradict the README wording.

### 9.11 What I could NOT verify honestly

1. **A real previous-month / current-month upstream failure over the real network.** The fallback matrix was
   driven through the real adapter/service/route stack with a fake transport; the live network was only used for
   the healthy path.
2. **A real DeepSeek 429/500 from the platform.** 429 -> `rate-limited` mapping was exercised with a fake
   upstream through the real adapter (`adversarial` C3), and the panel's local rendering of such a wire row by
   intercepting one provider response; the genuine 500 card on the live instance is GLM's (environmental
   no-plan key), not DeepSeek's.
3. **Programmatic pixel diff against the old screenshots.** The layout comparison is (a) measured geometry and
   computed styles (§9.6) and (b) visual review of `80-dsh-sidebar-panel-v4.png` vs `101-panel-mid-1280.png` and
   `90-panel-layout-v5.png`; no image-diff tooling was used.
4. **English locale, dark mode, Windows/Linux, DSH hot-reload/remount.** Not re-verified this round; the scratch
   instance was booted fresh, not hot-reloaded.
5. **The first-paint/sessionStorage flows of the panel were not re-driven end-to-end** in `browser-round2.mjs`
   (it only reads the persisted envelope to check what was rendered); the round-1 progressive browser harness was
   re-run unchanged (45/45) to cover those flows against the new layout.
6. **Absolute money totals are snapshots.** The live current-day cost grew during verification; quoted totals
   belong to the specific read. The independently recomputed series equalled the host series on every comparison,
   which is the semantic claim.
7. **The 12 s deadline test used a fake hanging transport**, not a real platform connection that stops answering.

### 9.12 Remaining risks

- **One DeepSeek read is now 3 upstream calls.** If the platform throttles or slows the cost endpoint, the
  DeepSeek card can take up to ~12 s (or the panel's 20 s read timeout) — but it is isolated to that card
  (measured: Kimi answered in 2 ms while DeepSeek's cost calls were pending) and a failed history degrades to
  `meta.dailyUsageError` with the balance intact.
- **The `近一月` label can cover less than a month** when the previous month is unavailable (documented in
  ARCHITECTURE): the UI still says 近一月 while the data is month-to-date. This is a documented degradation, not
  a silent lie, but a reader without the docs cannot see the difference.
- **Live cost data updates asynchronously** (today's cost grew in steps during verification), so the displayed
  sums can lag the official bill slightly; the sums are a local aggregation of platform-reported daily amounts.
- **Cross-surface equality is only observable within one 60 s cache epoch**; when the cache refreshes between
  opening the panel and the standalone page, the two surfaces legitimately show different current-day totals.
  The harness only claims equality when both rendered the same series (it was conclusive here).
- **Panel column breakpoints depend on the DSH sidebar width.** At 1280 px the panel is still 3 columns
  (pane content 938.56 >= 932) because DSH keeps the full sidebar; at 900 px the sidebar collapses to a 56 px
  rail, which is what makes 2 columns possible. The "1/2/3 columns" claim holds for the *pane width*, not a fixed
  viewport breakpoint.

### 9.13 Reproduce

```bash
cd /Users/songer/Projects/my-dsh-plugins/dsh-plugin-usage-board

# --- A. suites + bundle (no network, no credentials) ---
node --test test/                                  # 221/221
node scripts/build-client.mjs --check              # bundle matches sources

# --- C/D/E. self-contained offline verification (no network, no credentials) ---
node test/verify/progressive.mjs                   # 135/135 — unchanged round-1 harness
node test/verify/adversarial.mjs                   # 210/210 — incl. new C15 trailing-series matrix
node test/verify/round2-semantics.mjs              # 32/32  — route-level series, fallbacks, 12 s deadline

# --- scratch DSH instance (existing copy of the usage-qa profile, repointed at this repo) ---
#   ~/.dsh/profiles/usage-verify/node_modules/dsh-plugin-usage-board -> this repository
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  --profile usage-verify --port 3181 --no-open     # copy the ?token=… from the boot line

# --- B. live routes over real HTTP (108/108) ---
node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board

# --- F. live host series vs independent recomputation (25/25) ---
node test/verify/round2-live.mjs http://127.0.0.1:3181/usage-board

# --- G. real browser: panel + standalone + stand-in failure host (162/162) ---
node test/verify/browser-round2.mjs http://127.0.0.1:3181 '<token>'

# --- H. round-1 progressive browser regression (45/45; it rewrites 80–85 while running,
#        so back them up first if you need the round-1 captures byte-for-byte) ---
node test/verify/browser-progressive.mjs http://127.0.0.1:3181 '<token>'

# --- live instance facts quoted above ---
lsof -nP -iTCP:3181 -sTCP:LISTEN                   # 127.0.0.1:3181 only
curl -s http://127.0.0.1:3181/usage-board/api/health
curl -s -X POST 'http://127.0.0.1:3181/usage-board/api/provider?id=deepseek'

# --- freeze manifest (product files) ---
git rev-parse HEAD
find src lib scripts -type f | sort | xargs shasum -a 256
shasum -a 256 package.json README.md docs/ARCHITECTURE.md cordis.patch.yml \
  test/client-bundle.test.js test/providers.parsing.test.js test/routes.test.js test/dashboard-gate.test.js \
  test/fixtures/_manifest.json test/fixtures/deepseek-cost-prev.json
```

Harnesses this round: `_lib.mjs` (plumbing/fakeUpstream/stand-in routes), `adversarial.mjs` (updated + C15),
`progressive.mjs` (unchanged), `routes-live.mjs` (B1.7/B12), `round2-semantics.mjs` (new),
`round2-live.mjs` (new; writes `round2-live-snapshot.json`), `browser-round2.mjs` (new),
`degraded-round2-server.mjs` (new), `browser-progressive.mjs` (round-1 regression).

**Post-freeze fix re-run (§9.15):** boot a *fresh* scratch instance from the fixed tree exactly as above, then
run `node --test test/`, `node scripts/build-client.mjs --check`, `node test/verify/adversarial.mjs`,
`node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board` and
`node test/verify/browser-round2.mjs http://127.0.0.1:3181 '<token>'` (the browser harness now also asserts the
2 px bar floor and the muted zero-cost tone), then close the instance.

### 9.14 Screenshot list (this round; old evidence untouched)

| File | What it shows |
|---|---|
| `test/verify/screenshots/100-panel-wide-1700.png` | real DSH main-area panel, 1700x1000: centred 1100 column, 3-column card grid, title/subtitle, DeepSeek 近一周/近一月 + 7-day chart |
| `test/verify/screenshots/101-panel-mid-1280.png` | same panel at 1280x900: 3 columns, centred (pane 938.56) |
| `test/verify/screenshots/102-panel-narrow-900.png` | same panel at 900x800: sidebar collapses to an icon rail, 2-column grid |
| `test/verify/screenshots/103-panel-narrowest-700.png` | same panel at 700x800: 1-column grid, no horizontal overflow |
| `test/verify/screenshots/104-panel-rate-limited-local-card.png` | real panel at 700x800 after a 429-shaped provider row: `限流` + `服务方正在限流，请稍后重试。` + `HTTP 429` |
| `test/verify/screenshots/110-standalone-wide-1700.png` | standalone `/usage-board/`, 1700x1000: 1100 page column, 3 cards, same totals/labels/bars |
| `test/verify/screenshots/111-standalone-mid-1280.png` | standalone at 1280x900 |
| `test/verify/screenshots/112-standalone-narrow-900.png` | standalone at 900x800: 2 columns |
| `test/verify/screenshots/113-standalone-narrowest-640.png` | standalone at 640x800: 1 column |
| `test/verify/screenshots/114-standalone-degraded-429-500.png` | stand-in host (real page/routes, fake upstream): 429 DeepSeek `限流`, 500 GLM `上游错误`, healthy Kimi card alongside |
| `test/verify/screenshots/105-panel-settled-1700.png` | post-freeze: settled real panel at 1700x1000 (all three cards resolved) — all 7 bars visible |
| `test/verify/screenshots/106-panel-docs-crop.png` | **recommended source for `docs/images/panel.png`**: `105` cropped to the main panel area (1420x430, sidebar/personal session names excluded); shows the centred 3-column panel, title/subtitle, DeepSeek 近一周/近一月 and all seven floored bars |

The `100`–`114` series was **regenerated on the post-freeze tree** (§9.15), so the bars in `100`–`104` and
`110`–`113` are the fixed 2 px floored ones (the pre-fix captures of the same layout are the run described in
§9.6/§9.7, and `90-panel-layout-v5.png` is the implementer's pre-fix check). Round-1 evidence `80`–`85` is
preserved byte-for-byte (the temporary overwrite by the H regression run was restored and sha256-verified).
The two implementer-produced captures `90-panel-layout-v5.png` and `91-standalone-trend-v5.png` remain in
place as the implementer's own check.

### 9.15 Post-freeze fix — all chart bars floored at 2px

**Trigger:** the §9.9 visual nit (a tiny *nonzero* chart day could render thinner than the 2 px zero-cost stub —
related to the user's original "only 2 days visible" complaint). The Lead fixed it after this verification's
freeze, then asked for a targeted re-verification.

**What changed (only these four product files, no logic/route changes):**

| File | Change | Hash (fixed tree; pre-fix) |
|---|---|---|
| `src/client/styles.css` | base `.ub-trend-bar` gains `min-height: 2px;` (the `[data-empty="true"]` rule keeps its own min-height/tone); comment explains a ¥0.10 day must not render below the zero stub | `000b179958c7` (was `4b21986cafde`) |
| `src/host/web/dashboard.html` | base `.bar` gains `min-height: 2px;` (same reason) | `275541e344d2` (was `5c735ae9dca0`) |
| `test/client-bundle.test.js` | the stylesheet layout contract now also asserts `.ub-trend-bar`'s base `min-height: 2px;` | `20a636d5299d` (was `5d53df440666`) |
| `lib/client.js` | regenerated with `node scripts/build-client.mjs` (embedding the CSS change); `--check` clean | `ce8908e3469a` (was `1eeceedfe62d`) |

`git diff` confirms these are the only product-file deltas from the freeze; every other product hash in §9.2 was
re-checked and is unchanged. No route/adapter/protocol change was made.

**Re-run PASS table (fresh scratch instance booted from `~/.dsh/profiles/usage-verify` on port 3181 with the new
tree, cold cache — `reads: 0`, all providers `missing`; token from the boot line; instance closed afterwards;
desktop :59476 never touched):**

| Check | Result |
|---|---|
| `node --test test/` | **221/221 pass** (4 suites, 0 fail) |
| `node scripts/build-client.mjs --check` | `lib/client.js matches the client sources` (exit 0) |
| `node test/verify/adversarial.mjs` | **210/210 pass** (unaffected, as expected) |
| `node test/verify/routes-live.mjs http://127.0.0.1:3181/usage-board` | **108/108 pass** (extra regression; live route/version/dailyUsage unchanged) |
| `node test/verify/browser-round2.mjs … <token>` | **186/186 pass** (162 prior checks + 24 new bar-floor/tone checks: 3 assertions x 4 widths x 2 surfaces) |

**Browser bar measurements, real Chromium, both surfaces (7 bars, chart area 34 px, trailing 7 days
2026-10-12 → 2026-10-18):**

| Surface | Before fix (measured at the freeze run) | After fix (measured post-fix) |
|---|---|---|
| DSH main-area panel | `[0.66, 1.97, 33, 0.66, 0.98, 2, 11.55]` px — only the max bar and the zero stub visible | **`[2, 2, 33, 2, 2, 2, 11.88]` px — all 7 bars >= 2 px**; 3 previously sub-2 px nonzero days now 2 px |
| Standalone `/usage-board/` | `[0.67, 2.03, 34, 0.67, 1.02, 2, 11.89]` px | **`[2, 2.03, 34, 2, 2, 2, 12.23]` px — all 7 bars >= 2 px**; same 3 nonzero days floored at 2 px |
| Zero-cost day (10-17, ¥0.00) | 2 px, muted tone | **2 px**, `min-height: 2px`, muted tone preserved and distinct from solid bars: panel `rgba(0,0,0,0.12)` vs solid `rgb(65,118,230)`; standalone `rgb(236,238,242)` vs accent `rgb(77,107,254)` |
| Labels / totals / bar count | `近一周`/`近一月`, 7 bars | unchanged: `近一周`/`近一月`, **exactly 7 bars**, totals equal the sums of the rendered series (`¥62.63` / `¥100.16` panel = standalone at the same series; the live current day grew to 15.560999 during the run) |
| Console / page errors | empty | **empty** in both real-UI sessions and the stand-in host session |

Additional re-confirmed facts on the fixed tree: `.ub-inner` = min(1100, pane) and centred at 1700/1280/900/700
(1100 / 938.56 / 800.81 / 610.41 px); grid tracks 3/3/2/1, rows 1/1/2/3, no horizontal overflow; title
20 px/600; card padding 18/18/16; subtitle identical on both surfaces; cross-surface same-series totals equal;
failure cards unchanged (real GLM 500, intercepted 429, stand-in 429/500).

**Verifier-harness update made for this fix (verifier-owned, not product):** `browser-round2.mjs` now captures
each bar's computed background colour, inline percentage and chart height, and asserts (a) all 7 bars render
>= 2 px, (b) the bars whose inline percentage alone would draw < 2 px (3 of them in this sample) now render
2 px, and (c) the zero-cost bar keeps its muted tone and `min-height: 2px`. It also gained a cold-cache wait for
the real GLM row (the first cold run saw that card still pending at the point §9.8 #1 reads it — a harness
timing assumption from the warm-cache freeze runs, not a product issue); the fixed harness then passed 186/186
on a second **cold** scratch instance.

**Residual limitation (inherent to the fix, not a defect):** the 2 px floor is a CSS `min-height`, so every
day whose proportional bar would be under 2 px now has the *same* visible height; the magnitude difference
between those tiny nonzero days and a zero-spend day is carried only by the muted-vs-accent tone and the hover
tooltip (`2026-10-17 · ¥0.00` etc.), not by height. The chart remains 34 px tall, so 2 px is still a thin stub;
this is the intended trade-off for "every day visible". No layout/overflow/console regression was observed.

**Commit-ready state:** the fixed product tree is internally consistent and ready to commit — the four changed
product files are exactly the set above (`git status` shows no other product-file delta from the freeze),
`build-client --check` is clean, `lib/client.js` embeds the new stylesheet byte-for-byte, the layout-contract test
covers the new base rule, and the full suite passes 221/221. The verifier added no product changes: all evidence
files are under `test/verify/**` plus this addendum (and nothing was staged or committed).

### Honesty notes

- Every number quoted in this addendum comes from a command the verifier ran on the tree pinned in §9.2 (and,
  for §9.15, on the fixed tree whose four changed hashes are re-pinned in §9.2/§9.15); §9.13 reproduces them. The
  live-total drift across §9.4/§9.6/§9.7/§9.15 (¥61.50 -> ¥61.63 -> ¥62.18 -> ¥62.63 -> ¥62.80) is the same
  current-day spend growing between reads, not an inconsistency: each harness compared its DOM/wire values
  against a payload captured in the same read.
- The post-freeze fix was verified against exactly the claimed surface: only four product files changed (no
  route/adapter/protocol code), a fresh cold scratch instance was booted with the fixed tree, and the browser
  measurements in §9.15 are from that instance. The fix was the one polish this addendum itself suggested at the
  freeze; it is now FIXED, not open.
- The verifier did not modify any product file and did not stage or commit anything. The `git status` product-file
  set is exactly the implementer's round-2 set; the verifier's changes are confined to `test/verify/**` and this
  document.
- Fake upstream vs real network is called out per case: §9.4 uses the **real** network for both the host payload
  and the independent platform read; §9.5 is **fake upstream through the real stack**; §9.6/§9.7 are the **real**
  live instance in a **real** browser; §9.8 mixes the real GLM 500, an intercepted provider row, and a fake
  upstream stand-in host.
- The desktop DSH instance hosting this session (127.0.0.1:59476) was never touched; every scratch instance on
  127.0.0.1:3181 (the freeze run and the cold post-freeze re-run) was closed after its run.
- `docs/images/panel.png` was not touched by the verifier (not in the write scope). The recommended source is
  `test/verify/screenshots/106-panel-docs-crop.png` (1420x430 crop of the settled panel, sidebar/personal session
  names excluded), taken on the fixed tree.
