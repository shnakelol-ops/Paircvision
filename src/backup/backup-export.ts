import { collectBackupData } from "./backup-manifest";
import { computeBackupCounts } from "./backup-counts";
import { getDeviceSummary } from "./device-summary";
import {
  BACKUP_FORMAT,
  SUPPORTED_FORMAT_VERSION,
  type BackupFile,
  type ParsedBackup,
} from "./backup-types";

export const APP_VERSION = "0.1.0 Beta";

export function formatBackupFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
  return `paircvision-backup-${stamp}.pvbackup`;
}

export function buildBackupFile(
  storage: Storage = localStorage,
  options: { now?: Date; appVersion?: string; userAgent?: string } = {},
): BackupFile {
  const now = options.now ?? new Date();
  const data = collectBackupData(storage);
  return {
    format: BACKUP_FORMAT,
    formatVersion: SUPPORTED_FORMAT_VERSION,
    appVersion: options.appVersion ?? APP_VERSION,
    createdAt: now.toISOString(),
    device: getDeviceSummary(options.userAgent),
    encrypted: false,
    counts: computeBackupCounts(data),
    data,
  };
}

export function serializeBackupFile(file: BackupFile): string {
  return JSON.stringify(file);
}

export function estimateBackupBytes(file: BackupFile): number {
  return new TextEncoder().encode(serializeBackupFile(file)).length;
}

export function parseBackupFile(raw: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid-json", message: "This file is not valid JSON." };
  }

  if (parsed == null || typeof parsed !== "object") {
    return { ok: false, error: "wrong-format", message: "This does not look like a PáircVision backup." };
  }

  const record = parsed as Record<string, unknown>;

  if (record.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error: "wrong-format",
      message: "This file is not a PáircVision backup (wrong format marker).",
    };
  }

  if (record.encrypted === true) {
    return {
      ok: false,
      error: "encrypted-not-supported",
      message: "Encrypted backups are not supported yet. Use an unencrypted backup file.",
    };
  }

  if (record.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    return {
      ok: false,
      error: "unsupported-version",
      message: `This backup uses format version ${String(record.formatVersion)}. This app supports version ${SUPPORTED_FORMAT_VERSION} only.`,
    };
  }

  if (record.data == null || typeof record.data !== "object" || Array.isArray(record.data)) {
    return { ok: false, error: "missing-data", message: "Backup file is missing its data section." };
  }

  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(record.data as Record<string, unknown>)) {
    if (typeof value !== "string") {
      return {
        ok: false,
        error: "invalid-data-shape",
        message: `Backup data for key "${key}" is not a raw string value.`,
      };
    }
    data[key] = value;
  }

  const counts = computeBackupCounts(data);

  return {
    ok: true,
    file: {
      format: BACKUP_FORMAT,
      formatVersion: SUPPORTED_FORMAT_VERSION,
      appVersion: typeof record.appVersion === "string" ? record.appVersion : "unknown",
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
      device: typeof record.device === "string" ? record.device : "unknown",
      encrypted: false,
      counts,
      data,
    },
  };
}

export function triggerBackupDownload(file: BackupFile, filename?: string): void {
  const blob = new Blob([serializeBackupFile(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename ?? formatBackupFilename(new Date(file.createdAt));
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadBackup(file: BackupFile, filename?: string): Promise<"shared" | "downloaded"> {
  const name = filename ?? formatBackupFilename(new Date(file.createdAt));
  const blob = new Blob([serializeBackupFile(file)], { type: "application/json" });
  const backupFile = new File([blob], name, { type: "application/json" });

  const nav = navigator as Navigator & {
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
  };

  if (typeof nav.share === "function") {
    const shareData: ShareData & { files?: File[] } = {
      title: "PáircVision Backup",
      text: "PáircVision whole-app backup",
      files: [backupFile],
    };
    const canShare = typeof nav.canShare === "function" ? nav.canShare(shareData) : true;
    if (canShare) {
      try {
        await nav.share(shareData);
        return "shared";
      } catch {
        // User cancelled or share failed — fall through to download
      }
    }
  }

  triggerBackupDownload(file, name);
  return "downloaded";
}
