import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import {
  GAA_GOAL_BOTTOM_FACTOR,
  GAA_GOAL_CROSSBAR_FACTOR,
  GAA_GOAL_SIZE_FACTOR,
  GAA_GOAL_WIDTH_FACTOR,
  drawGaaGoalItem,
} from "../../engine/pixi/gaaGoalItemGraphic";
import { CENTRE_Y, LEFT_ENDLINE_X, RIGHT_ENDLINE_X } from "../../tactics/pitch/gaa-goal-markings";
import {
  GAELIC_PITCH_FRAME_MARGIN,
  GAELIC_PITCH_GOAL_ITEM_HALF_SIZE,
  GAELIC_PITCH_GOAL_LINE_WEIGHT,
  gaelicPitchGoalOutwardReach,
  gaelicPitchGoalPlacements,
  gaelicPitchGoalWidth,
  gaelicSmallRectWidth,
} from "./gaelicPitchGoals";
import { resolveTacticalPitchThemeLayers, type TacticalPitchTheme } from "./tacticalPitchTheme";

const H = GAELIC_PITCH_GOAL_ITEM_HALF_SIZE * GAA_GOAL_SIZE_FACTOR;

/** Same transform Pixi applies for a Graphics at (x, y) with `rotation`. */
function toPitch(placement: { x: number; y: number; rotation: number }, local: { x: number; y: number }) {
  const cos = Math.cos(placement.rotation);
  const sin = Math.sin(placement.rotation);
  return { x: placement.x + local.x * cos - local.y * sin, y: placement.y + local.x * sin + local.y * cos };
}

describe("Gaelic Pitch permanent goals — placement", () => {
  const [left, right] = gaelicPitchGoalPlacements();

  it("one goal centred on each endline, mirrored about halfway", () => {
    expect(left.y).toBe(CENTRE_Y);
    expect(right.y).toBe(CENTRE_Y);
    expect(left.x + right.x).toBeCloseTo(LEFT_ENDLINE_X + RIGHT_ENDLINE_X, 9);
    expect(left.rotation).toBeCloseTo(-right.rotation, 9);
  });

  it("the net's base (ground line) sits exactly on each endline", () => {
    const ground = { x: 0, y: H * GAA_GOAL_BOTTOM_FACTOR };
    expect(toPitch(left, ground).x).toBeCloseTo(LEFT_ENDLINE_X, 9);
    expect(toPitch(right, ground).x).toBeCloseTo(RIGHT_ENDLINE_X, 9);
    // …across the full goal width, so the base runs along the endline.
    const half = (H * GAA_GOAL_WIDTH_FACTOR) / 2;
    expect(toPitch(left, { x: half, y: ground.y }).x).toBeCloseTo(LEFT_ENDLINE_X, 9);
    expect(toPitch(left, { x: -half, y: ground.y }).y).toBeCloseTo(CENTRE_Y + half, 9);
  });

  it("crossbar and upright tips are outside the endline, pointing away from the pitch at each end", () => {
    const crossbar = { x: 0, y: H * GAA_GOAL_CROSSBAR_FACTOR };
    expect(toPitch(left, crossbar).x).toBeLessThan(LEFT_ENDLINE_X);
    expect(toPitch(right, crossbar).x).toBeGreaterThan(RIGHT_ENDLINE_X);
    expect(gaelicPitchGoalOutwardReach()).toBeCloseTo(H * 2.4, 9);
  });

  it("the drawn goal structure stays outside the endline and inside the board frame", () => {
    const g = new Graphics();
    drawGaaGoalItem(g, GAELIC_PITCH_GOAL_ITEM_HALF_SIZE, {
      lineWeight: GAELIC_PITCH_GOAL_LINE_WEIGHT,
      width: gaelicPitchGoalWidth(),
    });
    const bounds = g.getLocalBounds();
    // Local −y is outward. Upright tips (minY, incl. stroke) stay within the frame margin.
    const leftTip = toPitch(left, { x: 0, y: bounds.minY }).x;
    const rightTip = toPitch(right, { x: 0, y: bounds.minY }).x;
    expect(leftTip).toBeGreaterThan(-GAELIC_PITCH_FRAME_MARGIN);
    expect(rightTip).toBeLessThan(160 + GAELIC_PITCH_FRAME_MARGIN);
    // Never wider than the small rectangle it stands in front of.
    expect(bounds.maxX - bounds.minX).toBeLessThan(gaelicSmallRectWidth());
  });
});

