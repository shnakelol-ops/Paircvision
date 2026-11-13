// Jersey Designer V2 — kit model: safe defaults for every stored shape and
// automatic number contrast.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_JERSEY_KIT,
  JERSEY_PATTERNS,
  prefersDarkNumber,
  relativeLuminance,
  resolveJerseyKit,
  storedJerseyKit,
} from "./jersey-kit";

describe("DEFAULT_JERSEY_KIT", () => {
  it("is the approved default: plain, secondary sleeves, secondary collar", () => {
    expect(DEFAULT_JERSEY_KIT).toEqual({ pattern: "plain", sleeves: "secondary", collar: "secondary" });
  });

  it("offers exactly the four approved patterns", () => {
    expect(JERSEY_PATTERNS).toEqual(["plain", "chestV", "hoop", "stripes"]);
  });
});

describe("resolveJerseyKit — never throws, always renderable", () => {
  it.each([undefined, null, "", "hoop", 42, true, [], () => 1])("non-object %s renders the default kit", (raw) => {
    expect(resolveJerseyKit(raw)).toEqual(DEFAULT_JERSEY_KIT);
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

describe("number ink — dark digits only where white falls below WCAG 3:1", () => {
  it.each([
    ["#ffffff", true],  // white
    ["#facc15", true],  // yellow
    ["#fbbf24", true],  // gold
    ["#4ade80", true],  // light green
    ["#e5e7eb", true],  // light grey
    ["#94a3b8", true],  // mid grey (white ≈ 2.6:1)
    ["#22c55e", true],  // bright green (white ≈ 2.3:1)
    ["#16a34a", false], // the default home green keeps today's white number (white ≈ 3.3:1)
    ["#dc2626", false], // the default away red keeps today's white number
    ["#15803d", false], // dark green
    ["#7f1d1d", false], // maroon
    ["#1e3a8a", false], // navy
    ["#111827", false], // black
    ["#2563eb", false], // blue
  ])("%s → dark number: %s", (primary, dark) => {
    expect(prefersDarkNumber(primary)).toBe(dark);
  });

  it("accepts 3-digit hex and surrounding whitespace", () => {
    expect(prefersDarkNumber(" #fff ")).toBe(true);
    expect(prefersDarkNumber("#000")).toBe(false);
  });

  it("an unreadable colour keeps today's white number", () => {
    expect(prefersDarkNumber("green")).toBe(false);
    expect(prefersDarkNumber("")).toBe(false);
    expect(relativeLuminance("not-a-colour")).toBeNull();
  });

  it("relative luminance spans 0 (black) to 1 (white)", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});
