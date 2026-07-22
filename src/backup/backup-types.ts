export const BACKUP_SCHEMA = "paircvision-backup" as const;
export const BACKUP_VERSION = 1 as const;

/**
 * Per-domain count for display, or a string when the stored value exists
 * but couldn't be read as the expected shape (still included in `data`
 * byte-for-byte regardless — a corrupt domain is never silently dropped).
 */
export type BackupDomainSummaryValue = number | string;

export type BackupSummary = {
  domains: Record<string, BackupDomainSummaryValue>;
  unsupported: string[];
};

export type BackupSource = {
  build?: string;
  platform?: string;
};

/**
 * A whole-app PáircVision backup. `data` is keyed by BackupDomainDescriptor
 * id (not raw storage key) and holds each domain's stored value verbatim —
 * byte-for-byte, never re-parsed/re-serialised — so restoring never risks
 * subtly rewriting a payload another part of the app depends on matching
 * exactly.
 */
export type BackupFile = {
  schema: typeof BACKUP_SCHEMA;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  appVersion?: string;
  source?: BackupSource;
  summary: BackupSummary;
  data: Record<string, string>;
};

export type BackupValidationErrorCode =
  | "invalid-json"
  | "wrong-schema"
  | "missing-version"
  | "unsupported-version"
  | "invalid-shape"
  | "malformed-domain"
  | "unsafe-keys"
  | "too-large";

export type BackupValidationError = {
  code: BackupValidationErrorCode;
  message: string;
};

export type ParsedBackup =
  | { ok: true; file: BackupFile }
  | { ok: false; error: BackupValidationError };

export type RestoreOutcome =
  | { ok: true; safetyBackup: BackupFile }
  | { ok: false; message: string; safetyBackup: BackupFile; rolledBack: boolean; rollbackMessage?: string };
