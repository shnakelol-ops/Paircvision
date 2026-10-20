import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import { createTacticalDrawingController } from "./tacticalDrawingController";
import { DEFAULT_TACTICAL_DRAWING_OPACITY, DEFAULT_TACTICAL_DRAWING_WIDTH } from "./tacticalLineStyles";
import type { TacticalDrawingKind, TacticalDrawingRecord } from "./tacticalDrawingTypes";
import { TACTICAL_ZONE_STYLE, renderTacticalDrawing } from "./tacticalLineRenderer";

/**
 * Visual regression lock for zone styling. Pixi records every fill/stroke as
 * an instruction, so the painted alpha, colour and width of each zone type
 * can be asserted directly (no canvas needed).
 *
 *  - Refined (Tactical Slate, zoneStyle set): Rect, Circle and Angled Zone
 *    share one look — light fill, ~2px softer border, stronger only while
 *    selected for editing.
 *  - Legacy (no zoneStyle — Tactical Sequence and every other host): the
 *    original values, unchanged.
 *  - Practice Areas, Dead Zones and line tools ignore zoneStyle entirely.
 */

const identityMapper = {
  normalizedToWorld: (point: { x: number; y: number }) => point,
  worldToNormalized: (point: { x: number; y: number }) => point,
};

type Style = { alpha?: number; color?: number; width?: number };
type Instruction = { action: string; data?: { style?: Style } };
function instructionsOf(g: Graphics): Instruction[] {
  return (g.context as unknown as { instructions: Instruction[] }).instructions;
}
/** Stable, comparable dump of what was painted (object ids and back-references dropped). */
function paintDump(g: Graphics): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(instructionsOf(g), (key, value: unknown) => {
    if (key === "uid" || key === "_dirty" || key === "_tick") return undefined;
    if (value && typeof value === "object") {
      if (seen.has(value)) return "[ref]";
      seen.add(value);
    }
    return value;
  });
}
function styles(g: Graphics, action: "fill" | "stroke"): Style[] {
  return instructionsOf(g)
    .filter((inst) => inst.action === action)
    .map((inst) => inst.data?.style ?? {});
}

const ZONE_POINTS: Record<"rectangle-zone" | "circle-zone" | "angled-zone", Array<{ x: number; y: number }>> = {
  "rectangle-zone": [{ x: 10, y: 10 }, { x: 40, y: 30 }],
  "circle-zone": [{ x: 10, y: 10 }, { x: 40, y: 30 }],
  "angled-zone": [{ x: 10, y: 10 }, { x: 45, y: 5 }, { x: 40, y: 30 }, { x: 12, y: 32 }],
};
const ZONE_KINDS = Object.keys(ZONE_POINTS) as Array<keyof typeof ZONE_POINTS>;

function record(kind: TacticalDrawingKind, points: Array<{ x: number; y: number }>, extra: Partial<TacticalDrawingRecord> = {}): TacticalDrawingRecord {
  return {
    id: kind,
    kind,
    points,
    color: 0xfbbf24,
    width: DEFAULT_TACTICAL_DRAWING_WIDTH,
    opacity: DEFAULT_TACTICAL_DRAWING_OPACITY,
    createdAt: 1,
    ...extra,
  };
}

// A phone-landscape board: ~2.86 screen px per world unit.
const PHONE = { worldUnitsPerScreenPx: 0.35 };

function render(drawing: TacticalDrawingRecord, selected: boolean, options: Parameters<typeof renderTacticalDrawing>[4] = {}): Graphics {
  const g = new Graphics();
  renderTacticalDrawing(g, drawing, identityMapper, selected, options);
  return g;
}

