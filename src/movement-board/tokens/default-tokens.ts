import type { MovementBoardToken } from "../shell/types";

// Standard Gaelic Games 15-a-side starting positions (home side, left defends right attacks).
// Coordinates are in normalised pitch space [0,100]. Matches GAELIC_FORMATION_BASE
// in TacticalPlaySurface.tsx — keep both in sync if positions are ever adjusted.
const GAELIC_HOME_POSITIONS: ReadonlyArray<{ number: number; x: number; y: number }> = [
  { number: 1,  x: 8,  y: 50 },  // Goalkeeper
  { number: 2,  x: 20, y: 22 },  // Right corner-back
  { number: 3,  x: 20, y: 50 },  // Full-back
  { number: 4,  x: 20, y: 78 },  // Left corner-back
  { number: 5,  x: 34, y: 18 },  // Right half-back
  { number: 6,  x: 34, y: 50 },  // Centre half-back
  { number: 7,  x: 34, y: 82 },  // Left half-back
  { number: 8,  x: 48, y: 38 },  // Midfield
  { number: 9,  x: 48, y: 62 },  // Midfield
  { number: 10, x: 62, y: 18 },  // Right half-forward
  { number: 11, x: 62, y: 50 },  // Centre half-forward
  { number: 12, x: 62, y: 82 },  // Left half-forward
  { number: 13, x: 78, y: 25 },  // Right corner-forward
  { number: 14, x: 78, y: 50 },  // Full-forward
  { number: 15, x: 78, y: 75 },  // Left corner-forward
];

export function buildDefaultTokens(): MovementBoardToken[] {
  return GAELIC_HOME_POSITIONS.map((pos) => ({
    id: `setup-token-${pos.number}`,
    number: pos.number,
    color: pos.number === 1 ? "yellow" : "red",
    position: { x: pos.x, y: pos.y },
  }));
}
