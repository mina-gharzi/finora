/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { todayInTehranIso } from "../today";

describe("todayInTehranIso", () => {
  it("uses the Tehran date just before local midnight", () => {
    expect(todayInTehranIso(new Date("2026-11-02T20:29:59Z"))).toBe(
      "2026-11-02",
    );
  });

  it("rolls over at 00:00 Tehran (20:30 UTC)", () => {
    expect(todayInTehranIso(new Date("2026-11-02T20:30:00Z"))).toBe(
      "2026-11-03",
    );
  });

  it("rolls over the Gregorian year in Tehran", () => {
    expect(todayInTehranIso(new Date("2026-12-31T21:00:00Z"))).toBe(
      "2027-01-01",
    );
  });

  it("keeps the same date during the Tehran day", () => {
    expect(todayInTehranIso(new Date("2026-06-15T12:00:00Z"))).toBe(
      "2026-06-15",
    );
  });
});
