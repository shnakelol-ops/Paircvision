/**
 * pdfTurnoverTerritory.test.ts — Snapshot Turnover & Territory orientation
 * and half-split regression tests.
 *
 * Plotted markers must be normalised with the same team-relative rotation
 * as the hotspot callouts (toTeamRelativeZoneEvent, REPORT perspective), so
 * the home team always reads Defensive → Middle → Attacking left to right,
 * at HT and on both FT half pages. FT splits the page into First Half and
 * Second Half pages, each fed only that half's events.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import {
  exportSnapshotPdf,
  makeTurnoverTerritoryPage,
  TURNOVER_TERRITORY_THIRD_BOUNDARY_COLOR,
} from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { mkAdareEvent } from "./adare-mungret-fixture";
import { ZONE_MAP_V1_NINE_GRID } from "../zones/zone-maps";
import { resolveForAttackingDirection } from "../zones/zone-orientation";

const PURPLE = "#a78bfa";
const ORANGE = "#f97316";
const TITLE_FONT = "bold 33px sans-serif";

type Marker = { fill: string; x: number; y: number };

class CaptureCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  font = "";
  lineWidth = 1;
  textBaseline = "alphabetic";
  textAlign = "left";
  globalAlpha = 1;
  markers: Marker[] = [];
  texts: Array<{ text: string; font: string; x: number; y: number }> = [];
  /** Vertical boundary lines drawn in the thirds-overlay colour. */
  boundaries: number[] = [];
  /** Draw order: "text:<label>" / "marker". */
  order: string[] = [];
  private pendingArc: { x: number; y: number } | null = null;

  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText(text: string, x = 0, y = 0) {
    this.texts.push({ text, font: this.font, x, y });
    this.order.push(`text:${text}`);
  }
  stroke() {}
  beginPath() {}
  moveTo(x: number) {
    if (this.strokeStyle === TURNOVER_TERRITORY_THIRD_BOUNDARY_COLOR) this.boundaries.push(x);
  }
  lineTo() {}
  arc(x: number, y: number) {
    this.pendingArc = { x, y };
  }
  ellipse() {}
  quadraticCurveTo() {}
  closePath() {}
  fill() {
    if (this.pendingArc && (this.fillStyle === PURPLE || this.fillStyle === ORANGE)) {
      this.markers.push({ fill: this.fillStyle, ...this.pendingArc });
      this.order.push("marker");
    }
    this.pendingArc = null;
  }
  measureText(text: string) {
    return { width: text.length * 8 };
  }
  setLineDash() {}
  clip() {}
  rect() {}
  roundRect() {}
  drawImage() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  get title(): string | null {
    return this.texts.find((t) => t.font === TITLE_FONT)?.text ?? null;
  }
}

class CaptureCanvas {
  width = 1920;
  height = 1080;
  readonly ctx = new CaptureCanvasContext();
  getContext() {
    return this.ctx as unknown as CanvasRenderingContext2D;
  }
  toDataURL() {
    return "data:image/jpeg;base64,AAAA";
  }
}

let captured: CaptureCanvas[] = [];

