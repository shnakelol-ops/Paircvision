// Discipline is sport-aware: getDisciplineOptions (pro-tagger-discipline.ts)
// decides which sanctions exist per sport, and getFamilyTiles filters the
// DISCIPLINE family's tiles to match — non-destructively, PRO_TAGGER_FAMILIES
// itself is never mutated. These tests cover only that filtering; they do
// not assert anything about the 45/65 or Sideline tile shape (owner-toggle,
// single "Won" tile), which is #296's corrected, protected restart model.
import { describe, expect, it } from "vitest";
import { PRO_TAGGER_FAMILIES, getFamilyTiles, getFamilyLabel } from "./pro-tagger-families";

function disciplineFamily() {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === "DISCIPLINE");
  if (!family) throw new Error("DISCIPLINE family missing");
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
