// Discipline is sport-aware: getDisciplineOptions (pro-tagger-discipline.ts)
// decides which sanctions exist per sport, and getFamilyTiles filters the
// DISCIPLINE family's tiles to match — non-destructively, PRO_TAGGER_FAMILIES
// itself is never mutated. These tests cover only that filtering; they do
// not assert anything about the 45/65 or Sideline tile shape (owner-toggle,
// single "Won" tile), which is #296's corrected, protected restart model.
import { describe, expect, it } from "vitest";
import {
  PRO_TAGGER_FAMILIES,
  getFamilyTiles,
  getFamilyLabel,
  resolveTileRestartOwner,
} from "./pro-tagger-families";
import { adaptProTaggerAction } from "./pro-tagger-adapter";

function disciplineFamily() {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === "DISCIPLINE");
  if (!family) throw new Error("DISCIPLINE family missing");
  return family;
}

function familyById(id: string) {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error(`${id} family missing`);
  return family;
}

describe("Discipline tiles are sport-aware", () => {
  it("Football (gaelic) exposes Yellow, Sin Bin and Red", () => {
    const labels = getFamilyTiles(disciplineFamily(), "gaelic").map((t) => t.label);
    expect(labels).toEqual(["Yellow", "Sin Bin", "Red"]);
  });

  it("Ladies Football exposes the same set as Football", () => {
    const labels = getFamilyTiles(disciplineFamily(), "ladies_football").map((t) => t.label);
    expect(labels).toEqual(["Yellow", "Sin Bin", "Red"]);
  });

  it("Hurling does not expose Sin Bin (no confirmed ruleset yet)", () => {
    const labels = getFamilyTiles(disciplineFamily(), "hurling").map((t) => t.label);
    expect(labels).toEqual(["Yellow", "Red"]);
    expect(labels).not.toContain("Sin Bin");
  });

  it("Camogie does not expose Sin Bin merely because Football has one", () => {
    const labels = getFamilyTiles(disciplineFamily(), "camogie").map((t) => t.label);
    expect(labels).toEqual(["Yellow", "Red"]);
    expect(labels).not.toContain("Sin Bin");
  });

  it("PRO_TAGGER_FAMILIES itself is never mutated by filtering", () => {
    getFamilyTiles(disciplineFamily(), "camogie");
    expect(disciplineFamily().tiles.map((t) => t.label)).toEqual(["Yellow", "Sin Bin", "Red"]);
  });
});

describe("getFamilyTiles is a no-op for every other family", () => {
  it("returns the family's own tiles unchanged for a non-Discipline family", () => {
    const goal = PRO_TAGGER_FAMILIES.find((f) => f.id === "GOAL")!;
    expect(getFamilyTiles(goal, "gaelic")).toBe(goal.tiles);
    expect(getFamilyTiles(goal, "hurling")).toBe(goal.tiles);
  });
});

describe("unrelated 45/65 mode labels remain unchanged", () => {
  it("the FORTY_FIVE family still displays 45 for football and 65 for hurling/camogie", () => {
    const family = PRO_TAGGER_FAMILIES.find((f) => f.id === "FORTY_FIVE")!;
    expect(getFamilyLabel(family, "gaelic")).toBe("45");
    expect(getFamilyLabel(family, "hurling")).toBe("65");
    expect(getFamilyLabel(family, "camogie")).toBe("65");
    expect(getFamilyTiles(family, "gaelic")).toBe(family.tiles);
    expect(getFamilyTiles(family, "hurling")).toBe(family.tiles);
  });
});

// ── resolveTileRestartOwner: the "who won it?" simplification for 45/65 and
// Sideline, without touching Kickout's manipulable owner toggle ──────────────
describe("resolveTileRestartOwner", () => {
  it("Kickout (hasOwnerToggle, no ownerImplicitFromTappedSide) always uses the toggled owner, regardless of which row was tapped", () => {
    const kickout = familyById("RESTART");
    expect(resolveTileRestartOwner(kickout, "FOR", "OPP")).toBe("OPP");
    expect(resolveTileRestartOwner(kickout, "OPP", "FOR")).toBe("FOR");
  });

  it("FORTY_FIVE (ownerImplicitFromTappedSide) always uses the tapped side, ignoring the toggled value entirely", () => {
    const fortyFive = familyById("FORTY_FIVE");
    expect(resolveTileRestartOwner(fortyFive, "FOR", "OPP")).toBe("FOR");
    expect(resolveTileRestartOwner(fortyFive, "OPP", "FOR")).toBe("OPP");
  });

  it("SIDELINE (ownerImplicitFromTappedSide) always uses the tapped side, ignoring the toggled value entirely", () => {
    const sideline = familyById("SIDELINE");
    expect(resolveTileRestartOwner(sideline, "FOR", "OPP")).toBe("FOR");
    expect(resolveTileRestartOwner(sideline, "OPP", "FOR")).toBe("OPP");
  });

  it("a family without hasOwnerToggle at all never gets a restartOwner", () => {
    const free = familyById("FREE");
    expect(resolveTileRestartOwner(free, "FOR", "OPP")).toBeUndefined();
    expect(resolveTileRestartOwner(free, "OPP", "FOR")).toBeUndefined();
  });
});

