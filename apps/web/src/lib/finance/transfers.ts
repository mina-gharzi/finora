import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { accounts, transfers, type TransferRow } from "@/db/schema";
import { toFieldErrors } from "../validation";
import { findAccountForUser } from "./accounts";
import { transactionIdSchema, transferInputSchema } from "./validation";

/**
 * Server-side data access for transfers between a user's own accounts.
 *
 * Ownership has two layers, matching the transaction DAL: the row stores the
 * owner id taken from the verified session (never from client input), and every
 * write first checks that BOTH referenced accounts belong to that same session
 * user. A client therefore can never move money from or to another user's
 * account.
 *
 * Archived-account policy mirrors `createTransaction`: an archived account is
 * never eligible for a new transfer (enforced here, not only hidden in the UI),
 * so a forged or stale id is rejected with a field error. Existing transfers of
 * archived accounts remain visible and continue to count in balances.
 *
 * Deleting an account cascades to transfers that reference it (see the FKs), so
 * a transfer can never outlive either side. Amounts are integer Toman, always
 * positive.
 */

export type CreateTransferResult =
  | { ok: true; transfer: TransferRow }
  | { ok: false; fieldErrors: Record<string, string> };

const FROM_ACCOUNT_NOT_FOUND = "حساب مبدأ یافت نشد.";
const TO_ACCOUNT_NOT_FOUND = "حساب مقصد یافت نشد.";
const ACCOUNT_ARCHIVED =
  "حساب بایگانی‌شده قابل انتخاب نیست؛ ابتدا آن را از بایگانی خارج کنید.";

/**
 * Validates `input`, verifies that both referenced accounts belong to `userId`
 * and are not archived, then inserts the transfer. The owner id is always
 * `userId`; any client-supplied owner field was already stripped by the schema.
 */
export async function createTransfer(
  userId: string,
  input: unknown,
): Promise<CreateTransferResult> {
  const parsed = transferInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const fromAccount = await findAccountForUser(
    parsed.data.fromAccountId,
    userId,
  );
  if (!fromAccount) {
    return {
      ok: false,
      fieldErrors: { fromAccountId: FROM_ACCOUNT_NOT_FOUND },
    };
  }
  if (fromAccount.archived) {
    return { ok: false, fieldErrors: { fromAccountId: ACCOUNT_ARCHIVED } };
  }

  const toAccount = await findAccountForUser(parsed.data.toAccountId, userId);
  if (!toAccount) {
    return {
      ok: false,
      fieldErrors: { toAccountId: TO_ACCOUNT_NOT_FOUND },
    };
  }
  if (toAccount.archived) {
    return { ok: false, fieldErrors: { toAccountId: ACCOUNT_ARCHIVED } };
  }

  const [transfer] = await getDb()
    .insert(transfers)
    .values({ ...parsed.data, userId })
    .returning();

  return { ok: true, transfer };
}

/** A transfer enriched with the names of its source and destination accounts. */
export interface TransferListItem {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  occurredOn: string;
  note: string;
}

/**
 * The owner's transfers, newest first, joined to both account names. The owner
 * predicate is always applied, so no foreign row can ever be observed. `limit`
 * is optional; without it every transfer is returned.
 */
export async function listTransfers(
  userId: string,
  limit?: number,
): Promise<TransferListItem[]> {
  const fromAccounts = alias(accounts, "from_account");
  const toAccounts = alias(accounts, "to_account");

  const query = getDb()
    .select({
      id: transfers.id,
      fromAccountId: transfers.fromAccountId,
      fromAccountName: fromAccounts.name,
      toAccountId: transfers.toAccountId,
      toAccountName: toAccounts.name,
      amount: transfers.amount,
      occurredOn: transfers.occurredOn,
      note: transfers.note,
    })
    .from(transfers)
    .innerJoin(fromAccounts, eq(transfers.fromAccountId, fromAccounts.id))
    .innerJoin(toAccounts, eq(transfers.toAccountId, toAccounts.id))
    .where(eq(transfers.userId, userId))
    .orderBy(desc(transfers.occurredOn), desc(transfers.createdAt));

  if (limit !== undefined) {
    return query.limit(limit);
  }
  return query;
}

/**
 * Deletes a transfer owned by `userId`. Returns false for foreign/missing (or
 * malformed) ids, so callers cannot tell the cases apart.
 *
 * The delete is atomic and owner-scoped: the row is removed by
 * `id = ? AND user_id = ?` in a single statement and the affected row is
 * returned. A foreign id therefore matches nothing and is reported as false
 * without ever reading or touching another user's row.
 */
export async function deleteTransfer(
  userId: string,
  transferId: string,
): Promise<boolean> {
  if (!transactionIdSchema.safeParse(transferId).success) {
    return false;
  }

  const deleted = await getDb()
    .delete(transfers)
    .where(and(eq(transfers.id, transferId), eq(transfers.userId, userId)))
    .returning();

  return deleted.length > 0;
}
