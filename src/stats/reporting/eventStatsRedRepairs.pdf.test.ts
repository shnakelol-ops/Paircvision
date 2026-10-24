/**
 * eventStatsRedRepairs.pdf.test.ts
 *
 * PDF-layer regressions for the Event Stats RED audit (F-01, F-04, F-05,
 * F-06). The core definitions are tested in eventStatsRedRepairs.test.ts;
 * these assert the Full Review pages print exactly those definitions and
 * keep no page-local variant of their own.
 *
 * Events are built through the real Event Stats capture adapter and pass
 * through the same report-input steps as the export (toEventStatsReportEvents
 * → normalizeEventsForReporting → buildMatchReport).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { adaptProTaggerAction, type ProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { toEventStatsReportEvents } from "../../pro-tagger/pro-tagger-review-adapter";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import {
  makeKickoutChainPage,
  makeRestartVisualPage,
  makeShotEfficiencyPage,
  makeSummaryPage,
  type PdfExportEvent,
} from "../reviewPdfExport";
import { isOwnRestartRetained } from "../restarts/restartMetrics";
import { isBlockedOrSavedAttempt, normalizeEventsForReporting } from "./eventTagClassification";
import { buildMatchReport } from "./matchReport";
import { buildTeamSummaryBlock } from "./teamStatsViews";

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
  bezierCurveTo() {}
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
  translate() {}
  rotate() {}
  scale() {}
  setTransform() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
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

const HOME = "Ballyboden";
const AWAY = "Na Fianna";

let clock = 0;
function tap(a: Partial<ProTaggerAction> & Pick<ProTaggerAction, "familyId" | "tileLabel" | "teamSide">): LoggedMatchEvent {
  clock += 10;
  return adaptProTaggerAction({ nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: clock, ...a });
}

/**
 * Ballyboden take 7 kickouts: keep 4 (2 Clean, 1 Break, 1 Foul) and lose
 * 3 (2 Clean, 1 Break). They also win 3 of Na Fianna's kickouts cleanly.
 * Shots: 2 Block/Save, 1 Short, 1 Post, 1 wide.
 */
function fixture(): LoggedMatchEvent[] {
  clock = 0;
  const own = (tileLabel: string, kept: boolean) =>
    tap({ familyId: "RESTART", tileLabel, teamSide: kept ? "FOR" : "OPP", restartOwner: "FOR" });
  return [
    own("Clean", true), own("Clean", true), own("Break", true), own("Foul", true),
    own("Clean", false), own("Clean", false), own("Break", false),
    tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "OPP" }),
    tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "OPP" }),
    tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "OPP" }),
    tap({ familyId: "SHOT", tileLabel: "Block/Save", teamSide: "FOR" }),
    tap({ familyId: "SHOT", tileLabel: "Block/Save", teamSide: "FOR" }),
    tap({ familyId: "SHOT", tileLabel: "Short", teamSide: "FOR" }),
    tap({ familyId: "SHOT", tileLabel: "Post", teamSide: "FOR" }),
    tap({ familyId: "WIDE", tileLabel: "Play", teamSide: "FOR" }),
  ];
}

/** The export's own input steps: report-time owner state, then tag translation. */
function pdfInput(stored: readonly LoggedMatchEvent[]) {
  const events = normalizeEventsForReporting(toEventStatsReportEvents(stored)) as readonly PdfExportEvent[];
  const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY });
  return { events: report.events, report };
}

const texts = (c: HTMLCanvasElement) => (c as unknown as CaptureCanvas).ctx.texts;

/** Value drawn right after the n-th occurrence of `label`. */
function after(t: readonly string[], label: string, nth = 0): string | undefined {
  let seen = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === label && ++seen === nth) return t.slice(i + 1).find((v) => /^\d+$/.test(v));
  }
  return undefined;
}

