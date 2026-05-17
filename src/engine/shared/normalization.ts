export const NORMALIZED_MIN = 0;
export const NORMALIZED_MAX = 100;
export const NORMALIZED_CENTER = 50;

const NORMALIZED_SPAN = NORMALIZED_MAX - NORMALIZED_MIN;

export type NormalizedScalar = number;

export type NormalizedPoint = {
  x: NormalizedScalar;
  y: NormalizedScalar;
};

export function clampNormalized(value: number): NormalizedScalar {
  if (!Number.isFinite(value)) return NORMALIZED_CENTER;
  if (value < NORMALIZED_MIN) return NORMALIZED_MIN;
  if (value > NORMALIZED_MAX) return NORMALIZED_MAX;
  return value;
}

export function clampNormalizedPoint(point: { x: number; y: number }): NormalizedPoint {
  return {
    x: clampNormalized(point.x),
    y: clampNormalized(point.y),
  };
}

export function normalizedToUnit(value: number): number {
  return (clampNormalized(value) - NORMALIZED_MIN) / NORMALIZED_SPAN;
}

export function unitToNormalized(value: number): NormalizedScalar {
  if (!Number.isFinite(value)) return NORMALIZED_CENTER;
  return clampNormalized(value * NORMALIZED_SPAN + NORMALIZED_MIN);
}
