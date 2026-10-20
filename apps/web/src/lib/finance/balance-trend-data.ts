import "server-only";
import {
  getBalanceHistory,
  getOpeningBalanceTotal,
  hasAnyAccounts,
  hasAnyTransactions,
} from "./dashboard";
import {
  buildBalanceWindow,
  computeBalancePoints,
  type BalanceTrendPoint,
  type BalanceTrendRange,
} from "./balance-trend";

/**
 * Server-side data access for the historical tracked-account balance trend.
 *
 * It reuses the owner-scoped balance primitives in `dashboard.ts` and adds no
 * balance semantics of its own: the running balance is
 * `opening balance total + Σ income − Σ expense` over the accounts' full
 * history, evaluated at each Jalali month end. The `userId` is always the
 * server-resolved session id, never client input.
 *
 * Query plan: at most three bounded queries regardless of window length — the
 * opening-balance total, the pre-window net and the per-month buckets (all from
 * `getOpeningBalanceTotal` / `getBalanceHistory`) plus one existence probe. No
 * query is issued per row and none reads across users.
 *
 * Honesty of the metric: this is the combined balance of the owner's *tracked*
 * accounts, not a full net worth. Opening balances have no effective date, so
 * the earliest plotted month already includes them; the window is still bounded
 * to recent months and never invents pre-history. Archived accounts are
 * included because archiving is not a financial event. Accounts with history
 * cannot be deleted (only empty ones can), so a missing account cannot silently
 * erase historical transactions.
 */

/** Everything the balance trend card renders for one owner and window. */
export interface BalanceTrendData {
  /** The number of months plotted. */
  range: BalanceTrendRange;
  /** Oldest-first plotted points, ending at the current Jalali month. */
  points: BalanceTrendPoint[];
  /** The most recent point's balance (also the current combined balance). */
  currentBalance: number;
  /** True when the owner has at least one transaction in total. */
  hasTransactions: boolean;
  /** True when the owner has at least one account (even with no transactions). */
  hasAccounts: boolean;
}

/**
 * Assembles the balance trend for `userId` over `range` Jalali months ending at
 * the month containing `todayIso`.
 */
export async function getBalanceTrendData(
  userId: string,
  todayIso: string,
  range: BalanceTrendRange,
): Promise<BalanceTrendData> {
  const months = buildBalanceWindow(todayIso, range);

  const [openingBalanceTotal, history, anyTx, anyAccount] = await Promise.all([
    getOpeningBalanceTotal(userId),
    getBalanceHistory(
      userId,
      months.map((month) => ({ from: month.from, to: month.to })),
    ),
    hasAnyTransactions(userId),
    hasAnyAccounts(userId),
  ]);

  const points = computeBalancePoints(months, {
    openingBalanceTotal,
    beforeNet: history.beforeNet,
    monthly: history.monthly,
  });

  return {
    range,
    points,
    currentBalance: points[points.length - 1]?.balance ?? openingBalanceTotal,
    hasTransactions: anyTx,
    hasAccounts: anyAccount,
  };
}
