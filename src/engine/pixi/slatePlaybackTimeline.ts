import type { NormalizedPoint } from "../shared/normalization";
import {
  getPlaybackEaseProgress,
  interpolatePath,
  resolvePhaseSegmentDurationMs,
  resolveSegmentMaxMovementDistance,
  resolveStoredRoutePolyline,
} from "./routeFollowInterpolation";
import {
  buildCarryAngleTrack,
  collectWalkDirectionEvents,
  evaluateCarryAngle,
  resolveCarryAngleTo,
  resolveDefaultCarryAngle,
  resolvePresentedCarryPoint,
  SLATE_CARRY_WORLD,
  type CarryAngleTrack,
  type CarryDirectionEvent,
  type CarryWorld,
} from "./slateCarryPresentation";
import {
  resolvePassFlightPoint,
  resolvePassPhaseMinimumMs,
  solvePassInterception,
  SLATE_PASS_SPEED_WORLD_PER_S,
  toNormalizedPoint,
  toWorldPoint,
  type SlatePassFlight,
} from "./slatePassFlight";
import {
  compilePlayerContinuitySlopes,
  measurePlayerWalk,
  resolveContinuityProgress,
  SLATE_WORLD_SCALE,
  type PlayerSegmentSlopes,
  type WorldScale,
} from "./slatePlayerContinuity";

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
 * Every position here is a function of (segment, progress) with the same
 * interpolation geometry and per-segment durations as the previous
 * frame-stepped engine. Players who keep moving through a phase boundary
 * carry their speed across it (slatePlayerContinuity.ts) instead of easing to
 * a stop and starting again; everyone else, and every ball, keeps the
 * per-segment smoothstep. The other difference from the old engine is the
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
  /**
   * playerSlopes[i]: Hermite boundary slopes for each player who keeps moving
   * through a boundary of segment i (see slatePlayerContinuity.ts). A player
   * with no entry walks the segment with the plain smoothstep.
   */
  playerSlopes: readonly ReadonlyMap<string, PlayerSegmentSlopes>[];
  /**
   * Per ball: the spans during which a player carries it, each with its
   * direction-aware carry-angle track (see slateCarryPresentation.ts).
   */
  carrySpans: ReadonlyMap<string, readonly SlateCarrySpan[]>;
  carryWorld: CarryWorld;
  /**
   * Presented carry angle of each ball when this playback was started
   * (tap-to-pass only), so a pass leaves from where the ball was drawn.
   */
  initialCarryAngleByBallId: ReadonlyMap<string, number>;
  /** Presentation carry distance per ball (see SlateCarryOptions.distanceByBallId). */
  carryDistanceByBallId: ReadonlyMap<string, number>;
  /**
   * Player-to-player passes, keyed by passFlightKey(segmentIndex, ballId):
   * each recorded holder switch played as a locked, constant-speed flight
   * (see slatePassFlight.ts).
   */
  passFlights: ReadonlyMap<string, SlatePassFlight>;
};

export function passFlightKey(segmentIndex: number, ballId: string): string {
  return `${segmentIndex}:${ballId}`;
}

export type SlateCarrySpan = {
  holderId: string;
  startMs: number;
  endMs: number;
  track: CarryAngleTrack;
};

export type SlateCarryOptions = {
  world?: CarryWorld;
  initialAngleByBallId?: ReadonlyMap<string, number>;
  /**
   * Presentation carry distance (world units) per ball, from the rendered
   * player and ball sizes; a ball without an entry uses world.radiusWorld.
   */
  distanceByBallId?: ReadonlyMap<string, number>;
  /** Player-to-player pass speed, world units per second (SLATE_PASS_SPEED_WORLD_PER_S). */
  passSpeedWorldPerS?: number;
};

