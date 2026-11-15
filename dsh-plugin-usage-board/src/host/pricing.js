/**
 * DeepSeek's peak / off-peak billing schedule.
 *
 * Rule (verified against the official pricing page on 2026-10-18; see
 * {@link PRICING_SOURCE_URL}):
 *
 * - **Peak** — Beijing time (UTC+8), Monday to Friday excluding Chinese
 *   statutory holidays, 09:00–12:00 and 14:00–18:00.
 * - **Off-peak** — every other instant, including weekends and holidays all
 *   day. The off-peak price is half of the peak price.
 *
 * The holiday calendar comes from the `chinese-days` package through
 * `holiday-calendar.js`; if it is unavailable the policy falls back to the
 * plain weekday rule (and says so over the wire, so the UI can add a caveat
 * rather than silently lying on a holiday).
 *
 * The browser half never implements this rule: {@link createPricingSnapshot}
 * ships the next two weeks of absolute transition instants in
 * `meta.pricing.transitions`, so both renderers agree, the countdown survives a
 * cached snapshot, and neither renderer has to carry a holiday calendar.
 *
 * @module dsh-plugin-usage-board/host/pricing
 */

/** Official page the rule and prices are taken from. */
export const PRICING_SOURCE_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';

/** The schedule is defined in Beijing time; China observes no DST. */
export const PRICING_UTC_OFFSET_MINUTES = 480;

/** Peak windows as minutes after Beijing midnight: 09:00–12:00, 14:00–18:00. */
export const PEAK_WINDOWS_MINUTES = Object.freeze([
  Object.freeze([9 * 60, 12 * 60]),
  Object.freeze([14 * 60, 18 * 60]),
]);

/** Off-peak price as a fraction of the peak price. */
export const OFFPEAK_MULTIPLIER = 0.5;

/**
 * How far ahead a snapshot carries transition instants. The panel can restore
 * a snapshot from sessionStorage long after it was fetched, so the horizon has
 * to comfortably cover "opened later the same day / next day"; two weeks does
 * that with a few dozen small objects on the wire.
 */
export const TRANSITION_HORIZON_DAYS = 14;

/** Milliseconds in one civil day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds in one minute. */
const MINUTE_MS = 60 * 1000;

/** @typedef {'peak'|'offpeak'} PricingPhase */

/**
 * @typedef {object} PricingTransition
 * @property {number} at Epoch milliseconds at which `phase` starts.
 * @property {PricingPhase} phase
 */

/**
 * @typedef {object} PricingSchedule
 * @property {PricingPhase} phase Phase at `asOf`.
 * @property {number} asOf Epoch milliseconds the snapshot was computed for.
 * @property {number} utcOffsetMinutes 480 — the rule is defined in Beijing time.
 * @property {number} offPeakMultiplier 0.5 — off-peak price / peak price.
 * @property {{ source: string, through: number, coversHorizon: boolean }|null} holidayCalendar
 *   Calendar source, the latest fully announced year it covers, and whether that
 *   coverage reaches every instant in `transitions` (the horizon can cross into
 *   an unannounced year in the last two weeks of December). Null when no
 *   calendar was available at all.
 * @property {PricingTransition[]} transitions Upcoming phase changes, oldest
 *   first, absolute instants so a client only needs its own clock.
 */

/** @param {number} value @returns {string} two-digit zero padding */
function pad2(value) {
  return value < 10 ? `0${String(value)}` : String(value);
}

/**
 * The Beijing-time civil date (YYYY-MM-DD) of an instant.
 *
 * Implemented with UTC getters on a shifted instant rather than the host's
 * local time: the rule is fixed to UTC+8 and the result must not depend on the
 * machine's TZ (a test or a server abroad would otherwise disagree with the
 * users' clocks).
 *
 * @param {number} epochMs
 * @returns {string}
 */
export function beijingDateKey(epochMs) {
  const shift = new Date(epochMs + PRICING_UTC_OFFSET_MINUTES * MINUTE_MS);
  return `${String(shift.getUTCFullYear())}-${pad2(shift.getUTCMonth() + 1)}-${pad2(shift.getUTCDate())}`;
}

/**
 * The Beijing-time weekday of an instant: 0 = Sunday … 6 = Saturday.
 * @param {number} epochMs
 * @returns {number}
 */
export function beijingWeekday(epochMs) {
  return new Date(epochMs + PRICING_UTC_OFFSET_MINUTES * MINUTE_MS).getUTCDay();
}

/**
 * Minutes elapsed since Beijing midnight, 0–1439.
 * @param {number} epochMs
 * @returns {number}
 */
function beijingMinuteOfDay(epochMs) {
  const shift = new Date(epochMs + PRICING_UTC_OFFSET_MINUTES * MINUTE_MS);
  return shift.getUTCHours() * 60 + shift.getUTCMinutes();
}

/**
 * The epoch instant of a Beijing-time wall clock on a civil date.
 * @param {number} year
 * @param {number} monthIndex 0-based.
 * @param {number} day
 * @param {number} minuteOfDay
 * @returns {number}
 */
function beijingInstant(year, monthIndex, day, minuteOfDay) {
  return Date.UTC(year, monthIndex, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60) -
    PRICING_UTC_OFFSET_MINUTES * MINUTE_MS;
}

/**
 * The billing phase at an instant.
 *
 * Weekends short-circuit before the calendar is consulted. For a weekday the
 * calendar answers "is this an official workday?"; anything other than an
 * explicit `false` keeps the weekday rule — a missing or broken calendar must
 * not make an ordinary workday look cheap.
 *
 * @param {number} epochMs
 * @param {((dateKey: string) => boolean|null)|null} [isWorkday] Official workday
 *   predicate; null/absent means "no holiday calendar, use the weekday rule".
 * @returns {PricingPhase}
 */
