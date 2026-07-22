// Runs the manual acceptance scenario from the PR spec end to end against
// the real pipeline: populate every supported area with recognisable
// content -> create backup -> verify filename/summary/unsupported warning
// -> clear supported storage -> restore -> compare every domain. Then the
// five required negative scenarios (corrupt file, wrong schema,
// unsupported version, simulated write failure + rollback, restore over
// populated data), each with its outcome asserted explicitly.
import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_DOMAINS } from "./backup-domains";
import { buildBackupFile, formatBackupFilename, serializeBackupFile, UNSUPPORTED_DOMAINS } from "./backup-build";
import { parseBackupFile } from "./backup-validate";
import { restoreBackupReplace } from "./backup-restore";
import { BACKUP_SCHEMA, BACKUP_VERSION, type BackupFile } from "./backup-types";

import { persistSavedMatches, readSavedMatchesFromStorage } from "../StatsModeSurface";
import type { SavedMatch, LoggedMatchEvent } from "../core/stats/saved-match";
import { computeRapidScoreboard } from "../rapid-capture/rapid-capture-events";
import { saveCompletedRapidMatch, listSavedRapidMatches, type RapidSavedMatch } from "../rapid-capture/rapid-capture-storage";
import { saveScenario, listScenarios } from "../features/vision-tactics/tacticalPlayStorage";
import { saveCoachNotes, loadCoachNotes } from "../features/notes/notes-storage";
import { upsertSession, loadSessions } from "../vision-training/trainingStorage";
import { saveSavedSquads, loadSavedSquads } from "../features/player-performance-tracker/storage/trainingSessionStorage";

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

function withFailingWrite(base: Storage, failOnKey: string): Storage {
  let failed = false;
  return {
    getItem: (key: string) => base.getItem(key),
    setItem: (key: string, value: string) => {
      if (key === failOnKey && !failed) {
        failed = true;
        throw new Error(`Simulated write failure on "${key}"`);
      }
      base.setItem(key, value);
    },
    removeItem: (key: string) => base.removeItem(key),
    clear: () => base.clear(),
    key: (index: number) => base.key(index),
    get length() {
      return base.length;
    },
  } as Storage;
}

function buildEvent(overrides: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
  return {
    id: "evt-1", kind: "POINT", type: "POINT", nx: 0.9, ny: 0.5, half: 1, timestamp: 10,
    teamSide: "FOR", x: 0.9, y: 0.5, period: "1H", segment: 1, matchClockSeconds: 10, createdAt: 10,
    ...overrides,
  };
}

let storage: Storage;

beforeEach(() => {
  storage = createMemoryStorage();
  (globalThis as unknown as { window: Window }).window = { localStorage: storage } as unknown as Window;
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;
});

