/**
 * A stand-in usage-board host for the progressive-paint browser test (task-4, D).
 *
 * Serves the plugin's REAL routes and the REAL `dashboard.html` with a fake
 * upstream where DeepSeek and Kimi answer in ~60 ms and GLM is deliberately
 * slow (default 8 s). Opening `http://127.0.0.1:<port>/usage-board/` therefore
 * paints two cards immediately and leaves the GLM slot a skeleton until its
 * upstream answers — the visual claim of the per-provider change, reproducible
 * without credentials or real network traffic.
 *
 * Run: `node test/verify/progressive-server.mjs [port] [glmDelayMs]`
 * Stays alive until killed; prints `progressive usage board on <url>/usage-board/`.
 */

import { fakeUpstream, startPluginServer } from './_lib.mjs';

const port = Number(process.argv[2] ?? 3198);
const glmDelayMs = Number(process.argv[3] ?? 8000);

/* ---------------------------------------------------------------- fixtures */

const DS_SUMMARY_OK = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: {
      normal_wallets: [{ currency: 'CNY', balance: '33.6528879400000000' }],
      bonus_wallets: [{ currency: 'CNY', balance: '0.00' }],
      total_costs: [{ currency: 'CNY', amount: '12.34' }],
    },
  },
};
const DS_COST_OK = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: [
      {
        currency: 'CNY',
        total: [{ usage: [{ amount: '3.00' }] }],
        days: [
          { date: '2026-10-12', data: [{ usage: [{ amount: '1.00' }] }] },
          { date: '2026-10-13', data: [{ usage: [{ amount: '0.50' }, { amount: '0.25' }] }] },
        ],
      },
    ],
  },
};
const GLM_OK = {
  code: 200,
  msg: '操作成功',
  success: true,
  data: {
    level: 'lite',
    limits: [
      { type: 'CREDIT_LIMIT', unit: 3, number: 5, usage: 2000, currentValue: 656, remaining: 1343, percentage: 32, nextResetTime: 1791973452542 },
      { type: 'CREDIT_LIMIT', unit: 6, number: 1, usage: 10000, currentValue: 5831, remaining: 4168, percentage: 58, nextResetTime: 1792123975997 },
    ],
  },
};
const GLM_SUB_OK = { code: 200, success: true, data: [{ productName: 'GLM Coding Lite', status: 'VALID' }] };
const KIMI_OK = {
  usage: { limit: '100', used: '43', remaining: '57', resetTime: '2026-10-16T08:11:56Z' },
  limits: [
    { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '36', remaining: '64', resetTime: '2026-10-14T07:11:56Z' } },
  ],
  usages: { limit_5h: { used_ratio: 0.357, reset_time: '2026-10-14T07:11:55Z' }, limit_7d: { used_ratio: 0.4266, reset_time: '2026-10-16T08:11:55Z' } },
  booster_wallet: { status: 'STATUS_DISABLED' },
};

const FAST_MS = 40;
const GLM_SUB_MS = 120;

/** DeepSeek and Kimi answer fast; every GLM host is delayed by `glmDelayMs`. */
function plan(url) {
  if (url === 'https://platform.deepseek.com/api/v0/users/get_user_summary') return { body: DS_SUMMARY_OK, delayMs: FAST_MS };
  if (url.startsWith('https://platform.deepseek.com/api/v0/usage/cost')) return { body: DS_COST_OK, delayMs: FAST_MS };
  if (url === 'https://api.deepseek.com/user/balance') return { status: 401, body: {}, delayMs: FAST_MS };
  if (url === 'https://open.bigmodel.cn/api/monitor/usage/quota/limit' || url === 'https://api.z.ai/api/monitor/usage/quota/limit') {
    return { body: GLM_OK, delayMs: glmDelayMs };
  }
  if (url === 'https://api.z.ai/api/biz/subscription/list') return { body: GLM_SUB_OK, delayMs: GLM_SUB_MS };
  if (url === 'https://api.kimi.com/coding/v1/usages' || url === 'https://api.kimi.ai/coding/v1/usages') return { body: KIMI_OK, delayMs: FAST_MS };
  return undefined;
}

/* ------------------------------------------------------------------ server */

const fake = fakeUpstream(plan);
globalThis.fetch = fake.fetchImpl;

const server = await startPluginServer({
  getSecret: async () => 'qa-fake-credential',
  config: { ttlMs: 15_000, devMode: true, servePage: true },
  port,
});

console.log(`progressive usage board on ${server.url}/usage-board/ (GLM delayed ${glmDelayMs} ms)`);
console.log(`snapshot api: ${server.url}/usage-board/api/snapshot`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await new Promise(() => {});
