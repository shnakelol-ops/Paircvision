// Boundary-protection coverage for deriveSegmentFromPeriodClock(). This
// function was investigated (and confirmed correct) as part of the
// second-half segmentation audit: the defect was in capture-time clock
// values, not in this boundary math. These tests lock in that finding so a
// future change here can't silently reintroduce an off-by-one without a
// visible failure — deriveSegmentFromPeriodClock itself is out of scope for
// the clock-reset fix and is not modified by it.
import { describe, it, expect } from "vitest";
import { deriveSegmentFromPeriodClock } from "./statsSegments";

describe("deriveSegmentFromPeriodClock boundaries", () => {
  it("1H: 9:59 is Early (segment 1), 10:00 and 10:01 are Mid (segment 2)", () => {
    expect(deriveSegmentFromPeriodClock("1H", 599)).toBe(1);
    expect(deriveSegmentFromPeriodClock("1H", 600)).toBe(2);
    expect(deriveSegmentFromPeriodClock("1H", 601)).toBe(2);
  });

  it("1H: 19:59 is Mid (segment 2), 20:00 and 20:01 are Late (segment 3)", () => {
    expect(deriveSegmentFromPeriodClock("1H", 1199)).toBe(2);
    expect(deriveSegmentFromPeriodClock("1H", 1200)).toBe(3);
    expect(deriveSegmentFromPeriodClock("1H", 1201)).toBe(3);
  });

  it("2H: same boundaries, offset into segments 4-6", () => {
    expect(deriveSegmentFromPeriodClock("2H", 599)).toBe(4);
    expect(deriveSegmentFromPeriodClock("2H", 600)).toBe(5);
    expect(deriveSegmentFromPeriodClock("2H", 601)).toBe(5);
    expect(deriveSegmentFromPeriodClock("2H", 1199)).toBe(5);
    expect(deriveSegmentFromPeriodClock("2H", 1200)).toBe(6);
    expect(deriveSegmentFromPeriodClock("2H", 1201)).toBe(6);
  });

  it("periods running past 30 minutes (injury time) stay in the Late bucket, not out of range", () => {
    expect(deriveSegmentFromPeriodClock("1H", 1800)).toBe(3);   // 30:00
    expect(deriveSegmentFromPeriodClock("1H", 2160)).toBe(3);   // 36:00, long injury time
    expect(deriveSegmentFromPeriodClock("2H", 1800)).toBe(6);
    expect(deriveSegmentFromPeriodClock("2H", 2160)).toBe(6);
  });

  it("clamps negative/non-finite input to 0 rather than throwing", () => {
    expect(deriveSegmentFromPeriodClock("1H", -5)).toBe(1);
    expect(deriveSegmentFromPeriodClock("1H", NaN)).toBe(1);
  });
});
