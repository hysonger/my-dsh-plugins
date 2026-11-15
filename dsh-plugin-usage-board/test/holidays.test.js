/**
 * Tests for the third-party holiday calendar bridge.
 *
 * Two layers:
 *
 * 1. **Loader contract** — stubbed importers prove that a missing, broken or
 *    malformed package degrades to `null` (the schedule then falls back to the
 *    weekday rule and says so) instead of failing a snapshot, and that the
 *    import happens exactly once per process.
 * 2. **Real data** — the installed `chinese-days` package is checked against
 *    the official 2026 State Council arrangement, including the make-up
 *    workdays (调休). This is what makes "stable holiday determination" a
 *    tested claim rather than a hope: if a dependency bump changes the data or
 *    the API shape, this suite says so.
 *
 * The real-data block is skipped (with a message) on a checkout where
 * `node_modules` has not been installed yet, so `node --test test/` on a fresh
 * clone still passes the offline policy tests.
 *
 * @module dsh-plugin-usage-board/test/holidays
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  HOLIDAY_CALENDAR_PACKAGE,
  createHolidayCalendarLoader,
  loadHolidayCalendar,
} from '../src/host/holiday-calendar.js';
import { createPricingSnapshot, phaseAt } from '../src/host/pricing.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLED = fs.existsSync(path.join(ROOT, 'node_modules', HOLIDAY_CALENDAR_PACKAGE, 'package.json'));
const installedSkip = INSTALLED ? false : `run \`npm install\` first (no node_modules/${HOLIDAY_CALENDAR_PACKAGE})`;

/** A Beijing wall-clock instant as epoch ms. */
const bj = (iso) => Date.parse(`${iso}+08:00`);

