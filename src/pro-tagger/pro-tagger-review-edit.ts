/**
 * pro-tagger-review-edit.ts
 *
 * Which event types a Review edit may change an Event Stats event to, and
 * how the change is applied. Only changes fully determined by what the
 * event already records are allowed:
 *
 *   - within the event's own family, where the stored team side means the
 *     same thing before and after (attempts: the shooting team; kickout:
 *     the restart owner; turnover / free: always our side; discipline: the
 *     sanctioned team) — so no event ever moves to the other team;
 *   - only types normal capture can produce for this sport;
 *   - detail tags that no longer fit the new type are removed, never
 *     replaced with an invented source.
 *
 * Anything else is refused with a short reason and nothing is saved.
 */
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { MatchEventKind } from "../core/stats/stats-event-model";
import { getDisciplineOptions } from "./pro-tagger-discipline";
import type { ProTaggerSport } from "./pro-tagger-session";

const ATTEMPTS: readonly MatchEventKind[] = ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "WIDE", "SHOT"];
const FAMILIES: readonly (readonly MatchEventKind[])[] = [
  ATTEMPTS,
  ["KICKOUT_WON", "KICKOUT_CONCEDED"],
  ["TURNOVER_WON", "TURNOVER_LOST"],
  ["FREE_WON", "FREE_CONCEDED"],
  ["YELLOW_CARD", "SIN_BIN", "RED_CARD"],
];

// Detail tags Event Stats capture stores (tile labels, upper-cased).
const SOURCE_TAGS = ["PLAY", "FREE", "PENALTY", "MARK", "45", "65"];
const SHOT_TAGS = ["SHORT", "BLOCK/SAVE", "POST"];
const KICKOUT_TAGS = ["CLEAN", "BREAK", "FOUL"];
const TURNOVER_TAGS = ["TACKLE", "INTERCEPTION", "HP ERROR", "KP ERROR", "OVERCARRIED"];
const KNOWN_TAGS = new Set([
  ...SOURCE_TAGS, ...SHOT_TAGS, ...KICKOUT_TAGS, ...TURNOVER_TAGS,
  "WON", "CONCEDED", "YELLOW", "SIN BIN", "RED",
]);

/** Tags that belong on each kind; a known tag not listed here is removed on change. */
const VALID_TAGS: Partial<Record<MatchEventKind, readonly string[]>> = {
  GOAL:                 SOURCE_TAGS,
  POINT:                SOURCE_TAGS,
  WIDE:                 SOURCE_TAGS,
  TWO_POINTER:          ["PLAY", "FREE", "PENALTY", "MARK"],
  FORTY_FIVE_TWO_POINT: ["45"],
  SHOT:                 SHOT_TAGS,
  KICKOUT_WON:          KICKOUT_TAGS,
  KICKOUT_CONCEDED:     KICKOUT_TAGS,
  TURNOVER_WON:         TURNOVER_TAGS,
  TURNOVER_LOST:        TURNOVER_TAGS,
};
/** Kinds whose single tag is the kind itself (capture's tile label). */
const KIND_TAG: Partial<Record<MatchEventKind, string>> = {
  FREE_WON: "WON", FREE_CONCEDED: "CONCEDED",
  YELLOW_CARD: "YELLOW", SIN_BIN: "SIN BIN", RED_CARD: "RED",
};

function isFootball(sport: ProTaggerSport): boolean {
  return sport === "gaelic" || sport === "ladies_football";
}

/** Can normal Event Stats capture produce this kind in this sport? */
export function isCapturableKind(kind: MatchEventKind, sport: ProTaggerSport): boolean {
  if (kind === "TWO_POINTER" || kind === "FORTY_FIVE_TWO_POINT") return isFootball(sport);
  if (kind === "SIN_BIN") return getDisciplineOptions(sport).includes("SIN_BIN");
  return FAMILIES.some((f) => f.includes(kind));
}

const familyOf = (kind: MatchEventKind) => FAMILIES.find((f) => f.includes(kind)) ?? null;
const hasTag = (e: Pick<LoggedMatchEvent, "tags">, tag: string) => (e.tags ?? []).includes(tag);

/**
 * The kinds offered in the edit form's Type list: the event's own kind plus
 * every other kind it may safely become. 45/65 and sideline awards, and
 * kinds Event Stats never captures, offer only their own kind (player edits
 * stay available).
 */
