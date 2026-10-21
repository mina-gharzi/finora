import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, transactions, type CategoryRow } from "@/db/schema";
import { toFieldErrors } from "../validation";
import {
  categoryInputSchema,
  categoryNameInputSchema,
  transactionIdSchema,
} from "./validation";

/**
 * Server-side data access for user-owned transaction categories. The owner id
 * always comes from the verified server session and scopes every query.
 *
 * Deletion semantics: unlike the database's `ON DELETE set null` foreign key —
 * which would quietly strip the category from historical transactions — deletion
 * is deliberately guarded. A category that is still referenced by any
 * transaction is never removed, so financial history is preserved and never
 * silently rewritten. Only unreferenced categories can be deleted, and the
 * guard is enforced in the delete statement itself so a concurrent transaction
 * insert cannot slip a reference in between a check and the delete.
 *
 * The category `kind` ("income"/"expense") is immutable after creation: it is
 * tied to the direction of the transactions that use it, so renaming only ever
 * changes the display name.
 */

export type CreateCategoryResult =
  | { ok: true; category: CategoryRow }
  | { ok: false; fieldErrors: Record<string, string> };

/** Validates `input` and creates a category owned by `userId`. */
export async function createCategory(
  userId: string,
  input: unknown,
): Promise<CreateCategoryResult> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const [category] = await getDb()
    .insert(categories)
    .values({ ...parsed.data, userId })
    .returning();

  return { ok: true, category };
}

/** All categories owned by `userId`, newest first. */
export async function listCategories(userId: string): Promise<CategoryRow[]> {
  return getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(desc(categories.createdAt));
}

/**
 * Loads a category and enforces ownership in one step. Returns null when the
 * category is missing OR owned by someone else.
 */
export async function findCategoryForUser(
  categoryId: string,
  userId: string,
): Promise<CategoryRow | null> {
  const [row] = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!row || row.userId !== userId) {
    return null;
  }
  return row;
}

/**
 * Number of transactions owned by `userId` that reference `categoryId`.
 *
 * Ownership is enforced in the query itself: the transaction/category join is
 * scoped by the owner, so a caller passing a foreign `categoryId` gets `0` and
 * can never observe another user's transaction count. The owner id always
 * comes from the verified session, never from input.
 */
export async function countTransactionsForCategory(
  userId: string,
  categoryId: string,
): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(eq(transactions.categoryId, categoryId), eq(categories.userId, userId)),
    );

  return row?.value ?? 0;
}

export type RenameCategoryResult =
  | { ok: true; category: CategoryRow }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> };

/**
 * Renames a category owned by `userId`. Safety layers, in order:
 * 1. A malformed id is reported as "not found" so callers cannot distinguish it
 *    from a real-but-foreign id.
 * 2. The new name is validated (`invalid` on failure, before any read/write).
 * 3. The id is loaded through `findCategoryForUser`, collapsing "missing" and
 *    "someone else's" into the same `not_found`.
 * 4. The write is additionally scoped by `id = ? AND user_id = ?`, so no foreign
 *    row can ever be mutated even if ownership changed between the read and the
 *    write; a zero-row update is reported as `not_found`.
 *
 * Ownership is never read from input and `kind` is left untouched.
 */
export async function renameCategory(
  userId: string,
  categoryId: string,
  input: unknown,
): Promise<RenameCategoryResult> {
  if (!transactionIdSchema.safeParse(categoryId).success) {
    return { ok: false, reason: "not_found" };
  }

  const parsed = categoryNameInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const existing = await findCategoryForUser(categoryId, userId);
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const [category] = await getDb()
    .update(categories)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning();

  if (!category) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, category };
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "has_transactions"; transactionCount: number };

/**
 * Deletes a category owned by `userId`, but only when no transaction references
 * it. Returns a rich result so callers can present an appropriate message.
 *
 * The reference check is part of the delete statement itself: the row is removed
 * by `id = ? AND user_id = ? AND NOT EXISTS (referencing transaction)`, so the
 * deletion is atomic and a transaction that references the category can never be
 * orphaned by a race between a separate count and the delete. When nothing is
 * removed the row is re-read to report either `not_found` (missing/foreign/
 * malformed) or `has_transactions`.
 */
export async function deleteCategory(
  userId: string,
  categoryId: string,
): Promise<DeleteCategoryResult> {
  if (!transactionIdSchema.safeParse(categoryId).success) {
    return { ok: false, reason: "not_found" };
  }

  const deleted = await getDb()
    .delete(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.userId, userId),
        sql`not exists (select 1 from ${transactions} where ${transactions.categoryId} = ${categories.id})`,
      ),
    )
    .returning();

  if (deleted.length > 0) {
    return { ok: true };
  }

  const existing = await findCategoryForUser(categoryId, userId);
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const transactionCount = await countTransactionsForCategory(userId, categoryId);
  return { ok: false, reason: "has_transactions", transactionCount };
}

export type SetCategoryArchivedResult =
  | { ok: true; category: CategoryRow }
  | { ok: false; reason: "not_found" };

/**
 * Archives or unarchives a category owned by `userId`. Safety layers, in order:
 * 1. A malformed id is reported as "not found" so callers cannot distinguish it
 *    from a real-but-foreign id.
 * 2. The write is scoped by `id = ? AND user_id = ?` in a single statement, so
 *    no foreign row can ever be mutated and a zero-row update is reported as
 *    `not_found`.
 *
 * Archiving is deliberately minimal: it flips the `archived` flag (and bumps
 * `updatedAt`) and touches nothing else. Historical transactions keep their
 * category reference and name — archiving only stops the category from being
 * offered for NEW transactions — so reporting and history are never rewritten
 * and the operation is fully reversible.
 */
export async function setCategoryArchived(
  userId: string,
  categoryId: string,
  archived: boolean,
): Promise<SetCategoryArchivedResult> {
  if (!transactionIdSchema.safeParse(categoryId).success) {
    return { ok: false, reason: "not_found" };
  }

  const [category] = await getDb()
    .update(categories)
    .set({ archived, updatedAt: new Date() })
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning();

  if (!category) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, category };
}