describe("Gaelic Pitch permanent goals — official proportions", () => {
  // Post/crossbar outline stroke, half of which sits outside each post's outer edge.
  const outline = GAELIC_PITCH_GOAL_ITEM_HALF_SIZE * GAA_GOAL_SIZE_FACTOR * 0.055 * GAELIC_PITCH_GOAL_LINE_WEIGHT;
  const drawPitchGoal = () => {
    const g = new Graphics();
    drawGaaGoalItem(g, GAELIC_PITCH_GOAL_ITEM_HALF_SIZE, {
      lineWeight: GAELIC_PITCH_GOAL_LINE_WEIGHT,
      width: gaelicPitchGoalWidth(),
    });
    return g;
  };

  it("reads the small rectangle from the pitch's own markings (14 m of 90 m on the 96-unit pitch)", () => {
    expect(gaelicSmallRectWidth()).toBeCloseTo((14 / 90) * 96, 9);
  });

  it("goalWidth = smallRectWidth × (6.5 / 14)", () => {
    expect(gaelicPitchGoalWidth()).toBeCloseTo(gaelicSmallRectWidth() * (6.5 / 14), 9);
    expect(gaelicPitchGoalWidth() / gaelicSmallRectWidth()).toBeCloseTo(6.5 / 14, 9); // ≈ 46%, not ~30%
  });

  it("the drawn posts span exactly goalWidth, centred on each endline", () => {
    const bounds = drawPitchGoal().getLocalBounds();
    const postSpan = bounds.maxX - bounds.minX - outline; // outer post edge to outer post edge
    expect(postSpan).toBeCloseTo(gaelicPitchGoalWidth(), 6);
    const half = gaelicPitchGoalWidth() / 2;
    for (const placement of gaelicPitchGoalPlacements()) {
      const ends = [toPitch(placement, { x: -half, y: 0 }).y, toPitch(placement, { x: half, y: 0 }).y].sort((a, b) => a - b);
      expect(ends[0]).toBeCloseTo(CENTRE_Y - half, 9);
      expect(ends[1]).toBeCloseTo(CENTRE_Y + half, 9);
    }
  });

  it("only the width changes: net depth, crossbar and upright length are preserved", () => {
    const natural = new Graphics();
    drawGaaGoalItem(natural, GAELIC_PITCH_GOAL_ITEM_HALF_SIZE, { lineWeight: GAELIC_PITCH_GOAL_LINE_WEIGHT });
    const widened = drawPitchGoal();
    expect(widened.getLocalBounds().minY).toBeCloseTo(natural.getLocalBounds().minY, 9);
    expect(widened.getLocalBounds().maxY).toBeCloseTo(natural.getLocalBounds().maxY, 9);
    // Net base still on the endline and uprights still within the frame (Option B kept).
    const [left] = gaelicPitchGoalPlacements();
    expect(toPitch(left, { x: 0, y: GAELIC_PITCH_GOAL_ITEM_HALF_SIZE * GAA_GOAL_SIZE_FACTOR * GAA_GOAL_BOTTOM_FACTOR }).x).toBeCloseTo(LEFT_ENDLINE_X, 9);
  });

  it("the movable item is unaffected: no width option means the original 2.5h width", () => {
    const item = new Graphics();
    drawGaaGoalItem(item, 2.2);
    const bounds = item.getLocalBounds();
    const itemOutline = 2.2 * GAA_GOAL_SIZE_FACTOR * 0.055;
    expect(bounds.maxX - bounds.minX - itemOutline).toBeCloseTo(2.2 * GAA_GOAL_SIZE_FACTOR * GAA_GOAL_WIDTH_FACTOR, 6);
  });
});

