import { describe, expect, it } from "vitest";

import { createTacticalDrawingStore } from "./tacticalDrawingStore";
import type { TacticalDrawingRecord } from "./tacticalDrawingTypes";

function stroke(id: string): TacticalDrawingRecord {
  return {
    id,
    kind: "plain-line",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    color: 0x111111,
    width: 1.15,
    opacity: 0.95,
    createdAt: Date.now(),
  };
}

describe("tacticalDrawingStore eraser undo", () => {
  it("restores an erased stroke at its original position via restoreLastErased", () => {
    const store = createTacticalDrawingStore();
    store.append(stroke("A"));
    store.append(stroke("B"));
    store.append(stroke("C"));

    // Eraser tool flow: select then delete.
    store.select("B");
    expect(store.deleteSelected()).toBe(true);
    expect(store.getAll().map((d) => d.id)).toEqual(["A", "C"]);

    expect(store.restoreLastErased()).toBe(true);
    expect(store.getAll().map((d) => d.id)).toEqual(["A", "B", "C"]);
  });

  it("returns false when there is nothing to restore", () => {
    const store = createTacticalDrawingStore();
    store.append(stroke("A"));
    expect(store.restoreLastErased()).toBe(false);
  });

  it("invalidates the pending erase once a new stroke is committed", () => {
    const store = createTacticalDrawingStore();
    store.append(stroke("A"));
    store.append(stroke("B"));
    store.select("A");
    store.deleteSelected();
    store.append(stroke("D"));

    expect(store.restoreLastErased()).toBe(false);
    expect(store.getAll().map((d) => d.id)).toEqual(["B", "D"]);
  });

  it("invalidates the pending erase once popLast runs", () => {
    const store = createTacticalDrawingStore();
    store.append(stroke("A"));
    store.append(stroke("B"));
    store.select("A");
    store.deleteSelected();
    store.popLast();

    expect(store.restoreLastErased()).toBe(false);
  });

  it("ordinary undo-last-stroke (popLast) still works for a freshly drawn stroke", () => {
    const store = createTacticalDrawingStore();
    store.append(stroke("A"));
    store.append(stroke("B"));

    const popped = store.popLast();
    expect(popped?.id).toBe("B");
    expect(store.getAll().map((d) => d.id)).toEqual(["A"]);
  });
});
