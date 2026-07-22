import { describe, it, expect, beforeEach } from "vitest";
import { collectBackupData, enumerateBackupKeys, isBackupKey } from "./backup-manifest";
import { computeBackupCounts, hasMeaningfulBackupData } from "./backup-counts";
import { buildBackupFile, parseBackupFile, serializeBackupFile } from "./backup-export";
import { restoreBackupReplace } from "./backup-import";
import { getLastBackupAt, setLastBackupAt } from "./backup-meta";
import {
  getNudgeMessage,
  markNudgeShownThisSession,
  shouldShowBackupNudge,
  wasNudgeShownThisSession,
} from "./backup-nudge";
import { BACKUP_FORMAT, SUPPORTED_FORMAT_VERSION } from "./backup-types";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function failOnceOnSetStorage(base: Storage, failOnKey: string): Storage {
  let failed = false;
  return {
    get length() {
      return base.length;
    },
    clear() {
      base.clear();
    },
    getItem(key: string) {
      return base.getItem(key);
    },
    key(index: number) {
      return base.key(index);
    },
    removeItem(key: string) {
      base.removeItem(key);
    },
    setItem(key: string, value: string) {
      if (!failed && key === failOnKey) {
        failed = true;
        throw new Error(`Simulated failure on ${key}`);
      }
      base.setItem(key, value);
    },
  };
}

const FIXTURE_MATCHES = JSON.stringify([
  { id: "m1", homeTeamName: "Ballyboden", awayTeamName: "Na Fianna", createdAt: 1 },
]);
const FIXTURE_BOARDS = JSON.stringify([{ id: "b1", name: "Kickout press", createdAt: 1 }]);
const FIXTURE_PLAYS = JSON.stringify([{ id: "p1", name: "Overlap", createdAt: 1 }]);
const FIXTURE_SQUADS = JSON.stringify([{ id: "s1", name: "Senior", createdAt: 1 }]);

function seedFixtureStorage(storage: Storage): void {
  storage.setItem("pitchflow_matches_v1", FIXTURE_MATCHES);
  storage.setItem("pitchflow_pro_tagger_matches_v1", JSON.stringify([{ id: "pt1", createdAt: 1 }]));
  storage.setItem("pitchflow_quickboard_boards_v1", FIXTURE_BOARDS);
  storage.setItem("paircvision-tp-scenarios", FIXTURE_PLAYS);
  storage.setItem("pitchflow_saved_squads_v1", FIXTURE_SQUADS);
  storage.setItem("pitchflow_coach_notes_v1", JSON.stringify([{ id: "n1", type: "text", scope: "standalone", createdAt: 1 }]));
  storage.setItem("paircvision_stats_active_draft_v1", JSON.stringify({ id: "draft", events: [] }));
  storage.setItem("unrelated_app_key", "should-not-export");
}

describe("backup manifest", () => {
  it("matches known PáircVision key prefixes", () => {
    expect(isBackupKey("pitchflow_matches_v1")).toBe(true);
    expect(isBackupKey("paircvision-tp-scenarios")).toBe(true);
    expect(isBackupKey("pitchsideclub.squads")).toBe(true);
    expect(isBackupKey("flowlabs_quick_share_onboarding_seen")).toBe(true);
    expect(isBackupKey("unrelated_app_key")).toBe(false);
  });
});

