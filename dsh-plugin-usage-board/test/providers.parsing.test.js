/**
 * Offline fixture-driven tests for the provider adapters.
 *
 * Zero network: every upstream response comes from `test/fixtures/*.json`
 * (verbatim live captures — see `test/fixtures/_manifest.json` for provenance
 * and redactions) fed through a stub `fetchJson`. `globalThis.fetch` is
 * replaced with a tripwire for the whole run, so a stray real request fails the
 * suite instead of silently passing.
 *
 * Coverage per provider: ok, not-configured, unauthorized, rate-limited,
 * upstream-error, network-error, invalid-response, plus abort handling,
 * totality (never rejects), and the hard rule that no credential value may
 * appear in a snapshot.
 *
 * @module dsh-plugin-usage-board/test/providers.parsing
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PROVIDERS, providerById } from '../src/host/providers/index.js';
import { MAX_DAILY_USAGE_DAYS, PROVIDER_IDS } from '../src/shared/protocol.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Fake credentials, long enough to be greppable in a leak check. */
const SECRETS = {
  DEEPSEEK_PLATFORM_TOKEN: 'eEiC-FAKE-PLATFORM-GRANT-0123456789abcdef',
  DEEPSEEK_API_KEY: 'sk-FAKE-deepseek-api-key-0123456789abcdef',
  ZAI_CODING_CN_API_KEY: 'fake0000.FAKE-GLM-CODING-PLAN-KEY-0123456789',
  KIMI_CODING_API_KEY: 'sk-kimi-FAKE-KIMI-CODE-SUBSCRIPTION-0123456789',
};

const SUMMARY_URL = 'https://platform.deepseek.com/api/v0/users/get_user_summary';
const COST_URL = 'https://platform.deepseek.com/api/v0/usage/cost';
const API_BALANCE_URL = 'https://api.deepseek.com/user/balance';
const GLM_CN_URL = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit';
const GLM_INTL_URL = 'https://api.z.ai/api/monitor/usage/quota/limit';
const GLM_SUBSCRIPTION_URL = 'https://api.z.ai/api/biz/subscription/list';
/**
 * The identity endpoint is deliberately absent from this suite: the adapter
 * must never call it, so any request to it would hit the stub's unknown-URL
 * throw. It is asserted explicitly in the deepseek suite.
 */
const DEEPSEEK_IDENTITY_URL = 'https://platform.deepseek.com/auth-api/v0/users/current';
const KIMI_CN_URL = 'https://api.kimi.com/coding/v1/usages';
const KIMI_INTL_URL = 'https://api.kimi.ai/coding/v1/usages';

/** Every status the protocol defines. */
const STATUSES = new Set([
  'ok',
  'not-configured',
  'unauthorized',
  'rate-limited',
  'upstream-error',
  'network-error',
  'invalid-response',
  'disabled',
]);

/** ProviderSnapshot keys required by the frozen protocol. */
const SNAPSHOT_KEYS = [
  'id',
  'label',
  'status',
  'message',
  'code',
  'plan',
  'windows',
  'balances',
  'account',
  'meta',
  'fetchedAt',
  'latencyMs',
];

/** UsageWindow keys required by the frozen protocol. */
const WINDOW_KEYS = ['id', 'labelKey', 'unit', 'number', 'limit', 'used', 'remaining', 'percent', 'resetAt', 'note'];

/** Balance keys required by the frozen protocol. */
const BALANCE_KEYS = ['currency', 'available', 'bonus', 'totalSpent'];

/** The fixed instant the fixtures were captured, so URL month/year always match. */
const FIXTURE_NOW = Date.parse('2026-10-14T07:00:30Z');

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Load one captured fixture.
 *
 * @param {string} name File name inside `test/fixtures`.
 * @returns {any}
 */
function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

/**
 * Build a stub `fetchJson` with the host helper's exact result contract.
 *
 * `routes` maps a URL (or a URL prefix, matched by `startsWith`) to a result
 * spec; a spec of `{ throw: Error }` simulates a transport that rejected.
 *
 * @param {Record<string, any>} routes
 * @returns {((url: string, options?: object) => Promise<any>) & { calls: Array<{url: string, options: any}> }}
 */
function stubFetch(routes) {
  const calls = [];
  const stub = async (url, options = {}) => {
    calls.push({ url, options });
    const key = Object.keys(routes).find((candidate) => url === candidate || url.startsWith(`${candidate}?`));
    const spec = key === undefined ? undefined : routes[key];
    if (spec === undefined) throw new Error(`stubFetch: unexpected URL ${url}`);
    if (spec.throw) throw spec.throw;
    const json = spec.json;
    const text = spec.text ?? (json === undefined ? '' : JSON.stringify(json));
    return {
      ok: spec.status >= 200 && spec.status < 300 && json !== undefined,
      status: spec.status,
      headers: {},
      json,
      text,
      error: spec.error ?? null,
      aborted: spec.aborted ?? false,
      latencyMs: spec.latencyMs ?? 1,
    };
  };
  stub.calls = calls;
  return stub;
}

