/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  WEEKDAY_OPTIONS,
  describeRecurrence,
} from "@/lib/finance/recurring-labels";

describe("WEEKDAY_OPTIONS", () => {
  it("maps every JS weekday number to its Persian label", () => {
    const labels = new Map(WEEKDAY_OPTIONS.map((o) => [o.value, o.label]));

    expect(labels.get(6)).toBe("شنبه");
    expect(labels.get(0)).toBe("یکشنبه");
    expect(labels.get(5)).toBe("جمعه");
  });

  it("declares all seven distinct weekdays exactly once", () => {
    expect(WEEKDAY_OPTIONS).toHaveLength(7);
    expect(new Set(WEEKDAY_OPTIONS.map((o) => o.value)).size).toBe(7);
    expect([...WEEKDAY_OPTIONS.map((o) => o.value)].sort()).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe("describeRecurrence", () => {
  it("describes a monthly rule by its Jalali day of month", () => {
    expect(
      describeRecurrence({
        frequency: "monthly",
        dayOfMonth: 15,
        weekday: null,
      }),
    ).toBe("هر ماه، روز 15 (تقویم شمسی)");
  });

  it("describes a weekly rule by its Persian weekday", () => {
    expect(
      describeRecurrence({
        frequency: "weekly",
        dayOfMonth: null,
        weekday: 6,
      }),
    ).toBe("هر هفته، شنبه");
  });

  it("falls back to a generic monthly description when the day is absent", () => {
    expect(
      describeRecurrence({
        frequency: "monthly",
        dayOfMonth: null,
        weekday: null,
      }),
    ).toBe("هر ماه (تقویم شمسی)");
  });
});
