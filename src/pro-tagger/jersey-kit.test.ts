// Jersey Designer V2 — kit model: safe defaults for every stored shape.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_JERSEY_KIT,
  JERSEY_PATTERNS,
  JERSEY_PATTERN_LABEL,
  resolveJerseyKit,
  storedJerseyKit,
} from "./jersey-kit";

describe("DEFAULT_JERSEY_KIT", () => {
  it("is the approved default: plain, secondary sleeves, secondary collar", () => {
    expect(DEFAULT_JERSEY_KIT).toEqual({ pattern: "plain", sleeves: "secondary", collar: "secondary" });
  });

  it("offers exactly the six approved patterns, with their labels", () => {
    expect(JERSEY_PATTERNS).toEqual(["plain", "chestV", "chestBand", "hoop", "hoops", "stripes"]);
    expect(JERSEY_PATTERNS.map((p) => JERSEY_PATTERN_LABEL[p])).toEqual(["Plain", "Chest V", "Chest Band", "Hoop", "Hoops", "Stripes"]);
  });
});

describe("resolveJerseyKit — never throws, always renderable", () => {
  it.each([undefined, null, "", "hoop", 42, true, [], () => 1])("non-object %s renders the default kit", (raw) => {
    expect(resolveJerseyKit(raw)).toEqual(DEFAULT_JERSEY_KIT);
  });

  it.each(["chestBand", "hoops"] as const)("keeps the new %s pattern", (pattern) => {
    expect(resolveJerseyKit({ pattern, sleeves: "primary", collar: "primary" })).toEqual({ pattern, sleeves: "primary", collar: "primary" });
  });

  it("keeps a fully valid kit as-is", () => {
    const kit = { pattern: "chestV", sleeves: "primary", collar: "primary" } as const;
    expect(resolveJerseyKit(kit)).toEqual(kit);
  });

  it("fills missing fields from the default, field by field", () => {
    expect(resolveJerseyKit({ pattern: "hoop" })).toEqual({ pattern: "hoop", sleeves: "secondary", collar: "secondary" });
    expect(resolveJerseyKit({ sleeves: "primary" })).toEqual({ pattern: "plain", sleeves: "primary", collar: "secondary" });
  });

  it("replaces unknown or wrongly typed values with the default (e.g. a Tactical Slate pattern name)", () => {
    expect(resolveJerseyKit({ pattern: "gradient", sleeves: "tertiary", collar: 1 })).toEqual(DEFAULT_JERSEY_KIT);
    expect(resolveJerseyKit({ pattern: "HOOP", sleeves: "Secondary", collar: null })).toEqual(DEFAULT_JERSEY_KIT);
  });

  it("drops unknown extra keys", () => {
    expect(resolveJerseyKit({ pattern: "stripes", sleeves: "primary", collar: "secondary", sponsor: "x" })).toEqual({
      pattern: "stripes",
      sleeves: "primary",
      collar: "secondary",
    });
  });
});

describe("storedJerseyKit — legacy records are not given a kit", () => {
  it("returns undefined for a record that never had a kit", () => {
    expect(storedJerseyKit(undefined)).toBeUndefined();
    expect(storedJerseyKit(null)).toBeUndefined();
    expect(storedJerseyKit("chestV")).toBeUndefined();
  });

  it("returns a cleaned kit for any stored object", () => {
    expect(storedJerseyKit({ pattern: "hoop", sleeves: "nonsense" })).toEqual({ pattern: "hoop", sleeves: "secondary", collar: "secondary" });
  });
});
