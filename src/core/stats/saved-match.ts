import type {
  MatchEvent,
  MatchEventKind,
  MatchEventPeriod,
  MatchEventSegment,
} from "./stats-event-model";
import type { MatchState } from "../match/match-state-store";
import type { MatchTargets } from "../../stats/matchTargets";

export type LoggedMatchEvent = MatchEvent & {
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
  team?: "HOME" | "AWAY";
  restartOwner?: "FOR" | "OPP";
};

export type SavedMatchRestoreContext = {
  matchState?: MatchState;
  currentHalf?: 1 | 2;
  matchTimeSeconds?: number;
  firstHalfAttackingDirection?: "LEFT" | "RIGHT";
  fullTimeResumeState?: {
    matchState: "FIRST_HALF" | "SECOND_HALF";
    currentHalf: 1 | 2;
    matchTimeSeconds: number;
  };
};

export type SavedMatch = {
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
  targets?: MatchTargets;
};

export const SAVED_MATCHES_STORAGE_KEY = "pitchflow_matches_v1";
export const SAVED_SQUADS_STORAGE_KEY  = "pitchflow_saved_squads_v1";

// ─── Archive retention ──────────────────────────────────────────────────────
// Every saved match is kept — there is no automatic eviction of old matches.
// Archive size is managed only by explicit user deletion (deleteSavedMatch,
// below), never by a rolling cap. Both writers into SAVED_MATCHES_STORAGE_KEY
// (Match Stats' own save path in StatsModeSurface.tsx, and Pro Tagger's
// cross-visibility save in pro-tagger-storage.ts) share this one function so
// ordering/dedupe behaviour can't drift between them.

/**
 * Orders a saved-match archive newest-first by createdAt, collapsing any
 * duplicate ids to their most recently-written copy. Does not limit array
 * length — callers that want to remove a match must do so explicitly via
 * deleteSavedMatch, not by truncating this output.
 */
export function orderSavedMatches(matches: readonly SavedMatch[]): SavedMatch[] {
  const sorted = [...matches].sort((a, b) => b.createdAt - a.createdAt);
  const seenIds = new Set<string>();
  return sorted.filter((match) => {
    if (seenIds.has(match.id)) return false;
    seenIds.add(match.id);
    return true;
  });
}

/** Removes exactly the match with the given id. Every other match is untouched. */
export function deleteSavedMatch(matches: readonly SavedMatch[], id: string): SavedMatch[] {
  return matches.filter((match) => match.id !== id);
}

/**
 * Resolves the identity a save should use: when `candidateId` matches a
 * match already in the archive, reuse its id and original createdAt so the
 * save updates that match in place (same slot, same position in the
 * newest-first order) instead of inserting a duplicate record. Returns null
 * when there is nothing to update — the caller should mint a fresh id.
 */
export function resolveSaveIdentity(
  matches: readonly SavedMatch[],
  candidateId: string,
): { id: string; createdAt: number } | null {
  const existing = matches.find((match) => match.id === candidateId);
  return existing ? { id: existing.id, createdAt: existing.createdAt } : null;
}
