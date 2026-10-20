import "server-only";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { toTomanFromAggregate } from "./money";
import type { AccountType, TransactionType } from "./types";

/**
 * Server-side data access for the dashboard overview.
 *
 * Every query is scoped by the owner id resolved from the verified session and
 * passed in as `userId`; it is never read from client input. Aggregates are
 * computed in the database rather than by fetching rows into the client, and
 * each summary is a single grouped query (no N+1).
 *
 * Financial semantics (see the schema for the source of truth):
 * - Amounts are integer Toman, always positive; `type` carries the direction.
 * - Period metrics (`income`, `expense`, `net`) cover the inclusive calendar-day
 *   range only.
 * - An account's current balance is `opening_balance + income - expense` over
 *   the account's **entire** history (opening balance is the balance before any
 *   recorded transaction). It is deliberately independent of the selected range.
 * - The reference-safety guarantees in the transaction DAL mean a transaction's
 *   account and category always belong to the same owner, so joining on them
 *   cannot surface another user's data nor duplicate amounts.
 */

export interface DashboardRangeBounds {
  /** Inclusive Gregorian lower bound (`YYYY-MM-DD`), or null for all time. */
  from: string | null;
  /** Inclusive Gregorian upper bound (`YYYY-MM-DD`), or null for all time. */
  to: string | null;
}

export interface DashboardTotals {
  income: number;
  expense: number;
  net: number;
}

export interface CategoryExpenseSlice {
  /** Null is the "no category" bucket. */
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
}

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  /** True when the account is archived (still shown; money is still there). */
  archived: boolean;
  /** opening_balance + income - expense across the account's full history. */
  balance: number;
}

export interface RecentTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  occurredOn: string;
  note: string;
  accountId: string;
  accountName: string;
  categoryName: string | null;
}

export interface DashboardData {
  totals: DashboardTotals;
  categoryBreakdown: CategoryExpenseSlice[];
  accountBalances: AccountBalance[];
  recentTransactions: RecentTransaction[];
  /** True when the owner has at least one account (for the onboarding state). */
  hasAccounts: boolean;
  /** True when the owner has at least one transaction in total. */
  hasTransactions: boolean;
}

/** Most recent transactions shown on the dashboard. */
export const DASHBOARD_RECENT_LIMIT = 5;

/** `type = 'income' | 'expense'` conditions, plus an optional date window. */
function rangeConditions(userId: string, range: DashboardRangeBounds) {
  const conditions = [eq(transactions.userId, userId)];
  if (range.from) {
    conditions.push(gte(transactions.occurredOn, range.from));
  }
  if (range.to) {
    conditions.push(lte(transactions.occurredOn, range.to));
  }
  return conditions;
}

/**
 * Income, expense and net for the range, in a single aggregate query. Net is
 * `income - expense` and may be negative. The two directions are summed
 * separately from the same rows, so nothing is double-counted.
 */
export async function getPeriodTotals(
  userId: string,
  range: DashboardRangeBounds,
): Promise<DashboardTotals> {
  const [row] = await getDb()
    .select({
      income: sql<string | null>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      expense: sql<string | null>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(and(...rangeConditions(userId, range)));

  const income = toTomanFromAggregate(row?.income);
  const expense = toTomanFromAggregate(row?.expense);
  return { income, expense, net: income - expense };
}

/**
 * Expense totals for the range grouped by category, largest first. Transactions
 * without a category are grouped into a null bucket the UI renders as
 * "بدون دسته‌بندی". The join only resolves a display name; grouping by
 * category keeps each expense counted exactly once.
 */
export async function getCategoryExpenseBreakdown(
  userId: string,
  range: DashboardRangeBounds,
): Promise<CategoryExpenseSlice[]> {
  const rows = await getDb()
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      amount: sql<string | null>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(eq(transactions.type, "expense"), ...rangeConditions(userId, range)),
    )
    .groupBy(transactions.categoryId, categories.name)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  return rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    amount: toTomanFromAggregate(row.amount),
  }));
}

/**
 * Current balance of every account owned by `userId`, over full history
 * (`opening_balance + income - expense`). ARCHIVED accounts are intentionally
 * included: archiving is a lifecycle flag, not a financial event, so their
 * stored money and transactions must keep counting. A left join keeps accounts
 * that have no transactions; grouping by the account guarantees its rows are
 * not multiplied by the join.
 */
export async function getAccountBalances(
  userId: string,
): Promise<AccountBalance[]> {
  const rows = await getDb()
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      archived: accounts.archived,
      openingBalance: accounts.openingBalance,
      income: sql<string | null>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      expense: sql<string | null>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.userId, userId))
    .groupBy(
      accounts.id,
      accounts.name,
      accounts.type,
      accounts.archived,
      accounts.openingBalance,
      accounts.createdAt,
    )
    .orderBy(desc(accounts.createdAt));

  return rows.map((row) => {
    const income = toTomanFromAggregate(row.income);
    const expense = toTomanFromAggregate(row.expense);
    return {
      id: row.id,
      name: row.name,
      type: row.type as AccountType,
      archived: row.archived,
      balance: toTomanFromAggregate(row.openingBalance) + income - expense,
    };
  });
}

