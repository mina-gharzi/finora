/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMobileBearerToken: vi.fn(),
  isEmailVerifiedFor: vi.fn(),
  getAccountBalances: vi.fn(),
  getDashboardData: vi.fn(),
  createAccount: vi.fn(),
  setAccountArchived: vi.fn(),
  deleteAccount: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  setCategoryArchived: vi.fn(),
  deleteCategory: vi.fn(),
  listTransactionHistory: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  getBudgetsData: vi.fn(),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  listTransfers: vi.fn(),
  createTransfer: vi.fn(),
  deleteTransfer: vi.fn(),
}));

const idem = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/db", () => {
  function insertChain() {
    let values: Record<string, unknown> = {};
    const chain = {
      values: (value: Record<string, unknown>) => {
        values = value;
        return chain;
      },
      onConflictDoNothing: () => chain,
      returning: () => {
        const exists = idem.rows.some(
          (row) => row.userId === values.userId && row.key === values.key,
        );
        if (exists) {
          return Promise.resolve([]);
        }

        const row = {
          id: `row-${idem.rows.length + 1}`,
          responseStatus: null,
          responseBody: null,
          createdAt: new Date(),
          ...values,
        };
        idem.rows.push(row);
        return Promise.resolve([{ id: row.id }]);
      },
    };
    return chain;
  }

  function deleteChain() {
    return { where: () => Promise.resolve(undefined) };
  }

  function selectChain() {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve([...idem.rows]),
    };
    return chain;
  }

  function updateChain() {
    let values: Record<string, unknown> = {};
    const chain = {
      set: (value: Record<string, unknown>) => {
        values = value;
        return chain;
      },
      where: () => {
        for (const row of idem.rows) {
          Object.assign(row, values);
        }
        return Promise.resolve(undefined);
      },
    };
    return chain;
  }

  return {
    getDb: () => ({
      insert: insertChain,
      delete: deleteChain,
      select: selectChain,
      update: updateChain,
    }),
  };
});

vi.mock("@/lib/mobile/auth", () => ({
  verifyMobileBearerToken: mocks.verifyMobileBearerToken,
}));

vi.mock("@/lib/users", () => ({
  isEmailVerifiedFor: mocks.isEmailVerifiedFor,
}));

vi.mock("@/lib/finance/dashboard", () => ({
  getAccountBalances: mocks.getAccountBalances,
  getDashboardData: mocks.getDashboardData,
}));

vi.mock("@/lib/finance/accounts", () => ({
  createAccount: mocks.createAccount,
  setAccountArchived: mocks.setAccountArchived,
  deleteAccount: mocks.deleteAccount,
}));

vi.mock("@/lib/finance/categories", () => ({
  listCategories: mocks.listCategories,
  createCategory: mocks.createCategory,
  renameCategory: mocks.renameCategory,
  setCategoryArchived: mocks.setCategoryArchived,
  deleteCategory: mocks.deleteCategory,
}));

vi.mock("@/lib/finance/transactions", () => ({
  listTransactionHistory: mocks.listTransactionHistory,
  createTransaction: mocks.createTransaction,
  updateTransaction: mocks.updateTransaction,
  deleteTransaction: mocks.deleteTransaction,
}));

vi.mock("@/lib/finance/budgets", () => ({
  getBudgetsData: mocks.getBudgetsData,
  createBudget: mocks.createBudget,
  updateBudget: mocks.updateBudget,
  deleteBudget: mocks.deleteBudget,
}));

vi.mock("@/lib/finance/transfers", () => ({
  listTransfers: mocks.listTransfers,
  createTransfer: mocks.createTransfer,
  deleteTransfer: mocks.deleteTransfer,
}));

