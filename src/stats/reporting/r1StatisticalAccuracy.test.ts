/**
 * r1StatisticalAccuracy.test.ts
 *
 * R1 statistical-accuracy repairs (Event Stats stabilisation):
 *   F-11  "Avg secs to score (won)" uses the intended team's restarts only
 *   F-10  45 / 65 row counts Event Stats' 45 / 65 records (football / hurling)
 *   Runs  scoring runs are counted in scoring events, labelled "scores"
 *   Opp.  Opposition Origin restart rows — what each measures
 *   101%  exhaustive two-way splits always total 100%
 *
 * Events are built through the real Event Stats capture adapter. Expected
 * values are worked out by hand in each test.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { adaptProTaggerAction, type ProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { toEventStatsReportEvents } from "../../pro-tagger/pro-tagger-review-adapter";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import type { PitchSport } from "../../core/pitch/pitch-config";
import type { ChainableEvent, KickoutOutcome } from "../chains/chain-types";
import {
  makeChainSummaryPage,
  makeKickoutChainPage,
  makeMomentumRunsPage,
  makeRestartVisualPage,
  makeShotEfficiencyPage,
  makeSummaryPage,
  makeTurnoverPunishmentPage,
  type PdfExportEvent,
} from "../reviewPdfExport";
import { avgSecondsToScore } from "../restarts/restartMetrics";
import { normalizeEventsForReporting } from "./eventTagClassification";
import { loadBallylandersGalballyFixture } from "./ballylanders-galbally-real-fixture";
import { buildMatchReport } from "./matchReport";
import { viewRestartOriginConcededFor, viewScoringPossessionOrigins } from "./scoringBreakdownViews";
import { buildTeamSummaryBlock } from "./teamStatsViews";

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

const HOME = "Ballyboden";
const AWAY = "Na Fianna";

function tap(clock: number, a: Partial<ProTaggerAction> & Pick<ProTaggerAction, "familyId" | "tileLabel" | "teamSide">, half: 1 | 2 = 1): LoggedMatchEvent {
  return adaptProTaggerAction({ nx: 0.5, ny: 0.5, half, matchClockSeconds: clock, ...a });
}
function input(stored: readonly LoggedMatchEvent[]) {
  const events = normalizeEventsForReporting(toEventStatsReportEvents(stored)) as readonly PdfExportEvent[];
  const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY });
  return { events: report.events, report };
}
const texts = (c: HTMLCanvasElement) => (c as unknown as CaptureCanvas).ctx.texts;
/** The text drawn right after the n-th occurrence of `label`. */
const after = (t: readonly string[], label: string, nth = 0) => t.filter((_, i) => i > 0 && t[i - 1] === label)[nth];

beforeEach(() => {
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === "canvas" ? new CaptureCanvas() : {}),
  };
});

// ─── F-11 ────────────────────────────────────────────────────────────────────

describe("F-11 — average seconds to score uses the intended team's restarts only", () => {
  // Ballyboden win three restarts: two produce scores after 20 s and 40 s,
  // one ends in a wide. Na Fianna win one and score after 10 s.
  // Ballyboden: (20 + 40) / 2 = 30 s. Na Fianna: 10 s. The old mixed figure
  // was (20 + 40 + 10) / 3 = 23 s.
  const stored = [
    tap(100, { familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "FOR" }),
    tap(120, { familyId: "POINT", tileLabel: "Play", teamSide: "FOR" }),
    tap(200, { familyId: "RESTART", tileLabel: "Break", teamSide: "FOR", restartOwner: "OPP" }),
    tap(240, { familyId: "GOAL", tileLabel: "Play", teamSide: "FOR" }),
    tap(300, { familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "OPP" }),
    tap(310, { familyId: "POINT", tileLabel: "Play", teamSide: "OPP" }),
    tap(400, { familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "FOR" }),
    tap(420, { familyId: "WIDE", tileLabel: "Play", teamSide: "FOR" }),
  ];

  it("computes each team's average from its own won restarts", () => {
    const { report } = input(stored);
    expect(report.restarts.avgSecondsToScore).toEqual({ FOR: 30, OPP: 10 });
  });

  it("prints the home team's figure on Restart Analysis and Restart Chain", () => {
    const { events, report } = input(stored);
    const ra = texts(makeRestartVisualPage(events, "gaelic", report, HOME, AWAY, 1, 1));
    expect(after(ra, "Avg secs to score (won)")).toBe("30s");
    const rc = texts(makeKickoutChainPage(report, HOME, AWAY, 1, 1));
    expect(after(rc, "Avg secs to score (won Kickout)")).toBe("30s");
    expect(after(rc, "Avg time to score (Kickout)")).toBe("30s avg");
  });

  it("excludes restarts without a recorded clock, and any that would span half-time", () => {
    const k = (period: "1H" | "2H", clock?: number): ChainableEvent =>
      ({ id: `k${period}${clock}`, kind: "KICKOUT_WON", teamSide: "FOR", period, segment: 1, nx: 0.5, ny: 0.5, matchClockSeconds: clock });
    const s = (period: "1H" | "2H"): ChainableEvent =>
      ({ id: `s${period}`, kind: "POINT", teamSide: "FOR", period, segment: 1, nx: 0.5, ny: 0.5 });
    const outcomes: KickoutOutcome[] = [
      { kickoutEvent: k("1H", 10), winningSide: "FOR", nextScore: s("1H"), nextShotOrScore: s("1H"), secondsToScore: 12 },
      { kickoutEvent: k("1H"), winningSide: "FOR", nextScore: s("1H"), nextShotOrScore: s("1H"), secondsToScore: null },
      { kickoutEvent: k("1H", 2090), winningSide: "FOR", nextScore: s("2H"), nextShotOrScore: s("2H"), secondsToScore: 70 },
      { kickoutEvent: k("1H", 50), winningSide: "OPP", nextScore: s("1H"), nextShotOrScore: s("1H"), secondsToScore: 4 },
    ];
    expect(avgSecondsToScore(outcomes, "FOR")).toBe(12);
    expect(avgSecondsToScore(outcomes, "OPP")).toBe(4);
    expect(avgSecondsToScore([], "FOR")).toBeNull();
  });
});

