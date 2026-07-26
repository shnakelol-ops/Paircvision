import {
  normalizedToWorld,
  worldToNormalized,
  type WorldPoint,
  type WorldSize,
} from "./coordinates";
import { type NormalizedPoint } from "./normalization";

export type ViewportSize = {
  width: number;
  height: number;
};

/**
 * Number of 90-degree clockwise turns applied to the world before it is fit
 * into the viewport. 0 = landscape (unchanged legacy behaviour). 1 and 3 are
 * the two portrait (end-line) orientations; 2 is a 180-degree flip. Any integer
 * is accepted and normalized into {0,1,2,3}.
 */
export type QuarterTurns = 0 | 1 | 2 | 3;

export type ViewportTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Normalized quarter-turn count in {0,1,2,3}. 0 preserves legacy landscape. */
  quarterTurns: QuarterTurns;
};

export type WorldViewportMapper = {
  readonly worldSize: WorldSize;
  readonly viewportSize: ViewportSize;
  readonly transform: ViewportTransform;
  normalizedToWorld: (point: NormalizedPoint) => WorldPoint;
  worldToNormalized: (point: WorldPoint) => NormalizedPoint;
  worldToViewport: (point: WorldPoint) => WorldPoint;
  viewportToWorld: (point: WorldPoint) => WorldPoint;
  normalizedToViewport: (point: NormalizedPoint) => WorldPoint;
  viewportToNormalized: (point: WorldPoint) => NormalizedPoint;
};

function safeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Normalizes any integer turn count into the {0,1,2,3} range. */
export function normalizeQuarterTurns(quarterTurns: number): QuarterTurns {
  const q = Number.isFinite(quarterTurns) ? Math.trunc(quarterTurns) : 0;
  return (((q % 4) + 4) % 4) as QuarterTurns;
}

/** Radians the rotated world container turns for a given quarter-turn count. */
export function quarterTurnRadians(quarterTurns: number): number {
  return normalizeQuarterTurns(quarterTurns) * (Math.PI / 2);
}

/**
 * Rotation (radians) a presentation element (token, item, label, ball) must
 * apply to counter the world container rotation so it stays upright. Exactly 0
 * in landscape (0 turns) so nothing is touched there.
 */
export function quarterTurnCounterRotationRadians(quarterTurns: number): number {
  const radians = quarterTurnRadians(quarterTurns);
  return radians === 0 ? 0 : -radians;
}

/**
 * Rotates a centre-relative delta by a quarter turn using pure axis swaps and
 * sign flips (no trigonometry, so quarter turns are exact and lossless).
 * Convention: q counts clockwise turns in a y-down (screen) coordinate frame.
 */
function rotateQuarter(point: WorldPoint, quarterTurns: QuarterTurns): WorldPoint {
  switch (quarterTurns) {
    case 1:
      return { x: -point.y, y: point.x };
    case 2:
      return { x: -point.x, y: -point.y };
    case 3:
      return { x: point.y, y: -point.x };
    case 0:
    default:
      return { x: point.x, y: point.y };
  }
}

// Shared viewport-fit rule: keep this formula identical to the copies in
// core/coordinates/pitch-coordinates.ts and engine/pixi/createWorldViewport.ts.
const PITCH_SAFE_MARGIN_RATIO = 0.03;
const PITCH_SAFE_MARGIN_MIN_PX = 8;
const PITCH_SAFE_MARGIN_MAX_PX = 24;

function computeSafeMarginPx(viewportWidth: number, viewportHeight: number): number {
  const minSide = Math.min(viewportWidth, viewportHeight);
  return Math.min(
    PITCH_SAFE_MARGIN_MAX_PX,
    Math.max(PITCH_SAFE_MARGIN_MIN_PX, minSide * PITCH_SAFE_MARGIN_RATIO),
  );
}

/**
 * Computes a letterbox fit so the full world is visible in the viewport,
 * inset by a small safe margin so it never touches the host edge.
 * Offsets center the scaled world in whichever axis has spare room.
 *
 * When quarterTurns is 1 or 3 the world is rotated a quarter turn about its
 * centre first, so the fit is computed against the swapped (portrait) extents.
 * quarterTurns = 0 (the default) reproduces the legacy landscape transform
 * exactly.
 */
