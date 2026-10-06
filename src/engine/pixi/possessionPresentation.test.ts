import { describe, expect, it } from "vitest";

import {
  buildPossessionPlan,
  possessionSegmentKind,
  POSSESSION_ANTICIPATION_FRACTION,
  samplePossessionFrame,
  type PossessionPlan,
  type PossessionPresentationDeps,
  type PossessionSnapshot,
} from "./possessionPresentation";

type Point = { x: number; y: number };

const WORLD = { width: 160, height: 100 } as const;
// Mirrors ATTACHED_BALL_OFFSETS_WORLD / getAttachedBallWorldPointForCentre.
const OFFSETS = [
  { x: 4.0, y: -3.2 },
  { x: 4.0, y: 3.2 },
  { x: -4.0, y: -3.2 },
  { x: -4.0, y: 3.2 },
  { x: 4.7, y: 0 },
  { x: -4.7, y: 0 },
];
const R = Math.hypot(4.0, 3.2);
const toWorld = (p: Point) => ({ x: (p.x / 100) * 160, y: p.y });
const toNormalized = (p: Point) => ({ x: (p.x / 160) * 100, y: p.y });
function anchorPointForCentre(c: Point): Point {
  for (const o of OFFSETS) {
    const q = { x: c.x + o.x, y: c.y + o.y };
    if (q.x >= 0 && q.x <= 160 && q.y >= 0 && q.y <= 100) return q;
  }
  return { x: c.x + 4, y: c.y - 3.2 };
}
const DEPS: PossessionPresentationDeps = { toWorld, anchorPointForCentre, worldSize: WORLD, carryRadius: R };

