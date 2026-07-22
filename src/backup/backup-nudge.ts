import { BACKUP_NUDGE_SESSION_KEY, BACKUP_STALE_DAYS, collectBackupData } from "./backup-manifest";
import { hasMeaningfulBackupData } from "./backup-counts";
import { daysSinceBackup, getLastBackupAt } from "./backup-meta";

export function wasNudgeShownThisSession(sessionStorageRef: Storage | null = typeof sessionStorage !== "undefined" ? sessionStorage : null): boolean {
  if (!sessionStorageRef) return true;
  return sessionStorageRef.getItem(BACKUP_NUDGE_SESSION_KEY) === "1";
}

export function markNudgeShownThisSession(sessionStorageRef: Storage | null = typeof sessionStorage !== "undefined" ? sessionStorage : null): void {
  if (!sessionStorageRef) return;
  sessionStorageRef.setItem(BACKUP_NUDGE_SESSION_KEY, "1");
}

export function shouldShowBackupNudge(
  storage: Storage = localStorage,
  sessionStorageRef: Storage | null = typeof sessionStorage !== "undefined" ? sessionStorage : null,
  now = Date.now(),
): boolean {
  if (wasNudgeShownThisSession(sessionStorageRef)) return false;

  const data = collectBackupData(storage);
  if (!hasMeaningfulBackupData(data)) return false;

  const lastBackupAt = getLastBackupAt(storage);
  if (lastBackupAt == null) return true;

  const days = daysSinceBackup(lastBackupAt, now);
  return days != null && days > BACKUP_STALE_DAYS;
}

export function getNudgeMessage(storage: Storage = localStorage, now = Date.now()): string {
  const lastBackupAt = getLastBackupAt(storage);
  if (lastBackupAt == null) {
    return "No backup yet — your matches live only on this phone.";
  }
  const days = daysSinceBackup(lastBackupAt, now) ?? 0;
  return `Last backup: ${days} day${days === 1 ? "" : "s"} ago — your matches live only on this phone.`;
}
