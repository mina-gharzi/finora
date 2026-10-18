import { describe, expect, it } from "vitest";
import {
  buildTransactionHistoryHref,
  hasActiveTransactionFilters,
  parseTransactionHistoryQuery,
  type TransactionHistoryQuery,
} from "../history-query";

const ACCOUNT_ID = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";

describe("parseTransactionHistoryQuery", () => {
  it("returns safe defaults for an empty query string", () => {
    expect(parseTransactionHistoryQuery({})).toEqual({
      type: null,
      accountId: null,
      from: null,
      to: null,
      page: 1,
    });
  });

  it("keeps valid filters and page", () => {
    expect(
      parseTransactionHistoryQuery({
        type: "income",
        accountId: ACCOUNT_ID,
        from: "2026-01-01",
        to: "2026-12-31",
        page: "3",
      }),
    ).toEqual({
      type: "income",
      accountId: ACCOUNT_ID,
      from: "2026-01-01",
      to: "2026-12-31",
      page: 3,
    });
  });

  it("drops an unknown transaction type instead of failing", () => {
    expect(parseTransactionHistoryQuery({ type: "transfer" }).type).toBeNull();
  });

  it("drops a non-uuid account id", () => {
    expect(
      parseTransactionHistoryQuery({ accountId: "not-a-uuid" }).accountId,
    ).toBeNull();
  });

  it("drops malformed dates", () => {
    const query = parseTransactionHistoryQuery({
      from: "2026-13-40",
      to: "not-a-date",
    });
    expect(query.from).toBeNull();
    expect(query.to).toBeNull();
  });

  it.each(["0", "-2", "abc", "1.5", ""])(
    "falls back to page 1 for page=%j",
    (page) => {
      expect(parseTransactionHistoryQuery({ page }).page).toBe(1);
    },
  );

  it("ignores a userId supplied in the query string", () => {
    const query = parseTransactionHistoryQuery({ userId: ACCOUNT_ID });
    expect(query).not.toHaveProperty("userId");
  });

  it("takes the first value when a parameter repeats", () => {
    expect(parseTransactionHistoryQuery({ type: ["expense", "income"] }).type).toBe(
      "expense",
    );
  });
});

describe("hasActiveTransactionFilters", () => {
  const base: TransactionHistoryQuery = {
    type: null,
    accountId: null,
    from: null,
    to: null,
    page: 1,
  };

  it("is false only when every filter is absent", () => {
    expect(hasActiveTransactionFilters(base)).toBe(false);
  });

  it.each([
    { ...base, type: "income" as const },
    { ...base, accountId: ACCOUNT_ID },
    { ...base, from: "2026-01-01" },
    { ...base, to: "2026-12-31" },
  ])("is true when a filter is set", (query) => {
    expect(hasActiveTransactionFilters(query)).toBe(true);
  });
});

describe("buildTransactionHistoryHref", () => {
  const base: TransactionHistoryQuery = {
    type: null,
    accountId: null,
    from: null,
    to: null,
    page: 1,
  };

  it("returns the bare path when there is nothing to carry", () => {
    expect(buildTransactionHistoryHref(base, 1)).toBe("/transactions");
  });

  it("preserves filters and omits page=1", () => {
    const href = buildTransactionHistoryHref(
      { ...base, type: "expense", accountId: ACCOUNT_ID },
      1,
    );
    expect(href).toBe(
      `/transactions?type=expense&accountId=${ACCOUNT_ID}`,
    );
  });

  it("includes page when greater than one", () => {
    const href = buildTransactionHistoryHref({ ...base, from: "2026-01-01" }, 4);
    expect(href).toBe("/transactions?from=2026-01-01&page=4");
  });
});
