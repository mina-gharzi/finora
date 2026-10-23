import { NextResponse } from "next/server";
import type {
  MobileAccountType,
  MobileDashboardPeriod,
  MobileOverviewResponse,
} from "@finora/shared";
import { getDashboardData } from "@/lib/finance/dashboard";
import {
  parseDashboardPeriod,
  resolveDashboardRange,
} from "@/lib/finance/dashboard-range";
import { verifyMobileBearerToken } from "@/lib/mobile/auth";

const NO_STORE = { "Cache-Control": "no-store" };

function currentUtcDateIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await verifyMobileBearerToken(
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const { searchParams } = new URL(request.url);
  const period: MobileDashboardPeriod = parseDashboardPeriod(
    searchParams.get("period") ?? undefined,
  );
  const range = resolveDashboardRange(period, currentUtcDateIso());
  const data = await getDashboardData(auth.userId, range);

  const response: MobileOverviewResponse = {
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
  };

  return NextResponse.json(response, { status: 200, headers: NO_STORE });
}