describe("Full Review PDF prints the core definitions (F-01 / F-04 / F-05 / F-06)", () => {
  beforeEach(() => {
    (globalThis as { document?: unknown }).document = {
      createElement(tag: string) {
        return tag === "canvas" ? new CaptureCanvas() : {};
      },
    };
  });

  it("F-05 Restart Analysis: HOW WON counts own kickouts retained only, by method", () => {
    const { events, report } = pdfInput(fixture());
    const kept = events.filter((e) => isOwnRestartRetained(e, "FOR"));
    expect(kept).toHaveLength(4);
    const t = texts(makeRestartVisualPage(events, "gaelic", report, HOME, AWAY, 1, 1));
    expect(t).toContain("HOW WON — OWN KICKOUTS RETAINED (4)");
    expect(after(t, "Clean Won")).toBe("2"); // not 4 (2 lost), not 5 (3 of theirs won)
    expect(after(t, "Break Won")).toBe("1");
    expect(after(t, "Foul Won")).toBe("1"); // F-01: Event Stats "FOUL" counted
  });

  it("F-05 Restart Chain Analysis: same own-retained population as Restart Analysis", () => {
    const { report } = pdfInput(fixture());
    const t = texts(makeKickoutChainPage(report, HOME, AWAY, 1, 1));
    expect(after(t, "Clean Won", 0)).toBe("2");
    expect(after(t, "Break Won", 0)).toBe("1");
    expect(after(t, "Foul Won", 0)).toBe("1");
  });

  it("F-05 Match Summary 'Clean Won' is the Restart Share population and never counts a lost restart", () => {
    const { report } = pdfInput(fixture());
    const home = buildTeamSummaryBlock(report, "FOR");
    expect(home.koCleanWon).toBe(5); // 2 own kept + 3 of Na Fianna's won
    expect(home.koCleanLost).toBe(2);
    expect(home.koFoulWon).toBe(1);
  });

  it("F-05 labels: Match Summary names the Restart Share population; own panels keep 'Clean Won'", () => {
    const { events, report } = pdfInput(fixture());
    const home = buildTeamSummaryBlock(report, "FOR");
    const summary = texts(makeSummaryPage(events, report, HOME, AWAY, undefined, 1));
    // Two values per row (one per team): Ballyboden's comes first.
    expect(after(summary, "Restart Share — Clean Won")).toBe(String(home.koCleanWon));
    expect(after(summary, "Restart Share — Break Won")).toBe(String(home.koBreakWon));
    expect(after(summary, "Restart Share — Foul Won")).toBe(String(home.koFoulWon));
    expect(after(summary, "Restart Share — Clean Lost")).toBe(String(home.koCleanLost));
    for (const ambiguous of ["Clean Won", "Break Won", "Foul Won", "Clean Lost", "Break Lost", "Foul Conceded"]) {
      expect(summary).not.toContain(ambiguous);
    }
    // The own-kickout panel keeps the short label for the own-retained population.
    const chain = texts(makeKickoutChainPage(report, HOME, AWAY, 1, 1));
    expect(after(chain, "Clean Won", 0)).toBe("2");
  });

  it("F-04 Restart Chain Analysis: owner not recorded → 'Restart taker not recorded', no own counts", () => {
    const legacy = fixture().map(({ restartOwner: _drop, ...e }) => e as LoggedMatchEvent);
    const { report } = pdfInput(legacy);
    const t = texts(makeKickoutChainPage(report, HOME, AWAY, 1, 1));
    expect(t.filter((x) => x === "Restart taker not recorded")).toHaveLength(2);
    expect(t).not.toContain("Clean Won");
    expect(t.some((x) => /^No kickouts recorded$/.test(x))).toBe(false);
  });

  it("F-04 Restart Analysis: owner not recorded → no own kickouts retained", () => {
    const legacy = fixture().map(({ restartOwner: _drop, ...e }) => e as LoggedMatchEvent);
    const { events, report } = pdfInput(legacy);
    const t = texts(makeRestartVisualPage(events, "gaelic", report, HOME, AWAY, 1, 1));
    expect(t).toContain("HOW WON — OWN KICKOUTS RETAINED (0)");
  });

  it("F-06 Shot Efficiency 'Blocked / Saved' equals the Match Summary 'Block / Save'", () => {
    const { events, report } = pdfInput(fixture());
    const expected = events.filter((e) => e.teamSide === "FOR" && isBlockedOrSavedAttempt(e)).length;
    expect(expected).toBe(2);
    expect(buildTeamSummaryBlock(report, "FOR").shotBlock).toBe(expected);
    const t = texts(makeShotEfficiencyPage(events, report, HOME, AWAY, 1, 1));
    expect(after(t, "Blocked / Saved", 0)).toBe(String(expected)); // Short and Post excluded
  });
});
