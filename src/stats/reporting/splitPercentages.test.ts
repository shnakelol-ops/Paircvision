import { describe, expect, it } from "vitest";
import { splitPercentages } from "./splitPercentages";

const sum = (xs: readonly number[] | null) => (xs ?? []).reduce((s, x) => s + x, 0);

describe("splitPercentages — exhaustive partitions always total 100", () => {
  it("fixes the audit's 13% + 88% = 101% (1 of 8 vs 7 of 8)", () => {
    expect(splitPercentages([1, 7])).toEqual([13, 87]);
  });

  it("gives the first part exactly the standalone percentage (Math.round((a / total) * 100))", () => {
    for (let a = 0; a <= 60; a++) {
      for (let b = 0; b <= 60; b++) {
        if (a + b === 0) continue;
        const split = splitPercentages([a, b])!;
        expect(split[0]).toBe(Math.round((a / (a + b)) * 100));
        expect(split[0] + split[1]).toBe(100);
      }
    }
  });

  it("agrees with the report's standalone rounding where floating point is involved", () => {
    // (23 / 40) * 100 is 57.49999… in floating point, so standalone figures print 57%.
    expect(splitPercentages([23, 17])).toEqual([57, 43]);
  });

  it("handles exact and one-sided shares", () => {
    expect(splitPercentages([27, 19])).toEqual([59, 41]);
    expect(splitPercentages([1, 1])).toEqual([50, 50]);
    expect(splitPercentages([5, 0])).toEqual([100, 0]);
    expect(splitPercentages([0, 5])).toEqual([0, 100]);
  });

  it("returns null when there is nothing to divide", () => {
    expect(splitPercentages([0, 0])).toBeNull();
    expect(splitPercentages([])).toBeNull();
  });

  it("is deterministic for three-way ties and sums to 100", () => {
    expect(splitPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitPercentages([2, 2, 2, 1])).toEqual([29, 29, 28, 14]);
    for (const xs of [[3, 3, 3, 3, 3, 3, 3], [1, 2, 3, 4, 5, 6], [7, 0, 1], [33, 33, 34]]) {
      expect(sum(splitPercentages(xs))).toBe(100);
    }
  });

  it("treats negative and non-finite counts as zero", () => {
    expect(splitPercentages([-3, 4])).toEqual([0, 100]);
    expect(splitPercentages([Number.NaN, 2, Number.POSITIVE_INFINITY])).toEqual([0, 100, 0]);
  });
});
