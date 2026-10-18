/**
 * Offline tests for the DeepSeek peak / off-peak billing policy.
 *
 * The policy is pure apart from the holiday calendar, which these tests stub
 * with an explicit holiday list. That is deliberate: the assertions below are
 * written from the official rule ("Beijing time, Monday–Friday, 09:00–12:00 and
 * 14:00–18:00, excluding statutory holidays; everything else at half price") and
 * from hand-worked boundary instants, not copied from the implementation.
 *
 * The real `chinese-days` data is checked separately in `holidays.test.js`, so
 * a fixture change here can never hide a wrong calendar integration.
 *
 * @module dsh-plugin-usage-board/test/pricing
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFPEAK_MULTIPLIER,
  PRICING_UTC_OFFSET_MINUTES,
  TRANSITION_HORIZON_DAYS,
  beijingDateKey,
  beijingWeekday,
  createPricingSnapshot,
  phaseAt,
  transitionsAfter,
} from '../src/host/pricing.js';

/** A Beijing wall-clock instant as epoch ms. */
const bj = (iso) => Date.parse(`${iso}+08:00`);

/** Beijing wall clock of an epoch instant, spelled for readable expectations. */
const bjClock = (epochMs) =>
  new Date(epochMs + PRICING_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 19).replace('T', ' ');

/**
 * Stub calendar: the listed dates are statutory holidays, every other weekday
 * is a workday, and announced years are `<= through`.
 * @param {{holidays?: string[], through?: number}} [options]
 */
function stubCalendar(options = {}) {
  const holidays = new Set(options.holidays ?? []);
  const through = options.through ?? 2026;
  return {
    source: 'stub-holidays',
    isWorkday(dateKey) {
      if (holidays.has(dateKey)) return false;
      const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
      return weekday !== 0 && weekday !== 6;
    },
    coversYear(year) {
      return year <= through;
    },
  };
}

/** The 2026 National Day break, the holiday that makes the rule visible. */
const NATIONAL_DAY_2026 = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];

test('the Beijing civil date and weekday do not depend on the host timezone', () => {
  // 16:30 UTC is already Monday 00:30 in Beijing.
  assert.equal(beijingDateKey(Date.parse('2026-10-18T16:30:00Z')), '2026-10-19');
  assert.equal(beijingWeekday(Date.parse('2026-10-18T16:30:00Z')), 1);
  // 15:59 UTC is still Sunday 23:59 in Beijing.
  assert.equal(beijingDateKey(Date.parse('2026-10-18T15:59:00Z')), '2026-10-18');
  assert.equal(beijingWeekday(Date.parse('2026-10-18T15:59:00Z')), 0);
  // A leap-day boundary.
  assert.equal(beijingDateKey(Date.parse('2028-02-28T16:00:00Z')), '2028-02-29');
});

test('peak windows are [start, end) on workdays', () => {
  const calendar = stubCalendar();
  const isWorkday = (dateKey) => calendar.isWorkday(dateKey);
  const cases = [
    ['2026-10-19T08:59:59', 'offpeak'],
    ['2026-10-19T09:00:00', 'peak'],
    ['2026-10-19T11:59:59', 'peak'],
    ['2026-10-19T12:00:00', 'offpeak'],
    ['2026-10-19T13:59:59', 'offpeak'],
    ['2026-10-19T14:00:00', 'peak'],
    ['2026-10-19T17:59:59', 'peak'],
    ['2026-10-19T18:00:00', 'offpeak'],
    ['2026-10-19T23:59:59', 'offpeak'],
    ['2026-10-20T00:00:00', 'offpeak'],
  ];
  for (const [instant, expected] of cases) {
    assert.equal(phaseAt(bj(instant), isWorkday), expected, instant);
  }
});

test('weekends and holidays are off-peak the whole day', () => {
  const calendar = stubCalendar({ holidays: NATIONAL_DAY_2026 });
  const isWorkday = (dateKey) => calendar.isWorkday(dateKey);
  // Saturday / Sunday, mid-window times.
  assert.equal(phaseAt(bj('2026-10-17T10:00:00'), isWorkday), 'offpeak');
  assert.equal(phaseAt(bj('2026-10-18T15:00:00'), isWorkday), 'offpeak');
  // A Thursday inside National Day.
  assert.equal(phaseAt(bj('2026-10-01T10:00:00'), isWorkday), 'offpeak');
  // The first workday after the break is peak again.
  assert.equal(phaseAt(bj('2026-10-08T10:00:00'), isWorkday), 'peak');
});

