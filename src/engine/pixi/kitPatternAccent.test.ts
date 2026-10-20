import { beforeAll, describe, expect, it, vi } from "vitest";
import { CanvasTextMetrics, Container, Graphics, Text } from "pixi.js";

import { FULL_VISION_PATTERNS } from "../../components/player-kit/playerKitPatterns";
import { createCleanTacticalPlayerToken } from "./createCleanTacticalPlayerToken";
import { createNamePillPlayerToken, UNDER_PILL_NORMAL_SHRINK } from "./createNamePillPlayerToken";
import {
  VISION_V3_SLATE_ART_SCALE,
  createVisionV3PlayerToken,
  resolveVisionV3DiscRadius,
  type VisionV3KitPattern,
} from "./createVisionV3PlayerToken";
import {
  KIT_GRADIENT_FACE_LIGHTEN,
  KIT_PATTERN_RADIUS_TO_FACE,
  drawKitPatternAccent,
  kitPatternHasBands,
} from "./kitPatternAccent";
import {
  PhosphorRenderer,
  ProceduralPixiRenderer,
  UnderNamePillRenderer,
  resolvePlayerTokenRenderer,
  type PlayerTokenRendererInput,
} from "./playerTokenRenderer";

type PathInstruction = { action: string; data: unknown[] };
type DrawInstruction = {
  action: string;
  data?: {
    path?: { instructions?: PathInstruction[] };
    style?: { color?: number; alpha?: number; width?: number };
  };
};

function instructionsOf(g: Graphics): DrawInstruction[] {
  return (g.context as unknown as { instructions: DrawInstruction[] }).instructions;
}

/**
 * Shape + paint of every instruction, numbers rounded so float noise can't
 * mask a real difference. Pen moves are dropped: Pixi records a bookkeeping
 * moveTo when a shape follows earlier drawing on the same Graphics (as in
 * Vision V3's disc); the bands themselves are only rects and polygons.
 */
function shapesOf(instructions: DrawInstruction[]): unknown[] {
  const round = (v: unknown): unknown =>
    typeof v === "number" ? Number(v.toFixed(9)) : Array.isArray(v) ? v.map(round) : v;
  return instructions.map((inst) => ({
    action: inst.action,
    color: inst.data?.style?.color,
    alpha: inst.data?.style?.alpha,
    path: (inst.data?.path?.instructions ?? [])
      .filter((p) => p.action !== "moveTo")
      .map((p) => ({ action: p.action, data: round(p.data) })),
  }));
}

function circleRadii(g: Graphics): number[] {
  return instructionsOf(g)
    .flatMap((inst) => inst.data?.path?.instructions ?? [])
    .filter((p) => p.action === "circle")
    .map((p) => p.data[2] as number);
}

function walk(node: Container, out: Container[] = []): Container[] {
  for (const child of node.children) {
    out.push(child as Container);
    walk(child as Container, out);
  }
  return out;
}

function firstFillColor(g: Graphics, index: number): number | undefined {
  return instructionsOf(g).filter((i) => i.action === "fill")[index]?.data?.style?.color;
}

