// Stage 1 regression coverage: parseStoredSavedMatch and applyRawReviewSession
// (via its extracted pure step, parseRestoredReviewSessionEvents) used to reject
// an entire match/session if a single logged event carried a kind this build's
// MATCH_EVENT_KINDS schema didn't recognise yet — e.g. a match saved by a newer
// build. That made the schema non-additive: shipping a new event kind could
// make previously-saved matches vanish from Saved Matches on an older build,
// or make an imported review session refuse to restore.
//
// These tests exercise the real production parsing pipeline exported from
// StatsModeSurface.tsx against an in-memory localStorage, mirroring the
// existing StatsModeSurface.saved-match-persistence.test.ts setup.
import { beforeEach, describe, expect, it } from "vitest";
import { SAVED_MATCHES_STORAGE_KEY, type LoggedMatchEvent, type SavedMatch } from "./core/stats/saved-match";
import {
  parseRestoredReviewSessionEvents,
  parseStoredActiveMatchDraft,
  persistSavedMatches,
  readSavedMatchesFromStorage,
} from "./StatsModeSurface";

const UNKNOWN_KIND = "SOME_FUTURE_EVENT_KIND" as LoggedMatchEvent["kind"];

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

function buildEvent(overrides: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
  const kind = overrides.kind ?? "POINT";
  return {
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    type: kind,
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
    ...overrides,
  };
}

function buildMatch(events: LoggedMatchEvent[], overrides: Partial<SavedMatch> = {}): SavedMatch {
  return {
    id: "saved-match-1",
    createdAt: 1000,
    label: "Test Match",
    homeTeamName: "Home",
    awayTeamName: "Away",
    venue: "Test Venue",
    events,
    eventCount: events.length,
    scorelineSnapshot: "0-01 (1) v 0-00 (0)",
    ...overrides,
  };
}

beforeEach(() => {
  (globalThis as unknown as { window: Window }).window = {
    localStorage: createMemoryStorage(),
  } as unknown as Window;
});

