import { beforeEach, describe, expect, it } from "vitest";
import { createMatchEvent } from "../core/stats/stats-event-model";
import type { RapidSession } from "./rapid-session";
import {
  clearActiveRapidSession,
  deleteSavedRapidMatch,
  getSavedRapidMatch,
  listSavedRapidMatches,
  loadActiveRapidSession,
  newRapidMatchId,
  RAPID_CAPTURE_ACTIVE_STORAGE_KEY,
  RAPID_CAPTURE_MATCHES_STORAGE_KEY,
  RAPID_CAPTURE_SCHEMA_VERSION,
  saveActiveRapidSession,
  saveCompletedRapidMatch,
  type RapidSavedMatch,
} from "./rapid-capture-storage";

// vitest runs this file under Node, not jsdom — supply a minimal in-memory
// localStorage so `window.localStorage` resolves the same way it does in the
// browser, without adding a jsdom/happy-dom dependency to the project.
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

const session: RapidSession = {
  sport: "gaelic",
  forTeamName: "Ballyboden",
  oppTeamName: "Na Fianna",
  venue: "Croke Park",
  matchType: "championship",
  forTeamColour: "#1f6feb",
  oppTeamColour: "#b91c1c",
  attackDirection: "right",
  halfDurationMinutes: 30,
};

function buildMatch(overrides: Partial<RapidSavedMatch> = {}): RapidSavedMatch {
  const now = Date.now();
  return {
    schemaVersion: RAPID_CAPTURE_SCHEMA_VERSION,
    id: newRapidMatchId(),
    createdAt: now,
    updatedAt: now,
    status: "IN_PROGRESS",
    session,
    events: [
      createMatchEvent({ kind: "KICKOUT_WON", nx: 0.3, ny: 0.5, half: 1, timestamp: 12, teamSide: "FOR" }),
      createMatchEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 40, teamSide: "FOR" }),
    ],
    half: 1,
    clockSeconds: 40,
    ...overrides,
  };
}

describe("autosave + resume", () => {
  it("round-trips an active session and preserves event order/timestamps exactly", () => {
    const match = buildMatch();
    expect(saveActiveRapidSession(match)).toBe(true);

    const resumed = loadActiveRapidSession();
    expect(resumed).not.toBeNull();
    expect(resumed!.id).toBe(match.id);
    expect(resumed!.half).toBe(1);
    expect(resumed!.clockSeconds).toBe(40);
    expect(resumed!.events.map((e) => e.kind)).toEqual(["KICKOUT_WON", "POINT"]);
    expect(resumed!.events.map((e) => e.timestamp)).toEqual([12, 40]);
  });

  it("returns null when no active session has been saved", () => {
    expect(loadActiveRapidSession()).toBeNull();
  });

  it("re-saving the active session overwrites the previous autosave (latest wins)", () => {
    const match = buildMatch();
    saveActiveRapidSession(match);

    const updated: RapidSavedMatch = {
      ...match,
      half: 2,
      clockSeconds: 120,
      events: [...match.events, createMatchEvent({ kind: "WIDE", nx: 0.85, ny: 0.6, half: 2, timestamp: 121, teamSide: "OPP" })],
    };
    saveActiveRapidSession(updated);

    const resumed = loadActiveRapidSession();
    expect(resumed!.half).toBe(2);
    expect(resumed!.events).toHaveLength(3);
  });

  it("clearActiveRapidSession removes the resume candidate", () => {
    saveActiveRapidSession(buildMatch());
    clearActiveRapidSession();
    expect(loadActiveRapidSession()).toBeNull();
  });
});