/** World-space player positions (converted to normalized snapshots). */
type Layout = Record<string, Point>;
function snap(layout: Layout, holder: string | null): PossessionSnapshot {
  const players = Object.entries(layout).map(([id, w]) => ({ id, ...toNormalized(w) }));
  const holderWorld = holder ? layout[holder]! : { x: 80, y: 50 };
  const ballWorld = holder ? anchorPointForCentre(holderWorld) : holderWorld;
  return {
    players,
    football: [{ id: "ball", ...toNormalized(ballWorld), attachedPlayerId: holder, isFree: holder == null }],
  };
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function unit(a: Point, b: Point): Point {
  const d = dist(a, b);
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}
function frame(plan: PossessionPlan, segment: number, p: number) {
  const f = samplePossessionFrame(plan, segment, p);
  expect(f).not.toBeNull();
  return f!;
}
function offsetFrom(plan: PossessionPlan, segment: number, p: number, centre: Point): Point {
  const f = frame(plan, segment, p);
  return { x: f.position.x - centre.x, y: f.position.y - centre.y };
}
function angleBetween(a: Point, b: Point): number {
  const dot = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}
/**
 * Samples the whole playback at 1/400 of each segment and checks there is
 * never a jump. 1 world unit per sample is a fast but continuous move (a
 * one-touch turn inside the 5% release window); a teleport would be several.
 */
function expectContinuous(plan: PossessionPlan, maxStep = 1) {
  let previous: Point | null = null;
  for (let s = 0; s < plan.segments.length; s += 1) {
    for (let i = 0; i <= 400; i += 1) {
      const f = samplePossessionFrame(plan, s, i / 400);
      if (!f) {
        previous = null;
        continue;
      }
      if (previous) expect(dist(f.position, previous)).toBeLessThan(maxStep);
      previous = f.position;
    }
  }
}

// A runs right with the ball, then passes forward-right to B.
const A0 = { x: 40, y: 50 };
const A1 = { x: 70, y: 50 };
const B = { x: 100, y: 35 };
const C = { x: 120, y: 60 };

describe("segment classification", () => {
  it("carry, pass and other (loose ball / pick-up / ball into space) segments", () => {
    const path = [
      snap({ A: A0, B }, "A"),
      snap({ A: A1, B }, "A"), // carry
      snap({ A: A1, B }, "B"), // pass
      snap({ A: A1, B }, null), // ball into space
      snap({ A: A1, B }, "A"), // pick-up
    ];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    expect(plan.segments.map((s) => s.kind)).toEqual(["carry", "pass", "other", "other"]);
    expect(samplePossessionFrame(plan, 2, 0.5)).toBeNull();
    expect(samplePossessionFrame(plan, 3, 0.5)).toBeNull();
    expect(possessionSegmentKind(plan, 1)).toBe("pass");
  });
});

describe("persistence and determinism", () => {
  const path = [snap({ A: A0, B }, "A"), snap({ A: A1, B }, "A"), snap({ A: A1, B }, "B"), snap({ A: A1, B: C }, "B")];

  it("never writes to the snapshots it reads", () => {
    const before = JSON.stringify(path);
    const plan = buildPossessionPlan(path, "ball", DEPS);
    for (let s = 0; s < plan.segments.length; s += 1) for (let i = 0; i <= 50; i += 1) samplePossessionFrame(plan, s, i / 50);
    expect(JSON.stringify(path)).toBe(before);
  });

  it("is a pure function of (segment, progress): same answer in any order, any number of times", () => {
    const planA = buildPossessionPlan(path, "ball", DEPS);
    const planB = buildPossessionPlan(path, "ball", DEPS);
    const forward = [0, 0.13, 0.5, 0.77, 1].map((p) => samplePossessionFrame(planA, 1, p));
    const backward = [1, 0.77, 0.5, 0.13, 0].map((p) => samplePossessionFrame(planB, 1, p)).reverse();
    expect(forward).toEqual(backward);
  });

  it("pause/resume and frame-step invariance: elapsed time alone decides the frame", () => {
    const plan = buildPossessionPlan(path, "ball", DEPS);
    const duration = 1200;
    const at = (elapsed: number) => samplePossessionFrame(plan, 0, elapsed / duration);
    // Same elapsed reached by 1×1000ms, 100×10ms, or with a long pause in between.
    let elapsedFine = 0;
    for (let i = 0; i < 100; i += 1) elapsedFine += 10;
    let elapsedPaused = 400;
    elapsedPaused += 0; // paused: no time advances
    elapsedPaused += 600;
    expect(at(elapsedFine)).toEqual(at(1000));
    expect(at(elapsedPaused)).toEqual(at(1000));
  });
});

describe("static board ↔ playback: first and last frames are the fixed anchor", () => {
  it("ends on a carry", () => {
    const path = [snap({ A: A0, B }, "A"), snap({ A: A1, B }, "A"), snap({ A: A1, B }, "B"), snap({ A: A1, B: C }, "B")];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    expect(frame(plan, 0, 0).position).toEqual(anchorPointForCentre(A0));
    expect(frame(plan, 2, 1).position).toEqual(anchorPointForCentre(C));
  });

  it("ends on a pass (the receive settles onto the anchor in the last moments)", () => {
    const path = [snap({ A: A0, B }, "A"), snap({ A: A1, B }, "A"), snap({ A: A1, B }, "B")];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    expect(frame(plan, 1, 1).position).toEqual(anchorPointForCentre(B));
  });
});

describe("carry straight into a pass", () => {
  // A runs right, then passes forward-right to B: the ball should already
  // be on A's passing side when the pass begins — no release correction.
  const path = [snap({ A: A0, B }, "A"), snap({ A: A1, B }, "A"), snap({ A: A1, B }, "B"), snap({ A: A1, B: C }, "B")];
  const plan = buildPossessionPlan(path, "ball", DEPS);
  const u = unit(A1, B);

  it("mid-run the ball leads the runner (route direction)", () => {
    const centre = toWorld(
      // interpolatePath straight lerp at smoothstep(0.5) = 0.5
      { x: (toNormalized(A0).x + toNormalized(A1).x) / 2, y: 50 },
    );
    const offset = offsetFrom(plan, 0, 0.5, centre);
    expect(angleBetween(offset, { x: 1, y: 0 })).toBeLessThan(0.05);
    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(R, 6);
  });

  it("at the end of the carry the ball is already on the passing side", () => {
    const offset = offsetFrom(plan, 0, 1, A1);
    expect(angleBetween(offset, u)).toBeLessThan(1e-6);
  });

  it("the pass starts exactly there and flies straight — no release turn", () => {
    const release = frame(plan, 1, 0).position;
    expect(release).toEqual(frame(plan, 0, 1).position);
    const receive = { x: B.x - u.x * R, y: B.y - u.y * R };
    for (const p of [0.01, 0.03, 0.1, 0.5, 0.9]) {
      const f = frame(plan, 1, p);
      // Collinear with release → receive, never behind the release point.
      const along = (f.position.x - release.x) * u.x + (f.position.y - release.y) * u.y;
      const across = -(f.position.x - release.x) * u.y + (f.position.y - release.y) * u.x;
      expect(Math.abs(across)).toBeLessThan(1e-6);
      expect(along).toBeGreaterThan(0);
      expect(f.occludedByPlayers).toBe(false);
      expect(f.inFlight).toBe(true);
    }
    expect(dist(frame(plan, 1, 0.999).position, receive)).toBeLessThan(0.05);
  });

  it("ease-out flight: the ball leaves with speed (no slow start)", () => {
    const release = frame(plan, 1, 0).position;
    const total = dist(release, frame(plan, 1, 1).position);
    // 10% of the time → 19% of the distance (ease-out-quad), vs 2.8% for smoothstep.
    expect(dist(frame(plan, 1, 0.1).position, release) / total).toBeGreaterThan(0.18);
  });

  it("is continuous across the whole playback", () => expectContinuous(plan));
});

describe("run one way, pass another (incl. 90° and 180°)", () => {
  for (const [label, target, expectInward] of [
    ["90° (pass up from a run right)", { x: 70, y: 20 }, false],
    ["back-diagonal (135°)", { x: 50, y: 70 }, true],
    ["180° (pass straight back)", { x: 30, y: 50 }, true],
  ] as const) {
    it(`${label}: route intent while running, pass intent by release, continuous`, () => {
      const path = [
        snap({ A: A0, T: target }, "A"),
        snap({ A: A1, T: target }, "A"),
        snap({ A: A1, T: target }, "T"),
        snap({ A: A1, T: target }, "T"),
      ];
      const plan = buildPossessionPlan(path, "ball", DEPS);
      // Before the anticipation span, the ball leads the run.
      const early = 1 - POSSESSION_ANTICIPATION_FRACTION - 0.05;
      const centreEarly = toWorld({
        x: toNormalized(A0).x + (toNormalized(A1).x - toNormalized(A0).x) * (early * early * (3 - 2 * early)),
        y: 50,
      });
      expect(angleBetween(offsetFrom(plan, 0, early, centreEarly), { x: 1, y: 0 })).toBeLessThan(0.05);
      // By the end of the carry, the ball is on the passing side.
      expect(angleBetween(offsetFrom(plan, 0, 1, A1), unit(A1, target))).toBeLessThan(1e-6);
      // The turn happens inside the anticipation span; inward turns go behind the token.
      let occluded = false;
      for (let i = 1; i < 200; i += 1) {
        const p = i / 200;
        const f = frame(plan, 0, p);
        if (f.occludedByPlayers) {
          occluded = true;
          expect(p).toBeGreaterThan(1 - POSSESSION_ANTICIPATION_FRACTION);
        }
      }
      expect(occluded).toBe(expectInward);
      // No release turn in the pass itself.
      expect(frame(plan, 1, 0.02).occludedByPlayers).toBe(false);
      expectContinuous(plan);
    });
  }
});

describe("receiving", () => {
  it("moving receiver: the ball arrives on the incoming side of where the receiver ends up", () => {
    const Bstart = { x: 95, y: 20 };
    const Bend = { x: 105, y: 45 };
    const path = [
      snap({ A: A0, B: Bstart }, "A"),
      snap({ A: A1, B: Bstart }, "A"),
      snap({ A: A1, B: Bend }, "B"),
      snap({ A: A1, B: { x: 130, y: 45 } }, "B"),
    ];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    const u = unit(A1, Bend);
    expect(frame(plan, 1, 1).position.x).toBeCloseTo(Bend.x - u.x * R, 6);
    expect(frame(plan, 1, 1).position.y).toBeCloseTo(Bend.y - u.y * R, 6);
  });

  it("receive then immediately run: the carry turns the ball from the incoming side to the run, no receive correction", () => {
    // Pass arrives from the left; B then runs down the pitch (down = +y).
    const Bpos = { x: 100, y: 40 };
    const path = [
      snap({ A: A1, B: Bpos }, "A"),
      snap({ A: A1, B: Bpos }, "B"), // pass (from a standing start)
      snap({ A: A1, B: { x: 100, y: 75 } }, "B"), // run down
      snap({ A: A1, B: { x: 100, y: 75 } }, "B"),
    ];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    const u = unit(A1, Bpos);
    // Pass ends on the incoming side (not the anchor) because play continues.
    expect(angleBetween(offsetFrom(plan, 0, 1, Bpos), { x: -u.x, y: -u.y })).toBeLessThan(1e-6);
    // Mid-run the ball leads the run.
    const midCentre = { x: 100, y: 40 + 35 * 0.5 };
    expect(angleBetween(offsetFrom(plan, 1, 0.5, midCentre), { x: 0, y: 1 })).toBeLessThan(0.05);
    expectContinuous(plan);
  });

  it("receive then pass again (one touch): the second pass turns from the incoming side to the passing side", () => {
    const path = [
      snap({ A: A1, B, C }, "A"),
      snap({ A: A1, B, C }, "B"),
      snap({ A: A1, B, C }, "C"),
      snap({ A: A1, B, C }, "C"),
    ];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    const arrival = frame(plan, 0, 1).position;
    expect(frame(plan, 1, 0).position).toEqual(arrival);
    // Early in the second pass the ball is still turning round B (release turn).
    const u2 = unit(B, C);
    const releaseNoTurn = { x: B.x + u2.x * R, y: B.y + u2.y * R };
    expect(dist(frame(plan, 1, 0.02).position, releaseNoTurn)).toBeGreaterThan(0.5);
    expectContinuous(plan);
  });
});

describe("chained A → B → C with carries", () => {
  it("every pass is anticipated; boundaries match exactly; no corrections except the final settle", () => {
    const B1 = { x: 110, y: 40 };
    const C0 = { x: 120, y: 75 };
    const path = [
      snap({ A: A0, B, C: C0 }, "A"),
      snap({ A: A1, B, C: C0 }, "A"), // A carries right
      snap({ A: A1, B, C: C0 }, "B"), // A → B
      snap({ A: A1, B: B1, C: C0 }, "B"), // B carries
      snap({ A: A1, B: B1, C: C0 }, "C"), // B → C
      snap({ A: A1, B: B1, C: { x: 140, y: 75 } }, "C"), // C carries away
    ];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    expect(plan.segments.map((s) => s.kind)).toEqual(["carry", "pass", "carry", "pass", "carry"]);
    for (let s = 0; s + 1 < plan.segments.length; s += 1) {
      expect(frame(plan, s, 1).position).toEqual(frame(plan, s + 1, 0).position);
    }
    // Anticipated passes never go behind a token at release.
    for (const s of [1, 3]) {
      for (let i = 1; i < 40; i += 1) expect(frame(plan, s, i / 400).occludedByPlayers).toBe(false);
    }
    expectContinuous(plan);
    expect(frame(plan, 4, 1).position).toEqual(anchorPointForCentre({ x: 140, y: 75 }));
  });
});

describe("standing holder", () => {
  it("a standing holder keeps the ball where it is until the pass is near, then turns it to the passing side", () => {
    const target = { x: 40, y: 50 }; // pass straight back
    const path = [
      snap({ A: A1, T: target }, "A"),
      snap({ A: A1, T: target }, "A"), // stands
      snap({ A: A1, T: target }, "T"),
    ];
    const plan = buildPossessionPlan(path, "ball", DEPS);
    // Before anticipation: still on the anchor.
    expect(frame(plan, 0, 0.3).position).toEqual(anchorPointForCentre(A1));
    expect(angleBetween(offsetFrom(plan, 0, 1, A1), unit(A1, target))).toBeLessThan(1e-6);
    expectContinuous(plan);
  });
});
