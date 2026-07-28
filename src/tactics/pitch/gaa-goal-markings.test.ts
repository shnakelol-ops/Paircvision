import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildGaaGoalMarkings } from "./gaa-goal-markings";
import type { PitchMarking } from "../../core/pitch/pitch-config";

const VIEWBOX_W = 160;
const VIEWBOX_H = 100;

function pointsOf(mark: PitchMarking): Array<{ x: number; y: number }> {
  switch (mark.kind) {
    case "line":
      return [
        { x: mark.x1, y: mark.y1 },
        { x: mark.x2, y: mark.y2 },
      ];
    case "rect":
      return [
        { x: mark.x, y: mark.y },
        { x: mark.x + mark.w, y: mark.y + mark.h },
      ];
    default:
      throw new Error(`Unexpected marking kind in goal geometry: ${mark.kind}`);
  }
}

describe("buildGaaGoalMarkings", () => {
  it("only produces line and rect markings", () => {
    const markings = buildGaaGoalMarkings();
    expect(markings.length).toBeGreaterThan(0);
    for (const mark of markings) {
      expect(["line", "rect"]).toContain(mark.kind);
    }
  });

  it("stays inside the 0..160 x 0..100 tactics viewbox", () => {
    const markings = buildGaaGoalMarkings();
    for (const mark of markings) {
      for (const { x, y } of pointsOf(mark)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(VIEWBOX_W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(VIEWBOX_H);
      }
    }
  });

  it("mirrors the left and right goals around the pitch centre", () => {
    const markings = buildGaaGoalMarkings();
    // Geometry is built left-goal-first then right-goal-first (4 markings each).
    const left = markings.slice(0, 4);
    const right = markings.slice(4, 8);
    expect(markings.length).toBe(8);

    for (let i = 0; i < left.length; i++) {
      const l = left[i]!;
      const r = right[i]!;
      expect(l.kind).toBe(r.kind);
      expect(l.strokeWidth).toBe(r.strokeWidth);

      if (l.kind === "line" && r.kind === "line") {
        // Mirrored across x = 80 (pitch centre): x -> 160 - x, y unchanged.
        // Both endpoints map straight across (x1<->x1, x2<->x2) since left and
        // right goals are built the same way — endline point first, depth
        // point second — not reflected end-for-end.
        expect(160 - l.x1).toBeCloseTo(r.x1, 6);
        expect(160 - l.x2).toBeCloseTo(r.x2, 6);
        expect(l.y1).toBeCloseTo(r.y1, 6);
        expect(l.y2).toBeCloseTo(r.y2, 6);
      }

      if (l.kind === "rect" && r.kind === "rect") {
        expect(160 - (l.x + l.w)).toBeCloseTo(r.x, 6);
        expect(l.y).toBeCloseTo(r.y, 6);
        expect(l.w).toBeCloseTo(r.w, 6);
        expect(l.h).toBeCloseTo(r.h, 6);
      }
    }
  });

  it("stays inside the 2-unit turf margin beyond each endline", () => {
    // The pitch face covers the full 0..160 viewbox, but the touchline sits
    // inset at x=2/158, leaving a 2-unit margin before the panel edge. Goals
    // must stay comfortably inside that margin (see the goalposts audit).
    const markings = buildGaaGoalMarkings();
    for (const mark of markings) {
      for (const { x } of pointsOf(mark)) {
        expect(x).toBeGreaterThanOrEqual(0.5);
        expect(x).toBeLessThanOrEqual(159.5);
      }
    }
  });
});

describe("Tactical Slate and Tactical Play import the same goal geometry", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));

  function readSrc(relativeFromSrc: string): string {
    return readFileSync(path.resolve(here, "../../", relativeFromSrc), "utf8");
  }

  it("both renderers import buildGaaGoalMarkings from this module", () => {
    const slate = readSrc("tactical-lite/pixi/renderTacticalPitch.ts");
    const play = readSrc("movement-board/pitch/create-pitch-root.ts");

    expect(slate).toMatch(/import\s*\{\s*buildGaaGoalMarkings\s*\}\s*from\s*"..\/..\/tactics\/pitch\/gaa-goal-markings"/);
    expect(play).toMatch(/import\s*\{\s*buildGaaGoalMarkings\s*\}\s*from\s*"..\/..\/tactics\/pitch\/gaa-goal-markings"/);
  });

  it("neither shared stats pitch file references the goal geometry module", () => {
    const coreConfig = readSrc("core/pitch/pitch-config.ts");
    const coreRoot = readSrc("core/pitch/create-pitch-root.ts");
    const coreSurface = readSrc("core/pitch/create-pixi-pitch-surface.ts");
    const movementConfig = readSrc("movement-board/pitch/pitch-config.ts");

    for (const source of [coreConfig, coreRoot, coreSurface, movementConfig]) {
      expect(source).not.toMatch(/gaa-goal-markings/);
    }
  });
});
