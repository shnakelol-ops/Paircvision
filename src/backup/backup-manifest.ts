/** Prefixes used to enumerate PáircVision localStorage keys. See docs/BACKUP_MANIFEST.md */
export const BACKUP_KEY_PREFIXES = [
  "paircvision",
  "pitchflow_",
  "pitchside",
  "flowlabs_",
] as const;

/** New additive key — does not modify any existing storage key. */
export const BACKUP_META_STORAGE_KEY = "paircvision_backup_meta_v1";

/** sessionStorage flag — once per app session nudge cap. */
export const BACKUP_NUDGE_SESSION_KEY = "paircvision_backup_nudge_shown";

export const BACKUP_STALE_DAYS = 14;

export function isBackupKey(key: string): boolean {
  return BACKUP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function enumerateBackupKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key != null && isBackupKey(key)) {
      keys.push(key);
    }
  }
  return keys.sort();
}

export function collectBackupData(storage: Storage): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of enumerateBackupKeys(storage)) {
    const value = storage.getItem(key);
    if (value != null) {
      data[key] = value;
    }
  }
  return data;
}
