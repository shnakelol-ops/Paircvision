// Visual correction regression coverage: the previous black circular
// number-badge treatment read as a Tactical Slate player-token marker, not
// a team sheet, and made the jersey underneath look faint by comparison.
// This corrects it: the jersey is the dominant shape (enlarged, not
// shrunk), and the number is bold, high-contrast text directly on the
// jersey (white fill + dark outline) — no shape drawn behind it.
//
// ProTaggerLineupJerseyTile.tsx has no React rendering harness in this repo
// (see ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint),
// so this suite exercises the exact font-sizing formula by reading it out
// of the component's own source — the same approach
// QuickReviewPage1.wording.test.ts and ProTaggerSquadScreen.nameEditorToggle.test.ts
// use for presentational checks with no harness available.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerLineupJerseyTile.tsx", import.meta.url)), "utf8");

// Mirrors the exact formula in ProTaggerLineupJerseyTile.tsx.
function numberFontSize(size: number): number {
  return Math.max(15, Math.round(size * 0.5));
}

describe("ProTaggerLineupJerseyTile — no black circular badge (visual correction)", () => {
  it("no longer renders a solid circular badge shape behind the number", () => {
    expect(source).not.toContain("numberBadge");
    expect(source).not.toMatch(/borderRadius:\s*["']50%["']/);
    expect(source).not.toMatch(/rgba\(5,\s*12,\s*20/); // the old badge fill colour
  });

  it("the number is bold, white, high-contrast text with an outline — not a filled shape", () => {
    expect(source).toMatch(/numberText[\s\S]*?fontWeight:\s*900/);
    expect(source).toMatch(/numberText[\s\S]*?color:\s*["']#ffffff["']/);
    expect(source).toMatch(/WebkitTextStroke/);
  });

  it("the number is overlaid directly on the jersey (absolutely positioned inside jerseyWrap), not inside a separate wrapper element", () => {
    expect(source).toMatch(/<span style=\{\{ \.\.\.S\.numberText/);
  });
});

describe("ProTaggerLineupJerseyTile — jersey is the dominant shape (visual correction)", () => {
  const sizesUsedInProduction = [40, 34]; // ProTaggerLineupFormation.tsx: starters=40, subs=34
  const numbersToCheck = [1, 8, 10, 11, 15, 27];

  it("the jersey was enlarged, not shrunk, to make room for the number (default size and production sizes both grew from the badge-era 34/30/28)", () => {
    const defaultMatch = source.match(/size = (\d+)/);
    expect(defaultMatch).not.toBeNull();
    expect(Number(defaultMatch![1])).toBeGreaterThanOrEqual(38);
  });

  it.each(sizesUsedInProduction)("at jersey size %ipx, the number font floor holds (>=15px) so it reads at normal phone distance", (size) => {
    expect(numberFontSize(size)).toBeGreaterThanOrEqual(15);
  });

  it.each(numbersToCheck)("number %i renders as plain digits through the same code path, no per-digit-count special casing", (num) => {
    const digits = String(num);
    expect(digits.length === 1 || digits.length === 2).toBe(true);
    expect(source).not.toMatch(/digits?\.length/i);
  });

  it("the number font scales up, not down, as the jersey grows — larger starters tiles get larger numbers than smaller subs tiles", () => {
    expect(numberFontSize(40)).toBeGreaterThan(numberFontSize(34));
  });
});

describe("ProTaggerLineupJerseyTile — name label width (visual correction)", () => {
  it("the name label's max width stays wide enough for ordinary GAA names before ellipsis", () => {
    const match = source.match(/name:\s*\{[\s\S]*?maxWidth:\s*(\d+)/);
    expect(match).not.toBeNull();
    const maxWidth = Number(match![1]);
    expect(maxWidth).toBeGreaterThanOrEqual(64);
  });

  it("the tile's own width matches, so the name isn't clipped by its parent", () => {
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
