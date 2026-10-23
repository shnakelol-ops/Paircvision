import { describe, expect, it } from "vitest";
import { Container, Graphics, Text } from "pixi.js";

import {
  BIB_GRADIENT_BAND_LIGHTEN,
  VISION_V3_SLATE_ART_SCALE,
  createVisionV3PlayerToken,
  resolveVisionV3DiscRadius,
  type VisionV3KitPattern,
} from "./createVisionV3PlayerToken";
import { drawKitPatternAccent } from "./kitPatternAccent";
import {
  BibTokenRenderer,
  SELECTABLE_PLAYER_TOKEN_STYLES,
  VisionV3Renderer,
  resolvePlayerTokenRenderer,
  sanitizePlayerTokenStyle,
} from "./playerTokenRenderer";
import {
  MINI_TOKEN_SIZE_RATIO,
  PLAYER_TOKEN_SIZE_CHOICES,
  isMiniTokenSizeActive,
  playerTokenSizeFlags,
  resolvePlayerTokenSize,
  type PlayerTokenSize,
} from "./playerTokenSize";
import { resolveStoredTrainingTokenSettings } from "./playerPresentation";
import { resolvePlayerHitAreaSizeCompensation, resolvePlayerTokenSizeScale } from "./createTacticalPadLiteSurface";
import { UNDER_PILL_NORMAL_SHRINK } from "./createNamePillPlayerToken";
import { sanitizeQuickBoardState } from "../../features/quickboard/storage/quickboard-types";

type PathInstruction = { action: string; data: number[] };
type DrawInstruction = {
  action: string;
  data?: {
    path?: { instructions?: PathInstruction[] };
    style?: { color?: number; alpha?: number };
  };
};

function instructionsOf(g: Graphics): DrawInstruction[] {
  return (g.context as unknown as { instructions: DrawInstruction[] }).instructions;
}

const SHAPE_ACTIONS = new Set(["rect", "poly", "circle", "ellipse", "roundRect"]);

function shapesOf(g: Graphics): PathInstruction[] {
  return instructionsOf(g)
    .flatMap((inst) => inst.data?.path?.instructions ?? [])
    .filter((p) => SHAPE_ACTIONS.has(p.action));
}

function pathActions(g: Graphics): string[] {
  return shapesOf(g).map((p) => p.action);
}

function fillColors(g: Graphics): number[] {
  return instructionsOf(g)
    .filter((inst) => inst.action === "fill")
    .map((inst) => inst.data!.style!.color!);
}

function allNodes(root: Container): Container[] {
  const nodes: Container[] = [];
  const walk = (node: Container) => {
    for (const child of node.children) {
      nodes.push(child);
      walk(child);
    }
  };
  walk(root);
  return nodes;
}

function largestCircleRadius(root: Container): number {
  return Math.max(
    ...allNodes(root)
      .filter((node): node is Graphics => node instanceof Graphics)
      .flatMap((g) => instructionsOf(g))
      .flatMap((inst) => inst.data?.path?.instructions ?? [])
      .filter((pathInst) => pathInst.action === "circle")
      .map((pathInst) => pathInst.data[2]!),
  );
}

const PATTERNS: VisionV3KitPattern[] = ["plain", "hoops", "stripes", "slash", "chestDash", "gradient"];
const STYLES = ["vision-v3", "pixi", "phosphor", "pill-under", "bib"] as const;
const SIZES: PlayerTokenSize[] = ["normal", "compact", "mini"];

const rendererInput = {
  label: "7",
  number: 7,
  teamColor: "blue" as const,
  scale: 1,
  style: {},
  kitPattern: "hoops" as const,
  kitPatternColor: 0xffffff,
  radius: 4.1 * 0.8,
};

/** The flat Bib Token's jersey: the masked Graphics in the art container. */
function bibParts(pattern: VisionV3KitPattern, base = 0x2563eb, accent = 0xffffff) {
  const { token, shadow } = createVisionV3PlayerToken({
    label: "7",
    teamColor: "blue",
    radius: 10,
    style: { primaryColor: base, secondaryColor: base, badgeColor: base },
    kitPattern: pattern,
    kitPatternColor: accent,
    variant: "bib",
  });
  const jersey = token.children.find((child) => child instanceof Graphics && (child as Graphics).mask) as Graphics;
  return { token, shadow, jersey };
}

describe("Bib Token style registration", () => {
  it("is selectable, after every existing style, which keep their order", () => {
    expect(SELECTABLE_PLAYER_TOKEN_STYLES).toEqual(["vision-v3", "pixi", "phosphor", "pill-under", "bib"]);
  });

  it("sanitises 'bib' and still defaults unknown values to Vision V3 (saved/legacy values unchanged)", () => {
    expect(sanitizePlayerTokenStyle("bib")).toBe("bib");
    expect(sanitizePlayerTokenStyle("Bib")).toBe("vision-v3");
    expect(sanitizePlayerTokenStyle(undefined)).toBe("vision-v3");
    expect(sanitizePlayerTokenStyle("torso")).toBe("classic");
    for (const style of ["vision-v3", "classic", "premium", "pixi", "phosphor", "pill-under"] as const) {
      expect(sanitizePlayerTokenStyle(style)).toBe(style);
    }
  });

  it("resolves to the Bib renderer, and no other style resolves to it", () => {
    expect(resolvePlayerTokenRenderer("bib")).toBe(BibTokenRenderer);
    for (const style of ["vision-v3", "classic", "premium", "pixi", "phosphor", "pill-under"] as const) {
      expect(resolvePlayerTokenRenderer(style)).not.toBe(BibTokenRenderer);
    }
  });
});

