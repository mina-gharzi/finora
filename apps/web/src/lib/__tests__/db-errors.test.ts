import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "../db-errors";

describe("isUniqueViolation", () => {
  it("detects a direct 23505 error", () => {
    expect(isUniqueViolation(Object.assign(new Error("dup"), { code: "23505" }))).toBe(true);
  });
  it("detects a wrapped error through cause", () => {
    const inner = Object.assign(new Error("dup"), { code: "23505" });
    expect(isUniqueViolation(new Error("query failed", { cause: inner }))).toBe(true);
  });
  it("ignores other database errors and non-errors", () => {
    expect(isUniqueViolation(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error("x"), { code: "23503" }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
  it("terminates on circular cause chains", () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(isUniqueViolation(a)).toBe(false);
  });
});