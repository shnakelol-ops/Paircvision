import { describe, expect, it } from "vitest";

import { getPitchConfig } from "../../core/pitch/pitch-config";
import {
  TRAINING_GRASS_BANDS,
  markingAlignedGrassBands,
  resolveTacticalPitchThemeLayers,
  trainingGrassBands,
} from "./tacticalPitchTheme";

// createTacticalPitchVisualRoot() needs a real canvas/WebGL context, which
// this environment does not have, so the per-theme layer decision it reads
// is locked here as a pure function instead.
describe("resolveTacticalPitchThemeLayers", () => {
  it("default (public Gaelic Pitch) keeps turf, markings, goals and glass — unchanged", () => {
    expect(resolveTacticalPitchThemeLayers("default")).toEqual({
      face: "turf",
      markings: true,
      goals: true,
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

  it("gaelicBands (Gaelic Pitch B) paints marking-aligned bands with the full Gaelic markings, goals and glass", () => {
    expect(resolveTacticalPitchThemeLayers("gaelicBands")).toEqual({
      face: "markingBands",
      markings: true,
      goals: true,
      glass: true,
    });
  });

  it("whiteboard keeps the existing legacy whiteboard rendering: white face, ink markings and goals, no turf glass", () => {
    expect(resolveTacticalPitchThemeLayers("whiteboard")).toEqual({
      face: "whiteboard",
      markings: true,
      goals: true,
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

describe("Gaelic Pitch B marking-aligned bands", () => {
  const { markings, inner, viewBox } = getPitchConfig("gaelic");
  const bands = markingAlignedGrassBands(viewBox.w, markings, inner.h);
  const transverse = markings
    .filter((m) => m.kind === "line" && m.x1 === m.x2 && Math.abs(m.y2 - m.y1) >= inner.h - 1e-6)
    .map((m) => (m.kind === "line" ? m.x1 : 0))
    .sort((a, b) => a - b);

  it("finds the eight full-width transverse lines (13 m, 20 m, 45 m, 65 m on each side)", () => {
    expect(transverse).toHaveLength(8);
  });

  it("puts every band edge exactly on a transverse line, with the end bands out to the face edges", () => {
    expect(bands).toHaveLength(9);
    expect(bands[0]!.x).toBe(0);
    expect(bands.slice(1).map((b) => b.x)).toEqual(transverse);
    const last = bands[bands.length - 1]!;
    expect(last.x + last.width).toBeCloseTo(viewBox.w);
  });

  it("uses the approved Training Grass colours, alternating light/dark and mirror-symmetric", () => {
    expect(bands.map((b) => b.color)).toEqual(bands.map((_, i) => (i % 2 === 0 ? 0x6e894e : 0x637e46)));
    const widths = bands.map((b) => b.width);
    widths.forEach((w, i) => expect(w).toBeCloseTo(widths[widths.length - 1 - i]!));
  });

  it("Training Grass keeps its ten even bands", () => {
    expect(trainingGrassBands(160)).toHaveLength(10);
  });
});
