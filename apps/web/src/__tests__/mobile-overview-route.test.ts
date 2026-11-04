/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMobileBearerToken: vi.fn(),
  getDashboardData: vi.fn(),
  hasAnyBudgets: vi.fn(),
  ensureRecurringUpToDateSafe: vi.fn(),
}));

vi.mock("@/lib/mobile/auth", () => ({
  verifyMobileBearerToken: mocks.verifyMobileBearerToken,
}));

vi.mock("@/lib/finance/dashboard", () => ({
  getDashboardData: mocks.getDashboardData,
}));

vi.mock("@/lib/finance/budgets", () => ({
  hasAnyBudgets: mocks.hasAnyBudgets,
}));

vi.mock("@/lib/finance/recurring", () => ({
  ensureRecurringUpToDateSafe: mocks.ensureRecurringUpToDateSafe,
}));

import { GET } from "@/app/api/mobile/overview/route";

function overviewRequest(query = "") {
  return new Request(
    `http://127.0.0.1:3000/api/mobile/overview${query}`,
    { headers: { authorization: "Bearer token-1" } },
  );
}

const dashboardData = {
  totals: { income: 100, expense: 40, net: 60 },
  categoryBreakdown: [
    { categoryId: null, categoryName: null, amount: 40 },
  ],
  accountBalances: [
    { id: "a1", name: "نقدی", type: "cash", archived: false, balance: 500 },
  ],
  recentTransactions: [
    {
      id: "t1",
      type: "expense",
      amount: 40,
      occurredOn: "2026-10-20",
      note: "خرید",
      accountId: "a1",
      accountName: "نقدی",
      categoryName: null,
    },
  ],
  hasAccounts: true,
  hasTransactions: true,
};

beforeEach(() => {
  mocks.verifyMobileBearerToken.mockReset();
  mocks.getDashboardData.mockReset();
  mocks.hasAnyBudgets.mockReset();
  mocks.ensureRecurringUpToDateSafe.mockReset();
  mocks.verifyMobileBearerToken.mockResolvedValue({
    ok: true,
    userId: "user-1",
  });
  mocks.getDashboardData.mockResolvedValue(dashboardData);
  mocks.hasAnyBudgets.mockResolvedValue(true);
});

describe("GET /api/mobile/overview", () => {
  it("returns 401 JSON without querying data when the bearer token is invalid", async () => {
    mocks.verifyMobileBearerToken.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const response = await GET(overviewRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
    expect(mocks.hasAnyBudgets).not.toHaveBeenCalled();
  });

  it("derives the user from the verified token and forwards the period", async () => {
    const response = await GET(overviewRequest("?period=prev-month"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.verifyMobileBearerToken).toHaveBeenCalledWith("Bearer token-1");
    expect(mocks.ensureRecurringUpToDateSafe).toHaveBeenCalledWith("user-1");
    expect(mocks.getDashboardData).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ period: "prev-month" }),
    );
    expect(body).toMatchObject({
      period: "prev-month",
      totals: { income: 100, expense: 40, net: 60 },
      hasAccounts: true,
      hasTransactions: true,
      hasBudgets: true,
    });
    expect(body.categoryBreakdown[0]).toEqual({
      categoryId: null,
      categoryName: null,
      amount: 40,
    });
    expect(body.accountBalances[0]).toEqual({
      id: "a1",
      name: "نقدی",
      type: "cash",
      balance: 500,
    });
    expect(body.accountBalances[0]).not.toHaveProperty("archived");
    expect(body.recentTransactions[0]).not.toHaveProperty("accountId");
  });

  it("falls back to the default period for invalid input", async () => {
    await GET(overviewRequest("?period=unknown"));

    expect(mocks.getDashboardData).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ period: "this-month" }),
    );
  });

  it("reports whether the owner has any budget", async () => {
    mocks.hasAnyBudgets.mockResolvedValue(false);

    const response = await GET(overviewRequest());
    const body = await response.json();

    expect(mocks.hasAnyBudgets).toHaveBeenCalledWith("user-1");
    expect(body.hasBudgets).toBe(false);
  });

  it("does not disguise a data read failure as an auth failure", async () => {
    mocks.getDashboardData.mockRejectedValue(new Error("database down"));

    await expect(GET(overviewRequest())).rejects.toThrow("database down");
  });
});
