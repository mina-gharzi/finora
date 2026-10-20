import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportsView } from "@/components/reports/reports-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import {
  BALANCE_TREND_RANGE_PARAM,
  parseBalanceTrendRange,
} from "@/lib/finance/balance-trend";
import { getBalanceTrendData } from "@/lib/finance/balance-trend-data";
import { getReportsData } from "@/lib/finance/reports";
import {
  REPORT_MONTH_OPTIONS,
  parseReportsMonthParam,
  recentMonthOptions,
  reportsMonthFromKey,
  REPORTS_MONTH_PARAM,
} from "@/lib/finance/reports-range";

export const metadata: Metadata = {
  title: "گزارش‌ها",
};

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

/**
 * "Today" for month resolution. The stored `occurred_on` column is a calendar
 * day with no time zone, so a single deterministic reference is used (UTC),
 * the same default the shared Jalali formatter uses. This is a documented
 * limitation near local midnight.
 */
function currentUtcDateIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function AuthenticatedReports({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await requireUserId();
  const params = await searchParams;
  const todayIso = currentUtcDateIso();

  // Never trust the URL: unknown or hostile month params fall back to the
  // current Jalali month.
  const month = reportsMonthFromKey(
    parseReportsMonthParam(params[REPORTS_MONTH_PARAM], todayIso),
  );

  // The balance window length is separate from the selected report month and
  // always ends at the current Jalali month; an unknown value falls back safely.
  const balanceRange = parseBalanceTrendRange(
    params[BALANCE_TREND_RANGE_PARAM],
  );

  const [data, balanceTrend] = await Promise.all([
    getReportsData(userId, month),
    getBalanceTrendData(userId, todayIso, balanceRange),
  ]);

  // The selector offers recent months (newest first); a crafted URL may
  // select an older month, so ensure it appears in the list too.
  let monthOptions = recentMonthOptions(todayIso);
  if (!monthOptions.some((option) => option.param === month.param)) {
    monthOptions = [
      { param: month.param, label: month.label },
      ...monthOptions,
    ].slice(0, REPORT_MONTH_OPTIONS);
  }

  return (
    <ReportsView
      monthOptions={monthOptions}
      selectedParam={month.param}
      monthLabel={month.label}
      rangeLabel={month.rangeLabel}
      previousLabel={data.previous.label}
      totals={data.totals}
      comparison={data.comparison}
      trend={data.trend}
      categoryBreakdown={data.categoryBreakdown}
      hasTransactions={data.hasTransactions}
      balanceRange={balanceTrend.range}
      balancePoints={balanceTrend.points}
      balanceCurrent={balanceTrend.currentBalance}
      hasAccounts={balanceTrend.hasAccounts}
    />
  );
}

function ReportsFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<ReportsFallback />}>
      <AuthenticatedReports searchParams={searchParams} />
    </Suspense>
  );
}
