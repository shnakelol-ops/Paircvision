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
 *   carry → [release leg] → passer's edge facing the receiver → the
 *   existing straight flight, edge to edge → receiver's incoming edge →
 *   [receive leg] → carry
 *
 * Each leg adapts to how far the ball has to turn round its player (the
 * angle at the player's centre between the carried spot and the edge):
 *
 * - a small turn (up to 75°) takes the short direct way along the token's perimeter —
 *   no detour toward the centre, never beneath the token;
 * - a large or opposite turn (135° and beyond) takes the straight line in behind the token
 *   and out the other side, rendered beneath the player layer so the token
 *   itself hides the turn instead of the ball visibly orbiting the token;
 * - in between, the two paths blend continuously (no visual step at any
 *   angle).
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
 * Turn angle (at the player's centre) up to which a release/receive leg
 * stays entirely on the perimeter — the short direct move.
 */
export const DIRECTIONAL_PASS_PERIMETER_MAX_TURN_RADIANS = (75 * Math.PI) / 180;

/**
 * Turn angle from which a leg is the full inward line behind the token.
 * Between this and DIRECTIONAL_PASS_PERIMETER_MAX_TURN_RADIANS the two
 * paths blend smoothly.
 */
export const DIRECTIONAL_PASS_INWARD_MIN_TURN_RADIANS = (135 * Math.PI) / 180;

/**
 * A leg renders beneath the player tokens only if its path actually dips
 * this far (world units) inside the radius it starts/ends at — i.e. when
 * the ball genuinely goes in behind the token, not for a perimeter move.
 */
export const DIRECTIONAL_PASS_OCCLUSION_DEPTH_WORLD = 0.75;

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

/** Signed shortest angle from `from` to `to` around `centre`, in (−π, π]. */
function turnAngle(
  centre: DirectionalPassWorldPoint,
  from: DirectionalPassWorldPoint,
  to: DirectionalPassWorldPoint,
): number {
  let delta =
    Math.atan2(to.y - centre.y, to.x - centre.x) - Math.atan2(from.y - centre.y, from.x - centre.x);
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  return delta;
}

/**
 * A release/receive leg around one player: from `from` to `to` (both near
 * the token perimeter). Small turns follow the perimeter (angle and radius
 * interpolated); large turns take the straight line in behind the token;
 * the two blend smoothly in between.
 */
export type DirectionalPassLeg = {
  centre: DirectionalPassWorldPoint;
  from: DirectionalPassWorldPoint;
  to: DirectionalPassWorldPoint;
  /** Signed turn at the centre, (−π, π]. */
  turn: number;
  /** 0 = pure perimeter move, 1 = pure inward line. */
  inwardBlend: number;
  /** True when the path goes in behind the token (render beneath players). */
  occluded: boolean;
};

export function resolveDirectionalPassInwardBlend(turnRadians: number): number {
  const turn = Math.abs(turnRadians);
  const span = DIRECTIONAL_PASS_INWARD_MIN_TURN_RADIANS - DIRECTIONAL_PASS_PERIMETER_MAX_TURN_RADIANS;
  return smoothstep01((turn - DIRECTIONAL_PASS_PERIMETER_MAX_TURN_RADIANS) / span);
}

export function sampleDirectionalPassLeg(leg: DirectionalPassLeg, weight: number): DirectionalPassWorldPoint {
  const w = clamp01(weight);
  if (w <= 0) return { x: leg.from.x, y: leg.from.y };
  if (w >= 1) return { x: leg.to.x, y: leg.to.y };
  const inward = lerpPoint(leg.from, leg.to, w);
  if (leg.inwardBlend >= 1) return inward;
  const fromRadius = Math.hypot(leg.from.x - leg.centre.x, leg.from.y - leg.centre.y);
  const toRadius = Math.hypot(leg.to.x - leg.centre.x, leg.to.y - leg.centre.y);
  if (fromRadius <= 1e-9 || toRadius <= 1e-9) return inward;
  const angle = Math.atan2(leg.from.y - leg.centre.y, leg.from.x - leg.centre.x) + leg.turn * w;
  const radius = fromRadius + (toRadius - fromRadius) * w;
  const perimeter = { x: leg.centre.x + Math.cos(angle) * radius, y: leg.centre.y + Math.sin(angle) * radius };
  return lerpPoint(perimeter, inward, leg.inwardBlend);
}

export function resolveDirectionalPassLeg(
  centre: DirectionalPassWorldPoint,
  from: DirectionalPassWorldPoint,
  to: DirectionalPassWorldPoint,
): DirectionalPassLeg {
  const turn = turnAngle(centre, from, to);
  const leg: DirectionalPassLeg = {
    centre,
    from,
    to,
    turn,
    inwardBlend: resolveDirectionalPassInwardBlend(turn),
    occluded: false,
  };
  // Occlude only when the path genuinely goes in behind the token: its
  // midpoint (the deepest point of either path shape) sits clearly inside
  // the radius the leg starts and ends at.
  const mid = sampleDirectionalPassLeg(leg, 0.5);
  const midRadius = Math.hypot(mid.x - centre.x, mid.y - centre.y);
  const endRadius = Math.min(
    Math.hypot(from.x - centre.x, from.y - centre.y),
    Math.hypot(to.x - centre.x, to.y - centre.y),
  );
  leg.occluded = midRadius < endRadius - DIRECTIONAL_PASS_OCCLUSION_DEPTH_WORLD;
  return leg;
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
   * True only while the ball is on a release/receive leg that goes in
   * behind the token (a large turn) — render it beneath the player tokens
   * so the passer/receiver occludes it. False for perimeter legs, mid-flight
   * and at both ends of the pass.
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
 * ball = lerp(origin, destination, easedProgress), where origin follows the
 * release leg (passer's carried point → release edge) during the first
 * window and destination follows the receive leg (receive edge →
 * receiver's carried point) during the last — see resolveDirectionalPassLeg. Exactly `passerCarried` at
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
  const releaseLeg = resolveDirectionalPassLeg(passerCentre, passerCarried, release);
  // Walked backwards in time: at receiveWeight 1 the ball is on the receive
  // edge, at 0 on the receiver's carried point.
  const receiveLeg = resolveDirectionalPassLeg(receiverCentre, receiverCarried, receive);
  const origin = sampleDirectionalPassLeg(releaseLeg, releaseWeight);
  const destination = sampleDirectionalPassLeg(receiveLeg, receiveWeight);
  const inTransition = isDirectionalPassInTransition(progress, transitionFraction);
  const inReleaseWindow = inTransition && progress < 0.5;
  return {
    position: clampToWorld(lerpPoint(origin, destination, eased), worldSize),
    occludedByPlayers: inTransition && (inReleaseWindow ? releaseLeg.occluded : receiveLeg.occluded),
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
