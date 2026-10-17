import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { transactions, type TransactionRow } from "@/db/schema";
import { toFieldErrors } from "../validation";
import { findAccountForUser } from "./accounts";
import { findCategoryForUser } from "./categories";
import { transactionInputSchema } from "./validation";

/**
 * Server-side data access for income/expense transactions.
 *
 * Ownership has two layers: the row stores the owner id taken from the verified
 * session (never from client input), and every write first checks that the
 * referenced account — and, when present, the referenced category — is owned by
 * that same session user. A client can therefore never post a transaction onto
 * another user's account, nor attach another user's category.
 *
 * Amounts are integer Toman, always positive; `type` carries the direction.
 *
 * Deleting an account cascades to its transactions (see the FK), so a
 * transaction can never outlive its account.
 */

export type CreateTransactionResult =
  | { ok: true; transaction: TransactionRow }
  | { ok: false; fieldErrors: Record<string, string> };

const ACCOUNT_NOT_FOUND = "حساب موردنظر یافت نشد.";
const CATEGORY_NOT_FOUND = "دسته‌بندی موردنظر یافت نشد.";

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
