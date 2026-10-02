import { describe, expect, it } from "vitest";
import { Text } from "pixi.js";

import {
  DEFAULT_TRAINING_PLAYER_PRESENTATION,
  playerPresentationFlags,
  resolvePlayerPresentation,
  sanitizePlayerPresentation,
} from "./playerPresentation";
import { VisionV3Renderer, resolvePlayerTokenRenderer } from "./playerTokenRenderer";
import { createVisionV3PlayerToken } from "./createVisionV3PlayerToken";
import { createTacticalSlateDefaultPlayerSeeds, createTacticalSlateInitialPlayerSeeds } from "./tacticalSlateDefaultPlayers";

function textsOf(token: { children: unknown[] }): string[] {
  return token.children.filter((child): child is Text => child instanceof Text).map((t) => t.text);
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

describe("player presentation state", () => {
  it("new Training boards (and legacy ones with no metadata) default to Practice", () => {
    expect(DEFAULT_TRAINING_PLAYER_PRESENTATION).toBe("practice");
  });

  it("sanitises to the three presentations only", () => {
    expect(sanitizePlayerPresentation("normal")).toBe("normal");
    expect(sanitizePlayerPresentation("compact")).toBe("compact");
    expect(sanitizePlayerPresentation("practice")).toBe("practice");
    for (const bad of [undefined, null, "", "Practice", "small", 1, {}]) {
      expect(sanitizePlayerPresentation(bad)).toBeNull();
    }
  });

  it("round-trips between the presentation and the engine's compact/practice flags", () => {
    for (const presentation of ["normal", "compact", "practice"] as const) {
      expect(resolvePlayerPresentation(playerPresentationFlags(presentation))).toBe(presentation);
    }
    // Practice wins even if Compact were also set — it already uses the Compact scale.
    expect(resolvePlayerPresentation({ compact: true, practice: true })).toBe("practice");
  });
});

describe("Practice token rendering (Vision V3, no identity label)", () => {
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
