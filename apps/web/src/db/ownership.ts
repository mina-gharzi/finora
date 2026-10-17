import { uuid } from "drizzle-orm/pg-core";
import { users } from "./schema";

/**
 * Ownership column convention for user-owned records.
 *
 * Every user-owned table (accounts, transactions, budgets, ...) MUST include
 * this column. It is a NOT NULL foreign key that cascades on user deletion, so
 * no record can exist without an owner and no orphaned rows remain.
 *
 * The value written to this column must ALWAYS come from the id resolved from
 * the verified server session — never from a client-supplied field.
 */
export const ownerUserId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
