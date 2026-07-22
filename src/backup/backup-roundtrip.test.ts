// Full-pipeline round trip (populate -> backup -> clear -> restore ->
// rehydrate -> compare) for every supported domain, plus product-integrity
// checks that data restored through the backup pipeline is still
// functionally correct when read back through each feature's own real
// code — not just byte-identical JSON.
import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_DOMAINS } from "./backup-domains";
import { buildBackupFile, serializeBackupFile } from "./backup-build";
import { parseBackupFile } from "./backup-validate";
import { restoreBackupReplace } from "./backup-restore";

import { persistSavedMatches, readSavedMatchesFromStorage } from "../StatsModeSurface";
import type { SavedMatch, LoggedMatchEvent } from "../core/stats/saved-match";
import { computeRapidScoreboard, type RapidMatchEvent } from "../rapid-capture/rapid-capture-events";
import { saveCompletedRapidMatch, listSavedRapidMatches, type RapidSavedMatch } from "../rapid-capture/rapid-capture-storage";
import { parseImportedMatchFile } from "../rapid-capture/rapid-match-import";
import { createReviewSession } from "../stats/reviewSession";
import { createMatchEvent } from "../core/stats/stats-event-model";
import { saveProTaggerMatchFull, readProTaggerMatches, type ProTaggerSavedMatch } from "../pro-tagger/pro-tagger-storage";
import { saveScenario, listScenarios } from "../features/vision-tactics/tacticalPlayStorage";
import { saveCoachNotes, loadCoachNotes } from "../features/notes/notes-storage";
import { upsertSession, loadSessions } from "../vision-training/trainingStorage";
import { saveSeasonTable, saveSavedSquads, loadSeasonTable, loadSavedSquads } from "../features/player-performance-tracker/storage/trainingSessionStorage";

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

let storage: Storage;

beforeEach(() => {
  storage = createMemoryStorage();
  (globalThis as unknown as { window: Window }).window = { localStorage: storage } as unknown as Window;
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;
});

// ─── Generic round trip across every domain ───────────────────────────────────

describe("full round trip: populate -> backup -> clear -> restore -> compare", () => {
  it("every domain's exact record values survive, not just its key presence", () => {
    const fixtures: Record<string, string> = {
      matchStatsSavedMatches: JSON.stringify([{ id: "m1", homeTeamName: "Áth Cliath", venue: "Croke Park" }]),
      matchStatsCurrentSquad: JSON.stringify([{ id: "sq1", name: "Senior Panel" }]),
      savedSquadTemplates: JSON.stringify([{ id: "tmpl1", name: "Championship XV" }]),
      proTaggerMatches: JSON.stringify([{ id: "pt1", homeTeamName: "Na Fianna" }]),
      rapidCaptureMatches: JSON.stringify([{ id: "rc1", session: { forTeamName: "Ballyboden" } }]),
      quickboardBoards: JSON.stringify([{ id: "b1", name: "Kickout press" }]),
      tacticalPlayScenarios: JSON.stringify([{ id: "p1", name: "Overlap run" }]),
      trainingSessions: JSON.stringify([{ id: "ts1", title: "Tuesday session" }]),
      trainingSavedSquads: JSON.stringify([{ id: "tsq1", name: "U15s" }]),
      playerPerformanceSeason: JSON.stringify([{ playerId: "pp1", name: "Player One" }]),
      playerPerformanceSquads: JSON.stringify([{ id: "pps1", name: "Senior Squad" }]),
      coachNotes: JSON.stringify([{ id: "n1", type: "text", scope: "standalone", createdAt: 1, text: "Push higher in 2H" }]),
      writtenNotes: JSON.stringify([{ id: "wn1", title: "Pre-season plan" }]),
      guidedTourSeen: "seen",
      quickShareOnboardingSeen: "1",
    };

    for (const domain of BACKUP_DOMAINS) {
      storage.setItem(domain.storageKey, fixtures[domain.id]);
    }

    const file = buildBackupFile(storage);
    const raw = serializeBackupFile(file);

    // Clear every supported key (simulating storage loss / a fresh device).
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    for (const domain of BACKUP_DOMAINS) expect(storage.getItem(domain.storageKey)).toBeNull();

    const parsed = parseBackupFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const outcome = restoreBackupReplace(parsed.file, storage);
    expect(outcome.ok).toBe(true);

    // Rehydrate: re-read every domain fresh from storage, exactly as a
    // reloaded app would, and compare against the original fixture values.
    for (const domain of BACKUP_DOMAINS) {
      expect(storage.getItem(domain.storageKey)).toBe(fixtures[domain.id]);
    }
  });
});

