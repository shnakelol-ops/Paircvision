// Pure event-construction and enrichment logic for Rapid Capture, kept out
// of the React component so it can be tested directly. Match Stats is
// canonical here — every tag string, restartOwner rule, and player field
// name mirrors capture behaviour already confirmed in StatsModeSurface.tsx.
// Score values are computed via the shared scoreLedger helpers (the same
// definition MatchReport's ledger uses), not a local copy. No new event
// semantics are introduced.
//
// Philosophy: capture first, enrich second, never block. A tap always
// produces exactly one saved event immediately; the detail bar and player
// bar only ever update an already-saved event afterwards.

import { createMatchEvent, type MatchEvent, type MatchEventKind } from "../core/stats/stats-event-model";
import { SCORE_KINDS, scoreValue } from "../stats/ledger/scoreLedger";

/**
 * Rapid Capture's working event type. Adds the same optional player-
 * attribution fields LoggedMatchEvent already carries (src/core/stats/
 * saved-match.ts) so an enriched Rapid Capture event is structurally
 * identical to what the Match Stats intelligence engine already expects —
 * no adapter/transform needed later. Field names are canonical, not new.
 */
export type RapidMatchEvent = MatchEvent & {
  playerId?: string;
  playerName?: string;
  playerNumber?: number;
  squadId?: string;
};

/** A single roster entry — squad number is canonical; name is optional. */
export type RapidSquadPlayer = {
  id?: string;
  number: number;
  name?: string;
};

/** Kickout/puckout kinds — restartOwner is set explicitly for these, matching Match Stats. */
export const RESTART_KINDS = new Set<MatchEventKind>(["KICKOUT_WON", "KICKOUT_CONCEDED"]);

/** Score kinds that default to a source tag and prompt the detail bar. */
export const SCORE_SOURCE_TAGGABLE_KINDS = new Set<MatchEventKind>(["POINT", "GOAL", "TWO_POINTER", "WIDE"]);

export const DEFAULT_SCORE_SOURCE_TAG = "SOURCE_PLAY";

/** Same source tag vocabulary Match Stats writes (SCORING_SOURCE_TAGS) — no new tags invented. */
export const SOURCE_BAR_TAGS = ["SOURCE_PLAY", "SOURCE_FREE", "SOURCE_MARK", "SOURCE_45", "SOURCE_PENALTY"] as const;
export type SourceBarTag = (typeof SOURCE_BAR_TAGS)[number];

export type DetailOption = { tag: string; label: string };

// ─── Detail-bar option sets ───────────────────────────────────────────────────
// Every tag string below is copied verbatim from StatsModeSurface.tsx's
// getFollowupOptions / SCORING_SOURCE_TAGS — nothing here is invented.

const SCORE_DETAIL_OPTIONS: DetailOption[] = [
  { tag: "SOURCE_PLAY", label: "Play" },
  { tag: "SOURCE_FREE", label: "Free" },
  { tag: "SOURCE_MARK", label: "Mark" },
  { tag: "SOURCE_45", label: "45" },
  { tag: "SOURCE_PENALTY", label: "Penalty" },
];

const TURNOVER_WON_DETAIL_OPTIONS: DetailOption[] = [
  { tag: "TACKLE", label: "Tackle" },
  { tag: "INTERCEPT", label: "Intercept" },
  { tag: "OPP_ERROR", label: "Opposition Error" },
];

const TURNOVER_LOST_DETAIL_OPTIONS: DetailOption[] = [
  { tag: "SLACK_HAND_PASS", label: "Hand Pass Error" },
  { tag: "SLACK_KICK_PASS", label: "Kick Pass Error" },
  { tag: "OVERCARRIED", label: "Overcarried" },
  { tag: "STRIPPED", label: "Tackled" },
];

// Match Stats' KICKOUT_WON follow-up set has no "Kicked Dead" option — only
// KICKOUT_CONCEDED does. Kept exactly as audited; not extended to match the
// (slightly looser) sprint brief.
const KICKOUT_WON_DETAIL_OPTIONS: DetailOption[] = [
  { tag: "CLEAN", label: "Clean" },
  { tag: "BREAK", label: "Break" },
  { tag: "FOUL_WON", label: "Foul Won" },
];

