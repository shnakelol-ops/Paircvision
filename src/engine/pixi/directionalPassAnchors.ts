/**
 * Directional release/receive geometry for a player-to-player pass in
 * Tactical Slate.
 *
 * A carried ball sits at a fixed, direction-independent offset from its
 * holder (ATTACHED_BALL_OFFSETS_WORLD — usually upper-right). Flying a pass
 * straight from that carried point to the receiver's carried point makes a
 * backward, lateral or diagonal pass leave from the wrong side of the passer
 * and arrive on the wrong side of the receiver. This module keeps both of
 * those endpoints exactly as they are (ball(0) = passer's carried point,
 * ball(1) = receiver's carried point) and only changes what happens in
 * between:
 *
 *   carry → inward, behind the passer → out at the passer's edge facing
 *   the receiver → the existing straight flight, edge to edge → in at the
 *   receiver's incoming edge → behind the receiver → carry
 *
 * The inward legs are straight lines between the carried point and the
 * directional edge. For a pass to the side opposite the carried spot that
 * line runs under the token, so the caller renders the ball beneath the
 * player layer during those legs (see isDirectionalPassInTransition): the
 * token itself hides the ball's turn, instead of the ball visibly orbiting
 * the token.
 *
 * Everything happens inside the existing pass duration and is a pure
 * function of segment progress, so pause/resume, playback speed, Reset Play
 * and phase jumps need no extra state. All geometry is world-space: the
 * normalized 0–100 space is anisotropic (x is stretched 1.6× relative to y
 * on the 160×100 world), so a direction measured there would bend every
 * diagonal.
 */

export type DirectionalPassWorldPoint = { x: number; y: number };
export type DirectionalPassWorldSize = { width: number; height: number };

/**
 * Share of the pass's linear progress spent on each of the release (start)
 * and receive (end) transitions. A share of progress, so it slows with
 * playback speed exactly like the rest of the pass: 0.25× shows a genuine
 * slow-motion turn. Conservative initial value — tune from device
 * acceptance; it changes nothing but how long the ball spends moving
 * between its carried spot and the directional edge.
 */
export const DIRECTIONAL_PASS_TRANSITION_FRACTION = 0.1;

/**
 * Minimum straight perimeter-to-perimeter flight kept between the release
 * and receive anchors on a short pass, so they can never meet or cross.
 */
export const DIRECTIONAL_PASS_MIN_FLIGHT_GAP_WORLD = 1;

/**
 * Below this centre-to-centre distance a pass is treated exactly as before
 * (straight carried point → carried point). Between this and the full
 * directional distance (2·radius + flight gap) the directional effect
 * fades in continuously, so there is no visual step at any distance.
 */
export const DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD = 4;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function clampToWorld(point: DirectionalPassWorldPoint, worldSize: DirectionalPassWorldSize): DirectionalPassWorldPoint {
  return {
    x: Math.max(0, Math.min(worldSize.width, point.x)),
    y: Math.max(0, Math.min(worldSize.height, point.y)),
  };
}

function lerpPoint(
  from: DirectionalPassWorldPoint,
  to: DirectionalPassWorldPoint,
  weight: number,
): DirectionalPassWorldPoint {
  const w = clamp01(weight);
  return { x: from.x + (to.x - from.x) * w, y: from.y + (to.y - from.y) * w };
}

export type DirectionalPassAnchors = {
  /** Unit pass direction, passer centre → receiver arrival centre (world). */
  direction: DirectionalPassWorldPoint;
  /** Perimeter point on the passer's side facing the receiver. */
  release: DirectionalPassWorldPoint;
  /** Perimeter point on the receiver's side the pass arrives from. */
  receive: DirectionalPassWorldPoint;
  /** Effective anchor radius after the short-pass reduction. */
  radius: number;
  /** 0 = legacy carried→carried flight, 1 = full directional release/receive. */
  strength: number;
};

