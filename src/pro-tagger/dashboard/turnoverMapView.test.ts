// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { buildQuickReviewMatchOverview } from "../../stats/reporting/quickReviewMatchOverview";
import { buildTeamSummaryBlock, viewMirroredCountsForTeam } from "../../stats/reporting/teamStatsViews";
import { toEventStatsReportEvents } from "../pro-tagger-review-adapter";
import { applyReviewKindEdit } from "../pro-tagger-review-edit";
import type { ProTaggerSport } from "../pro-tagger-session";
import { buildHtFtDashboardView } from "./htFtDashboardView";
import { buildScopedMapReport, mapSourceFromSavedMatch, otherSide, type MapTeamSide } from "./matchMapPerspective";
import { HT_FIXTURE, deepFreeze, ev, ftFixtureMatch, htFixtureMatch, savedMatch } from "./matchMapTestFixtures";
import { buildScoringMapView } from "./scoringMapView";
import {
  UNKNOWN_METHOD_LABEL,
  buildTurnoverMapView,
  turnoverMethodLabel,
  turnoverMethodOf,
  type TurnoverMapView,
  type TurnoverMethod,
} from "./turnoverMapView";

function view(events: readonly LoggedMatchEvent[], side: MapTeamSide, scope: "HT" | "FT" = "FT", over: Partial<Parameters<typeof savedMatch>[0]> = {}) {
  return buildTurnoverMapView(mapSourceFromSavedMatch(savedMatch({ ...over, events })), side, scope);
}

const methodCounts = (rows: TurnoverMapView["methods"]["won"]) =>
  Object.fromEntries(rows.filter((r) => r.count > 0).map((r) => [r.label, r.count]));

// ─── Real fixture, independently derived expectations ───────────────────────
// Hand-read from ballylanders-galbally-2026-11-07-ht.json — all 8 turnovers
// stored as teamSide FOR / team HOME:
//   TURNOVER_WON  (Ballylanders won):  e21 KP ERROR, e28 TACKLE, e36 TACKLE
//   TURNOVER_LOST (Ballylanders lost): e06 KP ERROR, e12 HP ERROR, e20 TACKLE,
//                                      e27 KP ERROR, e35 HP ERROR
describe("Turnover Map — real first half, both teams", () => {
  const src = mapSourceFromSavedMatch(deepFreeze(htFixtureMatch()));
  const home = buildTurnoverMapView(src, "FOR", "HT");
  const away = buildTurnoverMapView(src, "OPP", "HT");

  it("Ballylanders: won 3, lost 5", () => {
    expect(home.team).toMatchObject({ role: "HOME", name: "Ballylanders" });
    expect(home.totals).toEqual({ won: 3, lost: 5, balance: -2, total: 8 });
    expect(methodCounts(home.methods.won)).toEqual({ "Tackle": 2, "Opposition KP Error": 1 });
    expect(methodCounts(home.methods.lost)).toEqual({ "KP Error": 2, "HP Error": 2, "Dispossessed": 1 });
  });

  it("Galbally: the mirror — won 5, lost 3, with its own side's labels", () => {
    expect(away.team).toMatchObject({ role: "AWAY", name: "Galbally" });
    expect(away.totals).toEqual({ won: 5, lost: 3, balance: 2, total: 8 });
    expect(methodCounts(away.methods.won)).toEqual({ "Opposition KP Error": 2, "Opposition HP Error": 2, "Tackle": 1 });
    expect(methodCounts(away.methods.lost)).toEqual({ "Dispossessed": 2, "KP Error": 1 });
  });

  it("every turnover appears exactly once on each map, outcome reversed", () => {
    const ids = HT_FIXTURE.events.filter((e) => e.kind.startsWith("TURNOVER")).map((e) => e.id).sort();
    expect(home.markers.map((m) => m.id).sort()).toEqual(ids);
    expect(away.markers.map((m) => m.id).sort()).toEqual(ids);
    for (const h of home.markers) {
      const a = away.markers.find((m) => m.id === h.id)!;
      expect(a.outcome).toBe(h.outcome === "WON" ? "LOST" : "WON");
      expect(a.method).toBe(h.method);
    }
    expect(Object.fromEntries(home.markers.map((m) => [m.id, `${m.outcome} ${m.methodLabel}`]))).toEqual({
      e06: "LOST KP Error", e12: "LOST HP Error", e20: "LOST Dispossessed", e21: "WON Opposition KP Error",
      e27: "LOST KP Error", e28: "WON Tackle", e35: "LOST HP Error", e36: "WON Tackle",
    });
    expect(Object.fromEntries(away.markers.map((m) => [m.id, `${m.outcome} ${m.methodLabel}`]))).toEqual({
      e06: "WON Opposition KP Error", e12: "WON Opposition HP Error", e20: "WON Tackle", e21: "LOST KP Error",
      e27: "WON Opposition KP Error", e28: "LOST Dispossessed", e35: "WON Opposition HP Error", e36: "LOST Dispossessed",
    });
  });

  it("same physical spot, each team's own orientation — hand-computed (e28: nx 0.6708, ny 0.9189)", () => {
    const h = home.markers.find((m) => m.id === "e28")!.point!;
    const a = away.markers.find((m) => m.id === "e28")!.point!;
    // Home attacks RIGHT in 1H → no turn: px = ny, py = 1 − nx.
    expect(h.px).toBeCloseTo(0.9189, 4);
    expect(h.py).toBeCloseTo(0.3292, 4);
    // Away attacks LEFT in 1H → turned 180° first.
    expect(a.px).toBeCloseTo(0.0811, 4);
    expect(a.py).toBeCloseTo(0.6708, 4);
    expect(home.location).toMatchObject({ total: 8, plotted: 8, note: null });
  });

  it("records the recorded half and clock for each turnover", () => {
    const e21 = home.markers.find((m) => m.id === "e21")!;
    expect(e21.period).toBe("1H");
    expect(e21.clockSeconds).toBe(362);
  });
});

