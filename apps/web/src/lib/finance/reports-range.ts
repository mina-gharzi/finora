import { formatJalaliDate } from "@finora/shared";
import {
  JALALI_MONTHS,
  addDays,
  endOfJalaliMonth,
  jalaliParts,
  startOfJalaliMonth,
  startOfNextJalaliMonth,
} from "./dashboard-range";

/**
 * Jalali month selection for the reports experience. Like
 * `dashboard-range.ts`, this module is pure parsing plus calendar arithmetic —
 * no `server-only`, no database — so the month math is unit tested in
 * isolation and shared by the page, the DAL and the view.
 *
 * Calendar semantics (matching `dashboard-range.ts`):
 * - A "month" is a Jalali month; Gregorian bounds are derived from the Jalali
 *   calendar through ICU (never reinterpreted or shifted).
 * - Month keys are plain integers `{ year, month }` with `month` in 1–12.
 * - "Today" is supplied by the caller as a `YYYY-MM-DD` string so the module is
 *   deterministic and testable. The page derives it in UTC.
 *
 * Reverse resolution (Jalali key → Gregorian bounds) works by anchoring a
 * day inside Farvardin (`year + 621`-03-01 plus a bounded day scan), then
 * walking month starts with the already-verified helpers from
 * `dashboard-range.ts`. The Gregorian anchor is only a search hint; exact
 * boundaries always come from the ICU `persian` calendar.
 */

/** Number of Jalali months in the six-month trend window (selected included). */
export const REPORT_TREND_MONTHS = 6;

/** How many recent Jalali months the month `<select>` offers. */
export const REPORT_MONTH_OPTIONS = 24;

/** Query-string key used by `/reports?month=…`. */
export const REPORTS_MONTH_PARAM = "month";

/**
 * Sanity bounds for untrusted `?month=` values. Real dates sit well inside
 * this range; the bounds keep a hostile query string from probing extreme
 * years while remaining generous.
 */
const MIN_JALALI_YEAR = 1000;
const MAX_JALALI_YEAR = 1999;

/** A Jalali calendar month as plain integers (`month` is 1–12). */
export interface JalaliMonthKey {
  year: number;
  month: number;
}

/** A resolved Jalali month with everything the UI needs to render it. */
export interface ReportsMonth {
  key: JalaliMonthKey;
  /** Stable `YYYY-MM` identifier for the URL (Jalali year-month). */
  param: string;
  /** Persian "ماه سال" label, e.g. `مهر 1405`. */
  label: string;
  /** Persian month name without the year, e.g. `مهر`. */
  shortLabel: string;
  /** Inclusive Gregorian lower bound (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive Gregorian upper bound (`YYYY-MM-DD`). */
  to: string;
  /** Human-readable inclusive range label, e.g. `1405/07/23 تا 1405/08/01`. */
  rangeLabel: string;
}

const MONTH_PARAM_PATTERN = /^(\d{4})-(\d{2})$/;

function padMonth(month: number): string {
  return String(month).padStart(2, "0");
}

function monthParam(key: JalaliMonthKey): string {
  return `${key.year}-${padMonth(key.month)}`;
}

/**
 * The Jalali month key containing `iso`, via the ICU `persian` calendar.
 */
export function currentJalaliMonthKey(todayIso: string): JalaliMonthKey {
  const { year, month } = jalaliParts(todayIso);
  return { year, month };
}

/**
 * Month-key arithmetic that is independent of any calendar: consecutive
 * Jalali months are exactly one apart, so shifting across a year boundary is
 * plain integer division. Farvardin (month 1) shifted back one lands on
 * Esfand of the previous year.
 */
