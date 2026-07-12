import { beforeEach, describe, expect, it } from "vitest";
import { createMatchEvent } from "../core/stats/stats-event-model";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { SAVED_MATCHES_STORAGE_KEY } from "../core/stats/saved-match";
import {
  PRO_TAGGER_MATCHES_STORAGE_KEY,
  readProTaggerMatches,
  saveProTaggerMatchFull,
  type ProTaggerSavedMatch,
  type ProTaggerRestoreContext,
} from "./pro-tagger-storage";
import {
  COORDINATE_REPAIR_VERSION,
  flipEventTouchlineAxis,
  isCoordinateRepairApplied,
  readProTaggerCoordinateRepairBackups,
  repairMirroredEventLocations,
  repairProTaggerMatchById,
} from "./pro-tagger-coordinate-repair";
import {
  proTaggerMatchToPdfInput,
  proTaggerMatchToSnapshotInput,
} from "./pro-tagger-review-adapter";

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

function buildEvent(overrides: Partial<LoggedMatchEvent> & { nx: number; ny: number }): LoggedMatchEvent {
  const base = createMatchEvent({
    kind: overrides.kind ?? "POINT",
    nx: overrides.nx,
    ny: overrides.ny,
    half: overrides.half ?? 1,
    timestamp: overrides.timestamp ?? 0,
  });
  return {
    ...base,
    type: base.kind,
    teamSide: overrides.teamSide ?? "FOR",
    x: overrides.nx,
    y: overrides.ny,
    period: overrides.period ?? "1H",
    segment: overrides.segment ?? 1,
    matchClockSeconds: overrides.matchClockSeconds ?? 0,
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  } as LoggedMatchEvent;
}

const RESTORE_CONTEXT: ProTaggerRestoreContext = {
  matchState: "FULL_TIME",
  currentHalf: 2,
  matchTimeSeconds: 0,
  firstHalfAttackingDirection: "right",
};

function buildMatch(overrides: Partial<ProTaggerSavedMatch> = {}): ProTaggerSavedMatch {
  return {
    id: "match-1",
    createdAt: Date.now(),
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
    restoreContext: RESTORE_CONTEXT,
    ...overrides,
  };
}

describe("flipEventTouchlineAxis", () => {
  it("flips ny to 1 - ny and leaves nx unchanged", () => {
    const event = buildEvent({ nx: 0.83, ny: 0.18 });
    const flipped = flipEventTouchlineAxis(event);
    expect(flipped.nx).toBeCloseTo(0.83, 9);
    expect(flipped.ny).toBeCloseTo(1 - 0.18, 9);
  });

  it("flips y (the field every stored event actually carries) to 1 - y and leaves x unchanged", () => {
    const event = buildEvent({ nx: 0.21, ny: 0.91 });
    const flipped = flipEventTouchlineAxis(event);
    expect(flipped.x).toBeCloseTo(0.21, 9);
    expect(flipped.y).toBeCloseTo(1 - 0.91, 9);
  });

  it("preserves every non-coordinate field untouched", () => {
    const event = buildEvent({
      nx: 0.5,
      ny: 0.5,
      kind: "TWO_POINTER",
      playerId: "p1",
      playerName: "J. Coach",
      playerNumber: 13,
      restartOwner: undefined,
      teamSide: "FOR",
    });
    const flipped = flipEventTouchlineAxis(event);
    expect(flipped.id).toBe(event.id);
    expect(flipped.kind).toBe(event.kind);
    expect(flipped.playerId).toBe(event.playerId);
    expect(flipped.playerName).toBe(event.playerName);
    expect(flipped.playerNumber).toBe(event.playerNumber);
    expect(flipped.teamSide).toBe(event.teamSide);
    expect(flipped.half).toBe(event.half);
    expect(flipped.period).toBe(event.period);
    expect(flipped.matchClockSeconds).toBe(event.matchClockSeconds);
    expect(flipped.createdAt).toBe(event.createdAt);
  });
});

