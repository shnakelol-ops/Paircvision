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
import { exportSnapshotPdf, makeTurnoverTerritoryPage } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { mkAdareEvent } from "./adare-mungret-fixture";

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
  texts: Array<{ text: string; font: string }> = [];
  private pendingArc: { x: number; y: number } | null = null;

  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText(text: string) {
    this.texts.push({ text, font: this.font });
  }
  stroke() {}
  beginPath() {}
  moveTo() {}
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

/** Marker positions back in 0..1 display space (home always attacking →). */
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

describe("Turnover & Territory — direction normalisation (Defensive → Middle → Attacking)", () => {
  it("HT, home attacking RIGHT: plotted as recorded", () => {
    const ctx = render([ev("TURNOVER_WON", "FOR", "1H", 0.2, 0.3)], "RIGHT");
    expect(displayPositions(ctx)).toEqual([{ fill: PURPLE, nx: 0.2, ny: 0.3 }]);
  });

  it("HT, home attacking LEFT: rotated so the home team reads left → right", () => {
    const ctx = render([ev("TURNOVER_WON", "FOR", "1H", 0.2, 0.3)], "LEFT");
    expect(displayPositions(ctx)).toEqual([{ fill: PURPLE, nx: 0.8, ny: 0.7 }]);
  });

  it("2H: ends swap, so a 2H event is rotated when the home team attacked RIGHT in 1H", () => {
    const ctx = render([ev("TURNOVER_WON", "FOR", "2H", 0.2, 0.3)], "RIGHT", "2H");
    expect(displayPositions(ctx)).toEqual([{ fill: PURPLE, nx: 0.8, ny: 0.7 }]);
    const ctxLeft = render([ev("TURNOVER_WON", "FOR", "2H", 0.2, 0.3)], "LEFT", "2H");
    expect(displayPositions(ctxLeft)).toEqual([{ fill: PURPLE, nx: 0.2, ny: 0.3 }]);
  });

  it("a turnover won deep in the home team's attacking end plots on the right and the callout names an Attacking zone — in every half/direction", () => {
    // Physically the home team's attacking end for each (period, direction).
    const cases: Array<{ period: "1H" | "2H"; dir: "LEFT" | "RIGHT"; nx: number }> = [
      { period: "1H", dir: "RIGHT", nx: 0.9 },
      { period: "1H", dir: "LEFT", nx: 0.1 },
      { period: "2H", dir: "RIGHT", nx: 0.1 },
      { period: "2H", dir: "LEFT", nx: 0.9 },
    ];
    for (const { period, dir, nx } of cases) {
      const ctx = render([ev("TURNOVER_WON", "FOR", period, nx)], dir, period);
      const [pos] = displayPositions(ctx);
      expect(pos.nx).toBeGreaterThan(2 / 3);
      expect(panelTexts(ctx).some((t) => t.startsWith("Attacking"))).toBe(true);
    }
  });

  it("dots and 'Most Turnovers Lost' callout agree for a defensive-third loss in 2H", () => {
    // 1H RIGHT → 2H home attacks LEFT, so its defensive end is physically the right (nx 0.9).
    const ctx = render([ev("TURNOVER_LOST", "FOR", "2H", 0.9)], "RIGHT", "2H");
    const [pos] = displayPositions(ctx);
    expect(pos.fill).toBe(ORANGE);
    expect(pos.nx).toBeLessThan(1 / 3);
    expect(panelTexts(ctx).some((t) => t.startsWith("Defensive"))).toBe(true);
  });

  it("opposition-logged turnovers are orange (home lost) and normalised the same way", () => {
    // OPP TURNOVER_WON = home lost (the page's existing lost definition).
    const ctx = render([ev("TURNOVER_WON", "OPP", "1H", 0.2, 0.3)], "LEFT");
    expect(displayPositions(ctx)).toEqual([{ fill: ORANGE, nx: 0.8, ny: 0.7 }]);
    const ctx2H = render([ev("TURNOVER_WON", "OPP", "2H", 0.2, 0.3)], "RIGHT", "2H");
    expect(displayPositions(ctx2H)).toEqual([{ fill: ORANGE, nx: 0.8, ny: 0.7 }]);
  });

  it("header names the home team's direction; HT keeps the unsuffixed title", () => {
    const ctx = render([], "LEFT");
    expect(ctx.title).toBe("Turnover & Territory");
    expect(panelTexts(ctx)).toContain(
      "Ballylanders v Galbally · Ballylanders attacking → · Defensive → Middle → Attacking",
    );
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
