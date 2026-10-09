import { describe, expect, it } from "vitest";

import { TRAINING_GRASS_BANDS, resolveTacticalPitchThemeLayers, trainingGrassBands } from "./tacticalPitchTheme";

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
