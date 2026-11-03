/**
 * Saved-match protection: a save never deletes a saved match, never writes
 * over storage it cannot read (Event Stats' own store or the shared Match
 * Stats archive), never drops a malformed historical record, and a failed
 * write leaves storage exactly as it was and says why.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  PRO_TAGGER_MATCHES_STORAGE_KEY,
  deleteProTaggerMatchResult,
  isStorageNearlyFull,
  readProTaggerMatches,
  readProTaggerStoreStatus,
  saveFailureText,
  saveProTaggerMatchFullResult,
  saveProTaggerMatchResult,
  type ProTaggerSavedMatch,
} from "./pro-tagger-storage";
import { SAVED_MATCHES_STORAGE_KEY, type SavedMatch } from "../core/stats/saved-match";

function createMemoryStorage(): Storage & { failWrites: "quota" | "other" | null } {
  const store = new Map<string, string>();
  const storage = {
    failWrites: null as "quota" | "other" | null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (storage.failWrites === "quota") throw new DOMException("quota", "QuotaExceededError");
      if (storage.failWrites === "other") throw new Error("blocked");
      store.set(key, value);
    },
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  return storage as unknown as Storage & { failWrites: "quota" | "other" | null };
}

let storage: ReturnType<typeof createMemoryStorage>;
beforeEach(() => {
  storage = createMemoryStorage();
  (globalThis as unknown as { window: Window }).window = { localStorage: storage } as unknown as Window;
});

function match(n: number, overrides: Partial<ProTaggerSavedMatch> = {}): ProTaggerSavedMatch {
  return {
    id: `match-${n}`,
    createdAt: 1_700_000_000_000 + n,
    homeTeamName: `Home ${n}`,
    awayTeamName: "Away",
    venue: "Ground",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "0-01 v 0-00",
    eventCount: 1,
    events: [{ id: `e${n}`, kind: "POINT", type: "POINT", teamSide: "FOR", nx: 0.8, ny: 0.5, half: 1, period: "1H", timestamp: 10, matchClockSeconds: 10, tags: ["PLAY"] }] as unknown as ProTaggerSavedMatch["events"],
    homeSquad: { id: "h", teamSide: "HOME", players: [] } as unknown as ProTaggerSavedMatch["homeSquad"],
    awaySquad: { id: "a", teamSide: "AWAY", players: [] } as unknown as ProTaggerSavedMatch["awaySquad"],
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 2100, firstHalfAttackingDirection: "right" },
    ...overrides,
  };
}
const sharedRecord = (n: number): SavedMatch => ({
  id: `match-${n}`, createdAt: 1_700_000_000_000 + n, label: `Home ${n} v Away`, homeTeamName: `Home ${n}`,
  awayTeamName: "Away", venue: "Ground", events: [], eventCount: 0, scorelineSnapshot: "",
} as unknown as SavedMatch);
const raw = (key: string) => storage.getItem(key);

describe("no saved match is ever deleted by a save", () => {
  it("saving a 21st match keeps the first (and every other) match", () => {
    for (let n = 1; n <= 20; n++) expect(saveProTaggerMatchFullResult(match(n)).ok).toBe(true);
    expect(saveProTaggerMatchFullResult(match(21)).ok).toBe(true);
    const ids = readProTaggerMatches().map((m) => m.id);
    expect(ids).toHaveLength(21);
    expect(ids).toContain("match-1");
    expect(ids[0]).toBe("match-21");                  // newest first, as before
  });

  it("keeps all 40 when 40 matches are saved", () => {
    for (let n = 1; n <= 40; n++) saveProTaggerMatchFullResult(match(n));
    expect(readProTaggerMatches()).toHaveLength(40);
  });

  it("updating a match in place leaves every other valid match unchanged and in order", () => {
    for (let n = 1; n <= 3; n++) saveProTaggerMatchFullResult(match(n));
    const before = JSON.parse(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)!) as ProTaggerSavedMatch[];
    saveProTaggerMatchFullResult(match(2, { scorelineSnapshot: "0-02 v 0-00" }));
    const after = JSON.parse(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)!) as ProTaggerSavedMatch[];
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
    expect(after[1].scorelineSnapshot).toBe("0-02 v 0-00");
  });
});

describe("unreadable Event Stats storage is never overwritten", () => {
  const CORRUPT = '[{"id":"older","createdAt":1,"homeTeamName":"Older","awayTeamName":"Opp","events":[],"restoreContext":{}}, {"trunc';

  it("a save is refused, reported, and leaves the stored value byte-identical", () => {
    storage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, CORRUPT);
    expect(readProTaggerStoreStatus()).toBe("unreadable");
    expect(saveProTaggerMatchFullResult(match(1))).toEqual({ ok: false, reason: "unreadable" });
    expect(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(CORRUPT);
  });

  it("a delete is refused and the stored value is unchanged", () => {
    storage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, CORRUPT);
    expect(deleteProTaggerMatchResult("older")).toEqual({ ok: false, reason: "unreadable" });
    expect(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(CORRUPT);
  });

  it("a stored value that is valid JSON but not a list is also unreadable, not empty", () => {
    storage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, '{"id":"x"}');
    expect(readProTaggerStoreStatus()).toBe("unreadable");
    expect(saveProTaggerMatchFullResult(match(1)).ok).toBe(false);
    expect(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe('{"id":"x"}');
  });

  it("an absent key is empty, and the first save creates it", () => {
    expect(readProTaggerStoreStatus()).toBe("empty");
    expect(saveProTaggerMatchFullResult(match(1)).ok).toBe(true);
    expect(readProTaggerMatches().map((m) => m.id)).toEqual(["match-1"]);
  });
});

describe("unreadable Match Stats archive is never overwritten by Event Stats", () => {
  it("the archive copy is refused and the archive is byte-identical; the Event Stats record still saves", () => {
    const CORRUPT = '[{"id":"match-stats-1","createdAt":5,"label":"x"}, {"trunc';
    storage.setItem(SAVED_MATCHES_STORAGE_KEY, CORRUPT);
    expect(saveProTaggerMatchResult(sharedRecord(1))).toEqual({ ok: false, reason: "unreadable" });
    expect(raw(SAVED_MATCHES_STORAGE_KEY)).toBe(CORRUPT);
    expect(saveProTaggerMatchFullResult(match(1)).ok).toBe(true);
    expect(readProTaggerMatches()).toHaveLength(1);
  });

  it("a readable archive still receives the copy and keeps Match Stats' own matches", () => {
    storage.setItem(SAVED_MATCHES_STORAGE_KEY, JSON.stringify([{ ...sharedRecord(9), id: "match-stats-native" }]));
    expect(saveProTaggerMatchResult(sharedRecord(1)).ok).toBe(true);
    const ids = (JSON.parse(raw(SAVED_MATCHES_STORAGE_KEY)!) as SavedMatch[]).map((m) => m.id);
    expect(ids.sort()).toEqual(["match-1", "match-stats-native"]);
  });
});

describe("malformed historical records survive every save unchanged", () => {
  const malformed = { id: "legacy-broken", homeTeamName: "No restore context", events: "not-an-array", note: "kept as is" };

  it("a save and an update keep the malformed record, byte-for-byte as a record, in its position", () => {
    storage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify([match(1), malformed, match(2)]));
    expect(readProTaggerMatches().map((m) => m.id)).toEqual(["match-1", "match-2"]);   // readers still skip it
    saveProTaggerMatchFullResult(match(3));                                              // new match
    saveProTaggerMatchFullResult(match(2, { scorelineSnapshot: "updated" }));            // update
    const stored = JSON.parse(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)!) as unknown[];
    expect(stored).toHaveLength(4);
    expect(stored[2]).toEqual(malformed);
    expect(JSON.stringify(stored[2])).toBe(JSON.stringify(malformed));
  });

  it("deleting a valid match keeps the malformed record", () => {
    storage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify([match(1), malformed]));
    expect(deleteProTaggerMatchResult("match-1").ok).toBe(true);
    expect(JSON.parse(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)!)).toEqual([malformed]);
  });

  it("a malformed record that shares an id with a new save is never replaced by it", () => {
    storage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify([{ ...malformed, id: "match-1" }]));
    saveProTaggerMatchFullResult(match(1));
    const stored = JSON.parse(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)!) as Array<{ id: string }>;
    expect(stored).toHaveLength(2);
    expect(stored[1]).toEqual({ ...malformed, id: "match-1" });
  });
});

describe("a failed write preserves existing matches and says why", () => {
  it("storage full: the save fails with 'full' and every existing match is unchanged", () => {
    for (let n = 1; n <= 3; n++) saveProTaggerMatchFullResult(match(n));
    const before = raw(PRO_TAGGER_MATCHES_STORAGE_KEY);
    storage.failWrites = "quota";
    expect(saveProTaggerMatchFullResult(match(4))).toEqual({ ok: false, reason: "full" });
    expect(saveProTaggerMatchResult(sharedRecord(4))).toEqual({ ok: false, reason: "full" });
    expect(deleteProTaggerMatchResult("match-1")).toEqual({ ok: false, reason: "full" });
    expect(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(before);
    storage.failWrites = null;
    expect(saveProTaggerMatchFullResult(match(4)).ok).toBe(true);
    expect(readProTaggerMatches()).toHaveLength(4);
  });

  it("any other storage failure is 'unavailable'", () => {
    storage.failWrites = "other";
    expect(saveProTaggerMatchFullResult(match(1))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("deleting a match that is not stored is 'not-found' and writes nothing", () => {
    saveProTaggerMatchFullResult(match(1));
    const before = raw(PRO_TAGGER_MATCHES_STORAGE_KEY);
    expect(deleteProTaggerMatchResult("missing")).toEqual({ ok: false, reason: "not-found" });
    expect(raw(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(before);
  });
});

describe("coach-facing wording", () => {
  it("names the cause", () => {
    expect(saveFailureText("unreadable")).toBe("Save blocked — saved matches storage is corrupted.");
    expect(saveFailureText("full")).toBe("Save failed — storage full. Back up and delete old matches.");
    expect(saveFailureText("unavailable")).toBe("Save failed — storage unavailable.");
  });

  it("'nearly full' starts at 80 % of a 5 M-character quota", () => {
    storage.setItem("x", "a".repeat(3_999_000));
    expect(isStorageNearlyFull(storage)).toBe(false);
    storage.setItem("y", "a".repeat(2_000));
    expect(isStorageNearlyFull(storage)).toBe(true);
  });
});