export function compileSlatePlaybackTimeline(
  path: readonly TimelineSnapshot[],
  kind: SlatePlaybackKind = "default",
  worldScale: WorldScale = SLATE_WORLD_SCALE,
  carry: SlateCarryOptions = {},
): SlatePlaybackTimeline {
  const carryWorld = carry.world ?? { ...SLATE_CARRY_WORLD, scale: worldScale };
  const distanceByBallId = carry.distanceByBallId ?? new Map<string, number>();
  const passSpeedWorldPerS = carry.passSpeedWorldPerS ?? SLATE_PASS_SPEED_WORLD_PER_S;
  const segments: SlatePlaybackSegment[] = [];
  let startMs = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const fromSnapshot = path[index]!;
    const toSnapshot = path[index + 1]!;
    let durationMs =
      kind === "possession-pass"
        ? resolvePossessionPassDurationMs(fromSnapshot, toSnapshot)
        : resolvePhaseSegmentDurationMs(resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot), 1);
    if (kind === "default") {
      // A pass never spills into the next phase: a phase holding a pass
      // lasts at least long enough for the ball to reach the receiver.
      durationMs = Math.max(
        durationMs,
        resolvePassPhaseFloorMs(fromSnapshot, toSnapshot, carryWorld, distanceByBallId, passSpeedWorldPerS),
      );
    }
    segments.push({ startMs, durationMs });
    startMs += durationMs;
  }
  const playerSlopes = compilePlayerContinuitySlopes(
    path,
    segments.map((segment) => segment.durationMs),
    worldScale,
  );
  const { spans: carrySpans, flights: passFlights } = compileCarrySpans(
    path,
    segments,
    playerSlopes,
    carryWorld,
    distanceByBallId,
    passSpeedWorldPerS,
  );
  return {
    kind,
    path,
    segments,
    totalDurationMs: startMs,
    playerSlopes,
    carrySpans,
    carryWorld,
    initialCarryAngleByBallId: carry.initialAngleByBallId ?? new Map(),
    carryDistanceByBallId: distanceByBallId,
    passFlights,
  };
}

/** The holder switches (player-to-player passes) between two snapshots. */
function resolveHolderSwitches(
  fromSnapshot: TimelineSnapshot,
  toSnapshot: TimelineSnapshot,
): { fromBall: TimelineBallSnapshot; toBall: TimelineBallSnapshot; passerId: string; receiverId: string }[] {
  const switches = [];
  for (const toBall of toSnapshot.football) {
    const fromBall = fromSnapshot.football.find((entry) => entry.id === toBall.id);
    if (!fromBall) continue;
    const receiverId = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
    const passerId = fromBall.isFree ? null : fromBall.attachedPlayerId ?? null;
    if (!receiverId || !passerId || receiverId === passerId) continue;
    switches.push({ fromBall, toBall, passerId, receiverId });
  }
  return switches;
}

/**
 * Shortest duration a phase needs so each pass in it reaches its receiver
 * before the phase ends (0 when it has no pass). Decided from authored
 * positions only, so it is known before any movement is compiled.
 */
function resolvePassPhaseFloorMs(
  fromSnapshot: TimelineSnapshot,
  toSnapshot: TimelineSnapshot,
  world: CarryWorld,
  distanceByBallId: ReadonlyMap<string, number>,
  passSpeedWorldPerS: number,
): number {
  let floorMs = 0;
  for (const { fromBall, toBall, passerId, receiverId } of resolveHolderSwitches(fromSnapshot, toSnapshot)) {
    const passer = fromSnapshot.players.find((entry) => entry.id === passerId);
    const receiver = toSnapshot.players.find((entry) => entry.id === receiverId);
    if (!passer || !receiver) continue;
    const passerWorld = toWorldPoint(passer, world.scale);
    const carryDistance = distanceByBallId.get(toBall.id) ?? world.radiusWorld;
    // The ball leaves from the passer's presented carry point, or from the
    // snapshot point when the passer has no carry span yet.
    const snapshotOffset = Math.hypot(
      fromBall.x * world.scale.x - passerWorld.x,
      fromBall.y * world.scale.y - passerWorld.y,
    );
    floorMs = Math.max(
      floorMs,
      resolvePassPhaseMinimumMs({
        passerStartWorld: passerWorld,
        receiverEndWorld: toWorldPoint(receiver, world.scale),
        releaseOffsetWorld: Math.max(carryDistance, snapshotOffset),
        carryDistanceWorld: carryDistance,
        speedWorldPerS: passSpeedWorldPerS,
      }),
    );
  }
  return floorMs;
}

