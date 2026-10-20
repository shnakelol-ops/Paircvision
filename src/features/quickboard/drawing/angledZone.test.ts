import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import { createTacticalDrawingController } from "./tacticalDrawingController";
import { createTacticalDrawingStore } from "./tacticalDrawingStore";
import {
  drawingToolToWhiteboardTool,
  sanitizeDrawingSnapshot,
  sanitizeDrawingTool,
  type TacticalDrawingRecord,
} from "./tacticalDrawingTypes";
import { findClosestDrawingIdAtWorldPoint, renderTacticalDrawing } from "./tacticalLineRenderer";
import { moveAngledZoneCorner, translateAngledZone } from "./angledZoneGeometry";

const identityMapper = {
  normalizedToWorld: (point: { x: number; y: number }) => point,
  worldToNormalized: (point: { x: number; y: number }) => point,
};

type Instruction = { action: string; data?: { style?: { alpha?: number; color?: number; width?: number } } };
function instructionsOf(g: Graphics): Instruction[] {
  return (g.context as unknown as { instructions: Instruction[] }).instructions;
}

function angledZone(id: string, points: Array<[number, number]>, extra: Partial<TacticalDrawingRecord> = {}): TacticalDrawingRecord {
  return {
    id,
    kind: "angled-zone",
    points: points.map(([x, y]) => ({ x, y })),
    color: 0x22c55e,
    width: 1.15,
    opacity: 0.95,
    createdAt: 1,
    ...extra,
  };
}

function rectZone(id: string, from: [number, number], to: [number, number]): TacticalDrawingRecord {
  return {
    id,
    kind: "rectangle-zone",
    points: [{ x: from[0], y: from[1] }, { x: to[0], y: to[1] }],
    color: 0x22c55e,
    width: 1.15,
    opacity: 0.95,
    createdAt: 1,
  };
}

function line(id: string, from: [number, number], to: [number, number]): TacticalDrawingRecord {
  return { id, kind: "plain-line", points: [{ x: from[0], y: from[1] }, { x: to[0], y: to[1] }], color: 0x111111, width: 1.15, opacity: 0.95, createdAt: 1 };
}

const diagonal: Array<[number, number]> = [
  [20, 20],
  [45, 15],
  [50, 45],
  [22, 40],
];

function createController(ids: string[]) {
  let index = 0;
  return createTacticalDrawingController({
    drawingsLayer: new Container(),
    previewGraphic: new Graphics(),
    mapperProvider: () => identityMapper,
    createDrawingId: () => ids[index++] ?? `extra-${index}`,
    strokeFirstEraser: true,
  });
}

function drag(
  controller: ReturnType<typeof createController>,
  tool: Parameters<ReturnType<typeof createController>["setTool"]>[0],
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  controller.setTool(tool);
  controller.handlePointerDown(from, 1);
  controller.handlePointerMove(to, 1);
  return controller.handlePointerUp(to, 1);
}

/** A completed corner drag / move, exactly as the surface commits it. */
function editZone(
  controller: ReturnType<typeof createController>,
  id: string,
  edit: (points: TacticalDrawingRecord["points"]) => TacticalDrawingRecord["points"],
) {
  const drawing = controller.getDrawings().find((entry) => entry.id === id)!;
  const before = drawing.points.map((point) => ({ ...point }));
  controller.updateDrawing(id, { ...drawing, points: edit(drawing.points) });
  controller.recordGeometryEdit(id, before);
}

function pointsOf(controller: ReturnType<typeof createController>, id: string) {
  return controller.exportSnapshots().find((entry) => entry.id === id)?.points;
}

describe("Angled Zone — tool and persistence", () => {
  it("maps the Draw-panel tool both ways", () => {
    expect(sanitizeDrawingTool("angledZone")).toBe("angled-zone");
    expect(sanitizeDrawingTool("angled-zone")).toBe("angled-zone");
    expect(drawingToolToWhiteboardTool("angled-zone")).toBe("angledZone");
  });

  it("round-trips a diagonal zone through save / load with all four corners", () => {
    const saved = JSON.parse(JSON.stringify(angledZone("z1", diagonal)));
    expect(sanitizeDrawingSnapshot(saved, identityMapper)).toEqual(angledZone("z1", diagonal));
  });

  it("drops malformed or self-intersecting zones on load instead of guessing", () => {
    expect(sanitizeDrawingSnapshot(angledZone("z", diagonal.slice(0, 3)), identityMapper)).toBeNull();
    expect(sanitizeDrawingSnapshot(angledZone("z", [...diagonal, [60, 60]]), identityMapper)).toBeNull();
    const bowTie: Array<[number, number]> = [
      [20, 20],
      [40, 40],
      [40, 20],
      [20, 40],
    ];
    expect(sanitizeDrawingSnapshot(angledZone("z", bowTie), identityMapper)).toBeNull();
    expect(sanitizeDrawingSnapshot({ ...angledZone("z", diagonal), points: [{ x: 1 }, null, 3, "x"] }, identityMapper)).toBeNull();
  });

  it("clamps loaded corners to the pitch", () => {
    const loaded = sanitizeDrawingSnapshot(
      angledZone("z", [
        [-10, 20],
        [45, -5],
        [130, 45],
        [22, 40],
      ]),
      identityMapper,
    );
    expect(loaded?.points).toEqual([
      { x: 0, y: 20 },
      { x: 45, y: 0 },
      { x: 100, y: 45 },
      { x: 22, y: 40 },
    ]);
  });

  it("leaves rectangle and circle zones loading exactly as before (two points)", () => {
    expect(sanitizeDrawingSnapshot(rectZone("r", [10, 10], [30, 30]), identityMapper)?.points).toHaveLength(2);
    expect(
      sanitizeDrawingSnapshot({ ...rectZone("c", [10, 10], [30, 30]), kind: "circle-zone" }, identityMapper)?.points,
    ).toHaveLength(2);
  });
});

