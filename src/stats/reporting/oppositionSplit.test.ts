/**
 * oppositionSplit.test.ts
 *
 * Regression coverage for the Opposition Snapshot split:
 *   - Opposition Facts (Part 1/2) — match-fact + possession-fact only.
 *   - Opposition Origin & Chain Threat (Part 3) — chain-origin +
 *     interpretive, and never uses "Direct" language for origin rows.
 */

import { describe, expect, it } from "vitest";
import {
  buildOppositionFactsRows,
  buildOppositionOriginRows,
  makeOppositionFactsPage,
  makeOppositionOriginPage,
} from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { buildMatchReport } from "./matchReport";
import { buildGoldenReportingFixture, GOLDEN_TEAMS } from "./golden-fixture";
import {
  assertPartProvenance,
  containsDirectLanguage,
} from "./reportProvenance";

class CaptureCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  font = "";
  lineWidth = 1;
  textBaseline = "alphabetic";
  textAlign = "left";
  globalAlpha = 1;
  texts: string[] = [];

  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText(text: string) { this.texts.push(text); }
  stroke() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  quadraticCurveTo() {}
  closePath() {}
  fill() {}
  measureText(text: string) { return { width: text.length * 8 }; }
  setLineDash() {}
  clip() {}
  rect() {}
  roundRect() {}
  drawImage() {}
  createLinearGradient() { return { addColorStop() {} }; }
}

class CaptureCanvas {
  width = 1920;
  height = 1080;
  readonly ctx = new CaptureCanvasContext();
  getContext() { return this.ctx as unknown as CanvasRenderingContext2D; }
  toDataURL() { return "data:image/jpeg;base64,AAAA"; }
}

function installDomMocks(): void {
  (globalThis as { document?: unknown }).document = {
    createElement(tag: string) {
      if (tag === "canvas") return new CaptureCanvas();
      return {};
    },
  };
}

describe("Opposition Facts (Part 1/2) — provenance", () => {
  it("row label list is match-fact + possession-fact only", () => {
    const rows = buildOppositionFactsRows();
    expect(() => assertPartProvenance("POSSESSION_FACTS", rows)).not.toThrow();
  });

  it("row labels never mention chain, origin, or momentum", () => {
    const rows = buildOppositionFactsRows();
    for (const row of rows) {
      const l = row.label.toLowerCase();
      expect(l).not.toContain("chain");
      expect(l).not.toContain("origin");
      expect(l).not.toContain("momentum");
    }
  });

  it("rendered page never prints chain-rate, momentum, or watchlist content", () => {
    installDomMocks();
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const canvas = makeOppositionFactsPage(events, report, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, 1, 7) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts).toContain("Opposition Facts");
    expect(texts.some((t) => t.includes("CHAIN RATE"))).toBe(false);
    expect(texts.some((t) => t.includes("MOMENTUM SPELL"))).toBe(false);
    expect(texts.some((t) => t.includes("REMATCH WATCHLIST"))).toBe(false);
    expect(texts.some((t) => t.toLowerCase().includes("origin"))).toBe(false);
  });
});

describe("Opposition Origin & Chain Threat (Part 3) — provenance", () => {
  it("row label list is chain-origin + interpretive only", () => {
    const rows = buildOppositionOriginRows();
    expect(() => assertPartProvenance("GAME_ORIGIN", rows)).not.toThrow();
  });

  it("no origin row label uses 'Direct' language", () => {
    const rows = buildOppositionOriginRows();
    for (const row of rows) {
      if (row.provenance === "chain-origin") {
        expect(containsDirectLanguage(row.label)).toBe(false);
      }
    }
  });

  it("rendered page never prints 'Direct' anywhere in its text output", () => {
    installDomMocks();
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const canvas = makeOppositionOriginPage(events, report, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, 1, 7) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts).toContain("Opposition Origin & Chain Threat");
    const directHits = texts.filter((t) => containsDirectLanguage(t));
    expect(directHits).toEqual([]);
  });

  it("rendered page prints restart-origin and turnover-origin labels", () => {
    installDomMocks();
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const canvas = makeOppositionOriginPage(events, report, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, 1, 7) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts.some((t) => t.includes("Restart-origin scores"))).toBe(true);
    expect(texts.some((t) => t.includes("Turnover-origin scores"))).toBe(true);
  });
});
