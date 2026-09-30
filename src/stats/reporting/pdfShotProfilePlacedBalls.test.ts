/**
 * pdfShotProfilePlacedBalls.test.ts — Our Shot Profile placed-ball callout.
 *
 * Regression for the Ballylanders v Galbally FT Snapshot: the Dashboard
 * reported 5/5 placed balls scored (3 frees + 1 45 + 1 penalty) but Our
 * Shot Profile said "Ballylanders: 3 placed-ball scores", because the card
 * counted frees only. "Placed ball" means free + 45/65 + penalty (+ mark),
 * the canonical ledger classification in placedBallMetrics.ts, and the card
 * must report the same figure as the Dashboard. Opposition Shot Profile
 * had the identical frees-only count and uses the same fix.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { makeOppShotProfilePage, makeOurShotProfilePage } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { mkAdareEvent } from "./adare-mungret-fixture";
import { buildMatchReport } from "./matchReport";
import { buildSnapshotDashboardModel } from "./snapshotDashboardModel";

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

const HOME = "Ballylanders";
const AWAY = "Galbally";

function placedLine(events: PdfExportEvent[], scope: "1H" | "FULL" = "FULL"): string | undefined {
  const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY, scope });
  const scoped = report.events;
  const canvas = makeOurShotProfilePage(
    scoped, report, "gaelic", HOME, AWAY, 2, 7, "RIGHT",
  ) as unknown as CaptureCanvas;
  return canvas.ctx.texts.find((t) => t.includes("placed-ball"));
}

// Ballylanders' placed balls in the test match: 3 frees + 1 45 + 1 penalty, all scored.
function ballylandersPlacedFixture(): PdfExportEvent[] {
  return [
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["FREE"] }),
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["FREE"] }),
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["FREE"], period: "2H" }),
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["45"], period: "2H" }),
    mkAdareEvent({ kind: "GOAL", teamSide: "FOR", tags: ["PENALTY"], period: "2H" }),
    // Open-play scores and wide — never placed balls.
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["PLAY"] }),
    mkAdareEvent({ kind: "GOAL", teamSide: "FOR", tags: ["PLAY"], period: "2H" }),
    mkAdareEvent({ kind: "WIDE", teamSide: "FOR", tags: ["PLAY"] }),
    // Opposition placed balls — must never count towards Ballylanders.
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: ["FREE"] }),
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: ["45"] }),
    mkAdareEvent({ kind: "WIDE", teamSide: "OPP", tags: ["FREE"] }),
  ] as PdfExportEvent[];
}

describe("Our Shot Profile — placed-ball callout uses free + 45/65 + penalty", () => {
  beforeEach(() => {
    (globalThis as { document?: unknown }).document = {
      createElement(tag: string) {
        return tag === "canvas" ? new CaptureCanvas() : {};
      },
    };
  });

  it("FT: reports 5 placed-ball scores (3 frees + 1 45 + 1 penalty), not frees only", () => {
    expect(placedLine(ballylandersPlacedFixture())).toBe("Ballylanders: 5 placed-ball scores");
  });

  it("agrees with the Snapshot Dashboard's placed-ball figure", () => {
    const events = ballylandersPlacedFixture();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY });
    const dashboard = buildSnapshotDashboardModel(report, "FT");
    expect(dashboard.us.placed).toEqual({ scores: 5, attempts: 5 });
    expect(placedLine(events)).toBe(`Ballylanders: ${dashboard.us.placed.scores} placed-ball scores`);
  });

  it("counts each placed-ball type on its own (45, penalty, free)", () => {
    expect(placedLine([mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["45"] })] as PdfExportEvent[]))
      .toBe("Ballylanders: 1 placed-ball score");
    expect(placedLine([mkAdareEvent({ kind: "GOAL", teamSide: "FOR", tags: ["PENALTY"] })] as PdfExportEvent[]))
      .toBe("Ballylanders: 1 placed-ball score");
    expect(placedLine([mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["FREE"] })] as PdfExportEvent[]))
      .toBe("Ballylanders: 1 placed-ball score");
  });

  it("placed-ball wides include missed 45s and penalties, not just missed frees", () => {
    const events = [
      mkAdareEvent({ kind: "WIDE", teamSide: "FOR", tags: ["FREE"] }),
      mkAdareEvent({ kind: "WIDE", teamSide: "FOR", tags: ["45"] }),
      mkAdareEvent({ kind: "WIDE", teamSide: "FOR", tags: ["PENALTY"] }),
      mkAdareEvent({ kind: "WIDE", teamSide: "FOR", tags: ["PLAY"] }),
    ] as PdfExportEvent[];
    expect(placedLine(events)).toBe("Ballylanders: 3 placed-ball wides");
  });

  it("HT: counts only first-half placed balls", () => {
    expect(placedLine(ballylandersPlacedFixture(), "1H")).toBe("Ballylanders: 2 placed-ball scores");
  });

  it("no placed balls for Ballylanders → no placed-ball callout, even when the opposition has some", () => {
    const events = [
      mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["PLAY"] }),
      mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: ["FREE"] }),
    ] as PdfExportEvent[];
    expect(placedLine(events)).toBeUndefined();
  });
});

function oppPlacedLine(events: PdfExportEvent[], scope: "1H" | "FULL" = "FULL"): string | undefined {
  const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY, scope });
  const canvas = makeOppShotProfilePage(
    report.events, report, "gaelic", HOME, AWAY, 3, 7, "RIGHT",
  ) as unknown as CaptureCanvas;
  return canvas.ctx.texts.find((t) => t.includes("placed-ball"));
}

// Galbally placed balls: free + 45 + penalty + mark scored (one of each,
// the free in 1H), plus a missed free, 45, penalty and mark.
function galballyPlacedFixture(): PdfExportEvent[] {
  return [
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: ["FREE"] }),
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: ["45"], period: "2H" }),
    mkAdareEvent({ kind: "GOAL", teamSide: "OPP", tags: ["PENALTY"], period: "2H" }),
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: ["MARK"], period: "2H" }),
    mkAdareEvent({ kind: "WIDE", teamSide: "OPP", tags: ["FREE"] }),
    mkAdareEvent({ kind: "WIDE", teamSide: "OPP", tags: ["45"], period: "2H" }),
    mkAdareEvent({ kind: "WIDE", teamSide: "OPP", tags: ["PENALTY"], period: "2H" }),
    mkAdareEvent({ kind: "WIDE", teamSide: "OPP", tags: ["MARK"], period: "2H" }),
    // Open play — never placed balls.
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: ["PLAY"] }),
    mkAdareEvent({ kind: "WIDE", teamSide: "OPP", tags: ["PLAY"], period: "2H" }),
    // Ballylanders placed balls — must never count towards Galbally.
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["FREE"] }),
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", tags: ["45"], period: "2H" }),
    mkAdareEvent({ kind: "GOAL", teamSide: "FOR", tags: ["PENALTY"], period: "2H" }),
    mkAdareEvent({ kind: "WIDE", teamSide: "FOR", tags: ["MARK"], period: "2H" }),
  ] as PdfExportEvent[];
}

describe("Opposition Shot Profile — placed-ball callout uses free + 45/65 + penalty + mark", () => {
  beforeEach(() => {
    (globalThis as { document?: unknown }).document = {
      createElement(tag: string) {
        return tag === "canvas" ? new CaptureCanvas() : {};
      },
    };
  });

  it("FT: counts opposition free, 45, penalty and mark scores and misses", () => {
    expect(oppPlacedLine(galballyPlacedFixture())).toBe("Galbally: 4 placed-ball scores · 4 placed-ball wides");
  });

  it("agrees with the Snapshot Dashboard's opposition placed-ball figure", () => {
    const events = galballyPlacedFixture();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY });
    const dashboard = buildSnapshotDashboardModel(report, "FT");
    expect(dashboard.them.placed).toEqual({ scores: 4, attempts: 8 });
    expect(oppPlacedLine(events)).toBe(`Galbally: ${dashboard.them.placed.scores} placed-ball scores · 4 placed-ball wides`);
  });

  it("counts each opposition placed-ball type on its own (45, penalty, mark)", () => {
    for (const tag of ["45", "PENALTY", "MARK"]) {
      expect(oppPlacedLine([mkAdareEvent({ kind: "POINT", teamSide: "OPP", tags: [tag] })] as PdfExportEvent[]))
        .toBe("Galbally: 1 placed-ball score");
      expect(oppPlacedLine([mkAdareEvent({ kind: "WIDE", teamSide: "OPP", tags: [tag] })] as PdfExportEvent[]))
        .toBe("Galbally: 1 placed-ball wide");
    }
  });

  it("Ballylanders placed balls never count towards Galbally", () => {
    const events = galballyPlacedFixture().filter((e) => e.teamSide === "FOR");
    expect(oppPlacedLine(events)).toBeUndefined();
  });

  it("HT: counts only first-half opposition placed balls", () => {
    expect(oppPlacedLine(galballyPlacedFixture(), "1H")).toBe("Galbally: 1 placed-ball score · 1 placed-ball wide");
  });
});
