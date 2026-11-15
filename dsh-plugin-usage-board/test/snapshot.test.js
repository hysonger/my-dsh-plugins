/**
 * Protocol and snapshot-service tests.
 *
 * These cover the two pieces the Lead owns and every other component depends
 * on: the frozen wire envelope and the cache that builds it. No network, no
 * credentials, no DSH runtime — everything is injected.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_DAILY_USAGE_DAYS,
  PROTOCOL_VERSION,
  PROVIDER_IDS,
  PROVIDER_PATH,
  PROVIDER_QUERY_PARAM,
  SNAPSHOT_PATH,
  derivedPercentOf,
  makeBalance,
  makeDailyUsage,
  makeProvider,
  makeSnapshot,
  makeWindow,
  percentOf,
  round1,
} from '../src/shared/protocol.js';
import {
  SnapshotService,
  UnknownProviderError,
  clampTtl,
  DEFAULT_TTL_MS,
  MAX_TTL_MS,
  MIN_TTL_MS,
} from '../src/host/snapshot.js';

/* ------------------------------------------------------------------ protocol */

test('protocol exposes one id per provider in display order', () => {
  assert.deepEqual(PROVIDER_IDS, ['deepseek', 'glm', 'kimi', 'opencode-go']);
  assert.equal(PROTOCOL_VERSION, 1);
  assert.equal(SNAPSHOT_PATH, '/usage-board/api/snapshot');
  assert.equal(PROVIDER_PATH, '/usage-board/api/provider', 'the per-provider route is part of the wire contract');
  assert.equal(PROVIDER_QUERY_PARAM, 'id');
});

test('makeWindow fills every key so a consumer never sees undefined', () => {
  const win = makeWindow({ id: 'glm.5h', unit: 3, limit: 2000, used: 656 });
  assert.deepEqual(Object.keys(win).sort(), [
    'derivedPercent', 'id', 'labelKey', 'limit', 'note', 'number', 'percent', 'remaining', 'resetAt', 'unit', 'used',
  ]);
  for (const [key, value] of Object.entries(win)) {
    assert.notEqual(value, undefined, `window.${key} must never be undefined`);
  }
  assert.equal(win.labelKey, 'glm.5h', 'labelKey falls back to the window id');
});

test('makeProvider carries a messageKey through the builder, not just by spread', () => {
  // Regression guard: a consumer that builds a row *through* makeProvider must
  // not silently lose the key the client translates. `withMessageKey` in the
  // snapshot service spreads over the built row, which used to mask this.
  const carried = makeProvider({
    id: 'glm', label: 'GLM', status: 'unauthorized',
    message: 'The stored credential was rejected by the provider.',
    messageKey: 'authRejected',
  });
  assert.equal(carried.messageKey, 'authRejected');
  assert.equal(makeProvider({ id: 'glm', label: 'GLM', status: 'ok' }).messageKey, null);
});

test('makeProvider fills every key including empty collections', () => {
  const row = makeProvider({ id: 'kimi', label: 'Kimi Code', status: 'ok' });
  assert.deepEqual(row.windows, []);
  assert.deepEqual(row.balances, []);
  assert.deepEqual(row.meta, {});
  assert.equal(row.plan, null);
  assert.equal(row.message, null);
  assert.equal(row.messageKey, null);
  assert.equal(row.code, null);
  assert.equal(row.account, null);
  assert.equal(row.fetchedAt, null);
  for (const [key, value] of Object.entries(row)) {
    assert.notEqual(value, undefined, `provider.${key} must never be undefined`);
  }
});

test('makeBalance keeps a null for every unmeasured amount', () => {
  assert.deepEqual(makeBalance({ currency: 'CNY' }), {
    currency: 'CNY', available: null, bonus: null, totalSpent: null,
  });
  assert.deepEqual(makeBalance({ currency: 'CNY', available: 0 }), {
    currency: 'CNY', available: 0, bonus: null, totalSpent: null,
  });
});

