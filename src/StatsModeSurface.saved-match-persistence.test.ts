// Regression coverage for audit finding F03: Match Stats silently evicted
// the oldest saved match once an 11th was saved (MAX_SAVED_MATCHES = 10).
// These tests exercise the REAL production storage pipeline exported from
// StatsModeSurface.tsx (sanitizeSavedMatches / persistSavedMatches /
// readSavedMatchesFromStorage) against an in-memory localStorage, not a
// reimplementation of it — vitest runs this file under Node, not jsdom,
// mirroring the setup already used in rapid-capture-storage.test.ts and
// pro-tagger-storage.test.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { SAVED_MATCHES_STORAGE_KEY, deleteSavedMatch, type LoggedMatchEvent, type SavedMatch } from "./core/stats/saved-match";
import { persistSavedMatches, readSavedMatchesFromStorage, sanitizeSavedMatches } from "./StatsModeSurface";

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

function createFailingStorage(existingJson: string): Storage {
  const store = new Map<string, string>([[SAVED_MATCHES_STORAGE_KEY, existingJson]]);
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: () => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    },
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

function buildEvent(): LoggedMatchEvent {
  return {
    id: "evt-1",
    kind: "POINT",
    type: "POINT",
    nx: 0.9,
    ny: 0.5,
    half: 1,
    timestamp: 10,
    teamSide: "FOR",
    x: 0.9,
    y: 0.5,
    period: "1H",
    segment: 1,
    matchClockSeconds: 10,
    createdAt: 10,
  };
}

function buildMatch(n: number): SavedMatch {
  return {
    id: `saved-match-${n}`,
    createdAt: n * 1000,
    label: `Retention Test ${String(n).padStart(2, "0")}`,
    homeTeamName: `Retention Test ${String(n).padStart(2, "0")}`,
    awayTeamName: "Opponent",
    venue: "Fraher Field",
    events: [buildEvent()],
    eventCount: 1,
    scorelineSnapshot: "0-01 (1) v 0-00 (0)",
  };
}

beforeEach(() => {
  (globalThis as unknown as { window: Window }).window = {
    localStorage: createMemoryStorage(),
  } as unknown as Window;
});

