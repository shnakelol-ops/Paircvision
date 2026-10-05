import { describe, expect, it } from "vitest";

import { normalizedToWorld } from "../shared/coordinates";
import { DIRECTIONAL_PASS_ANCHOR_RADIUS_WORLD } from "./createTacticalPadLiteSurface";
import {
  computeDirectionalPassAnchors,
  computeDirectionalPassBallWorldPosition,
  DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD,
  DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION,
  DIRECTIONAL_PASS_MIN_FLIGHT_GAP_WORLD,
  DIRECTIONAL_PASS_TRANSITION_MS,
  resolveDirectionalPassParticipants,
  resolveDirectionalPassTransitionFraction,
  type DirectionalPassWorldPoint,
} from "./directionalPassAnchors";
import { getPlaybackEaseProgress } from "./routeFollowInterpolation";

const WORLD = { width: 160, height: 100 } as const;
const R = DIRECTIONAL_PASS_ANCHOR_RADIUS_WORLD;
// Mirrors ATTACHED_BALL_OFFSETS_WORLD's first (primary) candidate: the
// carried ball's upper-right spot used everywhere away from the pitch edge.
const CARRIED_OFFSET = { x: 4.0, y: -3.2 };
const PASSER = { x: 80, y: 50 };
// A typical 1× phase segment (PHASE_SEGMENT_BASE_DURATION_MS).
const SEGMENT_MS = 1200;
const WINDOW = resolveDirectionalPassTransitionFraction(SEGMENT_MS);

function carried(centre: DirectionalPassWorldPoint): DirectionalPassWorldPoint {
  return { x: centre.x + CARRIED_OFFSET.x, y: centre.y + CARRIED_OFFSET.y };
}

function ballAt(
  passerCentre: DirectionalPassWorldPoint,
  receiverCentre: DirectionalPassWorldPoint,
  progress: number,
): DirectionalPassWorldPoint {
  return computeDirectionalPassBallWorldPosition({
    passerCentre,
    receiverCentre,
    passerCarried: carried(passerCentre),
    receiverCarried: carried(receiverCentre),
    anchorRadius: R,
    progress,
    easedProgress: getPlaybackEaseProgress(progress),
    worldSize: WORLD,
    transitionFraction: WINDOW,
  });
}