// ── End-to-end through the real adapter: proves the simplified "Won" tap
// produces the correct owner-derived kind, and can never produce CONCEDED —
// i.e. this is not a reversion to #295's stale direct teamSide encoding. ────
describe("45/65 and Sideline UI semantics via the real capture pipeline", () => {
  function buildAction(familyId: "FORTY_FIVE" | "SIDELINE", tappedSide: "FOR" | "OPP") {
    const family = familyById(familyId);
    const restartOwner = resolveTileRestartOwner(family, tappedSide, "FOR" /* toggle irrelevant here */);
    return adaptProTaggerAction({
      familyId,
      tileLabel: "Won",
      teamSide: tappedSide,
      restartOwner,
      nx: 0.5,
      ny: 0.5,
      half: 1,
      matchClockSeconds: 100,
    });
  }

  it("Home 45 Won -> FORTY_FIVE_WON, teamSide FOR", () => {
    const event = buildAction("FORTY_FIVE", "FOR");
    expect(event.kind).toBe("FORTY_FIVE_WON");
    expect(event.teamSide).toBe("FOR");
  });

  it("Away 45 Won -> FORTY_FIVE_WON, teamSide OPP", () => {
    const event = buildAction("FORTY_FIVE", "OPP");
    expect(event.kind).toBe("FORTY_FIVE_WON");
    expect(event.teamSide).toBe("OPP");
  });

  it("Home Sideline Won -> SIDELINE_WON, teamSide FOR", () => {
    const event = buildAction("SIDELINE", "FOR");
    expect(event.kind).toBe("SIDELINE_WON");
    expect(event.teamSide).toBe("FOR");
  });

  it("Away Sideline Won -> SIDELINE_WON, teamSide OPP", () => {
    const event = buildAction("SIDELINE", "OPP");
    expect(event.kind).toBe("SIDELINE_WON");
    expect(event.teamSide).toBe("OPP");
  });

  it("never produces a CONCEDED kind from this UI, unlike the toggle-driven Kickout path", () => {
    for (const side of ["FOR", "OPP"] as const) {
      expect(buildAction("FORTY_FIVE", side).kind).not.toBe("FORTY_FIVE_CONCEDED");
      expect(buildAction("SIDELINE", side).kind).not.toBe("SIDELINE_CONCEDED");
    }
  });

  it("the toggled owner value is provably irrelevant — the same tap produces the same result no matter what the shared toggle reads", () => {
    const family = familyById("FORTY_FIVE");
    const ownerA = resolveTileRestartOwner(family, "FOR", "FOR");
    const ownerB = resolveTileRestartOwner(family, "FOR", "OPP");
    expect(ownerA).toBe(ownerB); // both "FOR" — the toggle argument never mattered
  });
});

// ── Discipline is always expanded and uses clear sanction colours ───────────
describe("Discipline is a permanently-expanded, first-class family", () => {
  it("is not marked secondary/collapsible", () => {
    expect(disciplineFamily().secondary).toBeFalsy();
  });

  it("Yellow, Sin Bin and Red each carry a distinct per-tile colour, matching reviewPdfExport's canonical sanction colours", () => {
    const tiles = disciplineFamily().tiles;
    const yellow = tiles.find((t) => t.label === "Yellow");
    const sinBin = tiles.find((t) => t.label === "Sin Bin");
    const red = tiles.find((t) => t.label === "Red");

    expect(yellow?.colour).toBe("#facc15");
    expect(sinBin?.colour).toBe("#fb923c");
    expect(red?.colour).toBe("#dc2626");

    // Distinct from each other and from the family's own fallback colour —
    // proves each sanction is individually colour-identifiable, not just
    // inheriting one flat family colour the way every other family's tiles do.
    const colours = new Set([yellow?.colour, sinBin?.colour, red?.colour]);
    expect(colours.size).toBe(3);
  });

  it("every tile still carries a text label — colour is never the only signal", () => {
    for (const tile of disciplineFamily().tiles) {
      expect(tile.label.length).toBeGreaterThan(0);
    }
  });
});

// ── SHOT: non-scoring shot outcomes only — "45" and "Mark" removed ──────────
// "45": a shot deflected out for a 45 is already the canonical FORTY_FIVE_WON
// restart-award event; a SHOT-family "45" tag would duplicate that fact.
// "Mark": a shot *source*, not a non-scoring outcome — Mark-sourced scores
// remain captured via Goal/Point/2PT/Wide -> Mark, untouched by this change.
describe("SHOT exposes only non-scoring shot outcomes", () => {
  it("SHOT tiles are exactly Short, Block/Save and Post — no 45, no Mark", () => {
    const shot = familyById("SHOT");
    expect(shot.tiles.map((t) => t.label)).toEqual(["Short", "Block/Save", "Post"]);
  });

  it("sport filtering doesn't add anything back — SHOT has no per-sport tile variation", () => {
    for (const sport of ["gaelic", "ladies_football", "hurling", "camogie"] as const) {
      expect(getFamilyTiles(familyById("SHOT"), sport).map((t) => t.label)).toEqual([
        "Short",
        "Block/Save",
        "Post",
      ]);
    }
  });
});
