import { describe, expect, it, vi } from "vitest";

import type {
  FlowItemType,
  TacticalPadLiteExperimentalRenderTargets,
} from "../../engine/pixi/createTacticalPadLiteSurface";
import {
  GOAL_VIEW_UPRIGHT_ITEM_TYPES,
  createSlateGoalViewHost,
  slateGoalViewLensOptions,
  toSlateGoalViewTargets,
} from "./slateGoalView";

// Plain stand-ins: the adapter only passes containers through and asks the
// surface which equipment type a node draws.
function fakeTargets(types: Map<object, FlowItemType>) {
  const layer = (name: string) => ({ name }) as unknown as TacticalPadLiteExperimentalRenderTargets["world"];
  return {
    app: { name: "app" },
    world: layer("world"),
    playersLayer: layer("players"),
    ballLayer: layer("ball"),
    itemsLayer: layer("items"),
    getItemTypeForNode: (node: object) => types.get(node) ?? null,
  } as unknown as TacticalPadLiteExperimentalRenderTargets;
}

describe("Slate → shared Goal View lens adapter", () => {
  it("maps Slate layers onto the shared lens targets", () => {
    const t = fakeTargets(new Map());
    const g = toSlateGoalViewTargets(t);
    expect(g.app).toBe(t.app);
    expect(g.world).toBe(t.world);
    expect(g.tokenLayer).toBe(t.playersLayer);
    expect(g.ballLayer).toBe(t.ballLayer);
    // Insertion-ordered world: goals go directly beneath the equipment layer.
    expect(g.goalDecalBefore).toBe(t.itemsLayer);
    expect(g.extraBillboardLayers).toHaveLength(1);
    expect(g.extraBillboardLayers![0].layer).toBe(t.itemsLayer);
  });

  it("stands upright equipment up and leaves flat equipment on the turf (nothing hidden)", () => {
    const all: FlowItemType[] = ["cone", "discCone", "pole", "miniGoal", "gaaGoal", "mannequin", "ladder", "hurdle", "tackleBag"];
    const nodes = new Map<object, FlowItemType>(all.map((type) => [{ type }, type]));
    const { isUpright } = toSlateGoalViewTargets(fakeTargets(nodes)).extraBillboardLayers![0];
    const upright = [...nodes.entries()].filter(([node]) => isUpright(node as never)).map(([, type]) => type);
    expect(upright.sort()).toEqual(["cone", "hurdle", "mannequin", "pole", "tackleBag"]);
    expect([...GOAL_VIEW_UPRIGHT_ITEM_TYPES].sort()).toEqual(upright.sort());
    expect(isUpright({} as never)).toBe(false); // unknown nodes are never stretched
  });

  it("shows upright goals only on boards whose pitch draws goals", () => {
    expect(slateGoalViewLensOptions("gaelicBands").uprightGoals).toBe(true);
    expect(slateGoalViewLensOptions("tacticalBoard").uprightGoals).toBe(true);
    expect(slateGoalViewLensOptions("default").uprightGoals).toBe(true);
    expect(slateGoalViewLensOptions("whiteboard").uprightGoals).toBe(true);
    expect(slateGoalViewLensOptions("grass").uprightGoals).toBe(false); // Training board: no goals
  });

  it("uses the board's dark goal tint on the light whiteboard surface only", () => {
    expect(slateGoalViewLensOptions("whiteboard").goalDecalColor).toBe(0x0b1219);
    expect(slateGoalViewLensOptions("gaelicBands").goalDecalColor).toBeUndefined();
  });

  it("host forwards orientation and carries the board's lens options", () => {
    const surface = { setOrientation: vi.fn(), getExperimentalRenderTargets: () => fakeTargets(new Map()) };
    const host = createSlateGoalViewHost(surface, "grass");
    host.setOrientation(3);
    expect(surface.setOrientation).toHaveBeenCalledWith(3);
    expect(host.lensOptions).toEqual({ uprightGoals: false });
    expect(host.getExperimentalRenderTargets().goalDecalBefore).toBeDefined();
  });
});
