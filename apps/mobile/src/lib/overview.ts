import type { MobileOverviewResponse } from "@finora/shared";

import type {
  FixtureAccountKind,
  FixtureTransactionKind,
  OverviewFixture,
} from "../data/fixtures.ts";

export const ACCOUNT_KIND_LABELS: Record<FixtureAccountKind, string> = {
  cash: "نقدی",
  bank: "بانکی",
  wallet: "کیف پول",
};

export interface OverviewSummary {
  balance: number;
  income: number;
  expense: number;
  net: number;
  rangeLabel: string;
}

export interface OverviewAccount {
  id: string;
  name: string;
  kind: FixtureAccountKind;
  kindLabel: string;
  balance: number;
}

export interface OverviewCategorySlice {
  id: string;
  name: string;
  amount: number;
  percent: number;
}

export interface OverviewTransaction {
  id: string;
  kind: FixtureTransactionKind;
  categoryName: string;
  accountName: string;
  amount: number;
  occurredOn: string;
  note: string;
}

export interface Overview {
  summary: OverviewSummary;
  accounts: OverviewAccount[];
  categoryBreakdown: OverviewCategorySlice[];
  recentTransactions: OverviewTransaction[];
  hasAccounts: boolean;
  hasTransactions: boolean;
}

export function buildOverview(fixture: OverviewFixture): Overview {
  const accountById = new Map(
    fixture.accounts.map((account) => [account.id, account]),
  );
  const categoryById = new Map(
    fixture.categories.map((category) => [category.id, category]),
  );

  const balance = fixture.accounts.reduce(
    (total, account) => total + account.balance,
    0,
  );
  const income = fixture.transactions
    .filter((transaction) => transaction.kind === "income")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const expense = fixture.transactions
    .filter((transaction) => transaction.kind === "expense")
    .reduce((total, transaction) => total + transaction.amount, 0);

  const categoryAmounts = new Map<string, number>();
  for (const transaction of fixture.transactions) {
    if (transaction.kind !== "expense") {
      continue;
    }

    categoryAmounts.set(
      transaction.categoryId,
      (categoryAmounts.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
  }

  const categoryBreakdown = [...categoryAmounts.entries()]
    .map(([categoryId, amount]) => {
      const category = categoryById.get(categoryId);
      const percent = expense > 0 ? Math.round((amount / expense) * 100) : 0;

      return {
        id: categoryId,
        name: category?.name ?? "بدون دسته‌بندی",
        amount,
        percent,
      };
    })
    .sort((left, right) => right.amount - left.amount);

  const recentTransactions = [...fixture.transactions]
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
    .slice(0, 5)
    .map((transaction) => {
      const account = accountById.get(transaction.accountId);
      const category = categoryById.get(transaction.categoryId);

      return {
        id: transaction.id,
        kind: transaction.kind,
        categoryName: category?.name ?? "بدون دسته‌بندی",
        accountName: account?.name ?? "حساب نامشخص",
        amount: transaction.amount,
        occurredOn: transaction.occurredOn,
        note: transaction.note,
      };
    });

  return {
    summary: {
      balance,
      income,
      expense,
      net: income - expense,
      rangeLabel: fixture.asOf,
    },
    accounts: fixture.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      kindLabel: ACCOUNT_KIND_LABELS[account.kind],
      balance: account.balance,
    })),
    categoryBreakdown,
    recentTransactions,
    hasAccounts: fixture.accounts.length > 0,
    hasTransactions: fixture.transactions.length > 0,
  };
}

export function mapMobileOverview(response: MobileOverviewResponse): Overview {
  const balance = response.accountBalances.reduce(
    (total, account) => total + account.balance,
    0,
  );

  const expenseTotal = response.totals.expense;
  const categoryBreakdown = response.categoryBreakdown
    .map((category) => {
      const amount = category.amount;
      const percent =
        expenseTotal > 0 ? Math.round((amount / expenseTotal) * 100) : 0;
      return {
        id: category.categoryId ?? category.categoryName ?? "uncategorized",
        name: category.categoryName ?? "بدون دسته‌بندی",
        amount,
        percent,
      };
    })
    .sort((left, right) => right.amount - left.amount);

  return {
    summary: {
      balance,
      income: response.totals.income,
      expense: response.totals.expense,
      net: response.totals.net,
      rangeLabel: response.rangeLabel,
    },
    accounts: response.accountBalances.map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.type as FixtureAccountKind,
      kindLabel: ACCOUNT_KIND_LABELS[account.type as FixtureAccountKind],
      balance: account.balance,
    })),
    categoryBreakdown,
    recentTransactions: response.recentTransactions.map((transaction) => ({
      id: transaction.id,
      kind: transaction.type,
      categoryName: transaction.categoryName ?? "بدون دسته‌بندی",
      accountName: transaction.accountName,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      note: transaction.note,
    })),
    hasAccounts: response.hasAccounts,
    hasTransactions: response.hasTransactions,
  };
}
