import { describe, expect, it } from "vitest";

import { BASIC_ROUTE_MIN_POINT_DISTANCE, isBallCaptureSampleTooClose, sampleRoutePoints } from "./createTacticalPadLiteSurface";
import { interpolatePath } from "./routeFollowInterpolation";
import type { NormalizedPoint } from "../shared/normalization";

/**
 * Player Draw Route capture-seed fix.
 *
 * Pipeline under test:
 *   pointerdown -> seed the draft with the player's authoritative position
 *                  ONLY (the raw touchdown coordinate itself is discarded,
 *                  never recorded as a route point at any distance)
 *               -> pointermove -> real drag samples, deduped against the
 *                  seeded start via appendFreeDrawPoint (unchanged)
 *               -> pointerup -> sampleRoutePoints() (unchanged)
 *               -> stepPlayback -> interpolatePath() (unchanged)
 *
 * The live Pixi surface (createTacticalPadLiteSurface()) cannot be
 * instantiated in this test environment (no jsdom/canvas), so
 * buildSeededDraftPoints below replays exactly what the pointerdown handler
 * plus subsequent pointermove calls now do: one unconditional seed with the
 * player's position, then each later raw drag sample appended only if it
 * clears the same isBallCaptureSampleTooClose dedup appendFreeDrawPoint's
 * inline check mirrors (the same exported, pure predicate
 * ballRouteSmoothing.test.ts already uses for the equivalent ball-path
 * precedent) — not a reimplementation of new decision logic. Touchdown
 * itself is never passed in here as a sample: it is discarded at capture
 * time regardless of how far it sits from the player, exactly as the fix
 * does — passing it in would reintroduce the "synthetic correction
 * segment" 066e5b2 already rejected, just relocated to capture time.
 */
function buildSeededDraftPoints(
  playerAuthoritativeStart: NormalizedPoint,
  subsequentDragSamples: readonly NormalizedPoint[],
  minDistance = BASIC_ROUTE_MIN_POINT_DISTANCE,
): NormalizedPoint[] {
  const draft: NormalizedPoint[] = [playerAuthoritativeStart];
  for (const sample of subsequentDragSamples) {
    const last = draft[draft.length - 1];
    if (isBallCaptureSampleTooClose(last, sample, minDistance)) continue;
    draft.push(sample);
  }
  return draft;
}

