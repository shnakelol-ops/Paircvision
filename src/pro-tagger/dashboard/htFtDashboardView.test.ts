import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { buildMatchReport } from "../../stats/reporting/matchReport";
import { buildSnapshotDashboardModel } from "../../stats/reporting/snapshotDashboardModel";
import { toEventStatsReportEvents } from "../pro-tagger-review-adapter";
import { computeScoreSide } from "../pro-tagger-score";
import type { ProTaggerSavedMatch } from "../pro-tagger-storage";
import {
  DASHBOARD_BG,
  MIN_BG_CONTRAST,
  NO_VALUE,
  buildHtFtDashboardView,
  contrastRatio,
  dashboardAvailability,
  dashboardFilename,
  dashboardSourceFromSavedMatch,
  readableTextOn,
  teamMonogram,
  type HtFtDashboardSource,
} from "./htFtDashboardView";

let seq = 0;

// Real first-half Event Stats data (Ballylanders v Galbally, 7 Nov 2026).
const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../stats/reporting/fixtures/ballylanders-galbally-2026-11-07-ht.json", import.meta.url)),
    "utf8",
  ),
) as { scorelineSnapshot: string; events: LoggedMatchEvent[] };
const FIRST_HALF = FIXTURE.events;
// A second half that differs from the first: same events, second half, with
// extra Ballylanders scores so HT and FT figures cannot coincide.
const SECOND_HALF: LoggedMatchEvent[] = [
  ...FIRST_HALF.map((e) => ({ ...e, id: `${e.id}-2h`, period: "2H" as const, half: 2 as const })),
  ev("2h-goal", "GOAL", "FOR", "2H"),
  ev("2h-pt", "POINT", "FOR", "2H"),
];

function ev(
  id: string,
  kind: LoggedMatchEvent["kind"],
  teamSide: "FOR" | "OPP",
  period: "1H" | "2H" = "1H",
  extra: Partial<LoggedMatchEvent> = {},
): LoggedMatchEvent {
  seq += 1;
  return {
    id,
    kind,
    type: kind,
    teamSide,
    period,
    half: period === "1H" ? 1 : 2,
    nx: 0.5,
    ny: 0.5,
    x: 0.5,
    y: 0.5,
    segment: 1,
    timestamp: seq,
    matchClockSeconds: seq,
    createdAt: seq,
    ...extra,
  } as LoggedMatchEvent;
}

