/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  compareMetric,
  comparePeriods,
  type PeriodTotals,
} from "@/lib/finance/report-math";

describe("compareMetric — positive deltas", () => {
  it("computes a positive delta and percentage", () => {
    expect(compareMetric(150_000, 100_000)).toEqual({
      current: 150_000,
      previous: 100_000,
      delta: 50_000,
      percent: 50,
    });
  });

  it("rounds the percentage to a whole percent", () => {
    // 1/3 = 33.33…% → 33
    expect(compareMetric(133_333, 100_000).percent).toBe(33);
    // 2/3 = 66.67…% → 67
    expect(compareMetric(166_667, 100_000).percent).toBe(67);
  });

  it("handles a doubling", () => {
    expect(compareMetric(200_000, 100_000)).toEqual({
      current: 200_000,
      previous: 100_000,
      delta: 100_000,
      percent: 100,
    });
  });
});

describe("compareMetric — negative deltas", () => {
  it("computes a negative delta and percentage", () => {
    expect(compareMetric(100_000, 150_000)).toEqual({
      current: 100_000,
      previous: 150_000,
      delta: -50_000,
      percent: -33,
    });
  });

  it("reports a full drop to zero as −100%", () => {
    expect(compareMetric(0, 50_000)).toEqual({
      current: 0,
      previous: 50_000,
      delta: -50_000,
      percent: -100,
    });
  });
});

describe("compareMetric — no change", () => {
  it("reports a zero delta and 0%", () => {
    expect(compareMetric(75_000, 75_000)).toEqual({
      current: 75_000,
      previous: 75_000,
      delta: 0,
      percent: 0,
    });
  });

  it("reports both-zero as a zero delta with a null percent (no base)", () => {
    expect(compareMetric(0, 0)).toEqual({
      current: 0,
      previous: 0,
      delta: 0,
      percent: null,
    });
  });
});

describe("compareMetric — previous ≤ 0 yields a null percentage", () => {
  it("returns a null percent when previous is zero and current grew", () => {
    expect(compareMetric(150_000, 0)).toEqual({
      current: 150_000,
      previous: 0,
      delta: 150_000,
      percent: null,
    });
  });

  it("returns a null percent when previous is negative (net improved)", () => {
    // Previous net −100k → current net −50k is an improvement of +50k, but a
    // percentage against a negative base would read as a decrease.
    expect(compareMetric(-50_000, -100_000)).toEqual({
      current: -50_000,
      previous: -100_000,
      delta: 50_000,
      percent: null,
    });
  });

  it("returns a null percent when previous is negative (net worsened)", () => {
    expect(compareMetric(-150_000, -100_000)).toEqual({
      current: -150_000,
      previous: -100_000,
      delta: -50_000,
      percent: null,
    });
  });
});

describe("compareMetric — signed net values", () => {
  it("handles a flip from positive to negative net", () => {
    expect(compareMetric(-25_000, 25_000)).toEqual({
      current: -25_000,
      previous: 25_000,
      delta: -50_000,
      percent: -200,
    });
  });

  it("handles a flip from negative to positive net", () => {
    expect(compareMetric(25_000, -25_000)).toEqual({
      current: 25_000,
      previous: -25_000,
      delta: 50_000,
      percent: null,
    });
  });
});

describe("compareMetric — safe integer handling", () => {
  it("throws when the delta would exceed the safe integer range", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(() => compareMetric(max, -max)).toThrow(RangeError);
  });

  it("accepts values at the safe integer boundary", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const change = compareMetric(max, max);
    expect(change.delta).toBe(0);
    expect(change.percent).toBe(0);
  });
});

describe("comparePeriods", () => {
  it("maps the comparison across income, expense and net", () => {
    const current: PeriodTotals = {
      income: 500_000,
      expense: 320_000,
      net: 180_000,
    };
    const previous: PeriodTotals = {
      income: 400_000,
      expense: 320_000,
      net: 80_000,
    };
    expect(comparePeriods(current, previous)).toEqual({
      income: {
        current: 500_000,
        previous: 400_000,
        delta: 100_000,
        percent: 25,
      },
      expense: {
        current: 320_000,
        previous: 320_000,
        delta: 0,
        percent: 0,
      },
      net: {
        current: 180_000,
        previous: 80_000,
        delta: 100_000,
        percent: 125,
      },
    });
  });

  it("handles an empty month after a populated one", () => {
    const current: PeriodTotals = { income: 0, expense: 0, net: 0 };
    const previous: PeriodTotals = {
      income: 250_000,
      expense: 100_000,
      net: 150_000,
    };
    expect(comparePeriods(current, previous)).toEqual({
      income: {
        current: 0,
        previous: 250_000,
        delta: -250_000,
        percent: -100,
      },
      expense: {
        current: 0,
        previous: 100_000,
        delta: -100_000,
        percent: -100,
      },
      net: {
        current: 0,
        previous: 150_000,
        delta: -150_000,
        percent: -100,
      },
    });
  });

  it("handles two empty months (neutral state)", () => {
    const empty: PeriodTotals = { income: 0, expense: 0, net: 0 };
    expect(comparePeriods(empty, empty)).toEqual({
      income: { current: 0, previous: 0, delta: 0, percent: null },
      expense: { current: 0, previous: 0, delta: 0, percent: null },
      net: { current: 0, previous: 0, delta: 0, percent: null },
    });
  });
});