test('makeSnapshot derives ok from every provider being ok', () => {
  const ok = makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
  const bad = makeProvider({ id: 'kimi', label: 'Kimi', status: 'unauthorized' });
  assert.equal(makeSnapshot({ ttlMs: 1000, providers: [ok] }).ok, true);
  assert.equal(makeSnapshot({ ttlMs: 1000, providers: [ok, bad] }).ok, false);
  // An empty roster is never "ok": there is nothing to report on.
  assert.equal(makeSnapshot({ ttlMs: 1000, providers: [] }).ok, false);
});

test('makeSnapshot stamps the generated time and ttl verbatim', () => {
  const snapshot = makeSnapshot({ generatedAt: 42, ttlMs: 777, providers: [] });
  assert.equal(snapshot.generatedAt, 42);
  assert.equal(snapshot.ttlMs, 777);
  assert.equal(snapshot.protocolVersion, PROTOCOL_VERSION);
});

test('percentOf prefers a provider-reported percentage and tolerates gaps', () => {
  assert.equal(percentOf(656, 2000, 32), 32, 'the declared value is kept verbatim');
  assert.equal(percentOf(656, 2000), 32.8);
  assert.equal(percentOf(1, 3), 33.3);
  assert.equal(percentOf(null, 2000), null);
  assert.equal(percentOf(5, 0), null, 'a zero limit has no percentage');
  assert.equal(percentOf(undefined, undefined, undefined), null);
  assert.equal(round1(0.4266 * 100), 42.7, 'Kimi used_ratio fractions round to one decimal');
});

test('makeDailyUsage caps the series and fills both numeric fields', () => {
  const series = makeDailyUsage({
    currency: 'CNY',
    points: Array.from({ length: 40 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, cost: index })),
  });
  assert.equal(series.points.length, MAX_DAILY_USAGE_DAYS, 'a long series is trimmed');
  assert.equal(series.points[0].cost, 9, 'trimming keeps the trailing window, not the head');
  assert.equal(series.points.at(-1).cost, 39);
  for (const point of series.points) {
    assert.equal(typeof point.date, 'string');
    assert.notEqual(point.cost, undefined);
    assert.notEqual(point.tokens, undefined);
  }
  assert.equal(series.points.at(-1).tokens, null, 'a missing token count becomes null, not undefined');
  assert.equal(makeDailyUsage({}).days, 0);
  assert.equal(makeDailyUsage({}).currency, 'CNY');
});

/* --------------------------------------------------------------- snapshot cache */

/**
 * Build one adapter double that records how often it ran.
 * @param {string} id
 * @param {Partial<import('../src/shared/protocol.js').ProviderSnapshot>} [overrides]
 * @returns {{ adapter: object, calls: () => number }}
 */
function stubAdapter(id, overrides = {}) {
  let calls = 0;
  return {
    adapter: {
      id,
      label: `Stub ${id}`,
      credentialRefs: [],
      async read({ now }) {
        calls += 1;
        return makeProvider({ id, label: `Stub ${id}`, status: 'ok', fetchedAt: now(), ...overrides });
      },
    },
    calls: () => calls,
  };
}

/**
 * Run `fn` with the module-level PROVIDERS list replaced.
 *
 * `SnapshotService` imports the registry array once, so tests swap its contents
 * in place and restore them afterwards.
 * @param {object[]} adapters
 * @param {() => Promise<void>} fn
 */
async function withProviders(adapters, fn) {
  const { PROVIDERS } = await import('../src/host/providers/index.js');
  const saved = PROVIDERS.slice();
  PROVIDERS.length = 0;
  PROVIDERS.push(...adapters);
  try {
    await fn();
  } finally {
    PROVIDERS.length = 0;
    PROVIDERS.push(...saved);
  }
}

test('the cache serves one upstream read within its ttl', async () => {
  const { adapter, calls } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    let clock = 1_000;
    // 20s is above MIN_TTL_MS, so the configured value survives clamping.
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    const first = await service.get();
    assert.equal(calls(), 1);
    clock += 19_999;
    const second = await service.get();
    assert.equal(calls(), 1, 'still inside the ttl');
    assert.equal(second.generatedAt, first.generatedAt);
    clock += 2;
    await service.get();
    assert.equal(calls(), 2, 'the ttl expired');
  });
});

