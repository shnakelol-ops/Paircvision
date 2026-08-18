import { describe, expect, it } from "vitest";

import { applyCarrierOffset, BALL_CARRIER_OFFSET_X, BALL_CARRIER_OFFSET_Y } from "./carried-ball-position";

describe("applyCarrierOffset", () => {
  it("adds the canonical carrier offset to the carrier's world position", () => {
    expect(applyCarrierOffset({ x: 100, y: 50 })).toEqual({
      x: 100 + BALL_CARRIER_OFFSET_X,
      y: 50 + BALL_CARRIER_OFFSET_Y,
    });
  });

  it("matches the audited offset values exactly (do not change these)", () => {
    expect(BALL_CARRIER_OFFSET_X).toBe(3.5);
    expect(BALL_CARRIER_OFFSET_Y).toBe(-2.5);
  });

  it("produces the same result for the same input regardless of call site (single source of truth)", () => {
    const carrierWorldPos = { x: 42, y: 17 };

    // Simulates the three call sites (idle carry render, pass origin, shot
    // origin) all resolving the carrier's world position independently and
    // then computing the visible carried-ball position from it — they must
    // agree exactly, since a discrepancy here is the audited defect.
    const fromIdleRender = applyCarrierOffset(carrierWorldPos);
    const fromPassOrigin = applyCarrierOffset(carrierWorldPos);
    const fromShotOrigin = applyCarrierOffset(carrierWorldPos);

    expect(fromPassOrigin).toEqual(fromIdleRender);
    expect(fromShotOrigin).toEqual(fromIdleRender);
  });

  it("does not mutate its input", () => {
    const carrierWorldPos = { x: 10, y: 10 };
    applyCarrierOffset(carrierWorldPos);
    expect(carrierWorldPos).toEqual({ x: 10, y: 10 });
  });
});
