import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ownerUserId } from "./ownership";

/**
 * Users. `email` is stored normalized (trimmed, lowercased) by the validation
 * layer, and is unique so two accounts cannot share an address.
 *
 * `email_verified_at` is set once the owner proves control of the address via
 * an emailed link. It is NULL for accounts created after verification was
 * introduced. `auth_valid_after` is a session-invalidation watermark: session
 * tokens issued before it (by JWT `iat`) no longer authenticate. Both are
 * nullable so the migration is purely additive for existing rows.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  authValidAfter: timestamp("auth_valid_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * Single-use, purpose-bound tokens for email verification, password reset and
 * email change.
 *
 * Only the SHA-256 hash of a token is stored, so a database leak does not
 * yield usable links. A token is consumed by a conditional UPDATE that sets
 * `consumed_at`, which makes concurrent use impossible (exactly one statement
 * wins). `purpose` prevents a reset token from verifying an email and vice
 * versa. Deleting a user cascades their tokens away.
 *
 * `target_email` carries the pending address an `email_change` token will
 * apply: the raw token is unreadable by design, so the bound destination has
 * to live somewhere the completion can look it up. One nullable column on the
 * existing table is the smallest robust design — no new table, no join, and
 * the paired CHECK keeps the column meaningful: it is NOT NULL exactly for
 * `email_change` rows and NULL for every other purpose (also constraining
 * older rows, which all predate the column and are NULL).
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerUserId(),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    targetEmail: text("target_email"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "auth_tokens_purpose_check",
      sql`${table.purpose} in ('email_verify', 'password_reset', 'email_change')`,
    ),
    check(
      "auth_tokens_target_email_check",
      sql`(${table.purpose} = 'email_change') = (${table.targetEmail} is not null)`,
    ),
    // Lookups always arrive by raw token, hashed then matched exactly.
    uniqueIndex("auth_tokens_token_hash_idx").on(table.tokenHash),
    // Issuing/cleanup deletes a user's previous tokens for a purpose.
    index("auth_tokens_user_id_purpose_idx").on(table.userId, table.purpose),
    // Supports expiry sweeps.
    index("auth_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export type AuthTokenRow = typeof authTokens.$inferSelect;
export type NewAuthTokenRow = typeof authTokens.$inferInsert;

/**
 * Financial accounts owned by a user. `opening_balance` is an integer number
 * of Toman (bigint in Postgres, surfaced as a JS number) and can never be
 * negative. `type` is constrained to the values the domain understands.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerUserId(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    openingBalance: bigint("opening_balance", { mode: "number" })
      .notNull()
      .default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "accounts_type_check",
      sql`${table.type} in ('cash', 'bank', 'wallet')`,
    ),
    check(
      "accounts_opening_balance_check",
      sql`${table.openingBalance} >= 0`,
    ),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;

/**
 * Categories classify transactions. `kind` matches the transaction type so a
 * category can be reused consistently for income or expense only.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerUserId(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "categories_kind_check",
      sql`${table.kind} in ('income', 'expense')`,
    ),
    index("categories_user_id_idx").on(table.userId),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;

/**
 * Income/expense transactions. Amounts are integer Toman (always positive; the
 * `type` column carries the direction) stored as bigint. The owning user is
 * denormalized onto the row and the owning account is a cascade-deleted
 * foreign key, so removing an account removes its transactions. The server
 * still verifies that the referenced account belongs to the same user.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerUserId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "transactions_type_check",
      sql`${table.type} in ('income', 'expense')`,
    ),
    check("transactions_amount_check", sql`${table.amount} > 0`),
    // Primary read path: every history/dashboard/report query filters by the
    // owner (`user_id`) first, then optionally narrows by `occurred_on`, and
    // orders newest-first by `(occurred_on DESC, created_at DESC)`. This
    // composite index serves the owner predicate, the optional date range and
    // the sort order in a single index walk, so a page of history never sorts
    // or discards rows. Its leading `user_id` column also covers the plain
    // owner-scoped lookups, making a separate `user_id`-only index redundant.
    index("transactions_user_id_occurred_on_created_at_idx").on(
      table.userId,
      table.occurredOn.desc(),
      table.createdAt.desc(),
    ),
    index("transactions_account_id_idx").on(table.accountId),
  ],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;

/**
 * Monthly spending budgets, one per expense category per Jalali/calendar month.
 *
 * A budget sets a positive integer Toman limit for an owner's expense category
 * over one month. `month_start` is the normalized first calendar day of that
 * month (`YYYY-MM-DD`, a `date` column with no time zone), so a month is
 * identified by its Gregorian lower bound — the same convention the dashboard,
 * reports and transaction history use for inclusive calendar-day ranges.
 *
 * The `(user_id, category_id, month_start)` unique constraint is the source of
 * truth for "at most one budget per category per month"; it lets the data layer
 * treat concurrent duplicate submissions as a conflict rather than creating
 * two rows. The category FK cascades on delete, so a removed category never
 * leaves a dangling budget behind.
 *
 * `limit_amount` is stored as bigint and constrained to be positive: a budget of
 * zero (or a negative limit) is meaningless and rejected at the database level
 * in addition to the validation layer.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerUserId(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    monthStart: date("month_start", { mode: "string" }).notNull(),
    limitAmount: bigint("limit_amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("budgets_limit_amount_check", sql`${table.limitAmount} > 0`),
    uniqueIndex("budgets_user_category_month_idx").on(
      table.userId,
      table.categoryId,
      table.monthStart,
    ),
    index("budgets_user_id_month_idx").on(table.userId, table.monthStart),
    index("budgets_category_id_idx").on(table.categoryId),
  ],
);

export type BudgetRow = typeof budgets.$inferSelect;
export type NewBudgetRow = typeof budgets.$inferInsert;

/**
 * Persistent fixed-window rate-limit counters, shared across application
 * instances that use the same database.
 *
 * PRIVACY: `key_hash` is the SHA-256 hex digest of the scope + normalized
 * identifier (e.g. `login:account:<lowercased email>`) — never the raw email,
 * IP, token, or any credential. The table therefore stores no directly
 * identifying data. `expires_at` is derived from `window_start + windowMs`
 * and bounds every row's lifetime so cleanup is a cheap indexed delete.
 *
 * CONCURRENCY: exactly one row per key. Each event is a single
 * `INSERT ... ON CONFLICT DO UPDATE` that either starts a fresh window or
 * increments the current one atomically, so concurrent requests cannot
 * double-count or bypass the limit through a read-then-write gap.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    keyHash: text("key_hash").primaryKey(),
    count: integer("count").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // Supports the expiry sweep without scanning the whole table.
    index("rate_limit_counters_expires_at_idx").on(table.expiresAt),
  ],
);

export type RateLimitCounterRow = typeof rateLimitCounters.$inferSelect;
