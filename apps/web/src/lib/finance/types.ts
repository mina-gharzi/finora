/**
 * Financial domain contracts (UI-facing).
 *
 * These describe the shape of data the UI will work with. They do NOT imply a
 * backend exists yet. Ownership (`userId`) is deliberately absent from every
 * input type: it must only ever be derived from the verified server session.
 *
 * Money is an integer number of Toman (no fractions, no floats).
 */

export const ACCOUNT_TYPES = ["cash", "bank", "wallet"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ["income", "expense"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Integer Toman. Always a safe integer; never fractional. */
export type Toman = number;

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: Toman;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: TransactionType;
  archived: boolean;
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: Toman;
  /** Gregorian calendar date, `YYYY-MM-DD`. Jalali is a display concern only. */
  occurredOn: string;
  note: string;
}

/** Client-supplied fields only. No id, no userId. */
export interface AccountInput {
  name: string;
  type: AccountType;
  openingBalance: Toman;
}

export interface CategoryInput {
  name: string;
  kind: TransactionType;
}

export interface TransactionInput {
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: Toman;
  occurredOn: string;
  note: string;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Toman;
  /** Gregorian calendar date, `YYYY-MM-DD`. Jalali is a display concern only. */
  occurredOn: string;
  note: string;
}

/** Client-supplied fields only. No id, no userId. */
export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: Toman;
  occurredOn: string;
  note: string;
}

export const RECURRING_FREQUENCIES = ["weekly", "monthly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

/** Client-supplied fields only. No id, no userId, no watermark. */
export interface RecurringInput {
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: Toman;
  note: string;
  frequency: RecurringFrequency;
  /** Jalali day of month (1..31); required for monthly rules. */
  dayOfMonth: number | null;
  /** JS `getUTCDay` value (0 = Sunday); required for weekly rules. */
  weekday: number | null;
  /** Gregorian calendar date, `YYYY-MM-DD`. */
  startOn: string;
  /** Inclusive end date, or null for an open-ended rule. */
  endOn: string | null;
}