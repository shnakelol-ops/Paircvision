/**
 * Direction-aware possession presentation for Tactical Slate phase playback.
 *
 * Stored state never changes: snapshots keep the fixed carried anchor
 * (ATTACHED_BALL_OFFSETS_WORLD) and durations are computed from it. This
 * module only decides where the ball is DRAWN during phase playback, as a
 * pure function of the playback's snapshots and progress — no frame state —
 * so pause/resume, playback speed and frame rate cannot change the result.
 *
 * The ball sits at the carry radius in the holder's direction of intent:
 *
 *   upcoming pass direction > current route direction > previous intent >
 *   the fixed carried anchor
 *
 * - During a carry the intent turns from where the ball already is toward
 *   the route direction, and — when the holder passes next — toward the
 *   pass direction over the end of the carry, so the ball is already on the
 *   passing side when the pass begins. No release correction is needed.
 * - A pass flies from that carried point to the receiver's incoming side
 *   (ease-out flight: the ball leaves with speed and settles on arrival).
 * - The receiver's next carry turns the ball from the incoming side toward
 *   their run or next pass, so there is no separate receive correction.
 * - Turns use the adaptive release/receive leg geometry: small turns move
 *   along the token's edge, large/opposite turns go in behind the token
 *   (rendered beneath the player layer — see occludedByPlayers).
 * - The first and last frames of a playback are exactly the fixed anchor,
 *   so playback starts and ends on the static board.
 *
 * Only player-to-player possession is handled here (a carry by one holder,
 * or a holder switch). Any other ball segment — loose ball, pick-up, ball
 * played into space — returns null and keeps its existing behaviour; the
 * possession plan puts the ball on its fixed anchor at the boundaries of
 * those segments so the two never disagree.
 */

import { computePassPositionProgress } from "../../movement-board/ball/pass-trajectory";
import {
  computeDirectionalPassAnchors,
  DIRECTIONAL_PASS_TRANSITION_FRACTION,
  resolveDirectionalPassLeg,
  sampleDirectionalPassLeg,
  type DirectionalPassLeg,
} from "./directionalPassAnchors";
import { getPlaybackEaseProgress, interpolatePath } from "./routeFollowInterpolation";

type Point = { x: number; y: number };

type PossessionSnapshotPlayer = { id: string; x: number; y: number; path?: Point[] };
type PossessionSnapshotBall = {
  id: string;
  x: number;
  y: number;
  attachedPlayerId?: string | null;
  isFree: boolean;
};
export type PossessionSnapshot = {
  players: readonly PossessionSnapshotPlayer[];
  football: readonly PossessionSnapshotBall[];
};

export type PossessionPresentationDeps = {
  /** Normalized 0–100 snapshot point → world point. */
  toWorld: (point: Point) => Point;
  /** The fixed carried anchor (world) for a holder centred at `centre` (world). */
  anchorPointForCentre: (centre: Point) => Point;
  worldSize: { width: number; height: number };
  /** Carry radius for directional intent (the anchor's own distance). */
  carryRadius: number;
};

/** Share of a carry spent turning from the inherited side toward the run. */
export const POSSESSION_ENTRY_FRACTION = 0.25;
/** Share at the end of a carry spent turning toward the next pass/side. */
export const POSSESSION_ANTICIPATION_FRACTION = 0.4;
/** A holder moving less than this (world units) in a segment is standing. */
export const POSSESSION_MIN_MOVE_WORLD = 1.5;

type CarrySegment = {
  kind: "carry";
  holderId: string;
  moving: boolean;
  startOffset: Point;
  endOffset: Point;
};

type PassSegment = {
  kind: "pass";
  passerId: string;
  receiverId: string;
  /** Passer centre at the segment start (world) — where the ball leaves. */
  passerCentre: Point;
  /** Receiver centre at the segment end (world) — where the ball arrives. */
  receiverCentre: Point;
  /** Ball offset from the passer when the segment starts (inherited intent). */
  startOffset: Point;
  /** Directional release offset (the passer's side facing the receiver). */
  releaseOffset: Point;
  /** Directional arrival offset (the receiver's incoming side). */
  arrivalOffset: Point;
  /** Ball offset from the receiver when the segment ends. */
  endOffset: Point;
};

