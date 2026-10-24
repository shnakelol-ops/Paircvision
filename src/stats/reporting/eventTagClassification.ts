/**
 * eventTagClassification.ts
 *
 * THE single translation between the sub-type tags each capture surface
 * stores and the canonical tags the report layer counts.
 *
 * Why this exists: Event Stats stores its tile label as the tag
 * (pro-tagger-adapter.ts → resolveKindAndSide), e.g. "INTERCEPTION",
 * "HP ERROR", "BLOCK/SAVE", "FOUL". Every report counter (teamStatsViews,
 * the PDF pages) was written against Match Stats' vocabulary ("INTERCEPT",
 * "SLACK_HAND_PASS", "BLOCK_SAVE", "FOUL_WON"…), so Event Stats tags were
 * never counted and those rows always printed 0.
 *
 * Translation is by event kind, not by string alone — the same stored tag
 * can mean different things on different kinds:
 *
 *   Kind                 Stored tag      Canonical tag     Meaning
 *   TURNOVER_WON/LOST    INTERCEPTION    INTERCEPT         won by / lost to an interception
 *   TURNOVER_WON/LOST    HP ERROR        SLACK_HAND_PASS   loser's hand-pass error
 *   TURNOVER_WON/LOST    KP ERROR        SLACK_KICK_PASS   loser's kick-pass error
 *   KICKOUT_WON          FOUL            FOUL_WON          restart owner kept it via a foul won
 *   KICKOUT_CONCEDED     FOUL            FOUL_CONCEDED     restart owner lost it via a foul conceded
 *   SHOT                 BLOCK/SAVE      BLOCK_SAVE        attempt blocked or saved
 *
 * Which team a turnover/kickout tag counts for is still decided by the
 * existing mirrored kind + teamSide rules in the counters — the
 * translation only names the method. A tag that is already canonical
 * (Match Stats, Rapid Capture, legacy) passes through unchanged, and the
 * stored tag is always kept alongside its canonical form, so each event is
 * one row in every "any of these tags" count — never two.
 *
 * Reporting-only: stored events are never rewritten.
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";

type TagTranslation = Partial<Record<MatchEventKind, Readonly<Record<string, string>>>>;

const TURNOVER_TAGS: Readonly<Record<string, string>> = {
  INTERCEPTION: "INTERCEPT",
  "HP ERROR": "SLACK_HAND_PASS",
  "KP ERROR": "SLACK_KICK_PASS",
};

export const REPORT_TAG_TRANSLATION: TagTranslation = {
  TURNOVER_WON: TURNOVER_TAGS,
  TURNOVER_LOST: TURNOVER_TAGS,
  KICKOUT_WON: { FOUL: "FOUL_WON" },
  KICKOUT_CONCEDED: { FOUL: "FOUL_CONCEDED" },
  SHOT: { "BLOCK/SAVE": "BLOCK_SAVE" },
};

type TaggedKindEvent = { kind: MatchEventKind; tags?: readonly string[] | null };

/**
 * The stored tags plus the canonical report tag for any tag this kind
 * translates. Returns the original array when nothing needs adding.
 */
export function reportTagsFor(
  kind: MatchEventKind,
  tags: readonly string[] | null | undefined,
): readonly string[] | null | undefined {
  const table = REPORT_TAG_TRANSLATION[kind];
  if (!table || !tags || tags.length === 0) return tags;
  const added: string[] = [];
  for (const tag of tags) {
    const canonical = table[tag];
    if (canonical && !tags.includes(canonical) && !added.includes(canonical)) added.push(canonical);
  }
  return added.length > 0 ? [...tags, ...added] : tags;
}

/**
 * Returns the event with canonical report tags added. Idempotent and
 * identity-preserving: an event that needs no translation (or was already
 * translated) is returned as the same object.
 */
export function withReportTags<T extends TaggedKindEvent>(event: T): T {
  const next = reportTagsFor(event.kind, event.tags);
  return next === event.tags ? event : { ...event, tags: next as T["tags"] };
}

/** Applies withReportTags to every event; returns the input array when nothing changed. */
export function normalizeEventsForReporting<T extends TaggedKindEvent>(events: readonly T[]): readonly T[] {
  let changed = false;
  const out = events.map((e) => {
    const n = withReportTags(e);
    if (n !== e) changed = true;
    return n;
  });
  return changed ? out : events;
}

// ─── Blocked / saved attempts ─────────────────────────────────────────────────

const BLOCKED_OR_SAVED_TAGS = ["BLOCK_SAVE", "BLOCKED", "BLOCK/SAVE"] as const;

/**
 * The one definition of a blocked or saved attempt: a non-scoring shot
 * attempt (SHOT or WIDE) tagged Block/Save (Event Stats), BLOCK_SAVE (Match
 * Stats) or BLOCKED (legacy). Short and Post outcomes are not blocked/saved.
 */
export function isBlockedOrSavedAttempt(event: TaggedKindEvent): boolean {
  if (event.kind !== "SHOT" && event.kind !== "WIDE") return false;
  return BLOCKED_OR_SAVED_TAGS.some((t) => event.tags?.includes(t) === true);
}
