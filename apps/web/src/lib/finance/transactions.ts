import "server-only";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  categories,
  transactions,
  type TransactionRow,
} from "@/db/schema";
import { toFieldErrors } from "../validation";
import { findAccountForUser } from "./accounts";
import { findCategoryForUser } from "./categories";
import { transactionInputSchema } from "./validation";
import {
  TRANSACTION_HISTORY_PAGE_SIZE,
  type TransactionHistoryQuery,
} from "./history-query";
import type { TransactionType } from "./types";

/**
 * Server-side data access for income/expense transactions.
 *
 * Ownership has two layers: the row stores the owner id taken from the verified
 * session (never from client input), and every write first checks that the
 * referenced account — and, when present, the referenced category — is owned by
 * that same session user. A client can therefore never post a transaction onto
 * another user's account, nor attach another user's category. A category must
 * additionally match the transaction `type` (income/expense), so a category can
 * never be borrowed across directions.
 *
 * Amounts are integer Toman, always positive; `type` carries the direction.
 *
 * Reads are equally strictly scoped: `listTransactions` and
 * `listTransactionHistory` always filter by the session owner, so history
 * filters can only narrow the owner's own rows.
 *
 * Deleting an account cascades to its transactions (see the FK), so a
 * transaction can never outlive its account.
 */

export type CreateTransactionResult =
  | { ok: true; transaction: TransactionRow }
  | { ok: false; fieldErrors: Record<string, string> };

const ACCOUNT_NOT_FOUND = "حساب موردنظر یافت نشد.";
const CATEGORY_NOT_FOUND = "دسته‌بندی موردنظر یافت نشد.";
const CATEGORY_TYPE_MISMATCH =
  "دسته‌بندی انتخاب‌شده با نوع تراکنش هم‌خوانی ندارد.";

/**
 * Validates `input`, verifies that the referenced account (and optional
 * category) belong to `userId`, then inserts the transaction. The owner id is
 * always `userId`; any client-supplied owner field was already stripped by the
 * schema.
 */
export async function createTransaction(
  userId: string,
  input: unknown,
): Promise<CreateTransactionResult> {
  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const { accountId, categoryId } = parsed.data;

  const account = await findAccountForUser(accountId, userId);
  if (!account) {
    return { ok: false, fieldErrors: { accountId: ACCOUNT_NOT_FOUND } };
  }

  if (categoryId !== null) {
    const category = await findCategoryForUser(categoryId, userId);
    if (!category) {
      return { ok: false, fieldErrors: { categoryId: CATEGORY_NOT_FOUND } };
    }

    // A category is bound to a direction ("income" or "expense"); attaching an
    // income category to an expense (or vice versa) would corrupt reporting, so
    // it is rejected even though ownership is valid.
    if (category.kind !== parsed.data.type) {
      return { ok: false, fieldErrors: { categoryId: CATEGORY_TYPE_MISMATCH } };
    }
  }

  const [transaction] = await getDb()
    .insert(transactions)
    .values({ ...parsed.data, userId })
    .returning();

  return { ok: true, transaction };
}

/** All transactions owned by `userId`, most recent activity first. */
export async function listTransactions(
  userId: string,
): Promise<TransactionRow[]> {
  return getDb()
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
}

/** A history row enriched with the names of its account and (optional) category. */
export interface TransactionHistoryItem {
  id: string;
  type: TransactionType;
  amount: number;
  occurredOn: string;
  note: string;
  accountId: string;
  accountName: string;
  categoryName: string | null;
}

export interface TransactionHistoryResult {
  items: TransactionHistoryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * A page of the owner's transaction history, newest first, joined to the owning
 * account name and the optional category name.
 *
 * The owner predicate (`transactions.userId = userId`) is ALWAYS the first
 * condition, so filters can only *narrow* the result set — a filter pointing at
 * another user's account yields nothing rather than leaking it. Filters are
 * already normalized by `parseTransactionHistoryQuery`; invalid values never
 * reach here. Pagination reads one row beyond the page size to report `hasMore`
 * without a second count query.
 */
export async function listTransactionHistory(
  userId: string,
  query: TransactionHistoryQuery,
): Promise<TransactionHistoryResult> {
  const pageSize = TRANSACTION_HISTORY_PAGE_SIZE;
  const page = query.page >= 1 ? query.page : 1;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(transactions.userId, userId)];
  if (query.type) conditions.push(eq(transactions.type, query.type));
  if (query.accountId) {
    conditions.push(eq(transactions.accountId, query.accountId));
  }
  if (query.from) conditions.push(gte(transactions.occurredOn, query.from));
  if (query.to) conditions.push(lte(transactions.occurredOn, query.to));

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
    .where(and(...conditions))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(pageSize + 1)
    .offset(offset);

  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows).map((row) => ({
    id: row.id,
    type: row.type as TransactionType,
    amount: row.amount,
    occurredOn: row.occurredOn,
    note: row.note,
    accountId: row.accountId,
    accountName: row.accountName,
    categoryName: row.categoryName,
  }));

  return { items, page, pageSize, hasMore };
}

/**
 * Loads a transaction and enforces ownership in one step. Returns null when it
 * is missing OR owned by someone else.
 */
export async function findTransactionForUser(
  transactionId: string,
  userId: string,
): Promise<TransactionRow | null> {
  const [row] = await getDb()
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!row || row.userId !== userId) {
    return null;
  }
  return row;
}

/** Deletes a transaction owned by `userId`. False for foreign/missing ids. */
export async function deleteTransaction(
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const transaction = await findTransactionForUser(transactionId, userId);
  if (!transaction) {
    return false;
  }

  await getDb().delete(transactions).where(eq(transactions.id, transactionId));
  return true;
}
