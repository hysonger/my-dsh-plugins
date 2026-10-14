/**
 * A deliberately degraded usage-board host for browser testing (task-3, D).
 *
 * Serves the plugin's REAL routes and the REAL `dashboard.html`, with a
 * transport that fails every upstream provider (503). This is the only way to
 * render the "all three providers down" page without touching real credentials
 * or source code: the plugin has no config knob for upstream hosts.
 *
 * Run: `node test/verify/degraded-server.mjs [port]` — stays alive until killed.
 */

import { fakeUpstream, startPluginServer } from './_lib.mjs';

const port = Number(process.argv[2] ?? 3199);

// Every provider host answers 503; the harness's own 127.0.0.1 traffic still
// uses the real fetch (see fakeUpstream's passthrough).
const fake = fakeUpstream({ default: { status: 503, body: { error: 'qa simulated total outage' } } });
globalThis.fetch = fake.fetchImpl;

const server = await startPluginServer({
  getSecret: async () => 'qa-fake-credential',
  config: { ttlMs: 15_000, devMode: true, servePage: true },
  port,
});

console.log(`degraded usage board on ${server.url}/usage-board/`);
console.log('snapshot route:', `${server.url}/usage-board/api/snapshot`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await new Promise(() => {});