/** Where a player is (normalized) at linear `progress` through segment `index` — exactly what the sampler draws. */
function resolvePlayerPointInSegment(
  path: readonly TimelineSnapshot[],
  playerSlopes: readonly ReadonlyMap<string, PlayerSegmentSlopes>[],
  index: number,
  playerId: string,
  progress: number,
): NormalizedPoint | null {
  const fromPoint = path[index]?.players.find((entry) => entry.id === playerId);
  const toPoint = path[index + 1]?.players.find((entry) => entry.id === playerId);
  if (!fromPoint || !toPoint) return null;
  const share = playerShare(playerSlopes[index]?.get(playerId))(Math.max(0, Math.min(1, progress)));
  return toPoint.path?.length
    ? interpolatePath(fromPoint, toPoint, share)
    : { x: fromPoint.x + (toPoint.x - fromPoint.x) * share, y: fromPoint.y + (toPoint.y - fromPoint.y) * share };
}

/** Linear segment progress → share of a player's walk completed (Stage 1 curve, or smoothstep). */
function playerShare(slopes: PlayerSegmentSlopes | undefined): (progress: number) => number {
  return slopes ? (progress) => resolveContinuityProgress(progress, slopes) : getPlaybackEaseProgress;
}

type CarrySpanDraft = {
  holderId: string;
  startMs: number;
  /** null: take the holder's first direction of movement in the span (or the canonical side). */
  initialAngle: number | null;
  initialHolderPoint: NormalizedPoint;
  events: CarryDirectionEvent[];
};

/**
 * The spans in which each ball is carried, built from the same transitions
 * the sampler animates: a ball held by the same player across segments is
 * one span; a pickup starts a span at the segment start (ball on the side it
 * was picked up from); a holder switch ends the passer's span at the segment
 * start and starts the receiver's at the segment end (ball on the side it
 * arrived from). A span that starts with the ball already carried begins on
 * the holder's first direction of movement, so Play does not open with a
 * default→movement turn.
 */
