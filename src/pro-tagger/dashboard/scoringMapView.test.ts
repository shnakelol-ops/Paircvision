import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { buildTeamSummaryBlock, viewShootingConversion } from "../../stats/reporting/teamStatsViews";
import { applyReviewKindEdit } from "../pro-tagger-review-edit";
import type { ProTaggerSport } from "../pro-tagger-session";
import { buildHtFtDashboardView } from "./htFtDashboardView";
import { buildScopedMapReport, mapSourceFromSavedMatch, type MapTeamSide } from "./matchMapPerspective";
import { HT_FIXTURE, deepFreeze, ev, ftFixtureMatch, htFixtureMatch, savedMatch } from "./matchMapTestFixtures";
import { buildScoringMapView, type ScoringMapView } from "./scoringMapView";

function view(events: readonly LoggedMatchEvent[], side: MapTeamSide, scope: "HT" | "FT" = "FT", over: Parameters<typeof savedMatch>[0] extends infer O ? Partial<O> : never = {}) {
  return buildScoringMapView(mapSourceFromSavedMatch(savedMatch({ ...over, events })), side, scope);
}

// ─── Real fixture, independently derived expectations ───────────────────────
// Hand-counted from ballylanders-galbally-2026-11-07-ht.json (not from code):
//   Ballylanders: e01 PT play, e08 SHOT post, e10 PT free, e14 2PT free,
//     e22 WIDE play, e29 SHOT block/save, e31 PT 45, e37 PT play
//     → 8 shots, 5 scores (63%), 0 goals, 4 one-pointers, 1 two-pointer = 0-06;
//       misses: 1 wide, 1 post, 1 blocked; placed: e10, e14, e31 (0-04),
//       from play: e01, e37 (0-02).
//   Galbally: e04 PT play, e16 PT play, e18 2PT play, e25 PT free, e33 WIDE play
//     → 5 shots, 4 scores (80%), 3 one-pointers, 1 two-pointer = 0-05;
//       placed: e25 (0-01), from play: 0-04.
describe("Scoring Map — real first half, both teams", () => {
  const src = mapSourceFromSavedMatch(deepFreeze(htFixtureMatch()));
  const home = buildScoringMapView(src, "FOR", "HT");
  const away = buildScoringMapView(src, "OPP", "HT");

  it("identifies the selected team and its opponent", () => {
    expect(home.team).toMatchObject({ role: "HOME", name: "Ballylanders" });
    expect(home.opponent).toMatchObject({ role: "AWAY", name: "Galbally" });
    expect(away.team).toMatchObject({ role: "AWAY", name: "Galbally" });
    expect(away.opponent).toMatchObject({ role: "HOME", name: "Ballylanders" });
    expect(home.scopeLabel).toBe("HALF-TIME");
    expect(home.scoreline).toEqual(away.scoreline);
    expect(home.scoreline.home.text).toBe("0-06");
    expect(home.scoreline.away.text).toBe("0-05");
  });

  it("Ballylanders", () => {
    expect(home.shooting).toEqual({ totalShots: 8, scoringShots: 5, missedShots: 3, accuracyPct: 63 });
    expect(home.scores).toEqual({
      goals: 0, onePointScores: 4, twoPointScores: 1, twoPointApplicable: true, pointsValue: 6, totalValue: 6,
    });
    expect(home.misses).toEqual({ wides: 1, short: 0, post: 1, blockedSaved: 1, otherOrUnknown: 0 });
    expect(home.sources).toEqual({
      fromPlay: { scores: 2, goals: 0, points: 2, total: 2 },
      placedBalls: { scores: 3, goals: 0, points: 4, total: 4 },
    });
    expect(Object.fromEntries(home.markers.map((m) => [m.id, [m.outcome, m.scoreSource]]))).toEqual({
      e01: ["POINT", "PLAY"], e08: ["POST", null], e10: ["POINT", "PLACED"], e14: ["TWO_POINT", "PLACED"],
      e22: ["WIDE", null], e29: ["BLOCKED", null], e31: ["POINT", "PLACED"], e37: ["POINT", "PLAY"],
    });
  });

  it("Galbally", () => {
    expect(away.shooting).toEqual({ totalShots: 5, scoringShots: 4, missedShots: 1, accuracyPct: 80 });
    expect(away.scores).toEqual({
      goals: 0, onePointScores: 3, twoPointScores: 1, twoPointApplicable: true, pointsValue: 5, totalValue: 5,
    });
    expect(away.misses).toEqual({ wides: 1, short: 0, post: 0, blockedSaved: 0, otherOrUnknown: 0 });
    expect(away.sources).toEqual({
      fromPlay: { scores: 3, goals: 0, points: 4, total: 4 },
      placedBalls: { scores: 1, goals: 0, points: 1, total: 1 },
    });
    expect(away.markers.map((m) => m.id).sort()).toEqual(["e04", "e16", "e18", "e25", "e33"]);
  });

  it("places shots with each team attacking up — hand-computed positions", () => {
    // Home attacks RIGHT in 1H: no turn; px = ny, py = 1 − nx.
    const e01 = home.markers.find((m) => m.id === "e01")!.point!;
    expect(e01.px).toBeCloseTo(0.5271, 4);
    expect(e01.py).toBeCloseTo(1 - 0.9339, 4);
    // Away attacks LEFT in 1H: turned 180° first (nx 0.0928 → 0.9072, ny 0.5581 → 0.4419).
    const e04 = away.markers.find((m) => m.id === "e04")!.point!;
    expect(e04.px).toBeCloseTo(0.4419, 4);
    expect(e04.py).toBeCloseTo(0.0928, 4);
    // Every first-half shot of both teams lands in the top half of its own map here.
    expect([...home.markers, ...away.markers].every((m) => m.point!.py < 0.5)).toBe(true);
    expect(home.location).toMatchObject({ total: 8, plotted: 8, notPlotted: 0, note: null });
    expect(home.orientation.caption).toBe("Ballylanders attacking ↑ · first half");
  });

  it("each shot appears once, on its own team's map only", () => {
    const ids = [...home.markers, ...away.markers].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const SHOTS = new Set(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "WIDE", "SHOT", "FREE_SCORED", "FREE_MISSED"]);
    expect(ids.sort()).toEqual(HT_FIXTURE.events.filter((e) => SHOTS.has(e.kind)).map((e) => e.id).sort());
  });
});

