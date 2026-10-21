/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { transactions } from "@/db/schema";

/**
 * Regression guard for the transaction read-path index.
 *
 * Every history, dashboard, report and budget query filters transactions by the
 * owner (`user_id`) first, optionally narrows by `occurred_on`, and orders
 * newest-first by `(occurred_on DESC, created_at DESC)`. The composite index
 * `transactions_user_id_occurred_on_created_at_idx` serves that filter, range
 * and sort in one index walk. The two single-column indexes it replaces
 * (`transactions_user_id_idx`, `transactions_occurred_on_idx`) were proven
 * redundant: the composite's leading column covers owner-scoped lookups, and no
 * application query filters `occurred_on` without `user_id`.
 *
 * These assertions fail loudly if the index shape drifts, so the optimization
 * cannot be silently undone. They are schema-level only and never touch a
 * database.
 */
describe("transactions read-path index", () => {
  const config = getTableConfig(transactions);
  const indexNames = config.indexes.map((index) => index.config.name);

  it("defines the composite owner+date index", () => {
    expect(indexNames).toContain(
      "transactions_user_id_occurred_on_created_at_idx",
    );
  });

  it("leads with user_id, then occurred_on DESC, created_at DESC", () => {
    const index = config.indexes.find(
      (entry) =>
        entry.config.name ===
        "transactions_user_id_occurred_on_created_at_idx",
    );
    expect(index).toBeDefined();

    const columns = index!.config.columns.map((column) => {
      const indexed = column as {
        name: string;
        indexConfig?: { order?: string };
      };
      return {
        name: indexed.name,
        order: indexed.indexConfig?.order ?? "asc",
      };
    });

    expect(columns).toEqual([
      { name: "user_id", order: "asc" },
      { name: "occurred_on", order: "desc" },
      { name: "created_at", order: "desc" },
    ]);
  });

  it("does not keep the redundant single-column indexes", () => {
    expect(indexNames).not.toContain("transactions_user_id_idx");
    expect(indexNames).not.toContain("transactions_occurred_on_idx");
  });

  it("still supports account-scoped lookups", () => {
    expect(indexNames).toContain("transactions_account_id_idx");
  });
});
