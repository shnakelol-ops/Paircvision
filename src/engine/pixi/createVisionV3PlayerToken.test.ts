import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";

import { createVisionV3PlayerToken } from "./createVisionV3PlayerToken";

type DrawInstruction = {
  action: string;
  data?: {
    path?: { instructions?: { action: string; data: number[] }[] };
    style?: { color?: number; alpha?: number };
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

describe("createVisionV3PlayerToken — crisp depth disc", () => {
  it("draws the rim as its own unmasked, opaque, full-discRadius circle (regression lock for the invisible-rim masking bug)", () => {
    const { token } = createVisionV3PlayerToken({ label: "9", teamColor: "yellow", radius: 10 });
    const rim = token.children.find(
      (child) => child instanceof Graphics && circleRadii(child as Graphics).some((r) => Math.abs(r - 10 * 1.06) < 1e-6),
    ) as Graphics | undefined;

    expect(rim).toBeDefined();
    expect(rim!.mask).toBeFalsy();

    const fills = instructionsOf(rim!).filter((inst) => inst.action === "fill");
    expect(fills).toHaveLength(1);
    expect(fills[0]!.data?.style?.alpha ?? 1).toBe(1);
  });

  it("masks only the core face, and the core's own fill radius is strictly inside discRadius (a real, visible rim band)", () => {
    const { token } = createVisionV3PlayerToken({ label: "9", teamColor: "yellow", radius: 10 });
    const discRadius = 10 * 1.06;
    const masked = token.children.find(
      (child) => child instanceof Graphics && (child as Graphics).mask,
    ) as Graphics | undefined;

    expect(masked).toBeDefined();
    const coreRadius = circleRadii(masked!)[0]!;
    expect(coreRadius).toBeLessThan(discRadius);
    expect(coreRadius).toBeGreaterThan(discRadius * 0.9);
  });

  it("never darkens the whole face toward black — the core fill is the team's own primary colour", () => {
    const { token } = createVisionV3PlayerToken({ label: "9", teamColor: "yellow", radius: 10 });
    const masked = token.children.find(
      (child) => child instanceof Graphics && (child as Graphics).mask,
    ) as Graphics;
    const firstFill = instructionsOf(masked).find((inst) => inst.action === "fill");
    expect(firstFill?.data?.style?.color).toBe(0xf2c94c);
  });

  it("yellow team default uses PáircVision yellow 0xF2C94C", () => {
    const { token } = createVisionV3PlayerToken({ label: "1", teamColor: "yellow", radius: 10 });
    const masked = token.children.find(
      (child) => child instanceof Graphics && (child as Graphics).mask,
    ) as Graphics;
    const firstFill = instructionsOf(masked).find((inst) => inst.action === "fill");
    expect(firstFill?.data?.style?.color).toBe(0xf2c94c);
  });

  it("uses no blur/glow filters anywhere in the token tree", () => {
    const { token, shadow } = createVisionV3PlayerToken({ label: "9", teamColor: "yellow", radius: 10 });
    const allNodes = [token, shadow, ...token.children];
    for (const node of allNodes) {
      expect(node.filters == null || (Array.isArray(node.filters) && node.filters.length === 0)).toBe(true);
    }
  });

  it("the shadow graphic is a single tight, low-alpha ellipse — no oversized translucent halo circle", () => {
    const { shadow } = createVisionV3PlayerToken({ label: "9", teamColor: "yellow", radius: 10 });
    const discRadius = 10 * 1.06;
    const circles = circleRadii(shadow);
    expect(circles.some((r) => r > discRadius * 1.1)).toBe(false);

    const ellipses = instructionsOf(shadow)
      .flatMap((inst) => inst.data?.path?.instructions ?? [])
      .filter((pathInst) => pathInst.action === "ellipse");
    expect(ellipses).toHaveLength(1);

    const fills = instructionsOf(shadow).filter((inst) => inst.action === "fill");
    expect(fills).toHaveLength(1);
    expect(fills[0]!.data?.style?.alpha ?? 1).toBeLessThan(0.3);
  });

  it("keeps token dimensions and label layout scale unchanged (discRadius/innerRadius formulas untouched)", () => {
    const { token } = createVisionV3PlayerToken({ label: "9", teamColor: "yellow", radius: 10 });
    expect(token.scale.x).toBe(1);
    // discRadius = radius * VISION_V3_SIZE_SCALE(1.06) — same constant as before this change.
    const discRadius = 10 * 1.06;
    const rim = token.children.find(
      (child) => child instanceof Graphics && circleRadii(child as Graphics).some((r) => Math.abs(r - discRadius) < 1e-6),
    );
    expect(rim).toBeDefined();
  });

  it("renders for every Vision V3 team colour without throwing, generically deriving rim/shading tones", () => {
    const teamColors = ["blue", "red", "green", "yellow", "black", "white"] as const;
    for (const teamColor of teamColors) {
      expect(() => createVisionV3PlayerToken({ label: "7", teamColor, radius: 10 })).not.toThrow();
    }
  });
});

function patternFillsOf(token: { children: unknown[] }): DrawInstruction[] {
  return token.children
    .filter((c): c is Graphics => c instanceof Graphics)
    .flatMap((g) => instructionsOf(g))
    .filter((inst) => inst.action === "fill");
}

describe("createVisionV3PlayerToken — authored kitPatternColor is a kit colour, not a lighting cue (PR2B pattern-fidelity fix)", () => {
  it("an explicit kitPatternColor is drawn completely unmixed and fully opaque, on green (the pitch-blend-sensitive team colour that previously triggered an extra mix-toward-white)", () => {
    const { token } = createVisionV3PlayerToken({
      label: "10",
      teamColor: "green",
      radius: 10,
      kitPattern: "slash",
      kitPatternColor: 0xffffff,
    });
    const whiteFill = patternFillsOf(token).find((inst) => inst.data?.style?.color === 0xffffff);
    expect(whiteFill).toBeDefined();
    expect(whiteFill?.data?.style?.alpha).toBe(1);
  });

  it("holds for black and orange too — the exact authored hex reaches the canvas, not a lightened derivative", () => {
    for (const [hex] of [[0x111827], [0xf97316]] as const) {
      const { token } = createVisionV3PlayerToken({
        label: "10",
        teamColor: "green",
        radius: 10,
        kitPattern: "slash",
        kitPatternColor: hex,
      });
      const fill = patternFillsOf(token).find((inst) => inst.data?.style?.color === hex);
      expect(fill).toBeDefined();
      expect(fill?.data?.style?.alpha).toBe(1);
    }
  });

  it("holds across the full base/pattern/colour QA matrix (yellow+hoops+green, blue+stripes+white, red+chestDash+yellow)", () => {
    const cases = [
      { teamColor: "yellow", kitPattern: "hoops", kitPatternColor: 0x16a34a },
      { teamColor: "blue", kitPattern: "stripes", kitPatternColor: 0xffffff },
      { teamColor: "red", kitPattern: "chestDash", kitPatternColor: 0xfacc15 },
    ] as const;
    for (const { teamColor, kitPattern, kitPatternColor } of cases) {
      const { token } = createVisionV3PlayerToken({ label: "10", teamColor, radius: 10, kitPattern, kitPatternColor });
      const fill = patternFillsOf(token).find((inst) => inst.data?.style?.color === kitPatternColor);
      expect(fill).toBeDefined();
      expect(fill?.data?.style?.alpha).toBe(1);
    }
  });

  it("without an explicit kitPatternColor, the derived-accent fallback keeps its existing softened treatment (not globally flattened)", () => {
    const { token } = createVisionV3PlayerToken({
      label: "10",
      teamColor: "green",
      radius: 10,
      kitPattern: "slash",
      // no kitPatternColor
    });
    const fills = patternFillsOf(token);
    // The fallback accent is secondaryColor(green)=0x4ade80 mixed 20% toward
    // white (pitch-blend-sensitive) at the old 0.72 alpha — never the raw,
    // unmixed secondary colour at alpha 1.
    const rawSecondary = fills.find((inst) => inst.data?.style?.color === 0x4ade80 && inst.data?.style?.alpha === 1);
    expect(rawSecondary).toBeUndefined();
    const softened = fills.find((inst) => inst.data?.style?.alpha === 0.72);
    expect(softened).toBeDefined();
  });

  it("Gradient is untouched by this change — still no separate accent fill, only the disc's own lightened base", () => {
    const withAccent = createVisionV3PlayerToken({
      label: "10", teamColor: "green", radius: 10, kitPattern: "slash", kitPatternColor: 0xffffff,
    });
    const gradient = createVisionV3PlayerToken({
      label: "10", teamColor: "green", radius: 10, kitPattern: "gradient", kitPatternColor: 0xffffff,
    });
    // Gradient draws strictly fewer fill instructions than an explicit-colour
    // geometric pattern (no accent shape drawn at all — drawPatternAccent's
    // early return for "gradient" is untouched by this fix). The token's
    // icon/person glyph decorations are always white at low alpha regardless
    // of pattern, so the real check is for a *fully opaque* white fill (what
    // an unmixed pattern-accent draw would leave behind) — there must be none.
    expect(patternFillsOf(gradient.token).length).toBeLessThan(patternFillsOf(withAccent.token).length);
    const opaqueWhite = patternFillsOf(gradient.token).find(
      (inst) => inst.data?.style?.color === 0xffffff && inst.data?.style?.alpha === 1,
    );
    expect(opaqueWhite).toBeUndefined();
  });
});
