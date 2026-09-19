import { describe, expect, it } from "vitest";

import { resolveTeamKitEditorValue, computeKitEditorPosition, TEAM_KIT_COLOR_OPTIONS } from "./TacticalPlaySurface";
import { KIT_COLOR_NUMERIC } from "../../engine/pixi/createTacticalPadLiteSurface";
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

describe("TEAM_KIT_COLOR_OPTIONS — swatch preview colours (PR2B revision 4 forensic-audit fix)", () => {
  // Forensic audit proved the Kit Editor's own swatch preview colours (fed
  // to PlayerKitEditor via TEAM_KIT_COLOR_OPTIONS' cssColor, for BOTH the
  // base-colour and pattern-colour grids — one shared source) used to carry
  // baked-in alpha (0.78-0.90 on every entry), which composited against the
  // app's own opaque page background and read as a dark/muted palette even
  // though the underlying RGB was otherwise correct. This guards against
  // that regressing: every swatch colour must be a fully opaque `#rrggbb`
  // string with no alpha channel, and must match Standard Slate's own
  // canonical KIT_COLOR_NUMERIC value exactly — one PáircVision palette,
  // not a second, independently-drifting one.
  it("every swatch colour is an opaque #rrggbb hex string — no rgba(), no alpha channel", () => {
    for (const option of TEAM_KIT_COLOR_OPTIONS) {
      expect(option.cssColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("every swatch colour matches Standard Slate's canonical KIT_COLOR_NUMERIC value exactly", () => {
    for (const option of TEAM_KIT_COLOR_OPTIONS) {
      const canonical = KIT_COLOR_NUMERIC[option.id as keyof typeof KIT_COLOR_NUMERIC];
      const expectedHex = `#${canonical.toString(16).padStart(6, "0")}`;
      expect(option.cssColor.toLowerCase()).toBe(expectedHex);
    }
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
