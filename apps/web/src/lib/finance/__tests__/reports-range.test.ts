/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  REPORTS_MONTH_PARAM,
  REPORT_TREND_MONTHS,
  buildReportsHref,
  buildTrendWindow,
  currentJalaliMonthKey,
  parseReportsMonthParam,
  previousJalaliMonthKey,
  recentMonthOptions,
  reportsMonthFromKey,
  shiftJalaliMonthKey,
} from "@/lib/finance/reports-range";

/**
 * Anchors verified by dashboard-range.test.ts (ICU `persian`, UTC):
 * - 2026-10-18 is 1405/07/26 (Mehr 26). Mehr 1405: 2026-09-23 … 2026-10-22.
 * - Shahrivar 1405 (31 days): 2026-08-23 … 2026-09-22.
 * - Farvardin 1405 (31 days): 2026-03-21 … 2026-04-20.
 * - Esfand 1404 (29 days): 2026-02-20 … 2026-03-20.
 */
const TODAY = "2026-10-18";

describe("currentJalaliMonthKey", () => {
  it("derives the Jalali year and month from today (UTC)", () => {
    expect(currentJalaliMonthKey(TODAY)).toEqual({ year: 1405, month: 7 });
  });

  it("is exact on a month's first and last day", () => {
    expect(currentJalaliMonthKey("2026-09-23")).toEqual({
      year: 1405,
      month: 7,
    });
    expect(currentJalaliMonthKey("2026-10-22")).toEqual({
      year: 1405,
      month: 7,
    });
  });
});

describe("shiftJalaliMonthKey", () => {
  it("moves within a year", () => {
    expect(shiftJalaliMonthKey({ year: 1405, month: 7 }, -1)).toEqual({
      year: 1405,
      month: 6,
    });
    expect(shiftJalaliMonthKey({ year: 1405, month: 7 }, 1)).toEqual({
      year: 1405,
      month: 8,
    });
  });

  it("crosses the year boundary backwards (Farvardin → Esfand)", () => {
    expect(shiftJalaliMonthKey({ year: 1405, month: 1 }, -1)).toEqual({
      year: 1404,
      month: 12,
    });
  });

  it("crosses the year boundary forwards (Esfand → Farvardin)", () => {
    expect(shiftJalaliMonthKey({ year: 1404, month: 12 }, 1)).toEqual({
      year: 1405,
      month: 1,
    });
  });

  it("shifts by more than one month across years", () => {
    expect(shiftJalaliMonthKey({ year: 1405, month: 3 }, -5)).toEqual({
      year: 1404,
      month: 10,
    });
  });
});

describe("reportsMonthFromKey", () => {
  it("resolves a 30-day month (Mehr 1405)", () => {
    const month = reportsMonthFromKey({ year: 1405, month: 7 });
    expect(month.param).toBe("1405-07");
    expect(month.from).toBe("2026-09-23");
    expect(month.to).toBe("2026-10-22");
    expect(month.label).toBe("مهر 1405");
    expect(month.shortLabel).toBe("مهر");
  });

  it("resolves a 31-day month (Farvardin 1405)", () => {
    const month = reportsMonthFromKey({ year: 1405, month: 1 });
    expect(month.from).toBe("2026-03-21");
    expect(month.to).toBe("2026-04-20");
  });

  it("resolves a 29-day month (Esfand 1404)", () => {
    const month = reportsMonthFromKey({ year: 1404, month: 12 });
    expect(month.from).toBe("2026-02-20");
    expect(month.to).toBe("2026-03-20");
  });

  it("resolves a 31-day month before a 30-day month (Shahrivar → Mehr 1405)", () => {
    const shahrivar = reportsMonthFromKey({ year: 1405, month: 6 });
    const mehr = reportsMonthFromKey({ year: 1405, month: 7 });
    expect(shahrivar.to).toBe("2026-09-22");
    expect(mehr.from).toBe("2026-09-23");
    expect(shahrivar.to < mehr.from).toBe(true);
  });

  it("has no gap or overlap across a year boundary (Esfand 1404 → Farvardin 1405)", () => {
    const esfand = reportsMonthFromKey({ year: 1404, month: 12 });
    const farvardin = reportsMonthFromKey({ year: 1405, month: 1 });
    expect(esfand.to).toBe("2026-03-20");
    expect(farvardin.from).toBe("2026-03-21");
    expect(farvardin.from > esfand.to).toBe(true);
  });

  it("builds a range label from inclusive Gregorian bounds", () => {
    const month = reportsMonthFromKey({ year: 1405, month: 7 });
    expect(month.rangeLabel).toBe("1405/07/01 تا 1405/07/30");
  });

  it("throws for a month outside 1–12", () => {
    expect(() => reportsMonthFromKey({ year: 1405, month: 13 })).toThrow(
      RangeError,
    );
    expect(() => reportsMonthFromKey({ year: 1405, month: 0 })).toThrow(
      RangeError,
    );
  });

  it("throws for non-integer keys", () => {
    expect(() => reportsMonthFromKey({ year: 1405.5, month: 7 })).toThrow(
      RangeError,
    );
  });
});

