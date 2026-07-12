// Pure event-construction logic for Rapid Capture, kept out of the React
// component so it can be tested directly. Match Stats is canonical here —
// this module only mirrors capture behaviour already confirmed in
// StatsModeSurface.tsx (restartOwner set explicitly for kickouts/puckouts,
// scores default to a SOURCE_PLAY tag, active-team reset after a conceded
// restart). No new event semantics are introduced.

import { createMatchEvent, type MatchEvent, type MatchEventKind } from "../core/stats/stats-event-model";

/** Kickout/puckout kinds — restartOwner is set explicitly for these, matching Match Stats. */
export const RESTART_KINDS = new Set<MatchEventKind>(["KICKOUT_WON", "KICKOUT_CONCEDED"]);

/** Score kinds that default to a source tag and prompt the temporary source bar. */
export const SCORE_SOURCE_TAGGABLE_KINDS = new Set<MatchEventKind>(["POINT", "GOAL", "TWO_POINTER", "WIDE"]);

export const DEFAULT_SCORE_SOURCE_TAG = "SOURCE_PLAY";

/** Same source tag vocabulary Match Stats writes (SCORING_SOURCE_TAGS) — no new tags invented. */
export const SOURCE_BAR_TAGS = ["SOURCE_PLAY", "SOURCE_FREE", "SOURCE_MARK", "SOURCE_45", "SOURCE_PENALTY"] as const;
export type SourceBarTag = (typeof SOURCE_BAR_TAGS)[number];

export type CapturedEventInput = {
  kind: MatchEventKind;
  nx: number;
  ny: number;
  half: 1 | 2;
  timestamp: number;
  teamSide: "FOR" | "OPP";
  createdAt?: number;
};

/**
 * Builds exactly one MatchEvent for a single pitch tap. Restart kinds get an
 * explicit restartOwner (= teamSide); score kinds default to SOURCE_PLAY
 * until the coach corrects it via the source bar. Every other kind is
 * unaffected — one tap always produces one event, never a mirrored pair.
 */
export function buildCapturedEvent(input: CapturedEventInput): MatchEvent {
  const isRestart = RESTART_KINDS.has(input.kind);
  const isScoreSourceTaggable = SCORE_SOURCE_TAGGABLE_KINDS.has(input.kind);
  return createMatchEvent({
    kind: input.kind,
    nx: input.nx,
    ny: input.ny,
    half: input.half,
    timestamp: input.timestamp,
    matchClockSeconds: input.timestamp,
    teamSide: input.teamSide,
    createdAt: input.createdAt ?? Date.now(),
    ...(isRestart ? { restartOwner: input.teamSide } : {}),
    ...(isScoreSourceTaggable ? { tags: [DEFAULT_SCORE_SOURCE_TAG] } : {}),
  });
}

/** True when this kind should prompt the temporary source bar after logging. */
export function isSourceTaggableKind(kind: MatchEventKind): boolean {
  return SCORE_SOURCE_TAGGABLE_KINDS.has(kind);
}

/**
 * Whether the source bar should currently be shown. False once its target
 * event no longer exists (e.g. removed by Undo) — dismissal never depends on
 * a stale id lingering after the underlying data changed.
 */
export function isSourceBarVisible(pendingEventId: string | null, events: readonly MatchEvent[]): boolean {
  return pendingEventId != null && events.some((event) => event.id === pendingEventId);
}

/**
 * Replaces the source tag on one already-logged event by id. Every other
 * event, and every other field on the matched event, is left untouched.
 * Returns a new array — never mutates the input.
 */
export function applySourceTag(
  events: readonly MatchEvent[],
  eventId: string,
  tag: SourceBarTag,
): MatchEvent[] {
  return events.map((event) => (event.id === eventId ? { ...event, tags: [tag] } : event));
}

/**
 * Match Stats resets its active-team toggle back to the coach's own team
 * immediately after logging a conceded/lost restart (KICKOUT_CONCEDED).
 * Every other kind leaves teamSide exactly as it was.
 */
export function nextTeamSideAfterEvent(kind: MatchEventKind, teamSide: "FOR" | "OPP"): "FOR" | "OPP" {
  return kind === "KICKOUT_CONCEDED" ? "FOR" : teamSide;
}
