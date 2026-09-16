import { describe, expect, it } from "vitest";

import { ballRadius, FOOTBALL_RADIUS_MEDIUM, FOOTBALL_RADIUS_SMALL, SLIOTAR_RADIUS_MEDIUM, SLIOTAR_RADIUS_SMALL } from "./ball-layer";

describe("ball radius presentation alignment", () => {
  // Source of truth: createTacticalPadLiteSurface.ts's production ball
  // sizing — TACTICAL_ITEM_HALF_SIZE (2.2) * per-type/per-size factors
  // (football 0.72/0.9, sliotar 0.6/0.74).
  it("matches Standard Slate's football radius values", () => {
    expect(FOOTBALL_RADIUS_SMALL).toBe(1.584);
    expect(FOOTBALL_RADIUS_MEDIUM).toBe(1.98);
  });

  it("matches Standard Slate's sliotar radius values", () => {
    expect(SLIOTAR_RADIUS_SMALL).toBe(1.32);
    expect(SLIOTAR_RADIUS_MEDIUM).toBe(1.628);
  });

  it("keeps football and sliotar radii distinct, matching Slate (not a shared size-only radius)", () => {
    expect(FOOTBALL_RADIUS_SMALL).not.toBe(SLIOTAR_RADIUS_SMALL);
    expect(FOOTBALL_RADIUS_MEDIUM).not.toBe(SLIOTAR_RADIUS_MEDIUM);
  });

  it("selects the correct radius per BallType (guards the type/size branch, not just the constants)", () => {
    expect(ballRadius("footballSmall")).toBe(FOOTBALL_RADIUS_SMALL);
    expect(ballRadius("footballMedium")).toBe(FOOTBALL_RADIUS_MEDIUM);
    expect(ballRadius("sliotarSmall")).toBe(SLIOTAR_RADIUS_SMALL);
    expect(ballRadius("sliotarMedium")).toBe(SLIOTAR_RADIUS_MEDIUM);
  });
});