/**
 * A 2xx JSON result spec.
 *
 * @param {unknown} json
 * @returns {{json: unknown, status: number}}
 */
const ok200 = (json) => ({ json, status: 200 });

/**
 * A transport failure spec (no HTTP response at all).
 *
 * @param {string} name
 * @param {string} message
 * @returns {{json: undefined, status: null, error: {name: string, message: string}}}
 */
const transportError = (name = 'TypeError', message = 'fetch failed') => ({
  json: undefined,
  status: null,
  error: { name, message },
});

/**
 * Run one adapter against the stubs.
 *
 * @param {string} id
 * @param {{ routes: Record<string, any>, secrets?: Record<string, string|undefined>, signal?: AbortSignal, now?: number, timeoutMs?: number, throwOnGetSecret?: Error }} options
 * @returns {Promise<{ snapshot: any, fetch: ReturnType<typeof stubFetch>, resolvedRefs: string[] }>}
 */
async function run(id, options) {
  const adapter = providerById(id);
  assert.ok(adapter, `adapter ${id} must be registered`);
  const fetch = stubFetch(options.routes);
  const secrets = options.secrets ?? {};
  const resolvedRefs = [];
  const snapshot = await adapter.read({
    getSecret: async (name) => {
      resolvedRefs.push(name);
      if (options.throwOnGetSecret) throw options.throwOnGetSecret;
      return secrets[name];
    },
    fetchJson: fetch,
    signal: options.signal,
    now: options.now ?? FIXTURE_NOW,
    timeoutMs: options.timeoutMs,
  });
  assertSnapshotShape(snapshot);
  return { snapshot, fetch, resolvedRefs };
}

/**
 * Assert a snapshot carries every protocol key, with no `undefined` anywhere.
 *
 * @param {any} snapshot
 */
function assertSnapshotShape(snapshot) {
  for (const key of SNAPSHOT_KEYS) {
    assert.ok(key in snapshot, `snapshot.${key} is missing`);
    assert.notEqual(snapshot[key], undefined, `snapshot.${key} is undefined`);
  }
  assert.ok(STATUSES.has(snapshot.status), `unknown status ${snapshot.status}`);
  assert.ok(Array.isArray(snapshot.windows), 'windows must be an array');
  assert.ok(Array.isArray(snapshot.balances), 'balances must be an array');
  assert.equal(typeof snapshot.meta, 'object');
  assert.notEqual(snapshot.meta, null);
  for (const window of snapshot.windows) assertWindowShape(window);
  for (const balance of snapshot.balances) assertBalanceShape(balance);
}

/**
 * @param {any} window
 */
function assertWindowShape(window) {
  for (const key of WINDOW_KEYS) {
    assert.ok(key in window, `window.${key} is missing`);
    assert.notEqual(window[key], undefined, `window.${key} is undefined on ${window.id}`);
  }
  assert.equal(typeof window.id, 'string');
  assert.equal(typeof window.labelKey, 'string');
}

/**
 * @param {any} balance
 */
function assertBalanceShape(balance) {
  for (const key of BALANCE_KEYS) {
    assert.ok(key in balance, `balance.${key} is missing`);
    assert.notEqual(balance[key], undefined, `balance.${key} is undefined on ${balance.currency}`);
  }
  assert.equal(typeof balance.currency, 'string');
}

/**
 * Deep-scan a value for any raw credential and for `undefined` leaks.
 *
 * @param {unknown} value
 * @param {string} at
 */
