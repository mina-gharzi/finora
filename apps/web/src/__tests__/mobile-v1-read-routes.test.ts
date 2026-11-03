/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMobileBearerToken: vi.fn(),
  getDashboardData: vi.fn(),
  getAccountBalances: vi.fn(),
  listCategories: vi.fn(),
  listTransactionHistory: vi.fn(),
  getBudgetsData: vi.fn(),
  listTransfers: vi.fn(),
}));

vi.mock("@/lib/mobile/auth", () => ({
  verifyMobileBearerToken: mocks.verifyMobileBearerToken,
}));

vi.mock("@/lib/finance/dashboard", () => ({
  getDashboardData: mocks.getDashboardData,
  getAccountBalances: mocks.getAccountBalances,
}));

vi.mock("@/lib/finance/categories", () => ({
  listCategories: mocks.listCategories,
}));

vi.mock("@/lib/finance/transactions", () => ({
  listTransactionHistory: mocks.listTransactionHistory,
}));

vi.mock("@/lib/finance/budgets", () => ({
  getBudgetsData: mocks.getBudgetsData,
}));

vi.mock("@/lib/finance/transfers", () => ({
  listTransfers: mocks.listTransfers,
}));

import { GET as overviewGET } from "@/app/api/v1/overview/route";
import { GET as accountsGET } from "@/app/api/v1/accounts/route";
import { GET as categoriesGET } from "@/app/api/v1/categories/route";
import { GET as transactionsGET } from "@/app/api/v1/transactions/route";
import { GET as budgetsGET } from "@/app/api/v1/budgets/route";
import { GET as transfersGET } from "@/app/api/v1/transfers/route";

const USER_ID = "user-1";
const ACCOUNT_ID = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";

type RouteGet = (request: Request) => Promise<Response>;

const ROUTES: Array<{ name: string; path: string; get: RouteGet }> = [
  { name: "overview", path: "/api/v1/overview", get: overviewGET },
  { name: "accounts", path: "/api/v1/accounts", get: accountsGET },
  { name: "categories", path: "/api/v1/categories", get: categoriesGET },
  { name: "transactions", path: "/api/v1/transactions", get: transactionsGET },
  { name: "budgets", path: "/api/v1/budgets", get: budgetsGET },
  { name: "transfers", path: "/api/v1/transfers", get: transfersGET },
];

function request(path: string, token = "token-1"): Request {
  return new Request(`http://127.0.0.1:3000${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function expectNoUserId(value: unknown) {
  expect(JSON.stringify(value)).not.toContain('"userId"');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyMobileBearerToken.mockResolvedValue({
    ok: true,
    userId: USER_ID,
  });
});

describe("versioned mobile read routes", () => {
  it("rejects every route without a Bearer token", async () => {
    mocks.verifyMobileBearerToken.mockResolvedValue({ ok: false, status: 401 });

    for (const route of ROUTES) {
      const response = await route.get(request(route.path, ""));

      expect(response.status, route.name).toBe(401);
      expect(response.headers.get("cache-control"), route.name).toBe(
        "no-store",
      );
      expect(await response.json(), route.name).toMatchObject({
        error: "unauthorized",
      });
    }

    for (const domain of [
      mocks.getAccountBalances,
      mocks.listCategories,
      mocks.listTransactionHistory,
      mocks.getBudgetsData,
      mocks.listTransfers,
    ]) {
      expect(domain).not.toHaveBeenCalled();
    }
  });

  it("returns every account, including archived ones", async () => {
    mocks.getAccountBalances.mockResolvedValue([
      { id: "a1", name: "نقدی", type: "cash", archived: false, balance: 500 },
      { id: "a2", name: "بانک", type: "bank", archived: true, balance: 1200 },
    ]);

    const response = await accountsGET(request("/api/v1/accounts"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getAccountBalances).toHaveBeenCalledWith(USER_ID);
    expect(body).toEqual({
      items: [
        { id: "a1", name: "نقدی", type: "cash", archived: false, balance: 500 },
        {
          id: "a2",
          name: "بانک",
          type: "bank",
          archived: true,
          balance: 1200,
        },
      ],
    });
    expectNoUserId(body);
  });

  it("maps categories to the public fields only", async () => {
    mocks.listCategories.mockResolvedValue([
      {
        id: "c1",
        userId: USER_ID,
        name: "خرید",
        kind: "expense",
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const response = await categoriesGET(request("/api/v1/categories"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listCategories).toHaveBeenCalledWith(USER_ID);
    expect(body).toEqual({
      items: [{ id: "c1", name: "خرید", kind: "expense", archived: false }],
    });
    expectNoUserId(body);
  });

  it("forwards history filters and returns page, pageSize and total", async () => {
    mocks.listTransactionHistory.mockResolvedValue({
      items: [
        {
          id: "t1",
          type: "expense",
          amount: 40000,
          occurredOn: "2026-01-01",
          note: "خرید",
          accountId: ACCOUNT_ID,
          accountName: "نقدی",
          accountArchived: false,
          categoryId: "c1",
          categoryName: "خرید",
        },
      ],
      page: 3,
      pageSize: 20,
      total: 42,
      hasMore: true,
    });

    const params = new URLSearchParams({
      type: "expense",
      accountId: ACCOUNT_ID,
      from: "2026-01-01",
      to: "2026-12-31",
      q: "خرید",
      page: "3",
    });
    const response = await transactionsGET(
      request(`/api/v1/transactions?${params.toString()}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listTransactionHistory).toHaveBeenCalledWith(USER_ID, {
      type: "expense",
      accountId: ACCOUNT_ID,
      from: "2026-01-01",
      to: "2026-12-31",
      search: "خرید",
      page: 3,
    });
    expect(body).toEqual({
      items: [
        {
          id: "t1",
          type: "expense",
          amount: 40000,
          occurredOn: "2026-01-01",
          note: "خرید",
          accountId: ACCOUNT_ID,
          accountName: "نقدی",
          categoryId: "c1",
          categoryName: "خرید",
        },
      ],
      page: 3,
      pageSize: 20,
      total: 42,
    });
    expectNoUserId(body);
  });

  it("returns the 100 most recent transfers", async () => {
    mocks.listTransfers.mockResolvedValue([
      {
        id: "tr1",
        fromAccountId: "a1",
        fromAccountName: "نقدی",
        toAccountId: "a2",
        toAccountName: "بانک",
        amount: 100000,
        occurredOn: "2026-01-01",
        note: "",
      },
    ]);

    const response = await transfersGET(request("/api/v1/transfers"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listTransfers).toHaveBeenCalledWith(USER_ID, 100);
    expect(body).toEqual({
      items: [
        {
          id: "tr1",
          fromAccountId: "a1",
          fromAccountName: "نقدی",
          toAccountId: "a2",
          toAccountName: "بانک",
          amount: 100000,
          occurredOn: "2026-01-01",
          note: "",
        },
      ],
    });
    expectNoUserId(body);
  });
});
