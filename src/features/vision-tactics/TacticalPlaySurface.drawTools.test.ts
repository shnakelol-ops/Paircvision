import { describe, expect, it, vi } from "vitest";

import {
  buildGameTimingDrawToolOptions,
  buildGameTimingDrawColorOptions,
  DRAW_COLOR_BUTTON_STYLE,
  DRAW_COLOR_BUTTON_ACTIVE_STYLE,
  DRAW_COLOR_SWATCH_STYLE,
} from "./TacticalPlaySurface";

/**
 * Draw integration coverage for Game Timing (PR4). These are the two pure
 * "glue" functions that reshape Game Timing's own tool/colour selection
 * into the shared DrawToolPanel's generic {id,label,active,onSelect} shape
 * — the same practical pattern TacticalPadLiteClean.drawTools.test.ts (PR3)
 * establishes for Standard Slate's own Draw tab. A live
 * createMovementCanvasShell() instance cannot be constructed in this test
 * environment (no jsdom/canvas), so this proves the parent-side resolution
 * logic directly, independent of DrawToolPanel itself (covered by
 * DrawToolPanel.test.tsx) and independent of the shared drawing engine
 * underneath (covered by tacticalDrawingController.test.ts, untouched by
 * this integration).
 */

describe("buildGameTimingDrawToolOptions — V1 tool set, order, and the intentional Label omission", () => {
  it("exposes exactly the nine V1 tools, in the documented order — no Move, no Label", () => {
    const options = buildGameTimingDrawToolOptions({
      activeTool: "plain-line",
      onSelectTool: vi.fn(),
    });
    expect(options.map((o) => o.id)).toEqual([
      "plain-line",
      "straight-arrow",
      "curved-arrow",
      "dashed-arrow",
      "wavy-line",
      "free-pen",
      "rectangle-zone",
      "circle-zone",
      "eraser",
    ]);
    expect(options.find((o) => o.id === "move")).toBeUndefined();
    expect(options.some((o) => o.label === "Label")).toBe(false);
  });

  it("uses the exact expected label text per tool", () => {
    const options = buildGameTimingDrawToolOptions({ activeTool: "plain-line", onSelectTool: vi.fn() });
    const labelById = Object.fromEntries(options.map((o) => [o.id, o.label]));
    expect(labelById).toEqual({
      "plain-line": "Plain",
      "straight-arrow": "Straight",
      "curved-arrow": "Curved",
      "dashed-arrow": "Dashed",
      "wavy-line": "Wavy",
      "free-pen": "Free Pen",
      "rectangle-zone": "Rect Zone",
      "circle-zone": "Circle Zone",
      eraser: "Eraser",
    });
  });

  it("marks exactly the tool matching activeTool as active", () => {
    const options = buildGameTimingDrawToolOptions({ activeTool: "eraser", onSelectTool: vi.fn() });
    expect(options.find((o) => o.id === "eraser")?.active).toBe(true);
    expect(options.filter((o) => o.active)).toHaveLength(1);
  });

  it("selecting a tool calls onSelectTool with that tool's TacticalDrawingTool id", () => {
    const onSelectTool = vi.fn();
    const options = buildGameTimingDrawToolOptions({ activeTool: "plain-line", onSelectTool });
    options.find((o) => o.id === "circle-zone")?.onSelect();
    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledWith("circle-zone");
  });
});

describe("buildGameTimingDrawColorOptions — reuses Standard Slate's exact palette, not a duplicate", () => {
  it("exposes exactly the five shared WHITEBOARD_PEN_COLOR_CHOICES entries, unmodified", () => {
    const options = buildGameTimingDrawColorOptions({ activeColor: 0x111111, onSelectColor: vi.fn() });
    expect(options.map((o) => o.label)).toEqual(["Black", "White", "Yellow", "Red", "Blue"]);
    expect(options.map((o) => o.value)).toEqual([0x111111, 0xffffff, 0xfacc15, 0xdc2626, 0x2563eb]);
    expect(options.map((o) => o.css)).toEqual(["#111111", "#ffffff", "#facc15", "#dc2626", "#2563eb"]);
  });

  it("marks exactly the colour matching activeColor as active", () => {
    const options = buildGameTimingDrawColorOptions({ activeColor: 0x2563eb, onSelectColor: vi.fn() });
    expect(options.find((o) => o.label === "Blue")?.active).toBe(true);
    expect(options.filter((o) => o.active)).toHaveLength(1);
  });

  it("selecting a colour calls onSelectColor with that colour's numeric value", () => {
    const onSelectColor = vi.fn();
    const options = buildGameTimingDrawColorOptions({ activeColor: 0x111111, onSelectColor });
    options.find((o) => o.label === "Red")?.onSelect();
    expect(onSelectColor).toHaveBeenCalledTimes(1);
    expect(onSelectColor).toHaveBeenCalledWith(0xdc2626);
  });
});

