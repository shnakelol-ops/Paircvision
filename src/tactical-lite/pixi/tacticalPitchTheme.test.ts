import { describe, expect, it } from "vitest";

import { resolveTacticalPitchThemeLayers } from "./tacticalPitchTheme";

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

  it("grass (Training Grass) keeps the identical turf and glass but drops markings and goals", () => {
    expect(resolveTacticalPitchThemeLayers("grass")).toEqual({
      face: "turf",
      markings: false,
      goals: false,
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
