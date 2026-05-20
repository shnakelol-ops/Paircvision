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
import { MATCH_EVENT_KINDS, type MatchEvent, type MatchEventKind } from "./core/stats/stats-event-model";
import { gaaModeConfig, type GaaModeKey } from "./config/gaaModeConfig";
import { NotesQuickPanel } from "./features/notes";
import VisionStadiumBackground from "./components/VisionStadiumBackground";

type VisibilityMode = "ALL" | "LAST_5" | "LAST_10";
type TeamScore = { goals: number; points: number; total: number };
type TeamSide = "HOME" | "AWAY";
type UtilityPanel = "PLAYERS" | "REVIEW" | "SUMMARY" | "SAVED_MATCHES" | "NOTES" | null;
type ReviewHalf = "H1" | "H2" | "FULL";
type ReviewEventFilter =
  | "ALL"
  | "SCORES"
  | "GOAL"
  | "POINT"
  | "TWO_POINT"
  | "SHOT"
  | "WIDE"
  | "TURNOVER_WON"
  | "TURNOVER_LOST"
  | "KICKOUT_WON"
  | "KICKOUT_LOST"
  | "FREE_WON"
  | "FREE_CONCEDED";
type ReviewZone = "FULL" | "OWN_HALF" | "OPPOSITION_HALF";
type AttackingDirection = "LEFT" | "RIGHT";
type PlayerRole = "STARTER" | "SUB";
type SquadPlayer = { id: string; name: string; number: number; role: PlayerRole };
type Squad = { id: string; name: string; players: SquadPlayer[] };
type SavedSquadPlayer = { id: string; number: number; name: string };
type SavedSquad = {
  id: string;
  name: string;
  players: SavedSquadPlayer[];
  updatedAt: number;
};
type WakeLockSentinelLike = { release: () => Promise<void> } | null;
type LoggedMatchEvent = MatchEvent & {
  playerId?: string;
  playerName?: string;
  playerNumber?: number;
  squadId?: string;
  team?: TeamSide;
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

const REVIEW_FILTER_OPTIONS_BASE: ReadonlyArray<{ id: ReviewEventFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "SCORES", label: "Scores" },
  { id: "GOAL", label: "GOAL" },
  { id: "POINT", label: "POINT" },
  { id: "TWO_POINT", label: "TWO_POINT" },
  { id: "SHOT", label: "SHOT" },
  { id: "WIDE", label: "WIDE" },
  { id: "TURNOVER_WON", label: "T+" },
  { id: "TURNOVER_LOST", label: "T-" },
  { id: "KICKOUT_WON", label: "K+" },
  { id: "KICKOUT_LOST", label: "K-" },
  { id: "FREE_WON", label: "F+" },
  { id: "FREE_CONCEDED", label: "F-" },
];
const REVIEW_FILTER_KINDS: Record<
  Exclude<ReviewEventFilter, "ALL">,
  readonly MatchEventKind[]
> = {
  SCORES: ["GOAL", "POINT", "TWO_POINTER", "FREE_SCORED", "FORTY_FIVE_TWO_POINT"],
  GOAL: ["GOAL"],
  POINT: ["POINT"],
  TWO_POINT: ["TWO_POINTER", "FORTY_FIVE_TWO_POINT"],
  SHOT: ["SHOT"],
  WIDE: ["WIDE"],
  TURNOVER_WON: ["TURNOVER_WON"],
  TURNOVER_LOST: ["TURNOVER_LOST"],
  KICKOUT_WON: ["KICKOUT_WON"],
  KICKOUT_LOST: ["KICKOUT_CONCEDED"],
  FREE_WON: ["FREE_WON"],
  FREE_CONCEDED: ["FREE_CONCEDED"],
};
const MATCH_EVENT_KIND_SET = new Set<MatchEventKind>(MATCH_EVENT_KINDS);
function buildReviewFilterOptions(
  isHurlingMode: boolean,
): ReadonlyArray<{ id: ReviewEventFilter; label: string }> {
  return REVIEW_FILTER_OPTIONS_BASE
    .filter((option) => !(isHurlingMode && option.id === "TWO_POINT"))
    .map((option) => {
      if (option.id === "KICKOUT_WON") return { ...option, label: isHurlingMode ? "P+" : "K+" };
      if (option.id === "KICKOUT_LOST") return { ...option, label: isHurlingMode ? "P-" : "K-" };
      return option;
    });
}