/**
 * Release/receive anchors for a pass from `passerCentre` to the receiver's
 * arrival centre. Null when the two centres are too close to define a
 * direction — the caller then keeps the legacy flight exactly.
 */
export function computeDirectionalPassAnchors(params: {
  passerCentre: DirectionalPassWorldPoint;
  receiverCentre: DirectionalPassWorldPoint;
  anchorRadius: number;
}): DirectionalPassAnchors | null {
  const { passerCentre, receiverCentre } = params;
  const anchorRadius = Math.max(0, params.anchorRadius);
  const dx = receiverCentre.x - passerCentre.x;
  const dy = receiverCentre.y - passerCentre.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD) return null;
  const direction = { x: dx / distance, y: dy / distance };
  const radius = Math.min(anchorRadius, Math.max(0, (distance - DIRECTIONAL_PASS_MIN_FLIGHT_GAP_WORLD) / 2));
  const fullDistance = 2 * anchorRadius + DIRECTIONAL_PASS_MIN_FLIGHT_GAP_WORLD;
  const fadeSpan = fullDistance - DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD;
  const strength = fadeSpan > 0 ? smoothstep01((distance - DIRECTIONAL_PASS_FALLBACK_DISTANCE_WORLD) / fadeSpan) : 1;
  return {
    direction,
    release: { x: passerCentre.x + direction.x * radius, y: passerCentre.y + direction.y * radius },
    receive: { x: receiverCentre.x - direction.x * radius, y: receiverCentre.y - direction.y * radius },
    radius,
    strength,
  };
}

/**
 * Whether `progress` falls strictly inside the release or receive
 * transition of a pass. The ball is exactly on its carried point at
 * progress 0 and 1, so both ends are outside — the ball is always back in
 * its normal render state at a pass's boundaries.
 */
export function isDirectionalPassInTransition(
  progress: number,
  transitionFraction: number = DIRECTIONAL_PASS_TRANSITION_FRACTION,
): boolean {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return false;
  const window = Math.max(0, Math.min(0.5, transitionFraction));
  return progress < window || progress > 1 - window;
}

export type DirectionalPassBallFrame = {
  position: DirectionalPassWorldPoint;
  /**
   * True while the ball is moving between a carried spot and a directional
   * edge — render it beneath the player tokens so the passer/receiver
   * occludes it. False everywhere else, including both ends of the pass.
   */
  occludedByPlayers: boolean;
};

/**
 * The ball's world position (and render occlusion) during a
 * player-to-player pass.
 *
 * - `progress` is the segment's linear elapsed/duration ratio — it times the
 *   release/receive transitions.
 * - `easedProgress` is the existing flight easing value the legacy lerp
 *   already used — the flight's timing curve is unchanged.
 *
 * ball = lerp(origin, destination, easedProgress), where origin moves in a
 * straight line from the passer's carried point to the release edge during
 * the first window and destination moves from the receive edge to the
 * receiver's carried point during the last. Exactly `passerCarried` at
 * progress 0 and exactly `receiverCarried` at progress 1; identical to the
 * legacy straight lerp (and never occluded) when no anchors apply.
 */
