import "server-only";

import type {
  MobileAccountType,
  MobileDashboardPeriod,
  MobileOverviewResponse,
} from "@finora/shared";
import { hasAnyBudgets } from "@/lib/finance/budgets";
import { getDashboardData } from "@/lib/finance/dashboard";
import { resolveDashboardRange } from "@/lib/finance/dashboard-range";
import { todayInTehranIso } from "@/lib/finance/today";

/**
 * Builds the mobile dashboard overview payload for one owner and period.
 * Extracted from the legacy `/api/mobile/overview` handler so the versioned
 * route can reuse the exact same shape and financial semantics.
 */
export async function buildMobileOverview(
  userId: string,
  period: MobileDashboardPeriod,
): Promise<MobileOverviewResponse> {
  const range = resolveDashboardRange(period, todayInTehranIso());
  const [data, hasBudgets] = await Promise.all([
    getDashboardData(userId, range),
    hasAnyBudgets(userId),
  ]);

  return {
    period,
    rangeLabel: range.label,
    totals: data.totals,
    categoryBreakdown: data.categoryBreakdown,
    accountBalances: data.accountBalances.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type as MobileAccountType,
      balance: account.balance,
    })),
    recentTransactions: data.recentTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      note: transaction.note,
      accountName: transaction.accountName,
      categoryName: transaction.categoryName,
    })),
    hasAccounts: data.hasAccounts,
    hasTransactions: data.hasTransactions,
    hasBudgets,
  };
}
