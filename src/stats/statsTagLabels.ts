export function getTagLabel(tag: string | undefined): string | null {
  if (!tag) return null;
  const t = tag.toUpperCase();
  const m: Record<string, string> = {
    TACKLE: "Tackle +1", PRESS: "Press +2", SWARM: "Swarm +3", INTERCEPT: "Intercept +1",
    UNFORCED: "Unforced", SLACK_KICK_PASS: "Slack KP", SLACK_HAND_PASS: "Slack HP", OVERCARRIED: "Overcarried", STRIPPED: "Stripped",
    CLEAN: "Clean", BREAK: "Break", FOUL_WON: "Foul Won", FOUL_CONCEDED: "Foul Conceded", KICKED_DEAD: "Kicked Dead",
    SHORT: "Short", POST: "Post", FORTY_FIVE: "45", BLOCKED: "Blocked",
  };
  return m[t] ?? t;
}
