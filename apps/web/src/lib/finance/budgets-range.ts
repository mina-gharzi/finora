import {
  REPORTS_MONTH_PARAM,
  parseReportsMonthParam,
  recentMonthOptions,
  reportsMonthFromKey,
  type JalaliMonthKey,
  type MonthOption,
  type ReportsMonth,
} from "./reports-range";

/**
 * Month selection for the budgets page. Budgets are keyed by the first calendar
 * day of a Jalali month — exactly the convention the dashboard, reports and
 * transaction history already use — so the parsing and calendar arithmetic are
 * reused verbatim from `reports-range.ts` rather than duplicated.
 *
 * The query-string key is distinct (`?month=…` here, matching reports' own key
 * but on the `/budgets` route) so the budgets selector is independent of the
 * reports selector.
 */

/** Query-string key used by `/budgets?month=…`. */
export const BUDGETS_MONTH_PARAM = REPORTS_MONTH_PARAM;

export type { JalaliMonthKey, MonthOption, ReportsMonth };

/**
 * Normalizes an untrusted `?month=` value, falling back to the Jalali month
 * containing `todayIso` for anything malformed or out of range.
 */
export function parseBudgetsMonthParam(
  value: string | string[] | undefined,
  todayIso: string,
): JalaliMonthKey {
  return parseReportsMonthParam(value, todayIso);
}

/** Builds the full month view model (label, Gregorian bounds, param). */
export function budgetsMonthFromKey(key: JalaliMonthKey): ReportsMonth {
  return reportsMonthFromKey(key);
}

/** Recent Jalali months for the selector, newest first. */
export function recentBudgetMonthOptions(
  todayIso: string,
  count?: number,
): MonthOption[] {
  return recentMonthOptions(todayIso, count);
}
