/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildTransactionsCsv,
  buildTransactionsCsvExport,
  CSV_UTF8_BOM,
  escapeCsvField,
  toTransactionCsvRow,
  todayIsoDate,
  TRANSACTION_CSV_HEADERS,
  transactionsCsvFilename,
} from "../csv";
import type { TransactionHistoryItem } from "../transactions";

function item(overrides: Partial<TransactionHistoryItem> = {}): TransactionHistoryItem {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    type: "expense",
    amount: 15000,
    occurredOn: "2026-10-10",
    note: "",
    accountId: "33333333-3333-4333-8333-333333333333",
    accountName: "بانک ملی",
    accountArchived: false,
    categoryName: "خرید",
    ...overrides,
  };
}

describe("escapeCsvField", () => {
  it("leaves plain values untouched", () => {
    expect(escapeCsvField("بانک ملی")).toBe("بانک ملی");
    expect(escapeCsvField("2026-10-10")).toBe("2026-10-10");
    expect(escapeCsvField("")).toBe("");
  });

  it("quotes values containing commas", () => {
    expect(escapeCsvField("خرید, قبض")).toBe('"خرید, قبض"');
  });

  it("quotes values containing newlines and doubles inner quotes", () => {
    expect(escapeCsvField('خط اول\nخط "دوم"')).toBe('"خط اول\nخط ""دوم"""');
    expect(escapeCsvField("with\r\nCRLF")).toBe('"with\r\nCRLF"');
  });

  it("neutralizes formula injection by prefixing an apostrophe", () => {
    // No RFC 4180 special characters remain, so the guarded value stays
    // unquoted; the apostrophe alone is what forces spreadsheet apps to
    // treat the cell as literal text.
    expect(escapeCsvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvField("+1+1")).toBe("'+1+1");
    expect(escapeCsvField("-1+1")).toBe("'-1+1");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
    expect(escapeCsvField("  =x")).toBe("'  =x");
    expect(escapeCsvField("\t=x")).toBe("'\t=x");
  });

  it("quotes and guards a formula value that also contains separators", () => {
    expect(escapeCsvField("=SUM(A1),x")).toBe(`"'=SUM(A1),x"`);
  });

  it("keeps ordinary Persian text and plain negatives out of the guard", () => {
    expect(escapeCsvField("پرداخت قبض برق")).toBe("پرداخت قبض برق");
  });
});

describe("toTransactionCsvRow", () => {
  it("maps history items with Persian labels and a plain amount", () => {
    const mapped = toTransactionCsvRow(
      item({ type: "income", categoryName: null, note: "حقوق مهر" }),
    );

    expect(mapped).toEqual({
      occurredOn: "2026-10-10",
      typeLabel: "درآمد",
      amount: 15000,
      accountName: "بانک ملی",
      categoryName: null,
      note: "حقوق مهر",
    });
  });
});

describe("buildTransactionsCsv", () => {
  it("emits Persian headers, CRLF rows and preserved calendar dates", () => {
    const csv = buildTransactionsCsv([
      toTransactionCsvRow(item()),
      toTransactionCsvRow(item({ type: "income", amount: 5000000 })),
    ]);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(TRANSACTION_CSV_HEADERS.join(","));
    expect(lines[0]).toContain("تاریخ (میلادی)");
    expect(lines[1]).toBe("2026-10-10,هزینه,15000,بانک ملی,خرید,");
    expect(lines[2]).toBe("2026-10-10,درآمد,5000000,بانک ملی,خرید,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("uses the no-category label and keeps amounts machine-readable", () => {
    const csv = buildTransactionsCsv([
      toTransactionCsvRow(item({ categoryName: null, amount: 120000 })),
    ]);
    const dataLine = csv.split("\r\n")[1];

    expect(dataLine).toContain("بدون دسته‌بندی");
    // The amount cell is a bare integer: no thousands separator and no
    // display-only unit suffix (the unit lives in the header column only).
    expect(dataLine).toContain("120000");
    expect(dataLine).not.toContain("120,000");
    expect(dataLine).not.toContain("تومان");
    expect(csv).not.toContain("120,000");
  });

  it("escapes notes containing commas, quotes and a leading formula", () => {
    const csv = buildTransactionsCsv([
      toTransactionCsvRow(item({ note: '=SUM(A1), "ویژه"\nخط دوم' })),
    ]);

    expect(csv).toContain(`"'=SUM(A1), ""ویژه""\nخط دوم"`);
  });

  it("preserves Persian text verbatim (UTF-8, no escaping)", () => {
    const csv = buildTransactionsCsv([
      toTransactionCsvRow(item({ note: "پرداخت به کیف پول" })),
    ]);

    expect(csv).toContain("پرداخت به کیف پول");
    expect(csv).not.toContain("\\u");
  });

  it("returns a headers-only document when there are no rows", () => {
    const csv = buildTransactionsCsv([]);

    expect(csv).toBe(`${TRANSACTION_CSV_HEADERS.join(",")}\r\n`);
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});

describe("download payload", () => {
  it("prefixes the body with a UTF-8 BOM", () => {
    const { body } = buildTransactionsCsvExport([item()], "2026-10-18");

    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body.startsWith(CSV_UTF8_BOM)).toBe(true);
    expect(body).toContain(TRANSACTION_CSV_HEADERS.join(","));
  });

  it("builds a safe ASCII filename stamped with the export date", () => {
    expect(transactionsCsvFilename("2026-10-18")).toBe(
      "finora-transactions-2026-10-18.csv",
    );
  });

  it("exports an empty history as BOM + headers only", () => {
    const { body, filename } = buildTransactionsCsvExport([], "2026-10-18");

    expect(body).toBe(`${CSV_UTF8_BOM}${TRANSACTION_CSV_HEADERS.join(",")}\r\n`);
    expect(filename).toBe("finora-transactions-2026-10-18.csv");
  });
});

describe("todayIsoDate", () => {
  it("returns the UTC calendar date", () => {
    expect(todayIsoDate(new Date("2026-10-18T23:59:59Z"))).toBe("2026-10-18");
    expect(todayIsoDate(new Date("2026-10-19T00:00:01Z"))).toBe("2026-10-19");
  });
});