function source(events: readonly LoggedMatchEvent[], over: Partial<HtFtDashboardSource> = {}): HtFtDashboardSource {
  return {
    events,
    matchState: "FULL_TIME",
    sport: "gaelic",
    homeTeamName: "Ballylanders",
    awayTeamName: "Galbally",
    venue: "Ballylanders GAA Grounds",
    matchType: "league",
    createdAt: new Date(2026, 10, 7, 14, 0).getTime(),
    homeColours: { primary: "#facc15", secondary: "#15803d" },
    awayColours: { primary: "#7f1d1d", secondary: "#ffffff" },
    ...over,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

describe("dashboard availability", () => {
  it.each([
    ["PRE_MATCH", false, false],
    ["FIRST_HALF", false, false],
    ["HALF_TIME", true, false],
    ["SECOND_HALF", true, false],
    ["FULL_TIME", true, true],
  ] as const)("%s → HT %s, FT %s", (state, ht, ft) => {
    expect(dashboardAvailability(state)).toEqual({ ht, ft });
  });
});

describe("HT vs FT scope", () => {
  const all = [...FIRST_HALF, ...SECOND_HALF];

  it("HT matches the recorded half-time scoreline of the real fixture", () => {
    const view = buildHtFtDashboardView(source(FIRST_HALF, { matchState: "HALF_TIME" }), "HT");
    expect(`${view.home.scoreText} – ${view.away.scoreText}`).toBe(FIXTURE.scorelineSnapshot);
  });

  it("HT uses first-half data only, even when second-half events exist", () => {
    const ht = buildHtFtDashboardView(source(all), "HT");
    const htOnly = buildHtFtDashboardView(source(FIRST_HALF), "HT");
    expect(ht.home).toEqual(htOnly.home);
    expect(ht.away).toEqual(htOnly.away);
    expect(ht.home.score).toEqual(computeScoreSide(FIRST_HALF, "FOR"));
    expect(ht.away.score).toEqual(computeScoreSide(FIRST_HALF, "OPP"));
  });

  it("FT uses the complete match", () => {
    const ft = buildHtFtDashboardView(source(all), "FT");
    expect(ft.home.score).toEqual(computeScoreSide(all, "FOR"));
    expect(ft.away.score).toEqual(computeScoreSide(all, "OPP"));
    const ht = buildHtFtDashboardView(source(all), "HT");
    expect(ft.home.score.total).toBeGreaterThan(ht.home.score.total);
    expect(ft.home.shooting.detail).not.toBe(ht.home.shooting.detail);
  });

  it("every figure equals the Snapshot PDF dashboard model built from the same scope", () => {
    for (const period of ["HT", "FT"] as const) {
      const scoped = period === "HT" ? all.filter((e) => e.period === "1H") : all;
      const model = buildSnapshotDashboardModel(
        buildMatchReport({
          events: toEventStatsReportEvents(scoped),
          homeTeam: "Ballylanders",
          awayTeam: "Galbally",
          scope: period === "HT" ? "1H" : "FULL",
        }),
        period,
      );
      const view = buildHtFtDashboardView(source(all), period);
      for (const [side, team] of [["home", model.us], ["away", model.them]] as const) {
        const v = view[side];
        expect(v.score).toEqual(team.score);
        expect(v.shooting.detail).toBe(`${team.shooting.num} of ${team.shooting.den} shots scored`);
        expect(v.shooting.value).toBe(`${team.shooting.pct}%`);
        expect(v.restarts.detail).toBe(`${team.ownKickouts.retained} of ${team.ownKickouts.total} retained`);
        expect(v.restarts.value).toBe(`${team.ownKickouts.pct}%`);
        expect(v.turnoversWon.value).toBe(String(team.turnovers.won));
      }
    }
  });

  it("HT margin names the leading team (attribution rule) or says Level", () => {
    expect(buildHtFtDashboardView(source(FIRST_HALF), "HT").marginText).toBe("Ballylanders lead by 1");
    const level = [ev("l1", "POINT", "FOR"), ev("l2", "POINT", "OPP")];
    expect(buildHtFtDashboardView(source(level), "HT").marginText).toBe("Level");
  });

  it("FT result names the winning team, or says Draw", () => {
    expect(buildHtFtDashboardView(source([ev("g", "GOAL", "OPP")]), "FT").marginText).toBe("Galbally won by 3");
    expect(buildHtFtDashboardView(source([ev("p", "POINT", "FOR")]), "FT").marginText).toBe("Ballylanders won by 1");
    expect(buildHtFtDashboardView(source([ev("l1", "POINT", "FOR"), ev("l2", "POINT", "OPP")]), "FT").marginText).toBe("Draw");
  });
});

describe("football scoring and two-pointers", () => {
  const events = [
    ev("g", "GOAL", "FOR"),
    ev("p", "POINT", "FOR"),
    ev("tp", "TWO_POINTER", "FOR"),
    ev("ftp", "FORTY_FIVE_TWO_POINT", "FOR"),
    ev("fs", "FREE_SCORED", "OPP"),
    ev("w", "WIDE", "OPP"),
  ];

  it("counts two-pointers as 2 points and agrees with the live scoreboard", () => {
    const view = buildHtFtDashboardView(source(events), "FT");
    expect(view.home.score).toEqual({ goals: 1, points: 5, total: 8 });
    expect(view.home.score).toEqual(computeScoreSide(events, "FOR"));
    expect(view.away.score).toEqual(computeScoreSide(events, "OPP"));
    expect(view.home.scoreText).toBe("1-05");
    expect(view.home.totalText).toBe("(8)");
    expect(view.away.scoreText).toBe("0-01");
  });

  it("shooting counts each score once (scores from shots, not points)", () => {
    const view = buildHtFtDashboardView(source(events), "FT");
    expect(view.home.shooting).toEqual({ value: "100%", detail: "4 of 4 shots scored", ratio: 1 });
    expect(view.away.shooting).toEqual({ value: "50%", detail: "1 of 2 shots scored", ratio: 0.5 });
  });
});

describe("sport terminology", () => {
  it.each([
    ["gaelic", "Own kickouts retained"],
    ["ladies_football", "Own kickouts retained"],
    ["hurling", "Own puckouts retained"],
    ["camogie", "Own puckouts retained"],
  ] as const)("%s → %s", (sport, title) => {
    expect(buildHtFtDashboardView(source(FIRST_HALF, { sport }), "HT").restartTitle).toBe(title);
  });

  it("hurling scores are goals and points", () => {
    const events = [ev("g", "GOAL", "FOR"), ev("p1", "POINT", "FOR"), ev("p2", "POINT", "FOR"), ev("p3", "POINT", "OPP")];
    const view = buildHtFtDashboardView(source(events, { sport: "hurling" }), "FT");
    expect(view.home.scoreText).toBe("1-02");
    expect(view.home.totalText).toBe("(5)");
    expect(view.away.scoreText).toBe("0-01");
  });

  it("an empty-restart line uses the sport's own word", () => {
    const view = buildHtFtDashboardView(source([], { sport: "camogie" }), "FT");
    expect(view.home.restarts.detail).toBe("No own puckouts");
  });
});

describe("no data and incomplete restart ownership", () => {
  it("no shots, no restarts, no turnovers → no percentages", () => {
    const view = buildHtFtDashboardView(source([]), "FT");
    for (const t of [view.home, view.away]) {
      expect(t.shooting).toEqual({ value: NO_VALUE, detail: "No shots", ratio: null });
      expect(t.restarts).toEqual({ value: NO_VALUE, detail: "No own kickouts", ratio: null });
      expect(t.turnoversWon.value).toBe("0");
      expect(t.score).toEqual({ goals: 0, points: 0, total: 0 });
    }
    expect(view.restartOwnerNote).toBeNull();
    expect(view.marginText).toBe("Draw");
  });

  it("restarts whose taker was never recorded → 'Taker not recorded', never a percentage", () => {
    // Older Event Stats data: no restartOwner at all.
    const events = [ev("k1", "KICKOUT_WON", "FOR"), ev("k2", "KICKOUT_CONCEDED", "FOR")];
    const view = buildHtFtDashboardView(source(events), "FT");
    expect(view.home.restarts).toEqual({ value: NO_VALUE, detail: "Taker not recorded", ratio: null });
    expect(view.away.restarts).toEqual({ value: NO_VALUE, detail: "Taker not recorded", ratio: null });
    expect(view.restartOwnerNote).toBe("2 kickouts with no recorded taker — not included above");
  });

  it("some takers known, some unknown → percentage of the known ones plus a visible note", () => {
    const events = [
      ev("k1", "KICKOUT_WON", "FOR", "1H", { restartOwner: "FOR" }),
      ev("k2", "KICKOUT_CONCEDED", "FOR", "1H", { restartOwner: "FOR" }),
      ev("k3", "KICKOUT_WON", "FOR"),
    ];
    const view = buildHtFtDashboardView(source(events), "FT");
    expect(view.home.restarts).toEqual({ value: "50%", detail: "1 of 2 retained", ratio: 0.5 });
    expect(view.restartOwnerNote).toBe("1 kickout with no recorded taker — not included above");
  });

  it("the note uses puckout wording in hurling", () => {
    const view = buildHtFtDashboardView(source([ev("k", "KICKOUT_WON", "FOR")], { sport: "hurling" }), "FT");
    expect(view.restartOwnerNote).toBe("1 puckout with no recorded taker — not included above");
  });
});

describe("metadata", () => {
  it("shows only the fields the match actually has", () => {
    expect(buildHtFtDashboardView(source(FIRST_HALF), "HT").metaLine).toBe("Ballylanders GAA Grounds · League · 7 Nov 2026");
    expect(buildHtFtDashboardView(source(FIRST_HALF, { venue: "  " }), "HT").metaLine).toBe("League · 7 Nov 2026");
    expect(
      buildHtFtDashboardView(source(FIRST_HALF, { venue: undefined, matchType: undefined, createdAt: undefined }), "HT").metaLine,
    ).toBeNull();
  });
});

describe("no mutation of events or saved matches", () => {
  it("never mutates the events or source it is given", () => {
    const events = deepFreeze(structuredClone([...FIRST_HALF, ...SECOND_HALF, ev("k", "KICKOUT_WON", "FOR")]));
    const src = deepFreeze(source(events));
    const before = JSON.stringify(src);
    expect(() => buildHtFtDashboardView(src, "HT")).not.toThrow();
    expect(() => buildHtFtDashboardView(src, "FT")).not.toThrow();
    expect(JSON.stringify(src)).toBe(before);
  });

  it("reads a saved match without changing it", () => {
    const match = deepFreeze(savedMatch("SECOND_HALF")) as ProTaggerSavedMatch;
    const before = JSON.stringify(match);
    const src = dashboardSourceFromSavedMatch(match);
    buildHtFtDashboardView(src, "HT");
    expect(JSON.stringify(match)).toBe(before);
    expect(src.matchState).toBe("SECOND_HALF");
    expect(src.events).toBe(match.events);
  });
});

function savedMatch(matchState: ProTaggerSavedMatch["restoreContext"]["matchState"]): ProTaggerSavedMatch {
  return {
    id: "m1",
    createdAt: new Date(2026, 10, 7).getTime(),
    updatedAt: 1,
    homeTeamName: "Ballylanders",
    awayTeamName: "  ",
    venue: "",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "",
    eventCount: FIRST_HALF.length,
    events: structuredClone(FIRST_HALF),
    homeSquad: { id: "h", teamSide: "HOME", players: [], primaryColour: "#facc15", secondaryColour: "#15803d" },
    awaySquad: { id: "a", teamSide: "AWAY", players: [], teamName: "Galbally" },
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState,
      currentHalf: 2,
      matchTimeSeconds: 0,
      firstHalfAttackingDirection: "right",
    },
  } as unknown as ProTaggerSavedMatch;
}

describe("saved-match source", () => {
  it("falls back to the squad's team name, then default colours, like the live scoreboard", () => {
    const src = dashboardSourceFromSavedMatch(savedMatch("FULL_TIME"));
    expect(src.awayTeamName).toBe("Galbally");
    const view = buildHtFtDashboardView(src, "FT");
    expect(view.home.primary).toBe("#facc15");
    expect(view.away.primary).toBe("#dc2626");
    expect(view.away.secondary).toBe("#ffffff");
  });
});

describe("team identity: monograms and colour contrast", () => {
  it.each([
    ["Ballylanders", "B"],
    ["Na Fianna", "NF"],
    ["Cill Chainnigh GAA", "CC"],
    ["CLG Ó Donnabháin Rossa", "ÓD"],
    ["Cumann Lúthchleas Gael Ó Donnabháin Rossa", "ÓD"],
    ["St. Brigid's", "SB"],
    ["Éire Óg", "ÉÓ"],
    ["GAA", "G"],
    ["   ", "?"],
  ])("%s → %s", (name, mono) => {
    expect(teamMonogram(name)).toBe(mono);
  });

  it("monogram text picks the readable colour on light and dark badges", () => {
    expect(readableTextOn("#ffffff")).toBe("#0b1020");
    expect(readableTextOn("#facc15")).toBe("#0b1020");
    expect(readableTextOn("#7f1d1d")).toBe("#ffffff");
    expect(readableTextOn("#000000")).toBe("#ffffff");
    for (const fill of ["#ffffff", "#facc15", "#7f1d1d", "#16a34a", "#000000", "#2563eb"]) {
      expect(contrastRatio(fill, readableTextOn(fill))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("team colours too close to the background get an outline", () => {
    const dark = buildHtFtDashboardView(source([], { homeColours: { primary: "#000000" }, awayColours: { primary: DASHBOARD_BG } }), "FT");
    expect(dark.home.needsOutline).toBe(true);
    expect(dark.away.needsOutline).toBe(true);
    const bright = buildHtFtDashboardView(source([]), "FT");
    expect(bright.home.needsOutline).toBe(false);
    expect(contrastRatio("#facc15", DASHBOARD_BG)).toBeGreaterThan(MIN_BG_CONTRAST);
  });

  it("invalid stored colours fall back to the defaults", () => {
    const view = buildHtFtDashboardView(source([], { homeColours: { primary: "green", secondary: "#abc" } }), "FT");
    expect(view.home.primary).toBe("#16a34a");
    expect(view.home.secondary).toBe("#aabbcc");
  });
});

describe("filename", () => {
  it("is ASCII-only, with fadas folded", () => {
    const view = buildHtFtDashboardView(source([], { homeTeamName: "Éire Óg", awayTeamName: "Na Piarsaigh" }), "HT");
    expect(dashboardFilename(view)).toBe("eire-og-v-na-piarsaigh-ht-dashboard.png");
  });
});
