import { BACKUP_META_STORAGE_KEY } from "./backup-manifest";

type BackupMeta = {
  lastBackupAt: number | null;
};

function readMeta(storage: Storage): BackupMeta {
  try {
    const raw = storage.getItem(BACKUP_META_STORAGE_KEY);
    if (!raw) return { lastBackupAt: null };
    const parsed = JSON.parse(raw) as unknown;
    if (parsed != null && typeof parsed === "object" && "lastBackupAt" in parsed) {
      const ts = (parsed as { lastBackupAt: unknown }).lastBackupAt;
      if (ts == null) return { lastBackupAt: null };
      if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
        return { lastBackupAt: ts };
      }
    }
  } catch {
    // ignore corrupt meta
  }
  return { lastBackupAt: null };
}

function writeMeta(storage: Storage, meta: BackupMeta): void {
  storage.setItem(BACKUP_META_STORAGE_KEY, JSON.stringify(meta));
}

export function getLastBackupAt(storage: Storage = localStorage): number | null {
  return readMeta(storage).lastBackupAt;
}

export function setLastBackupAt(timestamp: number, storage: Storage = localStorage): void {
  writeMeta(storage, { lastBackupAt: timestamp });
}

export function daysSinceBackup(lastBackupAt: number | null, now = Date.now()): number | null {
  if (lastBackupAt == null) return null;
  return Math.floor((now - lastBackupAt) / (24 * 60 * 60 * 1000));
}