type PossessionSegment = { kind: "other" } | CarrySegment | PassSegment;

export type PossessionPlan = {
  ballId: string;
  segments: readonly PossessionSegment[];
  path: readonly PossessionSnapshot[];
  deps: PossessionPresentationDeps;
};

export type PossessionFrame = {
  /** World position to draw the ball at. */
  position: Point;
  /** Draw beneath the player tokens (an inward turn behind a token). */
  occludedByPlayers: boolean;
  /** True while the ball is in flight between players (not carried). */
  inFlight: boolean;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

const ORIGIN: Point = { x: 0, y: 0 };

function holderAt(snapshot: PossessionSnapshot, ballId: string): string | null {
  const ball = snapshot.football.find((entry) => entry.id === ballId);
  if (!ball || ball.isFree) return null;
  return ball.attachedPlayerId ?? null;
}

function findPlayer(snapshot: PossessionSnapshot, playerId: string): PossessionSnapshotPlayer | null {
  return snapshot.players.find((entry) => entry.id === playerId) ?? null;
}

/**
 * A player's world centre at eased progress `eased` through a segment —
 * the same interpolatePath call the playback loop uses to place the token,
 * so the ball is always positioned relative to the token actually drawn.
 */
function centreDuring(
  from: PossessionSnapshot,
  to: PossessionSnapshot,
  playerId: string,
  eased: number,
  deps: PossessionPresentationDeps,
): Point | null {
  const fromPlayer = findPlayer(from, playerId);
  const toPlayer = findPlayer(to, playerId);
  if (!fromPlayer || !toPlayer) return null;
  return deps.toWorld(interpolatePath(fromPlayer, toPlayer, eased));
}

function routeLength(from: PossessionSnapshot, to: PossessionSnapshot, playerId: string, deps: PossessionPresentationDeps): number {
  let length = 0;
  let previous = centreDuring(from, to, playerId, 0, deps);
  for (let index = 1; index <= 16; index += 1) {
    const next = centreDuring(from, to, playerId, index / 16, deps);
    if (previous && next) length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return length;
}

/** Unit direction of the holder's route at eased progress `eased` (world). */
function routeDirection(
  from: PossessionSnapshot,
  to: PossessionSnapshot,
  playerId: string,
  eased: number,
  deps: PossessionPresentationDeps,
): Point | null {
  const step = 0.02;
  const a = centreDuring(from, to, playerId, Math.max(0, eased - step), deps);
  const b = centreDuring(from, to, playerId, Math.min(1, eased + step), deps);
  if (a && b) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 1e-6) return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  }
  const start = centreDuring(from, to, playerId, 0, deps);
  const end = centreDuring(from, to, playerId, 1, deps);
  if (!start || !end) return null;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return length > 1e-6 ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length } : null;
}

function scale(direction: Point, radius: number): Point {
  return { x: direction.x * radius, y: direction.y * radius };
}

/**
 * Builds the possession plan for one ball over a playback path. Pure: reads
 * the snapshots, never writes them.
 */
