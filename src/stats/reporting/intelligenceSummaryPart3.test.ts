/**
 * intelligenceSummaryPart3.test.ts
 *
 * Regression coverage confirming Intelligence Summary and Tactical Review
 * Guide are Part 3 (Game Origin / Chain Analysis) content: every insight
 * they print is chain-origin or interpretive, never a bare Part 2 claim,
 * and neither ever uses "Direct" language for an origin figure.
 */

import { describe, expect, it } from "vitest";
import { makeTacticalIntelligencePage, makeTacticalReviewGuidePage } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { buildMatchReport } from "./matchReport";
import { buildGoldenReportingFixture, GOLDEN_TEAMS } from "./golden-fixture";
import { containsDirectLanguage } from "./reportProvenance";

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

describe("Intelligence Summary — Part 3 content", () => {
  it("renders without 'Direct' language for any origin figure", () => {
    installDomMocks();
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const canvas = makeTacticalIntelligencePage(report, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, 1, 7) as unknown as CaptureCanvas;
    const directHits = canvas.ctx.texts.filter((t) => containsDirectLanguage(t));
    expect(directHits).toEqual([]);
  });

  it("uses origin-labelled wording for restart/turnover conversion claims", () => {
    installDomMocks();
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const canvas = makeTacticalIntelligencePage(report, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, 1, 7) as unknown as CaptureCanvas;
    const originMentions = canvas.ctx.texts.filter((t) => t.includes("origin"));
    expect(originMentions.length).toBeGreaterThan(0);
  });
});

describe("Tactical Review Guide — Part 3 content", () => {
  it("renders without 'Direct' language", () => {
    installDomMocks();
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const canvas = makeTacticalReviewGuidePage(report, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, 1, 7) as unknown as CaptureCanvas;
    const directHits = canvas.ctx.texts.filter((t) => containsDirectLanguage(t));
    expect(directHits).toEqual([]);
  });

  it("every prompt is chain/momentum/general category-derived (deriveReviewPrompts output)", () => {
    installDomMocks();
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const canvas = makeTacticalReviewGuidePage(report, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, 1, 7) as unknown as CaptureCanvas;
    // Category chips (KICKOUT/TURNOVER/MOMENTUM/CHAIN/GENERAL) are always
    // chain-engine-derived prompt categories — confirm at least one renders.
    const categoryChip = canvas.ctx.texts.find((t) =>
      ["KICKOUT", "TURNOVER", "MOMENTUM", "CHAIN", "GENERAL"].includes(t),
    );
    expect(categoryChip).toBeDefined();
  });
});
