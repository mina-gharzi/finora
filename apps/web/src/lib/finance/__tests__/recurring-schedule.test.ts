import { describe, expect, it } from "vitest";
import { addDays, jalaliParts } from "../dashboard-range";
import {
  MAX_RECURRING_OCCURRENCES,
  occurrencesBetween,
  type RecurringScheduleRule,
} from "../recurring-schedule";

function weekly(overrides: Partial<RecurringScheduleRule> = {}) {
  return {
    frequency: "weekly" as const,
    dayOfMonth: null,
    weekday: 0,
    startOn: "2025-01-05", // Sunday
    endOn: null,
    ...overrides,
  };
}

function monthly(overrides: Partial<RecurringScheduleRule> = {}) {
  return {
    frequency: "monthly" as const,
    dayOfMonth: 15,
    weekday: null,
    startOn: "2025-01-01",
    endOn: null,
    ...overrides,
  };
}

describe("occurrencesBetween — weekly", () => {
  it("fires every seven days", () => {
    expect(occurrencesBetween(weekly(), null, "2025-01-26")).toEqual([
      "2025-01-05",
      "2025-01-12",
      "2025-01-19",
      "2025-01-26",
    ]);
  });

  it("treats startOn and endOn as inclusive", () => {
    expect(
      occurrencesBetween(
        weekly({ startOn: "2025-01-12", endOn: "2025-01-19" }),
        null,
        "2025-01-31",
      ),
    ).toEqual(["2025-01-12", "2025-01-19"]);
  });

  it("skips dates at or before afterExclusive", () => {
    expect(occurrencesBetween(weekly(), "2025-01-12", "2025-01-26")).toEqual([
      "2025-01-19",
      "2025-01-26",
    ]);
  });

  it("does not skip when the watermark precedes startOn", () => {
    expect(occurrencesBetween(weekly(), "2025-01-01", "2025-01-12")).toEqual([
      "2025-01-05",
      "2025-01-12",
    ]);
  });
});

describe("occurrencesBetween — monthly", () => {
  it("fires on Jalali day 15", () => {
    expect(occurrencesBetween(monthly(), null, "2025-03-31")).toEqual([
      "2025-01-04",
      "2025-02-03",
      "2025-03-05",
    ]);
  });

  it("fires on the last day when day 31 does not exist in a 30-day month", () => {
    // Mehr 1404 runs from 2025-09-23 to 2025-10-22 (30 days).
    const lastDay = "2025-10-22";
    expect(jalaliParts(lastDay)).toEqual({ year: 1404, month: 7, day: 30 });

    expect(
      occurrencesBetween(
        monthly({ dayOfMonth: 31, startOn: "2025-09-23" }),
        null,
        lastDay,
      ),
    ).toEqual([lastDay]);
  });

  it("fires on the last day of Esfand 1403 (leap, 30 days)", () => {
    const lastDay = "2025-03-20";
    expect(jalaliParts(lastDay)).toEqual({ year: 1403, month: 12, day: 30 });

    expect(
      occurrencesBetween(
        monthly({ dayOfMonth: 31, startOn: "2025-03-01" }),
        null,
        lastDay,
      ),
    ).toEqual([lastDay]);
  });

  it("fires on the last day of Esfand 1404 (29 days)", () => {
    const lastDay = "2026-03-20";
    expect(jalaliParts(lastDay)).toEqual({ year: 1404, month: 12, day: 29 });

    expect(
      occurrencesBetween(
        monthly({ dayOfMonth: 31, startOn: "2026-03-01" }),
        null,
        lastDay,
      ),
    ).toEqual([lastDay]);
  });

  it("honours endOn", () => {
    expect(
      occurrencesBetween(
        monthly({ endOn: "2025-02-28" }),
        null,
        "2025-03-31",
      ),
    ).toEqual(["2025-01-04", "2025-02-03"]);
  });
});

describe("occurrencesBetween — cap", () => {
  it("returns at most 400 occurrences", () => {
    const result = occurrencesBetween(weekly(), null, "2035-01-01");

    expect(result).toHaveLength(MAX_RECURRING_OCCURRENCES);
    expect(result[0]).toBe("2025-01-05");
    expect(result[result.length - 1]).toBe(
      addDays("2025-01-05", (MAX_RECURRING_OCCURRENCES - 1) * 7),
    );
  });
});
