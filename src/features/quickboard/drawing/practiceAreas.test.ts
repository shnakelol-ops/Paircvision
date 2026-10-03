import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import { createTacticalDrawingController } from "./tacticalDrawingController";
import { createTacticalDrawingStore } from "./tacticalDrawingStore";
import { sanitizeDrawingSnapshot, type TacticalDrawingRecord } from "./tacticalDrawingTypes";
import { findClosestDrawingIdAtWorldPoint, renderTacticalDrawing } from "./tacticalLineRenderer";

const identityMapper = {
  normalizedToWorld: (point: { x: number; y: number }) => point,
  worldToNormalized: (point: { x: number; y: number }) => point,
};

type Instruction = { action: string; data?: { style?: { alpha?: number; color?: number } } };
function instructionsOf(g: Graphics): Instruction[] {
  return (g.context as unknown as { instructions: Instruction[] }).instructions;
}
function fills(g: Graphics): Instruction[] {
  return instructionsOf(g).filter((inst) => inst.action === "fill");
}
function strokes(g: Graphics): Instruction[] {
  return instructionsOf(g).filter((inst) => inst.action === "stroke");
}

function zone(id: string, kind: "rectangle-zone" | "circle-zone", from: [number, number], to: [number, number], extra: Partial<TacticalDrawingRecord> = {}): TacticalDrawingRecord {
  return {
    id,
    kind,
    points: [{ x: from[0], y: from[1] }, { x: to[0], y: to[1] }],
    color: 0xffffff,
    width: 1.15,
    opacity: 0.95,
    createdAt: 1,
    ...extra,
  };
}

function line(id: string, from: [number, number], to: [number, number]): TacticalDrawingRecord {
  return { id, kind: "plain-line", points: [{ x: from[0], y: from[1] }, { x: to[0], y: to[1] }], color: 0x111111, width: 1.15, opacity: 0.95, createdAt: 1 };
}

describe("Dead Zone sanitiser", () => {
  it("round-trips zoneStyle 'dead' on rectangles", () => {
    const out = sanitizeDrawingSnapshot(zone("a", "rectangle-zone", [10, 10], [30, 30], { zoneStyle: "dead" }), identityMapper);
    expect(out?.zoneStyle).toBe("dead");
    expect(sanitizeDrawingSnapshot(JSON.parse(JSON.stringify(out)), identityMapper)).toEqual(out);
  });

  it("drops unknown styles and never puts zoneStyle on circles or strokes", () => {
    expect("zoneStyle" in sanitizeDrawingSnapshot({ ...zone("a", "rectangle-zone", [1, 1], [9, 9]), zoneStyle: "practice" }, identityMapper)!).toBe(false);
    expect("zoneStyle" in sanitizeDrawingSnapshot({ ...zone("b", "circle-zone", [1, 1], [9, 9]), zoneStyle: "dead" }, identityMapper)!).toBe(false);
    expect("zoneStyle" in sanitizeDrawingSnapshot({ ...line("c", [1, 1], [9, 9]), zoneStyle: "dead" }, identityMapper)!).toBe(false);
  });

  it("legacy drawings without the field still load unchanged", () => {
    const legacy = zone("a", "rectangle-zone", [10, 10], [30, 30]);
    expect(sanitizeDrawingSnapshot(legacy, identityMapper)).toEqual(legacy);
  });
});

describe("Practice Area rendering", () => {
  it("a normal Practice Area has a transparent interior: outline stroke, no fill at all", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, zone("a", "rectangle-zone", [10, 10], [40, 30], { color: 0xfacc15 }), identityMapper, false, { practiceArea: true });
    expect(fills(g)).toHaveLength(0);
    expect(strokes(g)).toHaveLength(1);
    expect(strokes(g)[0]!.data?.style?.color).toBe(0xfacc15);
  });

  it("selection adds only a halo stroke — still no fill", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, zone("a", "rectangle-zone", [10, 10], [40, 30]), identityMapper, true, { practiceArea: true });
    expect(fills(g)).toHaveLength(0);
    expect(strokes(g).length).toBeGreaterThanOrEqual(2);
  });

  it("a Dead Zone is the one interior treatment: subtle charcoal shade + hatch + dashed outline", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, zone("a", "rectangle-zone", [10, 10], [40, 30], { zoneStyle: "dead" }), identityMapper, false, { practiceArea: true });
    const fillStyles = fills(g).map((inst) => inst.data?.style);
    expect(fillStyles).toHaveLength(1);
    expect(fillStyles[0]!.alpha).toBeLessThanOrEqual(0.15);
    expect(fillStyles[0]!.color).toBe(0x1f2933);
    expect(strokes(g).length).toBeGreaterThanOrEqual(2); // hatch + dashed outline
  });

  it("Pitch rectangle zones (no practiceArea option) keep today's translucent fill and stroke", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, zone("a", "rectangle-zone", [10, 10], [40, 30]), identityMapper, false);
    expect(fills(g)).toHaveLength(1);
    expect(fills(g)[0]!.data?.style?.alpha).toBeCloseTo(Math.max(0.12, Math.min(0.42, 0.95 * 0.3)));
    expect(strokes(g)).toHaveLength(1);
  });

  it("circles are untouched by Practice Areas: still filled, even with the option on", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, zone("a", "circle-zone", [10, 10], [40, 30]), identityMapper, false, { practiceArea: true });
    expect(fills(g)).toHaveLength(1);
  });
});