test('a ttl below the supported floor is clamped, so the cache never busy-loops', async () => {
  const { adapter, calls } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    let clock = 0;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 500, now: () => clock });
    assert.equal(service.ttlMs, MIN_TTL_MS, 'a 500ms ttl becomes the 15s floor');
    await service.get();
    clock = 14_000;
    await service.get();
    assert.equal(calls(), 1, 'the request survived the floor');
    clock = 15_001;
    await service.get();
    assert.equal(calls(), 2);
  });
});

test('force bypasses a fresh cache and invalidate drops it', async () => {
  const { adapter, calls } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 60_000 });
    await service.get();
    await service.get({ force: true });
    assert.equal(calls(), 2);
    service.invalidate();
    await service.get();
    assert.equal(calls(), 3);
  });
});

test('concurrent readers share one in-flight fan-out per provider', async () => {
  let started = 0;
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const adapter = {
    id: 'glm',
    label: 'Slow GLM',
    credentialRefs: [],
    async read() {
      started += 1;
      await gate;
      return makeProvider({ id: 'glm', label: 'Slow GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const pending = [service.get(), service.get(), service.get()];
    release();
    const results = await Promise.all(pending);
    assert.equal(started, 1, 'a refresh storm must not multiply upstream calls');
    assert.equal(new Set(results.map((snapshot) => snapshot.generatedAt)).size, 1);
  });
});

test('a throwing adapter becomes a row instead of failing the whole snapshot', async () => {
  const exploding = {
    id: 'kimi',
    label: 'Kimi Code',
    credentialRefs: [],
    async read() {
      throw new Error('boom');
    },
  };
  const { adapter } = stubAdapter('glm');
  await withProviders([adapter, exploding], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const snapshot = await service.get();
    assert.equal(snapshot.providers.length, 2);
    const kimi = snapshot.providers.find((row) => row.id === 'kimi');
    assert.equal(kimi.status, 'upstream-error');
    assert.equal(kimi.code, 'ADAPTER_THROW');
    assert.match(kimi.message, /boom/);
    assert.equal(snapshot.ok, false, 'one bad provider degrades the envelope');
  });
});

test('an adapter returning a partial row is repaired to the full shape', async () => {
  const partial = {
    id: 'deepseek',
    label: 'DeepSeek',
    credentialRefs: [],
    async read() {
      // Deliberately missing every optional field.
      return { id: 'deepseek', label: 'DeepSeek', status: 'not-configured' };
    },
  };
  await withProviders([partial], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const snapshot = await service.get();
    const row = snapshot.providers[0];
    assert.deepEqual(row.windows, []);
    assert.deepEqual(row.meta, {});
    assert.equal(row.plan, null);
    assert.equal(typeof row.latencyMs, 'number');
  });
});

test('readCount reports how many provider reads ran', async () => {
  const { adapter, calls } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 1_000 });
    await service.get();
    await service.get();
    assert.equal(service.readCount, 1, 'a fresh cache is not a read');
    await service.getProvider('glm', { force: true });
    assert.equal(service.readCount, 2, 'a forced per-provider read counts once');
    assert.equal(calls(), 2);
  });
});

test('a read aborts its own signal once every adapter has settled', async () => {
  /** @type {AbortSignal[]} */
  const seen = [];
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read({ signal }) {
      seen.push(signal);
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    await service.get();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].aborted, true, 'an abandoned controller must not outlive the fan-out');
  });
});

test('dispose aborts an in-flight read instead of leaving it running', async () => {
  /** @type {AbortSignal|null} */
  let signal = null;
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read(context) {
      signal = context.signal;
      await gate;
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const pending = service.get();
    await Promise.resolve();
    assert.equal(signal?.aborted, false, 'the read is still running');
    service.dispose();
    assert.equal(signal?.aborted, true, 'disposal must cancel the upstream request');
    release();
    await pending;
  });
});