describe("repairMirroredEventLocations — pure repair", () => {
  it("repairs every event's ny/y, keeps nx/x, and stamps a coordinateRepair marker", () => {
    const match = buildMatch({
      events: [
        buildEvent({ nx: 0.15, ny: 0.12 }),
        buildEvent({ nx: 0.82, ny: 0.18 }),
        buildEvent({ nx: 0.83, ny: 0.87 }),
        buildEvent({ nx: 0.21, ny: 0.91 }),
      ],
    });

    const result = repairMirroredEventLocations(match);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.match.events.forEach((event, i) => {
      const original = match.events[i]!;
      expect(event.nx).toBeCloseTo(original.nx, 9);
      expect(event.x).toBeCloseTo(original.x, 9);
      expect(event.ny).toBeCloseTo(1 - original.ny, 9);
      expect(event.y).toBeCloseTo(1 - original.y, 9);
    });

    expect(result.match.coordinateRepair?.version).toBe(COORDINATE_REPAIR_VERSION);
    expect(typeof result.match.coordinateRepair?.appliedAt).toBe("number");
    expect(isCoordinateRepairApplied(result.match)).toBe(true);
  });

  it("preserves event count, scores, players, teams, timestamps and halves", () => {
    const events = [
      buildEvent({ nx: 0.9, ny: 0.1, kind: "TWO_POINTER", half: 1, period: "1H", playerNumber: 11, teamSide: "FOR" }),
      buildEvent({ nx: 0.1, ny: 0.9, kind: "WIDE", half: 2, period: "2H", playerNumber: 4, teamSide: "OPP" }),
    ];
    const match = buildMatch({ events, eventCount: events.length });

    const result = repairMirroredEventLocations(match);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.match.id).toBe(match.id);
    expect(result.match.homeTeamName).toBe(match.homeTeamName);
    expect(result.match.awayTeamName).toBe(match.awayTeamName);
    expect(result.match.scorelineSnapshot).toBe(match.scorelineSnapshot);
    expect(result.match.eventCount).toBe(match.eventCount);
    expect(result.match.events).toHaveLength(match.events.length);
    result.match.events.forEach((event, i) => {
      expect(event.id).toBe(events[i]!.id);
      expect(event.half).toBe(events[i]!.half);
      expect(event.period).toBe(events[i]!.period);
      expect(event.playerNumber).toBe(events[i]!.playerNumber);
      expect(event.teamSide).toBe(events[i]!.teamSide);
      expect(event.matchClockSeconds).toBe(events[i]!.matchClockSeconds);
      expect(event.createdAt).toBe(events[i]!.createdAt);
    });
  });

  it("is idempotent — a second call on an already-repaired match makes no change", () => {
    const match = buildMatch({ events: [buildEvent({ nx: 0.3, ny: 0.2 })] });

    const first = repairMirroredEventLocations(match);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = repairMirroredEventLocations(first.match);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("already-repaired");

    // The event coordinates from the first (correct) repair must still stand —
    // running the migration twice does not re-flip data.
    expect(first.match.events[0]!.ny).toBeCloseTo(1 - 0.2, 9);
  });
});

