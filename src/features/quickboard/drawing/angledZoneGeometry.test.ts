import { describe, expect, it } from "vitest";

import {
  ANGLED_ZONE_HANDLE_TOUCH_PX,
  angledZoneArea,
  angledZoneCornersFromDrag,
  distanceToAngledZoneOutline,
  findAngledZoneAt,
  findAngledZoneCornerAt,
  isAngledZoneSelfIntersecting,
  isPointInAngledZone,
  isPointOnAngledZone,
  isValidAngledZone,
  moveAngledZoneCorner,
  sameAngledZoneCorners,
  segmentsIntersect,
  translateAngledZone,
  type AngledZoneCorners,
} from "./angledZoneGeometry";

const square: AngledZoneCorners = [
  { x: 20, y: 20 },
  { x: 40, y: 20 },
  { x: 40, y: 40 },
  { x: 20, y: 40 },
];

describe("angledZoneCornersFromDrag", () => {
  it("builds four clockwise corners from top-left, whatever the drag direction", () => {
    const expected = [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 50 },
      { x: 10, y: 50 },
    ];
    expect(angledZoneCornersFromDrag({ x: 10, y: 20 }, { x: 30, y: 50 })).toEqual(expected);
    expect(angledZoneCornersFromDrag({ x: 30, y: 50 }, { x: 10, y: 20 })).toEqual(expected);
    expect(angledZoneCornersFromDrag({ x: 30, y: 20 }, { x: 10, y: 50 })).toEqual(expected);
  });
});

describe("validity", () => {
  it("accepts a rectangle, a diagonal parallelogram and a concave dart", () => {
    expect(isValidAngledZone(square)).toBe(true);
    expect(
      isValidAngledZone([
        { x: 10, y: 10 },
        { x: 40, y: 20 },
        { x: 50, y: 50 },
        { x: 20, y: 40 },
      ]),
    ).toBe(true);
    // Concave: one corner pushed inside the triangle of the other three.
    expect(
      isValidAngledZone([
        { x: 20, y: 20 },
        { x: 60, y: 20 },
        { x: 40, y: 30 },
        { x: 20, y: 60 },
      ]),
    ).toBe(true);
  });

  it("rejects a self-intersecting bow-tie", () => {
    const bowTie = [
      { x: 20, y: 20 },
      { x: 40, y: 40 },
      { x: 40, y: 20 },
      { x: 20, y: 40 },
    ];
    expect(isAngledZoneSelfIntersecting(bowTie)).toBe(true);
    expect(isValidAngledZone(bowTie)).toBe(false);
  });

  it("rejects too-small, collinear, coincident, off-board and wrong-count shapes", () => {
    expect(isValidAngledZone(angledZoneCornersFromDrag({ x: 10, y: 10 }, { x: 13, y: 13 }))).toBe(false);
    expect(
      isValidAngledZone([
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 30, y: 10 },
        { x: 40, y: 10 },
      ]),
    ).toBe(false);
    expect(isValidAngledZone([square[0], square[0], square[2], square[3]])).toBe(false);
    expect(isValidAngledZone([{ x: -1, y: 20 }, square[1], square[2], square[3]])).toBe(false);
    expect(isValidAngledZone(square.slice(0, 3))).toBe(false);
    expect(isValidAngledZone([{ x: Number.NaN, y: 20 }, square[1], square[2], square[3]])).toBe(false);
  });

  it("measures area with the shoelace formula", () => {
    expect(angledZoneArea(square)).toBe(400);
  });

  it("detects touching and crossing segments", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });
});

