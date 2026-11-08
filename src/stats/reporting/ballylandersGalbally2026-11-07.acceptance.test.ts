/**
 * ballylandersGalbally2026-11-07.acceptance.test.ts
 *
 * Samsung release-acceptance match (Ballylanders 0-06 v Galbally 0-05, saved
 * at half-time, 7 Nov 2026; anonymised export). Expected values come from an
 * event-by-event ledger worked out by hand from the export — never from the
 * app's own output:
 *
 *   Kickouts  Ballylanders own 5, kept 4 (1:14 5:34 7:18 8:55; lost 4:51)
 *             Galbally own 6, kept 5 (0:34 4:15 6:48 8:29 10:06; lost 2:51)
 *             → Ballylanders won 5 (4 own + 1 theirs), Galbally won 6 (5 + 1).
 *             Galbally kickout possessions: 4:15 → 4:36 point (1),
 *             4:51 (won Ballylanders') → 5:07 two-pointer (2), 8:29 → 8:46 wide:
 *             3 shots, 2 scores, 3 points. Ballylanders' 5: no shot.
 *   Turnovers Ballylanders won 3 (6:02 → 6:41 wide; 7:36 → 8:15 point from a
 *             45 in the same possession; 9:18 → 9:27 point): 2 scores, 2 pts.
 *             Galbally won 5: no score.
 *   Frees     Ballylanders won 2 (2:18 → 2:30 point; 3:48 → 4:00 two-pointer):
 *             2 scores, 3 points. Galbally won 3 (0:50 → 1:00 point; 6:57 →
 *             7:05 point; 10:17 → none): 2 scores, 2 points.
 *   Net       kickouts −3, turnovers +2, frees +1 → even.
 *   45        8:03 FORTY_FIVE_WON (award, #13) then 8:15 POINT tagged 45 (#14).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMatchReport } from "./matchReport";
import { buildQuickReviewMatchOverview } from "./quickReviewMatchOverview";
import { buildIntelligencePack } from "../intelligencePack";
import { producedScore, producedScoreText } from "../possessionScoreText";
import type { PdfExportEvent } from "../reviewPdfExport";

type Fixture = {
  homeTeamName: string; awayTeamName: string; halfDurationMinutes: number;
  homeSquad: { id: string; players: { id: string; number: number }[] };
  awaySquad: { id: string; players: { id: string; number: number }[] };
  events: PdfExportEvent[];
};
const fx = JSON.parse(readFileSync(new URL("./fixtures/ballylanders-galbally-2026-11-07-ht.json", import.meta.url), "utf8")) as Fixture;
const HOME = fx.homeTeamName, AWAY = fx.awayTeamName;
const report = buildMatchReport({ events: fx.events, homeTeam: HOME, awayTeam: AWAY, scope: "1H" });

// ── Canvas capture (records drawn text, and every filled circle by colour) ──
type Page = { texts: string[]; dots: Map<string, number> };
const pages: Page[] = [];
class Ctx {
  fillStyle = ""; strokeStyle = ""; font = ""; lineWidth = 1; textBaseline = "alphabetic"; textAlign = "left"; globalAlpha = 1; lineCap = "butt";
  texts: string[] = []; dots = new Map<string, number>(); private arcOpen = false;
  save() {} restore() {} fillRect() {} strokeRect() {} clearRect() {}
  fillText(t: string) { this.texts.push(String(t)); } strokeText() {}
  beginPath() { this.arcOpen = false; } arc() { this.arcOpen = true; } ellipse() {}
  arcTo() {} moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} rect() {} roundRect() {}
  fill() { if (this.arcOpen) this.dots.set(this.fillStyle, (this.dots.get(this.fillStyle) ?? 0) + 1); }
  stroke() {}
  measureText(t: string) { return { width: String(t).length * 8 }; }
  setLineDash() {} clip() {} drawImage() {} translate() {} rotate() {} scale() {} setTransform() {} resetTransform() {}
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
}
class Cnv {
  width = 0; height = 0; style = {}; ctx = new Ctx();
  getContext() { return this.ctx; }
  toDataURL() { pages.push({ texts: this.ctx.texts, dots: this.ctx.dots }); return "data:image/jpeg;base64,AAAA"; }
  toBlob(cb: (b: Blob) => void) { pages.push({ texts: this.ctx.texts, dots: this.ctx.dots }); cb(new Blob(["x"])); }
}
vi.mock("jspdf", () => ({ default: class { addPage() {} addImage() {} save() {} output() { return new Blob(); } setProperties() {} } }));
beforeEach(() => {
  pages.length = 0;
  (globalThis as { document?: unknown }).document = {
    createElement: (t: string) => (t === "canvas" ? new Cnv() : { click() {}, style: {}, setAttribute() {}, remove() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
});
const pageWith = (title: string) => pages.find((p) => p.texts.some((t) => t.includes(title)));

describe("Ballylanders v Galbally (Samsung acceptance) — independent ledger", () => {
  it("score and own-kickout retention", () => {
    expect(report.ledger.forScore).toEqual({ goals: 0, points: 6, total: 6 });
    expect(report.ledger.oppScore).toEqual({ goals: 0, points: 5, total: 5 });
    expect(report.restartTeams.for).toMatchObject({ ownRestartsTaken: 5, ownRestartsRetained: 4, ownRestartsLost: 1 });
    expect(report.restartTeams.opp).toMatchObject({ ownRestartsTaken: 6, ownRestartsRetained: 5, ownRestartsLost: 1 });
  });

  it("possessions: counts, scoring events and real point values", () => {
    const { kickouts, turnovers, frees } = report.possessions;
    expect([kickouts.retainedCount, kickouts.concededCount]).toEqual([5, 6]);
    expect([turnovers.retainedCount, turnovers.concededCount]).toEqual([3, 5]);
    expect([frees.retainedCount, frees.concededCount]).toEqual([2, 3]);
    expect(producedScore(kickouts.retained)).toEqual({ goals: 0, points: 0, scores: 0 });
    expect(producedScore(kickouts.conceded)).toEqual({ goals: 0, points: 3, scores: 2 }); // point + two-pointer
    expect(producedScore(turnovers.retained)).toEqual({ goals: 0, points: 2, scores: 2 });
    expect(producedScore(turnovers.conceded)).toEqual({ goals: 0, points: 0, scores: 0 });
    expect(producedScore(frees.retained)).toEqual({ goals: 0, points: 3, scores: 2 });     // point + two-pointer
    expect(producedScore(frees.conceded)).toEqual({ goals: 0, points: 2, scores: 2 });
    expect([kickouts.netOutcome, turnovers.netOutcome, frees.netOutcome, report.possessions.overallNetOutcome]).toEqual([-3, 2, 1, 0]);
  });

  it("score text: G-PP is the real points value, and says how many scores", () => {
    expect(producedScoreText({ goals: 0, points: 2, scores: 1 })).toBe("0-02 from 1 score");
    expect(producedScoreText({ goals: 1, points: 2, scores: 2 })).toBe("1-02 from 2 scores");
    expect(producedScoreText({ goals: 0, points: 0, scores: 0 })).toBe("0-00 scored");
  });
});

describe("Intelligence cards print the real points produced", () => {
  it("Restart Outcomes, Turnover & Free Outcomes and Match Impact", async () => {
    await buildIntelligencePack({
      stageLabel: "Half Time", homeTeamName: HOME, awayTeamName: AWAY, venueLabel: "", clockLabel: "Half Time",
      homeScore: { goals: 0, points: 6, total: 6 }, awayScore: { goals: 0, points: 5, total: 5 }, events: fx.events,
    });
    const restart = pageWith("Restart Outcomes")!.texts;
    expect(restart).toContain("0-02 from 1 score"); // Galbally won Ballylanders' kickout → two-pointer
    expect(restart).toContain("0-01 from 1 score"); // Galbally kept their own → point
    expect(restart).not.toContain("0-01 scored");

    const tf = pageWith("Turnover & Free Outcomes")!.texts;
    expect(tf).toContain("0-02 from 2 scores");    // Ballylanders turnovers won
    expect(tf).toContain("0-03 from 2 scores");    // Ballylanders possession frees: point + two-pointer
    expect(tf).not.toContain("0-02 scored");

    const mi = pageWith("Match Impact")!.texts;
    expect(mi).toContain("0-03 from 2 scores  Galbally");    // kickouts
    expect(mi).toContain("Ballylanders  0-03 from 2 scores"); // possession frees
    expect(mi).toContain("Ballylanders  0-02 from 2 scores"); // turnovers
  });
});

describe("Quick Review separates own kickouts kept from opposition kickouts won", () => {
  it("each team's kickouts won, how they split, and what they produced", () => {
    const qr = buildQuickReviewMatchOverview(fx.events.filter((e) => e.period === "1H"), HOME, AWAY);
    expect(qr.restarts.ours.text).toBe("4/5 retained (80%)");
    expect(qr.restarts.theirs.text).toBe("5/6 retained (83%)");
    expect(qr.restarts.won).toEqual({ count: 5, ownKept: 4, fromOpposition: 1, shots: 0, scores: 0 });
    expect(qr.restarts.lost).toEqual({ count: 6, ownKept: 5, fromOpposition: 1, shots: 3, scores: 2 });
  });
});

describe("The point from a 45 (8:15) on pitch maps", () => {
  const input = {
    events: fx.events, homeTeamName: HOME, awayTeamName: AWAY, sport: "gaelic" as const,
    homeSquadPlayers: [], awaySquadPlayers: [], homeAttackingDirection: "RIGHT" as const, halfDurationMinutes: fx.halfDurationMinutes,
  };

  it("Full Review Free Kick Analysis plots every placed-ball attempt the page counts", async () => {
    const { exportReviewPdf } = await import("../reviewPdfExport");
    await exportReviewPdf(input);
    const page = pages.find((p) => p.texts.includes("Free Kick Analysis"))!; // exact page header (the contents page lists "· Free Kick Analysis")
    // Points (light green): Ballylanders 2:30 free + 8:15 45; Galbally 7:05 free. Two-pointer (gold): 4:00 free.
    expect(page.dots.get("#4ade80")).toBe(3);
    expect(page.dots.get("#fbbf24")).toBe(1);
  });

  it("HT Snapshot Our Shot Profile draws every Ballylanders attempt, including the 45", async () => {
    const { exportSnapshotPdf } = await import("../reviewPdfExport");
    await exportSnapshotPdf({ ...input, snapshotMode: "HALF_TIME_SNAPSHOT" });
    const page = pageWith("Our Shot Profile")!;
    // Points 0:19, 2:30, 8:15 (45), 9:27 → 4 light green; 4:00 two-pointer → 1 gold.
    // Each count also includes that marker type's one legend swatch (+1); the
    // pitch-only counts are asserted in snapshotShotProfile.test.ts.
    expect(page.dots.get("#4ade80")).toBe(4 + 1);
    expect(page.dots.get("#fbbf24")).toBe(1 + 1);
  });
});
