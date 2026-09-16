import { describe, expect, it } from "vitest";

import { RUGBY_TRY_LINE_LEFT_X, RUGBY_TRY_LINE_RIGHT_X, getPitchConfig } from "./pitch-config";

describe("getPitchConfig sport selection", () => {
  it("selects a distinct Rugby configuration, separate from Gaelic", () => {
    const rugby = getPitchConfig("rugby");
    const gaelic = getPitchConfig("gaelic");

    expect(rugby).not.toBe(gaelic);
    expect(rugby.markings).not.toBe(gaelic.markings);
    expect(rugby.markings.length).toBeGreaterThan(0);
  });

  it("shares the same viewbox/inner box as every other sport", () => {
    const rugby = getPitchConfig("rugby");
    const soccer = getPitchConfig("soccer");

    expect(rugby.viewBox).toEqual(soccer.viewBox);
    expect(rugby.inner).toEqual(soccer.inner);
  });

  it("draws a try line on each side at the shared RUGBY_TRY_LINE_* constants", () => {
    const rugby = getPitchConfig("rugby");
    const tryLineXs = rugby.markings
      .filter((mark): mark is Extract<typeof mark, { kind: "line" }> => mark.kind === "line")
      .map((mark) => mark.x1);

    expect(tryLineXs).toContain(RUGBY_TRY_LINE_LEFT_X);
    expect(tryLineXs).toContain(RUGBY_TRY_LINE_RIGHT_X);
  });

  it("draws an in-goal area on each end, inside the outer touchline rect", () => {
    const rugby = getPitchConfig("rugby");
    const outerRect = rugby.markings.find(
      (mark): mark is Extract<typeof mark, { kind: "rect" }> =>
        mark.kind === "rect" && mark.w === rugby.inner.w,
    );
    expect(outerRect).toBeTruthy();

    const inGoalRects = rugby.markings.filter(
      (mark): mark is Extract<typeof mark, { kind: "rect" }> =>
        mark.kind === "rect" && mark.w < rugby.inner.w,
    );
    expect(inGoalRects.length).toBe(2);
    for (const rect of inGoalRects) {
      expect(rect.x).toBeGreaterThanOrEqual(outerRect!.x);
      expect(rect.x + rect.w).toBeLessThanOrEqual(outerRect!.x + outerRect!.w);
    }
  });
});