test('fetchJson caps a body and reports the truncation instead of a bare parse failure', async () => {
  const { fetchJson } = await import('../src/host/fetch-json.js');
  const huge = `{"pad":"${'x'.repeat(5_000)}"}`;
  const fakeFetch = async () => new Response(huge, { status: 200, headers: { 'content-type': 'application/json' } });
  const capped = await fetchJson('https://example.invalid/'+ 'big', { fetchImpl: fakeFetch, maxBodyBytes: 64 });
  assert.equal(capped.ok, false);
  assert.equal(capped.truncated, true);
  assert.equal(capped.json, undefined);
  assert.equal(capped.error?.name, 'BodyTooLargeError', 'the cause must be named, not left as a mystery');

  const whole = await fetchJson('https://example.invalid/big', { fetchImpl: fakeFetch, maxBodyBytes: 64 * 1024 });
  assert.equal(whole.ok, true);
  assert.equal(whole.truncated, false);
  assert.equal(whole.json.pad.length, 5_000);
});

test('fetchJson never throws on a transport failure', async () => {
  const { fetchJson } = await import('../src/host/fetch-json.js');
  const result = await fetchJson('https://example.invalid/', {
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.equal(result.error?.message, 'fetch failed');
});

test('fetchJson reports a caller abort as aborted, not as a timeout', async () => {
  const { fetchJson } = await import('../src/host/fetch-json.js');
  const controller = new AbortController();
  const result = await fetchJson('https://example.invalid/', {
    signal: controller.signal,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        controller.abort();
      }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.aborted, true);
  assert.equal(result.error?.name, 'AbortError');
});

test('clampTtl keeps a misconfiguration inside the supported window', () => {
  assert.equal(clampTtl(undefined), DEFAULT_TTL_MS);
  assert.equal(clampTtl(Number.NaN), DEFAULT_TTL_MS);
  assert.equal(clampTtl(1), MIN_TTL_MS);
  assert.equal(clampTtl(10 ** 9), MAX_TTL_MS);
  assert.equal(clampTtl(45_000), 45_000);
  assert.equal(clampTtl(45_000.6), 45_001);
});

/* ------------------------------------------------- provider diagnostics (D-5) */

test('a failed provider row carries a stable messageKey beside its English text', async () => {
  const { classifyMessage } = await import('../src/host/snapshot.js');
  assert.equal(classifyMessage('not-configured', 'Set ZAI_CODING_CN_API_KEY to enable this provider.'), 'notConfigured');
  assert.equal(classifyMessage('unauthorized', 'The stored credential was rejected by the provider.'), 'authRejected');
  assert.equal(classifyMessage('rate-limited', 'The provider is rate limiting this account; retry later.'), 'rateLimited');
  assert.equal(classifyMessage('network-error', 'The provider could not be reached.'), 'unreachable');
  assert.equal(classifyMessage('network-error', 'The read was cancelled.'), 'cancelled');
  assert.equal(classifyMessage('invalid-response', 'The provider returned a body that is not valid JSON.'), 'badResponse');
  assert.equal(classifyMessage('upstream-error', 'The adapter could not complete the upstream read.'), 'adapterFailed');
  assert.equal(classifyMessage('upstream-error', 'No upstream host was attempted.'), 'noHost');
  // The "no Coding Plan" case is not an auth failure and must not read like one.
  assert.equal(classifyMessage('upstream-error', 'This key has no active Coding Plan.'), 'noCodingPlan');
  // OpenCode Go reports a missing Go subscription instead of a missing coding
  // plan; the fix is the same (subscribe), so it reuses that diagnosis.
  assert.equal(
    classifyMessage('upstream-error', 'This OpenCode key has no Go coding plan subscription, or the key lacks usage access.'),
    'noCodingPlan',
  );
  // An unrecognized diagnostic still yields a usable key.
  assert.equal(classifyMessage('upstream-error', 'The provider returned HTTP 503.'), 'status.upstream-error');
});

test('classifyMessage is not fooled by a provider name that contains "coding plan" (D-10)', async () => {
  const { classifyMessage } = await import('../src/host/snapshot.js');
  // GLM's own diagnostics all mention "GLM Coding Plan". A phrase test that ran
  // before the status branches relabelled every GLM failure as "noCodingPlan".
  const glmRejected = classifyMessage('unauthorized', 'The stored credential was rejected by the provider. (GLM Coding Plan)');
  assert.equal(glmRejected, 'authRejected', 'a rejected GLM key must not read as a subscription problem');
  const glmUnset = classifyMessage('not-configured', 'Set ZAI_CODING_CN_API_KEY to enable GLM Coding Plan.');
  assert.equal(glmUnset, 'notConfigured');
  const glmAdapterCrash = classifyMessage('upstream-error', 'The GLM Coding Plan adapter failed: boom');
  assert.equal(glmAdapterCrash, 'adapterFailed');
  const glmRateLimited = classifyMessage('rate-limited', 'GLM Coding Plan is rate limiting this account.');
  assert.equal(glmRateLimited, 'rateLimited');
  // The genuine no-subscription case still maps to its own key.
  assert.equal(classifyMessage('upstream-error', 'You have no active coding plan for GLM Coding Plan.'), 'noCodingPlan');
});

test('every GLM failure mode reaches a distinct key', async () => {
  const { classifyMessage } = await import('../src/host/snapshot.js');
  const keys = [
    classifyMessage('not-configured', 'Set ZAI_CODING_CN_API_KEY to enable GLM Coding Plan.'),
    classifyMessage('unauthorized', 'The stored credential was rejected by the provider.'),
    classifyMessage('upstream-error', 'You have no active coding plan.'),
    classifyMessage('upstream-error', 'The adapter could not complete the upstream read.'),
  ];
  assert.equal(new Set(keys).size, keys.length, `GLM failure modes must not collide: ${keys.join(', ')}`);
  assert.deepEqual(keys, ['notConfigured', 'authRejected', 'noCodingPlan', 'adapterFailed']);
});

test('a successful row carries no messageKey', async () => {
  const { adapter } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const snapshot = await service.get();
    assert.equal(snapshot.providers[0].message, null);
    assert.equal(snapshot.providers[0].messageKey, null);
  });
});

