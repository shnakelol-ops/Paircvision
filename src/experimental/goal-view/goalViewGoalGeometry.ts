// EXPERIMENTAL — Goal View prototype (internal only, /internal/goal-view).
//
// Pure 3D geometry for an upright GAA goal in the camera's board frame
// (a across, b along with b = 160 nearest the camera, h height). No PixiJS:
// the lens projects these points (screen underlay) and ground-shadows them
// (in-texture decal), so both renderings come from one source of truth.

import { GOAL_VIEW_BOARD_LENGTH, GOAL_VIEW_BOARD_WIDTH, GOAL_VIEW_GOAL } from "./goalViewCamera";

export type Point3 = readonly [a: number, b: number, h: number];
export type Segment3 = { from: Point3; to: Point3 };

export type GoalGeometry = {
  end: "near" | "far";
  /** Two uprights, ground to full height. */
  uprights: [Segment3, Segment3];
  crossbar: Segment3;
  /** Net surfaces as closed quads: back, roof, left side, right side. */
  netPanels: Point3[][];
  /** Mesh lines across the net surfaces. */
  netLines: Segment3[];
};

const lerp3 = (p: Point3, q: Point3, t: number): Point3 => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
  p[2] + (q[2] - p[2]) * t,
];

/** Mesh lines spanning a quad (p0→p1 edge paired with p3→p2 edge, and vice versa). */
function quadMesh(quad: Point3[], along: number, across: number): Segment3[] {
  const [p0, p1, p2, p3] = quad;
  const lines: Segment3[] = [];
  for (let i = 1; i < along; i += 1) {
    const t = i / along;
    lines.push({ from: lerp3(p0, p1, t), to: lerp3(p3, p2, t) });
  }
  for (let i = 1; i < across; i += 1) {
    const t = i / across;
    lines.push({ from: lerp3(p0, p3, t), to: lerp3(p1, p2, t) });
  }
  return lines;
}

export function buildGoalGeometry(end: "near" | "far"): GoalGeometry {
  const G = GOAL_VIEW_GOAL;
  const endlineB = end === "near" ? GOAL_VIEW_BOARD_LENGTH - G.endlineInset : G.endlineInset;
  // The net always runs AWAY from the field of play.
  const outward = end === "near" ? 1 : -1;
  const l = GOAL_VIEW_BOARD_WIDTH / 2 - G.halfWidth;
  const r = GOAL_VIEW_BOARD_WIDTH / 2 + G.halfWidth;
  const cb = G.crossbarHeight;
  const backBar = endlineB + outward * G.netDepthCrossbar;
  const backGround = endlineB + outward * G.netDepthGround;

  const back: Point3[] = [[l, backBar, cb], [r, backBar, cb], [r, backGround, 0], [l, backGround, 0]];
  const roof: Point3[] = [[l, endlineB, cb], [r, endlineB, cb], [r, backBar, cb], [l, backBar, cb]];
  const left: Point3[] = [[l, endlineB, cb], [l, backBar, cb], [l, backGround, 0], [l, endlineB, 0]];
  const right: Point3[] = [[r, endlineB, cb], [r, backBar, cb], [r, backGround, 0], [r, endlineB, 0]];

  return {
    end,
    uprights: [
      { from: [l, endlineB, 0], to: [l, endlineB, G.postHeight] },
      { from: [r, endlineB, 0], to: [r, endlineB, G.postHeight] },
    ],
    crossbar: { from: [l, endlineB, cb], to: [r, endlineB, cb] },
    netPanels: [back, roof, left, right],
    netLines: [
      ...quadMesh(back, 8, 3),
      ...quadMesh(roof, 8, 2),
      ...quadMesh(left, 2, 3),
      ...quadMesh(right, 2, 3),
      // Ground frame of the net.
      { from: [l, backGround, 0], to: [r, backGround, 0] },
      { from: [l, endlineB, 0], to: [l, backGround, 0] },
      { from: [r, endlineB, 0], to: [r, backGround, 0] },
    ],
  };
}
