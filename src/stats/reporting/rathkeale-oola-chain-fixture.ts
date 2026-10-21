/**
 * rathkeale-oola-chain-fixture.ts
 *
 * CONSTRUCTED regression fixture for the Rathkeale v Oola chain-attribution
 * errors found in the October 2026 intelligence audit. The original event
 * log was not available, so — following the ABK fixture convention — the
 * event sequence below is built so the UNMODIFIED chain engine reproduces
 * the chain table printed on that match's Full Report (Chain Intelligence,
 * page 26), exactly:
 *
 *   Rule (rule match)                      Rathkeale   Oola
 *   Kickout Won → Score                        2         3
 *   Other team lost kickout → Score            6         2
 *   Turnover Won → Score                       7         0
 *   Turnover Won → Shot                        9         0
 *   Free Won → Goal                            0         0
 *   Total rule matches                        24         5
 *
 * Turnovers are logged from Rathkeale's side only (Oola's turnover wins are
 * Rathkeale TURNOVER_LOST events), as in the real match, which is why Oola's
 * turnover rule counts are structurally 0. The sequence also reproduces two
 * other recorded features of that report: both teams' longest unanswered
 * run is 4 scores, and an Oola run continues across half-time.
 *
 * Scorelines, restart and turnover totals are NOT the real match's — only
 * the chain table and the run shapes are. Replace with the real exported
 * event log when it becomes available (see the Stage 1 correction plan).
 *
 * This is a REFERENCE FIXTURE: do not hand-tune it to make a test pass.
 */

import type { ChainableEvent } from "../chains/chain-types";
import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../../core/stats/stats-event-model";

export const RATHKEALE_OOLA_TEAMS = {
  home: "Rathkeale",
  away: "Oola",
} as const;

/** The chain table printed on the real Rathkeale v Oola Full Report. */
export const RATHKEALE_OOLA_CHAIN_TABLE = {
  FOR: { KICKOUT_TO_SCORE: 2, KICKOUT_LOST_TO_SCORE_AGAINST: 6, TURNOVER_TO_SCORE: 7, TURNOVER_TO_SHOT: 9, FREE_WON_TO_GOAL: 0 },
  OPP: { KICKOUT_TO_SCORE: 3, KICKOUT_LOST_TO_SCORE_AGAINST: 2, TURNOVER_TO_SCORE: 0, TURNOVER_TO_SHOT: 0, FREE_WON_TO_GOAL: 0 },
  totalFor: 24,
  totalOpp: 5,
} as const;

type Side = "FOR" | "OPP";

/**
 * One possession block: an optional anchor event followed 20 s later by an
 * outcome event. Blocks are 140 s apart, so no rule window (≤ 90 s) can
 * reach from one block's anchor into the next block's outcome.
 */
type Block = {
  anchor?: { kind: MatchEventKind; teamSide: Side; restartOwner?: Side };
  outcome: { kind: MatchEventKind; teamSide: Side };
};

const rKoWon: Block      = { anchor: { kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR" }, outcome: { kind: "POINT", teamSide: "FOR" } };
const rOppKoLost: Block  = { anchor: { kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP" }, outcome: { kind: "POINT", teamSide: "FOR" } };
const rTvScore: Block    = { anchor: { kind: "TURNOVER_WON", teamSide: "FOR" }, outcome: { kind: "POINT", teamSide: "FOR" } };
const rTvWide: Block     = { anchor: { kind: "TURNOVER_WON", teamSide: "FOR" }, outcome: { kind: "WIDE", teamSide: "FOR" } };
const oKoWon: Block      = { anchor: { kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP" }, outcome: { kind: "POINT", teamSide: "OPP" } };
const oOurKoLost: Block  = { anchor: { kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR" }, outcome: { kind: "POINT", teamSide: "OPP" } };
const oTvScore: Block    = { anchor: { kind: "TURNOVER_LOST", teamSide: "FOR" }, outcome: { kind: "POINT", teamSide: "OPP" } };
const oTvWide: Block     = { anchor: { kind: "TURNOVER_LOST", teamSide: "FOR" }, outcome: { kind: "WIDE", teamSide: "OPP" } };
const oPoint: Block      = { outcome: { kind: "POINT", teamSide: "OPP" } };

// Score order — 1H: R R R R · O O O O · R R · O O | 2H: O · R R R R · O · R R R R · O · R
// Longest runs: Rathkeale 4 (twice), Oola 4; Oola's last two 1H scores and
// first 2H score form a 3-score run across half-time.
const FIRST_HALF: readonly Block[] = [
  rKoWon, rKoWon, rOppKoLost, rOppKoLost,
  oKoWon, oKoWon, oKoWon, oOurKoLost,
  rTvWide,
  rOppKoLost, rOppKoLost,
  oTvWide,
  oOurKoLost, oTvScore,
];

const SECOND_HALF: readonly Block[] = [
  oPoint,
  rOppKoLost, rOppKoLost, rTvScore, rTvScore,
  oPoint,
  rTvWide,
  rTvScore, rTvScore, rTvScore, rTvScore,
  oTvWide,
  oPoint,
  rTvScore,
];

function segmentFor(period: MatchEventPeriod, clock: number): MatchEventSegment {
  const inHalf = clock < 600 ? 1 : clock < 1200 ? 2 : 3;
  return (period === "1H" ? inHalf : inHalf + 3) as MatchEventSegment;
}

function blocksToEvents(blocks: readonly Block[], period: MatchEventPeriod, startId: number): ChainableEvent[] {
  const events: ChainableEvent[] = [];
  let id = startId;
  blocks.forEach((block, i) => {
    const anchorClock = 30 + i * 140;
    const push = (e: { kind: MatchEventKind; teamSide: Side; restartOwner?: Side }, clock: number) => {
      events.push({
        id: `rvo-${id++}`,
        kind: e.kind,
        teamSide: e.teamSide,
        period,
        segment: segmentFor(period, clock),
        matchClockSeconds: clock,
        nx: 0.5,
        ny: 0.5,
        ...(e.restartOwner ? { restartOwner: e.restartOwner } : {}),
      });
    };
    if (block.anchor) push(block.anchor, anchorClock);
    push(block.outcome, anchorClock + 20);
  });
  return events;
}

export function buildRathkealeOolaChainFixture(): ChainableEvent[] {
  const first = blocksToEvents(FIRST_HALF, "1H", 0);
  return [...first, ...blocksToEvents(SECOND_HALF, "2H", first.length)];
}