// ─── Reconciliation with the established reports ────────────────────────────
function count(rows: TurnoverMapView["methods"]["won"], ...methods: TurnoverMethod[]) {
  return rows.filter((r) => methods.includes(r.method)).reduce((s, r) => s + r.count, 0);
}

function reconcile(m: TurnoverMapView, src: ReturnType<typeof mapSourceFromSavedMatch>) {
  const report = buildScopedMapReport(src, m.scope);
  const side = m.team.side;
  const own = buildTeamSummaryBlock(report, side);
  const opp = buildTeamSummaryBlock(report, otherSide(side));
  const mirrored = viewMirroredCountsForTeam(report, side);
  const dash = buildHtFtDashboardView(src, m.scope);

  expect(m.totals.won).toBe(own.toWon);
  expect(m.totals.lost).toBe(own.toLost);
  expect(m.totals.won).toBe(mirrored.turnoversWon);
  expect(m.totals.lost).toBe(mirrored.turnoversLost);
  expect(String(m.totals.won)).toBe((side === "FOR" ? dash.home : dash.away).turnoversWon.value);
  // Every turnover in scope, once.
  expect(m.totals.total).toBe(report.events.filter((e) => e.kind === "TURNOVER_WON" || e.kind === "TURNOVER_LOST").length);
  expect(count(m.methods.won, "TACKLE","INTERCEPTION", "HP_ERROR", "KP_ERROR", "OVERCARRIED", "UNKNOWN")).toBe(m.totals.won);
  expect(count(m.methods.lost, "TACKLE", "INTERCEPTION", "HP_ERROR", "KP_ERROR", "OVERCARRIED", "UNKNOWN")).toBe(m.totals.lost);
  // Methods against buildTeamSummaryBlock's grouped (and mirrored) totals.
  expect(count(m.methods.won, "TACKLE")).toBe(own.toTacklePress);
  expect(count(m.methods.won, "INTERCEPTION")).toBe(own.toSwarmInt);
  expect(count(m.methods.lost, "HP_ERROR", "KP_ERROR")).toBe(own.toSlackKpHp);
  expect(count(m.methods.lost, "OVERCARRIED")).toBe(own.toOcStripped);
  expect(count(m.methods.won, "HP_ERROR", "KP_ERROR")).toBe(opp.toSlackKpHp);
  expect(count(m.methods.won, "OVERCARRIED")).toBe(opp.toOcStripped);
  expect(count(m.methods.lost, "TACKLE")).toBe(opp.toTacklePress);
  expect(count(m.methods.lost, "INTERCEPTION")).toBe(opp.toSwarmInt);
}