/** Beijing wall clock of an epoch instant. */
const bjClock = (epochMs) => new Date(epochMs + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

/** A fake `chinese-days` package object with the two calls the bridge makes. */
function fakePackage(overrides = {}) {
  return {
    getDayDetail(date) {
      return { date, work: !date.startsWith('2026-10-01'), name: 'fake' };
    },
    getHolidaysInRange() {
      return ['2026-01-01'];
    },
    ...overrides,
  };
}

test('a missing package degrades to no calendar instead of throwing', async () => {
  let imports = 0;
  const load = createHolidayCalendarLoader(async () => {
    imports += 1;
    throw new Error('ERR_MODULE_NOT_FOUND');
  });
  assert.equal(await load(), null);
  assert.equal(await load(), null, 'the failure is cached too');
  assert.equal(imports, 1, 'a missing package must not be retried on every snapshot');
});

test('a package with an unexpected shape is treated as missing', async () => {
  for (const module of [null, {}, { default: {} }, { default: { getDayDetail: () => ({}) } }, 42]) {
    const load = createHolidayCalendarLoader(async () => module);
    assert.equal(await load(), null, `accepted an unusable module: ${JSON.stringify(module)}`);
  }
});

test('the bridge exposes only what the policy needs and never guesses', async () => {
  const module = { default: fakePackage() };
  const calendar = await createHolidayCalendarLoader(async () => module)();
  assert.ok(calendar !== null);
  assert.equal(calendar.source, HOLIDAY_CALENDAR_PACKAGE);
  assert.equal(calendar.isWorkday('2026-10-08'), true);
  assert.equal(calendar.isWorkday('2026-10-01'), false);
  assert.equal(calendar.coversYear(2026), true);

  // A package regression that throws or returns a detail without `work` is
  // "cannot tell", not "holiday" — the policy then keeps the weekday rule.
  const throwing = await createHolidayCalendarLoader(async () => ({
    ...fakePackage(),
    getDayDetail() {
      throw new Error('bad input');
    },
  }))();
  assert.equal(throwing.isWorkday('2026-10-08'), null);
  const shapeless = await createHolidayCalendarLoader(async () => ({
    ...fakePackage(),
    getDayDetail: () => ({ work: 'yes' }),
  }))();
  assert.equal(shapeless.isWorkday('2026-10-08'), null);

  // Coverage asks for announced holidays only (third argument `false`), so a
  // year with no announcement reports "not covered".
  const seen = [];
  const covering = await createHolidayCalendarLoader(async () => ({
    ...fakePackage(),
    getHolidaysInRange(...args) {
      seen.push(args);
      return args[2] === false && String(args[0]).startsWith('2026') ? ['2026-01-01'] : [];
    },
  }))();
  assert.equal(covering.coversYear(2026), true);
  assert.equal(covering.coversYear(2027), false);
  assert.deepEqual(seen[0], ['2026-01-01', '2026-12-31', false]);
});

test('the shared loader imports the package once per process', async () => {
  const first = loadHolidayCalendar();
  const second = loadHolidayCalendar();
  assert.equal(first, second, 'the loader must return the same promise');
  assert.equal(await first, await second);
});

test('the installed package carries the official 2026 arrangement', { skip: installedSkip }, async () => {
  const calendar = await loadHolidayCalendar();
  assert.ok(calendar !== null, 'chinese-days is installed but did not load');
  assert.equal(calendar.source, 'chinese-days');
  assert.equal(calendar.coversYear(2026), true, '2026 data must be present');
  // Deliberate contract: when the dependency updates for a new year this
  // assertion is what reminds the author to re-verify and bump the pin.
  assert.equal(calendar.coversYear(2027), false, '2027 data should not be assumed; update the pin deliberately');

  // Every weekday day off from the State Council notice (国办发明电〔2025〕7号).
  const weekdayHolidays2026 = [
    '2026-01-01', '2026-01-02',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
    '2026-04-06',
    '2026-05-01', '2026-05-04', '2026-05-05',
    '2026-06-19',
    '2026-09-25',
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
  ];
  assert.equal(weekdayHolidays2026.length, 19);
  for (const date of weekdayHolidays2026) {
    assert.equal(calendar.isWorkday(date), false, `${date} must be a holiday`);
  }
  // Ordinary workdays around the National Day break.
  for (const date of ['2026-10-08', '2026-10-09', '2026-10-12', '2026-10-16']) {
    assert.equal(calendar.isWorkday(date), true, `${date} must be a workday`);
  }
  // Make-up workdays (调休) are workdays to the calendar — the billing rule
  // ignores them anyway because they fall on a weekend.
  for (const date of ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']) {
    assert.equal(calendar.isWorkday(date), true, `${date} must be a make-up workday`);
  }
  // Plain weekends.
  assert.equal(calendar.isWorkday('2026-10-17'), false);
  assert.equal(calendar.isWorkday('2026-10-18'), false);
});

test('the real calendar drives the billing phase across the National Day break', { skip: installedSkip }, async () => {
  const calendar = await loadHolidayCalendar();
  const isWorkday = (dateKey) => calendar.isWorkday(dateKey);

  // Thursday 1 October 2026 (National Day) at 10:00 should be off-peak…
  assert.equal(phaseAt(bj('2026-10-01T10:00:00'), isWorkday), 'offpeak');
  // …and the first day back, Thursday 8 October, peak again.
  assert.equal(phaseAt(bj('2026-10-08T10:00:00'), isWorkday), 'peak');
  // Spring Festival weekday.
  assert.equal(phaseAt(bj('2026-02-17T10:00:00'), isWorkday), 'offpeak');
  // A make-up Saturday stays off-peak: the rule keys on Monday–Friday.
  assert.equal(phaseAt(bj('2026-10-10T10:00:00'), isWorkday), 'offpeak');
  // An ordinary Monday is peak inside the window.
  assert.equal(phaseAt(bj('2026-10-19T10:00:00'), isWorkday), 'peak');

  // The schedule collapses the whole 7-day break into one transition.
  const snapshot = createPricingSnapshot(bj('2026-09-30T18:30:00'), calendar);
  assert.deepEqual(snapshot.holidayCalendar, { source: 'chinese-days', through: 2026, coversHorizon: true });
  assert.equal(bjClock(snapshot.transitions[0].at), '2026-10-08 09:00:00');
});

test('the policy is independent of the host timezone', { skip: installedSkip }, () => {
  // The rule is defined in Beijing time; a server in UTC, New York or
  // Kiritimati must still produce the same phase for the same instant. Each
  // probe runs in its own process because Node reads TZ at startup.
  const script = [
    "import { createPricingSnapshot, phaseAt } from './src/host/pricing.js';",
    "import { loadHolidayCalendar } from './src/host/holiday-calendar.js';",
    'const calendar = await loadHolidayCalendar();',
    'const isWorkday = (key) => calendar.isWorkday(key);',
    'console.log(JSON.stringify({',
    "  peakMonday: phaseAt(Date.parse('2026-10-19T02:00:00Z'), isWorkday),",
    "  holiday: phaseAt(Date.parse('2026-10-01T02:00:00Z'), isWorkday),",
    "  sunday: phaseAt(Date.parse('2026-10-18T02:00:00Z'), isWorkday),",
    "  snapshot: createPricingSnapshot(Date.parse('2026-10-14T07:00:30Z'), calendar).phase,",
    '}));',
  ].join('\n');
  const expected = { peakMonday: 'peak', holiday: 'offpeak', sunday: 'offpeak', snapshot: 'peak' };
  for (const tz of ['Asia/Shanghai', 'UTC', 'America/New_York', 'Pacific/Kiritimati']) {
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(stdout), expected, `TZ=${tz} changed the billing phase`);
  }
});

test('the dependency is pinned to an exact version', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = manifest.dependencies?.[HOLIDAY_CALENDAR_PACKAGE];
  assert.equal(typeof version, 'string', `${HOLIDAY_CALENDAR_PACKAGE} must be a runtime dependency`);
  assert.match(version, /^\d+\.\d+\.\d+$/, 'the holiday data is pinned exactly so a reinstall cannot change the schedule');
  if (INSTALLED) {
    const installed = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', HOLIDAY_CALENDAR_PACKAGE, 'package.json'), 'utf8'));
    assert.equal(installed.version, version, 'node_modules does not match the pinned version; run npm install');
  }
});
