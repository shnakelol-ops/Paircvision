// Visual correction regression coverage: the previous black circular
// number-badge treatment read as a Tactical Slate player-token marker, not
// a team sheet, and made the jersey underneath look faint by comparison.
// This corrects it: the jersey is the dominant shape, and the number is
// bold, high-contrast text directly on the jersey (white fill + dark
// outline) — no shape drawn behind it.
//
// A MATCHDAY PITCH visual polish pass then added a neutral drop-shadow halo
// behind the jersey silhouette (contrast against the pitch), and quietened
// the pitch background itself.
//
// A final player-tile tuning pass shrank the jersey/number again so the
// jersey now reads as a small positional/team-colour indicator rather than
// the dominant graphic (Gaelic Tracker's approach), with the number now
// shrinking PROPORTIONALLY alongside the jersey (not held at a fixed prior
// size, unlike the earlier tuning pass), and gave present names a compact
// PáircVision name plate (Team Tally's "controlled contrast surface"
// principle, in PáircVision's own restrained styling — no card, no border,
// no glow). A blank name still renders no plate at all.
//
// ProTaggerLineupJerseyTile.tsx has no React rendering harness in this repo
// (see ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint),
// so this suite exercises the exact font-sizing formula/overrides and style
// object contents by reading them out of the components' own source — the
// same approach QuickReviewPage1.wording.test.ts and
// ProTaggerSquadScreen.nameEditorToggle.test.ts use for presentational
// checks with no harness available.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tileSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupJerseyTile.tsx", import.meta.url)), "utf8");
const formationSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupFormation.tsx", import.meta.url)), "utf8");

function readConst(source: string, name: string): number {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  expect(match, `expected to find ${name} in source`).not.toBeNull();
  return Number(match![1]);
}

