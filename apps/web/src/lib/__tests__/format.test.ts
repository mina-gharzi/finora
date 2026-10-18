/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { formatJalaliDate } from "@finora/shared";
import { formatJalaliFromIso } from "@/lib/format";

/**
 * The dashboard, transaction history and edit views all render
 * `occurredOn` (a Gregorian `YYYY-MM-DD` calendar day) through this helper, so
 * it is the single conversion point for the Persian-first date display.
 */
describe("formatJalaliFromIso", () => {
  it.each([
    // Verified against the ICU `persian` calendar with `nu-latn`.
    ["2026-10-18", "1405/07/26"],
    ["2026-09-23", "1405/07/01"], // first day of the Jalali month
    ["2026-10-22", "1405/07/30"], // last day of the Jalali month
    ["2026-03-21", "1405/01/01"], // Nowruz, first day of Farvardin
    ["2026-03-20", "1404/12/29"], // 29-day Esfand, day before Nowruz
    ["2026-01-01", "1404/10/11"], // Gregorian year boundary
    ["2027-01-01", "1405/10/11"],
  ])("maps %s to %s", (iso, jalali) => {
    expect(formatJalaliFromIso(iso)).toBe(jalali);
  });

  it("always renders zero-padded Latin digits separated by slashes", () => {
    for (const iso of ["2026-01-01", "2026-09-23", "2026-10-22"]) {
      expect(formatJalaliFromIso(iso)).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    }
  });

  it("anchors the calendar day at UTC midnight so the host zone cannot shift it", () => {
    const iso = "2026-10-18";
    expect(formatJalaliFromIso(iso)).toBe(
      formatJalaliDate(new Date(`${iso}T00:00:00Z`)),
    );
  });

  it.each(["", "not-a-date", "2026-13-40"])(
    "throws for the unusable input %j",
    (iso) => {
      expect(() => formatJalaliFromIso(iso)).toThrow(RangeError);
    },
  );
});
