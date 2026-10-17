import { describe, expect, it } from "vitest";
import {
  addToman,
  isValidToman,
  MAX_TOMAN,
  normalizeAmountText,
  parseTomanAmount,
  sumToman,
} from "../money";

describe("normalizeAmountText", () => {
  it("converts Persian and Arabic digits and strips separators", () => {
    expect(normalizeAmountText("۱,۲۰۰,۰۰۰")).toBe("1200000");
    expect(normalizeAmountText("٣٤٥ ٦٧")).toBe("34567");
  });
});

describe("parseTomanAmount", () => {
  it("parses whole numbers", () => {
    expect(parseTomanAmount("1500000")).toBe(1500000);
    expect(parseTomanAmount("۱۵۰۰")).toBe(1500);
    expect(parseTomanAmount("0")).toBe(0);
  });
  it.each(["", "12.5", "-5", "+5", "1e3", "abc", "1٫5", "0x10"])(
    "rejects %j",
    (v) => expect(parseTomanAmount(v)).toBeNull(),
  );
  it("rejects values above the safe range", () => {
    expect(parseTomanAmount(String(MAX_TOMAN))).toBe(MAX_TOMAN);
    expect(parseTomanAmount("9007199254740992")).toBeNull();
    expect(parseTomanAmount("99999999999999999999")).toBeNull();
  });
});

describe("isValidToman", () => {
  it("accepts only non-negative safe integers", () => {
    expect(isValidToman(0)).toBe(true);
    expect(isValidToman(1.5)).toBe(false);
    expect(isValidToman(-1)).toBe(false);
    expect(isValidToman(NaN)).toBe(false);
    expect(isValidToman("5")).toBe(false);
  });
});

describe("addToman / sumToman", () => {
  it("adds exactly", () => {
    expect(sumToman([100, 250, 50])).toBe(400);
    expect(sumToman([])).toBe(0);
  });
  it("throws on overflow instead of losing precision", () => {
    expect(() => addToman(MAX_TOMAN, 1)).toThrow(RangeError);
  });
});