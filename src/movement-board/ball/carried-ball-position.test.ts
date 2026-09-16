import { describe, expect, it } from "vitest";

import { BALL_ATTACHMENT_OFFSETS_WORLD, computeBallAttachmentPoint } from "./carried-ball-position";

const WORLD_SIZE = { width: 160, height: 100 };

describe("computeBallAttachmentPoint", () => {
  it("uses the first candidate offset when it lands inside the pitch", () => {
    const centre = { x: 80, y: 50 };
    const firstOffset = BALL_ATTACHMENT_OFFSETS_WORLD[0]!;
    expect(computeBallAttachmentPoint(centre, WORLD_SIZE)).toEqual({
      x: centre.x + firstOffset.x,
      y: centre.y + firstOffset.y,
    });
  });

  it("falls through to the next candidate when the first would fall off the pitch", () => {
    // Near the right touchline: the first offset (+4.0 x) would push off the
    // pitch edge (x > 160) only very close to it — pick a centre where the
    // +x candidates are off-pitch but a -x candidate (index 2) lands inside.
    const centre = { x: 159, y: 50 };
    const result = computeBallAttachmentPoint(centre, WORLD_SIZE);
    const thirdOffset = BALL_ATTACHMENT_OFFSETS_WORLD[2]!;
    expect(result).toEqual({
      x: centre.x + thirdOffset.x,
      y: centre.y + thirdOffset.y,
    });
  });

  it("clamps onto the pitch using the first candidate when every candidate would fall outside it", () => {
    const centre = { x: 0, y: 0 };
    const result = computeBallAttachmentPoint(centre, WORLD_SIZE);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(WORLD_SIZE.width);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThanOrEqual(WORLD_SIZE.height);
  });

  it("does not mutate its input", () => {
    const centre = { x: 10, y: 10 };
    computeBallAttachmentPoint(centre, WORLD_SIZE);
    expect(centre).toEqual({ x: 10, y: 10 });
  });

  it("produces the same result for the same input regardless of call site (single source of truth)", () => {
    const centre = { x: 42, y: 17 };
    const fromIdleRender = computeBallAttachmentPoint(centre, WORLD_SIZE);
    const fromPassTargetPrediction = computeBallAttachmentPoint(centre, WORLD_SIZE);
    expect(fromPassTargetPrediction).toEqual(fromIdleRender);
  });
});
