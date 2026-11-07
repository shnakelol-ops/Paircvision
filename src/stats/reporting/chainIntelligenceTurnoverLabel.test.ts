/**
 * chainIntelligenceTurnoverLabel.test.ts
 *
 * Release audit R-1: Full Review → Chain Intelligence → Turnover Chains prints
 * turnoverWonToShotOnly — turnovers won that led to a shot WITHOUT a score —
 * so its label must say so ("Won → Shot, no score"), not "Won → Shot".
 * The value and its definition are unchanged.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adaptProTaggerAction, type ProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { toEventStatsReportEvents } from "../../pro-tagger/pro-tagger-review-adapter";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { normalizeEventsForReporting } from "./eventTagClassification";
import { buildMatchReport } from "./matchReport";
import { viewTurnoverWonToShotOnly, viewTurnoverWinsToScore } from "./reportViews";
import { makeChainSummaryPage, type PdfExportEvent } from "../reviewPdfExport";

class CaptureCanvasContext {
  fillStyle = ""; strokeStyle = ""; font = ""; lineWidth = 1;
  textBaseline = "alphabetic"; textAlign = "left"; globalAlpha = 1;
  texts: string[] = [];
  save() {} restore() {} fillRect() {} strokeRect() {}
  fillText(text: string) { this.texts.push(text); }
  stroke() {} beginPath() {} moveTo() {} lineTo() {} arc() {} ellipse() {}
  quadraticCurveTo() {} bezierCurveTo() {} closePath() {} fill() {}
  measureText(text: string) { return { width: text.length * 8 }; }
  setLineDash() {} clip() {} rect() {} roundRect() {} drawImage() {}
  translate() {} rotate() {} scale() {} setTransform() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
}
class CaptureCanvas {
  width = 1920; height = 1080;
  readonly ctx = new CaptureCanvasContext();
  getContext() { return this.ctx as unknown as CanvasRenderingContext2D; }
  toDataURL() { return "data:image/jpeg;base64,AAAA"; }
}
beforeEach(() => {
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === "canvas" ? new CaptureCanvas() : {}),
  };
});

const HOME = "Ballyboden";
const AWAY = "Na Fianna";
const tap = (clock: number, a: Partial<ProTaggerAction> & Pick<ProTaggerAction, "familyId" | "tileLabel" | "teamSide">): LoggedMatchEvent =>
  adaptProTaggerAction({ nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: clock, ...a });
const texts = (c: HTMLCanvasElement) => (c as unknown as CaptureCanvas).ctx.texts;
const after = (t: readonly string[], label: string) => t.find((_, i) => i > 0 && t[i - 1] === label);

describe("Chain Intelligence — turnovers won that led to a shot but no score", () => {
  // Ballyboden win 3 turnovers: one → point (scored), one → wide (shot, no
  // score), one → lost again with no shot.
  const stored = [
    tap(100, { familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }),
    tap(115, { familyId: "POINT", tileLabel: "Play", teamSide: "FOR" }),
    tap(300, { familyId: "TURNOVER", tileLabel: "Interception", teamSide: "FOR" }),
    tap(315, { familyId: "WIDE", tileLabel: "Play", teamSide: "FOR" }),
    tap(500, { familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }),
    tap(520, { familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" }),
  ];
  const events = normalizeEventsForReporting(toEventStatsReportEvents(stored)) as readonly PdfExportEvent[];
  const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY });

  it("the value is turnovers won → shot without a score (unchanged definition)", () => {
    expect(viewTurnoverWonToShotOnly(report)).toMatchObject({ num: 1, den: 3 });
    expect(viewTurnoverWinsToScore(report)).toMatchObject({ num: 1, den: 3 });
  });

  it('is labelled "Won → Shot, no score", never the misleading "Won → Shot"', () => {
    const page = texts(makeChainSummaryPage(report, HOME, AWAY, 1, 1));
    const t = page.slice(page.indexOf("TURNOVER CHAINS")); // the Turnover Chains panel
    expect(t.length).toBeGreaterThan(1);
    expect(after(t, "Won → Shot, no score")).toBe("1 (33%)");
    expect(after(t, "Won → Origin score")).toBe("1 (33%)");
    expect(page).not.toContain("Won → Shot");
    // The rule-match row counts every shot after a turnover won (scored or not): 2.
    expect(after(page, "Turnover Won → Shot")).toBe("2");
  });
});
