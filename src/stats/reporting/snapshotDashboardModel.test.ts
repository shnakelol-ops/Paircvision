/**
 * snapshotDashboardModel.test.ts
 *
 * Verifies the factual Snapshot dashboard model:
 *   1. Fields map correctly onto buildTeamSummaryBlock/viewShootingConversion.
 *   2. "Our/Their kickouts" are own-kickout retention, never Restart Share.
 *   3. The model can never structurally carry a chain/origin field
 *      (provenance boundary — see snapshotDashboardModel.ts header comment).
 *   4. Zero-denominator inputs never produce NaN/Infinity.
 */

import { describe, expect, it } from "vitest";
import { buildMatchReport } from "./matchReport";
import {
  buildSnapshotDashboardModel,
  snapshotMarginLabel,
  SNAPSHOT_DASHBOARD_FORBIDDEN_KEYS,
} from "./snapshotDashboardModel";
import type { ChainableEvent } from "../chains/chain-types";

let nextId = 0;
function ev(partial: Partial<ChainableEvent> & Pick<ChainableEvent, "kind" | "teamSide">): ChainableEvent {
  return {
    id: `sd-${nextId++}`,
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

/** Every key present anywhere in a nested object, recursively. */
function allKeysDeep(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (value == null || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value)) {
    out.add(k);
    allKeysDeep(v, out);
  }
  return out;
}

function buildSmallMatch(): ChainableEvent[] {
  return [
    // Score events: us 1 goal + 2 points (score events = 3, points value = 3+2=5), them 1 point.
    ev({ kind: "GOAL", teamSide: "FOR" }),
    ev({ kind: "POINT", teamSide: "FOR" }),
    ev({ kind: "POINT", teamSide: "FOR" }),
    ev({ kind: "POINT", teamSide: "OPP" }),
    // Shots: 1 wide each side (adds to shot attempts, not scores).
    ev({ kind: "WIDE", teamSide: "FOR" }),
    ev({ kind: "WIDE", teamSide: "OPP" }),
    // Own kickouts: FOR takes 3, retains 2; OPP takes 2, retains 1.
    ev({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR" }),
    ev({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR" }),
    ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR" }),
    ev({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP" }),
    ev({ kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP" }),
    // Turnovers: FOR won 2, lost 1.
    ev({ kind: "TURNOVER_WON", teamSide: "FOR" }),
    ev({ kind: "TURNOVER_WON", teamSide: "FOR" }),
    ev({ kind: "TURNOVER_LOST", teamSide: "FOR" }),
    // Placed balls: FOR 1 scored free of 2 attempts; OPP 1 scored free of 1.
    ev({ kind: "POINT", teamSide: "FOR", tags: ["SOURCE_FREE"] }),
    ev({ kind: "WIDE", teamSide: "FOR", tags: ["SOURCE_FREE"] }),
    ev({ kind: "POINT", teamSide: "OPP", tags: ["SOURCE_FREE"] }),
  ];
}

describe("buildSnapshotDashboardModel", () => {
  it("maps score, shooting, own-kickout, turnover, and placed-ball fields correctly", () => {
    const events = buildSmallMatch();
    const report = buildMatchReport({ events, homeTeam: "Home FC", awayTeam: "Away FC" });
    const model = buildSnapshotDashboardModel(report, "FT");

    // Score: FOR = 1 goal + 3 points-value (1 open-play POINT×2 + 1 placed POINT) = 1-03 (6)...
    // recompute exactly from the fixture: FOR POINT events = 2 (open play) + 1 (placed) = 3 points value; GOAL=1.
    expect(model.us.score).toEqual({ goals: 1, points: 3, total: 6 });
    expect(model.them.score).toEqual({ goals: 0, points: 2, total: 2 });

    // Shooting: FOR score-events = GOAL+POINT×3 = 4; shot attempts = 4 scores + 1 wide + 1 placed wide = 6.
    expect(model.us.shooting.num).toBe(4);
    expect(model.us.shooting.den).toBe(6);
    expect(model.us.shooting.pct).toBe(Math.round((4 / 6) * 100));

    // Own kickouts: FOR retained 2 of 3 taken, lost 1.
    expect(model.us.ownKickouts).toEqual({ retained: 2, total: 3, lost: 1, pct: 67 });
    // OPP retained 1 of 2 taken, lost 1.
    expect(model.them.ownKickouts).toEqual({ retained: 1, total: 2, lost: 1, pct: 50 });

    // Turnovers: FOR won 2, lost 1.
    expect(model.us.turnovers).toEqual({ won: 2, lost: 1 });

    // Placed balls: FOR 1 scored of 2 attempts; OPP 1 scored of 1 attempt.
    expect(model.us.placed).toEqual({ scores: 1, attempts: 2 });
    expect(model.them.placed).toEqual({ scores: 1, attempts: 1 });
  });

  it("never divides by zero into NaN/Infinity when a side has no kickouts or shots", () => {
    const events: ChainableEvent[] = [ev({ kind: "GOAL", teamSide: "FOR" })];
    const report = buildMatchReport({ events, homeTeam: "Home", awayTeam: "Away" });
    const model = buildSnapshotDashboardModel(report, "HT");

    expect(model.them.ownKickouts).toEqual({ retained: 0, total: 0, lost: 0, pct: 0 });
    expect(model.them.shooting).toEqual({ num: 0, den: 0, pct: 0 });
    expect(Number.isFinite(model.us.ownKickouts.pct)).toBe(true);
  });

  it("margin label states level/lead with no interpretation", () => {
    const level = buildMatchReport({
      events: [ev({ kind: "POINT", teamSide: "FOR" }), ev({ kind: "POINT", teamSide: "OPP" })],
      homeTeam: "Home",
      awayTeam: "Away",
    });
    expect(snapshotMarginLabel(buildSnapshotDashboardModel(level, "FT"))).toBe("Level");

    const usAhead = buildMatchReport({
      events: [ev({ kind: "GOAL", teamSide: "FOR" })],
      homeTeam: "Home",
      awayTeam: "Away",
    });
    expect(snapshotMarginLabel(buildSnapshotDashboardModel(usAhead, "FT"))).toBe("Home lead by 3");

    const themAhead = buildMatchReport({
      events: [ev({ kind: "GOAL", teamSide: "OPP" })],
      homeTeam: "Home",
      awayTeam: "Away",
    });
    expect(snapshotMarginLabel(buildSnapshotDashboardModel(themAhead, "FT"))).toBe("Away lead by 3");
  });

  it("PROVENANCE GUARD: the model never structurally carries a chain/origin field", () => {
    const events = buildSmallMatch();
    const report = buildMatchReport({ events, homeTeam: "Home FC", awayTeam: "Away FC" });
    const model = buildSnapshotDashboardModel(report, "FT");

    const keys = allKeysDeep(model);
    for (const forbidden of SNAPSHOT_DASHBOARD_FORBIDDEN_KEYS) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("half scoping: HT model built from a 1H-scoped report excludes 2H events", () => {
    const events: ChainableEvent[] = [
      ev({ kind: "GOAL", teamSide: "FOR", period: "1H" }),
      ev({ kind: "GOAL", teamSide: "FOR", period: "2H" }),
    ];
    const htReport = buildMatchReport({
      events: events.filter((e) => e.period === "1H"),
      homeTeam: "Home",
      awayTeam: "Away",
      scope: "1H",
    });
    const model = buildSnapshotDashboardModel(htReport, "HT");
    expect(model.us.score.total).toBe(3); // only the 1H goal
  });
});
