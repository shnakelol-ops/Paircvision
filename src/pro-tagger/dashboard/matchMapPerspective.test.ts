import { describe, expect, it } from "vitest";
import { svgPointToPitchNorm } from "../ProTaggerPitchView";
import { buildHtFtDashboardView } from "./htFtDashboardView";
import {
  ORIENTATION_UNAVAILABLE_CAPTION,
  buildScopedMapReport,
  mapOrientation,
  mapSourceFromLive,
  mapSourceFromSavedMatch,
  normaliseAttackDirection,
  plotEvent,
  projectToPortrait,
  recordedClockSeconds,
  recordedPosition,
  scopedScoreline,
  summariseLocations,
  teamIdentity,
  type MapTeamSide,
} from "./matchMapPerspective";
import { HT_FIXTURE, deepFreeze, ev, ftFixtureMatch, htFixtureMatch, savedMatch } from "./matchMapTestFixtures";
import type { ProTaggerSession } from "../pro-tagger-session";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 10);

describe("normaliseAttackDirection", () => {
  it("accepts the stored lower-case values and upper case", () => {
    expect(normaliseAttackDirection("left")).toBe("LEFT");
    expect(normaliseAttackDirection("right")).toBe("RIGHT");
    expect(normaliseAttackDirection(" RIGHT ")).toBe("RIGHT");
  });
  it("never guesses a missing or invalid direction", () => {
    for (const raw of [undefined, null, "", "up", 1, {}]) expect(normaliseAttackDirection(raw)).toBeNull();
  });
});

describe("projectToPortrait — a rotation, never a mirror", () => {
  it("puts the attacking end (nx = 1) at the top and keeps the attacker's left on the left", () => {
    expect(projectToPortrait({ nx: 1, ny: 0.5 })).toEqual({ px: 0.5, py: 0 });
    expect(projectToPortrait({ nx: 0, ny: 0.5 })).toEqual({ px: 0.5, py: 1 });
    // Facing nx = 1 on the landscape picture, ny = 0 (top edge) is the attacker's left.
    expect(projectToPortrait({ nx: 0.5, ny: 0 })).toEqual({ px: 0, py: 0.5 });
  });

  it("has determinant +1 (orientation-preserving)", () => {
    const o = projectToPortrait({ nx: 0, ny: 0 });
    const ex = projectToPortrait({ nx: 1, ny: 0 });
    const ey = projectToPortrait({ nx: 0, ny: 1 });
    const a = [ex.px - o.px, ex.py - o.py];
    const b = [ey.px - o.px, ey.py - o.py];
    expect(a[0] * b[1] - a[1] * b[0]).toBe(1);
  });
});

