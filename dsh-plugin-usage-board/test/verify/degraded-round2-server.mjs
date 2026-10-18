/**
 * A deliberately degraded usage-board host for round-2 browser testing:
 * DeepSeek's summary answers HTTP 429 (-> status 'rate-limited'), the GLM hosts
 * answer HTTP 500 (-> 'upstream-error'), Kimi is healthy. Serves the plugin's
 * REAL routes and the REAL `dashboard.html`; only the upstream transport is
 * faked. Runs as its own process because the browser has to talk to it while
 * the harness blocks on the agent-browser CLI.
 *
 * Run: `node test/verify/degraded-round2-server.mjs [port]` — stays alive.
 */

import { fakeUpstream, startPluginServer } from './_lib.mjs';

const DS_SUMMARY = 'https://platform.deepseek.com/api/v0/users/get_user_summary';
const GLM_CN = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit';
const GLM_INTL = 'https://api.z.ai/api/monitor/usage/quota/limit';
const GLM_SUB = 'https://api.z.ai/api/biz/subscription/list';
const KIMI_CN = 'https://api.kimi.com/coding/v1/usages';
const KIMI_INTL = 'https://api.kimi.ai/coding/v1/usages';
const KIMI_OK = {
  usage: { limit: '100', used: '43', remaining: '57', resetTime: '2026-10-16T08:11:56Z' },
  limits: [
    { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '36', remaining: '64', resetTime: '2026-10-14T07:11:56Z' } },
  ],
  usages: { limit_5h: { used_ratio: 0.357, reset_time: '2026-10-14T07:11:55Z' }, limit_7d: { used_ratio: 0.4266, reset_time: '2026-10-16T08:11:55Z' } },
};

const port = Number(process.argv[2] ?? 3197);

const plan = {
  [DS_SUMMARY]: { status: 429, body: { error: 'slow down' } },
  [GLM_CN]: { status: 500, body: { error: 'boom' } },
  [GLM_INTL]: { status: 500, body: { error: 'boom' } },
  [GLM_SUB]: { status: 500, body: { error: 'boom' } },
  [KIMI_CN]: { body: KIMI_OK },
  [KIMI_INTL]: { body: KIMI_OK },
};
const fake = fakeUpstream(plan);
globalThis.fetch = fake.fetchImpl;

const server = await startPluginServer({
  getSecret: async () => 'qa-fake-credential',
  config: { ttlMs: 15_000, devMode: true, servePage: true },
  port,
});

console.log(`degraded round2 usage board on ${server.url}/usage-board/`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await new Promise(() => {});
