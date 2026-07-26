// Shared, pure orientation maths for the tactical surfaces. Kept dependency-free
// and framework-free so it can be unit-tested without a PixiJS/WebGL context.

/** Normalizes any integer quarter-turn count into {0,1,2,3}. */
export function normalizeQuarterTurns(quarterTurns: number): 0 | 1 | 2 | 3 {
  const q = Number.isFinite(quarterTurns) ? Math.trunc(quarterTurns) : 0;
  return ((((q % 4) + 4) % 4) as 0 | 1 | 2 | 3);
}

/** Radians the world container rotates for a given quarter-turn count. */
export function quarterTurnRadians(quarterTurns: number): number {
  return normalizeQuarterTurns(quarterTurns) * (Math.PI / 2);
}

/**
 * Rotation (radians) a player token must apply to counter the world rotation so
 * its number/name badge stays upright. Landscape (0 turns) yields exactly 0.
 */
export function tokenCounterRotationRadians(quarterTurns: number): number {
  const radians = quarterTurnRadians(quarterTurns);
  // Avoid returning -0 for landscape so callers see an exact 0.
  return radians === 0 ? 0 : -radians;
}
