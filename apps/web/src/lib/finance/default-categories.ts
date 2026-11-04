import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import type { TransactionType } from "./types";

/**
 * Starter categories offered to a new user so the first transaction form is
 * usable immediately. Users can rename, archive or delete them like any other
 * category. Names are unique within each kind; the list intentionally stays
 * short enough to scan.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "خوراک و رستوران",
  "مسکن و اجاره",
  "قبوض و شارژ",
  "حمل‌ونقل",
  "سلامت و درمان",
  "آموزش",
  "خرید و پوشاک",
  "تفریح و سفر",
  "هدیه و مناسبت‌ها",
  "سایر هزینه‌ها",
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  "حقوق",
  "درآمد جانبی",
  "سود و سرمایه‌گذاری",
  "عیدی و هدیه",
  "سایر درآمدها",
] as const;

interface DefaultCategory {
  name: string;
  kind: TransactionType;
}

function defaultCategories(): DefaultCategory[] {
  return [
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
      name,
      kind: "expense" as const,
    })),
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
      name,
      kind: "income" as const,
    })),
  ];
}

/** Stable key for comparing an existing (name, kind) pair. */
function keyOf(category: { name: string; kind: string }): string {
  return `${category.kind}\u0000${category.name}`;
}

/**
 * Adds any missing starter categories for `userId`, in one multi-row insert.
 *
 * Idempotent: the existing (name, kind) pairs are loaded first and only the
 * missing defaults are inserted, so a second call inserts nothing. There is no
 * unique constraint on categories, so the check must happen in code. The owner
 * id is always the argument, never client input.
 */
export async function seedDefaultCategories(
  userId: string,
): Promise<{ inserted: number }> {
  const existing = await getDb()
    .select({ name: categories.name, kind: categories.kind })
    .from(categories)
    .where(eq(categories.userId, userId));

  const existingKeys = new Set(existing.map(keyOf));
  const missing = defaultCategories().filter(
    (category) => !existingKeys.has(keyOf(category)),
  );

  if (missing.length === 0) {
    return { inserted: 0 };
  }

  await getDb()
    .insert(categories)
    .values(missing.map((category) => ({ ...category, userId })));

  return { inserted: missing.length };
}
