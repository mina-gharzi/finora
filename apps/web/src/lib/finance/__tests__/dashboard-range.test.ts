/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  DASHBOARD_PERIODS,
  DEFAULT_DASHBOARD_PERIOD,
  buildDashboardHref,
  dashboardPeriodLabel,
  parseDashboardPeriod,
  resolveDashboardRange,
} from "@/lib/finance/dashboard-range";

/**
 * 2026-10-18 (Gregorian) is 1405/07/26 (Jalali, Mehr 26). Mehr 1405 has 30 days
 * (Jalali months 7–11 have 30), so its bounds are 2026-09-23 … 2026-10-22, and
 * the previous month (Shahrivar 1405, 31 days) is 2026-08-23 … 2026-09-22.
 */
const TODAY = "2026-10-18";

describe("parseDashboardPeriod", () => {
  it.each(DASHBOARD_PERIODS)("accepts the supported period %s", (period) => {
    expect(parseDashboardPeriod(period)).toBe(period);
  });

  it.each([
    undefined,
    "",
    "this-year",
    "ALL-TIME",
    "'; drop table transactions; --",
  ])("falls back to the default for %j", (value) => {
    expect(parseDashboardPeriod(value)).toBe(DEFAULT_DASHBOARD_PERIOD);
  });

  it("reads the first value of a repeated query parameter", () => {
    expect(parseDashboardPeriod(["prev-month", "all-time"])).toBe("prev-month");
  });
});

describe("resolveDashboardRange — current Jalali month", () => {
  it("spans the whole current month, inclusive", () => {
    const range = resolveDashboardRange("this-month", TODAY);
    expect(range.from).toBe("2026-09-23");
    expect(range.to).toBe("2026-10-22");
    expect(range.label).toBe("مهر 1405");
  });

  it("includes today itself", () => {
    const range = resolveDashboardRange("this-month", TODAY);
    expect(range.from! <= TODAY).toBe(true);
    expect(TODAY <= range.to!).toBe(true);
  });

  it("is exact at a month boundary (first day of the month)", () => {
    const range = resolveDashboardRange("this-month", "2026-09-23");
    expect(range.from).toBe("2026-09-23");
    expect(range.to).toBe("2026-10-22");
  });

  it("is exact at a month boundary (last day of the month)", () => {
    const range = resolveDashboardRange("this-month", "2026-10-22");
    expect(range.from).toBe("2026-09-23");
    expect(range.to).toBe("2026-10-22");
  });

  it("handles a 31-day month (Farvardin)", () => {
    // 2026-03-21 is 1405/01/01; Farvardin has 31 days, so 1405/01/31 is
    // 2026-04-20.
    const range = resolveDashboardRange("this-month", "2026-03-21");
    expect(range.from).toBe("2026-03-21");
    expect(range.to).toBe("2026-04-20");
    expect(range.label).toBe("فروردین 1405");
  });

  it("handles a 29-day month (Esfand of a common year)", () => {
    // 2026-03-05 is 1404/12/14; Esfand 1404 has 29 days, so it runs
    // 2026-02-20 (1404/12/01) … 2026-03-20 (1404/12/29).
    const range = resolveDashboardRange("this-month", "2026-03-05");
    expect(range.from).toBe("2026-02-20");
    expect(range.to).toBe("2026-03-20");
    expect(range.label).toBe("اسفند 1404");
  });
});

describe("resolveDashboardRange — previous Jalali month", () => {
  it("spans the whole previous month, inclusive", () => {
    const range = resolveDashboardRange("prev-month", TODAY);
    expect(range.from).toBe("2026-08-23");
    expect(range.to).toBe("2026-09-22");
    expect(range.label).toBe("شهریور 1405");
  });

  it("does not overlap the current month", () => {
    const current = resolveDashboardRange("this-month", TODAY);
    const previous = resolveDashboardRange("prev-month", TODAY);
    expect(previous.to! < current.from!).toBe(true);
  });
});

describe("resolveDashboardRange — all time", () => {
  it("has no date bounds", () => {
    const range = resolveDashboardRange("all-time", TODAY);
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
    expect(range.label).toBe("همه زمان‌ها");
  });
});

describe("period helpers", () => {
  it("exposes a Persian label for each period", () => {
    expect(dashboardPeriodLabel("this-month")).toBe("این ماه");
    expect(dashboardPeriodLabel("prev-month")).toBe("ماه گذشته");
    expect(dashboardPeriodLabel("all-time")).toBe("همه زمان‌ها");
  });

  it("builds a same-app dashboard href per period", () => {
    expect(buildDashboardHref("this-month")).toBe("/?period=this-month");
    expect(buildDashboardHref("prev-month")).toBe("/?period=prev-month");
    expect(buildDashboardHref("all-time")).toBe("/?period=all-time");
  });
});
