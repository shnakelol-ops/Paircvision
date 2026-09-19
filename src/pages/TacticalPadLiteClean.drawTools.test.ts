import { describe, expect, it, vi } from "vitest";

import { buildTacticalDrawToolOptions, buildTacticalDrawColorOptions } from "./TacticalPadLiteClean";

/**
 * Parity/regression lock for Standard Slate's Draw tab (PR3 extraction).
 * These are the two pure "glue" functions that reshape Slate's existing
 * tacticalTool/textToolActive/tacticalPenColor state into the shared
 * DrawToolPanel's generic {id,label,active,onSelect} shape — the same
 * practical pattern TacticalPadLiteClean.kitEditor.test.ts already
 * establishes for the Kit Editor extraction. A live createTacticalPadLiteSurface()
 * instance cannot be constructed in this test environment (no jsdom/canvas),
 * so this proves the parent-side resolution logic directly, independent of
 * DrawToolPanel itself (covered by DrawToolPanel.test.tsx) and independent
 * of the live Pixi drawing engine underneath (untouched by this extraction).
 */

const COMPACT_LANDSCAPE_LABELS = {
  move: "Move",
  line: "Line",
  arrow: "Arrow",
  curved: "Curved",
  dashed: "Dash",
  wavy: "Pen",
  freePen: "Free Pen",
  rectangleZone: "Rect Zone",
  circleZone: "Circle Zone",
  eraser: "Eraser",
} as const;

const DEFAULT_LABELS = {
  move: "Move",
  line: "Plain",
  arrow: "Straight",
  curved: "Curved",
  dashed: "Dashed",
  wavy: "Wavy",
  freePen: "Free Pen",
  rectangleZone: "Rect Zone",
  circleZone: "Circle Zone",
  eraser: "Eraser",
} as const;

describe("buildTacticalDrawToolOptions — tool set and order", () => {
  it("exposes exactly the eleven current Slate Draw-tab entries, in the existing button order", () => {
    const options = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS,
      tacticalTool: "move",
      textToolActive: false,
      onSelectTool: vi.fn(),
      onSelectLabel: vi.fn(),
    });
    expect(options.map((o) => o.id)).toEqual([
      "move",
      "label",
      "line",
      "arrow",
      "curved",
      "dashed",
      "wavy",
      "freePen",
      "rectangleZone",
      "circleZone",
      "eraser",
    ]);
  });

  it("uses the default (portrait/desktop) label set's exact current text", () => {
    const options = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS,
      tacticalTool: "move",
      textToolActive: false,
      onSelectTool: vi.fn(),
      onSelectLabel: vi.fn(),
    });
    const labelById = Object.fromEntries(options.map((o) => [o.id, o.label]));
    expect(labelById).toEqual({
      move: "Move",
      label: "Label",
      line: "Plain",
      arrow: "Straight",
      curved: "Curved",
      dashed: "Dashed",
      wavy: "Wavy",
      freePen: "Free Pen",
      rectangleZone: "Rect Zone",
      circleZone: "Circle Zone",
      eraser: "Eraser",
    });
  });

  it("uses the compact-landscape label set's exact current (differently-worded) text — a pre-existing inconsistency this extraction preserves rather than resolves", () => {
    const options = buildTacticalDrawToolOptions({
      labels: COMPACT_LANDSCAPE_LABELS,
      tacticalTool: "move",
      textToolActive: false,
      onSelectTool: vi.fn(),
      onSelectLabel: vi.fn(),
    });
    const labelById = Object.fromEntries(options.map((o) => [o.id, o.label]));
    expect(labelById.line).toBe("Line");
    expect(labelById.arrow).toBe("Arrow");
    expect(labelById.dashed).toBe("Dash");
    expect(labelById.wavy).toBe("Pen");
  });
});

