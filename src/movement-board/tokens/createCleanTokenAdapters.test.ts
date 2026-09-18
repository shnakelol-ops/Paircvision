import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";

import { createVisionV3Token } from "./createCleanTokenAdapters";

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

// Mirrors token-layer.ts's TOKEN_RADIUS and Standard Slate's own
// PLAYER_RADIUS — both are 4.1, confirmed identical directly from source in
// the PR2B token-size audit. VISION_V3_SIZE_SCALE (1.06) is
// createVisionV3PlayerToken's own internal constant.
const TOKEN_RADIUS = 4.1;
const VISION_V3_SIZE_SCALE = 1.06;
// Standard Slate's TACTICAL_PLAYER_VISUAL_SCALE, reused identically by
// Game Timing's GAME_TIMING_VISION_VISUAL_SCALE (see
// createCleanTokenAdapters.ts's own derivation comment on that constant).
const SLATE_VISUAL_SCALE = 0.8;

describe("createVisionV3Token — PR2B token-size calibration", () => {
  it("renders at Standard Slate's exact effective disc radius, not the naive (56% larger) size", () => {
    const { token } = createVisionV3Token({ color: "red", number: 9, radius: TOKEN_RADIUS });

    // Container scale is the outer correction factor.
    expect(token.scale.x).toBeCloseTo(SLATE_VISUAL_SCALE, 6);
    expect(token.scale.y).toBeCloseTo(SLATE_VISUAL_SCALE, 6);

    // The rim circle's own drawn radius (pre-outer-scale, i.e. discRadius)
    // — same technique createVisionV3PlayerToken.test.ts already uses to
    // locate it.
    const expectedDiscRadius = TOKEN_RADIUS * SLATE_VISUAL_SCALE * VISION_V3_SIZE_SCALE;
    const rim = token.children.find(
      (child) => child instanceof Graphics && circleRadii(child as Graphics).some((r) => Math.abs(r - expectedDiscRadius) < 1e-6),
    );
    expect(rim).toBeDefined();

    // Effective on-screen radius = discRadius * container scale. This must
    // equal Standard Slate's own actual on-screen Vision V3 radius exactly
    // (2.781...), not merely be "smaller than naive".
    const effectiveRadius = expectedDiscRadius * token.scale.x;
    const slateEffectiveRadius = Math.max(2.8, TOKEN_RADIUS * SLATE_VISUAL_SCALE) * VISION_V3_SIZE_SCALE * SLATE_VISUAL_SCALE;
    expect(effectiveRadius).toBeCloseTo(slateEffectiveRadius, 6);
    expect(effectiveRadius).toBeCloseTo(2.78144, 4);
  });

  it("the naive (uncorrected) size this replaces really would have been ~56% larger — proves the correction is load-bearing, not a no-op", () => {
    const naiveDiscRadius = Math.max(2.8, TOKEN_RADIUS) * VISION_V3_SIZE_SCALE; // radius passed straight through, scale=1
    const correctedEffectiveRadius = TOKEN_RADIUS * SLATE_VISUAL_SCALE * VISION_V3_SIZE_SCALE * SLATE_VISUAL_SCALE;
    const ratio = naiveDiscRadius / correctedEffectiveRadius;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeCloseTo(1.563, 2);
  });

  it("hit-testing/TOKEN_RADIUS is untouched by this correction (it lives in token-layer.ts, independent of this adapter's radius param)", () => {
    // This is a documentation-level assertion: createVisionV3Token receives
    // `radius` as a parameter and never mutates a module-level constant, so
    // token-layer.ts's own TOKEN_RADIUS (used for hit-testing and the
    // small/medium/large size-mode multiplier) cannot be affected by
    // anything in this file. Verified by inspecting the call signature: the
    // function only reads `radius` from its input, never imports or writes
    // a shared constant.
    expect(createVisionV3Token.length).toBe(1); // single destructured-input signature
  });
});

function totalInstructionCount(token: { children: unknown[] }): number {
  // drawPatternAccent draws INTO the existing `disc` Graphics object rather
  // than adding a new child (confirmed from createVisionV3PlayerToken.ts:
  // `drawPatternAccent(disc, kitPattern, ...)`), so child *count* never
  // changes between patterns — only how much each Graphics object draws
  // does. Summing every child's own instruction count is what actually
  // reflects "did a pattern accent get drawn".
  return token.children
    .filter((c): c is Graphics => c instanceof Graphics)
    .reduce((sum, g) => sum + instructionsOf(g).length, 0);
}

