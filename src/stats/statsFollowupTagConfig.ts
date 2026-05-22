import type { MatchEventKind } from "../core/stats/stats-event-model";

export type FollowupOption = { label: string; tag: string | null };
export const FOLLOWUP_TAG_GROUPS: Record<string, readonly string[]> = {
  TURNOVER_WON: ["TACKLE", "PRESS", "SWARM", "INTERCEPT"],
  TURNOVER_LOST: ["UNFORCED", "SLACK_KICK_PASS", "SLACK_HAND_PASS", "OVERCARRIED", "STRIPPED"],
  KICKOUT_WON: ["CLEAN", "BREAK", "FOUL_WON"],
  KICKOUT_CONCEDED: ["CLEAN", "BREAK", "FOUL_CONCEDED", "KICKED_DEAD"],
  SHOT: ["SHORT", "POST", "FORTY_FIVE", "BLOCKED"],
};

export function getFollowupOptions(kind: MatchEventKind): readonly FollowupOption[] {
  if (kind === "TURNOVER_WON") return [{ label: "Tackle +1", tag: "TACKLE" }, { label: "Press +2", tag: "PRESS" }, { label: "Swarm +3", tag: "SWARM" }, { label: "Intercept +1", tag: "INTERCEPT" }, { label: "Skip", tag: null }];
  if (kind === "TURNOVER_LOST") return [{ label: "Unforced", tag: "UNFORCED" }, { label: "Slack KP", tag: "SLACK_KICK_PASS" }, { label: "Slack HP", tag: "SLACK_HAND_PASS" }, { label: "Overcarried", tag: "OVERCARRIED" }, { label: "Stripped", tag: "STRIPPED" }, { label: "Skip", tag: null }];
  if (kind === "KICKOUT_WON") return [{ label: "Clean", tag: "CLEAN" }, { label: "Break", tag: "BREAK" }, { label: "Foul Won", tag: "FOUL_WON" }, { label: "Skip", tag: null }];
  if (kind === "KICKOUT_CONCEDED") return [{ label: "Clean Lost", tag: "CLEAN" }, { label: "Break Lost", tag: "BREAK" }, { label: "Foul Conceded", tag: "FOUL_CONCEDED" }, { label: "Kicked Dead", tag: "KICKED_DEAD" }, { label: "Skip", tag: null }];
  if (kind === "SHOT") return [{ label: "Short", tag: "SHORT" }, { label: "Post", tag: "POST" }, { label: "45", tag: "FORTY_FIVE" }, { label: "Blocked", tag: "BLOCKED" }, { label: "Skip", tag: null }];
  return [{ label: "Skip", tag: null }];
}