/**
 * Sum of every account's opening balance for `userId`, or 0 when the owner has
 * no accounts. Opening balances are unanchored in time ("the balance before any
 * recorded transaction"), so this single total seeds a historical balance at
 * every point — see `getAccountBalances` for the same convention.
 */
export async function getOpeningBalanceTotal(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({
      total: sql<string | null>`coalesce(sum(${accounts.openingBalance}), 0)`,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return toTomanFromAggregate(row?.total);
}

/** Inclusive Gregorian month bounds (`YYYY-MM-DD`) for one history bucket. */
export interface BalanceMonthBounds {
  from: string;
  to: string;
}

/** Per-month income/expense plus the totals recorded before the window. */
export interface BalanceHistory {
  /** Signed net (`income − expense`) of every transaction before the window. */
  beforeNet: number;
  /** One entry per requested month, in the same order; nothing is sorted here. */
  monthly: Array<{ income: number; expense: number; net: number }>;
}

/**
 * Cumulative balance material for a historical window, in a single aggregate
 * query. It returns the signed net recorded **before** the window's first day
 * plus income/expense for each requested month, so a caller can reconstruct a
 * running balance at every month boundary without one query per month (no
 * N+1). Each month is a `case` bucket keyed on its inclusive Gregorian bounds
 * (exactly the convention `getPeriodTotals` and the reports page use), with a
 * leading bucket for everything strictly before the window.
 *
 * Archived accounts and their transactions are included, matching
 * `getAccountBalances`: archiving is a lifecycle flag, not a financial event.
 * Only `income`/`expense` exist in the model, so nothing is double-counted.
 */
export async function getBalanceHistory(
  userId: string,
  months: readonly BalanceMonthBounds[],
): Promise<BalanceHistory> {
  const windowStart = months[0]?.from;
  if (!windowStart) {
    return { beforeNet: 0, monthly: [] };
  }

  const beforeIncome = sql<string | null>`coalesce(sum(case when ${transactions.occurredOn} < ${windowStart} and ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`;
  const beforeExpense = sql<string | null>`coalesce(sum(case when ${transactions.occurredOn} < ${windowStart} and ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`;

  const monthlyColumns: Record<string, SQL<string | null>> = {};
  months.forEach((month, index) => {
    monthlyColumns[`income${index}`] = sql<string | null>`coalesce(sum(case when ${transactions.occurredOn} >= ${month.from} and ${transactions.occurredOn} <= ${month.to} and ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`;
    monthlyColumns[`expense${index}`] = sql<string | null>`coalesce(sum(case when ${transactions.occurredOn} >= ${month.from} and ${transactions.occurredOn} <= ${month.to} and ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`;
  });

  const [row] = await getDb()
    .select({ beforeIncome, beforeExpense, ...monthlyColumns })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const record = (row ?? {}) as Record<string, string | null | undefined>;
  const beforeNet =
    toTomanFromAggregate(record.beforeIncome) -
    toTomanFromAggregate(record.beforeExpense);

  const monthly = months.map((_, index) => {
    const income = toTomanFromAggregate(record[`income${index}`]);
    const expense = toTomanFromAggregate(record[`expense${index}`]);
    return { income, expense, net: income - expense };
  });

  return { beforeNet, monthly };
}

/**
 * The most recent transactions in the range, newest first, joined to their
 * account and (optional) category names.
 */
export async function listRecentTransactions(
  userId: string,
  range: DashboardRangeBounds,
  limit: number = DASHBOARD_RECENT_LIMIT,
): Promise<RecentTransaction[]> {
  const rows = await getDb()
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      occurredOn: transactions.occurredOn,
      note: transactions.note,
      accountId: transactions.accountId,
      accountName: accounts.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...rangeConditions(userId, range)))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type as TransactionType,
    amount: row.amount,
    occurredOn: row.occurredOn,
    note: row.note,
    accountId: row.accountId,
    accountName: row.accountName,
    categoryName: row.categoryName,
  }));
}

/** True when the owner has recorded at least one transaction, ever. */
export async function hasAnyTransactions(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .limit(1);

  return Boolean(row);
}

/** True when the owner has at least one account, ever. */
export async function hasAnyAccounts(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  return Boolean(row);
}

/**
 * Assembles the full dashboard payload for `userId` and `range`. The five
 * independent queries are issued together; none of them reads across users.
 */
export async function getDashboardData(
  userId: string,
  range: DashboardRangeBounds,
): Promise<DashboardData> {
  const [totals, categoryBreakdown, accountBalances, recentTransactions, anyTx] =
    await Promise.all([
      getPeriodTotals(userId, range),
      getCategoryExpenseBreakdown(userId, range),
      getAccountBalances(userId),
      listRecentTransactions(userId, range),
      hasAnyTransactions(userId),
    ]);

  return {
    totals,
    categoryBreakdown,
    accountBalances,
    recentTransactions,
    hasAccounts: accountBalances.length > 0,
    hasTransactions: anyTx,
  };
}