describe("backup export / parse", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    seedFixtureStorage(storage);
  });

  it("round-trips localStorage byte-identically", () => {
    const exported = buildBackupFile(storage, {
      now: new Date("2026-07-03T21:45:00.000Z"),
      appVersion: "0.1.0 Beta",
      userAgent: "Mozilla/5.0 (Linux; Android) Chrome/120.0",
    });

    expect(exported.format).toBe(BACKUP_FORMAT);
    expect(exported.formatVersion).toBe(SUPPORTED_FORMAT_VERSION);
    expect(exported.encrypted).toBe(false);
    expect(exported.data["pitchflow_matches_v1"]).toBe(FIXTURE_MATCHES);
    expect(exported.data["unrelated_app_key"]).toBeUndefined();

    const serialized = serializeBackupFile(exported);
    const parsed = parseBackupFile(serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    for (const key of enumerateBackupKeys(storage)) {
      storage.removeItem(key);
    }
    expect(enumerateBackupKeys(storage)).toHaveLength(0);

    const restored = restoreBackupReplace(parsed.file, storage);
    expect(restored.ok).toBe(true);

    for (const key of enumerateBackupKeys(storage)) {
      expect(storage.getItem(key)).toBe(exported.data[key]);
    }
  });

  it("rejects corrupt and invalid backup files without changing storage", () => {
    const before = collectBackupData(storage);

    const cases = [
      "{ not valid json",
      JSON.stringify({ format: "other", formatVersion: 1, data: {} }),
      JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 99, encrypted: false, data: {} }),
      JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1, encrypted: true, data: {} }),
      JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1, encrypted: false, data: { bad: 1 } }),
    ];

    for (const raw of cases) {
      const parsed = parseBackupFile(raw);
      expect(parsed.ok).toBe(false);
    }

    expect(collectBackupData(storage)).toEqual(before);
  });

  it("rolls back when restore fails mid-write", () => {
    const exported = buildBackupFile(storage);
    const backupData = {
      ...exported.data,
      pitchflow_matches_v1: JSON.stringify([{ id: "new-match", createdAt: 2 }]),
    };
    const backup = { ...exported, data: backupData };

    const flaky = failOnceOnSetStorage(storage, "pitchflow_quickboard_boards_v1");
    const before = collectBackupData(flaky);
    const result = restoreBackupReplace(backup, flaky);

    expect(result.ok).toBe(false);
    expect(collectBackupData(flaky)).toEqual(before);
  });
});

describe("backup counts", () => {
  it("computes counts from raw stored strings", () => {
    const storage = createMemoryStorage();
    seedFixtureStorage(storage);
    const data = collectBackupData(storage);
    const counts = computeBackupCounts(data);

    expect(counts.matches).toBe(2);
    expect(counts.boards).toBe(1);
    expect(counts.plays).toBe(1);
    expect(counts.squads).toBe(1);
    expect(counts.notes).toBe(1);
    expect(hasMeaningfulBackupData(data)).toBe(true);
  });

  it("treats empty storage as not meaningful", () => {
    const storage = createMemoryStorage();
    expect(hasMeaningfulBackupData(collectBackupData(storage))).toBe(false);
  });
});

describe("backup meta and nudge", () => {
  it("stores and reads lastBackupAt", () => {
    const storage = createMemoryStorage();
    expect(getLastBackupAt(storage)).toBeNull();
    setLastBackupAt(1_700_000_000_000, storage);
    expect(getLastBackupAt(storage)).toBe(1_700_000_000_000);
  });

  it("shows nudge once per session when data exists and backup is stale", () => {
    const storage = createMemoryStorage();
    const session = createMemoryStorage();
    seedFixtureStorage(storage);

    const now = Date.UTC(2026, 6, 4);
    expect(shouldShowBackupNudge(storage, session, now)).toBe(true);
    markNudgeShownThisSession(session);
    expect(wasNudgeShownThisSession(session)).toBe(true);
    expect(shouldShowBackupNudge(storage, session, now)).toBe(false);

    setLastBackupAt(now - 15 * 24 * 60 * 60 * 1000, storage);
    const freshSession = createMemoryStorage();
    expect(shouldShowBackupNudge(storage, freshSession, now)).toBe(true);
    expect(getNudgeMessage(storage, now)).toContain("15 days ago");
  });

  it("does not nudge with no meaningful data", () => {
    const storage = createMemoryStorage();
    const session = createMemoryStorage();
    expect(shouldShowBackupNudge(storage, session)).toBe(false);
  });

  it("does not nudge after a recent backup", () => {
    const storage = createMemoryStorage();
    const session = createMemoryStorage();
    seedFixtureStorage(storage);
    setLastBackupAt(Date.now(), storage);
    expect(shouldShowBackupNudge(storage, session)).toBe(false);
  });
});