export function computeDirectionalPassBallFrame(params: {
  passerCentre: DirectionalPassWorldPoint;
  receiverCentre: DirectionalPassWorldPoint;
  passerCarried: DirectionalPassWorldPoint;
  receiverCarried: DirectionalPassWorldPoint;
  anchorRadius: number;
  progress: number;
  easedProgress: number;
  worldSize: DirectionalPassWorldSize;
  transitionFraction?: number;
}): DirectionalPassBallFrame {
  const { passerCentre, receiverCentre, passerCarried, receiverCarried, worldSize } = params;
  const progress = clamp01(params.progress);
  const eased = clamp01(params.easedProgress);
  if (progress <= 0) return { position: { x: passerCarried.x, y: passerCarried.y }, occludedByPlayers: false };
  if (progress >= 1) return { position: { x: receiverCarried.x, y: receiverCarried.y }, occludedByPlayers: false };

  const anchors = computeDirectionalPassAnchors({
    passerCentre,
    receiverCentre,
    anchorRadius: params.anchorRadius,
  });
  if (!anchors) {
    return { position: clampToWorld(lerpPoint(passerCarried, receiverCarried, eased), worldSize), occludedByPlayers: false };
  }

  const transitionFraction = params.transitionFraction ?? DIRECTIONAL_PASS_TRANSITION_FRACTION;
  const window = Math.max(1e-6, Math.min(0.5, transitionFraction));
  const releaseWeight = smoothstep01(progress / window);
  const receiveWeight = 1 - smoothstep01((progress - (1 - window)) / window);
  // Short passes fade the directional anchors in (strength < 1) by pulling
  // them back toward the carried points.
  const release = lerpPoint(passerCarried, anchors.release, anchors.strength);
  const receive = lerpPoint(receiverCarried, anchors.receive, anchors.strength);
  const origin = lerpPoint(passerCarried, release, releaseWeight);
  const destination = lerpPoint(receiverCarried, receive, receiveWeight);
  return {
    position: clampToWorld(lerpPoint(origin, destination, eased), worldSize),
    occludedByPlayers: isDirectionalPassInTransition(progress, transitionFraction),
  };
}

type DirectionalPassSnapshotPlayer = { id: string; x: number; y: number };
type DirectionalPassSnapshotBall = {
  id: string;
  x: number;
  y: number;
  attachedPlayerId?: string | null;
  isFree: boolean;
};
type DirectionalPassSnapshot = {
  players: readonly DirectionalPassSnapshotPlayer[];
  football: readonly DirectionalPassSnapshotBall[];
};

export type DirectionalPassParticipants = {
  passerId: string;
  receiverId: string;
  /** Passer centre at the segment start (normalized). */
  passerCentre: { x: number; y: number };
  /** Receiver centre at the segment end — where the ball arrives (normalized). */
  receiverCentre: { x: number; y: number };
};

/**
 * Whether a playback segment moves `ballId` from one player to another, and
 * if so who and where (normalized snapshot coordinates). Covers exactly the
 * two producers of a player-to-player pass in Slate:
 *
 * - a recorded holder switch between phases (attached to A → attached to B);
 * - the tap-to-pass gesture (attached to A → free, with the receiver named
 *   by `possessionReceiverId`, which only a possession-pass playback sets).
 *
 * Anything else — same holder, a loose-ball pickup, a ball released into
 * space — returns null and keeps its existing behaviour.
 */
export function resolveDirectionalPassParticipants(params: {
  fromSnapshot: DirectionalPassSnapshot;
  toSnapshot: DirectionalPassSnapshot;
  ballId: string;
  possessionReceiverId: string | null;
}): DirectionalPassParticipants | null {
  const { fromSnapshot, toSnapshot, ballId, possessionReceiverId } = params;
  const fromBall = fromSnapshot.football.find((entry) => entry.id === ballId);
  const toBall = toSnapshot.football.find((entry) => entry.id === ballId);
  if (!fromBall || !toBall) return null;
  const passerId = fromBall.isFree ? null : fromBall.attachedPlayerId ?? null;
  if (!passerId) return null;
  const targetHolderId = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
  const receiverId = targetHolderId ?? (toBall.isFree ? possessionReceiverId : null);
  if (!receiverId || receiverId === passerId) return null;
  const passer = fromSnapshot.players.find((entry) => entry.id === passerId);
  const receiver = toSnapshot.players.find((entry) => entry.id === receiverId);
  if (!passer || !receiver) return null;
  return {
    passerId,
    receiverId,
    passerCentre: { x: passer.x, y: passer.y },
    receiverCentre: { x: receiver.x, y: receiver.y },
  };
}
