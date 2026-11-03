import type { MobileBudgetsResponse } from "@finora/shared";
import { getBudgetsData } from "@/lib/finance/budgets";
import {
  budgetsMonthFromKey,
  parseBudgetsMonthParam,
} from "@/lib/finance/budgets-range";
import { todayInTehranIso } from "@/lib/finance/today";
import { authenticateMobileRequest, mobileJson } from "@/lib/mobile/http";

/**
 * GET /api/v1/budgets?month=YYYY-MM (Jalali)
 *
 * The selected month's budgets with progress, plus the eligible expense
 * categories. Month parsing and the domain query are shared with the web page.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const monthKey = parseBudgetsMonthParam(
    searchParams.get("month") ?? undefined,
    todayInTehranIso(),
  );
  const month = budgetsMonthFromKey(monthKey);
  const data = await getBudgetsData(auth.userId, month.from);

  const response: MobileBudgetsResponse = {
    monthStart: data.monthStart,
    monthEnd: data.monthEnd,
    expenseCategories: data.expenseCategories.map((category) => ({
      id: category.id,
      name: category.name,
      archived: category.archived,
    })),
    budgets: data.budgets.map((budget) => ({
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.categoryName,
      categoryArchived: budget.categoryArchived,
      monthStart: budget.monthStart,
      limitAmount: budget.limitAmount,
      progress: budget.progress,
    })),
    hasExpenseCategories: data.hasExpenseCategories,
  };

  return mobileJson(response);
}
