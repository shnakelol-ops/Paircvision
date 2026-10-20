import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import {
  angledZoneHatchSegments,
  distanceToAngledZoneOutline,
  isPointInAngledZone,
  moveAngledZoneCorner,
  translateAngledZone,
  type AngledZoneCorners,
} from "./angledZoneGeometry";
import { createTacticalDrawingController } from "./tacticalDrawingController";
import { sanitizeDrawingSnapshot, type TacticalDrawingRecord } from "./tacticalDrawingTypes";
import { ANGLED_ZONE_HATCH, TACTICAL_ZONE_STYLE, renderTacticalDrawing } from "./tacticalLineRenderer";

/**
 * Angled Zone "Hatched" fill: an optional `fillStyle: "hatched"` on the
 * drawing record. Absent (every zone saved before this) is the normal fill,
 * which must paint exactly as before.
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
function styles(g: Graphics, action: "fill" | "stroke"): Style[] {
  return instructionsOf(g)
    .filter((inst) => inst.action === action)
    .map((inst) => inst.data?.style ?? {});
}
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

const rect: AngledZoneCorners = [
  { x: 20, y: 20 },
  { x: 60, y: 20 },
  { x: 60, y: 50 },
  { x: 20, y: 50 },
];
// Concave dart: the third corner is pushed into the shape.
const dart: AngledZoneCorners = [
  { x: 20, y: 20 },
  { x: 70, y: 20 },
  { x: 40, y: 35 },
  { x: 20, y: 70 },
];

function zone(points: readonly { x: number; y: number }[], extra: Partial<TacticalDrawingRecord> = {}): TacticalDrawingRecord {
  return {
    id: "z",
    kind: "angled-zone",
    points: points.map((point) => ({ ...point })),
    color: 0x3b82f6,
    width: 1.15,
    opacity: 0.95,
    createdAt: 1,
    ...extra,
  };
}

const PHONE = { worldUnitsPerScreenPx: 0.35 };

function render(drawing: TacticalDrawingRecord, selected = false, options: Parameters<typeof renderTacticalDrawing>[4] = { zoneStyle: PHONE }): Graphics {
  const g = new Graphics();
  renderTacticalDrawing(g, drawing, identityMapper, selected, options);
  return g;
}

/** Every hatch segment lies inside the polygon and ends on its outline. */
function expectClipped(points: readonly { x: number; y: number }[], spacing: number) {
  const segments = angledZoneHatchSegments(points, spacing);
  expect(segments.length).toBeGreaterThan(0);
  for (const { from, to } of segments) {
    expect(distanceToAngledZoneOutline(points, from)).toBeLessThan(1e-6);
    expect(distanceToAngledZoneOutline(points, to)).toBeLessThan(1e-6);
    for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const sample = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      expect(isPointInAngledZone(points, sample)).toBe(true);
    }
  }
  return segments;
}

describe("hatch clipping (pure geometry)", () => {
  it("clips diagonal lines exactly to a rectangle-shaped zone, evenly spaced", () => {
    const segments = expectClipped(rect, 3);
    // Lines run along x + y = c, one perpendicular spacing apart.
    const constants = segments.map((s) => s.from.x + s.from.y);
    for (let i = 1; i < constants.length; i += 1) {
      expect(constants[i]! - constants[i - 1]!).toBeCloseTo(3 * Math.SQRT2, 6);
    }
    for (const { from, to } of segments) expect(to.x - from.x).toBeCloseTo(-(to.y - from.y), 6);
  });

  it("stays clipped after a corner is reshaped and after the zone moves", () => {
    const reshaped = moveAngledZoneCorner(rect, 1, { x: 85, y: 5 });
    expect(reshaped).not.toEqual(rect);
    expectClipped(reshaped, 3);
    const moved = translateAngledZone(reshaped, -10, 15);
    expectClipped(moved, 3);
    const movedSegments = angledZoneHatchSegments(moved, 3);
    for (const { from } of movedSegments) {
      expect(from.x).toBeGreaterThanOrEqual(Math.min(...moved.map((p) => p.x)) - 1e-6);
    }
  });

  it("handles a concave polygon: lines crossing the notch split into two segments", () => {
    const segments = expectClipped(dart, 2);
    const byLine = new Map<string, number>();
    for (const s of segments) {
      const key = (s.from.x + s.from.y).toFixed(4);
      byLine.set(key, (byLine.get(key) ?? 0) + 1);
    }
    expect([...byLine.values()].some((count) => count === 2)).toBe(true);
    // Nothing is drawn inside the notch.
    for (const { from, to } of segments) {
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      expect(isPointInAngledZone(dart, mid)).toBe(true);
    }
  });

  it("returns nothing for invalid input", () => {
    expect(angledZoneHatchSegments(rect, 0)).toEqual([]);
    expect(angledZoneHatchSegments(rect.slice(0, 2), 2)).toEqual([]);
    expect(angledZoneHatchSegments([{ x: Number.NaN, y: 0 }, ...rect.slice(1)], 2)).toEqual([]);
  });
});