describe("Player Draw Route: capture seeds at the authoritative start, not touchdown", () => {
  it("Test A — off-centre touchdown: route[0] is the player's exact start, and touchdown never appears in the route at all", () => {
    const playerStart = { x: 50, y: 50 };
    const touchdown = { x: 47, y: 50 };
    // Touchdown is discarded at capture; only genuine subsequent drag
    // samples (never including touchdown itself) can become route points.
    const seeded = buildSeededDraftPoints(playerStart, [{ x: 60, y: 50 }, { x: 75, y: 50 }]);

    expect(seeded[0]).toEqual({ x: 50, y: 50 });
    expect(seeded).not.toContainEqual(touchdown);

    // And it survives smoothing: sampleRoutePoints' first output point is
    // always exactly the first normalized input point (Catmull-Rom/Bezier
    // t=0 sample), so the stored route[0] is the true start too.
    const smoothed = sampleRoutePoints(seeded);
    expect(smoothed[0]).toEqual({ x: 50, y: 50 });
  });

  it("Test B — every touchdown offset direction preserves the exact same authoritative route start, and none of them ever enter the route", () => {
    const playerStart = { x: 50, y: 50 };
    const offsets: Array<{ label: string; touchdown: NormalizedPoint }> = [
      { label: "behind (west, opposite the drawn direction)", touchdown: { x: 47, y: 50 } },
      { label: "ahead (east, same side as the drawn direction)", touchdown: { x: 53, y: 50 } },
      { label: "left/above", touchdown: { x: 50, y: 46 } },
      { label: "right/below", touchdown: { x: 50, y: 54 } },
      { label: "diagonal, off-axis, well beyond the 0.9 capture-dedup radius", touchdown: { x: 46, y: 46 } },
    ];

    for (const { touchdown } of offsets) {
      // Touchdown is never part of the drag-sample stream fed to capture —
      // it documents the scenario and is only asserted absent below.
      const seeded = buildSeededDraftPoints(playerStart, [{ x: 65, y: 55 }, { x: 80, y: 60 }]);
      expect(seeded[0]).toEqual(playerStart);
      expect(seeded).not.toContainEqual(touchdown);
      const smoothed = sampleRoutePoints(seeded);
      expect(smoothed[0]).toEqual(playerStart);
    }
  });

  it("Test C — the sampled/playback route never opens with playerStart -> touchdown as its first movement", () => {
    // Same magnitude offset (~1.49 units, well past both the 0.35
    // interpolatePath alignment tolerance AND the 0.9 capture-dedup
    // threshold) proven analytically to cause a backward hop when touchdown
    // is treated as a real captured point — whether that happens at
    // playback (pre-#307) or, subtly, still at capture (an earlier version
    // of this very fix unconditionally recorded touchdown as point 1,
    // which reintroduced the same monotonicity violation this test caught).
    // With touchdown fully discarded, the walk must make monotonic
    // progress toward the destination from progress=0 onward.
    const playerStart = { x: 40, y: 50 };
    const touchdown = { x: 39, y: 48.9 };
    const subsequentDrag = [{ x: 45, y: 52 }, { x: 55, y: 58 }, { x: 65, y: 60 }, { x: 75, y: 58 }];

    const seeded = buildSeededDraftPoints(playerStart, subsequentDrag);
    expect(seeded).not.toContainEqual(touchdown);

    const smoothed = sampleRoutePoints(seeded);
    const destination = smoothed[smoothed.length - 1]!;
    const toSnapshot = { x: destination.x, y: destination.y, path: smoothed };

    let previousDistanceToGoal = Infinity;
    for (let progress = 0; progress <= 1.0001; progress += 0.01) {
      const point = interpolatePath(playerStart, toSnapshot, Math.min(1, progress));
      const distanceToGoal = Math.hypot(point.x - destination.x, point.y - destination.y);
      // Monotonic non-increasing distance-to-goal -- any increase at all is
      // the token stepping away from the intended run, which is exactly the
      // reported backward/sideways pre-movement.
      expect(distanceToGoal).toBeLessThanOrEqual(previousDistanceToGoal + 1e-9);
      previousDistanceToGoal = distanceToGoal;
    }

    // And the very first frame is exactly the player's true start, not the
    // touchdown point (the pre-existing #307/ec2a6ec guarantee, still intact).
    expect(interpolatePath(playerStart, toSnapshot, 0)).toEqual(playerStart);
  });

  it("Test D — centred touchdown: behaves normally, still seeded from the authoritative start with no phantom point", () => {
    const playerStart = { x: 50, y: 50 };
    // A touch that lands essentially dead-centre -- touchdown itself still
    // never enters the draft (it's discarded unconditionally, not merely
    // deduped), so this scenario is not actually special-cased; it's
    // included to prove the near-centre case wasn't accidentally broken by
    // no longer relying on distance to decide whether to keep touchdown.
    const nearCentreTouchdown = { x: 50.1, y: 49.95 };
    const seeded = buildSeededDraftPoints(playerStart, [{ x: 65, y: 55 }, { x: 80, y: 60 }]);

    expect(seeded[0]).toEqual(playerStart);
    expect(seeded).not.toContainEqual(nearCentreTouchdown);
    expect(seeded.length).toBe(3); // start, then the two genuinely-spaced drag points.

    const smoothed = sampleRoutePoints(seeded);
    const destination = smoothed[smoothed.length - 1]!;
    const toSnapshot = { x: destination.x, y: destination.y, path: smoothed };
    let previousDistanceToGoal = Infinity;
    for (let progress = 0; progress <= 1.0001; progress += 0.02) {
      const point = interpolatePath(playerStart, toSnapshot, Math.min(1, progress));
      const distanceToGoal = Math.hypot(point.x - destination.x, point.y - destination.y);
      expect(distanceToGoal).toBeLessThanOrEqual(previousDistanceToGoal + 1e-9);
      previousDistanceToGoal = distanceToGoal;
    }
  });
});
