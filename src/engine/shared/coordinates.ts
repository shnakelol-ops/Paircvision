import {
  clampNormalizedPoint,
  normalizedToUnit,
  unitToNormalized,
  type NormalizedPoint,
} from "./normalization";

export type WorldSize = {
  width: number;
  height: number;
};

export type WorldPoint = {
  x: number;
  y: number;
};

function safeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Converts a normalized 0-100 pitch point into world-space coordinates.
 * Flow: normalized -> unit interval -> scaled world position.
 */
export function normalizedToWorld(point: NormalizedPoint, worldSize: WorldSize): WorldPoint {
  const width = safeDimension(worldSize.width);
  const height = safeDimension(worldSize.height);
  const clamped = clampNormalizedPoint(point);

  return {
    x: normalizedToUnit(clamped.x) * width,
    y: normalizedToUnit(clamped.y) * height,
  };
}

/**
 * Converts a world-space point into normalized 0-100 pitch coordinates.
 * Flow: world position -> unit interval -> normalized scale.
 */
export function worldToNormalized(point: WorldPoint, worldSize: WorldSize): NormalizedPoint {
  const width = safeDimension(worldSize.width);
  const height = safeDimension(worldSize.height);

  if (width <= 0 || height <= 0) {
    return { x: 50, y: 50 };
  }

  return clampNormalizedPoint({
    x: unitToNormalized(point.x / width),
    y: unitToNormalized(point.y / height),
  });
}