describe("Angled Zone — rendering", () => {
  it("fills and outlines a polygon with the rectangle zone's fill opacity and border", () => {
    const angled = new Graphics();
    renderTacticalDrawing(angled, angledZone("z", diagonal), identityMapper);
    const rect = new Graphics();
    renderTacticalDrawing(rect, rectZone("r", [20, 20], [50, 45]), identityMapper);
    const styleOf = (g: Graphics, action: string) => instructionsOf(g).find((inst) => inst.action === action)?.data?.style;
    expect(styleOf(angled, "fill")?.alpha).toBe(styleOf(rect, "fill")?.alpha);
    expect(styleOf(angled, "fill")?.color).toBe(styleOf(rect, "fill")?.color);
    expect(styleOf(angled, "stroke")?.alpha).toBe(styleOf(rect, "stroke")?.alpha);
    expect(styleOf(angled, "stroke")?.width).toBe(styleOf(rect, "stroke")?.width);
  });

  it("adds the same selected halo stroke as a rectangle zone", () => {
    const plain = new Graphics();
    renderTacticalDrawing(plain, angledZone("z", diagonal), identityMapper, false);
    const selected = new Graphics();
    renderTacticalDrawing(selected, angledZone("z", diagonal), identityMapper, true);
    const strokeCount = (g: Graphics) => instructionsOf(g).filter((inst) => inst.action === "stroke").length;
    expect(strokeCount(selected)).toBe(strokeCount(plain) + 1);
  });

  it("does not render as a Training Practice Area (it keeps its fill on Training)", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, angledZone("z", diagonal), identityMapper, false, { practiceArea: true });
    expect(instructionsOf(g).some((inst) => inst.action === "fill")).toBe(true);
  });
});

describe("Angled Zone — eraser hit testing", () => {
  it("stroke-first: a line inside the zone is erased before the zone", () => {
    const drawings = [angledZone("z", diagonal), line("l", [30, 30], [40, 30])];
    expect(findClosestDrawingIdAtWorldPoint(drawings, { x: 35, y: 30 }, identityMapper, { strokeFirst: true })).toBe("l");
  });

  it("stroke-first: the interior is a fallback target, the outline a direct one", () => {
    const drawings = [angledZone("z", diagonal)];
    expect(findClosestDrawingIdAtWorldPoint(drawings, { x: 35, y: 30 }, identityMapper, { strokeFirst: true })).toBe("z");
    expect(findClosestDrawingIdAtWorldPoint(drawings, { x: 21, y: 30 }, identityMapper, { strokeFirst: true })).toBe("z");
    expect(findClosestDrawingIdAtWorldPoint(drawings, { x: 80, y: 80 }, identityMapper, { strokeFirst: true })).toBeNull();
  });

  it("original eraser rule also hits the polygon interior", () => {
    expect(findClosestDrawingIdAtWorldPoint([angledZone("z", diagonal)], { x: 35, y: 30 }, identityMapper)).toBe("z");
  });
});

describe("Angled Zone — creation", () => {
  it("a drag creates a four-corner rectangular zone and returns it", () => {
    const controller = createController(["z1"]);
    const committed = drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 40, y: 30 });
    expect(committed?.id).toBe("z1");
    expect(committed?.kind).toBe("angled-zone");
    expect(controller.exportSnapshots()[0]?.points).toEqual([
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 30 },
      { x: 10, y: 30 },
    ]);
  });

  it("a tiny drag (or tap) creates nothing", () => {
    const controller = createController(["z1", "z2"]);
    expect(drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 12, y: 12 })).toBeNull();
    expect(drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 10, y: 10 })).toBeNull();
    expect(controller.exportSnapshots()).toEqual([]);
  });

  it("other tools still return what they commit (Rect Zone keeps two points)", () => {
    const controller = createController(["r1"]);
    const committed = drag(controller, "rectangle-zone", { x: 10, y: 10 }, { x: 40, y: 30 });
    expect(committed?.points).toHaveLength(2);
  });
});

