import "server-only";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  budgets,
  categories,
  transactions,
  type BudgetRow,
} from "@/db/schema";
import { toFieldErrors } from "../validation";
import {
  computeBudgetProgress,
  type BudgetProgress,
} from "./budget-status";
import { findCategoryForUser } from "./categories";
import {
  addDays,
  endOfJalaliMonth,
  startOfJalaliMonth,
  startOfNextJalaliMonth,
} from "./dashboard-range";
import { toTomanFromAggregate } from "./money";
import { budgetInputSchema, transactionIdSchema } from "./validation";

/**
 * Server-side data access for monthly category budgets.
 *
 * Ownership has two layers: the row stores the owner id taken from the verified
 * session (never from client input), and a budget can only reference an expense
 * category owned by that same session user. A client can therefore never set a
 * budget on another user's category, nor on an income category: the category is
 * re-checked here (kind === "expense", owned) regardless of what the UI offered.
 *
 * Month identity: a budget is identified by the normalized first calendar day of
 * its month (`YYYY-MM-DD`). `normalizeMonthStart` snaps any day to the first day
 * of its Jalali month (the UI's calendar), matching the dashboard/reports
 * convention. The `(user_id, category_id, month_start)` unique constraint in the
 * schema is the source of truth for "one budget per category per month"; a
 * concurrent duplicate insert surfaces as a Postgres unique violation and is
 * reported as `duplicate` instead of creating a second row.
 *
 * Spending is computed in the database from the owner's expense transactions
 * whose authoritative `occurred_on` day falls in `[monthStart, nextMonthStart)`
 * — the first day inclusive, the following month's first day exclusive. Income
 * transactions, other users' rows and archived-category history are handled
 * consistently: only the owner's expenses count, and archiving a category never
 * hides or rewrites its historical spending.
 */

export type CreateBudgetResult =
  | { ok: true; budget: BudgetRow }
  | { ok: false; reason: "duplicate" }
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> };

export type UpdateBudgetResult =
  | { ok: true; budget: BudgetRow }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "duplicate" }
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> };

export type DeleteBudgetResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

const CATEGORY_NOT_FOUND = "دسته‌بندی موردنظر یافت نشد.";
const CATEGORY_NOT_EXPENSE =
  "بودجه فقط برای دسته‌بندی‌های هزینه‌ای قابل تعیین است.";

/** The month-start (`YYYY-MM-DD`) of the Jalali month containing `iso`. */
export function normalizeMonthStart(iso: string): string {
  return startOfJalaliMonth(iso);
}

/**
 * True when `error` is a Postgres unique-constraint violation (SQLSTATE 23505).
 *
 * Drizzle wraps driver errors in a `DrizzleQueryError` (or a `cause` chain), so
 * the SQLSTATE may live on the error's `cause` rather than the error itself.
 */
function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 5) {
    return false;
  }
  if ((error as { code?: unknown }).code === "23505") {
    return true;
  }
  return isUniqueViolation((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * Verifies the referenced category exists, belongs to `userId`, and is an
 * expense category. Returns a field error rather than throwing so callers can
 * present it on the form.
 */
async function resolveExpenseCategory(
  userId: string,
  categoryId: string,
): Promise<Record<string, string> | null> {
  const category = await findCategoryForUser(categoryId, userId);
  if (!category) {
    return { categoryId: CATEGORY_NOT_FOUND };
  }
  if (category.kind !== "expense") {
    return { categoryId: CATEGORY_NOT_EXPENSE };
  }
  return null;
}

/**
 * Creates a budget owned by `userId` for an expense category and month.
 *
 * The category is normalized to a month start and re-authorized (owned +
 * expense) before the insert; a duplicate (same category and month) is reported
 * as `duplicate` rather than surfacing a raw database error.
 */
export async function createBudget(
  userId: string,
  input: unknown,
): Promise<CreateBudgetResult> {
  const parsed = budgetInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const categoryError = await resolveExpenseCategory(userId, parsed.data.categoryId);
  if (categoryError) {
    return { ok: false, reason: "invalid", fieldErrors: categoryError };
  }

  try {
    const [budget] = await getDb()
      .insert(budgets)
      .values({
        userId,
        categoryId: parsed.data.categoryId,
        monthStart: normalizeMonthStart(parsed.data.monthStart),
        limitAmount: parsed.data.limitAmount,
      })
      .returning();

    return { ok: true, budget };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "duplicate" };
    }
    throw error;
  }
}

/**
 * Updates an owned budget in place (its category, month or limit).
 *
 * Safety layers, in order:
 * 1. A malformed id is reported as "not found" so callers cannot distinguish it
 *    from a real-but-foreign id.
 * 2. The input is validated and its category re-authorized (owned + expense).
 * 3. The write is scoped by `id = ? AND user_id = ?`, so even if ownership
 *    changed between steps, no foreign row is ever mutated; a zero-row update is
 *    reported as `not_found`.
 * 4. A unique violation (moving onto an existing category+month) is reported as
 *    `duplicate`.
 */
export async function updateBudget(
  userId: string,
  budgetId: string,
  input: unknown,
): Promise<UpdateBudgetResult> {
  if (!transactionIdSchema.safeParse(budgetId).success) {
    return { ok: false, reason: "not_found" };
  }

  const parsed = budgetInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const categoryError = await resolveExpenseCategory(userId, parsed.data.categoryId);
  if (categoryError) {
    return { ok: false, reason: "invalid", fieldErrors: categoryError };
  }

  try {
    const [budget] = await getDb()
      .update(budgets)
      .set({
        categoryId: parsed.data.categoryId,
        monthStart: normalizeMonthStart(parsed.data.monthStart),
        limitAmount: parsed.data.limitAmount,
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)))
      .returning();

    if (!budget) {
      return { ok: false, reason: "not_found" };
    }

    return { ok: true, budget };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "duplicate" };
    }
    throw error;
  }
}

