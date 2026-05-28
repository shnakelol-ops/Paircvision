// Pure deterministic possession inference engine.
// No React, no Pixi, no UI dependencies.
//
// Rules are from the CURRENT INFERRED POSSESSION TEAM's perspective.
// The coach logs events as the team that currently has the ball.
// FLIP  = possession transfers to the other team.
// HOLD  = possession stays with the current team.
// UNCHANGED = ambiguous outcome; possession preserved until next event clarifies.

import type { MatchEventKind } from "../core/stats/stats-event-model";

export type PossessionSide = "FOR" | "OPP";

export type PossessionInferenceResult = {
  possessionBefore: PossessionSide;
  possessionAfter: PossessionSide;
  inferredBy: "EVENT_RULE" | "MANUAL_OVERRIDE" | "UNCHANGED";
};

function flip(side: PossessionSide): PossessionSide {
  return side === "FOR" ? "OPP" : "FOR";
}

export function inferNextPossession(
  current: PossessionSide,
  eventKind: MatchEventKind,
  manualOverride?: PossessionSide,
): PossessionInferenceResult {
  if (manualOverride !== undefined) {
    return {
      possessionBefore: current,
      possessionAfter: manualOverride,
      inferredBy: "MANUAL_OVERRIDE",
    };
  }

  let after: PossessionSide;
  let inferredBy: "EVENT_RULE" | "UNCHANGED" = "EVENT_RULE";

  switch (eventKind) {
    // Score — scorer concedes restart to the other team
    case "POINT":
    case "GOAL":
    case "TWO_POINTER":
    case "FORTY_FIVE_TWO_POINT":
    case "FREE_SCORED":
      after = flip(current);
      break;

    // Ball goes dead — other team restarts or takes free
    case "WIDE":
    case "FREE_MISSED":
    case "FREE_CONCEDED":
      after = flip(current);
      break;

    // Won contest or awarded ball — retain possession
    case "TURNOVER_WON":
    case "KICKOUT_WON":   // HOLD: V1 rule — logging a restart means current team retained it
    case "FREE_WON":
      after = current;
      break;

    // Lost the ball — possession transfers
    case "TURNOVER_LOST":
    case "KICKOUT_CONCEDED":
      after = flip(current);
      break;

    // Ambiguous outcome — do not change possession until next event clarifies
    case "SHOT":
    default:
      after = current;
      inferredBy = "UNCHANGED";
      break;
  }

  return { possessionBefore: current, possessionAfter: after, inferredBy };
}
