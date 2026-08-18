import { describe, expect, it } from "vitest";
import {
  PRO_TAGGER_FAMILIES,
  getFamiliesForSport,
  getFamilyLabel,
} from "./pro-tagger-families";

function findFamily(id: string) {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error(`family ${id} not found`);
  return family;
}

describe("45/65 restart family — sport-aware label derivation", () => {
  it("displays 45 for Gaelic football (uses the existing session.sport mechanism)", () => {
    const family = findFamily("FORTY_FIVE");
    expect(getFamilyLabel(family, "gaelic")).toBe("45");
  });

  it("displays 45 for ladies football too", () => {
    const family = findFamily("FORTY_FIVE");
    expect(getFamilyLabel(family, "ladies_football")).toBe("45");
  });

  it("displays 65 for hurling", () => {
    const family = findFamily("FORTY_FIVE");
    expect(getFamilyLabel(family, "hurling")).toBe("65");
  });

  it("displays 65 for camogie", () => {
    const family = findFamily("FORTY_FIVE");
    expect(getFamilyLabel(family, "camogie")).toBe("65");
  });

  it("is present for every sport (not hidden), same as Sideline", () => {
    for (const sport of ["gaelic", "ladies_football", "hurling", "camogie"] as const) {
      const families = getFamiliesForSport(sport);
      expect(families.some((f) => f.id === "FORTY_FIVE")).toBe(true);
      expect(families.some((f) => f.id === "SIDELINE")).toBe(true);
    }
  });
});

describe("45/65 and Sideline families expose both team rows (unlike Free)", () => {
  it("FORTY_FIVE has hasMinus true with Won/Conceded tiles", () => {
    const family = findFamily("FORTY_FIVE");
    expect(family.hasMinus).toBe(true);
    expect(family.tiles.map((t) => t.label)).toEqual(["Won", "Conceded"]);
  });

  it("SIDELINE has hasMinus true with Won/Conceded tiles", () => {
    const family = findFamily("SIDELINE");
    expect(family.hasMinus).toBe(true);
    expect(family.tiles.map((t) => t.label)).toEqual(["Won", "Conceded"]);
  });

  it("FREE remains hasMinus false — unchanged from before this PR", () => {
    const family = findFamily("FREE");
    expect(family.hasMinus).toBe(false);
    expect(family.tiles.map((t) => t.label)).toEqual(["Won", "Conceded"]);
  });
});