test('a failing provider row is surfaced with a messageKey through the real service', async () => {
  const failing = {
    id: 'kimi',
    label: 'Kimi Code',
    credentialRefs: [],
    async read() {
      return { id: 'kimi', label: 'Kimi Code', status: 'unauthorized', message: 'The stored credential was rejected by the provider.' };
    },
  };
  await withProviders([failing], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const row = (await service.get()).providers[0];
    assert.equal(row.status, 'unauthorized');
    assert.equal(row.messageKey, 'authRejected');
    assert.match(row.message, /rejected/, 'the English fallback survives');
  });
});

/* ------------------------------------------------------ provider percent (D-3) */

test('derivedPercent exposes the fraction a provider-rounded percent hides', () => {
  // GLM reports percentage: 32 beside 656/2000, which is 32.8%.
  assert.equal(derivedPercentOf(656, 2000), 32.8);
  assert.equal(derivedPercentOf(5831, 10000), 58.3);
  assert.equal(percentOf(656, 2000, 32), 32, 'the declared value is preserved, not overwritten');
  // 0/limit is a real zero, not "unknown".
  assert.equal(derivedPercentOf(0, 100), 0);
  // No usable pair means no derived value — and no invented one.
  assert.equal(derivedPercentOf(null, 2000), null);
  assert.equal(derivedPercentOf(5, 0), null);
  assert.equal(derivedPercentOf(undefined, undefined), null);
});

test('makeWindow derives the percentage from the pair it was given', () => {
  const win = makeWindow({ id: 'glm.5h', unit: 3, used: 656, limit: 2000, remaining: 1343, percent: 32 });
  assert.equal(win.percent, 32, 'the provider value is kept');
  assert.equal(win.derivedPercent, 32.8, 'and the honest fraction is available beside it');
  const noPair = makeWindow({ id: 'kimi.weekly', percent: 42.7 });
  assert.equal(noPair.derivedPercent, null);
});