function dist(a: DirectionalPassWorldPoint, b: DirectionalPassWorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// World is y-down: "up" on screen (towards y = 0) is negative y.
const DIRECTIONS: ReadonlyArray<{ name: string; dx: number; dy: number }> = [
  { name: "right", dx: 1, dy: 0 },
  { name: "left", dx: -1, dy: 0 },
  { name: "up (forward)", dx: 0, dy: -1 },
  { name: "down (backward)", dx: 0, dy: 1 },
  { name: "up-right diagonal", dx: Math.SQRT1_2, dy: -Math.SQRT1_2 },
  { name: "up-left diagonal", dx: -Math.SQRT1_2, dy: -Math.SQRT1_2 },
  { name: "down-right diagonal", dx: Math.SQRT1_2, dy: Math.SQRT1_2 },
  { name: "down-left diagonal", dx: -Math.SQRT1_2, dy: Math.SQRT1_2 },
];

describe("DIRECTIONAL_PASS_ANCHOR_RADIUS_WORLD", () => {
  it("is the primary carried-ball offset distance, so release/receive keep the carry clearance", () => {
    expect(R).toBeCloseTo(Math.hypot(4.0, 3.2), 10);
  });
});

describe("directional anchors — every direction", () => {
  for (const { name, dx, dy } of DIRECTIONS) {
    it(`${name}: releases on the passer's side facing the receiver, receives on the incoming side`, () => {
      const receiver = { x: PASSER.x + dx * 30, y: PASSER.y + dy * 30 };
      const anchors = computeDirectionalPassAnchors({ passerCentre: PASSER, receiverCentre: receiver, anchorRadius: R });
      expect(anchors).not.toBeNull();
      const { release, receive, direction, strength } = anchors!;
      expect(strength).toBe(1);
      expect(direction.x).toBeCloseTo(dx, 9);
      expect(direction.y).toBeCloseTo(dy, 9);
      expect(dist(release, PASSER)).toBeCloseTo(R, 9);
      expect((release.x - PASSER.x) / R).toBeCloseTo(dx, 9);
      expect((release.y - PASSER.y) / R).toBeCloseTo(dy, 9);
      expect(dist(receive, receiver)).toBeCloseTo(R, 9);
      expect((receive.x - receiver.x) / R).toBeCloseTo(-dx, 9);
      expect((receive.y - receiver.y) / R).toBeCloseTo(-dy, 9);

      // After the release window the ball is on the straight perimeter-to-
      // perimeter line, between the anchors.
      for (const p of [0.25, 0.5, 0.75]) {
        const ball = ballAt(PASSER, receiver, p);
        const along = (ball.x - PASSER.x) * dx + (ball.y - PASSER.y) * dy;
        const across = -(ball.x - PASSER.x) * dy + (ball.y - PASSER.y) * dx;
        expect(across).toBeCloseTo(0, 9);
        expect(along).toBeGreaterThanOrEqual(R - 1e-9);
        expect(along).toBeLessThanOrEqual(30 - R + 1e-9);
      }
    });

    it(`${name}: exact continuity with the carried ball at progress 0 and 1`, () => {
      const receiver = { x: PASSER.x + dx * 30, y: PASSER.y + dy * 30 };
      expect(ballAt(PASSER, receiver, 0)).toEqual(carried(PASSER));
      expect(ballAt(PASSER, receiver, 1)).toEqual(carried(receiver));
      // And the limit approaching each end is the same point (no teleport).
      expect(dist(ballAt(PASSER, receiver, 1e-6), carried(PASSER))).toBeLessThan(1e-3);
      expect(dist(ballAt(PASSER, receiver, 1 - 1e-6), carried(receiver))).toBeLessThan(1e-3);
    });

    it(`${name}: release/receive swings stay outside the token and never jump`, () => {
      const receiver = { x: PASSER.x + dx * 30, y: PASSER.y + dy * 30 };
      let previous = ballAt(PASSER, receiver, 0);
      const steps = 4000;
      for (let i = 1; i <= steps; i += 1) {
        const p = i / steps;
        const ball = ballAt(PASSER, receiver, p);
        // Fine sampling: no per-sample step anywhere near a teleport.
        expect(dist(ball, previous)).toBeLessThan(0.25);
        if (p <= WINDOW) {
          // Never cuts through the passer token (carried ball already sits at ~R).
          expect(dist(ball, PASSER)).toBeGreaterThan(R * 0.9);
        }
        if (p >= 1 - WINDOW) {
          expect(dist(ball, receiver)).toBeGreaterThan(R * 0.9);
        }
        previous = ball;
      }
    });
  }

  it("the release swing is finished by the end of the release window", () => {
    // Backward (down) pass: carried spot is upper-right, release is straight down.
    const receiver = { x: PASSER.x, y: PASSER.y + 30 };
    const anchors = computeDirectionalPassAnchors({ passerCentre: PASSER, receiverCentre: receiver, anchorRadius: R })!;
    const p = WINDOW;
    const eased = getPlaybackEaseProgress(p);
    const expected = {
      x: anchors.release.x + (anchors.receive.x - anchors.release.x) * eased,
      y: anchors.release.y + (anchors.receive.y - anchors.release.y) * eased,
    };
    const ball = ballAt(PASSER, receiver, p);
    expect(ball.x).toBeCloseTo(expected.x, 9);
    expect(ball.y).toBeCloseTo(expected.y, 9);
  });
});

describe("release/receive window", () => {
  it("is a fixed real-time flick, independent of playback speed", () => {
    // 1× and 0.25× of the same 1200ms pass: the swing lasts the same real time.
    const at1x = resolveDirectionalPassTransitionFraction(1200);
    const atQuarter = resolveDirectionalPassTransitionFraction(1200 / 0.25);
    expect(at1x * 1200).toBeCloseTo(DIRECTIONAL_PASS_TRANSITION_MS, 9);
    expect(atQuarter * 4800).toBeCloseTo(DIRECTIONAL_PASS_TRANSITION_MS, 9);
  });

  it("never exceeds the maximum share of a pass, even for very fast passes", () => {
    for (const ms of [1, 100, 400, 600, 800]) {
      expect(resolveDirectionalPassTransitionFraction(ms)).toBeLessThanOrEqual(DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION);
    }
    expect(resolveDirectionalPassTransitionFraction(0)).toBe(DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION);
    expect(resolveDirectionalPassTransitionFraction(Number.NaN)).toBe(DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION);
  });

  it("is short enough to read as a release, not an orbit", () => {
    expect(DIRECTIONAL_PASS_TRANSITION_MS).toBeLessThanOrEqual(120);
    expect(DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION).toBeLessThanOrEqual(0.1);
  });
});

describe("world-space geometry", () => {
  it("a 45° world diagonal releases at 45° in world space, not the bent normalized angle", () => {
    // In normalized space (0–100 on both axes for a 160×100 world) this pass
    // is NOT 45°: Δnormalized = (12.5, 20). Directions must be world-space.
    const passerNorm = { x: 50, y: 50 };
    const receiverNorm = { x: 62.5, y: 30 };
    const passerWorld = normalizedToWorld(passerNorm, WORLD);
    const receiverWorld = normalizedToWorld(receiverNorm, WORLD);
    expect(receiverWorld.x - passerWorld.x).toBeCloseTo(20, 9);
    expect(receiverWorld.y - passerWorld.y).toBeCloseTo(-20, 9);
    const anchors = computeDirectionalPassAnchors({
      passerCentre: passerWorld,
      receiverCentre: receiverWorld,
      anchorRadius: R,
    })!;
    const angle = Math.atan2(anchors.release.y - passerWorld.y, anchors.release.x - passerWorld.x);
    expect(angle).toBeCloseTo(-Math.PI / 4, 9);
    const normalizedAngle = Math.atan2(receiverNorm.y - passerNorm.y, receiverNorm.x - passerNorm.x);
    expect(Math.abs(normalizedAngle - angle)).toBeGreaterThan(0.1);
  });
});

describe("short passes", () => {
  it("anchors never cross: a minimum straight flight is always kept", () => {
    for (let d = DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD + 0.01; d <= 40; d += 0.37) {
      const receiver = { x: PASSER.x - d, y: PASSER.y };
      const anchors = computeDirectionalPassAnchors({ passerCentre: PASSER, receiverCentre: receiver, anchorRadius: R })!;
      const releaseAlong = (anchors.release.x - PASSER.x) * anchors.direction.x;
      const receiveAlong = (anchors.receive.x - PASSER.x) * anchors.direction.x;
      expect(receiveAlong - releaseAlong).toBeGreaterThanOrEqual(DIRECTIONAL_PASS_MIN_FLIGHT_GAP_WORLD - 1e-9);
      expect(anchors.radius).toBeLessThanOrEqual(R + 1e-12);
    }
  });

  it("full strength at 2·R + gap and beyond; fades in continuously below it", () => {
    const full = 2 * R + DIRECTIONAL_PASS_MIN_FLIGHT_GAP_WORLD;
    const at = (d: number) =>
      computeDirectionalPassAnchors({ passerCentre: PASSER, receiverCentre: { x: PASSER.x + d, y: PASSER.y }, anchorRadius: R });
    expect(at(full)!.strength).toBe(1);
    expect(at(full + 5)!.strength).toBe(1);
    const mid = at((full + DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD) / 2)!;
    expect(mid.strength).toBeGreaterThan(0);
    expect(mid.strength).toBeLessThan(1);
    expect(at(DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD + 1e-6)!.strength).toBeLessThan(1e-6);
  });

  it("a short pass still starts and ends exactly on the carried points with no jump", () => {
    const receiver = { x: PASSER.x - 7, y: PASSER.y + 2 };
    expect(ballAt(PASSER, receiver, 0)).toEqual(carried(PASSER));
    expect(ballAt(PASSER, receiver, 1)).toEqual(carried(receiver));
    let previous = ballAt(PASSER, receiver, 0);
    for (let i = 1; i <= 2000; i += 1) {
      const ball = ballAt(PASSER, receiver, i / 2000);
      expect(dist(ball, previous)).toBeLessThan(0.25);
      previous = ball;
    }
  });

  it("near-zero distance falls back to the legacy straight carried → carried flight", () => {
    for (const d of [0, 1e-9, 1, DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD]) {
      const receiver = { x: PASSER.x + d, y: PASSER.y };
      expect(computeDirectionalPassAnchors({ passerCentre: PASSER, receiverCentre: receiver, anchorRadius: R })).toBeNull();
      for (const p of [0, 0.05, 0.3, 0.5, 0.95, 1]) {
        const eased = getPlaybackEaseProgress(p);
        const from = carried(PASSER);
        const to = carried(receiver);
        const ball = ballAt(PASSER, receiver, p);
        expect(ball.x).toBeCloseTo(from.x + (to.x - from.x) * eased, 12);
        expect(ball.y).toBeCloseTo(from.y + (to.y - from.y) * eased, 12);
      }
    }
  });
});

describe("touchline / clamping", () => {
  it("a pass along the touchline keeps every sample on the pitch", () => {
    // Passer and receiver right on the top touchline; the carried point
    // falls back to the lower candidate there (edge-aware attachment).
    const passer = { x: 60, y: 0.5 };
    const receiver = { x: 90, y: 0.5 };
    for (let i = 0; i <= 500; i += 1) {
      const p = i / 500;
      const ball = computeDirectionalPassBallWorldPosition({
        passerCentre: passer,
        receiverCentre: receiver,
        passerCarried: { x: passer.x + 4, y: passer.y + 3.2 },
        receiverCarried: { x: receiver.x + 4, y: receiver.y + 3.2 },
        anchorRadius: R,
        progress: p,
        easedProgress: getPlaybackEaseProgress(p),
        worldSize: WORLD,
        transitionFraction: WINDOW,
      });
      expect(ball.y).toBeGreaterThanOrEqual(0);
      expect(ball.y).toBeLessThanOrEqual(WORLD.height);
      expect(ball.x).toBeGreaterThanOrEqual(0);
      expect(ball.x).toBeLessThanOrEqual(WORLD.width);
    }
  });

  it("release and receive anchors for on-pitch centres are always on the pitch", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 160, y: 0 },
      { x: 0, y: 100 },
      { x: 160, y: 100 },
    ];
    for (const a of corners) {
      for (const b of corners) {
        const anchors = computeDirectionalPassAnchors({ passerCentre: a, receiverCentre: b, anchorRadius: R });
        if (!anchors) continue;
        for (const point of [anchors.release, anchors.receive]) {
          expect(point.x).toBeGreaterThanOrEqual(-1e-9);
          expect(point.x).toBeLessThanOrEqual(160 + 1e-9);
          expect(point.y).toBeGreaterThanOrEqual(-1e-9);
          expect(point.y).toBeLessThanOrEqual(100 + 1e-9);
        }
      }
    }
  });
});

