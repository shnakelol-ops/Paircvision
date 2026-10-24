/**
 * kickout-phase.ts
 *
 * THE definition of a kickout-origin (puckout-origin) score, and the one
 * rule for when the possession a kickout started has changed hands. Both
 * Intelligence engines classify the events after a kickout with
 * kickoutPhaseStep(), so they can no longer disagree about a change of
 * possession.
 *
 * Kickout-origin score (restartAttributionFootnote: "every score in a
 * possession that began with a kickout, including frees won during it"):
 * a score by the team that won the kickout, in the possession that kickout
 * started. That possession ends at the first of:
 *
 *   1. a score by that team                → the kickout-origin score
 *   2. a wide / missed free by that team   → ended without a score
 *   3. a change of possession: any turnover, whichever team it is recorded
 *      under; any attempt (score, wide, shot) by the other team — they can
 *      only shoot if they had the ball; or a free, 45 / 65 or sideline
 *      awarded to the other team
 *   4. the next kickout / puckout
 *   5. KICKOUT_PHASE_WINDOW_SECS with none of the above (applied by callers)
 *
 * A free, 45 / 65 or sideline awarded to the team in possession does NOT end
 * it (RESTART_RETAINED): scores from it are kickout-origin, and the scoring
 * ledger still files placed-ball scores under Placed balls (the existing
 * bridge footnote, scoreLedger.restartOriginBridgeNote). A blocked, saved,
 * short or post shot by that team does not end it either.
 *
 * The possession-outcomes engine measures the IMMEDIATE outcome of a kickout
 * (Quick Review, outcome cards): it uses the same possession-change rule, and
 * by its documented design also treats a free won by the team in possession
 * as the start of a new phase (its "frees" family).
 *
 * Checked against the audit simulator's ground-truth possession roots
 * (audit/event-stats-red-repairs/scripts/diagnostics/kickout-origin-rules.mjs).
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { ChainableEvent } from "./chain-types";

export const KICKOUT_PHASE_WINDOW_SECS = 90;

const KICKOUT_KINDS = new Set<MatchEventKind>(["KICKOUT_WON", "KICKOUT_CONCEDED"]);

/** Dead-ball awards other than kickouts; the *_WON / *_CONCEDED pair says who has the ball. */
const AWARD_WON_KINDS = new Set<MatchEventKind>(["FREE_WON", "FORTY_FIVE_WON", "SIDELINE_WON"]);
const AWARD_CONCEDED_KINDS = new Set<MatchEventKind>(["FREE_CONCEDED", "FORTY_FIVE_CONCEDED", "SIDELINE_CONCEDED"]);

/** Recorded changes of possession, whichever team they are stored under. */
const POSSESSION_CHANGE_KINDS = new Set<MatchEventKind>([
  "TURNOVER_WON", "TURNOVER_LOST",
  "POSSESSION_WON", "POSSESSION_LOST",
]);

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);
const MISS_KINDS = new Set<MatchEventKind>(["WIDE", "FREE_MISSED"]);

export type KickoutPhaseStep =
  | "SCORE"             // the kickout winner scored — ends the possession
  | "MISS"              // the kickout winner went wide / missed a free — ends it
  | "SHOT"              // the kickout winner's non-scoring shot — continues
  | "POSSESSION_CHANGE" // the ball changed hands — ends it
  | "NEXT_KICKOUT"      // the next kickout / puckout — ends it
  | "RESTART_RETAINED"  // free / 45-65 / sideline to the team in possession — continues
  | "CONTINUE";

/** Classifies one later event against a kickout won by `winningSide`. */
export function kickoutPhaseStep(
  event: Pick<ChainableEvent, "kind" | "teamSide">,
  winningSide: "FOR" | "OPP",
): KickoutPhaseStep {
  const { kind, teamSide } = event;
  if (KICKOUT_KINDS.has(kind)) return "NEXT_KICKOUT";
  if (AWARD_WON_KINDS.has(kind) || AWARD_CONCEDED_KINDS.has(kind)) {
    const awardedTo = AWARD_WON_KINDS.has(kind) ? teamSide : teamSide === "FOR" ? "OPP" : "FOR";
    return awardedTo === winningSide ? "RESTART_RETAINED" : "POSSESSION_CHANGE";
  }
  if (POSSESSION_CHANGE_KINDS.has(kind)) return "POSSESSION_CHANGE";
  const isAttempt = SCORE_KINDS.has(kind) || MISS_KINDS.has(kind) || kind === "SHOT";
  if (!isAttempt) return "CONTINUE";
  if (teamSide !== winningSide) return "POSSESSION_CHANGE";
  if (SCORE_KINDS.has(kind)) return "SCORE";
  if (MISS_KINDS.has(kind)) return "MISS";
  return "SHOT";
}
