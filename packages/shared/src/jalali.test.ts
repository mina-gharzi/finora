import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_JALALI_TIME_ZONE,
  formatJalaliDate,
  formatJalaliDateParts,
} from "./jalali.ts";

describe("formatJalaliDate", () => {
  it("renders the first day of Farvardin 1403", () => {
    assert.equal(
      formatJalaliDate(new Date("2024-03-20T00:00:00Z")),
      "1403/01/01",
    );
  });

  it("renders the last day of Esfand 1402", () => {
    assert.equal(
      formatJalaliDate(new Date("2024-03-19T00:00:00Z")),
      "1402/12/29",
    );
  });

  it("renders a mid-year instant", () => {
    assert.equal(
      formatJalaliDate(new Date("2024-01-01T00:00:00Z")),
      "1402/10/11",
    );
  });

  it("keeps the whole UTC day on one date", () => {
    assert.equal(
      formatJalaliDate(new Date("2024-03-20T23:59:00Z")),
      "1403/01/01",
    );
    assert.equal(
      formatJalaliDate(new Date("2024-03-20T00:00:00Z")),
      "1403/01/01",
    );
  });

  it("resolves the requested time zone, not the host's", () => {
    const instant = new Date("2024-03-19T20:30:00Z");
    assert.equal(DEFAULT_JALALI_TIME_ZONE, "UTC");
    assert.equal(formatJalaliDate(instant), "1402/12/29");
    assert.equal(
      formatJalaliDate(instant, { timeZone: "Asia/Tehran" }),
      "1403/01/01",
    );
  });

  it("covers the epoch and a distant date", () => {
    assert.equal(
      formatJalaliDate(new Date("1970-01-01T00:00:00Z")),
      "1348/10/11",
    );
    assert.equal(
      formatJalaliDate(new Date("2025-03-21T00:00:00Z")),
      "1404/01/01",
    );
  });

  it("always emits Latin digits", () => {
    const formatted = formatJalaliDate(new Date("2024-03-20T00:00:00Z"));
    assert.match(formatted, /^[0-9]{4}\/[0-9]{2}\/[0-9]{2}$/);
    assert.doesNotMatch(formatted, /[۰-۹٠-٩]/);
  });

  it("rejects invalid dates", () => {
    assert.throws(() => formatJalaliDate(new Date(Number.NaN)), RangeError);
    assert.throws(
      () => formatJalaliDate("2024-03-20" as unknown as Date),
      RangeError,
    );
    assert.throws(() => formatJalaliDate(null as unknown as Date), RangeError);
  });
});

describe("formatJalaliDateParts", () => {
  it("splits an instant into year, month and day", () => {
    assert.deepEqual(
      formatJalaliDateParts(new Date("2024-03-20T00:00:00Z")),
      { year: 1403, month: 1, day: 1 },
    );
    assert.deepEqual(
      formatJalaliDateParts(new Date("2024-01-01T00:00:00Z")),
      { year: 1402, month: 10, day: 11 },
    );
  });

  it("honours the time zone option", () => {
    const instant = new Date("2024-03-19T20:30:00Z");
    assert.deepEqual(
      formatJalaliDateParts(instant, { timeZone: "Asia/Tehran" }),
      { year: 1403, month: 1, day: 1 },
    );
    assert.deepEqual(formatJalaliDateParts(instant), {
      year: 1402,
      month: 12,
      day: 29,
    });
  });

  it("rejects invalid dates", () => {
    assert.throws(
      () => formatJalaliDateParts(new Date(Number.NaN)),
      RangeError,
    );
  });
});