describe("buildTacticalDrawToolOptions — active-state parity with the original inline JSX", () => {
  it("Move is active only when tacticalTool is 'move' AND textToolActive is false", () => {
    const activeCase = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS, tacticalTool: "move", textToolActive: false,
      onSelectTool: vi.fn(), onSelectLabel: vi.fn(),
    });
    expect(activeCase.find((o) => o.id === "move")?.active).toBe(true);

    const labelModeCase = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS, tacticalTool: "move", textToolActive: true,
      onSelectTool: vi.fn(), onSelectLabel: vi.fn(),
    });
    expect(labelModeCase.find((o) => o.id === "move")?.active).toBe(false);

    const otherToolCase = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS, tacticalTool: "eraser", textToolActive: false,
      onSelectTool: vi.fn(), onSelectLabel: vi.fn(),
    });
    expect(otherToolCase.find((o) => o.id === "move")?.active).toBe(false);
  });

  it("Label is active exactly when textToolActive is true, independent of tacticalTool", () => {
    const options = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS, tacticalTool: "move", textToolActive: true,
      onSelectTool: vi.fn(), onSelectLabel: vi.fn(),
    });
    expect(options.find((o) => o.id === "label")?.active).toBe(true);
  });

  it("every regular drawing tool is active exactly when tacticalTool equals its own id", () => {
    for (const id of ["line", "arrow", "curved", "dashed", "wavy", "freePen", "rectangleZone", "circleZone", "eraser"] as const) {
      const options = buildTacticalDrawToolOptions({
        labels: DEFAULT_LABELS, tacticalTool: id, textToolActive: false,
        onSelectTool: vi.fn(), onSelectLabel: vi.fn(),
      });
      for (const option of options) {
        if (option.id === "move" || option.id === "label") continue;
        expect(option.active).toBe(option.id === id);
      }
    }
  });
});

describe("buildTacticalDrawToolOptions — callbacks reach the exact existing Slate handlers", () => {
  it("selecting a regular tool calls onSelectTool with that tool's id", () => {
    const onSelectTool = vi.fn();
    const options = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS, tacticalTool: "move", textToolActive: false,
      onSelectTool, onSelectLabel: vi.fn(),
    });
    options.find((o) => o.id === "eraser")?.onSelect();
    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledWith("eraser");
  });

  it("selecting Move calls onSelectTool('move'), not onSelectLabel", () => {
    const onSelectTool = vi.fn();
    const onSelectLabel = vi.fn();
    const options = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS, tacticalTool: "eraser", textToolActive: false,
      onSelectTool, onSelectLabel,
    });
    options.find((o) => o.id === "move")?.onSelect();
    expect(onSelectTool).toHaveBeenCalledWith("move");
    expect(onSelectLabel).not.toHaveBeenCalled();
  });

  it("selecting Label calls onSelectLabel directly, not onSelectTool", () => {
    const onSelectTool = vi.fn();
    const onSelectLabel = vi.fn();
    const options = buildTacticalDrawToolOptions({
      labels: DEFAULT_LABELS, tacticalTool: "move", textToolActive: false,
      onSelectTool, onSelectLabel,
    });
    options.find((o) => o.id === "label")?.onSelect();
    expect(onSelectLabel).toHaveBeenCalledTimes(1);
    expect(onSelectTool).not.toHaveBeenCalled();
  });
});

describe("buildTacticalDrawColorOptions — colour palette parity", () => {
  it("exposes exactly the five existing WHITEBOARD_PEN_COLOR_CHOICES entries, unmodified", () => {
    const options = buildTacticalDrawColorOptions({ activeColor: 0x111111, onSelectColor: vi.fn() });
    expect(options.map((o) => o.label)).toEqual(["Black", "White", "Yellow", "Red", "Blue"]);
    expect(options.map((o) => o.value)).toEqual([0x111111, 0xffffff, 0xfacc15, 0xdc2626, 0x2563eb]);
    expect(options.map((o) => o.css)).toEqual(["#111111", "#ffffff", "#facc15", "#dc2626", "#2563eb"]);
  });

  it("marks exactly the colour matching activeColor as active", () => {
    const options = buildTacticalDrawColorOptions({ activeColor: 0xdc2626, onSelectColor: vi.fn() });
    expect(options.find((o) => o.label === "Red")?.active).toBe(true);
    expect(options.filter((o) => o.active)).toHaveLength(1);
  });

  it("preserves the exact existing aria-label text", () => {
    const options = buildTacticalDrawColorOptions({ activeColor: 0x111111, onSelectColor: vi.fn() });
    expect(options.find((o) => o.label === "Blue")?.ariaLabel).toBe("Set tactical drawing colour Blue");
  });

  it("selecting a colour calls onSelectColor with that colour's numeric value", () => {
    const onSelectColor = vi.fn();
    const options = buildTacticalDrawColorOptions({ activeColor: 0x111111, onSelectColor });
    options.find((o) => o.label === "Yellow")?.onSelect();
    expect(onSelectColor).toHaveBeenCalledTimes(1);
    expect(onSelectColor).toHaveBeenCalledWith(0xfacc15);
  });
});