function mix(base: number, target: number, amount: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.max(0, Math.min(255, Math.round(ch(base, s) + (ch(target, s) - ch(base, s)) * amount)));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

// No canvas in the node test environment: measure text with a metric
// proportional to font size (Name Badge fits its pill label to width).
beforeAll(() => {
  vi.spyOn(CanvasTextMetrics, "measureText").mockImplementation((text = " ", style) => {
    const fontSize = Number((style as { fontSize?: number } | undefined)?.fontSize ?? 26);
    return { width: text.length * fontSize * 0.55, height: fontSize * 1.2 } as unknown as CanvasTextMetrics;
  });
});

const K = VISION_V3_SLATE_ART_SCALE;
const SLATE_RADIUS = 4.1 * 0.8;
const BLUE = 0x2563eb;
const WHITE = 0xffffff;
const BANDED: VisionV3KitPattern[] = ["hoops", "stripes", "slash", "chestDash"];

describe("kitPatternAccent — parity with Vision V3's own pattern geometry", () => {
  // Vision V3 (unmodified) draws its bands into the masked core disc after
  // the face fill and its two depth ellipses, at innerRadius * 0.9.
  function visionV3Bands(radius: number, pattern: VisionV3KitPattern, artScale: number) {
    const { token } = createVisionV3PlayerToken({
      label: "7",
      teamColor: "blue",
      radius,
      kitPattern: pattern,
      kitPatternColor: WHITE,
      artScale,
    });
    const disc = walk(token).find((n): n is Graphics => n instanceof Graphics && Boolean(n.mask))!;
    const unit = artScale > 1 ? artScale : 1;
    const discRadius = resolveVisionV3DiscRadius(radius) * unit;
    const innerRadius = discRadius - Math.max(0.58 * unit, discRadius * 0.2);
    const rimWidth = Math.max(0.16 * unit, discRadius * 0.045);
    return {
      instructions: instructionsOf(disc).slice(3),
      patternRadius: innerRadius * 0.9,
      faceRadius: discRadius - rimWidth,
    };
  }

  for (const pattern of FULL_VISION_PATTERNS) {
    it(`${pattern}: draws exactly Vision V3's shapes, colour and opacity`, () => {
      for (const radius of [SLATE_RADIUS, 2.8, 10]) {
        for (const artScale of [1, K]) {
          const v3 = visionV3Bands(radius, pattern, artScale);
          const shared = new Graphics();
          drawKitPatternAccent(shared, pattern, WHITE, v3.patternRadius, 1);
          expect(shapesOf(instructionsOf(shared))).toEqual(shapesOf(v3.instructions));
        }
      }
    });
  }

  it("KIT_PATTERN_RADIUS_TO_FACE is Vision V3's band-radius / face-radius ratio (Slate radius and unclamped radii)", () => {
    for (const radius of [SLATE_RADIUS, 10]) {
      const { patternRadius, faceRadius } = visionV3Bands(radius, "stripes", K);
      expect(patternRadius / faceRadius).toBeCloseTo(KIT_PATTERN_RADIUS_TO_FACE, 2);
    }
  });

  it("only Hoops, Stripes, Slash and Chest Dash draw bands", () => {
    expect(FULL_VISION_PATTERNS.filter(kitPatternHasBands)).toEqual(BANDED);
  });
});

type Style = "pixi" | "phosphor" | "pill";
const STYLES: ReadonlyArray<{ name: Style; faceRadius: (safeRadius: number) => number }> = [
  { name: "pixi", faceRadius: (r) => r * 0.82 },
  { name: "phosphor", faceRadius: (r) => r * 0.82 },
  { name: "pill", faceRadius: (r) => r * UNDER_PILL_NORMAL_SHRINK },
];

function make(style: Style, pattern: VisionV3KitPattern, opts: { primaryColor?: number; artScale?: number; kitPatternColor?: number | null } = {}) {
  const kitPatternColor = opts.kitPatternColor === null ? undefined : (opts.kitPatternColor ?? WHITE);
  const common = {
    radius: SLATE_RADIUS,
    kitPattern: pattern,
    kitPatternColor,
    style: { primaryColor: opts.primaryColor ?? BLUE },
    artScale: opts.artScale,
  };
  return style === "pill"
    ? createNamePillPlayerToken({ ...common, label: "Dozer", number: 11 })
    : createCleanTacticalPlayerToken({ ...common, label: "11", variant: style });
}

function maskedLayers(token: Container): Graphics[] {
  return walk(token).filter((n): n is Graphics => n instanceof Graphics && Boolean(n.mask));
}

describe.each(STYLES)("$name — Vision V3 kit bands, clipped to the style's own face", ({ name, faceRadius }) => {
  for (const artScale of [1, K]) {
    const unit = artScale > 1 ? artScale : 1;
    const face = faceRadius(Math.max(2.8, SLATE_RADIUS) * unit);

    for (const pattern of BANDED) {
      it(`${pattern} (artScale ${artScale}): one band layer, Vision V3 geometry at face × ratio, masked to the face circle, under the rings`, () => {
        const { token } = make(name, pattern, { artScale });
        const layers = maskedLayers(token);
        expect(layers).toHaveLength(1);
        const layer = layers[0]!;

        const expected = new Graphics();
        drawKitPatternAccent(expected, pattern, WHITE, face * KIT_PATTERN_RADIUS_TO_FACE, 1);
        expect(shapesOf(instructionsOf(layer))).toEqual(shapesOf(instructionsOf(expected)));

        const mask = layer.mask as Graphics;
        expect(layer.children).toContain(mask);
        expect(circleRadii(mask)).toHaveLength(1);
        expect(circleRadii(mask)[0]).toBeCloseTo(face, 9);

        // Draw order: face fill below the bands, the style's own rim/border
        // strokes (and the number) above them.
        const parent = layer.parent!;
        const index = parent.children.indexOf(layer);
        const below = parent.children[index - 1] as Graphics;
        const above = parent.children[index + 1] as Graphics;
        expect(instructionsOf(below).every((i) => i.action === "fill")).toBe(true);
        expect(instructionsOf(above).length).toBeGreaterThan(0);
        expect(instructionsOf(above).every((i) => i.action === "stroke")).toBe(true);
        expect(parent.children.slice(index + 1).some((c) => c instanceof Text)).toBe(true);
      });
    }

    it(`plain and gradient (artScale ${artScale}) draw no band layer and no mask`, () => {
      expect(maskedLayers(make(name, "plain", { artScale }).token)).toHaveLength(0);
      expect(maskedLayers(make(name, "gradient", { artScale }).token)).toHaveLength(0);
    });
  }

  it("gradient lightens the face 12% toward white, exactly as Vision V3; plain keeps the kit colour", () => {
    const faceFill = (pattern: VisionV3KitPattern) => {
      // The face graphic is the first one with a circle (shadow is an
      // ellipse, the badge's pill a rounded rect). Its fills — Pixi: outline,
      // ring, face; Phosphor: halo, outer, face; Badge: the circle.
      const g = walk(make(name, pattern).token).find((n): n is Graphics => n instanceof Graphics && circleRadii(n).length > 0)!;
      const fills = instructionsOf(g).filter((i) => i.action === "fill");
      return fills[name === "pill" ? 0 : 2]!.data!.style!.color!;
    };
    const plainFace = faceFill("plain");
    expect(faceFill("gradient")).toBe(mix(plainFace, WHITE, KIT_GRADIENT_FACE_LIGHTEN));
    expect(faceFill("hoops")).toBe(plainFace);
  });

  it("draws a coach-picked pattern colour exactly, at full opacity", () => {
    for (const colour of [WHITE, 0xfacc15, 0x111827]) {
      const layer = maskedLayers(make(name, "stripes", { kitPatternColor: colour }).token)[0]!;
      const fills = instructionsOf(layer).filter((i) => i.action === "fill");
      expect(fills.length).toBe(3);
      for (const fill of fills) {
        expect(fill.data?.style?.color).toBe(colour);
        expect(fill.data?.style?.alpha).toBe(1);
      }
    }
  });

  it("plain tokens are unchanged: no extra layers, a single face graphic carrying both fills and strokes", () => {
    const { token } = make(name, "plain");
    const graphics = token.children.filter((c): c is Graphics => c instanceof Graphics);
    const face = graphics.find((g) => instructionsOf(g).some((i) => i.action === "stroke"))!;
    const actions = instructionsOf(face).map((i) => i.action);
    expect(actions).toEqual(name === "pill" ? ["fill", "stroke"] : ["fill", "fill", "fill", "stroke", "stroke"]);
  });
});

describe("Name Badge — number outline only behind kit bands", () => {
  function numberText(pattern: VisionV3KitPattern, primaryColor = BLUE): Text {
    const { token } = make("pill", pattern, { primaryColor });
    return walk(token).filter((n): n is Text => n instanceof Text).find((t) => t.text === "11")!;
  }

  it("plain and gradient numbers have no outline (drawn exactly as before)", () => {
    expect(numberText("plain").style.stroke).toBeFalsy();
    expect(numberText("gradient").style.stroke).toBeFalsy();
  });

  it("banded numbers get a thin outline that contrasts with the number on dark and light kits", () => {
    for (const pattern of BANDED) {
      // Dark kit: white number, dark outline.
      const dark = numberText(pattern, BLUE);
      expect(dark.style.fill).toBe(WHITE);
      const darkStroke = dark.style.stroke as { color: number; width: number };
      expect(darkStroke.color).toBe(0x020617);
      // Light kit: dark number, light outline.
      const light = numberText(pattern, 0xfacc15);
      expect(light.style.fill).toBe(0x0f172a);
      expect((light.style.stroke as { color: number }).color).toBe(WHITE);
      // Thin: 12% of the circle radius (the Pixi number outline is 20%).
      const circleRadius = Math.max(2.8, SLATE_RADIUS) * UNDER_PILL_NORMAL_SHRINK;
      expect(darkStroke.width).toBeCloseTo(circleRadius * 0.12, 9);
    }
  });

  it("the pill label itself never gets the outline or the bands", () => {
    const { token } = make("pill", "stripes");
    const name = walk(token).filter((n): n is Text => n instanceof Text).find((t) => t.text === "Dozer")!;
    expect(name.style.stroke).toBeFalsy();
  });
});

describe("Pattern routing — all six patterns reach Pixi, Phosphor and Name Badge", () => {
  const input: PlayerTokenRendererInput = {
    label: "7",
    number: 7,
    teamColor: "blue",
    scale: 0.8,
    style: { primaryColor: BLUE, secondaryColor: BLUE, badgeColor: BLUE },
    kitPattern: "plain",
    kitPatternColor: WHITE,
    radius: SLATE_RADIUS,
  };

  for (const [name, renderer] of [
    ["Pixi", ProceduralPixiRenderer],
    ["Phosphor", PhosphorRenderer],
    ["Name Badge", UnderNamePillRenderer],
  ] as const) {
    it(`${name}: Chest Dash draws bands and Gradient lightens the face (no legacy downgrade to plain)`, () => {
      expect(maskedLayers(renderer({ ...input, kitPattern: "chestDash" }).token)).toHaveLength(1);
      const fills = (pattern: VisionV3KitPattern) =>
        walk(renderer({ ...input, kitPattern: pattern }).token)
          .filter((n): n is Graphics => n instanceof Graphics)
          .flatMap((g) => instructionsOf(g).filter((i) => i.action === "fill").map((i) => i.data!.style!.color!));
      const plain = fills("plain");
      const gradient = fills("gradient");
      // Exactly one fill differs: the face, lightened 12% toward white.
      const changed = gradient.map((c, i) => [plain[i]!, c] as const).filter(([a, b]) => a !== b);
      expect(changed).toHaveLength(1);
      expect(changed[0]![1]).toBe(mix(changed[0]![0], WHITE, KIT_GRADIENT_FACE_LIGHTEN));
    });
  }

  it("the retired Classic style still receives the legacy conversion (Chest Dash draws as plain)", () => {
    const render = resolvePlayerTokenRenderer("classic");
    const chest = render({ ...input, kitPattern: "chestDash" }).token;
    const plain = render({ ...input, kitPattern: "plain" }).token;
    const fills = (t: Container) =>
      walk(t)
        .filter((n): n is Graphics => n instanceof Graphics)
        .map((g) => shapesOf(instructionsOf(g)));
    expect(fills(chest)).toEqual(fills(plain));
  });

  it("first fill of a plain Pixi face is still the kit colour", () => {
    const g = walk(ProceduralPixiRenderer(input).token).filter((n): n is Graphics => n instanceof Graphics)[1]!;
    expect(firstFillColor(g, 2)).toBe(BLUE);
  });
});
