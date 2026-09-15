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
