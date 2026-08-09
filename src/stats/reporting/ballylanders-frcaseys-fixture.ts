/**
 * ballylanders-frcaseys-fixture.ts
 *
 * Regression fixture for the HT/FT Snapshot factual-report implementation
 * (see the Snapshot redesign brief). Reproduces the approved reference
 * numbers exactly:
 *
 *   FT — Final 13–13, Ballylanders 1-10 v Fr. Caseys 1-10.
 *     Shooting:      Ballylanders 11/20 (55%) · Fr. Caseys 11/21 (52%)
 *     Own kickouts:  Ballylanders 6/13 (46%), lost 7  · Fr. Caseys 11/15 (73%), lost 4
 *     Turnovers:     Ballylanders won 23, lost 17
 *     Placed balls:  Ballylanders 6/8 · Fr. Caseys 5/5
 *
 *   HT (1H only) — Ballylanders 0-05 (5) v Fr. Caseys 0-04 (4).
 *     Shooting:      Ballylanders 5/11 (45%) · Fr. Caseys 4/12 (33%)
 *     Own kickouts:  Ballylanders 3/7 (43%) · Fr. Caseys 7/7 (100%)
 *     Turnovers:     Ballylanders won 11, lost 8
 *     Placed balls:  Ballylanders 2/4 · Fr. Caseys 1/1
 *
 * These are a REFERENCE FIXTURE — do not hand-tune the numbers to make a
 * test pass; if a value stops matching, trace the discrepancy in the
 * consuming code instead of editing the expectation below.
 *
 * Every derived value (2H splits, GAA-notation totals) was checked by hand
 * against the two halves independently before being locked into
 * BALLYLANDERS_FRCASEYS_EXPECTATIONS.
 */

import type { ChainableEvent } from "../chains/chain-types";

export const BALLYLANDERS_FRCASEYS_TEAMS = {
  home: "Ballylanders",
  away: "Fr. Caseys",
} as const;

let nextId = 0;
let clock = 0;

function mk(
  partial: Partial<ChainableEvent> & Pick<ChainableEvent, "kind" | "teamSide" | "period">,
): ChainableEvent {
  clock += 7;
  const segment = partial.period === "1H" ? 1 : 4;
  return {
    id: `bfc-${nextId++}`,
    segment,
    matchClockSeconds: partial.period === "2H" ? clock + 2100 : clock,
    // Deterministic pseudo-spread (coprime multipliers) so events of the
    // same kind don't stack on identical pixels in rendered pitch maps —
    // purely a fixture-quality concern, not read by any numeric assertion.
    nx: 0.1 + (((nextId * 7) % 80) / 100),
    ny: 0.1 + (((nextId * 13) % 80) / 100),
    ...partial,
  };
}

function pushScores(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
  openPlayPoints: number,
  placedPoints: number,
  goals: number,
): void {
  for (let i = 0; i < goals; i++) out.push(mk({ kind: "GOAL", teamSide, period }));
  for (let i = 0; i < openPlayPoints; i++) out.push(mk({ kind: "POINT", teamSide, period }));
  for (let i = 0; i < placedPoints; i++) out.push(mk({ kind: "POINT", teamSide, period, tags: ["SOURCE_FREE"] }));
}

function pushWides(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
  openPlayWides: number,
  placedWides: number,
): void {
  for (let i = 0; i < openPlayWides; i++) out.push(mk({ kind: "WIDE", teamSide, period }));
  for (let i = 0; i < placedWides; i++) out.push(mk({ kind: "WIDE", teamSide, period, tags: ["SOURCE_FREE"] }));
}

function pushOwnKickouts(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
  retained: number,
  lost: number,
): void {
  for (let i = 0; i < retained; i++) {
    out.push(mk({ kind: "KICKOUT_WON", teamSide, period, restartOwner: teamSide }));
  }
  for (let i = 0; i < lost; i++) {
    out.push(mk({ kind: "KICKOUT_CONCEDED", teamSide, period, restartOwner: teamSide }));
  }
}

