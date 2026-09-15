// Regression coverage for the HALF_TIME persistence defect (P0-1, Event Stats
// release audit): buildSaveRecords used to derive the persisted match phase
// from halfRef.current (`halfRef.current === 2 ? "SECOND_HALF" : "FIRST_HALF"`,
// with a FULL_TIME special case) instead of trusting matchStateRef.current
// directly. halfRef only advances to 2 once "Start Second Half" is pressed,
// so for the entire length of every half-time break (matchStateRef.current
// === "HALF_TIME", halfRef.current still 1) that re-derivation silently
// collapsed the persisted phase to "FIRST_HALF". Autosave (1.2s debounce) and
// the beforeunload flush both fire during that window on every real match, so
// a reload taken during a half-time break resumed the match as if it were
// still mid-first-half with the clock frozen at ~30:00 — and every event
// tagged after that resume was stamped half:1, even though it was really
// half 2.
//
// ProTaggerLiveScreen.tsx has no React rendering harness in this repo, so
// this suite drives the exact production pieces (deriveSaveRestoreMatchState,
// resetClockForSecondHalf, adaptProTaggerAction) plus the exact production
// save->restore plumbing (savedMatchToRestoreState) through a full
// capture -> save -> reload -> resume -> tag lifecycle, mirroring the
// component's own ref/state transitions verbatim — the same pattern already
// established by ProTaggerLiveScreen.clockLifecycle.test.ts.
import { describe, it, expect } from "vitest";
import {
  deriveSaveRestoreMatchState,
  resetClockForSecondHalf,
  computeClockStartTimestamp,
  type MatchState,
} from "./ProTaggerLiveScreen";
import { savedMatchToRestoreState } from "./ProTaggerPage";
import { adaptProTaggerAction } from "./pro-tagger-adapter";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";

function min(m: number): number {
  return m * 60;
}

// The exact pre-fix derivation, reproduced here only to document/prove the
// fix changed real behaviour for this scenario (mirrors the style of
// ProTaggerLiveScreen.clockLifecycle.test.ts's "fails under pre-fix" case).
function preFixRestoreMatchState(currentMatchState: MatchState, half: 1 | 2): MatchState {
  return currentMatchState === "FULL_TIME"
    ? "FULL_TIME"
    : half === 2 ? "SECOND_HALF" : "FIRST_HALF";
}

function buildSavedMatch(overrides: Partial<ProTaggerSavedMatch> = {}): ProTaggerSavedMatch {
  return {
    id: "match-1",
    createdAt: 1000,
    homeTeamName: "Ballyboden St Enda's",
    awayTeamName: "Na Fianna",
    venue: "Pairc na nGael",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "Ballyboden St Enda's 0-04 (4) v Na Fianna 0-02 (2)",
    eventCount: 0,
    events: [],
    homeSquad: { id: "home-squad", teamSide: "HOME", players: [] },
    awaySquad: { id: "away-squad", teamSide: "AWAY", players: [] },
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState: "FIRST_HALF",
      currentHalf: 1,
      matchTimeSeconds: 0,
      firstHalfAttackingDirection: "right",
    },
    ...overrides,
  };
}

