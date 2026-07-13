import { beforeEach, describe, expect, it } from "vitest";
import {
  PRO_TAGGER_MATCHES_STORAGE_KEY,
  readProTaggerMatches,
  resolveImportIdCollision,
  saveProTaggerMatchFull,
  type ProTaggerSavedMatch,
} from "./pro-tagger-storage";

// vitest runs this file under Node, not jsdom — supply a minimal in-memory
// localStorage, mirroring rapid-capture-storage.test.ts's setup.
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
    homeTeamName: "Adare",
    awayTeamName: "Mungret",
    venue: "Adare GAA Grounds",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "Adare 0-04 (4) v Mungret 0-02 (2)",
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

describe("resolveImportIdCollision", () => {
  it("keeps the original id when there is no collision", () => {
    const candidate = buildMatch({ id: "fresh-id" });
    const result = resolveImportIdCollision(candidate, []);
    expect(result.idRewritten).toBe(false);
    expect(result.match.id).toBe("fresh-id");
  });

  it("keeps the original id when the collision is the same match (stable re-import)", () => {
    const existing = buildMatch({ id: "same-id", createdAt: 555 });
    const candidate = buildMatch({ id: "same-id", createdAt: 555 });
    const result = resolveImportIdCollision(candidate, [existing]);
    expect(result.idRewritten).toBe(false);
    expect(result.match.id).toBe("same-id");
  });

  it("rewrites the id when it collides with a genuinely different match", () => {
    const existing = buildMatch({ id: "shared-id", homeTeamName: "Ballyboden", awayTeamName: "Na Fianna", createdAt: 1 });
    const candidate = buildMatch({ id: "shared-id", homeTeamName: "Adare", awayTeamName: "Mungret", createdAt: 2 });
    const result = resolveImportIdCollision(candidate, [existing]);
    expect(result.idRewritten).toBe(true);
    expect(result.match.id).not.toBe("shared-id");
    expect(result.match.id.startsWith("shared-id-imported-")).toBe(true);
  });

  it("never mutates the existing saved match it collided with", () => {
    saveProTaggerMatchFull(buildMatch({ id: "shared-id", homeTeamName: "Ballyboden", createdAt: 1 }));
    const before = readProTaggerMatches()[0]!;

    const candidate = buildMatch({ id: "shared-id", homeTeamName: "Adare", createdAt: 2 });
    const { match: toSave } = resolveImportIdCollision(candidate, readProTaggerMatches());
    saveProTaggerMatchFull(toSave);

    const stored = readProTaggerMatches();
    expect(stored).toHaveLength(2);
    expect(stored.find((m) => m.homeTeamName === "Ballyboden")).toEqual(before);
    expect(stored.find((m) => m.homeTeamName === "Adare")).toBeDefined();
  });

  it("preserves every non-id field of the candidate when rewriting its id", () => {
    const existing = buildMatch({ id: "shared-id", homeTeamName: "Ballyboden", createdAt: 1 });
    const candidate = buildMatch({ id: "shared-id", homeTeamName: "Adare", eventCount: 129, createdAt: 2 });
    const result = resolveImportIdCollision(candidate, [existing]);
    expect(result.match.homeTeamName).toBe("Adare");
    expect(result.match.eventCount).toBe(129);
    expect(result.match.createdAt).toBe(2);
  });
});

describe("saveProTaggerMatchFull / readProTaggerMatches", () => {
  it("upserts by id without touching unrelated matches", () => {
    const a = buildMatch({ id: "a" });
    const b = buildMatch({ id: "b", homeTeamName: "Other" });
    saveProTaggerMatchFull(a);
    saveProTaggerMatchFull(b);
    expect(readProTaggerMatches()).toHaveLength(2);

    saveProTaggerMatchFull({ ...a, eventCount: 5 });
    const stored = readProTaggerMatches();
    expect(stored).toHaveLength(2);
    expect(stored.find((m) => m.id === "a")!.eventCount).toBe(5);
    expect(stored.find((m) => m.id === "b")!.homeTeamName).toBe("Other");
  });

  it("stores under the dedicated Pro Tagger key", () => {
    saveProTaggerMatchFull(buildMatch());
    expect(window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY)).not.toBeNull();
  });
});