export function phaseAt(epochMs, isWorkday = null) {
  const weekday = beijingWeekday(epochMs);
  if (weekday === 0 || weekday === 6) return 'offpeak';
  if (isWorkday !== null) {
    const workday = isWorkday(beijingDateKey(epochMs));
    if (workday === false) return 'offpeak';
  }
  const minute = beijingMinuteOfDay(epochMs);
  for (const window of PEAK_WINDOWS_MINUTES) {
    if (minute >= window[0] && minute < window[1]) return 'peak';
  }
  return 'offpeak';
}

/**
 * Every phase change after `epochMs` within the horizon, oldest first.
 *
 * Only workdays contribute boundaries: a Saturday, Sunday or statutory holiday
 * is off-peak the whole day, so the change into it already happened at the
 * previous workday's 18:00 and the change out of it is the next workday's
 * 09:00. That is what makes a Friday-evening-to-Monday-morning countdown one
 * single transition instead of a stream of fake weekend switches.
 *
 * @param {number} epochMs
 * @param {((dateKey: string) => boolean|null)|null} [isWorkday]
 * @param {{horizonDays?: number}} [options] Test seam; defaults to the shipped horizon.
 * @returns {PricingTransition[]}
 */
export function transitionsAfter(epochMs, isWorkday = null, options = {}) {
  const horizonDays = typeof options.horizonDays === 'number' ? options.horizonDays : TRANSITION_HORIZON_DAYS;
  const horizonEnd = epochMs + horizonDays * DAY_MS;
  const start = new Date(epochMs + PRICING_UTC_OFFSET_MINUTES * MINUTE_MS);
  // A UTC-midnight "day number" whose UTC weekday and calendar date are the
  // Beijing ones. Civil-date arithmetic is then plain +DAY_MS, and month/year
  // rollover is handled by Date itself.
  const firstDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  /** @type {PricingTransition[]} */
  const transitions = [];
  for (let offset = 0; offset <= horizonDays + 1; offset += 1) {
    const day = new Date(firstDay + offset * DAY_MS);
    const year = day.getUTCFullYear();
    const monthIndex = day.getUTCMonth();
    const date = day.getUTCDate();
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const dateKey = `${String(year)}-${pad2(monthIndex + 1)}-${pad2(date)}`;
    if (isWorkday !== null && isWorkday(dateKey) === false) continue;
    for (const window of PEAK_WINDOWS_MINUTES) {
      for (const boundary of [[window[0], 'peak'], [window[1], 'offpeak']]) {
        const at = beijingInstant(year, monthIndex, date, boundary[0]);
        if (at > epochMs && at <= horizonEnd) transitions.push({ at, phase: boundary[1] });
      }
    }
  }
  transitions.sort((left, right) => left.at - right.at);
  return transitions;
}

/**
 * The latest announced year the calendar can vouch for.
 *
 * Probes the current year and its neighbours because the horizon can cross a
 * year boundary, and a package that already carries next year's arrangement
 * (announced every autumn) should be trusted immediately.
 *
 * `coversHorizon` is the honest part: a December read ships transitions into
 * January, and if the package has not announced that year yet the UI must say
 * that the far edge of the countdown is an estimate — the current phase can be
 * right while the next transition is not.
 *
 * @param {import('./holiday-calendar.js').HolidayCalendar|null} calendar
 * @param {number} currentYear Beijing calendar year.
 * @param {number} horizonYear Beijing year of the last shipped transition.
 * @returns {{ source: string, through: number, coversHorizon: boolean }|null}
 */
function coverageOf(calendar, currentYear, horizonYear) {
  if (calendar === null) return null;
  for (const candidate of [Math.max(currentYear + 1, horizonYear), currentYear, currentYear - 1]) {
    let covered = false;
    try {
      covered = calendar.coversYear(candidate) === true;
    } catch {
      covered = false;
    }
    if (covered) {
      return { source: calendar.source, through: candidate, coversHorizon: candidate >= horizonYear };
    }
  }
  return null;
}

/**
 * Build the `meta.pricing` object attached to the DeepSeek provider row.
 *
 * Pure apart from the injected calendar: given the same instant and calendar it
 * always renders the same schedule, which is what makes the boundary tests
 * exhaustive and fast.
 *
 * @param {number} epochMs
 * @param {import('./holiday-calendar.js').HolidayCalendar|null} calendar
 * @param {{horizonDays?: number}} [options]
 * @returns {PricingSchedule}
 */
export function createPricingSnapshot(epochMs, calendar, options = {}) {
  const isWorkday = calendar === null ? null : (dateKey) => calendar.isWorkday(dateKey);
  const currentYear = Number(beijingDateKey(epochMs).slice(0, 4));
  const transitions = transitionsAfter(epochMs, isWorkday, options);
  const horizonYear = transitions.length === 0
    ? currentYear
    : Number(beijingDateKey(transitions[transitions.length - 1].at).slice(0, 4));
  return {
    phase: phaseAt(epochMs, isWorkday),
    asOf: epochMs,
    utcOffsetMinutes: PRICING_UTC_OFFSET_MINUTES,
    offPeakMultiplier: OFFPEAK_MULTIPLIER,
    holidayCalendar: coverageOf(calendar, currentYear, horizonYear),
    transitions: transitions,
  };
}