describe("completed session save/load", () => {
  it("saves a completed match and lists it", () => {
    const match = buildMatch();
    expect(saveCompletedRapidMatch(match)).toBe(true);

    const all = listSavedRapidMatches();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("COMPLETED");
    expect(all[0].session.oppTeamName).toBe("Na Fianna");
  });

  it("fetches a single saved match by id", () => {
    const match = buildMatch();
    saveCompletedRapidMatch(match);
    expect(getSavedRapidMatch(match.id)?.id).toBe(match.id);
    expect(getSavedRapidMatch("does-not-exist")).toBeNull();
  });

  it("upserts by id instead of duplicating on repeated saves", () => {
    const match = buildMatch();
    saveCompletedRapidMatch(match);
    saveCompletedRapidMatch({ ...match, clockSeconds: 999 });

    const all = listSavedRapidMatches();
    expect(all).toHaveLength(1);
    expect(all[0].clockSeconds).toBe(999);
  });

  it("does not write into the Match Stats saved-match storage key", () => {
    saveCompletedRapidMatch(buildMatch());
    expect(window.localStorage.getItem("pitchflow_matches_v1")).toBeNull();
    expect(window.localStorage.getItem(RAPID_CAPTURE_MATCHES_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(RAPID_CAPTURE_ACTIVE_STORAGE_KEY)).toBeNull();
  });
});

describe("delete", () => {
  it("removes a saved match by id", () => {
    const a = buildMatch();
    const b = buildMatch();
    saveCompletedRapidMatch(a);
    saveCompletedRapidMatch(b);

    expect(deleteSavedRapidMatch(a.id)).toBe(true);
    const remaining = listSavedRapidMatches();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });

  it("returns false when the id does not exist", () => {
    saveCompletedRapidMatch(buildMatch());
    expect(deleteSavedRapidMatch("not-a-real-id")).toBe(false);
  });
});

describe("legacy possession compatibility", () => {
  it("still saves and resumes a legacy POSSESSION_WON/POSSESSION_LOST event (no UI creates new ones, but old data still loads)", () => {
    const match = buildMatch({
      events: [
        createMatchEvent({ kind: "POSSESSION_WON", nx: 0.4, ny: 0.5, half: 1, timestamp: 5, teamSide: "FOR" }),
        createMatchEvent({ kind: "POSSESSION_LOST", nx: 0.6, ny: 0.5, half: 1, timestamp: 8, teamSide: "OPP" }),
      ],
    });
    expect(saveActiveRapidSession(match)).toBe(true);

    const resumed = loadActiveRapidSession();
    expect(resumed!.events.map((e) => e.kind)).toEqual(["POSSESSION_WON", "POSSESSION_LOST"]);
  });

  it("still lists a completed match containing legacy possession events", () => {
    const match = buildMatch({
      events: [createMatchEvent({ kind: "POSSESSION_LOST", nx: 0.5, ny: 0.5, half: 2, timestamp: 900, teamSide: "FOR" })],
    });
    saveCompletedRapidMatch(match);
    expect(listSavedRapidMatches()[0].events[0].kind).toBe("POSSESSION_LOST");
  });
});

describe("corrupted storage recovery", () => {
  it("recovers with an empty list when the matches key holds invalid JSON", () => {
    window.localStorage.setItem(RAPID_CAPTURE_MATCHES_STORAGE_KEY, "{not json");
    expect(listSavedRapidMatches()).toEqual([]);
  });

  it("recovers with an empty list when the matches key holds a non-array value", () => {
    window.localStorage.setItem(RAPID_CAPTURE_MATCHES_STORAGE_KEY, JSON.stringify({ oops: true }));
    expect(listSavedRapidMatches()).toEqual([]);
  });

  it("drops only the corrupted record and keeps valid ones in the same list", () => {
    const good = buildMatch();
    const corrupted = { ...buildMatch(), session: { bad: "shape" } };
    window.localStorage.setItem(
      RAPID_CAPTURE_MATCHES_STORAGE_KEY,
      JSON.stringify([good, corrupted]),
    );

    const recovered = listSavedRapidMatches();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe(good.id);
  });

  it("ignores a record from a future/unknown schema version", () => {
    const future = { ...buildMatch(), schemaVersion: RAPID_CAPTURE_SCHEMA_VERSION + 1 };
    window.localStorage.setItem(RAPID_CAPTURE_MATCHES_STORAGE_KEY, JSON.stringify([future]));
    expect(listSavedRapidMatches()).toEqual([]);
  });

  it("returns null and self-heals when the active session key is corrupted", () => {
    window.localStorage.setItem(RAPID_CAPTURE_ACTIVE_STORAGE_KEY, "not valid json{{{");
    expect(loadActiveRapidSession()).toBeNull();
    expect(window.localStorage.getItem(RAPID_CAPTURE_ACTIVE_STORAGE_KEY)).toBeNull();
  });

  it("drops events that fail structural validation but keeps the match", () => {
    const match = buildMatch({
      events: [
        ...buildMatch().events,
        { id: "bad-event", kind: "NOT_A_REAL_KIND" } as never,
      ],
    });
    saveActiveRapidSession(match);
    const resumed = loadActiveRapidSession();
    expect(resumed!.events).toHaveLength(2);
  });
});
