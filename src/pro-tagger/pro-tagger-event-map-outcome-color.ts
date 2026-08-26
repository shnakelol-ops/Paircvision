import type { MatchEventKind } from "../core/stats/stats-event-model";
import { normalizeReviewEventTeamSide } from "../stats/review-selectors";
import type { ReviewSelectableEvent } from "../stats/review-types";

// Reuses the existing locked event-family colours (see CLAUDE.md "Visual
// Language"): purple is already Turnover Won's fill, red is already Wide/
// Free Missed's fill. No new colour values are introduced.
const OUTCOME_WON_FILL  = "rgba(167, 139, 250, 1)"; // purple #a78bfa
const OUTCOME_LOST_FILL = "rgba(239, 68, 68, 1)";   // red #ef4444

const OUTCOME_KINDS = new Set<MatchEventKind>([
  "KICKOUT_WON", "KICKOUT_CONCEDED", "TURNOVER_WON", "TURNOVER_LOST",
]);
const WINNING_KINDS = new Set<MatchEventKind>(["KICKOUT_WON", "TURNOVER_WON"]);

/**
 * Review Event Map only: for Kickout/Turnover events, resolves the marker
 * fill so a won/retained outcome for the currently-viewed team is always
 * purple and a lost/conceded outcome is always red — regardless of which
 * raw kind (WON vs CONCEDED/LOST) happens to carry it.
 *
 * teamSide semantics (see ProTaggerLiveScreen.countRestartWon /
 * computeProTaggerCounts, and pro-tagger-adapter.ts's resolveRestartOutcome):
 * a *_WON event's teamSide names the side that won it; a *_CONCEDED/*_LOST
 * event's teamSide names the side that lost it to the other side.
 *
 * Returns undefined (leave the default per-kind colour) for any other event
 * kind, or when no single team is selected.
 */
export function resolveEventMapOutcomeFill(
  event: ReviewSelectableEvent,
  viewedTeam: "FOR" | "OPP" | null,
): string | undefined {
  if (viewedTeam == null) return undefined;
  if (!OUTCOME_KINDS.has(event.kind)) return undefined;

  const eventSide = normalizeReviewEventTeamSide(event);
  const winnerSide: "FOR" | "OPP" = WINNING_KINDS.has(event.kind)
    ? eventSide
    : eventSide === "FOR" ? "OPP" : "FOR";

  return winnerSide === viewedTeam ? OUTCOME_WON_FILL : OUTCOME_LOST_FILL;
}