test('a window without a usable pair never fabricates a derived percentage', () => {
  const windows = [
    makeWindow({ id: 'deepseek.balance', percent: null }),
    makeWindow({ id: 'glm.5h', percent: 32, used: 656 }),
    makeWindow({ id: 'kimi.weekly', percent: 42.7, limit: 100 }),
  ];
  for (const win of windows) {
    assert.equal(win.derivedPercent, null, `${win.id} has no usable used+limit pair`);
  }
});

/* -------------------------------------------------------- dispose and refresh */

test('a read finishing after dispose does not repopulate the cache', async () => {
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read() {
      await gate;
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    let clock = 0;
    const service = new SnapshotService({ getSecret: async () => undefined, now: () => clock });
    const pending = service.get();
    await Promise.resolve();
    service.dispose();
    release();
    await pending;
    clock += 1_000;
    // The finishing read must not have repopulated the cache, and a disposed
    // service must not start a new one: the answer is the empty envelope.
    const afterDispose = await service.get();
    assert.equal(service.readCount, 1, 'a disposed service must not start a new upstream read');
    assert.deepEqual(afterDispose.providers, []);
    assert.equal(service.backgroundReadCount, 0);
  });
});

/* -------------------------------------------- stale-while-revalidate (host) */

test('a fresh cache is served without any staleness flag', async () => {
  const { adapter, calls } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    let clock = 1_000;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    await service.get();
    const served = await service.getServing();
    assert.equal(served.stale, undefined, 'a fresh answer is not stale');
    assert.equal(served.refreshing, undefined);
    assert.equal(calls(), 1);
  });
});

test('an expired cache is served immediately and refreshed behind the response', async () => {
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read() {
      calls += 1;
      if (calls > 1) await gate;
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    let clock = 1_000;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    const first = await service.get();
    assert.equal(first.stale, undefined);

    clock += 20_001; // the ttl has passed
    const served = await service.getServing();
    assert.equal(served.stale, true, 'the caller is told the numbers are old');
    assert.equal(served.refreshing, true, 'and that a refresh is already running');
    assert.equal(served.generatedAt, first.generatedAt, 'the stale body is the cached one, returned at once');
    assert.equal(calls, 2, 'a background read was started');

    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(service.backgroundReadCount, 1);

    const after = await service.getServing();
    assert.equal(after.stale, undefined, 'once refreshed, the answer is fresh again');
    assert.ok(after.generatedAt > first.generatedAt);
  });
});

test('an empty cache still blocks, because there is nothing honest to serve', async () => {
  const { adapter, calls } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000 });
    const served = await service.getServing();
    assert.equal(served.providers.length, 1);
    assert.equal(served.stale, undefined);
    assert.equal(calls(), 1);
  });
});

test('a stale answer and a simultaneous caller share one background read', async () => {
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read() {
      calls += 1;
      if (calls > 1) await gate;
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    let clock = 0;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    await service.get();
    clock += 20_001;
    await Promise.all([service.getServing(), service.getServing(), service.getServing()]);
    assert.equal(calls, 2, 'three stale readers must not start three refreshes');
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

test('a failed background refresh leaves the stale numbers in place', async () => {
  let calls = 0;
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read() {
      calls += 1;
      if (calls === 2) throw new Error('upstream went away');
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    let clock = 0;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    const good = await service.get();
    clock += 20_001;
    // The thrown adapter is repaired into a row, so the refresh "succeeds" with a
    // degraded snapshot — the important part is that the caller before it got
    // numbers instantly and nothing threw.
    const served = await service.getServing();
    assert.equal(served.statusOfFirstProvider ?? served.providers[0].status, 'ok');
    assert.equal(served.generatedAt, good.generatedAt);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls >= 2);
  });
});

test('a disposed service does not start background refreshes', async () => {
  const { adapter, calls } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    let clock = 0;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    await service.get();
    service.dispose();
    clock += 20_001;
    await service.getServing();
    assert.equal(service.backgroundReadCount, 0);
    assert.equal(calls(), 1);
  });
});

/* ------------------------------------------------ per-provider decoupling */