function assertNoSecret(value, at = '$') {
  if (typeof value === 'string') {
    for (const [name, secret] of Object.entries(SECRETS)) {
      assert.ok(!value.includes(secret), `${at} leaks ${name}`);
      assert.ok(!value.includes(secret.slice(0, 24)), `${at} leaks a ${name} prefix`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecret(entry, `${at}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assert.notEqual(entry, undefined, `${at}.${key} is undefined`);
      assertNoSecret(entry, `${at}.${key}`);
    }
  }
}

// ── tripwire: this suite must never touch the network ───────────────────────

const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = () => {
    throw new Error('network access attempted in an offline test');
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

// ── registry ────────────────────────────────────────────────────────────────

describe('provider registry', () => {
  it('registers deepseek, glm, kimi in protocol order', () => {
    assert.deepEqual(
      PROVIDERS.map((adapter) => adapter.id),
      [...PROVIDER_IDS],
    );
  });

  it('gives every adapter a label, credential refs and a total read()', () => {
    for (const adapter of PROVIDERS) {
      assert.equal(typeof adapter.label, 'string');
      assert.ok(adapter.label.length > 0);
      assert.ok(Array.isArray(adapter.credentialRefs) && adapter.credentialRefs.length > 0);
      for (const ref of adapter.credentialRefs) assert.equal(typeof ref, 'string');
      assert.equal(typeof adapter.read, 'function');
    }
    assert.equal(providerById('nope'), undefined);
  });
});

// ── GLM ─────────────────────────────────────────────────────────────────────

describe('glm adapter', () => {
  const routes = {
    [GLM_CN_URL]: ok200(fixture('glm-limit-cn.json')),
    [GLM_INTL_URL]: ok200(fixture('glm-limit-intl.json')),
    [GLM_SUBSCRIPTION_URL]: ok200(fixture('glm-subscription.json')),
  };
  const key = { ZAI_CODING_CN_API_KEY: SECRETS.ZAI_CODING_CN_API_KEY };

  it('normalizes the live China-host payload', async () => {
    const { snapshot, fetch } = await run('glm', { routes, secrets: key });

    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.message, null);
    assert.equal(snapshot.code, null);
    assert.equal(snapshot.plan, 'GLM Coding Lite', 'plan name comes from the subscription endpoint');
    assert.equal(snapshot.meta.host, 'open.bigmodel.cn');
    assert.equal(snapshot.meta.source, 'quota-api');
    assert.equal(snapshot.meta.level, 'lite', 'the bare level stays available for diagnostics');
    assert.equal(snapshot.meta.subscriptionStatus, 'VALID');
    assert.equal(snapshot.balances.length, 0);
    assert.equal(snapshot.account, null);
    assert.equal(typeof snapshot.fetchedAt, 'number');
    assert.equal(typeof snapshot.latencyMs, 'number');
    assert.equal(fetch.calls.length, 2, 'quota + subscription');
    assert.deepEqual(snapshot.windows, [
      {
        id: 'glm.5h',
        labelKey: 'glm.5h',
        unit: 3,
        number: 5,
        limit: 2000,
        used: 656,
        remaining: 1343,
        percent: 32,
        resetAt: 1791973452542,
        note: null,
      },
      {
        id: 'glm.weekly',
        labelKey: 'glm.weekly',
        unit: 6,
        number: 1,
        limit: 10000,
        used: 5831,
        remaining: 4168,
        percent: 58,
        resetAt: 1792123975997,
        note: null,
      },
    ]);
    assertNoSecret(snapshot);
  });

  it('sends the credential as a bearer token and never into the URL', async () => {
    const { fetch } = await run('glm', { routes, secrets: key });
    assert.equal(fetch.calls[0].options.headers.Authorization, `Bearer ${SECRETS.ZAI_CODING_CN_API_KEY}`);
    assert.ok(!fetch.calls[0].url.includes(SECRETS.ZAI_CODING_CN_API_KEY));
  });

  it('falls back to api.z.ai when the China host rejects the key', async () => {
    const { snapshot, fetch } = await run('glm', {
      routes: { ...routes, [GLM_CN_URL]: ok200(fixture('glm-auth-failed.json')) },
      secrets: key,
    });
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.meta.host, 'api.z.ai');
    assert.equal(snapshot.windows.length, 2);
    assert.equal(fetch.calls[0].url, GLM_CN_URL);
    assert.equal(fetch.calls[1].url, GLM_INTL_URL);
  });

  it('reports unauthorized when both hosts reject the credential', async () => {
    const { snapshot } = await run('glm', {
      routes: { [GLM_CN_URL]: ok200(fixture('glm-auth-failed.json')), [GLM_INTL_URL]: ok200(fixture('glm-auth-failed.json')) },
      secrets: key,
    });
    assert.equal(snapshot.status, 'unauthorized');
    assert.equal(snapshot.code, 'code 1000', 'HTTP 200 carrying code 1000 is still unauthorized');
    assert.ok(snapshot.message.length > 0);
    assert.deepEqual(snapshot.meta.attempts, ['code 1000', 'code 1000']);
    assertNoSecret(snapshot);
  });

  it('distinguishes "no Coding Plan" from an invalid credential', async () => {
    const noPlan = ok200(fixture('glm-no-coding-plan.json'));
    const { snapshot } = await run('glm', { routes: { [GLM_CN_URL]: noPlan, [GLM_INTL_URL]: noPlan }, secrets: key });
    assert.equal(snapshot.status, 'upstream-error');
    assert.notEqual(snapshot.status, 'unauthorized');
    assert.equal(snapshot.code, 'code 500');
    assert.match(snapshot.message, /Coding Plan/i);
  });

  it('classifies windows by unit, never by reset time', async () => {
    // The weekly window is listed first AND resets before the 5h window — the
    // exact shape that silently swaps two windows under a time sort.
    const body = {
      code: 200,
      success: true,
      msg: 'ok',
      data: {
        level: 'lite',
        limits: [
          { type: 'CREDIT_LIMIT', unit: 6, number: 7, usage: 10000, currentValue: 9000, remaining: 1000, percentage: 90, nextResetTime: 1791900000000 },
          { type: 'CREDIT_LIMIT', unit: 3, number: 5, usage: 2000, currentValue: 200, remaining: 1800, percentage: 10, nextResetTime: 1791999999000 },
        ],
      },
    };
    const { snapshot } = await run('glm', { routes: { [GLM_CN_URL]: ok200(body), [GLM_SUBSCRIPTION_URL]: ok200(fixture('glm-subscription.json')) }, secrets: key });

    const byId = Object.fromEntries(snapshot.windows.map((window) => [window.id, window]));
    assert.equal(byId['glm.weekly'].unit, 6, 'unit 6 is weekly even when it resets first');
    assert.equal(byId['glm.weekly'].number, 7, 'unit 6 stays weekly with number 7');
    assert.equal(byId['glm.weekly'].percent, 90);
    assert.equal(byId['glm.weekly'].resetAt, 1791900000000);
    assert.equal(byId['glm.5h'].unit, 3);
    assert.equal(byId['glm.5h'].resetAt, 1791999999000);
    assert.deepEqual(
      snapshot.windows.map((window) => window.id),
      ['glm.5h', 'glm.weekly'],
      'display order is stable: 5h first',
    );
  });

  it('keeps an unknown unit instead of dropping the window', async () => {
    const body = {
      code: 200,
      success: true,
      data: { level: 'pro', limits: [{ type: 'CREDIT_LIMIT', unit: 7, usage: 50, currentValue: 5, remaining: 45 }] },
    };
    const { snapshot } = await run('glm', { routes: { [GLM_CN_URL]: ok200(body), [GLM_SUBSCRIPTION_URL]: ok200({ code: 200, data: [] }) }, secrets: key });
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.windows.length, 1);
    assert.equal(snapshot.windows[0].id, 'glm.unit.7');
    assert.equal(snapshot.windows[0].percent, 10, 'percent is computed when the provider omits it');
    assert.equal(snapshot.windows[0].resetAt, null);
    assert.equal(snapshot.plan, 'pro', 'falls back to data.level when no subscription name is available');
    assert.equal(snapshot.meta.subscriptionError, 'E_BAD_SHAPE');
  });

  it('fills the missing third of a limit/used/remaining triple', async () => {
    const body = { code: 200, success: true, data: { level: 'lite', limits: [{ unit: 3, usage: 100, currentValue: 25 }] } };
    const { snapshot } = await run('glm', { routes: { [GLM_CN_URL]: ok200(body) }, secrets: key });
    assert.equal(snapshot.windows[0].remaining, 75);
    assert.equal(snapshot.windows[0].percent, 25);
  });

  it('maps an empty limits array to invalid-response with a rawSnippet', async () => {
    const { snapshot } = await run('glm', { routes: { [GLM_CN_URL]: ok200(fixture('glm-empty-limits.json')) }, secrets: key });
    assert.equal(snapshot.status, 'invalid-response');
    assert.equal(typeof snapshot.meta.rawSnippet, 'string');
    assert.ok(snapshot.meta.rawSnippet.length > 0);
  });

  it('maps 429, 5xx, non-JSON and transport failures', async () => {
    const cases = [
      [{ [GLM_CN_URL]: { json: { error: 'slow down' }, status: 429 } }, 'rate-limited', 'HTTP 429'],
      [{ [GLM_CN_URL]: { json: { error: 'boom' }, status: 503 } }, 'upstream-error', 'HTTP 503'],
      [
        { [GLM_CN_URL]: { json: undefined, status: 200, text: '<html>gateway error</html>' } },
        'invalid-response',
        'E_NOT_JSON',
      ],
      [{ [GLM_CN_URL]: transportError('TypeError', 'fetch failed') }, 'network-error', 'TypeError'],
      [{ [GLM_CN_URL]: { json: undefined, status: null, aborted: true, error: { name: 'AbortError', message: 'aborted' } } }, 'network-error', 'ABORTED'],
    ];
    for (const [route, status, code] of cases) {
      const { snapshot } = await run('glm', {
        routes: { [route === undefined ? GLM_CN_URL : GLM_CN_URL]: route[GLM_CN_URL], [GLM_INTL_URL]: route[GLM_CN_URL] },
        secrets: key,
      });
      assert.equal(snapshot.status, status, JSON.stringify(route));
      assert.equal(snapshot.code, code);
      assertNoSecret(snapshot);
    }
  });

  it('truncates the rawSnippet to 200 characters', async () => {
    const text = 'x'.repeat(5000);
    const { snapshot } = await run('glm', {
      routes: { [GLM_CN_URL]: { json: undefined, status: 200, text }, [GLM_INTL_URL]: { json: undefined, status: 200, text } },
      secrets: key,
    });
    assert.equal(snapshot.status, 'invalid-response');
    assert.equal(snapshot.meta.rawSnippet.length, 200);
  });

  it('reports not-configured without any upstream call', async () => {
    const { snapshot, fetch } = await run('glm', { routes, secrets: {} });
    assert.equal(snapshot.status, 'not-configured');
    assert.equal(snapshot.code, null);
    assert.match(snapshot.message, /ZAI_CODING_CN_API_KEY/);
    assert.equal(fetch.calls.length, 0);
    assertNoSecret(snapshot);
  });

  it('aborts before starting when the signal is already aborted', async () => {
    const { snapshot, fetch } = await run('glm', { routes, secrets: key, signal: AbortSignal.abort() });
    assert.equal(snapshot.status, 'network-error');
    assert.equal(snapshot.code, 'ABORTED');
    assert.equal(fetch.calls.length, 0);
  });

  it('is total when the transport throws a non-Error', async () => {
    const { snapshot } = await run('glm', {
      routes: { [GLM_CN_URL]: { throw: 'string failure' }, [GLM_INTL_URL]: { throw: null } },
      secrets: key,
    });
    assert.equal(snapshot.status, 'upstream-error');
    assert.equal(snapshot.code, 'E_INTERNAL');
  });

  it('is total when the credential accessor throws', async () => {
    const { snapshot } = await run('glm', { routes, secrets: key, throwOnGetSecret: new Error('store offline') });
    assert.equal(snapshot.status, 'upstream-error');
    assert.equal(snapshot.code, 'E_INTERNAL');
  });
});

// ── DeepSeek ────────────────────────────────────────────────────────────────

describe('deepseek adapter', () => {
  const summary = fixture('deepseek-summary.json');
  const cost = fixture('deepseek-cost.json');
  const routes = {
    [SUMMARY_URL]: ok200(summary),
    [COST_URL]: ok200(cost),
  };
  const grant = { DEEPSEEK_PLATFORM_TOKEN: SECRETS.DEEPSEEK_PLATFORM_TOKEN };

  it('normalizes the live platform grant payload', async () => {
    const { snapshot, fetch } = await run('deepseek', { routes, secrets: grant });

    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.message, null);
    assert.equal(snapshot.code, null);
    assert.equal(snapshot.windows.length, 0, 'DeepSeek Platform exposes no quota windows');
    assert.deepEqual(snapshot.balances, [
      { currency: 'CNY', available: 27.74750922, bonus: 0, totalSpent: 128.25488682 },
    ]);
    assert.equal(snapshot.account, null, 'no masked email/phone on a usage dashboard');
    assert.equal(snapshot.meta.host, 'platform.deepseek.com');
    assert.equal(snapshot.meta.source, 'platform-account-api');
    assert.equal(fetch.calls.length, 2, 'summary + month-to-date cost');
    assertNoSecret(snapshot);
  });

  it('never requests the identity endpoint that would return personal data', async () => {
    const { fetch } = await run('deepseek', { routes, secrets: grant });
    assert.equal(
      fetch.calls.some((call) => call.url.startsWith(DEEPSEEK_IDENTITY_URL)),
      false,
      'the masked email/phone endpoint must not be called at all',
    );
  });

  it('sends the grant as x-dsh-auth-token, never as a bearer token on the cost route', async () => {
    const { fetch } = await run('deepseek', { routes, secrets: grant });
    const [summaryCall, costCall] = fetch.calls;
    assert.equal(summaryCall.options.headers['x-dsh-auth-token'], SECRETS.DEEPSEEK_PLATFORM_TOKEN);
    assert.equal(costCall.url, `${COST_URL}?month=10&year=2026`, 'month/year come from now()');
    assert.equal(costCall.options.headers['x-dsh-auth-token'], SECRETS.DEEPSEEK_PLATFORM_TOKEN);
    assert.equal(costCall.options.headers.Authorization, undefined);
    assert.equal(costCall.options.headers['x-client-platform'], 'web');
    assert.equal(costCall.options.maxBodyBytes > 8 * 1024, true, 'a month of cost data exceeds the 8 KiB default');
    for (const call of fetch.calls) assert.ok(!call.url.includes(SECRETS.DEEPSEEK_PLATFORM_TOKEN));
  });

  it('derives the month-to-date daily series from the cost endpoint', async () => {
    const { snapshot } = await run('deepseek', { routes, secrets: grant });
    const series = snapshot.meta.dailyUsage;
    assert.ok(series, 'meta.dailyUsage must be present when the endpoint answers');
    assert.equal(series.currency, 'CNY');

    // Recompute the expected points from the raw fixture, independently.
    const month = cost.data.biz_data.find((entry) => Array.isArray(entry.days));
    const expected = month.days.map((day) => ({
      date: day.date,
      cost:
        Math.round(
          day.data.reduce((sum, model) => sum + model.usage.reduce((inner, usage) => inner + Number(usage.amount), 0), 0) *
            1e6,
        ) / 1e6,
    }));
    let end = expected.length;
    while (end > 0 && expected[end - 1].cost === 0) end -= 1;

    assert.equal(series.points.length, end);
    assert.ok(series.days <= MAX_DAILY_USAGE_DAYS);
    assert.equal(series.days, end, 'days counts the trailing days actually rendered');
    assert.deepEqual(
      series.points.map((point) => point.date),
      expected.slice(0, end).map((point) => point.date),
      'oldest first, future zero days dropped',
    );
    for (const [index, point] of series.points.entries()) {
      assert.equal(point.cost, expected[index].cost);
      assert.equal(point.tokens, null, 'the cost endpoint reports money only');
      assert.equal('date' in point && 'cost' in point && 'tokens' in point, true);
    }
    assert.ok(series.points.length > 0);
    assert.ok(!series.points.some((point) => point.cost === 0 && point.date > '2026-10-31'));
    assertNoSecret(series);
  });

  it('keeps the row ok when the optional cost history fails', async () => {
    const { snapshot } = await run('deepseek', {
      routes: { ...routes, [COST_URL]: { json: { code: 500 }, status: 500 } },
      secrets: grant,
    });
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.balances.length, 1);
    assert.equal(snapshot.meta.dailyUsage, undefined);
    assert.equal(snapshot.meta.dailyUsageError, 'HTTP 500');
  });

  it('keeps the row ok when the cost body is truncated and unparseable', async () => {
    const { snapshot } = await run('deepseek', {
      routes: { ...routes, [COST_URL]: { json: undefined, status: 200, text: '{"code":0,"data":{"biz_code":0,"biz_' } },
      secrets: grant,
    });
    assert.equal(snapshot.status, 'ok', 'the balance must survive a truncated history body');
    assert.equal(snapshot.balances.length, 1);
    assert.equal(snapshot.meta.dailyUsageError, 'E_NOT_JSON');
  });

  it('maps a 200 body carrying code 40003 to unauthorized', async () => {
    const { snapshot } = await run('deepseek', {
      routes: { ...routes, [SUMMARY_URL]: ok200(fixture('deepseek-unauthorized.json')) },
      secrets: grant,
    });
    assert.equal(snapshot.status, 'unauthorized');
    assert.equal(snapshot.code, 'code 40003');
    assertNoSecret(snapshot);
  });

  it('maps an HTTP 401 to unauthorized', async () => {
    const { snapshot } = await run('deepseek', {
      routes: { ...routes, [SUMMARY_URL]: { json: { detail: 'unauthorized' }, status: 401 } },
      secrets: grant,
    });
    assert.equal(snapshot.status, 'unauthorized');
    assert.equal(snapshot.code, 'HTTP 401');
  });

  it('merges the optional sk- balance source without losing platform values', async () => {
    const { snapshot, fetch } = await run('deepseek', {
      routes: { ...routes, [API_BALANCE_URL]: ok200(fixture('deepseek-apikey-balance.json')) },
      secrets: { ...grant, DEEPSEEK_API_KEY: SECRETS.DEEPSEEK_API_KEY },
    });
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.meta.source, 'both');
    assert.deepEqual(snapshot.balances, [
      { currency: 'CNY', available: 27.74750922, bonus: 0, totalSpent: 128.25488682 },
      { currency: 'USD', available: 1.25, bonus: 0, totalSpent: null },
    ]);
    assert.equal(fetch.calls.length, 3);
    assert.equal(fetch.calls[2].options.headers.Authorization, `Bearer ${SECRETS.DEEPSEEK_API_KEY}`);
    assertNoSecret(snapshot);
  });

  it('never lets the optional sk- source break an otherwise-good row', async () => {
    const { snapshot } = await run('deepseek', {
      routes: { ...routes, [API_BALANCE_URL]: { json: { error: 'bad key' }, status: 401 } },
      secrets: { ...grant, DEEPSEEK_API_KEY: SECRETS.DEEPSEEK_API_KEY },
    });
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.meta.source, 'platform-account-api');
    assert.equal(snapshot.meta.secondarySource, 'HTTP 401');
    assert.equal(snapshot.balances.length, 1);
  });

  it('maps every transport failure branch', async () => {
    const cases = [
      [{ json: { error: 'slow' }, status: 429 }, 'rate-limited', 'HTTP 429'],
      [{ json: { error: 'boom' }, status: 502 }, 'upstream-error', 'HTTP 502'],
      [{ json: undefined, status: 200, text: '<html>login</html>' }, 'invalid-response', 'E_NOT_JSON'],
      [{ json: undefined, status: null, error: { name: 'ENOTFOUND', message: 'dns' } }, 'network-error', 'ENOTFOUND'],
    ];
    for (const [result, status, code] of cases) {
      const { snapshot } = await run('deepseek', { routes: { ...routes, [SUMMARY_URL]: result }, secrets: grant });
      assert.equal(snapshot.status, status);
      assert.equal(snapshot.code, code);
      assertNoSecret(snapshot);
    }
  });

  it('maps a 2xx body without the biz envelope to invalid-response', async () => {
    const { snapshot } = await run('deepseek', { routes: { ...routes, [SUMMARY_URL]: ok200({ code: 0 }) }, secrets: grant });
    assert.equal(snapshot.status, 'invalid-response');
    assert.equal(snapshot.code, 'E_BAD_SHAPE');
    const noWallets = await run('deepseek', {
      routes: { ...routes, [SUMMARY_URL]: ok200({ code: 0, data: { biz_code: 0, biz_data: {} } }) },
      secrets: grant,
    });
    assert.equal(noWallets.snapshot.status, 'invalid-response');
    assert.ok(noWallets.snapshot.meta.rawSnippet.length > 0);
  });

  it('reports not-configured without any upstream call', async () => {
    const { snapshot, fetch } = await run('deepseek', { routes, secrets: {} });
    assert.equal(snapshot.status, 'not-configured');
    assert.match(snapshot.message, /DEEPSEEK_PLATFORM_TOKEN/);
    assert.equal(fetch.calls.length, 0);
  });

  it('aborts before starting when the signal is already aborted', async () => {
    const { snapshot, fetch } = await run('deepseek', { routes, secrets: grant, signal: AbortSignal.abort() });
    assert.equal(snapshot.status, 'network-error');
    assert.equal(snapshot.code, 'ABORTED');
    assert.equal(fetch.calls.length, 0);
  });

  it('is total when the transport throws', async () => {
    const { snapshot } = await run('deepseek', { routes: { ...routes, [SUMMARY_URL]: { throw: new Error('boom') } }, secrets: grant });
    assert.equal(snapshot.status, 'upstream-error');
    assert.equal(snapshot.code, 'E_INTERNAL');
  });
});

// ── Kimi ────────────────────────────────────────────────────────────────────

describe('kimi adapter', () => {
  const usages = fixture('kimi-usages.json');
  const routes = { [KIMI_CN_URL]: ok200(usages), [KIMI_INTL_URL]: ok200(usages) };
  const key = { KIMI_CODING_API_KEY: SECRETS.KIMI_CODING_API_KEY };
  // Expected resets are derived from the fixture so a re-capture cannot make
  // this suite lie; the detail/plan blocks carry the same instants with a
  // microsecond tail that the usages block truncates.
  const FIVE_H_RESET = Date.parse(usages.usages.limit_5h.reset_time);
  const WEEKLY_RESET = Date.parse(usages.usages.limit_7d.reset_time);
  const DETAIL_FIVE_H_RESET = Date.parse(usages.limits[0].detail.resetTime);
  const PLAN_WEEKLY_RESET = Date.parse(usages.usage.resetTime);

  it('normalizes the live usages payload into exactly two windows', async () => {
    const { snapshot, fetch } = await run('kimi', { routes, secrets: key });

    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.plan, null, 'Kimi exposes no coding-plan tier; user_level_name is a gamified level');
    assert.equal(snapshot.account, null, 'no phone-derived identity on a usage dashboard');
    assert.equal(snapshot.balances.length, 0, 'no balance endpoint exists for this key');
    assert.equal(snapshot.meta.host, 'api.kimi.com');
    assert.equal(snapshot.meta.source, 'coding-usages-api');
    assert.equal(snapshot.meta.booster, 'disabled');
    assert.equal(fetch.calls.length, 1, 'one request only: /usages');
    assert.equal(fetch.calls[0].options.headers.Authorization, `Bearer ${SECRETS.KIMI_CODING_API_KEY}`);

    assert.deepEqual(snapshot.windows, [
      {
        id: 'kimi.5h',
        labelKey: 'kimi.5h',
        unit: 'TIME_UNIT_MINUTE',
        number: null,
        limit: 100,
        used: 36,
        remaining: 64,
        percent: 35.7,
        resetAt: FIVE_H_RESET,
        note: null,
      },
      {
        id: 'kimi.weekly',
        labelKey: 'kimi.weekly',
        unit: '7d',
        number: null,
        limit: 100,
        used: 43,
        remaining: 57,
        percent: 42.7,
        resetAt: WEEKLY_RESET,
        note: null,
      },
    ]);
    assertNoSecret(snapshot);
  });

  it('prefers the usages block for percent and reset time', async () => {
    const { snapshot } = await run('kimi', { routes, secrets: key });
    const fiveHour = snapshot.windows.find((window) => window.id === 'kimi.5h');
    // 36/100 would round to 36; the provider's own ratio is 0.357.
    assert.equal(fiveHour.percent, 35.7);
    // The usages block's reset_time is the field observed updating live; the
    // limits[].detail counterpart carries a microsecond tail and must lose.
    assert.equal(fiveHour.resetAt, FIVE_H_RESET);
    assert.notEqual(fiveHour.resetAt, DETAIL_FIVE_H_RESET);
    const weekly = snapshot.windows.find((window) => window.id === 'kimi.weekly');
    assert.equal(weekly.resetAt, WEEKLY_RESET);
    assert.notEqual(weekly.resetAt, PLAN_WEEKLY_RESET);
  });

  it('falls back to the global host', async () => {
    const { snapshot, fetch } = await run('kimi', {
      routes: { ...routes, [KIMI_CN_URL]: { json: { error: 'boom' }, status: 500 } },
      secrets: key,
    });
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.meta.host, 'api.kimi.ai');
    assert.equal(fetch.calls[0].url, KIMI_CN_URL);
    assert.equal(fetch.calls[1].url, KIMI_INTL_URL);
  });

  it('maps an anonymous 401 to unauthorized on both hosts', async () => {
    const unauthorized = { json: fixture('kimi-unauthorized.json'), status: 401 };
    const { snapshot } = await run('kimi', { routes: { [KIMI_CN_URL]: unauthorized, [KIMI_INTL_URL]: unauthorized }, secrets: key });
    assert.equal(snapshot.status, 'unauthorized');
    assert.equal(snapshot.code, 'HTTP 401', 'the 401 carries no body code, so HTTP is the diagnosis');
    assert.deepEqual(snapshot.meta.attempts, ['HTTP 401', 'HTTP 401']);
    assertNoSecret(snapshot);
  });

  it('maps a 404 resource error to upstream-error', async () => {
    const notFound = { json: fixture('kimi-not-found.json'), status: 404 };
    const { snapshot } = await run('kimi', { routes: { [KIMI_CN_URL]: notFound, [KIMI_INTL_URL]: notFound }, secrets: key });
    assert.equal(snapshot.status, 'upstream-error');
    assert.equal(snapshot.code, 'HTTP 404');
  });

  it('maps 429, non-JSON and transport failures', async () => {
    const cases = [
      [{ json: { error: 'slow' }, status: 429 }, 'rate-limited', 'HTTP 429'],
      [{ json: undefined, status: 200, text: '<html>oops</html>' }, 'invalid-response', 'E_NOT_JSON'],
      [{ json: undefined, status: null, error: { name: 'TimeoutError', message: 'too slow' } }, 'network-error', 'TimeoutError'],
      [{ json: undefined, status: null, aborted: true, error: { name: 'AbortError', message: 'x' } }, 'network-error', 'ABORTED'],
    ];
    for (const [result, status, code] of cases) {
      const { snapshot } = await run('kimi', { routes: { [KIMI_CN_URL]: result, [KIMI_INTL_URL]: result }, secrets: key });
      assert.equal(snapshot.status, status);
      assert.equal(snapshot.code, code);
      assertNoSecret(snapshot);
    }
  });

  it('never reports ok on a guess: a 2xx without windows is invalid-response', async () => {
    const body = { hello: 'world' };
    const { snapshot } = await run('kimi', { routes: { [KIMI_CN_URL]: ok200(body), [KIMI_INTL_URL]: ok200(body) }, secrets: key });
    assert.equal(snapshot.status, 'invalid-response');
    assert.equal(snapshot.windows.length, 0);
    assert.equal(snapshot.meta.rawSnippet, JSON.stringify(body));
  });

  it('does not treat the disabled booster wallet as money', async () => {
    const { snapshot } = await run('kimi', { routes, secrets: key });
    assert.deepEqual(snapshot.balances, []);
    assert.equal(snapshot.meta.booster, 'disabled');
  });

  it('maps TIME_UNIT_WEEK and never assumes an unknown unit is minutes', async () => {
    const weekly = { usages: { limit_7d: { used_ratio: 0.5, reset_time: '2026-10-16T08:11:56Z' } } };
    const mapped = await run('kimi', { routes: { [KIMI_CN_URL]: ok200(weekly) }, secrets: key });
    assert.equal(mapped.snapshot.windows[0].id, 'kimi.weekly');
    assert.equal(mapped.snapshot.windows[0].percent, 50);

    const fortnight = {
      limits: [{ window: { duration: 30, timeUnit: 'TIME_UNIT_FORTNIGHT' }, detail: { limit: 10, used: 2, remaining: 8 } }],
    };
    const unknown = await run('kimi', { routes: { [KIMI_CN_URL]: ok200(fortnight) }, secrets: key });
    assert.equal(unknown.snapshot.windows[0].id, 'kimi.window.30fortnight');
    assert.equal(unknown.snapshot.windows[0].unit, 'TIME_UNIT_FORTNIGHT');
    assert.equal(unknown.snapshot.windows[0].percent, 20);

    const week = {
      limits: [{ window: { duration: 1, timeUnit: 'TIME_UNIT_WEEK' }, detail: { limit: 10, used: 1, remaining: 9 } }],
    };
    const weekRun = await run('kimi', { routes: { [KIMI_CN_URL]: ok200(week) }, secrets: key });
    assert.equal(weekRun.snapshot.windows[0].id, 'kimi.weekly');
  });

  it('falls back to used/limit when the usages block is absent', async () => {
    const body = { usage: { limit: '200', used: '50', remaining: '150', resetTime: '2026-10-16T08:11:56.034265Z' } };
    const { snapshot } = await run('kimi', { routes: { [KIMI_CN_URL]: ok200(body) }, secrets: key });
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.windows.length, 1);
    assert.equal(snapshot.windows[0].id, 'kimi.weekly');
    assert.equal(snapshot.windows[0].limit, 200);
    assert.equal(snapshot.windows[0].used, 50);
    assert.equal(snapshot.windows[0].percent, 25);
  });

  it('reports not-configured without any upstream call', async () => {
    const { snapshot, fetch } = await run('kimi', { routes, secrets: {} });
    assert.equal(snapshot.status, 'not-configured');
    assert.match(snapshot.message, /KIMI_CODING_API_KEY/);
    assert.equal(fetch.calls.length, 0);
  });

  it('aborts before starting when the signal is already aborted', async () => {
    const { snapshot, fetch } = await run('kimi', { routes, secrets: key, signal: AbortSignal.abort() });
    assert.equal(snapshot.status, 'network-error');
    assert.equal(snapshot.code, 'ABORTED');
    assert.equal(fetch.calls.length, 0);
  });

  it('is total when the transport throws', async () => {
    const { snapshot } = await run('kimi', { routes: { [KIMI_CN_URL]: { throw: new Error('boom') } }, secrets: key });
    assert.equal(snapshot.status, 'upstream-error');
    assert.equal(snapshot.code, 'E_INTERNAL');
  });
});