describe("player presentations (Normal, Compact, Practice)", () => {
  // Drawn token disc radii (world units) at their runtime scale: Vision V3
  // disc 3.28 × 1.06, Classic/Heroicon 3.66; Compact and Practice both
  // render at the Compact scale 0.75. Football radius 2.2 × 0.9.
  const BALL_RADIUS = 2.2 * 0.9;
  const PRESENTATIONS = [
    { name: "Normal (Vision V3)", tokenRadius: 3.28 * 1.06 },
    { name: "Normal (Classic)", tokenRadius: 3.66 },
    { name: "Compact (Vision V3)", tokenRadius: 3.28 * 1.06 * 0.75 },
    { name: "Practice (Vision V3, Compact scale)", tokenRadius: 3.28 * 1.06 * 0.75 },
  ];
  for (const { name, tokenRadius } of PRESENTATIONS) {
    it(`${name}: release/receive clearance equals the carried ball's clearance`, () => {
      const carriedClearance = Math.hypot(CARRIED_OFFSET.x, CARRIED_OFFSET.y) - tokenRadius - BALL_RADIUS;
      for (const { dx, dy } of DIRECTIONS) {
        const receiver = { x: PASSER.x + dx * 25, y: PASSER.y + dy * 25 };
        const anchors = computeDirectionalPassAnchors({ passerCentre: PASSER, receiverCentre: receiver, anchorRadius: R })!;
        expect(dist(anchors.release, PASSER) - tokenRadius - BALL_RADIUS).toBeCloseTo(carriedClearance, 9);
        expect(dist(anchors.receive, receiver) - tokenRadius - BALL_RADIUS).toBeCloseTo(carriedClearance, 9);
      }
    });
  }
});

