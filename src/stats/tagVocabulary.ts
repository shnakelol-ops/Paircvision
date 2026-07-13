/**
 * tagVocabulary.ts
 *
 * PáircVision has two independent capture UIs that write different literal
 * tag strings for the same real-world event detail:
 *
 *   Pro Tagger (src/pro-tagger/pro-tagger-families.ts):
 *     Turnover cause: TACKLE, HP ERROR, KP ERROR, OVERCARRIED
 *     Kickout type:   CLEAN, BREAK, FOUL  (single tag; won/lost comes from
 *                     which side benefited, not a WON/CONCEDED suffix)
 *     Shot detail:    SHORT, POST, 45 / 65, BLOCK/SAVE, MARK
 *
 *   Match Stats / Rapid Capture (StatsModeSurface.tsx, rapid-capture-events.ts):
 *     Turnover cause: TACKLE, INTERCEPT, OPP_ERROR (won) /
 *                     SLACK_HAND_PASS, SLACK_KICK_PASS, OVERCARRIED, STRIPPED (lost)
 *     Kickout type:   CLEAN, BREAK, FOUL_WON / FOUL_CONCEDED, KICKED_DEAD
 *     Shot detail:    SHORT, POST, FORTY_FIVE, BLOCK_SAVE, BLOCKED
 *
 * Before this module, every render call site in reviewPdfExport.ts hard-coded
 * one of these two vocabularies (usually the Match Stats one), so a match
 * captured through the other UI silently lost its cause/type/detail
 * breakdown — rows and buckets rendered zero even though the raw tag was
 * present on the event, just spelled differently.
 *
 * This module recognises every known real spelling for each canonical
 * bucket and is the single place new spellings get added. An unrecognised
 * tag classifies as "UNCLASSIFIED" and must be rendered as such wherever a
 * breakdown is shown — never silently dropped.
 */

// ─── Turnover cause ────────────────────────────────────────────────────────────

export type TurnoverCauseBucket =
  | "TACKLE_PRESS"
  | "SWARM_INTERCEPT"
  | "UNFORCED"
  | "SLACK_KP_HP"
  | "OC_STRIPPED"
  | "UNCLASSIFIED";

const TURNOVER_CAUSE_TAGS: Record<Exclude<TurnoverCauseBucket, "UNCLASSIFIED">, readonly string[]> = {
  TACKLE_PRESS:    ["TACKLE", "PRESS"],
  SWARM_INTERCEPT: ["SWARM", "INTERCEPT"],
  UNFORCED:        ["UNFORCED", "OPP_ERROR"],
  SLACK_KP_HP:     ["SLACK_KICK_PASS", "SLACK_HAND_PASS", "KP ERROR", "HP ERROR"],
  OC_STRIPPED:     ["OVERCARRIED", "STRIPPED"],
};

const TURNOVER_CAUSE_ORDER: readonly (keyof typeof TURNOVER_CAUSE_TAGS)[] = [
  "TACKLE_PRESS", "SWARM_INTERCEPT", "UNFORCED", "SLACK_KP_HP", "OC_STRIPPED",
];

/** Classifies a turnover event's tags into one canonical cause bucket. */
export function classifyTurnoverCauseTags(tags: readonly string[] | null | undefined): TurnoverCauseBucket {
  if (!tags || tags.length === 0) return "UNCLASSIFIED";
  for (const bucket of TURNOVER_CAUSE_ORDER) {
    if (TURNOVER_CAUSE_TAGS[bucket].some((t) => tags.includes(t))) return bucket;
  }
  return "UNCLASSIFIED";
}

// ─── Kickout type ──────────────────────────────────────────────────────────────

export type KickoutTypeBucket = "CLEAN" | "BREAK" | "FOUL" | "KICKED_DEAD" | "UNCLASSIFIED";

const KICKOUT_TYPE_TAGS: Record<Exclude<KickoutTypeBucket, "UNCLASSIFIED">, readonly string[]> = {
  CLEAN:       ["CLEAN"],
  BREAK:       ["BREAK"],
  FOUL:        ["FOUL", "FOUL_WON", "FOUL_CONCEDED"],
  KICKED_DEAD: ["KICKED_DEAD"],
};

const KICKOUT_TYPE_ORDER: readonly (keyof typeof KICKOUT_TYPE_TAGS)[] = [
  "CLEAN", "BREAK", "FOUL", "KICKED_DEAD",
];

/** Classifies a kickout event's tags into one canonical type bucket. */
export function classifyKickoutTypeTags(tags: readonly string[] | null | undefined): KickoutTypeBucket {
  if (!tags || tags.length === 0) return "UNCLASSIFIED";
  for (const bucket of KICKOUT_TYPE_ORDER) {
    if (KICKOUT_TYPE_TAGS[bucket].some((t) => tags.includes(t))) return bucket;
  }
  return "UNCLASSIFIED";
}

// ─── Shot detail ───────────────────────────────────────────────────────────────

export type ShotDetailBucket = "SHORT" | "POST" | "FORTY_FIVE" | "BLOCK_SAVE" | "UNCLASSIFIED";

const SHOT_DETAIL_TAGS: Record<Exclude<ShotDetailBucket, "UNCLASSIFIED">, readonly string[]> = {
  SHORT:      ["SHORT"],
  POST:       ["POST"],
  FORTY_FIVE: ["FORTY_FIVE", "45", "65"],
  BLOCK_SAVE: ["BLOCK_SAVE", "BLOCKED", "BLOCK/SAVE"],
};

const SHOT_DETAIL_ORDER: readonly (keyof typeof SHOT_DETAIL_TAGS)[] = [
  "SHORT", "POST", "FORTY_FIVE", "BLOCK_SAVE",
];

/** Classifies a shot/wide event's tags into one canonical detail bucket. */
export function classifyShotDetailTags(tags: readonly string[] | null | undefined): ShotDetailBucket {
  if (!tags || tags.length === 0) return "UNCLASSIFIED";
  for (const bucket of SHOT_DETAIL_ORDER) {
    if (SHOT_DETAIL_TAGS[bucket].some((t) => tags.includes(t))) return bucket;
  }
  return "UNCLASSIFIED";
}
