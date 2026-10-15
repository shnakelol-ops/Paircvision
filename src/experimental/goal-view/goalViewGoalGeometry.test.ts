import { describe, expect, it } from "vitest";

import {
  DEFAULT_GOAL_VIEW_CAMERA,
  GOAL_VIEW_BOARD_LENGTH,
  GOAL_VIEW_GOAL,
  GOAL_VIEW_METRES_PER_UNIT,
  createGoalViewProjection,
} from "./goalViewCamera";
import { buildGoalGeometry, type Point3 } from "./goalViewGoalGeometry";

const metres = (units: number) => units * GOAL_VIEW_METRES_PER_UNIT;
const allPoints = (end: "near" | "far"): Point3[] => {
  const g = buildGoalGeometry(end);
  return [
    ...g.uprights.flatMap((s) => [s.from, s.to]),
    g.crossbar.from,
    g.crossbar.to,
    ...g.netPanels.flat(),
    ...g.netLines.flatMap((s) => [s.from, s.to]),
  ];
};

describe("GAA goal proportions", () => {
  it("uses playing-rules dimensions: 6.5 m wide, 2.5 m crossbar, uprights ≥ 7 m", () => {
    expect(metres(GOAL_VIEW_GOAL.halfWidth * 2)).toBeCloseTo(6.5, 6);
    expect(metres(GOAL_VIEW_GOAL.crossbarHeight)).toBeCloseTo(2.5, 6);
    expect(metres(GOAL_VIEW_GOAL.postHeight)).toBeGreaterThanOrEqual(7 - 1e-9);
  });

  it.each(["near", "far"] as const)("%s goal: both uprights extend above the crossbar", (end) => {
    const g = buildGoalGeometry(end);
    for (const upright of g.uprights) {
      expect(upright.from[2]).toBe(0);
      expect(upright.to[2]).toBeGreaterThan(g.crossbar.from[2] * 2);
    }
    expect(g.crossbar.from[2]).toBe(g.crossbar.to[2]);
  });

  it.each(["near", "far"] as const)("%s goal: the net sits behind the goal line, away from play", (end) => {
    const g = buildGoalGeometry(end);
    const goalLine = g.crossbar.from[1];
    for (const p of g.netPanels.flat()) {
      if (end === "near") expect(p[1]).toBeGreaterThanOrEqual(goalLine);
      else expect(p[1]).toBeLessThanOrEqual(goalLine);
      expect(p[2]).toBeGreaterThanOrEqual(0);
      expect(p[2]).toBeLessThanOrEqual(GOAL_VIEW_GOAL.crossbarHeight + 1e-9);
    }
    expect(g.netLines.length).toBeGreaterThan(10);
  });

  it("near and far goals mirror each other along the pitch", () => {
    const near = allPoints("near");
    const far = allPoints("far");
    expect(near.length).toBe(far.length);
    near.forEach((p, i) => {
      expect(far[i][0]).toBeCloseTo(p[0], 9);
      expect(far[i][1]).toBeCloseTo(GOAL_VIEW_BOARD_LENGTH - p[1], 9);
      expect(far[i][2]).toBeCloseTo(p[2], 9);
    });
  });
});

describe("goals under the default (configuration C) camera", () => {
  const screen = { width: 390, height: 600 };
  const proj = createGoalViewProjection(DEFAULT_GOAL_VIEW_CAMERA, screen);

  it.each(["near", "far"] as const)("every %s goal point is in front of the camera", (end) => {
    for (const p of allPoints(end)) expect(proj.project(...p)).not.toBeNull();
  });

  it("far uprights stay inside the canvas", () => {
    const g = buildGoalGeometry("far");
    for (const u of g.uprights) {
      const top = proj.project(...u.to)!;
      expect(top.y).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("uprights read as vertical on screen and the near goal is drawn larger", () => {
    const size = (end: "near" | "far") => {
      const u = buildGoalGeometry(end).uprights[0];
      const a = proj.project(...u.from)!;
      const b = proj.project(...u.to)!;
      expect(b.y).toBeLessThan(a.y); // top of the post is higher on screen
      return a.y - b.y;
    };
    expect(size("near")).toBeGreaterThan(size("far"));
  });

  it("each goal point's ground shadow projects onto the same pixel (decal ≡ underlay)", () => {
    for (const end of ["near", "far"] as const) {
      for (const p of allPoints(end)) {
        const direct = proj.project(...p)!;
        const g = proj.groundShadowOf(...p);
        const viaShadow = proj.project(g.a, g.b, 0)!;
        expect(viaShadow.x).toBeCloseTo(direct.x, 5);
        expect(viaShadow.y).toBeCloseTo(direct.y, 5);
      }
    }
  });
});

describe("default camera reproduces the DSS Coaching reference proportions", () => {
  it("far endline ≈ 52% of near endline width, halfway line ≈ 34% down", () => {
    const proj = createGoalViewProjection({ ...DEFAULT_GOAL_VIEW_CAMERA, nearCropUnits: 0 }, { width: 974, height: 727 });
    const fl = proj.project(0, 2)!;
    const fr = proj.project(100, 2)!;
    const nl = proj.project(0, 158)!;
    const nr = proj.project(100, 158)!;
    const half = proj.project(50, 80)!;
    expect((fr.x - fl.x) / (nr.x - nl.x)).toBeCloseTo(0.52, 2);
    expect((half.y - fl.y) / (nl.y - fl.y)).toBeCloseTo(0.34, 2);
  });
});