describe("Normal vs Hatched rendering", () => {
  it("Normal (no fillStyle) paints exactly the established zone look", () => {
    const g = render(zone(rect));
    expect(styles(g, "fill").map((s) => s.alpha)).toEqual([TACTICAL_ZONE_STYLE.fillAlpha]);
    expect(styles(g, "stroke").map((s) => s.alpha)).toEqual([TACTICAL_ZONE_STYLE.borderAlpha]);
  });

  it("Hatched keeps the colour and outline, adds a subtle hatch over a lighter fill", () => {
    const normal = render(zone(rect));
    const hatched = render(zone(rect, { fillStyle: "hatched" }));
    const [fill] = styles(hatched, "fill");
    const [hatch, border] = styles(hatched, "stroke");
    expect(fill?.color).toBe(0x3b82f6);
    expect(fill?.alpha).toBeCloseTo(TACTICAL_ZONE_STYLE.fillAlpha * ANGLED_ZONE_HATCH.fillAlphaScale, 6);
    expect(hatch?.color).toBe(0x3b82f6);
    expect(hatch?.alpha).toBe(0.3);
    expect(hatch?.width).toBeCloseTo(ANGLED_ZONE_HATCH.widthScreenPx * PHONE.worldUnitsPerScreenPx, 6);
    expect(border).toEqual(styles(normal, "stroke")[0]);
  });

  it("hatch spacing and width hold in screen pixels at any zoom", () => {
    for (const worldUnitsPerScreenPx of [0.15, 0.35, 0.8]) {
      const g = render(zone(rect, { fillStyle: "hatched" }), false, { zoneStyle: { worldUnitsPerScreenPx } });
      expect((styles(g, "stroke")[0]?.width ?? 0) / worldUnitsPerScreenPx).toBeCloseTo(ANGLED_ZONE_HATCH.widthScreenPx, 6);
    }
  });

  it("selected Hatched zones keep the hatch and gain the normal editing halo", () => {
    const g = render(zone(rect, { fillStyle: "hatched" }), true);
    const strokes = styles(g, "stroke");
    expect(strokes).toHaveLength(3); // halo, hatch, border
    expect(strokes[1]?.alpha).toBe(0.3);
    expect(strokes[2]?.alpha).toBe(TACTICAL_ZONE_STYLE.selectedBorderAlpha);
  });

  it("renders a concave hatched zone (fill, hatch, outline)", () => {
    const g = render(zone(dart, { fillStyle: "hatched" }));
    expect(styles(g, "fill")).toHaveLength(1);
    expect(styles(g, "stroke")).toHaveLength(2);
  });

  it("without a zone scale (non-Slate hosts) the hatch uses world units close to the Dead Zone", () => {
    const g = render(zone(rect, { fillStyle: "hatched" }), false, {});
    expect(styles(g, "stroke")[0]?.width).toBe(ANGLED_ZONE_HATCH.worldWidth);
  });
});

