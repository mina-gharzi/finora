import {
  currentJalaliMonthKey,
  reportsMonthFromKey,
  shiftJalaliMonthKey,
  type ReportsMonth,
} from "./reports-range";

/**
 * Historical tracked-account balance trend — pure window and accumulation
 * logic. Like `dashboard-range.ts` and `reports-range.ts`, this module is free
 * of `server-only` and of any database import, so the month math is unit
 * tested in isolation and shared by the page, the DAL and the view.
 *
 * Metric (see the schema and `dashboard.ts` for the source of truth): the trend
 * plots the **combined balance of the owner's tracked accounts** at the end of
 * each Jalali month, defined as
 *
 *   opening balance total  +  Σ(income where occurred_on ≤ month end)
 *                          −  Σ(expense where occurred_on ≤ month end)
 *
 * over the accounts' full history. This is deliberately **not** a full net
 * worth: Finora models cash/bank/wallet accounts only, with no liabilities,
 * investments or external assets, so the honest label is "combined tracked
 * account balance", never "net worth".
 *
 * Calendar semantics (matching the rest of the app): a "month" is a Jalali
 * month; inclusive Gregorian bounds (`YYYY-MM-DD`) are derived from the Jalali
 * calendar through ICU. A point is taken at **month end** (the balance includes
 * the whole month), consistently for every point in the window.
 */

/** Selectable window lengths (in Jalali months), newest last. */
export const BALANCE_TREND_RANGES = [6, 12, 24] as const;

export type BalanceTrendRange = (typeof BALANCE_TREND_RANGES)[number];

/** Default window when no valid `?range=` is present. */
export const DEFAULT_BALANCE_TREND_RANGE: BalanceTrendRange = 12;

/** Query-string key used by `/reports?range=…` for the balance window. */
export const BALANCE_TREND_RANGE_PARAM = "range";

/** Persian labels for each selectable window length. */
export const BALANCE_TREND_RANGE_LABELS: Record<BalanceTrendRange, string> = {
  6: "۶ ماه",
  12: "۱۲ ماه",
  24: "۲۴ ماه",
};

/**
 * Normalizes an untrusted `?range=` value to a supported window length.
 * Anything else — a wrong shape, an unsupported number, an array's non-first
 * value — falls back to the default so a hostile query string can never throw.
 */
export function parseBalanceTrendRange(
  value: string | string[] | undefined,
): BalanceTrendRange {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return (BALANCE_TREND_RANGES as readonly number[]).includes(parsed)
    ? (parsed as BalanceTrendRange)
    : DEFAULT_BALANCE_TREND_RANGE;
}

/**
 * The `count` consecutive Jalali months ending at the month containing
 * `todayIso`, oldest first — e.g. with a مهر selection and count 6, the window
 * is اردیبهشت … مهر. Future months are never included. `count` is normally one
 * of `BALANCE_TREND_RANGES`; it is typed as a positive integer so the window
 * math is testable at any length.
 */
export function buildBalanceWindow(
  todayIso: string,
  count: number,
): ReportsMonth[] {
  const endKey = currentJalaliMonthKey(todayIso);
  const months: ReportsMonth[] = [];
  for (let offset = -(count - 1); offset <= 0; offset += 1) {
    months.push(reportsMonthFromKey(shiftJalaliMonthKey(endKey, offset)));
  }
  return months;
}

/** One plotted point: the account balance at the end of a Jalali month. */
export interface BalanceTrendPoint {
  /** `YYYY-MM` Jalali month param. */
  param: string;
  /** Persian "ماه سال" label, e.g. `مهر 1405`. */
  label: string;
  /** Persian month name without the year, e.g. `مهر`. */
  shortLabel: string;
  /** Combined tracked-account balance at month end (integer Toman). */
  balance: number;
  /** Income recorded within the month. */
  income: number;
  /** Expense recorded within the month. */
  expense: number;
  /** `income − expense` for the month; may be negative. */
  net: number;
  /**
   * Signed change from the previous plotted month's balance; `null` for the
   * first point in the window (there is no earlier point to compare against).
   */
  change: number | null;
}

/** Inputs needed to accumulate the plotted points. */
export interface BalanceTrendInputs {
  /** Sum of every account's opening balance (unanchored in time). */
  openingBalanceTotal: number;
  /** Signed net recorded strictly before the window's first month. */
  beforeNet: number;
  /** One `{ income, expense, net }` per window month, in window order. */
  monthly: ReadonlyArray<{ income: number; expense: number; net: number }>;
}

/**
 * Accumulates the running balance at each month end and pairs it with the
 * window months. All arithmetic is integer-safe: a non-safe result throws
 * rather than silently losing precision.
 *
 * @throws {RangeError} when a running balance leaves the safe integer range.
 */
export function computeBalancePoints(
  months: readonly ReportsMonth[],
  inputs: BalanceTrendInputs,
): BalanceTrendPoint[] {
  let running = inputs.openingBalanceTotal + inputs.beforeNet;
  if (!Number.isSafeInteger(running)) {
    throw new RangeError("Balance leaves the safe integer range.");
  }

  return months.map((month, index) => {
    const delta = inputs.monthly[index] ?? { income: 0, expense: 0, net: 0 };
    const previous = running;
    running += delta.net;
    if (!Number.isSafeInteger(running)) {
      throw new RangeError("Balance leaves the safe integer range.");
    }
    return {
      param: month.param,
      label: month.label,
      shortLabel: month.shortLabel,
      balance: running,
      income: delta.income,
      expense: delta.expense,
      net: delta.net,
      change: index === 0 ? null : running - previous,
    };
  });
}