// ─── Reconciliation with the established reports ────────────────────────────
function reconcile(m: ScoringMapView, scopeSrc: ReturnType<typeof mapSourceFromSavedMatch>) {
  const report = buildScopedMapReport(scopeSrc, m.scope);
  const side = m.team.side;
  const block = buildTeamSummaryBlock(report, side);
  const conv = viewShootingConversion(report, side);
  const dash = buildHtFtDashboardView(scopeSrc, m.scope);
  const dashTeam = side === "FOR" ? dash.home : dash.away;
  const placed = side === "FOR" ? report.placedBalls.for : report.placedBalls.opp;

  expect(m.shooting.totalShots).toBe(conv.den);
  expect(m.shooting.scoringShots).toBe(conv.num);
  expect(dashTeam.shooting.value).toBe(m.shooting.accuracyPct == null ? "—" : `${m.shooting.accuracyPct}%`);
  expect(m.scores.goals).toBe(block.goals);
  expect(m.scores.twoPointScores).toBe(block.twoPointers);
  expect(m.scores.totalValue).toBe(block.scoreTotal);
  expect(m.scores.totalValue).toBe(dashTeam.score.total);
  expect(m.misses.wides).toBe(block.wides);
  expect(m.misses.short).toBe(block.shotShort);
  expect(m.misses.post).toBe(block.shotPost);
  expect(m.misses.blockedSaved).toBe(block.shotBlock);
  expect(m.sources.placedBalls.scores).toBe(placed.scores);
  expect(m.sources.placedBalls.total).toBe(placed.points);
  // Internal identities: nothing lost or double-counted.
  expect(m.scores.goals + m.scores.onePointScores + m.scores.twoPointScores).toBe(m.shooting.scoringShots);
  expect(m.scores.onePointScores + 2 * m.scores.twoPointScores).toBe(m.scores.pointsValue);
  const missSum = m.misses.wides + m.misses.short + m.misses.post + m.misses.blockedSaved + m.misses.otherOrUnknown;
  expect(missSum).toBe(m.shooting.missedShots);
  expect(m.sources.fromPlay.scores + m.sources.placedBalls.scores).toBe(m.shooting.scoringShots);
  expect(m.sources.fromPlay.total + m.sources.placedBalls.total).toBe(m.scores.totalValue);
  expect(m.markers).toHaveLength(m.shooting.totalShots);
}

