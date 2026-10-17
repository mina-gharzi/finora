import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Accounts. `email` is stored normalized (trimmed, lowercased) by the
 * validation layer, and is unique so two accounts cannot share an address.
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