// ─── Product integrity: data survives with functional correctness, not just bytes ──

describe("existing product integrity after restore", () => {
  it("saved Match Stats matches reopen with correct content", () => {
    const events: LoggedMatchEvent[] = [
      { id: "e1", kind: "GOAL", type: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR", x: 0.9, y: 0.5, period: "1H", segment: 1, matchClockSeconds: 10, createdAt: 10 },
    ];
    const match: SavedMatch = {
      id: "saved-match-1", createdAt: 1000, label: "Ballyboden v Na Fianna", homeTeamName: "Ballyboden", awayTeamName: "Na Fianna",
      venue: "Croke Park", events, eventCount: 1, scorelineSnapshot: "1-00 (3) v 0-00 (0)",
    };
    persistSavedMatches([match]);
    // StatsModeSurface's own parser normalises stored events with derived
    // fields (halfSegment, matchTimeSeconds) on read — capture that as the
    // real baseline rather than the raw input, so this test proves restore
    // doesn't change anything further, not that the parser is a no-op.
    const baselineEvents = readSavedMatchesFromStorage().matches[0].events;

    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    const parsed = parseBackupFile(serializeBackupFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackupReplace(parsed.file, storage);

    const reopened = readSavedMatchesFromStorage();
    expect(reopened.matches).toHaveLength(1);
    expect(reopened.matches[0].homeTeamName).toBe("Ballyboden");
    expect(reopened.matches[0].events).toEqual(baselineEvents);
  });

  it("Rapid Capture scores remain correct after restore (audit F01 surface)", () => {
    const rapidEvents: RapidMatchEvent[] = [
      { id: "r1", kind: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" },
      { id: "r2", kind: "FREE_SCORED", nx: 0.9, ny: 0.5, half: 1, timestamp: 20, teamSide: "FOR" },
      { id: "r3", kind: "FORTY_FIVE_TWO_POINT", nx: 0.9, ny: 0.5, half: 1, timestamp: 30, teamSide: "FOR" },
    ];
    const rapidMatch: RapidSavedMatch = {
      schemaVersion: 1, id: "rc-1", createdAt: 1, updatedAt: 1, status: "COMPLETED",
      session: { sport: "gaelic", forTeamName: "Ballylanders", oppTeamName: "Adare", venue: "", matchType: "league", forTeamColour: "#000", oppTeamColour: "#fff", attackDirection: "right", halfDurationMinutes: 30 },
      events: rapidEvents, half: 2, clockSeconds: 100, matchState: "FULL_TIME",
    };
    saveCompletedRapidMatch(rapidMatch);

    const before = computeRapidScoreboard(listSavedRapidMatches()[0].events);
    expect(before.for).toEqual({ goals: 1, points: 3, twoPointers: 1, total: 6 }); // 3 + 1 + 2

    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    const parsed = parseBackupFile(serializeBackupFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackupReplace(parsed.file, storage);

    const after = computeRapidScoreboard(listSavedRapidMatches()[0].events);
    expect(after).toEqual(before);
  });

  it("imported match event counts remain correct after restore", () => {
    const sourceEvents = [
      createMatchEvent({ kind: "POINT", nx: 0.9, ny: 0.5, half: 1, timestamp: 1, teamSide: "FOR" }),
      createMatchEvent({ kind: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 2, teamSide: "FOR" }),
      createMatchEvent({ kind: "WIDE", nx: 0.1, ny: 0.5, half: 1, timestamp: 3, teamSide: "OPP" }),
    ];
    const reviewSession = createReviewSession({
      matchInfo: { homeTeam: "Ballylanders", awayTeam: "Adare" },
      events: sourceEvents,
      reviewContext: { period: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL" },
    });
    const imported = parseImportedMatchFile(JSON.stringify(reviewSession));
    expect(imported.status).toBe("ok");
    if (imported.status === "error") return;
    const rapidMatch: RapidSavedMatch = {
      schemaVersion: 1, id: "imported-1", createdAt: 1, updatedAt: 1, status: "COMPLETED",
      session: imported.match.session, events: imported.match.events, half: 1, clockSeconds: 3, matchState: "FULL_TIME",
    };
    saveCompletedRapidMatch(rapidMatch);
    expect(listSavedRapidMatches()[0].events).toHaveLength(3);

    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    const parsed = parseBackupFile(serializeBackupFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackupReplace(parsed.file, storage);

    expect(listSavedRapidMatches()[0].events).toHaveLength(3);
  });

  it("Event Stats (Pro Tagger) matches remain intact after restore", () => {
    const proMatch: ProTaggerSavedMatch = {
      id: "pt-1", createdAt: 1, homeTeamName: "St Judes", awayTeamName: "Ballinteer", venue: "",
      sport: "gaelic", matchType: "league", halfDurationMinutes: 30, scorelineSnapshot: "1-04 (7) v 0-03 (3)",
      eventCount: 2, events: [], homeSquad: { id: "h", teamSide: "HOME", players: [] }, awaySquad: { id: "a", teamSide: "AWAY", players: [] },
      homeSquadLiveState: [], awaySquadLiveState: [],
      restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 0, firstHalfAttackingDirection: "right" },
    };
    saveProTaggerMatchFull(proMatch);

    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    const parsed = parseBackupFile(serializeBackupFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackupReplace(parsed.file, storage);

    const reopened = readProTaggerMatches();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].scorelineSnapshot).toBe("1-04 (7) v 0-03 (3)");
  });

  it("Tactical Play scenarios reopen after restore", () => {
    const ballState = { x: 0.5, y: 0.5 } as unknown as Parameters<typeof saveScenario>[3];
    saveScenario("Kickout overload", [], [], ballState, [], []);
    expect(listScenarios()).toHaveLength(1);

    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    const parsed = parseBackupFile(serializeBackupFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackupReplace(parsed.file, storage);

    const reopened = listScenarios();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].name).toBe("Kickout overload");
  });

  it("notes and training data remain intact after restore", () => {
    saveCoachNotes([{ id: "n1", type: "text", scope: "standalone", createdAt: 1, text: "Watch the middle third" }]);
    upsertSession({ id: "ts1", createdAt: "1970-01-01T00:00:00.000Z", date: "2026-01-01", title: "Tuesday", status: "completed", attendance: [], playerNotes: [] });

    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    const parsed = parseBackupFile(serializeBackupFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackupReplace(parsed.file, storage);

    expect(loadCoachNotes()).toHaveLength(1);
    expect(loadCoachNotes()[0].text).toBe("Watch the middle third");
    expect(loadSessions()).toHaveLength(1);
    expect(loadSessions()[0].title).toBe("Tuesday");
  });

  it("squads, players and teams remain intact after restore", () => {
    saveSeasonTable([{ playerId: "p1", name: "Player One", appearances: 5 } as never]);
    saveSavedSquads([{ id: "sq1", name: "Senior Squad", players: [] } as never]);

    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) storage.removeItem(domain.storageKey);
    const parsed = parseBackupFile(serializeBackupFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackupReplace(parsed.file, storage);

    expect(loadSeasonTable()).toHaveLength(1);
    expect(loadSavedSquads()).toHaveLength(1);
    expect(loadSavedSquads()[0].name).toBe("Senior Squad");
  });
});
