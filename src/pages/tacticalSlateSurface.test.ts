import { describe, expect, it } from "vitest";

import type { PitchSport } from "../core/pitch/pitch-config";
import {
  TACTICAL_SLATE_SURFACES,
  TACTICAL_SLATE_SURFACE_LABELS,
  TACTICAL_SLATE_SURFACE_ROUTES,
  resolveBoardStorageNamespace,
  resolveSurfacePitchTheme,
} from "./tacticalSlateSurface";

describe("Tactical Slate surfaces — routes and labels", () => {
  it("lists the three surfaces in Options order, Gaelic Pitch first", () => {
    expect(TACTICAL_SLATE_SURFACES).toEqual(["pitch", "training", "whiteboard"]);
  });

  it("keeps the public Gaelic Pitch on the existing /vision-board route", () => {
    expect(TACTICAL_SLATE_SURFACE_ROUTES.pitch).toBe("/vision-board");
  });

  it("puts Training Grass and Whiteboard on their own /vision-board sub-routes", () => {
    expect(TACTICAL_SLATE_SURFACE_ROUTES.training).toBe("/vision-board/training");
    expect(TACTICAL_SLATE_SURFACE_ROUTES.whiteboard).toBe("/vision-board/whiteboard");
  });

  it("never reuses the legacy /whiteboard path (still redirected to /vision-board)", () => {
    expect(Object.values(TACTICAL_SLATE_SURFACE_ROUTES)).not.toContain("/whiteboard");
  });

  it("uses the approved coach-facing names", () => {
    expect(TACTICAL_SLATE_SURFACE_LABELS).toEqual({
      pitch: "Gaelic Pitch",
      training: "Training Grass",
      whiteboard: "Whiteboard",
    });
  });
});

describe("resolveSurfacePitchTheme", () => {
  it("maps Pitch to the unchanged default renderer", () => {
    expect(resolveSurfacePitchTheme("pitch")).toBe("default");
  });

  it("maps Training to grass and Whiteboard to the existing whiteboard theme", () => {
    expect(resolveSurfacePitchTheme("training")).toBe("grass");
    expect(resolveSurfacePitchTheme("whiteboard")).toBe("whiteboard");
  });
});

describe("resolveBoardStorageNamespace", () => {
  it("the public Gaelic Pitch resolves to \"\" — the exact existing GAA keys", () => {
    expect(resolveBoardStorageNamespace("gaelic", "pitch")).toBe("");
  });

  it("matches the previous sport-only namespace for every sport on the Pitch surface", () => {
    const sports: PitchSport[] = ["gaelic", "hurling", "camogie", "soccer", "rugby"];
    for (const sport of sports) {
      const previous = sport === "gaelic" ? "" : sport;
      expect(resolveBoardStorageNamespace(sport, "pitch")).toBe(previous);
    }
  });

  it("gives Training Grass and Whiteboard their own namespaces", () => {
    expect(resolveBoardStorageNamespace("gaelic", "training")).toBe("training");
    expect(resolveBoardStorageNamespace("gaelic", "whiteboard")).toBe("whiteboard");
  });

  it("never collides between surfaces, or with the Rugby namespace", () => {
    const namespaces = [
      resolveBoardStorageNamespace("gaelic", "pitch"),
      resolveBoardStorageNamespace("gaelic", "training"),
      resolveBoardStorageNamespace("gaelic", "whiteboard"),
      resolveBoardStorageNamespace("rugby", "pitch"),
      resolveBoardStorageNamespace("rugby", "training"),
    ];
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });
});