// ─── The eight direction combinations, one reference point ──────────────────
// Physical point P: nx 0.9 (near the nx = 1 end), ny 0.2. Expected values are
// worked out by hand from the rules (teams change ends at half time; the Away
// team always attacks the opposite end to Home), not from the code under test.
describe("plotEvent — Home / Away × first / second half × recorded direction", () => {
  const P = { nx: 0.9, ny: 0.2 };
  const NEAR_TOP_LEFT = { px: 0.2, py: 0.1 };      // P on the selected team's attacking end, attacker's left
  const NEAR_BOTTOM_RIGHT = { px: 0.8, py: 0.9 };  // P on the selected team's own end

  const cases: [dir: "LEFT" | "RIGHT", side: MapTeamSide, period: "1H" | "2H", expected: { px: number; py: number }][] = [
    ["RIGHT", "FOR", "1H", NEAR_TOP_LEFT],     // Home attacks nx = 1 in 1H
    ["RIGHT", "OPP", "1H", NEAR_BOTTOM_RIGHT], // Away attacks nx = 0 in 1H
    ["RIGHT", "FOR", "2H", NEAR_BOTTOM_RIGHT], // ends changed
    ["RIGHT", "OPP", "2H", NEAR_TOP_LEFT],
    ["LEFT", "FOR", "1H", NEAR_BOTTOM_RIGHT],
    ["LEFT", "OPP", "1H", NEAR_TOP_LEFT],
    ["LEFT", "FOR", "2H", NEAR_TOP_LEFT],
    ["LEFT", "OPP", "2H", NEAR_BOTTOM_RIGHT],
  ];

  for (const [dir, side, period, expected] of cases) {
    it(`Home first-half ${dir}: ${side === "FOR" ? "Home" : "Away"} map, ${period}`, () => {
      const r = plotEvent({ ...P, teamSide: "FOR", period }, side, dir);
      expect(r.reason).toBeNull();
      close(r.point!.px, expected.px);
      close(r.point!.py, expected.py);
    });
  }

  it("does not depend on which team recorded the event — only on the selected team", () => {
    for (const side of ["FOR", "OPP"] as const) {
      const a = plotEvent({ ...P, teamSide: "FOR", period: "1H" }, side, "RIGHT");
      const b = plotEvent({ ...P, teamSide: "OPP", period: "1H" }, side, "RIGHT");
      expect(a).toEqual(b);
    }
  });

  it("left / right wing: the same touchline spot is the attacker's left in one half and right in the other", () => {
    // Home attacks nx = 1 in 1H: ny 0.1 is on the attacker's left.
    expect(plotEvent({ nx: 0.7, ny: 0.1, teamSide: "FOR", period: "1H" }, "FOR", "RIGHT").point!.px).toBeCloseTo(0.1, 10);
    // Same physical spot in 2H, Home now attacking nx = 0: attacker's right.
    expect(plotEvent({ nx: 0.7, ny: 0.1, teamSide: "FOR", period: "2H" }, "FOR", "RIGHT").point!.px).toBeCloseTo(0.9, 10);
    // The Away team in 1H attacks nx = 0: ny 0.1 is on their right.
    expect(plotEvent({ nx: 0.3, ny: 0.1, teamSide: "OPP", period: "1H" }, "OPP", "RIGHT").point!.px).toBeCloseTo(0.9, 10);
  });

  it("is deterministic and never mutates the event", () => {
    const e = deepFreeze({ ...P, x: 0.9, y: 0.2, teamSide: "FOR" as const, period: "2H" as const });
    expect(plotEvent(e, "OPP", "LEFT")).toEqual(plotEvent(e, "OPP", "LEFT"));
    expect(e).toEqual({ ...P, x: 0.9, y: 0.2, teamSide: "FOR", period: "2H" });
  });
});

// ─── Independent check against the real capture screen ─────────────────────
// ProTaggerPitchView turns a tap on the portrait capture pitch (SVG view box
// 100 × 160) into the stored nx / ny. Whenever the selected team was attacking
// UP the capture screen, its map must show the tap exactly where the coach
// tapped; when it was attacking DOWN, the map is the capture picture turned
// 180°. "Attacking down" on capture = (1H and RIGHT) or (2H and LEFT) for Home
// (ProTaggerPitchView / ProTaggerLiveScreen), the opposite for Away.
describe("plotEvent reproduces the capture screen", () => {
  const taps = [
    [5, 8], [50, 80], [95, 152], [20, 140], [80, 30], [0, 0], [100, 160],
  ] as const;

  for (const dir of ["LEFT", "RIGHT"] as const) {
    for (const period of ["1H", "2H"] as const) {
      for (const side of ["FOR", "OPP"] as const) {
        const homeDown = (period === "1H" && dir === "RIGHT") || (period === "2H" && dir === "LEFT");
        const teamUpOnCapture = side === "FOR" ? !homeDown : homeDown;
        it(`${dir} / ${period} / ${side}: ${teamUpOnCapture ? "same as" : "180° turn of"} the capture screen`, () => {
          for (const [sx, sy] of taps) {
            const { nx, ny } = svgPointToPitchNorm(sx, sy);
            const p = plotEvent({ nx, ny, teamSide: side, period }, side, dir).point!;
            const want = teamUpOnCapture ? { px: sx / 100, py: sy / 160 } : { px: 1 - sx / 100, py: 1 - sy / 160 };
            close(p.px, want.px);
            close(p.py, want.py);
          }
        });
      }
    }
  }
});

