/**
 * watchLabelPopulation.test.ts — WATCH callout label-population regression.
 *
 * The Tactical Match Summary's WATCH panel used to print
 * "{team} turnover wins → shot: X% (n of d)" — wording that reads as "any
 * shot" but is actually bound to viewTurnoverWonToShotOnly(), the
 * shot-but-no-score population. This fixture deliberately mixes turnover
 * wins that ended in a miss (WIDE) with one that ended in a score (POINT),
 * so the numerator only makes sense once the label says "shot, no score" —
 * a label reading "any shot" would have to count the scored one too.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { makeHtTacticalSummaryPage } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { mkAdareEvent } from "./adare-mungret-fixture";
import { buildMatchReport } from "./matchReport";

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
  fillText(text: string) {
    this.texts.push(text);
  }
  stroke() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  quadraticCurveTo() {}
  closePath() {}
  fill() {}
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
  (globalThis as { document?: unknown }).document = {
    createElement(tag: string) {
      if (tag === "canvas") return new CaptureCanvas();
      return {};
    },
  };
}

// 3 FOR turnover wins: two end in a missed shot (WIDE), one ends in a score
// (POINT). The "any shot" population would be 3 of 3 (POINT also satisfies
// "a shot happened"); the actual shot-no-score population is 2 of 3.
function mixedTurnoverFixture(): PdfExportEvent[] {
  return [
    mkAdareEvent({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 100 }) as PdfExportEvent,
    mkAdareEvent({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: 110 }) as PdfExportEvent,
    mkAdareEvent({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 300 }) as PdfExportEvent,
    mkAdareEvent({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: 310 }) as PdfExportEvent,
    mkAdareEvent({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 500 }) as PdfExportEvent,
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", matchClockSeconds: 510 }) as PdfExportEvent,
  ];
}

describe("Tactical Match Summary WATCH label — matches the shot-no-score population it displays", () => {
  beforeEach(() => {
    installDomMocks();
  });

  it("reads 'shot, no score: 2 of 3', not 'shot: 3 of 3' (which would include the scored turnover)", () => {
    const events = mixedTurnoverFixture();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    expect(report.chain.turnovers.won).toBe(3);
    expect(report.turnovers.turnoverWonToShotOnly.num).toBe(2);
    expect(report.turnovers.turnoverWonToShotOnly.den).toBe(3);

    const canvas = makeHtTacticalSummaryPage(
      events, "gaelic", report, "Adare", "Mungret", 1, 7, "FT",
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    const watchLine = texts.find((t) => t.includes("turnover wins → shot, no score"));
    expect(watchLine).toBeDefined();
    expect(watchLine).toContain("Adare turnover wins → shot, no score:");
    expect(watchLine).toContain("(2 of 3)");

    // The old, ambiguous "any shot" wording must never come back.
    const ambiguousLine = texts.find((t) => /turnover wins → shot:/.test(t));
    expect(ambiguousLine).toBeUndefined();
  });
});
