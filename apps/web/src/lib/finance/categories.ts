import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, type CategoryRow } from "@/db/schema";
import { toFieldErrors } from "../validation";
import { categoryInputSchema } from "./validation";

/**
 * Server-side data access for user-owned transaction categories. The owner id
 * always comes from the verified server session and scopes every query.
 *
 * Deleting a category never deletes history: transactions keep their row and
 * have `category_id` set to NULL by the `ON DELETE set null` foreign key.
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

/** Deletes a category owned by `userId`. Returns false for foreign/missing ids. */
export async function deleteCategory(
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await findCategoryForUser(categoryId, userId);
  if (!category) {
    return false;
  }

  await getDb().delete(categories).where(eq(categories.id, categoryId));
  return true;
}