describe("missing coordinates, half or direction", () => {
  it("never fabricates a position", () => {
    const bad = [
      {},
      { nx: Number.NaN, ny: 0.5 },
      { nx: 0.5, ny: Number.POSITIVE_INFINITY },
      { nx: 1.2, ny: 0.5 },
      { nx: -0.01, ny: 0.5 },
      { nx: "0.5", ny: 0.5 },
      { nx: null, ny: null },
    ];
    for (const c of bad) {
      expect(recordedPosition(c as never)).toBeNull();
      expect(plotEvent({ ...(c as object), teamSide: "FOR", period: "1H" } as never, "FOR", "RIGHT")).toEqual({
        point: null,
        reason: "NO_COORDINATES",
      });
    }
  });

  it("falls back to x / y only when nx / ny are unusable", () => {
    expect(recordedPosition({ nx: 0.2, ny: 0.3, x: 0.9, y: 0.9 } as never)).toEqual({ nx: 0.2, ny: 0.3 });
    expect(recordedPosition({ x: 0.9, y: 0.8 } as never)).toEqual({ nx: 0.9, ny: 0.8 });
  });

  it("does not guess the half when orienting by direction", () => {
    expect(plotEvent({ nx: 0.5, ny: 0.5, teamSide: "FOR" } as never, "FOR", "RIGHT")).toEqual({
      point: null,
      reason: "HALF_NOT_RECORDED",
    });
  });

  it("with no direction, shows positions as captured — identical for both teams", () => {
    const e = { nx: 0.9, ny: 0.2, teamSide: "FOR" as const, period: "2H" as const };
    const home = plotEvent(e, "FOR", null).point!;
    const away = plotEvent(e, "OPP", null).point!;
    expect(home).toEqual(away);
    close(home.px, 0.2);
    close(home.py, 0.1);
  });

  it("summarises unplotted events with an honest note", () => {
    expect(summariseLocations([null, null])).toMatchObject({ total: 2, plotted: 2, notPlotted: 0, note: null });
    expect(summariseLocations([null, "NO_COORDINATES", "HALF_NOT_RECORDED"])).toEqual({
      total: 3,
      plotted: 1,
      notPlotted: 2,
      noCoordinates: 1,
      halfNotRecorded: 1,
      note: "2 of 3 not shown on the map — location not recorded",
    });
  });

  it("reads the clock only when it is a valid number", () => {
    expect(recordedClockSeconds({ matchClockSeconds: 61.7 })).toBe(61);
    for (const v of [undefined, null, -1, Number.NaN, "60"]) expect(recordedClockSeconds({ matchClockSeconds: v })).toBeNull();
  });
});

describe("orientation state and caption", () => {
  it("names the selected team and the scope", () => {
    const src = mapSourceFromSavedMatch(ftFixtureMatch());
    expect(mapOrientation(src, "FOR", "FT")).toEqual({
      status: "ATTACKING_UP",
      homeFirstHalfDirection: "RIGHT",
      caption: "Ballylanders attacking ↑ · both halves",
    });
    expect(mapOrientation(src, "OPP", "HT").caption).toBe("Galbally attacking ↑ · first half");
  });

  it("reports an unrecorded direction instead of guessing", () => {
    const m = savedMatch({ events: HT_FIXTURE.events });
    const legacy = { ...m, restoreContext: { ...m.restoreContext, firstHalfAttackingDirection: undefined as never } };
    const o = mapOrientation(mapSourceFromSavedMatch(legacy), "FOR", "FT");
    expect(o).toEqual({ status: "AS_CAPTURED", homeFirstHalfDirection: null, caption: ORIENTATION_UNAVAILABLE_CAPTION });
    expect(o.caption).toBe("Attack direction not recorded — positions shown as captured");
  });
});

