// pro-tagger-lineup-geometry.ts is the plain-data core behind the Squad
// Setup visual lineup's formation layout — deliberately zero React/DOM
// dependency so a future canvas-based share-card export can reuse the exact
// same layout numbers (see that file's header). The pitch background itself
// now lives in ProTaggerLineupPitchBackground.tsx (see its own test file),
// reproducing the real Event Stats tagging pitch rather than an
// independently invented marking set — this file only positions jerseys.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LINEUP_FORMATION_POSITIONS } from "./pro-tagger-lineup-geometry";
import { LINEUP_PITCH_PORTRAIT_VIEWBOX } from "./ProTaggerLineupPitchBackground";

describe("pro-tagger-lineup-geometry", () => {
  it("has exactly one position for every jersey number 1-15", () => {
    const keys = Object.keys(LINEUP_FORMATION_POSITIONS).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("every formation position is a valid 0-100 percentage on both axes", () => {
    for (const [slot, pos] of Object.entries(LINEUP_FORMATION_POSITIONS)) {
      expect(pos.x, `slot ${slot} x`).toBeGreaterThanOrEqual(0);
      expect(pos.x, `slot ${slot} x`).toBeLessThanOrEqual(100);
      expect(pos.y, `slot ${slot} y`).toBeGreaterThanOrEqual(0);
      expect(pos.y, `slot ${slot} y`).toBeLessThanOrEqual(100);
    }
  });

  it("goalkeeper (#1) sits nearest one end of the pitch, not in the middle", () => {
    const gk = LINEUP_FORMATION_POSITIONS[1]!;
    expect(gk.y).toBeLessThan(25);
  });

  it("the six formation rows are in strictly increasing y order (keeper -> full-forward line)", () => {
    const rows: number[][] = [[1], [2, 3, 4], [5, 6, 7], [8, 9], [10, 11, 12], [13, 14, 15]];
    const rowY = rows.map((slots) => {
      const ys = slots.map((s) => LINEUP_FORMATION_POSITIONS[s]!.y);
      // every slot in a row shares the same y (a straight line across the pitch)
      expect(new Set(ys).size).toBe(1);
      return ys[0]!;
    });
    for (let i = 1; i < rowY.length; i++) {
      expect(rowY[i]).toBeGreaterThan(rowY[i - 1]!);
    }
  });

  it("the pitch background's portrait viewBox is taller than it is wide (a real GAA pitch in portrait)", () => {
    expect(LINEUP_PITCH_PORTRAIT_VIEWBOX.h).toBeGreaterThan(LINEUP_PITCH_PORTRAIT_VIEWBOX.w);
  });

  it("is plain data — the source never imports React, so a non-React consumer (e.g. a future canvas share-card builder) can use it without dragging React along", () => {
    const source = readFileSync(fileURLToPath(new URL("./pro-tagger-lineup-geometry.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/from ["']react["']/);
  });
});
