import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildRugbyPostMarkings } from "./rugby-post-markings";
import { RUGBY_TRY_LINE_LEFT_X, RUGBY_TRY_LINE_RIGHT_X, type PitchMarking } from "../../core/pitch/pitch-config";

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
      throw new Error(`Unexpected marking kind in post geometry: ${mark.kind}`);
  }
}

describe("buildRugbyPostMarkings", () => {
  it("only produces line and rect markings", () => {
    const markings = buildRugbyPostMarkings();
    expect(markings.length).toBeGreaterThan(0);
    for (const mark of markings) {
      expect(["line", "rect"]).toContain(mark.kind);
    }
  });

  it("stays inside the 0..160 x 0..100 tactics viewbox", () => {
    const markings = buildRugbyPostMarkings();
    for (const mark of markings) {
      for (const { x, y } of pointsOf(mark)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(VIEWBOX_W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(VIEWBOX_H);
      }
    }
  });

  it("sits exactly on the two try lines from pitch-config's rugby markings", () => {
    const markings = buildRugbyPostMarkings();
    const left = markings.slice(0, 4);
    const right = markings.slice(4, 8);
    expect(markings.length).toBe(8);

    // Markings are [nearUpright, farUpright, crossbar, frame] per side. Only
    // the two uprights (indices 0/1) start exactly on the try line — the
    // crossbar (index 2) sits at the try line + CROSSBAR_DEPTH by design.
    const [leftNear, leftFar] = left;
    const [rightNear, rightFar] = right;
    for (const mark of [leftNear, leftFar]) {
      if (mark?.kind === "line") expect(mark.x1).toBeCloseTo(RUGBY_TRY_LINE_LEFT_X, 6);
    }
    for (const mark of [rightNear, rightFar]) {
      if (mark?.kind === "line") expect(mark.x1).toBeCloseTo(RUGBY_TRY_LINE_RIGHT_X, 6);
    }

    // The post-opening frame's edge nearer the field of play sits on the try
    // line too: the left post opens toward -x (frame's right edge = x + w),
    // the right post opens toward +x (frame's left edge = x).
    const leftFrame = left.find((mark) => mark.kind === "rect");
    const rightFrame = right.find((mark) => mark.kind === "rect");
    expect(leftFrame?.kind).toBe("rect");
    expect(rightFrame?.kind).toBe("rect");
    if (leftFrame?.kind === "rect") {
      expect(leftFrame.x + leftFrame.w).toBeCloseTo(RUGBY_TRY_LINE_LEFT_X, 6);
    }
    if (rightFrame?.kind === "rect") {
      expect(rightFrame.x).toBeCloseTo(RUGBY_TRY_LINE_RIGHT_X, 6);
    }
  });

  it("mirrors the left and right posts around the pitch centre", () => {
    const markings = buildRugbyPostMarkings();
    const left = markings.slice(0, 4);
    const right = markings.slice(4, 8);

    for (let i = 0; i < left.length; i++) {
      const l = left[i]!;
      const r = right[i]!;
      expect(l.kind).toBe(r.kind);

      if (l.kind === "line" && r.kind === "line") {
        expect(l.strokeWidth).toBe(r.strokeWidth);
        expect(160 - l.x1).toBeCloseTo(r.x1, 6);
        expect(160 - l.x2).toBeCloseTo(r.x2, 6);
        expect(l.y1).toBeCloseTo(r.y1, 6);
        expect(l.y2).toBeCloseTo(r.y2, 6);
      }

      if (l.kind === "rect" && r.kind === "rect") {
        expect(l.strokeWidth).toBe(r.strokeWidth);
        expect(160 - (l.x + l.w)).toBeCloseTo(r.x, 6);
        expect(l.y).toBeCloseTo(r.y, 6);
        expect(l.w).toBeCloseTo(r.w, 6);
        expect(l.h).toBeCloseTo(r.h, 6);
      }
    }
  });
});

describe("Tactical Slate imports rugby post geometry only for rugby", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));

  function readSrc(relativeFromSrc: string): string {
    return readFileSync(path.resolve(here, "../../", relativeFromSrc), "utf8");
  }

  it("renderTacticalPitch imports buildRugbyPostMarkings from this module", () => {
    const slate = readSrc("tactical-lite/pixi/renderTacticalPitch.ts");
    expect(slate).toMatch(/import\s*\{\s*buildRugbyPostMarkings\s*\}\s*from\s*"..\/..\/tactics\/pitch\/rugby-post-markings"/);
  });

  it("neither shared stats pitch file references the post geometry module", () => {
    const coreConfig = readSrc("core/pitch/pitch-config.ts");
    const coreRoot = readSrc("core/pitch/create-pitch-root.ts");
    const coreSurface = readSrc("core/pitch/create-pixi-pitch-surface.ts");
    const movementConfig = readSrc("movement-board/pitch/pitch-config.ts");

    for (const source of [coreConfig, coreRoot, coreSurface, movementConfig]) {
      expect(source).not.toMatch(/rugby-post-markings/);
    }
  });
});