describe("refined tactical zone style (Tactical Slate)", () => {
  it("uses the agreed ranges: fill 0.12–0.15, border 0.50–0.60, ~2px border", () => {
    expect(TACTICAL_ZONE_STYLE.fillAlpha).toBeGreaterThanOrEqual(0.12);
    expect(TACTICAL_ZONE_STYLE.fillAlpha).toBeLessThanOrEqual(0.15);
    expect(TACTICAL_ZONE_STYLE.borderAlpha).toBeGreaterThanOrEqual(0.5);
    expect(TACTICAL_ZONE_STYLE.borderAlpha).toBeLessThanOrEqual(0.6);
    expect(TACTICAL_ZONE_STYLE.borderScreenPx).toBe(2);
  });

  for (const kind of ZONE_KINDS) {
    it(`${kind}: light fill and a thin softer border in the zone's own colour`, () => {
      const g = render(record(kind, ZONE_POINTS[kind]), false, { zoneStyle: PHONE });
      expect(styles(g, "fill")).toHaveLength(1);
      expect(styles(g, "stroke")).toHaveLength(1);
      const [fill] = styles(g, "fill");
      const [border] = styles(g, "stroke");
      expect(fill?.alpha).toBe(TACTICAL_ZONE_STYLE.fillAlpha);
      expect(fill?.color).toBe(0xfbbf24);
      expect(border?.alpha).toBe(TACTICAL_ZONE_STYLE.borderAlpha);
      expect(border?.color).toBe(0xfbbf24);
      expect(border?.width).toBeCloseTo(2 * PHONE.worldUnitsPerScreenPx, 6);
    });

    it(`${kind}: stronger feedback only while selected for editing`, () => {
      const g = render(record(kind, ZONE_POINTS[kind]), true, { zoneStyle: PHONE });
      const strokes = styles(g, "stroke");
      expect(strokes).toHaveLength(2); // halo + border
      const [halo, border] = strokes;
      expect(border?.alpha).toBe(TACTICAL_ZONE_STYLE.selectedBorderAlpha);
      expect(border?.width).toBeCloseTo(TACTICAL_ZONE_STYLE.selectedBorderScreenPx * PHONE.worldUnitsPerScreenPx, 6);
      expect(halo?.alpha).toBe(TACTICAL_ZONE_STYLE.haloAlpha);
      expect(halo?.width).toBeGreaterThan(border?.width ?? 0);
      expect(styles(g, "fill")[0]?.alpha).toBe(TACTICAL_ZONE_STYLE.selectedFillAlpha);
    });
  }

  it("all three zone types paint identically (consistent look)", () => {
    const paints = ZONE_KINDS.map((kind) => {
      const g = render(record(kind, ZONE_POINTS[kind]), false, { zoneStyle: PHONE });
      return { fill: styles(g, "fill")[0]?.alpha, border: styles(g, "stroke")[0]?.alpha, width: styles(g, "stroke")[0]?.width };
    });
    expect(new Set(paints.map((p) => JSON.stringify(p))).size).toBe(1);
  });

  it("border width stays ~2 screen pixels at any board scale", () => {
    for (const worldUnitsPerScreenPx of [0.15, 0.35, 0.8]) {
      const g = render(record("rectangle-zone", ZONE_POINTS["rectangle-zone"]), false, { zoneStyle: { worldUnitsPerScreenPx } });
      expect((styles(g, "stroke")[0]?.width ?? 0) / worldUnitsPerScreenPx).toBeCloseTo(2, 6);
    }
  });

  it("keeps the rectangle's rounded corners and the zone geometry", () => {
    const legacy = render(record("rectangle-zone", ZONE_POINTS["rectangle-zone"]), false);
    const refined = render(record("rectangle-zone", ZONE_POINTS["rectangle-zone"]), false, { zoneStyle: PHONE });
    const shapeOf = (g: Graphics) =>
      JSON.parse(paintDump(g)).map((inst: { data?: { path?: unknown } }) => inst.data?.path);
    expect(shapeOf(refined)).toEqual(shapeOf(legacy));
  });
});

