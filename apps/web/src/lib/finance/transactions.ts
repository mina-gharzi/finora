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
import { transactionIdSchema, transactionInputSchema } from "./validation";
import {
  TRANSACTION_HISTORY_PAGE_SIZE,
  type TransactionHistoryFilters,
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
 * Archived-account policy: an archived account is never eligible for a *new*
 * transaction, and that is enforced here — not only by hiding it in the UI —
 * so a forged or stale `accountId` is rejected with a field error. The one
 * exception is an edit that keeps a transaction on its own (already archived)
 * account: historical rows stay editable without being forced onto a different
 * account, but they cannot be moved *onto* another archived account. Nothing
 * here ever archives, deletes or rewrites an account; transactions of archived
 * accounts remain fully visible in history, dashboards, reports and exports.
 *
 * Amounts are integer Toman, always positive; `type` carries the direction.
 *
 * Reads are equally strictly scoped: `listTransactions` and
 * `listTransactionHistory` always filter by the session owner, so history
 * filters can only narrow the owner's own rows.
 *
 * Deleting an account cascades to its transactions (see the FK), so a
 * transaction can never outlive its account. Archiving is the safe, reversible
 * alternative and leaves every row untouched.
 */

export type CreateTransactionResult =
  | { ok: true; transaction: TransactionRow }
  | { ok: false; fieldErrors: Record<string, string> };

const ACCOUNT_NOT_FOUND = "حساب موردنظر یافت نشد.";
const ACCOUNT_ARCHIVED =
  "حساب بایگانی‌شده قابل انتخاب نیست؛ ابتدا آن را از بایگانی خارج کنید.";
const CATEGORY_NOT_FOUND = "دسته‌بندی موردنظر یافت نشد.";
const CATEGORY_TYPE_MISMATCH =
  "دسته‌بندی انتخاب‌شده با نوع تراکنش هم‌خوانی ندارد.";

type ReferenceResolution =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string> };

interface ReferenceOptions {
  /**
   * An archived account id that may still be referenced (the account a
   * transaction is already on). Everything else archived is rejected.
   */
  allowArchivedAccountId?: string;
}

/**
 * Shared cross-record guard for create and update: verifies that the referenced
 * account — and, when present, the referenced category — belong to `userId`, and
 * that the category's `kind` matches the transaction `type`. A category is bound
 * to a direction ("income" or "expense"), so borrowing one across directions is
 * rejected even though ownership is valid.
 *
 * An archived account is rejected unless it is the transaction's current
 * account (`allowArchivedAccountId`), so archived accounts can never be chosen
 * for new rows while existing rows stay editable in place.
 */
async function resolveReferences(
  userId: string,
  accountId: string,
  categoryId: string | null,
  type: TransactionType,
  options: ReferenceOptions = {},
): Promise<ReferenceResolution> {
  const account = await findAccountForUser(accountId, userId);
  if (!account) {
    return { ok: false, fieldErrors: { accountId: ACCOUNT_NOT_FOUND } };
  }

  if (account.archived && accountId !== options.allowArchivedAccountId) {
    return { ok: false, fieldErrors: { accountId: ACCOUNT_ARCHIVED } };
  }

  if (categoryId !== null) {
    const category = await findCategoryForUser(categoryId, userId);
    if (!category) {
      return { ok: false, fieldErrors: { categoryId: CATEGORY_NOT_FOUND } };
    }

    if (category.kind !== type) {
      return { ok: false, fieldErrors: { categoryId: CATEGORY_TYPE_MISMATCH } };
    }
  }

  return { ok: true };
}

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

  const references = await resolveReferences(
    userId,
    parsed.data.accountId,
    parsed.data.categoryId,
    parsed.data.type,
  );
  if (!references.ok) {
    return { ok: false, fieldErrors: references.fieldErrors };
  }

  const [transaction] = await getDb()
    .insert(transactions)
    .values({ ...parsed.data, userId })
    .returning();

  return { ok: true, transaction };
}

export type UpdateTransactionResult =
  | { ok: true; transaction: TransactionRow }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> };

