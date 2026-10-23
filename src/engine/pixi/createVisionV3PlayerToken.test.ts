import { describe, expect, it } from "vitest";
import { Container, Graphics, Text } from "pixi.js";

import { VISION_V3_SLATE_ART_SCALE, createVisionV3PlayerToken } from "./createVisionV3PlayerToken";
import { VisionV3Renderer } from "./playerTokenRenderer";

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

describe("createVisionV3PlayerToken — Slate supersampled art (artScale)", () => {
  const K = VISION_V3_SLATE_ART_SCALE;
  // The Slate's real token radius (PLAYER_RADIUS * TACTICAL_PLAYER_VISUAL_SCALE)
  // plus 2.8, where the rim-width and person-stroke minimum floors are the
  // binding values — the floors must scale with the art too.
  const radii = [4.1 * 0.8, 2.8, 10];

  function artOf(token: Container): Container {
    expect(token.children).toHaveLength(1);
    const art = token.children[0] as Container;
    expect(art).toBeInstanceOf(Container);
    expect(art).not.toBeInstanceOf(Graphics);
    return art;
  }

  it("keeps the outer token contract: scale, interaction mode and cursor are untouched; only the inner art is scaled by 1/K", () => {
    const legacy = createVisionV3PlayerToken({ label: "11", teamColor: "blue", radius: 3.28, scale: 0.8 });
    const hi = createVisionV3PlayerToken({ label: "11", teamColor: "blue", radius: 3.28, scale: 0.8, artScale: K });
    expect(hi.token.scale.x).toBe(legacy.token.scale.x);
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

  it("draws every shape at exactly K times the legacy geometry (so the on-board size is unchanged), floors included", () => {
    for (const radius of radii) {
      for (const kitPattern of ["plain", "hoops", "stripes", "slash", "chestDash", "gradient"] as const) {
        const legacy = createVisionV3PlayerToken({ label: "8", teamColor: "green", radius, kitPattern, kitPatternColor: 0xffffff });
        const hi = createVisionV3PlayerToken({ label: "8", teamColor: "green", radius, kitPattern, kitPatternColor: 0xffffff, artScale: K });
        const legacyNodes = legacy.token.children;
        const hiNodes = artOf(hi.token).children;
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
            // Same fills/strokes in the same order: colours and alphas intact.
            const styles = (g: Graphics) => instructionsOf(g).map((inst) => [inst.action, inst.data?.style?.color, inst.data?.style?.alpha]);
            expect(styles(node)).toEqual(styles(before as Graphics));
          }
        });
      }
    }
  });

  it("scales label font size, outline width, letter spacing and shadow offset by K (numbers, initials)", () => {
    for (const radius of radii) {
      for (const label of ["7", "11", "JD"]) {
        const legacyTexts = createVisionV3PlayerToken({ label, teamColor: "yellow", radius }).token.children.filter(
          (c): c is Text => c instanceof Text,
        );
        const hiTexts = artOf(createVisionV3PlayerToken({ label, teamColor: "yellow", radius, artScale: K }).token).children.filter(
          (c): c is Text => c instanceof Text,
        );
        expect(hiTexts.map((t) => t.text)).toEqual(legacyTexts.map((t) => t.text));
        hiTexts.forEach((text, i) => {
          const before = legacyTexts[i]!;
          expect(Number(text.style.fontSize) / K).toBeCloseTo(Number(before.style.fontSize), 9);
          expect(text.style.letterSpacing / K).toBeCloseTo(before.style.letterSpacing, 9);
          expect((text.style.stroke as { width?: number } | null)?.width ?? 0).toBeCloseTo(
            ((before.style.stroke as { width?: number } | null)?.width ?? 0) * K,
            9,
          );
          expect(text.position.y / K).toBeCloseTo(before.position.y, 9);
          expect(text.style.fill).toEqual(before.style.fill);
          expect(text.alpha).toBe(before.alpha);
        });
      }
    }
  });

  it("gives the disc rim enough local radius for Pixi to tessellate a smooth circle (>= 64 segments)", () => {
    const hi = createVisionV3PlayerToken({ label: "9", teamColor: "blue", radius: 4.1 * 0.8, artScale: K });
    const rimRadius = Math.max(...artOf(hi.token).children.filter((c): c is Graphics => c instanceof Graphics).flatMap(circleRadii));
    // Pixi v8 buildCircle: segments = 4 * ceil(2.3 * sqrt(rx + ry)).
    expect(4 * Math.ceil(2.3 * Math.sqrt(rimRadius * 2))).toBeGreaterThanOrEqual(64);
  });

  it("artScale 1 (the default, used by movement-board) draws straight into the token as before", () => {
    const { token } = createVisionV3PlayerToken({ label: "9", teamColor: "blue", radius: 3.28 });
    expect(token.children.some((c) => c instanceof Text)).toBe(true);
    expect(token.children.every((c) => c instanceof Graphics || c instanceof Text)).toBe(true);
  });

  it("the Tactical Slate's VisionV3Renderer opts into the supersampled art", () => {
    const { token } = VisionV3Renderer({
      label: "7",
      number: 7,
      teamColor: "blue",
      scale: 0.8,
      style: {},
      kitPattern: "plain",
      kitPatternColor: 0xffffff,
      radius: 4.1 * 0.8,
    });
    expect(artOf(token).scale.x).toBeCloseTo(1 / K, 12);
  });
});
