/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  BUDGET_WARNING_THRESHOLD,
  computeBudgetProgress,
  progressWidthPercent,
} from "@/lib/finance/budget-status";

describe("computeBudgetProgress", () => {
  it("reports remaining and percent with no spending", () => {
    const p = computeBudgetProgress(1_000_000, 0);
    expect(p).toMatchObject({
      limit: 1_000_000,
      spending: 0,
      remaining: 1_000_000,
      percent: 0,
      status: "ok",
      overspend: 0,
    });
  });

  it("computes remaining as limit minus spending", () => {
    const p = computeBudgetProgress(1_000_000, 250_000);
    expect(p.remaining).toBe(750_000);
    expect(p.percent).toBe(25);
    expect(p.overspend).toBe(0);
  });

  it("flags approaching at the warning threshold", () => {
    const p = computeBudgetProgress(100, BUDGET_WARNING_THRESHOLD);
    expect(p.status).toBe("approaching");
    expect(p.remaining).toBe(20);
  });

  it("is still ok just below the warning threshold", () => {
    const p = computeBudgetProgress(100, BUDGET_WARNING_THRESHOLD - 1);
    expect(p.status).toBe("ok");
  });

  it("flags reached exactly at the limit", () => {
    const p = computeBudgetProgress(1_000_000, 1_000_000);
    expect(p.status).toBe("reached");
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
    expect(p.overspend).toBe(0);
  });

  it("flags exceeded past the limit and preserves the overspend amount", () => {
    const p = computeBudgetProgress(1_000_000, 1_500_000);
    expect(p.status).toBe("exceeded");
    expect(p.remaining).toBe(-500_000);
    expect(p.overspend).toBe(500_000);
    expect(p.percent).toBe(150);
  });

  it("is integer-safe for large amounts", () => {
    const limit = Number.MAX_SAFE_INTEGER;
    const p = computeBudgetProgress(limit, limit - 1);
    expect(p.remaining).toBe(1);
    expect(p.overspend).toBe(0);
  });

  it.each([
    [0, 0],
    [-1, 0],
    [1.5, 0],
    [1_000_000, -1],
    [1_000_000, 1.5],
  ])("throws on an invalid limit/spending pair (%j, %j)", (limit, spending) => {
    expect(() => computeBudgetProgress(limit, spending)).toThrow(RangeError);
  });
});

describe("progressWidthPercent", () => {
  it("passes through an in-range percentage", () => {
    expect(progressWidthPercent(computeBudgetProgress(100, 40))).toBe(40);
  });

  it("clamps to 100 at or over the limit", () => {
    expect(progressWidthPercent(computeBudgetProgress(100, 100))).toBe(100);
    expect(progressWidthPercent(computeBudgetProgress(100, 250))).toBe(100);
  });

  it("clamps to 0 at or below zero spending", () => {
    expect(progressWidthPercent(computeBudgetProgress(100, 0))).toBe(0);
  });
});
