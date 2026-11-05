/**
 * Tests for the model-facing `usage_query` tool.
 *
 * Everything here is offline: the snapshot service is either a hand-written
 * stub or a real `SnapshotService` over swapped-in adapters, so no credential,
 * no network and no DSH runtime is involved. The two contracts worth pinning
 * are:
 *
 * - **The projection.** What the model receives is a deliberate, bounded view
 *   of the snapshot — never the raw envelope, never a secret, never a `null`
 *   the model would have to interpret.
 * - **The wiring.** The tool is mounted only when a Tool registry is composed
 *   and `enableTool` is on, and a failed registration never takes the panel
 *   down with it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TOOL_NAME,
  TOOL_TIMEOUT_MS,
  createUsageQueryTool,
  formatUsage,
  parseArguments,
  projectUsage,
  windowLabel,
} from '../src/host/tool.js';
import { SnapshotService } from '../src/host/snapshot.js';
import {
  PROVIDER_IDS,
  makeBalance,
  makeDailyUsage,
  makeProvider,
  makeSnapshot,
  makeWindow,
} from '../src/shared/protocol.js';
import { Config, apply, normalizeConfig } from '../lib/index.js';

/** A fixed instant: 2026-11-05 21:30 Beijing (13:30 UTC). */
const NOW = Date.parse('2026-11-05T13:30:00.000Z');

/** Trailing daily costs ending 2026-11-05; 10 elapsed days. */
const DAILY_POINTS = [
  { date: '2026-10-27', cost: 1.0 },
  { date: '2026-10-28', cost: 2.0 },
  { date: '2026-10-29', cost: 0 },
  { date: '2026-10-30', cost: 0 },
  { date: '2026-10-31', cost: 3.5 },
  { date: '2026-11-01', cost: 0 },
  { date: '2026-11-02', cost: 0 },
  { date: '2026-11-03', cost: 0 },
  { date: '2026-11-04', cost: 0 },
  { date: '2026-11-05', cost: 4.0 },
];

/** DeepSeek's peak/off-peak schedule as the adapter ships it. */
const PRICING = {
  phase: 'offpeak',
  asOf: NOW,
  utcOffsetMinutes: 480,
  offPeakMultiplier: 0.5,
  holidayCalendar: { source: 'chinese-days', through: 2026, coversHorizon: true },
  transitions: [
    { at: NOW - 3_600_000, phase: 'offpeak' },
    { at: NOW + 3_600_000, phase: 'peak' },
  ],
};

/**
 * Four rows shaped like real adapter output, one failing on purpose.
 * @param {{ allOk?: boolean }} [options]
 * @returns {object[]}
 */
function fixtureRows(options = {}) {
  return [
    makeProvider({
      id: 'deepseek',
      label: 'DeepSeek',
      status: 'ok',
      fetchedAt: NOW - 12_000,
      balances: [makeBalance({ currency: 'CNY', available: 33.65288794, bonus: 0, totalSpent: 120.4 })],
      meta: {
        host: 'platform.deepseek.com',
        rawSnippet: 'sensitive upstream body',
        pricing: PRICING,
        dailyUsage: makeDailyUsage({ currency: 'CNY', days: DAILY_POINTS.length, points: DAILY_POINTS }),
      },
    }),
    makeProvider({
      id: 'glm',
      label: 'GLM Coding Plan',
      status: 'ok',
      plan: 'GLM Coding Lite',
      fetchedAt: NOW - 1_000,
      windows: [
        makeWindow({ id: 'glm.5h', unit: 3, limit: 2000, used: 656, remaining: 1343, percent: 32, resetAt: NOW + 7_800_000 }),
        makeWindow({ id: 'glm.weekly', unit: 6, limit: 10_000, used: 5831, remaining: 4168, percent: 58, resetAt: NOW + 3 * 86_400_000 }),
      ],
    }),
    makeProvider({
      id: 'kimi',
      label: 'Kimi Code',
      status: options.allOk === true ? 'ok' : 'unauthorized',
      message: options.allOk === true ? null : 'The Kimi Code credential was rejected.',
      code: options.allOk === true ? null : 'HTTP 401',
      fetchedAt: NOW - 5_000,
      windows: options.allOk === true
        ? [makeWindow({ id: 'kimi.5h', limit: 100, used: 35, remaining: 65, percent: 35, resetAt: NOW + 1_800_000 })]
        : [],
    }),
    makeProvider({
      id: 'opencode-go',
      label: 'OpenCode Go',
      status: 'ok',
      fetchedAt: NOW - 3_000,
      windows: [
        // This provider reports percentages only; the projection must not
        // invent `used`/`limit` pairs for it.
        makeWindow({ id: 'opencode-go.5h', unit: '5h', percent: 66.6, resetAt: NOW + 1_800_000 }),
      ],
    }),
  ];
}

