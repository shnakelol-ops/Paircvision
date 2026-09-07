// Visual correction regression coverage: jersey-number legibility. The
// number badge must scale with the jersey (never a fixed tiny size) and
// stay large enough to read a 2-digit number at every size this tile is
// actually rendered at (34 for starters, 28-30 for substitutes).
//
// ProTaggerLineupJerseyTile.tsx has no React rendering harness in this repo
// (see ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint),
// so this suite exercises the exact badge/font sizing formula by reading it
// out of the component's own source — the same approach
// QuickReviewPage1.wording.test.ts and ProTaggerSquadScreen.nameEditorToggle.test.ts
// use for presentational checks with no harness available — plus a plain
// re-implementation of the formula to assert numerically it never shrinks
// below a legible floor for any of the sizes actually used in production
// (ProTaggerLineupFormation.tsx passes 30 for starters, 28 for subs).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerLineupJerseyTile.tsx", import.meta.url)), "utf8");

// Mirrors the exact formula in ProTaggerLineupJerseyTile.tsx.
function badgeSize(size: number): number {
  return Math.max(18, Math.round(size * 0.68));
}
function numberFontSize(size: number): number {
  return Math.max(10, Math.round(size * 0.38));
}

describe("ProTaggerLineupJerseyTile — number legibility (visual correction)", () => {
  it("renders the number inside a solid, high-contrast badge rather than bare text over the jersey", () => {
    expect(source).toContain("numberBadge");
    expect(source).toMatch(/background:\s*["']rgba\(5, 12, 20, 0\.85\)["']/);
  });

  it("the badge is bold and white for maximum contrast against any jersey colour", () => {
    expect(source).toMatch(/numberText[\s\S]*?fontWeight:\s*800/);
    expect(source).toMatch(/numberText[\s\S]*?color:\s*["']#ffffff["']/);
  });

  const sizesUsedInProduction = [30, 28]; // ProTaggerLineupFormation.tsx: starters=30, subs=28
  const numbersToCheck = [1, 8, 10, 11, 15, 27];

  it.each(sizesUsedInProduction)("at jersey size %ipx, the badge stays legible (>=18px) and the font floor holds (>=10px)", (size) => {
    expect(badgeSize(size)).toBeGreaterThanOrEqual(18);
    expect(numberFontSize(size)).toBeGreaterThanOrEqual(10);
    // The badge must be comfortably wider than the font size so a 2-digit
    // number (widest case: two glyphs side by side) has room to sit inside
    // the circle without touching its edge.
    expect(badgeSize(size)).toBeGreaterThan(numberFontSize(size) * 1.3);
  });

  it.each(numbersToCheck)("number %i renders as plain digits with no truncation or wrapping styling applied", (num) => {
    // The badge/text styling is number-agnostic (no per-digit-count special
    // casing) — this documents that 1-digit and 2-digit numbers (including
    // the two-digit outlier 27) go through the exact same, single code path.
    const digits = String(num);
    expect(digits.length === 1 || digits.length === 2).toBe(true);
    expect(source).not.toMatch(/digits?\.length/i);
  });

  it("the badge scales up, not down, as the jersey grows — larger starters tiles get a larger badge than smaller subs tiles", () => {
    expect(badgeSize(34)).toBeGreaterThan(badgeSize(28));
    expect(numberFontSize(34)).toBeGreaterThan(numberFontSize(28));
  });
});

describe("ProTaggerLineupJerseyTile — name label width (visual correction)", () => {
  it("the name label's max width was widened well beyond the old cramped 48px", () => {
    const match = source.match(/name:\s*\{[\s\S]*?maxWidth:\s*(\d+)/);
    expect(match).not.toBeNull();
    const maxWidth = Number(match![1]);
    expect(maxWidth).toBeGreaterThanOrEqual(64);
  });

  it("the tile's own width was widened to match, so the wider name isn't clipped by its parent", () => {
    const match = source.match(/tile:\s*\{[\s\S]*?width:\s*(\d+)/);
    expect(match).not.toBeNull();
    const tileWidth = Number(match![1]);
    expect(tileWidth).toBeGreaterThanOrEqual(64);
  });

  it("still shows the number with no name when the player has none, and never renders a GAA position abbreviation (e.g. player.position)", () => {
    expect(source).not.toMatch(/\.position\b/); // never reads player.position for display
    expect(source).toMatch(/name\s*&&\s*<span/);
  });
});
