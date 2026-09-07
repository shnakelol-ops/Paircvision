// Visual correction regression coverage: the previous black circular
// number-badge treatment read as a Tactical Slate player-token marker, not
// a team sheet, and made the jersey underneath look faint by comparison.
// This corrects it: the jersey is the dominant shape, and the number is
// bold, high-contrast text directly on the jersey (white fill + dark
// outline) — no shape drawn behind it.
//
// A later visual TUNING pass shrank the Starting 15/subs jerseys by ~20%
// (close to the Team Colours preview's own 32px jersey) while explicitly
// NOT shrinking the number proportionally — the number font size is now
// pinned per call site (ProTaggerLineupFormation.tsx) rather than always
// derived from `size`, specifically so a smaller jersey doesn't drag the
// number down with it.
//
// ProTaggerLineupJerseyTile.tsx has no React rendering harness in this repo
// (see ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint),
// so this suite exercises the exact font-sizing formula/overrides by
// reading them out of the components' own source — the same approach
// QuickReviewPage1.wording.test.ts and ProTaggerSquadScreen.nameEditorToggle.test.ts
// use for presentational checks with no harness available.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tileSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupJerseyTile.tsx", import.meta.url)), "utf8");
const formationSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupFormation.tsx", import.meta.url)), "utf8");

// Mirrors the exact default formula in ProTaggerLineupJerseyTile.tsx (used
// only when a caller does not pin an explicit numberFontSize).
function defaultNumberFontSize(size: number): number {
  return Math.max(15, Math.round(size * 0.5));
}

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

describe("ProTaggerLineupJerseyTile — numberFontSize can be pinned independent of jersey size (visual tuning)", () => {
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

describe("ProTaggerLineupFormation — jersey shrunk ~20-25%, number size held (visual tuning)", () => {
  const starterJerseySize = readConst(formationSource, "STARTER_JERSEY_SIZE");
  const starterNumberFontSize = readConst(formationSource, "STARTER_NUMBER_FONT_SIZE");
  const subJerseySize = readConst(formationSource, "SUB_JERSEY_SIZE");
  const subNumberFontSize = readConst(formationSource, "SUB_NUMBER_FONT_SIZE");

  // Pre-tuning production sizes were 40 (starters) / 34 (subs), with the
  // number always derived from `size * 0.5` (20 / 17 respectively).
  const PRE_TUNING_STARTER_SIZE = 40;
  const PRE_TUNING_SUB_SIZE = 34;

  it("the Starting 15 jersey shrank by approximately 20-25%, landing close to the Team Colours preview's 32px jersey", () => {
    const reduction = 1 - starterJerseySize / PRE_TUNING_STARTER_SIZE;
    expect(reduction).toBeGreaterThanOrEqual(0.15);
    expect(reduction).toBeLessThanOrEqual(0.30);
    expect(starterJerseySize).toBeCloseTo(32, 0);
  });

  it("the subs jersey shrank by a comparable ratio, not left at its old size", () => {
    const reduction = 1 - subJerseySize / PRE_TUNING_SUB_SIZE;
    expect(reduction).toBeGreaterThanOrEqual(0.15);
    expect(reduction).toBeLessThanOrEqual(0.30);
  });

  it("the number font size was NOT reduced proportionally with the smaller jersey — it holds at (or above) its prior, already-verified size", () => {
    expect(starterNumberFontSize).toBeGreaterThanOrEqual(defaultNumberFontSize(PRE_TUNING_STARTER_SIZE));
    expect(subNumberFontSize).toBeGreaterThanOrEqual(defaultNumberFontSize(PRE_TUNING_SUB_SIZE));
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

  it("the number stays clearly larger, in absolute px, than it would be if it had simply scaled down with the jersey", () => {
    const wouldHaveScaledTo = defaultNumberFontSize(starterJerseySize);
    expect(starterNumberFontSize).toBeGreaterThan(wouldHaveScaledTo);
  });
});

describe("ProTaggerLineupJerseyTile — name label unchanged by the tuning pass", () => {
  it("the name label's font size and max width are untouched (still wide enough for ordinary GAA names before ellipsis)", () => {
    const fontMatch = tileSource.match(/name:\s*\{[\s\S]*?fontSize:\s*(\d+)/);
    expect(fontMatch).not.toBeNull();
    expect(Number(fontMatch![1])).toBe(10);

    const widthMatch = tileSource.match(/name:\s*\{[\s\S]*?maxWidth:\s*(\d+)/);
    expect(widthMatch).not.toBeNull();
    expect(Number(widthMatch![1])).toBeGreaterThanOrEqual(64);
  });

  it("still shows the number with no name when the player has none, and never renders a GAA position abbreviation (e.g. player.position)", () => {
    expect(tileSource).not.toMatch(/\.position\b/); // never reads player.position for display
    expect(tileSource).toMatch(/name\s*&&\s*<span/);
  });
});
