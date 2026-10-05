import { describe, expect, it } from "vitest";

import type { PitchSport } from "../core/pitch/pitch-config";
import {
  PLAYER_PRESENTATION_CHOICES,
  TACTICAL_SLATE_SURFACES,
  TACTICAL_SLATE_SURFACE_LABELS,
  TACTICAL_SLATE_SURFACE_ROUTES,
  resolveBoardStorageNamespace,
  resolveSurfaceDefaultPlayerPresentation,
  resolveSurfaceInitialRoster,
  resolveSurfacePitchTheme,
  surfaceUsesDarkWatermark,
  surfaceUsesPlayerPresentation,
  surfaceUsesPracticeAreas,
} from "./tacticalSlateSurface";

describe("Tactical Slate surfaces — routes and labels", () => {
  it("lists the four surfaces in Options order, Gaelic Pitch first", () => {
    expect(TACTICAL_SLATE_SURFACES).toEqual(["pitch", "training", "tacticalBoard", "whiteboard"]);
  });

  it("keeps the public Gaelic Pitch on the existing /vision-board route", () => {
    expect(TACTICAL_SLATE_SURFACE_ROUTES.pitch).toBe("/vision-board");
  });

  it("puts Training Grass, Tactical Board and Whiteboard on their own /vision-board sub-routes", () => {
    expect(TACTICAL_SLATE_SURFACE_ROUTES.training).toBe("/vision-board/training");
    expect(TACTICAL_SLATE_SURFACE_ROUTES.tacticalBoard).toBe("/vision-board/tactical");
    expect(TACTICAL_SLATE_SURFACE_ROUTES.whiteboard).toBe("/vision-board/whiteboard");
  });

  it("never reuses the legacy /whiteboard path (still redirected to /vision-board)", () => {
    expect(Object.values(TACTICAL_SLATE_SURFACE_ROUTES)).not.toContain("/whiteboard");
  });

  it("uses the approved coach-facing names", () => {
    expect(TACTICAL_SLATE_SURFACE_LABELS).toEqual({
      pitch: "Gaelic Pitch",
      training: "Training Grass",
      tacticalBoard: "Tactical Board",
      whiteboard: "Whiteboard",
    });
  });
});

describe("resolveSurfacePitchTheme", () => {
  it("maps the Gaelic Pitch to the mown-band Gaelic theme", () => {
    expect(resolveSurfacePitchTheme("pitch")).toBe("gaelicBands");
    expect(resolveSurfacePitchTheme("pitch", "gaelic")).toBe("gaelicBands");
  });

  it("keeps the original turf for Tactical Board and for any non-Gaelic sport on the Pitch surface (Rugby)", () => {
    expect(resolveSurfacePitchTheme("tacticalBoard")).toBe("default");
    expect(resolveSurfacePitchTheme("pitch", "rugby")).toBe("default");
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

  it("gives Tactical Board its own namespace", () => {
    expect(resolveBoardStorageNamespace("gaelic", "tacticalBoard")).toBe("tacticalBoard");
  });

  it("gives Training Grass and Whiteboard their own namespaces", () => {
    expect(resolveBoardStorageNamespace("gaelic", "training")).toBe("training");
    expect(resolveBoardStorageNamespace("gaelic", "whiteboard")).toBe("whiteboard");
  });

  it("never collides between surfaces, or with the Rugby namespace", () => {
    const namespaces = [
      resolveBoardStorageNamespace("gaelic", "pitch"),
      resolveBoardStorageNamespace("gaelic", "training"),
      resolveBoardStorageNamespace("gaelic", "tacticalBoard"),
      resolveBoardStorageNamespace("gaelic", "whiteboard"),
      resolveBoardStorageNamespace("rugby", "pitch"),
      resolveBoardStorageNamespace("rugby", "training"),
    ];
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });
});

describe("Training starting roster", () => {
  it("only Training Grass starts empty; Pitch and Whiteboard keep the formation", () => {
    expect(resolveSurfaceInitialRoster("training")).toBe("empty");
    expect(resolveSurfaceInitialRoster("pitch")).toBe("formation");
    expect(resolveSurfaceInitialRoster("tacticalBoard")).toBe("formation");
    expect(resolveSurfaceInitialRoster("whiteboard")).toBe("formation");
  });
});

describe("player presentation by surface", () => {
  it("only Training offers and saves Normal / Compact / Practice", () => {
    expect(surfaceUsesPlayerPresentation("training")).toBe(true);
    expect(surfaceUsesPlayerPresentation("pitch")).toBe(false);
    expect(surfaceUsesPlayerPresentation("tacticalBoard")).toBe(false);
    expect(surfaceUsesPlayerPresentation("whiteboard")).toBe(false);
  });

  it("Training defaults to Practice; Pitch and Whiteboard keep today's Normal default", () => {
    expect(resolveSurfaceDefaultPlayerPresentation("training")).toBe("practice");
    expect(resolveSurfaceDefaultPlayerPresentation("pitch")).toBe("normal");
    expect(resolveSurfaceDefaultPlayerPresentation("whiteboard")).toBe("normal");
  });

  it("offers Normal | Compact | Practice in that order", () => {
    expect(PLAYER_PRESENTATION_CHOICES.map((choice) => choice.label)).toEqual(["Normal", "Compact", "Practice"]);
  });
});

describe("Practice Areas by surface", () => {
  it("only Training Grass turns rectangles into Practice Areas; Pitch and Whiteboard keep filled tactical zones", () => {
    expect(surfaceUsesPracticeAreas("training")).toBe(true);
    expect(surfaceUsesPracticeAreas("pitch")).toBe(false);
    expect(surfaceUsesPracticeAreas("tacticalBoard")).toBe(false);
    expect(surfaceUsesPracticeAreas("whiteboard")).toBe(false);
  });
});

describe("watermark by surface", () => {
  it("only the Whiteboard uses the black watermark; Gaelic Pitch, Training Grass and Tactical Board keep the standard one", () => {
    expect(surfaceUsesDarkWatermark("whiteboard")).toBe(true);
    expect(surfaceUsesDarkWatermark("pitch")).toBe(false);
    expect(surfaceUsesDarkWatermark("training")).toBe(false);
    expect(surfaceUsesDarkWatermark("tacticalBoard")).toBe(false);
  });
});