describe("flat Bib Token rendering", () => {
  it("draws no label at all — number, initials and names stay hidden", () => {
    for (const label of ["7", "14", "JD", "Sam"]) {
      const { token } = BibTokenRenderer({ ...rendererInput, label });
      expect(allNodes(token).some((node) => node instanceof Text)).toBe(false);
    }
  });

  it("uses exactly the Vision V3 disc diameter for the same radius", () => {
    const bib = BibTokenRenderer(rendererInput).token;
    const v3 = VisionV3Renderer(rendererInput).token;
    expect(largestCircleRadius(bib)).toBeCloseTo(largestCircleRadius(v3), 9);
    expect(largestCircleRadius(bib)).toBeCloseTo(resolveVisionV3DiscRadius(rendererInput.radius) * VISION_V3_SLATE_ART_SCALE, 9);
  });

  it("reuses Vision V3's supersampled art container and keeps the token interactive", () => {
    const { token } = BibTokenRenderer(rendererInput);
    expect(token.eventMode).toBe("static");
    expect(token.children).toHaveLength(1);
    expect(token.children[0]!.scale.x).toBeCloseTo(1 / VISION_V3_SLATE_ART_SCALE, 9);
  });

  it("is flat: no gloss ellipses, no translucent glyph, an empty shadow — only rim, backdrop, jersey and jersey edge", () => {
    const { token, shadow } = bibParts("plain");
    expect(instructionsOf(shadow)).toHaveLength(0);
    // shadow (empty), rim, backdrop, jersey (masked), jersey edge
    expect(token.children).toHaveLength(5);
    for (const node of allNodes(token)) {
      if (!(node instanceof Graphics)) continue;
      expect(pathActions(node)).not.toContain("ellipse");
      for (const inst of instructionsOf(node)) {
        if (inst.action === "fill") expect(inst.data?.style?.alpha ?? 1).toBe(1);
      }
    }
  });

  it("keeps the team colour: a darker shade of it behind a jersey in the kit colour itself", () => {
    const { token, jersey } = bibParts("plain");
    const [rim, backdrop] = token.children.slice(1, 3) as Graphics[];
    expect(fillColors(jersey)[0]).toBe(0x2563eb);
    for (const g of [rim!, backdrop!]) {
      const color = fillColors(g)[0]!;
      expect(color).not.toBe(0x2563eb);
      // still blue-dominant — a shade of the team colour, not a neutral grey
      expect(color & 0xff).toBeGreaterThan((color >> 16) & 0xff);
    }
  });

  it("clips the kit to the jersey silhouette, not to the disc", () => {
    const { jersey } = bibParts("hoops");
    expect(pathActions(jersey.mask as Graphics)).toEqual(["poly"]);
  });

  it("draws every banded kit with Vision V3's own pattern geometry (shared drawKitPatternAccent), at full opacity for a picked colour", () => {
    for (const pattern of ["hoops", "stripes", "slash", "chestDash"] as const) {
      const { jersey } = bibParts(pattern);
      const reference = new Graphics();
      drawKitPatternAccent(reference, pattern, 0xffffff, 1, 1);
      const accentFills = instructionsOf(jersey).filter(
        (inst) => inst.action === "fill" && inst.data?.style?.color === 0xffffff,
      );
      expect(accentFills.length).toBe(instructionsOf(reference).filter((inst) => inst.action === "fill").length);
      expect(accentFills.every((inst) => inst.data?.style?.alpha === 1)).toBe(true);
      expect(pathActions(jersey).slice(1)).toEqual(pathActions(reference));
    }
  });

  it("plain draws only the kit colour; gradient draws three flat bands lightest at the top, so it never reads as plain", () => {
    expect(fillColors(bibParts("plain").jersey)).toEqual([0x2563eb]);
    const gradient = fillColors(bibParts("gradient").jersey);
    expect(gradient).toHaveLength(1 + BIB_GRADIENT_BAND_LIGHTEN.length);
    const [top, middle, bottom] = gradient.slice(1);
    const brightness = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    expect(brightness(top!)).toBeGreaterThan(brightness(middle!));
    expect(brightness(middle!)).toBeGreaterThan(brightness(bottom!));
    expect(bottom).toBe(0x2563eb);
  });

  it("renders all six kit patterns distinctly", () => {
    const signatures = PATTERNS.map((pattern) => {
      const { jersey } = bibParts(pattern);
      return JSON.stringify([fillColors(jersey), shapesOf(jersey).map((p) => [p.action, ...p.data.filter((n) => typeof n === "number")])]);
    });
    expect(new Set(signatures).size).toBe(PATTERNS.length);
  });

  it("leaves the standard Vision V3 token untouched (label, glyphs and gloss still drawn)", () => {
    const { token } = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 10 });
    expect(allNodes(token).filter((node) => node instanceof Text).map((node) => (node as Text).text)).toContain("7");
    // shadow, rim, face, shirt glyph, person glyph, tick, label plate, label shadow, label
    expect(token.children).toHaveLength(9);
    const face = token.children.find((child) => child instanceof Graphics && (child as Graphics).mask) as Graphics;
    expect(pathActions(face).filter((a) => a === "ellipse")).toHaveLength(2);
  });
});