const KICKOUT_CONCEDED_DETAIL_OPTIONS: DetailOption[] = [
  { tag: "CLEAN", label: "Clean Lost" },
  { tag: "BREAK", label: "Break Lost" },
  { tag: "FOUL_CONCEDED", label: "Foul Conceded" },
  { tag: "KICKED_DEAD", label: "Kicked Dead" },
];

/** Returns the canonical detail-bar option set for a kind, or null if that kind has none. */
export function detailOptionsForKind(kind: MatchEventKind): DetailOption[] | null {
  switch (kind) {
    case "POINT":
    case "GOAL":
    case "TWO_POINTER":
    case "WIDE":
      return SCORE_DETAIL_OPTIONS;
    case "TURNOVER_WON":
      return TURNOVER_WON_DETAIL_OPTIONS;
    case "TURNOVER_LOST":
      return TURNOVER_LOST_DETAIL_OPTIONS;
    case "KICKOUT_WON":
      return KICKOUT_WON_DETAIL_OPTIONS;
    case "KICKOUT_CONCEDED":
      return KICKOUT_CONCEDED_DETAIL_OPTIONS;
    default:
      return null;
  }
}

/** Kinds eligible for the optional Player Recognition bar. */
export const PLAYER_RECOGNITION_KINDS = new Set<MatchEventKind>([
  "SHOT",
  "WIDE",
  "POINT",
  "GOAL",
  "TWO_POINTER",
  "TURNOVER_WON",
  "TURNOVER_LOST",
  "KICKOUT_WON",
  "KICKOUT_CONCEDED",
  "FREE_WON",
  "FREE_CONCEDED",
]);

export function isPlayerRecognitionEligible(kind: MatchEventKind): boolean {
  return PLAYER_RECOGNITION_KINDS.has(kind);
}

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
 * Builds exactly one event for a single pitch tap. Restart kinds get an
 * explicit restartOwner (= teamSide); score kinds default to SOURCE_PLAY
 * until the coach corrects it via the detail bar. Every other kind is
 * unaffected — one tap always produces one event, never a mirrored pair.
 */