describe("saved-match archive persists through the real save/read pipeline (audit F03 regression)", () => {
  it("all 10 matches remain after saving match 10", () => {
    for (let n = 1; n <= 10; n++) {
      const current = readSavedMatchesFromStorage().matches;
      expect(persistSavedMatches([buildMatch(n), ...current])).toBe(true);
    }
    expect(readSavedMatchesFromStorage().matches).toHaveLength(10);
  });

  it("all 11 matches remain after saving match 11 — the exact scenario that used to lose match 1", () => {
    for (let n = 1; n <= 11; n++) {
      const current = readSavedMatchesFromStorage().matches;
      persistSavedMatches([buildMatch(n), ...current]);
    }
    const { matches } = readSavedMatchesFromStorage();
    expect(matches).toHaveLength(11);
    expect(matches.some((m) => m.id === "saved-match-1")).toBe(true);
  });

  it("all 12 matches remain after saving match 12, with unique ids and correct names", () => {
    for (let n = 1; n <= 12; n++) {
      const current = readSavedMatchesFromStorage().matches;
      persistSavedMatches([buildMatch(n), ...current]);
    }
    const { matches } = readSavedMatchesFromStorage();
    expect(matches).toHaveLength(12);
    expect(new Set(matches.map((m) => m.id)).size).toBe(12);
    for (let n = 1; n <= 12; n++) {
      expect(matches.some((m) => m.homeTeamName === `Retention Test ${String(n).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("rehydration: all 12 matches remain after the persistence layer is re-read from scratch", () => {
    for (let n = 1; n <= 12; n++) {
      const current = readSavedMatchesFromStorage().matches;
      persistSavedMatches([buildMatch(n), ...current]);
    }
    // Simulate a fresh app load re-reading storage with no prior in-memory state.
    const rehydrated = readSavedMatchesFromStorage();
    expect(rehydrated.isCorrupt).toBe(false);
    expect(rehydrated.matches).toHaveLength(12);
    expect(rehydrated.matches.map((m) => m.id).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => `saved-match-${i + 1}`).sort(),
    );
  });

  it("importing a 13th match does not delete matches 1-12, and its data is correct", () => {
    for (let n = 1; n <= 12; n++) {
      persistSavedMatches([buildMatch(n), ...readSavedMatchesFromStorage().matches]);
    }
    const imported: SavedMatch = { ...buildMatch(13), id: "saved-match-imported", label: "Imported Match" };
    persistSavedMatches([imported, ...readSavedMatchesFromStorage().matches]);
    const { matches } = readSavedMatchesFromStorage();
    expect(matches).toHaveLength(13);
    for (let n = 1; n <= 12; n++) {
      expect(matches.some((m) => m.id === `saved-match-${n}`)).toBe(true);
    }
    const importedRecord = matches.find((m) => m.id === "saved-match-imported");
    expect(importedRecord?.label).toBe("Imported Match");
    expect(importedRecord?.eventCount).toBe(1);
  });
});

describe("storage-write failure safety (audit F08-adjacent)", () => {
  it("existing matches remain intact and the save is not falsely reported as successful when storage.setItem throws", () => {
    const twelveMatches = Array.from({ length: 12 }, (_, i) => buildMatch(i + 1));
    const existingJson = JSON.stringify(sanitizeSavedMatches(twelveMatches));
    (globalThis as unknown as { window: Window }).window = {
      localStorage: createFailingStorage(existingJson),
    } as unknown as Window;

    const before = readSavedMatchesFromStorage();
    expect(before.matches).toHaveLength(12);

    const didPersist = persistSavedMatches([buildMatch(13), ...before.matches]);
    expect(didPersist).toBe(false); // not falsely reported as successful

    const after = readSavedMatchesFromStorage();
    expect(after.matches).toHaveLength(12); // no old match removed
    expect(after.matches.map((m) => m.id).sort()).toEqual(before.matches.map((m) => m.id).sort());
    expect(after.matches.some((m) => m.id === "saved-match-13")).toBe(false); // failed save never landed
  });
});

// Runs the full 14-step manual acceptance test from the PR spec against the
// real production pipeline, step by step, so its "exact result" is recorded
// by an assertion rather than a hand-typed narrative.
describe("manual acceptance test — 12 Retention Test matches, reload, edit, import, delete", () => {
  it("steps 1-14 all hold against the real save/read/delete pipeline", () => {
    // 1. Save all twelve.
    for (let n = 1; n <= 12; n++) {
      persistSavedMatches([buildMatch(n), ...readSavedMatchesFromStorage().matches]);
    }
    // 2/3. Close or reload PáircVision -> confirm all twelve are visible.
    let state = readSavedMatchesFromStorage();
    expect(state.matches).toHaveLength(12);

    // 4. Open match 1 and confirm its contents.
    const match1 = state.matches.find((m) => m.id === "saved-match-1");
    expect(match1?.label).toBe("Retention Test 01");
    expect(match1?.eventCount).toBe(1);

    // 5. Open match 12 and confirm its contents.
    const match12 = state.matches.find((m) => m.id === "saved-match-12");
    expect(match12?.label).toBe("Retention Test 12");
    expect(match12?.eventCount).toBe(1);

    // 6. Edit match 6 (update in place: same id, same createdAt, new content).
    const match6Before = state.matches.find((m) => m.id === "saved-match-6")!;
    const editedMatch6: SavedMatch = {
      ...match6Before,
      label: "Retention Test 06 (edited)",
      scorelineSnapshot: "0-02 (2) v 0-00 (0)",
    };
    persistSavedMatches([editedMatch6, ...state.matches]);

    // 7. Reload.
    state = readSavedMatchesFromStorage();

    // 8. Confirm all twelve still exist.
    expect(state.matches).toHaveLength(12);
    const editedRecord = state.matches.find((m) => m.id === "saved-match-6");
    expect(editedRecord?.label).toBe("Retention Test 06 (edited)");
    expect(editedRecord?.createdAt).toBe(match6Before.createdAt); // update in place, not a new record

    // 9. Import a thirteenth match.
    const imported: SavedMatch = { ...buildMatch(13), id: "saved-match-imported-13", label: "Imported Match" };
    persistSavedMatches([imported, ...state.matches]);

    // 10. Reload.
    state = readSavedMatchesFromStorage();

    // 11. Confirm all thirteen exist.
    expect(state.matches).toHaveLength(13);
    expect(state.matches.some((m) => m.id === "saved-match-imported-13")).toBe(true);

    // 12. Manually delete match 4.
    const afterDelete = deleteSavedMatch(state.matches, "saved-match-4");
    persistSavedMatches(afterDelete);

    // 13. Reload.
    state = readSavedMatchesFromStorage();

    // 14. Confirm exactly twelve remain and only match 4 is absent.
    expect(state.matches).toHaveLength(12);
    expect(state.matches.some((m) => m.id === "saved-match-4")).toBe(false);
    for (const id of [
      "saved-match-1", "saved-match-2", "saved-match-3", "saved-match-5", "saved-match-6",
      "saved-match-7", "saved-match-8", "saved-match-9", "saved-match-10", "saved-match-11",
      "saved-match-12", "saved-match-imported-13",
    ]) {
      expect(state.matches.some((m) => m.id === id)).toBe(true);
    }
  });
});