/**
 * Updates a transaction owned by `userId`.
 *
 * Safety layers, in order:
 * 1. A malformed id is reported as "not found" so callers cannot distinguish it
 *    from a real-but-foreign id.
 * 2. The id is loaded through `findTransactionForUser`, which enforces ownership
 *    and collapses "missing" and "someone else's" into the same `not_found`.
 * 3. `input` is validated and its account/category references are re-checked
 *    against the session user.
 * 4. The write is additionally scoped by `id = ? AND user_id = ?`, so even if
 *    ownership changed between the read and the write, no foreign row is ever
 *    mutated; a zero-row update is reported as `not_found`.
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: unknown,
): Promise<UpdateTransactionResult> {
  if (!transactionIdSchema.safeParse(transactionId).success) {
    return { ok: false, reason: "not_found" };
  }

  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const existing = await findTransactionForUser(transactionId, userId);
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const references = await resolveReferences(
    userId,
    parsed.data.accountId,
    parsed.data.categoryId,
    parsed.data.type,
    // Keeping the transaction on its own (possibly archived) account is fine;
    // moving it onto any *other* archived account is not.
    { allowArchivedAccountId: existing.accountId },
  );
  if (!references.ok) {
    return { ok: false, reason: "invalid", fieldErrors: references.fieldErrors };
  }

  const [transaction] = await getDb()
    .update(transactions)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    )
    .returning();

  if (!transaction) {
    return { ok: false, reason: "not_found" };
  }

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
  /** True when the owning account has been archived (still fully visible). */
  accountArchived: boolean;
  categoryName: string | null;
}

export interface TransactionHistoryResult {
  items: TransactionHistoryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Owner predicate plus the optional narrowing filters. The owner condition is
 * ALWAYS first, so filters can only *narrow* the result set — a filter pointing
 * at another user's account yields nothing rather than leaking it.
 */
function buildHistoryConditions(
  userId: string,
  filters: TransactionHistoryFilters,
) {
  const conditions = [eq(transactions.userId, userId)];
  if (filters.type) conditions.push(eq(transactions.type, filters.type));
  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.from) conditions.push(gte(transactions.occurredOn, filters.from));
  if (filters.to) conditions.push(lte(transactions.occurredOn, filters.to));
  return conditions;
}

/** The shared newest-first history join used by the list and the CSV export. */
async function selectHistoryRows(
  userId: string,
  filters: TransactionHistoryFilters,
  page?: { limit: number; offset: number },
): Promise<
  {
    id: string;
    type: string;
    amount: number;
    occurredOn: string;
    note: string;
    accountId: string;
    accountName: string;
    accountArchived: boolean;
    categoryName: string | null;
  }[]
> {
  const query = getDb()
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      occurredOn: transactions.occurredOn,
      note: transactions.note,
      accountId: transactions.accountId,
      accountName: accounts.name,
      accountArchived: accounts.archived,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...buildHistoryConditions(userId, filters)))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));

  if (page) {
    return query.limit(page.limit).offset(page.offset);
  }
  return query;
}

function toHistoryItem(row: {
  id: string;
  type: string;
  amount: number;
  occurredOn: string;
  note: string;
  accountId: string;
  accountName: string;
  accountArchived: boolean;
  categoryName: string | null;
}): TransactionHistoryItem {
  return {
    id: row.id,
    type: row.type as TransactionType,
    amount: row.amount,
    occurredOn: row.occurredOn,
    note: row.note,
    accountId: row.accountId,
    accountName: row.accountName,
    accountArchived: row.accountArchived,
    categoryName: row.categoryName,
  };
}

/**
 * A page of the owner's transaction history, newest first, joined to the owning
 * account name (and its archived flag) and the optional category name. Rows of
 * archived accounts are never hidden — archiving only marks them.
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

  const rows = await selectHistoryRows(userId, query, {
    limit: pageSize + 1,
    offset,
  });

  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows).map(toHistoryItem);

  return { items, page, pageSize, hasMore };
}

/**
 * EVERY matching transaction owned by `userId`, newest first — the CSV export
 * counterpart of `listTransactionHistory` with no pagination cap, so a large
 * history is never truncated by the 20-row page size.
 *
 * The query is still pushed down to the database with the same owner-scoped
 * conditions (never "fetch all rows and filter in memory"), and it is not
 * buffered into memory beyond a single result set.
 */
export async function listTransactionHistoryForExport(
  userId: string,
  filters: TransactionHistoryFilters,
): Promise<TransactionHistoryItem[]> {
  const rows = await selectHistoryRows(userId, filters);
  return rows.map(toHistoryItem);
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

/**
 * Deletes a transaction owned by `userId`. Returns false for foreign/missing
 * (or malformed) ids, so callers cannot tell the cases apart.
 *
 * The delete is atomic and owner-scoped: the row is removed by
 * `id = ? AND user_id = ?` in a single statement and the affected row is
 * returned. A foreign id therefore matches nothing and is reported as false
 * without ever reading or touching another user's row.
 */
export async function deleteTransaction(
  userId: string,
  transactionId: string,
): Promise<boolean> {
  if (!transactionIdSchema.safeParse(transactionId).success) {
    return false;
  }

  const deleted = await getDb()
    .delete(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    )
    .returning();

  return deleted.length > 0;
}