function pushTurnovers(
  out: ChainableEvent[],
  period: "1H" | "2H",
  won: number,
  lost: number,
): void {
  for (let i = 0; i < won; i++) out.push(mk({ kind: "TURNOVER_WON", teamSide: "FOR", period }));
  for (let i = 0; i < lost; i++) out.push(mk({ kind: "TURNOVER_LOST", teamSide: "FOR", period }));
}

/** Builds the full Ballylanders v Fr. Caseys fixture event stream. */
export function buildBallylandersFrCaseysFixture(): ChainableEvent[] {
  nextId = 0;
  clock = 0;
  const events: ChainableEvent[] = [];

  // ── 1H ──────────────────────────────────────────────────────────────────
  pushScores(events, "1H", "FOR", 3, 2, 0);   // Ballylanders: 3 open + 2 placed points, 0 goals → 0-05
  pushScores(events, "1H", "OPP", 3, 1, 0);   // Fr. Caseys:   3 open + 1 placed point,  0 goals → 0-04
  pushWides(events, "1H", "FOR", 4, 2);       // Ballylanders attempts = 5 scores + 6 wides = 11
  pushWides(events, "1H", "OPP", 8, 0);       // Fr. Caseys attempts   = 4 scores + 8 wides = 12
  pushOwnKickouts(events, "1H", "FOR", 3, 4); // Ballylanders own kickouts 3/7 (43%)
  pushOwnKickouts(events, "1H", "OPP", 7, 0); // Fr. Caseys own kickouts 7/7 (100%)
  pushTurnovers(events, "1H", 11, 8);         // Ballylanders turnovers won 11, lost 8

  // ── 2H ──────────────────────────────────────────────────────────────────
  pushScores(events, "2H", "FOR", 1, 4, 1);   // Ballylanders: 1 open + 4 placed points, 1 goal → 1-05 (2H)
  pushScores(events, "2H", "OPP", 2, 4, 1);   // Fr. Caseys:   2 open + 4 placed points, 1 goal → 1-06 (2H)
  pushWides(events, "2H", "FOR", 3, 0);       // Ballylanders 2H attempts = 6 scores + 3 wides = 9
  pushWides(events, "2H", "OPP", 2, 0);       // Fr. Caseys 2H attempts   = 7 scores + 2 wides = 9
  pushOwnKickouts(events, "2H", "FOR", 3, 3); // Ballylanders 2H own kickouts 3/6
  pushOwnKickouts(events, "2H", "OPP", 4, 4); // Fr. Caseys 2H own kickouts 4/8
  pushTurnovers(events, "2H", 12, 9);         // Ballylanders 2H turnovers won 12, lost 9

  return events;
}

/** Locked golden expectations — see file header for the source figures. */
export const BALLYLANDERS_FRCASEYS_EXPECTATIONS = {
  ft: {
    score: {
      us: { goals: 1, points: 10, total: 13 },
      them: { goals: 1, points: 10, total: 13 },
    },
    shooting: {
      us: { num: 11, den: 20, pct: 55 },
      them: { num: 11, den: 21, pct: 52 },
    },
    ownKickouts: {
      us: { retained: 6, total: 13, lost: 7, pct: 46 },
      them: { retained: 11, total: 15, lost: 4, pct: 73 },
    },
    turnovers: { us: { won: 23, lost: 17 } },
    placed: {
      us: { scores: 6, attempts: 8 },
      them: { scores: 5, attempts: 5 },
    },
  },
  ht: {
    score: {
      us: { goals: 0, points: 5, total: 5 },
      them: { goals: 0, points: 4, total: 4 },
    },
    shooting: {
      us: { num: 5, den: 11, pct: 45 },
      them: { num: 4, den: 12, pct: 33 },
    },
    ownKickouts: {
      us: { retained: 3, total: 7, lost: 4, pct: 43 },
      them: { retained: 7, total: 7, lost: 0, pct: 100 },
    },
    turnovers: { us: { won: 11, lost: 8 } },
    placed: {
      us: { scores: 2, attempts: 4 },
      them: { scores: 1, attempts: 1 },
    },
  },
} as const;
