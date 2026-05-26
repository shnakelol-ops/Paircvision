import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import {
  createInitialMatchEngineState,
  goToHalfTime,
  endMatch,
  formatMatchClock,
  isLoggingActive,
  startFirstHalf,
  startSecondHalf,
  tickMatchClock,
  type MatchEngineState,
  type MatchState,
} from "./core/match/match-state-store";
import { createPixiPitchSurface } from "./core/pitch/create-pixi-pitch-surface";
import {
  MATCH_EVENT_KINDS,
  type MatchEvent,
  type MatchEventKind,
  type MatchEventPeriod,
  type MatchEventSegment,
} from "./core/stats/stats-event-model";
import { gaaModeConfig, type GaaModeKey } from "./config/gaaModeConfig";
import { useScreenWakeLock } from "./hooks/useScreenWakeLock";
import { NotesQuickPanel } from "./features/notes";
import VisionStadiumBackground from "./components/VisionStadiumBackground";
import { deriveSegmentFromPeriodClock, halfFromPeriod, periodFromHalf } from "./stats/statsSegments";
import { buildStatsShareCardPng } from "./stats/statsShareCard";
import { selectReviewEvents } from "./stats/review-selectors";
import { createReviewSession, parseReviewSession, restoreReviewSession, serializeReviewSession } from "./stats/reviewSession";
import { selectZoneOverlayModel } from "./stats/zones/zone-selectors";
import type { ZoneOverlayModel } from "./stats/zones/zone-types";
import { exportReviewPdf } from "./stats/reviewPdfExport";
import { generateDemoMatchEvents } from "./demo/demoMatchData";

type VisibilityMode = "ALL" | "LAST_5" | "LAST_10";
type TeamScore = { goals: number; points: number; total: number };
type TeamSide = "HOME" | "AWAY";
type UtilityPanel = "PLAYERS" | "REVIEW" | "SUMMARY" | "SAVED_MATCHES" | "NOTES" | null;
type ReviewHalf = "H1" | "H2" | "FULL";
type ReviewSegment = "ALL" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6";
type ReviewTeamContext = "ALL" | "FOR" | "OPP";
type ReviewEventFilter =
  | "ALL"
  | "SCORES"
  | "SHOTS"
  | "WIDES"
  | "TURNOVERS"
  | "KICKOUTS"
  | "FREES"
  | "PLAYERS";
type ReviewZone = "FULL" | "OWN_HALF" | "OPPOSITION_HALF";
type AttackingDirection = "LEFT" | "RIGHT";
type PlayerRole = "STARTER" | "SUB";
type FollowupTag =
  | "CLEAN"
  | "BREAK"
  | "FOUL_WON"
  | "FOUL_CONCEDED"
  | "KICKED_DEAD"
  | "TACKLE"
  | "PRESS"
  | "SWARM"
  | "INTERCEPT"
  | "UNFORCED"
  | "SLACK_KICK_PASS"
  | "SLACK_HAND_PASS"
  | "OVERCARRIED"
  | "STRIPPED"
  | "FORCED"
  | "SHORT"
  | "POST"
  | "FORTY_FIVE"
  | "BLOCKED"
  | "BLOCK_SAVE";
type PendingFollowupKind =
  | "KICKOUT_WON"
  | "KICKOUT_CONCEDED"
  | "TURNOVER_WON"
  | "TURNOVER_LOST"
  | "SHOT";
type FollowupOption = { label: string; tag: FollowupTag };
type EventKeyboardMenuId =
  | "GOAL"
  | "POINT"
  | "TWO_POINTER"
  | "SHOT"
  | "WIDE"
  | "TURNOVER_WON"
  | "TURNOVER_LOST"
  | "KICKOUT_WON"
  | "KICKOUT_CONCEDED";
type EventKeyboardTone = "score" | "wide" | "turnover" | "kickout" | "free";
type EventKeyboardOption = { label: string; kind: MatchEventKind; tag?: string };
type SquadPlayer = {
  id: string;
  name: string;
  number: number;
  role: PlayerRole;
  isActive?: boolean;
  activeSlot?: number;
};
type Squad = { id: string; name: string; players: SquadPlayer[]; team?: TeamSide };
type SavedSquadPlayer = { id: string; number: number; name: string; isActive?: boolean };
type SavedSquad = {
  id: string;
  name: string;
  players: SavedSquadPlayer[];
  updatedAt: number;
};
type LoggedMatchEvent = MatchEvent & {
  type: MatchEventKind;
  tags?: string[];
  teamSide: "FOR" | "OPP";
  x: number;
  y: number;
  period: MatchEventPeriod;
  segment: MatchEventSegment;
  matchClockSeconds: number;
  createdAt: number;
  playerId?: string;
  playerName?: string;
  playerNumber?: number;
  squadId?: string;
  team?: TeamSide;
};
type LiveRenderablePitchEvent = LoggedMatchEvent & {
  renderAsSubtleDot?: boolean;
};
type SavedMatchRestoreContext = {
  matchState?: MatchState;
  currentHalf?: 1 | 2;
  matchTimeSeconds?: number;
  firstHalfAttackingDirection?: AttackingDirection;
  fullTimeResumeState?: {
    matchState: "FIRST_HALF" | "SECOND_HALF";
    currentHalf: 1 | 2;
    matchTimeSeconds: number;
  };
};
type SavedMatch = {
  id: string;
  createdAt: number;
  label: string;
  homeTeamName: string;
  awayTeamName: string;
  venue: string;
  events: readonly LoggedMatchEvent[];
  eventCount: number;
  scorelineSnapshot: string;
  restoreContext?: SavedMatchRestoreContext;
};
type StatsActiveMatchDraft = {
  version: 1;
  updatedAt: number;
  matchId: string;
  currentMode: GaaModeKey;
  activeTeam: TeamSide;
  activeTeamSide?: "own" | "opposition";
  teamNames: { HOME: string; AWAY: string };
  venue: string;
  events: readonly LoggedMatchEvent[];
  restoreContext: SavedMatchRestoreContext;
};
type ModeScoringEventKind =
  | "GOAL"
  | "POINT"
  | "FREE_SCORED"
  | "TWO_POINTER"
  | "FORTY_FIVE_TWO_POINT";
type LiveMatchCounts = {
  goals: number;
  points: number;
  twoPointers: number;
  shots: number;
  wides: number;
  turnoverWon: number;
  turnoverLost: number;
  kickoutWon: number;
  kickoutLost: number;
  freeWon: number;
  freeConceded: number;
};

type ViewportRect = { left: number; top: number; width: number; height: number };
type MatchShareSummaryInput = {
  homeTeamName: string;
  awayTeamName: string;
  venueLabel: string;
  stateLabel: string;
  clockLabel: string;
  homeScore: TeamScore;
  awayScore: TeamScore;
  eventCount: number;
  liveCounts: LiveMatchCounts;
};

const UTILITY_BUBBLE_SIZE = 39;
const UTILITY_BUBBLE_MARGIN = 12;
const MODE_MENU_OPTIONS: ReadonlyArray<{ key: GaaModeKey; label: string }> = [
  { key: "football", label: "Football" },
  { key: "ladiesFootball", label: "Ladies Football" },
  { key: "hurling", label: "Hurling" },
  { key: "camogie", label: "Camogie" },
];
const FORMATION_ROW_SIZES = [1, 3, 3, 2, 3, 3] as const;
const SQUADS_STORAGE_KEY = "pitchsideclub.squads";
const SAVED_SQUADS_STORAGE_KEY = "pitchflow_saved_squads_v1";
const SAVED_MATCHES_STORAGE_KEY = "pitchflow_matches_v1";
const ACTIVE_MATCH_DRAFT_STORAGE_KEY = "paircvision_stats_active_draft_v1";
const REVIEW_SESSION_STORAGE_KEY = "paircvision.reviewSession.v1.last";
const MAX_SAVED_MATCHES = 10;
const EVENT_PICKER_LOGO_STYLE: CSSProperties = {
  width: "40px",
  height: "40px",
  objectFit: "contain",
  display: "block",
  imageRendering: "crisp-edges",
  filter: "drop-shadow(0 4px 10px rgba(2, 8, 15, 0.26))",
};

function safeReadLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("[stats-storage] Could not read localStorage", { key, error });
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function safeRemoveLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }
}

function parseSavedMatchState(value: unknown): MatchState | null {
  if (
    value === "PRE_MATCH" ||
    value === "FIRST_HALF" ||
    value === "HALF_TIME" ||
    value === "SECOND_HALF" ||
    value === "FULL_TIME"
  ) {
    return value;
  }
  return null;
}

function parseCurrentHalf(value: unknown): 1 | 2 | null {
  if (value === 1 || value === 2) return value;
  return null;
}

function parseClockSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function parseAttackingDirection(value: unknown): AttackingDirection | null {
  if (value === "LEFT" || value === "RIGHT") return value;
  return null;
}

function deriveMatchTimeSecondsFromTimestamp(timestamp: number): number {
  return Math.max(0, Math.floor(timestamp));
}

function deriveLegacyHalfSegment(segment: MatchEventSegment): 1 | 2 | 3 {
  return (((segment - 1) % 3) + 1) as 1 | 2 | 3;
}

function deriveTeamSideFromTeam(team: TeamSide | null | undefined): "own" | "opposition" {
  return team === "AWAY" ? "opposition" : "own";
}

function deriveTeamFromTeamSide(teamSide: "own" | "opposition"): TeamSide {
  return teamSide === "opposition" ? "AWAY" : "HOME";
}

function deriveEventTeamSideFromLegacyMetadata(team: TeamSide | null, eventId: string): "FOR" | "OPP" {
  if (team === "AWAY" || eventId.startsWith("team-away-")) return "OPP";
  return "FOR";
}

function normalizeEventTeamSide(
  teamSide: unknown,
  team: TeamSide | null,
  eventId: string,
): "FOR" | "OPP" {
  if (teamSide === "FOR" || teamSide === "OPP") return teamSide;
  if (teamSide === "own") return "FOR";
  if (teamSide === "opposition") return "OPP";
  return deriveEventTeamSideFromLegacyMetadata(team, eventId);
}

const REVIEW_TEAM_CONTEXT_OPTIONS: ReadonlyArray<{ id: ReviewTeamContext; label: string }> = [
  { id: "ALL", label: "ALL" },
  { id: "FOR", label: "FOR" },
  { id: "OPP", label: "OPP" },
];

const REVIEW_FILTER_OPTIONS_BASE: ReadonlyArray<{ id: ReviewEventFilter; label: string }> = [
  { id: "ALL", label: "ALL" },
  { id: "SCORES", label: "SCORES" },
  { id: "SHOTS", label: "SHOTS" },
  { id: "WIDES", label: "WIDES" },
  { id: "TURNOVERS", label: "T/O" },
  { id: "KICKOUTS", label: "K/O" },
  { id: "FREES", label: "FREES" },
  { id: "PLAYERS", label: "PLAYERS" },
];
const REVIEW_SEGMENT_OPTIONS: ReadonlyArray<{ id: ReviewSegment; label: string; compactLabel?: string }> = [
  { id: "ALL", label: "ALL" },
  { id: "S1", label: "1H Early", compactLabel: "1H E" },
  { id: "S2", label: "1H Mid", compactLabel: "1H M" },
  { id: "S3", label: "1H Late", compactLabel: "1H L" },
  { id: "S4", label: "2H Early", compactLabel: "2H E" },
  { id: "S5", label: "2H Mid", compactLabel: "2H M" },
  { id: "S6", label: "2H Late", compactLabel: "2H L" },
];
const REVIEW_FILTER_KINDS: Record<
  Exclude<ReviewEventFilter, "ALL" | "PLAYERS">,
  readonly MatchEventKind[]
> = {
  SCORES: ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"],
  SHOTS: ["SHOT"],
  WIDES: ["WIDE"],
  TURNOVERS: ["TURNOVER_WON", "TURNOVER_LOST"],
  KICKOUTS: ["KICKOUT_WON", "KICKOUT_CONCEDED"],
  FREES: ["FREE_WON", "FREE_CONCEDED", "FREE_SCORED", "FREE_MISSED"],
};
const MATCH_EVENT_KIND_SET = new Set<MatchEventKind>(MATCH_EVENT_KINDS);
const KICKOUT_EVENT_KIND_SET = new Set<MatchEventKind>(["KICKOUT_WON", "KICKOUT_CONCEDED"]);
const TURNOVER_EVENT_KIND_SET = new Set<MatchEventKind>(["TURNOVER_WON", "TURNOVER_LOST"]);
const SHOT_EVENT_KIND_SET = new Set<MatchEventKind>(["SHOT"]);
const EVENT_KEYBOARD_MENU_KIND: Record<EventKeyboardMenuId, MatchEventKind> = {
  GOAL: "GOAL",
  POINT: "POINT",
  TWO_POINTER: "TWO_POINTER",
  SHOT: "SHOT",
  WIDE: "WIDE",
  TURNOVER_WON: "TURNOVER_WON",
  TURNOVER_LOST: "TURNOVER_LOST",
  KICKOUT_WON: "KICKOUT_WON",
  KICKOUT_CONCEDED: "KICKOUT_CONCEDED",
};
const SCORING_SOURCE_TAGS = {
  PLAY: "SOURCE_PLAY",
  FREE: "SOURCE_FREE",
  PENALTY: "SOURCE_PENALTY",
  MARK: "SOURCE_MARK",
  FORTY_FIVE: "SOURCE_45",
} as const;
function buildReviewFilterOptions(
  isHurlingMode: boolean,
): ReadonlyArray<{ id: ReviewEventFilter; label: string }> {
  return REVIEW_FILTER_OPTIONS_BASE.map((option) => {
    if (option.id === "KICKOUTS") return { ...option, label: isHurlingMode ? "P/O" : "K/O" };
    return option;
  });
}

function normalizeEventCoordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function normalizeMatchClockSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function normalizeCreatedAt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return Date.now();
}

function parseEventPeriod(value: unknown): MatchEventPeriod | null {
  if (value === "1H" || value === "2H") return value;
  return null;
}

function parseEventSegment(value: unknown): MatchEventSegment | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) return value;
  return null;
}

function parseEventTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toUpperCase())
        .filter((entry) => entry.length > 0),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function getKickoutTagLabel(tags: readonly string[] | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  if (tags.includes("CLEAN")) return "Clean";
  if (tags.includes("BREAK")) return "Break";
  if (tags.includes("FOUL_WON")) return "Foul Won";
  if (tags.includes("FOUL_CONCEDED")) return "Foul Conceded";
  if (tags.includes("KICKED_DEAD")) return "Kicked Dead";
  return null;
}

function getTurnoverTagLabel(tags: readonly string[] | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  if (tags.includes("TACKLE")) return "Tackle";
  if (tags.includes("PRESS")) return "Press";
  if (tags.includes("SWARM")) return "Swarm";
  if (tags.includes("INTERCEPT")) return "Intercept";
  if (tags.includes("FORCED")) return "Forced";
  // Keep legacy UNFORCED events readable without exposing old jargon.
  if (tags.includes("UNFORCED")) return "HP Error";
  if (tags.includes("SLACK_KICK_PASS")) return "KP Error";
  if (tags.includes("SLACK_HAND_PASS")) return "HP Error";
  if (tags.includes("OVERCARRIED")) return "Overcarried";
  if (tags.includes("STRIPPED")) return "Tackled";
  return null;
}

function getShotTagLabel(tags: readonly string[] | undefined): "Short" | "Post" | "45" | "Blocked" | null {
  if (!tags || tags.length === 0) return null;
  if (tags.includes("SHORT")) return "Short";
  if (tags.includes("POST")) return "Post";
  if (tags.includes("FORTY_FIVE")) return "45";
  if (tags.includes("BLOCK_SAVE") || tags.includes("BLOCKED")) return "Blocked";
  return null;
}

function getSegmentDisplayLabel(segment: number | undefined): string {
  if (segment == null) return "—";
  const option = REVIEW_SEGMENT_OPTIONS.find((entry) => entry.id === `S${segment}`);
  return option?.label ?? `S${segment}`;
}

function getFollowupOptions(kind: PendingFollowupKind): readonly FollowupOption[] {
  switch (kind) {
    case "TURNOVER_WON":
      return [
        { label: "Tackle +1", tag: "TACKLE" },
        { label: "Press +2", tag: "PRESS" },
        { label: "Swarm +3", tag: "SWARM" },
        { label: "Intercept +1", tag: "INTERCEPT" },
      ];
    case "TURNOVER_LOST":
      return [
        { label: "HP Error", tag: "SLACK_HAND_PASS" },
        { label: "KP Error", tag: "SLACK_KICK_PASS" },
        { label: "Overcarried", tag: "OVERCARRIED" },
        { label: "Tackled", tag: "STRIPPED" },
      ];
    case "KICKOUT_WON":
      return [
        { label: "Clean", tag: "CLEAN" },
        { label: "Break", tag: "BREAK" },
        { label: "Foul Won", tag: "FOUL_WON" },
      ];
    case "KICKOUT_CONCEDED":
      return [
        { label: "Clean Lost", tag: "CLEAN" },
        { label: "Break Lost", tag: "BREAK" },
        { label: "Foul Conceded", tag: "FOUL_CONCEDED" },
        { label: "Kicked Dead", tag: "KICKED_DEAD" },
      ];
    case "SHOT":
      return [
        { label: "Short", tag: "SHORT" },
        { label: "Post", tag: "POST" },
        { label: "45", tag: "FORTY_FIVE" },
        { label: "Block/Save", tag: "BLOCK_SAVE" },
      ];
    default:
      return [];
  }
}

function getRemovableFollowupTags(kind: PendingFollowupKind): readonly string[] {
  switch (kind) {
    case "TURNOVER_WON":
      return ["TACKLE", "PRESS", "SWARM", "INTERCEPT", "FORCED", "UNFORCED"];
    case "TURNOVER_LOST":
      return ["UNFORCED", "SLACK_KICK_PASS", "SLACK_HAND_PASS", "OVERCARRIED", "STRIPPED", "FORCED"];
    case "KICKOUT_WON":
      return ["CLEAN", "BREAK", "FOUL_WON"];
    case "KICKOUT_CONCEDED":
      return ["CLEAN", "BREAK", "FOUL_CONCEDED", "KICKED_DEAD"];
    case "SHOT":
      return ["SHORT", "POST", "FORTY_FIVE", "BLOCK_SAVE", "BLOCKED"];
    default:
      return [];
  }
}

function buildEventKeyboardMenuOptions(menuId: EventKeyboardMenuId): readonly EventKeyboardOption[] {
  switch (menuId) {
    case "GOAL":
      return [
        { label: "Play", kind: "GOAL", tag: SCORING_SOURCE_TAGS.PLAY },
        { label: "Free", kind: "GOAL", tag: SCORING_SOURCE_TAGS.FREE },
        { label: "Penalty", kind: "GOAL", tag: SCORING_SOURCE_TAGS.PENALTY },
        { label: "Mark", kind: "GOAL", tag: SCORING_SOURCE_TAGS.MARK },
      ];
    case "POINT":
      return [
        { label: "Play", kind: "POINT", tag: SCORING_SOURCE_TAGS.PLAY },
        { label: "Free", kind: "POINT", tag: SCORING_SOURCE_TAGS.FREE },
        { label: "Penalty", kind: "POINT", tag: SCORING_SOURCE_TAGS.PENALTY },
        { label: "Mark", kind: "POINT", tag: SCORING_SOURCE_TAGS.MARK },
        { label: "45", kind: "POINT", tag: SCORING_SOURCE_TAGS.FORTY_FIVE },
      ];
    case "TWO_POINTER":
      return [
        { label: "Play", kind: "TWO_POINTER", tag: SCORING_SOURCE_TAGS.PLAY },
        { label: "Free", kind: "TWO_POINTER", tag: SCORING_SOURCE_TAGS.FREE },
        { label: "Mark", kind: "TWO_POINTER", tag: SCORING_SOURCE_TAGS.MARK },
      ];
    case "WIDE":
      return [
        { label: "Play", kind: "WIDE", tag: SCORING_SOURCE_TAGS.PLAY },
        { label: "Free", kind: "WIDE", tag: SCORING_SOURCE_TAGS.FREE },
        { label: "Penalty", kind: "WIDE", tag: SCORING_SOURCE_TAGS.PENALTY },
        { label: "Mark", kind: "WIDE", tag: SCORING_SOURCE_TAGS.MARK },
        { label: "45", kind: "WIDE", tag: SCORING_SOURCE_TAGS.FORTY_FIVE },
      ];
    case "TURNOVER_WON":
    case "TURNOVER_LOST":
    case "KICKOUT_WON":
    case "KICKOUT_CONCEDED":
    case "SHOT": {
      return getFollowupOptions(menuId as PendingFollowupKind).map((option) => ({
        label: option.label,
        kind: EVENT_KEYBOARD_MENU_KIND[menuId],
        tag: option.tag,
      }));
    }
    default:
      return [];
  }
}

function getEventKeyboardToneByMenuId(menuId: EventKeyboardMenuId | null): EventKeyboardTone | null {
  if (menuId == null) return null;
  if (menuId === "GOAL" || menuId === "POINT" || menuId === "TWO_POINTER" || menuId === "SHOT") return "score";
  if (menuId === "WIDE") return "wide";
  if (menuId === "TURNOVER_WON" || menuId === "TURNOVER_LOST") return "turnover";
  if (menuId === "KICKOUT_WON" || menuId === "KICKOUT_CONCEDED") return "kickout";
  return null;
}

function parseStoredLoggedMatchEvent(input: unknown): LoggedMatchEvent | null {
  if (!input || typeof input !== "object") return null;
  const maybeId = "id" in input ? input.id : null;
  const maybeType = "type" in input ? input.type : null;
  const maybeKind = "kind" in input ? input.kind : null;
  const maybeX = "x" in input ? input.x : null;
  const maybeY = "y" in input ? input.y : null;
  const maybeNx = "nx" in input ? input.nx : null;
  const maybeNy = "ny" in input ? input.ny : null;
  const maybePeriod = "period" in input ? input.period : null;
  const maybeSegment = "segment" in input ? input.segment : null;
  const maybeHalf = "half" in input ? input.half : null;
  const maybeMatchClockSeconds = "matchClockSeconds" in input ? input.matchClockSeconds : null;
  const maybeCreatedAt = "createdAt" in input ? input.createdAt : null;
  const maybeTimestamp = "timestamp" in input ? input.timestamp : null;
  const maybeTeam = "team" in input ? input.team : null;
  const maybeTeamSide = "teamSide" in input ? input.teamSide : null;
  const maybeMatchTimeSeconds = "matchTimeSeconds" in input ? input.matchTimeSeconds : null;
  const maybeHalfSegment = "halfSegment" in input ? input.halfSegment : null;
  const maybeTags = "tags" in input ? input.tags : null;

  if (typeof maybeId !== "string" || maybeId.trim().length === 0) return null;
  const rawKind = typeof maybeType === "string" ? maybeType : typeof maybeKind === "string" ? maybeKind : null;
  if (rawKind == null || !MATCH_EVENT_KIND_SET.has(rawKind as MatchEventKind)) return null;
  const parsedKind = rawKind as MatchEventKind;
  const parsedX = normalizeEventCoordinate(maybeX ?? maybeNx);
  const parsedY = normalizeEventCoordinate(maybeY ?? maybeNy);
  const parsedPeriod =
    parseEventPeriod(maybePeriod) ??
    (maybeHalf === 1 || maybeHalf === 2 ? periodFromHalf(maybeHalf) : null) ??
    "1H";
  const parsedHalf = maybeHalf === 1 || maybeHalf === 2 ? maybeHalf : halfFromPeriod(parsedPeriod);
  const parsedClockSeconds =
    normalizeMatchClockSeconds(maybeMatchClockSeconds) ??
    normalizeMatchClockSeconds(maybeMatchTimeSeconds) ??
    normalizeMatchClockSeconds(maybeTimestamp) ??
    0;
  const parsedSegment =
    parseEventSegment(maybeSegment) ?? deriveSegmentFromPeriodClock(parsedPeriod, parsedClockSeconds);
  const parsedHalfSegment =
    maybeHalfSegment === 1 || maybeHalfSegment === 2 || maybeHalfSegment === 3
      ? maybeHalfSegment
      : deriveLegacyHalfSegment(parsedSegment);
  const parsedTimestamp = normalizeMatchClockSeconds(maybeTimestamp) ?? parsedClockSeconds;
  const parsedTeam: TeamSide | null = maybeTeam === "HOME" || maybeTeam === "AWAY" ? maybeTeam : null;
  const parsedTeamSide = normalizeEventTeamSide(maybeTeamSide, parsedTeam, maybeId);
  const parsedCreatedAt = normalizeCreatedAt(maybeCreatedAt);
  const parsedTags = parseEventTags(maybeTags);

  const next: LoggedMatchEvent = {
    id: maybeId,
    kind: parsedKind,
    type: parsedKind,
    nx: parsedX,
    ny: parsedY,
    x: parsedX,
    y: parsedY,
    half: parsedHalf,
    period: parsedPeriod,
    segment: parsedSegment,
    halfSegment: parsedHalfSegment,
    timestamp: parsedTimestamp,
    matchClockSeconds: parsedClockSeconds,
    matchTimeSeconds: parsedClockSeconds,
    createdAt: parsedCreatedAt,
    teamSide: parsedTeamSide,
    ...(parsedTags ? { tags: parsedTags } : {}),
  };

  const maybePlayerId = "playerId" in input ? input.playerId : null;
  if (typeof maybePlayerId === "string" && maybePlayerId.trim().length > 0) {
    next.playerId = maybePlayerId;
  }

  const maybePlayerName = "playerName" in input ? input.playerName : null;
  if (typeof maybePlayerName === "string" && maybePlayerName.trim().length > 0) {
    next.playerName = maybePlayerName;
  }

  const maybePlayerNumber = "playerNumber" in input ? input.playerNumber : null;
  if (typeof maybePlayerNumber === "number" && Number.isFinite(maybePlayerNumber)) {
    next.playerNumber = maybePlayerNumber;
  }

  const maybeSquadId = "squadId" in input ? input.squadId : null;
  if (typeof maybeSquadId === "string" && maybeSquadId.trim().length > 0) {
    next.squadId = maybeSquadId;
  }

  if (parsedTeam) {
    next.team = parsedTeam;
  }

  return next;
}

function parseStoredSavedMatch(input: unknown): SavedMatch | null {
  if (!input || typeof input !== "object") return null;
  const maybeId = "id" in input ? input.id : null;
  const maybeCreatedAt = "createdAt" in input ? input.createdAt : null;
  const maybeLabel = "label" in input ? input.label : null;
  const maybeHomeTeamName = "homeTeamName" in input ? input.homeTeamName : null;
  const maybeAwayTeamName = "awayTeamName" in input ? input.awayTeamName : null;
  const maybeVenue = "venue" in input ? input.venue : null;
  const maybeEvents = "events" in input ? input.events : null;
  const maybeEventCount = "eventCount" in input ? input.eventCount : null;
  const maybeScorelineSnapshot = "scorelineSnapshot" in input ? input.scorelineSnapshot : null;
  const maybeRestoreContext = "restoreContext" in input ? input.restoreContext : null;

  if (typeof maybeId !== "string" || maybeId.trim().length === 0) return null;
  const parsedCreatedAt = normalizeCreatedAt(maybeCreatedAt);
  const homeTeamName =
    typeof maybeHomeTeamName === "string" && maybeHomeTeamName.trim().length > 0
      ? maybeHomeTeamName.trim().slice(0, 24)
      : "Team A";
  const awayTeamName =
    typeof maybeAwayTeamName === "string" && maybeAwayTeamName.trim().length > 0
      ? maybeAwayTeamName.trim().slice(0, 24)
      : "Team B";
  const parsedLabel =
    typeof maybeLabel === "string" && maybeLabel.trim().length > 0
      ? maybeLabel.trim().slice(0, 64)
      : `${homeTeamName} v ${awayTeamName}`;
  const parsedVenue =
    typeof maybeVenue === "string" && maybeVenue.trim().length > 0
      ? maybeVenue.trim().slice(0, 64)
      : "Unknown venue";
  if (!Array.isArray(maybeEvents) || maybeEvents.length === 0) return null;

  const parsedEvents = maybeEvents.map((event) => parseStoredLoggedMatchEvent(event));
  if (parsedEvents.some((event) => event == null)) return null;
  const events = parsedEvents.filter((event): event is LoggedMatchEvent => event != null);
  if (events.length === 0) return null;
  const parsedEventCount =
    typeof maybeEventCount === "number" && Number.isFinite(maybeEventCount)
      ? Math.max(0, Math.floor(maybeEventCount))
      : events.length;
  const parsedScorelineSnapshot =
    typeof maybeScorelineSnapshot === "string" && maybeScorelineSnapshot.trim().length > 0
      ? maybeScorelineSnapshot.trim().slice(0, 120)
      : `${homeTeamName} v ${awayTeamName}`;
  const parseRestoreContext = (value: unknown): SavedMatchRestoreContext | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const parsedMatchState = parseSavedMatchState(source.matchState);
    const parsedCurrentHalf = parseCurrentHalf(source.currentHalf);
    const parsedClock = parseClockSeconds(source.matchTimeSeconds);
    const parsedDirection = parseAttackingDirection(source.firstHalfAttackingDirection);
    const parsedResumeSource =
      source.fullTimeResumeState && typeof source.fullTimeResumeState === "object"
        ? (source.fullTimeResumeState as Record<string, unknown>)
        : null;
    const parsedResumeMatchState = parseSavedMatchState(parsedResumeSource?.matchState);
    const parsedResumeHalf = parseCurrentHalf(parsedResumeSource?.currentHalf);
    const parsedResumeClock = parseClockSeconds(parsedResumeSource?.matchTimeSeconds);
    const parsedResume =
      (parsedResumeMatchState === "FIRST_HALF" || parsedResumeMatchState === "SECOND_HALF") &&
      parsedResumeHalf != null &&
      parsedResumeClock != null
        ? {
            matchState: parsedResumeMatchState,
            currentHalf: parsedResumeHalf,
            matchTimeSeconds: parsedResumeClock,
          }
        : undefined;

    const nextContext: SavedMatchRestoreContext = {};
    if (parsedMatchState) nextContext.matchState = parsedMatchState;
    if (parsedCurrentHalf != null) nextContext.currentHalf = parsedCurrentHalf;
    if (parsedClock != null) nextContext.matchTimeSeconds = parsedClock;
    if (parsedDirection) nextContext.firstHalfAttackingDirection = parsedDirection;
    if (parsedResume) nextContext.fullTimeResumeState = parsedResume;
    return Object.keys(nextContext).length > 0 ? nextContext : undefined;
  };
  const restoreContext = parseRestoreContext(maybeRestoreContext);

  return {
    id: maybeId,
    createdAt: parsedCreatedAt,
    label: parsedLabel,
    homeTeamName,
    awayTeamName,
    venue: parsedVenue,
    events,
    eventCount: parsedEventCount === events.length ? parsedEventCount : events.length,
    scorelineSnapshot: parsedScorelineSnapshot,
    ...(restoreContext ? { restoreContext } : {}),
  };
}

