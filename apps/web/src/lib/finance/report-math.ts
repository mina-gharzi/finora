/**
 * Month-over-month comparison rules for the reports experience. Pure integer
 * arithmetic — no `server-only`, no database, no formatting — so the rules are
 * unit tested in isolation and shared by the DAL and the view.
 *
 * Calculation rules, stated explicitly (Stage 14 brief):
 * - Income totals count only income transactions in the period; expense
 *   totals only expense transactions (enforced upstream by the aggregate
 *   queries in `dashboard.ts`, which this module never re-implements).
 * - Net cash flow is `income − expense` and may be negative. Opening balances
 *   are never part of period metrics; they live only in account balances.
 * - `delta = current − previous`, signed, in integer Toman. Both inputs are
 *   safe integers (guaranteed by `toTomanFromAggregate`), but their difference
 *   can in principle overflow, so the delta is range-checked: this module
 *   throws rather than silently losing precision.
 * - `percent` is the whole-percent change of the delta relative to
 *   `previous`, rounded half-away-from-zero via `Math.round`. It is `null`
 *   whenever `previous ≤ 0`: a zero base has no defined percentage change
 *   (division by zero), and a negative base (possible for net) would make the
 *   sign of the percentage mean the opposite of the sign of the delta. The UI
 *   renders `null` as a neutral "ناموجود" state and still shows the absolute
 *   delta, which is always meaningful.
 */

/** Income, expense and signed net for one period, in integer Toman. */
export interface PeriodTotals {
  income: number;
  expense: number;
  /** `income − expense`; may be negative. */
  net: number;
}

/** One metric's month-over-month comparison. */
export interface MetricChange {
  current: number;
  previous: number;
  /** `current − previous`; signed, may be negative. */
  delta: number;
  /**
   * Whole-percent change versus `previous`, or `null` when `previous ≤ 0`
   * (see the module documentation for why).
   */
  percent: number | null;
}

/** All three metrics of a month-over-month comparison. */
export interface PeriodComparison {
  income: MetricChange;
  expense: MetricChange;
  net: MetricChange;
}

/**
 * Compares one metric for the selected month against the previous month.
 *
 * @throws {RangeError} when `current − previous` leaves the safe-integer
 * range (unreachable with amounts produced by `toTomanFromAggregate`, but
 * this module throws rather than silently losing precision).
 */
export function compareMetric(
  current: number,
  previous: number,
): MetricChange {
  const delta = current - previous;
  if (!Number.isSafeInteger(delta)) {
    throw new RangeError(
      "Comparison delta exceeds the safe integer range.",
    );
  }
  const percent = previous > 0 ? Math.round((delta / previous) * 100) : null;
  return { current, previous, delta, percent };
}

/** Compares all three period metrics (income, expense, signed net). */
export function comparePeriods(
  current: PeriodTotals,
  previous: PeriodTotals,
): PeriodComparison {
  return {
    income: compareMetric(current.income, previous.income),
    expense: compareMetric(current.expense, previous.expense),
    net: compareMetric(current.net, previous.net),
  };
}