import { POST as accountsCreate } from "@/app/api/v1/accounts/route";
import {
  PATCH as accountsPatch,
  DELETE as accountsDelete,
} from "@/app/api/v1/accounts/[id]/route";
import { POST as categoriesCreate } from "@/app/api/v1/categories/route";
import {
  PATCH as categoriesPatch,
  DELETE as categoriesDelete,
} from "@/app/api/v1/categories/[id]/route";
import { POST as transactionsCreate } from "@/app/api/v1/transactions/route";
import {
  PUT as transactionsUpdate,
  DELETE as transactionsDelete,
} from "@/app/api/v1/transactions/[id]/route";
import { POST as budgetsCreate } from "@/app/api/v1/budgets/route";
import {
  PUT as budgetsUpdate,
  DELETE as budgetsDelete,
} from "@/app/api/v1/budgets/[id]/route";
import { POST as transfersCreate } from "@/app/api/v1/transfers/route";
import { DELETE as transfersDelete } from "@/app/api/v1/transfers/[id]/route";
import { mapDomainFailure } from "@/lib/mobile/http";

const USER_ID = "user-1";
const ID = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";

type RouteContext = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: RouteContext) => Promise<Response>;

const CONTEXT: RouteContext = { params: Promise.resolve({ id: ID }) };

const WRITE_ROUTES: Array<{ name: string; handler: Handler }> = [
  { name: "accounts POST", handler: accountsCreate },
  { name: "accounts PATCH", handler: accountsPatch },
  { name: "accounts DELETE", handler: accountsDelete },
  { name: "categories POST", handler: categoriesCreate },
  { name: "categories PATCH", handler: categoriesPatch },
  { name: "categories DELETE", handler: categoriesDelete },
  { name: "transactions POST", handler: transactionsCreate },
  { name: "transactions PUT", handler: transactionsUpdate },
  { name: "transactions DELETE", handler: transactionsDelete },
  { name: "budgets POST", handler: budgetsCreate },
  { name: "budgets PUT", handler: budgetsUpdate },
  { name: "budgets DELETE", handler: budgetsDelete },
  { name: "transfers POST", handler: transfersCreate },
  { name: "transfers DELETE", handler: transfersDelete },
];

const DOMAIN_MOCKS = [
  mocks.createAccount,
  mocks.setAccountArchived,
  mocks.deleteAccount,
  mocks.createCategory,
  mocks.renameCategory,
  mocks.setCategoryArchived,
  mocks.deleteCategory,
  mocks.createTransaction,
  mocks.updateTransaction,
  mocks.deleteTransaction,
  mocks.createBudget,
  mocks.updateBudget,
  mocks.deleteBudget,
  mocks.createTransfer,
  mocks.deleteTransfer,
];

function request(body = "{}", key?: string): Request {
  const headers = new Headers({
    "content-type": "application/json",
    authorization: "Bearer token-1",
  });
  if (key !== undefined) {
    headers.set("Idempotency-Key", key);
  }

  return new Request("http://127.0.0.1:3000/api/v1", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  idem.rows = [];
  mocks.verifyMobileBearerToken.mockResolvedValue({
    ok: true,
    userId: USER_ID,
  });
  mocks.isEmailVerifiedFor.mockResolvedValue(true);
});

describe("mutating mobile routes auth", () => {
  it("returns 401 on every mutating route without a Bearer token", async () => {
    mocks.verifyMobileBearerToken.mockResolvedValue({ ok: false, status: 401 });

    for (const route of WRITE_ROUTES) {
      const response = await route.handler(request(), CONTEXT);

      expect(response.status, route.name).toBe(401);
      expect(response.headers.get("cache-control"), route.name).toBe(
        "no-store",
      );
      expect(await response.json(), route.name).toMatchObject({
        error: "unauthorized",
      });
    }

    expect(mocks.isEmailVerifiedFor).not.toHaveBeenCalled();
    for (const domain of DOMAIN_MOCKS) {
      expect(domain).not.toHaveBeenCalled();
    }
  });

  it("returns 403 email_not_verified on every mutating route for unverified users", async () => {
    mocks.isEmailVerifiedFor.mockResolvedValue(false);

    for (const route of WRITE_ROUTES) {
      const response = await route.handler(request(), CONTEXT);

      expect(response.status, route.name).toBe(403);
      expect(await response.json(), route.name).toMatchObject({
        error: "email_not_verified",
      });
    }

    expect(mocks.isEmailVerifiedFor).toHaveBeenCalledWith(USER_ID);
    for (const domain of DOMAIN_MOCKS) {
      expect(domain).not.toHaveBeenCalled();
    }
  });
});