describe("Event Stats (Pro Tagger): HALF_TIME save/restore (P0-1)", () => {
  it("1. a First Half save round-trips as FIRST_HALF on reload", () => {
    const matchStateRef = { current: "FIRST_HALF" as MatchState };
    const halfRef = { current: 1 as 1 | 2 };

    const persisted = deriveSaveRestoreMatchState(matchStateRef.current);
    expect(persisted).toBe("FIRST_HALF");

    const saved = buildSavedMatch({
      restoreContext: { matchState: persisted, currentHalf: halfRef.current, matchTimeSeconds: min(12), firstHalfAttackingDirection: "right" },
    });
    const restored = savedMatchToRestoreState(saved);
    expect(restored.matchState).toBe("FIRST_HALF");
    expect(restored.half).toBe(1);
  });

  it("2 & 3. HT -> autosave -> reload restores HALF_TIME, not FIRST_HALF", () => {
    // Coach plays 1H to 30:00, then presses HT. freezeMatch("HALF_TIME") sets
    // matchStateRef to HALF_TIME but halfRef stays 1 until Start Second Half.
    const matchStateRef = { current: "FIRST_HALF" as MatchState };
    const halfRef = { current: 1 as 1 | 2 };
    matchStateRef.current = "HALF_TIME"; // freezeMatch("HALF_TIME")

    // What autosave/beforeunload persist during the HT break, using the fix.
    const persistedMatchState = deriveSaveRestoreMatchState(matchStateRef.current);
    expect(persistedMatchState).toBe("HALF_TIME");

    // Prove this is the exact scenario the old code got wrong.
    expect(preFixRestoreMatchState(matchStateRef.current, halfRef.current)).toBe("FIRST_HALF");

    const saved = buildSavedMatch({
      restoreContext: {
        matchState: persistedMatchState,
        currentHalf: halfRef.current,
        matchTimeSeconds: min(30),
        firstHalfAttackingDirection: "right",
      },
    });

    const restored = savedMatchToRestoreState(saved);
    expect(restored.matchState).toBe("HALF_TIME");
    expect(restored.matchState).not.toBe("FIRST_HALF");
    expect(restored.half).toBe(1);
    expect(restored.clockSeconds).toBe(min(30));
  });

  it("4 & 5. starting the second half after an HT reload sets half=2, and the first event tagged after that is stored as half:2", () => {
    // Continuing from the reload in test 2: restoreState.matchState is
    // HALF_TIME, so the component hydrates matchState="HALF_TIME", half=1,
    // clockSeconds=1800 — showing the correct HT break screen (isActivePlaying
    // is false for HALF_TIME) rather than the misleading "MATCH REOPENED"
    // screen the pre-fix bug produced.
    const restoreState = savedMatchToRestoreState(
      buildSavedMatch({
        restoreContext: {
          matchState: deriveSaveRestoreMatchState("HALF_TIME"),
          currentHalf: 1,
          matchTimeSeconds: min(30),
          firstHalfAttackingDirection: "right",
        },
      }),
    );

    const halfRef = { current: restoreState.half };
    const clockSecondsRef = { current: restoreState.clockSeconds };
    let clockSeconds = clockSecondsRef.current;
    const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };
    const matchStateRef = { current: restoreState.matchState };

    // Coach taps "Start Second Half" (handleStartSecondHalf).
    resetClockForSecondHalf(clockSecondsRef, setClockSeconds);
    halfRef.current = 2;
    matchStateRef.current = "SECOND_HALF";

    expect(halfRef.current).toBe(2);
    expect(clockSecondsRef.current).toBe(0);
    expect(clockSeconds).toBe(0);

    // First event tagged 5 real minutes into the (correctly zeroed) second half.
    clockSecondsRef.current = min(5);
    const event = adaptProTaggerAction({
      familyId: "POINT",
      tileLabel: "POINT",
      teamSide: "FOR",
      nx: 0.5,
      ny: 0.5,
      half: halfRef.current,
      matchClockSeconds: clockSecondsRef.current,
    });

    expect(event.half).toBe(2);
    expect(event.period).toBe("2H");
  });

  it("6. second-half match clock is correct after an HT-reload resume (period-relative, not continuing from 1H)", () => {
    const clockSecondsRef = { current: 0 };
    let clockSeconds = 0;
    const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

    // 1H ran to 30:00, HT reload restored HALF_TIME (test 2/3), coach starts 2H.
    clockSecondsRef.current = min(30);
    resetClockForSecondHalf(clockSecondsRef, setClockSeconds);
    expect(clockSecondsRef.current).toBe(0);
    expect(clockSeconds).toBe(0);

    // 2H clock now ticks period-relative from real timestamps, same anchor
    // formula as every other clock transition (start/resume/reload).
    const resumeNowMs = 5_000_000_000_000;
    const anchor = computeClockStartTimestamp(resumeNowMs, clockSecondsRef.current);
    const tenMinutesLaterMs = resumeNowMs + min(10) * 1000;
    const elapsed = Math.floor((tenMinutesLaterMs - anchor) / 1000);
    expect(elapsed).toBe(min(10)); // 10:00 into 2H, not 40:00 cumulative
  });

  it("7. pause/resume still uses the same anchor formula after this fix (unchanged)", () => {
    const pausedAtSeconds = min(37); // paused mid-second-half
    const resumeNowMs = 6_000_000_000_000;
    const anchor = computeClockStartTimestamp(resumeNowMs, pausedAtSeconds);
    expect(Math.floor((resumeNowMs - anchor) / 1000)).toBe(pausedAtSeconds);
  });

  it("FULL_TIME still round-trips as FULL_TIME (no regression on the other branch the old ternary handled)", () => {
    const persisted = deriveSaveRestoreMatchState("FULL_TIME");
    expect(persisted).toBe("FULL_TIME");
  });
});
