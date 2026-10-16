import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOMAN_UNIT, formatToman, formatTomanWithUnit } from "./money.ts";

describe("formatToman", () => {
  it("formats zero", () => {
    assert.equal(formatToman(0), "0");
    assert.equal(formatToman(-0), "0");
  });

  it("leaves amounts below the first separator untouched", () => {
    assert.equal(formatToman(1), "1");
    assert.equal(formatToman(999), "999");
    assert.equal(formatToman(1000), "1,000");
    assert.equal(formatToman(999999), "999,999");
  });

  it("groups ordinary amounts every three digits", () => {
    assert.equal(formatToman(1234567), "1,234,567");
    assert.equal(formatToman(1234567890), "1,234,567,890");
    assert.equal(formatToman(1000000000), "1,000,000,000");
  });

  it("preserves the sign of negative amounts", () => {
    assert.equal(formatToman(-1), "-1");
    assert.equal(formatToman(-2500), "-2,500");
    assert.equal(formatToman(-1234567), "-1,234,567");
  });

  it("formats bigints without precision loss", () => {
    assert.equal(formatToman(1000n), "1,000");
    assert.equal(formatToman(1234567n), "1,234,567");
    assert.equal(
      formatToman(9999999999999999999n),
      "9,999,999,999,999,999,999",
    );
  });

  it("always emits Latin digits and ASCII separators", () => {
    const formatted = formatToman(-1234567890);
    assert.match(formatted, /^-?[0-9]+(,[0-9]+)*$/);
    assert.doesNotMatch(formatted, /[۰-۹٠-٩]/);
  });

  it("rejects non-integer numbers", () => {
    assert.throws(() => formatToman(1.5), RangeError);
    assert.throws(() => formatToman(0.1 + 0.2), RangeError);
  });

  it("rejects non-finite numbers", () => {
    assert.throws(() => formatToman(Number.NaN), RangeError);
    assert.throws(() => formatToman(Number.POSITIVE_INFINITY), RangeError);
    assert.throws(() => formatToman(Number.NEGATIVE_INFINITY), RangeError);
  });

  it("rejects integers outside the safe range", () => {
    assert.throws(() => formatToman(9007199254740993), RangeError);
    assert.throws(() => formatToman(-9007199254740993), RangeError);
  });

  it("rejects values that are neither number nor bigint", () => {
    assert.throws(() => formatToman("1000" as unknown as number), TypeError);
    assert.throws(() => formatToman(null as unknown as number), TypeError);
    assert.throws(() => formatToman(undefined as unknown as number), TypeError);
  });
});

describe("formatTomanWithUnit", () => {
  it("appends the default Toman unit", () => {
    assert.equal(TOMAN_UNIT, "تومان");
    assert.equal(formatTomanWithUnit(1234), "1,234 تومان");
  });

  it("accepts a custom unit label", () => {
    assert.equal(formatTomanWithUnit(5, "ریال"), "5 ریال");
  });
});