describe("reconciliation — HT and FT, Home and Away", () => {
  for (const [label, match] of [["HT match", htFixtureMatch()], ["FT match", ftFixtureMatch()]] as const) {
    for (const scope of ["HT", "FT"] as const) {
      for (const side of ["FOR", "OPP"] as const) {
        it(`${label} · ${scope} · ${side}`, () => {
          const src = mapSourceFromSavedMatch(match);
          const m = buildTurnoverMapView(src, side, scope);
          reconcile(m, src);
          const other = buildTurnoverMapView(src, otherSide(side), scope);
          expect(m.totals.won).toBe(other.totals.lost);
          expect(m.totals.lost).toBe(other.totals.won);
        });
      }
    }
  }

  it("matches Quick Review's Home turnover counts (independent builder)", () => {
    const m = ftFixtureMatch();
    const qr = buildQuickReviewMatchOverview(toEventStatsReportEvents(m.events), m.homeTeamName, m.awayTeamName);
    const src = mapSourceFromSavedMatch(m);
    expect(buildTurnoverMapView(src, "FOR", "FT").totals).toMatchObject({ won: qr.turnovers.won.count, lost: qr.turnovers.lost.count });
    expect(buildTurnoverMapView(src, "OPP", "FT").totals).toMatchObject({ won: qr.turnovers.lost.count, lost: qr.turnovers.won.count });
    expect(qr.turnovers.won.count).toBe(6);
    expect(qr.turnovers.lost.count).toBe(10);
  });
});

describe("HT / FT scope", () => {
  it("HT stays first-half only after the second half is recorded; FT has both halves", () => {
    const src = mapSourceFromSavedMatch(ftFixtureMatch());
    const ht = buildTurnoverMapView(src, "OPP", "HT");
    expect(ht.totals).toEqual({ won: 5, lost: 3, balance: 2, total: 8 });
    expect(ht.markers.every((m) => m.period === "1H")).toBe(true);
    const ft = buildTurnoverMapView(src, "OPP", "FT");
    expect(ft.totals).toEqual({ won: 10, lost: 6, balance: 4, total: 16 });
    // Second-half copies are the same spot relative to the teams' ends → same map point.
    for (const m of ft.markers.filter((x) => x.period === "1H")) {
      const twin = ft.markers.find((x) => x.id === `${m.id}-2h`)!;
      expect(twin.point!.px).toBeCloseTo(m.point!.px, 10);
      expect(twin.point!.py).toBeCloseTo(m.point!.py, 10);
      expect(twin.outcome).toBe(m.outcome);
    }
  });
});

