export const BACKUP_FORMAT = "paircvision-backup" as const;
export const SUPPORTED_FORMAT_VERSION = 1;

export type BackupCounts = {
  matches: number;
  boards: number;
  plays: number;
  squads: number;
  sessions: number;
  notes: number;
};

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof SUPPORTED_FORMAT_VERSION;
  appVersion: string;
  createdAt: string;
  device: string;
  encrypted: false;
  counts: BackupCounts;
  data: Record<string, string>;
};

export type BackupValidationError =
  | "invalid-json"
  | "wrong-format"
  | "unsupported-version"
  | "missing-data"
  | "invalid-data-shape"
  | "encrypted-not-supported";

export type ParsedBackup =
  | { ok: true; file: BackupFile }
  | { ok: false; error: BackupValidationError; message: string };

export type RestoreResult =
  | { ok: true }
  | { ok: false; error: string };
