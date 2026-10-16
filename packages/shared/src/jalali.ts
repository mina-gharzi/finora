/**
 * Jalali (Persian) calendar date formatting.
 *
 * Strategy — stated explicitly so it is never surprising:
 * - Dates are ordinary Gregorian instants (`Date`). Nothing is reinterpreted:
 *   converting an instant to its Jalali representation happens *only* while
 *   formatting, through the ICU `persian` calendar provided by the JavaScript
 *   runtime.
 * - Calendar: `persian`. Numbering: `nu-latn`, so output always uses Latin
 *   digits regardless of the default locale of the host.
 * - The default time zone is `UTC` so results are deterministic across
 *   machines. Pass an IANA zone (e.g. `"Asia/Tehran"`) to render in a specific
 *   local time.
 * - This module does not parse date strings, does not resolve "today" for the
 *   user, and provides no calendar/date-picker UI.
 *
 * @module @finora/shared/jalali
 */

/** Locale that combines the Persian calendar with Latin numerals (`nu-latn`). */
export const JALALI_LOCALE = "fa-IR-u-ca-persian-nu-latn";

/** IANA time zone used when none is supplied, for deterministic output. */
export const DEFAULT_JALALI_TIME_ZONE = "UTC";

export interface FormatJalaliOptions {
  /** IANA time zone such as `"Asia/Tehran"`. Defaults to `UTC`. */
  timeZone?: string;
}

export interface JalaliDateParts {
  year: number;
  month: number;
  day: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timeZone);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat(JALALI_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  formatters.set(timeZone, formatter);
  return formatter;
}

function assertDate(date: Date): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("Jalali formatting requires a valid Date.");
  }
}

/**
 * Formats a Gregorian instant as a Jalali date, e.g. `1403/01/01`.
 *
 * @throws {RangeError} when `date` is not a valid `Date`.
 */
export function formatJalaliDate(
  date: Date,
  options: FormatJalaliOptions = {},
): string {
  assertDate(date);
  const timeZone = options.timeZone ?? DEFAULT_JALALI_TIME_ZONE;
  return getFormatter(timeZone).format(date);
}

/**
 * Formats a Gregorian instant as a Jalali date.
 *
 * @throws {RangeError} when `date` is not a valid `Date`.
 */
export function formatJalaliDateParts(
  date: Date,
  options: FormatJalaliOptions = {},
): JalaliDateParts {
  assertDate(date);

  const timeZone = options.timeZone ?? DEFAULT_JALALI_TIME_ZONE;
  const parts = getFormatter(timeZone).formatToParts(date);

  let year = 0;
  let month = 0;
  let day = 0;

  for (const part of parts) {
    if (part.type === "year") {
      year = Number(part.value);
    } else if (part.type === "month") {
      month = Number(part.value);
    } else if (part.type === "day") {
      day = Number(part.value);
    }
  }

  return { year, month, day };
}
