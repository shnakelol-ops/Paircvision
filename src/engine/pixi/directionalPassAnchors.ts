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
 *   carry → short swing to the passer's perimeter facing the receiver
 *         → the existing straight flight, perimeter to perimeter
 *         → short swing from the receiver's incoming side to its carry point
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
 * Real (on-screen) duration of each of the release and receive swings, in
 * milliseconds. Deliberately short and deliberately NOT scaled by playback
 * speed: the intended read is "the ball leaves from the correct side of the
 * player", never "the ball orbits the player before the pass" — and a swing
 * that slowed down with 0.25× playback (up to ~180° round the token for a
 * pass to the side opposite the carried spot) would read exactly as an
 * orbit. Tune from real-device acceptance; changing it alters nothing but
 * how quickly the ball reaches the perimeter anchor.
 */
export const DIRECTIONAL_PASS_TRANSITION_MS = 80;

/**
 * Upper bound on each swing as a share of the pass's linear progress, so
 * the swings stay a small part of even the shortest/fastest pass.
 */
export const DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION = 0.1;

/**
 * Share of the pass's linear progress spent on each of the release and
 * receive swings for a pass segment lasting `segmentDurationMs` of real
 * time (already divided by the playback speed multiplier).
 */
export function resolveDirectionalPassTransitionFraction(segmentDurationMs: number): number {
  if (!Number.isFinite(segmentDurationMs) || segmentDurationMs <= 0) return DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION;
  return Math.min(DIRECTIONAL_PASS_MAX_TRANSITION_FRACTION, DIRECTIONAL_PASS_TRANSITION_MS / segmentDurationMs);
}

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

/**
 * Point between `from` and `to` around `centre`, interpolated in polar
 * coordinates (angle the short way round, radius linearly). Keeps a swing on
 * or near the token's perimeter instead of cutting through the token. The
 * exact-180° tie goes anticlockwise in screen space (negative delta), which
 * is deterministic.
 */
function swingAroundCentre(
  centre: DirectionalPassWorldPoint,
  from: DirectionalPassWorldPoint,
  to: DirectionalPassWorldPoint,
  weight: number,
): DirectionalPassWorldPoint {
  const w = clamp01(weight);
  if (w <= 0) return { x: from.x, y: from.y };
  if (w >= 1) return { x: to.x, y: to.y };
  const fromDx = from.x - centre.x;
  const fromDy = from.y - centre.y;
  const toDx = to.x - centre.x;
  const toDy = to.y - centre.y;
  const fromRadius = Math.hypot(fromDx, fromDy);
  const toRadius = Math.hypot(toDx, toDy);
  if (fromRadius <= 1e-9 || toRadius <= 1e-9) {
    return { x: from.x + (to.x - from.x) * w, y: from.y + (to.y - from.y) * w };
  }
  const fromAngle = Math.atan2(fromDy, fromDx);
  let delta = Math.atan2(toDy, toDx) - fromAngle;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  if (Math.abs(delta - Math.PI) < 1e-9) delta = -Math.PI;
  const angle = fromAngle + delta * w;
  const radius = fromRadius + (toRadius - fromRadius) * w;
  return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
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
 * The ball's world position during a player-to-player pass.
 *
 * - `progress` is the segment's linear elapsed/duration ratio — it times the
 *   release/receive swings (each lasts `transitionFraction` of the pass).
 * - `easedProgress` is the existing flight easing value the legacy lerp
 *   already used — the flight's timing curve is unchanged.
 *
 * ball = lerp(origin, destination, easedProgress), where origin swings from
 * the passer's carried point to the release anchor during the first window
 * and destination swings from the receive anchor to the receiver's carried
 * point during the last. Exactly `passerCarried` at progress 0 and exactly
 * `receiverCarried` at progress 1; identical to the legacy straight lerp
 * when no anchors apply.
 */
export function computeDirectionalPassBallWorldPosition(params: {
  passerCentre: DirectionalPassWorldPoint;
  receiverCentre: DirectionalPassWorldPoint;
  passerCarried: DirectionalPassWorldPoint;
  receiverCarried: DirectionalPassWorldPoint;
  anchorRadius: number;
  progress: number;
  easedProgress: number;
  worldSize: DirectionalPassWorldSize;
  /** Share of progress per swing — see resolveDirectionalPassTransitionFraction. */
  transitionFraction: number;
}): DirectionalPassWorldPoint {
  const { passerCentre, receiverCentre, passerCarried, receiverCarried, worldSize } = params;
  const progress = clamp01(params.progress);
  const eased = clamp01(params.easedProgress);
  if (progress <= 0) return { x: passerCarried.x, y: passerCarried.y };
  if (progress >= 1) return { x: receiverCarried.x, y: receiverCarried.y };

  const anchors = computeDirectionalPassAnchors({
    passerCentre,
    receiverCentre,
    anchorRadius: params.anchorRadius,
  });
  if (!anchors) {
    return clampToWorld(
      {
        x: passerCarried.x + (receiverCarried.x - passerCarried.x) * eased,
        y: passerCarried.y + (receiverCarried.y - passerCarried.y) * eased,
      },
      worldSize,
    );
  }

  const window = Math.max(1e-6, Math.min(0.5, params.transitionFraction));
  const releaseWeight = smoothstep01(progress / window);
  const receiveWeight = 1 - smoothstep01((progress - (1 - window)) / window);
  const origin = swingAroundCentre(passerCentre, passerCarried, anchors.release, releaseWeight * anchors.strength);
  const destination = swingAroundCentre(receiverCentre, receiverCarried, anchors.receive, receiveWeight * anchors.strength);
  return clampToWorld(
    {
      x: origin.x + (destination.x - origin.x) * eased,
      y: origin.y + (destination.y - origin.y) * eased,
    },
    worldSize,
  );
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
