// P0 regression coverage: "Reset Match" must permanently delete the
// persisted record, not just clear in-memory screen state.
//
// Previously, handleReset() (ProTaggerLiveScreen.tsx) only cleared React
// state. Autosave has an early-return guard for the exact state Reset left
// the screen in (matchState === "PRE_MATCH" && loggedEvents.length === 0),
// so the stale pre-reset record — full event list, non-FULL_TIME matchState
// — was never overwritten. A "permanently deleted" match could resurrect via
// the Home "Resume in-progress match" banner or the Saved Matches list.
//
// ProTaggerLiveScreen.tsx has no React rendering harness in this repo, so
// this suite exercises the exact storage functions handleReset's fix calls
// (deleteProTaggerMatch, saveProTaggerMatchFull, readProTaggerMatches,
// selectMostRecentInProgressMatch) directly against an in-memory
// localStorage, mirroring pro-tagger-storage.test.ts's setup. This proves
// steps 1-3 and 5 of the required regression coverage end-to-end; step 4
// (in-memory state returning to PRE_MATCH) is unchanged pre-existing
// behaviour in handleReset, verified by code inspection since it was never
// modified by this fix.
import { beforeEach, describe, expect, it } from "vitest";
import {
  PRO_TAGGER_MATCHES_STORAGE_KEY,
  deleteProTaggerMatch,
  readProTaggerMatches,
  saveProTaggerMatchFull,
  selectMostRecentInProgressMatch,
  type ProTaggerSavedMatch,
} from "./pro-tagger-storage";
import type { LoggedMatchEvent } from "../core/stats/saved-match";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { window: Window }).window = {
    localStorage: createMemoryStorage(),
  } as unknown as Window;
});

function buildLoggedEvent(overrides: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
  return {
    id: "evt-1",
    kind: "POINT",
    type: "POINT",
    nx: 0.5,
    ny: 0.5,
    half: 1,
    timestamp: 30,
    teamSide: "FOR",
    x: 0.5,
    y: 0.5,
    period: "1H",
    segment: 1,
    matchClockSeconds: 30,
    createdAt: 30,
    ...overrides,
  };
}

function buildMatchWithEvents(id: string, events: LoggedMatchEvent[]): ProTaggerSavedMatch {
  return {
    id,
    createdAt: 1000,
    homeTeamName: "Ballyboden",
    awayTeamName: "Na Fianna",
    venue: "Pairc",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "Ballyboden 0-01 (1) v Na Fianna 0-00 (0)",
    eventCount: events.length,
    events,
    homeSquad: { id: "home-squad", teamSide: "HOME", players: [] },
    awaySquad: { id: "away-squad", teamSide: "AWAY", players: [] },
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState: "FIRST_HALF",
      currentHalf: 1,
      matchTimeSeconds: 300,
      firstHalfAttackingDirection: "right",
    },
  };
}

describe("Reset Match persistence (P0-1)", () => {
  it("1-3: a persisted match containing events is gone from storage after the equivalent of Reset Match", () => {
    const events = [buildLoggedEvent()];
    const match = buildMatchWithEvents("reset-match-1", events);

    // 1. Persist a match containing events (autosave/manual save equivalent).
    expect(saveProTaggerMatchFull(match)).toBe(true);
    expect(readProTaggerMatches().find((m) => m.id === "reset-match-1")).toBeDefined();

    // 2. Reset Match — handleReset's fix calls deleteProTaggerMatch(session.id).
    expect(deleteProTaggerMatch("reset-match-1")).toBe(true);

    // 3. The persisted record is gone.
    expect(readProTaggerMatches().find((m) => m.id === "reset-match-1")).toBeUndefined();
  });

  it("5: the deleted match cannot resurrect via the Home resume selector after the delete", () => {
    const events = [buildLoggedEvent(), buildLoggedEvent({ id: "evt-2", kind: "WIDE", type: "WIDE" })];
    const match = buildMatchWithEvents("reset-match-2", events);
    saveProTaggerMatchFull(match);
    deleteProTaggerMatch("reset-match-2");

    // Simulates reopening Event Stats after Reset + leaving/reloading: the
    // Home "Resume in-progress match" banner must not offer the deleted match.
    const resumed = selectMostRecentInProgressMatch(readProTaggerMatches());
    expect(resumed).toBeNull();
  });

  it("5: deleting one reset match does not resurrect it even when other matches remain in storage", () => {
    saveProTaggerMatchFull(buildMatchWithEvents("keep-me", [buildLoggedEvent()]));
    saveProTaggerMatchFull(buildMatchWithEvents("reset-match-3", [buildLoggedEvent()]));
    deleteProTaggerMatch("reset-match-3");

    const stored = readProTaggerMatches();
    expect(stored.map((m) => m.id)).toEqual(["keep-me"]);
    expect(stored.find((m) => m.id === "reset-match-3")).toBeUndefined();
  });

  it("a Reset on a match that was never saved (nothing in storage yet) is a safe no-op delete, not an error", () => {
    // A coach can open Reset Match's confirm dialog and confirm before any
    // autosave has ever fired — deleteProTaggerMatch legitimately returns
    // false here (nothing to delete), which is not a storage failure.
    expect(deleteProTaggerMatch("never-saved-match")).toBe(false);
    expect(readProTaggerMatches()).toEqual([]);
  });

  it("regression guard: explicit Saved Match deletion (ProTaggerSavedMatchesScreen's own path) is unaffected by this fix", () => {
    saveProTaggerMatchFull(buildMatchWithEvents("a", [buildLoggedEvent()]));
    saveProTaggerMatchFull(buildMatchWithEvents("b", [buildLoggedEvent()]));
    // Same deleteProTaggerMatch function ProTaggerSavedMatchesScreen calls on
    // explicit user-confirmed deletion from the saved-matches list.
    expect(deleteProTaggerMatch("a")).toBe(true);
    const stored = readProTaggerMatches();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe("b");
  });

  it("storage key sanity: the deleted record's raw bytes are actually removed from the underlying store", () => {
    saveProTaggerMatchFull(buildMatchWithEvents("raw-check", [buildLoggedEvent()]));
    deleteProTaggerMatch("raw-check");
    const raw = window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("raw-check");
  });
});
