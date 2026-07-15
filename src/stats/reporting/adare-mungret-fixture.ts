/**
 * adare-mungret-fixture.ts
 *
 * Production regression fixture — Adare v Mungret.
 * Ground-truth metrics locked in adare-mungret.test.ts.
 * Events are synthetic but produce the canonical counts from the event log rules.
 */

import type { ChainableEvent } from "../chains/chain-types";

export type AdareFixtureEvent = ChainableEvent;

export const ADARE_MUNGRET_TEAMS = {
  home: "Adare",
  away: "Mungret",
} as const;

let nextId = 0;

export function mkAdareEvent(
  partial: Partial<AdareFixtureEvent> & Pick<AdareFixtureEvent, "kind" | "teamSide">,
): AdareFixtureEvent {
  const period = partial.period ?? "1H";
  const clock = partial.matchClockSeconds ?? 0;
  return {
    id: `adare-${nextId++}`,
    period,
    segment: partial.segment ?? (period === "1H" ? 1 : 4),
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

type Half = "1H" | "2H";

function addRestart(
  events: AdareFixtureEvent[],
  state: { clock: number; half: Half },
  owner: "FOR" | "OPP",
  winner: "FOR" | "OPP",
): void {
  state.clock += 90;
  events.push(
    mkAdareEvent({
      kind: winner === "FOR" ? "KICKOUT_WON" : "KICKOUT_CONCEDED",
      teamSide: "FOR",
      restartOwner: owner,
      period: state.half,
      matchClockSeconds: state.clock,
    }),
  );
}

function addTurnover(
  events: AdareFixtureEvent[],
  state: { clock: number; half: Half },
  kind: "TURNOVER_WON" | "TURNOVER_LOST",
  scoreAfter: boolean,
): void {
  state.clock += 60;
  events.push(
    mkAdareEvent({
      kind,
      teamSide: "FOR",
      period: state.half,
      matchClockSeconds: state.clock,
    }),
  );
  if (scoreAfter) {
    events.push(
      mkAdareEvent({
        kind: "POINT",
        teamSide: kind === "TURNOVER_WON" ? "FOR" : "OPP",
        period: state.half,
        matchClockSeconds: state.clock + 15,
      }),
    );
  }
}

function addPlacedScore(
  events: AdareFixtureEvent[],
  state: { clock: number; half: Half },
  team: "FOR" | "OPP",
  kind: "POINT" | "GOAL" | "TWO_POINTER",
  tags?: string[],
): void {
  state.clock += 30;
  events.push(
    mkAdareEvent({
      kind,
      teamSide: team,
      period: state.half,
      matchClockSeconds: state.clock,
      tags: tags ?? ["SOURCE_FREE"],
    }),
  );
}

function addPlacedMiss(
  events: AdareFixtureEvent[],
  state: { clock: number; half: Half },
  team: "FOR" | "OPP",
): void {
  state.clock += 30;
  events.push(
    mkAdareEvent({
      kind: "FREE_MISSED",
      teamSide: team,
      period: state.half,
      matchClockSeconds: state.clock,
    }),
  );
}

function addOpenScore(
  events: AdareFixtureEvent[],
  state: { clock: number; half: Half },
  team: "FOR" | "OPP",
  kind: "GOAL" | "POINT",
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    state.clock += 45;
    events.push(
      mkAdareEvent({
        kind,
        teamSide: team,
        period: state.half,
        matchClockSeconds: state.clock,
        tags: ["SOURCE_PLAY"],
      }),
    );
  }
}

function buildHalfKickouts(
  events: AdareFixtureEvent[],
  state: { clock: number; half: Half },
  forOwnTaken: number,
  forOwnRetained: number,
  oppOwnTaken: number,
  forWinsOnOpp: number,
): void {
  const forOwnLost = forOwnTaken - forOwnRetained;
  const oppOwnRetained = oppOwnTaken - forWinsOnOpp;

  for (let i = 0; i < forOwnRetained; i++) addRestart(events, state, "FOR", "FOR");
  for (let i = 0; i < forOwnLost; i++) addRestart(events, state, "FOR", "OPP");
  for (let i = 0; i < forWinsOnOpp; i++) addRestart(events, state, "OPP", "FOR");
  for (let i = 0; i < oppOwnRetained; i++) addRestart(events, state, "OPP", "OPP");
}

/**
 * Builds the Adare v Mungret event log matching production ground-truth metrics.
 */
export function buildAdareMungretFixture(): AdareFixtureEvent[] {
  const events: AdareFixtureEvent[] = [];
  const h1 = { clock: 0, half: "1H" as Half };
  const h2 = { clock: 2000, half: "2H" as Half };

  // ── H1 kickouts: FOR share 11/21, own 10 taken (5 retained, 5 lost) ────────
  buildHalfKickouts(events, h1, 10, 5, 11, 6);

  // ── H2 kickouts: FOR share 11/21, own 12 taken (7 retained, 5 lost) ────────
  buildHalfKickouts(events, h2, 12, 7, 9, 4);

  // ── Turnovers: FOR won 10, OPP won 6; origin scores FOR 1/10, OPP 2/6 ─────
  for (let i = 0; i < 9; i++) addTurnover(events, h1, "TURNOVER_WON", false);
  addTurnover(events, h1, "TURNOVER_WON", true);
  for (let i = 0; i < 4; i++) addTurnover(events, h1, "TURNOVER_LOST", false);
  addTurnover(events, h1, "TURNOVER_LOST", true);

  addTurnover(events, h2, "TURNOVER_LOST", true);

  // ── Placed balls — Adare: 4 scores, 5 pts, 1 miss (5 attempts) ────────────
  addPlacedScore(events, h1, "FOR", "POINT");
  addPlacedScore(events, h1, "FOR", "POINT");
  addPlacedScore(events, h1, "FOR", "TWO_POINTER");
  addPlacedMiss(events, h1, "FOR");
  addPlacedScore(events, h2, "FOR", "POINT");

  // ── Placed balls — Mungret: 6 scores, 9 pts, 0 misses ─────────────────────
  addPlacedScore(events, h1, "OPP", "GOAL");
  addPlacedScore(events, h1, "OPP", "POINT");
  addPlacedScore(events, h1, "OPP", "POINT");
  addPlacedScore(events, h2, "OPP", "TWO_POINTER");
  addPlacedScore(events, h2, "OPP", "POINT");
  addPlacedScore(events, h2, "OPP", "POINT");

  // ── Open-play scores to reach final lines (3-15 / 2-21) ───────────────────
  addOpenScore(events, h1, "FOR", "GOAL", 2);
  addOpenScore(events, h1, "FOR", "POINT", 10);
  addOpenScore(events, h2, "FOR", "GOAL", 1);
  addOpenScore(events, h2, "FOR", "POINT", 4);

  addOpenScore(events, h1, "OPP", "GOAL", 1);
  addOpenScore(events, h1, "OPP", "POINT", 8);
  addOpenScore(events, h2, "OPP", "GOAL", 1);
  addOpenScore(events, h2, "OPP", "POINT", 4);

  return events;
}

/** Locked production expectations — derived from event log, not PDF labels. */
export const ADARE_MUNGRET_EXPECTATIONS = {
  finalScore: { forGoals: 3, forPoints: 15, forTotal: 24, oppGoals: 2, oppPoints: 21, oppTotal: 27 },
  restartShare: { forWon: 22, oppWon: 20, total: 42, forPct: 52, oppPct: 48 },
  ownKickouts: {
    for: { taken: 22, retained: 12, lost: 10 },
    opp: { taken: 20, retained: 10, lost: 10 },
  },
  restartShareH1: { forWon: 11, total: 21 },
  ownKickoutsH1: { forTaken: 10, forRetained: 5, forLost: 5 },
  turnovers: { forWon: 10, oppWon: 6 },
  turnoverOriginScore: { for: { num: 1, den: 10, pct: 10 }, opp: { num: 2, den: 6, pct: 33 } },
  placedBalls: {
    for: { attempts: 5, scores: 4, points: 5, misses: 1 },
    opp: { attempts: 6, scores: 6, points: 9, misses: 0 },
  },
} as const;