describe("Gaelic Pitch permanent goals — artwork reuse", () => {
  it("draws the approved GAA Goal artwork with heavier lines; the overall size is unchanged by line weight", () => {
    const light = new Graphics();
    const heavy = new Graphics();
    drawGaaGoalItem(light, GAELIC_PITCH_GOAL_ITEM_HALF_SIZE);
    drawGaaGoalItem(heavy, GAELIC_PITCH_GOAL_ITEM_HALF_SIZE, { lineWeight: GAELIC_PITCH_GOAL_LINE_WEIGHT });
    const widthOf = (g: Graphics) => {
      const strokes = (g.context as unknown as { instructions: Array<{ action: string; data?: { style?: { width?: number } } }> })
        .instructions.filter((inst) => inst.action === "stroke")
        .map((inst) => inst.data?.style?.width ?? 0);
      return Math.min(...strokes);
    };
    expect(widthOf(heavy)).toBeCloseTo(widthOf(light) * GAELIC_PITCH_GOAL_LINE_WEIGHT, 9);
    expect(heavy.getLocalBounds().minY).toBeCloseTo(light.getLocalBounds().minY, 0);
  });

  it("the movable item still draws exactly as before (default line weight 1)", () => {
    const a = new Graphics();
    const b = new Graphics();
    drawGaaGoalItem(a, 2.2);
    drawGaaGoalItem(b, 2.2, { lineWeight: 1 });
    const strokeWidths = (g: Graphics) =>
      (g.context as unknown as { instructions: Array<{ action: string; data?: { style?: { width?: number } } }> }).instructions
        .filter((inst) => inst.action === "stroke")
        .map((inst) => inst.data?.style?.width);
    expect(strokeWidths(a)).toEqual(strokeWidths(b));
    // Unchanged item line widths: outline 0.055h and mesh 0.045h of the drawn unit (h = 4.4).
    expect(strokeWidths(a)).toContain(4.4 * 0.055);
    expect(strokeWidths(a)).toContain(4.4 * 0.045);
    expect(a.getLocalBounds()).toEqual(b.getLocalBounds());
  });
});

describe("Gaelic Pitch permanent goals — scope", () => {
  it("only the Gaelic Pitch theme uses the artwork; other themes keep their goals, Training Grass has none", () => {
    const goalsFor = (theme: TacticalPitchTheme) => resolveTacticalPitchThemeLayers(theme).goals;
    expect(goalsFor("gaelicBands")).toBe("artwork");
    expect(goalsFor("default")).toBe("lines");
    expect(goalsFor("whiteboard")).toBe("lines");
    expect(goalsFor("grass")).toBe(false);
  });

  it("the renderer draws artwork goals as non-interactive pitch graphics and never also the line overlay", () => {
    const source = readFileSync(resolve(__dirname, "renderTacticalPitch.ts"), "utf8");
    const block = source.slice(source.indexOf('if (layers.goals === "artwork")'));
    expect(block.slice(0, 900)).toMatch(/goal\.eventMode = "none";/);
    expect(block.slice(0, 900)).toMatch(/face\.addChild\(goal\)/);
    // The line overlay is gated to "lines" only, so the Gaelic Pitch never gets both.
    expect(source).toMatch(/layers\.goals === "lines" \? buildGoalOverlayMarkings\(sport\) : null/);
  });

  it("the permanent goals are pitch rendering only — no item, save or Slate surface code references them", () => {
    const surface = readFileSync(resolve(__dirname, "../../engine/pixi/createTacticalPadLiteSurface.ts"), "utf8");
    const page = readFileSync(resolve(__dirname, "../../pages/TacticalPadLiteClean.tsx"), "utf8");
    expect(surface).not.toMatch(/gaelicPitchGoal/);
    expect(page).not.toMatch(/gaelicPitchGoal/);
  });
});