test('a make-up workday that falls on a weekend stays off-peak', () => {
  // 2026-10-10 is an official make-up workday (调休) — a Saturday. The DeepSeek
  // rule keys on Monday–Friday, so it must not become a peak day.
  const calendar = {
    ...stubCalendar(),
    isWorkday() {
      return true;
    },
  };
  assert.equal(phaseAt(bj('2026-10-10T10:00:00'), (dateKey) => calendar.isWorkday(dateKey)), 'offpeak');
  const transitions = transitionsAfter(bj('2026-10-10T00:00:00'), (dateKey) => calendar.isWorkday(dateKey), { horizonDays: 3 });
  assert.equal(transitions[0].phase, 'peak');
  assert.equal(transitions[0].at, bj('2026-10-12T09:00:00'), 'the next change is Monday 09:00, not Saturday');
});

test('without a calendar the policy falls back to the weekday rule', () => {
  // Documented fallback: a holiday looks like an ordinary weekday. The snapshot
  // reports `holidayCalendar: null` so the UI can warn instead of pretending.
  assert.equal(phaseAt(bj('2026-10-01T10:00:00'), null), 'peak');
  // A predicate that cannot answer must not turn an ordinary workday cheap.
  assert.equal(phaseAt(bj('2026-10-01T10:00:00'), () => null), 'peak');
  assert.equal(phaseAt(bj('2026-10-19T10:00:00'), () => null), 'peak');
});

test('transitions are absolute, sorted, unique and strictly after asOf', () => {
  const isWorkday = (dateKey) => stubCalendar().isWorkday(dateKey);
  const asOf = bj('2026-10-16T17:00:00'); // Friday, before the 18:00 close
  const transitions = transitionsAfter(asOf, isWorkday);
  assert.ok(transitions.length > 0);
  for (let index = 0; index < transitions.length; index += 1) {
    assert.ok(transitions[index].at > asOf);
    assert.ok(['peak', 'offpeak'].includes(transitions[index].phase));
    if (index > 0) assert.ok(transitions[index].at > transitions[index - 1].at, 'transitions must be strictly increasing');
  }
  // Friday 18:00 closes the week; nothing happens on the weekend.
  assert.deepEqual(
    transitions.slice(0, 2).map((entry) => [bjClock(entry.at), entry.phase]),
    [
      ['2026-10-16 18:00:00', 'offpeak'],
      ['2026-10-19 09:00:00', 'peak'],
    ],
  );
});

test('a long holiday collapses into one uninterrupted off-peak stretch', () => {
  const calendar = stubCalendar({ holidays: NATIONAL_DAY_2026 });
  const isWorkday = (dateKey) => calendar.isWorkday(dateKey);
  const transitions = transitionsAfter(bj('2026-09-30T10:00:00'), isWorkday, { horizonDays: 14 });
  // Wednesday 30th is a workday; then the whole National Day break is skipped.
  assert.deepEqual(
    transitions.slice(0, 4).map((entry) => [bjClock(entry.at), entry.phase]),
    [
      ['2026-09-30 12:00:00', 'offpeak'],
      ['2026-09-30 14:00:00', 'peak'],
      ['2026-09-30 18:00:00', 'offpeak'],
      ['2026-10-08 09:00:00', 'peak'], // first workday after the break
    ],
  );
});

test('an instant exactly on a boundary belongs to the phase that starts there', () => {
  const isWorkday = (dateKey) => stubCalendar().isWorkday(dateKey);
  assert.equal(phaseAt(bj('2026-10-19T12:00:00'), isWorkday), 'offpeak');
  const transitions = transitionsAfter(bj('2026-10-19T12:00:00'), isWorkday);
  assert.equal(bjClock(transitions[0].at), '2026-10-19 14:00:00'); // 14:00, not 12:00
});

test('the transition horizon is bounded and the snapshot keeps it under a few dozen objects', () => {
  const isWorkday = (dateKey) => stubCalendar().isWorkday(dateKey);
  const asOf = bj('2026-10-18T10:51:57');
  const transitions = transitionsAfter(asOf, isWorkday);
  assert.ok(transitions.length >= 2, 'a Sunday still knows when Monday peak begins');
  assert.ok(transitions.length <= 4 * (TRANSITION_HORIZON_DAYS + 1), 'at most four changes per day');
  assert.ok(transitions[transitions.length - 1].at <= asOf + TRANSITION_HORIZON_DAYS * 86_400_000);
});