function parseStoredLoggedMatchEvent(input: unknown): LoggedMatchEvent | null {
  if (!input || typeof input !== "object") return null;
  const maybeId = "id" in input ? input.id : null;
  const maybeKind = "kind" in input ? input.kind : null;
  const maybeNx = "nx" in input ? input.nx : null;
  const maybeNy = "ny" in input ? input.ny : null;
  const maybeHalf = "half" in input ? input.half : null;
  const maybeTimestamp = "timestamp" in input ? input.timestamp : null;

  if (typeof maybeId !== "string" || maybeId.trim().length === 0) return null;
  if (typeof maybeKind !== "string" || !MATCH_EVENT_KIND_SET.has(maybeKind as MatchEventKind)) return null;
  if (typeof maybeNx !== "number" || !Number.isFinite(maybeNx)) return null;
  if (typeof maybeNy !== "number" || !Number.isFinite(maybeNy)) return null;
  if (maybeHalf !== 1 && maybeHalf !== 2) return null;
  if (typeof maybeTimestamp !== "number" || !Number.isFinite(maybeTimestamp)) return null;

  const next: LoggedMatchEvent = {
    id: maybeId,
    kind: maybeKind as MatchEventKind,
    nx: maybeNx,
    ny: maybeNy,
    half: maybeHalf,
    timestamp: maybeTimestamp,
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

  const maybeTeam = "team" in input ? input.team : null;
  if (maybeTeam === "HOME" || maybeTeam === "AWAY") {
    next.team = maybeTeam;
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
  if (typeof maybeCreatedAt !== "number" || !Number.isFinite(maybeCreatedAt) || maybeCreatedAt <= 0) return null;
  if (typeof maybeLabel !== "string" || maybeLabel.trim().length === 0) return null;
  if (typeof maybeHomeTeamName !== "string" || maybeHomeTeamName.trim().length === 0) return null;
  if (typeof maybeAwayTeamName !== "string" || maybeAwayTeamName.trim().length === 0) return null;
  if (typeof maybeVenue !== "string" || maybeVenue.trim().length === 0) return null;
  if (!Array.isArray(maybeEvents) || maybeEvents.length === 0) return null;
  if (typeof maybeEventCount !== "number" || !Number.isFinite(maybeEventCount)) return null;
  if (typeof maybeScorelineSnapshot !== "string" || maybeScorelineSnapshot.trim().length === 0) return null;

  const parsedEvents = maybeEvents.map((event) => parseStoredLoggedMatchEvent(event));
  if (parsedEvents.some((event) => event == null)) return null;
  const events = parsedEvents.filter((event): event is LoggedMatchEvent => event != null);
  if (events.length === 0) return null;
  if (Math.floor(maybeEventCount) !== events.length) return null;
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
    createdAt: maybeCreatedAt,
    label: maybeLabel.trim().slice(0, 64),
    homeTeamName: maybeHomeTeamName.trim().slice(0, 24),
    awayTeamName: maybeAwayTeamName.trim().slice(0, 24),
    venue: maybeVenue.trim().slice(0, 64),
    events,
    eventCount: events.length,
    scorelineSnapshot: maybeScorelineSnapshot.trim().slice(0, 120),
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
      .map((event) => event.timestamp)
      .filter((timestamp) => Number.isFinite(timestamp));
    const halfTwoTimes = record.events
      .filter((event) => event.half === 2)
      .map((event) => event.timestamp)
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

function createDefaultSquad(): Squad {
  return {
    id: `squad-${newLocalEventId()}`,
    name: "HOME",
    players: [],
  };
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
  return {
    id: nextId,
    name: nextName,
    number: parsedNumber,
    role: nextRole,
  };
}

function parseStoredSquads(input: string | null): Squad[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const maybeId = "id" in item ? item.id : null;
        const maybeName = "name" in item ? item.name : null;
        const maybePlayers = "players" in item ? item.players : null;
        if (typeof maybeId !== "string" || typeof maybeName !== "string") return null;
        if (!Array.isArray(maybePlayers)) return null;
        const players = maybePlayers
          .map((player, idx) => parseStoredPlayer(player, idx))
          .filter((player): player is SquadPlayer => player !== null);
        return {
          id: maybeId,
          name: maybeName.slice(0, 24),
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
  if (typeof maybeId !== "string" || maybeId.trim().length === 0) return null;
  if (typeof maybeNumber !== "number" || !Number.isFinite(maybeNumber)) return null;
  if (typeof maybeName !== "string") return null;
  const trimmedName = maybeName.trim().slice(0, 24);
  if (trimmedName.length === 0) return null;
  return {
    id: maybeId,
    number: Math.max(1, Math.min(99, Math.floor(maybeNumber))),
    name: trimmedName,
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
    if (!event.playerId) return null;
    const existing = playerNotes.get(event.playerId);
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
    playerNotes.set(event.playerId, created);
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
  reviewEventFilter: ReviewEventFilter,
  reviewFilterKinds: Record<
    Exclude<ReviewEventFilter, "ALL">,
    readonly MatchEventKind[]
  >,
  reviewZone: ReviewZone,
  attackingDirection: AttackingDirection,
  reviewActivePlayerOnly: boolean,
  activePlayerId: string | null,
): LoggedMatchEvent[] {
  const filterKinds =
    reviewEventFilter === "ALL"
      ? null
      : new Set<MatchEventKind>(reviewFilterKinds[reviewEventFilter]);
  return events.filter((event) => {
    if (event.id.includes("-instant-score-")) return false;

    if (reviewHalf === "H1" && event.half !== 1) return false;
    if (reviewHalf === "H2" && event.half !== 2) return false;

    if (filterKinds && !filterKinds.has(event.kind)) return false;
    if (reviewActivePlayerOnly && activePlayerId != null && event.playerId !== activePlayerId) return false;

    const isAttackingHalf = attackingDirection === "RIGHT" ? event.nx >= 0.5 : event.nx < 0.5;
    if (reviewZone === "OWN_HALF" && isAttackingHalf) return false;
    if (reviewZone === "OPPOSITION_HALF" && !isAttackingHalf) return false;

    return true;
  });
}

type LiveSessionSignatureInput = {
  currentMode: GaaModeKey;
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

function getReadableEventButtonLabel(label: string): string {
  if (label === "T+") return "TURNOVER +";
  if (label === "T-" || label === "T−") return "TURNOVER -";
  if (label === "K+") return "KICKOUT +";
  if (label === "K-" || label === "K−") return "KICKOUT -";
  if (label === "F+") return "FREE +";
  if (label === "F-" || label === "F−") return "FREE -";
  if (label === "FS") return "FREE SCORED";
  if (label === "FM") return "FREE MISSED";
  return label;
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
  return [
    `${safeShareLabel(input.homeTeamName, "Team A")} ${formatGaelicScore(input.homeScore)} (${safeShareCount(input.homeScore.total)})`,
    `${safeShareLabel(input.awayTeamName, "Team B")} ${formatGaelicScore(input.awayScore)} (${safeShareCount(input.awayScore.total)})`,
    "",
    `📍 Venue: ${safeShareLabel(input.venueLabel, "Unknown venue")}`,
    `⏱ State: ${safeShareLabel(input.stateLabel, "Unknown")}`,
    `🕒 Clock: ${safeShareLabel(input.clockLabel, "00:00")}`,
    "",
    "📊 Match Summary",
    `Events: ${safeShareCount(input.eventCount)}`,
    `Goals: ${safeShareCount(input.liveCounts.goals)}`,
    `Points: ${safeShareCount(input.liveCounts.points)}`,
    `Shots: ${safeShareCount(input.liveCounts.shots)}`,
    `Wides: ${safeShareCount(input.liveCounts.wides)}`,
    "",
    "🔁 Coaching Metrics",
    `Turnovers: ${safeShareCount(input.liveCounts.turnoverWon)} won / ${safeShareCount(input.liveCounts.turnoverLost)} lost`,
    `Kickouts: ${safeShareCount(input.liveCounts.kickoutWon)} won / ${safeShareCount(input.liveCounts.kickoutLost)} lost`,
    `Frees: ${safeShareCount(input.liveCounts.freeWon)} won / ${safeShareCount(input.liveCounts.freeConceded)} conceded`,
  ].join("\n");
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

.event-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 20, 35, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 8px 18px rgba(4, 12, 24, 0.26);
  width: min(calc(100vw - 32px), 308px);
  max-width: 95vw;
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 3px;
}

.event-btn {
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 8.8px;
  line-height: 1.1;
  padding: 5px 4px;
  min-height: 27px;
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
  letter-spacing: 0.18px;
  font-weight: 700;
  text-transform: uppercase;
  transition: box-shadow 140ms ease, transform 120ms ease;
}

.event-btn:hover {
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.16), 0 0 10px rgba(148, 163, 184, 0.14);
}

.event-btn:active {
  transform: translateY(0.5px);
}

.event-btn:disabled,
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

.event-btn:disabled:hover,
.event-btn:disabled:active,
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
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(10, 20, 35, 0.82);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 16px rgba(4, 12, 24, 0.28);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
}

.review-strip--portrait {
  top: max(96px, calc(env(safe-area-inset-top) + 92px));
}

.review-strip--landscape {
  top: max(8px, env(safe-area-inset-top));
}

.review-strip-chip {
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.88);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  padding: 0 8px;
  cursor: pointer;
  flex: 0 0 auto;
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
      return [createDefaultSquad()];
    }
    const parsed = parseStoredSquads(safeReadLocalStorage(SQUADS_STORAGE_KEY));
    return parsed.length > 0 ? parsed : [createDefaultSquad()];
  });
  const [savedSquads, setSavedSquads] = useState<SavedSquad[]>(() => {
    if (typeof window === "undefined") return [];
    return parseStoredSavedSquads(safeReadLocalStorage(SAVED_SQUADS_STORAGE_KEY));
  });
  const [activeSquadId, setActiveSquadId] = useState("");
  const [squadDraft, setSquadDraft] = useState("");
  const [activePlayer, setActivePlayer] = useState<string | null>(null);
  const [activePlayerNumber, setActivePlayerNumber] = useState<number | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [playerDraft, setPlayerDraft] = useState("");
  const [showPlayerInitials] = useState(true);
  const [reviewHalf, setReviewHalf] = useState<ReviewHalf>("FULL");
  const [reviewEventFilter, setReviewEventFilter] = useState<ReviewEventFilter>("ALL");
  const [reviewActivePlayerOnly, setReviewActivePlayerOnly] = useState(false);
  const [reviewZone, setReviewZone] = useState<ReviewZone>("FULL");
  const [showReviewHeatmap, setShowReviewHeatmap] = useState(false);
  const [firstHalfAttackingDirection, setFirstHalfAttackingDirection] =
    useState<AttackingDirection>("RIGHT");
  const [showReviewStrip, setShowReviewStrip] = useState(false);
  const [selectedReviewEventId, setSelectedReviewEventId] = useState<string | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<readonly LoggedMatchEvent[]>([]);
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>(() => readSavedMatchesFromStorage().matches);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
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
  const activePlayerRef = useRef<string | null>(null);
  const activePlayerNumberRef = useRef<number | null>(null);
  const activePlayerIdRef = useRef<string | null>(null);
  const activePlayerEntryRef = useRef<SquadPlayer | null>(null);
  const reviewHalfRef = useRef<ReviewHalf>("FULL");
  const reviewEventFilterRef = useRef<ReviewEventFilter>("ALL");
  const reviewActivePlayerOnlyRef = useRef(false);
  const reviewZoneRef = useRef<ReviewZone>("FULL");
  const firstHalfAttackingDirectionRef = useRef<AttackingDirection>("RIGHT");
  const pendingScorerRef = useRef<{ name: string; number: number; squadId: string } | null>(null);
  const activeSquadIdRef = useRef("");
  const homeNameInputRef = useRef<HTMLInputElement>(null);
  const awayNameInputRef = useRef<HTMLInputElement>(null);
  const venueInputRef = useRef<HTMLInputElement>(null);
  const matchEngineStateRef = useRef(createInitialMatchEngineState());
  const fullTimeResumeStateRef = useRef<MatchEngineState | null>(null);
  const currentMatchIdRef = useRef(currentMatchId);
  const savedSessionSignatureRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike>(null);
  const secondHalfSwitchBaselineEventCountRef = useRef<number | null>(null);
  const eventKindSwitchBaselineEventCountRef = useRef<number | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const EVENT_BUTTONS = mode.eventButtons;
  const EVENT_LABEL_BY_KIND = mode.eventLabels;
  const isHurlingMode = currentMode === "hurling" || currentMode === "camogie";
  const REVIEW_FILTER_OPTIONS = useMemo(
    () => buildReviewFilterOptions(isHurlingMode),
    [isHurlingMode],
  );
  const REVIEW_FILTER_KINDS_FOR_MODE = useMemo(() => {
    if (!isHurlingMode) return REVIEW_FILTER_KINDS;
    return {
      ...REVIEW_FILTER_KINDS,
      TWO_POINT: [] as readonly MatchEventKind[],
    };
  }, [isHurlingMode]);
  const AWAY_INSTANT_SCORING_KINDS = useMemo(
    () => new Set<MatchEventKind>(mode.scoringEvents),
    [mode],
  );
  const SCORE_EVENT_KINDS = useMemo(
    () => new Set<MatchEventKind>(mode.scoringEvents),
    [mode],
  );
  const handleRef = useRef<{
    destroy: () => void;
    setEvents: (events: readonly import("./core/stats/stats-event-model").MatchEvent[]) => void;
    setActiveEventKind: (kind: MatchEventKind) => void;
    undoLastEvent: () => void;
    setShowPlayerInitials: (show: boolean) => void;
    setOnMarkerTap: (handler: ((eventId: string) => void) | null) => void;
    setHeatmapEnabled: (enabled: boolean) => void;
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
  const activeSquad =
    squads.find((squad) => squad.id === activeSquadId) ?? squads[0] ?? createDefaultSquad();
  const activeSquadPlayers = activeSquad.players;
  const activePlayerEntry = activePlayer
    ? activeSquadPlayers.find(
        (player) => player.name === activePlayer && player.number === (activePlayerNumber ?? -1),
      ) ??
      activeSquadPlayers.find((player) => player.name === activePlayer) ??
      null
    : null;

  const setActiveSquadById = (nextSquadId: string) => {
    setActiveSquadId(nextSquadId);
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
    activePlayerRef.current = null;
    activePlayerNumberRef.current = null;
    activePlayerIdRef.current = null;
    setPlayerDraft("");
  };

  const updateActiveSquadPlayers = (
    updater: (prevPlayers: SquadPlayer[]) => SquadPlayer[],
    nextActivePlayerId?: string | null,
  ) => {
    const nextPlayersForActiveSquad = updater([...activeSquad.players]);
    const nextSelectedPlayer =
      nextActivePlayerId === undefined
        ? undefined
        : nextPlayersForActiveSquad.find((player) => player.id === nextActivePlayerId) ?? null;
    setSquads((prevSquads) =>
      prevSquads.map((squad) =>
        squad.id === activeSquad.id ? { ...squad, players: nextPlayersForActiveSquad } : squad,
      ),
    );
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
      return;
    }
    setActivePlayer(player.name);
    setActivePlayerNumber(player.number);
    setActivePlayerId(player.id);
    activePlayerRef.current = player.name;
    activePlayerNumberRef.current = player.number;
    activePlayerIdRef.current = player.id;
  };

  const toggleActivePlayerById = (playerId: string) => {
    if (activePlayerEntry?.id === playerId) {
      selectActivePlayerById(null);
      return;
    }
    selectActivePlayerById(playerId);
  };

  const handlePlayerPick = (player: SquadPlayer) => {
    toggleActivePlayerById(player.id);
    closeUtilityPanel();
    setIsUtilityOpen(false);
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
      })),
      updatedAt: Date.now(),
    };
    setSavedSquads((prev) => {
      const withoutCurrent = prev.filter((entry) => entry.id !== snapshot.id);
      return [snapshot, ...withoutCurrent].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  };

  const loadSavedSquadIntoActive = (savedSquad: SavedSquad) => {
    const restoredPlayers: SquadPlayer[] = savedSquad.players.map((player, idx) => ({
      id: player.id,
      number: Math.max(1, Math.min(99, Math.floor(player.number))),
      name: player.name.slice(0, 24),
      role: idx < 15 ? "STARTER" : "SUB",
    }));
    setSquads((prevSquads) => {
      const nextActiveSquad: Squad = {
        id: savedSquad.id,
        name: savedSquad.name.slice(0, 24) || "HOME",
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
  };

  const logAwayInstantScore = (kind: MatchEventKind) => {
    setLoggedEvents((prev) => {
      const next = [
        ...prev,
        {
          id: `team-away-instant-score-${newLocalEventId()}`,
          kind,
          nx: 0,
          ny: 0,
          half: matchEngineStateRef.current.currentHalf,
          timestamp: matchEngineStateRef.current.matchTimeSeconds,
        },
      ];
      if (import.meta.env.DEV) {
        console.assert(
          next.length === prev.length + 1,
          "[stats-events] Away instant score should append exactly one event",
          { previousCount: prev.length, nextCount: next.length, kind },
        );
      }
      return next;
    });
  };

  const handleEventButtonPress = (kind: MatchEventKind) => {
    if (!isLoggingActive(matchState)) return;
    if (activeTeam === "AWAY" && AWAY_INSTANT_SCORING_KINDS.has(kind)) {
      selectEventKind(kind);
      logAwayInstantScore(kind);
      return;
    }
    if (activeTeam === "AWAY") return;
    selectEventKind(kind);
  };

  const closeAllStatsMenus = useCallback(() => {
    setUtilityPanel(null);
    setShowReviewStrip(false);
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
    setIsCountsOverlayOpen(false);
    setIsFullTimeActionsOpen(false);
    setIsResetConfirmOpen(false);
  }, []);

  const toggleMatchBubble = () => {
    if (isPickerOpen) {
      setIsPickerOpen(false);
      return;
    }
    closeAllStatsMenus();
    setIsPickerOpen(true);
  };

  const toggleCommandBubble = () => {
    if (isUtilityOpen) {
      setIsUtilityOpen(false);
      return;
    }
    closeAllStatsMenus();
    setIsUtilityOpen(true);
  };

  const hasNonDefaultLiveSessionState =
    loggedEvents.length > 0 ||
    matchState !== "PRE_MATCH" ||
    currentHalf !== 1 ||
    matchTimeSeconds > 0 ||
    teamNames.HOME !== "Team A" ||
    teamNames.AWAY !== "Team B" ||
    venueName.trim().length > 0 ||
    currentMode !== "football";
  const liveSessionSignature = useMemo(
    () =>
      buildLiveSessionSignature({
        currentMode,
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

  const createActiveMatchDraftSnapshot = useCallback((): StatsActiveMatchDraft | null => {
    if (!hasDirtyLiveSession) return null;
    const fullTimeResumeSource = fullTimeResumeStateRef.current;
    return {
      version: 1,
      updatedAt: Date.now(),
      matchId: currentMatchIdRef.current,
      currentMode,
      activeTeam,
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
    activeTeam,
    currentHalf,
    currentMode,
    firstHalfAttackingDirection,
    hasDirtyLiveSession,
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
    if (!activePlayer) {
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
    if (activeSquadId === "") {
      setActiveSquadId(squads[0]?.id ?? "");
      return;
    }
    if (squads.some((squad) => squad.id === activeSquadId)) return;
    setActiveSquadId(squads[0]?.id ?? "");
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
  }, [activeSquadId, squads]);

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
    const draft = createActiveMatchDraftSnapshot();
    if (!draft) {
      clearActiveMatchDraft();
      return;
    }
    persistActiveMatchDraft(draft);
  }, [createActiveMatchDraftSnapshot, isDraftRecoveryCheckComplete, pendingRecoveredDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, [createActiveMatchDraftSnapshot, loggedEvents.length, matchState]);

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
      setVisibleEventLimit: (limit: number | null) => void;
      setEventContext: (context: { half: 1 | 2; timestamp: number; canLog: boolean }) => void;
    } | null = null;
    void createPixiPitchSurface(host, {
      sport: mode.pitchSport,
      activeEventKind: selectedEventRef.current,
      showPlayerInitials,
      onEventLogged: (event) => {
        const teamSide = activeTeamRef.current;
        const nextEvent: LoggedMatchEvent = {
          ...event,
          id: `team-${teamSide.toLowerCase()}-${event.id}`,
          team: teamSide,
        };
        if (teamSide === "HOME") {
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
          } else if (activePlayerRef.current) {
            nextEvent.playerName = activePlayerRef.current;
            nextEvent.playerNumber = activePlayerNumberRef.current ?? undefined;
            nextEvent.squadId = activeSquadIdRef.current;
          } else {
            pendingScorerRef.current = null;
          }
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
    if (typeof window === "undefined") return;
    const typedNavigator = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!typedNavigator.wakeLock?.request) return;

    let disposed = false;
    const requestWakeLock = async () => {
      try {
        const sentinel = await typedNavigator.wakeLock?.request("screen");
        if (disposed) {
          await sentinel?.release?.();
          return;
        }
        wakeLockRef.current = sentinel ?? null;
      } catch {
        wakeLockRef.current = null;
      }
    };

    const releaseWakeLock = async () => {
      try {
        await wakeLockRef.current?.release?.();
      } catch {
        // Fail silently if release is rejected.
      } finally {
        wakeLockRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    if (document.visibilityState === "visible") {
      void requestWakeLock();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void releaseWakeLock();
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
    reviewEventFilterRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    reviewActivePlayerOnlyRef.current = false;
    setReviewHalf("H2");
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
    closeAllStatsMenus();
    setIsFullTimeActionsOpen(true);
  };

  const toggleCountsOverlay = () => {
    if (matchState === "FULL_TIME") return;
    if (isCountsOverlayOpen) {
      setIsCountsOverlayOpen(false);
      return;
    }
    closeAllStatsMenus();
    setIsCountsOverlayOpen(true);
  };

  const toggleFullTimeActionsPanel = () => {
    if (isFullTimeActionsOpen) {
      setIsFullTimeActionsOpen(false);
      return;
    }
    closeAllStatsMenus();
    setIsFullTimeActionsOpen(true);
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
    closeAllStatsMenus();
    setUtilityPanel("PLAYERS");
  };

  const openReviewPanel = () => {
    closeAllStatsMenus();
    setShowReviewStrip(true);
  };

  const openMatchSummaryPanel = () => {
    closeAllStatsMenus();
    setUtilityPanel("SUMMARY");
  };

  const openSavedMatchesPanel = () => {
    closeAllStatsMenus();
    setSavedMatches(readSavedMatchesFromStorage().matches);
    setUtilityPanel("SAVED_MATCHES");
    setSaveLoadBlockedReason(null);
  };

  const openNotesPanel = () => {
    closeAllStatsMenus();
    setUtilityPanel("NOTES");
  };

  const saveCurrentMatchSnapshot = () => {
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
      setSaveFeedback("Match saved");
      setLastSavedAtMillis(savedRecord.createdAt);
      setSaveLoadBlockedReason(null);
    } catch {
      setSaveFeedback("Save failed — storage unavailable. Do not close this match yet.");
    }
  };

  const shareOrExportMatch = async () => {
    const homeTeamName = safeShareLabel(teamNames.HOME, "Team A");
    const awayTeamName = safeShareLabel(teamNames.AWAY, "Team B");
    const summaryText = buildMatchShareSummaryText({
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

    const shareData: ShareData = {
      title: `${homeTeamName} v ${awayTeamName}`,
      text: summaryText,
    };
    const navWithShare = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData) => boolean;
    };

    if (typeof navWithShare.share === "function") {
      const canShare = typeof navWithShare.canShare === "function" ? navWithShare.canShare(shareData) : true;
      if (canShare) {
        try {
          await navWithShare.share(shareData);
          setSaveFeedback("Match shared");
          return;
        } catch {
          // Fall through to export/copy fallback.
        }
      }
    }

    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(summaryText);
        copied = true;
      } catch {
        copied = false;
      }
    }

    const fileSafeLabel = `${homeTeamName}-${awayTeamName}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const exportFileName = `${fileSafeLabel || "match"}-summary.txt`;
    const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setSaveFeedback(copied ? "Summary copied + exported" : "Summary exported");
  };

  const loadSavedMatchRecord = (record: SavedMatch) => {
    const parsedRecord = parseStoredSavedMatch(record);
    if (!parsedRecord || parsedRecord.events.length === 0) {
      setSaveLoadBlockedReason("Load blocked: saved match is invalid.");
      return;
    }
    if (hasDirtyLiveSession) {
      const confirmed = window.confirm("Loading this saved match will replace your current live session. Continue?");
      if (!confirmed) return;
    }
    const loadedMatchId =
      parsedRecord.id.trim().length > 0 ? parsedRecord.id : newMatchSessionId("loaded");
    setCurrentMatchId(loadedMatchId);
    currentMatchIdRef.current = loadedMatchId;
    setLoggedEvents(parsedRecord.events);
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
    closeAllStatsMenus();
    setIsFullTimeActionsOpen(restoredContext.engineState.matchState === "FULL_TIME");
    handleRef.current?.setEventContext({
      half: restoredContext.engineState.currentHalf,
      timestamp: restoredContext.engineState.matchTimeSeconds,
      canLog: isLoggingActive(restoredContext.engineState.matchState) && activeTeamRef.current === "HOME",
    });
    setSaveLoadBlockedReason(null);
    setLoadedMatchLabel(parsedRecord.label);
    savedSessionSignatureRef.current = buildLiveSessionSignature({
      currentMode,
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
    setActiveTeam(draft.activeTeam);
    activeTeamRef.current = draft.activeTeam;
    setCurrentMatchId(draftMatchId);
    currentMatchIdRef.current = draftMatchId;
    setLoggedEvents(draft.events);
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
    setFirstHalfAttackingDirection(restoredContext.firstHalfAttackingDirection);
    matchEngineStateRef.current = restoredContext.engineState;
    fullTimeResumeStateRef.current = restoredContext.fullTimeResumeState;
    setMatchState(restoredContext.engineState.matchState);
    setCurrentHalf(restoredContext.engineState.currentHalf);
    setMatchTimeSeconds(restoredContext.engineState.matchTimeSeconds);
    closeAllStatsMenus();
    setIsFullTimeActionsOpen(restoredContext.engineState.matchState === "FULL_TIME");
    handleRef.current?.setEventContext({
      half: restoredContext.engineState.currentHalf,
      timestamp: restoredContext.engineState.matchTimeSeconds,
      canLog: isLoggingActive(restoredContext.engineState.matchState) && draft.activeTeam === "HOME",
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
    reviewEventFilterRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    setReviewHalf("FULL");
    setReviewEventFilter("ALL");
    setReviewActivePlayerOnly(false);
    setReviewZone("FULL");
    setShowReviewStrip(false);
    setSelectedReviewEventId(null);
    setUtilityPanel(null);
  };

  const addPlayer = () => {
    const nextPlayerName = playerDraft.trim();
    if (nextPlayerName.length === 0) return;
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
        },
      ],
      activePlayerEntry?.id ?? nextPlayerId,
    );
    setPlayerDraft("");
  };

  const resetMatchNow = () => {
    clearActiveMatchDraft();
    savedSessionSignatureRef.current = null;
    setPendingRecoveredDraft(null);
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
    setCurrentMatchId(nextMatchId);
    currentMatchIdRef.current = nextMatchId;
    setLoggedEvents([]);
    reviewHalfRef.current = "FULL";
    reviewEventFilterRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    setReviewHalf("FULL");
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
    closeAllStatsMenus();
    setIsResetConfirmOpen(true);
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

  useEffect(() => {
    if (matchState !== "FULL_TIME") return;
    closeAllStatsMenus();
    setIsFullTimeActionsOpen(true);
  }, [closeAllStatsMenus, matchState]);

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
    const isReviewModeActive = showReviewStrip || utilityPanel === "REVIEW";
    handleRef.current?.setHeatmapEnabled(showReviewHeatmap && isReviewModeActive);
  }, [showReviewHeatmap, showReviewStrip, utilityPanel]);

  useEffect(() => {
    const isReviewModeActive = showReviewStrip || utilityPanel === "REVIEW";
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
  }, [showReviewStrip, utilityPanel]);

  useEffect(() => {
    handleRef.current?.setEvents(
      getRenderablePitchEvents(
        loggedEvents,
        reviewHalf,
        reviewEventFilter,
        REVIEW_FILTER_KINDS_FOR_MODE,
        reviewZone,
        getEffectiveAttackingDirection(firstHalfAttackingDirection, currentHalf),
        reviewActivePlayerOnly,
        activePlayerId,
      ),
    );
  }, [
    loggedEvents,
    reviewHalf,
    reviewEventFilter,
    reviewZone,
    firstHalfAttackingDirection,
    currentHalf,
    reviewActivePlayerOnly,
    activePlayerId,
    REVIEW_FILTER_KINDS_FOR_MODE,
  ]);

  useEffect(() => {
    if (!selectedReviewEventId) return;
    if (loggedEvents.some((event) => event.id === selectedReviewEventId)) return;
    setSelectedReviewEventId(null);
  }, [loggedEvents, selectedReviewEventId]);

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

  const effectiveAttackingDirection = getEffectiveAttackingDirection(
    firstHalfAttackingDirection,
    currentHalf,
  );
  const visibleReviewEvents = getRenderablePitchEvents(
    loggedEvents,
    reviewHalf,
    reviewEventFilter,
    REVIEW_FILTER_KINDS,
    reviewZone,
    effectiveAttackingDirection,
    reviewActivePlayerOnly,
    activePlayerId,
  );
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
  const isAnyStatsMainPanelOpen =
    utilityPanel !== null ||
    isUtilityOpen ||
    isCountsOverlayOpen ||
    isFullTimeActionsOpen ||
    isResetConfirmOpen;
  const isReviewModeActive = showReviewStrip || utilityPanel === "REVIEW";
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
  const activeReviewPlayerLabel =
    activePlayerId == null ? null : (() => {
      const player = playerById.get(activePlayerId);
      return player ? `#${player.number} ${player.name}` : null;
    })();
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
            onClick={() => setActiveTeam("HOME")}
            style={
              activeTeam === "HOME"
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
            onClick={() => setActiveTeam("AWAY")}
            style={
              activeTeam === "AWAY"
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
            onClick={() => setActiveTeam("HOME")}
            aria-pressed={activeTeam === "HOME"}
            style={
              activeTeam === "HOME"
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
            onClick={() => setActiveTeam("AWAY")}
            aria-pressed={activeTeam === "AWAY"}
            style={
              activeTeam === "AWAY"
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
  const reviewPanelClass =
    isLandscape && utilityPanel === "REVIEW"
      ? `${utilityPanelClass} utility-overlay-panel--review-landscape`
      : utilityPanelClass;
  const starterPlayers = activeSquadPlayers.filter((player) => player.role === "STARTER");
  const subPlayers = activeSquadPlayers.filter((player) => player.role === "SUB");
  const formationPlayers = starterPlayers.slice(0, 15);
  const subsPlayers = subPlayers;
  const formationRows: SquadPlayer[][] = [];
  let formationCursor = 0;
  for (const rowSize of FORMATION_ROW_SIZES) {
    formationRows.push(formationPlayers.slice(formationCursor, formationCursor + rowSize));
    formationCursor += rowSize;
  }
  const activePlayerChipText =
    activePlayerEntry != null
      ? `Active: #${activePlayerEntry.number} ${activePlayerEntry.name}`
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
              Export / Share Match
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
          aria-label="Home players"
          style={playersPanelStyle}
        >
          <div className="utility-review-scroll">
          <div className="utility-panel-title">HOME Players</div>
          <div className="utility-squad-row">
            <select
              className="utility-squad-select"
              value={activeSquad.id}
              onChange={(event) => {
                setActiveSquadById(event.target.value);
              }}
              aria-label="Select home squad"
            >
              {squads.map((squad) => (
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
                        style={
                          isActive
                            ? {
                                border: "1px solid rgba(125,211,252,0.9)",
                                background: "rgba(14,116,144,0.38)",
                              }
                            : undefined
                        }
                      >
                        {isActive ? "● " : ""}
                        #{player.number} {player.name}
                      </button>
                    );
                  })}
                </div>
              ) : null,
            )}
          </div>
          {subsPlayers.length > 0 ? (
            <div className="utility-subs-wrap">
              <div className="utility-subs-title">Subs</div>
              <div className="utility-subs-row" aria-label="Home substitutes">
                {subsPlayers.map((player, idx) => {
                  const isActive = activePlayerEntry?.id === player.id;
                  return (
                    <button
                      key={`sub-${idx}-${player.id}`}
                      type="button"
                      className="utility-player-pill"
                      onClick={() => {
                        handlePlayerPick(player);
                      }}
                      onDoubleClick={() => {
                        editPlayer(player.id);
                      }}
                      style={
                        isActive
                          ? {
                              border: "1px solid rgba(125,211,252,0.9)",
                              background: "rgba(14,116,144,0.38)",
                            }
                          : undefined
                      }
                    >
                      {isActive ? "● " : ""}
                      #{player.number} {player.name}
                    </button>
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
      {utilityPanel === "REVIEW" ? (
        <div className={reviewPanelClass} role="dialog" aria-label="Review mode">
          <div className="utility-review-scroll">
            <div className="utility-panel-title">Review</div>
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86 }}>
              Half
            </div>
            {([
              { id: "H1", label: "H1" },
              { id: "H2", label: "H2" },
              { id: "FULL", label: "FULL" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  setReviewHalf(option.id);
                  setShowReviewStrip(true);
                  closeUtilityPanel();
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
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86 }}>
              Event Filter
            </div>
            {REVIEW_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  setReviewEventFilter(option.id);
                  setShowReviewStrip(true);
                  closeUtilityPanel();
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
              className="utility-review-btn"
              onClick={() => {
                setReviewActivePlayerOnly((prev) => !prev);
                setShowReviewStrip(true);
                closeUtilityPanel();
              }}
              style={
                reviewActivePlayerOnly
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              ACTIVE
            </button>
            <button
              type="button"
              className="utility-review-btn"
              onClick={() => {
                setShowReviewHeatmap((prev) => !prev);
                setShowReviewStrip(true);
                closeUtilityPanel();
              }}
              style={
                showReviewHeatmap
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              HEATMAP {showReviewHeatmap ? "ON" : "OFF"}
            </button>
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86 }}>
              Zone
            </div>
            {([
              { id: "FULL", label: "FULL" },
              { id: "OWN_HALF", label: "OWN HALF" },
              { id: "OPPOSITION_HALF", label: "OPP HALF" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  setReviewZone(option.id);
                  setShowReviewStrip(true);
                  closeUtilityPanel();
                }}
                style={
                  reviewZone === option.id
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
            <div
              className="utility-panel-title"
              style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}
            >
              {visibleReviewEvents.length} events shown
            </div>
            {reviewActivePlayerOnly && activePlayerId && activeReviewPlayerLabel ? (
              <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                ACTIVE: {activeReviewPlayerLabel} · {visibleReviewEvents.length} events
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
      {showReviewStrip && utilityPanel !== "REVIEW" && !isAnyStatsMainPanelOpen ? (
        <div
          className={`review-strip ${isLandscape ? "review-strip--landscape" : "review-strip--portrait"}`}
          role="toolbar"
          aria-label="Review quick controls"
        >
          {([
            { id: "H1", label: "H1" },
            { id: "H2", label: "H2" },
            { id: "FULL", label: "FULL" },
          ] as const).map((option) => (
            <button
              key={`strip-half-${option.id}`}
              type="button"
              className="review-strip-chip"
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
              setReviewActivePlayerOnly((prev) => !prev);
            }}
            style={
              reviewActivePlayerOnly
                ? {
                    border: "1px solid rgba(125,211,252,0.9)",
                    background: "rgba(14,116,144,0.38)",
                  }
                : undefined
            }
          >
            ACTIVE
          </button>
          <button
            type="button"
            className="review-strip-chip"
            onClick={() => {
              setShowReviewHeatmap((prev) => !prev);
            }}
            style={
              showReviewHeatmap
                ? {
                    border: "1px solid rgba(125,211,252,0.9)",
                    background: "rgba(14,116,144,0.38)",
                  }
                : undefined
            }
          >
            Heatmap {showReviewHeatmap ? "ON" : "OFF"}
          </button>
          {([
            { id: "OWN_HALF", label: "DEF HALF" },
            { id: "OPPOSITION_HALF", label: "ATT HALF" },
          ] as const).map((option) => (
            <button
              key={`strip-zone-${option.id}`}
              type="button"
              className="review-strip-chip"
              onClick={() => {
                setReviewZone(option.id);
              }}
              style={
                reviewZone === option.id
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
            onClick={exitReviewMode}
            style={{ border: "1px solid rgba(248,113,113,0.68)", background: "rgba(127,29,29,0.35)" }}
          >
            Exit
          </button>
        </div>
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
            <span className="review-event-card-row-value">{selectedReviewEvent.kind}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Player</span>
            <span className="review-event-card-row-value">{selectedReviewPlayerLabel}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Half</span>
            <span className="review-event-card-row-value">H{selectedReviewEvent.half}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Time</span>
            <span className="review-event-card-row-value">
              {formatMatchClock(selectedReviewEvent.timestamp)}
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
        </div>
      </div>
      <div
        ref={floatingControlsRef}
        className="floating-controls"
      >
          {!isLandscape && isPickerOpen && !isAnyStatsMainPanelOpen ? (
            <div className="event-panel">
              <div className="event-grid">
                {EVENT_BUTTONS.map((item, idx) => {
                  const isActive = item.kind === selectedEventKind;
                  const isScoring = idx <= 4;
                  const buttonLabel = getReadableEventButtonLabel(item.label);
                  const isDisabledForAway =
                    activeTeam === "AWAY" && !AWAY_INSTANT_SCORING_KINDS.has(item.kind);
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      className="event-btn"
                      disabled={isDisabledForAway}
                      onClick={() => {
                        handleEventButtonPress(item.kind);
                      }}
                      style={{
                        border: isActive
                          ? "1px solid rgba(34,197,94,0.96)"
                          : isScoring
                            ? "1px solid rgba(148,163,184,0.52)"
                            : "1px solid rgba(148,163,184,0.36)",
                        background: isActive
                          ? "rgba(22,101,52,0.7)"
                          : isScoring
                            ? "rgba(21, 39, 62, 0.84)"
                            : "rgba(14, 24, 40, 0.72)",
                        fontWeight: isActive ? 800 : 700,
                        opacity: isDisabledForAway ? 0.46 : 1,
                      }}
                    >
                      {buttonLabel}
                    </button>
                  );
                })}
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
                    className="visibility-btn"
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
                    className="undo-btn"
                    onClick={openReviewPanel}
                    style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    className="undo-btn"
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
          {isLandscape && isPickerOpen && !isAnyStatsMainPanelOpen ? (
            <div className="landscape-toolbar">
              <div className="landscape-toolbar-row">
                {EVENT_BUTTONS.slice(0, 5).map((item) => {
                  const isActive = item.kind === selectedEventKind;
                  const buttonLabel = getReadableEventButtonLabel(item.label);
                  const isDisabledForAway =
                    activeTeam === "AWAY" && !AWAY_INSTANT_SCORING_KINDS.has(item.kind);
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      className="landscape-toolbar-btn"
                      disabled={isDisabledForAway}
                      onClick={() => {
                        handleEventButtonPress(item.kind);
                      }}
                      style={
                        isActive || isDisabledForAway
                          ? {
                              ...(isActive
                                ? {
                                    border: "1px solid rgba(34,197,94,0.96)",
                                    background: "rgba(22,101,52,0.7)",
                                  }
                                : {}),
                              ...(isDisabledForAway ? { opacity: 0.46 } : {}),
                            }
                          : undefined
                      }
                    >
                      {buttonLabel}
                    </button>
                  );
                })}
              </div>
              <div className="landscape-toolbar-row">
                {EVENT_BUTTONS.slice(5).map((item) => {
                  const isActive = item.kind === selectedEventKind;
                  const buttonLabel = getReadableEventButtonLabel(item.label);
                  const isDisabledForAway =
                    activeTeam === "AWAY" && !AWAY_INSTANT_SCORING_KINDS.has(item.kind);
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      className="landscape-toolbar-btn"
                      disabled={isDisabledForAway}
                      onClick={() => {
                        handleEventButtonPress(item.kind);
                      }}
                      style={
                        isActive || isDisabledForAway
                          ? {
                              ...(isActive
                                ? {
                                    border: "1px solid rgba(34,197,94,0.96)",
                                    background: "rgba(22,101,52,0.7)",
                                  }
                                : {}),
                              ...(isDisabledForAway ? { opacity: 0.46 } : {}),
                            }
                          : undefined
                      }
                    >
                      {buttonLabel}
                    </button>
                  );
                })}
              </div>
              <div className="landscape-toolbar-secondary">
                {([
                  { id: "ALL", label: "Show All" },
                  { id: "LAST_5", label: "Last 5 mins" },
                  { id: "LAST_10", label: "Last 10 mins" },
                ] as const).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className="landscape-toolbar-secondary-btn"
                    onClick={() => {
                      setVisibilityMode(mode.id);
                    }}
                    style={{
                      border:
                        visibilityMode === mode.id
                          ? "1px solid rgba(125,211,252,0.9)"
                          : "1px solid rgba(148,163,184,0.36)",
                      background:
                        visibilityMode === mode.id
                          ? "rgba(14,116,144,0.4)"
                          : "rgba(15,23,42,0.84)",
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="landscape-toolbar-secondary-btn"
                  aria-label="Open notes"
                  title="Open Notes"
                  onClick={openNotesPanel}
                  style={{
                    border: "1px solid rgba(125,211,252,0.58)",
                    background: "rgba(15,23,42,0.84)",
                    boxShadow: "0 0 0 1px rgba(125,211,252,0.16), 0 0 7px rgba(125,211,252,0.14)",
                  }}
                >
                  🎤
                </button>
                <button
                  type="button"
                  className="landscape-toolbar-secondary-btn"
                  onClick={openReviewPanel}
                  style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                >
                  Review
                </button>
                <button
                  type="button"
                  className="landscape-toolbar-secondary-btn"
                  onClick={openMatchSummaryPanel}
                  style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                >
                  Match Summary
                </button>
                <button
                  type="button"
                  className="landscape-toolbar-secondary-btn"
                  onClick={() => {
                    undoLastEventAction();
                  }}
                >
                  Undo
                </button>
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
              toggleMatchBubble();
            }}
            aria-label="Toggle event picker"
            aria-expanded={isPickerOpen}
            className="bubble-btn"
            style={{
              border: "none",
              background: "transparent",
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
                  saveFeedback === "Match saved"
                    ? {
                        border: "1px solid rgba(34,197,94,0.92)",
                        background: "rgba(22,101,52,0.76)",
                      }
                    : undefined
                }
              >
                {saveFeedback === "Match saved" ? "Saved" : "Save Match"}
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