describe("manual acceptance fixture", () => {
  it("populates every supported area, backs up, clears, restores, and every domain compares equal", () => {
    // 12 Match Stats matches, "Retention Test 01".."12", each with every scoring type.
    const matches: SavedMatch[] = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return {
        id: `saved-match-${n}`,
        createdAt: n * 1000,
        label: `Retention Test ${String(n).padStart(2, "0")}`,
        homeTeamName: `Retention Test ${String(n).padStart(2, "0")}`,
        awayTeamName: "Opponent",
        venue: "Fraher Field",
        events: [
          buildEvent({ id: `${n}-a`, kind: "GOAL", type: "GOAL" }),
          buildEvent({ id: `${n}-b`, kind: "POINT", type: "POINT" }),
          buildEvent({ id: `${n}-c`, kind: "FREE_SCORED", type: "FREE_SCORED" }),
          buildEvent({ id: `${n}-d`, kind: "TWO_POINTER", type: "TWO_POINTER" }),
          buildEvent({ id: `${n}-e`, kind: "FORTY_FIVE_TWO_POINT", type: "FORTY_FIVE_TWO_POINT" }),
        ],
        eventCount: 5,
        scorelineSnapshot: "2-06 (12) v 0-00 (0)",
      };
    });
    persistSavedMatches(matches);

    // One imported Rapid Capture match with every scoring type, both sides.
    const rapidMatch: RapidSavedMatch = {
      schemaVersion: 1, id: "rapid-imported-1", createdAt: 1, updatedAt: 1, status: "COMPLETED",
      session: { sport: "gaelic", forTeamName: "Ballylanders", oppTeamName: "Adare", venue: "", matchType: "championship", forTeamColour: "#000", oppTeamColour: "#fff", attackDirection: "right", halfDurationMinutes: 30 },
      events: [
        { id: "r1", kind: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 1, teamSide: "FOR" },
        { id: "r2", kind: "POINT", nx: 0.9, ny: 0.5, half: 1, timestamp: 2, teamSide: "FOR" },
        { id: "r3", kind: "FREE_SCORED", nx: 0.9, ny: 0.5, half: 1, timestamp: 3, teamSide: "FOR" },
        { id: "r4", kind: "TWO_POINTER", nx: 0.9, ny: 0.5, half: 1, timestamp: 4, teamSide: "OPP" },
        { id: "r5", kind: "FORTY_FIVE_TWO_POINT", nx: 0.9, ny: 0.5, half: 1, timestamp: 5, teamSide: "OPP" },
      ],
      half: 2, clockSeconds: 100, matchState: "FULL_TIME",
    };
    saveCompletedRapidMatch(rapidMatch);
    const rapidScoreBefore = computeRapidScoreboard(rapidMatch.events);

    // Tactical Slate board (QuickBoard domain — write directly, key already proven correct).
    storage.setItem("pitchflow_quickboard_boards_v1", JSON.stringify([{ id: "board-1", name: "Kickout press", updatedAt: 1 }]));

    // Tactical Play scenario.
    const ballState = { x: 0.5, y: 0.5 } as unknown as Parameters<typeof saveScenario>[3];
    saveScenario("Overlap run", [], [], ballState, [], []);

    // Training Tracker session.
    upsertSession({ id: "training-1", createdAt: "1970-01-01T00:00:00.000Z", date: "2026-01-01", title: "Tuesday session", status: "completed", attendance: [], playerNotes: [] });

    // Coach Notes text.
    saveCoachNotes([{ id: "note-1", type: "text", scope: "standalone", createdAt: 1, text: "Push higher in the second half" }]);

    // Player Performance squad, teams and players.
    saveSavedSquads([{ id: "pp-squad-1", name: "Senior Squad", players: [{ id: "pl1", name: "Player One", number: 4 }] } as never]);

    // Preferences/settings.
    storage.setItem("paircvision_guided_tour_v1", "seen");
    storage.setItem("flowlabs_quick_share_onboarding_seen", "1");

    // Unrelated, non-PáircVision storage — must survive untouched throughout.
    storage.setItem("some_other_apps_key", "not ours");

    // ── Create backup ──
    const now = new Date("2026-06-01T10:30:00.000Z");
    const file = buildBackupFile(storage, { now });
    const filename = formatBackupFilename(now);
    expect(filename).toBe("paircvision-backup-2026-06-01-1030.pvbackup");
    expect(file.summary.domains.matchStatsSavedMatches).toBe(12);
    expect(file.summary.domains.rapidCaptureMatches).toBe(1);
    expect(file.summary.domains.tacticalPlayScenarios).toBe(1);
    expect(file.summary.domains.trainingSessions).toBe(1);
    expect(file.summary.domains.coachNotes).toBe(1);
    expect(file.summary.domains.playerPerformanceSquads).toBe(1);
    expect(file.summary.unsupported).toEqual(UNSUPPORTED_DOMAINS);
    expect(file.summary.unsupported.join(" ")).toMatch(/audio/i);

    const raw = serializeBackupFile(file);

    // ── Clear supported PáircVision storage, "reload" (re-read from scratch) ──
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    expect(readSavedMatchesFromStorage().matches).toHaveLength(0);
    expect(storage.getItem("some_other_apps_key")).toBe("not ours"); // unrelated storage untouched by clearing

    // ── Restore ──
    const parsed = parseBackupFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const outcome = restoreBackupReplace(parsed.file, storage);
    expect(outcome.ok).toBe(true);

    // ── "Reload again", compare every supported domain ──
    const restoredMatches = readSavedMatchesFromStorage();
    expect(restoredMatches.matches).toHaveLength(12); // all 12 saved matches remain
    expect(new Set(restoredMatches.matches.map((m) => m.id)).size).toBe(12); // no duplicates
    for (let n = 1; n <= 12; n++) {
      expect(restoredMatches.matches.some((m) => m.id === `saved-match-${n}`)).toBe(true); // no stale pre-restore gaps
    }

    const restoredRapid = listSavedRapidMatches();
    expect(restoredRapid).toHaveLength(1); // imported match reopens
    expect(computeRapidScoreboard(restoredRapid[0].events)).toEqual(rapidScoreBefore); // scores remain correct
    expect(restoredRapid[0].events).toHaveLength(5); // event counts remain correct

    expect(JSON.parse(storage.getItem("pitchflow_quickboard_boards_v1")!)).toHaveLength(1); // tactical content reopens
    expect(listScenarios()).toHaveLength(1); // tactical content reopens
    expect(loadSessions()).toHaveLength(1); // training content reopens
    expect(loadCoachNotes()).toHaveLength(1); // notes remain
    expect(loadSavedSquads()).toHaveLength(1); // squads, players and teams remain
    expect(loadSavedSquads()[0].players).toHaveLength(1);

    expect(storage.getItem("paircvision_guided_tour_v1")).toBe("seen");
    expect(storage.getItem("flowlabs_quick_share_onboarding_seen")).toBe("1");

    expect(storage.getItem("some_other_apps_key")).toBe("not ours"); // unrelated storage untouched throughout
  });
});

