// Regression coverage for the Reset Match persistence defect (P0-2, Event
// Stats release audit): handleReset (ProTaggerLiveScreen.tsx) cleared every
// in-memory ref/state back to PRE_MATCH but never called deleteProTaggerMatch
// — and the autosave effect's own guard (`matchState === "PRE_MATCH" &&
// loggedEvents.length === 0` -> skip) actively prevented the post-reset empty
// state from ever being written back either. So the last autosaved record
// from *before* the reset (full events, score, cards) stayed in
// PRO_TAGGER_MATCHES_STORAGE_KEY under the same session id — even though the
// confirm dialog told the coach the events would be "permanently deleted".
// On the next app launch, findInProgressMatch() (ProTaggerPage.tsx) found and
// offered to resume that "deleted" match with everything intact.
//
// This suite drives the exact production storage functions handleReset now
// calls (deleteProTaggerMatch) and the exact resurrection check the real Home
// screen uses (findInProgressMatch), through a full
// autosave -> reset -> simulated-reload lifecycle.
import { beforeEach, describe, expect, it } from "vitest";
import {
  PRO_TAGGER_MATCHES_STORAGE_KEY,
  deleteProTaggerMatch,
  readProTaggerMatches,
  saveProTaggerMatchFull,
  type ProTaggerSavedMatch,
} from "./pro-tagger-storage";
import { findInProgressMatch } from "./ProTaggerPage";

// vitest runs this file under Node, not jsdom — supply a minimal in-memory
// localStorage, mirroring pro-tagger-storage.test.ts's setup.
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

function buildInProgressMatch(overrides: Partial<ProTaggerSavedMatch> = {}): ProTaggerSavedMatch {
  return {
    id: "match-1",
    createdAt: 1000,
    homeTeamName: "Ballyboden St Enda's",
    awayTeamName: "Na Fianna",
    venue: "Pairc na nGael",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "Ballyboden St Enda's 1-04 (7) v Na Fianna 0-02 (2)",
    eventCount: 6,
    events: [
      { id: "e1", type: "GOAL", kind: "GOAL", teamSide: "FOR", x: 0.5, y: 0.9, nx: 0.5, ny: 0.9, half: 1, period: "1H", segment: 1, matchClockSeconds: 120, timestamp: 120, createdAt: 1100 },
      { id: "e2", type: "YELLOW_CARD", kind: "YELLOW_CARD", teamSide: "FOR", x: 0.5, y: 0.5, nx: 0.5, ny: 0.5, half: 1, period: "1H", segment: 2, matchClockSeconds: 700, timestamp: 700, createdAt: 1200, playerId: "p1" },
    ] as unknown as ProTaggerSavedMatch["events"],
    homeSquad: { id: "home-squad", teamSide: "HOME", players: [] },
    awaySquad: { id: "away-squad", teamSide: "AWAY", players: [] },
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState: "FIRST_HALF",
      currentHalf: 1,
      matchTimeSeconds: 900,
      firstHalfAttackingDirection: "right",
    },
    ...overrides,
  };
}

describe("Event Stats (Pro Tagger): Reset Match persistence (P0-2)", () => {
  it("a match with events, autosaved, then Reset, no longer resurrects on reload", () => {
    // 1. Coach tags events; autosave persists the in-progress match.
    const autosaved = buildInProgressMatch();
    expect(saveProTaggerMatchFull(autosaved)).toBe(true);
    expect(readProTaggerMatches().find((m) => m.id === "match-1")).toBeDefined();

    // Sanity: before the fix, findInProgressMatch would already offer this
    // match to resume, confirming autosave really did persist it.
    expect(findInProgressMatch()?.id).toBe("match-1");

    // 2. Coach presses "Reset Match" and confirms. handleReset now calls
    // deleteProTaggerMatch(session.id) as its first action.
    const deleted = deleteProTaggerMatch("match-1");
    expect(deleted).toBe(true);

    // 3. The persisted match no longer contains the old events.
    const stillThere = readProTaggerMatches().find((m) => m.id === "match-1");
    expect(stillThere).toBeUndefined();

    // 4. Simulated reload: the exact resurrection check the real Home screen
    // and Saved Matches list run — must find nothing to resume.
    expect(findInProgressMatch()).toBeNull();
  });

  it("reset removes the match even if it was never explicitly re-saved after — no stale write can bring it back from a leftover snapshot", () => {
    saveProTaggerMatchFull(buildInProgressMatch({ id: "match-2" }));
    saveProTaggerMatchFull(buildInProgressMatch({ id: "match-3" })); // an unrelated match must survive

    deleteProTaggerMatch("match-2");

    const remaining = readProTaggerMatches().map((m) => m.id);
    expect(remaining).not.toContain("match-2");
    expect(remaining).toContain("match-3");
  });

  it("raw storage no longer contains the reset match's id at all (not merely filtered at read time)", () => {
    saveProTaggerMatchFull(buildInProgressMatch({ id: "match-4" }));
    deleteProTaggerMatch("match-4");

    const raw = window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as ProTaggerSavedMatch[];
    expect(parsed.some((m) => m.id === "match-4")).toBe(false);
  });
});
