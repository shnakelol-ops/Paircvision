import { describe, expect, it } from "vitest";

import {
  ANGLED_ZONE_BAR_HANDLE_CLEARANCE_PX,
  resolveAngledZoneBarPosition,
  resolveContextualBarPlacement,
} from "./TacticalPadLiteClean";

/**
 * The Practice Area bar's placement rule, extracted verbatim so the Angled
 * Zone Done bar can share it: the screen corner diagonally away from the
 * shape, so the bar never sits over the corner handles being dragged.
 */
describe("resolveContextualBarPlacement", () => {
  const viewport = { viewportWidth: 800, viewportHeight: 400 };

  it("no shape: bottom, default horizontal position", () => {
    expect(resolveContextualBarPlacement({ bounds: null, ...viewport, isPortrait: false })).toEqual({
      atTop: false,
      horizontal: "default",
    });
  });

  it("shape in the lower half: bar goes to the top; shape on the left: bar goes right", () => {
    expect(
      resolveContextualBarPlacement({ bounds: { left: 100, top: 250, right: 200, bottom: 350 }, ...viewport, isPortrait: false }),
    ).toEqual({ atTop: true, horizontal: "right" });
  });

  it("shape in the upper right: bar stays at the bottom, on the left", () => {
    expect(
      resolveContextualBarPlacement({ bounds: { left: 600, top: 20, right: 700, bottom: 120 }, ...viewport, isPortrait: false }),
    ).toEqual({ atTop: false, horizontal: "left" });
  });

  it("equal room above and below keeps the bottom position", () => {
    expect(
      resolveContextualBarPlacement({ bounds: { left: 100, top: 150, right: 200, bottom: 250 }, ...viewport, isPortrait: false })
        .atTop,
    ).toBe(false);
  });

  it("portrait: full-width bar, only top/bottom changes", () => {
    expect(
      resolveContextualBarPlacement({
        bounds: { left: 10, top: 500, right: 100, bottom: 700 },
        viewportWidth: 400,
        viewportHeight: 800,
        isPortrait: true,
      }),
    ).toEqual({ atTop: true, horizontal: "default" });
  });
});

describe("resolveAngledZoneBarPosition — never over a corner handle", () => {
  const bar = { barWidth: 200, barHeight: 134 };
  const clearOf = (pos: { left: number; top: number }, handles: Array<{ x: number; y: number }>) =>
    handles.every((h) => {
      const nx = Math.max(pos.left, Math.min(h.x, pos.left + bar.barWidth));
      const ny = Math.max(pos.top, Math.min(h.y, pos.top + bar.barHeight));
      return Math.hypot(h.x - nx, h.y - ny) >= ANGLED_ZONE_BAR_HANDLE_CLEARANCE_PX;
    });
  const boundsOf = (handles: Array<{ x: number; y: number }>) => ({
    left: Math.min(...handles.map((h) => h.x)),
    top: Math.min(...handles.map((h) => h.y)),
    right: Math.max(...handles.map((h) => h.x)),
    bottom: Math.max(...handles.map((h) => h.y)),
  });

  it("small zone: uses the preferred diagonal corner, as the Practice Area bar does", () => {
    const handles = [{ x: 300, y: 250 }, { x: 340, y: 250 }, { x: 340, y: 290 }, { x: 300, y: 290 }];
    const pos = resolveAngledZoneBarPosition({ handles, bounds: boundsOf(handles), viewportWidth: 863, viewportHeight: 360, isPortrait: false, ...bar });
    expect(pos).toEqual({ left: 863 - 12 - 200, top: 12 });
    expect(clearOf(pos, handles)).toBe(true);
  });

  it("zone filling most of the landscape pitch (Pixel 7): still clear of all four handles", () => {
    // Board spans ~x 203–660, y 61–346 on an 863×360 viewport.
    const handles = [{ x: 205, y: 63 }, { x: 658, y: 63 }, { x: 658, y: 344 }, { x: 205, y: 344 }];
    const pos = resolveAngledZoneBarPosition({ handles, bounds: boundsOf(handles), viewportWidth: 863, viewportHeight: 360, isPortrait: false, ...bar });
    expect(clearOf(pos, handles)).toBe(true);
  });

  it("zone filling most of the portrait pitch (narrow 360px phone): still clear of all four handles", () => {
    const handles = [{ x: 20, y: 120 }, { x: 340, y: 120 }, { x: 340, y: 700 }, { x: 20, y: 700 }];
    const pos = resolveAngledZoneBarPosition({ handles, bounds: boundsOf(handles), viewportWidth: 360, viewportHeight: 780, isPortrait: true, ...bar });
    expect(clearOf(pos, handles)).toBe(true);
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.left + bar.barWidth).toBeLessThanOrEqual(360);
  });

  it("handles along every edge: picks a gap rather than covering a handle", () => {
    const handles = [{ x: 700, y: 30 }, { x: 760, y: 330 }, { x: 120, y: 330 }, { x: 110, y: 40 }];
    const pos = resolveAngledZoneBarPosition({ handles, bounds: boundsOf(handles), viewportWidth: 863, viewportHeight: 360, isPortrait: false, ...bar });
    expect(clearOf(pos, handles)).toBe(true);
  });

  it("stays on screen even when no spot is fully clear", () => {
    const handles = Array.from({ length: 40 }, (_, i) => ({ x: (i % 8) * 50 + 10, y: Math.floor(i / 8) * 60 + 20 }));
    const pos = resolveAngledZoneBarPosition({ handles, bounds: boundsOf(handles), viewportWidth: 400, viewportHeight: 300, isPortrait: true, ...bar });
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
    expect(pos.left + bar.barWidth).toBeLessThanOrEqual(400);
    expect(pos.top + bar.barHeight).toBeLessThanOrEqual(300);
  });
});
