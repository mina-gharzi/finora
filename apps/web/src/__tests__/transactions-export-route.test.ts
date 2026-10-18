/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionHistoryItem } from "@/lib/finance/transactions";

const h = vi.hoisted(() => ({
  requireUserId: vi.fn<() => Promise<string>>(),
  listTransactionHistoryForExport: vi.fn<
    (
      userId: string,
      filters: {
        type: string | null;
        accountId: string | null;
        from: string | null;
        to: string | null;
      },
    ) => Promise<TransactionHistoryItem[]>
  >(),
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: h.requireUserId,
}));

vi.mock("@/lib/finance/transactions", () => ({
  listTransactionHistoryForExport: h.listTransactionHistoryForExport,
}));

import { GET } from "@/app/(app)/transactions/export/route";
import { CSV_UTF8_BOM, TRANSACTION_CSV_HEADERS } from "@/lib/finance/csv";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

function item(
  overrides: Partial<TransactionHistoryItem> = {},
): TransactionHistoryItem {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    type: "expense",
    amount: 15000,
    occurredOn: "2026-10-10",
    note: "",
    accountId: ACCOUNT_ID,
    accountName: "بانک ملی",
    accountArchived: false,
    categoryName: "خرید",
    ...overrides,
  };
}

function exportRequest(query = ""): Request {
  return new Request(`http://localhost:3000/transactions/export${query}`);
}

/** The response body bytes (the fetch text() decoder strips a leading BOM). */
async function responseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

/** Decodes the raw bytes as UTF-8, keeping any leading BOM. */
function decodeBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

beforeEach(() => {
  h.requireUserId.mockReset();
  h.listTransactionHistoryForExport.mockReset();
  h.requireUserId.mockResolvedValue(OWNER);
  h.listTransactionHistoryForExport.mockResolvedValue([]);
});

describe("GET /transactions/export", () => {
  it("returns a downloadable UTF-8 CSV with the expected headers", async () => {
    h.listTransactionHistoryForExport.mockResolvedValue([
      item({ note: "خرید, تست" }),
    ]);

    const response = await GET(exportRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="finora-transactions-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const bytes = await responseBytes(response);
    // EF BB BF — the UTF-8 BOM, verified on the wire (text() would strip it).
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const body = decodeBytes(bytes);
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain(TRANSACTION_CSV_HEADERS.join(","));
    expect(body).toContain("15000");
    expect(body).toContain('"خرید, تست"');
  });

  it("scopes the export to the session user and forwards normalized filters", async () => {
    await GET(
      exportRequest(
        `?type=expense&accountId=${ACCOUNT_ID}&from=2026-01-01&to=2026-12-31`,
      ),
    );

    expect(h.requireUserId).toHaveBeenCalledTimes(1);
    expect(h.listTransactionHistoryForExport).toHaveBeenCalledWith(OWNER, {
      type: "expense",
      accountId: ACCOUNT_ID,
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("never forwards a client-supplied user id", async () => {
    await GET(exportRequest("?userId=22222222-2222-4222-8222-222222222222"));

    const filters = h.listTransactionHistoryForExport.mock.calls[0][1];
    expect(filters).not.toHaveProperty("userId");
    expect(h.listTransactionHistoryForExport).toHaveBeenCalledWith(
      OWNER,
      expect.anything(),
    );
  });

  it("ignores invalid filter values instead of failing", async () => {
    await GET(exportRequest("?type=transfer&from=not-a-date&to=2026-13-40"));

    expect(h.listTransactionHistoryForExport).toHaveBeenCalledWith(OWNER, {
      type: null,
      accountId: null,
      from: null,
      to: null,
    });
  });

  it("ignores the page parameter — an export is never paginated", async () => {
    await GET(exportRequest("?page=9999"));

    expect(h.listTransactionHistoryForExport).toHaveBeenCalledWith(
      OWNER,
      expect.not.objectContaining({ page: expect.anything() }),
    );
  });

  it("serves a headers-only file when the user has no transactions", async () => {
    const response = await GET(exportRequest());

    expect(response.status).toBe(200);
    expect(decodeBytes(await responseBytes(response))).toBe(
      `${CSV_UTF8_BOM}${TRANSACTION_CSV_HEADERS.join(",")}\r\n`,
    );
  });

  it("propagates the auth failure without touching the database", async () => {
    const failure = new Error("redirect-to-login");
    h.requireUserId.mockRejectedValue(failure);

    await expect(GET(exportRequest())).rejects.toBe(failure);
    expect(h.listTransactionHistoryForExport).not.toHaveBeenCalled();
  });
});
