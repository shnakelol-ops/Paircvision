import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_DOMAINS } from "./backup-domains";
import { restoreBackupReplace } from "./backup-restore";
import { BACKUP_SCHEMA, BACKUP_VERSION, type BackupFile } from "./backup-types";

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

/** A storage wrapper whose setItem throws on a chosen key (first call, or every call). */
function withFailingWrite(base: Storage, failOnKey: string, mode: "once" | "always" = "once"): Storage {
  let failed = false;
  return {
    getItem: (key: string) => base.getItem(key),
    setItem: (key: string, value: string) => {
      if (key === failOnKey && (mode === "always" || !failed)) {
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

function backupWithDomain(domainId: string, value: string, now = new Date("2026-01-01T00:00:00.000Z")): BackupFile {
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    summary: { domains: {}, unsupported: [] },
    data: { [domainId]: value },
  };
}

describe("restoreBackupReplace — replace-only semantics", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("old supported data is removed and incoming supported data is restored", () => {
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "old-match" }]));
    const incoming = backupWithDomain("matchStatsSavedMatches", JSON.stringify([{ id: "new-match" }]));
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.ok).toBe(true);
    expect(JSON.parse(storage.getItem("pitchflow_matches_v1")!)).toEqual([{ id: "new-match" }]);
  });

  it("a domain the backup doesn't include resets to its empty state (missing-domain policy)", () => {
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "will-be-replaced" }]));
    storage.setItem("paircvision-tp-scenarios", JSON.stringify([{ id: "existing-scenario" }]));
    const incoming = backupWithDomain("matchStatsSavedMatches", JSON.stringify([{ id: "kept" }]));
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.ok).toBe(true);
    expect(storage.getItem("paircvision-tp-scenarios")).toBe("[]"); // reset to empty, not left as-is
  });

  it("a flag-style raw-string domain the backup doesn't include is unset, not written as an empty string", () => {
    storage.setItem("paircvision_guided_tour_v1", "seen");
    const incoming = backupWithDomain("matchStatsSavedMatches", "[]");
    restoreBackupReplace(incoming, storage);
    expect(storage.getItem("paircvision_guided_tour_v1")).toBeNull();
  });

  it("unrelated (non-backup-domain) storage keys are preserved untouched", () => {
    storage.setItem("some_unrelated_analytics_flag", "keep-me");
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "old" }]));
    const incoming = backupWithDomain("matchStatsSavedMatches", JSON.stringify([{ id: "new" }]));
    restoreBackupReplace(incoming, storage);
    expect(storage.getItem("some_unrelated_analytics_flag")).toBe("keep-me");
  });

  it("restoring an empty backup resets every domain to empty, deleting nothing outside the registry", () => {
    for (const domain of BACKUP_DOMAINS) {
      storage.setItem(domain.storageKey, domain.kind === "json-array" ? JSON.stringify([{ id: "x" }]) : "seen");
    }
    storage.setItem("totally_unrelated_key", "still here");
    const emptyBackup: BackupFile = { schema: BACKUP_SCHEMA, version: BACKUP_VERSION, createdAt: new Date().toISOString(), summary: { domains: {}, unsupported: [] }, data: {} };
    const outcome = restoreBackupReplace(emptyBackup, storage);
    expect(outcome.ok).toBe(true);
    for (const domain of BACKUP_DOMAINS) {
      if (domain.kind === "json-array") expect(storage.getItem(domain.storageKey)).toBe("[]");
      else expect(storage.getItem(domain.storageKey)).toBeNull();
    }
    expect(storage.getItem("totally_unrelated_key")).toBe("still here");
  });
});

