import type { NormalizedPoint } from "../shared/normalization";
import {
  getPlaybackEaseProgress,
  interpolatePath,
  resolvePhaseSegmentDurationMs,
  resolveSegmentMaxMovementDistance,
} from "./routeFollowInterpolation";

/**
 * Tactical Slate's playback timeline: a pure, compiled description of a
 * Play session, sampled by time instead of advanced frame by frame.
 *
 * Time is measured at 1× playback speed ("timeline ms"). The surface's ticker
 * advances its timeline position by `deltaMs × playbackSpeedMultiplier` and
 * renders `sampleSlatePlaybackTimeline(timeline, timelineMs)`, so:
 *
 * - the same timeline position always renders the same board, whatever the
 *   frame rate, pause/resume history or recording state;
 * - a playback-speed change needs no rescaling — only the rate at which the
 *   timeline position advances changes.
 *
 * Every position here is a function of (segment, progress) with exactly the
 * same interpolation, easing and per-segment durations as the previous
 * frame-stepped engine. The single presentation difference is the old
 * frame-rate-dependent lag-follow of an attached ball, which is replaced by:
 *
 * - a ball carried by the same player for the whole segment is drawn exactly
 *   at its holder's carried point (no trailing);
 * - a loose ball being picked up converges on its new holder's carried point
 *   with the time constant the lag-follow had at 60fps
 *   (PICKUP_CONVERGENCE_TIME_CONSTANT_MS), measured in timeline time.
 */

type TimelinePlayerSnapshot = {
  id: string;
  x: number;
  y: number;
  path?: NormalizedPoint[];
};

type TimelineBallSnapshot = {
  id: string;
  x: number;
  y: number;
  attachedPlayerId: string | null;
  isFree: boolean;
  path?: NormalizedPoint[];
};

export type TimelineSnapshot = {
  players: readonly TimelinePlayerSnapshot[];
  football: readonly TimelineBallSnapshot[];
};

export type SlatePlaybackKind = "default" | "possession-pass";

// Tap-to-pass timing (the possession-pass playback kind). Values unchanged
// from the previous engine; see resolvePossessionPassDurationMs.
export const POSSESSION_PASS_BASE_DURATION_MS = 1200;
export const POSSESSION_PASS_MIN_DURATION_MS = 900;
export const POSSESSION_PASS_MAX_DURATION_MS = 1800;
export const POSSESSION_PASS_REFERENCE_DISTANCE = 14;

/**
 * Tap-to-pass segment duration at 1× speed, from the largest ball
 * displacement in the segment. The clamp is applied at 1× and the result is
 * then scaled by playback speed like every other segment (the old engine
 * clamped after dividing by speed, so at 0.25×–1.5× a tap pass could be held
 * to the 900–1800ms window regardless of speed).
 */
export function resolvePossessionPassDurationMs(
  fromSnapshot: TimelineSnapshot,
  toSnapshot: TimelineSnapshot,
): number {
  let maxBallDistance = 0;
  for (const toBall of toSnapshot.football) {
    const fromBall = fromSnapshot.football.find((point) => point.id === toBall.id);
    if (!fromBall) continue;
    const distance = Math.hypot(toBall.x - fromBall.x, toBall.y - fromBall.y);
    if (distance > maxBallDistance) maxBallDistance = distance;
  }
  const distanceBasedDuration =
    POSSESSION_PASS_BASE_DURATION_MS * (Math.max(0, maxBallDistance) / POSSESSION_PASS_REFERENCE_DISTANCE);
  return Math.max(POSSESSION_PASS_MIN_DURATION_MS, Math.min(POSSESSION_PASS_MAX_DURATION_MS, distanceBasedDuration));
}

/**
 * The old lag-follow moved an attached ball 28% of the remaining distance per
 * rendered frame. At 60fps that is exponential convergence with
 * τ = (1000/60) / −ln(0.72) ≈ 50.8ms; used here in timeline (1×) ms so a
 * pickup looks the same at any frame rate.
 */
export const PICKUP_CONVERGENCE_TIME_CONSTANT_MS = 1000 / 60 / -Math.log(1 - 0.28);

/** Share of the pickup distance still to close `elapsedMs` after the segment starts. */
export function resolvePickupRemainingFraction(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  return Math.exp(-elapsedMs / PICKUP_CONVERGENCE_TIME_CONSTANT_MS);
}

export type SlatePlaybackSegment = {
  /** Timeline ms (1×) at which this segment starts. */
  startMs: number;
  /** Segment duration at 1× speed. Always > 0. */
  durationMs: number;
};

export type SlatePlaybackTimeline = {
  kind: SlatePlaybackKind;
  path: readonly TimelineSnapshot[];
  /** segments[i] runs from path[i] to path[i + 1]. */
  segments: readonly SlatePlaybackSegment[];
  totalDurationMs: number;
};

export function compileSlatePlaybackTimeline(
  path: readonly TimelineSnapshot[],
  kind: SlatePlaybackKind = "default",
): SlatePlaybackTimeline {
  const segments: SlatePlaybackSegment[] = [];
  let startMs = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const fromSnapshot = path[index]!;
    const toSnapshot = path[index + 1]!;
    const durationMs =
      kind === "possession-pass"
        ? resolvePossessionPassDurationMs(fromSnapshot, toSnapshot)
        : resolvePhaseSegmentDurationMs(resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot), 1);
    segments.push({ startMs, durationMs });
    startMs += durationMs;
  }
  return { kind, path, segments, totalDurationMs: startMs };
}

