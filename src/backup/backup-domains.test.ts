// Proves every hardcoded storageKey in backup-domains.ts actually matches
// its real owning module — by writing through that module's own real save
// function (not by comparing string literals to another string literal,
// which would just prove the two copies agree with each other, not that
// either is correct).
import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_DOMAINS, findBackupDomain } from "./backup-domains";

import { SAVED_MATCHES_STORAGE_KEY, SAVED_SQUADS_STORAGE_KEY } from "../core/stats/saved-match";
import { PRO_TAGGER_MATCHES_STORAGE_KEY } from "../pro-tagger/pro-tagger-storage";
import { RAPID_CAPTURE_MATCHES_STORAGE_KEY } from "../rapid-capture/rapid-capture-storage";
import { QUICKBOARD_STORAGE_KEY } from "../features/quickboard/storage/quickboard-types";

import { saveScenario, listScenarios } from "../features/vision-tactics/tacticalPlayStorage";
import { upsertSession, loadSessions, upsertTrainingHubSquad, loadTrainingHubSquads } from "../vision-training/trainingStorage";
import { saveCoachNotes, loadCoachNotes } from "../features/notes/notes-storage";
import { saveSeasonTable, loadSeasonTable, saveSavedSquads, loadSavedSquads } from "../features/player-performance-tracker/storage/trainingSessionStorage";
import type { TrainingSession, TrainingHubSquad } from "../vision-training/types";
import type { CoachNote } from "../features/notes/types";

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
  // Some storage modules read `window.localStorage`, others read the bare
  // `localStorage` global directly — both must point at the same store.
  const storage = createMemoryStorage();
  (globalThis as unknown as { window: Window }).window = { localStorage: storage } as unknown as Window;
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;
});

describe("backup domain registry has no duplicate ids or storage keys", () => {
  it("every id is unique", () => {
    const ids = BACKUP_DOMAINS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every storageKey is unique", () => {
    const keys = BACKUP_DOMAINS.map((d) => d.storageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("findBackupDomain resolves a known id and returns undefined for an unknown one", () => {
    expect(findBackupDomain("matchStatsSavedMatches")?.storageKey).toBe("pitchflow_matches_v1");
    expect(findBackupDomain("not-a-real-domain")).toBeUndefined();
  });
});

describe("registered storage keys match their real owning module (exported constants)", () => {
  it.each([
    ["matchStatsSavedMatches", SAVED_MATCHES_STORAGE_KEY],
    ["savedSquadTemplates", SAVED_SQUADS_STORAGE_KEY],
    ["proTaggerMatches", PRO_TAGGER_MATCHES_STORAGE_KEY],
    ["rapidCaptureMatches", RAPID_CAPTURE_MATCHES_STORAGE_KEY],
    ["quickboardBoards", QUICKBOARD_STORAGE_KEY],
  ])("%s", (domainId, realKey) => {
    expect(findBackupDomain(domainId)!.storageKey).toBe(realKey);
  });
});

describe("registered storage keys match their real owning module (round-tripped through the real save function)", () => {
  it("tacticalPlayScenarios: saveScenario writes to the registered key", () => {
    const ballState = { x: 0.5, y: 0.5 } as unknown as Parameters<typeof saveScenario>[3];
    saveScenario("Kickout press", [], [], ballState, [], []);
    expect(listScenarios()).toHaveLength(1);
    const domain = findBackupDomain("tacticalPlayScenarios")!;
    expect(JSON.parse(window.localStorage.getItem(domain.storageKey)!)).toHaveLength(1);
  });

  it("trainingSessions: upsertSession writes to the registered key", () => {
    const session = { id: "s1", createdAt: 1 } as unknown as TrainingSession;
    upsertSession(session);
    expect(loadSessions()).toHaveLength(1);
    const domain = findBackupDomain("trainingSessions")!;
    expect(JSON.parse(window.localStorage.getItem(domain.storageKey)!)).toHaveLength(1);
  });

  it("trainingSavedSquads: upsertTrainingHubSquad writes to the registered key", () => {
    const squad: TrainingHubSquad = { id: "sq1", name: "Seniors", players: [], createdAt: "1970-01-01T00:00:00.000Z", updatedAt: "1970-01-01T00:00:00.000Z" };
    upsertTrainingHubSquad(squad);
    expect(loadTrainingHubSquads()).toHaveLength(1);
    const domain = findBackupDomain("trainingSavedSquads")!;
    expect(JSON.parse(window.localStorage.getItem(domain.storageKey)!)).toHaveLength(1);
  });

  it("coachNotes: saveCoachNotes writes to the registered key", () => {
    const note: CoachNote = { id: "n1", type: "text", scope: "standalone", createdAt: 1, text: "Press higher in 2H" };
    saveCoachNotes([note]);
    expect(loadCoachNotes()).toHaveLength(1);
    const domain = findBackupDomain("coachNotes")!;
    expect(JSON.parse(window.localStorage.getItem(domain.storageKey)!)).toHaveLength(1);
  });

  it("playerPerformanceSeason: saveSeasonTable writes to the registered key", () => {
    saveSeasonTable([{ playerId: "p1" } as never]);
    expect(loadSeasonTable()).toHaveLength(1);
    const domain = findBackupDomain("playerPerformanceSeason")!;
    expect(JSON.parse(window.localStorage.getItem(domain.storageKey)!)).toHaveLength(1);
  });

  it("playerPerformanceSquads: saveSavedSquads writes to the registered key", () => {
    saveSavedSquads([{ id: "sq1" } as never]);
    expect(loadSavedSquads()).toHaveLength(1);
    const domain = findBackupDomain("playerPerformanceSquads")!;
    expect(JSON.parse(window.localStorage.getItem(domain.storageKey)!)).toHaveLength(1);
  });
});

// The remaining four domains (matchStatsCurrentSquad, writtenNotes,
// guidedTourSeen, quickShareOnboardingSeen) are component-internal state in
// App.tsx/StatsModeSurface.tsx, PitchFlowCoachShell.tsx, GuidedTour.tsx, and
// TacticalPadLiteClean.tsx respectively, with no exported storage function
// to round-trip through outside rendering the full component. Their exact
// key literals are cited by file:line in backup-domains.ts and were
// confirmed against source directly; this is the honest limit of what a
// unit test can prove without rendering four large page components.
describe("component-internal domains — verified against source, no exported round-trip available", () => {
  it("documents the four keys that could only be confirmed by source citation, not by a real round-trip", () => {
    const uncheckedIds = ["matchStatsCurrentSquad", "writtenNotes", "guidedTourSeen", "quickShareOnboardingSeen"];
    for (const id of uncheckedIds) {
      expect(findBackupDomain(id)).toBeDefined();
    }
  });
});
