/**
 * snapshotComposition.test.ts
 *
 * Regression coverage for the HT/FT Snapshot factual-report redesign:
 *
 *   1. HT page composition — exactly 5 pages, in the approved order.
 *   2. FT page composition — exactly 7 pages, in the approved order.
 *   3. Provenance guard — no chain/origin/possession page ever renders
 *      inside a Snapshot export (structural, via page-title capture —
 *      not just "we didn't see it in a screenshot").
 *   4. Half filtering — HT sees only 1H events; FT sees the full match.
 *   5. Empty/low-data match — no crash, no NaN/Infinity, 0/0 handled.
 *   6. Score reconciliation — dashboard score line matches the canonical
 *      score ledger for the same event set.
 *
 * Uses a capturing canvas mock (same pattern as pdfMapMarkers.test.ts /
 * snapshotExport.test.ts) that records every fillText() call per page, so
 * page titles (the first "bold 33px sans-serif" fillText — drawPageHeader's
 * title style, used identically by every page builder including the new
 * Dashboard) can be read back in render order without needing a real
 * browser canvas.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { buildMatchReport } from "./reporting/matchReport";
import { buildSnapshotDashboardModel } from "./reporting/snapshotDashboardModel";
import {
  BALLYLANDERS_FRCASEYS_TEAMS,
  buildBallylandersFrCaseysFixture,
} from "./reporting/ballylanders-frcaseys-fixture";
import { exportSnapshotPdf } from "./reviewPdfExport";
import type { PdfExportEvent } from "./reviewPdfExport";

// ─── Capturing DOM/canvas mock ────────────────────────────────────────────

const TITLE_FONT = "bold 33px sans-serif";

class CaptureCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  font = "";
  lineWidth = 1;
  textBaseline = "alphabetic";
  textAlign = "left";
  globalAlpha = 1;
  readonly textDraws: Array<{ text: string; font: string }> = [];

  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText(text: string) {
    this.textDraws.push({ text, font: this.font });
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

  /** The page title — the first fillText call in drawPageHeader's title style. */
  get title(): string | null {
    return this.textDraws.find((d) => d.font === TITLE_FONT)?.text ?? null;
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

let capturedCanvases: CaptureCanvas[] = [];

function installDomMocks(): void {
  capturedCanvases = [];
  class MockPath2D {
    constructor(_d?: string) {}
  }
  (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === "canvas") {
        const c = new CaptureCanvas();
        capturedCanvases.push(c);
        return c;
      }
      return {};
    },
  };
}

beforeEach(() => {
  installDomMocks();
});

// jsPDF's Node .save() path writes a real file via fs — clean up every
// filename any test in this file could produce (mirrors snapshotExport.test.ts).
afterEach(() => {
  for (const file of [
    "Ballylanders_v_Fr_Caseys_ht_snapshot.pdf",
    "Ballylanders_v_Fr_Caseys_ft_snapshot.pdf",
    "Home_v_Away_ht_snapshot.pdf",
    "Home_v_Away_ft_snapshot.pdf",
  ]) {
    if (existsSync(file)) unlinkSync(file);
  }
});

function pageTitles(): (string | null)[] {
  return capturedCanvases.map((c) => c.ctx.title);
}

// ─── Forbidden titles — chain/origin/possession content ──────────────────

const FORBIDDEN_SNAPSHOT_TITLES = [
  "Chain Patterns",
  "Chain Intelligence",
  "Tactical Match Summary",
  "Where the Points Went",
  "The Ledger So Far",
  "Turnover Chain Analysis",
  "Restart Chain Analysis",
  "Attack Corridors",
  "Restart Escape Routes",
  "Opposition Snapshot",
  "Tactical Match Story",
  "Intelligence Summary",
  "Tactical Review Guide",
];

