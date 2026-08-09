/**
 * abk-desmonds-stsenans-fixture.ts
 *
 * Second cross-game regression fixture for the Full Review professionalisation
 * pass (see ballylanders-frcaseys-fixture.ts for the first). A different
 * profile deliberately: high-scoring, high shot conversion, real kickout/
 * turnover-origin chains present (unlike the flat Ballylanders fixture).
 *
 * Locked reference numbers, verified against the unmodified chain-engine.ts
 * (nothing in the engine or the ledger classifiers was changed to hit these
 * — the event sequence was constructed so the existing forward-scan windows
 * produce them):
 *
 *   Final:            ABK Desmonds 2-15 (21)   ·   St Senans 2-08 (14)
 *   Shooting:         ABK 17/22 (77%)          ·   St Senans 10/22 (45%)
 *   Scoring Breakdown: ABK general play 2-12, placed 0-03
 *                      St Senans general play 2-07, placed 0-01
 *   Game Origin:      ABK restart-origin 0-07 (7 pts)
 *                      ABK turnover-origin 2-05 (11 pts)
 *                      St Senans restart-origin 1-02 (5 pts)
 *                      St Senans turnover-origin 1-04 (7 pts)
 *
 * This is a REFERENCE FIXTURE: do not hand-tune numbers to make a test
 * pass; if a value stops matching, trace the discrepancy in the consuming
 * code instead of editing the expectation below.
 */

import type { ChainableEvent } from "../chains/chain-types";

export const ABK_STSENANS_TEAMS = {
  home: "ABK Desmonds",
  away: "St Senans",
} as const;

let nextId = 0;
let clock = 0;

function mk(
  partial: Partial<ChainableEvent> & Pick<ChainableEvent, "kind" | "teamSide" | "period">,
): ChainableEvent {
  clock += 11;
  const segment = partial.period === "1H" ? 1 : 4;
  return {
    id: `abk-${nextId++}`,
    segment,
    matchClockSeconds: partial.period === "2H" ? clock + 2100 : clock,
    nx: 0.1 + (((nextId * 7) % 80) / 100),
    ny: 0.1 + (((nextId * 13) % 80) / 100),
    ...partial,
  };
}

/** Kickout won by `teamSide`, immediately followed by their own score — a
 *  clean restart-origin chain (no intervening kickout event resets it). */
function kickoutOriginScore(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
  scoreKind: "GOAL" | "POINT",
): void {
  out.push(mk({ kind: "KICKOUT_WON", teamSide, period, restartOwner: teamSide }));
  out.push(mk({ kind: scoreKind, teamSide, period, tags: ["SOURCE_PLAY"] }));
}

/** Turnover won by `teamSide`, with their own score as the very next relevant
 *  event (no interleaving own shot/turnover) — a clean turnover-origin chain. */
function turnoverOriginScore(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
  scoreKind: "GOAL" | "POINT",
): void {
  out.push(mk({ kind: "TURNOVER_WON", teamSide, period }));
  out.push(mk({ kind: scoreKind, teamSide, period, tags: ["SOURCE_PLAY"] }));
}

function generalPlayScore(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
  scoreKind: "GOAL" | "POINT",
): void {
  out.push(mk({ kind: scoreKind, teamSide, period, tags: ["SOURCE_PLAY"] }));
}

function placedScore(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
): void {
  out.push(mk({ kind: "POINT", teamSide, period, tags: ["SOURCE_FREE"] }));
}

function wides(
  out: ChainableEvent[],
  period: "1H" | "2H",
  teamSide: "FOR" | "OPP",
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    out.push(mk({ kind: "WIDE", teamSide, period, tags: ["SOURCE_PLAY"] }));
  }
}

/**
 * Builds the ABK Desmonds v St Senans fixture.
 *
 * ABK Desmonds (FOR) — final 2-15 (21):
 *   General play 2-12 (18 pts, 14 scoring events) — 7 kickout-origin points
 *   (0-07) + 2 goals/5 points turnover-origin (2-05) = every general-play
 *   score is origin-attributed, zero unlinked. Placed 0-03 (3 pts).
 *   Shooting 17/22 (5 wides).
 *
 * St Senans (OPP) — final 2-08 (14):
 *   General play 2-07 (13 pts, 9 scoring events) — 1 goal/2 points
 *   restart-origin (1-02) + 1 goal/4 points turnover-origin (1-04) + 1
 *   unlinked general-play point (general play exceeds the origin sum by
 *   exactly this one score — origin figures need not reconcile 1:1 with the
 *   direct scoring breakdown). Placed 0-01 (1 pt). Shooting 10/22 (12 wides).
 */
export function buildAbkDesmondsStSenansFixture(): ChainableEvent[] {
  nextId = 0;
  clock = 0;
  const events: ChainableEvent[] = [];

  // ── 1H ──────────────────────────────────────────────────────────────────
  // ABK: 4 kickout-origin points, 2 turnover-origin goals + 3 turnover-origin
  // points, 2 placed points, 3 wides.
  kickoutOriginScore(events, "1H", "FOR", "POINT");
  kickoutOriginScore(events, "1H", "FOR", "POINT");
  kickoutOriginScore(events, "1H", "FOR", "POINT");
  kickoutOriginScore(events, "1H", "FOR", "POINT");
  turnoverOriginScore(events, "1H", "FOR", "GOAL");
  turnoverOriginScore(events, "1H", "FOR", "GOAL");
  turnoverOriginScore(events, "1H", "FOR", "POINT");
  turnoverOriginScore(events, "1H", "FOR", "POINT");
  turnoverOriginScore(events, "1H", "FOR", "POINT");
  placedScore(events, "1H", "FOR");
  placedScore(events, "1H", "FOR");
  wides(events, "1H", "FOR", 3);

  // St Senans: 1 kickout-origin goal, 2 kickout-origin points,
  // 1 turnover-origin goal, 1 turnover-origin point, 1 placed point, 6 wides.
  kickoutOriginScore(events, "1H", "OPP", "GOAL");
  kickoutOriginScore(events, "1H", "OPP", "POINT");
  kickoutOriginScore(events, "1H", "OPP", "POINT");
  turnoverOriginScore(events, "1H", "OPP", "GOAL");
  turnoverOriginScore(events, "1H", "OPP", "POINT");
  placedScore(events, "1H", "OPP");
  wides(events, "1H", "OPP", 6);

  // ── 2H ──────────────────────────────────────────────────────────────────
  // ABK: 3 kickout-origin points, 2 turnover-origin points, 1 placed point,
  // 2 wides.
  kickoutOriginScore(events, "2H", "FOR", "POINT");
  kickoutOriginScore(events, "2H", "FOR", "POINT");
  kickoutOriginScore(events, "2H", "FOR", "POINT");
  turnoverOriginScore(events, "2H", "FOR", "POINT");
  turnoverOriginScore(events, "2H", "FOR", "POINT");
  placedScore(events, "2H", "FOR");
  wides(events, "2H", "FOR", 2);

  // St Senans: 3 turnover-origin points, 1 unlinked general-play point
  // (general-play total exceeds the restart+turnover origin sum by exactly
  // this one score — origin figures are not required to reconcile 1:1 with
  // the direct scoring breakdown), 6 wides.
  turnoverOriginScore(events, "2H", "OPP", "POINT");
  turnoverOriginScore(events, "2H", "OPP", "POINT");
  turnoverOriginScore(events, "2H", "OPP", "POINT");
  generalPlayScore(events, "2H", "OPP", "POINT");
  wides(events, "2H", "OPP", 6);

  return events;
}
