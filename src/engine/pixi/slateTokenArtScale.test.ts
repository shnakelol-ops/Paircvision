import { beforeAll, describe, expect, it, vi } from "vitest";
import { CanvasTextMetrics, Container, Graphics, Text } from "pixi.js";

import { createCleanTacticalPlayerToken } from "./createCleanTacticalPlayerToken";
import { createNamePillPlayerToken } from "./createNamePillPlayerToken";
import { VISION_V3_SLATE_ART_SCALE } from "./createVisionV3PlayerToken";
import {
  PhosphorRenderer,
  ProceduralPixiRenderer,
  SELECTABLE_PLAYER_TOKEN_STYLES,
  UnderNamePillRenderer,
  ClassicRingRenderer,
  HeroiconUserCircleRenderer,
  resolvePlayerTokenRenderer,
  sanitizePlayerTokenStyle,
  type PlayerTokenRendererInput,
} from "./playerTokenRenderer";

// Pixi, Phosphor and Name Badge on the Tactical Slate use the same
// supersampled inner-art approach as Vision V3 (see VISION_V3_SLATE_ART_SCALE
// and createVisionV3PlayerToken.test.ts).

type DrawInstruction = {
  action: string;
  data?: {
    path?: { instructions?: { action: string; data: number[] }[] };
    style?: { color?: number; alpha?: number; width?: number };
  };
};

function instructionsOf(g: Graphics): DrawInstruction[] {
  return (g.context as unknown as { instructions: DrawInstruction[] }).instructions;
}

function circleRadii(g: Graphics): number[] {
  return instructionsOf(g)
    .flatMap((inst) => inst.data?.path?.instructions ?? [])
    .filter((pathInst) => pathInst.action === "circle")
    .map((pathInst) => pathInst.data[2]);
}

// No canvas in the node test environment: measure text with a simple metric
// proportional to font size, so label-width fitting (Name Badge) behaves the
// same at any art scale, as real glyph metrics do.
beforeAll(() => {
  vi.spyOn(CanvasTextMetrics, "measureText").mockImplementation((text = " ", style) => {
    const fontSize = Number((style as { fontSize?: number } | undefined)?.fontSize ?? 26);
    const letterSpacing = Number((style as { letterSpacing?: number } | undefined)?.letterSpacing ?? 0);
    const width = text.length * (fontSize * 0.55 + letterSpacing);
    return { width, height: fontSize * 1.2 } as unknown as CanvasTextMetrics;
  });
});

const K = VISION_V3_SLATE_ART_SCALE;
// The Slate's real token radius (PLAYER_RADIUS * TACTICAL_PLAYER_VISUAL_SCALE),
// the 2.8 radius floor (where the absolute stroke floors bind) and a large one.
const RADII = [4.1 * 0.8, 2.8, 10];
const PATTERNS = ["plain", "hoops", "stripes", "slash", "chestDash", "gradient"] as const;
const STYLE = { primaryColor: 0x2563eb, secondaryColor: 0x2563eb, badgeColor: 0x2563eb };

type Factory = (opts: { label: string; radius: number; kitPattern: (typeof PATTERNS)[number]; artScale?: number }) => {
  token: Container;
  shadow: Graphics;
};

const FACTORIES: ReadonlyArray<{ name: string; make: Factory; labels: string[] }> = [
  {
    name: "Pixi",
    make: (o) => createCleanTacticalPlayerToken({ ...o, style: STYLE, kitPatternColor: 0xffffff, variant: "pixi" }),
    labels: ["7", "11", "JD"],
  },
  {
    name: "Phosphor",
    make: (o) => createCleanTacticalPlayerToken({ ...o, style: STYLE, kitPatternColor: 0xffffff, variant: "phosphor" }),
    labels: ["7", "11", "JD"],
  },
  {
    name: "Name Badge (number)",
    make: (o) => createNamePillPlayerToken({ ...o, style: STYLE, kitPatternColor: 0xffffff, number: 11 }),
    labels: ["11", "Dozer", "Pat"],
  },
  {
    name: "Name Badge (no number)",
    make: (o) => createNamePillPlayerToken({ ...o, style: STYLE, kitPatternColor: 0xffffff }),
    labels: ["Dozer"],
  },
];