describe("parseReportsMonthParam", () => {
  it("accepts a well-formed Jalali year-month", () => {
    expect(parseReportsMonthParam("1405-07", TODAY)).toEqual({
      year: 1405,
      month: 7,
    });
    expect(parseReportsMonthParam("1405-12", TODAY)).toEqual({
      year: 1405,
      month: 12,
    });
    expect(parseReportsMonthParam("1405-01", TODAY)).toEqual({
      year: 1405,
      month: 1,
    });
  });

  it("reads the first value of a repeated query parameter", () => {
    expect(parseReportsMonthParam(["1405-06", "1405-07"], TODAY)).toEqual({
      year: 1405,
      month: 6,
    });
  });

  it.each([
    undefined,
    "",
    "1405",
    "1405-7",
    "1405-13",
    "1405-00",
    "1405-1a",
    "abc-def",
    "999-07",
    "2000-07",
    "'; drop table transactions; --",
  ])("falls back to the current month for %j", (value) => {
    expect(parseReportsMonthParam(value, TODAY)).toEqual({
      year: 1405,
      month: 7,
    });
  });

  it("falls back for an array's invalid first value", () => {
    expect(parseReportsMonthParam(["garbage"], TODAY)).toEqual({
      year: 1405,
      month: 7,
    });
  });
});

describe("buildTrendWindow", () => {
  it("returns six consecutive months, oldest first, ending at the selection", () => {
    const window = buildTrendWindow({ year: 1405, month: 7 });
    expect(window).toHaveLength(REPORT_TREND_MONTHS);
    expect(window.map((month) => month.param)).toEqual([
      "1405-02",
      "1405-03",
      "1405-04",
      "1405-05",
      "1405-06",
      "1405-07",
    ]);
    expect(window.at(-1)?.label).toBe("مهر 1405");
  });

  it("crosses a year boundary (selection = Farvardin 1405)", () => {
    const window = buildTrendWindow({ year: 1405, month: 1 });
    expect(window.map((month) => month.param)).toEqual([
      "1404-08",
      "1404-09",
      "1404-10",
      "1404-11",
      "1404-12",
      "1405-01",
    ]);
  });

  it("has contiguous bounds: each month starts the day after the previous ends", () => {
    const window = buildTrendWindow({ year: 1405, month: 7 });
    for (let index = 1; index < window.length; index += 1) {
      const previous = window[index - 1];
      const current = window[index];
      expect(previous.to < current.from).toBe(true);
    }
  });

  it("resolves each month's bounds to a non-empty range", () => {
    const window = buildTrendWindow({ year: 1405, month: 1 });
    for (const month of window) {
      expect(month.from <= month.to).toBe(true);
    }
  });
});

describe("previousJalaliMonthKey", () => {
  it("returns the immediately preceding Jalali month", () => {
    expect(previousJalaliMonthKey({ year: 1405, month: 7 })).toEqual({
      year: 1405,
      month: 6,
    });
  });

  it("crosses the year boundary", () => {
    expect(previousJalaliMonthKey({ year: 1405, month: 1 })).toEqual({
      year: 1404,
      month: 12,
    });
  });
});

describe("recentMonthOptions", () => {
  it("starts at the current Jalali month and goes backwards", () => {
    const options = recentMonthOptions(TODAY, 3);
    expect(options).toEqual([
      { param: "1405-07", label: "مهر 1405" },
      { param: "1405-06", label: "شهریور 1405" },
      { param: "1405-05", label: "مرداد 1405" },
    ]);
  });

  it("never offers a future month", () => {
    const options = recentMonthOptions(TODAY, 24);
    expect(options[0]?.param).toBe("1405-07");
    expect(options).toHaveLength(24);
    const params = new Set(options.map((option) => option.param));
    expect(params.size).toBe(24);
  });

  it("crosses a year boundary when going back far enough", () => {
    const options = recentMonthOptions(TODAY, 8);
    expect(options.map((option) => option.param)).toEqual([
      "1405-07",
      "1405-06",
      "1405-05",
      "1405-04",
      "1405-03",
      "1405-02",
      "1405-01",
      "1404-12",
    ]);
  });
});

describe("buildReportsHref", () => {
  it("builds a same-app reports href for a month param", () => {
    expect(buildReportsHref("1405-07")).toBe(
      `/reports?${REPORTS_MONTH_PARAM}=1405-07`,
    );
  });
});
