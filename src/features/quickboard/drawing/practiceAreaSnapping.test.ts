import { describe, expect, it } from "vitest";

import {
  PRACTICE_AREA_MIN_SIZE,
  resizePracticeRectCorner,
  snapResizedPracticeRect,
  snapTranslatedPracticeRect,
  translatePracticeRect,
  type PracticeRect,
} from "./practiceAreaGeometry";

// Board-shaped tolerance: x is tighter than y in normalised units (160×100 board).
const tol = { x: 1, y: 1.6 };
const anchor: PracticeRect = { left: 40, top: 40, right: 60, bottom: 60 };

function size(rect: PracticeRect) {
  return { w: rect.right - rect.left, h: rect.bottom - rect.top };
}

describe("smart alignment — move", () => {
  it("snaps matching edges (left–left, right–right, top–top, bottom–bottom)", () => {
    expect(snapTranslatedPracticeRect({ left: 40.6, top: 10, right: 50.6, bottom: 20 }, [anchor], tol).left).toBe(40);
    expect(snapTranslatedPracticeRect({ left: 49.3, top: 10, right: 59.3, bottom: 20 }, [anchor], tol).right).toBe(60);
    expect(snapTranslatedPracticeRect({ left: 5, top: 41.2, right: 15, bottom: 51.2 }, [anchor], tol).top).toBe(40);
    expect(snapTranslatedPracticeRect({ left: 5, top: 48.9, right: 15, bottom: 58.9 }, [anchor], tol).bottom).toBe(60);
  });

  it("snaps opposing edges (left–right, right–left, top–bottom, bottom–top)", () => {
    expect(snapTranslatedPracticeRect({ left: 60.8, top: 45, right: 70.8, bottom: 55 }, [anchor], tol).left).toBe(60);
    expect(snapTranslatedPracticeRect({ left: 29.5, top: 5, right: 39.5, bottom: 15 }, [anchor], tol).right).toBe(40);
    expect(snapTranslatedPracticeRect({ left: 5, top: 61.5, right: 15, bottom: 71.5 }, [anchor], tol).top).toBe(60);
    expect(snapTranslatedPracticeRect({ left: 5, top: 28.5, right: 15, bottom: 38.5 }, [anchor], tol).bottom).toBe(40);
  });

  it("snaps only the relevant axis and preserves dimensions", () => {
    const moved = { left: 60.5, top: 12.3, right: 75.5, bottom: 22.3 };
    const out = snapTranslatedPracticeRect(moved, [anchor], tol);
    expect(out).toEqual({ left: 60, top: 12.3, right: 75, bottom: 22.3 });
    expect(size(out)).toEqual(size(moved));
  });

  it("snaps both axes when each is independently aligned", () => {
    const out = snapTranslatedPracticeRect({ left: 60.4, top: 40.9, right: 70.4, bottom: 50.9 }, [anchor], tol);
    expect(out).toEqual({ left: 60, top: 40, right: 70, bottom: 50 });
  });

  it("leaves movement completely free outside the tolerance", () => {
    const free = { left: 61.2, top: 13, right: 71.2, bottom: 23 };
    expect(snapTranslatedPracticeRect(free, [anchor], tol)).toEqual(free);
    const freeY = { left: 5, top: 61.7, right: 15, bottom: 71.7 };
    expect(snapTranslatedPracticeRect(freeY, [anchor], tol)).toEqual(freeY);
    expect(snapTranslatedPracticeRect(free, [], tol)).toBe(free);
  });

  it("picks the nearest candidate edge across several areas", () => {
    const other = { left: 61, top: 0, right: 80, bottom: 10 };
    const out = snapTranslatedPracticeRect({ left: 60.7, top: 20, right: 70.7, bottom: 30 }, [anchor, other], tol);
    expect(out.left).toBe(61);
  });

  it("never snaps a rectangle off the board", () => {
    // Flush against the board's left edge: pulling its right edge (10) onto
    // 9.7 would push its left edge to −0.3, so that axis stays put.
    const flush = { left: 0, top: 20, right: 10, bottom: 30 };
    expect(snapTranslatedPracticeRect(flush, [{ left: 2, top: 50, right: 9.7, bottom: 60 }], tol)).toEqual(flush);
  });

  it("composes with the existing translate clamp (gesture pipeline)", () => {
    const start = { left: 10, top: 10, right: 30, bottom: 20 };
    const out = snapTranslatedPracticeRect(translatePracticeRect(start, 30.6, 0), [anchor], tol);
    expect(out).toEqual({ left: 40, top: 10, right: 60, bottom: 20 });
  });
});

describe("smart alignment — resize", () => {
  it("snaps the dragged corner's edges to matching and opposing edges", () => {
    const start = { left: 10, top: 10, right: 30, bottom: 30 };
    const br = snapResizedPracticeRect(resizePracticeRectCorner(start, "br", { x: 39.4, y: 59 }), "br", [anchor], tol);
    expect(br).toEqual({ left: 10, top: 10, right: 40, bottom: 60 });
    const tl = snapResizedPracticeRect({ left: 60.6, top: 41, right: 80, bottom: 70 }, "tl", [anchor], tol);
    expect(tl).toEqual({ left: 60, top: 40, right: 80, bottom: 70 });
  });

  it("never moves the fixed edges", () => {
    // Fixed left edge (40.5) is close to anchor.left, but a br resize must not touch it.
    const out = snapResizedPracticeRect({ left: 40.5, top: 10, right: 52, bottom: 20 }, "br", [anchor], tol);
    expect(out.left).toBe(40.5);
    expect(out.top).toBe(10);
  });

  it("snaps one axis only when the other is out of tolerance", () => {
    const out = snapResizedPracticeRect({ left: 10, top: 10, right: 59.5, bottom: 25 }, "br", [anchor], tol);
    expect(out).toEqual({ left: 10, top: 10, right: 60, bottom: 25 });
  });

  it("respects the minimum size", () => {
    // Right edge sits at left + MIN; snapping onto the target at left + MIN − 0.8 would shrink it below MIN.
    const rect = { left: 35.8, top: 10, right: 35.8 + PRACTICE_AREA_MIN_SIZE, bottom: 30 };
    const out = snapResizedPracticeRect(rect, "br", [{ left: 0, top: 70, right: 40, bottom: 80 }], tol);
    expect(out.right - out.left).toBeGreaterThanOrEqual(PRACTICE_AREA_MIN_SIZE);
    expect(out).toEqual(rect);
  });

  it("leaves resizing free outside the tolerance", () => {
    const free = { left: 10, top: 10, right: 58.5, bottom: 37.9 };
    expect(snapResizedPracticeRect(free, "br", [anchor], tol)).toEqual(free);
  });
});