function artOf(token: Container): Container {
  expect(token.children).toHaveLength(1);
  const art = token.children[0] as Container;
  expect(art).toBeInstanceOf(Container);
  expect(art).not.toBeInstanceOf(Graphics);
  expect(art).not.toBeInstanceOf(Text);
  return art;
}

const rendererInput: PlayerTokenRendererInput = {
  label: "7",
  number: 7,
  teamColor: "blue",
  scale: 0.8,
  style: STYLE,
  kitPattern: "plain",
  kitPatternColor: 0xffffff,
  radius: 4.1 * 0.8,
};

describe.each(FACTORIES)("$name — Slate supersampled art (artScale)", ({ make, labels }) => {
  it("keeps the outer token contract: no own scale/position change, same interaction mode and cursor; only the inner art is scaled by 1/K", () => {
    const legacy = make({ label: labels[0]!, radius: 3.28, kitPattern: "plain" });
    const hi = make({ label: labels[0]!, radius: 3.28, kitPattern: "plain", artScale: K });
    expect(hi.token.scale.x).toBe(legacy.token.scale.x);
    expect(hi.token.scale.y).toBe(legacy.token.scale.y);
    expect(hi.token.eventMode).toBe(legacy.token.eventMode);
    expect(hi.token.cursor).toBe(legacy.token.cursor);
    expect(hi.token.position.x).toBe(0);
    expect(hi.token.position.y).toBe(0);
    const art = artOf(hi.token);
    expect(art.scale.x).toBeCloseTo(1 / K, 12);
    expect(art.scale.y).toBeCloseTo(1 / K, 12);
    // The returned shadow is the art's own shadow graphic, so the surface's
    // drag-shadow alpha animation still drives it.
    expect(art.children).toContain(hi.shadow);
  });

  it("draws every shape at exactly K times the legacy geometry (on-board size unchanged), strokes and floors included", () => {
    for (const radius of RADII) {
      for (const kitPattern of PATTERNS) {
        const legacyNodes = make({ label: labels[0]!, radius, kitPattern }).token.children;
        const hiNodes = artOf(make({ label: labels[0]!, radius, kitPattern, artScale: K }).token).children;
        expect(hiNodes.length).toBe(legacyNodes.length);
        hiNodes.forEach((node, i) => {
          const before = legacyNodes[i]!;
          expect(node.constructor).toBe(before.constructor);
          expect(node.position.x / K).toBeCloseTo(before.position.x, 9);
          expect(node.position.y / K).toBeCloseTo(before.position.y, 9);
          if (node instanceof Graphics) {
            const a = (before as Graphics).getLocalBounds();
            const b = node.getLocalBounds();
            expect(b.minX / K).toBeCloseTo(a.minX, 6);
            expect(b.minY / K).toBeCloseTo(a.minY, 6);
            expect(b.maxX / K).toBeCloseTo(a.maxX, 6);
            expect(b.maxY / K).toBeCloseTo(a.maxY, 6);
            // Same fills/strokes in the same order: colours, alphas intact and
            // every stroke width (including the absolute floors) scaled by K.
            const styles = (g: Graphics, k: number) =>
              instructionsOf(g).map((inst) => [
                inst.action,
                inst.data?.style?.color,
                inst.data?.style?.alpha,
                inst.action === "stroke" ? Number(((inst.data?.style?.width ?? 0) / k).toFixed(9)) : null,
              ]);
            expect(styles(node, K)).toEqual(styles(before as Graphics, 1));
          }
        });
      }
    }
  });

  it("scales label font size, outline width, letter spacing and position by K — text, colour and alpha unchanged", () => {
    for (const radius of RADII) {
      for (const label of labels) {
        const legacyTexts = make({ label, radius, kitPattern: "plain" }).token.children.filter(
          (c): c is Text => c instanceof Text,
        );
        const hiTexts = artOf(make({ label, radius, kitPattern: "plain", artScale: K }).token).children.filter(
          (c): c is Text => c instanceof Text,
        );
        expect(hiTexts.length).toBeGreaterThan(0);
        expect(hiTexts.map((t) => t.text)).toEqual(legacyTexts.map((t) => t.text));
        hiTexts.forEach((text, i) => {
          const before = legacyTexts[i]!;
          expect(Number(text.style.fontSize) / K).toBeCloseTo(Number(before.style.fontSize), 9);
          expect(text.style.letterSpacing / K).toBeCloseTo(before.style.letterSpacing, 9);
          expect((text.style.stroke as { width?: number } | null)?.width ?? 0).toBeCloseTo(
            ((before.style.stroke as { width?: number } | null)?.width ?? 0) * K,
            9,
          );
          expect(text.position.x / K).toBeCloseTo(before.position.x, 9);
          expect(text.position.y / K).toBeCloseTo(before.position.y, 9);
          expect(text.style.fill).toEqual(before.style.fill);
          expect(text.alpha).toBe(before.alpha);
          expect(text.resolution).toBe(before.resolution);
        });
      }
    }
  });

  it("gives any token circle enough local radius for Pixi to tessellate it smoothly (>= 64 segments)", () => {
    const art = artOf(make({ label: labels[0]!, radius: 4.1 * 0.8, kitPattern: "plain", artScale: K }).token);
    const radii = art.children.filter((c): c is Graphics => c instanceof Graphics).flatMap(circleRadii);
    // A Name Badge without a number is a pill only — no circle to tessellate.
    if (radii.length === 0) return;
    const radius = Math.max(...radii);
    // Pixi v8 buildCircle: segments = 4 * ceil(2.3 * sqrt(rx + ry)).
    expect(4 * Math.ceil(2.3 * Math.sqrt(radius * 2))).toBeGreaterThanOrEqual(64);
  });

  it("artScale 1 (the default, used by movement-board) draws straight into the token as before", () => {
    const { token } = make({ label: labels[0]!, radius: 3.28, kitPattern: "plain" });
    expect(token.children.some((c) => c instanceof Text)).toBe(true);
    expect(token.children.every((c) => c instanceof Graphics || c instanceof Text)).toBe(true);
  });
});

