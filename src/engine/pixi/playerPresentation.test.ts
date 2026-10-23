import { describe, expect, it } from "vitest";
import { Text } from "pixi.js";

import {
  DEFAULT_TRAINING_TOKEN_SETTINGS,
  LEGACY_TRAINING_TOKEN_STYLE,
  resolveStoredTrainingTokenSettings,
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

describe("Training token settings", () => {
  it("new Training boards default to Bib Token at Compact", () => {
    expect(DEFAULT_TRAINING_TOKEN_SETTINGS).toEqual({ style: "bib", size: "compact" });
  });

  it("sanitises the stored sizes, including the legacy 'practice' value", () => {
    expect(sanitizePlayerPresentation("normal")).toBe("normal");
    expect(sanitizePlayerPresentation("compact")).toBe("compact");
    expect(sanitizePlayerPresentation("mini")).toBe("mini");
    expect(sanitizePlayerPresentation("practice")).toBe("practice");
    for (const bad of [undefined, null, "", "Practice", "Mini", "small", 1, {}]) {
      expect(sanitizePlayerPresentation(bad)).toBeNull();
    }
  });

  it("legacy Practice boards open as Bib Token at Compact — the same diameter, still numberless", () => {
    expect(resolveStoredTrainingTokenSettings({ playerPresentation: "practice" })).toEqual({ style: "bib", size: "compact" });
    // even if some later field were present alongside it
    expect(resolveStoredTrainingTokenSettings({ playerPresentation: "practice", playerTokenStyle: "pixi" })).toEqual({
      style: "bib",
      size: "compact",
    });
  });

  it("boards saved before presentations existed (they opened as Practice) open as Bib Token at Compact", () => {
    expect(resolveStoredTrainingTokenSettings({})).toEqual({ style: "bib", size: "compact" });
    expect(resolveStoredTrainingTokenSettings({ playerPresentation: "bogus" })).toEqual({ style: "bib", size: "compact" });
  });

  it("legacy Normal / Compact / Mini boards with no stored style open as Vision V3", () => {
    expect(LEGACY_TRAINING_TOKEN_STYLE).toBe("vision-v3");
    for (const size of ["normal", "compact", "mini"] as const) {
      expect(resolveStoredTrainingTokenSettings({ playerPresentation: size })).toEqual({ style: "vision-v3", size });
      expect(resolveStoredTrainingTokenSettings({ playerPresentation: size, playerTokenStyle: "nope" })).toEqual({
        style: "vision-v3",
        size,
      });
    }
  });

  it("current boards open with exactly their stored style and size", () => {
    for (const style of ["vision-v3", "pixi", "phosphor", "pill-under", "bib"] as const) {
      for (const size of ["normal", "compact", "mini"] as const) {
        expect(resolveStoredTrainingTokenSettings({ playerPresentation: size, playerTokenStyle: style })).toEqual({ style, size });
      }
    }
  });

  it("is pure: the result depends only on the board passed in, so one board's style never leaks into another", () => {
    const practiceBoard = { playerPresentation: "practice" };
    const olderCompactBoard = { playerPresentation: "compact" };
    resolveStoredTrainingTokenSettings(practiceBoard);
    expect(resolveStoredTrainingTokenSettings(olderCompactBoard)).toEqual({ style: "vision-v3", size: "compact" });
    expect(practiceBoard).toEqual({ playerPresentation: "practice" });
  });
});

describe("Vision V3 showLabel:false (retained renderer option)", () => {
  it("Normal/Compact Vision V3 still draws the number exactly as before", () => {
    const { token } = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 4 });
    expect(textsOf(token)).toEqual(["7", "7"]); // shadow + label text
  });

  it("showLabel:false draws no label text at all — not the number, not a '?' placeholder", () => {
    const { token } = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 4, showLabel: false });
    expect(textsOf(token)).toEqual([]);
  });

  it("hides initials and names too, not only numbers", () => {
    for (const label of ["JD", "Seán", "12"]) {
      const { token } = createVisionV3PlayerToken({ label, teamColor: "red", radius: 4, showLabel: false });
      expect(textsOf(token)).toEqual([]);
    }
  });

  it("keeps the whole token body (disc, ring, glyphs) — only the three label layers are dropped", () => {
    const withLabel = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 4 }).token;
    const without = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 4, showLabel: false }).token;
    expect(without.children.length).toBe(withLabel.children.length - 3);
  });

  it("the shared VisionV3Renderer only hides the label when explicitly told to", () => {
    expect(textsOf(VisionV3Renderer(rendererInput).token)).toEqual(["7", "7"]);
    expect(textsOf(VisionV3Renderer({ ...rendererInput, showLabel: false }).token)).toEqual([]);
  });

  it("every other token style ignores showLabel — no numberless variants exist", () => {
    // Heroicon ("premium") parses an SVG and needs a DOM, which this environment lacks.
    for (const style of ["classic", "pixi", "phosphor"] as const) {
      const { token } = resolvePlayerTokenRenderer(style)({ ...rendererInput, showLabel: false });
      const allTexts: string[] = [];
      const walk = (node: { children?: unknown[] }) => {
        for (const child of node.children ?? []) {
          if (child instanceof Text) allTexts.push(child.text);
          walk(child as { children?: unknown[] });
        }
      };
      walk(token);
      expect(allTexts).toContain("7");
    }
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
