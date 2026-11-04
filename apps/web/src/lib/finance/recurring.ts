import "server-only";
import { and, desc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  categories,
  recurringTransactions,
  transactions,
  type RecurringTransactionRow,
} from "@/db/schema";
import { toFieldErrors } from "../validation";
import { addDays } from "./dashboard-range";
import { occurrencesBetween } from "./recurring-schedule";
import { todayInTehranIso } from "./today";
import { resolveReferences } from "./transactions";
import type { RecurringFrequency, TransactionType } from "./types";
import { recurringInputSchema, transactionIdSchema } from "./validation";

/**
 * Server-side data access for recurring income/expense rules.
 *
 * Rules are materialized lazily into ordinary `transactions` rows: every page
 * render can call `ensureRecurringUpToDate`, which only does work when an active
 * rule is due. Generation is idempotent — a unique index on
 * `(recurring_id, occurred_on)` plus `ON CONFLICT DO NOTHING` makes concurrent
 * requests safe — and each rule keeps a watermark (`generated_through`) so a
 * missed day is caught up rather than skipped.
 *
 * Ownership mirrors the transaction DAL: the owner id always comes from the
 * verified session, and the referenced account/category are re-checked with
 * `resolveReferences`. A rule whose account is archived is skipped and its
 * watermark is left untouched, so nothing is generated behind the user's back.
 */

export type CreateRecurringResult =
  | { ok: true; recurring: RecurringTransactionRow }
  | { ok: false; fieldErrors: Record<string, string> };

const START_OUT_OF_WINDOW =
  "تاریخ شروع باید در بازه یک سال گذشته تا یک سال آینده باشد.";

/** Validates, re-checks references, then inserts a rule. */
export async function createRecurring(
  userId: string,
  input: unknown,
): Promise<CreateRecurringResult> {
  const parsed = recurringInputSchema.safeParse(input);
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

  const today = todayInTehranIso();
  if (
    parsed.data.startOn < addDays(today, -366) ||
    parsed.data.startOn > addDays(today, 366)
  ) {
    return { ok: false, fieldErrors: { startOn: START_OUT_OF_WINDOW } };
  }

  const [recurring] = await getDb()
    .insert(recurringTransactions)
    .values({ ...parsed.data, userId, generatedThrough: null })
    .returning();

  return { ok: true, recurring };
}

/** A rule enriched with the names of its account and optional category. */
export interface RecurringListItem {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  type: TransactionType;
  amount: number;
  note: string;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  weekday: number | null;
  startOn: string;
  endOn: string | null;
  generatedThrough: string | null;
  active: boolean;
}

/** The owner's rules, newest first, joined to account and category names. */
export async function listRecurring(
  userId: string,
): Promise<RecurringListItem[]> {
  const rows = await getDb()
    .select({
      id: recurringTransactions.id,
      accountId: recurringTransactions.accountId,
      accountName: accounts.name,
      categoryId: recurringTransactions.categoryId,
      categoryName: categories.name,
      type: recurringTransactions.type,
      amount: recurringTransactions.amount,
      note: recurringTransactions.note,
      frequency: recurringTransactions.frequency,
      dayOfMonth: recurringTransactions.dayOfMonth,
      weekday: recurringTransactions.weekday,
      startOn: recurringTransactions.startOn,
      endOn: recurringTransactions.endOn,
      generatedThrough: recurringTransactions.generatedThrough,
      active: recurringTransactions.active,
    })
    .from(recurringTransactions)
    .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
    .leftJoin(
      categories,
      eq(recurringTransactions.categoryId, categories.id),
    )
    .where(eq(recurringTransactions.userId, userId))
    .orderBy(desc(recurringTransactions.createdAt));

  return rows.map((row) => ({
    ...row,
    type: row.type as TransactionType,
    frequency: row.frequency as RecurringFrequency,
  }));
}

/** Enables or pauses one owned rule; foreign/malformed ids report false. */
export async function setRecurringActive(
  userId: string,
  recurringId: string,
  active: boolean,
): Promise<boolean> {
  if (!transactionIdSchema.safeParse(recurringId).success) {
    return false;
  }

  const updated = await getDb()
    .update(recurringTransactions)
    .set({ active, updatedAt: new Date() })
    .where(
      and(
        eq(recurringTransactions.id, recurringId),
        eq(recurringTransactions.userId, userId),
      ),
    )
    .returning();

  return updated.length > 0;
}