describe("reconciliation — HT and FT, Home and Away", () => {
  for (const [label, match] of [["HT match", htFixtureMatch()], ["FT match", ftFixtureMatch()]] as const) {
    for (const scope of ["HT", "FT"] as const) {
      for (const side of ["FOR", "OPP"] as const) {
        it(`${label} · ${scope} · ${side}`, () => {
          const src = mapSourceFromSavedMatch(match);
          reconcile(buildScoringMapView(src, side, scope), src);
        });
      }
    }
  }
});

describe("HT / FT scope", () => {
  const src = mapSourceFromSavedMatch(ftFixtureMatch());

  it("HT stays first-half only after the second half is recorded", () => {
    const htOnly = buildScoringMapView(mapSourceFromSavedMatch(htFixtureMatch()), "FOR", "HT");
    const htLater = buildScoringMapView(src, "FOR", "HT");
    expect(htLater.shooting).toEqual(htOnly.shooting);
    expect(htLater.markers).toEqual(htOnly.markers);
    expect(htLater.markers.every((m) => m.period === "1H")).toBe(true);
  });

  it("FT includes both halves; the same relative spot lands on the same map point in each half", () => {
    const ft = buildScoringMapView(src, "FOR", "FT");
    expect(ft.scopeLabel).toBe("FULL-TIME");
    expect(ft.shooting).toEqual({ totalShots: 16, scoringShots: 10, missedShots: 6, accuracyPct: 63 });
    expect(ft.scoreline.home.text).toBe("0-12");
    expect(ft.orientation.caption).toBe("Ballylanders attacking ↑ · both halves");
    for (const m of ft.markers.filter((x) => x.period === "1H")) {
      const twin = ft.markers.find((x) => x.id === `${m.id}-2h`)!;
      expect(twin.point!.px).toBeCloseTo(m.point!.px, 10);
      expect(twin.point!.py).toBeCloseTo(m.point!.py, 10);
    }
  });
});