describe("legacy zone style (no zoneStyle — Tactical Sequence, other hosts)", () => {
  for (const kind of ZONE_KINDS) {
    it(`${kind}: original fill / border values are unchanged`, () => {
      const g = render(record(kind, ZONE_POINTS[kind]), false);
      expect(styles(g, "fill")[0]?.alpha).toBeCloseTo(0.285, 6);
      expect(styles(g, "stroke")[0]?.alpha).toBeCloseTo(0.874, 6);
      expect(styles(g, "stroke")[0]?.width).toBeCloseTo(1.288, 6);
    });
  }

  it("a zone with a non-finite scale falls back to the original look", () => {
    const g = render(record("circle-zone", ZONE_POINTS["circle-zone"]), false, { zoneStyle: { worldUnitsPerScreenPx: Number.NaN } });
    expect(styles(g, "fill")[0]?.alpha).toBeCloseTo(0.285, 6);
  });
});

describe("zoneStyle never touches Practice Areas, Dead Zones or line tools", () => {
  const cases: Array<[string, TacticalDrawingRecord, Parameters<typeof renderTacticalDrawing>[4]]> = [
    ["Practice Area", record("rectangle-zone", ZONE_POINTS["rectangle-zone"]), { practiceArea: true }],
    ["Dead Zone", record("rectangle-zone", ZONE_POINTS["rectangle-zone"], { zoneStyle: "dead" }), { practiceArea: true }],
    ["Free Pen", record("free-pen", [{ x: 1, y: 1 }, { x: 5, y: 8 }, { x: 9, y: 2 }]), {}],
    ["Plain line", record("plain-line", [{ x: 1, y: 1 }, { x: 20, y: 8 }]), {}],
    ["Dashed arrow", record("dashed-arrow", [{ x: 1, y: 1 }, { x: 20, y: 8 }]), {}],
  ];
  for (const [label, drawing, options] of cases) {
    it(`${label} renders identically with or without zoneStyle`, () => {
      for (const selected of [false, true]) {
        const without = render(drawing, selected, options);
        const withStyle = render(drawing, selected, { ...options, zoneStyle: PHONE });
        expect(paintDump(withStyle)).toBe(paintDump(without));
      }
    });
  }

  it("the shared per-drawing width / opacity defaults are unchanged", () => {
    expect(DEFAULT_TACTICAL_DRAWING_WIDTH).toBe(1.15);
    expect(DEFAULT_TACTICAL_DRAWING_OPACITY).toBe(0.95);
  });
});

describe("controller wiring", () => {
  function drawRect(zoneStyleProvider?: () => { worldUnitsPerScreenPx: number }) {
    const drawingsLayer = new Container();
    const controller = createTacticalDrawingController({
      drawingsLayer,
      previewGraphic: new Graphics(),
      mapperProvider: () => identityMapper,
      createDrawingId: () => "r1",
      ...(zoneStyleProvider ? { zoneStyleProvider } : {}),
    });
    controller.setTool("rectangle-zone");
    controller.handlePointerDown({ x: 10, y: 10 }, 1);
    controller.handlePointerMove({ x: 40, y: 30 }, 1);
    controller.handlePointerUp({ x: 40, y: 30 }, 1);
    return drawingsLayer.children[0] as Graphics;
  }

  it("Tactical Slate (zoneStyleProvider) renders committed zones in the refined look", () => {
    expect(styles(drawRect(() => PHONE), "fill")[0]?.alpha).toBe(TACTICAL_ZONE_STYLE.fillAlpha);
  });

  it("hosts without a provider (Tactical Sequence) keep the original look and stored values", () => {
    const g = drawRect();
    expect(styles(g, "fill")[0]?.alpha).toBeCloseTo(0.285, 6);
  });
});

describe("paint dump sensitivity", () => {
  it("detects a style change (so the identical-render checks above are meaningful)", () => {
    const drawing = record("rectangle-zone", ZONE_POINTS["rectangle-zone"]);
    expect(paintDump(render(drawing, false, { zoneStyle: PHONE }))).not.toBe(paintDump(render(drawing, false)));
    expect(paintDump(render({ ...drawing, color: 0x22d3ee }, false))).not.toBe(paintDump(render(drawing, false)));
  });
});