export function editableKindsFor(event: Pick<LoggedMatchEvent, "kind" | "tags">, sport: ProTaggerSport): MatchEventKind[] {
  const family = familyOf(event.kind);
  if (!family) return [event.kind];
  return family.filter((k) => {
    if (k === event.kind) return true;
    if (!isCapturableKind(k, sport)) return false;
    if (family === ATTEMPTS) {
      if (k === "SHOT") return false;                                           // outcome of the shot unknown
      if (k === "FORTY_FIVE_TWO_POINT") return hasTag(event, "45");             // needs a recorded 45 source
      if (k === "TWO_POINTER") return !hasTag(event, "45");                     // a 45 source makes it a 45 two-pointer
    }
    return true;
  });
}

export type ReviewEditOutcome = {
  ok: boolean;
  /** The event with the new kind and tags applied (player fields untouched). */
  event: LoggedMatchEvent | null;
  /** Why the edit was refused — shown to the coach. */
  reason: string | null;
};

const refuse = (reason: string): ReviewEditOutcome => ({ ok: false, event: null, reason });

const KIND_NAME: Partial<Record<MatchEventKind, string>> = {
  GOAL: "goal", POINT: "point", TWO_POINTER: "two-pointer", FORTY_FIVE_TWO_POINT: "45 two-pointer",
  WIDE: "wide", SHOT: "shot", KICKOUT_WON: "restart won", KICKOUT_CONCEDED: "restart lost",
  TURNOVER_WON: "turnover won", TURNOVER_LOST: "turnover lost", FREE_WON: "free won",
  FREE_CONCEDED: "free conceded", YELLOW_CARD: "yellow card", SIN_BIN: "sin bin", RED_CARD: "red card",
  FORTY_FIVE_WON: "45/65 won", FORTY_FIVE_CONCEDED: "45/65 lost", SIDELINE_WON: "sideline won",
  SIDELINE_CONCEDED: "sideline lost",
};
const nameOf = (k: MatchEventKind) => KIND_NAME[k] ?? k.toLowerCase().replace(/_/g, " ");

/**
 * Applies a type change to `event`. `hasPlayerAfterEdit` is whether the
 * edited event will still name a player (number or name). Player fields are
 * the caller's; this decides only kind, tags and whether the change is safe.
 */
export function applyReviewKindEdit(
  event: LoggedMatchEvent,
  newKind: MatchEventKind,
  sport: ProTaggerSport,
  hasPlayerAfterEdit: boolean,
  squadIds: { home: string; away: string },
): ReviewEditOutcome {
  if (newKind === event.kind) return { ok: true, event, reason: null };

  const family = familyOf(event.kind);
  if (!family || !family.includes(newKind)) {
    return refuse(`A ${nameOf(event.kind)} can't be changed to a ${nameOf(newKind)} — delete it and tag the event again.`);
  }
  if (!isCapturableKind(newKind, sport)) {
    return refuse(`A ${nameOf(newKind)} isn't recorded in this sport.`);
  }

  let kind = newKind;
  if (family === ATTEMPTS) {
    if (kind === "SHOT") {
      return refuse(`A ${nameOf(event.kind)} can't be changed to a shot — how the shot ended isn't known. Delete it and tag the event again.`);
    }
    if (kind === "TWO_POINTER" && hasTag(event, "45")) kind = "FORTY_FIVE_TWO_POINT";
    if (kind === "FORTY_FIVE_TWO_POINT" && !hasTag(event, "45")) {
      return refuse("Only a score taken from a 45 can be a 45 two-pointer.");
    }
  }

  // Changing who won a restart moves the win to the other team; the player
  // tagged was on the side that won it, so they cannot stay attached. The
  // squad a player would later be picked from becomes the new winner's.
  let squadId = event.squadId;
  if (family[0] === "KICKOUT_WON") {
    if (hasPlayerAfterEdit) {
      return refuse("Clear the player before changing who won the restart — the player tagged was on the winning side.");
    }
    const winner = kind === "KICKOUT_WON" ? event.teamSide : event.teamSide === "FOR" ? "OPP" : "FOR";
    squadId = winner === "FOR" ? squadIds.home : squadIds.away;
  }

  const kindTag = KIND_TAG[kind];
  const valid = VALID_TAGS[kind] ?? [];
  const kept = (event.tags ?? []).filter((t) => !KNOWN_TAGS.has(t) || valid.includes(t));
  const tags = kindTag ? [kindTag, ...kept.filter((t) => !KNOWN_TAGS.has(t))] : kept;

  const edited: LoggedMatchEvent = { ...event, kind, type: kind, tags };
  if (squadId !== undefined) edited.squadId = squadId;
  return { ok: true, event: edited, reason: null };
}