describe("determinism: pause/resume and frame-step invariance", () => {
  // Replays stepPlayback's own progress accounting (elapsed / duration, then
  // the same ease) under different frame partitions and a pause.
  function simulate(frameDeltas: number[], durationMs: number, receiver: DirectionalPassWorldPoint) {
    let elapsed = 0;
    const samples = new Map<number, DirectionalPassWorldPoint>();
    for (const delta of frameDeltas) {
      elapsed = Math.min(durationMs, elapsed + delta);
      samples.set(Math.round(elapsed * 1000) / 1000, ballAt(PASSER, receiver, elapsed / durationMs));
    }
    return samples;
  }

  it("same elapsed time → same ball position, whatever the frame steps or pauses", () => {
    const receiver = { x: PASSER.x - 20, y: PASSER.y + 18 };
    const duration = 1200;
    const coarse = simulate(Array(12).fill(100), duration, receiver);
    const fine = simulate(Array(1200).fill(1), duration, receiver);
    // A pause is zero-delta frames: nothing advances while paused.
    const paused = simulate([...Array(6).fill(100), ...Array(50).fill(0), ...Array(6).fill(100)], duration, receiver);
    for (const [t, point] of coarse) {
      expect(fine.get(t)).toEqual(point);
      expect(paused.get(t)).toEqual(point);
    }
  });
});