describe("Tactical Slate renderers — supersampled token styles", () => {
  it.each([
    ["Pixi", ProceduralPixiRenderer],
    ["Phosphor", PhosphorRenderer],
    ["Name Badge", UnderNamePillRenderer],
  ] as const)("%s opts into the supersampled art and keeps the caller's token scale", (_name, renderer) => {
    const { token, shadow } = renderer(rendererInput);
    expect(token.scale.x).toBe(rendererInput.scale);
    expect(token.scale.y).toBe(rendererInput.scale);
    const art = artOf(token);
    expect(art.scale.x).toBeCloseTo(1 / K, 12);
    expect(art.children).toContain(shadow);
  });
});

describe("Player Tokens style consolidation", () => {
  it("offers Vision V3 (first, the default), Pixi, Phosphor and Name Badge only", () => {
    expect(SELECTABLE_PLAYER_TOKEN_STYLES).toEqual(["vision-v3", "pixi", "phosphor", "pill-under"]);
    expect(SELECTABLE_PLAYER_TOKEN_STYLES).not.toContain("classic");
    expect(SELECTABLE_PLAYER_TOKEN_STYLES).not.toContain("premium");
  });

  it("still accepts the retired values without rewriting them, and the legacy torso value still maps to classic", () => {
    expect(sanitizePlayerTokenStyle("classic")).toBe("classic");
    expect(sanitizePlayerTokenStyle("premium")).toBe("premium");
    expect(sanitizePlayerTokenStyle("torso")).toBe("classic");
    expect(sanitizePlayerTokenStyle(undefined)).toBe("vision-v3");
    expect(sanitizePlayerTokenStyle("unknown")).toBe("vision-v3");
  });

  it("still draws the retired values with their original renderers", () => {
    expect(resolvePlayerTokenRenderer("classic")).toBe(ClassicRingRenderer);
    expect(resolvePlayerTokenRenderer("premium")).toBe(HeroiconUserCircleRenderer);
  });
});
