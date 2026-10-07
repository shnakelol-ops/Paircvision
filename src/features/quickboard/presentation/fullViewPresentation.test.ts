import { describe, expect, it } from "vitest";

import {
  FULL_VIEW_ROOT_PADDING,
  resolveFullViewContentStyle,
  resolveFullViewPhaseView,
} from "./fullViewPresentation";

const H = "var(--board-app-height, 100dvh)";
const W = "100dvw";

describe("Full View content box", () => {
  it("landscape: aspect-locked 16:10, sized from width and height, centred, no 1360px cap", () => {
    const style = resolveFullViewContentStyle({ isPortrait: false, viewportHeightExpr: H, viewportWidthUnit: W });
    expect(style.aspectRatio).toBe("16 / 10");
    expect(style.width).toContain(W);
    expect(style.width).toContain(H);
    expect(style.width).toContain("* 1.6");
    expect(String(style.width)).not.toContain("1360px");
    expect(style.maxWidth).toBe("none");
    expect(String(style.maxHeight)).toContain(H);
    expect(style.margin).toBe("0 auto");
    expect(style.position).toBe("relative");
  });

  it("portrait: aspect-locked 10:16 with the 0.625 width-per-height ratio and no 900px cap", () => {
    const style = resolveFullViewContentStyle({ isPortrait: true, viewportHeightExpr: H, viewportWidthUnit: W });
    expect(style.aspectRatio).toBe("10 / 16");
    expect(style.width).toContain("* 0.625");
    expect(String(style.width)).not.toContain("900px");
    expect(style.maxWidth).toBe("none");
  });

  it("is never full-bleed (no 100%/100vw width without an aspect lock)", () => {
    for (const isPortrait of [false, true]) {
      const style = resolveFullViewContentStyle({ isPortrait, viewportHeightExpr: H, viewportWidthUnit: W });
      expect(style.aspectRatio).toBeTruthy();
      expect(style.height).toBeUndefined();
      expect(String(style.width).startsWith("min(")).toBe(true);
    }
  });

  it("subtracts safe-area insets so the box stays inside the visible viewport", () => {
    const style = resolveFullViewContentStyle({ isPortrait: false, viewportHeightExpr: H, viewportWidthUnit: W });
    expect(String(style.width)).toContain("safe-area-inset-left");
    expect(String(style.width)).toContain("safe-area-inset-top");
    expect(FULL_VIEW_ROOT_PADDING.paddingBottom).toContain("safe-area-inset-bottom");
  });
});

describe("Full View phase labels", () => {
  it("shows Start at the start cursor", () => {
    expect(resolveFullViewPhaseView(-1, 4).label).toBe("Start");
  });

  it("shows Phase N/M", () => {
    expect(resolveFullViewPhaseView(0, 4).label).toBe("Phase 1/4");
    expect(resolveFullViewPhaseView(1, 4).label).toBe("Phase 2/4");
    expect(resolveFullViewPhaseView(3, 4).label).toBe("Phase 4/4");
  });

  it("shows Start when the board has no phases", () => {
    expect(resolveFullViewPhaseView(-1, 0).label).toBe("Start");
    expect(resolveFullViewPhaseView(2, 0).label).toBe("Start");
  });
});

describe("Full View previous/next clamping", () => {
  it("at Start: no previous, next is Phase 1", () => {
    const view = resolveFullViewPhaseView(-1, 3);
    expect(view.canPrevious).toBe(false);
    expect(view.previousTarget).toBeNull();
    expect(view.canNext).toBe(true);
    expect(view.nextTarget).toBe(0);
  });

  it("at Phase 1: previous goes to Start (via reset)", () => {
    const view = resolveFullViewPhaseView(0, 3);
    expect(view.previousTarget).toBe("start");
    expect(view.canPrevious).toBe(true);
    expect(view.nextTarget).toBe(1);
  });

  it("in the middle: previous/next are neighbouring phases", () => {
    const view = resolveFullViewPhaseView(1, 3);
    expect(view.previousTarget).toBe(0);
    expect(view.nextTarget).toBe(2);
  });

  it("at the last phase: no next", () => {
    const view = resolveFullViewPhaseView(2, 3);
    expect(view.canNext).toBe(false);
    expect(view.nextTarget).toBeNull();
  });

  it("clamps a stale cursor beyond the phase count to the last phase", () => {
    const view = resolveFullViewPhaseView(9, 3);
    expect(view.label).toBe("Phase 3/3");
    expect(view.canNext).toBe(false);
  });

  it("no phases: neither direction is available", () => {
    const view = resolveFullViewPhaseView(-1, 0);
    expect(view.canPrevious).toBe(false);
    expect(view.canNext).toBe(false);
  });
});
