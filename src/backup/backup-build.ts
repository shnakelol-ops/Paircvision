import { BACKUP_DOMAINS } from "./backup-domains";
import { countDomainEntries } from "./backup-guard";
import { BACKUP_SCHEMA, BACKUP_VERSION, type BackupFile } from "./backup-types";

export const APP_VERSION = "0.1.0 Beta";

/** The one domain this backup format cannot protect yet, disclosed in every summary rather than silently omitted. */
export const UNSUPPORTED_DOMAINS: readonly string[] = [
  "Voice note recordings (audio) — note text and timing are preserved, but playback will not work after a restore unless the original device is also kept",
];

function readDomainValues(storage: Storage): Record<string, string> {
  const data: Record<string, string> = {};
  for (const domain of BACKUP_DOMAINS) {
    const value = storage.getItem(domain.storageKey);
    // A domain the coach has simply never used is absent, not backed up as
    // an empty placeholder — restore's own missing-domain policy (see
    // backup-restore.ts) is what turns "absent" into "reset to empty".
    if (value != null) data[domain.id] = value;
  }
  return data;
}

function buildSummary(data: Record<string, string>): BackupFile["summary"] {
  const domains: Record<string, number | string> = {};
  for (const domain of BACKUP_DOMAINS) {
    const raw = data[domain.id];
    if (raw == null) continue;
    if (domain.kind === "raw-string") {
      domains[domain.id] = "set";
      continue;
    }
    const count = countDomainEntries(domain, raw);
    // Present but unreadable is reported honestly, never dropped from the
    // file and never silently reported as an empty/zero domain.
    domains[domain.id] = count ?? "unreadable";
  }
  return { domains, unsupported: [...UNSUPPORTED_DOMAINS] };
}

export type BuildBackupOptions = {
  now?: Date;
  platform?: string;
};

/**
 * Reads every supported domain from storage and assembles a complete backup
 * object. Read-only — never writes, clears, or otherwise mutates `storage`.
 */
export function buildBackupFile(storage: Storage = localStorage, options: BuildBackupOptions = {}): BackupFile {
  const now = options.now ?? new Date();
  const data = readDomainValues(storage);
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    appVersion: APP_VERSION,
    ...(options.platform ? { source: { platform: options.platform } } : {}),
    summary: buildSummary(data),
    data,
  };
}

export function serializeBackupFile(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

export function formatBackupFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `paircvision-backup-${stamp}.pvbackup`;
}

export function triggerBackupDownload(file: BackupFile, filename: string = formatBackupFilename(new Date(file.createdAt))): void {
  const blob = new Blob([serializeBackupFile(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
