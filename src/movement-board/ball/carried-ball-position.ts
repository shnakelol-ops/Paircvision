import type { WorldPoint } from "../coordinates/coordinates";

export type WorldSize = { width: number; height: number };

/**
 * Candidate world-space offsets from a player's centre, tried in priority
 * order until one lands inside the pitch. Mirrors Standard Slate's
 * ATTACHED_BALL_OFFSETS_WORLD / getAttachedBallPositionForPlayer edge-aware
 * attachment (createTacticalPadLiteSurface.ts) — reproduced here rather than
 * imported/shared, since Standard Slate is frozen and must not be touched,
 * but Game Timing's carried-ball behaviour should match it exactly.
 */
export const BALL_ATTACHMENT_OFFSETS_WORLD: ReadonlyArray<Readonly<WorldPoint>> = [
  { x: 4.0, y: -3.2 },
  { x: 4.0, y: 3.2 },
  { x: -4.0, y: -3.2 },
  { x: -4.0, y: 3.2 },
  { x: 4.7, y: 0 },
  { x: -4.7, y: 0 },
];

function clampWorldValue(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

/**
 * The world position a carried/attached ball renders at for a player centred
 * at `centreWorld`: the first candidate offset that lands inside the pitch
 * bounds, or the first candidate clamped onto the pitch when every candidate
 * would otherwise fall outside it (e.g. right on a touchline).
 *
 * This single function must be used both to compute a pass's fixed
 * reception target (predicted receiver position + this offset, taken once at
 * release) and to render the steady-state carried ball after possession
 * transfer — so a pass's flight destination and the carried-ball position it
 * hands off to always agree exactly, with no visible jump on arrival.
 */
export function computeBallAttachmentPoint(centreWorld: WorldPoint, worldSize: WorldSize): WorldPoint {
  for (const offset of BALL_ATTACHMENT_OFFSETS_WORLD) {
    const candidate = { x: centreWorld.x + offset.x, y: centreWorld.y + offset.y };
    if (candidate.x >= 0 && candidate.x <= worldSize.width && candidate.y >= 0 && candidate.y <= worldSize.height) {
      return candidate;
    }
  }
  const fallbackOffset = BALL_ATTACHMENT_OFFSETS_WORLD[0] ?? { x: 6.4, y: -5.4 };
  return {
    x: clampWorldValue(centreWorld.x + fallbackOffset.x, worldSize.width),
    y: clampWorldValue(centreWorld.y + fallbackOffset.y, worldSize.height),
  };
}
