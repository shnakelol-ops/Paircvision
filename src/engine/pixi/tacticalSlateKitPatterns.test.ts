import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";

import { FULL_VISION_PATTERNS } from "../../components/player-kit/playerKitPatterns";
import { sanitizeKitPattern, type TacticalKitPattern } from "./createTacticalPadLiteSurface";
import {
  resolvePlayerTokenRenderer,
  sanitizePlayerTokenStyle,
  toLegacyKitPattern,
  type PlayerTokenStyle,
} from "./playerTokenRenderer";

/**
 * Tactical Slate kit-pattern parity with Tactical Sequence: Slate's pattern
 * sanitizer (the single gate for saved boards, kit patches and team kits)
 * must accept exactly the six patterns Sequence offers, and keep accepting
 * every pattern older saved Slate boards could contain.
 */
describe("Tactical Slate kit patterns — sanitizer", () => {
  it("accepts all six Tactical Sequence patterns", () => {
    for (const pattern of FULL_VISION_PATTERNS) {
      expect(sanitizeKitPattern(pattern)).toBe(pattern);
    }
  });

  it("still accepts the four legacy patterns from existing saved boards", () => {
    for (const pattern of ["plain", "hoops", "stripes", "slash"] as const) {
      expect(sanitizeKitPattern(pattern)).toBe(pattern);
    }
  });

  it("rejects unknown or malformed values so they fall back to the team kit", () => {
    expect(sanitizeKitPattern(undefined)).toBeUndefined();
    expect(sanitizeKitPattern("torso" as TacticalKitPattern)).toBeUndefined();
    expect(sanitizeKitPattern("ChestDash" as TacticalKitPattern)).toBeUndefined();
    expect(sanitizeKitPattern(42 as unknown as TacticalKitPattern)).toBeUndefined();
  });
});

describe("Tactical Slate kit patterns — renderers", () => {
  it("legacy token styles receive plain for Chest Dash / Gradient and the original pattern otherwise", () => {
    expect(toLegacyKitPattern("chestDash")).toBe("plain");
    expect(toLegacyKitPattern("gradient")).toBe("plain");
    for (const pattern of ["plain", "hoops", "stripes", "slash"] as const) {
      expect(toLegacyKitPattern(pattern)).toBe(pattern);
    }
  });

  // "premium" (Heroicon) and "pill-under" measure text via the DOM, which
  // this node test environment lacks; they share toLegacyKitPattern above.
  const styles: PlayerTokenStyle[] = ["vision-v3", "classic", "pixi", "phosphor"];
  for (const style of styles) {
    it(`${style} renders every one of the six patterns without throwing`, () => {
      const render = resolvePlayerTokenRenderer(sanitizePlayerTokenStyle(style));
      for (const kitPattern of FULL_VISION_PATTERNS) {
        const { token } = render({
          label: "7",
          number: 7,
          teamColor: "blue",
          scale: 0.8,
          radius: 3.28,
          style: { primaryColor: 0x2563eb, secondaryColor: 0x2563eb, badgeColor: 0x2563eb },
          kitPattern,
          kitPatternColor: 0xffffff,
        });
        expect(token).toBeInstanceOf(Container);
      }
    });
  }
});
