import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, transactions, type AccountRow } from "@/db/schema";
import { toFieldErrors } from "../validation";
import { accountInputSchema } from "./validation";

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
 * Only empty accounts are removed. Categories are never affected.
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
