import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import { TACTICAL_ITEM_CHOICES } from "../../pages/TacticalPadLiteClean";
import { isBallItem, resolveBallDrawRadius, sanitizeTacticalItemCandidate } from "./createTacticalPadLiteSurface";
import {
  GAA_GOAL_BOTTOM_FACTOR,
  GAA_GOAL_CROSSBAR_FACTOR,
  GAA_GOAL_TOP_FACTOR,
  GAA_GOAL_WIDTH_FACTOR,
  drawGaaGoalItem,
} from "./gaaGoalItemGraphic";

type Instruction = { action: string; data?: { style?: { color?: number; alpha?: number }; path?: unknown } };
function instructionsOf(g: Graphics): Instruction[] {
  return (g.context as unknown as { instructions: Instruction[] }).instructions;
}

const SLATE_HALF_SIZE = 2.2;

describe("GAA Goal drawing", () => {
  it("is native vector: fills and strokes only, no texture", () => {
    const g = new Graphics();
    drawGaaGoalItem(g, SLATE_HALF_SIZE);
    const instructions = instructionsOf(g);
    expect(instructions.length).toBeGreaterThan(5);
    for (const inst of instructions) {
      expect(["fill", "stroke"]).toContain(inst.action);
      const texture = (inst.data?.style as { texture?: { label?: string } } | undefined)?.texture;
      expect(texture?.label ?? "WHITE").toMatch(/WHITE|EMPTY/i);
    }
  });

  it("has white posts/crossbar and light mesh lines", () => {
    const g = new Graphics();
    drawGaaGoalItem(g, SLATE_HALF_SIZE);
    const fillColors = instructionsOf(g)
      .filter((inst) => inst.action === "fill")
      .map((inst) => inst.data?.style?.color);
    const strokeColors = instructionsOf(g)
      .filter((inst) => inst.action === "stroke")
      .map((inst) => inst.data?.style?.color);
    // Three frame pieces (two uprights + crossbar) in the shared equipment white.
    expect(fillColors.filter((color) => color === 0xf8fafc).length).toBeGreaterThanOrEqual(3);
    expect(strokeColors).toContain(0xcbd5e1); // mesh
    expect(strokeColors).toContain(0x94a3b8); // net depth frame
  });

  it("uprights rise above the crossbar and the net sits below it", () => {
    const g = new Graphics();
    drawGaaGoalItem(g, SLATE_HALF_SIZE);
    const bounds = g.getLocalBounds();
    const crossbarY = SLATE_HALF_SIZE * GAA_GOAL_CROSSBAR_FACTOR;
    // Upright tops sit well above the crossbar (outline adds a hair of stroke).
    expect(bounds.minY).toBeLessThan(crossbarY - SLATE_HALF_SIZE);
    expect(bounds.minY).toBeCloseTo(SLATE_HALF_SIZE * GAA_GOAL_TOP_FACTOR, 0);
    expect(bounds.maxY).toBeGreaterThan(SLATE_HALF_SIZE * GAA_GOAL_BOTTOM_FACTOR);
    expect(bounds.maxX - bounds.minX).toBeCloseTo(SLATE_HALF_SIZE * GAA_GOAL_WIDTH_FACTOR, 0);
  });

  it("stays compact: about the Mini Goal's footprint so it reads at mobile scale", () => {
    const g = new Graphics();
    drawGaaGoalItem(g, SLATE_HALF_SIZE);
    const bounds = g.getLocalBounds();
    // Mini Goal is 2.8h wide; the touch/hit radius both goals share is 1.9h.
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(SLATE_HALF_SIZE * 2.8);
    expect(Math.max(-bounds.minY, bounds.maxY)).toBeLessThanOrEqual(SLATE_HALF_SIZE * 1.9);
  });

  it("scales with the host's item size (movement board uses a larger half-size)", () => {
    const small = new Graphics();
    const large = new Graphics();
    drawGaaGoalItem(small, 2.2);
    drawGaaGoalItem(large, 3.2);
    const ratio = (large.getLocalBounds().maxX - large.getLocalBounds().minX) / (small.getLocalBounds().maxX - small.getLocalBounds().minX);
    expect(ratio).toBeCloseTo(3.2 / 2.2, 2);
  });
});

describe("GAA Goal on the Tactical Slate Items menu", () => {
  it("is offered as its own item next to the Mini Goal, which is unchanged", () => {
    const types = TACTICAL_ITEM_CHOICES.map((choice) => choice.type);
    expect(TACTICAL_ITEM_CHOICES).toContainEqual({ label: "GAA Goal", type: "gaaGoal" });
    expect(TACTICAL_ITEM_CHOICES).toContainEqual({ label: "Mini Goal", type: "miniGoal" });
    expect(types.indexOf("gaaGoal")).toBe(types.indexOf("miniGoal") + 1);
    expect(types).toEqual(["cone", "discCone", "pole", "miniGoal", "gaaGoal", "mannequin", "ladder", "hurdle", "tackleBag"]);
  });

  it("is equipment, not a ball (Ball mode and ball physics stay untouched)", () => {
    expect(isBallItem({ type: "gaaGoal" })).toBe(false);
    expect(resolveBallDrawRadius("gaaGoal")).toBeNull();
  });
});

describe("GAA Goal persistence", () => {
  it("round-trips through the board import sanitiser with rotation and scale", () => {
    const saved = { id: "item-1", type: "gaaGoal", x: 42, y: 18, rotation: Math.PI / 2, scale: 1.5 };
    const loaded = sanitizeTacticalItemCandidate(JSON.parse(JSON.stringify(saved)));
    expect(loaded).toEqual(saved);
    expect(sanitizeTacticalItemCandidate(JSON.parse(JSON.stringify(loaded)))).toEqual(saved);
  });

  it("applies the same clamps as every other item", () => {
    const loaded = sanitizeTacticalItemCandidate({ id: "g", type: "gaaGoal", x: 140, y: -5, scale: 9 });
    expect(loaded).toMatchObject({ type: "gaaGoal", x: 100, y: 0, scale: 2 });
  });

  it("existing Mini Goals still load, and unknown types are still dropped", () => {
    expect(sanitizeTacticalItemCandidate({ id: "m", type: "miniGoal", x: 10, y: 10 })).toMatchObject({ type: "miniGoal" });
    expect(sanitizeTacticalItemCandidate({ id: "x", type: "bigGoal", x: 10, y: 10 })).toBeNull();
  });

  it("the page-side board loader whitelists gaaGoal alongside miniGoal", () => {
    // extractItemsFromBoardState lives inside the page component; lock its
    // type whitelist so a saved GAA Goal is never silently dropped on load.
    const source = readFileSync(resolve(__dirname, "../../pages/TacticalPadLiteClean.tsx"), "utf8");
    const loader = source.slice(source.indexOf("const extractItemsFromBoardState"));
    expect(loader.slice(0, 2000)).toMatch(/type !== "miniGoal" &&\s+type !== "gaaGoal" &&/);
  });
});
