import { z } from "zod";
import { parseTomanAmount, MAX_TOMAN } from "./money";
import { ACCOUNT_TYPES, TRANSACTION_TYPES } from "./types";

/**
 * Validation boundary for financial input. Schemas intentionally contain no
 * `userId`: unknown keys are stripped, so a forged owner field is dropped.
 * Cross-record checks (account/category ownership) require the database and
 * must be enforced server-side later; they are not possible here.
 */

/** A UUID-shaped record id (account, category or transaction). */
export const transactionIdSchema = z.uuid({ error: "شناسه معتبر نیست." });

const idSchema = transactionIdSchema;

const nameSchema = z
  .string({ error: "نام را وارد کنید." })
  .trim()
  .min(1, { error: "نام را وارد کنید." })
  .max(60, { error: "نام بیش از حد طولانی است." });

/** Accepts an integer number, or text such as "۱,۲۰۰,۰۰۰". */
const tomanSchema = z
  .union([z.number(), z.string()], { error: "مبلغ معتبر نیست." })
  .transform((v, ctx) => {
    const parsed =
      typeof v === "number"
        ? Number.isSafeInteger(v) && v >= 0 && v <= MAX_TOMAN
          ? v
          : null
        : parseTomanAmount(v);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "مبلغ معتبر نیست." });
      return z.NEVER;
    }
    return parsed;
  });

const positiveTomanSchema = tomanSchema.refine((v) => v > 0, {
  error: "مبلغ باید بیشتر از صفر باشد.",
});

/** Real calendar date in `YYYY-MM-DD` form (rejects e.g. 2026-02-30). */
export const isoDateSchema = z
  .string({ error: "تاریخ را وارد کنید." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "تاریخ معتبر نیست." })
  .refine(
    (s) => {
      const [y, m, d] = s.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return (
        date.getUTCFullYear() === y &&
        date.getUTCMonth() === m - 1 &&
        date.getUTCDate() === d
      );
    },
    { error: "تاریخ معتبر نیست." },
  );

export const accountInputSchema = z.object({
  name: nameSchema,
  type: z.enum(ACCOUNT_TYPES, { error: "نوع حساب معتبر نیست." }),
  openingBalance: tomanSchema,
});

export const categoryInputSchema = z.object({
  name: nameSchema,
  kind: z.enum(TRANSACTION_TYPES, { error: "نوع دسته‌بندی معتبر نیست." }),
});

/**
 * Renaming an existing category. Only the name may change: `kind` is immutable
 * once created because a category is bound to the direction of the transactions
 * that reference it, and rewriting it would desynchronise historical rows.
 */
export const categoryNameInputSchema = z.object({
  name: nameSchema,
});

export const transactionInputSchema = z.object({
  accountId: idSchema,
  categoryId: idSchema.nullable(),
  type: z.enum(TRANSACTION_TYPES, { error: "نوع تراکنش معتبر نیست." }),
  amount: positiveTomanSchema,
  occurredOn: isoDateSchema,
  note: z
    .string({ error: "یادداشت معتبر نیست." })
    .trim()
    .max(500, { error: "یادداشت بیش از حد طولانی است." })
    .default(""),
});

/**
 * Creating a monthly budget. The owner id is never part of the input (unknown
 * keys are stripped) and the category must be an owner-scoped expense category,
 * which requires the database and is enforced in the data-access layer.
 *
 * `monthStart` is validated as a real calendar day (`YYYY-MM-DD`); the data
 * layer additionally normalizes it to the first day of its month so a budget is
 * uniquely identified by the month rather than an arbitrary day inside it.
 * `limitAmount` reuses the Toman rules (a non-negative safe integer) and is
 * tightened to be strictly positive.
 */
export const budgetInputSchema = z.object({
  categoryId: idSchema,
  monthStart: isoDateSchema,
  limitAmount: positiveTomanSchema,
});