export function buildPossessionPlan(
  path: readonly PossessionSnapshot[],
  ballId: string,
  deps: PossessionPresentationDeps,
): PossessionPlan {
  const segmentCount = Math.max(0, path.length - 1);
  const anchorOffsetFor = (snapshot: PossessionSnapshot, playerId: string): Point | null => {
    const player = findPlayer(snapshot, playerId);
    if (!player) return null;
    const centre = deps.toWorld(player);
    return sub(deps.anchorPointForCentre(centre), centre);
  };

  // 1. Classify segments, and fix each pass's release/arrival geometry.
  type Draft =
    | { kind: "other" }
    | { kind: "carry"; holderId: string; moving: boolean }
    | {
        kind: "pass";
        passerId: string;
        receiverId: string;
        passerCentre: Point;
        receiverCentre: Point;
        releaseOffset: Point;
        arrivalOffset: Point;
      };
  const drafts: Draft[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const from = path[index]!;
    const to = path[index + 1]!;
    const fromHolder = holderAt(from, ballId);
    const toHolder = holderAt(to, ballId);
    if (fromHolder && toHolder && fromHolder === toHolder && findPlayer(from, fromHolder) && findPlayer(to, toHolder)) {
      drafts.push({
        kind: "carry",
        holderId: fromHolder,
        moving: routeLength(from, to, fromHolder, deps) >= POSSESSION_MIN_MOVE_WORLD,
      });
      continue;
    }
    if (fromHolder && toHolder && fromHolder !== toHolder) {
      const passer = findPlayer(from, fromHolder);
      const receiver = findPlayer(to, toHolder);
      const passerAnchor = anchorOffsetFor(from, fromHolder);
      const receiverAnchor = anchorOffsetFor(to, toHolder);
      if (passer && receiver && passerAnchor && receiverAnchor) {
        const passerCentre = deps.toWorld(passer);
        const receiverCentre = deps.toWorld(receiver);
        const anchors = computeDirectionalPassAnchors({
          passerCentre,
          receiverCentre,
          anchorRadius: deps.carryRadius,
        });
        drafts.push({
          kind: "pass",
          passerId: fromHolder,
          receiverId: toHolder,
          passerCentre,
          receiverCentre,
          // Very short passes (no anchors) keep the fixed anchors; short
          // passes fade the directional sides in (anchors.strength).
          releaseOffset: anchors
            ? lerp(passerAnchor, sub(anchors.release, passerCentre), anchors.strength)
            : passerAnchor,
          arrivalOffset: anchors
            ? lerp(receiverAnchor, sub(anchors.receive, receiverCentre), anchors.strength)
            : receiverAnchor,
        });
        continue;
      }
    }
    drafts.push({ kind: "other" });
  }

  // 2. Intent offset at every boundary where the ball is held. The first and
  //    last boundaries are the fixed anchor, so playback starts and ends on
  //    the static board.
  const boundary: (Point | null)[] = [];
  for (let k = 0; k <= segmentCount; k += 1) {
    const snapshot = path[k]!;
    const holder = holderAt(snapshot, ballId);
    const anchor = holder ? anchorOffsetFor(snapshot, holder) : null;
    if (!holder || !anchor) {
      boundary.push(null);
      continue;
    }
    const previous = k > 0 ? drafts[k - 1] : undefined;
    const next = k < segmentCount ? drafts[k] : undefined;
    if (k === 0 || k === segmentCount) {
      boundary.push(anchor);
    } else if (previous?.kind === "pass") {
      // Received: the ball arrives on the incoming side.
      boundary.push(previous.arrivalOffset);
    } else if (previous?.kind === "carry") {
      if (next?.kind === "pass") {
        // Anticipation: be on the passing side when the pass begins.
        boundary.push(next.releaseOffset);
      } else if (next?.kind === "carry") {
        const direction = previous.moving
          ? routeDirection(path[k - 1]!, snapshot, holder, 1, deps)
          : null;
        boundary.push(direction ? scale(direction, deps.carryRadius) : boundary[k - 1] ?? anchor);
      } else {
        boundary.push(anchor);
      }
    } else {
      boundary.push(anchor);
    }
  }

  const segments: PossessionSegment[] = drafts.map((draft, index) => {
    const startOffset = boundary[index];
    const endOffset = boundary[index + 1];
    if (draft.kind === "other" || !startOffset || !endOffset) return { kind: "other" };
    if (draft.kind === "carry") {
      return { kind: "carry", holderId: draft.holderId, moving: draft.moving, startOffset, endOffset };
    }
    return { ...draft, startOffset, endOffset };
  });

  return { ballId, segments, path, deps };
}

function clampToWorld(point: Point, size: { width: number; height: number }): Point {
  return {
    x: Math.max(0, Math.min(size.width, point.x)),
    y: Math.max(0, Math.min(size.height, point.y)),
  };
}

function legBetween(from: Point, to: Point): DirectionalPassLeg {
  return resolveDirectionalPassLeg(ORIGIN, from, to);
}

function isTurning(weight: number, leg: DirectionalPassLeg): boolean {
  return weight > 0 && weight < 1 && leg.occluded;
}