function compileCarrySpans(
  path: readonly TimelineSnapshot[],
  segments: readonly SlatePlaybackSegment[],
  playerSlopes: readonly ReadonlyMap<string, PlayerSegmentSlopes>[],
  world: CarryWorld,
  distanceByBallId: ReadonlyMap<string, number>,
  passSpeedWorldPerS: number,
): { spans: Map<string, SlateCarrySpan[]>; flights: Map<string, SlatePassFlight> } {
  const ballIds = new Set<string>();
  for (const snapshot of path) for (const ball of snapshot.football) ballIds.add(ball.id);
  const spansByBall = new Map<string, SlateCarrySpan[]>();
  const flights = new Map<string, SlatePassFlight>();

  const playerAt = (index: number, id: string) => path[index]?.players.find((entry) => entry.id === id) ?? null;
  const walkEvents = (index: number, holderId: string): CarryDirectionEvent[] => {
    const from = playerAt(index, holderId);
    const to = playerAt(index + 1, holderId);
    const segment = segments[index];
    if (!from || !to || !segment) return [];
    if (!measurePlayerWalk(from, to, world.scale)) return [];
    const polyline = resolveStoredRoutePolyline(from, to) ?? [
      { x: from.x, y: from.y },
      { x: to.x, y: to.y },
    ];
    return collectWalkDirectionEvents(
      polyline,
      segment.startMs,
      segment.durationMs,
      playerShare(playerSlopes[index]?.get(holderId)),
      world,
    );
  };

  for (const ballId of ballIds) {
    const spans: SlateCarrySpan[] = [];
    let open: CarrySpanDraft | null = null;
    const close = (endMs: number) => {
      if (!open) return;
      const draft: CarrySpanDraft = open;
      const initialAngle =
        draft.initialAngle ?? draft.events[0]?.angle ?? resolveDefaultCarryAngle(draft.initialHolderPoint, world);
      spans.push({
        holderId: draft.holderId,
        startMs: draft.startMs,
        endMs,
        track: buildCarryAngleTrack(draft.startMs, initialAngle, draft.events),
      });
      open = null;
    };
    segments.forEach((segment, index) => {
      const fromBall = path[index]!.football.find((entry) => entry.id === ballId) ?? null;
      const toBall = path[index + 1]!.football.find((entry) => entry.id === ballId) ?? null;
      const segmentEndMs = segment.startMs + segment.durationMs;
      if (!toBall) {
        close(segment.startMs);
        return;
      }
      const target = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
      const source = fromBall?.isFree ? null : fromBall?.attachedPlayerId ?? null;
      if (!target) {
        close(segment.startMs);
        return;
      }
      if (fromBall && source != null && source !== target) {
        close(segment.startMs);
        const flight = compilePassFlight(index, ballId, source, target, fromBall, spans);
        if (flight) {
          // Received mid-phase, possibly on the run: the receiver carries the
          // ball from the side it arrived on, turning toward where they are
          // heading at that moment and then following their later turns.
          flights.set(passFlightKey(index, ballId), flight);
          const receiverAtArrival = resolvePlayerPointInSegment(
            path,
            playerSlopes,
            index,
            target,
            (flight.arrivalMs - segment.startMs) / segment.durationMs,
          )!;
          const events = walkEvents(index, target);
          const current = events.filter((event) => event.timeMs <= flight.arrivalMs).pop();
          open = {
            holderId: target,
            startMs: flight.arrivalMs,
            initialAngle: resolveCarryAngleTo(receiverAtArrival, flight.end, world),
            initialHolderPoint: receiverAtArrival,
            events: [
              ...(current ? [{ timeMs: flight.arrivalMs, angle: current.angle }] : []),
              ...events.filter((event) => event.timeMs > flight.arrivalMs),
            ],
          };
          return;
        }
        const receiverEnd = playerAt(index + 1, target);
        if (!receiverEnd) return;
        open = {
          holderId: target,
          startMs: segmentEndMs,
          initialAngle: resolveCarryAngleTo(receiverEnd, toBall, world),
          initialHolderPoint: receiverEnd,
          events: [],
        };
        return;
      }
      if (fromBall && source == null) {
        close(segment.startMs);
        const holderStart = playerAt(index, target) ?? playerAt(index + 1, target);
        if (!holderStart) return;
        open = {
          holderId: target,
          startMs: segment.startMs,
          initialAngle: resolveCarryAngleTo(holderStart, fromBall, world),
          initialHolderPoint: holderStart,
          events: walkEvents(index, target),
        };
        return;
      }
      if (!open || open.holderId !== target) {
        close(segment.startMs);
        const holderStart = playerAt(index, target) ?? playerAt(index + 1, target);
        if (!holderStart) return;
        open = { holderId: target, startMs: segment.startMs, initialAngle: null, initialHolderPoint: holderStart, events: [] };
      }
      open.events.push(...walkEvents(index, target));
    });
    close(segments.length > 0 ? segments[segments.length - 1]!.startMs + segments[segments.length - 1]!.durationMs : 0);
    if (spans.length > 0) spansByBall.set(ballId, spans);
  }
  return { spans: spansByBall, flights };

  /**
   * The pass in segment `index`: launched at the segment start from the
   * passer's presented carry point (their carry span ends there) or the
   * snapshot point, aimed at the receiver's solved meeting point.
   */
  function compilePassFlight(
    index: number,
    ballId: string,
    passerId: string,
    receiverId: string,
    fromBall: TimelineBallSnapshot,
    passerSpans: readonly SlateCarrySpan[],
  ): SlatePassFlight | null {
    const segment = segments[index]!;
    const passer = playerAt(index, passerId);
    if (!passer || !playerAt(index, receiverId) || !playerAt(index + 1, receiverId)) return null;
    const carryDistance = distanceByBallId.get(ballId) ?? world.radiusWorld;
    const ballWorld = { ...world, radiusWorld: carryDistance };
    const passerSpan = [...passerSpans]
      .reverse()
      .find((span) => span.holderId === passerId && span.endMs === segment.startMs);
    const start = passerSpan
      ? resolvePresentedCarryPoint(passer, evaluateCarryAngle(passerSpan.track, segment.startMs), ballWorld)
      : { x: fromBall.x, y: fromBall.y };
    const solved = solvePassInterception({
      startWorld: toWorldPoint(start, world.scale),
      receiverWorldAt: (ms) =>
        toWorldPoint(resolvePlayerPointInSegment(path, playerSlopes, index, receiverId, ms / segment.durationMs)!, world.scale),
      carryDistanceWorld: carryDistance,
      maxMs: segment.durationMs,
      speedWorldPerS: passSpeedWorldPerS,
    });
    return {
      ballId,
      passerId,
      receiverId,
      launchMs: segment.startMs,
      arrivalMs: segment.startMs + solved.flightMs,
      start,
      end: toNormalizedPoint(solved.arrivalWorld, world.scale),
    };
  }
}

