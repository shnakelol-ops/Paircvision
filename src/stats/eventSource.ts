export type ScoreSource = "PLAY" | "FREE" | "MARK" | "45" | "PENALTY" | "UNKNOWN";

type EventLike = { kind?: string; tags?: readonly string[] | string[] | null };

export function eventSource(event: EventLike): ScoreSource {
  const k = event.kind;
  // Legacy kind aliases — never written by current loggers but treated as authoritative
  if (k === "FREE_SCORED" || k === "FREE_MISSED") return "FREE";
  if (k === "FORTY_FIVE_TWO_POINT")               return "45";
  if (k === "SHOT")                               return "UNKNOWN";

  const tags = event.tags;
  if (!tags) return "UNKNOWN";

  // Stats Lite uses SOURCE_* prefix; Stats Pro uses bare labels.
  // Pro JSON can emit FORTY_FIVE, which should display in the "45" source row.
  if (tags.includes("SOURCE_FREE")    || tags.includes("FREE"))    return "FREE";
  if (tags.includes("SOURCE_PLAY")    || tags.includes("PLAY"))    return "PLAY";
  if (tags.includes("SOURCE_MARK")    || tags.includes("MARK"))    return "MARK";
  if (
    tags.includes("SOURCE_45") ||
    tags.includes("45") ||
    tags.includes("FORTY_FIVE")
  ) return "45";
  if (tags.includes("SOURCE_PENALTY") || tags.includes("PENALTY")) return "PENALTY";
  return "UNKNOWN";
}

/** True when the event is a scored free kick (GOAL/POINT/TWO_POINTER with free source, or legacy FREE_SCORED). */
export function isFreeScore(event: EventLike): boolean {
  const k = event.kind;
  if (k === "FREE_SCORED") return true;
  if (k === "WIDE" || k === "FREE_MISSED" || k === "SHOT") return false;
  return eventSource(event) === "FREE";
}

/** True when the event is a missed/wide free kick (WIDE with free source, or legacy FREE_MISSED). */
export function isFreeMiss(event: EventLike): boolean {
  const k = event.kind;
  if (k === "FREE_MISSED") return true;
  if (k === "WIDE") return eventSource(event) === "FREE";
  return false;
}