beforeEach(() => {
  captured = [];
  class MockPath2D {
    constructor(_d?: string) {}
  }
  (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
  (globalThis as unknown as { document: unknown }).document = {
    createElement(tag: string) {
      if (tag !== "canvas") return {};
      const c = new CaptureCanvas();
      captured.push(c);
      return c;
    },
  };
});

afterEach(() => {
  for (const file of ["Ballylanders_v_Galbally_ht_snapshot.pdf", "Ballylanders_v_Galbally_ft_snapshot.pdf"]) {
    if (existsSync(file)) unlinkSync(file);
  }
});

const HOME = "Ballylanders";
const AWAY = "Galbally";

function ev(
  kind: "TURNOVER_WON" | "TURNOVER_LOST",
  teamSide: "FOR" | "OPP",
  period: "1H" | "2H",
  nx: number,
  ny = 0.5,
): PdfExportEvent {
  return mkAdareEvent({ kind, teamSide, period, nx, ny, x: nx, y: ny }) as PdfExportEvent;
}

function render(
  events: PdfExportEvent[],
  dir: "LEFT" | "RIGHT",
  half?: "1H" | "2H",
): CaptureCanvasContext {
  return (makeTurnoverTerritoryPage(events, "gaelic", HOME, AWAY, 1, 8, dir, half) as unknown as CaptureCanvas).ctx;
}

/** Pixel x of the pitch's left (nx=0) and right (nx=1) goal lines on this page. */
function calibrate(): { x0: number; x1: number; y0: number; y1: number } {
  const ctx = render([ev("TURNOVER_WON", "FOR", "1H", 0, 0), ev("TURNOVER_WON", "FOR", "1H", 1, 1)], "RIGHT");
  const [a, b] = ctx.markers;
  return { x0: a.x, x1: b.x, y0: a.y, y1: b.y };
}

/** Marker positions back in 0..1 pitch space — the raw stored physical coordinates. */
function displayPositions(ctx: CaptureCanvasContext): Array<{ fill: string; nx: number; ny: number }> {
  const c = calibrate();
  return ctx.markers.map((m) => ({
    fill: m.fill,
    nx: Math.round(((m.x - c.x0) / (c.x1 - c.x0)) * 100) / 100,
    ny: Math.round(((m.y - c.y0) / (c.y1 - c.y0)) * 100) / 100,
  }));
}

function panelTexts(ctx: CaptureCanvasContext): string[] {
  return ctx.texts.map((t) => t.text);
}

const THIRD_LABELS = ["DEFENSIVE THIRD", "MIDDLE THIRD", "ATTACKING THIRD"];

/** Overlay label draws, left to right on the page. */
function labelDraws(ctx: CaptureCanvasContext) {
  return ctx.texts.filter((t) => THIRD_LABELS.includes(t.text)).sort((a, b) => a.x - b.x);
}

/** The overlay label of the third containing pixel x on this page. */
function thirdLabelAt(ctx: CaptureCanvasContext, x: number): string {
  const [b1, b2] = [...ctx.boundaries].sort((a, b) => a - b);
  const index = x < b1 ? 0 : x < b2 ? 1 : 2;
  return labelDraws(ctx)[index].text;
}

const opposite = (d: "LEFT" | "RIGHT") => (d === "LEFT" ? "RIGHT" : "LEFT");

describe("Turnover & Territory — raw physical plotting", () => {
  it("HT, home attacking RIGHT: plotted at the stored coordinates", () => {
    const ctx = render([ev("TURNOVER_WON", "FOR", "1H", 0.2, 0.3)], "RIGHT");
    expect(displayPositions(ctx)).toEqual([{ fill: PURPLE, nx: 0.2, ny: 0.3 }]);
  });

  it("HT, home attacking LEFT: still plotted at the stored coordinates (no rotation)", () => {
    const ctx = render([ev("TURNOVER_WON", "FOR", "1H", 0.2, 0.3)], "LEFT");
    expect(displayPositions(ctx)).toEqual([{ fill: PURPLE, nx: 0.2, ny: 0.3 }]);
  });

  it("2H pages plot at the stored coordinates, for both recorded starting directions", () => {
    for (const start of ["LEFT", "RIGHT"] as const) {
      const ctx = render([ev("TURNOVER_WON", "FOR", "2H", 0.2, 0.3)], start, "2H");
      expect(displayPositions(ctx)).toEqual([{ fill: PURPLE, nx: 0.2, ny: 0.3 }]);
    }
  });

  it("a turnover won deep in the home team's attacking end lies in the third labelled ATTACKING and the callout names an Attacking zone — every half/direction", () => {
    for (const start of ["LEFT", "RIGHT"] as const) {
      for (const half of ["1H", "2H"] as const) {
        const dir = resolveForAttackingDirection(half, start);
        const ctx = render([ev("TURNOVER_WON", "FOR", half, dir === "RIGHT" ? 0.9 : 0.1)], start, half);
        expect(thirdLabelAt(ctx, ctx.markers[0].x)).toBe("ATTACKING THIRD");
        expect(panelTexts(ctx).some((t) => t.startsWith("Attacking"))).toBe(true);
      }
    }
  });

  it("dots and 'Most Turnovers Lost' callout agree for a defensive-third loss in 2H", () => {
    // Recorded 1H RIGHT → 2H home attacks LEFT, so its defensive end is physically the right.
    const ctx = render([ev("TURNOVER_LOST", "FOR", "2H", 0.9)], "RIGHT", "2H");
    expect(ctx.markers[0].fill).toBe(ORANGE);
    expect(thirdLabelAt(ctx, ctx.markers[0].x)).toBe("DEFENSIVE THIRD");
    expect(panelTexts(ctx).some((t) => t.startsWith("Defensive"))).toBe(true);
  });

  it("opposition-logged turnovers are orange (home lost) at their raw position", () => {
    // OPP TURNOVER_WON = home lost (the page's existing lost definition).
    const ctx = render([ev("TURNOVER_WON", "OPP", "1H", 0.2, 0.3)], "LEFT");
    expect(displayPositions(ctx)).toEqual([{ fill: ORANGE, nx: 0.2, ny: 0.3 }]);
    const ctx2H = render([ev("TURNOVER_WON", "OPP", "2H", 0.2, 0.3)], "RIGHT", "2H");
    expect(displayPositions(ctx2H)).toEqual([{ fill: ORANGE, nx: 0.2, ny: 0.3 }]);
  });

  it("subtitle arrow names the home team and follows the resolver for each page; HT keeps the unsuffixed title", () => {
    for (const start of ["LEFT", "RIGHT"] as const) {
      for (const half of [undefined, "1H", "2H"] as const) {
        const dir = resolveForAttackingDirection(half ?? "1H", start);
        const expected = dir === "RIGHT"
          ? "Ballylanders v Galbally · Ballylanders attacking →"
          : "Ballylanders v Galbally · ← Ballylanders attacking";
        expect(panelTexts(render([], start, half))).toContain(expected);
      }
    }
    expect(render([], "LEFT").title).toBe("Turnover & Territory");
    expect(render([], "RIGHT", "1H").title).toBe("Turnover & Territory – First Half");
    expect(render([], "RIGHT", "2H").title).toBe("Turnover & Territory – Second Half");
  });
});

describe("Snapshot export — Turnover & Territory pages", () => {
  const events: PdfExportEvent[] = [
    ev("TURNOVER_WON", "FOR", "1H", 0.2),
    ev("TURNOVER_WON", "FOR", "1H", 0.4),
    ev("TURNOVER_LOST", "FOR", "1H", 0.6),
    ev("TURNOVER_WON", "FOR", "2H", 0.3),
    ev("TURNOVER_LOST", "FOR", "2H", 0.1),
    ev("TURNOVER_WON", "OPP", "2H", 0.5),
  ];
  const base = {
    events,
    homeTeamName: HOME,
    awayTeamName: AWAY,
    sport: "gaelic" as const,
    homeAttackingDirection: "RIGHT" as const,
  };

  const page = (title: string) => captured.find((c) => c.ctx.title === title)!.ctx;
  const count = (ctx: CaptureCanvasContext, fill: string) => ctx.markers.filter((m) => m.fill === fill).length;

  it("FT: separate First Half and Second Half pages, each isolated to its own half", async () => {
    await exportSnapshotPdf({ ...base, snapshotMode: "FULL_TIME_SNAPSHOT" });
    expect(captured).toHaveLength(8);
    const first = page("Turnover & Territory – First Half");
    const second = page("Turnover & Territory – Second Half");
    expect([count(first, PURPLE), count(first, ORANGE)]).toEqual([2, 1]);
    expect([count(second, PURPLE), count(second, ORANGE)]).toEqual([1, 2]);
    expect(panelTexts(first)).toContain("Won 2 · Lost 1 (67% won)");
    expect(panelTexts(second)).toContain("Won 1 · Lost 2 (33% won)");
    expect(panelTexts(first)).toContain("6 / 8");
    expect(panelTexts(second)).toContain("7 / 8");
  });

  it("HT: one first-half-only Turnover & Territory page, still page 5 of 5", async () => {
    await exportSnapshotPdf({ ...base, snapshotMode: "HALF_TIME_SNAPSHOT" });
    expect(captured).toHaveLength(5);
    const ht = page("Turnover & Territory");
    expect([count(ht, PURPLE), count(ht, ORANGE)]).toEqual([2, 1]);
    expect(panelTexts(ht)).toContain("5 / 5");
  });

  it("FT with no second-half events renders an empty Second Half page without leaking 1H events", async () => {
    await exportSnapshotPdf({
      ...base,
      events: events.filter((e) => e.period === "1H"),
      snapshotMode: "FULL_TIME_SNAPSHOT",
    });
    const second = page("Turnover & Territory – Second Half");
    expect(second.markers).toHaveLength(0);
    expect(panelTexts(second)).toContain("No turnovers recorded");
    expect(page("Turnover & Territory – First Half").markers).toHaveLength(3);
  });
});

describe("Turnover & Territory — half-aware three-third overlay", () => {
  const RIGHT_ORDER = ["DEFENSIVE THIRD", "MIDDLE THIRD", "ATTACKING THIRD"];
  const LEFT_ORDER = ["ATTACKING THIRD", "MIDDLE THIRD", "DEFENSIVE THIRD"];

  it("label order follows resolveForAttackingDirection(half, recorded 1H direction) on HT and both FT pages", () => {
    const expected: Array<[start: "LEFT" | "RIGHT", half: "1H" | "2H" | undefined, order: string[]]> = [
      ["RIGHT", undefined, RIGHT_ORDER],
      ["RIGHT", "1H", RIGHT_ORDER],
      ["RIGHT", "2H", LEFT_ORDER],
      ["LEFT", undefined, LEFT_ORDER],
      ["LEFT", "1H", LEFT_ORDER],
      ["LEFT", "2H", RIGHT_ORDER],
    ];
    for (const [start, half, order] of expected) {
      const dir = resolveForAttackingDirection(half ?? "1H", start);
      expect(dir === "RIGHT" ? RIGHT_ORDER : LEFT_ORDER).toEqual(order);
      expect(labelDraws(render([], start, half)).map((d) => d.text)).toEqual(order);
    }
  });

  it("boundaries are identical on RIGHT and LEFT pages and sit on the zone engine's third boundaries (ZONE_MAP_V1_NINE_GRID)", () => {
    const c = calibrate();
    const toPx = (v: number) => c.x0 + (v / 100) * (c.x1 - c.x0);
    const xMins = ["MIDDLE_CENTRE", "ATTACKING_CENTRE"].map(
      (id) => ZONE_MAP_V1_NINE_GRID.zones.find((z) => z.id === id)!.bounds.xMin,
    );
    const right = [...render([], "RIGHT").boundaries].sort((a, b) => a - b);
    const left = [...render([], "LEFT").boundaries].sort((a, b) => a - b);
    expect(right).toHaveLength(2);
    right.forEach((x, i) => expect(x).toBeCloseTo(toPx(xMins[i]), 6));
    left.forEach((x, i) => expect(x).toBeCloseTo(right[i], 6));
  });

  it("each label is centred in its own third", () => {
    const c = calibrate();
    const ctx = render([], "RIGHT");
    const disp = labelDraws(ctx).map((d) => (d.x - c.x0) / (c.x1 - c.x0));
    expect(disp[0]).toBeCloseTo(1 / 6, 6);
    expect(disp[1]).toBeCloseTo(1 / 2, 6);
    expect(disp[2]).toBeCloseTo(5 / 6, 6);
  });

  it("a marker in each third falls between that third's boundaries, matching the callout zone", () => {
    const ctx = render(
      [ev("TURNOVER_WON", "FOR", "1H", 0.2), ev("TURNOVER_WON", "FOR", "1H", 0.5), ev("TURNOVER_WON", "FOR", "1H", 0.8)],
      "RIGHT",
    );
    const [b1, b2] = ctx.boundaries;
    const xs = ctx.markers.map((m) => m.x);
    expect(xs[0]).toBeLessThan(b1);
    expect(xs[1]).toBeGreaterThan(b1);
    expect(xs[1]).toBeLessThan(b2);
    expect(xs[2]).toBeGreaterThan(b2);
  });

  it("overlay is drawn before the markers so it never covers them", () => {
    const ctx = render([ev("TURNOVER_WON", "FOR", "1H", 0.2), ev("TURNOVER_LOST", "FOR", "1H", 0.9)], "RIGHT");
    const lastLabel = Math.max(...THIRD_LABELS.map((l) => ctx.order.lastIndexOf(`text:${l}`)));
    const firstMarker = ctx.order.indexOf("marker");
    expect(lastLabel).toBeGreaterThanOrEqual(0);
    expect(firstMarker).toBeGreaterThan(lastLabel);
  });

  it("drawn marker coordinates equal the stored coordinates on every page (no rotation)", () => {
    const c = calibrate();
    for (const start of ["LEFT", "RIGHT"] as const) {
      for (const half of [undefined, "1H", "2H"] as const) {
        const period = half ?? "1H";
        const ctx = render([ev("TURNOVER_WON", "FOR", period, 0.15, 0.85), ev("TURNOVER_LOST", "FOR", period, 0.7, 0.2)], start, half);
        expect(ctx.markers.map((m) => [m.x, m.y])).toEqual([
          [c.x0 + 0.15 * (c.x1 - c.x0), c.y0 + 0.85 * (c.y1 - c.y0)],
          [c.x0 + 0.7 * (c.x1 - c.x0), c.y0 + 0.2 * (c.y1 - c.y0)],
        ]);
      }
    }
  });
});

describe("Turnover & Territory — direction derived generically from recorded 1H direction + half", () => {
  const STARTS = ["LEFT", "RIGHT"] as const;
  const HALVES = ["1H", "2H"] as const;
  /** Physical nx deep in an end, given which way the home team attacks. Never hard-coded per half. */
  const attackingEndNx = (dir: "LEFT" | "RIGHT") => (dir === "RIGHT" ? 0.9 : 0.1);
  const defensiveEndNx = (dir: "LEFT" | "RIGHT") => 1 - attackingEndNx(dir);

  it("resolver: 1H is the recorded direction and 2H always reverses it, for both starting directions", () => {
    for (const start of STARTS) {
      expect(resolveForAttackingDirection("1H", start)).toBe(start);
      expect(resolveForAttackingDirection("2H", start)).toBe(opposite(start));
    }
  });

  for (const start of STARTS) {
    it(`FT export, recorded 1H direction ${start}: on each half page the won dot lies in the third labelled ATTACKING, the lost dot in DEFENSIVE`, async () => {
      const events: PdfExportEvent[] = HALVES.flatMap((half) => {
        const dir = resolveForAttackingDirection(half, start);
        return [
          ev("TURNOVER_WON", "FOR", half, attackingEndNx(dir)),
          ev("TURNOVER_LOST", "FOR", half, defensiveEndNx(dir)),
        ];
      });
      await exportSnapshotPdf({
        events,
        homeTeamName: HOME,
        awayTeamName: AWAY,
        sport: "gaelic",
        homeAttackingDirection: start,
        snapshotMode: "FULL_TIME_SNAPSHOT",
      });
      for (const title of ["Turnover & Territory – First Half", "Turnover & Territory – Second Half"]) {
        const ctx = captured.find((c) => c.ctx.title === title)!.ctx;
        const won = ctx.markers.filter((m) => m.fill === PURPLE);
        const lost = ctx.markers.filter((m) => m.fill === ORANGE);
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(thirdLabelAt(ctx, won[0].x)).toBe("ATTACKING THIRD");
        expect(thirdLabelAt(ctx, lost[0].x)).toBe("DEFENSIVE THIRD");
        const texts = panelTexts(ctx);
        expect(texts.some((t) => t.startsWith("Attacking"))).toBe(true); // Most Turnovers Won
        expect(texts.some((t) => t.startsWith("Defensive"))).toBe(true); // Most Turnovers Lost
      }
    });

    it(`HT export, recorded 1H direction ${start}: won dot in the third labelled ATTACKING, lost dot in DEFENSIVE`, async () => {
      const dir = resolveForAttackingDirection("1H", start);
      await exportSnapshotPdf({
        events: [
          ev("TURNOVER_WON", "FOR", "1H", attackingEndNx(dir)),
          ev("TURNOVER_LOST", "FOR", "1H", defensiveEndNx(dir)),
        ],
        homeTeamName: HOME,
        awayTeamName: AWAY,
        sport: "gaelic",
        homeAttackingDirection: start,
        snapshotMode: "HALF_TIME_SNAPSHOT",
      });
      const ctx = captured.find((c) => c.ctx.title === "Turnover & Territory")!.ctx;
      expect(thirdLabelAt(ctx, ctx.markers.find((m) => m.fill === PURPLE)!.x)).toBe("ATTACKING THIRD");
      expect(thirdLabelAt(ctx, ctx.markers.find((m) => m.fill === ORANGE)!.x)).toBe("DEFENSIVE THIRD");
    });

    it(`recorded 1H direction ${start}: the same raw coordinate renders at the same x/y on 1H and 2H pages, while its third flips when ends switch`, () => {
      const first = render([ev("TURNOVER_WON", "FOR", "1H", 0.9, 0.3)], start, "1H");
      const second = render([ev("TURNOVER_WON", "FOR", "2H", 0.9, 0.3)], start, "2H");
      expect(second.markers[0].x).toBeCloseTo(first.markers[0].x, 6);
      expect(second.markers[0].y).toBeCloseTo(first.markers[0].y, 6);

      const firstThird = thirdLabelAt(first, first.markers[0].x);
      const secondThird = thirdLabelAt(second, second.markers[0].x);
      // nx 0.9 is the home team's attacking end in whichever half it attacks RIGHT.
      expect(firstThird).toBe(resolveForAttackingDirection("1H", start) === "RIGHT" ? "ATTACKING THIRD" : "DEFENSIVE THIRD");
      expect(secondThird).toBe(firstThird === "ATTACKING THIRD" ? "DEFENSIVE THIRD" : "ATTACKING THIRD");
      // Callout classification flips with it.
      const calloutPrefix = (t: string) => (t === "ATTACKING THIRD" ? "Attacking" : "Defensive");
      expect(panelTexts(first).some((t) => t.startsWith(calloutPrefix(firstThird)))).toBe(true);
      expect(panelTexts(second).some((t) => t.startsWith(calloutPrefix(secondThird)))).toBe(true);
    });
  }
});