describe("DRAW_COLOR_BUTTON_STYLE — swatch presentation regression lock", () => {
  // A mobile visual bug (dark/translucent ring around each colour swatch)
  // traced to this button having its own opaque-ish fill behind the
  // smaller swatch circle — the colour sample's own background was always
  // correct (see buildGameTimingDrawColorOptions tests above), the button
  // chrome around it was compositing a visible dark halo. Fixed the same
  // way PlayerKitEditor's COLOR_BUTTON_STYLE already does it: transparent
  // button background, so the swatch span is the only paint. This locks
  // that specific property against regressing back to a filled background.
  it("has a transparent background — no fill that could ring/tint the swatch inside it", () => {
    expect(DRAW_COLOR_BUTTON_STYLE.background).toBe("transparent");
  });

  it("the active (selected) state does not reintroduce a filled background either", () => {
    expect(DRAW_COLOR_BUTTON_ACTIVE_STYLE.background).toBe("transparent");
  });

  it("the active state's selection indicator is a border/box-shadow ring only, not a background change", () => {
    expect(DRAW_COLOR_BUTTON_ACTIVE_STYLE.boxShadow).toBeTruthy();
    expect(DRAW_COLOR_BUTTON_ACTIVE_STYLE.background).toBe(DRAW_COLOR_BUTTON_STYLE.background);
  });
});

describe("DRAW_COLOR_SWATCH_STYLE — ancestor backdrop-filter compositing regression lock", () => {
  // Second darkening regression, post-4ba0c16. Forensics (getComputedStyle +
  // document.elementFromPoint on a live render) proved the swatch's own
  // background was already the exact canonical hex, fully opaque, with no
  // darkening opacity/filter/mixBlendMode anywhere in its own style or its
  // button's — i.e. this was never the DRAW_COLOR_BUTTON_STYLE bug returning.
  // The one real difference from PlayerKitEditor's already-correct
  // COLOR_SWATCH_STYLE: PlayerKitEditor's translucent `backdropFilter` card
  // (EDITOR_STYLE) is itself `position: fixed`, giving it its own
  // unambiguous compositing layer; DRAW_PANEL_SECTION_STYLE (the Draw
  // panel's equivalent card, built from the same PLAYERS_CARD_STYLE) is
  // `position: static`, nested inside this panel's own `position: fixed`
  // ancestor — a backdrop-filter context sitting inside another positioned
  // ancestor instead of establishing its own top-level one. That nested
  // arrangement is a known source of a WebKit ancestor compositing bug that
  // visually darkens fully-opaque static descendants despite every computed
  // value being correct — exactly the "appears dark on screen but computes
  // correct" signature this regression showed. These tests lock the actual
  // fix (isolating the swatch onto its own compositing layer) rather than
  // re-asserting the palette hex values already covered above.
  it("is isolated onto its own compositing layer, immune to an ancestor backdrop-filter's compositing", () => {
    expect(DRAW_COLOR_SWATCH_STYLE.isolation).toBe("isolate");
  });

  it("declares no opacity, filter, or blend-mode of its own that could dim the colour sample", () => {
    expect(DRAW_COLOR_SWATCH_STYLE.opacity).toBeUndefined();
    expect(DRAW_COLOR_SWATCH_STYLE.filter).toBeUndefined();
    expect(DRAW_COLOR_SWATCH_STYLE.mixBlendMode).toBeUndefined();
    expect(DRAW_COLOR_BUTTON_STYLE.opacity).toBeUndefined();
    expect(DRAW_COLOR_BUTTON_STYLE.filter).toBeUndefined();
    expect(DRAW_COLOR_BUTTON_STYLE.mixBlendMode).toBeUndefined();
  });
});
