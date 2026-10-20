import { Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";

import { TACTICAL_SLATE_GREEN, WHITEBOARD_PEN_COLOR_CHOICES } from "../../../components/draw-tools/drawColorPalette";
import { sanitizeDrawingSnapshot, type TacticalDrawingKind, type TacticalDrawingRecord } from "./tacticalDrawingTypes";
import { ANGLED_ZONE_HATCH, renderTacticalDrawing } from "./tacticalLineRenderer";

/**
 * Green (#19B77A) is the Tactical Slate's sixth drawing colour. Colours are
 * stored as plain numbers on each drawing, so Green needs no special
 * handling: it must survive save/reload for every tool, render in both zone
 * fills, and leave every existing colour (Black included) untouched.
 */

const identityMapper = {
  normalizedToWorld: (point: { x: number; y: number }) => point,
  worldToNormalized: (point: { x: number; y: number }) => point,
};

type Style = { alpha?: number; color?: number };
function styles(g: Graphics, action: "fill" | "stroke"): Style[] {
  return (g.context as unknown as { instructions: Array<{ action: string; data?: { style?: Style } }> }).instructions
    .filter((inst) => inst.action === action)
    .map((inst) => inst.data?.style ?? {});
}

const GREEN = 0x19b77a;
const BLACK = 0x111111;

const POINTS: Record<TacticalDrawingKind, Array<{ x: number; y: number }>> = {
  "plain-line": [{ x: 10, y: 10 }, { x: 40, y: 20 }],
  "straight-arrow": [{ x: 10, y: 10 }, { x: 40, y: 20 }],
  "curved-arrow": [{ x: 10, y: 10 }, { x: 25, y: 30 }, { x: 40, y: 20 }],
  "dashed-arrow": [{ x: 10, y: 10 }, { x: 40, y: 20 }],
  "wavy-line": [{ x: 10, y: 10 }, { x: 20, y: 14 }, { x: 40, y: 20 }],
  "free-pen": [{ x: 10, y: 10 }, { x: 20, y: 14 }, { x: 40, y: 20 }],
  "rectangle-zone": [{ x: 10, y: 10 }, { x: 40, y: 30 }],
  "circle-zone": [{ x: 10, y: 10 }, { x: 40, y: 30 }],
  "angled-zone": [{ x: 10, y: 10 }, { x: 45, y: 5 }, { x: 40, y: 30 }, { x: 12, y: 32 }],
};

function drawing(kind: TacticalDrawingKind, color: number, extra: Partial<TacticalDrawingRecord> = {}): TacticalDrawingRecord {
  return { id: kind, kind, points: POINTS[kind], color, width: 1.15, opacity: 0.95, createdAt: 1, ...extra };
}

describe("Green drawing colour", () => {
  it("is #19B77A and does not change the shared five-colour palette", () => {
    expect(TACTICAL_SLATE_GREEN).toEqual({ label: "Green", value: GREEN, css: "#19b77a" });
    expect(WHITEBOARD_PEN_COLOR_CHOICES.map((c) => c.value)).toEqual([BLACK, 0xffffff, 0xfacc15, 0xdc2626, 0x2563eb]);
  });

  for (const kind of Object.keys(POINTS) as TacticalDrawingKind[]) {
    it(`${kind}: Green survives save / reload`, () => {
      const saved = JSON.parse(JSON.stringify(drawing(kind, GREEN)));
      expect(sanitizeDrawingSnapshot(saved, identityMapper)?.color).toBe(GREEN);
    });

    it(`${kind}: an existing Black drawing stays Black`, () => {
      const saved = JSON.parse(JSON.stringify(drawing(kind, BLACK)));
      expect(sanitizeDrawingSnapshot(saved, identityMapper)?.color).toBe(BLACK);
      const g = new Graphics();
      renderTacticalDrawing(g, drawing(kind, BLACK), identityMapper, false, { zoneStyle: { worldUnitsPerScreenPx: 0.35 } });
      for (const style of [...styles(g, "fill"), ...styles(g, "stroke")]) expect(style.color).toBe(BLACK);
    });
  }

  it("Green Angled Zone, Normal fill: fill and outline in Green", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, drawing("angled-zone", GREEN), identityMapper, false, { zoneStyle: { worldUnitsPerScreenPx: 0.35 } });
    expect(styles(g, "fill").map((s) => s.color)).toEqual([GREEN]);
    expect(styles(g, "stroke").map((s) => s.color)).toEqual([GREEN]);
  });

  it("Green Angled Zone, Hatched fill: fill, hatch and outline all in Green", () => {
    const g = new Graphics();
    renderTacticalDrawing(g, drawing("angled-zone", GREEN, { fillStyle: "hatched" }), identityMapper, false, {
      zoneStyle: { worldUnitsPerScreenPx: 0.35 },
    });
    expect(styles(g, "fill").map((s) => s.color)).toEqual([GREEN]);
    const [hatch, border] = styles(g, "stroke");
    expect(hatch).toMatchObject({ color: GREEN, alpha: ANGLED_ZONE_HATCH.alpha });
    expect(border?.color).toBe(GREEN);
    const saved = JSON.parse(JSON.stringify(drawing("angled-zone", GREEN, { fillStyle: "hatched" })));
    expect(sanitizeDrawingSnapshot(saved, identityMapper)).toMatchObject({ color: GREEN, fillStyle: "hatched" });
  });
});
