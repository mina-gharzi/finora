/**
 * Budget progress and status math. Pure, dependency-free (no `server-only`, no
 * database) so it is fully unit-testable and shared by the data layer and the
 * view.
 *
 * Financial semantics:
 * - A budget is a positive integer Toman limit for one expense category over one
 *   month. Spending is a non-negative integer Toman total of that category's
 *   expense transactions in the month.
 * - `remaining = limit − spending`. It may be negative when spending exceeds
 *   the limit; the overspend amount is preserved (never clamped to zero).
 * - `percent = spending / limit × 100` as a plain (possibly fractional) number
 *   for display. The visual progress width is derived separately and clamped.
 * - Status is communicated as text by the caller, never by colour alone:
 *   - `ok`         — below the warning threshold.
 *   - `approaching`— at or above the warning threshold but below the limit.
 *   - `reached`    — exactly at the limit (100%).
 *   - `exceeded`   — above the limit (>100%).
 *
 * All arithmetic stays within safe integers: the computed values are bounded by
 * the input magnitudes and `remaining`/`overspend` are exact integer differences.
 */

/** Percentage of the limit at which a budget is flagged as approaching. */
export const BUDGET_WARNING_THRESHOLD = 80;

export type BudgetSpendStatus = "ok" | "approaching" | "reached" | "exceeded";

export interface BudgetProgress {
  /** The budget limit in integer Toman (always > 0). */
  limit: number;
  /** Expense total for the category in the month, in integer Toman (>= 0). */
  spending: number;
  /** `limit − spending`; negative means overspent. */
  remaining: number;
  /**
   * `spending / limit × 100` as a plain number (may exceed 100 or be
   * fractional). Use `progressWidthPercent` for a clamped bar width.
   */
  percent: number;
  /** Status bucket, derived from `percent`. */
  status: BudgetSpendStatus;
  /** Amount over the limit, in integer Toman; 0 when within budget. */
  overspend: number;
}

/**
 * Computes progress for a budget. Both inputs must be non-negative integers and
 * `limit` must be positive; invalid inputs throw rather than silently producing
 * a misleading figure.
 */
export function computeBudgetProgress(
  limit: number,
  spending: number,
): BudgetProgress {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("Budget limit must be a positive integer.");
  }
  if (!Number.isSafeInteger(spending) || spending < 0) {
    throw new RangeError("Budget spending must be a non-negative integer.");
  }

  const remaining = limit - spending;
  const percent = (spending / limit) * 100;
  const overspend = spending > limit ? spending - limit : 0;

  let status: BudgetSpendStatus;
  if (spending > limit) {
    status = "exceeded";
  } else if (spending === limit) {
    status = "reached";
  } else if (percent >= BUDGET_WARNING_THRESHOLD) {
    status = "approaching";
  } else {
    status = "ok";
  }

  return { limit, spending, remaining, percent, status, overspend };
}

/**
 * The bar width for the progress indicator, clamped to 0–100. A budget at or
 * over its limit therefore renders a full bar; the over-limit amount is
 * communicated separately (`overspend`) so clamping never hides it.
 */
export function progressWidthPercent(progress: BudgetProgress): number {
  if (progress.percent <= 0) return 0;
  if (progress.percent >= 100) return 100;
  return progress.percent;
}