/**
 * A stand-in `SnapshotService` that records which read the tool chose and
 * answers deterministic envelopes.
 * @param {object[]} rows
 * @param {{ generatedAt?: number, ttlMs?: number, stale?: boolean, refreshing?: boolean }} [flags]
 */
function makeService(rows, flags = {}) {
  const calls = [];
  const envelope = (providers) => makeSnapshot({
    generatedAt: flags.generatedAt ?? NOW,
    ttlMs: flags.ttlMs ?? 60_000,
    stale: flags.stale,
    refreshing: flags.refreshing,
    providers,
  });
  return {
    calls,
    providerIds: PROVIDER_IDS.slice(),
    ttlMs: flags.ttlMs ?? 60_000,
    async getServing() {
      calls.push({ kind: 'getServing' });
      return envelope(rows);
    },
    async get(options = {}) {
      calls.push({ kind: 'get', force: options.force === true });
      return envelope(rows);
    },
    async getProvider(id, options = {}) {
      calls.push({ kind: 'getProvider', id, force: options.force === true });
      return envelope(rows.filter((row) => row.id === id));
    },
  };
}

/**
 * Walk a value against the tool's declared JSON schema. This is a subset
 * validator on purpose: it covers exactly the keywords the schema uses, so a
 * drift between `output.schema` and the projection fails loudly.
 * @param {unknown} value
 * @param {object} schema
 * @param {string} path
 */
