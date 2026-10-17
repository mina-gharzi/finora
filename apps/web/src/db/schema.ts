import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ownerUserId } from "./ownership";

/**
 * Users. `email` is stored normalized (trimmed, lowercased) by the validation
 * layer, and is unique so two accounts cannot share an address.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

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
    index("transactions_user_id_idx").on(table.userId),
    index("transactions_account_id_idx").on(table.accountId),
    index("transactions_occurred_on_idx").on(table.occurredOn),
  ],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
