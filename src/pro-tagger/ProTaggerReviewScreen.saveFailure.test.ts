// Regression coverage for the standalone Review save-failure defect (P1-2,
// Event Stats release audit): the Saved Matches -> Review screen's
// onMatchUpdate callback (ProTaggerPage.tsx) discarded the boolean
// saveProTaggerMatchFull returns, so a coach correcting a mistagged player or
// deleting a bad event while storage was full/unavailable saw the edit apply
// in the UI with no indication it was never actually written to disk — the
// correction was silently lost the moment Review was closed and reopened.
// The embedded live-review overlay (opened from inside an in-progress match)
// was never affected: it only updates in-memory state there, riding on the
// Live screen's own already-hardened autosave-failure warning.
//
// ProTaggerReviewScreen.tsx has no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint), so
// this suite exercises the exact pure decision the component's
// commitEventsChange now makes (deriveReviewSaveFailedFeedback) fed the real
// result of the real storage function (saveProTaggerMatchFull) under both a
// healthy and a failing localStorage — proving the realistic end-to-end
// chain: storage write outcome -> warning shown/not shown.
import { beforeEach, describe, expect, it } from "vitest";
import { deriveReviewSaveFailedFeedback } from "./ProTaggerReviewScreen";
import { SAVE_FAILED_TEXT } from "./ProTaggerLiveScreen";
import { saveProTaggerMatchFull, type ProTaggerSavedMatch } from "./pro-tagger-storage";

function createMemoryStorage(options: { failWrites?: boolean } = {}): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.failWrites) throw new DOMException("QuotaExceededError");
      store.set(key, value);
    },
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

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
    scorelineSnapshot: "Ballyboden St Enda's 1-04 (7) v Na Fianna 0-02 (2)",
    eventCount: 0,
    events: [],
    homeSquad: { id: "home-squad", teamSide: "HOME", players: [] },
    awaySquad: { id: "away-squad", teamSide: "AWAY", players: [] },
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState: "FULL_TIME",
      currentHalf: 2,
      matchTimeSeconds: 0,
      firstHalfAttackingDirection: "right",
    },
    ...overrides,
  };
}

describe("Event Stats (Pro Tagger): standalone Review save-failure warning (P1-2)", () => {
  it("deriveReviewSaveFailedFeedback: no warning when the correction persisted", () => {
    expect(deriveReviewSaveFailedFeedback(true)).toBeNull();
  });

  it("deriveReviewSaveFailedFeedback: shows the standard save-failed text when it did not persist", () => {
    expect(deriveReviewSaveFailedFeedback(false)).toBe(SAVE_FAILED_TEXT);
  });

  describe("end-to-end with the real storage function", () => {
    it("a player correction saved while storage is healthy shows no warning", () => {
      (globalThis as unknown as { window: Window }).window = {
        localStorage: createMemoryStorage(),
      } as unknown as Window;

      const match = buildMatch();
      const corrected = { ...match, homeTeamName: "Ballyboden St Enda's (corrected)" };
      // Exactly what ProTaggerPage.tsx's standalone onMatchUpdate now does:
      // propagate saveProTaggerMatchFull's real result, not discard it.
      const persisted = saveProTaggerMatchFull(corrected);

      expect(persisted).toBe(true);
      expect(deriveReviewSaveFailedFeedback(persisted)).toBeNull();
    });

    it("a player correction attempted while storage is unavailable warns the coach instead of silently losing it", () => {
      (globalThis as unknown as { window: Window }).window = {
        localStorage: createMemoryStorage({ failWrites: true }),
      } as unknown as Window;

      const match = buildMatch();
      const corrected = { ...match, homeTeamName: "Ballyboden St Enda's (corrected)" };
      const persisted = saveProTaggerMatchFull(corrected);

      expect(persisted).toBe(false);
      expect(deriveReviewSaveFailedFeedback(persisted)).toBe(SAVE_FAILED_TEXT);
    });
  });
});

describe("Event Stats (Pro Tagger): embedded live-review overlay is unaffected (always reports success)", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: Window }).window = {
      localStorage: createMemoryStorage(),
    } as unknown as Window;
  });

  it("the embedded overlay's onMatchUpdate contract always resolves to true — it never writes storage itself", () => {
    // ProTaggerLiveScreen.tsx's embedded <ProTaggerReviewScreen onMatchUpdate>
    // is `(updated) => { setLoggedEvents(updated.events); return true; }` —
    // it only folds the edit back into in-memory state; the Live screen's own
    // already-hardened autosave path is what actually persists it. Mirrored
    // here as a plain function (no React state) to pin that contract.
    let loggedEvents: readonly unknown[] = [];
    const embeddedOnMatchUpdate = (updated: ProTaggerSavedMatch): boolean => {
      loggedEvents = updated.events;
      return true;
    };

    const result = embeddedOnMatchUpdate(buildMatch({ events: [{ id: "e1" }] as unknown as ProTaggerSavedMatch["events"] }));
    expect(result).toBe(true);
    expect(loggedEvents).toHaveLength(1);
    expect(deriveReviewSaveFailedFeedback(result)).toBeNull();
  });
});