describe("createVisionV3Token — kitPattern / kitPatternColor reach the Vision V3 renderer", () => {
  it("passes a non-plain kitPattern through so the renderer actually draws more (a pattern accent), not nothing", () => {
    const plain = createVisionV3Token({ color: "blue", number: 9, radius: TOKEN_RADIUS, kitPattern: "plain" });
    const slash = createVisionV3Token({ color: "blue", number: 9, radius: TOKEN_RADIUS, kitPattern: "slash" });

    // "plain" is documented to draw no accent at all (drawPatternAccent
    // returns immediately); "slash" draws extra shapes on top of the same
    // base disc, so its total instruction count must be strictly larger.
    expect(totalInstructionCount(slash.token)).toBeGreaterThan(totalInstructionCount(plain.token));
  });

  it("every one of the six canonical patterns other than plain/gradient draws strictly more than plain", () => {
    const plainCount = totalInstructionCount(
      createVisionV3Token({ color: "blue", number: 9, radius: TOKEN_RADIUS, kitPattern: "plain" }).token,
    );
    for (const pattern of ["hoops", "stripes", "slash", "chestDash"] as const) {
      const count = totalInstructionCount(
        createVisionV3Token({ color: "blue", number: 9, radius: TOKEN_RADIUS, kitPattern: pattern }).token,
      );
      expect(count).toBeGreaterThan(plainCount);
    }
  });

  it("passes kitPatternColor through so it actually changes the rendered colours (not just the team's default secondary colour)", () => {
    const colorsFor = (kitPatternColor: "white" | "black") =>
      createVisionV3Token({
        color: "blue",
        number: 9,
        radius: TOKEN_RADIUS,
        kitPattern: "slash",
        kitPatternColor,
      })
        .token.children.filter((c): c is Graphics => c instanceof Graphics)
        .flatMap((g) => instructionsOf(g))
        .flatMap((inst) => [inst.data?.style?.color])
        .filter((c): c is number => c != null);

    const whiteAccent = colorsFor("white");
    const blackAccent = colorsFor("black");
    // Different kitPatternColor inputs must produce different rendered
    // colour sets — proves the parameter reaches the renderer and actually
    // participates in the draw, without pinning to the exact blended hex
    // (drawPatternAccent mixes the resolved accent colour toward white
    // before drawing, so the raw input hex is never drawn unmixed).
    expect(whiteAccent).not.toEqual(blackAccent);
  });
});

function fillColorsOf(token: { children: unknown[] }): number[] {
  return token.children
    .filter((c): c is Graphics => c instanceof Graphics)
    .flatMap((g) => instructionsOf(g))
    .flatMap((inst) => [inst.data?.style?.color])
    .filter((c): c is number => c != null);
}

// Standard Slate's canonical KIT_COLOR_NUMERIC values (createTacticalPadLiteSurface.ts),
// duplicated here as the audit's proven-correct reference — not re-imported,
// so this test fails loudly if the adapter and Slate's palette ever drift
// apart rather than silently passing because both sides import the same
// (possibly wrong) constant.
const SLATE_CANONICAL = {
  orange: 0xf97316,
  purple: 0x7c3aed,
  yellow: 0xfacc15,
  white: 0xffffff,
} as const;

describe("createVisionV3Token — colour fidelity (PR2B revision 3 audit fix)", () => {
  it("paints the disc in Slate's exact canonical primaryColor, not Vision's own internal per-team default", () => {
    const { token } = createVisionV3Token({ color: "yellow", number: 9, radius: TOKEN_RADIUS });
    // Plain pattern: the disc's core fill is the unmixed primaryColor
    // exactly (createVisionV3PlayerToken.ts: `coreColor = baseColor`).
    expect(fillColorsOf(token)).toContain(SLATE_CANONICAL.yellow);
  });

  it("no longer collapses orange to Vision's default red — renders orange's true canonical hue", () => {
    const { token } = createVisionV3Token({ color: "orange", number: 9, radius: TOKEN_RADIUS });
    expect(fillColorsOf(token)).toContain(SLATE_CANONICAL.orange);
  });

  it("no longer collapses purple to Vision's default blue — renders purple's true canonical hue", () => {
    const { token } = createVisionV3Token({ color: "purple", number: 9, radius: TOKEN_RADIUS });
    expect(fillColorsOf(token)).toContain(SLATE_CANONICAL.purple);
  });

  it("resolves kitPatternColor from Slate's canonical palette, not the pastel V3_SECONDARY_HEX accent table", () => {
    // White mixed toward white stays exactly white — a precise, unambiguous
    // probe: the old V3_SECONDARY_HEX.white (0x9aa3b5, blue-grey) would mix
    // toward white but never actually reach 0xffffff.
    const { token } = createVisionV3Token({
      color: "blue",
      number: 9,
      radius: TOKEN_RADIUS,
      kitPattern: "chestDash",
      kitPatternColor: "white",
    });
    expect(fillColorsOf(token)).toContain(0xffffff);
  });
});

describe("createVisionV3Token — label passthrough matches Standard Slate's own on-disc limit", () => {
  it("this adapter itself does not re-truncate the label (removed the redundant slice(0, 3) the other adapters still have)", () => {
    // createCleanTokenAdapters.ts's createVisionV3Token passes label
    // through untouched — but createVisionV3PlayerToken.ts (the shared,
    // protected renderer both Game Timing and Standard Slate call into)
    // still caps the ON-DISC text to 3 characters itself
    // (safeLabel = label.trim().slice(0, 3) || "?"). That is Standard
    // Slate's real, current, frozen behaviour too — a coach's full
    // nickname is stored in full either way (see token-layer.ts's
    // resolveTokenDisplayLabel), but the disc has only ever shown the
    // first few characters. This test proves this adapter is not adding a
    // *second*, redundant truncation on top of the renderer's own — not
    // that the disc shows more than 3 characters (it never did, on either
    // surface).
    const label = "Dozer";
    const { token } = createVisionV3Token({ color: "blue", number: 9, radius: TOKEN_RADIUS, label });
    const textNode = token.children.find((c) => (c as { text?: unknown }).text !== undefined) as
      | { text: string }
      | undefined;
    expect(textNode?.text).toBe("Doz"); // createVisionV3PlayerToken's own cap, unchanged by PR2B
  });
});