export function shiftJalaliMonthKey(
  key: JalaliMonthKey,
  delta: number,
): JalaliMonthKey {
  const zeroBased = key.year * 12 + (key.month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

/**
 * Inclusive Gregorian bounds of the Jalali month `(year, month)`, derived
 * from the ICU calendar.
 *
 * The search starts from an approximate Gregorian day inside the month
 * (Farvardin 1 is near March 21 of Gregorian `year + 621`; each further
 * Jalali month is 29–31 days later), then snaps to the exact month start with
 * `startOfJalaliMonth` and walks month-by-month until the requested key is
 * reached. The approximation is never more than a few days off, so the walk
 * terminates in at most a couple of steps; a guard plus a final exact-match
 * check keep the function total (it throws rather than returning bounds for a
 * month the calendar cannot express).
 *
 * @throws {RangeError} when the ICU calendar cannot resolve the month
 * (unreachable for keys within `[MIN_JALALI_YEAR, MAX_JALALI_YEAR]`).
 */
function resolveJalaliMonthBounds(
  key: JalaliMonthKey,
): { from: string; to: string } {
  const approx = addDays(`${key.year + 621}-03-21`, (key.month - 1) * 30);
  let from = startOfJalaliMonth(approx);

  for (let step = 0; step < 4; step += 1) {
    const parts = jalaliParts(from);
    if (parts.year === key.year && parts.month === key.month) {
      break;
    }
    if (
      parts.year < key.year ||
      (parts.year === key.year && parts.month < key.month)
    ) {
      from = startOfNextJalaliMonth(from);
    } else {
      from = startOfJalaliMonth(addDays(from, -1));
    }
  }

  const resolved = jalaliParts(from);
  if (resolved.year !== key.year || resolved.month !== key.month) {
    throw new RangeError(
      `Cannot resolve the Jalali month ${key.year}-${padMonth(key.month)}.`,
    );
  }

  return { from, to: endOfJalaliMonth(from) };
}

/** Builds the full `ReportsMonth` view model for a Jalali month key. */
export function reportsMonthFromKey(key: JalaliMonthKey): ReportsMonth {
  if (
    !Number.isInteger(key.year) ||
    !Number.isInteger(key.month) ||
    key.month < 1 ||
    key.month > 12
  ) {
    throw new RangeError(
      `Invalid Jalali month key: ${key.year}-${key.month}.`,
    );
  }

  const { from, to } = resolveJalaliMonthBounds(key);
  const shortLabel = JALALI_MONTHS[key.month - 1];
  return {
    key,
    param: monthParam(key),
    label: `${shortLabel} ${key.year}`,
    shortLabel,
    from,
    to,
    rangeLabel: `${formatJalaliDate(new Date(`${from}T00:00:00Z`))} تا ${formatJalaliDate(new Date(`${to}T00:00:00Z`))}`,
  };
}

/**
 * Normalizes an untrusted `?month=` value. The expected shape is Jalali
 * `YYYY-MM` (e.g. `1405-07`); anything else — a wrong shape, a month outside
 * 01–12, an out-of-bounds year, an array's non-first value — falls back to
 * the Jalali month containing `todayIso` so a hostile query string can never
 * throw.
 */
export function parseReportsMonthParam(
  value: string | string[] | undefined,
  todayIso: string,
): JalaliMonthKey {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw === undefined ? null : MONTH_PARAM_PATTERN.exec(raw);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (
      year >= MIN_JALALI_YEAR &&
      year <= MAX_JALALI_YEAR &&
      month >= 1 &&
      month <= 12
    ) {
      return { year, month };
    }
  }
  return currentJalaliMonthKey(todayIso);
}

/**
 * The selected month plus the five Jalali months before it, oldest first —
 * a window of `REPORT_TREND_MONTHS` consecutive months ending at the
 * selection (e.g. اردیبهشت … مهر for a مهر selection).
 */
export function buildTrendWindow(selected: JalaliMonthKey): ReportsMonth[] {
  const months: ReportsMonth[] = [];
  for (let offset = -(REPORT_TREND_MONTHS - 1); offset <= 0; offset += 1) {
    months.push(reportsMonthFromKey(shiftJalaliMonthKey(selected, offset)));
  }
  return months;
}

/** The Jalali month immediately before `key` (pure key arithmetic). */
export function previousJalaliMonthKey(key: JalaliMonthKey): JalaliMonthKey {
  return shiftJalaliMonthKey(key, -1);
}

export interface MonthOption {
  param: string;
  label: string;
}

/**
 * Recent Jalali months for the month `<select>`, newest first: the month
 * containing `todayIso` and the `count - 1` months before it. Future months
 * are never offered — there can be no data in them.
 */
export function recentMonthOptions(
  todayIso: string,
  count: number = REPORT_MONTH_OPTIONS,
): MonthOption[] {
  const options: MonthOption[] = [];
  let key = currentJalaliMonthKey(todayIso);
  for (let index = 0; index < count; index += 1) {
    options.push({ param: monthParam(key), label: reportsMonthFromKey(key).label });
    key = shiftJalaliMonthKey(key, -1);
  }
  return options;
}

/**
 * Same-app href that selects a month on the reports page. `param` is the
 * already-normalized `YYYY-MM` value from a `ReportsMonth`, never raw user
 * input.
 */
export function buildReportsHref(param: string): string {
  return `/reports?${REPORTS_MONTH_PARAM}=${param}`;
}