describe("stroke-first eraser", () => {
  const area = zone("area", "rectangle-zone", [0, 0], [60, 60]);
  const inner = line("inner", [20, 30], [40, 30]);

  // A finger lands near a line, not exactly on it: 1 unit off the line here.
  const nearLine = { x: 30, y: 31 };

  it("legacy rule (Tactical Sequence): the zone swallows a tap meant for a line drawn inside it", () => {
    expect(findClosestDrawingIdAtWorldPoint([area, inner], nearLine, identityMapper)).toBe("area");
    expect(findClosestDrawingIdAtWorldPoint([inner, area], { x: 30, y: 30 }, identityMapper)).toBe("area");
  });

  it("stroke-first (Tactical Slate): the line inside the zone is erased instead, in either drawing order", () => {
    expect(findClosestDrawingIdAtWorldPoint([area, inner], nearLine, identityMapper, { strokeFirst: true })).toBe("inner");
    expect(findClosestDrawingIdAtWorldPoint([inner, area], { x: 30, y: 30 }, identityMapper, { strokeFirst: true })).toBe("inner");
  });

  it("Pitch: a tap inside a filled zone with no stroke in reach still erases the zone", () => {
    expect(findClosestDrawingIdAtWorldPoint([area, inner], { x: 30, y: 45 }, identityMapper, { strokeFirst: true })).toBe("area");
  });

  it("Pitch: nested filled zones keep the old most-recently-drawn tie-break", () => {
    const outer = zone("outer", "rectangle-zone", [0, 0], [90, 90]);
    const nested = zone("nested", "rectangle-zone", [20, 20], [70, 70]);
    expect(findClosestDrawingIdAtWorldPoint([outer, nested], { x: 45, y: 45 }, identityMapper)).toBe("nested");
    expect(findClosestDrawingIdAtWorldPoint([outer, nested], { x: 45, y: 45 }, identityMapper, { strokeFirst: true })).toBe("nested");
  });

  it("an outline tap erases the zone", () => {
    expect(findClosestDrawingIdAtWorldPoint([area], { x: 59, y: 30 }, identityMapper, { strokeFirst: true })).toBe("area");
  });

  it("Training: a normal Practice Area's grass interior is never an eraser target, its outline is", () => {
    const opts = { strokeFirst: true, practiceAreas: true };
    expect(findClosestDrawingIdAtWorldPoint([area], { x: 30, y: 45 }, identityMapper, opts)).toBeNull();
    expect(findClosestDrawingIdAtWorldPoint([area], { x: 59, y: 30 }, identityMapper, opts)).toBe("area");
    expect(findClosestDrawingIdAtWorldPoint([area, inner], nearLine, identityMapper, opts)).toBe("inner");
  });

  it("Training: a Dead Zone's shaded interior stays a fallback target", () => {
    const dead = { ...area, zoneStyle: "dead" as const };
    expect(findClosestDrawingIdAtWorldPoint([dead], { x: 30, y: 45 }, identityMapper, { strokeFirst: true, practiceAreas: true })).toBe("area");
  });
});

function makeController(practice: boolean, ids: string[]) {
  let index = 0;
  const drawingsLayer = new Container();
  const practiceAreasLayer = new Container();
  const controller = createTacticalDrawingController({
    drawingsLayer,
    previewGraphic: new Graphics(),
    mapperProvider: () => identityMapper,
    createDrawingId: () => ids[index++] ?? `x${index}`,
    strokeFirstEraser: true,
    ...(practice ? { practiceAreasLayer } : {}),
  });
  return { controller, drawingsLayer, practiceAreasLayer };
}

function draw(controller: ReturnType<typeof createTacticalDrawingController>, tool: Parameters<ReturnType<typeof createTacticalDrawingController>["setTool"]>[0], from: [number, number], to: [number, number]) {
  controller.setTool(tool);
  controller.handlePointerDown({ x: from[0], y: from[1] }, 1);
  controller.handlePointerMove({ x: to[0], y: to[1] }, 1);
  controller.handlePointerUp({ x: to[0], y: to[1] }, 1);
}