describe("mapDomainFailure", () => {
  it("maps fieldErrors to 422 validation_failed", async () => {
    const response = mapDomainFailure({
      ok: false,
      fieldErrors: { name: "نام را وارد کنید." },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "validation_failed",
      message: expect.any(String),
      fieldErrors: { name: "نام را وارد کنید." },
    });
  });

  it("maps reason invalid to 422 even without fieldErrors", async () => {
    const response = mapDomainFailure({ ok: false, reason: "invalid" });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "validation_failed",
    });
  });

  it("maps not_found and boolean false to 404", async () => {
    const notFound = mapDomainFailure({ ok: false, reason: "not_found" });
    const falseResult = mapDomainFailure(false);

    expect(notFound.status).toBe(404);
    expect(falseResult.status).toBe(404);
    expect(await notFound.json()).toMatchObject({ error: "not_found" });
    expect(await falseResult.json()).toMatchObject({ error: "not_found" });
  });

  it("maps duplicate to 409", async () => {
    const response = mapDomainFailure({ ok: false, reason: "duplicate" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "duplicate" });
  });

  it("maps has_transactions to 409 and keeps transactionCount", async () => {
    const response = mapDomainFailure({
      ok: false,
      reason: "has_transactions",
      transactionCount: 3,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "has_transactions",
      message: expect.any(String),
      transactionCount: 3,
    });
  });
});

describe("mutating route adapters", () => {
  const TRANSACTION_ROW = {
    id: "t1",
    userId: USER_ID,
    accountId: ID,
    categoryId: null,
    type: "expense",
    amount: 5000,
    occurredOn: "2026-01-01",
    note: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("creates a transaction with 201 and never echoes userId", async () => {
    mocks.createTransaction.mockResolvedValue({
      ok: true,
      transaction: TRANSACTION_ROW,
    });

    const body = {
      accountId: ID,
      categoryId: null,
      type: "expense",
      amount: 5000,
      occurredOn: "2026-01-01",
      note: "",
      userId: "attacker",
    };

    const response = await transactionsCreate(
      request(JSON.stringify(body)),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.createTransaction).toHaveBeenCalledWith(USER_ID, body);
    expect(payload).toEqual({
      id: "t1",
      type: "expense",
      amount: 5000,
      occurredOn: "2026-01-01",
      note: "",
      accountId: ID,
      categoryId: null,
    });
    expect(JSON.stringify(payload)).not.toContain('"userId"');
  });

  it("creates a transaction only once when retried with the same Idempotency-Key", async () => {
    mocks.createTransaction.mockResolvedValue({
      ok: true,
      transaction: TRANSACTION_ROW,
    });

    const body = JSON.stringify({
      accountId: ID,
      categoryId: null,
      type: "expense",
      amount: 5000,
      occurredOn: "2026-01-01",
      note: "",
    });
    const key = "retry-key-12345678";

    const first = await transactionsCreate(request(body, key));
    const second = await transactionsCreate(request(body, key));

    expect(mocks.createTransaction).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    expect(await second.json()).toEqual(await first.json());
  });

  it("ignores a body-supplied userId when creating an account", async () => {
    mocks.createAccount.mockResolvedValue({
      ok: true,
      account: {
        id: "a1",
        userId: USER_ID,
        name: "نقدی",
        type: "cash",
        openingBalance: 1000,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const body = {
      name: "نقدی",
      type: "cash",
      openingBalance: 1000,
      userId: "attacker",
    };

    const response = await accountsCreate(
      request(JSON.stringify(body)),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.createAccount).toHaveBeenCalledWith(USER_ID, body);
    expect(payload).toEqual({
      id: "a1",
      name: "نقدی",
      type: "cash",
      openingBalance: 1000,
      archived: false,
    });
    expect(JSON.stringify(payload)).not.toContain('"userId"');
  });
});
