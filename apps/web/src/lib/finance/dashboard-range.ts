import { formatJalaliDateParts } from "@finora/shared";

/**
 * Period selection for the dashboard. This module is intentionally free of
 * `server-only` and of any database import: it is pure parsing plus date
 * arithmetic, so it can be unit tested in isolation and reused by the page.
 *
 * Calendar semantics, stated explicitly:
 * - Transactions store a calendar day (`occurred_on`, a `date` column with no
 *   time zone), so a period is an inclusive range of calendar days.
 * - A "month" is a **Jalali** month, matching the Persian-first UI. Gregorian
 *   boundaries are derived from the Jalali month so the stored dates are never
 *   reinterpreted or shifted. Within a Jalali month the day-of-month advances
 *   one per calendar day, so a month's first day is simply
 *   `day - (jalaliDay - 1)` and its last day is the day before the next month.
 * - "Today" is supplied by the caller as a `YYYY-MM-DD` string so the module is
 *   deterministic and testable. The page derives it in UTC.
 */

export const DASHBOARD_PERIODS = [
  "this-month",
  "prev-month",
  "all-time",
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = "this-month";

/** Persian month names, indexed by Jalali month number (1 = فروردین). */
export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  "this-month": "این ماه",
  "prev-month": "ماه گذشته",
  "all-time": "همه زمان‌ها",
};

export interface DashboardRange {
  period: DashboardPeriod;
  /** Inclusive Gregorian lower bound (`YYYY-MM-DD`), or null for all time. */
  from: string | null;
  /** Inclusive Gregorian upper bound (`YYYY-MM-DD`), or null for all time. */
  to: string | null;
  /** Persian label for the selected period / span. */
  label: string;
}

function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds `days` (which may be negative) to a `YYYY-MM-DD` calendar day. */
export function addDays(iso: string, days: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function jalaliParts(iso: string) {
  return formatJalaliDateParts(toUtcDate(iso));
}

/** First day of the Jalali month containing `iso`. */
export function startOfJalaliMonth(iso: string): string {
  const { day } = jalaliParts(iso);
  return addDays(iso, -(day - 1));
}

/** First day of the Jalali month after the one containing `iso`. */
export function startOfNextJalaliMonth(iso: string): string {
  const start = startOfJalaliMonth(iso);
  const { year, month } = jalaliParts(start);

  // A Jalali month is 29, 30 or 31 days long; the first candidate that lands in
  // a different Jalali month is the first day of the next one.
  for (const length of [29, 30, 31]) {
    const candidate = addDays(start, length);
    const parts = jalaliParts(candidate);
    if (parts.year !== year || parts.month !== month) {
      return candidate;
    }
  }

  // Unreachable: no Jalali month exceeds 31 days.
  return addDays(start, 31);
}

/** Last day of the Jalali month containing `iso` (inclusive). */
export function endOfJalaliMonth(iso: string): string {
  return addDays(startOfNextJalaliMonth(iso), -1);
}

/** First day of the Jalali month before the one containing `iso`. */
function startOfPreviousJalaliMonth(iso: string): string {
  return startOfJalaliMonth(addDays(startOfJalaliMonth(iso), -1));
}

/** Persian "ماه سال" label for the Jalali month containing `iso`. */
function jalaliMonthLabel(iso: string): string {
  const { year, month } = jalaliParts(iso);
  return `${JALALI_MONTHS[month - 1]} ${year}`;
}

/**
 * Normalizes an untrusted `period` value. Unknown or missing values fall back to
 * the safe default instead of failing, so a hostile query string can never throw.
 */
export function parseDashboardPeriod(
  value: string | string[] | undefined,
): DashboardPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return (DASHBOARD_PERIODS as readonly string[]).includes(raw ?? "")
    ? (raw as DashboardPeriod)
    : DEFAULT_DASHBOARD_PERIOD;
}

/**
 * Resolves a period into concrete inclusive Gregorian bounds for `todayIso`.
 * `all-time` yields null bounds (no date filter).
 */
export function resolveDashboardRange(
  period: DashboardPeriod,
  todayIso: string,
): DashboardRange {
  if (period === "all-time") {
    return {
      period,
      from: null,
      to: null,
      label: PERIOD_LABELS["all-time"],
    };
  }

  if (period === "prev-month") {
    const from = startOfPreviousJalaliMonth(todayIso);
    const to = addDays(startOfJalaliMonth(todayIso), -1);
    return { period, from, to, label: jalaliMonthLabel(from) };
  }

  const from = startOfJalaliMonth(todayIso);
  const to = endOfJalaliMonth(todayIso);
  return { period, from, to, label: jalaliMonthLabel(from) };
}

/** Persian selector label for a period. */
export function dashboardPeriodLabel(period: DashboardPeriod): string {
  return PERIOD_LABELS[period];
}

/** Same-app href that selects `period` on the dashboard. */
export function buildDashboardHref(period: DashboardPeriod): string {
  return `/?period=${period}`;
}