describe("controller — Practice Area layer (Training only)", () => {
  it("Training: rectangles render into the Practice Area layer; lines and circles stay in the drawings layer", () => {
    const { controller, drawingsLayer, practiceAreasLayer } = makeController(true, ["rect", "line", "circle"]);
    draw(controller, "rectangle-zone", [10, 10], [40, 30]);
    draw(controller, "plain-line", [0, 50], [20, 50]);
    draw(controller, "circle-zone", [60, 60], [80, 80]);
    expect(practiceAreasLayer.children).toHaveLength(1);
    expect(drawingsLayer.children).toHaveLength(2);
    expect(fills(practiceAreasLayer.children[0] as Graphics)).toHaveLength(0);
  });

  it("Pitch/Whiteboard (no Practice Area layer): everything stays in the drawings layer, rectangles filled", () => {
    const { controller, drawingsLayer, practiceAreasLayer } = makeController(false, ["rect"]);
    draw(controller, "rectangle-zone", [10, 10], [40, 30]);
    expect(practiceAreasLayer.children).toHaveLength(0);
    expect(drawingsLayer.children).toHaveLength(1);
    expect(fills(drawingsLayer.children[0] as Graphics)).toHaveLength(1);
  });

  it("a rectangle being drawn on Training previews as a transparent outline (never filled first)", () => {
    const previewGraphic = new Graphics();
    const controller = createTacticalDrawingController({
      drawingsLayer: new Container(),
      previewGraphic,
      mapperProvider: () => identityMapper,
      practiceAreasLayer: new Container(),
    });
    controller.setTool("rectangle-zone");
    controller.handlePointerDown({ x: 10, y: 10 }, 1);
    controller.handlePointerMove({ x: 40, y: 30 }, 1);
    expect(fills(previewGraphic)).toHaveLength(0);
    expect(strokes(previewGraphic)).toHaveLength(1);
  });

  it("updateDrawing replaces in place: same id, same position, new geometry/colour/style", () => {
    const { controller } = makeController(true, ["a", "b"]);
    draw(controller, "rectangle-zone", [10, 10], [40, 30]);
    draw(controller, "rectangle-zone", [50, 50], [70, 70]);
    const a = controller.getDrawings()[0]!;
    controller.updateDrawing("a", { ...a, points: [{ x: 15, y: 15 }, { x: 45, y: 35 }], color: 0x2563eb, zoneStyle: "dead" });
    const after = controller.exportSnapshots();
    expect(after.map((d) => d.id)).toEqual(["a", "b"]);
    expect(after[0]).toMatchObject({ id: "a", color: 0x2563eb, zoneStyle: "dead", points: [{ x: 15, y: 15 }, { x: 45, y: 35 }] });
  });

  it("a duplicate (appendDrawing) is independent and Undo removes it", () => {
    const { controller } = makeController(true, ["a"]);
    draw(controller, "rectangle-zone", [10, 10], [40, 30]);
    const a = controller.getDrawings()[0]!;
    controller.appendDrawing({ ...a, id: "copy", points: [{ x: 14, y: 14 }, { x: 44, y: 34 }] });
    controller.updateDrawing("copy", { ...controller.getDrawings()[1]!, color: 0xdc2626 });
    // recolouring the copy leaves the original untouched
    expect(controller.getDrawings()[0]!.color).toBe(a.color);
    expect(controller.getDrawings()[0]!.points).toEqual(a.points);
    controller.undo();
    expect(controller.exportSnapshots().map((d) => d.id)).toEqual(["a"]);
  });

  it("selected Delete (removeDrawing) is undoable exactly like the eraser", () => {
    const { controller } = makeController(true, ["a", "b"]);
    draw(controller, "rectangle-zone", [10, 10], [40, 30]);
    draw(controller, "rectangle-zone", [50, 50], [70, 70]);
    expect(controller.removeDrawing("a")).toBe(true);
    expect(controller.exportSnapshots().map((d) => d.id)).toEqual(["b"]);
    controller.undo();
    expect(controller.exportSnapshots().map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("the Practice Area highlight is not the store selection — Undo never deletes a highlighted area", () => {
    const { controller } = makeController(true, ["a", "b"]);
    draw(controller, "rectangle-zone", [10, 10], [40, 30]);
    draw(controller, "plain-line", [0, 50], [20, 50]);
    controller.setHighlightedDrawingId("a");
    controller.undo(); // removes the newest drawing (the line), not the highlighted area
    expect(controller.exportSnapshots().map((d) => d.id)).toEqual(["a"]);
  });

  it("Dead Zone and colour survive export -> import (draft / saved board round-trip)", () => {
    const { controller } = makeController(true, ["a"]);
    draw(controller, "rectangle-zone", [10, 10], [40, 30]);
    controller.updateDrawing("a", { ...controller.getDrawings()[0]!, color: 0xfacc15, zoneStyle: "dead" });
    const saved = JSON.parse(JSON.stringify(controller.exportSnapshots()));
    const restored = saved.map((entry: unknown) => sanitizeDrawingSnapshot(entry, identityMapper));
    const { controller: reopened } = makeController(true, []);
    reopened.importSnapshots(restored);
    expect(reopened.exportSnapshots()).toEqual(controller.exportSnapshots());
  });
});

describe("store.updateById", () => {
  it("replaces a drawing at its index and reports a missing id", () => {
    const store = createTacticalDrawingStore();
    store.append(line("a", [0, 0], [1, 1]));
    store.append(line("b", [0, 0], [2, 2]));
    expect(store.updateById("a", { ...line("a", [5, 5], [6, 6]) })).toBe(true);
    expect(store.getAll().map((d) => d.id)).toEqual(["a", "b"]);
    expect(store.getAll()[0]!.points[0]).toEqual({ x: 5, y: 5 });
    expect(store.updateById("missing", line("missing", [0, 0], [1, 1]))).toBe(false);
  });
});
