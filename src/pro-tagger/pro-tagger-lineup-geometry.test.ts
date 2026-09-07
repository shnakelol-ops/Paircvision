// pro-tagger-lineup-geometry.ts is the plain-data core behind the Squad
// Setup visual lineup's pitch background — deliberately zero React/DOM
// dependency so a future canvas-based share-card export can reuse the exact
// same layout numbers (see that file's header). These tests guard the two
// properties any such consumer would rely on: every one of the 15 formation
// slots has a position, and every coordinate (both the formation positions
// and the pitch markings) stays inside the declared viewBox.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LINEUP_FORMATION_POSITIONS,
  LINEUP_PITCH_MARKINGS,
  LINEUP_PITCH_VIEWBOX,
} from "./pro-tagger-lineup-geometry";

describe("pro-tagger-lineup-geometry", () => {
  it("has exactly one position for every jersey number 1-15", () => {
    const keys = Object.keys(LINEUP_FORMATION_POSITIONS).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("every formation position falls inside the declared viewBox", () => {
    for (const [slot, pos] of Object.entries(LINEUP_FORMATION_POSITIONS)) {
      expect(pos.x, `slot ${slot} x`).toBeGreaterThanOrEqual(0);
      expect(pos.x, `slot ${slot} x`).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.w);
      expect(pos.y, `slot ${slot} y`).toBeGreaterThanOrEqual(0);
      expect(pos.y, `slot ${slot} y`).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.h);
    }
  });

  it("goalkeeper (#1) sits nearest one end of the pitch, not in the middle", () => {
    const gk = LINEUP_FORMATION_POSITIONS[1]!;
    expect(gk.y).toBeLessThan(LINEUP_PITCH_VIEWBOX.h * 0.25);
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

  it("every pitch marking's coordinates fall inside the declared viewBox", () => {
    for (const mark of LINEUP_PITCH_MARKINGS) {
      if (mark.kind === "rect") {
        expect(mark.x).toBeGreaterThanOrEqual(0);
        expect(mark.y).toBeGreaterThanOrEqual(0);
        expect(mark.x + mark.w).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.w);
        expect(mark.y + mark.h).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.h);
      } else if (mark.kind === "line") {
        for (const [x, y] of [[mark.x1, mark.y1], [mark.x2, mark.y2]]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.w);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.h);
        }
      } else if (mark.kind === "circle") {
        expect(mark.cx - mark.r).toBeGreaterThanOrEqual(0);
        expect(mark.cx + mark.r).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.w);
        expect(mark.cy - mark.r).toBeGreaterThanOrEqual(0);
        expect(mark.cy + mark.r).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.h);
      } else {
        // halfEllipse: its bounding box is the full ellipse's (the flat
        // diameter plus the bulge in one y-direction only), so only check
        // the side it actually bulges toward.
        expect(mark.cx - mark.rx).toBeGreaterThanOrEqual(0);
        expect(mark.cx + mark.rx).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.w);
        if (mark.bulge === "up") {
          expect(mark.cy - mark.ry).toBeGreaterThanOrEqual(0);
        } else {
          expect(mark.cy + mark.ry).toBeLessThanOrEqual(LINEUP_PITCH_VIEWBOX.h);
        }
      }
    }
  });

  it("the D-arc markings bulge toward their nearer goal line (top D bulges up, bottom D bulges down)", () => {
    const halfEllipses = LINEUP_PITCH_MARKINGS.filter((m) => m.kind === "halfEllipse");
    expect(halfEllipses).toHaveLength(2);
    const top = halfEllipses.find((m) => m.cy < LINEUP_PITCH_VIEWBOX.h / 2)!;
    const bottom = halfEllipses.find((m) => m.cy > LINEUP_PITCH_VIEWBOX.h / 2)!;
    expect(top.bulge).toBe("up");
    expect(bottom.bulge).toBe("down");
  });

  it("the large and small rectangles at each end are centred on the pitch's horizontal midline", () => {
    const rects = LINEUP_PITCH_MARKINGS.filter((m) => m.kind === "rect");
    // First rect is the outer boundary; the rest are the 4 end boxes.
    const boxes = rects.slice(1);
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.x + box.w / 2).toBeCloseTo(50, 1);
    }
  });

  it("is plain data — the source never imports React, so a non-React consumer (e.g. a future canvas share-card builder) can use it without dragging React along", () => {
    const source = readFileSync(fileURLToPath(new URL("./pro-tagger-lineup-geometry.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/from ["']react["']/);
  });
});
