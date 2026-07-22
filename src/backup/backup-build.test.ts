import { describe, expect, it } from "vitest";
import { BACKUP_DOMAINS } from "./backup-domains";
import { buildBackupFile, UNSUPPORTED_DOMAINS, formatBackupFilename, serializeBackupFile } from "./backup-build";
import { BACKUP_SCHEMA, BACKUP_VERSION } from "./backup-types";

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

describe("buildBackupFile — schema and stable fields", () => {
  it("stamps the schema and version markers", () => {
    const file = buildBackupFile(createMemoryStorage());
    expect(file.schema).toBe(BACKUP_SCHEMA);
    expect(file.schema).toBe("paircvision-backup");
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.version).toBe(1);
  });

  it("stamps a real ISO createdAt timestamp", () => {
    const now = new Date("2026-03-01T12:34:00.000Z");
    const file = buildBackupFile(createMemoryStorage(), { now });
    expect(file.createdAt).toBe("2026-03-01T12:34:00.000Z");
  });

  it("does not mutate storage", () => {
    const storage = createMemoryStorage();
    storage.setItem("pitchflow_matches_v1", "[]");
    const before = storage.getItem("pitchflow_matches_v1");
    buildBackupFile(storage);
    expect(storage.getItem("pitchflow_matches_v1")).toBe(before);
    expect(storage.length).toBe(1); // no new keys written by building a backup
  });
});

describe("buildBackupFile — every supported domain is included, unsupported are declared", () => {
  it("includes every registered domain when populated", () => {
    const storage = createMemoryStorage();
    for (const domain of BACKUP_DOMAINS) {
      storage.setItem(domain.storageKey, domain.kind === "json-array" ? "[]" : "seen");
    }
    const file = buildBackupFile(storage);
    for (const domain of BACKUP_DOMAINS) {
      expect(file.data[domain.id]).toBeDefined();
    }
    expect(Object.keys(file.data)).toHaveLength(BACKUP_DOMAINS.length);
  });

  it("declares voice-note audio as unsupported in every backup, populated or not", () => {
    const empty = buildBackupFile(createMemoryStorage());
    expect(empty.summary.unsupported).toEqual(UNSUPPORTED_DOMAINS);
    expect(empty.summary.unsupported.join(" ")).toMatch(/audio/i);
  });

  it("omits a domain entirely (not an empty placeholder) when the coach has never used that feature", () => {
    const storage = createMemoryStorage();
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "m1" }]));
    const file = buildBackupFile(storage);
    expect(file.data.matchStatsSavedMatches).toBeDefined();
    expect(file.data.tacticalPlayScenarios).toBeUndefined();
    expect(file.summary.domains.tacticalPlayScenarios).toBeUndefined();
  });
});

describe("buildBackupFile — empty vs populated app", () => {
  it("an empty app backup has no domain data, but is still a well-formed file", () => {
    const file = buildBackupFile(createMemoryStorage());
    expect(Object.keys(file.data)).toHaveLength(0);
    expect(file.schema).toBe(BACKUP_SCHEMA);
    expect(file.version).toBe(BACKUP_VERSION);
  });

  it("a populated app backup reports correct summary counts", () => {
    const storage = createMemoryStorage();
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "m1" }, { id: "m2" }, { id: "m3" }]));
    storage.setItem("pitchflow_quickboard_boards_v1", JSON.stringify([{ id: "b1" }]));
    const file = buildBackupFile(storage);
    expect(file.summary.domains.matchStatsSavedMatches).toBe(3);
    expect(file.summary.domains.quickboardBoards).toBe(1);
  });
});

describe("buildBackupFile — Unicode and Irish characters survive byte-for-byte", () => {
  it("preserves fada characters and emoji through build + serialize + reparse", () => {
    const storage = createMemoryStorage();
    const record = { id: "m1", homeTeamName: "Áth Cliath", awayTeamName: "Cill Chainnigh", note: "great scores 🏐🎯" };
    storage.setItem("pitchflow_matches_v1", JSON.stringify([record]));
    const file = buildBackupFile(storage);
    const reparsed = JSON.parse(serializeBackupFile(file)).data.matchStatsSavedMatches;
    expect(JSON.parse(reparsed)).toEqual([record]);
  });
});

describe("buildBackupFile — large representative match data", () => {
  it("handles a full-season archive without truncation", () => {
    const storage = createMemoryStorage();
    const events = Array.from({ length: 40 }, (_, i) => ({
      id: `evt-${i}`,
      kind: i % 5 === 0 ? "GOAL" : "POINT",
      nx: Math.random(),
      ny: Math.random(),
      half: (i % 2) + 1,
      timestamp: i * 10,
      teamSide: i % 2 === 0 ? "FOR" : "OPP",
    }));
    const matches = Array.from({ length: 25 }, (_, i) => ({
      id: `saved-match-${i}`,
      createdAt: i,
      label: `Retention Test ${i}`,
      homeTeamName: `Team ${i}`,
      awayTeamName: "Opponent",
      venue: "Fraher Field",
      events,
      eventCount: events.length,
      scorelineSnapshot: "1-08 (11) v 0-05 (5)",
    }));
    storage.setItem("pitchflow_matches_v1", JSON.stringify(matches));
    const file = buildBackupFile(storage);
    expect(file.summary.domains.matchStatsSavedMatches).toBe(25);
    expect(JSON.parse(file.data.matchStatsSavedMatches)).toHaveLength(25);
    expect(JSON.parse(file.data.matchStatsSavedMatches)[0].events).toHaveLength(40);
  });
});

describe("formatBackupFilename", () => {
  it("matches the specified pattern", () => {
    const date = new Date(2026, 2, 5, 9, 7); // local time, month is 0-indexed
    expect(formatBackupFilename(date)).toBe("paircvision-backup-2026-03-05-0907.pvbackup");
  });
});