describe("edge cases", () => {
  it("zero shots: no accuracy figure, no markers", () => {
    const m = view([ev("FREE_WON", "FOR"), ev("TURNOVER_WON", "FOR")], "FOR");
    expect(m.shooting).toEqual({ totalShots: 0, scoringShots: 0, missedShots: 0, accuracyPct: null });
    expect(m.markers).toEqual([]);
    expect(m.location).toMatchObject({ total: 0, notPlotted: 0, note: null });
  });

  it("shots but no scores: 0% is a real figure", () => {
    const m = view([ev("WIDE", "FOR", { tags: ["PLAY"] }), ev("SHOT", "FOR", { tags: ["SHORT"] })], "FOR");
    expect(m.shooting.accuracyPct).toBe(0);
    expect(m.misses).toMatchObject({ wides: 1, short: 1 });
  });

  it("only the selected team's shots are counted", () => {
    const events = [ev("POINT", "FOR", { tags: ["PLAY"] }), ev("GOAL", "OPP", { tags: ["PLAY"] })];
    expect(view(events, "FOR").markers.map((m) => m.outcome)).toEqual(["POINT"]);
    expect(view(events, "OPP").markers.map((m) => m.outcome)).toEqual(["GOAL"]);
  });

  it("scoring shots, one-pointers, two-pointers and points value stay distinct", () => {
    const m = view([
      ev("GOAL", "FOR", { tags: ["PLAY"] }),
      ev("POINT", "FOR", { tags: ["PLAY"] }),
      ev("POINT", "FOR", { tags: ["MARK"] }),
      ev("TWO_POINTER", "FOR", { tags: ["PLAY"] }),
      ev("FORTY_FIVE_TWO_POINT", "FOR", { tags: ["45"] }),
    ], "FOR");
    expect(m.shooting.scoringShots).toBe(5);
    expect(m.scores).toMatchObject({ goals: 1, onePointScores: 2, twoPointScores: 2, pointsValue: 6, totalValue: 9 });
    expect(m.scoreline.home.text).toBe("1-06");
    expect(m.sources.placedBalls).toEqual({ scores: 2, goals: 0, points: 3, total: 3 });
    expect(m.sources.fromPlay).toEqual({ scores: 3, goals: 1, points: 3, total: 6 });
  });

  it("hurling and camogie have no two-point score; football and ladies football do", () => {
    const events = [ev("POINT", "FOR", { tags: ["65"] }), ev("GOAL", "FOR", { tags: ["PLAY"] })];
    const want: Record<ProTaggerSport, boolean> = { gaelic: true, ladies_football: true, hurling: false, camogie: false };
    for (const sport of Object.keys(want) as ProTaggerSport[]) {
      const m = view(events, "FOR", "FT", { sport });
      expect(m.scores.twoPointApplicable).toBe(want[sport]);
      expect(m.scores.twoPointScores).toBe(0);
      expect(m.sources.placedBalls.scores).toBe(1); // a 65 is a placed ball
    }
  });

  it("a non-scoring shot with no recorded outcome is 'other', never guessed", () => {
    const m = view([ev("SHOT", "FOR", { tags: [] }), ev("SHOT", "FOR", { tags: ["FREE"] })], "FOR");
    expect(m.misses).toEqual({ wides: 0, short: 0, post: 0, blockedSaved: 0, otherOrUnknown: 2 });
    expect(m.markers.every((x) => x.outcome === "OTHER" && x.scoreSource === null)).toBe(true);
  });

  it("invalid coordinates: counted, not plotted, with an honest note", () => {
    const m = view([
      ev("POINT", "FOR", { tags: ["PLAY"], nx: 0.9, ny: 0.4 }),
      ev("POINT", "FOR", { tags: ["PLAY"], nx: Number.NaN, ny: Number.NaN, x: Number.NaN, y: Number.NaN }),
      ev("WIDE", "FOR", { tags: ["PLAY"], nx: 3, ny: 0.4, x: 3, y: 0.4 }),
    ], "FOR");
    expect(m.shooting.totalShots).toBe(3);
    expect(m.markers.filter((x) => x.point == null)).toHaveLength(2);
    expect(m.location).toMatchObject({ total: 3, plotted: 1, notPlotted: 2, note: "2 of 3 not shown on the map — location not recorded" });
  });

  it("missing direction (older saved match): positions as captured, explicit caption", () => {
    const base = savedMatch({ events: HT_FIXTURE.events });
    const legacy = { ...base, restoreContext: { ...base.restoreContext, firstHalfAttackingDirection: undefined as never } };
    const m = buildScoringMapView(mapSourceFromSavedMatch(legacy), "OPP", "FT");
    expect(m.orientation.status).toBe("AS_CAPTURED");
    expect(m.orientation.caption).toBe("Attack direction not recorded — positions shown as captured");
    const e04 = m.markers.find((x) => x.id === "e04")!.point!;
    expect(e04.px).toBeCloseTo(0.5581, 4);   // not turned
    expect(e04.py).toBeCloseTo(1 - 0.0928, 4);
    expect(m.shooting.totalShots).toBe(5);    // statistics unaffected
  });

  it("repeated coordinates: every shot keeps its own marker", () => {
    const m = view([
      ev("POINT", "FOR", { tags: ["PLAY"], nx: 0.8, ny: 0.5 }),
      ev("WIDE", "FOR", { tags: ["PLAY"], nx: 0.8, ny: 0.5 }),
      ev("POINT", "FOR", { tags: ["FREE"], nx: 0.8, ny: 0.5 }),
    ], "FOR");
    expect(m.markers).toHaveLength(3);
    expect(new Set(m.markers.map((x) => JSON.stringify(x.point))).size).toBe(1);
  });

  it("an event edited in Review is counted as edited", () => {
    const point = ev("POINT", "FOR", { tags: ["PLAY"] });
    const edit = applyReviewKindEdit(point, "WIDE", "gaelic", false, { home: "h", away: "a" });
    expect(edit.ok).toBe(true);
    const m = view([edit.event!], "FOR");
    expect(m.shooting).toMatchObject({ totalShots: 1, scoringShots: 0 });
    expect(m.misses.wides).toBe(1);
  });

  it("long Irish names with fadas pass through untouched", () => {
    const name = "Cumann Lúthchleas Gael Ó Donnabháin Rossa";
    const m = view([ev("POINT", "OPP", { tags: ["PLAY"] })], "OPP", "FT", { awayTeamName: name });
    expect(m.team.name).toBe(name);
    expect(m.orientation.caption).toBe(`${name} attacking ↑ · both halves`);
    expect(m.scoreline.awayName).toBe(name);
  });
});

describe("purity", () => {
  it("never mutates the saved match and returns a serialisable, deterministic model", () => {
    const match = deepFreeze(ftFixtureMatch());
    const before = JSON.stringify(match);
    const src = mapSourceFromSavedMatch(match);
    const a = buildScoringMapView(src, "OPP", "FT");
    const b = buildScoringMapView(src, "OPP", "FT");
    expect(JSON.stringify(match)).toBe(before);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});
