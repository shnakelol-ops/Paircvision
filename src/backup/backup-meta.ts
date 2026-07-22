// Lightweight "when did I last back up" marker — deliberately outside the
// domain registry (backup-domains.ts) so it is never itself included in a
// backup file: it must not be required to restore data, and including it
// would let a restore rewrite this device's own backup history, which is
// not what "last backup created" should mean.
const BACKUP_META_STORAGE_KEY = "paircvision_backup_meta_v1";

type BackupMeta = { lastBackupAt: number };

function readMeta(storage: Storage): BackupMeta | null {
  try {
    const raw = storage.getItem(BACKUP_META_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed != null &&
      typeof parsed === "object" &&
      "lastBackupAt" in parsed &&
      typeof (parsed as { lastBackupAt: unknown }).lastBackupAt === "number" &&
      Number.isFinite((parsed as { lastBackupAt: number }).lastBackupAt)
    ) {
      return { lastBackupAt: (parsed as { lastBackupAt: number }).lastBackupAt };
    }
  } catch {
    // Corrupt meta is not worth surfacing as an error — treat as "no record".
  }
  return null;
}

export function getLastBackupAt(storage: Storage = localStorage): number | null {
  return readMeta(storage)?.lastBackupAt ?? null;
}

export function setLastBackupAt(timestamp: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(BACKUP_META_STORAGE_KEY, JSON.stringify({ lastBackupAt: timestamp } satisfies BackupMeta));
  } catch {
    // A failure to record "when" does not affect the backup file the coach
    // already has in hand — never let this throw back into the backup flow.
  }
}
