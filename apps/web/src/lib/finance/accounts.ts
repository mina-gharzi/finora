import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, type AccountRow } from "@/db/schema";
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
 * Deletion semantics: deleting an account hard-deletes it and, through the
 * `ON DELETE cascade` foreign key, also deletes the transactions that belong to
 * it. Categories are unaffected.
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

/**
 * Deletes an account owned by `userId` (and, by cascade, its transactions).
 * Returns false when the account does not exist or belongs to another user.
 */
export async function deleteAccount(
  userId: string,
  accountId: string,
): Promise<boolean> {
  // Authorize first (shared ownership guard), then delete by id. A foreign id
  // is never loaded, so it can never be deleted.
  const account = await findAccountForUser(accountId, userId);
  if (!account) {
    return false;
  }

  await getDb().delete(accounts).where(eq(accounts.id, accountId));
  return true;
}
