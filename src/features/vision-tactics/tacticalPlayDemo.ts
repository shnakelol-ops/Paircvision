import type { NormalizedPoint } from "../../movement-board/coordinates/normalization";

export type DemoRoute = {
  jerseyNumber: number;
  points: NormalizedPoint[];
};

/**
 * Forward support movement — attacking shape, 4 converging runs toward goal.
 * Positions match the attacking shape preset (x=defending end, x=100 attacking end).
 * Player 14 (FF) drives center; 11 (CHF) curves right; 13/15 diagonal cuts inward.
 */
export const DEMO_ROUTES: DemoRoute[] = [
  {
    jerseyNumber: 14,
    points: [
      { x: 85, y: 50 },
      { x: 90, y: 48 },
      { x: 95, y: 46 },
    ],
  },
  {
    jerseyNumber: 11,
    points: [
      { x: 68, y: 50 },
      { x: 72, y: 42 },
      { x: 78, y: 36 },
      { x: 84, y: 34 },
    ],
  },
  {
    jerseyNumber: 13,
    points: [
      { x: 84, y: 24 },
      { x: 87, y: 32 },
      { x: 91, y: 40 },
    ],
  },
  {
    jerseyNumber: 15,
    points: [
      { x: 84, y: 76 },
      { x: 87, y: 68 },
      { x: 91, y: 60 },
    ],
  },
];
