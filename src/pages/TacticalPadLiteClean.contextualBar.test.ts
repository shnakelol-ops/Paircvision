import { describe, expect, it } from "vitest";

import { resolveContextualBarPlacement } from "./TacticalPadLiteClean";

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
