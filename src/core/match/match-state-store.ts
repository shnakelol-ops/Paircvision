export type MatchState =
  | "PRE_MATCH"
  | "FIRST_HALF"
  | "HALF_TIME"
  | "SECOND_HALF"
  | "FULL_TIME";

export type MatchEngineState = {
  matchState: MatchState;
  currentHalf: 1 | 2;
  matchTimeSeconds: number;
  isRunning: boolean;
  phaseStartTimeMs: number | null;
  accumulatedElapsedSeconds: number;
};

export function createInitialMatchEngineState(): MatchEngineState {
  return {
    matchState: "PRE_MATCH",
    currentHalf: 1,
    matchTimeSeconds: 0,
    isRunning: false,
    phaseStartTimeMs: null,
    accumulatedElapsedSeconds: 0,
  };
}

function deriveElapsedSeconds(state: MatchEngineState, nowMs: number): number {
  if (!state.isRunning || state.phaseStartTimeMs == null) {
    return state.accumulatedElapsedSeconds;
  }
  const livePhaseElapsedSeconds = Math.max(0, Math.floor((nowMs - state.phaseStartTimeMs) / 1000));
  return state.accumulatedElapsedSeconds + livePhaseElapsedSeconds;
}

export function syncMatchClock(state: MatchEngineState, nowMs: number = Date.now()): MatchEngineState {
  const elapsedSeconds = deriveElapsedSeconds(state, nowMs);
  if (elapsedSeconds === state.matchTimeSeconds) return state;
  return {
    ...state,
    matchTimeSeconds: elapsedSeconds,
  };
}

export function startFirstHalf(_: MatchEngineState, nowMs: number = Date.now()): MatchEngineState {
  return {
    matchState: "FIRST_HALF",
    currentHalf: 1,
    matchTimeSeconds: 0,
    isRunning: true,
    phaseStartTimeMs: nowMs,
    accumulatedElapsedSeconds: 0,
  };
}

export function goToHalfTime(state: MatchEngineState, nowMs: number = Date.now()): MatchEngineState {
  const synced = syncMatchClock(state, nowMs);
  return {
    ...synced,
    matchState: "HALF_TIME",
    isRunning: false,
    phaseStartTimeMs: null,
    accumulatedElapsedSeconds: synced.matchTimeSeconds,
  };
}

export function startSecondHalf(_: MatchEngineState, nowMs: number = Date.now()): MatchEngineState {
  return {
    matchState: "SECOND_HALF",
    currentHalf: 2,
    matchTimeSeconds: 0,
    isRunning: true,
    phaseStartTimeMs: nowMs,
    accumulatedElapsedSeconds: 0,
  };
}

export function endMatch(state: MatchEngineState, nowMs: number = Date.now()): MatchEngineState {
  const synced = syncMatchClock(state, nowMs);
  return {
    ...synced,
    matchState: "FULL_TIME",
    isRunning: false,
    phaseStartTimeMs: null,
    accumulatedElapsedSeconds: synced.matchTimeSeconds,
  };
}

export function tickMatchClock(state: MatchEngineState, nowMs: number = Date.now()): MatchEngineState {
  if (!state.isRunning) return state;
  return syncMatchClock(state, nowMs);
}

export function isLoggingActive(matchState: MatchState): boolean {
  return matchState === "FIRST_HALF" || matchState === "SECOND_HALF";
}

export function formatMatchClock(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const ss = (clamped % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
