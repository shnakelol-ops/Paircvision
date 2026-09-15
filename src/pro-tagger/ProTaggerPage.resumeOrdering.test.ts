// Regression coverage for the in-progress match ordering defect (P1-4,
// Event Stats release audit): findInProgressMatch() used to return the first
// non-FULL_TIME record in storage array order, which only reflects which
// match was CREATED first — saveProTaggerMatchFull upserts an existing
// match's id in place and never moves it to the front on a later save. So
// starting Match B after resuming and adding events to an older Match A
// still offered B (created later) as "Resume in-progress match" on next
// launch, not A (the one actually being worked on).
//
// No storage-model migration was needed: every event already carries its
// own capture-time `createdAt`, so "last worked on" is derivable from data
// every saved match already has (deriveLastActivityAt).
import { beforeEach, describe, expect, it } from "vitest";
import { saveProTaggerMatchFull, type ProTaggerSavedMatch } from "./pro-tagger-storage";
import { findInProgressMatch } from "./ProTaggerPage";

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

function buildMatch(overrides: Partial<ProTaggerSavedMatch> = {}): ProTaggerSavedMatch {
  return {
    id: "match-1",
    createdAt: 1000,
    homeTeamName: "Ballyboden St Enda's",
    awayTeamName: "Na Fianna",
    venue: "Pairc na nGael",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "0-00 v 0-00",
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

describe("findInProgressMatch — resumes the most recently worked-on match (P1-4)", () => {
  it("offers the match most recently created when neither has been touched since", () => {
    saveProTaggerMatchFull(buildMatch({ id: "match-A", createdAt: 1000 }));
    saveProTaggerMatchFull(buildMatch({ id: "match-B", createdAt: 2000 }));

    expect(findInProgressMatch()?.id).toBe("match-B");
  });

  it("prefers an OLDER match that was worked on more recently over a newer, untouched one", () => {
    // Match A created first, then Match B created later (B would win under
    // the old "first non-FULL_TIME in array order" logic).
    saveProTaggerMatchFull(buildMatch({ id: "match-A", createdAt: 1000 }));
    saveProTaggerMatchFull(buildMatch({ id: "match-B", createdAt: 2000 }));

    // Coach goes back and resumes A, tagging a new event well after B was created.
    saveProTaggerMatchFull(
      buildMatch({
        id: "match-A",
        createdAt: 1000,
        events: [
          { id: "e1", type: "POINT", kind: "POINT", teamSide: "FOR", x: 0.5, y: 0.5, nx: 0.5, ny: 0.5, half: 1, period: "1H", segment: 1, matchClockSeconds: 60, timestamp: 60, createdAt: 5000 },
        ] as unknown as ProTaggerSavedMatch["events"],
      }),
    );

    expect(findInProgressMatch()?.id).toBe("match-A");
  });

  it("a zero-event match with no activity since creation falls back to its own createdAt", () => {
    saveProTaggerMatchFull(buildMatch({ id: "match-C", createdAt: 3000 }));
    saveProTaggerMatchFull(buildMatch({ id: "match-D", createdAt: 4000 }));

    expect(findInProgressMatch()?.id).toBe("match-D");
  });

  it("ignores FULL_TIME matches regardless of activity recency", () => {
    saveProTaggerMatchFull(
      buildMatch({
        id: "match-finished",
        createdAt: 9000,
        restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 1800, firstHalfAttackingDirection: "right" },
      }),
    );
    saveProTaggerMatchFull(buildMatch({ id: "match-open", createdAt: 1000 }));

    expect(findInProgressMatch()?.id).toBe("match-open");
  });

  it("returns null when there is nothing in progress", () => {
    expect(findInProgressMatch()).toBeNull();
  });
});
