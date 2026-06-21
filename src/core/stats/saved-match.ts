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
  source?: "live" | "review";
  reviewCategory?: "OUR_KICKOUTS" | "OPP_KICKOUTS" | "OUR_SHOTS" | "OPP_SHOTS" | "TURNOVERS" | "FREES";
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
export const MAX_SAVED_MATCHES         = 10;