describe("methods", () => {
  it("matches stored tags whatever their case, spacing or underscores", () => {
    expect(turnoverMethodOf(["tackle"])).toBe("TACKLE");
    expect(turnoverMethodOf(["  Hp_Error "])).toBe("HP_ERROR");
    expect(turnoverMethodOf(["kp  error"])).toBe("KP_ERROR");
    expect(turnoverMethodOf(["Interception", "INTERCEPT"])).toBe("INTERCEPTION"); // stored + canonical alias
    expect(turnoverMethodOf(["OVERCARRIED"])).toBe("OVERCARRIED");
    expect(turnoverMethodOf(["SLACK_HAND_PASS"])).toBe("HP_ERROR");
  });

  it("never invents a method: none, unknown or conflicting tags → unknown", () => {
    for (const tags of [undefined, null, [], ["PRESS"], ["STRIPPED"], [7], ["TACKLE", "KP ERROR"]]) {
      expect(turnoverMethodOf(tags as never)).toBe("UNKNOWN");
    }
  });

  it("uses the capture grid's own row labels", () => {
    const want: Record<Exclude<TurnoverMethod, "UNKNOWN">, [string, string]> = {
      TACKLE: ["Tackle", "Dispossessed"],
      INTERCEPTION: ["Interception", "Intercepted"],
      HP_ERROR: ["Opposition HP Error", "HP Error"],
      KP_ERROR: ["Opposition KP Error", "KP Error"],
      OVERCARRIED: ["Opposition Overcarried", "Overcarried"],
    };
    for (const sport of ["gaelic", "ladies_football", "hurling", "camogie"] as ProTaggerSport[]) {
      for (const [method, [won, lost]] of Object.entries(want)) {
        expect(turnoverMethodLabel(method as TurnoverMethod, "WON", sport)).toBe(won);
        expect(turnoverMethodLabel(method as TurnoverMethod, "LOST", sport)).toBe(lost);
      }
      expect(turnoverMethodLabel("UNKNOWN", "WON", sport)).toBe(UNKNOWN_METHOD_LABEL);
    }
  });

  it("an unknown method keeps the turnover in its won / lost total", () => {
    const m = view([ev("TURNOVER_WON", "FOR", { tags: [] }), ev("TURNOVER_LOST", "FOR", { tags: ["PRESS"] })], "OPP");
    expect(m.totals).toEqual({ won: 1, lost: 1, balance: 0, total: 2 });
    expect(methodCounts(m.methods.won)).toEqual({ "Method not recorded": 1 });
    expect(methodCounts(m.methods.lost)).toEqual({ "Method not recorded": 1 });
  });

  it("method rows always list every method, in order, zeros included", () => {
    const m = view([], "FOR");
    expect(m.methods.won.map((r) => r.method)).toEqual(["TACKLE", "INTERCEPTION", "HP_ERROR", "KP_ERROR", "OVERCARRIED", "UNKNOWN"]);
    expect(m.methods.won.every((r) => r.count === 0)).toBe(true);
  });
});