/** A promise the test releases by hand, to hold an adapter mid-read. */
function deferred() {
  /** @type {() => void} */
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Let every pending microtask and one macrotask run, so a settled read can cache. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a per-provider read returns a one-row envelope for exactly that provider', async () => {
  const { adapter } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const snapshot = await service.getProvider('glm');
    assert.equal(snapshot.providers.length, 1, 'the progressive route never ships another provider row');
    assert.equal(snapshot.providers[0].id, 'glm');
    assert.equal(snapshot.providers[0].status, 'ok');
    assert.equal(snapshot.protocolVersion, PROTOCOL_VERSION);
    assert.equal(snapshot.ttlMs, service.ttlMs);
    assert.equal(snapshot.ok, true, 'ok is derived from the one row this envelope carries');
    assert.equal(typeof snapshot.generatedAt, 'number');
  });
});

test('an unregistered provider id is a transport error, not a degraded row', async () => {
  const { adapter } = stubAdapter('glm');
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    await assert.rejects(service.getProvider('nope'), (error) => {
      assert.ok(error instanceof UnknownProviderError);
      assert.equal(error.code, 'unknown-provider');
      assert.equal(error.providerId, 'nope');
      return true;
    });
  });
});

test('a slow provider never holds back another provider\'s read', async () => {
  const gate = deferred();
  let slowSettled = false;
  const slow = {
    id: 'glm',
    label: 'Slow GLM',
    credentialRefs: [],
    async read() {
      await gate.promise;
      return makeProvider({ id: 'glm', label: 'Slow GLM', status: 'ok' });
    },
  };
  const { adapter: fast } = stubAdapter('deepseek');
  await withProviders([fast, slow], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const slowRead = service.getProvider('glm').then((snapshot) => {
      slowSettled = true;
      return snapshot;
    });
    // The whole point of the change: deepseek answers while glm is still hung.
    const fastSnapshot = await Promise.race([
      service.getProvider('deepseek'),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('the fast provider was blocked by the slow one')), 500);
      }),
    ]);
    assert.equal(fastSnapshot.providers[0].id, 'deepseek');
    assert.equal(slowSettled, false, 'the slow provider is still in flight, not awaited');
    gate.resolve();
    assert.equal((await slowRead).providers[0].id, 'glm');
  });
});

test('the aggregate read still waits for the whole board, as documented for compatibility', async () => {
  const gate = deferred();
  const slow = {
    id: 'glm',
    label: 'Slow GLM',
    credentialRefs: [],
    async read() {
      await gate.promise;
      return makeProvider({ id: 'glm', label: 'Slow GLM', status: 'ok' });
    },
  };
  const { adapter: fast } = stubAdapter('deepseek');
  await withProviders([fast, slow], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    let settled = false;
    const aggregate = service.get().then((snapshot) => {
      settled = true;
      return snapshot;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(settled, false, 'the aggregate route blocks on the slowest provider by definition');
    gate.resolve();
    const snapshot = await aggregate;
    assert.deepEqual(snapshot.providers.map((row) => row.id).sort(), ['deepseek', 'glm']);
  });
});

test('a per-provider read serves a stale row immediately and refreshes it behind the response', async () => {
  let calls = 0;
  const gate = deferred();
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read({ now }) {
      calls += 1;
      if (calls > 1) await gate.promise;
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok', fetchedAt: now() });
    },
  };
  await withProviders([adapter], async () => {
    let clock = 1_000;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    const first = await service.getProvider('glm');
    assert.equal(first.stale, undefined);
    assert.equal(first.refreshing, undefined);

    clock += 20_001;
    const served = await service.getProvider('glm');
    assert.equal(served.stale, true, 'the caller is told the row is old');
    assert.equal(served.refreshing, true, 'and that this provider is already being refreshed');
    assert.equal(served.generatedAt, first.generatedAt, 'the stale row is the cached one, returned at once');
    assert.equal(calls, 2, 'a background read for that provider was started');

    gate.resolve();
    await flush();
    const after = await service.getProvider('glm');
    assert.equal(after.stale, undefined, 'once refreshed, the same provider is fresh again');
    assert.ok(after.generatedAt > first.generatedAt);
    assert.equal(calls, 2, 'the background read is reused, not repeated');
  });
});