describe("sources and scope", () => {
  it("saved match → source carries the stored direction and the dashboard's fields", () => {
    const m = deepFreeze(htFixtureMatch());
    const src = mapSourceFromSavedMatch(m);
    expect(src.homeFirstHalfAttackingDirection).toBe("right");
    expect(src.events).toBe(m.events);
    expect(teamIdentity(src, "FOR")).toMatchObject({ side: "FOR", role: "HOME", name: "Ballylanders" });
    expect(teamIdentity(src, "OPP")).toMatchObject({ side: "OPP", role: "AWAY", name: "Galbally" });
  });

  it("live session → source carries session.attackDirection", () => {
    const m = htFixtureMatch();
    const session = {
      id: "s", sport: m.sport, homeTeamName: m.homeTeamName, awayTeamName: m.awayTeamName, venue: "",
      matchType: m.matchType, attackDirection: "left", halfDurationMinutes: 30, createdAt: m.createdAt,
      homeSquad: m.homeSquad, awaySquad: m.awaySquad,
    } as ProTaggerSession;
    const src = mapSourceFromLive(session, m.events, "SECOND_HALF");
    expect(src.homeFirstHalfAttackingDirection).toBe("left");
    expect(src.matchState).toBe("SECOND_HALF");
  });

  it("HT uses first-half events only, even once the second half has events", () => {
    const src = mapSourceFromSavedMatch(ftFixtureMatch());
    const ht = buildScopedMapReport(src, "HT");
    expect(ht.scope).toBe("1H");
    expect(ht.events.every((e) => e.period === "1H")).toBe(true);
    expect(ht.events).toHaveLength(HT_FIXTURE.events.length);
    const ft = buildScopedMapReport(src, "FT");
    expect(ft.events).toHaveLength(HT_FIXTURE.events.length * 2);
  });

  it("scoreline equals the HT / FT dashboard and the recorded HT score (0-06 – 0-05)", () => {
    for (const m of [htFixtureMatch(), ftFixtureMatch()]) {
      const src = mapSourceFromSavedMatch(m);
      for (const scope of ["HT", "FT"] as const) {
        if (scope === "FT" && m.restoreContext.matchState !== "FULL_TIME") continue;
        const line = scopedScoreline(buildScopedMapReport(src, scope), src);
        const dash = buildHtFtDashboardView(src, scope);
        expect(line.home.text).toBe(dash.home.scoreText);
        expect(line.away.text).toBe(dash.away.scoreText);
        expect(line.home.total).toBe(dash.home.score.total);
        expect(line.away.total).toBe(dash.away.score.total);
      }
    }
    const htLine = scopedScoreline(buildScopedMapReport(mapSourceFromSavedMatch(htFixtureMatch()), "HT"), mapSourceFromSavedMatch(htFixtureMatch()));
    expect(`${htLine.home.text} – ${htLine.away.text}`).toBe(HT_FIXTURE.scorelineSnapshot);
  });
});

describe("fixture facts the audit relied on", () => {
  it("Home attacked RIGHT in the first half: Ballylanders shots at the high-nx end, Galbally at the low end", () => {
    expect(HT_FIXTURE.firstHalfAttackingDirection).toBe("right");
    const SHOTS = new Set(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "WIDE", "SHOT"]);
    const home = HT_FIXTURE.events.filter((e) => SHOTS.has(e.kind) && e.teamSide === "FOR");
    const away = HT_FIXTURE.events.filter((e) => SHOTS.has(e.kind) && e.teamSide === "OPP");
    expect(home.every((e) => e.nx > 0.6)).toBe(true);
    expect(away.every((e) => e.nx < 0.3)).toBe(true);
  });

  it("every turnover is stored from the Home perspective (8 turnovers — the audit's 7 was a miscount)", () => {
    const t = HT_FIXTURE.events.filter((e) => e.kind === "TURNOVER_WON" || e.kind === "TURNOVER_LOST");
    expect(t).toHaveLength(8);
    expect(t.every((e) => e.teamSide === "FOR" && e.team === "HOME")).toBe(true);
  });
});

it("ev() helper builds a plottable event (sanity)", () => {
  expect(plotEvent(ev("POINT", "FOR", { nx: 0.9, ny: 0.2 }), "FOR", "RIGHT").point).not.toBeNull();
});