function assertMatchesSchema(value, schema, path) {
  if (Array.isArray(schema.enum)) {
    assert.ok(schema.enum.includes(value), `${path}: ${JSON.stringify(value)} is not in the enum`);
  }
  switch (schema.type) {
    case 'object': {
      assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`);
      const properties = schema.properties ?? {};
      const required = schema.required ?? [];
      for (const key of required) assert.ok(Object.hasOwn(value, key), `${path}.${key} is required`);
      for (const [key, child] of Object.entries(properties)) {
        if (Object.hasOwn(value, key)) assertMatchesSchema(value[key], child, `${path}.${key}`);
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          assert.ok(Object.hasOwn(properties, key), `${path}.${key} is not declared by the output schema`);
        }
      }
      break;
    }
    case 'array': {
      assert.ok(Array.isArray(value), `${path} must be an array`);
      value.forEach((entry, index) => assertMatchesSchema(entry, schema.items, `${path}[${index}]`));
      break;
    }
    case 'string':
      assert.equal(typeof value, 'string', `${path} must be a string`);
      break;
    case 'number':
      assert.equal(typeof value, 'number', `${path} must be a number`);
      assert.ok(Number.isFinite(value), `${path} must be finite`);
      break;
    case 'integer':
      assert.ok(Number.isInteger(value), `${path} must be an integer`);
      break;
    case 'boolean':
      assert.equal(typeof value, 'boolean', `${path} must be a boolean`);
      break;
    default:
      assert.fail(`${path}: unhandled schema type ${String(schema.type)}`);
  }
}

/* ----------------------------------------------------------------- contract */

test('the tool advertises a discoverable contract with optional arguments', () => {
  const tool = createUsageQueryTool({ snapshots: makeService(fixtureRows()) });

  assert.equal(tool.name, TOOL_NAME);
  assert.equal(tool.name, 'usage_query');
  assert.equal(typeof tool.description, 'string');
  assert.ok(tool.description.length > 80, 'the description must say what the tool returns and when to use it');
  assert.match(tool.description, /quota/i);

  assert.equal(tool.parameters.type, 'object');
  assert.equal(tool.parameters.additionalProperties, false);
  assert.equal(tool.parameters.required, undefined, 'every parameter is optional');
  assert.deepEqual(tool.parameters.properties.provider.enum, PROVIDER_IDS);
  assert.equal(tool.parameters.properties.refresh.type, 'boolean');
  assert.equal(tool.parameters.properties.days.type, 'integer');
  assert.equal(tool.parameters.properties.days.minimum, 1);
  assert.equal(tool.parameters.properties.days.maximum, 31);
  for (const [key, parameter] of Object.entries(tool.parameters.properties)) {
    assert.equal(typeof parameter.description, 'string', `${key} needs a model-facing description`);
  }

  assert.equal(typeof tool.execute, 'function');
  assert.equal(typeof tool.output.render, 'function');
  assert.equal(tool.output.schema.type, 'object');
  assert.equal(tool.timeoutMs, TOOL_TIMEOUT_MS);
  assert.ok(tool.timeoutMs > 12_000, 'the tool must outlive one provider deadline');
  assert.equal(tool.isConcurrencySafe(), true);
});

test('the projected value matches the declared output schema', async () => {
  const tool = createUsageQueryTool({ snapshots: makeService(fixtureRows()), now: () => NOW });
  const value = await tool.execute({ days: 30 });
  assertMatchesSchema(value, tool.output.schema, 'value');
});

/* -------------------------------------------------------------- read routing */

test('an unfiltered call serves every provider without forcing upstream', async () => {
  const service = makeService(fixtureRows());
  const tool = createUsageQueryTool({ snapshots: service, now: () => NOW });
  const value = await tool.execute({});

  assert.deepEqual(service.calls, [{ kind: 'getServing' }], 'the serving read is what keeps a slow provider from blocking the call');
  assert.deepEqual(value.providers.map((row) => row.id), PROVIDER_IDS);
  assert.equal(value.ok, false, 'one rejected provider degrades the aggregate flag, not the call');
  assert.equal(value.ageSeconds, 12, 'the age is the oldest row, not the newest');
  assert.equal(value.ttlMs, 60_000);
});

test('a provider filter reads exactly that provider, unforced', async () => {
  const service = makeService(fixtureRows());
  const tool = createUsageQueryTool({ snapshots: service, now: () => NOW });
  const value = await tool.execute({ provider: 'glm' });

  assert.deepEqual(service.calls, [{ kind: 'getProvider', id: 'glm', force: false }]);
  assert.equal(value.providers.length, 1);
  assert.equal(value.providers[0].id, 'glm');
});

test('refresh forces a fresh read on both paths', async () => {
  const service = makeService(fixtureRows());
  const tool = createUsageQueryTool({ snapshots: service, now: () => NOW });

  await tool.execute({ provider: 'kimi', refresh: true });
  await tool.execute({ refresh: true });

  assert.deepEqual(service.calls, [
    { kind: 'getProvider', id: 'kimi', force: true },
    { kind: 'get', force: true },
  ]);
});

test('invalid arguments fail the call without reading upstream', async () => {
  const service = makeService(fixtureRows());
  const tool = createUsageQueryTool({ snapshots: service, now: () => NOW });

  await assert.rejects(
    () => tool.execute({ provider: 'nope' }),
    /Unknown usage provider "nope"\. Known providers: deepseek, glm, kimi, opencode-go\./,
  );
  await assert.rejects(() => tool.execute({ provider: 3 }), /Unknown usage provider 3/);
  await assert.rejects(() => tool.execute({ days: 0 }), /days must be an integer from 1 to 31\./);
  await assert.rejects(() => tool.execute({ days: 32 }), /days must be an integer from 1 to 31\./);
  await assert.rejects(() => tool.execute({ days: 2.5 }), /days must be an integer from 1 to 31\./);
  await assert.rejects(() => tool.execute({ refresh: 'yes' }), /refresh must be a boolean\./);

  assert.deepEqual(service.calls, [], 'a bad argument must not cost an upstream read');
  assert.deepEqual(parseArguments(undefined, PROVIDER_IDS), { provider: null, refresh: false, days: null });
});

/* ------------------------------------------------------------------- rows */

test('a provider failure is data, not a failed tool call', async () => {
  const tool = createUsageQueryTool({ snapshots: makeService(fixtureRows()), now: () => NOW });
  const value = await tool.execute({ provider: 'kimi' });

  const row = value.providers[0];
  assert.equal(row.status, 'unauthorized');
  assert.equal(row.message, 'The Kimi Code credential was rejected.');
  assert.equal(row.code, 'HTTP 401');

  const text = formatUsage(value, { now: NOW });
  assert.match(text, /Kimi Code \(unauthorized\)/);
  assert.match(text, /The Kimi Code credential was rejected\./);
  assert.match(text, /Code: HTTP 401/);
});

test('the projection never leaks secrets, raw metadata or nulls', () => {
  const envelope = makeSnapshot({
    generatedAt: NOW,
    ttlMs: 60_000,
    providers: [fixtureRows()[0]],
  });
  const value = projectUsage(envelope, { days: 7, now: NOW });
  const json = JSON.stringify(value);

  for (const forbidden of ['account', '"meta"', 'rawSnippet', 'messageKey', 'sensitive upstream body', 'platform.deepseek.com']) {
    assert.equal(json.includes(forbidden), false, `the projection must not carry ${forbidden}`);
  }
  assert.ok(!/:\s*null/.test(json), 'unavailable fields are omitted, never sent as null');
  assert.ok(!json.includes('undefined'));
  // The whitelist is what keeps credentials out by construction: a provider row
  // can only contribute these keys.
  assert.deepEqual(Object.keys(value.providers[0]).sort(), [
    'balances', 'billing', 'fetchedAt', 'id', 'label', 'spend', 'status', 'windows',
  ]);
});

test('windows keep the derived percentage and never invent used/limit pairs', () => {
  const value = projectUsage(makeSnapshot({ ttlMs: 60_000, providers: fixtureRows() }), { now: NOW });
  const glm = value.providers.find((row) => row.id === 'glm');
  const fiveHour = glm.windows.find((window) => window.id === 'glm.5h');
  assert.equal(fiveHour.percent, 32.8, 'used / limit wins over the provider-declared 32');
  assert.equal(fiveHour.label, '5-hour window');
  assert.equal(fiveHour.unit, '3');

  const opencode = value.providers.find((row) => row.id === 'opencode-go');
  const percentOnly = opencode.windows[0];
  assert.equal(percentOnly.percent, 66.6);
  assert.equal('used' in percentOnly, false);
  assert.equal('limit' in percentOnly, false);
});

test('window labels come from stable ids, with the id as the fallback', () => {
  assert.equal(windowLabel('glm.5h'), '5-hour window');
  assert.equal(windowLabel('kimi.weekly'), 'Weekly window');
  assert.equal(windowLabel('opencode-go.monthly'), 'Monthly window');
  assert.equal(windowLabel('kimi.3d'), '3-day window');
  assert.equal(windowLabel('kimi.90m'), '90-minute window');
  assert.equal(windowLabel('kimi.window'), 'Usage window');
  assert.equal(windowLabel('glm.unit.3'), 'glm.unit.3', 'an unknown window type is reported verbatim, not guessed');
  assert.equal(windowLabel(''), 'Usage window');
});

/* ------------------------------------------------------------------- spend */

test('the spend projection totals only the requested trailing days', async () => {
  const tool = createUsageQueryTool({ snapshots: makeService(fixtureRows()), now: () => NOW });

  const seven = (await tool.execute({ provider: 'deepseek', days: 7 })).providers[0].spend;
  assert.equal(seven.days, 7);
  assert.equal(seven.points.length, 7);
  assert.deepEqual(seven.points.map((point) => point.date), [
    '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
  ]);
  assert.equal(seven.total, 7.5);
  assert.equal(seven.complete, true);

  const three = (await tool.execute({ provider: 'deepseek', days: 3 })).providers[0].spend;
  assert.equal(three.points.length, 3);
  assert.equal(three.total, 4);

  const longerThanHistory = (await tool.execute({ provider: 'deepseek', days: 31 })).providers[0].spend;
  assert.equal(longerThanHistory.points.length, 10);
  assert.equal(longerThanHistory.complete, false, 'a short series must say so instead of implying zero-cost days');
});

test('spend stays out of the payload unless days was requested', async () => {
  const tool = createUsageQueryTool({ snapshots: makeService(fixtureRows()), now: () => NOW });
  const value = await tool.execute({ provider: 'deepseek' });
  assert.equal('spend' in value.providers[0], false);

  const withoutHistory = await tool.execute({ provider: 'glm', days: 7 });
  assert.equal('spend' in withoutHistory.providers[0], false, 'providers with no history simply omit spend');
});

/* ----------------------------------------------------------------- billing */

test('billing is recomputed from transitions at call time', async () => {
  const envelope = makeSnapshot({ generatedAt: NOW, ttlMs: 60_000, providers: [fixtureRows()[0]] });

  const now = projectUsage(envelope, { now: NOW });
  assert.deepEqual(now.providers[0].billing, {
    phase: 'offpeak',
    offPeakMultiplier: 0.5,
    nextChangeAt: NOW + 3_600_000,
    nextPhase: 'peak',
  });

  // The same cached snapshot, evaluated after the phase boundary, must flip.
  const later = projectUsage(envelope, { now: NOW + 2 * 3_600_000 });
  assert.equal(later.providers[0].billing.phase, 'peak');
  assert.equal('nextChangeAt' in later.providers[0].billing, false, 'no later transition exists in the horizon');

  const text = formatUsage(now, { now: NOW });
  assert.match(text, /Billing: off-peak now \(0\.5× peak price\); peak starts 2026-11-05 22:30 Beijing time \(UTC\+8, in 1h\)/);
});

/* ------------------------------------------------------------------ render */

test('the rendered text covers every provider, window and reset instant', () => {
  const value = projectUsage(
    makeSnapshot({ generatedAt: NOW, ttlMs: 60_000, providers: fixtureRows(), refreshing: true }),
    { days: 7, now: NOW },
  );
  const text = formatUsage(value, { now: NOW });

  assert.match(text, /^Usage board — 4 services · oldest number 12s old · cache 60s · refreshing in the background$/m);
  assert.match(text, /DeepSeek \(ok\)/);
  assert.match(text, /Balance: CNY 33\.65 available; bonus 0\.00; lifetime spend 120\.40/);
  assert.match(text, /GLM Coding Plan \(ok, plan: GLM Coding Lite\)/);
  assert.match(text, /5-hour window: 656 \/ 2000 used \(32\.8%\) · 1343 remaining · resets in 2h 10m \(2026-11-05T15:40:00\.000Z\)/);
  assert.match(text, /OpenCode Go \(ok\)/);
  assert.match(text, /5-hour window: 66\.6% used · resets in 30m/);
  assert.match(text, /Kimi Code \(unauthorized\)/);
  assert.match(text, /Spend: CNY 7\.50 over the last 7 days/);
  assert.match(text, /not the provider's bill/);

  assert.ok(!text.includes('undefined'));
  assert.ok(!/\bnull\b/.test(text));
  assert.ok(!text.includes('glm.weekly'), 'raw window ids must not leak into prose');
  assert.ok(text.length < 4_000, `the rendered text must stay bounded (got ${text.length})`);
});

test('a service with no numbers renders one honest sentence', () => {
  const value = projectUsage(
    makeSnapshot({ generatedAt: NOW, ttlMs: 60_000, providers: [makeProvider({ id: 'glm', label: 'GLM Coding Plan', status: 'ok' })] }),
    { now: NOW },
  );
  const text = formatUsage(value, { now: NOW });
  assert.match(text, /This service reports neither balances nor quota windows\./);
});

test('an empty board renders an explicit empty state', () => {
  const value = projectUsage(makeSnapshot({ generatedAt: NOW, ttlMs: 60_000, providers: [] }), { now: NOW });
  assert.equal(value.ok, false);
  const text = formatUsage(value, { now: NOW });
  assert.match(text, /No metered services are registered\./);
});

/* ------------------------------------------------------------------- card */

test('the call card names the selected service and echoes the filters', () => {
  const tool = createUsageQueryTool({ snapshots: makeService(fixtureRows()) });
  assert.deepEqual(tool.presentCall({ provider: 'glm', refresh: true, days: 7 }), {
    card: 'generic',
    title: 'GLM Coding Plan · usage',
    kind: 'read',
    rawInput: { provider: 'glm', refresh: true, days: 7 },
  });
  // An unknown id can reach presentation before execution rejects it; the card
  // must not print `undefined`.
  assert.equal(tool.presentCall({ provider: 'nope' }).title, 'nope · usage');
  assert.deepEqual(tool.presentCall({}), {
    card: 'generic',
    title: 'All services · usage',
    kind: 'read',
    rawInput: {},
  });
});

/* ----------------------------------------------------------- cache sharing */

/**
 * Run `fn` with the module-level PROVIDERS list replaced.
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

test('the tool and the panel share one snapshot cache', async () => {
  const { PROVIDERS } = await import('../src/host/providers/index.js');
  let reads = 0;
  const adapter = {
    id: 'glm',
    label: 'Stub GLM',
    credentialRefs: [],
    async read({ now }) {
      reads += 1;
      return makeProvider({ id: 'glm', label: 'Stub GLM', status: 'ok', fetchedAt: now() });
    },
  };
  assert.ok(Array.isArray(PROVIDERS), 'the registry is the module-level list the service reads');

  await withProviders([adapter], async () => {
    let clock = 1_000_000;
    const service = new SnapshotService({ getSecret: async () => undefined, ttlMs: 60_000, now: () => clock });
    const tool = createUsageQueryTool({ snapshots: service, now: () => clock });

    const first = await tool.execute({ provider: 'glm' });
    assert.equal(reads, 1);
    assert.equal(first.providers[0].status, 'ok');

    clock += 30_000;
    await tool.execute({ provider: 'glm' });
    assert.equal(reads, 1, 'inside the ttl the tool is served from the shared cache');

    await service.getProvider('glm');
    assert.equal(reads, 1, "the panel's read sees the same cached row");

    await tool.execute({ provider: 'glm', refresh: true });
    assert.equal(reads, 2, 'refresh really goes upstream');
  });
});

/* ------------------------------------------------------------------ wiring */

/**
 * Fake DSH context carrying only the services `apply()` touches.
 * @param {{ tools?: boolean, failToolRegister?: boolean }} [options]
 */
function makeFakeContext(options = {}) {
  /** @type {Function[]} */
  const disposers = [];
  const registered = [];
  const removed = [];
  /** @type {object[]} */
  const routes = [];
  const toolService = {
    register(definition) {
      if (options.failToolRegister === true) throw new Error('duplicate tool name');
      registered.push(definition);
      return () => removed.push(definition.name);
    },
  };
  const child = {
    tools: toolService,
    effect(fn) {
      disposers.push(fn());
    },
  };
  const ctx = {
    logger: { info() {} },
    webServer: {
      register(spec) {
        routes.push(spec);
        return () => {
          const index = routes.indexOf(spec);
          if (index >= 0) routes.splice(index, 1);
        };
      },
    },
    get() {
      return undefined;
    },
    effect(fn) {
      disposers.push(fn());
    },
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ['tools']);
      if (options.tools !== false) callback(child);
    },
  };
  return { ctx, disposers, registered, removed, routes };
}

test('apply registers usage_query and unregisters it on unload', () => {
  const fake = makeFakeContext();
  apply(fake.ctx, {});

  assert.equal(fake.registered.length, 1);
  assert.equal(fake.registered[0].name, 'usage_query');
  assert.ok(fake.routes.length >= 5, 'the HTTP surface is still registered');

  for (const dispose of fake.disposers.reverse()) dispose();
  assert.deepEqual(fake.removed, ['usage_query']);
});

test('the registered tool answers end to end when no credential is configured', async () => {
  const fake = makeFakeContext();
  apply(fake.ctx, {});
  const tool = fake.registered[0];

  // The fake context has no credential service, so every adapter short-circuits
  // to `not-configured` without touching the network — exactly what a fresh
  // install looks like.
  const value = await tool.execute({});
  assert.equal(value.providers.length, 4);
  assert.deepEqual(value.providers.map((row) => row.id), PROVIDER_IDS);
  for (const row of value.providers) {
    assert.equal(row.status, 'not-configured');
    assert.equal(typeof row.message, 'string');
  }
  assert.equal(value.ok, false);

  const [block] = tool.output.render({}, value);
  assert.equal(block.type, 'text');
  assert.match(block.text, /GLM Coding Plan \(not-configured\)/);
  assert.match(block.text, /Sign in to DeepSeek Platform to store the/);
});

test('enableTool:false keeps the plugin strictly visual', () => {
  const fake = makeFakeContext();
  apply(fake.ctx, { enableTool: false });
  assert.deepEqual(fake.registered, []);
  assert.ok(fake.routes.length >= 5);
});

test('a missing Tool registry or a failed registration never breaks the panel', () => {
  const noRegistry = makeFakeContext({ tools: false });
  assert.doesNotThrow(() => apply(noRegistry.ctx, {}));
  assert.deepEqual(noRegistry.registered, []);
  assert.ok(noRegistry.routes.length >= 5);

  const failing = makeFakeContext({ failToolRegister: true });
  assert.doesNotThrow(() => apply(failing.ctx, {}));
  assert.deepEqual(failing.registered, []);
  assert.ok(failing.routes.length >= 5);
});

test('enableTool defaults to on and is validated as a boolean', () => {
  assert.equal(normalizeConfig({}).enableTool, true);
  assert.equal(normalizeConfig({ enableTool: false }).enableTool, false);

  const accepted = Config['~standard'].validate({ enableTool: false });
  assert.equal(accepted.value.enableTool, false);

  const rejected = Config['~standard'].validate({ enableTool: 'yes' });
  assert.ok(Array.isArray(rejected.issues), 'a non-boolean must be reported as a config issue');
  assert.match(rejected.issues[0].message, /enableTool must be a boolean/);
});
