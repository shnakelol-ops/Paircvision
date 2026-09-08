// Event Stats visual lineup (Squad Setup Option A): deriveLineupSlots is the
// pure formation-mapping rule from the visual lineup audit — the lowest 15
// players by jersey-number rank fill the fixed GAA formation slots 1-15,
// everything else is a substitute in ascending number order. Ranked by sort
// order rather than an exact number match so a gap or an out-of-range number
// (legacy/imported data) degrades gracefully instead of leaving a blank slot
// or throwing.
//
// ProTaggerLineupFormation.tsx (and ProTaggerSquadScreen.tsx, which mounts
// it) have no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint), so
// this suite exercises the exported pure derivation directly.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveLineupSlots } from "./ProTaggerLineupFormation";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";

const formationSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupFormation.tsx", import.meta.url)), "utf8");

function player(number: number, name = "", overrides: Partial<ProTaggerSquadPlayer> = {}): ProTaggerSquadPlayer {
  return { id: `p-${number}`, number, name, ...overrides };
}

function defaultTwentyPlayerSquad(): ProTaggerSquadPlayer[] {
  return Array.from({ length: 20 }, (_, i) => player(i + 1, "", { position: i < 15 ? "POS" : "SUB" }));
}

describe("deriveLineupSlots (Event Stats visual lineup)", () => {
  it("a standard 20-player squad (numbers 1-20) splits into starters 1-15 and subs 16-20, in order", () => {
    const { starters, subs } = deriveLineupSlots(defaultTwentyPlayerSquad());
    expect(starters.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(subs.map((p) => p.number)).toEqual([16, 17, 18, 19, 20]);
  });

  it("is independent of input array order — sorts by number regardless of how the roster is stored", () => {
    const shuffled = [...defaultTwentyPlayerSquad()].reverse();
    const { starters, subs } = deriveLineupSlots(shuffled);
    expect(starters.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(subs.map((p) => p.number)).toEqual([16, 17, 18, 19, 20]);
  });

  it("fewer than 15 players: starters is short (caller renders the remaining formation slots as ghosts), no substitutes", () => {
    const roster = [player(1), player(2), player(3)];
    const { starters, subs } = deriveLineupSlots(roster);
    expect(starters).toHaveLength(3);
    expect(subs).toHaveLength(0);
  });

  it("never throws and never drops a player for a gap in jersey numbers (e.g. no #7)", () => {
    const roster = [
      player(1), player(2), player(3), player(4), player(5), player(6),
      // no 7
      player(8), player(9), player(10), player(11), player(12), player(13), player(14), player(15), player(16),
      player(17),
    ];
    expect(() => deriveLineupSlots(roster)).not.toThrow();
    const { starters, subs } = deriveLineupSlots(roster);
    expect(starters).toHaveLength(15);
    expect(starters.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.number).toBe(17);
  });

  it("a duplicate jersey number does not crash and does not drop a player — both instances land somewhere, never merged", () => {
    const roster = [...defaultTwentyPlayerSquad()];
    roster.push(player(9, "Duplicate Nine", { id: "p-dup-9" }));
    expect(() => deriveLineupSlots(roster)).not.toThrow();
    const { starters, subs } = deriveLineupSlots(roster);
    const allIds = [...starters, ...subs].map((p) => p.id);
    expect(allIds).toContain("p-dup-9");
    expect(new Set(allIds).size).toBe(allIds.length); // no id ever appears twice
    expect(allIds).toHaveLength(21);
  });

  it("an empty roster returns empty starters and subs without throwing", () => {
    expect(() => deriveLineupSlots([])).not.toThrow();
    const { starters, subs } = deriveLineupSlots([]);
    expect(starters).toEqual([]);
    expect(subs).toEqual([]);
  });

  it("is read-only: never mutates the input array or its player objects", () => {
    const roster = defaultTwentyPlayerSquad();
    const snapshot = JSON.stringify(roster);
    deriveLineupSlots(roster);
    expect(JSON.stringify(roster)).toBe(snapshot);
  });

  it("blank names and populated names both pass through unchanged — this helper does no name/display logic", () => {
    const roster = [player(1, ""), player(2, "Shane")];
    const { starters } = deriveLineupSlots(roster);
    expect(starters[0]!.name).toBe("");
    expect(starters[1]!.name).toBe("Shane");
  });
});

// MATCHDAY PITCH final visual polish pass: a restrained "Starting XV" label
// above the pitch (mirroring the existing "Substitutes" label) and improved
// visual separation for the Substitutes section. No React rendering harness
// is available (see the header comment above), so this is a source-level
// check of the same kind used for the earlier visual-correction passes.
describe("ProTaggerLineupFormation — MATCHDAY PITCH polish: section labels & subs separation", () => {
  it("renders a 'Starting XV' label above the pitch, using the shared section-label style", () => {
    expect(formationSource).toMatch(/Starting XV/);
    expect(formationSource).toMatch(/<div style=\{S\.sectionLabel\}>Starting XV<\/div>/);
  });

  it("the Substitutes label is unchanged in wording and still appears above the subs row", () => {
    expect(formationSource).toMatch(/<div style=\{S\.subsDivider\}>Substitutes<\/div>/);
  });

  it("the Substitutes section has its own visual separation (a rule/border, not just the caption text)", () => {
    expect(formationSource).toMatch(/subsSection[\s\S]*?borderTop/);
  });

  it("does not introduce a card, box-shadow, or background treatment around the pitch or subs (presentation stays restrained)", () => {
    expect(formationSource).not.toMatch(/boxShadow/);
    expect(formationSource).not.toMatch(/subsSection[\s\S]*?background/);
  });
});

// Whole-pitch viewport-fit pass: on 360-430px Android portrait the pitch box
// always rendered at its fixed maxWidth cap (never fluid-shrunk by the
// viewport), leaving no bottom breathing margin before the footer. The fix
// is a single reduction of that cap — everything else (aspect ratio, the
// pitch SVG that fills the box, and every percentage-positioned formation
// slot) follows automatically as one coherent unit; no transform:scale, no
// separate height rule, no coordinate change.
describe("ProTaggerLineupFormation — whole-pitch viewport-fit: pitch box scaled down as one unit", () => {
  it("the pitch box's maxWidth was reduced by roughly 5-8% from its prior 320px cap", () => {
    const maxWidthMatch = formationSource.match(/pitchBox:\s*\{[\s\S]*?maxWidth:\s*(\d+)/);
    expect(maxWidthMatch).not.toBeNull();
    const newMaxWidth = Number(maxWidthMatch![1]);
    const PRIOR_MAX_WIDTH = 320;
    const reduction = 1 - newMaxWidth / PRIOR_MAX_WIDTH;
    expect(reduction).toBeGreaterThanOrEqual(0.05);
    expect(reduction).toBeLessThanOrEqual(0.08);
  });

  it("stays fluid and centred (width: 100% up to the cap) rather than a fixed non-responsive box", () => {
    const pitchBoxBlockMatch = formationSource.match(/pitchBox:\s*\{([\s\S]*?)\},/);
    expect(pitchBoxBlockMatch).not.toBeNull();
    expect(pitchBoxBlockMatch![1]).toMatch(/width:\s*["']100%["']/);
  });

  it("does not use transform: scale — the box's own rendered dimensions shrink, not a visual-only transform", () => {
    expect(formationSource).not.toMatch(/transform:\s*["']scale/);
  });

  it("still derives height from the pitch's real aspect ratio (LINEUP_PITCH_PORTRAIT_VIEWBOX) rather than a hardcoded height", () => {
    expect(formationSource).toMatch(/aspectRatio: `\$\{LINEUP_PITCH_PORTRAIT_VIEWBOX\.w\} \/ \$\{LINEUP_PITCH_PORTRAIT_VIEWBOX\.h\}`/);
    expect(formationSource).not.toMatch(/pitchBox:\s*\{[\s\S]*?height:\s*\d/);
  });

  it("formation slots are still percentage-positioned (left/top in %), so they follow the smaller box automatically — no coordinate change", () => {
    expect(formationSource).toMatch(/left: `\$\{pos\.x\}%`, top: `\$\{pos\.y\}%`/);
  });

  it("player-tile sizing constants are untouched by this pass — the approved player-tile design stays exactly as-is", () => {
    expect(formationSource).toMatch(/STARTER_JERSEY_SIZE = 26/);
    expect(formationSource).toMatch(/STARTER_NUMBER_FONT_SIZE = 13/);
    expect(formationSource).toMatch(/SUB_JERSEY_SIZE = 22/);
    expect(formationSource).toMatch(/SUB_NUMBER_FONT_SIZE = 13/);
  });
});