/**
 * The ball's presentation at `progress` (linear 0–1) through segment
 * `segmentIndex` of the plan's playback, or null when that segment is not
 * player-to-player possession (the caller keeps its existing behaviour).
 */
export function samplePossessionFrame(
  plan: PossessionPlan,
  segmentIndex: number,
  progress: number,
): PossessionFrame | null {
  const segment = plan.segments[segmentIndex];
  const from = plan.path[segmentIndex];
  const to = plan.path[segmentIndex + 1];
  if (!segment || segment.kind === "other" || !from || !to) return null;
  const { deps } = plan;
  const p = clamp01(progress);
  const eased = getPlaybackEaseProgress(p);

  if (segment.kind === "carry") {
    const centre = centreDuring(from, to, segment.holderId, eased, deps);
    if (!centre) return null;
    const exitWeight = smoothstep01((p - (1 - POSSESSION_ANTICIPATION_FRACTION)) / POSSESSION_ANTICIPATION_FRACTION);
    let offset: Point;
    let occluded = false;
    if (segment.moving) {
      const direction = routeDirection(from, to, segment.holderId, eased, deps);
      const routeOffset = direction ? scale(direction, deps.carryRadius) : segment.startOffset;
      const entryWeight = smoothstep01(p / POSSESSION_ENTRY_FRACTION);
      const entryLeg = legBetween(segment.startOffset, routeOffset);
      const running = sampleDirectionalPassLeg(entryLeg, entryWeight);
      const exitLeg = legBetween(running, segment.endOffset);
      offset = sampleDirectionalPassLeg(exitLeg, exitWeight);
      occluded = isTurning(entryWeight, entryLeg) || isTurning(exitWeight, exitLeg);
    } else {
      const exitLeg = legBetween(segment.startOffset, segment.endOffset);
      offset = sampleDirectionalPassLeg(exitLeg, exitWeight);
      occluded = isTurning(exitWeight, exitLeg);
    }
    if (p <= 0) offset = segment.startOffset;
    if (p >= 1) offset = segment.endOffset;
    return {
      position: clampToWorld(add(centre, offset), deps.worldSize),
      occludedByPlayers: p > 0 && p < 1 && occluded,
      inFlight: false,
    };
  }

  // Pass: from the passer's carried point to the receiver's incoming side.
  // A release turn is only needed when the pass could not be anticipated
  // (a pass from a standing start or straight after receiving); a receive
  // turn only on the last segment of the playback, which ends on the anchor.
  const window = DIRECTIONAL_PASS_TRANSITION_FRACTION;
  const needsRelease = !samePoint(segment.startOffset, segment.releaseOffset);
  const needsReceive = !samePoint(segment.arrivalOffset, segment.endOffset);
  const releaseLeg = legBetween(segment.startOffset, segment.releaseOffset);
  const receiveLeg = legBetween(segment.arrivalOffset, segment.endOffset);
  const releaseWeight = needsRelease ? smoothstep01(p / window) : 1;
  const receiveWeight = needsReceive ? smoothstep01((p - (1 - window)) / window) : 0;
  const origin = add(segment.passerCentre, sampleDirectionalPassLeg(releaseLeg, releaseWeight));
  const destination = add(segment.receiverCentre, sampleDirectionalPassLeg(receiveLeg, receiveWeight));
  const flight = p <= 0 ? 0 : p >= 1 ? 1 : computePassPositionProgress(p);
  const position = p <= 0
    ? add(segment.passerCentre, segment.startOffset)
    : p >= 1
      ? add(segment.receiverCentre, segment.endOffset)
      : lerp(origin, destination, flight);
  return {
    position: clampToWorld(position, deps.worldSize),
    occludedByPlayers:
      p > 0 &&
      p < 1 &&
      ((needsRelease && isTurning(releaseWeight, releaseLeg)) || (needsReceive && isTurning(receiveWeight, receiveLeg))),
    inFlight: p > 0 && p < 1,
  };
}

/** The segment kind at `segmentIndex` (for callers mirroring ownership state). */
export function possessionSegmentKind(plan: PossessionPlan, segmentIndex: number): PossessionSegment["kind"] | null {
  return plan.segments[segmentIndex]?.kind ?? null;
}