describe("Angled Zone — undo of geometry edits", () => {
  it("Undo after an edit reverts the edit, not the zone", () => {
    const controller = createController(["z1"]);
    drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 40, y: 30 });
    const original = pointsOf(controller, "z1");
    editZone(controller, "z1", (points) => moveAngledZoneCorner(points, 1, { x: 55, y: 5 }));
    expect(pointsOf(controller, "z1")).not.toEqual(original);

    controller.undo();
    expect(pointsOf(controller, "z1")).toEqual(original);
    // Only then does Undo remove the zone itself, exactly as before.
    controller.undo();
    expect(controller.exportSnapshots()).toEqual([]);
  });

  it("multiple independent edits undo one step at a time, newest first", () => {
    const controller = createController(["z1"]);
    drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 40, y: 30 });
    const states = [pointsOf(controller, "z1")];
    editZone(controller, "z1", (points) => moveAngledZoneCorner(points, 0, { x: 5, y: 20 }));
    states.push(pointsOf(controller, "z1"));
    editZone(controller, "z1", (points) => translateAngledZone(points, 10, 5));
    states.push(pointsOf(controller, "z1"));
    editZone(controller, "z1", (points) => moveAngledZoneCorner(points, 2, { x: 60, y: 50 }));

    expect(controller.undoGeometryEdit("z1")).toBe(true);
    expect(pointsOf(controller, "z1")).toEqual(states[2]);
    expect(controller.undoGeometryEdit("z1")).toBe(true);
    expect(pointsOf(controller, "z1")).toEqual(states[1]);
    expect(controller.hasGeometryEdit("z1")).toBe(true);
    expect(controller.undoGeometryEdit("z1")).toBe(true);
    expect(pointsOf(controller, "z1")).toEqual(states[0]);
    // No edits left: the zone's own Undo never deletes it.
    expect(controller.hasGeometryEdit("z1")).toBe(false);
    expect(controller.undoGeometryEdit("z1")).toBe(false);
    expect(controller.exportSnapshots()).toHaveLength(1);
  });

  it("per-zone undo only touches that zone", () => {
    const controller = createController(["a", "b"]);
    drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 30, y: 30 });
    drag(controller, "angled-zone", { x: 50, y: 50 }, { x: 70, y: 70 });
    editZone(controller, "a", (points) => translateAngledZone(points, 5, 0));
    const bBefore = pointsOf(controller, "b");
    editZone(controller, "b", (points) => translateAngledZone(points, 0, 5));
    const bEdited = pointsOf(controller, "b");

    controller.undoGeometryEdit("a");
    expect(pointsOf(controller, "b")).toEqual(bEdited);
    controller.undoGeometryEdit("b");
    expect(pointsOf(controller, "b")).toEqual(bBefore);
  });

  it("a drawing added after an edit is undone first, then the edit", () => {
    const controller = createController(["z1", "l1"]);
    drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 40, y: 30 });
    const original = pointsOf(controller, "z1");
    editZone(controller, "z1", (points) => translateAngledZone(points, 5, 5));
    drag(controller, "plain-line", { x: 60, y: 60 }, { x: 80, y: 60 });

    controller.undo();
    expect(controller.exportSnapshots().map((entry) => entry.id)).toEqual(["z1"]);
    controller.undo();
    expect(pointsOf(controller, "z1")).toEqual(original);
  });

  it("an erase after an edit is restored first, then the edit is reverted", () => {
    const controller = createController(["z1", "l1"]);
    drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 40, y: 30 });
    drag(controller, "plain-line", { x: 60, y: 60 }, { x: 80, y: 60 });
    const original = pointsOf(controller, "z1");
    editZone(controller, "z1", (points) => translateAngledZone(points, 5, 5));
    controller.setTool("eraser");
    controller.handlePointerDown({ x: 70, y: 60 }, 1);
    expect(controller.exportSnapshots().map((entry) => entry.id)).toEqual(["z1"]);

    controller.undo();
    expect(controller.exportSnapshots().map((entry) => entry.id)).toEqual(["z1", "l1"]);
    controller.undo();
    expect(pointsOf(controller, "z1")).toEqual(original);
    expect(controller.exportSnapshots()).toHaveLength(2);
  });

  it("clear and load drop the edit history", () => {
    const controller = createController(["z1"]);
    drag(controller, "angled-zone", { x: 10, y: 10 }, { x: 40, y: 30 });
    editZone(controller, "z1", (points) => translateAngledZone(points, 5, 5));
    const snapshots = controller.exportSnapshots();
    controller.importSnapshots(snapshots);
    expect(controller.hasGeometryEdit("z1")).toBe(false);
    controller.undo();
    expect(controller.exportSnapshots()).toEqual([]);
  });

  it("Practice Area style in-place updates stay non-undoable (unchanged behaviour)", () => {
    const store = createTacticalDrawingStore();
    store.append(rectZone("r", [10, 10], [30, 30]));
    store.updateById("r", rectZone("r", [20, 20], [40, 40]));
    expect(store.undoGeometryEditIfNewest()).toBe(false);
    expect(store.hasGeometryEdit()).toBe(false);
    expect(store.popLast()?.id).toBe("r");
  });
});
