import { describe, expect, it } from "vitest";

import {
  PRACTICE_AREA_MIN_SIZE,
  distanceToPracticeRectEdge,
  duplicatePracticeRect,
  findPracticeAreaAt,
  findPracticeRectCornerAt,
  practiceRectFromPoints,
  practiceRectToPoints,
  resizePracticeRectCorner,
  translatePracticeRect,
} from "./practiceAreaGeometry";

const rect = { left: 20, top: 30, right: 50, bottom: 60 };

describe("practice rectangle points", () => {
  it("reads any two drawn corners as one rectangle", () => {
    expect(practiceRectFromPoints([{ x: 50, y: 60 }, { x: 20, y: 30 }])).toEqual(rect);
    expect(practiceRectFromPoints([{ x: 20, y: 60 }, { x: 50, y: 30 }])).toEqual(rect);
    expect(practiceRectFromPoints([{ x: 1, y: 1 }])).toBeNull();
  });

  it("writes back a canonical top-left / bottom-right pair", () => {
    expect(practiceRectToPoints(rect)).toEqual([{ x: 20, y: 30 }, { x: 50, y: 60 }]);
  });
});

describe("translatePracticeRect", () => {
  it("moves both corners by the same amount, keeping the size", () => {
    expect(translatePracticeRect(rect, 10, -5)).toEqual({ left: 30, top: 25, right: 60, bottom: 55 });
  });

  it("stops at the board edge without shrinking the rectangle", () => {
    expect(translatePracticeRect(rect, 80, 80)).toEqual({ left: 70, top: 70, right: 100, bottom: 100 });
    expect(translatePracticeRect(rect, -80, -80)).toEqual({ left: 0, top: 0, right: 30, bottom: 30 });
  });
});

describe("resizePracticeRectCorner — each corner, opposite corner fixed", () => {
  it("top-left", () => {
    expect(resizePracticeRectCorner(rect, "tl", { x: 10, y: 25 })).toEqual({ left: 10, top: 25, right: 50, bottom: 60 });
  });
  it("top-right", () => {
    expect(resizePracticeRectCorner(rect, "tr", { x: 70, y: 25 })).toEqual({ left: 20, top: 25, right: 70, bottom: 60 });
  });
  it("bottom-left", () => {
    expect(resizePracticeRectCorner(rect, "bl", { x: 10, y: 80 })).toEqual({ left: 10, top: 30, right: 50, bottom: 80 });
  });
  it("bottom-right", () => {
    expect(resizePracticeRectCorner(rect, "br", { x: 40, y: 45 })).toEqual({ left: 20, top: 30, right: 40, bottom: 45 });
  });

  it("enforces the minimum size and never lets a corner cross its opposite", () => {
    const shrunk = resizePracticeRectCorner(rect, "br", { x: 0, y: 0 });
    expect(shrunk).toEqual({ left: 20, top: 30, right: 20 + PRACTICE_AREA_MIN_SIZE, bottom: 30 + PRACTICE_AREA_MIN_SIZE });
    const crossed = resizePracticeRectCorner(rect, "tl", { x: 99, y: 99 });
    expect(crossed).toEqual({ left: 50 - PRACTICE_AREA_MIN_SIZE, top: 60 - PRACTICE_AREA_MIN_SIZE, right: 50, bottom: 60 });
  });

  it("clamps the dragged corner to the board", () => {
    expect(resizePracticeRectCorner(rect, "br", { x: 140, y: -20 })).toEqual({ left: 20, top: 30, right: 100, bottom: 35 });
  });
});

describe("duplicatePracticeRect", () => {
  it("offsets the copy down-right with the same size", () => {
    expect(duplicatePracticeRect(rect)).toEqual({ left: 24, top: 34, right: 54, bottom: 64 });
  });

  it("offsets the other way on an axis that would leave the board", () => {
    expect(duplicatePracticeRect({ left: 70, top: 10, right: 98, bottom: 30 })).toEqual({ left: 66, top: 14, right: 94, bottom: 34 });
  });

  it("returns a new object (an independent copy)", () => {
    const copy = duplicatePracticeRect(rect);
    expect(copy).not.toBe(rect);
    expect(rect).toEqual({ left: 20, top: 30, right: 50, bottom: 60 });
  });
});

describe("hit testing", () => {
  it("finds the nearest corner handle within the touch tolerance", () => {
    expect(findPracticeRectCornerAt(rect, { x: 21, y: 31 }, 3)).toBe("tl");
    expect(findPracticeRectCornerAt(rect, { x: 49, y: 59 }, 3)).toBe("br");
    expect(findPracticeRectCornerAt(rect, { x: 35, y: 45 }, 3)).toBeNull();
  });

  it("measures distance to the outline from inside and outside", () => {
    expect(distanceToPracticeRectEdge(rect, { x: 22, y: 45 })).toBe(2);
    expect(distanceToPracticeRectEdge(rect, { x: 35, y: 45 })).toBe(15);
    expect(distanceToPracticeRectEdge(rect, { x: 10, y: 45 })).toBe(10);
  });

  const big = { id: "big", rect: { left: 0, top: 0, right: 100, bottom: 100 } };
  const small = { id: "small", rect: { left: 40, top: 40, right: 60, bottom: 60 } };

  it("a tap inside an area selects it; outside every area selects nothing", () => {
    expect(findPracticeAreaAt([small], { x: 50, y: 50 }, 1)).toBe("small");
    expect(findPracticeAreaAt([small], { x: 10, y: 10 }, 1)).toBeNull();
  });

  it("overlapping areas: the smallest containing area wins, whatever the drawing order", () => {
    expect(findPracticeAreaAt([big, small], { x: 50, y: 50 }, 1)).toBe("small");
    expect(findPracticeAreaAt([small, big], { x: 50, y: 50 }, 1)).toBe("small");
  });

  it("an outline within tolerance beats a containing interior", () => {
    expect(findPracticeAreaAt([small, big], { x: 99.5, y: 50 }, 1)).toBe("big");
    expect(findPracticeAreaAt([big, small], { x: 40.5, y: 50 }, 1)).toBe("small");
  });
});