describe("edge cases", () => {
  it("zero turnovers", () => {
    const m = view([ev("POINT", "FOR", { tags: ["PLAY"] })], "FOR");
    expect(m.totals).toEqual({ won: 0, lost: 0, balance: 0, total: 0 });
    expect(m.markers).toEqual([]);
    expect(m.location.note).toBeNull();
  });

  it("older data with turnovers stored under the opposition's side still resolves the winner", () => {
    // Match Stats-style: an OPP-recorded TURNOVER_WON means the Away team won the ball.
    const events = [ev("TURNOVER_WON", "OPP", { tags: ["INTERCEPT"] }), ev("TURNOVER_LOST", "OPP", { tags: ["SLACK_KICK_PASS"] })];
    const away = view(events, "OPP");
    const home = view(events, "FOR");
    expect(away.markers.map((x) => `${x.outcome} ${x.methodLabel}`)).toEqual(["WON Interception", "LOST KP Error"]);
    expect(home.markers.map((x) => `${x.outcome} ${x.methodLabel}`)).toEqual(["LOST Intercepted", "WON Opposition KP Error"]);
  });

  it("a turnover edited in Review from won to lost flips on both maps", () => {
    const won = ev("TURNOVER_WON", "FOR", { tags: ["TACKLE"] });
    const edit = applyReviewKindEdit(won, "TURNOVER_LOST", "gaelic", true, { home: "h", away: "a" });
    expect(edit.ok).toBe(true);
    expect(view([edit.event!], "FOR").markers[0]).toMatchObject({ outcome: "LOST", methodLabel: "Dispossessed" });
    expect(view([edit.event!], "OPP").markers[0]).toMatchObject({ outcome: "WON", methodLabel: "Tackle" });
  });

  it("invalid coordinates: counted, not plotted, with a note", () => {
    const m = view([
      ev("TURNOVER_WON", "FOR", { tags: ["TACKLE"], nx: 0.4, ny: 0.4 }),
      ev("TURNOVER_LOST", "FOR", { tags: ["TACKLE"], nx: Number.NaN, ny: 0.4, x: Number.NaN, y: 0.4 }),
    ], "OPP");
    expect(m.totals.total).toBe(2);
    expect(m.location).toMatchObject({ plotted: 1, notPlotted: 1, note: "1 of 2 not shown on the map — location not recorded" });
  });

  it("missing direction: same captured position on both teams' maps, explicit caption", () => {
    const base = savedMatch({ events: HT_FIXTURE.events });
    const legacy = { ...base, restoreContext: { ...base.restoreContext, firstHalfAttackingDirection: "" as never } };
    const src = mapSourceFromSavedMatch(legacy);
    const h = buildTurnoverMapView(src, "FOR", "FT");
    const a = buildTurnoverMapView(src, "OPP", "FT");
    expect(a.orientation.status).toBe("AS_CAPTURED");
    expect(h.markers.map((x) => x.point)).toEqual(a.markers.map((x) => x.point));
    expect(h.totals).toEqual({ won: 3, lost: 5, balance: -2, total: 8 });
  });

  it("repeated coordinates keep a marker each", () => {
    const m = view([0, 1, 2].map(() => ev("TURNOVER_WON", "FOR", { tags: ["TACKLE"], nx: 0.3, ny: 0.3 })), "FOR");
    expect(m.markers).toHaveLength(3);
  });

  it("hurling uses the same turnover semantics and labels", () => {
    const m = view([ev("TURNOVER_LOST", "FOR", { tags: ["HP ERROR"] })], "OPP", "FT", { sport: "hurling" });
    expect(m.markers[0]).toMatchObject({ outcome: "WON", methodLabel: "Opposition HP Error" });
  });
});

describe("purity and storage safety", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never mutates input, never writes storage, returns serialisable deterministic models", () => {
    window.localStorage.clear();
    window.localStorage.setItem("pitchflow_pro_tagger_matches_v1", "[\"sentinel\"]");
    const before = { ...window.localStorage };
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");

    const match = deepFreeze(ftFixtureMatch());
    const json = JSON.stringify(match);
    const src = mapSourceFromSavedMatch(match);
    for (const side of ["FOR", "OPP"] as const) {
      for (const scope of ["HT", "FT"] as const) {
        const t = buildTurnoverMapView(src, side, scope);
        const s = buildScoringMapView(src, side, scope);
        expect(buildTurnoverMapView(src, side, scope)).toEqual(t);
        expect(JSON.parse(JSON.stringify(t))).toEqual(t);
        expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      }
    }
    expect(JSON.stringify(match)).toBe(json);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect({ ...window.localStorage }).toEqual(before);
  });
});