describe("restoreBackupReplace — safety copy", () => {
  it("the returned safety backup reflects the pre-restore state, in the normal backup format", () => {
    const storage = createMemoryStorage();
    storage.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "pre-restore-match" }]));
    const incoming = backupWithDomain("matchStatsSavedMatches", JSON.stringify([{ id: "new-match" }]));
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.safetyBackup.schema).toBe(BACKUP_SCHEMA);
    expect(outcome.safetyBackup.version).toBe(BACKUP_VERSION);
    expect(JSON.parse(outcome.safetyBackup.data.matchStatsSavedMatches)).toEqual([{ id: "pre-restore-match" }]);
    // The safety copy is never itself overwritten by the incoming restore data.
    expect(outcome.safetyBackup.data.matchStatsSavedMatches).not.toBe(incoming.data.matchStatsSavedMatches);
  });

  it("a safety backup is produced even when the restore itself fails", () => {
    const base = createMemoryStorage();
    base.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "pre-restore" }]));
    const storage = withFailingWrite(base, "pitchflow_matches_v1");
    const incoming = backupWithDomain("matchStatsSavedMatches", JSON.stringify([{ id: "new" }]));
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(JSON.parse(outcome.safetyBackup.data.matchStatsSavedMatches)).toEqual([{ id: "pre-restore" }]);
  });
});

describe("restoreBackupReplace — simulated write failure and rollback", () => {
  it("a failure on the very first domain write rolls back cleanly (nothing had changed yet)", () => {
    const base = createMemoryStorage();
    base.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "original" }]));
    const storage = withFailingWrite(base, "pitchflow_matches_v1");
    const incoming = backupWithDomain("matchStatsSavedMatches", JSON.stringify([{ id: "new" }]));
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rolledBack).toBe(true);
    expect(JSON.parse(storage.getItem("pitchflow_matches_v1")!)).toEqual([{ id: "original" }]);
  });

  it("a failure partway through (a later domain) rolls back every domain already written in this restore", () => {
    const base = createMemoryStorage();
    base.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "original-matches" }]));
    base.setItem("pitchflow_quickboard_boards_v1", JSON.stringify([{ id: "original-board" }]));
    // Fail on a domain that is registered after matchStatsSavedMatches — proves
    // the domains written before the failure get rolled back too, not just the
    // failed one.
    const storage = withFailingWrite(base, "pitchflow_pro_tagger_matches_v1");
    const incoming: BackupFile = {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      summary: { domains: {}, unsupported: [] },
      data: {
        matchStatsSavedMatches: JSON.stringify([{ id: "incoming-matches" }]),
        proTaggerMatches: JSON.stringify([{ id: "incoming-pro-tagger" }]),
      },
    };
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rolledBack).toBe(true);
    // matchStatsSavedMatches was written before the failing domain — must be rolled back to original.
    expect(JSON.parse(storage.getItem("pitchflow_matches_v1")!)).toEqual([{ id: "original-matches" }]);
    // A domain untouched by this backup at all (quickboard) was never part of the write set and stays as-is.
    expect(JSON.parse(storage.getItem("pitchflow_quickboard_boards_v1")!)).toEqual([{ id: "original-board" }]);
  });

  it("no success is ever reported after a partial failure", () => {
    const base = createMemoryStorage();
    const storage = withFailingWrite(base, "pitchflow_matches_v1");
    const incoming = backupWithDomain("matchStatsSavedMatches", "[]");
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.ok).toBe(false);
  });

  it("reports a clear message and rolledBack: false when rollback itself cannot be verified", () => {
    const base = createMemoryStorage();
    base.setItem("pitchflow_matches_v1", JSON.stringify([{ id: "original" }]));
    // Fails on every setItem call to this key — both the initial restore
    // write AND the rollback attempt afterward.
    const storage = withFailingWrite(base, "pitchflow_matches_v1", "always");
    const incoming = backupWithDomain("matchStatsSavedMatches", JSON.stringify([{ id: "new" }]));
    const outcome = restoreBackupReplace(incoming, storage);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rolledBack).toBe(false);
    expect(outcome.rollbackMessage).toBeDefined();
    expect(outcome.rollbackMessage).toMatch(/safety backup/i);
  });
});