export function getLetterboxTransform(
  worldSize: WorldSize,
  viewportSize: ViewportSize,
  quarterTurns: number = 0,
): ViewportTransform {
  const turns = normalizeQuarterTurns(quarterTurns);
  const worldWidth = safeDimension(worldSize.width);
  const worldHeight = safeDimension(worldSize.height);
  const viewportWidth = safeDimension(viewportSize.width);
  const viewportHeight = safeDimension(viewportSize.height);

  if (worldWidth <= 0 || worldHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0, quarterTurns: turns };
  }

  // Odd quarter turns swap the world's footprint (landscape <-> portrait).
  const isQuarter = turns === 1 || turns === 3;
  const rotatedWidth = isQuarter ? worldHeight : worldWidth;
  const rotatedHeight = isQuarter ? worldWidth : worldHeight;

  const margin = computeSafeMarginPx(viewportWidth, viewportHeight);
  const availWidth = Math.max(1, viewportWidth - margin * 2);
  const availHeight = Math.max(1, viewportHeight - margin * 2);
  const scale = Math.min(availWidth / rotatedWidth, availHeight / rotatedHeight);
  const offsetX = (viewportWidth - rotatedWidth * scale) / 2;
  const offsetY = (viewportHeight - rotatedHeight * scale) / 2;

  return { scale, offsetX, offsetY, quarterTurns: turns };
}

/**
 * Creates pure mappers for normalized(0-100), world, and viewport coordinates.
 * Flow: normalized <-> world handles pitch semantics, then world <-> viewport
 * applies a rotate-about-centre + letterbox transform.
 *
 * The world is rotated about its own centre (worldWidth/2, worldHeight/2) — for
 * the canonical 160x100 pitch this is (80, 50) — before scaling into the
 * viewport. quarterTurns defaults to 0, which is byte-for-byte identical to the
 * legacy landscape transform. Forward and inverse share one transform, so
 * world -> viewport -> world round-trips exactly in every orientation.
 */
export function createWorldViewport(
  worldSize: WorldSize,
  viewportSize: ViewportSize,
  quarterTurns: number = 0,
): WorldViewportMapper {
  const transform = getLetterboxTransform(worldSize, viewportSize, quarterTurns);
  const { scale, offsetX, offsetY } = transform;
  const turns = transform.quarterTurns;
  const inverseTurns = normalizeQuarterTurns(4 - turns);

  // World centre to rotate about; (80, 50) for the canonical 160x100 pitch.
  const centreX = safeDimension(worldSize.width) / 2;
  const centreY = safeDimension(worldSize.height) / 2;

  // Half-extents of the rotated footprint, used to re-centre after rotation.
  const isQuarter = turns === 1 || turns === 3;
  const rotatedHalfWidth = (isQuarter ? safeDimension(worldSize.height) : safeDimension(worldSize.width)) / 2;
  const rotatedHalfHeight = (isQuarter ? safeDimension(worldSize.width) : safeDimension(worldSize.height)) / 2;
  const originX = rotatedHalfWidth * scale + offsetX;
  const originY = rotatedHalfHeight * scale + offsetY;

  const toViewport = (point: WorldPoint): WorldPoint => {
    // Landscape fast path: byte-for-byte the legacy arithmetic, so the existing
    // production surfaces see identical mapped coordinates (no ULP drift).
    if (turns === 0) {
      return {
        x: point.x * scale + offsetX,
        y: point.y * scale + offsetY,
      };
    }
    const rotated = rotateQuarter({ x: point.x - centreX, y: point.y - centreY }, turns);
    return {
      x: rotated.x * scale + originX,
      y: rotated.y * scale + originY,
    };
  };

  const toWorld = (point: WorldPoint): WorldPoint => {
    if (scale <= 0) return { x: 0, y: 0 };
    // Landscape fast path: byte-for-byte the legacy inverse arithmetic.
    if (turns === 0) {
      return {
        x: (point.x - offsetX) / scale,
        y: (point.y - offsetY) / scale,
      };
    }
    const rotated = { x: (point.x - originX) / scale, y: (point.y - originY) / scale };
    const unrotated = rotateQuarter(rotated, inverseTurns);
    return {
      x: unrotated.x + centreX,
      y: unrotated.y + centreY,
    };
  };

  return {
    worldSize,
    viewportSize,
    transform,
    normalizedToWorld: (point) => normalizedToWorld(point, worldSize),
    worldToNormalized: (point) => worldToNormalized(point, worldSize),
    worldToViewport: toViewport,
    viewportToWorld: toWorld,
    normalizedToViewport: (point) => toViewport(normalizedToWorld(point, worldSize)),
    viewportToNormalized: (point) => worldToNormalized(toWorld(point), worldSize),
  };
}