describe("ProTaggerLineupJerseyTile — no black circular badge (visual correction)", () => {
  it("no longer renders a solid circular badge shape behind the number", () => {
    expect(tileSource).not.toContain("numberBadge");
    expect(tileSource).not.toMatch(/borderRadius:\s*["']50%["']/);
    expect(tileSource).not.toMatch(/rgba\(5,\s*12,\s*20/); // the old badge fill colour
  });

  it("the number is bold, white, high-contrast text with an outline — not a filled shape", () => {
    expect(tileSource).toMatch(/numberText[\s\S]*?fontWeight:\s*900/);
    expect(tileSource).toMatch(/numberText[\s\S]*?color:\s*["']#ffffff["']/);
    expect(tileSource).toMatch(/WebkitTextStroke/);
  });

  it("the number is overlaid directly on the jersey (absolutely positioned inside jerseyWrap), not inside a separate wrapper element", () => {
    expect(tileSource).toMatch(/<span style=\{\{ \.\.\.S\.numberText/);
  });
});

describe("ProTaggerLineupJerseyTile — numberFontSize can be pinned independent of jersey size", () => {
  it("accepts an explicit numberFontSize override that wins over the size-proportional default", () => {
    expect(tileSource).toMatch(/numberFontSize\?:\s*number/);
    expect(tileSource).toMatch(/numberFontSize\s*\?\?\s*Math\.max/);
  });

  it("the tile's own default jersey size is unchanged (still enlarged, for any caller that doesn't override it)", () => {
    const defaultMatch = tileSource.match(/size = (\d+)/);
    expect(defaultMatch).not.toBeNull();
    expect(Number(defaultMatch![1])).toBeGreaterThanOrEqual(38);
  });

  const numbersToCheck = [1, 8, 10, 11, 15, 27];
  it.each(numbersToCheck)("number %i renders as plain digits through the same code path, no per-digit-count special casing", (num) => {
    const digits = String(num);
    expect(digits.length === 1 || digits.length === 2).toBe(true);
    expect(tileSource).not.toMatch(/digits?\.length/i);
  });
});

describe("ProTaggerLineupJerseyTile — MATCHDAY PITCH polish: neutral contrast halo (no badge/card)", () => {
  it("applies a neutral drop-shadow halo behind the jersey silhouette", () => {
    expect(tileSource).toMatch(/jerseyWrap[\s\S]*?filter:\s*["']drop-shadow\(/);
  });

  it("still renders no badge, card, or background shape behind the jersey (only a shadow filter, not a filled shape)", () => {
    const jerseyWrapBlockMatch = tileSource.match(/jerseyWrap:\s*\{([^}]*)\}/);
    expect(jerseyWrapBlockMatch).not.toBeNull();
    const jerseyWrapBlock = jerseyWrapBlockMatch![1];
    expect(jerseyWrapBlock).not.toContain("numberBadge");
    expect(jerseyWrapBlock).not.toMatch(/background(?:Color)?:/);
    expect(jerseyWrapBlock).not.toMatch(/boxShadow/);
    expect(jerseyWrapBlock).not.toMatch(/borderRadius/);
  });

  it("does not introduce a luminance/colour-contrast calculation — the halo is one fixed neutral treatment, not computed per team colour", () => {
    expect(tileSource).not.toMatch(/luminance/i);
    expect(tileSource).not.toMatch(/getContrast/i);
    expect(tileSource).not.toMatch(/relativeLuminance/i);
  });
});

// Final player-tile tuning pass: the jersey is now a small indicator, and
// the number shrinks WITH it (a reversal of the earlier "hold the number
// size" tuning pass) so a giant number no longer dominates the tile.
describe("ProTaggerLineupFormation — final tuning: jersey shrunk to an indicator, number shrinks with it", () => {
  const starterJerseySize = readConst(formationSource, "STARTER_JERSEY_SIZE");
  const starterNumberFontSize = readConst(formationSource, "STARTER_NUMBER_FONT_SIZE");
  const subJerseySize = readConst(formationSource, "SUB_JERSEY_SIZE");
  const subNumberFontSize = readConst(formationSource, "SUB_NUMBER_FONT_SIZE");

  // Prior tuning-pass production sizes, for regression comparison.
  const PRIOR_STARTER_SIZE = 32;
  const PRIOR_STARTER_NUMBER = 20;
  const PRIOR_SUB_SIZE = 27;
  const PRIOR_SUB_NUMBER = 17;

  it("the starter jersey is now a small positional/team-colour indicator, in the 24-26px range", () => {
    expect(starterJerseySize).toBeGreaterThanOrEqual(24);
    expect(starterJerseySize).toBeLessThanOrEqual(26);
    expect(starterJerseySize).toBeLessThan(PRIOR_STARTER_SIZE);
  });

  it("the starter number shrank to the 14-16px range, clearly smaller than the prior 20px", () => {
    expect(starterNumberFontSize).toBeGreaterThanOrEqual(14);
    expect(starterNumberFontSize).toBeLessThanOrEqual(16);
    expect(starterNumberFontSize).toBeLessThan(PRIOR_STARTER_NUMBER);
  });

  it("the subs jersey and number shrank by a comparable ratio, not left at their old sizes", () => {
    expect(subJerseySize).toBeLessThan(PRIOR_SUB_SIZE);
    expect(subNumberFontSize).toBeLessThan(PRIOR_SUB_NUMBER);
  });

  it("both starters and subs pass an explicit numberFontSize to every tile — consistent treatment, not per-slot variation", () => {
    const starterCalls = formationSource.match(/STARTER_JERSEY_SIZE.*STARTER_NUMBER_FONT_SIZE|STARTER_NUMBER_FONT_SIZE.*STARTER_JERSEY_SIZE/g) ?? [];
    const subCalls = formationSource.match(/SUB_JERSEY_SIZE.*SUB_NUMBER_FONT_SIZE|SUB_NUMBER_FONT_SIZE.*SUB_JERSEY_SIZE/g) ?? [];
    // Each pair of constants is used together exactly once — a single JSX
    // call site inside the one .map() loop per group, applied uniformly to
    // every starter (or every sub), not varied per individual slot.
    expect(starterCalls.length).toBeGreaterThanOrEqual(1);
    expect(subCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("the number is still clearly smaller than the jersey box it sits on, so it reads as a label, not the dominant shape", () => {
    expect(starterNumberFontSize).toBeLessThan(starterJerseySize);
    expect(subNumberFontSize).toBeLessThan(subJerseySize);
  });
});

// Final player-tile tuning pass: a compact PáircVision name plate for
// present names, and strictly no placeholder rendering for blank ones.
describe("ProTaggerLineupJerseyTile — final tuning: compact name plate (no card, no border, no glow)", () => {
  it("gives the name a restrained translucent-navy plate: a background and a small border radius, no border or box-shadow glow", () => {
    expect(tileSource).toMatch(/name:\s*\{[\s\S]*?background:/);
    expect(tileSource).toMatch(/name:\s*\{[\s\S]*?borderRadius:\s*\d/);
    expect(tileSource).not.toMatch(/name:\s*\{[\s\S]*?border:/);
    expect(tileSource).not.toMatch(/name:\s*\{[\s\S]*?boxShadow/);
  });

  it("uses compact padding, not oversized card padding", () => {
    const paddingMatch = tileSource.match(/name:\s*\{[\s\S]*?padding:\s*["']([^"']+)["']/);
    expect(paddingMatch).not.toBeNull();
    const paddingValues = paddingMatch![1].split(/\s+/).map((v) => parseInt(v, 10));
    for (const v of paddingValues) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("the name text is not larger than the jersey/number marker", () => {
    const fontMatch = tileSource.match(/name:\s*\{[\s\S]*?fontSize:\s*(\d+)/);
    expect(fontMatch).not.toBeNull();
    const nameFontSize = Number(fontMatch![1]);
    const starterNumberFontSize = readConst(formationSource, "STARTER_NUMBER_FONT_SIZE");
    const starterJerseySize = readConst(formationSource, "STARTER_JERSEY_SIZE");
    expect(nameFontSize).toBeLessThanOrEqual(starterNumberFontSize);
    expect(nameFontSize).toBeLessThan(starterJerseySize);
  });

  it("still shows the number with no name when the player has none, and never renders a GAA position abbreviation (e.g. player.position)", () => {
    expect(tileSource).not.toMatch(/\.position\b/); // never reads player.position for display
    expect(tileSource).toMatch(/name\s*&&\s*<span/);
  });

  it("blank names render neither the name span nor any placeholder text (no 'Player N', no dash) — the guard is a plain truthiness check on the trimmed name", () => {
    expect(tileSource).not.toMatch(/Player \$\{/);
    expect(tileSource).not.toMatch(/["']—["']/); // no placeholder dash
    expect(tileSource).toMatch(/const name = player\.name\.trim\(\)/);
  });
});
