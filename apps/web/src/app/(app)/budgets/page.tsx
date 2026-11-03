import { Suspense } from "react";
import type { Metadata } from "next";
import { BudgetsView } from "@/components/budgets/budgets-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { getBudgetsData } from "@/lib/finance/budgets";
import {
  BUDGETS_MONTH_PARAM,
  budgetsMonthFromKey,
  parseBudgetsMonthParam,
  recentBudgetMonthOptions,
} from "@/lib/finance/budgets-range";
import { REPORT_MONTH_OPTIONS } from "@/lib/finance/reports-range";
import { todayInTehranIso } from "@/lib/finance/today";

export const metadata: Metadata = {
  title: "بودجه‌ها",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function AuthenticatedBudgets({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await requireUserId();
  const params = await searchParams;
  const todayIso = todayInTehranIso();

  // Never trust the URL: unknown or hostile month params fall back to the
  // current Jalali month.
  const month = budgetsMonthFromKey(
    parseBudgetsMonthParam(params[BUDGETS_MONTH_PARAM], todayIso),
  );

  const data = await getBudgetsData(userId, month.from);

  // The selector offers recent months (newest first); a crafted URL may select
  // an older month, so ensure it appears in the list too.
  let monthOptions = recentBudgetMonthOptions(todayIso);
  if (!monthOptions.some((option) => option.param === month.param)) {
    monthOptions = [{ param: month.param, label: month.label }, ...monthOptions].slice(
      0,
      REPORT_MONTH_OPTIONS,
    );
  }

  return (
    <BudgetsView
      monthOptions={monthOptions}
      selectedParam={month.param}
      monthLabel={month.label}
      monthStart={data.monthStart}
      expenseCategories={data.expenseCategories}
      budgets={data.budgets}
      hasExpenseCategories={data.hasExpenseCategories}
    />
  );
}

function BudgetsFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function BudgetsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<BudgetsFallback />}>
      <AuthenticatedBudgets searchParams={searchParams} />
    </Suspense>
  );
}
