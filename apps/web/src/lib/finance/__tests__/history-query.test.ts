import { describe, expect, it } from "vitest";
import {
  buildTransactionEditHref,
  buildTransactionExportHref,
  buildTransactionHistoryHref,
  hasActiveTransactionFilters,
  parseTransactionHistoryQuery,
  parseTransactionReturnTo,
  toIlikePattern,
  transactionSearchParamsToRecord,
  TRANSACTION_SEARCH_MAX_LENGTH,
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
      search: null,
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
        q: "خرید",
        page: "3",
      }),
    ).toEqual({
      type: "income",
      accountId: ACCOUNT_ID,
      from: "2026-01-01",
      to: "2026-12-31",
      search: "خرید",
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
    expect(parseTransactionHistoryQuery({ q: ["خرید", "فروش"] }).search).toBe(
      "خرید",
    );
  });

  it("trims surrounding whitespace from the search term", () => {
    expect(parseTransactionHistoryQuery({ q: "  خرید روزانه  " }).search).toBe(
      "خرید روزانه",
    );
  });

  it("treats a whitespace-only search as no search", () => {
    expect(parseTransactionHistoryQuery({ q: "   " }).search).toBeNull();
    expect(parseTransactionHistoryQuery({ q: "" }).search).toBeNull();
  });

  it("drops an overlong search term instead of applying it", () => {
    expect(
      parseTransactionHistoryQuery({ q: "x".repeat(TRANSACTION_SEARCH_MAX_LENGTH + 1) })
        .search,
    ).toBeNull();
    expect(
      parseTransactionHistoryQuery({ q: "x".repeat(TRANSACTION_SEARCH_MAX_LENGTH) })
        .search,
    ).toBe("x".repeat(TRANSACTION_SEARCH_MAX_LENGTH));
  });

  it("keeps LIKE wildcards as literal characters in the parsed term", () => {
    // Escaping happens in the DAL pattern builder, not in parsing.
    expect(parseTransactionHistoryQuery({ q: "50%_off" }).search).toBe("50%_off");
  });
});

describe("toIlikePattern", () => {
  it("wraps the term in wildcards for a substring match", () => {
    expect(toIlikePattern("خرید")).toBe("%خرید%");
  });

  it("escapes %, _ and backslash so they match literally", () => {
    expect(toIlikePattern("50%")).toBe("%50\\%%");
    expect(toIlikePattern("a_b")).toBe("%a\\_b%");
    expect(toIlikePattern("a\\b")).toBe("%a\\\\b%");
  });
});

describe("hasActiveTransactionFilters", () => {
  const base: TransactionHistoryQuery = {
    type: null,
    accountId: null,
    from: null,
    to: null,
    search: null,
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
    { ...base, search: "خرید" },
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
    search: null,
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

  it("preserves the search term", () => {
    const href = buildTransactionHistoryHref(
      { ...base, search: "خرید روزانه" },
      1,
    );
    // URLSearchParams encodes the space as "+".
    expect(href).toBe("/transactions?q=%D8%AE%D8%B1%DB%8C%D8%AF+%D8%B1%D9%88%D8%B2%D8%A7%D9%86%D9%87");
  });

  it("includes page when greater than one", () => {
    const href = buildTransactionHistoryHref({ ...base, from: "2026-01-01" }, 4);
    expect(href).toBe("/transactions?from=2026-01-01&page=4");
  });

  it("keeps the search term when paginating", () => {
    const href = buildTransactionHistoryHref({ ...base, search: "خرید" }, 2);
    expect(href).toBe("/transactions?q=%D8%AE%D8%B1%DB%8C%D8%AF&page=2");
  });
});

describe("buildTransactionExportHref", () => {
  const filters = {
    type: null,
    accountId: null,
    from: null,
    to: null,
    search: null,
  };

  it("returns the bare export path when no filter is active", () => {
    expect(buildTransactionExportHref(filters)).toBe("/transactions/export");
  });

  it("carries every active filter", () => {
    const href = buildTransactionExportHref({
      type: "expense",
      accountId: ACCOUNT_ID,
      from: "2026-01-01",
      to: "2026-12-31",
      search: "خرید",
    });
    expect(href).toBe(
      `/transactions/export?type=expense&accountId=${ACCOUNT_ID}&from=2026-01-01&to=2026-12-31&q=%D8%AE%D8%B1%DB%8C%D8%AF`,
    );
  });

  it("never carries a page number — an export is not paginated", () => {
    // A full history query (which includes `page`) is still a valid filter
    // input; the export link must ignore the pagination field.
    const query: TransactionHistoryQuery = {
      type: "income",
      accountId: null,
      from: null,
      to: null,
      search: null,
      page: 7,
    };
    expect(buildTransactionExportHref(query)).toBe(
      "/transactions/export?type=income",
    );
  });
});

describe("transactionSearchParamsToRecord", () => {
  it("converts a URLSearchParams into the record shape", () => {
    const record = transactionSearchParamsToRecord(
      new URLSearchParams("type=expense&from=2026-01-01"),
    );
    expect(record).toEqual({ type: "expense", from: "2026-01-01" });
  });

  it("keeps the first value of a repeated parameter", () => {
    const record = transactionSearchParamsToRecord(
      new URLSearchParams("type=expense&type=income&page=2&page=3"),
    );
    expect(record).toEqual({ type: "expense", page: "2" });
  });

  it("yields an empty record for an empty query string", () => {
    expect(transactionSearchParamsToRecord(new URLSearchParams())).toEqual({});
  });
});

describe("buildTransactionEditHref", () => {
  const base: TransactionHistoryQuery = {
    type: null,
    accountId: null,
    from: null,
    to: null,
    search: null,
    page: 1,
  };

  it("encodes the plain history path as returnTo", () => {
    expect(buildTransactionEditHref("t-1", base, 1)).toBe(
      "/transactions/t-1/edit?returnTo=%2Ftransactions",
    );
  });

  it("carries the current filters and page in returnTo", () => {
    const href = buildTransactionEditHref(
      "t-1",
      { ...base, type: "expense" },
      2,
    );
    expect(href).toBe(
      "/transactions/t-1/edit?returnTo=%2Ftransactions%3Ftype%3Dexpense%26page%3D2",
    );
  });

  it("escapes a transaction id", () => {
    expect(buildTransactionEditHref("a/b", base, 1)).toContain(
      "/transactions/a%2Fb/edit",
    );
  });
});

describe("parseTransactionReturnTo", () => {
  it("defaults to the unfiltered history page", () => {
    expect(parseTransactionReturnTo(undefined)).toBe("/transactions");
    expect(parseTransactionReturnTo("")).toBe("/transactions");
  });

  it("keeps a plain history path with filters", () => {
    expect(parseTransactionReturnTo("/transactions?type=income&page=3")).toBe(
      "/transactions?type=income&page=3",
    );
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example",
    "/accounts",
    "/transactions/../accounts",
    "javascript:alert(1)",
  ])("rejects the unsafe value %j", (value) => {
    expect(parseTransactionReturnTo(value)).toBe("/transactions");
  });

  it("takes the first value when the parameter repeats", () => {
    expect(parseTransactionReturnTo(["/transactions?page=2", "/accounts"])).toBe(
      "/transactions?page=2",
    );
  });
});