test('createPricingSnapshot describes the rule, the phase and the calendar coverage', () => {
  const now = bj('2026-10-19T10:00:00'); // Monday peak
  const snapshot = createPricingSnapshot(now, stubCalendar());
  assert.equal(snapshot.phase, 'peak');
  assert.equal(snapshot.asOf, now);
  assert.equal(snapshot.utcOffsetMinutes, PRICING_UTC_OFFSET_MINUTES);
  assert.equal(PRICING_UTC_OFFSET_MINUTES, 480);
  assert.equal(snapshot.offPeakMultiplier, OFFPEAK_MULTIPLIER);
  assert.equal(OFFPEAK_MULTIPLIER, 0.5);
  assert.deepEqual(snapshot.holidayCalendar, { source: 'stub-holidays', through: 2026, coversHorizon: true });
  assert.ok(snapshot.transitions.length > 0);
  assert.equal(snapshot.transitions[0].at, bj('2026-10-19T12:00:00'));
  // Deterministic: the same instant and calendar must always render the same
  // schedule, which is what lets the tests above name exact boundaries.
  assert.deepEqual(createPricingSnapshot(now, stubCalendar()), snapshot);
});

test('calendar coverage is reported honestly when the year is not announced yet', () => {
  // A stale calendar: today is in 2027, the package still only knows 2026.
  const stale = createPricingSnapshot(bj('2027-03-01T10:00:00'), stubCalendar({ through: 2026 }));
  assert.deepEqual(stale.holidayCalendar, { source: 'stub-holidays', through: 2026, coversHorizon: false });
  assert.equal(stale.phase, 'peak', 'the weekday estimate still runs');

  // No calendar at all: the UI must be told, so it can say "estimate".
  const absent = createPricingSnapshot(bj('2026-10-19T10:00:00'), null);
  assert.equal(absent.holidayCalendar, null);
  assert.equal(absent.phase, 'peak');

  // A calendar that already carries next year's announcement is trusted
  // immediately, even before New Year.
  const ahead = createPricingSnapshot(bj('2026-12-01T10:00:00'), stubCalendar({ through: 2027 }));
  assert.deepEqual(ahead.holidayCalendar, { source: 'stub-holidays', through: 2027, coversHorizon: true });
});

test('coverage discloses a horizon that reaches an unannounced year', () => {
  // Early December: the 14-day horizon still ends in 2026, so 2026 coverage is
  // enough and the UI shows no caveat.
  const early = createPricingSnapshot(bj('2026-12-01T10:00:00'), stubCalendar({ through: 2026 }));
  assert.deepEqual(early.holidayCalendar, { source: 'stub-holidays', through: 2026, coversHorizon: true });
  assert.ok(early.transitions.every((entry) => beijingDateKey(entry.at).startsWith('2026-')));

  // Mid-December: the horizon now ships transitions into 2027, which the
  // calendar cannot vouch for (the State Council has not announced it yet).
  // The far edge of the countdown is an estimate; the UI must say so.
  const late = createPricingSnapshot(bj('2026-12-18T10:00:00'), stubCalendar({ through: 2026 }));
  assert.equal(late.holidayCalendar.coversHorizon, false);
  assert.ok(late.transitions.some((entry) => beijingDateKey(entry.at).startsWith('2027-')), 'the horizon crosses the year boundary');
  // The current phase itself is still trustworthy — only the horizon is not.
  assert.equal(late.phase, 'peak');

  // Once next year's arrangement is announced, the same instant is fully covered.
  const announced = createPricingSnapshot(bj('2026-12-18T10:00:00'), stubCalendar({ through: 2027 }));
  assert.deepEqual(announced.holidayCalendar, { source: 'stub-holidays', through: 2027, coversHorizon: true });
});

test('coverage probes the year the horizon actually visits', () => {
  // 2026-12-30: the horizon reaches into 2027. A calendar through 2027 is
  // advertised even though the read happens in 2026.
  const snapshot = createPricingSnapshot(bj('2026-12-30T10:00:00'), stubCalendar({ through: 2027 }));
  assert.equal(snapshot.holidayCalendar.through, 2027);
  assert.equal(snapshot.holidayCalendar.coversHorizon, true);
  assert.equal(snapshot.transitions[0].at, bj('2026-12-30T12:00:00'));
});
