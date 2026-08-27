import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import { createTacticalDrawingController } from "./tacticalDrawingController";

const identityMapper = {
  normalizedToWorld: (point: { x: number; y: number }) => point,
  worldToNormalized: (point: { x: number; y: number }) => point,
};

function createController(ids: string[]) {
  let index = 0;
  return createTacticalDrawingController({
    drawingsLayer: new Container(),
    previewGraphic: new Graphics(),
    mapperProvider: () => identityMapper,
    createDrawingId: () => ids[index++]!,
  });
}

function drawLine(
  controller: ReturnType<typeof createTacticalDrawingController>,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  controller.setTool("plain-line");
  controller.handlePointerDown(from, 1);
  controller.handlePointerMove(to, 1);
  controller.handlePointerUp(to, 1);
}

describe("tacticalDrawingController eraser + undo", () => {
  it("erasing a stroke then undo restores it (draw A, B, C -> erase B -> undo -> B returns)", () => {
    const controller = createController(["A", "B", "C"]);
    drawLine(controller, { x: 0, y: 0 }, { x: 20, y: 0 });
    drawLine(controller, { x: 0, y: 30 }, { x: 20, y: 30 });
    drawLine(controller, { x: 0, y: 60 }, { x: 20, y: 60 });

    expect(controller.exportSnapshots().map((s) => s.id)).toEqual(["A", "B", "C"]);

    controller.setTool("eraser");
    controller.handlePointerDown({ x: 10, y: 30 }, 1); // hits B
    expect(controller.exportSnapshots().map((s) => s.id)).toEqual(["A", "C"]);

    controller.undo();
    expect(controller.exportSnapshots().map((s) => s.id)).toEqual(["A", "B", "C"]);
  });

  it("ordinary undo of a newly drawn stroke still works", () => {
    const controller = createController(["A", "B"]);
    drawLine(controller, { x: 0, y: 0 }, { x: 20, y: 0 });
    drawLine(controller, { x: 0, y: 30 }, { x: 20, y: 30 });

    controller.undo();
    expect(controller.exportSnapshots().map((s) => s.id)).toEqual(["A"]);
  });

  it("does not resurrect an erased stroke once a new stroke has been drawn since", () => {
    const controller = createController(["A", "B", "D"]);
    drawLine(controller, { x: 0, y: 0 }, { x: 20, y: 0 });
    drawLine(controller, { x: 0, y: 30 }, { x: 20, y: 30 });

    controller.setTool("eraser");
    controller.handlePointerDown({ x: 10, y: 30 }, 1); // erase B
    expect(controller.exportSnapshots().map((s) => s.id)).toEqual(["A"]);

    drawLine(controller, { x: 0, y: 60 }, { x: 20, y: 60 }); // draw D

    controller.undo();
    expect(controller.exportSnapshots().map((s) => s.id)).toEqual(["A"]);
  });
});