describe("exportSnapshotPdf — HT/FT factual composition", () => {
  const events = buildBallylandersFrCaseysFixture() as unknown as PdfExportEvent[];
  const base = {
    events,
    homeTeamName: BALLYLANDERS_FRCASEYS_TEAMS.home,
    awayTeamName: BALLYLANDERS_FRCASEYS_TEAMS.away,
    sport: "gaelic" as const,
    homeAttackingDirection: "RIGHT" as const,
  };

  it("HT Snapshot renders exactly the 5 approved pages, in order", async () => {
    await exportSnapshotPdf({ ...base, snapshotMode: "HALF_TIME_SNAPSHOT" });
    expect(pageTitles()).toEqual([
      "Half-Time Dashboard",
      "Our Shot Profile",
      "Opposition Shot Profile",
      "Restart Battle – First Half",
      "Turnover & Territory",
    ]);
  });

  it("FT Snapshot renders exactly the 7 approved pages, in order", async () => {
    await exportSnapshotPdf({ ...base, snapshotMode: "FULL_TIME_SNAPSHOT" });
    expect(pageTitles()).toEqual([
      "Full-Time Dashboard",
      "Our Shot Profile",
      "Opposition Shot Profile",
      "Restart Battle – First Half",
      "Restart Battle – Second Half",
      "Turnover & Territory",
      "Shot & Scoring Efficiency",
    ]);
  });

  it("PROVENANCE GUARD: no chain/origin/possession page title ever appears in HT Snapshot", async () => {
    await exportSnapshotPdf({ ...base, snapshotMode: "HALF_TIME_SNAPSHOT" });
    const titles = pageTitles();
    for (const forbidden of FORBIDDEN_SNAPSHOT_TITLES) {
      expect(titles).not.toContain(forbidden);
    }
  });

  it("PROVENANCE GUARD: no chain/origin/possession page title ever appears in FT Snapshot", async () => {
    await exportSnapshotPdf({ ...base, snapshotMode: "FULL_TIME_SNAPSHOT" });
    const titles = pageTitles();
    for (const forbidden of FORBIDDEN_SNAPSHOT_TITLES) {
      expect(titles).not.toContain(forbidden);
    }
  });

  it("HT dashboard uses first-half-only data; FT dashboard uses the full match", () => {
    const htReport = buildMatchReport({
      events: events.filter((e) => e.period === "1H"),
      homeTeam: base.homeTeamName,
      awayTeam: base.awayTeamName,
      scope: "1H",
    });
    const ftReport = buildMatchReport({
      events,
      homeTeam: base.homeTeamName,
      awayTeam: base.awayTeamName,
      scope: "FULL",
    });
    const htModel = buildSnapshotDashboardModel(htReport, "HT");
    const ftModel = buildSnapshotDashboardModel(ftReport, "FT");

    expect(htModel.us.score.total).toBeLessThan(ftModel.us.score.total);
    expect(htModel.us.turnovers.won).toBeLessThan(ftModel.us.turnovers.won);
    expect(htModel.eventCount).toBeLessThan(ftModel.eventCount);
  });

  it("score reconciliation: dashboard score line matches the canonical score ledger", () => {
    const report = buildMatchReport({
      events,
      homeTeam: base.homeTeamName,
      awayTeam: base.awayTeamName,
      scope: "FULL",
    });
    const model = buildSnapshotDashboardModel(report, "FT");
    expect(model.us.score.total).toBe(report.ledger.forScore.total);
    expect(model.them.score.total).toBe(report.ledger.oppScore.total);
    expect(model.us.score.goals).toBe(report.ledger.forScore.goals);
    expect(model.them.score.goals).toBe(report.ledger.oppScore.goals);
  });

  it("placed-ball scores are a subset view, never additive double-counting", () => {
    const report = buildMatchReport({
      events,
      homeTeam: base.homeTeamName,
      awayTeam: base.awayTeamName,
      scope: "FULL",
    });
    const model = buildSnapshotDashboardModel(report, "FT");
    // Placed scores can never exceed total scoring events (goals + points-events).
    expect(model.us.placed.scores).toBeLessThanOrEqual(model.us.shooting.num);
    expect(model.them.placed.scores).toBeLessThanOrEqual(model.them.shooting.num);
  });

  it("1H + 2H Restart Battle retained/total reconciles exactly with the FT Dashboard's own-kickout totals", async () => {
    await exportSnapshotPdf({ ...base, snapshotMode: "FULL_TIME_SNAPSHOT" });

    const byTitle = (title: string) =>
      capturedCanvases.find((c) => c.ctx.title === title)?.ctx.textDraws ?? [];

    // Two "<team> retained N/D (P%)" lines per Restart Battle page — home first, away second —
    // drawn by drawTwoColumnHtStrip inside makeRestartBattlePage.
    function parseRetainedLines(draws: Array<{ text: string }>): Array<{ retained: number; total: number }> {
      return draws
        .map((d) => d.text.match(/retained (\d+)\/(\d+)/))
        .filter((m): m is RegExpMatchArray => m != null)
        .map((m) => ({ retained: Number(m[1]), total: Number(m[2]) }));
    }

    const [home1H, away1H] = parseRetainedLines(byTitle("Restart Battle – First Half"));
    const [home2H, away2H] = parseRetainedLines(byTitle("Restart Battle – Second Half"));

    expect(home1H).toEqual({ retained: 3, total: 7 });
    expect(away1H).toEqual({ retained: 7, total: 7 });
    expect(home2H).toEqual({ retained: 3, total: 6 });
    expect(away2H).toEqual({ retained: 4, total: 8 });

    const report = buildMatchReport({
      events,
      homeTeam: base.homeTeamName,
      awayTeam: base.awayTeamName,
      scope: "FULL",
    });
    const ftModel = buildSnapshotDashboardModel(report, "FT");

    expect(home1H.retained + home2H.retained).toBe(ftModel.us.ownKickouts.retained);
    expect(home1H.total + home2H.total).toBe(ftModel.us.ownKickouts.total);
    expect(away1H.retained + away2H.retained).toBe(ftModel.them.ownKickouts.retained);
    expect(away1H.total + away2H.total).toBe(ftModel.them.ownKickouts.total);

    // And the exact approved reference: 3/7 + 3/6 = 6/13; 7/7 + 4/8 = 11/15.
    expect(ftModel.us.ownKickouts).toEqual({ retained: 6, total: 13, lost: 7, pct: 46 });
    expect(ftModel.them.ownKickouts).toEqual({ retained: 11, total: 15, lost: 4, pct: 73 });
  });
});

