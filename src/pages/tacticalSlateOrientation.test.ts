import { describe, expect, it } from "vitest";

import { createWorldViewport } from "../engine/pixi/createWorldViewport";
import { resolveSlateQuarterTurns, SLATE_PORTRAIT_QUARTER_TURNS } from "./tacticalSlateOrientation";

// Canonical Slate pitch world and a representative phone-portrait host.
const WORLD = { width: 160, height: 100 };
const PORTRAIT_HOST = { width: 390, height: 844 };
const LANDSCAPE_HOST = { width: 844, height: 390 };
const TOLERANCE = 1e-6;

describe("Tactical Slate orientation selection", () => {
  it("portrait tactical mode selects quarterTurns = 1", () => {
    expect(
      resolveSlateQuarterTurns({ isStatsMode: false, isWhiteboardMode: false, isPortraitOrientation: true }),
    ).toBe(1);
    expect(SLATE_PORTRAIT_QUARTER_TURNS).toBe(1);
  });

  it("landscape selects quarterTurns = 0", () => {
    expect(
      resolveSlateQuarterTurns({ isStatsMode: false, isWhiteboardMode: false, isPortraitOrientation: false }),
    ).toBe(0);
  });

  it("stats and whiteboard modes never rotate, even in portrait", () => {
    expect(
      resolveSlateQuarterTurns({ isStatsMode: true, isWhiteboardMode: false, isPortraitOrientation: true }),
    ).toBe(0);
    expect(
      resolveSlateQuarterTurns({ isStatsMode: false, isWhiteboardMode: true, isPortraitOrientation: true }),
    ).toBe(0);
  });
});

describe("Tactical Slate orientation does not mutate world coordinates", () => {
  // setOrientation() only re-creates the mapper and re-fits; a player's stored
  // normalized position and its world position are orientation-independent
  // because rotation lives in world->viewport, never in normalized<->world.
  it("normalized -> world is identical across all orientations", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 25, y: 75 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ];
    for (const p of points) {
      const base = createWorldViewport(WORLD, PORTRAIT_HOST, 0).normalizedToWorld(p);
      for (const turns of [1, 2, 3]) {
        const rotated = createWorldViewport(WORLD, PORTRAIT_HOST, turns).normalizedToWorld(p);
        expect(rotated.x).toBe(base.x);
        expect(rotated.y).toBe(base.y);
      }
    }
  });

  it("world -> normalized is identical across all orientations", () => {
    const worldPoint = { x: 40, y: 30 };
    const base = createWorldViewport(WORLD, PORTRAIT_HOST, 0).worldToNormalized(worldPoint);
    for (const turns of [1, 2, 3]) {
      const rotated = createWorldViewport(WORLD, PORTRAIT_HOST, turns).worldToNormalized(worldPoint);
      expect(rotated.x).toBe(base.x);
      expect(rotated.y).toBe(base.y);
    }
  });
});

describe("Tactical Slate portrait pointer-to-world", () => {
  it("a viewport point round-trips back to the intended world point in portrait", () => {
    const mapper = createWorldViewport(WORLD, PORTRAIT_HOST, 1);
    const worldPoints = [
      { x: 0, y: 50 }, // left goal
      { x: 160, y: 50 }, // right goal
      { x: 80, y: 50 }, // centre
      { x: 40, y: 30 },
      { x: 120, y: 80 },
    ];
    for (const p of worldPoints) {
      const back = mapper.viewportToWorld(mapper.worldToViewport(p));
      expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it("places the left goal at the TOP and the right goal at the BOTTOM (direction check)", () => {
    const mapper = createWorldViewport(WORLD, PORTRAIT_HOST, 1);
    const leftGoal = mapper.worldToViewport({ x: 0, y: 50 });
    const rightGoal = mapper.worldToViewport({ x: 160, y: 50 });
    const centreY = PORTRAIT_HOST.height / 2;
    expect(leftGoal.y).toBeLessThan(centreY); // top
    expect(rightGoal.y).toBeGreaterThan(centreY); // bottom
    // Both goals sit on the same vertical column (pitch runs vertically).
    expect(Math.abs(leftGoal.x - rightGoal.x)).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe("Tactical Slate repeated orientation switching is stable", () => {
  it("portrait -> landscape -> portrait returns to identical transforms (no drift)", () => {
    const p1 = createWorldViewport(WORLD, PORTRAIT_HOST, 1).transform;
    const l1 = createWorldViewport(WORLD, LANDSCAPE_HOST, 0).transform;
    const p2 = createWorldViewport(WORLD, PORTRAIT_HOST, 1).transform;
    const l2 = createWorldViewport(WORLD, LANDSCAPE_HOST, 0).transform;
    expect(p2).toEqual(p1);
    expect(l2).toEqual(l1);
    expect(l1.quarterTurns).toBe(0);
    expect(p1.quarterTurns).toBe(1);
  });
});
