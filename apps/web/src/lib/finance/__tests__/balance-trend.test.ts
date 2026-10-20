import { describe, expect, it } from "vitest";
import {
  BALANCE_TREND_RANGES,
  DEFAULT_BALANCE_TREND_RANGE,
  buildBalanceWindow,
  computeBalancePoints,
  parseBalanceTrendRange,
} from "@/lib/finance/balance-trend";
import { reportsMonthFromKey } from "@/lib/finance/reports-range";

/**
 * Anchor (verified by reports-range.test.ts): Mehr 1405 (`1405-07`) has
 * Gregorian bounds 2026-09-23 … 2026-10-22. Counting back six months ends at
 * اردیبهشت 1405 (`1405-02`).
 */
const TODAY = "2026-10-10";

describe("parseBalanceTrendRange", () => {
  it("accepts every supported window length", () => {
    for (const range of BALANCE_TREND_RANGES) {
      expect(parseBalanceTrendRange(String(range))).toBe(range);
    }
  });

  it("takes the first element of an array", () => {
    expect(parseBalanceTrendRange(["24", "6"])).toBe(24);
  });

  it("falls back to the default for anything unsupported or malformed", () => {
    for (const value of [undefined, "", "abc", "7", "0", "-12", "6.5", "1e3"]) {
      expect(parseBalanceTrendRange(value)).toBe(DEFAULT_BALANCE_TREND_RANGE);
    }
  });
});

describe("buildBalanceWindow", () => {
  it("returns the requested count of consecutive months, oldest first", () => {
    const window = buildBalanceWindow(TODAY, 6);

    expect(window).toHaveLength(6);
    expect(window.map((month) => month.param)).toEqual([
      "1405-02",
      "1405-03",
      "1405-04",
      "1405-05",
      "1405-06",
      "1405-07",
    ]);
    expect(window[0]?.label).toBe("اردیبهشت 1405");
    expect(window[5]?.label).toBe("مهر 1405");
  });

  it("crosses a Jalali year boundary without gaps", () => {
    // Farvardin 1405 shifted back 5 months reaches Aban 1404.
    const window = buildBalanceWindow("2026-04-05", 6);
    expect(window.map((month) => month.param)).toEqual([
      "1404-08",
      "1404-09",
      "1404-10",
      "1404-11",
      "1404-12",
      "1405-01",
    ]);
  });
});

describe("computeBalancePoints", () => {
  const months = buildBalanceWindow(TODAY, 3); // مرداد، شهریور، مهر 1405

  it("accumulates opening + before + monthly nets into month-end balances", () => {
    const points = computeBalancePoints(months, {
      openingBalanceTotal: 1_000_000,
      beforeNet: 500_000,
      monthly: [
        { income: 300_000, expense: 100_000, net: 200_000 },
        { income: 0, expense: 400_000, net: -400_000 },
        { income: 100_000, expense: 100_000, net: 0 },
      ],
    });

    expect(points.map((point) => point.param)).toEqual([
      "1405-05",
      "1405-06",
      "1405-07",
    ]);
    // 1,000,000 opening + 500,000 before = 1,500,000 start.
    expect(points[0]?.balance).toBe(1_700_000);
    expect(points[1]?.balance).toBe(1_300_000);
    expect(points[2]?.balance).toBe(1_300_000);
  });
  it("records income, expense and net for each month", () => {
    const points = computeBalancePoints(months, {
      openingBalanceTotal: 0,
      beforeNet: 0,
      monthly: [{ income: 300_000, expense: 100_000, net: 200_000 }],
    });

    expect(points[0]).toMatchObject({
      income: 300_000,
      expense: 100_000,
      net: 200_000,
    });
  });

  it("sets change to null for the first point and signed deltas after", () => {
    const points = computeBalancePoints(months, {
      openingBalanceTotal: 1_000_000,
      beforeNet: 0,
      monthly: [
        { income: 0, expense: 0, net: 0 },
        { income: 0, expense: 300_000, net: -300_000 },
        { income: 500_000, expense: 0, net: 500_000 },
      ],
    });

    expect(points[0]?.change).toBeNull();
    expect(points[1]?.change).toBe(-300_000);
    expect(points[2]?.change).toBe(500_000);
  });

  it("supports negative balances", () => {
    const points = computeBalancePoints(months, {
      openingBalanceTotal: 0,
      beforeNet: 0,
      monthly: [{ income: 0, expense: 250_000, net: -250_000 }],
    });

    expect(points[0]?.balance).toBe(-250_000);
  });

  it("treats a missing monthly entry as a zero month", () => {
    const points = computeBalancePoints(months, {
      openingBalanceTotal: 100_000,
      beforeNet: 0,
      monthly: [],
    });

    for (const point of points) {
      expect(point.balance).toBe(100_000);
      expect(point.net).toBe(0);
    }
  });

  it("throws rather than losing precision when the balance overflows", () => {
    expect(() =>
      computeBalancePoints(months, {
        openingBalanceTotal: Number.MAX_SAFE_INTEGER,
        beforeNet: 0,
        monthly: [{ income: 0, expense: 0, net: 10 }],
      }),
    ).toThrow(RangeError);
  });

  it("carries the month labels through", () => {
    const points = computeBalancePoints([reportsMonthFromKey({ year: 1405, month: 7 })], {
      openingBalanceTotal: 0,
      beforeNet: 0,
      monthly: [],
    });

    expect(points[0]).toMatchObject({
      param: "1405-07",
      label: "مهر 1405",
      shortLabel: "مهر",
    });
  });
});
