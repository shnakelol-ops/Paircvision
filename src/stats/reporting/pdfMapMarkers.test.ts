/**
 * pdfMapMarkers.test.ts — Turnover & Territory renderer regression tests.
 *
 * Exercises makeTurnoverTerritoryPage (HT/FT snapshot path) with a capturing
 * canvas context and asserts purple (#a78bfa) / orange (#f97316) marker fills.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { PdfExportEvent } from "../reviewPdfExport";
import { makeTurnoverTerritoryPage } from "../reviewPdfExport";
import { buildMatchReport } from "./matchReport";
import {
  ADARE_MUNGRET_TEAMS,
  buildAdareMungretFixture,
  mkAdareEvent,
} from "./adare-mungret-fixture";
import {
  GOLDEN_TEAMS,
  buildGoldenReportingFixture,
} from "./golden-fixture";

const PURPLE = "#a78bfa";
const ORANGE = "#f97316";

class CaptureCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  font = "";
  lineWidth = 1;
  textBaseline = "alphabetic";
  textAlign = "left";
  globalAlpha = 1;
  markerFills: string[] = [];
  private pendingArc = false;

  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText() {}
  stroke() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arc() { this.pendingArc = true; }
  ellipse() {}
  quadraticCurveTo() {}
  closePath() {}
  fill() {
    if (this.pendingArc && (this.fillStyle === PURPLE || this.fillStyle === ORANGE)) {
      this.markerFills.push(this.fillStyle);
    }
    this.pendingArc = false;
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

function installDomMocks(): void {
  class MockPath2D {
    constructor(_d?: string) {}
  }
  (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === "canvas") return new CaptureCanvas();
      return {};
    },
  };
}

function spreadCoords(
  count: number,
  kind: "TURNOVER_WON" | "TURNOVER_LOST",
  teamSide: "FOR" | "OPP",
  period: "1H" | "2H",
  startNx: number,
  startNy: number,
): PdfExportEvent[] {
  const out: PdfExportEvent[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      mkAdareEvent({
        kind,
        teamSide,
        period,
        nx: startNx + i * 0.05,
        ny: startNy + (i % 2) * 0.08,
      }) as PdfExportEvent,
    );
  }
  return out;
}

function renderTerritoryMarkerFills(events: readonly PdfExportEvent[]): string[] {
  const report = buildMatchReport({
    events,
    homeTeam: ADARE_MUNGRET_TEAMS.home,
    awayTeam: ADARE_MUNGRET_TEAMS.away,
    scope: "FULL",
  });
  const canvas = makeTurnoverTerritoryPage(
    events,
    report,
    "gaelic",
    ADARE_MUNGRET_TEAMS.home,
    ADARE_MUNGRET_TEAMS.away,
    7,
    14,
  );
  const ctx = (canvas as unknown as CaptureCanvas).ctx;
  return ctx.markerFills;
}

function countColors(fills: readonly string[]) {
  return {
    purple: fills.filter((c) => c === PURPLE).length,
    orange: fills.filter((c) => c === ORANGE).length,
  };
}

beforeEach(() => {
  installDomMocks();
});

describe("makeTurnoverTerritoryPage — renderer colour proof", () => {
  it("Adare FT (TURNOVER_LOST logging): draws 10 purple + 6 orange markers", () => {
    const events = buildAdareMungretFixture() as PdfExportEvent[];
    const fills = renderTerritoryMarkerFills(events);
    const { purple, orange } = countColors(fills);

    expect(purple).toBe(10);
    expect(orange).toBe(6);
    expect(purple + orange).toBe(16);
  });

  it("Adare FT (mirror TURNOVER_WON/OPP losses): draws 10 purple + 6 orange markers", () => {
    const events = [
      ...spreadCoords(10, "TURNOVER_WON", "FOR", "1H", 0.1, 0.25),
      ...spreadCoords(5, "TURNOVER_WON", "OPP", "1H", 0.1, 0.65),
      ...spreadCoords(1, "TURNOVER_WON", "OPP", "2H", 0.5, 0.65),
    ] as PdfExportEvent[];

    const fills = renderTerritoryMarkerFills(events);
    const { purple, orange } = countColors(fills);

    expect(purple).toBe(10);
    expect(orange).toBe(6);
  });

  it("Adare HT (7 won · 1 lost): draws 7 purple + 1 orange marker", () => {
    const events = [
      ...spreadCoords(7, "TURNOVER_WON", "FOR", "1H", 0.12, 0.3),
      ...spreadCoords(1, "TURNOVER_LOST", "FOR", "1H", 0.7, 0.6),
    ] as PdfExportEvent[];

    const fills = renderTerritoryMarkerFills(events);
    const { purple, orange } = countColors(fills);

    expect(purple).toBe(7);
    expect(orange).toBe(1);
  });

  it("Ballylanders 5 · 5: draws 5 purple + 5 orange markers", () => {
    const events = [
      ...spreadCoords(5, "TURNOVER_WON", "FOR", "1H", 0.15, 0.25),
      ...spreadCoords(5, "TURNOVER_LOST", "FOR", "1H", 0.15, 0.65),
    ] as PdfExportEvent[];

    const fills = renderTerritoryMarkerFills(events);
    const { purple, orange } = countColors(fills);

    expect(purple).toBe(5);
    expect(orange).toBe(5);
  });

  it("Ballylanders golden fixture: draws 7 purple + 5 orange markers", () => {
    const events = buildGoldenReportingFixture() as PdfExportEvent[];
    const report = buildMatchReport({
      events,
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });
    const canvas = makeTurnoverTerritoryPage(
      events,
      report,
      "gaelic",
      GOLDEN_TEAMS.home,
      GOLDEN_TEAMS.away,
      7,
      14,
    );
    const ctx = (canvas as unknown as CaptureCanvas).ctx;
    const { purple, orange } = countColors(ctx.markerFills);

    expect(purple).toBe(7);
    expect(orange).toBe(5);
  });
});
