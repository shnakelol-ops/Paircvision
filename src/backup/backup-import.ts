import { enumerateBackupKeys, collectBackupData } from "./backup-manifest";
import { computeBackupCounts } from "./backup-counts";
import type { BackupFile, RestoreResult } from "./backup-types";

const QUOTA_WARN_BYTES = 4 * 1024 * 1024;

export function estimateRestoreBytes(file: BackupFile): number {
  let total = 0;
  for (const value of Object.values(file.data)) {
    total += value.length;
  }
  return total;
}

export function restoreBackupReplace(
  file: BackupFile,
  storage: Storage = localStorage,
): RestoreResult {
  const restoreBytes = estimateRestoreBytes(file);
  if (restoreBytes > QUOTA_WARN_BYTES) {
    // Still attempt — browsers vary; this is a soft guard logged for diagnostics.
    console.warn("[backup] Large restore payload:", restoreBytes, "bytes");
  }

  for (const [key, value] of Object.entries(file.data)) {
    if (typeof value !== "string") {
      return { ok: false, error: `Invalid backup entry for key "${key}".` };
    }
  }

  const snapshot = collectBackupData(storage);
  const keysBefore = enumerateBackupKeys(storage);

  try {
    for (const key of keysBefore) {
      storage.removeItem(key);
    }

    for (const [key, value] of Object.entries(file.data)) {
      storage.setItem(key, value);
      const roundTrip = storage.getItem(key);
      if (roundTrip !== value) {
        throw new Error(`Verify failed after writing "${key}".`);
      }
    }

    return { ok: true };
  } catch (error) {
    const failedKeys = enumerateBackupKeys(storage);
    for (const key of failedKeys) {
      storage.removeItem(key);
    }
    for (const [key, value] of Object.entries(snapshot)) {
      try {
        storage.setItem(key, value);
      } catch {
        // Best-effort rollback
      }
    }
    const message = error instanceof Error ? error.message : "Restore failed.";
    return { ok: false, error: message };
  }
}

export function getCurrentDeviceCounts(storage: Storage = localStorage) {
  return computeBackupCounts(collectBackupData(storage));
}