export type SlateTimelinePosition = {
  segmentIndex: number;
  /** Linear progress through the segment, 0..1. */
  progress: number;
  /** True once the timeline position has reached the end of the last segment. */
  isComplete: boolean;
};

/**
 * Which segment a timeline position falls in. A position exactly on a
 * boundary belongs to the later segment at progress 0 (the end of the last
 * segment is reported as that segment at progress 1, complete).
 */
export function locateSlateTimelinePosition(
  timeline: SlatePlaybackTimeline,
  timelineMs: number,
): SlateTimelinePosition {
  const { segments, totalDurationMs } = timeline;
  if (segments.length <= 0) return { segmentIndex: 0, progress: 1, isComplete: true };
  const clampedMs = Number.isFinite(timelineMs) ? Math.max(0, Math.min(totalDurationMs, timelineMs)) : 0;
  if (clampedMs >= totalDurationMs) {
    return { segmentIndex: segments.length - 1, progress: 1, isComplete: true };
  }
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (segments[mid]!.startMs <= clampedMs) low = mid;
    else high = mid - 1;
  }
  const segment = segments[low]!;
  const progress = Math.max(0, Math.min(1, (clampedMs - segment.startMs) / segment.durationMs));
  return { segmentIndex: low, progress, isComplete: false };
}

export type SlateTimelinePlayerSample = { id: string; x: number; y: number };

/**
 * A ball's sampled state. "attached" balls are positioned by the caller at
 * the holder's carried point, after the players have been placed, because
 * that point depends on presentation geometry (world bounds, token mode)
 * this pure module deliberately knows nothing about.
 */
export type SlateTimelineBallSample =
  | { id: string; kind: "attached"; attachedPlayerId: string }
  /**
   * A ball that was loose at the segment start and is attached at its end:
   * drawn at fromX/fromY + (carried point − from) × (1 − remainingFraction).
   */
  | {
      id: string;
      kind: "pickup";
      attachedPlayerId: string;
      fromX: number;
      fromY: number;
      remainingFraction: number;
    }
  | { id: string; kind: "holder-switch"; x: number; y: number }
  | { id: string; kind: "free"; x: number; y: number; path: NormalizedPoint[] };

export type SlateTimelineSample = SlateTimelinePosition & {
  players: SlateTimelinePlayerSample[];
  balls: SlateTimelineBallSample[];
};

/**
 * The board at a timeline position. Only players and balls present in both
 * of the active segment's snapshots are reported — the same entities the
 * old engine animated; anything else keeps its current on-surface state.
 */
export function sampleSlatePlaybackTimeline(
  timeline: SlatePlaybackTimeline,
  timelineMs: number,
): SlateTimelineSample {
  const position = locateSlateTimelinePosition(timeline, timelineMs);
  const fromSnapshot = timeline.path[position.segmentIndex];
  const toSnapshot = timeline.path[position.segmentIndex + 1];
  if (!fromSnapshot || !toSnapshot) return { ...position, players: [], balls: [] };
  const easedProgress = getPlaybackEaseProgress(position.progress);

  const fromPlayersById = new Map(fromSnapshot.players.map((entry) => [entry.id, entry] as const));
  const players: SlateTimelinePlayerSample[] = [];
  for (const toPoint of toSnapshot.players) {
    const fromPoint = fromPlayersById.get(toPoint.id);
    if (!fromPoint) continue;
    const point = toPoint.path?.length
      ? interpolatePath(fromPoint, toPoint, easedProgress)
      : {
          x: fromPoint.x + (toPoint.x - fromPoint.x) * easedProgress,
          y: fromPoint.y + (toPoint.y - fromPoint.y) * easedProgress,
        };
    players.push({ id: toPoint.id, x: point.x, y: point.y });
  }

  const balls: SlateTimelineBallSample[] = [];
  for (const toBall of toSnapshot.football) {
    const fromBall = fromSnapshot.football.find((point) => point.id === toBall.id) ?? null;
    const targetAttachedPlayerId = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
    const sourceAttachedPlayerId = fromBall?.isFree ? null : fromBall?.attachedPlayerId ?? null;
    if (targetAttachedPlayerId) {
      if (fromBall && sourceAttachedPlayerId != null && sourceAttachedPlayerId !== targetAttachedPlayerId) {
        // Holder switch: replays the recorded snapshot endpoints, as before.
        balls.push({
          id: toBall.id,
          kind: "holder-switch",
          x: fromBall.x + (toBall.x - fromBall.x) * easedProgress,
          y: fromBall.y + (toBall.y - fromBall.y) * easedProgress,
        });
        continue;
      }
      if (fromBall && sourceAttachedPlayerId == null) {
        const segment = timeline.segments[position.segmentIndex]!;
        balls.push({
          id: toBall.id,
          kind: "pickup",
          attachedPlayerId: targetAttachedPlayerId,
          fromX: fromBall.x,
          fromY: fromBall.y,
          remainingFraction: resolvePickupRemainingFraction(position.progress * segment.durationMs),
        });
        continue;
      }
      balls.push({ id: toBall.id, kind: "attached", attachedPlayerId: targetAttachedPlayerId });
      continue;
    }
    const freePoint = interpolatePath(fromBall, toBall, easedProgress);
    balls.push({
      id: toBall.id,
      kind: "free",
      x: freePoint.x,
      y: freePoint.y,
      path: toBall.path?.map((pathPoint) => ({ x: pathPoint.x, y: pathPoint.y })) ?? [],
    });
  }

  return { ...position, players, balls };
}