/**
 * Deletes an owned rule. Already-generated transactions survive: the FK is
 * `ON DELETE SET NULL`, so history is preserved.
 */
export async function deleteRecurring(
  userId: string,
  recurringId: string,
): Promise<boolean> {
  if (!transactionIdSchema.safeParse(recurringId).success) {
    return false;
  }

  const deleted = await getDb()
    .delete(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.id, recurringId),
        eq(recurringTransactions.userId, userId),
      ),
    )
    .returning();

  return deleted.length > 0;
}

export interface MaterializeRecurringResult {
  created: number;
}

/**
 * Generates every due row for the owner's active rules up to `todayIso`.
 *
 * Each rule is processed in its own transaction: due occurrences are inserted
 * with `ON CONFLICT (recurring_id, occurred_on) DO NOTHING`, then the watermark
 * advances to `min(todayIso, endOn)`. The watermark never moves backwards, and
 * an archived account is skipped without advancing it.
 */
export async function materializeRecurringForUser(
  userId: string,
  todayIso: string,
): Promise<MaterializeRecurringResult> {
  const db = getDb();

  const rules = await db
    .select({
      id: recurringTransactions.id,
      accountId: recurringTransactions.accountId,
      accountArchived: accounts.archived,
      categoryId: recurringTransactions.categoryId,
      type: recurringTransactions.type,
      amount: recurringTransactions.amount,
      note: recurringTransactions.note,
      frequency: recurringTransactions.frequency,
      dayOfMonth: recurringTransactions.dayOfMonth,
      weekday: recurringTransactions.weekday,
      startOn: recurringTransactions.startOn,
      endOn: recurringTransactions.endOn,
      generatedThrough: recurringTransactions.generatedThrough,
    })
    .from(recurringTransactions)
    .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
    .where(
      and(
        eq(recurringTransactions.userId, userId),
        eq(recurringTransactions.active, true),
        lte(recurringTransactions.startOn, todayIso),
        or(
          isNull(recurringTransactions.generatedThrough),
          lt(recurringTransactions.generatedThrough, todayIso),
        ),
      ),
    );

  let created = 0;

  for (const rule of rules) {
    await db.transaction(async (tx) => {
      if (rule.accountArchived) {
        return;
      }

      const through =
        rule.endOn !== null && rule.endOn < todayIso
          ? rule.endOn
          : todayIso;

      const occurrences = occurrencesBetween(
        {
          frequency: rule.frequency as RecurringFrequency,
          dayOfMonth: rule.dayOfMonth,
          weekday: rule.weekday,
          startOn: rule.startOn,
          endOn: rule.endOn,
        },
        rule.generatedThrough,
        through,
      );

      if (occurrences.length > 0) {
        const inserted = await tx
          .insert(transactions)
          .values(
            occurrences.map((occurredOn) => ({
              userId,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              recurringId: rule.id,
              type: rule.type,
              amount: rule.amount,
              note: rule.note,
              occurredOn,
            })),
          )
          .onConflictDoNothing({
            target: [transactions.recurringId, transactions.occurredOn],
          })
          .returning({ id: transactions.id });

        created += inserted.length;
      }

      if (
        rule.generatedThrough === null ||
        through > rule.generatedThrough
      ) {
        await tx
          .update(recurringTransactions)
          .set({ generatedThrough: through, updatedAt: new Date() })
          .where(
            and(
              eq(recurringTransactions.id, rule.id),
              eq(recurringTransactions.userId, userId),
            ),
          );
      }
    });
  }

  return { created };
}

/**
 * Cheap pre-check for page renders: materialize only when at least one active
 * rule has never run or has an older watermark than today.
 */
export async function ensureRecurringUpToDate(
  userId: string,
  todayIso: string = todayInTehranIso(),
): Promise<MaterializeRecurringResult> {
  const [due] = await getDb()
    .select({ id: recurringTransactions.id })
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.userId, userId),
        eq(recurringTransactions.active, true),
        or(
          isNull(recurringTransactions.generatedThrough),
          lt(recurringTransactions.generatedThrough, todayIso),
        ),
      ),
    )
    .limit(1);

  if (!due) {
    return { created: 0 };
  }

  return materializeRecurringForUser(userId, todayIso);
}
