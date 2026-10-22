import { describe, expect, it } from "vitest";
import { Container, Graphics, Text } from "pixi.js";

import {
  BIB_TOKEN_SHIRT_GLYPH_ALPHA,
  VISION_V3_SLATE_ART_SCALE,
  createVisionV3PlayerToken,
  resolveVisionV3DiscRadius,
} from "./createVisionV3PlayerToken";
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
  tokenStyleSupportsMini,
} from "./playerTokenSize";
import { playerPresentationFlags, resolvePlayerPresentation } from "./playerPresentation";
import { sanitizeQuickBoardState } from "../../features/quickboard/storage/quickboard-types";

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

describe("Bib Token rendering", () => {
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

  it("keeps the team colour and kit pattern (masked face, pattern accent drawn)", () => {
    const { token } = createVisionV3PlayerToken({
      label: "7",
      teamColor: "blue",
      radius: 10,
      kitPattern: "hoops",
      kitPatternColor: 0xffffff,
      variant: "bib",
    });
    const face = token.children.find((child) => child instanceof Graphics && (child as Graphics).mask) as Graphics;
    const fills = instructionsOf(face).filter((inst) => inst.action === "fill");
    expect(fills[0]!.data?.style?.color).toBe(0x2563eb);
    expect(fills.some((inst) => inst.data?.style?.color === 0xffffff && inst.data?.style?.alpha === 1)).toBe(true);
  });

  it("drops the contact shadow drawing, the person glyph and the orientation tick", () => {
    const bib = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 10, variant: "bib" });
    const v3 = createVisionV3PlayerToken({ label: "7", teamColor: "blue", radius: 10, showLabel: false });
    expect(instructionsOf(bib.shadow)).toHaveLength(0);
    expect(instructionsOf(v3.shadow).length).toBeGreaterThan(0);
    // shadow, rim, face, jersey glyph — versus Vision V3's shadow, rim, face,
    // shirt glyph, person glyph and orientation tick.
    expect(bib.token.children).toHaveLength(4);
    expect(v3.token.children).toHaveLength(6);
  });

  it("draws the jersey glyph stronger than Vision V3, and dark on light kits", () => {
    const glyphFill = (teamColor: "blue" | "white") => {
      const { token } = createVisionV3PlayerToken({ label: "7", teamColor, radius: 10, variant: "bib" });
      const glyph = token.children[token.children.length - 1] as Graphics;
      return instructionsOf(glyph).find((inst) => inst.action === "fill")!.data!.style!;
    };
    expect(glyphFill("blue")).toMatchObject({ color: 0xffffff, alpha: BIB_TOKEN_SHIRT_GLYPH_ALPHA });
    expect(glyphFill("white")).toMatchObject({ color: 0x0f172a, alpha: BIB_TOKEN_SHIRT_GLYPH_ALPHA });
    expect(BIB_TOKEN_SHIRT_GLYPH_ALPHA).toBeGreaterThan(0.18);
  });

  it("leaves the standard Vision V3 token untouched (label still drawn by default)", () => {
    const { token } = VisionV3Renderer(rendererInput);
    expect(allNodes(token).filter((node) => node instanceof Text).map((node) => (node as Text).text)).toContain("7");
  });
});

describe("Bib Token sizes", () => {
  it("offers Normal, Compact and Mini, with Mini at 80% of Compact", () => {
    expect(PLAYER_TOKEN_SIZE_CHOICES.map((choice) => choice.label)).toEqual(["Normal", "Compact", "Mini"]);
    expect(MINI_TOKEN_SIZE_RATIO).toBe(0.8);
  });

  it("only the Bib Token supports Mini", () => {
    expect(tokenStyleSupportsMini("bib")).toBe(true);
    for (const style of ["vision-v3", "classic", "premium", "pixi", "phosphor", "pill-under"] as const) {
      expect(tokenStyleSupportsMini(style)).toBe(false);
    }
  });

  it("round-trips every size through the engine's compact/mini flags", () => {
    for (const size of ["normal", "compact", "mini"] as const) {
      expect(resolvePlayerTokenSize({ ...playerTokenSizeFlags(size), style: "bib" })).toBe(size);
    }
    expect(playerTokenSizeFlags("mini")).toEqual({ compact: true, mini: true });
  });

  it("a style without Mini falls back to Compact, never Normal", () => {
    const flags = playerTokenSizeFlags("mini");
    expect(resolvePlayerTokenSize({ ...flags, style: "vision-v3" })).toBe("compact");
    expect(isMiniTokenSizeActive({ compact: true, mini: true, practice: false, style: "pixi" })).toBe(false);
  });

  it("Mini refines Compact: with Compact off (e.g. a board loaded at Normal) the board draws Normal", () => {
    expect(resolvePlayerTokenSize({ compact: false, mini: true, style: "bib" })).toBe("normal");
    expect(isMiniTokenSizeActive({ compact: false, mini: true, practice: false, style: "bib" })).toBe(false);
    expect(isMiniTokenSizeActive({ compact: true, mini: true, practice: false, style: "bib" })).toBe(true);
  });

  it("Practice always wins over Mini", () => {
    expect(isMiniTokenSizeActive({ compact: true, mini: true, practice: true, style: "bib" })).toBe(false);
  });
});

describe("Bib Token persistence", () => {
  it("a Training board saved at Mini stores the existing 'compact' presentation (no new value)", () => {
    const flags = playerTokenSizeFlags("mini");
    expect(resolvePlayerPresentation({ compact: flags.compact, practice: false })).toBe("compact");
    expect(playerPresentationFlags("compact")).toEqual({ compact: true, practice: false });
  });

  it("saved boards carry no token style, so existing boards are never rewritten to Bib", () => {
    const stored = sanitizeQuickBoardState({
      players: [],
      items: [],
      drawings: [],
      phases: [],
      movementPaths: [],
      tacticalTokenStyle: "bib",
      tokenSize: "mini",
    });
    expect(stored).not.toBeNull();
    expect(stored).not.toHaveProperty("tacticalTokenStyle");
    expect(stored).not.toHaveProperty("tokenSize");
  });
});
