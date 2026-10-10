import { describe, expect, it } from "vitest";

import {
  TACTICAL_BOARD_TURF_BASE,
  TACTICAL_BOARD_TURF_SHADING,
  TRAINING_GRASS_BANDS,
  rebaseTurfWash,
  resolveTacticalPitchThemeLayers,
  resolveTacticalPitchTurfBase,
  resolveTacticalPitchTurfWash,
  trainingGrassBands,
  type TacticalPitchTheme,
} from "./tacticalPitchTheme";

// createTacticalPitchVisualRoot() needs a real canvas/WebGL context, which
// this environment does not have, so the per-theme layer decision it reads
// is locked here as a pure function instead.
describe("resolveTacticalPitchThemeLayers", () => {
  it("default (public Gaelic Pitch) keeps turf, markings, goals and glass — unchanged", () => {
    expect(resolveTacticalPitchThemeLayers("default")).toEqual({
      face: "turf",
      markings: true,
      goals: "lines",
      glass: true,
    });
  });

  it("an omitted theme resolves to exactly the default layers", () => {
    expect(resolveTacticalPitchThemeLayers()).toEqual(resolveTacticalPitchThemeLayers("default"));
  });

  it("grass (Training Grass) paints the mown bands with glass, and drops markings and goals", () => {
    expect(resolveTacticalPitchThemeLayers("grass")).toEqual({
      face: "trainingBands",
      markings: false,
      goals: false,
      glass: true,
    });
  });

  it("gaelicBands (Gaelic Pitch) paints the Training Grass mown bands with the full Gaelic markings, artwork goals and glass", () => {
    expect(resolveTacticalPitchThemeLayers("gaelicBands")).toEqual({
      face: "trainingBands",
      markings: true,
      goals: "artwork",
      glass: true,
    });
  });

  it("whiteboard keeps the existing legacy whiteboard rendering: white face, ink markings and goals, no turf glass", () => {
    expect(resolveTacticalPitchThemeLayers("whiteboard")).toEqual({
      face: "whiteboard",
      markings: true,
      goals: "lines",
      glass: false,
    });
  });
});

describe("Training Grass mown bands", () => {
  it("uses the approved two greens and ten bands", () => {
    expect(TRAINING_GRASS_BANDS).toEqual({ count: 10, light: 0x6e894e, dark: 0x637e46 });
  });

  it("covers the face edge to edge in ten equal bands, alternating light then dark", () => {
    const bands = trainingGrassBands(160);
    expect(bands).toHaveLength(10);
    expect(bands[0]).toEqual({ x: 0, width: 16, color: 0x6e894e });
    expect(bands[1]).toEqual({ x: 16, width: 16, color: 0x637e46 });
    expect(bands[9]).toEqual({ x: 144, width: 16, color: 0x637e46 });
    const last = bands[bands.length - 1]!;
    expect(last.x + last.width).toBeCloseTo(160);
    bands.forEach((band, index) => expect(band.color).toBe(index % 2 === 0 ? 0x6e894e : 0x637e46));
  });

  it("only Training Grass uses the bands — Gaelic Pitch keeps the turf and Whiteboard its board face", () => {
    expect(resolveTacticalPitchThemeLayers("default").face).toBe("turf");
    expect(resolveTacticalPitchThemeLayers("whiteboard").face).toBe("whiteboard");
  });
});

describe("Tactical Board Traditional GAA Green turf (research trial)", () => {
  const recipeWash = [
    { t: 0, c: "#0c291d" },
    { t: 0.24, c: "#1a6143" },
    { t: 0.46, c: "#2d825b" },
    { t: 0.62, c: "#277351" },
    { t: 0.8, c: "#1f5e42" },
    { t: 1, c: "#103629" },
  ];
  const lum = (hex: string) => Number.parseInt(hex.slice(3, 5), 16);

  it("is #235431, replacing the Colour C trial", () => {
    expect(TACTICAL_BOARD_TURF_BASE).toBe("#235431");
    expect(resolveTacticalPitchTurfBase("tacticalBoard")).toBe("#235431");
    expect(TACTICAL_BOARD_TURF_BASE).not.toBe("#589d6d");
  });

  it("keeps exactly the default turf layers — markings, line goals and glass are unchanged", () => {
    expect(resolveTacticalPitchThemeLayers("tacticalBoard")).toEqual(resolveTacticalPitchThemeLayers("default"));
  });

  it("leaves default, Gaelic Pitch, Training Grass and Whiteboard without a turf override", () => {
    expect(resolveTacticalPitchTurfBase()).toBeNull();
    expect(resolveTacticalPitchTurfBase("default")).toBeNull();
    expect(resolveTacticalPitchTurfBase("gaelicBands")).toBeNull();
    expect(resolveTacticalPitchTurfBase("grass")).toBeNull();
    expect(resolveTacticalPitchTurfBase("whiteboard")).toBeNull();
  });

  it("never leaks into another surface's turf wash — every other theme paints the untouched recipe wash", () => {
    const others: TacticalPitchTheme[] = ["default", "gaelicBands", "grass", "whiteboard"];
    for (const theme of others) {
      const wash = resolveTacticalPitchTurfWash(theme, recipeWash);
      expect(wash).toBe(recipeWash);
      expect(wash.map((stop) => stop.c)).not.toContain(TACTICAL_BOARD_TURF_BASE);
    }
    // ...while the Tactical Board itself does get the override.
    expect(resolveTacticalPitchTurfWash("tacticalBoard", recipeWash).map((stop) => stop.c)).toContain(
      TACTICAL_BOARD_TURF_BASE,
    );
  });

  it("paints the Tactical Board wash close to #235431 edge to edge, keeping softened shading", () => {
    const wash = resolveTacticalPitchTurfWash("tacticalBoard", recipeWash);
    expect(wash.map((stop) => stop.t)).toEqual(recipeWash.map((stop) => stop.t));
    expect(wash[2]!.c).toBe("#235431");
    const base = lum(TACTICAL_BOARD_TURF_BASE);
    for (const stop of wash) {
      expect(lum(stop.c)).toBeLessThanOrEqual(base);
      // The darkest edge keeps at least ~75% of the base brightness — never near-black.
      expect(lum(stop.c)).toBeGreaterThanOrEqual(Math.floor(base * 0.75));
    }
    // Edges still sit darker than the centre, in the original order.
    expect(lum(wash[0]!.c)).toBeLessThan(lum(wash[5]!.c));
    expect(lum(wash[5]!.c)).toBeLessThan(lum(wash[2]!.c));
    expect(TACTICAL_BOARD_TURF_SHADING).toBeGreaterThan(0);
    expect(TACTICAL_BOARD_TURF_SHADING).toBeLessThan(1);
  });

  it("re-bases with the full original shading by default, and flat at shading 0", () => {
    const full = rebaseTurfWash(recipeWash, "#589d6d");
    expect(full[2]!.c).toBe("#589d6d");
    expect(lum(full[0]!.c)).toBeLessThan(lum(full[5]!.c));
    expect(rebaseTurfWash(recipeWash, "#235431", 0).every((stop) => stop.c === "#235431")).toBe(true);
  });
});
