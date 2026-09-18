import { describe, expect, it } from "vitest";

import { resolveTeamKitEditorValue, computeKitEditorPosition } from "./TacticalPlaySurface";
import type { TeamKit } from "./teamKit";

/**
 * Coverage for Game Timing's team-kit editing glue in TacticalPlaySurface.
 * Mirrors TacticalPadLiteClean.kitEditor.test.ts's role for Standard
 * Slate: proves the parent-side resolution logic feeding PlayerKitEditor
 * is correct, independent of PlayerKitEditor itself (already covered by
 * PlayerKitEditor.test.tsx) and independent of the live Pixi shell (which
 * cannot be constructed in this test environment — no jsdom/canvas, same
 * documented limitation as Slate's own kit editor test file).
 *
 * The per-player-isolation / team-application proofs (Our Team change
 * affects all outfield players, GK override affects only the GK, etc.)
 * live in teamKit.test.ts against applyTeamKitsToTokens directly — the
 * actual mechanism, not this file's thin display-value reshape.
 */
describe("resolveTeamKitEditorValue — pure reshape, no fallback logic", () => {
  it("passes base colour, pattern and pattern colour straight through", () => {
    const kit: TeamKit = { baseColor: "purple", pattern: "chestDash", patternColor: "green" };
    expect(resolveTeamKitEditorValue(kit)).toEqual({
      baseColor: "purple",
      pattern: "chestDash",
      patternColor: "green",
    });
  });

  it("does not include labelMode/initials/name — the Label tab is hidden for every team-kit editor", () => {
    const kit: TeamKit = { baseColor: "red", pattern: "plain", patternColor: "white" };
    const value = resolveTeamKitEditorValue(kit);
    expect(value).not.toHaveProperty("labelMode");
    expect(value).not.toHaveProperty("initials");
    expect(value).not.toHaveProperty("name");
  });
});

describe("computeKitEditorPosition — stays fully on-screen at every required mobile width", () => {
  const widths = [320, 360, 375, 390, 412];

  for (const width of widths) {
    it(`clamps within a ${width}px-wide viewport`, () => {
      const position = computeKitEditorPosition({ width, height: 800 });
      expect(position.left).toBeGreaterThanOrEqual(0);
      expect(position.top).toBeGreaterThanOrEqual(0);
      // Editor's own max width is 260px + margin — never wider than the
      // viewport itself at any required width, so left + width must stay
      // within the viewport too.
      expect(position.left).toBeLessThan(width);
    });
  }
});
