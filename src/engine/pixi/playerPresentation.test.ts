import { describe, expect, it } from "vitest";
import { Text } from "pixi.js";

import {
  DEFAULT_TOKEN_SETTINGS,
  DEFAULT_TRAINING_TOKEN_SETTINGS,
  LEGACY_TOKEN_STYLE,
  resolveStoredTokenSettings,
  resolveSurfaceDefaultTokenSettings,
  sanitizePlayerPresentation,
} from "./playerPresentation";
import { VisionV3Renderer, resolvePlayerTokenRenderer } from "./playerTokenRenderer";
import { createVisionV3PlayerToken } from "./createVisionV3PlayerToken";
import { createTacticalSlateDefaultPlayerSeeds, createTacticalSlateInitialPlayerSeeds } from "./tacticalSlateDefaultPlayers";

// Walks the whole token tree: the Slate's Vision V3 draws into an inner art
// container (see VISION_V3_SLATE_ART_SCALE), so labels are not always direct
// children of the token.
function textsOf(token: { children: unknown[] }): string[] {
  const texts: string[] = [];
  const walk = (node: { children?: unknown[] }) => {
    for (const child of node.children ?? []) {
      if (child instanceof Text) texts.push(child.text);
      walk(child as { children?: unknown[] });
    }
  };
  walk(token);
  return texts;
}

const rendererInput = {
  label: "7",
  number: 7,
  teamColor: "blue" as const,
  scale: 1,
  style: {},
  kitPattern: "plain" as const,
  kitPatternColor: 0xffffff,
  radius: 4.1 * 0.8,
};

const SURFACES = ["pitch", "training", "tacticalBoard", "whiteboard"] as const;
const NON_TRAINING = ["pitch", "tacticalBoard", "whiteboard"] as const;

describe("per-board token settings", () => {
  it("new boards: Bib Token at Compact on Training, Vision V3 at Normal everywhere else (today's default)", () => {
    expect(DEFAULT_TRAINING_TOKEN_SETTINGS).toEqual({ style: "bib", size: "compact" });
    expect(DEFAULT_TOKEN_SETTINGS).toEqual({ style: "vision-v3", size: "normal" });
    expect(resolveSurfaceDefaultTokenSettings("training")).toEqual({ style: "bib", size: "compact" });
    for (const surface of NON_TRAINING) {
      expect(resolveSurfaceDefaultTokenSettings(surface)).toEqual({ style: "vision-v3", size: "normal" });
    }
  });

  it("sanitises the stored sizes, including the legacy 'practice' value", () => {
    for (const value of ["normal", "compact", "mini", "practice"]) expect(sanitizePlayerPresentation(value)).toBe(value);
    for (const bad of [undefined, null, "", "Practice", "Mini", "small", 1, {}]) {
      expect(sanitizePlayerPresentation(bad)).toBeNull();
    }
  });

  it("legacy Practice boards open as Bib Token at Compact — the same diameter, still numberless", () => {
    for (const surface of SURFACES) {
      expect(resolveStoredTokenSettings({ playerPresentation: "practice" }, surface)).toEqual({ style: "bib", size: "compact" });
    }
    expect(resolveStoredTokenSettings({ playerPresentation: "practice", playerTokenStyle: "pixi" }, "training")).toEqual({
      style: "bib",
      size: "compact",
    });
  });

  it("boards saved before settings were stored open exactly as they did before", () => {
    // Training boards without metadata opened as Practice → Bib Token at Compact.
    expect(resolveStoredTokenSettings({}, "training")).toEqual({ style: "bib", size: "compact" });
    // Pitch / Tactical Board / Whiteboard boards opened at today's default.
    for (const surface of NON_TRAINING) {
      expect(resolveStoredTokenSettings({}, surface)).toEqual({ style: "vision-v3", size: "normal" });
      expect(resolveStoredTokenSettings({ playerPresentation: "bogus" }, surface)).toEqual({ style: "vision-v3", size: "normal" });
    }
  });

  it("a stored size without a style opens as Vision V3 at that size", () => {
    expect(LEGACY_TOKEN_STYLE).toBe("vision-v3");
    for (const size of ["normal", "compact", "mini"] as const) {
      expect(resolveStoredTokenSettings({ playerPresentation: size }, "training")).toEqual({ style: "vision-v3", size });
      expect(resolveStoredTokenSettings({ playerPresentation: size, playerTokenStyle: "nope" }, "pitch")).toEqual({
        style: "vision-v3",
        size,
      });
    }
  });

  it("current boards open with exactly their stored style and size, on every surface", () => {
    for (const surface of SURFACES) {
      for (const style of ["vision-v3", "pixi", "phosphor", "pill-under", "bib"] as const) {
        for (const size of ["normal", "compact", "mini"] as const) {
          expect(resolveStoredTokenSettings({ playerPresentation: size, playerTokenStyle: style }, surface)).toEqual({ style, size });
        }
      }
    }
  });

  it("is pure: the result depends only on the board passed in, so one board's style never leaks into another", () => {
    const practiceBoard = { playerPresentation: "practice" };
    const olderCompactBoard = { playerPresentation: "compact" };
    resolveStoredTokenSettings(practiceBoard, "training");
    expect(resolveStoredTokenSettings(olderCompactBoard, "training")).toEqual({ style: "vision-v3", size: "compact" });
    expect(practiceBoard).toEqual({ playerPresentation: "practice" });
  });
});

describe("token labels", () => {
  it("Vision V3 draws the number exactly as before", () => {
    const { token } = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 4 });
    expect(textsOf(token)).toEqual(["7", "7"]); // shadow + label text
    expect(textsOf(VisionV3Renderer(rendererInput).token)).toEqual(["7", "7"]);
  });

  it("only the Bib Token is numberless — every other style draws the label", () => {
    // Heroicon ("premium") parses an SVG and Name Badge measures its pill text;
    // both need a DOM, which this environment lacks.
    for (const style of ["classic", "pixi", "phosphor"] as const) {
      expect(textsOf(resolvePlayerTokenRenderer(style)(rendererInput).token)).toContain("7");
    }
    expect(textsOf(resolvePlayerTokenRenderer("bib")(rendererInput).token)).toEqual([]);
  });
});

describe("initial roster", () => {
  it("formation (the default) is exactly today's canonical Gaelic roster: Team A 1–15", () => {
    expect(createTacticalSlateInitialPlayerSeeds()).toEqual(createTacticalSlateDefaultPlayerSeeds());
    expect(createTacticalSlateInitialPlayerSeeds("gaelic", "formation")).toEqual(createTacticalSlateDefaultPlayerSeeds("gaelic"));
    expect(createTacticalSlateInitialPlayerSeeds("gaelic").map((seed) => seed.id)).toEqual(
      Array.from({ length: 15 }, (_, index) => `B${index + 1}`),
    );
  });

  it("Rugby keeps its own XV", () => {
    expect(createTacticalSlateInitialPlayerSeeds("rugby")).toEqual(createTacticalSlateDefaultPlayerSeeds("rugby"));
  });

  it("empty (Training) starts with no players at all", () => {
    expect(createTacticalSlateInitialPlayerSeeds("gaelic", "empty")).toEqual([]);
  });
});
