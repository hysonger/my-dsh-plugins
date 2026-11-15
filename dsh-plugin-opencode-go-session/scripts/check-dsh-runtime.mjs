// Offline integration: actual installed Cordis effect lifecycle; no credentials or network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as SessionPlugin from '../index.js';

if (!process.env.DSH_INSTALL_DIR) throw new Error('Run in the current DSH environment');
const requireInstalled = createRequire(`${process.env.DSH_INSTALL_DIR}/package.json`);
const load = name => import(pathToFileURL(requireInstalled.resolve(name)).href);
const { Context } = await load('@deepseek-ai/cordis');
const { default: LlmRuntime } = await load('@deepseek-ai/dsh-llm');
const ctx = new Context();
try {
  await ctx.plugin(LlmRuntime);
  const plugin = await ctx.plugin(SessionPlugin, { repairProtocolOnLoad: false });
  const request = { provider: 'opencode-go', baseURL: 'https://opencode.ai/inference/go/openai/v1', sessionId: 'session-runtime-test' };
  const run = () => {
    const headers = new Headers({ 'x-other': 'preserved' });
    return ctx.waterfall('llm-pi-ai/request-headers', request, headers, () => headers);
  };
  assert.equal(run().get('x-opencode-session'), request.sessionId);
  await plugin.dispose();
  assert.equal(run().get('x-opencode-session'), null);
  const replacement = await ctx.plugin(SessionPlugin, { repairProtocolOnLoad: false });
  assert.equal(run().get('x-opencode-session'), request.sessionId);
  assert.equal(run().get('x-other'), 'preserved');
  await replacement.dispose();
  assert.equal(run().get('x-opencode-session'), null);
  console.log('PASS: actual Cordis activation, unload, reactivation, header preservation');
} finally {
  await ctx.fiber.dispose();
}