// ─── F-10 ────────────────────────────────────────────────────────────────────

describe("F-10 — 45 / 65 row counts Event Stats' 45 / 65 records", () => {
  // Ballyboden are awarded two 45s (keep one, lose one) and score one placed
  // 45; Na Fianna are awarded one.
  const stored = [
    tap(100, { familyId: "SHOT", tileLabel: "Block/Save", teamSide: "FOR" }),
    tap(110, { familyId: "FORTY_FIVE", tileLabel: "Won", teamSide: "FOR", restartOwner: "FOR" }),
    tap(140, { familyId: "POINT", tileLabel: "45", teamSide: "FOR" }),
    tap(300, { familyId: "FORTY_FIVE", tileLabel: "Won", teamSide: "OPP", restartOwner: "FOR" }),
    tap(500, { familyId: "FORTY_FIVE", tileLabel: "Won", teamSide: "OPP", restartOwner: "OPP" }),
  ];

  it("counts awards per team (kept or lost), never the score from the 45", () => {
    const { report } = input(stored);
    expect(buildTeamSummaryBlock(report, "FOR").shot45).toBe(2);
    expect(buildTeamSummaryBlock(report, "OPP").shot45).toBe(1);
    // The score from the 45 is counted once, as a placed ball.
    expect(report.placedBalls.for).toMatchObject({ attempts: 1, scores: 1, points: 1 });
  });

  it("still counts historical Match Stats shots tagged FORTY_FIVE", () => {
    const legacy: ChainableEvent = { id: "ms-1", kind: "SHOT", teamSide: "FOR", tags: ["FORTY_FIVE"], period: "1H", segment: 1, nx: 0.5, ny: 0.5, matchClockSeconds: 30 };
    const report = buildMatchReport({ events: [legacy], homeTeam: HOME, awayTeam: AWAY });
    expect(buildTeamSummaryBlock(report, "FOR").shot45).toBe(1);
  });

  for (const [sport, label] of [["gaelic", "45"], ["hurling", "65"], ["camogie", "65"]] as Array<[PitchSport, string]>) {
    it(`labels the row and the efficiency source "${label}" in ${sport}`, () => {
      const { events, report } = input(stored);
      const summary = texts(makeSummaryPage(events, report, HOME, AWAY, undefined, 1, sport));
      expect(after(summary, label)).toBe("2");
      expect(summary).not.toContain(label === "45" ? "65" : "45");
      const eff = texts(makeShotEfficiencyPage(events, report, HOME, AWAY, 1, 1, sport));
      expect(eff).toContain(label);
    });
  }
});

// ─── Scoring runs ────────────────────────────────────────────────────────────

