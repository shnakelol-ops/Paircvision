// Regression coverage for the new 45/65, Sideline and Discipline event kinds
// through both ProTagger storage paths, plus the cross-surface case: a
// ProTagger match is saved into SAVED_MATCHES_STORAGE_KEY (shared with Match
// Stats), so it must also survive being read back through Match Stats' own
// hardened reader (StatsModeSurface.readSavedMatchesFromStorage) now that
// these kinds are part of MATCH_EVENT_KINDS.
import { beforeEach, describe, expect, it } from "vitest";
import {
  readProTaggerMatches,
  saveProTaggerMatch,
  saveProTaggerMatchFull,
  type ProTaggerSavedMatch,
} from "./pro-tagger-storage";
import { type LoggedMatchEvent, type SavedMatch } from "../core/stats/saved-match";
import { readSavedMatchesFromStorage } from "../StatsModeSurface";

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

function buildEvent(overrides: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
  const kind = overrides.kind ?? "FORTY_FIVE_WON";
  return {
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    type: kind,
    nx: 0.5,
    ny: 0.5,
    half: 1,
    timestamp: 10,
    teamSide: "FOR",
    x: 0.5,
    y: 0.5,
    period: "1H",
    segment: 1,
    matchClockSeconds: 10,
    createdAt: 10,
    ...overrides,
  };
}

const NEW_KIND_EVENTS: LoggedMatchEvent[] = [
  buildEvent({ id: "e1", kind: "FORTY_FIVE_WON", teamSide: "FOR" }),
  buildEvent({ id: "e2", kind: "FORTY_FIVE_CONCEDED", teamSide: "OPP" }),
  buildEvent({ id: "e3", kind: "SIDELINE_WON", teamSide: "FOR" }),
  buildEvent({ id: "e4", kind: "SIDELINE_CONCEDED", teamSide: "OPP" }),
  buildEvent({ id: "e5", kind: "YELLOW_CARD", teamSide: "FOR", playerId: "p1", playerName: "A" }),
  buildEvent({ id: "e6", kind: "SIN_BIN", teamSide: "OPP", playerId: "p2", playerName: "B", matchClockSeconds: 47 * 60 + 18 }),
  buildEvent({ id: "e7", kind: "RED_CARD", teamSide: "FOR", playerId: "p3", playerName: "C" }),
];

function buildFullMatch(overrides: Partial<ProTaggerSavedMatch> = {}): ProTaggerSavedMatch {
  return {
    id: "match-disc-1",
    createdAt: 1000,
    homeTeamName: "Adare",
    awayTeamName: "Mungret",
    venue: "Adare GAA Grounds",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "Adare 0-04 (4) v Mungret 0-02 (2)",
    eventCount: NEW_KIND_EVENTS.length,
    events: NEW_KIND_EVENTS,
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

describe("ProTagger full-restore storage preserves 45/65, Sideline and Discipline events", () => {
  it("saveProTaggerMatchFull / readProTaggerMatches round-trips every new event kind intact", () => {
    saveProTaggerMatchFull(buildFullMatch());
    const [match] = readProTaggerMatches();
    expect(match.events).toHaveLength(NEW_KIND_EVENTS.length);
    expect(match.events.map((e) => e.kind).sort()).toEqual(
      ["FORTY_FIVE_CONCEDED", "FORTY_FIVE_WON", "RED_CARD", "SIDELINE_CONCEDED", "SIDELINE_WON", "SIN_BIN", "YELLOW_CARD"].sort(),
    );
    const sinBin = match.events.find((e) => e.kind === "SIN_BIN");
    expect(sinBin?.playerId).toBe("p2");
    expect(sinBin?.matchClockSeconds).toBe(47 * 60 + 18);
    expect(sinBin?.teamSide).toBe("OPP");
  });
});

describe("Saved Matches (SAVED_MATCHES_STORAGE_KEY) preserves the new kinds across surfaces", () => {
  it("a ProTagger match saved via saveProTaggerMatch survives Match Stats' own hardened reader", () => {
    const savedMatch: SavedMatch = {
      id: "match-disc-2",
      createdAt: 2000,
      label: "Adare v Mungret",
      homeTeamName: "Adare",
      awayTeamName: "Mungret",
      venue: "Adare GAA Grounds",
      events: NEW_KIND_EVENTS,
      eventCount: NEW_KIND_EVENTS.length,
      scorelineSnapshot: "0-04 (4) v 0-02 (2)",
    };
    saveProTaggerMatch(savedMatch);

    const { matches, isCorrupt } = readSavedMatchesFromStorage();
    expect(isCorrupt).toBe(false);
    expect(matches).toHaveLength(1);
    expect(matches[0].events).toHaveLength(NEW_KIND_EVENTS.length);
    expect(matches[0].events.every((e) => NEW_KIND_EVENTS.some((orig) => orig.id === e.id))).toBe(true);
  });
});