export function buildCapturedEvent(input: CapturedEventInput): RapidMatchEvent {
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

/**
 * True while the enrichment target event still exists. False once it's gone
 * (e.g. removed by Undo) — a bar never lingers on a stale/removed event.
 */
export function isEnrichmentTargetVisible(
  pendingEventId: string | null,
  events: readonly RapidMatchEvent[],
): boolean {
  return pendingEventId != null && events.some((event) => event.id === pendingEventId);
}

/**
 * Replaces the detail tag on one already-logged event by id. Every other
 * event, and every other field on the matched event, is left untouched.
 * Returns a new array — never mutates the input.
 */
export function applyDetailTag(
  events: readonly RapidMatchEvent[],
  eventId: string,
  tag: string,
): RapidMatchEvent[] {
  return events.map((event) => (event.id === eventId ? { ...event, tags: [tag] } : event));
}

/**
 * Sets player attribution on one already-logged event by id. Only the
 * fields present on `player` are written; every other field is untouched.
 */
export function applyPlayerNumber(
  events: readonly RapidMatchEvent[],
  eventId: string,
  player: RapidSquadPlayer,
): RapidMatchEvent[] {
  return events.map((event) =>
    event.id === eventId
      ? {
          ...event,
          playerNumber: player.number,
          ...(player.name ? { playerName: player.name } : {}),
          ...(player.id ? { playerId: player.id } : {}),
        }
      : event,
  );
}

/**
 * Match Stats resets its active-team toggle back to the coach's own team
 * immediately after logging a conceded/lost restart (KICKOUT_CONCEDED).
 * Every other kind leaves teamSide exactly as it was.
 */
export function nextTeamSideAfterEvent(kind: MatchEventKind, teamSide: "FOR" | "OPP"): "FOR" | "OPP" {
  return kind === "KICKOUT_CONCEDED" ? "FOR" : teamSide;
}

// ─── One incident, one event ─────────────────────────────────────────────────
// Turnovers and frees are zero-sum between the two teams: TURNOVER_LOST/
// FREE_CONCEDED logged under FOR's perspective already tell the whole story —
// downstream intelligence derives the OPP-benefit side by inversion (see the
// Match Stats parity audit's TACTICAL_INVERT_KINDS). Logging the same
// incident again from OPP's perspective would double-count it. Kickouts are
// exempt: ownership of a restart is a distinct fact worth recording from
// either side directly.

/** Kinds disabled while OPP is the active annotation perspective. */
export const OPP_DISABLED_KINDS = new Set<MatchEventKind>([
  "TURNOVER_WON",
  "TURNOVER_LOST",
  "FREE_WON",
  "FREE_CONCEDED",
]);

export function isKindAllowedForTeamSide(kind: MatchEventKind, teamSide: "FOR" | "OPP"): boolean {
  return teamSide === "FOR" || !OPP_DISABLED_KINDS.has(kind);
}

// ─── Team-coloured player chips ──────────────────────────────────────────────
// Colour is presentation only — resolved from the event's actual teamSide
// (immutable once captured), never from whatever the live FOR/OPP toggle
// happens to show by the time the player bar renders.

export function resolveTeamColour(
  teamSide: "FOR" | "OPP" | undefined,
  colours: { forTeamColour: string; oppTeamColour: string },
): string {
  return teamSide === "OPP" ? colours.oppTeamColour : colours.forTeamColour;
}

// ─── Enrichment sequencing ──────────────────────────────────────────────────
// Detail bar first (if the kind has one), then the optional Player
// Recognition bar, then nothing. Only one bar exists at any moment — starting
// a new capture always replaces whatever enrichment was pending, it never
// queues a second one.

export type EnrichmentStage = "detail" | "player";

export type EnrichmentState = { eventId: string; kind: MatchEventKind; stage: EnrichmentStage } | null;

/** Decides which bar (if any) should open immediately after logging a new event. */
export function startEnrichment(eventId: string, kind: MatchEventKind): EnrichmentState {
  if (detailOptionsForKind(kind) != null) return { eventId, kind, stage: "detail" };
  if (isPlayerRecognitionEligible(kind)) return { eventId, kind, stage: "player" };
  return null;
}

/** Called when the detail bar finishes (tap or timeout) — advances to player, or dismisses. */
export function advanceEnrichment(current: EnrichmentState): EnrichmentState {
  if (!current) return null;
  if (current.stage === "detail" && isPlayerRecognitionEligible(current.kind)) {
    return { eventId: current.eventId, kind: current.kind, stage: "player" };
  }
  return null;
}

// ─── Live scoreboard ─────────────────────────────────────────────────────────
// Standard GAA scoring convention (goals worth 3, points worth 1, two-
// pointers worth 2) — pure function of events, recomputed on every render so
// Undo always recalculates correctly with no manual editing possible.

export type TeamScoreLine = { goals: number; points: number; twoPointers: number; total: number };
export type RapidScoreboard = { for: TeamScoreLine; opp: TeamScoreLine };

function tallyTeamScore(events: readonly RapidMatchEvent[], side: "FOR" | "OPP"): TeamScoreLine {
  let goals = 0;
  let points = 0;
  let twoPointers = 0;
  for (const event of events) {
    if (event.teamSide !== side || !SCORE_KINDS.has(event.kind)) continue;
    if (event.kind === "GOAL") {
      goals += 1;
      continue;
    }
    const value = scoreValue(event.kind);
    if (value === 2) twoPointers += 1;
    points += value;
  }
  return { goals, points, twoPointers, total: goals * 3 + points };
}

export function computeRapidScoreboard(events: readonly RapidMatchEvent[]): RapidScoreboard {
  return { for: tallyTeamScore(events, "FOR"), opp: tallyTeamScore(events, "OPP") };
}

/** "1-08" GAA scoreline notation, with a small two-pointer count appended when relevant. */
export function formatScoreLine(line: TeamScoreLine): string {
  const base = `${line.goals}-${String(line.points).padStart(2, "0")}`;
  return line.twoPointers > 0 ? `${base} (${line.twoPointers}×2pt)` : base;
}