function sanitizeSavedMatches(matches: readonly SavedMatch[]): SavedMatch[] {
  const normalized = [...matches]
    .filter(
      (match) =>
        match.events.length > 0 &&
        match.eventCount > 0 &&
        match.homeTeamName.trim().length > 0 &&
        match.awayTeamName.trim().length > 0 &&
        match.venue.trim().length > 0,
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const seenIds = new Set<string>();
  return normalized.filter((match) => {
    if (seenIds.has(match.id)) return false;
    seenIds.add(match.id);
    return true;
  }).slice(0, MAX_SAVED_MATCHES);
}

type ReadSavedMatchesResult = {
  matches: SavedMatch[];
  isCorrupt: boolean;
};

function parseStoredSavedMatches(input: string | null): ReadSavedMatchesResult {
  if (!input) return { matches: [], isCorrupt: false };
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return { matches: [], isCorrupt: true };
    const matches = parsed
      .map((record) => parseStoredSavedMatch(record))
      .filter((record): record is SavedMatch => record != null);
    return { matches: sanitizeSavedMatches(matches), isCorrupt: false };
  } catch {
    return { matches: [], isCorrupt: true };
  }
}

function parseSavedMatchRestoreContext(input: unknown): SavedMatchRestoreContext {
  if (!input || typeof input !== "object") {
    return {
      matchState: "PRE_MATCH",
      currentHalf: 1,
      matchTimeSeconds: 0,
      firstHalfAttackingDirection: "RIGHT",
    };
  }
  const source = input as Record<string, unknown>;
  const parsedMatchState = parseSavedMatchState(source.matchState) ?? "PRE_MATCH";
  const parsedCurrentHalf = parseCurrentHalf(source.currentHalf) ?? 1;
  const parsedClock = parseClockSeconds(source.matchTimeSeconds) ?? 0;
  const parsedDirection = parseAttackingDirection(source.firstHalfAttackingDirection) ?? "RIGHT";
  const parsedResumeSource =
    source.fullTimeResumeState && typeof source.fullTimeResumeState === "object"
      ? (source.fullTimeResumeState as Record<string, unknown>)
      : null;
  const parsedResumeMatchState = parseSavedMatchState(parsedResumeSource?.matchState);
  const parsedResumeHalf = parseCurrentHalf(parsedResumeSource?.currentHalf);
  const parsedResumeClock = parseClockSeconds(parsedResumeSource?.matchTimeSeconds);
  const fullTimeResumeState =
    (parsedResumeMatchState === "FIRST_HALF" || parsedResumeMatchState === "SECOND_HALF") &&
    parsedResumeHalf != null &&
    parsedResumeClock != null
      ? {
          matchState: parsedResumeMatchState,
          currentHalf: parsedResumeHalf,
          matchTimeSeconds: parsedResumeClock,
        }
      : undefined;
  return {
    matchState: parsedMatchState,
    currentHalf: parsedCurrentHalf,
    matchTimeSeconds: parsedClock,
    firstHalfAttackingDirection: parsedDirection,
    ...(fullTimeResumeState ? { fullTimeResumeState } : {}),
  };
}

function parseStoredActiveMatchDraft(input: string | null): { draft: StatsActiveMatchDraft | null; isCorrupt: boolean } {
  if (!input) return { draft: null, isCorrupt: false };
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object") return { draft: null, isCorrupt: true };
    const source = parsed as Record<string, unknown>;
    const matchId = typeof source.matchId === "string" ? source.matchId.trim() : "";
    const updatedAt = parseClockSeconds(source.updatedAt);
    const activeTeam = source.activeTeam === "HOME" || source.activeTeam === "AWAY" ? source.activeTeam : "HOME";
    const activeTeamSide =
      source.activeTeamSide === "own" || source.activeTeamSide === "opposition"
        ? source.activeTeamSide
        : deriveTeamSideFromTeam(activeTeam);
    const mode =
      source.currentMode === "football" ||
      source.currentMode === "ladiesFootball" ||
      source.currentMode === "hurling" ||
      source.currentMode === "camogie"
        ? source.currentMode
        : "football";
    const teamNamesSource =
      source.teamNames && typeof source.teamNames === "object"
        ? (source.teamNames as Record<string, unknown>)
        : null;
    const homeName =
      typeof teamNamesSource?.HOME === "string" && teamNamesSource.HOME.trim().length > 0
        ? teamNamesSource.HOME.trim().slice(0, 15)
        : "Team A";
    const awayName =
      typeof teamNamesSource?.AWAY === "string" && teamNamesSource.AWAY.trim().length > 0
        ? teamNamesSource.AWAY.trim().slice(0, 15)
        : "Team B";
    const events = Array.isArray(source.events)
      ? source.events
          .map((entry) => parseStoredLoggedMatchEvent(entry))
          .filter((entry): entry is LoggedMatchEvent => entry != null)
      : [];
    if (matchId.length <= 0) return { draft: null, isCorrupt: true };
    return {
      draft: {
        version: 1,
        updatedAt: updatedAt ?? Date.now(),
        matchId,
        currentMode: mode,
        activeTeam,
        activeTeamSide,
        teamNames: { HOME: homeName, AWAY: awayName },
        venue: typeof source.venue === "string" ? source.venue.trim().slice(0, 24) : "",
        events,
        restoreContext: parseSavedMatchRestoreContext(source.restoreContext),
      },
      isCorrupt: false,
    };
  } catch {
    return { draft: null, isCorrupt: true };
  }
}

function readSavedMatchesFromStorage(): ReadSavedMatchesResult {
  if (typeof window === "undefined") return { matches: [], isCorrupt: false };
  return parseStoredSavedMatches(safeReadLocalStorage(SAVED_MATCHES_STORAGE_KEY));
}

function resolveSavedMatchRestoreContext(record: SavedMatch): {
  engineState: MatchEngineState;
  firstHalfAttackingDirection: AttackingDirection;
  fullTimeResumeState: MatchEngineState | null;
} {
  const clampClock = (value: number): number => Math.max(0, Math.floor(value));
  const normalizeMatchAndHalf = (matchState: MatchState): { matchState: MatchState; half: 1 | 2 } => {
    if (matchState === "FIRST_HALF" || matchState === "HALF_TIME") {
      return { matchState, half: 1 };
    }
    if (matchState === "SECOND_HALF" || matchState === "FULL_TIME") {
      return { matchState, half: 2 };
    }
    return { matchState: "PRE_MATCH", half: 1 };
  };
  const createPausedEngineState = (matchState: MatchState, currentHalf: 1 | 2, matchTimeSeconds: number): MatchEngineState => {
    const clampedClock = clampClock(matchTimeSeconds);
    return {
      matchState,
      currentHalf,
      matchTimeSeconds: clampedClock,
      isRunning: false,
      phaseStartTimeMs: null,
      accumulatedElapsedSeconds: clampedClock,
    };
  };
  const deriveLegacySnapshot = (): { matchState: MatchState; currentHalf: 1 | 2; matchTimeSeconds: number } => {
    const halfOneTimes = record.events
      .filter((event) => event.half === 1)
      .map((event) => event.matchClockSeconds ?? event.timestamp)
      .filter((timestamp) => Number.isFinite(timestamp));
    const halfTwoTimes = record.events
      .filter((event) => event.half === 2)
      .map((event) => event.matchClockSeconds ?? event.timestamp)
      .filter((timestamp) => Number.isFinite(timestamp));
    if (halfTwoTimes.length > 0) {
      return {
        matchState: "SECOND_HALF",
        currentHalf: 2,
        matchTimeSeconds: Math.max(...halfTwoTimes),
      };
    }
    if (halfOneTimes.length > 0) {
      return {
        matchState: "FIRST_HALF",
        currentHalf: 1,
        matchTimeSeconds: Math.max(...halfOneTimes),
      };
    }
    return {
      matchState: "PRE_MATCH",
      currentHalf: 1,
      matchTimeSeconds: 0,
    };
  };

  const inferred = deriveLegacySnapshot();
  const restoreContext = record.restoreContext;
  const rawMatchState = restoreContext?.matchState ?? inferred.matchState;
  const rawClock = restoreContext?.matchTimeSeconds ?? inferred.matchTimeSeconds;
  const normalized = normalizeMatchAndHalf(rawMatchState);
  const engineState = createPausedEngineState(normalized.matchState, normalized.half, rawClock);

  const fullTimeResumeSource = restoreContext?.fullTimeResumeState;
  let fullTimeResumeState: MatchEngineState | null = null;
  if (
    engineState.matchState === "FULL_TIME" &&
    fullTimeResumeSource &&
    (fullTimeResumeSource.matchState === "FIRST_HALF" || fullTimeResumeSource.matchState === "SECOND_HALF")
  ) {
    const normalizedResume = normalizeMatchAndHalf(fullTimeResumeSource.matchState);
    if (normalizedResume.matchState === "FIRST_HALF" || normalizedResume.matchState === "SECOND_HALF") {
      fullTimeResumeState = createPausedEngineState(
        normalizedResume.matchState,
        normalizedResume.half,
        fullTimeResumeSource.matchTimeSeconds,
      );
    }
  }

  return {
    engineState,
    firstHalfAttackingDirection: restoreContext?.firstHalfAttackingDirection ?? "RIGHT",
    fullTimeResumeState,
  };
}

function persistSavedMatches(matches: readonly SavedMatch[]): boolean {
  if (typeof window === "undefined") return false;
  return safeWriteLocalStorage(SAVED_MATCHES_STORAGE_KEY, JSON.stringify(sanitizeSavedMatches(matches)));
}

function persistActiveMatchDraft(draft: StatsActiveMatchDraft): boolean {
  if (typeof window === "undefined") return false;
  try {
    return safeWriteLocalStorage(ACTIVE_MATCH_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    return false;
  }
}

function clearActiveMatchDraft(): void {
  safeRemoveLocalStorage(ACTIVE_MATCH_DRAFT_STORAGE_KEY);
}

function formatSavedMatchCreatedAt(createdAtMillis: number): string {
  if (!Number.isFinite(createdAtMillis) || createdAtMillis <= 0) return "Unknown time";
  const createdAtDate = new Date(createdAtMillis);
  if (Number.isNaN(createdAtDate.getTime())) return "Unknown time";
  const day = String(createdAtDate.getDate()).padStart(2, "0");
  const month = String(createdAtDate.getMonth() + 1).padStart(2, "0");
  const year = String(createdAtDate.getFullYear());
  const hour = String(createdAtDate.getHours()).padStart(2, "0");
  const minute = String(createdAtDate.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}
function newLocalEventId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function newMatchSessionId(prefix: "live" | "loaded"): string {
  return `${prefix}-match-${newLocalEventId()}`;
}

function createDefaultSquad(name: "HOME" | "AWAY" = "HOME"): Squad {
  const players: SquadPlayer[] = Array.from({ length: 30 }, (_, idx) => {
    const slotNumber = idx + 1;
    return {
      id: `player-${slotNumber}-${newLocalEventId()}`,
      name: "",
      number: slotNumber,
      role: slotNumber <= 15 ? "STARTER" : "SUB",
      isActive: slotNumber <= 15,
      activeSlot: slotNumber <= 15 ? slotNumber : undefined,
    };
  });
  return {
    id: `squad-${newLocalEventId()}`,
    name,
    players,
  };
}
function ensureHomeAwaySquads(input: Squad[]): { squads: Squad[]; byTeam: { HOME: string; AWAY: string } } {
  const normalized = input.length > 0 ? input : [createDefaultSquad("HOME")];
  const next = normalized.map((squad) => {
    if (squad.team === "HOME" || squad.team === "AWAY") return squad;
    if (squad.name.trim().toUpperCase() === "HOME") return { ...squad, team: "HOME" as const };
    if (squad.name.trim().toUpperCase() === "AWAY") return { ...squad, team: "AWAY" as const };
    return squad;
  });
  let home = next.find((s) => s.team === "HOME") ?? next.find((s) => s.name.trim().toUpperCase() === "HOME") ?? next[0] ?? null;
  if (!home) {
    home = createDefaultSquad("HOME");
    next.unshift({ ...home, team: "HOME" });
  } else if (home.team !== "HOME") {
    home = { ...home, team: "HOME" };
    const idx = next.findIndex((s) => s.id === home?.id);
    if (idx >= 0) next[idx] = home;
  }
  let away = next.find((s) => s.team === "AWAY") ?? next.find((s) => s.name.trim().toUpperCase() === "AWAY") ?? null;
  if (!away) {
    away = createDefaultSquad("AWAY");
    next.push({ ...away, team: "AWAY" });
  } else if (away.id === home.id) {
    away = { ...createDefaultSquad("AWAY"), team: "AWAY" };
    next.push(away);
  } else if (away.team !== "AWAY") {
    away = { ...away, team: "AWAY" };
    const idx = next.findIndex((s) => s.id === away?.id);
    if (idx >= 0) next[idx] = away;
  }
  return { squads: next, byTeam: { HOME: home.id, AWAY: away.id } };
}
function defaultPlayerActiveForSlot(slotNumber: number): boolean {
  return slotNumber <= 15;
}

function ensureStableSquadSlots(players: SquadPlayer[]): SquadPlayer[] {
  const normalized = players.map((player, idx) => {
    const boundedNumber = Math.max(1, Math.min(99, Math.floor(player.number)));
    const slotNumber = idx + 1;
    const parsedIsActive =
      typeof player.isActive === "boolean" ? player.isActive : defaultPlayerActiveForSlot(slotNumber);
    const rawActiveSlot = typeof player.activeSlot === "number" ? Math.floor(player.activeSlot) : null;
    const parsedActiveSlot =
      rawActiveSlot != null && rawActiveSlot >= 1 && rawActiveSlot <= 15
        ? rawActiveSlot
        : parsedIsActive
          ? Math.min(15, slotNumber)
          : undefined;
    return {
      ...player,
      name: player.name.slice(0, 24),
      number: boundedNumber,
      role: player.role === "STARTER" || player.role === "SUB" ? player.role : idx < 15 ? "STARTER" : "SUB",
      isActive: parsedIsActive,
      activeSlot: parsedActiveSlot,
    };
  });
  const byNumber = new Map<number, SquadPlayer>();
  for (const player of normalized) {
    if (!byNumber.has(player.number)) {
      byNumber.set(player.number, player);
    }
  }
  const byRoleFallback = {
    STARTER: normalized.filter((player) => player.role === "STARTER"),
    SUB: normalized.filter((player) => player.role === "SUB"),
  };
  const usedIds = new Set<string>();
  const stablePlayers: SquadPlayer[] = [];
  for (let slot = 1; slot <= 30; slot += 1) {
    const role: PlayerRole = slot <= 15 ? "STARTER" : "SUB";
    const bySlot = byNumber.get(slot);
    const fromRolePool = byRoleFallback[role].find((candidate) => !usedIds.has(candidate.id));
    const selected = bySlot && !usedIds.has(bySlot.id) ? bySlot : fromRolePool ?? null;
    if (selected) {
      usedIds.add(selected.id);
      stablePlayers.push({
        ...selected,
        number: slot,
        role,
        isActive: typeof selected.isActive === "boolean" ? selected.isActive : defaultPlayerActiveForSlot(slot),
        activeSlot:
          typeof selected.activeSlot === "number" && selected.activeSlot >= 1 && selected.activeSlot <= 15
            ? Math.floor(selected.activeSlot)
            : selected.isActive === true
              ? Math.min(15, slot)
              : undefined,
      });
      continue;
    }
    stablePlayers.push({
      id: `player-${slot}-${newLocalEventId()}`,
      name: "",
      number: slot,
      role,
      isActive: defaultPlayerActiveForSlot(slot),
      activeSlot: defaultPlayerActiveForSlot(slot) ? slot : undefined,
    });
  }
  return stablePlayers;
}

function formatPlayerLabel(player: SquadPlayer): string {
  return player.name.trim().length > 0 ? `#${player.number} ${player.name}` : `#${player.number}`;
}

function parseStoredPlayer(input: unknown, idx: number): SquadPlayer | null {
  if (typeof input === "string") {
    const trimmedName = input.trim();
    if (trimmedName.length === 0) return null;
    return {
      id: `player-${idx + 1}-${trimmedName.toLowerCase().replace(/\s+/g, "-")}`,
      name: trimmedName,
      number: idx + 1,
      role: idx < 15 ? "STARTER" : "SUB",
      isActive: idx < 15,
      activeSlot: idx < 15 ? idx + 1 : undefined,
    };
  }
  if (!input || typeof input !== "object") return null;
  const rawName = "name" in input ? input.name : null;
  if (typeof rawName !== "string") return null;
  const nextName = rawName.trim().slice(0, 24);
  if (nextName.length === 0) return null;
  const rawNumber = "number" in input ? input.number : null;
  const parsedNumber =
    typeof rawNumber === "number" && Number.isFinite(rawNumber)
      ? Math.max(1, Math.min(99, Math.floor(rawNumber)))
      : idx + 1;
  const rawRole = "role" in input ? input.role : null;
  const nextRole: PlayerRole =
    rawRole === "STARTER" || rawRole === "SUB" ? rawRole : idx < 15 ? "STARTER" : "SUB";
  const rawId = "id" in input ? input.id : null;
  const nextId =
    typeof rawId === "string" && rawId.trim().length > 0
      ? rawId
      : `player-${idx + 1}-${nextName.toLowerCase().replace(/\s+/g, "-")}`;
  const rawIsActive = "isActive" in input ? input.isActive : null;
  const parsedIsActive = typeof rawIsActive === "boolean" ? rawIsActive : idx < 15;
  const rawActiveSlot = "activeSlot" in input ? input.activeSlot : null;
  const parsedActiveSlot =
    typeof rawActiveSlot === "number" && Number.isFinite(rawActiveSlot) && rawActiveSlot >= 1 && rawActiveSlot <= 15
      ? Math.floor(rawActiveSlot)
      : parsedIsActive
        ? idx + 1
        : undefined;
  return {
    id: nextId,
    name: nextName,
    number: parsedNumber,
    role: nextRole,
    isActive: parsedIsActive,
    activeSlot: parsedActiveSlot,
  };
}

function parseStoredSquads(input: string | null): Squad[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): Squad | null => {
        if (!item || typeof item !== "object") return null;
        const maybeId = "id" in item ? item.id : null;
        const maybeName = "name" in item ? item.name : null;
        const maybeTeam = "team" in item ? item.team : null;
        const maybePlayers = "players" in item ? item.players : null;
        if (typeof maybeId !== "string" || typeof maybeName !== "string") return null;
        if (!Array.isArray(maybePlayers)) return null;
        const players = ensureStableSquadSlots(
          maybePlayers
          .map((player, idx) => parseStoredPlayer(player, idx))
          .filter((player): player is SquadPlayer => player !== null),
        );
        return {
          id: maybeId,
          name: maybeName.slice(0, 24),
          team: maybeTeam === "HOME" || maybeTeam === "AWAY" ? maybeTeam : undefined,
          players,
        };
      })
      .filter((squad): squad is Squad => squad !== null);
  } catch {
    return [];
  }
}

function parseStoredSavedSquadPlayer(input: unknown): SavedSquadPlayer | null {
  if (!input || typeof input !== "object") return null;
  const maybeId = "id" in input ? input.id : null;
  const maybeNumber = "number" in input ? input.number : null;
  const maybeName = "name" in input ? input.name : null;
  const maybeIsActive = "isActive" in input ? input.isActive : null;
  if (typeof maybeId !== "string" || maybeId.trim().length === 0) return null;
  if (typeof maybeNumber !== "number" || !Number.isFinite(maybeNumber)) return null;
  if (typeof maybeName !== "string") return null;
  const trimmedName = maybeName.trim().slice(0, 24);
  return {
    id: maybeId,
    number: Math.max(1, Math.min(99, Math.floor(maybeNumber))),
    name: trimmedName,
    isActive: typeof maybeIsActive === "boolean" ? maybeIsActive : undefined,
  };
}

function parseStoredSavedSquad(input: unknown): SavedSquad | null {
  if (!input || typeof input !== "object") return null;
  const maybeId = "id" in input ? input.id : null;
  const maybeName = "name" in input ? input.name : null;
  const maybePlayers = "players" in input ? input.players : null;
  const maybeUpdatedAt = "updatedAt" in input ? input.updatedAt : null;
  if (typeof maybeId !== "string" || maybeId.trim().length === 0) return null;
  if (typeof maybeName !== "string") return null;
  if (!Array.isArray(maybePlayers)) return null;
  if (typeof maybeUpdatedAt !== "number" || !Number.isFinite(maybeUpdatedAt)) return null;
  const players = maybePlayers
    .map((player) => parseStoredSavedSquadPlayer(player))
    .filter((player): player is SavedSquadPlayer => player !== null);
  return {
    id: maybeId,
    name: maybeName.trim().slice(0, 24) || "HOME",
    players,
    updatedAt: maybeUpdatedAt,
  };
}

