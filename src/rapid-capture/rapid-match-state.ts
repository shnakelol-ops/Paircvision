// Canonical match-state machine for Rapid Capture.
//
// Rapid Capture previously behaved like a bare stopwatch: a free-running
// clock plus a manually-toggled 1H/2H button, with no notion of "the half
// has ended" or "the match is over." This module makes match progression
// explicit and enforceable — capture is only ever allowed in FIRST_HALF or
// SECOND_HALF, and every transition goes through one of the functions below
// rather than ad hoc component state.
//
// Kept pure and React-free so the state machine itself is directly testable.

export type RapidMatchState = "SETUP" | "FIRST_HALF" | "HALF_TIME" | "SECOND_HALF" | "FULL_TIME";

/**
 * States a live (already-started) match can be in. SETUP precedes a match
 * even existing — it is never persisted in a RapidSavedMatch, only used by
 * the page controller before a matchId has been allocated.
 */
export const LIVE_MATCH_STATES: readonly RapidMatchState[] = [
  "FIRST_HALF",
  "HALF_TIME",
  "SECOND_HALF",
  "FULL_TIME",
];

export function isLiveMatchState(value: unknown): value is RapidMatchState {
  return LIVE_MATCH_STATES.includes(value as RapidMatchState);
}

/** The half a new event should be tagged with, derived from match state — never picked manually. */
export function halfForMatchState(matchState: RapidMatchState): 1 | 2 {
  return matchState === "SECOND_HALF" || matchState === "FULL_TIME" ? 2 : 1;
}

/** True once the half/match has ended and tagging must not be possible until explicitly resumed. */
export function isTaggingLocked(matchState: RapidMatchState): boolean {
  return matchState !== "FIRST_HALF" && matchState !== "SECOND_HALF";
}

/**
 * The single authoritative gate for whether a pitch tap may produce an
 * event: the half must be live (not SETUP/HALF_TIME/FULL_TIME) AND the
 * clock must actually be running (not merely paused mid-half).
 */
export function isCaptureAllowed(matchState: RapidMatchState, clockRunning: boolean): boolean {
  return !isTaggingLocked(matchState) && clockRunning;
}

export type PauseAction = "END_FIRST_HALF" | "END_MATCH";

/** Which end-of-half action the paused-clock panel should offer, if any. */
export function pauseActionForMatchState(matchState: RapidMatchState): PauseAction | null {
  if (matchState === "FIRST_HALF") return "END_FIRST_HALF";
  if (matchState === "SECOND_HALF") return "END_MATCH";
  return null;
}

/** HALF_TIME -> SECOND_HALF. Any other current state is left unchanged. */
export function startSecondHalf(matchState: RapidMatchState): RapidMatchState {
  return matchState === "HALF_TIME" ? "SECOND_HALF" : matchState;
}

/**
 * FIRST_HALF -> HALF_TIME, gated on an injected confirm() so the transition
 * itself is testable without touching window.confirm. Returns the input
 * state unchanged if not in FIRST_HALF, or if the coach declines to confirm.
 */
export function requestEndFirstHalf(matchState: RapidMatchState, confirm: () => boolean): RapidMatchState {
  if (matchState !== "FIRST_HALF") return matchState;
  return confirm() ? "HALF_TIME" : matchState;
}

/**
 * SECOND_HALF -> FULL_TIME, gated on an injected confirm(). Returns the
 * input state unchanged if not in SECOND_HALF, or if declined.
 */
export function requestEndMatch(matchState: RapidMatchState, confirm: () => boolean): RapidMatchState {
  if (matchState !== "SECOND_HALF") return matchState;
  return confirm() ? "FULL_TIME" : matchState;
}

/** Resuming/importing a match with no persisted matchState resumes into the half the events imply. */
export function initialMatchStateForHalf(half: 1 | 2): RapidMatchState {
  return half === 2 ? "SECOND_HALF" : "FIRST_HALF";
}

export function matchStateBadgeLabel(matchState: RapidMatchState): string {
  switch (matchState) {
    case "SETUP":
      return "Setup";
    case "FIRST_HALF":
      return "1H";
    case "HALF_TIME":
      return "Half Time";
    case "SECOND_HALF":
      return "2H";
    case "FULL_TIME":
      return "Full Time";
  }
}
