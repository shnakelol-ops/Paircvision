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

export type ViewportTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
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
 */
export function getLetterboxTransform(
  worldSize: WorldSize,
  viewportSize: ViewportSize,
): ViewportTransform {
  const worldWidth = safeDimension(worldSize.width);
  const worldHeight = safeDimension(worldSize.height);
  const viewportWidth = safeDimension(viewportSize.width);
  const viewportHeight = safeDimension(viewportSize.height);

  if (worldWidth <= 0 || worldHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }

  const margin = computeSafeMarginPx(viewportWidth, viewportHeight);
  const availWidth = Math.max(1, viewportWidth - margin * 2);
  const availHeight = Math.max(1, viewportHeight - margin * 2);
  const scale = Math.min(availWidth / worldWidth, availHeight / worldHeight);
  const offsetX = (viewportWidth - worldWidth * scale) / 2;
  const offsetY = (viewportHeight - worldHeight * scale) / 2;

  return { scale, offsetX, offsetY };
}

/**
 * Creates pure mappers for normalized(0-100), world, and viewport coordinates.
 * Flow: normalized <-> world handles pitch semantics, then world <-> viewport applies letterbox transform.
 */
export function createWorldViewport(
  worldSize: WorldSize,
  viewportSize: ViewportSize,
): WorldViewportMapper {
  const transform = getLetterboxTransform(worldSize, viewportSize);
  const scale = transform.scale;

  const toViewport = (point: WorldPoint): WorldPoint => ({
    x: point.x * scale + transform.offsetX,
    y: point.y * scale + transform.offsetY,
  });

  const toWorld = (point: WorldPoint): WorldPoint => {
    if (scale <= 0) return { x: 0, y: 0 };
    return {
      x: (point.x - transform.offsetX) / scale,
      y: (point.y - transform.offsetY) / scale,
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

