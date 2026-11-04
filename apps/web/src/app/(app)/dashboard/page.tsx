import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { hasAnyBudgets } from "@/lib/finance/budgets";
import { getDashboardData } from "@/lib/finance/dashboard";
import {
  parseDashboardPeriod,
  resolveDashboardRange,
  type DashboardPeriod,
} from "@/lib/finance/dashboard-range";
import { todayInTehranIso } from "@/lib/finance/today";

export const metadata: Metadata = {
  title: "داشبورد",
};

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

async function AuthenticatedDashboard({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await requireUserId();
  const params = await searchParams;

  // Never trust the URL: unknown periods fall back to the default.
  const period: DashboardPeriod = parseDashboardPeriod(params.period);
  const range = resolveDashboardRange(period, todayInTehranIso());

  const [data, hasBudgets] = await Promise.all([
    getDashboardData(userId, range),
    hasAnyBudgets(userId),
  ]);

  return (
    <DashboardView
      period={period}
      rangeLabel={range.label}
      totals={data.totals}
      categoryBreakdown={data.categoryBreakdown}
      accountBalances={data.accountBalances}
      recentTransactions={data.recentTransactions}
      hasAccounts={data.hasAccounts}
      hasTransactions={data.hasTransactions}
      hasBudgets={hasBudgets}
    />
  );
}

function DashboardFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <AuthenticatedDashboard searchParams={searchParams} />
    </Suspense>
  );
}