/** The carry span of `ballId` held by `holderId` that covers `timeMs` (inclusive at both ends). */
function findCarrySpan(
  timeline: SlatePlaybackTimeline,
  ballId: string,
  holderId: string,
  timeMs: number,
): SlateCarrySpan | null {
  const spans = timeline.carrySpans.get(ballId);
  if (!spans) return null;
  for (const span of spans) {
    if (span.holderId === holderId && span.startMs <= timeMs && timeMs <= span.endMs) return span;
  }
  return null;
}

/**
 * Presented carry angle of every ball still carried when the timeline ends,
 * so the surface can keep the final carry side after playback.
 */
export function resolveFinalCarryAngles(timeline: SlatePlaybackTimeline): Map<string, number> {
  const angles = new Map<string, number>();
  const last = timeline.path[timeline.path.length - 1];
  if (!last) return angles;
  for (const ball of last.football) {
    const holderId = ball.isFree ? null : ball.attachedPlayerId ?? null;
    if (!holderId) continue;
    const span = findCarrySpan(timeline, ball.id, holderId, timeline.totalDurationMs);
    if (span) angles.set(ball.id, evaluateCarryAngle(span.track, timeline.totalDurationMs));
  }
  return angles;
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
 * A ball's sampled state, with the point to draw it at. A carried ball
 * ("attached", "pickup") also reports its presented carry angle (world
 * radians) so the surface can keep that side once playback stops.
 */
export type SlateTimelineBallSample =
  | { id: string; kind: "attached"; attachedPlayerId: string; x: number; y: number; carryAngle: number }
  /**
   * A ball that was loose at the segment start and is attached at its end:
   * drawn at from + (presented carry point − from) × (1 − remainingFraction).
   */
  | {
      id: string;
      kind: "pickup";
      attachedPlayerId: string;
      x: number;
      y: number;
      carryAngle: number;
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
  const segmentPlayerSlopes = timeline.playerSlopes[position.segmentIndex];
  const players: SlateTimelinePlayerSample[] = [];
  for (const toPoint of toSnapshot.players) {
    const fromPoint = fromPlayersById.get(toPoint.id);
    if (!fromPoint) continue;
    const slopes = segmentPlayerSlopes?.get(toPoint.id);
    const walkedShare = slopes ? resolveContinuityProgress(position.progress, slopes) : easedProgress;
    const point = toPoint.path?.length
      ? interpolatePath(fromPoint, toPoint, walkedShare)
      : {
          x: fromPoint.x + (toPoint.x - fromPoint.x) * walkedShare,
          y: fromPoint.y + (toPoint.y - fromPoint.y) * walkedShare,
        };
    players.push({ id: toPoint.id, x: point.x, y: point.y });
  }

  const segment = timeline.segments[position.segmentIndex]!;
  const timeMs = segment.startMs + position.progress * segment.durationMs;
  const sampledPlayersById = new Map(players.map((entry) => [entry.id, entry] as const));
  // Carry geometry for one ball: the presentation distance for that ball.
  const worldFor = (ballId: string): CarryWorld => {
    const distance = timeline.carryDistanceByBallId.get(ballId);
    return distance === undefined ? timeline.carryWorld : { ...timeline.carryWorld, radiusWorld: distance };
  };

  // Where a ball leaving its holder at this segment's start was drawn: the
  // passer's presented carry point (its carry span ends here), the carry
  // side the ball had when a tap-to-pass started, or the snapshot point.
  const releasePoint = (ballId: string, fromBall: TimelineBallSnapshot, passerId: string): NormalizedPoint => {
    const passer = fromPlayersById.get(passerId);
    if (passer) {
      const span = findCarrySpan(timeline, ballId, passerId, segment.startMs);
      if (span) return resolvePresentedCarryPoint(passer, evaluateCarryAngle(span.track, segment.startMs), worldFor(ballId));
      const initialAngle = position.segmentIndex === 0 ? timeline.initialCarryAngleByBallId.get(ballId) : undefined;
      if (initialAngle !== undefined) return resolvePresentedCarryPoint(passer, initialAngle, worldFor(ballId));
    }
    return { x: fromBall.x, y: fromBall.y };
  };

  const balls: SlateTimelineBallSample[] = [];
  for (const toBall of toSnapshot.football) {
    const fromBall = fromSnapshot.football.find((point) => point.id === toBall.id) ?? null;
    const targetAttachedPlayerId = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
    const sourceAttachedPlayerId = fromBall?.isFree ? null : fromBall?.attachedPlayerId ?? null;
    if (targetAttachedPlayerId) {
      const flight =
        fromBall && sourceAttachedPlayerId != null && sourceAttachedPlayerId !== targetAttachedPlayerId
          ? timeline.passFlights.get(passFlightKey(position.segmentIndex, toBall.id))
          : undefined;
      if (flight && timeMs < flight.arrivalMs) {
        // Player-to-player pass in flight: locked straight line, constant speed.
        const point = resolvePassFlightPoint(flight, timeMs);
        balls.push({ id: toBall.id, kind: "holder-switch", x: point.x, y: point.y });
        continue;
      }
      if (!flight && fromBall && sourceAttachedPlayerId != null && sourceAttachedPlayerId !== targetAttachedPlayerId) {
        // A holder switch with no solvable pass (a player missing from a
        // snapshot): the recorded endpoints, eased, as before.
        const start = releasePoint(toBall.id, fromBall, sourceAttachedPlayerId);
        const receiverEnd = toSnapshot.players.find((entry) => entry.id === targetAttachedPlayerId);
        const end = receiverEnd
          ? resolvePresentedCarryPoint(
              receiverEnd,
              resolveCarryAngleTo(receiverEnd, toBall, timeline.carryWorld),
              worldFor(toBall.id),
            )
          : { x: toBall.x, y: toBall.y };
        balls.push({
          id: toBall.id,
          kind: "holder-switch",
          x: start.x + (end.x - start.x) * easedProgress,
          y: start.y + (end.y - start.y) * easedProgress,
        });
        continue;
      }
      const holder = sampledPlayersById.get(targetAttachedPlayerId);
      const span = findCarrySpan(timeline, toBall.id, targetAttachedPlayerId, timeMs);
      if (!holder || !span) continue;
      const carryAngle = evaluateCarryAngle(span.track, timeMs);
      const carried = resolvePresentedCarryPoint(holder, carryAngle, worldFor(toBall.id));
      if (fromBall && sourceAttachedPlayerId == null) {
        const remainingFraction = resolvePickupRemainingFraction(position.progress * segment.durationMs);
        balls.push({
          id: toBall.id,
          kind: "pickup",
          attachedPlayerId: targetAttachedPlayerId,
          x: carried.x + (fromBall.x - carried.x) * remainingFraction,
          y: carried.y + (fromBall.y - carried.y) * remainingFraction,
          carryAngle,
          fromX: fromBall.x,
          fromY: fromBall.y,
          remainingFraction,
        });
        continue;
      }
      balls.push({
        id: toBall.id,
        kind: "attached",
        attachedPlayerId: targetAttachedPlayerId,
        x: carried.x,
        y: carried.y,
        carryAngle,
      });
      continue;
    }
    const freePoint = interpolatePath(fromBall, toBall, easedProgress);
    // A ball released into space leaves from where it was drawn being
    // carried; the offset from the snapshot point fades out over the segment.
    const release =
      fromBall && sourceAttachedPlayerId != null ? releasePoint(toBall.id, fromBall, sourceAttachedPlayerId) : null;
    const fade = 1 - easedProgress;
    balls.push({
      id: toBall.id,
      kind: "free",
      x: freePoint.x + (release && fromBall ? (release.x - fromBall.x) * fade : 0),
      y: freePoint.y + (release && fromBall ? (release.y - fromBall.y) * fade : 0),
      path: toBall.path?.map((pathPoint) => ({ x: pathPoint.x, y: pathPoint.y })) ?? [],
    });
  }
  return { ...position, players, balls };
}