describe("universal Normal / Compact / Mini sizes", () => {
  it("offers Normal, Compact and Mini, with Mini at 80% of Compact", () => {
    expect(PLAYER_TOKEN_SIZE_CHOICES.map((choice) => choice.label)).toEqual(["Normal", "Compact", "Mini"]);
    expect(MINI_TOKEN_SIZE_RATIO).toBe(0.8);
  });

  it("round-trips every size through the engine's compact/mini flags", () => {
    for (const size of SIZES) {
      expect(resolvePlayerTokenSize(playerTokenSizeFlags(size))).toBe(size);
    }
    expect(playerTokenSizeFlags("mini")).toEqual({ compact: true, mini: true });
  });

  it("Mini refines Compact: with Compact off (e.g. a board loaded at Normal) the board draws Normal", () => {
    expect(resolvePlayerTokenSize({ compact: false, mini: true })).toBe("normal");
    expect(isMiniTokenSizeActive({ compact: false, mini: true })).toBe(false);
  });

  // All 15 selectable style/size combinations.
  for (const style of STYLES) {
    for (const size of SIZES) {
      it(`${style} at ${size}: scale and touch target`, () => {
        const flags = { ...playerTokenSizeFlags(size), style };
        const compactFactor = style === "pill-under" ? 0.75 / UNDER_PILL_NORMAL_SHRINK : 0.75;
        const expected = size === "normal" ? 1 : size === "compact" ? compactFactor : compactFactor * 0.8;
        expect(resolvePlayerTokenSizeScale(flags)).toBeCloseTo(expected, 12);
        // On-screen touch radius = local hit radius × token scale: Mini keeps Compact's.
        const touchScale = resolvePlayerTokenSizeScale(flags) * resolvePlayerHitAreaSizeCompensation(flags);
        expect(touchScale).toBeCloseTo(size === "normal" ? 1 : compactFactor, 12);
      });
    }
  }

  it("Normal and Compact keep their existing scales (1 and 0.75; Name Badge's compensated Compact)", () => {
    expect(resolvePlayerTokenSizeScale({ compact: false, mini: false, style: "vision-v3" })).toBe(1);
    expect(resolvePlayerTokenSizeScale({ compact: true, mini: false, style: "pixi" })).toBe(0.75);
    expect(resolvePlayerTokenSizeScale({ compact: true, mini: false, style: "pill-under" })).toBe(
      0.75 / UNDER_PILL_NORMAL_SHRINK,
    );
  });
});

describe("legacy Practice → Bib Token at Compact", () => {
  // The retired Practice presentation drew a numberless Vision V3 token at the
  // plain Compact scale (0.75, no hit-area change, for every style).
  const PRACTICE_SCALE = 0.75;

  it("a legacy Practice board resolves to Bib Token at Compact", () => {
    expect(resolveStoredTrainingTokenSettings({ playerPresentation: "practice" })).toEqual({ style: "bib", size: "compact" });
  });

  it("keeps the Practice diameter: same disc radius as Vision V3, at the same Compact scale", () => {
    const flags = { ...playerTokenSizeFlags("compact"), style: "bib" as const };
    expect(resolvePlayerTokenSizeScale(flags)).toBe(PRACTICE_SCALE);
    expect(resolvePlayerHitAreaSizeCompensation(flags)).toBe(1);
    const bib = largestCircleRadius(BibTokenRenderer(rendererInput).token);
    const v3 = largestCircleRadius(VisionV3Renderer({ ...rendererInput, showLabel: false }).token);
    expect(bib).toBeCloseTo(v3, 9);
  });

  it("stays numberless", () => {
    expect(allNodes(BibTokenRenderer(rendererInput).token).some((node) => node instanceof Text)).toBe(false);
  });

  it("a Training board saved at Mini stores 'mini' with its style", () => {
    const stored = sanitizeQuickBoardState({
      players: [],
      items: [],
      drawings: [],
      phases: [],
      movementPaths: [],
      playerPresentation: "mini",
      playerTokenStyle: "phosphor",
    })!;
    expect(resolveStoredTrainingTokenSettings(stored)).toEqual({ style: "phosphor", size: "mini" });
  });
});