/**
 * Deletes a budget owned by `userId`. The delete is atomic and owner-scoped
 * (`id = ? AND user_id = ?`), so a foreign, missing or malformed id matches
 * nothing and is reported as `not_found` without touching another user's row.
 */
export async function deleteBudget(
  userId: string,
  budgetId: string,
): Promise<DeleteBudgetResult> {
  if (!transactionIdSchema.safeParse(budgetId).success) {
    return { ok: false, reason: "not_found" };
  }

  const deleted = await getDb()
    .delete(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)))
    .returning();

  return deleted.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

/** An expense category the owner can attach a budget to. */
export interface BudgetCategoryOption {
  id: string;
  name: string;
  archived: boolean;
}

/**
 * The owner's expense categories, active first then archived, each by name.
 * Archived categories are still returned so a budget on a since-archived
 * category stays editable, but the UI can mark them as unavailable for new
 * budgets.
 */
export async function listExpenseCategories(
  userId: string,
): Promise<BudgetCategoryOption[]> {
  const rows = await getDb()
    .select({
      id: categories.id,
      name: categories.name,
      archived: categories.archived,
    })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, "expense")))
    .orderBy(asc(categories.archived), asc(categories.name));

  return rows;
}

/** One budget for a month, enriched with its category and progress. */
export interface BudgetWithProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  /** True when the budget's category has since been archived. */
  categoryArchived: boolean;
  monthStart: string;
  limitAmount: number;
  progress: BudgetProgress;
}

/**
 * Expense totals for the month grouped by category, as a `categoryId → amount`
 * map. A single grouped query (no per-budget N+1); the owner predicate is always
 * present and the range is `[monthStart, nextMonthStart)` so the first day is
 * inclusive and the following month is excluded. Only expenses count.
 */
async function getMonthlyExpenseByCategory(
  userId: string,
  monthStart: string,
): Promise<Map<string, number>> {
  const nextMonthStart = startOfNextJalaliMonth(monthStart);
  const rows = await getDb()
    .select({
      categoryId: transactions.categoryId,
      amount: sql<string | null>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        gte(transactions.occurredOn, monthStart),
        lt(transactions.occurredOn, nextMonthStart),
      ),
    )
    .groupBy(transactions.categoryId);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.categoryId !== null) {
      map.set(row.categoryId, toTomanFromAggregate(row.amount));
    }
  }
  return map;
}

/**
 * Every budget owned by `userId` for the month starting at (or containing)
 * `monthStart`, each enriched with its category name and live progress.
 *
 * The month is normalized first so callers may pass any day inside it. Spending
 * is fetched with one grouped aggregate query and merged in memory, so the list
 * is produced without an N+1 query per budget. Archived categories are kept
 * visible: a historical budget must remain readable and editable.
 */
export async function listBudgetsWithProgress(
  userId: string,
  monthStart: string,
): Promise<BudgetWithProgress[]> {
  const normalizedMonth = normalizeMonthStart(monthStart);

  const [rows, spendingByCategory] = await Promise.all([
    getDb()
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        categoryArchived: categories.archived,
        monthStart: budgets.monthStart,
        limitAmount: budgets.limitAmount,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.monthStart, normalizedMonth),
        ),
      )
      .orderBy(asc(categories.name)),
    getMonthlyExpenseByCategory(userId, normalizedMonth),
  ]);

  return rows.map((row) => {
    const limitAmount = toTomanFromAggregate(row.limitAmount);
    const spending = spendingByCategory.get(row.categoryId) ?? 0;
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryArchived: row.categoryArchived,
      monthStart: row.monthStart,
      limitAmount,
      progress: computeBudgetProgress(limitAmount, spending),
    };
  });
}

/** Everything the budgets page renders for one user and one selected month. */
export interface BudgetsData {
  /** Normalized first day of the selected month (`YYYY-MM-DD`). */
  monthStart: string;
  /** Inclusive Gregorian upper bound of the month (`YYYY-MM-DD`). */
  monthEnd: string;
  /** The owner's expense categories (active first), for the create form. */
  expenseCategories: BudgetCategoryOption[];
  /** The month's budgets with live progress, ordered by category name. */
  budgets: BudgetWithProgress[];
  /** True when the owner has at least one expense category to budget against. */
  hasExpenseCategories: boolean;
}

/**
 * Assembles the budgets payload for `userId` and the selected month: the
 * eligible expense categories, the month's budgets (with progress), and the
 * month bounds. Nothing here reads across users.
 */
export async function getBudgetsData(
  userId: string,
  monthStart: string,
): Promise<BudgetsData> {
  const normalizedMonth = normalizeMonthStart(monthStart);
  const [expenseCategories, monthBudgets] = await Promise.all([
    listExpenseCategories(userId),
    listBudgetsWithProgress(userId, normalizedMonth),
  ]);

  return {
    monthStart: normalizedMonth,
    monthEnd: endOfJalaliMonth(normalizedMonth),
    expenseCategories,
    budgets: monthBudgets,
    hasExpenseCategories: expenseCategories.length > 0,
  };
}

/** The Jalali month before the one containing `iso`, as a month start. */
export function previousMonthStart(iso: string): string {
  return startOfJalaliMonth(addDays(startOfJalaliMonth(iso), -1));
}
