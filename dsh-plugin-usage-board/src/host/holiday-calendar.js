/**
 * Bridge to the third-party Chinese holiday calendar (`chinese-days`).
 *
 * **Why this is a dependency instead of a table in this repo.** China's
 * statutory holiday arrangement — the actual days off plus the make-up workdays
 * (调休) — is re-announced by the State Council every year. A hand-written table
 * is correct for exactly one year and then silently makes the DeepSeek
 * peak/off-peak reminder wrong on the days users care about most (the long
 * breaks). `chinese-days` ships the official arrangement, is updated against
 * each announcement, has no transitive dependencies, and is MIT licensed.
 *
 * **Why the import is lazy and failure-tolerant.** The usage board's host half
 * is otherwise dependency-free, and a broken optional dependency must never
 * take the dashboard down (the plugin's central degradation rule). Loading the
 * package inside a guarded dynamic import means a machine without
 * `node_modules` still gets a working board: the billing schedule degrades to
 * the plain Monday–Friday rule, `meta.pricing.holidayCalendar` becomes null and
 * the browser half says the calendar is missing instead of pretending to know.
 *
 * The module is imported once per process and cached; a failed import is cached
 * as `null` too, so a missing dependency cannot turn every snapshot into a
 * rejected dynamic import.
 *
 * @module dsh-plugin-usage-board/host/holiday-calendar
 */

/** Package name, also surfaced in `meta.pricing.holidayCalendar.source`. */
export const HOLIDAY_CALENDAR_PACKAGE = 'chinese-days';

/**
 * @typedef {object} HolidayCalendar
 * @property {string} source Package name, for diagnostics.
 * @property {(dateKey: string) => boolean|null} isWorkday Whether the official
 *   calendar treats `YYYY-MM-DD` as a workday (holidays and weekends are false,
 *   make-up workdays are true). `null` means "cannot tell" — the caller then
 *   falls back to the plain weekday rule rather than guessing.
 * @property {(year: number) => boolean} coversYear Whether the package carries
 *   the announced holiday arrangement for that calendar year.
 */

/**
 * Default importer, kept as a seam so the failure path is testable without
 * uninstalling the package.
 * @param {string} specifier
 * @returns {Promise<any>}
 */
const defaultImporter = (specifier) => import(specifier);

/**
 * Build a memoized loader around one importer.
 *
 * @param {(specifier: string) => Promise<any>} [importer]
 * @returns {() => Promise<HolidayCalendar|null>}
 */
export function createHolidayCalendarLoader(importer = defaultImporter) {
  /** @type {Promise<HolidayCalendar|null>|null} */
  let loading = null;
  return function loadHolidayCalendar() {
    if (loading !== null) return loading;
    loading = Promise.resolve()
      .then(() => importer(HOLIDAY_CALENDAR_PACKAGE))
      .then((module) => adapt(module))
      .catch(() => null);
    return loading;
  };
}

/** Process-wide loader, the one the provider adapter uses. */
const loadSharedHolidayCalendar = createHolidayCalendarLoader();

/**
 * Load the shared holiday calendar, or null when the package is unavailable.
 * @returns {Promise<HolidayCalendar|null>}
 */
export function loadHolidayCalendar() {
  return loadSharedHolidayCalendar();
}

/**
 * Turn the package's exports into the small surface the pricing policy needs.
 *
 * The package is CommonJS, so under ESM `module.default` carries the API object
 * (with a further nested `default` that is irrelevant here). A package whose
 * shape no longer matches is treated exactly like a missing package.
 *
 * @param {any} module
 * @returns {HolidayCalendar|null}
 */
function adapt(module) {
  const api = module !== null && typeof module === 'object' && module.default !== undefined ? module.default : module;
  if (api === null || typeof api !== 'object') return null;
  if (typeof api.getDayDetail !== 'function' || typeof api.getHolidaysInRange !== 'function') return null;
  return {
    source: HOLIDAY_CALENDAR_PACKAGE,
    isWorkday(dateKey) {
      try {
        const detail = api.getDayDetail(dateKey);
        return detail !== null && typeof detail === 'object' && typeof detail.work === 'boolean' ? detail.work : null;
      } catch {
        // A malformed date or a package regression must not abort a snapshot;
        // the caller falls back to the weekday rule for this date.
        return null;
      }
    },
    coversYear(year) {
      try {
        // `false` asks the package for the announced holidays only, weekends
        // excluded. A year with no announcement yet returns an empty list,
        // which is how the loader tells "covered" from "not announced yet".
        const days = api.getHolidaysInRange(`${year}-01-01`, `${year}-12-31`, false);
        return Array.isArray(days) && days.length > 0;
      } catch {
        return false;
      }
    },
  };
}
