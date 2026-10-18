import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, transactions, type AccountRow } from "@/db/schema";
import { toFieldErrors } from "../validation";
import { accountInputSchema, transactionIdSchema } from "./validation";

/**
 * Server-side data access for user-owned financial accounts.
 *
 * Every function takes the owner id resolved from the verified server session
 * as its first argument; it is never read from client input. Reads and writes
 * are always scoped to that owner, so one user can never observe or mutate
 * another user's accounts.
 *
 * Deletion semantics: deletion is deliberately guarded. The `transactions`
 * foreign key would cascade and silently wipe an account's transaction history,
 * so `deleteAccount` refuses to delete any account that still has transactions.
 * Only empty accounts are removed. Categories are never affected. Archiving is
 * the recommended alternative for an account with history: it only flips a
 * flag, never touches rows or balances, and is reversible.
 *
 * Archiving semantics: `archived` is a display/eligibility flag, not a
 * financial state. An archived account keeps its opening balance and every
 * transaction that references it; dashboard balances, reports and the CSV
 * export continue to include it. It merely stops being offered for *new*
 * transactions (enforced in the transaction DAL, not just the UI).
 */

export type CreateAccountResult =
  | { ok: true; account: AccountRow }
  | { ok: false; fieldErrors: Record<string, string> };

/** Validates `input` and creates an account owned by `userId`. */
export async function createAccount(
  userId: string,
  input: unknown,
): Promise<CreateAccountResult> {
  const parsed = accountInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const [account] = await getDb()
    .insert(accounts)
    .values({ ...parsed.data, userId })
    .returning();

  return { ok: true, account };
}

/** All accounts owned by `userId`, newest first. */
export async function listAccounts(userId: string): Promise<AccountRow[]> {
  return getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(desc(accounts.createdAt));
}

/**
 * Loads an account and enforces ownership in one step. Returns null when the
 * account does not exist OR is owned by someone else, so callers cannot tell
 * the two apart and cross-user access is impossible.
 */
export async function findAccountForUser(
  accountId: string,
  userId: string,
): Promise<AccountRow | null> {
  const [row] = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!row || row.userId !== userId) {
    return null;
  }
  return row;
}

export async function countTransactionsForAccount(
  accountId: string,
): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));

  return row?.value ?? 0;
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "has_transactions"; transactionCount: number };

/**
 * Deletes an account owned by `userId`. Accounts that still contain transactions
 * are not deleted (to avoid silently wiping financial history). Deletion returns
 * a rich result so callers can present an appropriate message.
 */
export async function deleteAccount(
  userId: string,
  accountId: string,
): Promise<DeleteAccountResult> {
  // Authorize first (shared ownership guard), then inspect and delete by id.
  const account = await findAccountForUser(accountId, userId);
  if (!account) {
    return { ok: false, reason: "not_found" };
  }

  const transactionCount = await countTransactionsForAccount(accountId);
  if (transactionCount > 0) {
    return { ok: false, reason: "has_transactions", transactionCount };
  }

  await getDb().delete(accounts).where(eq(accounts.id, accountId));
  return { ok: true };
}

export type SetAccountArchivedResult =
  | { ok: true; account: AccountRow }
  | { ok: false; reason: "not_found" };

/**
 * Archives or unarchives an account owned by `userId`. Safety layers, in order:
 * 1. A malformed id is reported as "not found" so callers cannot distinguish it
 *    from a real-but-foreign id.
 * 2. The write is scoped by `id = ? AND user_id = ?` in a single statement, so
 *    no foreign row can ever be mutated and a zero-row update is reported as
 *    `not_found`.
 *
 * Archiving is deliberately minimal: it flips the `archived` flag (and bumps
 * `updatedAt`) and touches nothing else. Transactions, opening balances and
 * every aggregate stay exactly as they were, so historical financial data is
 * never rewritten and the operation is fully reversible.
 */
export async function setAccountArchived(
  userId: string,
  accountId: string,
  archived: boolean,
): Promise<SetAccountArchivedResult> {
  if (!transactionIdSchema.safeParse(accountId).success) {
    return { ok: false, reason: "not_found" };
  }

  const [account] = await getDb()
    .update(accounts)
    .set({ archived, updatedAt: new Date() })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .returning();

  if (!account) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, account };
}