describe("Rect, Circle and Dead Zone are unaffected by fillStyle", () => {
  const base = { id: "r", color: 0xef4444, width: 1.15, opacity: 0.95, createdAt: 1 } as const;
  const twoPoints = [{ x: 10, y: 10 }, { x: 40, y: 30 }];
  const cases: Array<[string, TacticalDrawingRecord, Parameters<typeof renderTacticalDrawing>[4]]> = [
    ["Rect Zone", { ...base, kind: "rectangle-zone", points: twoPoints }, { zoneStyle: PHONE }],
    ["Circle Zone", { ...base, kind: "circle-zone", points: twoPoints }, { zoneStyle: PHONE }],
    ["Dead Zone", { ...base, kind: "rectangle-zone", points: twoPoints, zoneStyle: "dead" }, { practiceArea: true }],
    ["Practice Area", { ...base, kind: "rectangle-zone", points: twoPoints }, { practiceArea: true }],
  ];
  for (const [label, drawing, options] of cases) {
    it(`${label} paints identically even if a record carried fillStyle`, () => {
      expect(paintDump(render({ ...drawing, fillStyle: "hatched" }, false, options))).toBe(paintDump(render(drawing, false, options)));
    });
  }
});

describe("persistence", () => {
  it("Hatched survives save / reload", () => {
    const saved = JSON.parse(JSON.stringify(zone(dart, { fillStyle: "hatched" })));
    expect(sanitizeDrawingSnapshot(saved, identityMapper)?.fillStyle).toBe("hatched");
  });

  it("existing zones (no fillStyle) load as Normal, unchanged", () => {
    const saved = JSON.parse(JSON.stringify(zone(rect)));
    const loaded = sanitizeDrawingSnapshot(saved, identityMapper);
    expect(loaded).toEqual(zone(rect));
    expect(loaded && "fillStyle" in loaded).toBe(false);
  });

  it("malformed or unknown fill values fall back to Normal", () => {
    for (const fillStyle of ["dotted", "HATCHED", 1, null, {}, true]) {
      const loaded = sanitizeDrawingSnapshot({ ...zone(rect), fillStyle }, identityMapper);
      expect(loaded).not.toBeNull();
      expect(loaded && "fillStyle" in loaded).toBe(false);
    }
  });

  it("fillStyle is never kept on Rect or Circle Zones", () => {
    for (const kind of ["rectangle-zone", "circle-zone"] as const) {
      const loaded = sanitizeDrawingSnapshot(
        { id: "r", kind, points: [{ x: 10, y: 10 }, { x: 40, y: 30 }], color: 1, width: 1.15, opacity: 0.95, createdAt: 1, fillStyle: "hatched" },
        identityMapper,
      );
      expect(loaded && "fillStyle" in loaded).toBe(false);
    }
  });
});

describe("geometry editing and undo are unchanged by the fill style", () => {
  function setup() {
    const controller = createTacticalDrawingController({
      drawingsLayer: new Container(),
      previewGraphic: new Graphics(),
      mapperProvider: () => identityMapper,
      createDrawingId: () => "z1",
    });
    controller.setTool("angled-zone");
    controller.handlePointerDown({ x: 10, y: 10 }, 1);
    controller.handlePointerMove({ x: 40, y: 30 }, 1);
    controller.handlePointerUp({ x: 40, y: 30 }, 1);
    return controller;
  }
  const current = (c: ReturnType<typeof setup>) => c.exportSnapshots()[0]!;

  it("new zones start Normal", () => {
    expect("fillStyle" in current(setup())).toBe(false);
  });

  it("switching to Hatched is not an undo step; geometry undo keeps the fill style", () => {
    const controller = setup();
    controller.updateDrawing("z1", { ...current(controller), fillStyle: "hatched" });
    expect(controller.hasGeometryEdit("z1")).toBe(false);

    const before = current(controller).points.map((p) => ({ ...p }));
    const edited = moveAngledZoneCorner(before, 1, { x: 50, y: 5 });
    controller.updateDrawing("z1", { ...current(controller), points: edited });
    controller.recordGeometryEdit("z1", before);

    controller.undoGeometryEdit("z1");
    expect(current(controller).points).toEqual(before);
    expect(current(controller).fillStyle).toBe("hatched");

    // The general undo still removes the zone once no edits remain.
    controller.undo();
    expect(controller.exportSnapshots()).toEqual([]);
  });
});
