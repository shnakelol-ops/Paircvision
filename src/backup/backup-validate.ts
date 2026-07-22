import { BACKUP_DOMAINS, findBackupDomain } from "./backup-domains";
import { MAX_BACKUP_BYTES, containsDangerousKey, isDomainValueValid } from "./backup-guard";
import { UNSUPPORTED_DOMAINS } from "./backup-build";
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  type BackupFile,
  type BackupValidationErrorCode,
  type ParsedBackup,
} from "./backup-types";

function fail(code: BackupValidationErrorCode, message: string): ParsedBackup {
  return { ok: false, error: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function buildSummaryFromData(data: Record<string, string>): BackupFile["summary"] {
  const domains: Record<string, number | string> = {};
  for (const domain of BACKUP_DOMAINS) {
    const raw = data[domain.id];
    if (raw == null) continue;
    if (domain.kind === "raw-string") {
      domains[domain.id] = "set";
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      domains[domain.id] = Array.isArray(parsed) ? parsed.length : "unreadable";
    } catch {
      domains[domain.id] = "unreadable";
    }
  }
  return { domains, unsupported: [...UNSUPPORTED_DOMAINS] };
}

/**
 * Parses and validates a candidate backup file. Never touches storage —
 * this is pure parse-and-check, so a corrupt or hostile file can be safely
 * inspected before any restore decision is made.
 */
export function parseBackupFile(raw: string): ParsedBackup {
  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > MAX_BACKUP_BYTES) {
    return fail("too-large", `This file is ${(byteLength / (1024 * 1024)).toFixed(1)} MB, larger than PáircVision backups can be.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("invalid-json", "This file is not valid JSON.");
  }

  if (!isPlainObject(parsed)) {
    return fail("invalid-shape", "This does not look like a PáircVision backup.");
  }

  if (containsDangerousKey(parsed)) {
    return fail("unsafe-keys", "This file contains keys that are not safe to process.");
  }

  if (parsed.schema !== BACKUP_SCHEMA) {
    return fail("wrong-schema", "This file is not a PáircVision backup (unrecognised format marker).");
  }

  if (parsed.version === undefined) {
    return fail("missing-version", "This backup file has no version marker.");
  }

  if (parsed.version !== BACKUP_VERSION) {
    return fail(
      "unsupported-version",
      `This backup uses format version ${String(parsed.version)}. This app supports version ${BACKUP_VERSION} only.`,
    );
  }

  if (!isPlainObject(parsed.data)) {
    return fail("invalid-shape", "Backup file is missing its data section.");
  }

  const data: Record<string, string> = {};
  for (const [domainId, value] of Object.entries(parsed.data)) {
    const domain = findBackupDomain(domainId);
    // Unknown domain ids are tolerated (a newer backup's extra domain, or a
    // domain a future version of this app no longer keeps) — allow, don't reject.
    if (!domain) continue;
    if (typeof value !== "string") {
      return fail("malformed-domain", `Backup data for "${domain.label}" is not a raw string value.`);
    }
    if (!isDomainValueValid(domain, value)) {
      return fail("malformed-domain", `Backup data for "${domain.label}" is not in the expected format.`);
    }
    data[domainId] = value;
  }

  const file: BackupFile = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
    appVersion: typeof parsed.appVersion === "string" ? parsed.appVersion : undefined,
    summary: buildSummaryFromData(data),
    data,
  };

  return { ok: true, file };
}
