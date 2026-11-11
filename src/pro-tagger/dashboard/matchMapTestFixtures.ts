/**
 * matchMapTestFixtures.ts — TEST-ONLY helpers for the Match Analysis Pack map
 * view-model tests. Not imported by application code.
 *
 * The real fixture is the first half of Ballylanders v Galbally (7 Nov 2026),
 * recorded in Event Stats with Ballylanders (Home) attacking RIGHT in the
 * first half.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import type { ProTaggerSport, ProTaggerSquad } from "../pro-tagger-session";
import type { ProTaggerSavedMatch } from "../pro-tagger-storage";

type HtFixture = {
  homeTeamName: string;
  awayTeamName: string;
  sport: ProTaggerSport;
  halfDurationMinutes: number;
  scorelineSnapshot: string;
  firstHalfAttackingDirection: "left" | "right";
  homeSquad: ProTaggerSquad;
  awaySquad: ProTaggerSquad;
  events: LoggedMatchEvent[];
};

// Resolved from the import.meta.url string (not `new URL(...)`), so it also
// works under the jsdom test environment, which replaces the global URL.
export const HT_FIXTURE = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../stats/reporting/fixtures/ballylanders-galbally-2026-11-07-ht.json"),
    "utf8",
  ),
) as HtFixture;

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/**
 * A plausible second half: the same events after the teams change ends —
 * every position turned 180° about the pitch centre (both axes), period 2H.
 * Each copy is the same spot *relative to the team's attacking goal* as its
 * first-half original.
 */
export function secondHalfOf(events: readonly LoggedMatchEvent[]): LoggedMatchEvent[] {
  return events.map((e) => ({
    ...e,
    id: `${e.id}-2h`,
    period: "2H" as const,
    half: 2 as const,
    segment: (e.segment + 3) as LoggedMatchEvent["segment"],
    matchClockSeconds: e.matchClockSeconds + 1800,
    nx: 1 - e.nx,
    ny: 1 - e.ny,
    x: 1 - e.x,
    y: 1 - e.y,
  }));
}

let seq = 0;

/** A minimal Event Stats event. */
export function ev(
  kind: LoggedMatchEvent["kind"],
  teamSide: "FOR" | "OPP",
  extra: Partial<LoggedMatchEvent> = {},
): LoggedMatchEvent {
  seq += 1;
  const period = extra.period ?? "1H";
  const nx = extra.nx ?? 0.5;
  const ny = extra.ny ?? 0.5;
  return {
    id: `t-${seq}`,
    kind,
    type: kind,
    teamSide,
    team: teamSide === "FOR" ? "HOME" : "AWAY",
    period,
    half: period === "1H" ? 1 : 2,
    segment: period === "1H" ? 1 : 4,
    matchClockSeconds: 60 * seq,
    timestamp: 60 * seq,
    createdAt: 1_700_000_000_000 + seq,
    tags: [],
    nx,
    ny,
    x: nx,
    y: ny,
    ...extra,
  } as LoggedMatchEvent;
}

export function savedMatch(overrides: Partial<ProTaggerSavedMatch> & { events: readonly LoggedMatchEvent[] }): ProTaggerSavedMatch {
  const base: ProTaggerSavedMatch = {
    id: "match-1",
    createdAt: Date.UTC(2026, 10, 7, 14, 0),
    homeTeamName: HT_FIXTURE.homeTeamName,
    awayTeamName: HT_FIXTURE.awayTeamName,
    venue: "",
    sport: HT_FIXTURE.sport,
    matchType: "championship",
    halfDurationMinutes: HT_FIXTURE.halfDurationMinutes,
    scorelineSnapshot: HT_FIXTURE.scorelineSnapshot,
    eventCount: overrides.events.length,
    events: overrides.events,
    homeSquad: HT_FIXTURE.homeSquad,
    awaySquad: HT_FIXTURE.awaySquad,
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState: "FULL_TIME",
      currentHalf: 2,
      matchTimeSeconds: 3600,
      firstHalfAttackingDirection: HT_FIXTURE.firstHalfAttackingDirection,
    },
  };
  return { ...base, ...overrides, eventCount: overrides.events.length };
}

/** The real first half as a saved match at Half Time. */
export function htFixtureMatch(): ProTaggerSavedMatch {
  return savedMatch({
    events: HT_FIXTURE.events,
    restoreContext: {
      matchState: "HALF_TIME",
      currentHalf: 1,
      matchTimeSeconds: 1800,
      firstHalfAttackingDirection: HT_FIXTURE.firstHalfAttackingDirection,
    },
  });
}

/** The real first half plus its rotated second half, at Full Time. */
export function ftFixtureMatch(): ProTaggerSavedMatch {
  return savedMatch({ events: [...HT_FIXTURE.events, ...secondHalfOf(HT_FIXTURE.events)] });
}
