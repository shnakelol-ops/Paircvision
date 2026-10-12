import { describe, expect, it } from "vitest";

import { tokenCounterRotationRadians } from "../../engine/pixi/orientation";
import {
  DEFAULT_GOAL_VIEW_CAMERA,
  GOAL_VIEW_BOARD_LENGTH,
  GOAL_VIEW_BOARD_WIDTH,
  boardToWorld,
  createGoalViewProjection,
  quarterTurnsForMode,
  worldToBoard,
  worldToTextureMatrix,
  type GoalViewEnd,
} from "./goalViewCamera";

const ENDS: GoalViewEnd[] = ["left-end", "right-end"];
const SCREEN = { width: 390, height: 700 };

describe("goal view frames", () => {
  it.each(ENDS)("%s: world ↔ board round-trips exactly", (end) => {
    for (const p of [{ x: 0, y: 0 }, { x: 160, y: 100 }, { x: 37.5, y: 81.25 }]) {
      const back = boardToWorld(end, worldToBoard(end, p));
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it("puts the end the camera stands behind at the near edge (b = 160)", () => {
    expect(worldToBoard("left-end", { x: 0, y: 50 }).b).toBe(GOAL_VIEW_BOARD_LENGTH);
    expect(worldToBoard("right-end", { x: 160, y: 50 }).b).toBe(GOAL_VIEW_BOARD_LENGTH);
  });

  it.each(ENDS)("%s: texture matrix equals board coordinates × scale", (end) => {
    const s = 7;
    const m = worldToTextureMatrix(end, s);
    for (const p of [{ x: 12, y: 34 }, { x: 150, y: 3 }]) {
      const board = worldToBoard(end, p);
      expect(m.a * p.x + m.c * p.y + m.tx).toBeCloseTo(board.a * s, 10);
      expect(m.b * p.x + m.d * p.y + m.ty).toBeCloseTo(board.b * s, 10);
    }
  });

  it.each(ENDS)("%s: shell counter-rotation cancels the texture rotation (tokens stay upright)", (end) => {
    const m = worldToTextureMatrix(end, 1);
    const textureRotation = Math.atan2(m.b, m.a);
    const total = textureRotation + tokenCounterRotationRadians(quarterTurnsForMode(end));
    const wrapped = Math.atan2(Math.sin(total), Math.cos(total));
    expect(Math.abs(wrapped)).toBeLessThan(1e-9);
  });

  it("top-down uses landscape (no quarter turns)", () => {
    expect(quarterTurnsForMode("top-down")).toBe(0);
  });
});

describe("goal view projection", () => {
  const projection = createGoalViewProjection({ ...DEFAULT_GOAL_VIEW_CAMERA, nearCropUnits: 0 }, SCREEN);
  const [tl, tr, br, bl] = projection.corners;

  it("draws the near edge wider and lower than the far edge (elevated perspective)", () => {
    const farWidth = tr.x - tl.x;
    const nearWidth = br.x - bl.x;
    expect(nearWidth).toBeGreaterThan(farWidth * 1.5);
    expect(bl.y).toBeGreaterThan(tl.y);
    expect(br.y).toBeGreaterThan(tr.y);
  });

  it("is laterally symmetric about the centre line", () => {
    expect(tl.x + tr.x).toBeCloseTo(SCREEN.width, 6);
    expect(bl.x + br.x).toBeCloseTo(SCREEN.width, 6);
    expect(tl.y).toBeCloseTo(tr.y, 6);
  });

  it("keeps the whole pitch inside the screen", () => {
    for (const c of projection.corners) {
      expect(c.x).toBeGreaterThanOrEqual(-1e-6);
      expect(c.x).toBeLessThanOrEqual(SCREEN.width + 1e-6);
      expect(c.y).toBeGreaterThanOrEqual(-1e-6);
      expect(c.y).toBeLessThanOrEqual(SCREEN.height + 1e-6);
    }
  });

  it("foreshortens the along-pitch axis more at the far end", () => {
    const near = projection.groundScale(50, 150);
    const far = projection.groundScale(50, 10);
    expect(near.along / near.across).toBeGreaterThan(far.along / far.across);
    expect(far.along).toBeLessThan(far.across);
  });

  it("ground shadow of a 3D point lands on the same screen pixel", () => {
    const p = projection.project(46.4, 2, 7.8)!;
    const g = projection.groundShadowOf(46.4, 2, 7.8);
    const q = projection.project(g.a, g.b, 0)!;
    expect(q.x).toBeCloseTo(p.x, 6);
    expect(q.y).toBeCloseTo(p.y, 6);
  });

  it("near crop lets the near corners run off-screen and enlarges the pitch", () => {
    const cropped = createGoalViewProjection({ ...DEFAULT_GOAL_VIEW_CAMERA, nearCropUnits: 30 }, SCREEN);
    const [ctl, , cbr, cbl] = cropped.corners;
    expect(cbr.x - cbl.x).toBeGreaterThan(SCREEN.width);
    expect(cbl.y - ctl.y).toBeGreaterThan(bl.y - tl.y);
    expect(ctl.y).toBeGreaterThanOrEqual(-1e-6);
  });

  it("returns null for points behind the camera", () => {
    expect(projection.project(50, GOAL_VIEW_BOARD_LENGTH + 500)).toBeNull();
  });

  it("covers the full board width at every depth (no lateral clipping)", () => {
    for (const b of [0, 80, 160]) {
      const left = projection.project(0, b)!;
      const right = projection.project(GOAL_VIEW_BOARD_WIDTH, b)!;
      expect(right.x).toBeGreaterThan(left.x);
    }
  });
});