describe("Stage 1 — parseStoredSavedMatch degrades gracefully on unknown event kinds", () => {
  it("1. a fully valid saved match still parses identically", () => {
    const events = [buildEvent({ id: "e1", kind: "GOAL" }), buildEvent({ id: "e2", kind: "POINT" })];
    const match = buildMatch(events);
    persistSavedMatches([match]);

    const { matches, isCorrupt } = readSavedMatchesFromStorage();
    expect(isCorrupt).toBe(false);
    expect(matches).toHaveLength(1);
    expect(matches[0].events).toHaveLength(2);
    expect(matches[0].events.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(matches[0].eventCount).toBe(2);
  });

  it("2. 99 valid events + 1 unknown-future-kind event: match loads, 99 recognised events remain, unknown event ignored", () => {
    const validEvents = Array.from({ length: 99 }, (_, i) => buildEvent({ id: `valid-${i}`, kind: "POINT" }));
    const events = [...validEvents, buildEvent({ id: "unknown-1", kind: UNKNOWN_KIND })];
    const match = buildMatch(events, { eventCount: events.length });
    persistSavedMatches([match]);

    const { matches, isCorrupt } = readSavedMatchesFromStorage();
    expect(isCorrupt).toBe(false);
    expect(matches).toHaveLength(1); // whole match NOT rejected
    expect(matches[0].events).toHaveLength(99); // exactly the 99 recognised events remain
    expect(matches[0].events.some((e) => e.id === "unknown-1")).toBe(false); // unknown event silently ignored
    expect(matches[0].events.every((e) => e.kind === "POINT")).toBe(true);
  });

  it("a match containing ONLY unknown-kind events is dropped (no usable events), same as an empty-events match today", () => {
    const events = [buildEvent({ id: "unknown-1", kind: UNKNOWN_KIND }), buildEvent({ id: "unknown-2", kind: UNKNOWN_KIND })];
    const match = buildMatch(events, { eventCount: events.length });
    persistSavedMatches([match]);

    const { matches } = readSavedMatchesFromStorage();
    expect(matches).toHaveLength(0);
  });

  it("4. malformed base match structures still fail as before (unrelated to event kind)", () => {
    // Missing id entirely — always invalid, unrelated to this change.
    const noId = { ...buildMatch([buildEvent()]) } as Record<string, unknown>;
    delete noId.id;
    (globalThis as unknown as { window: Window }).window.localStorage.setItem(
      SAVED_MATCHES_STORAGE_KEY,
      JSON.stringify([noId]),
    );
    expect(readSavedMatchesFromStorage().matches).toHaveLength(0);

    // A structurally malformed event (no id) inside an otherwise fine match
    // must still invalidate the whole match — validation for malformed
    // recognised events is unchanged.
    const malformedEventMatch = buildMatch([
      buildEvent({ id: "ok-1" }),
      { ...buildEvent(), id: undefined as unknown as string },
    ]);
    (globalThis as unknown as { window: Window }).window.localStorage.setItem(
      SAVED_MATCHES_STORAGE_KEY,
      JSON.stringify([malformedEventMatch]),
    );
    expect(readSavedMatchesFromStorage().matches).toHaveLength(0);
  });

  it("5. storage read of non-array payload is still reported as corrupt (migration/shape guard unchanged)", () => {
    (globalThis as unknown as { window: Window }).window.localStorage.setItem(
      SAVED_MATCHES_STORAGE_KEY,
      JSON.stringify({ not: "an array" }),
    );
    const { matches, isCorrupt } = readSavedMatchesFromStorage();
    expect(isCorrupt).toBe(true);
    expect(matches).toHaveLength(0);
  });
});

describe("Stage 1 — imported review session (parseRestoredReviewSessionEvents) behaves the same way", () => {
  it("3. 99 valid + 1 unknown-kind event: restore succeeds, 99 recognised events remain", () => {
    const validEvents = Array.from({ length: 99 }, (_, i) => buildEvent({ id: `valid-${i}`, kind: "POINT" }));
    const events = [...validEvents, buildEvent({ id: "unknown-1", kind: UNKNOWN_KIND })];

    const result = parseRestoredReviewSessionEvents(events);
    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(99);
    expect(result.events.some((e) => e.id === "unknown-1")).toBe(false);
  });

  it("a fully valid session restores identically", () => {
    const events = [buildEvent({ id: "e1" }), buildEvent({ id: "e2", kind: "WIDE" })];
    const result = parseRestoredReviewSessionEvents(events);
    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(2);
  });

  it("4. a structurally malformed event still fails the whole restore", () => {
    const events = [buildEvent({ id: "ok-1" }), { ...buildEvent(), id: undefined as unknown as string }];
    const result = parseRestoredReviewSessionEvents(events);
    expect(result.ok).toBe(false);
    expect(result.events).toHaveLength(0);
  });
});

describe("Stage 1 — active match draft parser behaviour is unchanged", () => {
  it("5. an unknown-kind event in the live draft is still dropped individually, draft still loads", () => {
    const events = [buildEvent({ id: "valid-1" }), buildEvent({ id: "unknown-1", kind: UNKNOWN_KIND })];
    const raw = JSON.stringify({
      matchId: "draft-1",
      updatedAt: 1000,
      currentMode: "football",
      activeTeam: "HOME",
      teamNames: { HOME: "Home", AWAY: "Away" },
      venue: "Venue",
      events,
      restoreContext: {},
    });
    const { draft, isCorrupt } = parseStoredActiveMatchDraft(raw);
    expect(isCorrupt).toBe(false);
    expect(draft).not.toBeNull();
    expect(draft!.events).toHaveLength(1);
    expect(draft!.events[0].id).toBe("valid-1");
  });

  it("a fully valid draft still parses identically", () => {
    const events = [buildEvent({ id: "valid-1" }), buildEvent({ id: "valid-2", kind: "GOAL" })];
    const raw = JSON.stringify({
      matchId: "draft-2",
      updatedAt: 2000,
      currentMode: "hurling",
      activeTeam: "AWAY",
      teamNames: { HOME: "Home", AWAY: "Away" },
      venue: "Venue",
      events,
      restoreContext: {},
    });
    const { draft, isCorrupt } = parseStoredActiveMatchDraft(raw);
    expect(isCorrupt).toBe(false);
    expect(draft!.events).toHaveLength(2);
  });
});