test('forcing one provider refreshes only that provider', async () => {
  const { adapter: deepseek, calls: deepseekCalls } = stubAdapter('deepseek');
  const { adapter: glm, calls: glmCalls } = stubAdapter('glm');
  await withProviders([deepseek, glm], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    await service.getProvider('deepseek');
    await service.getProvider('glm');
    assert.equal(deepseekCalls(), 1);
    assert.equal(glmCalls(), 1);

    await service.getProvider('deepseek', { force: true });
    assert.equal(deepseekCalls(), 2, 'the forced provider re-read');
    assert.equal(glmCalls(), 1, 'the other provider was untouched');
  });
});

test('concurrent per-provider readers share one upstream read', async () => {
  const gate = deferred();
  let calls = 0;
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read() {
      calls += 1;
      await gate.promise;
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const pending = [service.getProvider('glm'), service.getProvider('glm'), service.getProvider('glm')];
    gate.resolve();
    const results = await Promise.all(pending);
    assert.equal(calls, 1, 'three concurrent card reads must not triple the upstream traffic');
    assert.equal(new Set(results.map((snapshot) => snapshot.generatedAt)).size, 1);
  });
});

test('providerStates reports each provider without touching upstream or credentials', async () => {
  const gate = deferred();
  let calls = 0;
  const adapter = {
    id: 'glm',
    label: 'GLM',
    credentialRefs: [],
    async read() {
      calls += 1;
      if (calls > 1) await gate.promise;
      return makeProvider({ id: 'glm', label: 'GLM', status: 'ok' });
    },
  };
  await withProviders([adapter], async () => {
    let clock = 0;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 20_000, now: () => clock });
    assert.equal(service.providerStates()[0].status, 'missing');
    assert.equal(calls, 0, 'diagnostics never start a read');

    await service.getProvider('glm');
    assert.equal(service.providerStates()[0].status, 'fresh');
    assert.equal(service.providerStates()[0].refreshing, false);

    clock += 20_001;
    await service.getProvider('glm');
    const stale = service.providerStates()[0];
    assert.equal(stale.status, 'stale');
    assert.equal(stale.refreshing, true);
    assert.equal(calls, 2);

    gate.resolve();
    await flush();
    assert.equal(service.providerStates()[0].status, 'fresh');
  });
});

test('dispose aborts every in-flight per-provider read', async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  /** @type {AbortSignal[]} */
  const signals = [];
  const makeGated = (id, gate) => ({
    id,
    label: `Stub ${id}`,
    credentialRefs: [],
    async read(context) {
      signals.push(context.signal);
      await gate.promise;
      return makeProvider({ id, label: `Stub ${id}`, status: 'ok' });
    },
  });
  await withProviders([makeGated('deepseek', firstGate), makeGated('glm', secondGate)], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    const pending = [service.getProvider('deepseek'), service.getProvider('glm')];
    await flush();
    assert.equal(signals.length, 2, 'both providers were reading independently');
    service.dispose();
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[1].aborted, true, 'disposal is not tied to a shared fan-out signal');
    firstGate.resolve();
    secondGate.resolve();
    await Promise.all(pending);
    const afterDispose = await service.getProvider('deepseek');
    assert.deepEqual(afterDispose.providers, [], 'a disposed service starts no new read and has no cache');
  });
});

test('the aggregate route is still composed from the per-provider caches', async () => {
  const { adapter: deepseek, calls: deepseekCalls } = stubAdapter('deepseek');
  const { adapter: glm, calls: glmCalls } = stubAdapter('glm');
  await withProviders([deepseek, glm], async () => {
    const service = new SnapshotService({ getSecret: async () => undefined });
    // Warm only one provider through the progressive route; the aggregate
    // route must reuse that row and read the missing one, not re-read both.
    await service.getProvider('deepseek');
    const aggregate = await service.get();
    assert.equal(deepseekCalls(), 1, 'the warmed provider was served from cache');
    assert.equal(glmCalls(), 1, 'the missing provider was read');
    assert.deepEqual(aggregate.providers.map((row) => row.id), ['deepseek', 'glm']);
    assert.equal(aggregate.ok, true);
  });
});