describe("moveAngledZoneCorner", () => {
  it("moves one corner independently to make a diagonal edge", () => {
    const next = moveAngledZoneCorner(square, 1, { x: 55, y: 10 });
    expect(next).toEqual([square[0], { x: 55, y: 10 }, square[2], square[3]]);
  });

  it("refuses a move that would self-intersect: the corner stays where it was", () => {
    // Dragging top-right below the bottom edge makes edges 0-1 and 2-3 cross.
    const candidate = [square[0], { x: 30, y: 60 }, square[2], square[3]];
    expect(isAngledZoneSelfIntersecting(candidate)).toBe(true);
    expect(moveAngledZoneCorner(square, 1, { x: 30, y: 60 })).toEqual(square);
  });

  it("refuses a move that would collapse the zone below the minimum area", () => {
    const small = angledZoneCornersFromDrag({ x: 20, y: 20 }, { x: 30, y: 25 });
    const candidate = [small[0], small[1], { x: 22, y: 22 }, small[3]];
    expect(isAngledZoneSelfIntersecting(candidate)).toBe(false);
    expect(angledZoneArea(candidate)).toBeLessThan(25);
    expect(moveAngledZoneCorner(small, 2, { x: 22, y: 22 })).toEqual(small);
  });

  it("clamps the dragged corner to the pitch", () => {
    const next = moveAngledZoneCorner(square, 2, { x: 140, y: 130 });
    expect(next[2]).toEqual({ x: 100, y: 100 });
  });

  it("ignores an unknown corner index and never mutates its input", () => {
    const input = square.map((point) => ({ ...point }));
    expect(moveAngledZoneCorner(input, 7, { x: 0, y: 0 })).toEqual(square);
    moveAngledZoneCorner(input, 0, { x: 5, y: 5 });
    expect(input).toEqual(square);
  });
});

describe("translateAngledZone", () => {
  it("moves the whole shape, preserving it", () => {
    expect(translateAngledZone(square, 5, -3)).toEqual(square.map((p) => ({ x: p.x + 5, y: p.y - 3 })));
  });

  it("stops at the pitch boundary on each axis without distorting the shape", () => {
    const moved = translateAngledZone(square, 500, -500);
    expect(moved.map((p) => p.x)).toEqual([80, 100, 100, 80]);
    expect(moved.map((p) => p.y)).toEqual([0, 0, 20, 20]);
    expect(angledZoneArea(moved)).toBe(angledZoneArea(square));
  });
});

describe("hit testing", () => {
  const dart = [
    { x: 20, y: 20 },
    { x: 60, y: 20 },
    { x: 40, y: 30 },
    { x: 20, y: 60 },
  ];

  it("point-in-polygon handles a concave notch", () => {
    expect(isPointInAngledZone(dart, { x: 25, y: 25 })).toBe(true);
    // Inside the bounding box but in the notch.
    expect(isPointInAngledZone(dart, { x: 50, y: 40 })).toBe(false);
  });

  it("distance to outline and on-zone tolerance", () => {
    expect(distanceToAngledZoneOutline(square, { x: 30, y: 15 })).toBe(5);
    expect(isPointOnAngledZone(square, { x: 30, y: 15 }, 6)).toBe(true);
    expect(isPointOnAngledZone(square, { x: 30, y: 15 }, 4)).toBe(false);
    expect(isPointOnAngledZone(square, { x: 30, y: 30 }, 0)).toBe(true);
  });

  it("finds the nearest corner within half the 46px touch target", () => {
    const tolerance = ANGLED_ZONE_HANDLE_TOUCH_PX / 2;
    expect(findAngledZoneCornerAt(square, { x: 21, y: 21 }, tolerance)).toBe(0);
    expect(findAngledZoneCornerAt(square, { x: 39, y: 41 }, tolerance)).toBe(2);
    expect(findAngledZoneCornerAt(square, { x: 30, y: 30 }, 2)).toBe(null);
  });

  it("overlapping zones: the most recently drawn wins", () => {
    const zones = [
      { id: "older", points: square },
      { id: "newer", points: translateAngledZone(square, 10, 10) },
    ];
    expect(findAngledZoneAt(zones, { x: 35, y: 35 }, 1)).toBe("newer");
    expect(findAngledZoneAt(zones, { x: 22, y: 22 }, 1)).toBe("older");
    expect(findAngledZoneAt(zones, { x: 90, y: 90 }, 1)).toBe(null);
  });

  it("compares corner lists exactly", () => {
    expect(sameAngledZoneCorners(square, square.map((p) => ({ ...p })))).toBe(true);
    expect(sameAngledZoneCorners(square, translateAngledZone(square, 1, 0))).toBe(false);
  });
});