describe("resolveDirectionalPassParticipants — which ball transitions are player-to-player passes", () => {
  const players = (positions: Record<string, { x: number; y: number }>) =>
    Object.entries(positions).map(([id, p]) => ({ id, x: p.x, y: p.y }));
  const attached = (holder: string, x = 0, y = 0) => ({ id: "ball", x, y, attachedPlayerId: holder, isFree: false });
  const free = (x = 0, y = 0) => ({ id: "ball", x, y, attachedPlayerId: null, isFree: true });

  it("recorded holder switch: passer at segment start, receiver at its ARRIVAL (segment end) position", () => {
    const fromSnapshot = { players: players({ A: { x: 20, y: 50 }, B: { x: 60, y: 20 } }), football: [attached("A")] };
    // B runs during the pass; the ball must meet B where B ends up.
    const toSnapshot = { players: players({ A: { x: 25, y: 50 }, B: { x: 70, y: 40 } }), football: [attached("B")] };
    const result = resolveDirectionalPassParticipants({ fromSnapshot, toSnapshot, ballId: "ball", possessionReceiverId: null });
    expect(result).toEqual({
      passerId: "A",
      receiverId: "B",
      passerCentre: { x: 20, y: 50 },
      receiverCentre: { x: 70, y: 40 },
    });
  });

  it("moving receiver: arrival lands exactly on the receiver's carried point at their end position", () => {
    const passerNorm = { x: 20, y: 50 };
    const receiverEndNorm = { x: 70, y: 40 };
    const passerWorld = normalizedToWorld(passerNorm, WORLD);
    const receiverEndWorld = normalizedToWorld(receiverEndNorm, WORLD);
    const end = ballAt(passerWorld, receiverEndWorld, 1);
    expect(end).toEqual(carried(receiverEndWorld));
    // The receive anchor faces the passer from the END position, not the start.
    const anchors = computeDirectionalPassAnchors({
      passerCentre: passerWorld,
      receiverCentre: receiverEndWorld,
      anchorRadius: R,
    })!;
    expect(dist(anchors.receive, receiverEndWorld)).toBeCloseTo(R, 9);
  });

  it("tap-to-pass: attached → free with a named possession receiver", () => {
    const snapshotPlayers = players({ A: { x: 50, y: 50 }, B: { x: 30, y: 70 } });
    const result = resolveDirectionalPassParticipants({
      fromSnapshot: { players: snapshotPlayers, football: [attached("A")] },
      toSnapshot: { players: snapshotPlayers, football: [free()] },
      ballId: "ball",
      possessionReceiverId: "B",
    });
    expect(result?.passerId).toBe("A");
    expect(result?.receiverId).toBe("B");
  });

  it("chained A → B → C: each segment derives its own pass, B's receive and release share B's carried point", () => {
    const s0 = { players: players({ A: { x: 20, y: 50 }, B: { x: 50, y: 50 }, C: { x: 40, y: 80 } }), football: [attached("A", 22.5, 46.8)] };
    const s1 = { players: players({ A: { x: 20, y: 50 }, B: { x: 50, y: 50 }, C: { x: 40, y: 80 } }), football: [attached("B", 52.5, 46.8)] };
    const s2 = { players: players({ A: { x: 20, y: 50 }, B: { x: 50, y: 50 }, C: { x: 40, y: 80 } }), football: [attached("C", 42.5, 76.8)] };
    const first = resolveDirectionalPassParticipants({ fromSnapshot: s0, toSnapshot: s1, ballId: "ball", possessionReceiverId: null })!;
    const second = resolveDirectionalPassParticipants({ fromSnapshot: s1, toSnapshot: s2, ballId: "ball", possessionReceiverId: null })!;
    expect([first.passerId, first.receiverId]).toEqual(["A", "B"]);
    expect([second.passerId, second.receiverId]).toEqual(["B", "C"]);
    const world = (p: { x: number; y: number }) => normalizedToWorld(p, WORLD);
    const ball = (s: typeof s0) => world({ x: s.football[0]!.x, y: s.football[0]!.y });
    const run = (from: typeof s0, to: typeof s0, participants: typeof first, p: number) =>
      computeDirectionalPassBallWorldPosition({
        passerCentre: world(participants.passerCentre),
        receiverCentre: world(participants.receiverCentre),
        passerCarried: ball(from),
        receiverCarried: ball(to),
        anchorRadius: R,
        progress: p,
        easedProgress: getPlaybackEaseProgress(p),
        worldSize: WORLD,
        transitionFraction: WINDOW,
      });
    // Segment 1 ends exactly where segment 2 begins: B's carried point.
    expect(run(s0, s1, first, 1)).toEqual(ball(s1));
    expect(run(s1, s2, second, 0)).toEqual(ball(s1));
  });

  it("non-pass ball transitions keep their existing behaviour (null)", () => {
    const snapshotPlayers = players({ A: { x: 50, y: 50 }, B: { x: 30, y: 70 } });
    const cases = [
      // Same holder carries the ball through the segment.
      { from: attached("A"), to: attached("A"), receiver: null },
      // Loose ball picked up.
      { from: free(), to: attached("B"), receiver: null },
      // Ball released into space (phase playback, no possession receiver).
      { from: attached("A"), to: free(), receiver: null },
      // Free ball moving freely.
      { from: free(), to: free(), receiver: null },
      // Tap-to-pass naming the current holder is not a pass.
      { from: attached("A"), to: free(), receiver: "A" },
    ];
    for (const { from, to, receiver } of cases) {
      expect(
        resolveDirectionalPassParticipants({
          fromSnapshot: { players: snapshotPlayers, football: [from] },
          toSnapshot: { players: snapshotPlayers, football: [to] },
          ballId: "ball",
          possessionReceiverId: receiver,
        }),
      ).toBeNull();
    }
  });

  it("missing passer or receiver in the snapshots falls back (null)", () => {
    expect(
      resolveDirectionalPassParticipants({
        fromSnapshot: { players: players({ A: { x: 1, y: 1 } }), football: [attached("A")] },
        toSnapshot: { players: players({ A: { x: 1, y: 1 } }), football: [attached("B")] },
        ballId: "ball",
        possessionReceiverId: null,
      }),
    ).toBeNull();
  });
});