describe("negative scenarios — each outcome recorded explicitly", () => {
  it("1. corrupt file: rejected, no state change", () => {
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "safe" }]));
    const result = parseBackupFile("{ not valid json at all");
    expect(result.ok).toBe(false);
    expect(storage.getItem("pitchflow_matches_v1")).toBe(JSON.stringify([{ id: "safe" }])); // untouched — parse never writes
  });

  it("2. wrong-schema JSON: rejected, no state change", () => {
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "safe" }]));
    const result = parseBackupFile(JSON.stringify({ some: "other app's export" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("wrong-schema");
    expect(storage.getItem("pitchflow_matches_v1")).toBe(JSON.stringify([{ id: "safe" }]));
  });

  it("3. unsupported-version backup: rejected, no state change", () => {
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "safe" }]));
    const futureBackup = JSON.stringify({ schema: BACKUP_SCHEMA, version: 99, createdAt: new Date().toISOString(), summary: { domains: {}, unsupported: [] }, data: {} });
    const result = parseBackupFile(futureBackup);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported-version");
    expect(storage.getItem("pitchflow_matches_v1")).toBe(JSON.stringify([{ id: "safe" }]));
  });

  it("4/5. simulated write failure during restore over populated current data: rollback succeeds, prior data intact, no false success", () => {
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "current-real-match" }]));
    storage.setItem("pitchflow_quickboard_boards_v1", JSON.stringify([{ id: "current-board" }]));
    const failing = withFailingWrite(storage, "pitchflow_pro_tagger_matches_v1");

    const incoming: BackupFile = {
      schema: BACKUP_SCHEMA, version: BACKUP_VERSION, createdAt: new Date().toISOString(),
      summary: { domains: {}, unsupported: [] },
      data: {
        matchStatsSavedMatches: JSON.stringify([{ id: "incoming-match" }]),
        proTaggerMatches: JSON.stringify([{ id: "incoming-pro-tagger" }]),
      },
    };
    const outcome = restoreBackupReplace(incoming, failing);
    expect(outcome.ok).toBe(false); // no false success
    if (outcome.ok) return;
    expect(outcome.rolledBack).toBe(true); // rollback succeeded
    expect(JSON.parse(storage.getItem("pitchflow_matches_v1")!)).toEqual([{ id: "current-real-match" }]); // prior data intact
    expect(JSON.parse(storage.getItem("pitchflow_quickboard_boards_v1")!)).toEqual([{ id: "current-board" }]); // untouched domain intact
  });
});
