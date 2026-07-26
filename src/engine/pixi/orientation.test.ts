import { describe, expect, it } from "vitest";

import {
  normalizeQuarterTurns,
  quarterTurnRadians,
  tokenCounterRotationRadians,
} from "./orientation";

describe("orientation maths", () => {
  it("normalizes any integer quarter-turn into {0,1,2,3}", () => {
    expect(normalizeQuarterTurns(0)).toBe(0);
    expect(normalizeQuarterTurns(1)).toBe(1);
    expect(normalizeQuarterTurns(4)).toBe(0);
    expect(normalizeQuarterTurns(-1)).toBe(3);
    expect(normalizeQuarterTurns(7)).toBe(3);
    expect(normalizeQuarterTurns(Number.NaN)).toBe(0);
  });

  it("landscape (0 turns) has zero world rotation and zero token counter-rotation", () => {
    expect(quarterTurnRadians(0)).toBe(0);
    expect(tokenCounterRotationRadians(0)).toBe(0);
  });

  it("portrait (1 clockwise turn) rotates the world +90deg and counter-rotates tokens -90deg", () => {
    expect(quarterTurnRadians(1)).toBeCloseTo(Math.PI / 2, 12);
    // Tokens must exactly negate the world rotation so numbers stay upright.
    expect(tokenCounterRotationRadians(1)).toBeCloseTo(-Math.PI / 2, 12);
    expect(quarterTurnRadians(1) + tokenCounterRotationRadians(1)).toBe(0);
  });

  it("returning to landscape restores exactly zero token rotation", () => {
    // Emulate a portrait -> landscape -> portrait -> landscape sequence.
    const sequence = [0, 1, 0, 1, 0];
    const rotations = sequence.map(tokenCounterRotationRadians);
    expect(rotations[0]).toBe(0);
    expect(rotations[2]).toBe(0);
    expect(rotations[4]).toBe(0);
    // No drift/accumulation across repeated switches.
    expect(rotations[1]).toBe(rotations[3]);
  });
});