describe("repairProTaggerMatchById — storage-level flow", () => {
  function seedMatch(match: ProTaggerSavedMatch) {
    saveProTaggerMatchFull(match);
  }

  it("backs up the original match before repairing", () => {
    const match = buildMatch({ events: [buildEvent({ nx: 0.4, ny: 0.25 })] });
    seedMatch(match);

    const result = repairProTaggerMatchById(match.id);
    expect(result.ok).toBe(true);

    const backups = readProTaggerCoordinateRepairBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]!.matchId).toBe(match.id);
    expect(backups[0]!.match.events[0]!.ny).toBeCloseTo(0.25, 9); // pre-repair value
  });

  it("persists the repaired match so downstream reads see corrected coordinates", () => {
    const match = buildMatch({ events: [buildEvent({ nx: 0.6, ny: 0.4 })] });
    seedMatch(match);

    repairProTaggerMatchById(match.id);

    const [stored] = readProTaggerMatches();
    expect(stored!.events[0]!.ny).toBeCloseTo(1 - 0.4, 9);
    expect(stored!.events[0]!.nx).toBeCloseTo(0.6, 9);
    expect(isCoordinateRepairApplied(stored!)).toBe(true);
  });

  it("running the repair twice on the same stored match id is a no-op the second time", () => {
    const match = buildMatch({ events: [buildEvent({ nx: 0.6, ny: 0.4 })] });
    seedMatch(match);

    const first = repairProTaggerMatchById(match.id);
    expect(first.ok).toBe(true);

    const second = repairProTaggerMatchById(match.id);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("already-repaired");

    const [stored] = readProTaggerMatches();
    // Still flipped exactly once — not flipped back to the original mirrored value.
    expect(stored!.events[0]!.ny).toBeCloseTo(1 - 0.4, 9);
  });

  it("returns not-found for an unknown match id and touches no storage", () => {
    const result = repairProTaggerMatchById("does-not-exist");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-found");
    expect(readProTaggerCoordinateRepairBackups()).toHaveLength(0);
  });

  it("never touches Match Stats-native data stored under the shared key", () => {
    const matchStatsNativeRecord = {
      id: "stats-lite-match-1",
      createdAt: Date.now(),
      label: "Ballyboden v Na Fianna",
      homeTeamName: "Ballyboden",
      awayTeamName: "Na Fianna",
      venue: "",
      events: [buildEvent({ nx: 0.7, ny: 0.3 })],
      eventCount: 1,
      scorelineSnapshot: "1-04 v 0-06",
    };
    window.localStorage.setItem(
      SAVED_MATCHES_STORAGE_KEY,
      JSON.stringify([matchStatsNativeRecord]),
    );
    const beforeRaw = window.localStorage.getItem(SAVED_MATCHES_STORAGE_KEY);

    const proTaggerMatch = buildMatch({ id: "pro-match-1", events: [buildEvent({ nx: 0.6, ny: 0.4 })] });
    seedMatch(proTaggerMatch);
    repairProTaggerMatchById(proTaggerMatch.id);

    const afterRaw = window.localStorage.getItem(SAVED_MATCHES_STORAGE_KEY);
    expect(afterRaw).toBe(beforeRaw);
    // And the Pro Tagger key is the only one that changed.
    expect(window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY)).not.toBeNull();
  });

  it("exported and reimported repaired data remains stable", () => {
    const match = buildMatch({ events: [buildEvent({ nx: 0.45, ny: 0.6 })] });
    seedMatch(match);
    repairProTaggerMatchById(match.id);

    const [repaired] = readProTaggerMatches();
    // Simulate "Export Match JSON" then "Import Match JSON" — a straight
    // JSON round trip, exactly as ProTaggerReviewScreen's handlers do.
    const exportedJson = JSON.stringify(repaired);
    const reimported = JSON.parse(exportedJson) as ProTaggerSavedMatch;
    // Import overwrites-by-id via the same upsert path a fresh import uses.
    saveProTaggerMatchFull(reimported);

    const [afterReimport] = readProTaggerMatches();
    expect(afterReimport!.coordinateRepair).toEqual(repaired!.coordinateRepair);
    expect(afterReimport!.events[0]!.ny).toBeCloseTo(repaired!.events[0]!.ny, 9);
    expect(afterReimport!.events[0]!.nx).toBeCloseTo(repaired!.events[0]!.nx, 9);

    // Repairing the reimported record again must still be a no-op.
    const reRepair = repairProTaggerMatchById(afterReimport!.id);
    expect(reRepair.ok).toBe(false);
  });
});

