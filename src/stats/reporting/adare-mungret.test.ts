/**
 * adare-mungret.test.ts — production regression gate for Adare v Mungret.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { rankChainPatterns } from "../chains/chain-patterns";
import { exportReviewPdf, exportSnapshotPdf } from "../reviewPdfExport";
import { buildTeamSummaryBlock } from "./teamStatsViews";
import { buildMatchReport } from "./matchReport";
import {
  ADARE_MUNGRET_EXPECTATIONS,
  ADARE_MUNGRET_TEAMS,
  buildAdareMungretFixture,
} from "./adare-mungret-fixture";
import { formatOwnKickoutsLost } from "./restartTeamMetrics";

const events = buildAdareMungretFixture();
const pdfEvents = events as import("../reviewPdfExport").PdfExportEvent[];

const capturedCoachText: string[] = [];

class MockCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  font = "";
  lineWidth = 1;
  textBaseline = "alphabetic";
  textAlign = "left";
  globalAlpha = 1;
  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText(text: string) {
    capturedCoachText.push(text);
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

class MockCanvas {
  width = 1920;
  height = 1080;
  getContext() {
    return new MockCanvasContext() as unknown as CanvasRenderingContext2D;
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
  const doc = {
    createElement(tag: string) {
      if (tag === "canvas") return new MockCanvas() as unknown as HTMLCanvasElement;
      return {} as HTMLElement;
    },
  };
  (globalThis as unknown as { document: typeof doc }).document = doc;
}

beforeEach(() => {
  capturedCoachText.length = 0;
  installDomMocks();
});

function fullReport() {
  return buildMatchReport({
    events,
    homeTeam: ADARE_MUNGRET_TEAMS.home,
    awayTeam: ADARE_MUNGRET_TEAMS.away,
    scope: "FULL",
  });
}

function htReport() {
  return buildMatchReport({
    events,
    homeTeam: ADARE_MUNGRET_TEAMS.home,
    awayTeam: ADARE_MUNGRET_TEAMS.away,
    scope: "1H",
  });
}

describe("Adare v Mungret — canonical metrics", () => {
  const exp = ADARE_MUNGRET_EXPECTATIONS;

  it("restart team counts — full match", () => {
    const report = fullReport();
    const f = report.restartTeams.for;
    const o = report.restartTeams.opp;
    expect(f.restartShareWon).toBe(exp.restartShare.forWon);
    expect(o.restartShareWon).toBe(exp.restartShare.oppWon);
    expect(f.restartShareTotal).toBe(exp.restartShare.total);
    expect(f.ownRestartsTaken).toBe(exp.ownKickouts.for.taken);
    expect(f.ownRestartsRetained).toBe(exp.ownKickouts.for.retained);
    expect(f.ownRestartsLost).toBe(exp.ownKickouts.for.lost);
    expect(o.ownRestartsTaken).toBe(exp.ownKickouts.opp.taken);
    expect(o.ownRestartsRetained).toBe(exp.ownKickouts.opp.retained);
    expect(o.ownRestartsLost).toBe(exp.ownKickouts.opp.lost);
  });

  it("restart team counts — first half", () => {
    const report = htReport();
    const f = report.restartTeams.for;
    expect(f.restartShareWon).toBe(exp.restartShareH1.forWon);
    expect(f.restartShareTotal).toBe(exp.restartShareH1.total);
    expect(f.ownRestartsTaken).toBe(exp.ownKickoutsH1.forTaken);
    expect(f.ownRestartsRetained).toBe(exp.ownKickoutsH1.forRetained);
    expect(f.ownRestartsLost).toBe(exp.ownKickoutsH1.forLost);
  });

  it("placed-ball counts — full match", () => {
    const report = fullReport();
    expect(report.placedBalls.for.attempts).toBe(exp.placedBalls.for.attempts);
    expect(report.placedBalls.for.scores).toBe(exp.placedBalls.for.scores);
    expect(report.placedBalls.for.points).toBe(exp.placedBalls.for.points);
    expect(report.placedBalls.for.misses).toBe(exp.placedBalls.for.misses);
    expect(report.placedBalls.opp.attempts).toBe(exp.placedBalls.opp.attempts);
    expect(report.placedBalls.opp.scores).toBe(exp.placedBalls.opp.scores);
    expect(report.placedBalls.opp.points).toBe(exp.placedBalls.opp.points);
    expect(report.placedBalls.opp.misses).toBe(exp.placedBalls.opp.misses);
  });

  it("turnover origin scores", () => {
    const report = fullReport();
    expect(report.turnovers.turnoverWinsToScore.num).toBe(exp.turnoverOriginScore.for.num);
    expect(report.turnovers.turnoverWinsToScore.den).toBe(exp.turnoverOriginScore.for.den);
    expect(report.chain.turnovers.won).toBe(exp.turnovers.forWon);
    expect(report.chain.turnovers.lost).toBe(exp.turnovers.oppWon);
  });
});

describe("Adare v Mungret — forbidden coach-facing language", () => {
  it("chain patterns must not say Adare lost 20 kickouts", () => {
    const report = fullReport();
    const patterns = rankChainPatterns(report.chain, "FT", ADARE_MUNGRET_TEAMS.home, ADARE_MUNGRET_TEAMS.away, report.restartTeams);
    const allText = patterns.map((p) => p.observation).join(" ");
    expect(allText).not.toContain("Adare lost 20 kickouts");
    expect(allText).not.toContain("lost 20 kickouts");
  });

  it("HT chain patterns must not say Adare lost 10 kickouts (all-match figure)", () => {
    const report = htReport();
    const patterns = rankChainPatterns(report.chain, "HT", ADARE_MUNGRET_TEAMS.home, ADARE_MUNGRET_TEAMS.away, report.restartTeams);
    const allText = patterns.map((p) => p.observation).join(" ");
    expect(allText).not.toMatch(/Adare lost 10 kickouts/);
  });

  it("approved own-kickout wording is available", () => {
    const report = fullReport();
    const wording = formatOwnKickoutsLost(ADARE_MUNGRET_TEAMS.home, report.restartTeams.for);
    expect(wording).toBe("Adare lost 10 of 22 own kickouts");
    const htWording = formatOwnKickoutsLost(ADARE_MUNGRET_TEAMS.home, htReport().restartTeams.for);
    expect(htWording).toBe("Adare lost 5 of 10 own kickouts");
  });
});

describe("Adare v Mungret — match summary block", () => {
  it("uses Restart Share Won/Conceded not mirrored kickout lost", () => {
    const report = fullReport();
    const forBlock = buildTeamSummaryBlock(report, "FOR");
    const oppBlock = buildTeamSummaryBlock(report, "OPP");
    expect(forBlock.restartShareWon).toBe(22);
    expect(forBlock.restartShareConceded).toBe(20);
    expect(oppBlock.restartShareWon).toBe(20);
    expect(oppBlock.restartShareConceded).toBe(22);
    expect(forBlock.placedAttempts).toBe(5);
    expect(forBlock.placedScores).toBe(4);
    expect(forBlock.placedPoints).toBe(5);
    expect(forBlock.placedMisses).toBe(1);
    expect(forBlock.placedScores).toBeGreaterThan(0);
  });
});

describe("Adare v Mungret — PDF coach-facing output", () => {
  const baseInput = {
    events: pdfEvents,
    homeTeamName: ADARE_MUNGRET_TEAMS.home,
    awayTeamName: ADARE_MUNGRET_TEAMS.away,
    sport: "gaelic" as const,
    homeAttackingDirection: "RIGHT" as const,
  };

  it("exports Full Review, HT Snapshot, and FT Snapshot without error", async () => {
    await expect(exportReviewPdf(baseInput)).resolves.toBeUndefined();
    await expect(
      exportSnapshotPdf({ ...baseInput, snapshotMode: "HALF_TIME_SNAPSHOT" }),
    ).resolves.toBeUndefined();
    await expect(
      exportSnapshotPdf({ ...baseInput, snapshotMode: "FULL_TIME_SNAPSHOT" }),
    ).resolves.toBeUndefined();
  });

  it("forbidden kickout and placed-ball language absent from rendered text", async () => {
    await exportReviewPdf(baseInput);
    await exportSnapshotPdf({ ...baseInput, snapshotMode: "HALF_TIME_SNAPSHOT" });
    await exportSnapshotPdf({ ...baseInput, snapshotMode: "FULL_TIME_SNAPSHOT" });

    const allCoachText = capturedCoachText.join(" ");
    expect(allCoachText).not.toContain("Adare lost 20 kickouts");
    expect(allCoachText).not.toContain("Adare lost 10 kickouts");
    expect(allCoachText).not.toMatch(/Kickout Lost\s+20/);
    expect(allCoachText).not.toMatch(/Placed Scored\s+0/);
    expect(allCoachText).toContain("Restart Share Won");
    expect(allCoachText).toContain("Restart Share Conceded");
    expect(allCoachText).toContain("Placed Attempts");
    // KICKOUT RISK (DANGER_CHAIN) must not mis-pair Adare's own-kickout-loss
    // count with a score that actually came from Mungret's own successfully
    // -retained kickout — none of Adare's 10 own-kickout losses in this
    // fixture are followed directly by a Mungret score (that score comes
    // from Mungret's own retained restart instead), so the card must not
    // render this mismatched claim at all.
    expect(allCoachText).not.toContain("Adare lost 10 of 22 own kickouts —");
  });
});