describe("FT half subtotals", () => {
  it("match viewMirroredCountsForTeam over 1H / 2H-scoped reports, for both teams", async () => {
    const { buildMatchReport } = await import("../../stats/reporting/matchReport");
    const match = ftFixtureMatch();
    const src = mapSourceFromSavedMatch(match);
    for (const side of ["FOR", "OPP"] as const) {
      const m = buildTurnoverMapView(src, side, "FT");
      for (const [period, half] of [["1H", m.halves!.firstHalf], ["2H", m.halves!.secondHalf]] as const) {
        const rep = buildMatchReport({ events: toEventStatsReportEvents(match.events), homeTeam: match.homeTeamName, awayTeam: match.awayTeamName, scope: period });
        const mir = viewMirroredCountsForTeam(rep, side);
        expect(half).toEqual({ won: mir.turnoversWon, lost: mir.turnoversLost });
      }
    }
    expect(buildTurnoverMapView(src, "OPP", "FT").halves).toEqual({ firstHalf: { won: 5, lost: 3 }, secondHalf: { won: 5, lost: 3 } });
  });

  it("are absent at HT, and absent when any turnover's half is not recorded", () => {
    expect(buildTurnoverMapView(mapSourceFromSavedMatch(ftFixtureMatch()), "FOR", "HT").halves).toBeNull();
    const m = view([ev("TURNOVER_WON", "FOR", { tags: ["TACKLE"], period: undefined as never })], "FOR", "FT");
    expect(m.halves).toBeNull();
    expect(m.totals.won).toBe(1);
  });
});

describe("Turnover Map captions and thirds", () => {
  it("captions say the view is team-relative, without implying a physical end", () => {
    const src = mapSourceFromSavedMatch(ftFixtureMatch());
    for (const side of ["FOR", "OPP"] as const) {
      expect(buildTurnoverMapView(src, side, "HT").orientation.caption).toBe("Team-relative view · first half");
      expect(buildTurnoverMapView(src, side, "FT").orientation.caption).toBe("Team-relative view · both halves combined");
    }
  });

  it("missing direction keeps the AS_CAPTURED fallback and says thirds are not shown", () => {
    const base = savedMatch({ events: HT_FIXTURE.events });
    const src = mapSourceFromSavedMatch({ ...base, restoreContext: { ...base.restoreContext, firstHalfAttackingDirection: undefined as never } });
    expect(buildTurnoverMapView(src, "FOR", "FT").orientation).toEqual({
      status: "AS_CAPTURED",
      homeFirstHalfDirection: null,
      caption: "Attack direction not recorded — positions shown as captured; thirds not shown",
    });
  });

  it("real first half: where each team won and lost the ball, by third (hand-checked from the fixture)", async () => {
    const { pitchThirdOf } = await import("./matchMapPerspective");
    const src = mapSourceFromSavedMatch(htFixtureMatch());
    const byThird = (side: "FOR" | "OPP") =>
      Object.fromEntries(buildTurnoverMapView(src, side, "HT").markers.map((m) => [m.id, `${m.outcome} ${pitchThirdOf(m.point!)}`]));
    // Home attacked nx = 1 (RIGHT) in the first half. Thirds of nx: < 1/3 defensive, < 2/3 middle, else attacking.
    //   e06 nx .389 · e12 .664 · e20 .556 · e21 .293 · e27 .549 · e28 .671 · e35 .487 · e36 .584
    expect(byThird("FOR")).toEqual({
      e06: "LOST MIDDLE", e12: "LOST MIDDLE", e20: "LOST MIDDLE", e21: "WON DEFENSIVE",
      e27: "LOST MIDDLE", e28: "WON ATTACKING", e35: "LOST MIDDLE", e36: "WON MIDDLE",
    });
    // Galbally sees the same events from the other end: outcome and third both reversed.
    expect(byThird("OPP")).toEqual({
      e06: "WON MIDDLE", e12: "WON MIDDLE", e20: "WON MIDDLE", e21: "LOST ATTACKING",
      e27: "WON MIDDLE", e28: "LOST DEFENSIVE", e35: "WON MIDDLE", e36: "LOST MIDDLE",
    });
  });

  it("won / lost and method totals are unchanged by the overlay work", () => {
    const src = mapSourceFromSavedMatch(htFixtureMatch());
    expect(buildTurnoverMapView(src, "FOR", "HT").totals).toEqual({ won: 3, lost: 5, balance: -2, total: 8 });
    expect(buildTurnoverMapView(src, "OPP", "HT").totals).toEqual({ won: 5, lost: 3, balance: 2, total: 8 });
  });
});