describe("Adare v Mungret — known first-half two-pointer sidelines", () => {
  // Ground truth: where the coach actually tapped for two two-pointers taken
  // from opposite sidelines in the first half. A fresh capture with the
  // ProTaggerPitchView fix would store exactly these nx/ny values.
  const ORIGINAL_LEFT_SIDELINE_TWO_POINTER = { nx: 0.86, ny: 0.14 };
  const ORIGINAL_RIGHT_SIDELINE_TWO_POINTER = { nx: 0.88, ny: 0.83 };

  // What the pre-fix, buggy portrait capture actually stored for those same
  // taps: nx unchanged, ny mirrored (storedNy = 1 - correctedNy).
  function asHistoricallyStored(point: { nx: number; ny: number }) {
    return { nx: point.nx, ny: 1 - point.ny };
  }

  it("restores both two-pointers to their originally tagged sideline", () => {
    const leftStored = asHistoricallyStored(ORIGINAL_LEFT_SIDELINE_TWO_POINTER);
    const rightStored = asHistoricallyStored(ORIGINAL_RIGHT_SIDELINE_TWO_POINTER);

    const match = buildMatch({
      id: "adare-v-mungret",
      events: [
        buildEvent({
          nx: leftStored.nx,
          ny: leftStored.ny,
          kind: "TWO_POINTER",
          half: 1,
          period: "1H",
          teamSide: "FOR",
          team: "HOME",
        }),
        buildEvent({
          nx: rightStored.nx,
          ny: rightStored.ny,
          kind: "TWO_POINTER",
          half: 1,
          period: "1H",
          teamSide: "FOR",
          team: "HOME",
        }),
      ],
    });

    seedMatchAdare(match);
    const result = repairProTaggerMatchById(match.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [first, second] = result.match.events;
    expect(first!.nx).toBeCloseTo(ORIGINAL_LEFT_SIDELINE_TWO_POINTER.nx, 9);
    expect(first!.ny).toBeCloseTo(ORIGINAL_LEFT_SIDELINE_TWO_POINTER.ny, 9);
    expect(second!.nx).toBeCloseTo(ORIGINAL_RIGHT_SIDELINE_TWO_POINTER.nx, 9);
    expect(second!.ny).toBeCloseTo(ORIGINAL_RIGHT_SIDELINE_TWO_POINTER.ny, 9);

    // The two events must land on OPPOSITE sidelines from one another (one
    // near ny=0, one near ny=1) — not both dragged to the same side, which
    // is what a reflection-instead-of-flip bug in the repair itself would do.
    expect(first!.ny).toBeLessThan(0.5);
    expect(second!.ny).toBeGreaterThan(0.5);
  });

  it("PDF and snapshot exports (Full Review PDF, HT/FT Snapshot) see the corrected sidelines", () => {
    const leftStored = asHistoricallyStored(ORIGINAL_LEFT_SIDELINE_TWO_POINTER);
    const rightStored = asHistoricallyStored(ORIGINAL_RIGHT_SIDELINE_TWO_POINTER);
    const match = buildMatch({
      id: "adare-v-mungret-pdf",
      restoreContext: { ...RESTORE_CONTEXT, firstHalfAttackingDirection: "right" },
      events: [
        buildEvent({ nx: leftStored.nx, ny: leftStored.ny, kind: "TWO_POINTER", half: 1, period: "1H" }),
        buildEvent({ nx: rightStored.nx, ny: rightStored.ny, kind: "TWO_POINTER", half: 1, period: "1H" }),
      ],
    });
    seedMatchAdare(match);
    const result = repairProTaggerMatchById(match.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The adapter passes events through by reference with no coordinate
    // transform of its own (see pro-tagger-review-adapter.ts) — so the PDF
    // and snapshot inputs must carry exactly the repaired coordinates.
    const pdfInput = proTaggerMatchToPdfInput(result.match);
    const snapshotInput = proTaggerMatchToSnapshotInput(result.match, "FULL_TIME_SNAPSHOT");

    for (const input of [pdfInput, snapshotInput]) {
      expect(input.events[0]!.ny).toBeCloseTo(ORIGINAL_LEFT_SIDELINE_TWO_POINTER.ny, 9);
      expect(input.events[1]!.ny).toBeCloseTo(ORIGINAL_RIGHT_SIDELINE_TWO_POINTER.ny, 9);
    }
  });

  function seedMatchAdare(match: ProTaggerSavedMatch) {
    saveProTaggerMatchFull(match);
  }
});