describe("Scoring runs are counted in scoring events, labelled scores", () => {
  // Ballyboden: goal, point, two-pointer in a row (3 scores, 6 points), all in
  // segment 3; Na Fianna: two points (2 scores).
  const stored = [
    tap(1300, { familyId: "GOAL", tileLabel: "Play", teamSide: "FOR" }),
    tap(1350, { familyId: "POINT", tileLabel: "Play", teamSide: "FOR" }),
    tap(1400, { familyId: "TWO_POINT", tileLabel: "Play", teamSide: "FOR" }),
    tap(1500, { familyId: "POINT", tileLabel: "Play", teamSide: "OPP" }),
    tap(1550, { familyId: "POINT", tileLabel: "Play", teamSide: "OPP" }),
  ];

  it("Chain Intelligence prints run lengths as scores, not points", () => {
    const { report } = input(stored);
    expect(report.chain.scoringRuns.maxConsecutiveFor).toBe(3);
    const t = texts(makeChainSummaryPage(report, HOME, AWAY, 1, 1));
    expect(after(t, "Longest run (For)")).toBe("3 scores");
    expect(after(t, "Longest run (Opp)")).toBe("2 scores");
    expect(t.some((x) => /\bpts\b/.test(x) && /^\d+ pts$/.test(x))).toBe(false);
    expect(t).toContain("3 scores");
  });

  it("Scoring Momentum late bursts are counted in scores", () => {
    const { report } = input(stored);
    const t = texts(makeMomentumRunsPage(report, HOME, AWAY, 1, 1));
    expect(t.find((x) => x.startsWith(`${HOME}: `))).toBe(`${HOME}: 3 scores  ${AWAY}: 2 scores`);
  });
});

// ─── Opposition Origin rows ──────────────────────────────────────────────────

describe("Opposition Origin — de-duplicated and raw restart-origin rows", () => {
  it("coincide on a real match under the possession-based kickout definition", () => {
    const { events, homeTeam, awayTeam } = loadBallylandersGalballyFixture();
    const report = buildMatchReport({ events, homeTeam, awayTeam });
    expect(viewScoringPossessionOrigins(report, "OPP").restartOrigin).toEqual(viewRestartOriginConcededFor(report.chain));
  });

  it("coincide when a turnover before the kickout also claims the score (the nearer origin is the kickout)", () => {
    const stored = [
      tap(100, { familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" }),     // Na Fianna win the ball
      tap(105, { familyId: "WIDE", tileLabel: "Play", teamSide: "FOR" }),           // ...then Ballyboden shoot wide (unrecorded loss)
      tap(110, { familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "OPP" }),
      tap(120, { familyId: "POINT", tileLabel: "Play", teamSide: "OPP" }),
    ];
    const { report } = input(stored);
    const dedup = viewScoringPossessionOrigins(report, "OPP");
    expect(dedup.restartOrigin).toEqual(viewRestartOriginConcededFor(report.chain));
    expect(dedup.restartOrigin.points).toBe(1);
  });
});

// ─── 101% split bars ─────────────────────────────────────────────────────────

describe("Two-way split bars total 100%", () => {
  it("Turnover Chain origin-score bar: 1 v 7 prints 13% / 87%, not 13% / 88%", () => {
    // Ballyboden: one turnover-origin score; Na Fianna: seven.
    const stored: LoggedMatchEvent[] = [];
    let c = 100;
    stored.push(tap(c, { familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }));
    stored.push(tap(c + 5, { familyId: "POINT", tileLabel: "Play", teamSide: "FOR" }));
    for (let i = 0; i < 7; i++) {
      c += 100;
      stored.push(tap(c, { familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" }));
      stored.push(tap(c + 5, { familyId: "POINT", tileLabel: "Play", teamSide: "OPP" }));
    }
    const { report } = input(stored);
    const t = texts(makeTurnoverPunishmentPage(report, HOME, AWAY, 1, 1));
    expect(t).toContain("Ballyboden 13%");
    expect(t).toContain("87% Na Fianna");
  });

  it("Restart Summary bar and its two rows show the same whole-number split", () => {
    // 1 restart won v 7 lost: 12.5% / 87.5%.
    const stored: LoggedMatchEvent[] = [tap(10, { familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "FOR" })];
    for (let i = 1; i <= 7; i++) stored.push(tap(10 + i * 100, { familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "OPP" }));
    const { events, report } = input(stored);
    const t = texts(makeRestartVisualPage(events, "gaelic", report, HOME, AWAY, 1, 1));
    expect(t).toContain("Ballyboden  13%");
    expect(t).toContain("87%  Na Fianna");
    expect(after(t, "Ballyboden Won")).toBe("1 (13%)");
    expect(after(t, "Na Fianna Won")).toBe("7 (87%)");
  });
});
