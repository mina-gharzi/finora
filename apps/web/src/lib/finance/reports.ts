import "server-only";
import {
  getCategoryExpenseBreakdown,
  getPeriodTotals,
  hasAnyTransactions,
  type CategoryExpenseSlice,
} from "./dashboard";
import {
  comparePeriods,
  type PeriodComparison,
  type PeriodTotals,
} from "./report-math";
import {
  buildTrendWindow,
  type ReportsMonth,
} from "./reports-range";

/**
 * Server-side data access for the financial reports page.
 *
 * This module adds no SQL of its own: every figure is fetched through the
 * owner-scoped aggregate helpers in `dashboard.ts` (`getPeriodTotals`,
 * `getCategoryExpenseBreakdown`, `hasAnyTransactions`), which compute in the
 * database and resolve the owner from the verified session. The `userId`
 * argument is always the server-resolved id; it is never read from client
 * input, and personalized results are never shared across users.
 *
 * Financial semantics (inherited unchanged from `dashboard.ts`):
 * - Amounts are integer Toman, always positive; `type` carries the direction.
 * - Period metrics cover the inclusive calendar-day range only; opening
 *   balances are deliberately excluded — they appear only in account
 *   balances, never in income/expense/net.
 * - Net cash flow is `income − expense` and may be negative.
 * - Expenses without a category are a null bucket rendered as
 *   "بدون دسته‌بندی"; deleting a category moves its transactions there.
 *
 * Structure of the payload:
 * - A six-month trend window of consecutive Jalali months ending at the
 *   selection (oldest first). The selected month's totals double as the last
 *   trend point, and the month before it as the comparison baseline, so each
 *   month's totals are fetched exactly once.
 * - A month-over-month comparison of the selected month against the previous
 *   Jalali month, following the rules in `report-math.ts`.
 * - The selected month's expense breakdown by category, largest first.
 */

/** One point of the six-month income/expense trend. */
export interface ReportsTrendPoint {
  /** `YYYY-MM` param for the month (Jalali). */
  param: string;
  /** Persian "ماه سال" label, e.g. `مهر 1405`. */
  label: string;
  /** Persian month name without the year, e.g. `مهر`. */
  shortLabel: string;
  income: number;
  expense: number;
  /** `income − expense`; may be negative. */
  net: number;
}

/** Everything the reports page renders for one user and one selected month. */
export interface ReportsData {
  /** The Jalali month selected in the URL (already normalized). */
  selected: ReportsMonth;
  /** The Jalali month immediately before `selected`. */
  previous: ReportsMonth;
  /** Selected-month income, expense and net. */
  totals: PeriodTotals;
  /** Previous-month income, expense and net (the comparison baseline). */
  previousTotals: PeriodTotals;
  /** Month-over-month comparison rules applied to the two totals above. */
  comparison: PeriodComparison;
  /** `REPORT_TREND_MONTHS` consecutive months, oldest first, ending at `selected`. */
  trend: ReportsTrendPoint[];
  /** Selected-month expenses grouped by category, largest first. */
  categoryBreakdown: CategoryExpenseSlice[];
  /** True when the owner has at least one transaction in total. */
  hasTransactions: boolean;
}

/**
 * Assembles the full reports payload for `userId` and the selected month.
 *
 * Eight independent aggregate queries are issued together (six monthly
 * totals, one category breakdown, one existence probe); none of them reads
 * across users.
 */
export async function getReportsData(
  userId: string,
  selected: ReportsMonth,
): Promise<ReportsData> {
  const trendWindow = buildTrendWindow(selected.key);
  const previous = trendWindow[trendWindow.length - 2];
  if (!previous) {
    // Unreachable: buildTrendWindow always returns REPORT_TREND_MONTHS ≥ 2.
    throw new RangeError("The trend window is missing the previous month.");
  }

  const [trendTotals, categoryBreakdown, anyTx] = await Promise.all([
    Promise.all(
      trendWindow.map((month) =>
        getPeriodTotals(userId, { from: month.from, to: month.to }),
      ),
    ),
    getCategoryExpenseBreakdown(userId, {
      from: selected.from,
      to: selected.to,
    }),
    hasAnyTransactions(userId),
  ]);

  // The last trend point is the selected month; the one before it is the
  // previous month, so neither totals set is fetched twice.
  const totals = trendTotals[trendTotals.length - 1] as PeriodTotals;
  const previousTotals = trendTotals[trendTotals.length - 2] as PeriodTotals;

  const trend: ReportsTrendPoint[] = trendWindow.map((month, index) => {
    const monthTotals = trendTotals[index] as PeriodTotals;
    return {
      param: month.param,
      label: month.label,
      shortLabel: month.shortLabel,
      income: monthTotals.income,
      expense: monthTotals.expense,
      net: monthTotals.net,
    };
  });

  return {
    selected,
    previous,
    totals,
    previousTotals,
    comparison: comparePeriods(totals, previousTotals),
    trend,
    categoryBreakdown,
    hasTransactions: anyTx,
  };
}