describe("exportSnapshotPdf — empty / low-data match", () => {
  const emptyBase = {
    events: [] as PdfExportEvent[],
    homeTeamName: "Home",
    awayTeamName: "Away",
    sport: "gaelic" as const,
    homeAttackingDirection: "RIGHT" as const,
  };

  it("HT Snapshot does not throw and still renders 5 pages with no events", async () => {
    await expect(
      exportSnapshotPdf({ ...emptyBase, snapshotMode: "HALF_TIME_SNAPSHOT" }),
    ).resolves.toBeUndefined();
    expect(capturedCanvases).toHaveLength(5);
  });

  it("FT Snapshot does not throw and still renders 7 pages with no events", async () => {
    await expect(
      exportSnapshotPdf({ ...emptyBase, snapshotMode: "FULL_TIME_SNAPSHOT" }),
    ).resolves.toBeUndefined();
    expect(capturedCanvases).toHaveLength(7);
  });

  it("dashboard model produces 0/0 percentages, never NaN or Infinity, with no events", () => {
    const report = buildMatchReport({ events: [], homeTeam: "Home", awayTeam: "Away" });
    const model = buildSnapshotDashboardModel(report, "FT");
    for (const side of [model.us, model.them]) {
      expect(side.shooting).toEqual({ num: 0, den: 0, pct: 0 });
      expect(side.ownKickouts).toEqual({ retained: 0, total: 0, lost: 0, pct: 0 });
      expect(side.turnovers).toEqual({ won: 0, lost: 0 });
      expect(side.placed).toEqual({ scores: 0, attempts: 0 });
      expect(Number.isFinite(side.shooting.pct)).toBe(true);
      expect(Number.isFinite(side.ownKickouts.pct)).toBe(true);
    }
  });
});