function parseStoredSavedSquads(input: string | null): SavedSquad[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => parseStoredSavedSquad(entry))
      .filter((entry): entry is SavedSquad => entry !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function computeTeamScore(events: readonly MatchEvent[], team: TeamSide): TeamScore {
  let goals = 0;
  let points = 0;

  for (const event of events) {
    if (event.id.startsWith(`team-${team.toLowerCase()}-`) === false) continue;
    if (event.kind === "GOAL") {
      goals += 1;
      continue;
    }
    if (event.kind === "POINT") {
      points += 1;
      continue;
    }
    if (event.kind === "TWO_POINTER") {
      points += 2;
      continue;
    }
    if (event.kind === "FORTY_FIVE_TWO_POINT") {
      points += 2;
      continue;
    }
    if (event.kind === "FREE_SCORED") {
      points += 1;
    }
  }

  return {
    goals,
    points,
    total: goals * 3 + points,
  };
}

function formatGaelicScore(score: TeamScore): string {
  return `${score.goals}-${String(score.points).padStart(2, "0")}`;
}

type MyTeamPlayerNote = {
  label: string;
  goals: number;
  points: number;
  scorePoints: number;
  turnoversWon: number;
  kickoutsWon: number;
  freesWon: number;
  involved: number;
};

function deriveMyTeamReport(
  loggedEvents: readonly LoggedMatchEvent[],
  matchState: MatchState,
  teamNames: { HOME: string; AWAY: string },
  currentMode: GaaModeKey,
): string[] {
  const reportEvents =
    matchState === "HALF_TIME"
      ? loggedEvents.filter((event) => event.half === 1)
      : loggedEvents;
  const homeScore = computeTeamScore(reportEvents, "HOME");
  const awayScore = computeTeamScore(reportEvents, "AWAY");
  const homeTeamName = teamNames.HOME.trim() || "Team A";
  const awayTeamName = teamNames.AWAY.trim() || "Team B";
  const isHurlingMode = currentMode === "hurling" || currentMode === "camogie";
  const restartLabel = isHurlingMode ? "PUCKOUTS" : "KICKOUTS";
  const restartWonLabel = isHurlingMode ? "puckouts won" : "kickouts won";

  let goals = 0;
  let points = 0;
  let twoPointers = 0;
  let shots = 0;
  let wides = 0;
  let scores = 0;
  let attempts = 0;
  let turnoversWon = 0;
  let turnoversLost = 0;
  let kickoutsWon = 0;
  let kickoutsLost = 0;
  let freesWon = 0;
  let freesConceded = 0;

  const playerNotes = new Map<string, MyTeamPlayerNote>();

  const resolvePlayerLabel = (event: LoggedMatchEvent) => {
    const numberLabel =
      typeof event.playerNumber === "number" && Number.isFinite(event.playerNumber)
        ? `#${event.playerNumber}`
        : null;
    const nameLabel =
      typeof event.playerName === "string" && event.playerName.trim().length > 0
        ? event.playerName.trim()
        : null;
    if (numberLabel && nameLabel) return `${numberLabel} ${nameLabel}`;
    if (nameLabel) return nameLabel;
    if (numberLabel) return numberLabel;
    return "Tagged player";
  };

  const getPlayerNote = (event: LoggedMatchEvent) => {
    const hasPlayerId = typeof event.playerId === "string" && event.playerId.trim().length > 0;
    const hasPlayerNumber = typeof event.playerNumber === "number" && Number.isFinite(event.playerNumber);
    const hasPlayerName = typeof event.playerName === "string" && event.playerName.trim().length > 0;
    if (!hasPlayerId && !hasPlayerNumber && !hasPlayerName) return null;
    const playerKey = hasPlayerId
      ? `id:${event.playerId}`
      : hasPlayerNumber
        ? `num:${event.playerNumber}`
        : `name:${event.playerName!.trim().toLowerCase()}`;
    const existing = playerNotes.get(playerKey);
    if (existing) return existing;
    const created: MyTeamPlayerNote = {
      label: resolvePlayerLabel(event),
      goals: 0,
      points: 0,
      scorePoints: 0,
      turnoversWon: 0,
      kickoutsWon: 0,
      freesWon: 0,
      involved: 0,
    };
    playerNotes.set(playerKey, created);
    return created;
  };

  for (const event of reportEvents) {
    if (!(event.team === "HOME" || event.id.startsWith("team-home-"))) continue;
    const playerNote = getPlayerNote(event);
    if (playerNote) {
      playerNote.involved += 1;
    }

    if (event.kind === "GOAL") {
      goals += 1;
      scores += 1;
      attempts += 1;
      if (playerNote) {
        playerNote.goals += 1;
        playerNote.scorePoints += 3;
      }
      continue;
    }
    if (event.kind === "POINT") {
      points += 1;
      scores += 1;
      attempts += 1;
      if (playerNote) {
        playerNote.points += 1;
        playerNote.scorePoints += 1;
      }
      continue;
    }
    const eventKind = String(event.kind);
    const isFreeScoredKind =
      eventKind === "FREE_SCORED" ||
      eventKind === "FS" ||
      eventKind === "FREE_SCORE" ||
      eventKind === "free_scored";
    if (isFreeScoredKind) {
      points += 1;
      scores += 1;
      attempts += 1;
      if (playerNote) {
        playerNote.points += 1;
        playerNote.scorePoints += 1;
      }
      continue;
    }
    if (event.kind === "TWO_POINTER" || event.kind === "FORTY_FIVE_TWO_POINT") {
      twoPointers += 1;
      scores += 1;
      attempts += 1;
      if (playerNote) {
        playerNote.points += 2;
        playerNote.scorePoints += 2;
      }
      continue;
    }
    if (event.kind === "SHOT") {
      shots += 1;
      attempts += 1;
      continue;
    }
    if (event.kind === "WIDE") {
      wides += 1;
      attempts += 1;
      continue;
    }
    if (event.kind === "TURNOVER_WON") {
      turnoversWon += 1;
      if (playerNote) playerNote.turnoversWon += 1;
      continue;
    }
    if (event.kind === "TURNOVER_LOST") {
      turnoversLost += 1;
      continue;
    }
    if (event.kind === "KICKOUT_WON") {
      kickoutsWon += 1;
      if (playerNote) playerNote.kickoutsWon += 1;
      continue;
    }
    if (event.kind === "KICKOUT_CONCEDED") {
      kickoutsLost += 1;
      continue;
    }
    if (event.kind === "FREE_WON") {
      freesWon += 1;
      if (playerNote) playerNote.freesWon += 1;
      continue;
    }
    if (event.kind === "FREE_CONCEDED") {
      freesConceded += 1;
    }
  }

  const conversionPct = attempts > 0 ? Math.round((scores / attempts) * 100) : 0;
  const kickoutAttempts = kickoutsWon + kickoutsLost;
  const kickoutSuccessPct = kickoutAttempts > 0 ? Math.round((kickoutsWon / kickoutAttempts) * 100) : 0;

  const pickBest = (
    valueOf: (note: MyTeamPlayerNote) => number,
  ): MyTeamPlayerNote | null => {
    let best: MyTeamPlayerNote | null = null;
    for (const note of playerNotes.values()) {
      if (valueOf(note) <= 0) continue;
      if (!best || valueOf(note) > valueOf(best)) best = note;
    }
    return best;
  };

  const topScorer = pickBest((note) => note.scorePoints);
  const topTurnoversWon = pickBest((note) => note.turnoversWon);
  const topKickoutsWon = pickBest((note) => note.kickoutsWon);
  const topFreesWon = pickBest((note) => note.freesWon);
  const mostInvolved = pickBest((note) => note.involved);
  const reportPhaseLabel =
    matchState === "HALF_TIME"
      ? "First Half"
      : matchState === "FULL_TIME"
        ? "Full Match"
        : "Live";

  const lines = [
    reportPhaseLabel,
    "",
    `${homeTeamName} ${formatGaelicScore(homeScore)} (${homeScore.total}) v ${awayTeamName} ${formatGaelicScore(awayScore)} (${awayScore.total})`,
    "",
    "SHOOTING",
    isHurlingMode ? `Goals ${goals} · Points ${points}` : `${goals}G · ${points}P · ${twoPointers}x2P`,
    `Shots ${shots} · Wides ${wides}`,
    `Conversion ${conversionPct}%`,
    "",
    "TURNOVERS",
    `Won ${turnoversWon} · Lost ${turnoversLost} · Net ${turnoversWon - turnoversLost}`,
    "",
    restartLabel,
    `Won ${kickoutsWon} · Lost ${kickoutsLost} · Success ${kickoutSuccessPct}%`,
    "",
    "FREES",
    `Won ${freesWon} · Conceded ${freesConceded} · Net ${freesWon - freesConceded}`,
    "",
    "PLAYER NOTES",
  ];

  if (playerNotes.size === 0) {
    lines.push("No player tags yet");
    return lines;
  }

  if (topScorer) {
    lines.push(
      `Top scorer · ${topScorer.label} ${topScorer.goals}-${String(topScorer.points).padStart(2, "0")} (${topScorer.scorePoints})`,
    );
  }
  if (topTurnoversWon) lines.push(`Most turnovers won · ${topTurnoversWon.label} (${topTurnoversWon.turnoversWon})`);
  if (topKickoutsWon) lines.push(`Most ${restartWonLabel} · ${topKickoutsWon.label} (${topKickoutsWon.kickoutsWon})`);
  if (topFreesWon) lines.push(`Most frees won · ${topFreesWon.label} (${topFreesWon.freesWon})`);
  if (mostInvolved) lines.push(`Most involved player · ${mostInvolved.label} (${mostInvolved.involved})`);

  return lines;
}

function getRenderablePitchEvents(
  events: readonly LoggedMatchEvent[],
  reviewHalf: ReviewHalf,
  reviewSegment: ReviewSegment,
  reviewTeamContext: ReviewTeamContext,
  reviewEventFilter: ReviewEventFilter,
  reviewFilterKinds: Record<
    Exclude<ReviewEventFilter, "ALL" | "PLAYERS">,
    readonly MatchEventKind[]
  >,
  reviewZone: ReviewZone,
  attackingDirection: AttackingDirection,
  reviewActivePlayerOnly: boolean,
  activePlayerId: string | null,
): LoggedMatchEvent[] {
  return selectReviewEvents(events, {
    half: reviewHalf,
    segment: reviewSegment,
    teamSide: reviewTeamContext,
    category: reviewEventFilter,
    categoryKinds: reviewFilterKinds,
    zone: reviewZone,
    attackingDirection,
    activePlayerOnly: reviewActivePlayerOnly,
    activePlayerId,
  });
}

type LiveSessionSignatureInput = {
  currentMode: GaaModeKey;
  activeTeamSide: "own" | "opposition";
  teamNames: { HOME: string; AWAY: string };
  venueName: string;
  events: readonly LoggedMatchEvent[];
  matchState: MatchState;
  currentHalf: 1 | 2;
  matchTimeSeconds: number;
  firstHalfAttackingDirection: AttackingDirection;
  fullTimeResumeState: MatchEngineState | null;
};

function buildLiveSessionSignature(input: LiveSessionSignatureInput): string {
  return JSON.stringify({
    currentMode: input.currentMode,
    activeTeamSide: input.activeTeamSide,
    teamNames: {
      HOME: input.teamNames.HOME,
      AWAY: input.teamNames.AWAY,
    },
    venueName: input.venueName,
    events: input.events,
    restoreContext: {
      matchState: input.matchState,
      currentHalf: input.currentHalf,
      matchTimeSeconds: Math.max(0, Math.floor(input.matchTimeSeconds)),
      firstHalfAttackingDirection: input.firstHalfAttackingDirection,
      ...(input.fullTimeResumeState &&
      (input.fullTimeResumeState.matchState === "FIRST_HALF" ||
        input.fullTimeResumeState.matchState === "SECOND_HALF")
        ? {
            fullTimeResumeState: {
              matchState: input.fullTimeResumeState.matchState,
              currentHalf: input.fullTimeResumeState.currentHalf,
              matchTimeSeconds: Math.max(0, Math.floor(input.fullTimeResumeState.matchTimeSeconds)),
            },
          }
        : {}),
    },
  });
}

function oppositeAttackingDirection(direction: AttackingDirection): AttackingDirection {
  return direction === "RIGHT" ? "LEFT" : "RIGHT";
}

function getEffectiveAttackingDirection(
  firstHalfAttackingDirection: AttackingDirection,
  half: 1 | 2,
): AttackingDirection {
  return half === 2 ? oppositeAttackingDirection(firstHalfAttackingDirection) : firstHalfAttackingDirection;
}

function modeHasScoringEvent(
  scoringEvents: readonly ModeScoringEventKind[],
  kind: ModeScoringEventKind,
): boolean {
  return scoringEvents.includes(kind);
}

function getReviewEventTypeLabel(kind: MatchEventKind): string {
  if (kind === "KICKOUT_CONCEDED") return "KICKOUT LOST";
  if (kind === "KICKOUT_WON") return "KICKOUT WON";
  if (kind === "TURNOVER_LOST") return "TURNOVER LOST";
  if (kind === "TURNOVER_WON") return "TURNOVER WON";
  return kind;
}

function getViewportRect(): ViewportRect {
  if (typeof window === "undefined") {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const viewport = window.visualViewport;
  if (!viewport) {
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  return {
    left: viewport.offsetLeft,
    top: viewport.offsetTop,
    width: viewport.width,
    height: viewport.height,
  };
}

function getMobileViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  const viewport = window.visualViewport;
  const visualViewportHeight =
    viewport && Number.isFinite(viewport.height) ? Math.round(viewport.height) : 0;
  const innerHeight =
    Number.isFinite(window.innerHeight) ? Math.round(window.innerHeight) : 0;
  return Math.max(0, visualViewportHeight || innerHeight);
}

function safeShareLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function safeShareCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function buildMatchShareSummaryText(input: MatchShareSummaryInput): string {
  void safeShareCount(input.eventCount);
  return "PáircVision Match Summary";
}

function clampUtilityBubblePosition(
  position: { left: number; top: number },
  viewport: ViewportRect,
): { left: number; top: number } {
  const minLeft = viewport.left + UTILITY_BUBBLE_MARGIN;
  const maxLeft = viewport.left + viewport.width - UTILITY_BUBBLE_MARGIN - UTILITY_BUBBLE_SIZE;
  const clampedLeft = Math.min(Math.max(position.left, minLeft), Math.max(minLeft, maxLeft));
  const minTop = viewport.top + UTILITY_BUBBLE_MARGIN;
  const maxTop = viewport.top + viewport.height - UTILITY_BUBBLE_MARGIN - UTILITY_BUBBLE_SIZE;
  const clampedTop = Math.min(Math.max(position.top, minTop), Math.max(minTop, maxTop));
  return { left: clampedLeft, top: clampedTop };
}

function getDefaultUtilityBubblePosition(viewport: ViewportRect): { left: number; top: number } {
  return clampUtilityBubblePosition(
    {
      left: viewport.left + 16,
      top: viewport.top + viewport.height - 90 - UTILITY_BUBBLE_SIZE,
    },
    viewport,
  );
}

const PANEL_CSS = `
.app-root {
  position: fixed;
  inset: 0;
  width: 100dvw;
  height: var(--stats-app-height, 100dvh);
  min-height: var(--stats-app-height, 100dvh);
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0f0c;
  overflow: hidden;
  isolation: isolate;
}

.floating-controls {
  position: fixed;
  right: 16px;
  bottom: 14px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.team-side-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  width: 112px;
  max-width: 100%;
  padding: 3px;
  box-sizing: border-box;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(10, 20, 35, 0.72);
  box-shadow: 0 3px 10px rgba(2, 8, 15, 0.22);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.team-side-toggle--scoreboard {
  width: 100%;
  max-width: 100%;
  align-self: stretch;
  padding: 0;
  gap: 2px;
  border: none;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.team-side-toggle-btn {
  min-height: 26px;
  min-width: 0;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.88);
  color: #dbe7f5;
  font-size: 8.4px;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  cursor: pointer;
}

.team-side-toggle-btn.is-active {
  border: 1px solid rgba(34, 197, 94, 0.86);
  background: rgba(22, 101, 52, 0.74);
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.18), 0 0 8px rgba(34, 197, 94, 0.18);
}

.event-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px;
  border-radius: 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: linear-gradient(180deg, rgba(10, 20, 35, 0.82) 0%, rgba(8, 16, 28, 0.88) 100%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 8px 18px rgba(4, 12, 24, 0.32);
  width: min(calc(100vw - 32px), 308px);
  max-width: 95vw;
}

.event-keyboard {
  display: grid;
  gap: 4px;
}

.event-keyboard-row {
  display: grid;
  gap: 3px;
}

.event-keyboard-btn {
  border-radius: 8px;
  color: #edf4ff;
  font-size: 9.2px;
  line-height: 1.1;
  padding: 6px 4px;
  min-height: 30px;
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
  letter-spacing: 0.22px;
  font-weight: 780;
  text-transform: uppercase;
  text-shadow: 0 0 6px rgba(2, 6, 23, 0.35);
  transition: box-shadow 140ms ease, transform 120ms ease, border-color 140ms ease, background 140ms ease;
  border: 1px solid rgba(148, 163, 184, 0.46);
  background: linear-gradient(180deg, rgba(22, 34, 52, 0.9) 0%, rgba(13, 22, 37, 0.92) 100%);
}

.event-keyboard-btn:hover {
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.2), 0 0 10px rgba(148, 163, 184, 0.16);
}

.event-keyboard-btn:active {
  transform: translateY(0.5px);
}

.event-keyboard-btn--score {
  border-color: rgba(74, 222, 128, 0.42);
  background: linear-gradient(180deg, rgba(20, 59, 44, 0.86) 0%, rgba(12, 32, 24, 0.9) 100%);
}

.event-keyboard-btn--wide {
  border-color: rgba(96, 165, 250, 0.44);
  background: linear-gradient(180deg, rgba(21, 50, 88, 0.86) 0%, rgba(13, 28, 53, 0.9) 100%);
}

.event-keyboard-btn--turnover {
  border-color: rgba(251, 146, 60, 0.44);
  background: linear-gradient(180deg, rgba(87, 48, 18, 0.86) 0%, rgba(50, 28, 12, 0.9) 100%);
}

.event-keyboard-btn--kickout {
  border-color: rgba(192, 132, 252, 0.46);
  background: linear-gradient(180deg, rgba(66, 35, 106, 0.86) 0%, rgba(37, 20, 61, 0.9) 100%);
}

.event-keyboard-btn--free {
  border-color: rgba(248, 113, 113, 0.46);
  background: linear-gradient(180deg, rgba(87, 20, 33, 0.86) 0%, rgba(50, 13, 20, 0.9) 100%);
}

.event-keyboard-btn.is-open,
.event-keyboard-btn.is-active {
  border-color: rgba(226, 236, 255, 0.92);
  box-shadow: 0 0 0 1px rgba(226, 236, 255, 0.18), 0 0 12px rgba(125, 211, 252, 0.2);
}

.event-keyboard-btn--score.is-open,
.event-keyboard-btn--score.is-active {
  box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.24), 0 0 12px rgba(74, 222, 128, 0.2);
}

.event-keyboard-btn--wide.is-open,
.event-keyboard-btn--wide.is-active {
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.26), 0 0 12px rgba(96, 165, 250, 0.22);
}

.event-keyboard-btn--turnover.is-open,
.event-keyboard-btn--turnover.is-active {
  box-shadow: 0 0 0 1px rgba(251, 146, 60, 0.24), 0 0 12px rgba(251, 146, 60, 0.2);
}

.event-keyboard-btn--kickout.is-open,
.event-keyboard-btn--kickout.is-active {
  box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.24), 0 0 12px rgba(192, 132, 252, 0.2);
}

.event-keyboard-btn--free.is-open,
.event-keyboard-btn--free.is-active {
  box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.24), 0 0 12px rgba(248, 113, 113, 0.18);
}

.event-keyboard-drawer {
  margin-top: 1px;
  display: grid;
  gap: 5px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background: linear-gradient(180deg, rgba(6, 12, 20, 0.98) 0%, rgba(7, 13, 23, 0.96) 100%);
  padding: 7px 7px 6px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 16px rgba(2, 8, 15, 0.34);
}

.event-keyboard-drawer--score {
  border-color: rgba(74, 222, 128, 0.42);
  background: linear-gradient(180deg, rgba(8, 18, 14, 0.98) 0%, rgba(7, 13, 11, 0.96) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(74, 222, 128, 0.2), 0 8px 18px rgba(16, 185, 129, 0.18);
}

.event-keyboard-drawer--wide {
  border-color: rgba(96, 165, 250, 0.44);
  background: linear-gradient(180deg, rgba(8, 16, 30, 0.98) 0%, rgba(7, 12, 23, 0.96) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(96, 165, 250, 0.2), 0 8px 18px rgba(59, 130, 246, 0.18);
}

.event-keyboard-drawer--turnover {
  border-color: rgba(251, 146, 60, 0.44);
  background: linear-gradient(180deg, rgba(24, 14, 8, 0.98) 0%, rgba(16, 10, 6, 0.96) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(251, 146, 60, 0.2), 0 8px 18px rgba(249, 115, 22, 0.17);
}

.event-keyboard-drawer--kickout {
  border-color: rgba(192, 132, 252, 0.45);
  background: linear-gradient(180deg, rgba(16, 11, 27, 0.98) 0%, rgba(12, 8, 20, 0.96) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(192, 132, 252, 0.2), 0 8px 18px rgba(168, 85, 247, 0.18);
}

.event-keyboard-drawer--free {
  border-color: rgba(248, 113, 113, 0.44);
  background: linear-gradient(180deg, rgba(27, 9, 13, 0.98) 0%, rgba(20, 7, 10, 0.96) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(248, 113, 113, 0.18), 0 8px 18px rgba(239, 68, 68, 0.14);
}

.event-keyboard-drawer-head {
  color: #ebf4ff;
  font-size: 8.4px;
  line-height: 1.1;
  letter-spacing: 0.26px;
  font-weight: 760;
  text-transform: uppercase;
  opacity: 0.92;
}

.event-keyboard-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.event-keyboard-chip {
  min-height: 25px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  background: linear-gradient(180deg, rgba(24, 36, 56, 0.92) 0%, rgba(16, 26, 43, 0.92) 100%);
  color: #f4f8ff;
  font-size: 8.6px;
  font-weight: 780;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  padding: 0 10px;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 4px rgba(2, 8, 15, 0.2);
}

.event-keyboard-chip:hover {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(226, 236, 255, 0.16), 0 4px 7px rgba(2, 8, 15, 0.24);
}

.event-keyboard-chip--score {
  border-color: rgba(74, 222, 128, 0.42);
}

.event-keyboard-chip--wide {
  border-color: rgba(96, 165, 250, 0.44);
}

.event-keyboard-chip--turnover {
  border-color: rgba(251, 146, 60, 0.44);
}

.event-keyboard-chip--kickout {
  border-color: rgba(192, 132, 252, 0.44);
}

.event-keyboard-chip--free {
  border-color: rgba(248, 113, 113, 0.44);
}

.event-keyboard-chip.is-active {
  border-color: rgba(226, 236, 255, 0.95);
  color: #ffffff;
  box-shadow: 0 0 0 1px rgba(226, 236, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 8px rgba(2, 8, 15, 0.26);
}

.event-keyboard-chip--score.is-active {
  border-color: rgba(74, 222, 128, 0.92);
  background: linear-gradient(180deg, rgba(17, 94, 59, 0.88) 0%, rgba(11, 68, 43, 0.9) 100%);
}

.event-keyboard-chip--wide.is-active {
  border-color: rgba(96, 165, 250, 0.92);
  background: linear-gradient(180deg, rgba(29, 78, 216, 0.88) 0%, rgba(30, 64, 175, 0.9) 100%);
}

.event-keyboard-chip--turnover.is-active {
  border-color: rgba(251, 146, 60, 0.92);
  background: linear-gradient(180deg, rgba(180, 83, 9, 0.88) 0%, rgba(146, 64, 14, 0.9) 100%);
}

.event-keyboard-chip--kickout.is-active {
  border-color: rgba(192, 132, 252, 0.92);
  background: linear-gradient(180deg, rgba(126, 34, 206, 0.88) 0%, rgba(107, 33, 168, 0.9) 100%);
}

.event-keyboard-chip--free.is-active {
  border-color: rgba(248, 113, 113, 0.92);
  background: linear-gradient(180deg, rgba(185, 28, 28, 0.88) 0%, rgba(153, 27, 27, 0.9) 100%);
}

.event-keyboard-btn:disabled,
.event-keyboard-chip:disabled,
.landscape-toolbar-btn:disabled,
.landscape-toolbar-secondary-btn:disabled,
.utility-player-btn:disabled,
.utility-review-btn:disabled,
.utility-menu-btn:disabled,
.scoreboard-attack-btn:disabled {
  opacity: 0.46;
  cursor: not-allowed;
  box-shadow: none;
  filter: none;
}

.event-keyboard-btn:disabled:hover,
.event-keyboard-btn:disabled:active,
.landscape-toolbar-btn:disabled:hover,
.landscape-toolbar-btn:disabled:active {
  transform: none;
  box-shadow: none;
}

.visibility-row {
  margin-top: 1px;
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.visibility-btn {
  border-radius: 999px;
  color: #e2e8f0;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.1;
  padding: 3px 7px;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  transition: opacity 140ms ease, filter 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}

.undo-wrap {
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.undo-btn {
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.9);
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  padding: 5px 8px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  letter-spacing: 0.25px;
  text-transform: uppercase;
  transition: opacity 140ms ease, filter 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}

.utility-quiet {
  opacity: 0.52;
  filter: saturate(0.7);
}

.utility-quiet:hover {
  opacity: 0.66;
  filter: saturate(0.82);
}

.active-chip {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  line-height: 1;
  white-space: nowrap;
  letter-spacing: 0.25px;
  text-transform: uppercase;
}

.bubble-btn {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.76);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #e2e8f0;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.22), 0 0 12px rgba(34, 197, 94, 0.28);
}

.player-bubble-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.68);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #dbeafe;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.12), 0 0 6px rgba(148, 163, 184, 0.14);
}

.utility-controls {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
  left: 16px;
  bottom: 90px;
}

.utility-controls--portrait {
  left: max(16px, calc(env(safe-area-inset-left, 0px) + 12px));
  bottom: max(88px, calc(env(safe-area-inset-bottom, 0px) + 84px));
  align-items: flex-start;
  z-index: 10001;
}

.utility-controls--landscape {
  left: 16px;
  bottom: 90px;
  align-items: flex-start;
}

.utility-bubble-btn {
  position: fixed;
  left: 16px;
  bottom: 90px;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(124, 255, 114, 0.3);
  background: linear-gradient(180deg, rgba(18, 27, 32, 0.88) 0%, rgba(7, 13, 16, 0.94) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    0 10px 20px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(124, 255, 114, 0.08),
    0 0 8px rgba(124, 255, 114, 0.12),
    inset 0 1px 2px rgba(255, 255, 255, 0.12);
  z-index: 9999;
  color: rgba(236, 255, 238, 0.96);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.utility-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(10, 20, 35, 0.74);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 18px rgba(4, 12, 24, 0.26);
  min-width: 110px;
  pointer-events: auto;
  margin-left: 44px;
  margin-bottom: 8px;
}

.utility-menu-btn {
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 620;
  line-height: 1;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  cursor: pointer;
}

.active-player-chip {
  border: 1px solid rgba(125, 211, 252, 0.42);
  border-radius: 999px;
  background: rgba(14, 24, 40, 0.8);
  color: #dbeafe;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  padding: 5px 9px;
  white-space: nowrap;
  pointer-events: auto;
}

.utility-overlay-panel {
  position: fixed;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 208px;
  max-width: 86vw;
  padding: 8px;
  border-radius: 11px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(10, 20, 35, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 10px 22px rgba(4, 12, 24, 0.3);
}

.utility-overlay-panel--portrait {
  left: 14px;
  bottom: 66px;
}

.utility-overlay-panel--landscape {
  right: 16px;
  bottom: 142px;
  max-height: calc(100dvh - 150px);
  overflow: hidden;
}

.utility-overlay-panel--review-landscape {
  right: 16px;
  bottom: 142px;
  max-height: calc(100dvh - 24px);
  min-width: 198px;
  max-width: min(70vw, 320px);
  padding: 6px;
  gap: 4px;
}

.utility-overlay-panel--review-landscape .utility-review-btn {
  min-height: 26px;
  height: 26px;
  font-size: 9px;
  padding: 0 8px;
}

.utility-review-scroll {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.utility-panel-close--sticky {
  position: sticky;
  bottom: 0;
  margin-top: 4px;
  background: rgba(15, 23, 42, 0.95);
  z-index: 1;
}

.review-strip {
  position: fixed;
  z-index: 23;
  left: 12px;
  right: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(10, 20, 35, 0.82);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 16px rgba(4, 12, 24, 0.28);
  overflow: hidden;
}

.review-strip-status {
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.5);
  background: rgba(14, 116, 144, 0.24);
  color: #bae6fd;
  font-size: 8.4px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.22px;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
}

.review-strip-meta {
  color: rgba(203, 213, 225, 0.86);
  font-size: 8.2px;
  font-weight: 600;
  letter-spacing: 0.16px;
  text-transform: uppercase;
}

.review-strip-player {
  max-width: min(44vw, 220px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: none;
}

.review-strip-spacer {
  flex: 1 1 auto;
  min-width: 6px;
}

.review-strip--portrait {
  top: max(96px, calc(env(safe-area-inset-top) + 92px));
}

.review-strip--landscape {
  top: max(8px, env(safe-area-inset-top));
  left: max(90px, calc(env(safe-area-inset-left, 0px) + 86px));
  right: max(10px, calc(env(safe-area-inset-right, 0px) + 8px));
}

.review-strip-chip {
  min-height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.88);
  color: #dbe7f5;
  font-size: 8.4px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.14px;
  text-transform: uppercase;
  padding: 0 7px;
  cursor: pointer;
  flex: 0 0 auto;
}

.review-strip-chip--half {
  min-width: 36px;
  padding: 0 6px;
}

.review-strip-chip--exit {
  border: 1px solid rgba(248, 113, 113, 0.68);
  background: rgba(127, 29, 29, 0.35);
}

.review-event-card {
  position: fixed;
  z-index: 22;
  left: 12px;
  min-width: 170px;
  max-width: min(58vw, 260px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(10, 20, 35, 0.9);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 16px rgba(4, 12, 24, 0.28);
}

.review-event-card--portrait {
  top: max(96px, calc(env(safe-area-inset-top) + 92px));
}

.review-event-card--landscape {
  top: max(48px, calc(env(safe-area-inset-top) + 44px));
}

.review-event-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.review-event-card-title {
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.review-event-card-close {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.review-event-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #dbe7f5;
  font-size: 9px;
  letter-spacing: 0.16px;
}

.review-event-card-row-label {
  opacity: 0.84;
  text-transform: uppercase;
}

.review-event-card-row-value {
  font-weight: 700;
  text-align: right;
}

.review-quick-strip {
  position: fixed;
  left: 8px;
  right: 8px;
  z-index: 23;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 5px 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(10, 20, 35, 0.76);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 14px rgba(4, 12, 24, 0.24);
  -webkit-overflow-scrolling: touch;
}

.review-quick-btn {
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  padding: 0 8px;
  white-space: nowrap;
  cursor: pointer;
  flex: 0 0 auto;
}

.utility-panel-title {
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.22px;
  text-transform: uppercase;
}

.utility-squad-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.utility-squad-select {
  flex: 1;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
}

.utility-squad-create {
  display: flex;
  gap: 6px;
}

.utility-squad-input {
  flex: 1;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
}

.utility-player-add-row {
  display: flex;
  gap: 6px;
}

.utility-player-input {
  flex: 1;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
}

.utility-active-player-chip {
  border: 1px solid rgba(125, 211, 252, 0.42);
  border-radius: 999px;
  background: rgba(14, 116, 144, 0.28);
  color: #dbeafe;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.16px;
  padding: 5px 8px;
  text-transform: uppercase;
  pointer-events: auto;
}

.utility-active-player-chip-floating {
  position: fixed;
  right: 16px;
  z-index: 22;
  pointer-events: none;
  max-width: min(62vw, 228px);
  overflow: hidden;
  text-overflow: ellipsis;
}

.utility-player-btn,
.utility-review-btn {
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 620;
  line-height: 1;
  text-align: left;
  padding: 0 9px;
  letter-spacing: 0.2px;
  cursor: pointer;
}

.utility-formation {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.utility-formation-row {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.utility-player-pill {
  min-height: 24px;
  max-width: 98px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  padding: 0 8px;
  letter-spacing: 0.18px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.utility-subs-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.utility-subs-title {
  color: rgba(219, 231, 245, 0.84);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.2px;
  text-transform: uppercase;
}

.utility-subs-row {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}

.utility-panel-close {
  align-self: flex-end;
  min-height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  padding: 0 8px;
  cursor: pointer;
}

.landscape-toolbar {
  position: fixed;
  right: 92px;
  bottom: 30px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: fit-content;
  max-width: min(620px, calc(100vw - 154px));
  max-height: min(46vh, 190px);
  overflow-y: auto;
  padding: 7px 9px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(10, 20, 35, 0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 16px rgba(4, 12, 24, 0.24);
}

.landscape-toolbar-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  column-gap: 6px;
  row-gap: 6px;
  align-items: stretch;
}

.landscape-toolbar-secondary {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  column-gap: 5px;
  row-gap: 5px;
  margin-top: 1px;
}

.landscape-toolbar-btn {
  min-width: 0;
  min-height: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.86);
  color: #e2e8f0;
  font-size: 9.2px;
  font-weight: 700;
  line-height: 1;
  padding: 0 9px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.16px;
  text-transform: uppercase;
}

.landscape-toolbar-secondary-btn {
  min-width: 0;
  min-height: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.scoreboard-strip {
  position: fixed;
  top: max(2px, env(safe-area-inset-top));
  left: max(4px, env(safe-area-inset-left));
  z-index: 19;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: min(220px, calc(100vw - 12px));
  max-width: 220px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.66);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(2, 6, 23, 0.3);
}

.scoreboard-strip-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
}

.scoreboard-side {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  min-width: 0;
}

.scoreboard-side-label {
  color: rgba(203, 213, 225, 0.9);
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.scoreboard-side-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.scoreboard-name-edit-btn {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.86);
  color: #cbd5e1;
  font-size: 9px;
  line-height: 1;
  padding: 0;
  margin: 0 0 0 1px;
  cursor: pointer;
}

.scoreboard-name-input {
  width: 100%;
  min-width: 0;
  height: 18px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.44);
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  padding: 0 5px;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.scoreboard-side-score {
  color: #f8fafc;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0.24px;
}

.scoreboard-total {
  color: rgba(203, 213, 225, 0.9);
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  margin-left: 2px;
}

.scoreboard-team-toggle {
  margin-top: 1px;
  display: flex;
  gap: 3px;
}

.scoreboard-attack-row {
  margin-top: 3px;
}

.scoreboard-team-btn {
  min-height: 28px;
  min-width: 54px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  cursor: pointer;
}

.scoreboard-attack-btn {
  min-height: 28px;
  min-width: 54px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(186, 230, 253, 0.82);
  background: rgba(12, 74, 110, 0.86);
  color: #f8fafc;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.24px;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(12, 74, 110, 0.36), 0 1px 4px rgba(2, 6, 23, 0.35);
}

.scoreboard-attack-btn:disabled {
  cursor: not-allowed;
}

.scoreboard-attack-btn--rail {
  width: 100%;
}

.scoreboard-attack-btn--strip {
  width: 100%;
}

.scoreboard-rail {
  position: fixed;
  top: 50%;
  left: max(4px, env(safe-area-inset-left));
  transform: translateY(-50%);
  z-index: 19;
  width: clamp(72px, 11vw, 96px);
  min-height: clamp(220px, 52vh, 420px);
  max-height: min(80vh, 520px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 5px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.66);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(2, 6, 23, 0.3);
}

.scoreboard-rail-score {
  color: #f8fafc;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0.22px;
}

.scoreboard-rail-separator {
  color: rgba(203, 213, 225, 0.84);
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.scoreboard-rail-total {
  color: rgba(203, 213, 225, 0.88);
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  margin-left: 2px;
}

.scoreboard-rail-team-btn {
  min-height: 36px;
  width: 100%;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  cursor: pointer;
}

.scoreboard-rail-team-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.scoreboard-rail-name-line {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.scoreboard-rail-team-name {
  color: rgba(203, 213, 225, 0.9);
  font-size: 8.5px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.16px;
  text-transform: uppercase;
}

.scoreboard-team-btn-inner {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.scoreboard-team-btn-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scoreboard-rail-name-input {
  width: 100%;
  min-width: 0;
  height: 20px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.46);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  padding: 0 4px;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  text-align: center;
}

.scoreboard-rail-venue {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 18px;
  padding: 0 2px;
}

.scoreboard-rail-venue-label {
  color: rgba(203, 213, 225, 0.9);
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 64px;
}

.scoreboard-rail-venue-input {
  width: 100%;
  min-width: 0;
  height: 20px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.46);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  padding: 0 4px;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  text-align: center;
}

.scoreboard-strip-venue {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 4px;
  min-height: 18px;
  padding: 0 4px;
}

.scoreboard-strip-venue-label {
  color: rgba(203, 213, 225, 0.9);
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.scoreboard-strip-venue-input {
  width: 140px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.44);
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  padding: 0 5px;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  text-align: center;
}

.scoreboard-side-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 8px;
  font: inherit;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.match-stopwatch {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 19;
  display: grid;
  grid-template-columns: auto auto;
  grid-template-areas:
    "state clock"
    "controls controls";
  align-items: center;
  row-gap: 4px;
  column-gap: 7px;
  justify-items: start;
  padding: 5px 8px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.14), 0 3px 10px rgba(2, 6, 23, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.22px;
  text-transform: uppercase;
}

.match-stopwatch-state {
  grid-area: state;
  color: rgba(203, 213, 225, 0.84);
  font-size: 9px;
  font-weight: 500;
  line-height: 1;
}

@media (orientation: landscape) {
  .scoreboard-rail {
    left: max(3px, env(safe-area-inset-left));
  }

  .match-stopwatch {
    top: max(2px, env(safe-area-inset-top));
    right: max(4px, env(safe-area-inset-right));
  }

  .utility-bubble-btn {
    left: 16px;
    right: auto;
    bottom: 90px;
  }

  .utility-controls--landscape {
    left: 16px;
    right: auto;
    bottom: 90px;
    align-items: flex-start;
  }

  .utility-controls--landscape .utility-menu {
    margin-left: 44px;
    margin-right: 0;
  }

  .team-side-toggle--scoreboard .team-side-toggle-btn {
    min-height: 30px;
    font-size: 8.2px;
    letter-spacing: 0.14px;
    padding: 0 2px;
  }
}

@media (orientation: portrait) {
  .scoreboard-strip {
    top: max(8px, calc(env(safe-area-inset-top, 0px) + 6px));
  }

  .match-stopwatch {
    top: max(14px, calc(env(safe-area-inset-top, 0px) + 10px));
    right: max(10px, calc(env(safe-area-inset-right, 0px) + 8px));
  }

  .review-strip--portrait {
    top: max(104px, calc(env(safe-area-inset-top, 0px) + 100px));
  }

  .review-event-card--portrait {
    top: max(104px, calc(env(safe-area-inset-top, 0px) + 100px));
  }

  .bubble-btn--counts {
    position: fixed;
    left: max(16px, calc(env(safe-area-inset-left, 0px) + 12px));
    bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px));
    z-index: 10000;
  }

  .utility-controls--portrait .utility-bubble-btn {
    left: max(16px, calc(env(safe-area-inset-left, 0px) + 12px));
    bottom: max(88px, calc(env(safe-area-inset-bottom, 0px) + 84px));
    z-index: 10001;
  }
}

.match-stopwatch-clock {
  grid-area: clock;
  justify-self: end;
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.34px;
  line-height: 1;
  text-shadow: 0 0 7px rgba(148, 163, 184, 0.3);
}

.match-stopwatch-controls {
  grid-area: controls;
  width: 100%;
  display: flex;
  gap: 4px;
}

.match-stopwatch-btn {
  position: relative;
  width: 100%;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(34, 197, 94, 0.62);
  background: rgba(22, 101, 52, 0.88);
  color: #dbe7f5;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.24px;
  padding: 0 10px;
  cursor: pointer;
  text-transform: uppercase;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.24), 0 0 10px rgba(34, 197, 94, 0.28);
}

.match-stopwatch-btn::before {
  content: "";
  position: absolute;
  inset: -5px;
}
`;

const HOME_ICON_BUTTON_STYLE: CSSProperties = {
  height: "34px",
  width: "34px",
  borderRadius: "10px",
  border: "1px solid rgba(124, 255, 114, 0.28)",
  background: "rgba(16, 41, 27, 0.74)",
  color: "#f1f7f0",
  fontSize: "14px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

export default function StatsModeSurface() {
  const hostRef = useRef<HTMLDivElement>(null);
  const floatingControlsRef = useRef<HTMLDivElement>(null);
  const utilityMenuRef = useRef<HTMLDivElement>(null);
  const utilityBubbleDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    moved: boolean;
  } | null>(null);
  const suppressUtilityBubbleClickRef = useRef(false);
  const [currentMode, setCurrentMode] = useState<GaaModeKey>("football");
  const mode = gaaModeConfig[currentMode];
  const [selectedEventKind, setSelectedEventKind] = useState<MatchEventKind>("POINT");
  const [activeTeam, setActiveTeam] = useState<TeamSide>("HOME");
  const [activeTeamSide, setActiveTeamSide] = useState<"own" | "opposition">("own");
  const [teamNames, setTeamNames] = useState<{ HOME: string; AWAY: string }>({
    HOME: "Team A",
    AWAY: "Team B",
  });
  const [editingTeam, setEditingTeam] = useState<TeamSide | null>(null);
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [venueName, setVenueName] = useState<string>("");
  const [editingVenue, setEditingVenue] = useState<boolean>(false);
  const [venueDraft, setVenueDraft] = useState("");
  const [isUtilityOpen, setIsUtilityOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const [squads, setSquads] = useState<Squad[]>(() => {
    if (typeof window === "undefined") {
      return ensureHomeAwaySquads([createDefaultSquad("HOME")]).squads;
    }
    const parsed = parseStoredSquads(safeReadLocalStorage(SQUADS_STORAGE_KEY));
    return ensureHomeAwaySquads(parsed.length > 0 ? parsed : [createDefaultSquad("HOME")]).squads;
  });
  const [savedSquads, setSavedSquads] = useState<SavedSquad[]>(() => {
    if (typeof window === "undefined") return [];
    return parseStoredSavedSquads(safeReadLocalStorage(SAVED_SQUADS_STORAGE_KEY));
  });
  const [activeSquadIdsByTeam, setActiveSquadIdsByTeam] = useState<{ HOME: string; AWAY: string }>(() =>
    ensureHomeAwaySquads(
      typeof window === "undefined"
        ? [createDefaultSquad("HOME")]
        : parseStoredSquads(safeReadLocalStorage(SQUADS_STORAGE_KEY)),
    ).byTeam,
  );
  const [squadDraft, setSquadDraft] = useState("");
  const [activePlayer, setActivePlayer] = useState<string | null>(null);
  const [activePlayerNumber, setActivePlayerNumber] = useState<number | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [playerDraft, setPlayerDraft] = useState("");
  const [selectedSubOutId, setSelectedSubOutId] = useState<string | null>(null);
  const [selectedSubInId, setSelectedSubInId] = useState<string | null>(null);
  const [showPlayerInitials] = useState(true);
  const [reviewHalf, setReviewHalf] = useState<ReviewHalf>("FULL");
  const [reviewSegment, setReviewSegment] = useState<ReviewSegment>("ALL");
  const [reviewTeamContext, setReviewTeamContext] = useState<ReviewTeamContext>("ALL");
  const [reviewEventFilter, setReviewEventFilter] = useState<ReviewEventFilter>("ALL");
  const [reviewActivePlayerOnly, setReviewActivePlayerOnly] = useState(false);
  const [reviewZone, setReviewZone] = useState<ReviewZone>("FULL");
  const [showReviewHeatmap] = useState(false);
  const [showReviewZones, setShowReviewZones] = useState(false);
  const [firstHalfAttackingDirection, setFirstHalfAttackingDirection] =
    useState<AttackingDirection>("RIGHT");
  const [showReviewStrip, setShowReviewStrip] = useState(false);
  const [isReviewStripCollapsed, setIsReviewStripCollapsed] = useState(false);
  const [selectedReviewEventId, setSelectedReviewEventId] = useState<string | null>(null);
  const [pendingFollowup, setPendingFollowup] = useState<{
    eventId: string;
    kind: PendingFollowupKind;
  } | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<readonly LoggedMatchEvent[]>([]);
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>(() => readSavedMatchesFromStorage().matches);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [saveLoadBlockedReason, setSaveLoadBlockedReason] = useState<string | null>(null);
  const [lastSavedAtMillis, setLastSavedAtMillis] = useState<number | null>(null);
  const [loadedMatchLabel, setLoadedMatchLabel] = useState<string | null>(null);
  const [pendingRecoveredDraft, setPendingRecoveredDraft] = useState<StatsActiveMatchDraft | null>(null);
  const [isDraftRecoveryCheckComplete, setIsDraftRecoveryCheckComplete] = useState(false);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>("ALL");
  const [matchState, setMatchState] = useState<MatchState>("PRE_MATCH");
  const [currentHalf, setCurrentHalf] = useState<1 | 2>(1);
  const [matchTimeSeconds, setMatchTimeSeconds] = useState(0);
  const [isPitchReady, setIsPitchReady] = useState(false);
  const [isCountsOverlayOpen, setIsCountsOverlayOpen] = useState(false);
  const [isFullTimeActionsOpen, setIsFullTimeActionsOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [currentMatchId, setCurrentMatchId] = useState<string>(() => newMatchSessionId("live"));
  /** True only during an active demo session — blocks all localStorage persistence. */
  const [isDemoSession, setIsDemoSession] = useState(false);
  /** Evaluated once at mount. True when URL contains ?demo=1. */
  const isDemoParam = useMemo(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1",
    [],
  );
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [utilityBubblePosition, setUtilityBubblePosition] = useState<{ left: number; top: number } | null>(null);
  const [utilityMenuSize, setUtilityMenuSize] = useState<{ width: number; height: number }>({
    width: 160,
    height: 260,
  });
  const [isLandscape, setIsLandscape] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(orientation: landscape)").matches,
  );
  const [appViewportHeight, setAppViewportHeight] = useState(() => getMobileViewportHeight());
  const selectedEventRef = useRef<MatchEventKind>("POINT");
  const activeTeamRef = useRef<TeamSide>("HOME");
  const activeTeamSideRef = useRef<"own" | "opposition">("own");
  const activePlayerRef = useRef<string | null>(null);
  const activePlayerNumberRef = useRef<number | null>(null);
  const activePlayerIdRef = useRef<string | null>(null);
  const activePlayerEntryRef = useRef<SquadPlayer | null>(null);
  const reviewHalfRef = useRef<ReviewHalf>("FULL");
  const reviewSegmentRef = useRef<ReviewSegment>("ALL");
  const reviewTeamContextRef = useRef<ReviewTeamContext>("ALL");
  const reviewEventFilterRef = useRef<ReviewEventFilter>("ALL");
  const reviewActivePlayerOnlyRef = useRef(false);
  const reviewZoneRef = useRef<ReviewZone>("FULL");
  const firstHalfAttackingDirectionRef = useRef<AttackingDirection>("RIGHT");
  const pendingScorerRef = useRef<{ name: string; number: number; squadId: string } | null>(null);
  const queuedEventTagRef = useRef<{ kind: MatchEventKind; tag: string } | null>(null);
  const activeSquadIdRef = useRef("");
  const homeNameInputRef = useRef<HTMLInputElement>(null);
  const awayNameInputRef = useRef<HTMLInputElement>(null);
  const venueInputRef = useRef<HTMLInputElement>(null);
  const matchEngineStateRef = useRef(createInitialMatchEngineState());
  const fullTimeResumeStateRef = useRef<MatchEngineState | null>(null);
  const currentMatchIdRef = useRef(currentMatchId);
  const savedSessionSignatureRef = useRef<string | null>(null);
  const secondHalfSwitchBaselineEventCountRef = useRef<number | null>(null);
  const eventKindSwitchBaselineEventCountRef = useRef<number | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [openEventKeyboardMenuId, setOpenEventKeyboardMenuId] = useState<EventKeyboardMenuId | null>(null);
  const EVENT_BUTTONS = mode.eventButtons;
  const EVENT_LABEL_BY_KIND = mode.eventLabels;
  const isHurlingMode = currentMode === "hurling" || currentMode === "camogie";
  const isLiveMatchActive = matchState !== "PRE_MATCH" && matchState !== "FULL_TIME";
  const REVIEW_FILTER_OPTIONS = useMemo(
    () => buildReviewFilterOptions(isHurlingMode),
    [isHurlingMode],
  );

  // NOTE: useScreenWakeLock is intentionally positioned AFTER isReviewModeActive
  // (line ~5257) so the combined condition covers both live-match and review sessions.
  // See isReviewModeActive declaration below.
  const REVIEW_FILTER_KINDS_FOR_MODE = REVIEW_FILTER_KINDS;
  const OPPOSITION_EVENT_KINDS = useMemo(
    () =>
      new Set<MatchEventKind>([
        "GOAL",
        "POINT",
        "TWO_POINTER",
        "FORTY_FIVE_TWO_POINT",
        "SHOT",
        "WIDE",
      ]),
    [],
  );
  const SCORE_EVENT_KINDS = useMemo(
    () => new Set<MatchEventKind>(mode.scoringEvents),
    [mode],
  );
  const visibleEventButtons = useMemo(
    () =>
      activeTeamSide === "opposition"
        ? EVENT_BUTTONS.filter((item) => OPPOSITION_EVENT_KINDS.has(item.kind))
        : EVENT_BUTTONS,
    [EVENT_BUTTONS, OPPOSITION_EVENT_KINDS, activeTeamSide],
  );
  const visibleEventKindSet = useMemo(
    () => new Set<MatchEventKind>(visibleEventButtons.map((item) => item.kind)),
    [visibleEventButtons],
  );
  const openEventKeyboardMenuOptions = useMemo<readonly EventKeyboardOption[]>(
    () => (openEventKeyboardMenuId ? buildEventKeyboardMenuOptions(openEventKeyboardMenuId) : []),
    [openEventKeyboardMenuId],
  );
  const handleRef = useRef<{
    destroy: () => void;
    setEvents: (events: readonly import("./core/stats/stats-event-model").MatchEvent[]) => void;
    setActiveEventKind: (kind: MatchEventKind) => void;
    undoLastEvent: () => void;
    setShowPlayerInitials: (show: boolean) => void;
    setOnMarkerTap: (handler: ((eventId: string) => void) | null) => void;
    setHeatmapEnabled: (enabled: boolean) => void;
    setZoneOverlayModel: (model: ZoneOverlayModel | null) => void;
    setVisibleEventLimit: (limit: number | null) => void;
    setEventContext: (context: { half: 1 | 2; timestamp: number; canLog: boolean }) => void;
  } | null>(null);
  const appRootStyle = useMemo(
    () =>
      ({
        "--stats-app-height": `${Math.max(0, Math.floor(appViewportHeight))}px`,
      }) as CSSProperties,
    [appViewportHeight],
  );
  const canEditTeamNames = matchState === "PRE_MATCH";
  const isPreMatchSetup = matchState === "PRE_MATCH";
  const playerSquadTeam: TeamSide = activeTeamSide === "opposition" ? "AWAY" : "HOME";
  const activeSquadId = activeSquadIdsByTeam[playerSquadTeam];
  const activeSquad =
    squads.find((squad) => squad.id === activeSquadId) ??
    squads.find((squad) => squad.team === playerSquadTeam) ??
    squads[0] ??
    createDefaultSquad(playerSquadTeam);
  const activeSquadPlayers = activeSquad.players;
  const activePlayerEntry = activePlayer
    ? activeSquadPlayers.find(
        (player) => player.name === activePlayer && player.number === (activePlayerNumber ?? -1),
      ) ??
      activeSquadPlayers.find((player) => player.name === activePlayer) ??
      null
    : null;
  const activePlayers = activeSquadPlayers.filter((player) => player.isActive === true);
  const inactivePlayers = activeSquadPlayers.filter((player) => player.isActive !== true);

  const setActiveSquadById = (nextSquadId: string) => {
    const selected = squads.find((squad) => squad.id === nextSquadId);
    if (selected && selected.team && selected.team !== playerSquadTeam) return;
    setActiveSquadIdsByTeam((prev) => ({ ...prev, [playerSquadTeam]: nextSquadId }));
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
    activePlayerRef.current = null;
    activePlayerNumberRef.current = null;
    activePlayerIdRef.current = null;
    setPlayerDraft("");
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
  };

  const updateActiveSquadPlayers = (
    updater: (prevPlayers: SquadPlayer[]) => SquadPlayer[],
    nextActivePlayerId?: string | null,
  ) => {
    const nextPlayersForActiveSquad = ensureStableSquadSlots(updater([...activeSquad.players]));
    const nextSelectedPlayer =
      nextActivePlayerId === undefined
        ? undefined
        : nextPlayersForActiveSquad.find((player) => player.id === nextActivePlayerId) ?? null;
    setSquads((prevSquads) => prevSquads.map((squad) => (squad.id === activeSquad.id ? { ...squad, players: nextPlayersForActiveSquad } : squad)));
    if (nextActivePlayerId !== undefined) {
      if (nextSelectedPlayer) {
        setActivePlayer(nextSelectedPlayer.name);
        setActivePlayerNumber(nextSelectedPlayer.number);
        setActivePlayerId(nextSelectedPlayer.id);
        activePlayerRef.current = nextSelectedPlayer.name;
        activePlayerNumberRef.current = nextSelectedPlayer.number;
        activePlayerIdRef.current = nextSelectedPlayer.id;
      } else {
        setActivePlayer(null);
        setActivePlayerNumber(null);
        setActivePlayerId(null);
        activePlayerRef.current = null;
        activePlayerNumberRef.current = null;
        activePlayerIdRef.current = null;
      }
    }
  };

  const selectActivePlayerById = (playerId: string | null) => {
    if (!playerId) {
      setActivePlayer(null);
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      activePlayerRef.current = null;
      activePlayerNumberRef.current = null;
      activePlayerIdRef.current = null;
      activePlayerEntryRef.current = null;
      return;
    }
    const player = activeSquadPlayers.find((entry) => entry.id === playerId);
    if (!player) {
      setActivePlayer(null);
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      activePlayerRef.current = null;
      activePlayerNumberRef.current = null;
      activePlayerIdRef.current = null;
      activePlayerEntryRef.current = null;
      return;
    }
    setActivePlayer(player.name);
    setActivePlayerNumber(player.number);
    setActivePlayerId(player.id);
    activePlayerRef.current = player.name;
    activePlayerNumberRef.current = player.number;
    activePlayerIdRef.current = player.id;
    activePlayerEntryRef.current = player;
    activeSquadIdRef.current = activeSquad.id;
  };

  const handlePlayerPick = (player: SquadPlayer) => {
    if (player.isActive !== true) return;
    setActivePlayer(player.name);
    setActivePlayerNumber(player.number);
    setActivePlayerId(player.id);
    activePlayerRef.current = player.name;
    activePlayerNumberRef.current = player.number;
    activePlayerIdRef.current = player.id;
    activePlayerEntryRef.current = player;
    activeSquadIdRef.current = activeSquad.id;
    closeUtilityPanel();
    setIsUtilityOpen(false);
  };
  const confirmSubstitution = () => {
    if (!selectedSubOutId || !selectedSubInId || selectedSubOutId === selectedSubInId) return;
    const incomingPlayerId = selectedSubInId;
    const outgoingPlayer = activeSquadPlayers.find((player) => player.id === selectedSubOutId) ?? null;
    const outgoingActiveSlot =
      outgoingPlayer && typeof outgoingPlayer.activeSlot === "number" ? outgoingPlayer.activeSlot : undefined;
    updateActiveSquadPlayers((prevPlayers) =>
      prevPlayers.map((player) => {
        if (player.id === selectedSubOutId) return { ...player, isActive: false, activeSlot: undefined };
        if (player.id === selectedSubInId) return { ...player, isActive: true, activeSlot: outgoingActiveSlot };
        return player;
      }),
    );
    selectActivePlayerById(incomingPlayerId);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
  };

  const editPlayer = (playerId: string) => {
    const targetPlayer = activeSquadPlayers.find((player) => player.id === playerId);
    if (!targetPlayer) return;
    const nextNameInput = window.prompt("Player name", targetPlayer.name);
    if (nextNameInput == null) return;
    const nextName = nextNameInput.trim();
    if (nextName.length === 0) return;
    const nextNumberInput = window.prompt("Jersey number", String(targetPlayer.number));
    if (nextNumberInput == null) return;
    const parsedNumber = Number.parseInt(nextNumberInput, 10);
    if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) return;
    updateActiveSquadPlayers(
      (prevPlayers) =>
        prevPlayers.map((player) =>
          player.id === playerId
            ? {
                ...player,
                name: nextName.slice(0, 24),
                number: Math.max(1, Math.min(99, Math.floor(parsedNumber))),
              }
            : player,
        ),
      playerId,
    );
  };

  const createSquad = () => {
    const nextName = squadDraft.trim();
    if (nextName.length === 0) return;
    const nextSquad: Squad = {
      id: `squad-${newLocalEventId()}`,
      name: nextName.slice(0, 24),
      team: playerSquadTeam,
      players: [],
    };
    setSquads((prev) => [...prev, nextSquad]);
    setActiveSquadById(nextSquad.id);
    setSquadDraft("");
  };

  const saveActiveSquadName = () => {
    const nextName = squadDraft.trim();
    if (nextName.length === 0) return;
    setSquads((prevSquads) =>
      prevSquads.map((squad) =>
        squad.id === activeSquad.id ? { ...squad, name: nextName.slice(0, 24) } : squad,
      ),
    );
    setSquadDraft("");
  };

  const saveSquadSnapshot = () => {
    const snapshotName = activeSquad.name.trim() || "HOME";
    const snapshot: SavedSquad = {
      id: activeSquad.id,
      name: snapshotName,
      players: activeSquad.players.map((player) => ({
        id: player.id,
        number: player.number,
        name: player.name,
        isActive: player.isActive,
      })),
      updatedAt: Date.now(),
    };
    setSavedSquads((prev) => {
      const withoutCurrent = prev.filter((entry) => entry.id !== snapshot.id);
      return [snapshot, ...withoutCurrent].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  };

  const loadSavedSquadIntoActive = (savedSquad: SavedSquad) => {
    const restoredPlayers: SquadPlayer[] = ensureStableSquadSlots(savedSquad.players.map((player, idx) => ({
      id: player.id,
      number: Math.max(1, Math.min(99, Math.floor(player.number))),
      name: player.name.slice(0, 24),
      role: idx < 15 ? "STARTER" : "SUB",
      isActive: typeof player.isActive === "boolean" ? player.isActive : idx < 15,
    })));
    setSquads((prevSquads) => {
      const nextActiveSquad: Squad = {
        id: savedSquad.id,
        name: savedSquad.name.slice(0, 24) || "HOME",
        team: playerSquadTeam,
        players: restoredPlayers,
      };
      const remaining = prevSquads.filter((entry) => entry.id !== savedSquad.id);
      return [nextActiveSquad, ...remaining];
    });
    setActiveSquadById(savedSquad.id);
  };

  const undoLastEventAction = () => {
    const lastEvent = loggedEvents.at(-1);
    if (!lastEvent) return;
    const isInstantAwayScore = lastEvent.id.includes("-instant-score-");
    if (!isInstantAwayScore) {
      handleRef.current?.undoLastEvent();
    }
    setLoggedEvents((prev) => prev.slice(0, -1));
  };

  const startTeamNameEdit = (team: TeamSide) => {
    if (!canEditTeamNames) return;
    setEditingTeam(team);
    setTeamNameDraft(teamNames[team]);
  };

  const commitTeamNameEdit = () => {
    if (!editingTeam) return;
    const nextName = teamNameDraft.trim();
    if (nextName.length > 0) {
      setTeamNames((prev) => ({ ...prev, [editingTeam]: nextName.slice(0, 15) }));
    }
    setEditingTeam(null);
    setTeamNameDraft("");
  };

  const startVenueEdit = () => {
    if (!canEditTeamNames) return;
    setEditingVenue(true);
    setVenueDraft(venueName);
  };

  const commitVenueEdit = () => {
    setVenueName(venueDraft.trim().slice(0, 24));
    setEditingVenue(false);
    setVenueDraft("");
  };

  const selectEventKind = (kind: MatchEventKind) => {
    eventKindSwitchBaselineEventCountRef.current = loggedEvents.length;
    setSelectedEventKind(kind);
    selectedEventRef.current = kind;
    handleRef.current?.setActiveEventKind(kind);
    setIsPickerOpen(false);
    setUtilityPanel("PLAYERS");
    setIsUtilityOpen(false);
  };

  const selectEventFromKeyboardOption = (option: EventKeyboardOption) => {
    if (!isLoggingActive(matchState)) return;
    if (activeTeamSide === "opposition" && !OPPOSITION_EVENT_KINDS.has(option.kind)) return;
    queuedEventTagRef.current = option.tag ? { kind: option.kind, tag: option.tag } : null;
    setOpenEventKeyboardMenuId(null);
    selectEventKind(option.kind);
  };

  const handleEventButtonPress = (kind: MatchEventKind) => {
    if (!isLoggingActive(matchState)) return;
    if (activeTeamSide === "opposition" && !OPPOSITION_EVENT_KINDS.has(kind)) return;
    queuedEventTagRef.current = null;
    setOpenEventKeyboardMenuId(null);
    selectEventKind(kind);
  };

  const toggleMatchBubble = () => {
    setIsPickerOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsUtilityOpen(false);
        setUtilityPanel((prevPanel) => (prevPanel === "PLAYERS" ? null : prevPanel));
        setOpenEventKeyboardMenuId(null);
      } else {
        setOpenEventKeyboardMenuId(null);
      }
      return next;
    });
  };

  const toggleCommandBubble = () => {
    setIsUtilityOpen((prev) => {
      const next = !prev;
      if (next) setIsPickerOpen(false);
      return next;
    });
  };

  const hasNonDefaultLiveSessionState =
    loggedEvents.length > 0 ||
    matchState !== "PRE_MATCH" ||
    currentHalf !== 1 ||
    matchTimeSeconds > 0 ||
    activeTeamSide !== "own" ||
    teamNames.HOME !== "Team A" ||
    teamNames.AWAY !== "Team B" ||
    venueName.trim().length > 0 ||
    currentMode !== "football";
  const liveSessionSignature = useMemo(
    () =>
      buildLiveSessionSignature({
        currentMode,
        activeTeamSide,
        teamNames,
        venueName,
        events: loggedEvents,
        matchState,
        currentHalf,
        matchTimeSeconds,
        firstHalfAttackingDirection,
        fullTimeResumeState: fullTimeResumeStateRef.current,
      }),
    [
      currentMode,
      activeTeamSide,
      teamNames,
      venueName,
      loggedEvents,
      matchState,
      currentHalf,
      matchTimeSeconds,
      firstHalfAttackingDirection,
    ],
  );
  const hasDirtyLiveSession =
    savedSessionSignatureRef.current == null
      ? hasNonDefaultLiveSessionState
      : liveSessionSignature !== savedSessionSignatureRef.current;
  const shouldPersistLiveRecoveryDraft =
    !isDemoSession &&
    (hasDirtyLiveSession ||
      matchState === "FIRST_HALF" ||
      matchState === "HALF_TIME" ||
      matchState === "SECOND_HALF");

  const createActiveMatchDraftSnapshot = useCallback((): StatsActiveMatchDraft | null => {
    if (!shouldPersistLiveRecoveryDraft) return null;
    const fullTimeResumeSource = fullTimeResumeStateRef.current;
    return {
      version: 1,
      updatedAt: Date.now(),
      matchId: currentMatchIdRef.current,
      currentMode,
      activeTeam: deriveTeamFromTeamSide(activeTeamSide),
      activeTeamSide,
      teamNames: {
        HOME: teamNames.HOME.trim() || "Team A",
        AWAY: teamNames.AWAY.trim() || "Team B",
      },
      venue: venueName.trim().slice(0, 24),
      events: [...loggedEvents],
      restoreContext: {
        matchState,
        currentHalf,
        matchTimeSeconds: Math.max(0, Math.floor(matchTimeSeconds)),
        firstHalfAttackingDirection,
        ...(fullTimeResumeSource &&
        (fullTimeResumeSource.matchState === "FIRST_HALF" || fullTimeResumeSource.matchState === "SECOND_HALF")
          ? {
              fullTimeResumeState: {
                matchState: fullTimeResumeSource.matchState,
                currentHalf: fullTimeResumeSource.currentHalf,
                matchTimeSeconds: Math.max(0, Math.floor(fullTimeResumeSource.matchTimeSeconds)),
              },
            }
          : {}),
      },
    };
  }, [
    activeTeamSide,
    currentHalf,
    currentMode,
    firstHalfAttackingDirection,
    shouldPersistLiveRecoveryDraft,
    loggedEvents,
    matchState,
    matchTimeSeconds,
    teamNames,
    venueName,
  ]);

  useEffect(() => {
    activeTeamRef.current = activeTeam;
  }, [activeTeam]);

  useEffect(() => {
    activeTeamSideRef.current = activeTeamSide;
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
    activePlayerRef.current = null;
    activePlayerNumberRef.current = null;
    activePlayerIdRef.current = null;
    activePlayerEntryRef.current = null;
  }, [activeTeamSide]);

  useEffect(() => {
    if (activeTeamSide !== "opposition") return;
    if (visibleEventButtons.some((item) => item.kind === selectedEventKind)) return;
    const fallbackKind = visibleEventButtons.find((item) => item.kind === "POINT")?.kind ?? visibleEventButtons[0]?.kind;
    if (!fallbackKind) return;
    setSelectedEventKind(fallbackKind);
    selectedEventRef.current = fallbackKind;
    handleRef.current?.setActiveEventKind(fallbackKind);
  }, [activeTeamSide, selectedEventKind, visibleEventButtons]);

  useEffect(() => {
    if (openEventKeyboardMenuId == null) return;
    const menuKind = EVENT_KEYBOARD_MENU_KIND[openEventKeyboardMenuId];
    if (visibleEventKindSet.has(menuKind)) return;
    setOpenEventKeyboardMenuId(null);
  }, [openEventKeyboardMenuId, visibleEventKindSet]);

  useEffect(() => {
    if (isPickerOpen) return;
    setOpenEventKeyboardMenuId(null);
  }, [isPickerOpen]);

  useEffect(() => {
    queuedEventTagRef.current = null;
  }, [currentMatchId]);

  useEffect(() => {
    activePlayerRef.current = activePlayer;
  }, [activePlayer]);

  useEffect(() => {
    activePlayerNumberRef.current = activePlayerNumber;
  }, [activePlayerNumber]);

  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);

  useEffect(() => {
    reviewHalfRef.current = reviewHalf;
  }, [reviewHalf]);

  useEffect(() => {
    reviewSegmentRef.current = reviewSegment;
  }, [reviewSegment]);

  useEffect(() => {
    reviewTeamContextRef.current = reviewTeamContext;
  }, [reviewTeamContext]);

  useEffect(() => {
    reviewEventFilterRef.current = reviewEventFilter;
  }, [reviewEventFilter]);

  useEffect(() => {
    reviewActivePlayerOnlyRef.current = reviewActivePlayerOnly;
  }, [reviewActivePlayerOnly]);

  useEffect(() => {
    reviewZoneRef.current = reviewZone;
  }, [reviewZone]);

  useEffect(() => {
    firstHalfAttackingDirectionRef.current = firstHalfAttackingDirection;
  }, [firstHalfAttackingDirection]);

  useEffect(() => {
    const baseline = eventKindSwitchBaselineEventCountRef.current;
    if (baseline == null) return;
    if (import.meta.env.DEV) {
      console.assert(
        loggedEvents.length >= baseline,
        "[stats-events] Switching event type must not reduce total event count",
        {
          baselineCount: baseline,
          currentCount: loggedEvents.length,
          selectedEventKind,
        },
      );
    }
    eventKindSwitchBaselineEventCountRef.current = null;
  }, [loggedEvents.length, selectedEventKind]);

  useEffect(() => {
    // Use strict null check: an empty string ("") is a valid name for a squad slot
    // that has no name entered yet. Using !activePlayer would treat "" as "no player
    // selected" and incorrectly clear all attribution refs, breaking player tagging
    // for every default (unnamed) squad slot.
    if (activePlayer === null) {
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      activePlayerRef.current = null;
      activePlayerNumberRef.current = null;
      activePlayerIdRef.current = null;
      activePlayerEntryRef.current = null;
      return;
    }
    const matchedPlayer =
      activeSquadPlayers.find(
        (player) => player.name === activePlayer && player.number === (activePlayerNumber ?? -1),
      ) ?? activeSquadPlayers.find((player) => player.name === activePlayer);
    if (!matchedPlayer) {
      setActivePlayer(null);
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      activePlayerRef.current = null;
      activePlayerNumberRef.current = null;
      activePlayerIdRef.current = null;
      activePlayerEntryRef.current = null;
      return;
    }
    if (matchedPlayer.number !== activePlayerNumber) {
      setActivePlayerNumber(matchedPlayer.number);
    }
    if (matchedPlayer.id !== activePlayerIdRef.current) {
      setActivePlayerId(matchedPlayer.id);
    }
    activePlayerRef.current = matchedPlayer.name;
    activePlayerNumberRef.current = matchedPlayer.number;
    activePlayerIdRef.current = matchedPlayer.id;
    activePlayerEntryRef.current = matchedPlayer;
  }, [activePlayer, activeSquadPlayers]);

  useEffect(() => {
    activePlayerEntryRef.current = activePlayerEntry;
  }, [activePlayerEntry]);

  useEffect(() => {
    activeSquadIdRef.current = activeSquadId;
  }, [activeSquadId]);

  useEffect(() => {
    currentMatchIdRef.current = currentMatchId;
  }, [currentMatchId]);

  useEffect(() => {
    const { draft, isCorrupt } = parseStoredActiveMatchDraft(safeReadLocalStorage(ACTIVE_MATCH_DRAFT_STORAGE_KEY));
    if (draft) {
      setPendingRecoveredDraft(draft);
    } else if (isCorrupt) {
      setSaveFeedback("Recovered match draft was invalid.");
      clearActiveMatchDraft();
    }
    setIsDraftRecoveryCheckComplete(true);
  }, []);

  useEffect(() => {
    const ensured = ensureHomeAwaySquads(squads);
    if (ensured.squads.length !== squads.length) {
      setSquads(ensured.squads);
    }
    setActiveSquadIdsByTeam((prev) => ({
      HOME: ensured.squads.some((s) => s.id === prev.HOME) ? prev.HOME : ensured.byTeam.HOME,
      AWAY: ensured.squads.some((s) => s.id === prev.AWAY) ? prev.AWAY : ensured.byTeam.AWAY,
    }));
  }, [squads]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeWriteLocalStorage(SQUADS_STORAGE_KEY, JSON.stringify(squads));
  }, [squads]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeWriteLocalStorage(SAVED_SQUADS_STORAGE_KEY, JSON.stringify(savedSquads));
  }, [savedSquads]);

  useEffect(() => {
    if (savedSquads.length === 0) return;
    if (squads.length > 1 || (squads[0]?.players.length ?? 0) > 0) return;
    loadSavedSquadIntoActive(savedSquads[0]);
    // Only auto-load once from the newest saved squad on empty state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSquads.length]);

  useEffect(() => {
    if (!saveFeedback) return;
    const timerId = window.setTimeout(() => {
      setSaveFeedback(null);
    }, 2000);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [saveFeedback]);

  useEffect(() => {
    if (!isDraftRecoveryCheckComplete) return;
    if (pendingRecoveredDraft) return;
    if (isDemoSession) return; // DEMO: never auto-persist demo data as a recovery draft
    const draft = createActiveMatchDraftSnapshot();
    if (!draft) {
      clearActiveMatchDraft();
      return;
    }
    persistActiveMatchDraft(draft);
  }, [createActiveMatchDraftSnapshot, isDraftRecoveryCheckComplete, pendingRecoveredDraft, isDemoSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDemoSession) return; // DEMO: no "save before leaving" prompt for demo sessions
    const hasLiveMatchState = loggedEvents.length > 0 || matchState !== "PRE_MATCH";
    if (!hasLiveMatchState) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const draft = createActiveMatchDraftSnapshot();
      if (draft) {
        persistActiveMatchDraft(draft);
      }
      event.preventDefault();
      event.returnValue = "Save match before leaving or refreshing.";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [createActiveMatchDraftSnapshot, loggedEvents.length, matchState, isDemoSession]);

  useEffect(() => {
    if (canEditTeamNames) return;
    setEditingTeam(null);
    setTeamNameDraft("");
    setEditingVenue(false);
    setVenueDraft("");
  }, [canEditTeamNames]);

  useEffect(() => {
    if (!editingTeam) return;
    const target = editingTeam === "HOME" ? homeNameInputRef.current : awayNameInputRef.current;
    target?.focus();
    target?.select();
  }, [editingTeam]);

  useEffect(() => {
    if (!editingVenue) return;
    venueInputRef.current?.focus();
    venueInputRef.current?.select();
  }, [editingVenue]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    setIsPitchReady(false);
    let pitchReadyRafA: number | null = null;
    let pitchReadyRafB: number | null = null;
    let handle: {
      destroy: () => void;
      setEvents: (events: readonly import("./core/stats/stats-event-model").MatchEvent[]) => void;
      setActiveEventKind: (kind: MatchEventKind) => void;
      undoLastEvent: () => void;
      setShowPlayerInitials: (show: boolean) => void;
      setOnMarkerTap: (handler: ((eventId: string) => void) | null) => void;
      setZoneOverlayModel: (model: ZoneOverlayModel | null) => void;
      setVisibleEventLimit: (limit: number | null) => void;
      setEventContext: (context: { half: 1 | 2; timestamp: number; canLog: boolean }) => void;
    } | null = null;
    void createPixiPitchSurface(host, {
      sport: mode.pitchSport,
      activeEventKind: selectedEventRef.current,
      showPlayerInitials,
      onEventLogged: (event) => {
        const teamSide = activeTeamSideRef.current;
        const team = deriveTeamFromTeamSide(teamSide);
        const matchClockSeconds = deriveMatchTimeSecondsFromTimestamp(event.matchClockSeconds ?? event.timestamp);
        const period = periodFromHalf(event.half);
        const segment = deriveSegmentFromPeriodClock(period, matchClockSeconds);
        const eventKind = event.type ?? event.kind;
        const queuedTag =
          queuedEventTagRef.current && queuedEventTagRef.current.kind === eventKind
            ? queuedEventTagRef.current.tag
            : null;
        const rawEventTags =
          queuedTag == null
            ? event.tags
            : [...(Array.isArray(event.tags) ? event.tags : []), queuedTag];
        const eventTags = parseEventTags(rawEventTags);
        if (queuedTag != null) {
          queuedEventTagRef.current = null;
        }
        const nextEvent: LoggedMatchEvent = {
          ...event,
          id: `team-${team.toLowerCase()}-${event.id}`,
          kind: eventKind,
          type: eventKind,
          x: typeof event.x === "number" && Number.isFinite(event.x) ? event.x : event.nx,
          y: typeof event.y === "number" && Number.isFinite(event.y) ? event.y : event.ny,
          nx: typeof event.x === "number" && Number.isFinite(event.x) ? event.x : event.nx,
          ny: typeof event.y === "number" && Number.isFinite(event.y) ? event.y : event.ny,
          team,
          teamSide: teamSide === "opposition" ? "OPP" : "FOR",
          period,
          segment,
          halfSegment: deriveLegacyHalfSegment(segment),
          timestamp: matchClockSeconds,
          matchClockSeconds,
          matchTimeSeconds: matchClockSeconds,
          createdAt:
            typeof event.createdAt === "number" && Number.isFinite(event.createdAt)
              ? Math.floor(event.createdAt)
              : Date.now(),
          ...(eventTags ? { tags: eventTags } : {}),
        };
        const activePlayerEntry = activePlayerEntryRef.current;
        const selectedPlayerId = activePlayerIdRef.current ?? activePlayerEntry?.id ?? null;
        nextEvent.playerId = selectedPlayerId;
        if (SCORE_EVENT_KINDS.has(event.kind) && pendingScorerRef.current) {
          nextEvent.playerName = pendingScorerRef.current.name;
          nextEvent.playerNumber = pendingScorerRef.current.number;
          nextEvent.squadId = pendingScorerRef.current.squadId;
          pendingScorerRef.current = null;
        } else if (activePlayerEntry) {
          nextEvent.playerName = activePlayerEntry.name;
          nextEvent.playerNumber = activePlayerEntry.number;
          nextEvent.squadId = activeSquadIdRef.current;
        } else if (activePlayerIdRef.current != null) {
          nextEvent.playerName = activePlayerRef.current || undefined;
          nextEvent.playerNumber = activePlayerNumberRef.current ?? undefined;
          nextEvent.squadId = activeSquadIdRef.current;
        } else {
          pendingScorerRef.current = null;
        }
        setLoggedEvents((prev) => {
          const next = [...prev, nextEvent];
          if (import.meta.env.DEV) {
            console.assert(
              next.length === prev.length + 1,
              "[stats-events] Logged pitch event should append exactly one event",
              {
                previousCount: prev.length,
                nextCount: next.length,
                kind: nextEvent.kind,
                half: nextEvent.half,
              },
            );
          }
          return next;
        });
        selectActivePlayerById(null);
        if (
          KICKOUT_EVENT_KIND_SET.has(nextEvent.kind) ||
          TURNOVER_EVENT_KIND_SET.has(nextEvent.kind) ||
          SHOT_EVENT_KIND_SET.has(nextEvent.kind)
        ) {
          const pendingKind = nextEvent.kind as PendingFollowupKind;
          const alreadyTagged = getRemovableFollowupTags(pendingKind).some((tag) =>
            (nextEvent.tags ?? []).includes(tag),
          );
          if (alreadyTagged) return;
          setPendingFollowup({
            eventId: nextEvent.id,
            kind: pendingKind,
          });
        }
      },
    }).then((nextHandle) => {
      if (disposed) {
        nextHandle.destroy();
        return;
      }
      handle = nextHandle;
      handleRef.current = nextHandle;
      nextHandle.setEventContext({
        half: matchEngineStateRef.current.currentHalf,
        timestamp: matchEngineStateRef.current.matchTimeSeconds,
        canLog:
          isLoggingActive(matchEngineStateRef.current.matchState) &&
          activeTeamRef.current === "HOME",
      });
      pitchReadyRafA = window.requestAnimationFrame(() => {
        pitchReadyRafB = window.requestAnimationFrame(() => {
          if (disposed) return;
          setIsPitchReady(true);
        });
      });
    });
    return () => {
      disposed = true;
      if (pitchReadyRafA != null) window.cancelAnimationFrame(pitchReadyRafA);
      if (pitchReadyRafB != null) window.cancelAnimationFrame(pitchReadyRafB);
      setIsPitchReady(false);
      handleRef.current = null;
      handle?.destroy();
    };
  }, [mode.pitchSport]);

  useEffect(() => {
    const syncRealtimeClock = () => {
      const current = matchEngineStateRef.current;
      const next = tickMatchClock(current, Date.now());
      if (next !== current) {
        matchEngineStateRef.current = next;
        setMatchTimeSeconds(next.matchTimeSeconds);
      }
    };
    const timerId = window.setInterval(syncRealtimeClock, 250);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      syncRealtimeClock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const previousViewportContent = viewportMeta?.getAttribute("content") ?? null;
    const nextViewportContent =
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
    if (viewportMeta) {
      viewportMeta.setAttribute("content", nextViewportContent);
    }

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };
    const preventCtrlWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart", preventGestureZoom as EventListener, { passive: false });
    document.addEventListener("gesturechange", preventGestureZoom as EventListener, { passive: false });
    document.addEventListener("gestureend", preventGestureZoom as EventListener, { passive: false });
    document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });
    window.addEventListener("wheel", preventCtrlWheelZoom, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGestureZoom as EventListener);
      document.removeEventListener("gesturechange", preventGestureZoom as EventListener);
      document.removeEventListener("gestureend", preventGestureZoom as EventListener);
      document.removeEventListener("touchmove", preventMultiTouchZoom);
      window.removeEventListener("wheel", preventCtrlWheelZoom);
      if (viewportMeta) {
        if (previousViewportContent == null) {
          viewportMeta.removeAttribute("content");
        } else {
          viewportMeta.setAttribute("content", previousViewportContent);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafA: number | null = null;
    let rafB: number | null = null;
    let settleTimerId: number | null = null;

    const clearScheduled = () => {
      if (rafA != null) {
        window.cancelAnimationFrame(rafA);
        rafA = null;
      }
      if (rafB != null) {
        window.cancelAnimationFrame(rafB);
        rafB = null;
      }
      if (settleTimerId != null) {
        window.clearTimeout(settleTimerId);
        settleTimerId = null;
      }
    };

    const applyViewportHeight = () => {
      const nextHeight = getMobileViewportHeight();
      setAppViewportHeight((prevHeight) =>
        Math.abs(prevHeight - nextHeight) < 1 ? prevHeight : nextHeight,
      );
    };

    const scheduleViewportRecovery = (notifyResize: boolean) => {
      clearScheduled();
      applyViewportHeight();
      rafA = window.requestAnimationFrame(() => {
        applyViewportHeight();
        rafB = window.requestAnimationFrame(() => {
          applyViewportHeight();
          if (notifyResize) {
            window.dispatchEvent(new Event("resize"));
          }
        });
      });
      settleTimerId = window.setTimeout(() => {
        applyViewportHeight();
        if (notifyResize) {
          window.dispatchEvent(new Event("resize"));
        }
      }, 180);
    };

    const handleWindowResize = () => scheduleViewportRecovery(false);
    const handleOrientationChange = () => scheduleViewportRecovery(true);
    const handleResume = () => scheduleViewportRecovery(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      scheduleViewportRecovery(true);
    };

    scheduleViewportRecovery(false);
    const viewport = window.visualViewport;
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    viewport?.addEventListener("resize", handleWindowResize);
    viewport?.addEventListener("scroll", handleWindowResize);

    return () => {
      clearScheduled();
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("pageshow", handleResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      viewport?.removeEventListener("resize", handleWindowResize);
      viewport?.removeEventListener("scroll", handleWindowResize);
    };
  }, []);

  const startFirstHalfAction = () => {
    const next = startFirstHalf(matchEngineStateRef.current, Date.now());
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
  };

  const goToHalfTimeAction = () => {
    const next = goToHalfTime(matchEngineStateRef.current, Date.now());
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
  };

  const startSecondHalfAction = () => {
    secondHalfSwitchBaselineEventCountRef.current = loggedEvents.length;
    reviewHalfRef.current = "H2";
    reviewSegmentRef.current = "ALL";
    reviewTeamContextRef.current = "ALL";
    reviewEventFilterRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    reviewActivePlayerOnlyRef.current = false;
    setReviewHalf("H2");
    setReviewSegment("ALL");
    setReviewTeamContext("ALL");
    setReviewEventFilter("ALL");
    setReviewActivePlayerOnly(false);
    setReviewZone("FULL");
    setShowReviewStrip(false);
    setUtilityPanel(null);
    const next = startSecondHalf(matchEngineStateRef.current, Date.now());
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
    // Eagerly sync the pitch surface so 2H taps register immediately,
    // independent of when the React effect for setEventContext runs.
    handleRef.current?.setEventContext({
      half: next.currentHalf,
      timestamp: next.matchTimeSeconds,
      canLog: isLoggingActive(next.matchState) && activeTeamRef.current === "HOME",
    });
  };

  const endMatchAction = () => {
    const current = matchEngineStateRef.current;
    fullTimeResumeStateRef.current = isLoggingActive(current.matchState) ? current : null;
    const next = endMatch(current, Date.now());
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
    setIsCountsOverlayOpen(false);
    setIsFullTimeActionsOpen(true);
    setIsResetConfirmOpen(false);
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const toggleCountsOverlay = () => {
    if (matchState === "FULL_TIME") return;
    setIsCountsOverlayOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsFullTimeActionsOpen(false);
        setIsResetConfirmOpen(false);
        setIsUtilityOpen(false);
        setIsPickerOpen(false);
      }
      return next;
    });
  };

  const toggleFullTimeActionsPanel = () => {
    setIsFullTimeActionsOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsCountsOverlayOpen(false);
        setIsResetConfirmOpen(false);
      }
      return next;
    });
  };

  const resumeMatchFromFullTime = () => {
    if (matchState !== "FULL_TIME") return;
    const resumeState = fullTimeResumeStateRef.current;
    if (!resumeState) return;
    const resumedMatchState: MatchState =
      resumeState.matchState === "FIRST_HALF" || resumeState.matchState === "SECOND_HALF"
        ? resumeState.matchState
        : "SECOND_HALF";
    const frozenSeconds = Math.max(0, Math.floor(matchEngineStateRef.current.matchTimeSeconds));
    const resumed: MatchEngineState = {
      matchState: resumedMatchState,
      currentHalf: resumeState.currentHalf,
      matchTimeSeconds: frozenSeconds,
      isRunning: true,
      phaseStartTimeMs: Date.now(),
      accumulatedElapsedSeconds: frozenSeconds,
    };
    matchEngineStateRef.current = resumed;
    setMatchState(resumed.matchState);
    setCurrentHalf(resumed.currentHalf);
    setMatchTimeSeconds(resumed.matchTimeSeconds);
    setIsFullTimeActionsOpen(false);
    setIsResetConfirmOpen(false);
    handleRef.current?.setEventContext({
      half: resumed.currentHalf,
      timestamp: resumed.matchTimeSeconds,
      canLog: isLoggingActive(resumed.matchState) && activeTeamRef.current === "HOME",
    });
  };

  const openPlayersPanel = () => {
    setUtilityPanel("PLAYERS");
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const openReviewPanel = () => {
    setShowReviewStrip(true);
    setIsReviewStripCollapsed(false);
    setUtilityPanel(null);
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const openMatchSummaryPanel = () => {
    setShowReviewStrip(false);
    setUtilityPanel("SUMMARY");
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const openSavedMatchesPanel = () => {
    setShowReviewStrip(false);
    setSavedMatches(readSavedMatchesFromStorage().matches);
    setUtilityPanel("SAVED_MATCHES");
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
    setSaveLoadBlockedReason(null);
  };

  const saveReviewSession = () => {
    try {
      const reviewSession = createReviewSession({
        matchInfo: {
          homeTeam: teamNames.HOME.trim() || "Team A",
          awayTeam: teamNames.AWAY.trim() || "Team B",
          venue: venueName.trim() || undefined,
        },
        events: loggedEvents,
        reviewContext: {
          period: reviewHalf,
          segment: reviewSegment,
          teamSide: reviewTeamContext,
          category: reviewEventFilter,
          activePlayerId: activePlayerId ?? null,
          activePlayerOnly: reviewActivePlayerOnly,
          zone: reviewZone,
        },
      });
      const json = serializeReviewSession(reviewSession);
      // Also persist to localStorage for session continuity
      safeWriteLocalStorage(REVIEW_SESSION_STORAGE_KEY, json);
      // Download as .json file
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const home = (teamNames.HOME.trim() || "TeamA").replace(/\s+/g, "_");
      const away = (teamNames.AWAY.trim() || "TeamB").replace(/\s+/g, "_");
      link.href = url;
      link.download = `${home}_v_${away}_review.json`;
      link.click();
      URL.revokeObjectURL(url);
      setSaveFeedback("Review exported");
      setSaveLoadBlockedReason(null);
    } catch {
      setSaveFeedback("Review export failed");
    }
  };

  /** Restores review state from a raw JSON string (used by both localStorage
   *  fallback and the file-picker import path). */
  const applyRawReviewSession = (rawSession: string) => {
    let restoredSession: ReturnType<typeof restoreReviewSession> | null = null;
    try {
      const parsedReviewSession = parseReviewSession(rawSession);
      if (!parsedReviewSession) {
        setSaveFeedback("Review file is invalid");
        return;
      }
      restoredSession = restoreReviewSession(parsedReviewSession);
    } catch {
      setSaveFeedback("Review file is invalid");
      return;
    }

    const restoredEvents = restoredSession.events
      .map((event) => parseStoredLoggedMatchEvent(event))
      .filter((event): event is LoggedMatchEvent => event != null);
    if (restoredEvents.length !== restoredSession.events.length) {
      setSaveFeedback("Review session could not be restored");
      return;
    }

    const restoredActivePlayerId = restoredSession.reviewContext.activePlayerId ?? null;
    const restoredActivePlayerOnly = restoredSession.reviewContext.activePlayerOnly ?? (restoredActivePlayerId != null);
    const restoredReviewZone = restoredSession.reviewContext.zone ?? "FULL";
    reviewHalfRef.current = restoredSession.reviewContext.period;
    reviewSegmentRef.current = restoredSession.reviewContext.segment;
    reviewTeamContextRef.current = restoredSession.reviewContext.teamSide;
    reviewEventFilterRef.current = restoredSession.reviewContext.category;
    reviewActivePlayerOnlyRef.current = restoredActivePlayerOnly;
    reviewZoneRef.current = restoredReviewZone;
    activePlayerIdRef.current = restoredActivePlayerId;

    setTeamNames({
      HOME: restoredSession.matchInfo.homeTeam,
      AWAY: restoredSession.matchInfo.awayTeam,
    });
    setVenueName(restoredSession.matchInfo.venue ?? "");
    setLoggedEvents(restoredEvents);
    setPendingFollowup(null);
    setReviewHalf(restoredSession.reviewContext.period);
    setReviewSegment(restoredSession.reviewContext.segment);
    setReviewTeamContext(restoredSession.reviewContext.teamSide);
    setReviewEventFilter(restoredSession.reviewContext.category);
    setActivePlayerId(restoredActivePlayerId);
    setReviewActivePlayerOnly(restoredActivePlayerOnly);
    setReviewZone(restoredReviewZone);
    setSelectedReviewEventId(null);
    setShowReviewStrip(true);
    setIsReviewStripCollapsed(false);
    setUtilityPanel(null);
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
    setIsCountsOverlayOpen(false);
    setIsFullTimeActionsOpen(false);
    setIsResetConfirmOpen(false);
    setSaveLoadBlockedReason(null);
    setLoadedMatchLabel(`${restoredSession.matchInfo.homeTeam} v ${restoredSession.matchInfo.awayTeam} (Review Session)`);
    setSaveFeedback("Review imported");
  };

  /** Opens a file picker to import a .json Review export. */
  const openLastReviewSession = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const raw = evt.target?.result;
        if (typeof raw !== "string") {
          setSaveFeedback("Import failed: could not read file");
          return;
        }
        applyRawReviewSession(raw);
      };
      reader.onerror = () => setSaveFeedback("Import failed: file read error");
      reader.readAsText(file);
    };
    input.click();
  };

  /**
   * Loads deterministic demo match events into live state (Ballylanders [DEMO] 1-17
   * v Galty Gaels 1-12) and transitions to FULL_TIME so the existing Review/PDF
   * flow works exactly as it would for a real completed match.
   *
   * Only reachable when URL contains ?demo=1. Demo data is never persisted to
   * localStorage (guarded by isDemoSession and shouldPersistLiveRecoveryDraft).
   */
  const loadDemoMatch = useCallback(() => {
    // Cast is safe: DemoMatchEvent satisfies all required fields of LoggedMatchEvent.
    const demoEvents = generateDemoMatchEvents() as unknown as readonly LoggedMatchEvent[];
    setTeamNames({ HOME: "Ballylanders [DEMO]", AWAY: "Galty Gaels" });
    setVenueName("An Cnoc");
    setLoggedEvents(demoEvents);
    setIsDemoSession(true);
    // Simulate a completed match at full time
    setMatchState("FULL_TIME");
    setCurrentHalf(2);
    setMatchTimeSeconds(1800);
    matchEngineStateRef.current = {
      matchState: "FULL_TIME",
      currentHalf: 2,
      matchTimeSeconds: 1800,
      isRunning: false,
      phaseStartTimeMs: null,
      accumulatedElapsedSeconds: 1800,
    };
    handleRef.current?.setEventContext({ half: 2, timestamp: 1800, canLog: false });
    // Open the full-time actions panel so Export PDF / Review are immediately accessible
    setIsFullTimeActionsOpen(true);
    setIsCountsOverlayOpen(false);
    setIsResetConfirmOpen(false);
    setIsPickerOpen(false);
    setIsUtilityOpen(false);
  }, []);

  /** Exports the current match as a 22-page PDF Visual Review report. */
  const handleExportPdf = () => {
    if (isPdfExporting) return;
    if (loggedEvents.length === 0) {
      setSaveFeedback("No events to export");
      return;
    }
    setIsPdfExporting(true);
    void exportReviewPdf({
      events: loggedEvents,
      homeTeamName: teamNames.HOME.trim() || "Team A",
      awayTeamName: teamNames.AWAY.trim() || "Team B",
      venueName: venueName.trim() || undefined,
      sport: mode.pitchSport,
    })
      .then(() => {
        setSaveFeedback("PDF exported");
      })
      .catch(() => {
        setSaveFeedback("PDF export failed");
      })
      .finally(() => {
        setIsPdfExporting(false);
      });
  };

  const openNotesPanel = () => {
    setShowReviewStrip(false);
    setUtilityPanel("NOTES");
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const saveCurrentMatchSnapshot = () => {
    if (isDemoSession) {
      setSaveFeedback("Demo session — not saved");
      return;
    }
    if (loggedEvents.length === 0) {
      setSaveFeedback("No events to save");
      return;
    }
    try {
      const snapshotEvents = [...loggedEvents];
      const snapshotHomeScore = computeTeamScore(snapshotEvents, "HOME");
      const snapshotAwayScore = computeTeamScore(snapshotEvents, "AWAY");
      const homeTeamName = teamNames.HOME.trim() || "Team A";
      const awayTeamName = teamNames.AWAY.trim() || "Opponent";
      const venue = venueName.trim() || "Unknown venue";
      const savedRecord: SavedMatch = {
        id: `saved-match-${newLocalEventId()}`,
        createdAt: Date.now(),
        label: `${homeTeamName} v ${awayTeamName}`,
        homeTeamName,
        awayTeamName,
        venue,
        events: snapshotEvents,
        eventCount: snapshotEvents.length,
        scorelineSnapshot: `${homeTeamName} ${formatGaelicScore(snapshotHomeScore)} (${snapshotHomeScore.total}) v ${awayTeamName} ${formatGaelicScore(snapshotAwayScore)} (${snapshotAwayScore.total})`,
        restoreContext: {
          matchState,
          currentHalf,
          matchTimeSeconds: Math.max(0, Math.floor(matchTimeSeconds)),
          firstHalfAttackingDirection,
          ...(fullTimeResumeStateRef.current &&
          (fullTimeResumeStateRef.current.matchState === "FIRST_HALF" ||
            fullTimeResumeStateRef.current.matchState === "SECOND_HALF")
            ? {
                fullTimeResumeState: {
                  matchState: fullTimeResumeStateRef.current.matchState,
                  currentHalf: fullTimeResumeStateRef.current.currentHalf,
                  matchTimeSeconds: Math.max(0, Math.floor(fullTimeResumeStateRef.current.matchTimeSeconds)),
                },
              }
            : {}),
        },
      };
      const savedMatchesResult = readSavedMatchesFromStorage();
      if (savedMatchesResult.isCorrupt) {
        console.warn("[stats-storage] Saved matches storage is corrupt; refusing to overwrite.", {
          key: SAVED_MATCHES_STORAGE_KEY,
        });
        setSaveFeedback("Save blocked — saved matches storage is corrupted.");
        return;
      }
      const nextSavedMatches = sanitizeSavedMatches([savedRecord, ...savedMatchesResult.matches]);
      const didPersist = persistSavedMatches(nextSavedMatches);
      if (!didPersist) {
        setSaveFeedback("Save failed — storage unavailable. Do not close this match yet.");
        return;
      }
      savedSessionSignatureRef.current = liveSessionSignature;
      clearActiveMatchDraft();
      setPendingRecoveredDraft(null);
      setSavedMatches(nextSavedMatches);
      setSaveFeedback("Saved");
      setLastSavedAtMillis(savedRecord.createdAt);
      setSaveLoadBlockedReason(null);
    } catch {
      setSaveFeedback("Save failed — storage unavailable. Do not close this match yet.");
    }
  };

  const shareOrExportMatch = async () => {
    const homeTeamName = safeShareLabel(teamNames.HOME, "Team A");
    const awayTeamName = safeShareLabel(teamNames.AWAY, "Team B");
    const fallbackText = buildMatchShareSummaryText({
      homeTeamName,
      awayTeamName,
      venueLabel: venueName,
      stateLabel: matchState === "FULL_TIME" ? "Full Time" : matchStateToken,
      clockLabel: formatMatchClock(matchTimeSeconds),
      homeScore,
      awayScore,
      eventCount: loggedEvents.length,
      liveCounts,
    });
    const cardFile = await buildStatsShareCardPng({
      stageLabel: matchState === "FULL_TIME" ? "Full Time" : "Half Time",
      homeTeamName,
      awayTeamName,
      venueLabel: safeShareLabel(venueName, "Unknown venue"),
      clockLabel: formatMatchClock(matchTimeSeconds),
      homeScore,
      awayScore,
      eventCount: loggedEvents.length,
      events: loggedEvents,
    });
    if (!cardFile) {
      setSaveFeedback("Share failed — could not generate summary image.");
      return;
    }
    const shareData: ShareData & { files?: File[] } = { title: `${homeTeamName} v ${awayTeamName}`, text: fallbackText, files: [cardFile] };
    const navWithShare = navigator as Navigator & { share?: (data: ShareData & { files?: File[] }) => Promise<void>; canShare?: (data: ShareData & { files?: File[] }) => boolean; };
    if (typeof navWithShare.share === "function") {
      const canShare = typeof navWithShare.canShare === "function" ? navWithShare.canShare(shareData) : true;
      if (canShare) {
        try { await navWithShare.share(shareData); setSaveFeedback("Summary image shared"); return; } catch {}
      }
    }
    const url = URL.createObjectURL(cardFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = cardFile.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSaveFeedback("Summary image downloaded");
  };

  const loadSavedMatchRecord = (record: SavedMatch) => {
    const parsedRecord = parseStoredSavedMatch(record);
    if (!parsedRecord || parsedRecord.events.length === 0) {
      setSaveLoadBlockedReason("Load blocked: saved match is invalid.");
      return;
    }
    if (hasDirtyLiveSession) {
      const confirmed = window.confirm("Load this saved match and replace current unsaved live session?");
      if (!confirmed) return;
    }
    const loadedMatchId =
      parsedRecord.id.trim().length > 0 ? parsedRecord.id : newMatchSessionId("loaded");
    setCurrentMatchId(loadedMatchId);
    currentMatchIdRef.current = loadedMatchId;
    setLoggedEvents(parsedRecord.events);
    setPendingFollowup(null);
    setTeamNames({
      HOME: parsedRecord.homeTeamName,
      AWAY: parsedRecord.awayTeamName,
    });
    setVenueName(parsedRecord.venue);
    const restoredContext = resolveSavedMatchRestoreContext(parsedRecord);
    setFirstHalfAttackingDirection(restoredContext.firstHalfAttackingDirection);
    matchEngineStateRef.current = restoredContext.engineState;
    fullTimeResumeStateRef.current = restoredContext.fullTimeResumeState;
    setMatchState(restoredContext.engineState.matchState);
    setCurrentHalf(restoredContext.engineState.currentHalf);
    setMatchTimeSeconds(restoredContext.engineState.matchTimeSeconds);
    setIsCountsOverlayOpen(false);
    setIsResetConfirmOpen(false);
    setIsPickerOpen(false);
    setIsUtilityOpen(false);
    setIsFullTimeActionsOpen(restoredContext.engineState.matchState === "FULL_TIME");
    handleRef.current?.setEventContext({
      half: restoredContext.engineState.currentHalf,
      timestamp: restoredContext.engineState.matchTimeSeconds,
      canLog: isLoggingActive(restoredContext.engineState.matchState) && activeTeamRef.current === "HOME",
    });
    setSaveLoadBlockedReason(null);
    setLoadedMatchLabel(parsedRecord.label);
    setUtilityPanel(null);
    savedSessionSignatureRef.current = buildLiveSessionSignature({
      currentMode,
      activeTeamSide: activeTeamSideRef.current,
      teamNames: {
        HOME: parsedRecord.homeTeamName,
        AWAY: parsedRecord.awayTeamName,
      },
      venueName: parsedRecord.venue,
      events: parsedRecord.events,
      matchState: restoredContext.engineState.matchState,
      currentHalf: restoredContext.engineState.currentHalf,
      matchTimeSeconds: restoredContext.engineState.matchTimeSeconds,
      firstHalfAttackingDirection: restoredContext.firstHalfAttackingDirection,
      fullTimeResumeState: restoredContext.fullTimeResumeState,
    });
  };

  const resumeRecoveredMatchDraft = () => {
    const draft = pendingRecoveredDraft;
    if (!draft) return;
    const draftMatchId = draft.matchId.trim().length > 0 ? draft.matchId : newMatchSessionId("live");
    setCurrentMode(draft.currentMode);
    const recoveredTeamSide = draft.activeTeamSide ?? deriveTeamSideFromTeam(draft.activeTeam);
    setActiveTeam("HOME");
    activeTeamRef.current = "HOME";
    setActiveTeamSide(recoveredTeamSide);
    activeTeamSideRef.current = recoveredTeamSide;
    setCurrentMatchId(draftMatchId);
    currentMatchIdRef.current = draftMatchId;
    setLoggedEvents(draft.events);
    setPendingFollowup(null);
    setTeamNames({
      HOME: draft.teamNames.HOME,
      AWAY: draft.teamNames.AWAY,
    });
    setVenueName(draft.venue);
    const restoredContext = resolveSavedMatchRestoreContext({
      id: draftMatchId,
      createdAt: draft.updatedAt,
      label: "Recovered unsaved match",
      homeTeamName: draft.teamNames.HOME,
      awayTeamName: draft.teamNames.AWAY,
      venue: draft.venue || "Unknown venue",
      events: draft.events,
      eventCount: draft.events.length,
      scorelineSnapshot: "Recovered unsaved match",
      restoreContext: draft.restoreContext,
    });
    if (restoredContext.engineState.matchState === "SECOND_HALF" && restoredContext.engineState.currentHalf === 2) {
      // Mirror the same live visibility state used when 2H starts.
      reviewHalfRef.current = "H2";
      reviewSegmentRef.current = "ALL";
      reviewTeamContextRef.current = "ALL";
      reviewEventFilterRef.current = "ALL";
      reviewZoneRef.current = "FULL";
      reviewActivePlayerOnlyRef.current = false;
      setReviewHalf("H2");
      setReviewSegment("ALL");
      setReviewTeamContext("ALL");
      setReviewEventFilter("ALL");
      setReviewZone("FULL");
      setReviewActivePlayerOnly(false);
    }
    setFirstHalfAttackingDirection(restoredContext.firstHalfAttackingDirection);
    matchEngineStateRef.current = restoredContext.engineState;
    fullTimeResumeStateRef.current = restoredContext.fullTimeResumeState;
    setMatchState(restoredContext.engineState.matchState);
    setCurrentHalf(restoredContext.engineState.currentHalf);
    setMatchTimeSeconds(restoredContext.engineState.matchTimeSeconds);
    if (restoredContext.engineState.matchState === "SECOND_HALF") {
      reviewHalfRef.current = "H2";
      setReviewHalf("H2");
    } else if (
      restoredContext.engineState.matchState === "FIRST_HALF" ||
      restoredContext.engineState.matchState === "HALF_TIME"
    ) {
      reviewHalfRef.current = "H1";
      setReviewHalf("H1");
    } else {
      reviewHalfRef.current = "FULL";
      setReviewHalf("FULL");
    }
    setIsCountsOverlayOpen(false);
    setIsResetConfirmOpen(false);
    setIsPickerOpen(false);
    setIsUtilityOpen(false);
    setIsFullTimeActionsOpen(restoredContext.engineState.matchState === "FULL_TIME");
    handleRef.current?.setEventContext({
      half: restoredContext.engineState.currentHalf,
      timestamp: restoredContext.engineState.matchTimeSeconds,
      canLog: isLoggingActive(restoredContext.engineState.matchState),
    });
    setSaveLoadBlockedReason(null);
    setLoadedMatchLabel("Recovered draft");
    setPendingRecoveredDraft(null);
    setSaveFeedback("Recovered unsaved match");
    savedSessionSignatureRef.current = null;
  };

  const discardRecoveredMatchDraft = () => {
    clearActiveMatchDraft();
    setPendingRecoveredDraft(null);
    setSaveFeedback("Recovered draft discarded");
    savedSessionSignatureRef.current = null;
  };

  const closeUtilityPanel = () => {
    setUtilityPanel(null);
    setSaveLoadBlockedReason(null);
  };
  const applyFollowupTag = (tag: FollowupTag | null) => {
    const pending = pendingFollowup;
    setPendingFollowup(null);
    if (!pending || tag == null) return;
    setLoggedEvents((prev) =>
      prev.map((event) => {
        if (event.id !== pending.eventId) return event;
        const removableTags = getRemovableFollowupTags(pending.kind);
        const retainedTags = (event.tags ?? []).filter((entry) => !removableTags.includes(entry));
        return {
          ...event,
          tags: [...retainedTags, tag],
        };
      }),
    );
  };
  const lastSavedLabel =
    lastSavedAtMillis != null
      ? (() => {
          const savedAt = new Date(lastSavedAtMillis);
          if (Number.isNaN(savedAt.getTime())) return null;
          const hour = String(savedAt.getHours()).padStart(2, "0");
          const minute = String(savedAt.getMinutes()).padStart(2, "0");
          return `${hour}:${minute}`;
        })()
      : null;

  const goHome = () => {
    window.location.assign("/board");
  };

  const exitReviewMode = () => {
    reviewHalfRef.current = "FULL";
    reviewSegmentRef.current = "ALL";
    reviewTeamContextRef.current = "ALL";
    reviewEventFilterRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    setReviewHalf("FULL");
    setReviewSegment("ALL");
    setReviewTeamContext("ALL");
    setReviewEventFilter("ALL");
    setReviewActivePlayerOnly(false);
    setReviewZone("FULL");
    setShowReviewStrip(false);
    setIsReviewStripCollapsed(false);
    setSelectedReviewEventId(null);
    setUtilityPanel(null);
  };

  const addPlayer = () => {
    const nextPlayerName = playerDraft.trim();
    if (nextPlayerName.length === 0) return;
    const firstBlankSlot = activeSquadPlayers.find((player) => player.name.trim().length === 0) ?? null;
    if (firstBlankSlot) {
      updateActiveSquadPlayers(
        (prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === firstBlankSlot.id ? { ...player, name: nextPlayerName.slice(0, 24) } : player,
          ),
        firstBlankSlot.id,
      );
      setPlayerDraft("");
      return;
    }

    const starterCount = activeSquadPlayers.filter((player) => player.role === "STARTER").length;
    const nextPlayerNumber =
      activeSquadPlayers.reduce((maxNumber, player) => Math.max(maxNumber, player.number), 0) + 1;
    const nextPlayerRole: PlayerRole = starterCount < 15 ? "STARTER" : "SUB";
    const nextPlayerId = `player-${newLocalEventId()}`;
    updateActiveSquadPlayers(
      (prevPlayers) => [
        ...prevPlayers,
        {
          id: nextPlayerId,
          name: nextPlayerName.slice(0, 24),
          number: Math.min(99, nextPlayerNumber),
          role: nextPlayerRole,
          isActive: nextPlayerRole === "STARTER",
        },
      ],
      activePlayerEntry?.id ?? nextPlayerId,
    );
    setPlayerDraft("");
  };

  const resetSquadsToDefault = () => {
    const nextHomeSquadId = `squad-${newLocalEventId()}`;
    const nextAwaySquadId = `squad-${newLocalEventId()}`;
    setSquads([
      { ...createDefaultSquad("HOME"), id: nextHomeSquadId, name: "HOME", team: "HOME" },
      { ...createDefaultSquad("AWAY"), id: nextAwaySquadId, name: "AWAY", team: "AWAY" },
    ]);
    setActiveSquadIdsByTeam({
      HOME: nextHomeSquadId,
      AWAY: nextAwaySquadId,
    });
    selectActivePlayerById(null);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
    setPlayerDraft("");
    setSquadDraft("");
    setSaveFeedback("Squads reset to default");
  };

  const requestResetSquads = () => {
    const shouldReset = window.confirm("Reset HOME and AWAY squads to blank #1–#30?");
    if (!shouldReset) return;
    resetSquadsToDefault();
  };

  const resetMatchNow = () => {
    clearActiveMatchDraft();
    savedSessionSignatureRef.current = null;
    setPendingRecoveredDraft(null);
    setIsDemoSession(false);
    const nextMatchId = newMatchSessionId("live");
    setCurrentMode("football");
    setTeamNames({
      HOME: "Team A",
      AWAY: "Team B",
    });
    setVenueName("");
    setLoadedMatchLabel(null);
    setSaveLoadBlockedReason(null);
    setActiveTeam("HOME");
    activeTeamRef.current = "HOME";
    setActiveTeamSide("own");
    activeTeamSideRef.current = "own";
    setCurrentMatchId(nextMatchId);
    currentMatchIdRef.current = nextMatchId;
    setLoggedEvents([]);
    setPendingFollowup(null);
    reviewHalfRef.current = "FULL";
    reviewSegmentRef.current = "ALL";
    reviewTeamContextRef.current = "ALL";
    reviewEventFilterRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    setReviewHalf("FULL");
    setReviewSegment("ALL");
    setReviewTeamContext("ALL");
    setReviewEventFilter("ALL");
    setReviewActivePlayerOnly(false);
    setReviewZone("FULL");
    setShowReviewStrip(false);
    setUtilityPanel(null);
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
    setPlayerDraft("");
    setMatchState("PRE_MATCH");
    setCurrentHalf(1);
    setMatchTimeSeconds(0);
    matchEngineStateRef.current = createInitialMatchEngineState();
    fullTimeResumeStateRef.current = null;
    handleRef.current?.setEvents([]);
    handleRef.current?.setEventContext({
      half: 1,
      timestamp: 0,
      canLog: false,
    });
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
    setIsCountsOverlayOpen(false);
    setIsFullTimeActionsOpen(false);
    setIsResetConfirmOpen(false);
  };

  const requestResetMatch = () => {
    setIsResetConfirmOpen(true);
    setIsCountsOverlayOpen(false);
    setIsFullTimeActionsOpen(false);
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const cancelResetMatch = () => {
    setIsResetConfirmOpen(false);
  };

  const confirmResetMatch = () => {
    if (hasDirtyLiveSession) {
      const confirmedDiscard = window.confirm("Discard unsaved match progress and clear recovered draft?");
      if (!confirmedDiscard) return;
    }
    clearActiveMatchDraft();
    resetMatchNow();
  };

  const effectiveAttackingDirection = useMemo(
    () => getEffectiveAttackingDirection(firstHalfAttackingDirection, currentHalf),
    [firstHalfAttackingDirection, currentHalf],
  );
  const visibleReviewEvents = useMemo(
    () =>
      getRenderablePitchEvents(
        loggedEvents,
        reviewHalf,
        reviewSegment,
        reviewTeamContext,
        reviewEventFilter,
        REVIEW_FILTER_KINDS_FOR_MODE,
        reviewZone,
        effectiveAttackingDirection,
        reviewActivePlayerOnly,
        activePlayerId,
      ),
    [
      loggedEvents,
      reviewHalf,
      reviewSegment,
      reviewTeamContext,
      reviewEventFilter,
      REVIEW_FILTER_KINDS_FOR_MODE,
      reviewZone,
      effectiveAttackingDirection,
      reviewActivePlayerOnly,
      activePlayerId,
    ],
  );
  const reviewZoneOverlayModel: ZoneOverlayModel = useMemo(
    () => selectZoneOverlayModel(visibleReviewEvents),
    [visibleReviewEvents],
  );
  const isReviewModeActive = showReviewStrip || utilityPanel === "REVIEW";

  // Keep screen awake during live match AND during review sessions.
  // isLiveMatchActive covers FIRST_HALF / HALF_TIME / SECOND_HALF.
  // isReviewModeActive covers any active review strip or REVIEW utility panel.
  // Positioned here (rather than near isLiveMatchActive above) so that
  // isReviewModeActive is in scope for the combined condition.
  useScreenWakeLock(isLiveMatchActive || isReviewModeActive);

  useEffect(() => {
    if (matchState !== "FULL_TIME") return;
    setIsCountsOverlayOpen(false);
    setIsFullTimeActionsOpen(true);
    setIsPickerOpen(false);
    setIsUtilityOpen(false);
  }, [matchState]);

  useEffect(() => {
    if (!isCountsOverlayOpen || !isFullTimeActionsOpen) return;
    setIsCountsOverlayOpen(false);
  }, [isCountsOverlayOpen, isFullTimeActionsOpen]);

  useEffect(() => {
    if (!isResetConfirmOpen) return;
    setIsCountsOverlayOpen(false);
    setIsFullTimeActionsOpen(false);
  }, [isResetConfirmOpen]);

  useEffect(() => {
    handleRef.current?.setEventContext({
      half: currentHalf,
      timestamp: matchTimeSeconds,
      canLog: isLoggingActive(matchState) && activeTeam === "HOME",
    });
  }, [activeTeam, currentHalf, matchTimeSeconds, matchState]);

  useEffect(() => {
    if (currentHalf !== 2) return;
    const baseline = secondHalfSwitchBaselineEventCountRef.current;
    if (baseline == null) return;
    if (import.meta.env.DEV) {
      console.assert(
        loggedEvents.length >= baseline,
        "[stats-events] Switching to second half must not reduce total event count",
        {
          baselineCount: baseline,
          currentCount: loggedEvents.length,
        },
      );
    }
    secondHalfSwitchBaselineEventCountRef.current = null;
  }, [currentHalf, loggedEvents.length]);

  useEffect(() => {
    const visibleLimit =
      visibilityMode === "LAST_5" ? 5 : visibilityMode === "LAST_10" ? 10 : null;
    handleRef.current?.setVisibleEventLimit(visibleLimit);
  }, [visibilityMode]);

  useEffect(() => {
    handleRef.current?.setShowPlayerInitials(showPlayerInitials);
  }, [showPlayerInitials]);

  useEffect(() => {
    handleRef.current?.setHeatmapEnabled(showReviewHeatmap && isReviewModeActive);
  }, [showReviewHeatmap, isReviewModeActive]);

  useEffect(() => {
    handleRef.current?.setOnMarkerTap(
      isReviewModeActive
        ? (eventId) => {
            setSelectedReviewEventId(eventId);
          }
        : null,
    );
    if (!isReviewModeActive) {
      setSelectedReviewEventId(null);
    }
  }, [isReviewModeActive]);

  useEffect(() => {
    if (!isReviewModeActive) return;
    setIsPickerOpen(false);
  }, [isReviewModeActive]);

  useEffect(() => {
    if (isReviewModeActive) {
      handleRef.current?.setEvents(visibleReviewEvents);
      return;
    }
    handleRef.current?.setEvents(
      visibleReviewEvents.map((event): LiveRenderablePitchEvent =>
        normalizeEventTeamSide(event.teamSide, event.team ?? null, event.id) === "OPP"
          ? { ...event, renderAsSubtleDot: true }
          : event,
      ),
    );
  }, [
    isReviewModeActive,
    visibleReviewEvents,
  ]);

  useEffect(() => {
    handleRef.current?.setZoneOverlayModel(
      isReviewModeActive && showReviewZones ? reviewZoneOverlayModel : null,
    );
  }, [
    isReviewModeActive,
    showReviewZones,
    reviewZoneOverlayModel,
  ]);

  useEffect(() => {
    if (!selectedReviewEventId) return;
    if (loggedEvents.some((event) => event.id === selectedReviewEventId)) return;
    setSelectedReviewEventId(null);
  }, [loggedEvents, selectedReviewEventId]);

  useEffect(() => {
    if (!pendingFollowup) return;
    if (loggedEvents.some((event) => event.id === pendingFollowup.eventId)) return;
    setPendingFollowup(null);
  }, [loggedEvents, pendingFollowup]);

  useEffect(() => {
    if (!pendingFollowup) return;
    const timerId = window.setTimeout(() => {
      setPendingFollowup(null);
    }, 7000);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [pendingFollowup]);

  useEffect(() => {
    const updateLandscape = () => {
      setIsLandscape(window.matchMedia("(orientation: landscape)").matches);
    };
    updateLandscape();

    window.addEventListener("resize", updateLandscape);
    return () => {
      window.removeEventListener("resize", updateLandscape);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(Math.round(inset));
    };

    updateKeyboardInset();
    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
    };
  }, []);

  useEffect(() => {
    if (!isPickerOpen) return;

    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (floatingControlsRef.current?.contains(target)) return;
      setIsPickerOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (!isUtilityOpen) return;

    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if ((event.currentTarget as Node | null) === null) {
        // no-op guard to keep TS satisfied about event usage shape
      }
      if ((document.querySelector(".utility-controls") as HTMLElement | null)?.contains(target)) return;
      setIsUtilityOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
    };
  }, [isUtilityOpen]);

  useEffect(() => {
    const syncUtilityBubblePosition = () => {
      const viewport = getViewportRect();
      setUtilityBubblePosition((prev) => {
        const next = prev == null ? getDefaultUtilityBubblePosition(viewport) : clampUtilityBubblePosition(prev, viewport);
        if (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5) {
          return prev;
        }
        return next;
      });
    };

    syncUtilityBubblePosition();
    window.addEventListener("resize", syncUtilityBubblePosition);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncUtilityBubblePosition);
    viewport?.addEventListener("scroll", syncUtilityBubblePosition);

    return () => {
      window.removeEventListener("resize", syncUtilityBubblePosition);
      viewport?.removeEventListener("resize", syncUtilityBubblePosition);
      viewport?.removeEventListener("scroll", syncUtilityBubblePosition);
    };
  }, []);

  useEffect(() => {
    if (!isUtilityOpen) return;

    const measureMenu = () => {
      const rect = utilityMenuRef.current?.getBoundingClientRect();
      if (!rect) return;
      setUtilityMenuSize((prev) => {
        if (Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };

    measureMenu();
    const rafId = window.requestAnimationFrame(measureMenu);
    window.addEventListener("resize", measureMenu);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measureMenu);
    viewport?.addEventListener("scroll", measureMenu);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measureMenu);
      viewport?.removeEventListener("resize", measureMenu);
      viewport?.removeEventListener("scroll", measureMenu);
    };
  }, [isUtilityOpen]);

  const handleUtilityBubblePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const viewport = getViewportRect();
    const currentPosition =
      utilityBubblePosition == null ? getDefaultUtilityBubblePosition(viewport) : utilityBubblePosition;

    suppressUtilityBubbleClickRef.current = false;
    utilityBubbleDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: currentPosition.left,
      startTop: currentPosition.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleUtilityBubblePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = utilityBubbleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) >= 4) {
      drag.moved = true;
    }
    const viewport = getViewportRect();
    setUtilityBubblePosition(
      clampUtilityBubblePosition(
        {
          left: drag.startLeft + deltaX,
          top: drag.startTop + deltaY,
        },
        viewport,
      ),
    );
  };

  const finishUtilityBubbleDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = utilityBubbleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      suppressUtilityBubbleClickRef.current = true;
    }
    utilityBubbleDragRef.current = null;
  };

  const handleUtilityBubbleClick = () => {
    if (suppressUtilityBubbleClickRef.current) {
      suppressUtilityBubbleClickRef.current = false;
      return;
    }
    toggleCommandBubble();
  };

  const matchStateToken =
    matchState === "FIRST_HALF" || matchState === "SECOND_HALF"
      ? `H${currentHalf}`
      : matchState === "HALF_TIME"
        ? "HT"
        : matchState === "FULL_TIME"
          ? "FT"
          : "PRE";

  const contextualAction: { label: string; onClick: () => void } | null =
    matchState === "PRE_MATCH"
      ? { label: "START", onClick: startFirstHalfAction }
      : matchState === "FIRST_HALF"
        ? { label: "HT", onClick: goToHalfTimeAction }
        : matchState === "HALF_TIME"
          ? { label: "2H", onClick: startSecondHalfAction }
          : matchState === "SECOND_HALF"
            ? { label: "FT", onClick: endMatchAction }
            : matchState === "FULL_TIME"
              ? { label: isFullTimeActionsOpen ? "CLOSE" : "ACTIONS", onClick: toggleFullTimeActionsPanel }
              : null;

  const attackingDirectionHalfLabel = currentHalf === 2 ? "2H" : "1H";
  const attackingDirectionLabel =
    effectiveAttackingDirection === "RIGHT"
      ? `${attackingDirectionHalfLabel} ATTACKING →`
      : `← ${attackingDirectionHalfLabel} ATTACKING`;
  const canSetFirstHalfAttackingDirection = matchState === "PRE_MATCH";
  const toggleFirstHalfAttackingDirection = () => {
    if (!canSetFirstHalfAttackingDirection) return;
    setFirstHalfAttackingDirection((prev) => oppositeAttackingDirection(prev));
  };
  const ownershipToggleControl = (
    <div
      className={
        isLandscape
          ? "team-side-toggle team-side-toggle--scoreboard"
          : "team-side-toggle"
      }
      role="group"
      aria-label="Event ownership toggle"
    >
      <button
        type="button"
        className={activeTeamSide === "own" ? "team-side-toggle-btn is-active" : "team-side-toggle-btn"}
        aria-pressed={activeTeamSide === "own"}
        onClick={() => {
          setActiveTeamSide("own");
        }}
      >
        For
      </button>
      <button
        type="button"
        className={activeTeamSide === "opposition" ? "team-side-toggle-btn is-active" : "team-side-toggle-btn"}
        aria-pressed={activeTeamSide === "opposition"}
        onClick={() => {
          setActiveTeamSide("opposition");
        }}
      >
        Opp
      </button>
    </div>
  );
  const playerById = useMemo(() => {
    const next = new Map<string, SquadPlayer>();
    for (const squad of squads) {
      for (const player of squad.players) {
        next.set(player.id, player);
      }
    }
    return next;
  }, [squads]);
  const selectedReviewEvent =
    selectedReviewEventId == null
      ? null
      : loggedEvents.find((event) => event.id === selectedReviewEventId) ?? null;
  const selectedReviewPlayerLabel =
    selectedReviewEvent == null
      ? null
      : selectedReviewEvent.playerId == null
        ? "No player"
        : (() => {
            const matchedPlayer = playerById.get(selectedReviewEvent.playerId);
            if (!matchedPlayer) return "Unknown player";
            return `#${matchedPlayer.number} ${matchedPlayer.name}`;
          })();
  const selectedReviewKickoutTagLabel =
    selectedReviewEvent == null ||
    !KICKOUT_EVENT_KIND_SET.has(selectedReviewEvent.kind)
      ? null
      : getKickoutTagLabel(selectedReviewEvent.tags);
  const pendingFollowupEvent =
    pendingFollowup == null
      ? null
      : loggedEvents.find((event) => event.id === pendingFollowup.eventId) ?? null;
  const pendingFollowupLabel =
    pendingFollowup?.kind === "KICKOUT_WON"
      ? isHurlingMode
        ? "P/O WON TAG"
        : "K/O WON TAG"
      : pendingFollowup?.kind === "KICKOUT_CONCEDED"
        ? isHurlingMode
          ? "P/O LOST TAG"
          : "K/O LOST TAG"
        : pendingFollowup?.kind === "TURNOVER_WON"
          ? "T/O WON TAG"
          : pendingFollowup?.kind === "TURNOVER_LOST"
            ? "T/O LOST TAG"
            : pendingFollowup?.kind === "SHOT"
              ? "SHOT TAG"
            : null;
  const pendingFollowupOptions =
    pendingFollowup == null ? [] : getFollowupOptions(pendingFollowup.kind);
  const scoringKeyboardButtons = [
    { id: "GOAL" as const, kind: "GOAL" as const, label: "GOAL ▼", tone: "score" as const },
    { id: "POINT" as const, kind: "POINT" as const, label: "POINT ▼", tone: "score" as const },
    { id: "TWO_POINTER" as const, kind: "TWO_POINTER" as const, label: "2PT ▼", tone: "score" as const },
    { id: "SHOT" as const, kind: "SHOT" as const, label: "SHOT ▼", tone: "score" as const },
    { id: "WIDE" as const, kind: "WIDE" as const, label: "WIDE ▼", tone: "wide" as const },
  ];
  const possessionKeyboardButtons = [
    {
      id: "TURNOVER_WON" as const,
      kind: "TURNOVER_WON" as const,
      label: "TURNOVER+ ▼",
      tone: "turnover" as const,
    },
    {
      id: "TURNOVER_LOST" as const,
      kind: "TURNOVER_LOST" as const,
      label: "TURNOVER- ▼",
      tone: "turnover" as const,
    },
    {
      id: "KICKOUT_WON" as const,
      kind: "KICKOUT_WON" as const,
      label: `${mode.restartLabel.toUpperCase()}+ ▼`,
      tone: "kickout" as const,
    },
    {
      id: "KICKOUT_CONCEDED" as const,
      kind: "KICKOUT_CONCEDED" as const,
      label: `${mode.restartLabel.toUpperCase()}- ▼`,
      tone: "kickout" as const,
    },
  ];
  const freeKeyboardButtons = [
    { kind: "FREE_WON" as const, label: "FREE+", tone: "free" as const },
    { kind: "FREE_CONCEDED" as const, label: "FREE-", tone: "free" as const },
  ];
  const openEventKeyboardMenuKind =
    openEventKeyboardMenuId == null ? null : EVENT_KEYBOARD_MENU_KIND[openEventKeyboardMenuId];
  const openEventKeyboardTone = getEventKeyboardToneByMenuId(openEventKeyboardMenuId);
  const isOutcomeFocusActive = openEventKeyboardMenuId != null;
  const openEventKeyboardMenuTitle =
    openEventKeyboardMenuId === "TURNOVER_WON"
      ? "Turnover+ options"
      : openEventKeyboardMenuId === "TURNOVER_LOST"
        ? "Turnover- options"
        : openEventKeyboardMenuId === "KICKOUT_WON"
          ? `${mode.restartLabel}+ options`
          : openEventKeyboardMenuId === "KICKOUT_CONCEDED"
            ? `${mode.restartLabel}- options`
            : openEventKeyboardMenuId === "TWO_POINTER"
              ? "2PT outcomes"
              : openEventKeyboardMenuId != null
                ? `${openEventKeyboardMenuId} outcomes`
                : null;
  const myTeamReport = useMemo(
    () => deriveMyTeamReport(loggedEvents, matchState, teamNames, currentMode),
    [loggedEvents, matchState, teamNames, currentMode],
  );

  const liveCounts = useMemo<LiveMatchCounts>(() => {
    const counts: LiveMatchCounts = {
      goals: 0,
      points: 0,
      twoPointers: 0,
      shots: 0,
      wides: 0,
      turnoverWon: 0,
      turnoverLost: 0,
      kickoutWon: 0,
      kickoutLost: 0,
      freeWon: 0,
      freeConceded: 0,
    };
    for (const event of loggedEvents) {
      const isHomeEvent = event.team === "HOME" || event.id.startsWith("team-home-");
      if (!isHomeEvent) continue;
      if (event.kind === "GOAL") {
        counts.goals += 1;
        counts.shots += 1;
        continue;
      }
      if (event.kind === "POINT") {
        counts.points += 1;
        counts.shots += 1;
        continue;
      }
      if (event.kind === "TWO_POINTER" || event.kind === "FORTY_FIVE_TWO_POINT") {
        counts.twoPointers += 1;
        counts.shots += 1;
        continue;
      }
      if (event.kind === "FREE_SCORED") {
        counts.points += 1;
        counts.shots += 1;
        continue;
      }
      if (event.kind === "SHOT") {
        counts.shots += 1;
        continue;
      }
      if (event.kind === "WIDE") {
        counts.wides += 1;
        counts.shots += 1;
        continue;
      }
      if (event.kind === "TURNOVER_WON") {
        counts.turnoverWon += 1;
        continue;
      }
      if (event.kind === "TURNOVER_LOST") {
        counts.turnoverLost += 1;
        continue;
      }
      if (event.kind === "KICKOUT_WON") {
        counts.kickoutWon += 1;
        continue;
      }
      if (event.kind === "KICKOUT_CONCEDED") {
        counts.kickoutLost += 1;
        continue;
      }
      if (event.kind === "FREE_WON") {
        counts.freeWon += 1;
        continue;
      }
      if (event.kind === "FREE_CONCEDED") {
        counts.freeConceded += 1;
      }
    }
    return counts;
  }, [loggedEvents]);
  const showTwoPointerCount =
    modeHasScoringEvent(mode.scoringEvents, "TWO_POINTER") ||
    modeHasScoringEvent(mode.scoringEvents, "FORTY_FIVE_TWO_POINT");

  const homeScore = useMemo(() => computeTeamScore(loggedEvents, "HOME"), [loggedEvents]);
  const awayScore = useMemo(() => computeTeamScore(loggedEvents, "AWAY"), [loggedEvents]);

  const scoreboard = isLandscape ? (
    <div className="scoreboard-rail" aria-label="Match scoreboard">
      <div className="scoreboard-rail-venue">
        {editingVenue ? (
          <input
            ref={venueInputRef}
            className="scoreboard-rail-venue-input"
            value={venueDraft}
            onChange={(event) => {
              setVenueDraft(event.target.value.slice(0, 24));
            }}
            onBlur={commitVenueEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitVenueEdit();
              }
            }}
            maxLength={24}
            placeholder="Venue"
            aria-label="Edit venue"
          />
        ) : (
          <>
            <span className="scoreboard-rail-venue-label">
              {venueName.length > 0 ? venueName : "Venue"}
            </span>
            {canEditTeamNames ? (
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit venue"
                onClick={startVenueEdit}
              >
                ✏️
              </button>
            ) : null}
          </>
        )}
      </div>
      <div className="scoreboard-rail-team-wrap">
        {canEditTeamNames ? (
          editingTeam === "HOME" ? (
            <input
              ref={homeNameInputRef}
              className="scoreboard-rail-name-input"
              value={teamNameDraft}
              onChange={(event) => {
                setTeamNameDraft(event.target.value.slice(0, 15));
              }}
              onBlur={commitTeamNameEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTeamNameEdit();
                }
              }}
              maxLength={15}
              aria-label="Edit team A name"
            />
          ) : (
            <span className="scoreboard-rail-name-line">
              <span className="scoreboard-rail-team-name">{teamNames.HOME}</span>
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit team A name"
                onClick={() => startTeamNameEdit("HOME")}
              >
                ✏️
              </button>
            </span>
          )
        ) : (
          <button
            type="button"
            className="scoreboard-rail-team-btn"
            onClick={() => {
              setActiveTeam("HOME");
              setActiveTeamSide("own");
            }}
            style={
              activeTeamSide === "own"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-team-btn-name">{teamNames.HOME}</span>
          </button>
        )}
      </div>
      <div className="scoreboard-rail-score">
        {formatGaelicScore(homeScore)}
        <span className="scoreboard-rail-total">({homeScore.total})</span>
      </div>
      <div className="scoreboard-rail-separator">v</div>
      <div className="scoreboard-rail-score">
        {formatGaelicScore(awayScore)}
        <span className="scoreboard-rail-total">({awayScore.total})</span>
      </div>
      <div className="scoreboard-rail-team-wrap">
        {canEditTeamNames ? (
          editingTeam === "AWAY" ? (
            <input
              ref={awayNameInputRef}
              className="scoreboard-rail-name-input"
              value={teamNameDraft}
              onChange={(event) => {
                setTeamNameDraft(event.target.value.slice(0, 15));
              }}
              onBlur={commitTeamNameEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTeamNameEdit();
                }
              }}
              maxLength={15}
              aria-label="Edit team B name"
            />
          ) : (
            <span className="scoreboard-rail-name-line">
              <span className="scoreboard-rail-team-name">{teamNames.AWAY}</span>
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit team B name"
                onClick={() => startTeamNameEdit("AWAY")}
              >
                ✏️
              </button>
            </span>
          )
        ) : (
          <button
            type="button"
            className="scoreboard-rail-team-btn"
            onClick={() => {
              setActiveTeam("HOME");
              setActiveTeamSide("opposition");
            }}
            style={
              activeTeamSide === "opposition"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-team-btn-name">{teamNames.AWAY}</span>
          </button>
        )}
      </div>
      {canSetFirstHalfAttackingDirection ? (
        <button
          type="button"
          className="scoreboard-attack-btn scoreboard-attack-btn--rail"
          onClick={toggleFirstHalfAttackingDirection}
          disabled={!canSetFirstHalfAttackingDirection}
          aria-label={`Tracked team attacking ${
            effectiveAttackingDirection === "RIGHT" ? "right" : "left"
          }`}
        >
          {attackingDirectionLabel}
        </button>
      ) : isReviewModeActive ? (
        <button
          type="button"
          className="scoreboard-attack-btn scoreboard-attack-btn--rail"
          onClick={exitReviewMode}
          style={{ border: "1px solid rgba(248,113,113,0.68)", background: "rgba(127,29,29,0.35)" }}
        >
          Exit Review
        </button>
      ) : (
        ownershipToggleControl
      )}
    </div>
  ) : (
    <div className="scoreboard-strip" aria-label="Match scoreboard">
      <div className="scoreboard-strip-venue">
        {editingVenue ? (
          <input
            ref={venueInputRef}
            className="scoreboard-strip-venue-input"
            value={venueDraft}
            onChange={(event) => {
              setVenueDraft(event.target.value.slice(0, 24));
            }}
            onBlur={commitVenueEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitVenueEdit();
              }
            }}
            maxLength={24}
            placeholder="Venue"
            aria-label="Edit venue"
          />
        ) : (
          <>
            <span className="scoreboard-strip-venue-label">
              {venueName.length > 0 ? venueName : "Venue"}
            </span>
            {canEditTeamNames ? (
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit venue"
                onClick={startVenueEdit}
              >
                ✏️
              </button>
            ) : null}
          </>
        )}
      </div>
      <div className="scoreboard-strip-line">
        {canEditTeamNames ? (
          <span className="scoreboard-side">
            {editingTeam === "HOME" ? (
              <input
                ref={homeNameInputRef}
                className="scoreboard-name-input"
                value={teamNameDraft}
                onChange={(event) => {
                  setTeamNameDraft(event.target.value.slice(0, 15));
                }}
                onBlur={commitTeamNameEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitTeamNameEdit();
                  }
                }}
                maxLength={15}
                aria-label="Edit team A name"
              />
            ) : (
              <span className="scoreboard-side-label-wrap">
                <span className="scoreboard-side-label">{teamNames.HOME}</span>
                <button
                  type="button"
                  className="scoreboard-name-edit-btn"
                  aria-label="Edit team A name"
                  onClick={() => startTeamNameEdit("HOME")}
                >
                  ✏️
                </button>
              </span>
            )}
            <span className="scoreboard-side-score">
              {formatGaelicScore(homeScore)}
              <span className="scoreboard-total">({homeScore.total})</span>
            </span>
          </span>
        ) : (
          <button
            type="button"
            className="scoreboard-side scoreboard-side-btn"
            onClick={() => {
              setActiveTeam("HOME");
              setActiveTeamSide("own");
            }}
            aria-pressed={activeTeamSide === "own"}
            style={
              activeTeamSide === "own"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-side-label">{teamNames.HOME}</span>
            <span className="scoreboard-side-score">
              {formatGaelicScore(homeScore)}
              <span className="scoreboard-total">({homeScore.total})</span>
            </span>
          </button>
        )}
        {canEditTeamNames ? (
          <span className="scoreboard-side">
            {editingTeam === "AWAY" ? (
              <input
                ref={awayNameInputRef}
                className="scoreboard-name-input"
                value={teamNameDraft}
                onChange={(event) => {
                  setTeamNameDraft(event.target.value.slice(0, 15));
                }}
                onBlur={commitTeamNameEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitTeamNameEdit();
                  }
                }}
                maxLength={15}
                aria-label="Edit team B name"
              />
            ) : (
              <span className="scoreboard-side-label-wrap">
                <span className="scoreboard-side-label">{teamNames.AWAY}</span>
                <button
                  type="button"
                  className="scoreboard-name-edit-btn"
                  aria-label="Edit team B name"
                  onClick={() => startTeamNameEdit("AWAY")}
                >
                  ✏️
                </button>
              </span>
            )}
            <span className="scoreboard-side-score">
              {formatGaelicScore(awayScore)}
              <span className="scoreboard-total">({awayScore.total})</span>
            </span>
          </span>
        ) : (
          <button
            type="button"
            className="scoreboard-side scoreboard-side-btn"
            onClick={() => {
              setActiveTeam("HOME");
              setActiveTeamSide("opposition");
            }}
            aria-pressed={activeTeamSide === "opposition"}
            style={
              activeTeamSide === "opposition"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-side-label">{teamNames.AWAY}</span>
            <span className="scoreboard-side-score">
              {formatGaelicScore(awayScore)}
              <span className="scoreboard-total">({awayScore.total})</span>
            </span>
          </button>
        )}
      </div>
      <div className="scoreboard-attack-row">
        <button
          type="button"
          className="scoreboard-attack-btn scoreboard-attack-btn--strip"
          onClick={toggleFirstHalfAttackingDirection}
          disabled={!canSetFirstHalfAttackingDirection}
          aria-label={`Tracked team attacking ${
            effectiveAttackingDirection === "RIGHT" ? "right" : "left"
          }`}
        >
          {attackingDirectionLabel}
        </button>
      </div>
    </div>
  );

  const utilityControlsClass = isLandscape
    ? "utility-controls utility-controls--landscape"
    : "utility-controls utility-controls--portrait";
  const utilityBubbleStyle =
    !isLandscape || utilityBubblePosition == null
      ? undefined
      : {
          left: `${utilityBubblePosition.left}px`,
          top: `${utilityBubblePosition.top}px`,
          right: "auto",
          bottom: "auto",
          touchAction: "none",
          cursor: utilityBubbleDragRef.current ? "grabbing" : "grab",
        };
  const utilityMenuStyle = (() => {
    if (!isLandscape || utilityBubblePosition == null) return undefined;

    const viewport = getViewportRect();
    const minLeft = viewport.left + UTILITY_BUBBLE_MARGIN;
    const maxLeft = viewport.left + viewport.width - UTILITY_BUBBLE_MARGIN - utilityMenuSize.width;
    let left = utilityBubblePosition.left + UTILITY_BUBBLE_SIZE + 8;
    if (left > maxLeft) {
      left = utilityBubblePosition.left - utilityMenuSize.width - 8;
    }
    left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));

    const minTop = viewport.top + UTILITY_BUBBLE_MARGIN;
    const maxTop = viewport.top + viewport.height - UTILITY_BUBBLE_MARGIN - utilityMenuSize.height;
    let top = utilityBubblePosition.top + UTILITY_BUBBLE_SIZE - utilityMenuSize.height;
    top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

    return {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      marginLeft: 0,
      marginBottom: 0,
      maxHeight: `${Math.max(120, viewport.height - UTILITY_BUBBLE_MARGIN * 2)}px`,
      overflowY: "auto",
    } as const;
  })();
  const utilityPanelClass = isLandscape
    ? "utility-overlay-panel utility-overlay-panel--landscape"
    : "utility-overlay-panel utility-overlay-panel--portrait";
  const formationPlayers = [...activePlayers]
    .sort((a, b) => {
      const aSlot = typeof a.activeSlot === "number" ? a.activeSlot : Number.POSITIVE_INFINITY;
      const bSlot = typeof b.activeSlot === "number" ? b.activeSlot : Number.POSITIVE_INFINITY;
      if (aSlot !== bSlot) return aSlot - bSlot;
      return a.number - b.number;
    })
    .slice(0, 15);
  const benchPlayers = inactivePlayers;
  const contextActivePillBorder =
    playerSquadTeam === "HOME" ? "1px solid rgba(74, 222, 128, 0.65)" : "1px solid rgba(248, 113, 113, 0.62)";
  const contextActivePillGlow =
    playerSquadTeam === "HOME" ? "0 0 0 1px rgba(74, 222, 128, 0.24)" : "0 0 0 1px rgba(248, 113, 113, 0.24)";
  const formationRows: SquadPlayer[][] = [];
  let formationCursor = 0;
  for (const rowSize of FORMATION_ROW_SIZES) {
    formationRows.push(formationPlayers.slice(formationCursor, formationCursor + rowSize));
    formationCursor += rowSize;
  }
  const activePlayerChipText =
    activePlayerEntry != null
      ? `Active: ${formatPlayerLabel(activePlayerEntry)}`
      : null;
  const activePlayerChipFloatingStyle =
    keyboardInset > 0
      ? { bottom: `${keyboardInset + 18}px` }
      : { bottom: "max(88px, calc(env(safe-area-inset-bottom) + 84px))" };
  const playersPanelStyle = isLandscape
    ? { zIndex: 10001 }
    : keyboardInset > 0
      ? {
          zIndex: 10001,
          left: "14px",
          top: "max(10px, env(safe-area-inset-top))",
          bottom: "auto",
        }
      : {
          zIndex: 10001,
          left: "14px",
          bottom: "max(142px, calc(env(safe-area-inset-bottom) + 120px))",
        };
  const compactOverlayBaseStyle: CSSProperties = {
    position: "fixed",
    zIndex: 10003,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "min(240px, calc(100vw - 20px))",
    padding: "8px",
    borderRadius: "10px",
    border: "1px solid rgba(148, 163, 184, 0.34)",
    background: "rgba(10, 20, 35, 0.82)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 12px 24px rgba(4, 12, 24, 0.28)",
    pointerEvents: "auto",
  };
  const countsOverlayStyle: CSSProperties = {
    ...compactOverlayBaseStyle,
    right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
    bottom: isLandscape
      ? "max(80px, calc(env(safe-area-inset-bottom, 0px) + 74px))"
      : "max(146px, calc(env(safe-area-inset-bottom, 0px) + 132px))",
  };
  const fullTimeOverlayStyle: CSSProperties = {
    ...compactOverlayBaseStyle,
    right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
    top: isLandscape
      ? "max(50px, calc(env(safe-area-inset-top, 0px) + 46px))"
      : "max(102px, calc(env(safe-area-inset-top, 0px) + 96px))",
    width: "min(260px, calc(100vw - 18px))",
  };
  const resetConfirmStyle: CSSProperties = {
    ...compactOverlayBaseStyle,
    right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
    top: isLandscape
      ? "max(168px, calc(env(safe-area-inset-top, 0px) + 160px))"
      : "max(230px, calc(env(safe-area-inset-top, 0px) + 220px))",
    width: "min(250px, calc(100vw - 18px))",
    border: "1px solid rgba(248, 113, 113, 0.42)",
  };
  const followupStripStyle: CSSProperties = isLandscape
    ? {
        bottom: `${Math.max(70, keyboardInset + 42)}px`,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(360px, 72vw)",
        justifyContent: "center",
      }
    : {
        bottom: `${Math.max(106, keyboardInset + 104)}px`,
        left: "50%",
        right: "auto",
        transform: "translateX(-50%)",
        width: "min(72vw, calc(100vw - 20px))",
        maxWidth: "min(72vw, calc(100vw - 20px))",
        justifyContent: "flex-start",
        padding: "0 6px 0 max(62px, calc(env(safe-area-inset-left, 0px) + 56px))",
        border: "none",
        background: "transparent",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        boxShadow: "none",
        borderRadius: "0",
        gap: "6px",
      };
  return (
    <>
      <main className="app-root" style={appRootStyle}>
        <style>{PANEL_CSS}</style>
        <VisionStadiumBackground variant="stats" ready={isPitchReady} />
        {scoreboard}
        {isCountsOverlayOpen && matchState !== "FULL_TIME" ? (
          <div style={countsOverlayStyle} role="dialog" aria-label="Live event counts">
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.92 }}>
              COUNTS
            </div>
            <div className="utility-panel-title" style={{ fontSize: "8px", opacity: 0.84 }}>
              SCORING
            </div>
            <div className="utility-panel-title" style={{ fontSize: "9px", textTransform: "none", opacity: 0.94 }}>
              Goals {liveCounts.goals} · Points {liveCounts.points}
            </div>
            {showTwoPointerCount ? (
              <div className="utility-panel-title" style={{ fontSize: "9px", textTransform: "none", opacity: 0.9 }}>
                Two pointers {liveCounts.twoPointers}
              </div>
            ) : null}
            <div className="utility-panel-title" style={{ fontSize: "9px", textTransform: "none", opacity: 0.9 }}>
              Shots {liveCounts.shots} · Wides {liveCounts.wides}
            </div>
            <div className="utility-panel-title" style={{ fontSize: "8px", opacity: 0.84, marginTop: "2px" }}>
              POSSESSION
            </div>
            <div className="utility-panel-title" style={{ fontSize: "9px", textTransform: "none", opacity: 0.9 }}>
              Turnover Won {liveCounts.turnoverWon} · Lost {liveCounts.turnoverLost}
            </div>
            <div className="utility-panel-title" style={{ fontSize: "9px", textTransform: "none", opacity: 0.9 }}>
              Kickout Won {liveCounts.kickoutWon} · Lost {liveCounts.kickoutLost}
            </div>
            <div className="utility-panel-title" style={{ fontSize: "9px", textTransform: "none", opacity: 0.9 }}>
              Free Won {liveCounts.freeWon} · Conceded {liveCounts.freeConceded}
            </div>
            <button type="button" className="utility-panel-close" onClick={() => setIsCountsOverlayOpen(false)}>
              Close
            </button>
          </div>
        ) : null}
        {matchState === "FULL_TIME" && isFullTimeActionsOpen ? (
          <div style={fullTimeOverlayStyle} role="dialog" aria-label="Full Time actions">
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.94 }}>
              FULL TIME
            </div>
            <button
              type="button"
              className="utility-review-btn"
              onClick={() => {
                saveCurrentMatchSnapshot();
              }}
            >
              Save Match
            </button>
            <button
              type="button"
              className="utility-review-btn"
              onClick={() => {
                void shareOrExportMatch();
              }}
            >
              Share Summary PNG
            </button>
            <button type="button" className="utility-review-btn" onClick={resumeMatchFromFullTime}>
              Resume Match
            </button>
            <button
              type="button"
              className="utility-review-btn"
              style={{ border: "1px solid rgba(248,113,113,0.62)", background: "rgba(127,29,29,0.34)" }}
              onClick={requestResetMatch}
            >
              Reset Match
            </button>
            <button type="button" className="utility-panel-close" onClick={() => setIsFullTimeActionsOpen(false)}>
              Close
            </button>
          </div>
        ) : null}
        {isResetConfirmOpen ? (
          <div style={resetConfirmStyle} role="dialog" aria-label="Confirm reset match">
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.92 }}>
              Confirm Reset
            </div>
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
              This is the only action that clears match events.
            </div>
            <button type="button" className="utility-review-btn" onClick={cancelResetMatch}>
              Cancel
            </button>
            <button
              type="button"
              className="utility-review-btn"
              style={{ border: "1px solid rgba(248,113,113,0.72)", background: "rgba(127,29,29,0.4)" }}
              onClick={confirmResetMatch}
            >
              Confirm Reset
            </button>
          </div>
        ) : null}
      {utilityPanel === "PLAYERS" ? (
        <div
          className={utilityPanelClass}
          role="dialog"
          aria-label={playerSquadTeam === "HOME" ? "Home players" : "Away players"}
          style={playersPanelStyle}
        >
          <div className="utility-review-scroll">
          <div className="utility-panel-title">{playerSquadTeam === "HOME" ? "HOME Players" : "AWAY Players"}</div>
          {isPreMatchSetup ? (
            <>
              <div className="utility-squad-row">
                <select
                  className="utility-squad-select"
                  value={activeSquad.id}
                  onChange={(event) => {
                    setActiveSquadById(event.target.value);
                  }}
                  aria-label="Select home squad"
                >
                  {squads.filter((squad) => !squad.team || squad.team === playerSquadTeam).map((squad) => (
                    <option key={squad.id} value={squad.id}>
                      {squad.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="utility-squad-create">
                <input
                  type="text"
                  className="utility-squad-input"
                  value={squadDraft}
                  onChange={(event) => {
                    setSquadDraft(event.target.value);
                  }}
                  placeholder="New or rename squad"
                />
                <button type="button" className="utility-review-btn" onClick={createSquad}>
                  New
                </button>
                <button type="button" className="utility-review-btn" onClick={saveActiveSquadName}>
                  Rename
                </button>
                <button type="button" className="utility-review-btn" onClick={saveSquadSnapshot}>
                  Save Squad
                </button>
                <button
                  type="button"
                  className="utility-review-btn"
                  onClick={() => {
                    if (savedSquads.length === 0) return;
                    loadSavedSquadIntoActive(savedSquads[0]);
                  }}
                  disabled={savedSquads.length === 0}
                >
                  Load Squad
                </button>
              </div>
              <div style={{ display: "flex", marginTop: "6px" }}>
                <button type="button" className="utility-review-btn" onClick={requestResetSquads}>
                  Reset Squads
                </button>
              </div>
            </>
          ) : null}
          {savedSquads.length > 0 ? (
            <div className="utility-panel-title" style={{ fontSize: "8px", opacity: 0.78, textTransform: "none" }}>
              Last saved: {savedSquads[0].name} · {savedSquads[0].players.length} players
            </div>
          ) : null}
          {activePlayerChipText ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                className="utility-active-player-chip"
                aria-live="polite"
                onClick={() => selectActivePlayerById(null)}
              >
                {activePlayerChipText}
              </div>
              <button
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  if (!activePlayerEntry) return;
                  editPlayer(activePlayerEntry.id);
                }}
              >
                Edit
              </button>
            </div>
          ) : null}
          {isPreMatchSetup ? (
            <div className="utility-player-add-row">
              <input
                type="text"
                className="utility-player-input"
                value={playerDraft}
                onChange={(event) => {
                  setPlayerDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addPlayer();
                }}
                placeholder="Add player"
              />
              <button type="button" className="utility-review-btn" onClick={addPlayer}>
                Add
              </button>
            </div>
          ) : null}
          <div className="utility-panel-title" style={{ fontSize: "8px", textTransform: "none", opacity: 0.84 }}>
            Active Players
          </div>
          <div className="utility-formation" aria-label="Home formation">
            {formationRows.map((row, rowIdx) =>
              row.length > 0 ? (
                <div key={`formation-row-${rowIdx}`} className="utility-formation-row">
                  {row.map((player, playerIdx) => {
                    const isActive = activePlayerEntry?.id === player.id;
                    return (
                      <button
                        key={`formation-${rowIdx}-${playerIdx}-${player.id}`}
                        type="button"
                        className="utility-player-pill"
                        onClick={() => {
                          handlePlayerPick(player);
                        }}
                        onDoubleClick={() => {
                          editPlayer(player.id);
                        }}
                        style={{
                          ...(isActive
                            ? {
                                border: "1px solid rgba(125,211,252,0.9)",
                                background: "rgba(14,116,144,0.38)",
                              }
                            : { border: contextActivePillBorder, boxShadow: contextActivePillGlow }),
                          ...(isPreMatchSetup ? {} : { fontSize: "11px", padding: "8px 10px" }),
                        }}
                      >
                        {isActive ? "● " : ""}
                        {formatPlayerLabel(player)}
                      </button>
                    );
                  })}
                </div>
              ) : null,
            )}
          </div>
          <div className="utility-subs-wrap">
            <div className="utility-subs-title">Subs V1 Lite</div>
            <div className="utility-panel-title" style={{ fontSize: "8px", textTransform: "none", opacity: 0.9 }}>
              Select one active player to go off, and one bench player to come on.
            </div>
            <div className="utility-panel-title" style={{ fontSize: "8px", textTransform: "none", opacity: 0.9 }}>
              Sub Out
            </div>
            <div className="utility-subs-row" aria-label="Active players">
              {activePlayers.map((player) => (
                <button
                  key={`sub-out-${player.id}`}
                  type="button"
                  className="utility-player-pill"
                  onClick={() => setSelectedSubOutId(player.id)}
                  style={selectedSubOutId === player.id ? { border: "1px solid rgba(248,113,113,0.92)" } : undefined}
                >
                  {formatPlayerLabel(player)}
                </button>
              ))}
            </div>
            <div className="utility-panel-title" style={{ fontSize: "8px", textTransform: "none", opacity: 0.9 }}>
              Sub In
            </div>
            <div className="utility-subs-row" aria-label="Bench players">
              {inactivePlayers.map((player) => (
                <button
                  key={`sub-in-${player.id}`}
                  type="button"
                  className="utility-player-pill"
                  onClick={() => setSelectedSubInId(player.id)}
                  style={selectedSubInId === player.id ? { border: "1px solid rgba(74,222,128,0.9)" } : undefined}
                >
                  {formatPlayerLabel(player)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="utility-review-btn"
              onClick={confirmSubstitution}
              disabled={!selectedSubOutId || !selectedSubInId}
            >
              Confirm Sub
            </button>
          </div>
          {isPreMatchSetup && benchPlayers.length > 0 ? (
            <div className="utility-subs-wrap">
              <div className="utility-panel-title" style={{ fontSize: "8px", textTransform: "none", opacity: 0.84 }}>
                Bench
              </div>
              <div className="utility-panel-title" style={{ fontSize: "8px", textTransform: "none", opacity: 0.72 }}>
                Bench players are listed for substitution (Sub In), not direct event tagging.
              </div>
              <div className="utility-subs-row" aria-label="Home substitutes">
                {benchPlayers.map((player, idx) => {
                  return (
                    <div
                      key={`bench-${idx}-${player.id}`}
                      className="utility-player-pill"
                      style={{ opacity: 0.78 }}
                    >
                      {formatPlayerLabel(player)}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          </div>
          <button
            type="button"
            className="utility-panel-close utility-panel-close--sticky"
            onClick={closeUtilityPanel}
          >
            Close
          </button>
        </div>
      ) : null}
      {utilityPanel === "SUMMARY" ? (
        <div className={utilityPanelClass} role="dialog" aria-label="Match summary">
          <div className="utility-review-scroll">
            <div className="utility-panel-title">MATCH REPORT</div>
            {myTeamReport.length > 0 ? (
              myTeamReport.map((line, index) => (
                <div key={`summary-panel-${index}-${line}`} className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                  {line}
                </div>
              ))
            ) : (
              <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                No tagged match data yet.
              </div>
            )}
          </div>
          <button type="button" className="utility-panel-close" onClick={closeUtilityPanel}>
            Close
          </button>
        </div>
      ) : null}
      {utilityPanel === "NOTES" ? (
        <div className={utilityPanelClass} role="dialog" aria-label="Notes">
          <NotesQuickPanel
            matchContext={{
              matchId: currentMatchId,
              half: currentHalf,
              matchClockMs: Math.max(0, Math.floor(matchTimeSeconds * 1000)),
            }}
          />
          <button type="button" className="utility-panel-close" onClick={closeUtilityPanel}>
            Close
          </button>
        </div>
      ) : null}
      {utilityPanel === "SAVED_MATCHES" ? (
        <div className={utilityPanelClass} role="dialog" aria-label="Saved matches">
          <div className="utility-review-scroll">
            <div className="utility-panel-title">SAVED MATCHES</div>
            {saveLoadBlockedReason ? (
              <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                {saveLoadBlockedReason}
              </div>
            ) : null}
            {savedMatches.length > 0 ? (
              savedMatches.map((savedMatch, index) => {
                const isLatest = index === 0;
                return (
                  <div
                    key={savedMatch.id}
                    style={{
                      border: isLatest ? "1px solid rgba(124,255,114,0.56)" : "1px solid rgba(148,163,184,0.32)",
                      borderRadius: "8px",
                      padding: "7px",
                      background: isLatest ? "rgba(22,101,52,0.22)" : "rgba(15,23,42,0.52)",
                      marginBottom: "6px",
                      boxShadow: isLatest ? "0 0 0 1px rgba(124,255,114,0.22)" : "none",
                    }}
                  >
                    <div
                      className="utility-panel-title"
                      style={{
                        fontSize: "9px",
                        opacity: 0.98,
                        textTransform: "none",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <span>
                        {savedMatch.homeTeamName} v {savedMatch.awayTeamName}
                      </span>
                      {isLatest ? (
                        <span
                          style={{
                            fontSize: "8px",
                            fontWeight: 700,
                            letterSpacing: "0.2px",
                            color: "#7CFF72",
                          }}
                        >
                          LATEST
                        </span>
                      ) : null}
                    </div>
                    <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.85, textTransform: "none" }}>
                      {savedMatch.scorelineSnapshot}
                    </div>
                    <div className="utility-panel-title" style={{ fontSize: "8px", opacity: 0.8, textTransform: "none" }}>
                      {savedMatch.venue} · {formatSavedMatchCreatedAt(savedMatch.createdAt)} · {savedMatch.eventCount} events
                    </div>
                    <button
                      type="button"
                      className="utility-review-btn"
                      onClick={() => {
                        loadSavedMatchRecord(savedMatch);
                      }}
                      style={{ marginTop: "4px" }}
                    >
                      Load Match
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                No valid saved matches yet.
              </div>
            )}
          </div>
          <button type="button" className="utility-panel-close" onClick={closeUtilityPanel}>
            Close
          </button>
        </div>
      ) : null}
      {!isReviewModeActive &&
      utilityPanel == null &&
      pendingFollowup &&
      pendingFollowupEvent &&
      pendingFollowupLabel ? (
        <div
          className="review-quick-strip"
          role="group"
          aria-label="Event follow-up tag"
          style={followupStripStyle}
        >
          <span className="utility-panel-title" style={{ fontSize: "8px", alignSelf: "center", opacity: 0.9 }}>
            {pendingFollowupLabel}
          </span>
          {pendingFollowupOptions.map((option) => (
            <button
              key={`followup-option-${pendingFollowup.kind}-${option.tag}`}
              type="button"
              className="review-quick-btn"
              onClick={() => {
                applyFollowupTag(option.tag);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {showReviewStrip && !isReviewStripCollapsed && utilityPanel !== "REVIEW" ? (
        <div
          className={`review-strip ${isLandscape ? "review-strip--landscape" : "review-strip--portrait"}`}
          role="toolbar"
          aria-label="Review quick controls"
        >
          <span className="review-strip-status">Review</span>
          {([
            { id: "FULL", label: "ALL (Reset)" },
            { id: "H1", label: "1H" },
            { id: "H2", label: "2H" },
          ] as const).map((option) => (
            <button
              key={`strip-half-${option.id}`}
              type="button"
              className="review-strip-chip review-strip-chip--half"
              onClick={() => {
                setReviewHalf(option.id);
              }}
              style={
                reviewHalf === option.id
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              {option.label}
            </button>
          ))}
          {REVIEW_SEGMENT_OPTIONS.map((option) => (
            <button
              key={`strip-segment-${option.id}`}
              type="button"
              className="review-strip-chip"
              onClick={() => {
                setReviewSegment(option.id);
              }}
              style={
                reviewSegment === option.id
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              {isLandscape && option.compactLabel ? option.compactLabel : option.label}
            </button>
          ))}
          {REVIEW_TEAM_CONTEXT_OPTIONS.map((option) => (
            <button
              key={`strip-team-${option.id}`}
              type="button"
              className="review-strip-chip"
              onClick={() => {
                setReviewTeamContext(option.id);
              }}
              style={
                reviewTeamContext === option.id
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              {option.label}
            </button>
          ))}
          {REVIEW_FILTER_OPTIONS.map((option) => (
            <button
              key={`strip-filter-${option.id}`}
              type="button"
              className="review-strip-chip"
              onClick={() => {
                setReviewEventFilter(option.id);
              }}
              style={
                reviewEventFilter === option.id
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className="review-strip-chip"
            onClick={() => {
              setShowReviewZones((prev) => !prev);
            }}
            aria-pressed={showReviewZones}
            aria-label="Toggle review zones overlay"
            style={
              showReviewZones
                ? {
                    border: "1px solid rgba(125,211,252,0.9)",
                    background: "rgba(14,116,144,0.38)",
                  }
                : undefined
            }
          >
            ZONES
          </button>
          <span className="review-strip-meta review-strip-player">
            {activePlayerChipText ?? "No active player"}
          </span>
          <span className="review-strip-meta">{visibleReviewEvents.length} shown</span>
          <button
            type="button"
            className="review-strip-chip"
            onClick={saveReviewSession}
          >
            Export Review
          </button>
          <button
            type="button"
            className="review-strip-chip"
            onClick={openLastReviewSession}
          >
            Import Review
          </button>
          <button
            type="button"
            className="review-strip-chip"
            onClick={handleExportPdf}
            disabled={isPdfExporting}
            aria-label="Export 22-page Visual Review PDF"
            style={
              isPdfExporting
                ? { opacity: 0.6, cursor: "wait" }
                : undefined
            }
          >
            {isPdfExporting ? "Building PDF…" : "Export PDF"}
          </button>
          <span className="review-strip-spacer" aria-hidden="true" />
          <button
            type="button"
            className="review-strip-chip"
            onClick={() => {
              setIsReviewStripCollapsed(true);
            }}
            aria-label="Hide review controls"
          >
            Hide
          </button>
          <button
            type="button"
            className="review-strip-chip review-strip-chip--exit"
            onClick={exitReviewMode}
          >
            Exit Review
          </button>
        </div>
      ) : null}
      {showReviewStrip && isReviewStripCollapsed && utilityPanel !== "REVIEW" ? (
        <button
          type="button"
          className="review-strip-chip"
          onClick={() => {
            setIsReviewStripCollapsed(false);
          }}
          aria-label="Show review controls"
          style={{
            position: "fixed",
            zIndex: 23,
            top: isLandscape
              ? "max(8px, env(safe-area-inset-top, 0px))"
              : "max(104px, calc(env(safe-area-inset-top, 0px) + 100px))",
            left: isLandscape
              ? "max(90px, calc(env(safe-area-inset-left, 0px) + 86px))"
              : "12px",
          }}
        >
          Review
        </button>
      ) : null}
      {isReviewModeActive && selectedReviewEvent ? (
        <div
          className={`review-event-card ${isLandscape ? "review-event-card--landscape" : "review-event-card--portrait"}`}
          role="status"
          aria-live="polite"
        >
          <div className="review-event-card-head">
            <div className="review-event-card-title">Event detail</div>
            <button
              type="button"
              className="review-event-card-close"
              aria-label="Close event detail"
              onClick={() => {
                setSelectedReviewEventId(null);
              }}
            >
              ×
            </button>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Type</span>
            <span className="review-event-card-row-value">{getReviewEventTypeLabel(selectedReviewEvent.type)}</span>
          </div>
          {selectedReviewKickoutTagLabel ? (
            <div className="review-event-card-row">
              <span className="review-event-card-row-label">K/O Tag</span>
              <span className="review-event-card-row-value">{selectedReviewKickoutTagLabel}</span>
            </div>
          ) : null}
          {selectedReviewEvent.kind === "TURNOVER_WON" || selectedReviewEvent.kind === "TURNOVER_LOST" ? (
            getTurnoverTagLabel(selectedReviewEvent.tags) ? (
              <div className="review-event-card-row">
                <span className="review-event-card-row-label">T/O Tag</span>
                <span className="review-event-card-row-value">{getTurnoverTagLabel(selectedReviewEvent.tags)}</span>
              </div>
            ) : null
          ) : null}
          {selectedReviewEvent.kind === "SHOT" ? (
            getShotTagLabel(selectedReviewEvent.tags) ? (
              <div className="review-event-card-row">
                <span className="review-event-card-row-label">Shot Tag</span>
                <span className="review-event-card-row-value">{getShotTagLabel(selectedReviewEvent.tags)}</span>
              </div>
            ) : null
          ) : null}
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Player</span>
            <span className="review-event-card-row-value">{selectedReviewPlayerLabel}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Half</span>
            <span className="review-event-card-row-value">{selectedReviewEvent.period}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Segment</span>
              <span className="review-event-card-row-value">{getSegmentDisplayLabel(selectedReviewEvent.segment)}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Time</span>
            <span className="review-event-card-row-value">
              {formatMatchClock(selectedReviewEvent.matchClockSeconds)}
            </span>
          </div>
        </div>
      ) : null}
      <div className="match-stopwatch" aria-live="polite">
        <span className="match-stopwatch-state">{matchStateToken}</span>
        <span className="match-stopwatch-clock">{formatMatchClock(matchTimeSeconds)}</span>
        <div className="match-stopwatch-controls">
          {contextualAction ? (
            <button
              type="button"
              className="match-stopwatch-btn"
              onClick={contextualAction.onClick}
            >
              {contextualAction.label}
            </button>
          ) : null}
          {isPreMatchSetup && isDemoParam ? (
            <button
              type="button"
              className="match-stopwatch-btn"
              onClick={loadDemoMatch}
              title="Load Ballylanders [DEMO] 1-17 v Galty Gaels 1-12"
              style={{ background: "rgba(234,179,8,0.15)", borderColor: "rgba(234,179,8,0.5)" }}
            >
              DEMO
            </button>
          ) : null}
        </div>
      </div>
      <div
        ref={floatingControlsRef}
        className="floating-controls"
      >
          {!isLandscape && !isReviewModeActive ? ownershipToggleControl : null}
          {isPickerOpen && !isReviewModeActive ? (
            <div className={isLandscape ? "landscape-toolbar" : "event-panel"}>
              <div className="event-keyboard">
                <div className="event-keyboard-row" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                  {scoringKeyboardButtons.map((button) => {
                    const isKindAvailable = visibleEventKindSet.has(button.kind);
                    const isActive = selectedEventKind === button.kind;
                    const isOpen = openEventKeyboardMenuId === button.id;
                    return (
                      <button
                        key={`keyboard-scoring-${button.id}`}
                        type="button"
                        className={`event-keyboard-btn event-keyboard-btn--${button.tone} ${isActive ? "is-active" : ""} ${isOpen ? "is-open" : ""}`}
                        aria-expanded={isOpen}
                        onClick={() => {
                          if (!isKindAvailable || !isLoggingActive(matchState)) return;
                          setOpenEventKeyboardMenuId((prev) => (prev === button.id ? null : button.id));
                        }}
                        disabled={!isKindAvailable || !isLoggingActive(matchState)}
                      >
                        {button.label}
                      </button>
                    );
                  })}
                </div>
                <div className="event-keyboard-row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  {possessionKeyboardButtons.map((button) => {
                    const isKindAvailable = visibleEventKindSet.has(button.kind);
                    const isActive = selectedEventKind === button.kind;
                    const isOpen = openEventKeyboardMenuId === button.id;
                    return (
                      <button
                        key={`keyboard-possession-${button.id}`}
                        type="button"
                        className={`event-keyboard-btn event-keyboard-btn--${button.tone} ${isActive ? "is-active" : ""} ${isOpen ? "is-open" : ""}`}
                        aria-expanded={isOpen}
                        onClick={() => {
                          if (!isKindAvailable || !isLoggingActive(matchState)) return;
                          setOpenEventKeyboardMenuId((prev) => (prev === button.id ? null : button.id));
                        }}
                        disabled={!isKindAvailable || !isLoggingActive(matchState)}
                      >
                        {button.label}
                      </button>
                    );
                  })}
                </div>
                <div className="event-keyboard-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  {freeKeyboardButtons.map((button) => {
                    const isKindAvailable = visibleEventKindSet.has(button.kind);
                    const isActive = selectedEventKind === button.kind;
                    return (
                      <button
                        key={`keyboard-free-${button.kind}`}
                        type="button"
                        className={`event-keyboard-btn event-keyboard-btn--${button.tone} ${isActive ? "is-active" : ""}`}
                        onClick={() => {
                          handleEventButtonPress(button.kind);
                        }}
                        disabled={!isKindAvailable || !isLoggingActive(matchState)}
                      >
                        {button.label}
                      </button>
                    );
                  })}
                </div>
                {openEventKeyboardMenuId && openEventKeyboardMenuKind ? (
                  <div
                    className={`event-keyboard-drawer ${openEventKeyboardTone ? `event-keyboard-drawer--${openEventKeyboardTone}` : ""}`}
                    role="group"
                    aria-label="Event outcome options"
                  >
                    {openEventKeyboardMenuTitle ? (
                      <span className="event-keyboard-drawer-head">{openEventKeyboardMenuTitle}</span>
                    ) : null}
                    <div className="event-keyboard-chip-row">
                      {openEventKeyboardMenuOptions.map((option) => {
                        const isActive =
                          selectedEventKind === option.kind &&
                          option.tag != null &&
                          queuedEventTagRef.current?.kind === option.kind &&
                          queuedEventTagRef.current?.tag === option.tag;
                        return (
                          <button
                            key={`keyboard-option-${openEventKeyboardMenuId}-${option.label}-${option.tag ?? "none"}`}
                            type="button"
                            className={`event-keyboard-chip ${openEventKeyboardTone ? `event-keyboard-chip--${openEventKeyboardTone}` : ""} ${isActive ? "is-active" : ""}`}
                            onClick={() => {
                              selectEventFromKeyboardOption(option);
                            }}
                            disabled={
                              !visibleEventKindSet.has(option.kind) ||
                              !isLoggingActive(matchState) ||
                              (activeTeamSide === "opposition" && !OPPOSITION_EVENT_KINDS.has(option.kind))
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="visibility-row">
                {([
                  { id: "ALL", label: "Show All" },
                  { id: "LAST_5", label: "Last 5 mins" },
                  { id: "LAST_10", label: "Last 10 mins" },
                ] as const).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`visibility-btn ${isOutcomeFocusActive && mode.id !== "ALL" ? "utility-quiet" : ""}`}
                    onClick={() => {
                      setVisibilityMode(mode.id);
                    }}
                    style={{
                      border:
                        visibilityMode === mode.id
                          ? "1px solid rgba(125,211,252,0.9)"
                          : "1px solid rgba(148,163,184,0.4)",
                      background:
                        visibilityMode === mode.id
                          ? "rgba(14,116,144,0.42)"
                          : "rgba(15,23,42,0.9)",
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="visibility-btn"
                  aria-label="Open notes"
                  title="Open Notes"
                  onClick={openNotesPanel}
                  style={{
                    border: "1px solid rgba(125,211,252,0.62)",
                    background: "rgba(15,23,42,0.9)",
                    boxShadow: "0 0 0 1px rgba(125,211,252,0.18), 0 0 8px rgba(125,211,252,0.16)",
                  }}
                >
                  🎤
                </button>
              </div>
              <div className="undo-wrap">
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    type="button"
                    className={`undo-btn ${isOutcomeFocusActive ? "utility-quiet" : ""}`}
                    onClick={openReviewPanel}
                    style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    className={`undo-btn ${isOutcomeFocusActive ? "utility-quiet" : ""}`}
                    onClick={openMatchSummaryPanel}
                    style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                  >
                    Match Summary
                  </button>
                  <button
                    type="button"
                    className="undo-btn"
                    onClick={() => {
                      undoLastEventAction();
                      setIsPickerOpen(false);
                    }}
                    style={{ border: "1px solid rgba(148,163,184,0.4)" }}
                  >
                    Undo last
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {!isPickerOpen && !isLandscape ? (
            <div aria-live="polite" className="active-chip">
              {EVENT_LABEL_BY_KIND[selectedEventKind]}
            </div>
          ) : null}
          <button
            type="button"
            className="player-bubble-btn"
            aria-label="Open players panel"
            onClick={openPlayersPanel}
          >
            👤
          </button>
          {matchState !== "FULL_TIME" ? (
            <button
              type="button"
              className="bubble-btn bubble-btn--counts"
              aria-label="Toggle live counts"
              aria-expanded={isCountsOverlayOpen}
              onClick={toggleCountsOverlay}
              style={{
                border: isCountsOverlayOpen
                  ? "1px solid rgba(125,211,252,0.84)"
                  : "1px solid rgba(148,163,184,0.45)",
                boxShadow: isCountsOverlayOpen
                  ? "0 0 0 1px rgba(125,211,252,0.24), 0 0 12px rgba(125,211,252,0.22)"
                  : "0 0 0 1px rgba(148,163,184,0.16), 0 0 8px rgba(148,163,184,0.16)",
              }}
            >
              Cts
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (isReviewModeActive) return;
              toggleMatchBubble();
            }}
            aria-label="Toggle event picker"
            aria-expanded={!isReviewModeActive && isPickerOpen}
            className="bubble-btn"
            disabled={isReviewModeActive}
            style={{
              border: "none",
              background: "transparent",
              opacity: isReviewModeActive ? 0.52 : 1,
              boxShadow: isPickerOpen
                ? "0 5px 12px rgba(2, 8, 15, 0.28)"
                : "0 4px 10px rgba(2, 8, 15, 0.22)",
            }}
          >
            <img src="/pv-logo-icon.svg" alt="PáircVision menu" aria-hidden="true" style={EVENT_PICKER_LOGO_STYLE} />
          </button>
      </div>
        <div
          ref={hostRef}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            width: "100%",
            height: "100%",
            background: isPitchReady
              ? "transparent"
              : "radial-gradient(ellipse at center, rgba(29,90,54,0.96) 0%, rgba(29,90,54,0.88) 40%, rgba(29,90,54,0) 70%)",
            overflow: "hidden",
          }}
          aria-label="PáircVision Pixi pitch"
          role="img"
        />
      </main>
      {activePlayerChipText ? (
        <button
          type="button"
          className="utility-active-player-chip utility-active-player-chip-floating"
          aria-live="polite"
          aria-label="Clear active player"
          title="Clear active player"
          style={{ ...activePlayerChipFloatingStyle, pointerEvents: "auto" }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectActivePlayerById(null);
          }}
        >
          {activePlayerChipText}
        </button>
      ) : null}
      {utilityPanel == null ? (
        <div className={utilityControlsClass}>
          {isUtilityOpen ? (
            <div className="utility-menu" ref={utilityMenuRef} style={utilityMenuStyle}>
              <button
                type="button"
                className="utility-menu-btn"
                aria-label="Go to Home"
                title="Home"
                style={{ ...HOME_ICON_BUTTON_STYLE, marginBottom: "4px" }}
                onClick={goHome}
              >
                ⌂
              </button>
              <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86, marginTop: "2px" }}>
                Sport
              </div>
              {MODE_MENU_OPTIONS.map((option) => {
                const isActiveMode = option.key === currentMode;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className="utility-menu-btn"
                    onClick={() => {
                      setCurrentMode(option.key);
                    }}
                    style={
                      isActiveMode
                        ? {
                            border: "1px solid rgba(34,197,94,0.9)",
                            background: "rgba(22,101,52,0.72)",
                          }
                        : undefined
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                className="utility-menu-btn"
                onClick={() => {
                  saveCurrentMatchSnapshot();
                }}
                style={
                  saveFeedback === "Saved"
                    ? {
                        border: "1px solid rgba(34,197,94,0.92)",
                        background: "rgba(22,101,52,0.76)",
                      }
                    : undefined
                }
              >
                {saveFeedback === "Saved" ? "Saved" : "Save Match"}
              </button>
              <button type="button" className="utility-menu-btn" onClick={openSavedMatchesPanel}>
                Load Match
              </button>
              <button type="button" className="utility-menu-btn" onClick={openNotesPanel}>
                Notes
              </button>
              {saveFeedback ? (
                <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                  {saveFeedback}
                </div>
              ) : null}
              {saveLoadBlockedReason ? (
                <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                  {saveLoadBlockedReason}
                </div>
              ) : null}
              {lastSavedLabel ? (
                <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.8, textTransform: "none" }}>
                  Last saved: {lastSavedLabel}
                </div>
              ) : null}
              {loadedMatchLabel ? (
                <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.8, textTransform: "none" }}>
                  Loaded: {loadedMatchLabel}
                </div>
              ) : null}
              <button type="button" className="utility-menu-btn" onClick={requestResetMatch}>
                Restart Match
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="utility-bubble-btn"
            style={utilityBubbleStyle}
            aria-label="Toggle utility menu"
            aria-expanded={isUtilityOpen}
            onPointerDown={handleUtilityBubblePointerDown}
            onPointerMove={handleUtilityBubblePointerMove}
            onPointerUp={finishUtilityBubbleDrag}
            onPointerCancel={finishUtilityBubbleDrag}
            onClick={handleUtilityBubbleClick}
          >
            ⋮
          </button>
        </div>
      ) : null}
      {pendingRecoveredDraft ? (
        <div
          style={{
            position: "fixed",
            top: "max(18px, calc(env(safe-area-inset-top, 0px) + 14px))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            width: "min(88vw, 320px)",
            borderRadius: "10px",
            border: "1px solid rgba(125,211,252,0.5)",
            background: "rgba(15,23,42,0.92)",
            padding: "10px",
            display: "grid",
            gap: "8px",
          }}
          role="dialog"
          aria-label="Recovered unsaved match"
        >
          <div className="utility-panel-title" style={{ fontSize: "10px", textTransform: "none", opacity: 0.95 }}>
            Recovered unsaved match — Resume or Discard
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="utility-review-btn" onClick={resumeRecoveredMatchDraft}>
              Resume
            </button>
            <button type="button" className="utility-review-btn" onClick={discardRecoveredMatchDraft}>
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
