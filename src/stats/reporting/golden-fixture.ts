/**
 * golden-fixture.ts
 *
 * Shared golden fixture for reporting regression tests.
 * Reproduces Ballylanders v St.Patricks restart battle values from
 * restartMetrics.test.ts and extends with turnover events for cross-layer tests.
 */

import type { ChainableEvent } from "../chains/chain-types";

export type GoldenFixtureEvent = ChainableEvent;

let nextId = 0;

export function mkGoldenEvent(
  partial: Partial<GoldenFixtureEvent> & Pick<GoldenFixtureEvent, "kind" | "teamSide">,
): GoldenFixtureEvent {
  const period = partial.period ?? "1H";
  const clock = partial.matchClockSeconds ?? 0;
  return {
    id: `golden-${nextId++}`,
    period,
    segment: partial.segment ?? (clock < 600 ? (period === "1H" ? 1 : 4) : clock < 1200 ? (period === "1H" ? 2 : 5) : (period === "1H" ? 3 : 6)),
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

function restart(
  events: GoldenFixtureEvent[],
  state: { clock: number; half: "1H" | "2H" },
  owner: "FOR" | "OPP",
  winner: "FOR" | "OPP",
  scored: boolean,
): void {
  state.clock += 120;
  events.push(
    mkGoldenEvent({
      kind: winner === "FOR" ? "KICKOUT_WON" : "KICKOUT_CONCEDED",
      teamSide: "FOR",
      restartOwner: owner,
      period: state.half,
      matchClockSeconds: state.clock,
    }),
  );
  if (scored) {
    events.push(
      mkGoldenEvent({
        kind: "POINT",
        teamSide: winner,
        period: state.half,
        matchClockSeconds: state.clock + 20,
      }),
    );
  }
}

function turnover(
  events: GoldenFixtureEvent[],
  state: { clock: number; half: "1H" | "2H" },
  kind: "TURNOVER_WON" | "TURNOVER_LOST",
  scored: boolean,
): void {
  state.clock += 90;
  const actingFor = kind === "TURNOVER_WON";
  events.push(
    mkGoldenEvent({
      kind,
      teamSide: "FOR",
      period: state.half,
      matchClockSeconds: state.clock,
    }),
  );
  if (scored) {
    events.push(
      mkGoldenEvent({
        kind: "POINT",
        teamSide: actingFor ? "FOR" : "OPP",
        period: state.half,
        matchClockSeconds: state.clock + 15,
      }),
    );
  }
}

/**
 * Golden match fixture with locked restart + turnover expectations.
 */
export function buildGoldenReportingFixture(): GoldenFixtureEvent[] {
  const events: GoldenFixtureEvent[] = [];
  const state = { clock: 0, half: "1H" as "1H" | "2H" };

  // ── 1H kickouts (from restartMetrics fixture) ─────────────────────────────
  restart(events, state, "FOR", "FOR", true);
  restart(events, state, "FOR", "FOR", false);
  restart(events, state, "FOR", "FOR", true);
  restart(events, state, "FOR", "FOR", false);
  restart(events, state, "FOR", "OPP", true);
  restart(events, state, "OPP", "FOR", true);
  restart(events, state, "OPP", "FOR", false);
  restart(events, state, "OPP", "OPP", true);
  restart(events, state, "OPP", "OPP", false);
  restart(events, state, "OPP", "OPP", false);

  // ── 1H turnovers: 4 won (2 scored), 2 lost (1 scored against) ───────────
  turnover(events, state, "TURNOVER_WON", true);
  turnover(events, state, "TURNOVER_WON", true);
  turnover(events, state, "TURNOVER_WON", false);
  turnover(events, state, "TURNOVER_WON", false);
  turnover(events, state, "TURNOVER_LOST", true);
  turnover(events, state, "TURNOVER_LOST", false);

  // ── 2H kickouts ───────────────────────────────────────────────────────────
  state.half = "2H";
  state.clock = 0;
  restart(events, state, "FOR", "FOR", true);
  restart(events, state, "FOR", "FOR", false);
  restart(events, state, "FOR", "FOR", false);
  restart(events, state, "FOR", "FOR", true);
  restart(events, state, "FOR", "FOR", false);
  restart(events, state, "FOR", "FOR", false);
  restart(events, state, "FOR", "OPP", true);
  restart(events, state, "FOR", "OPP", false);
  restart(events, state, "OPP", "FOR", false);
  restart(events, state, "OPP", "FOR", false);
  restart(events, state, "OPP", "FOR", false);
  restart(events, state, "OPP", "OPP", true);
  restart(events, state, "OPP", "OPP", false);
  restart(events, state, "OPP", "OPP", false);

  // ── 2H turnovers: 3 won (1 scored), 3 lost (2 scored against) ─────────────
  turnover(events, state, "TURNOVER_WON", false);
  turnover(events, state, "TURNOVER_WON", true);
  turnover(events, state, "TURNOVER_WON", false);
  turnover(events, state, "TURNOVER_LOST", true);
  turnover(events, state, "TURNOVER_LOST", true);
  turnover(events, state, "TURNOVER_LOST", false);

  return events;
}

/** Locked golden expectations for the full-match fixture. */
export const GOLDEN_RESTART_EXPECTATIONS = {
  restartShare:       { num: 15, den: 24, pct: 63 },
  ownRetentionFull:   { num: 10, den: 13, pct: 77 },
  ownRetentionH1:     { num: 4, den: 5, pct: 80 },
  ownRetentionH2:     { num: 6, den: 8, pct: 75 },
  oppKickoutWinRate:  { num: 5, den: 11, pct: 45 },
  restartToScore:     { num: 5, den: 15, pct: 33 },
  restartLossPunish:  { num: 4, den: 9, pct: 44 },
} as const;

/** 1H: 4 TO won (2 scored), 2 TO lost (1 scored). 2H: 3 won (1 scored), 3 lost (2 scored). */
export const GOLDEN_TURNOVER_EXPECTATIONS = {
  turnoverShareFull:  { num: 7, den: 12, pct: 58 },
  turnoverShareH1:    { num: 4, den: 6, pct: 67 },
  turnoverShareH2:    { num: 3, den: 6, pct: 50 },
  winsToScoreFull:    { num: 3, den: 7, pct: 43 },
  lossPunishFull:     { num: 3, den: 5, pct: 60 },
  wonToShotOnlyFull:  { num: 0, den: 7, pct: 0 },
} as const;

export const GOLDEN_TEAMS = {
  home: "Ballylanders",
  away: "St.Patricks",
} as const;
