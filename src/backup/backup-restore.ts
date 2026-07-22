import { BACKUP_DOMAINS, type BackupDomainDescriptor } from "./backup-domains";
import { BACKUP_SCHEMA, BACKUP_VERSION, type BackupFile, type RestoreOutcome } from "./backup-types";

/**
 * Replace-only restore. No merging: for every registered domain, the
 * device's value becomes exactly what the incoming backup says — the
 * backup's own value if the domain is present, or that domain's empty
 * state if the backup doesn't include it (an old backup made before a
 * newer domain existed resets that domain to empty, consistently, not
 * left-as-is — see docs/BACKUP_MANIFEST.md for why this is the one
 * predictable policy applied to every domain rather than mixed behaviour).
 *
 * Transactional-safety model (browser storage has no real cross-key
 * transactions, so this is the strongest *practical* approximation, not a
 * claim of atomicity):
 *   1. Snapshot every domain's current value first (nothing is touched yet).
 *   2. Build a safety backup from that snapshot, in the exact same format
 *      normal backups use, and return it to the caller regardless of the
 *      restore's outcome — the caller is responsible for offering/
 *      triggering its download so the coach always has a way back.
 *   3. Write each domain in turn, verifying the value actually round-trips
 *      through storage.getItem immediately after each write.
 *   4. If any write or verification fails, every domain is written back to
 *      its pre-restore snapshot value (or removed, if it had none) and
 *      re-verified. Whether that rollback itself fully succeeded is
 *      reported explicitly — it is never silently assumed.
 * A page that reads localStorage directly during this synchronous sequence
 * (rather than through the app's own state) could in principle observe a
 * transient mixed state; this cannot be fully eliminated on this platform,
 * only minimised by keeping the write loop small, synchronous, and ordered.
 */
export function restoreBackupReplace(file: BackupFile, storage: Storage = localStorage, now: Date = new Date()): RestoreOutcome {
  const snapshot = new Map<string, string | undefined>();
  for (const domain of BACKUP_DOMAINS) {
    snapshot.set(domain.id, storage.getItem(domain.storageKey) ?? undefined);
  }

  const safetyBackup = buildSafetyBackup(snapshot, now);

  try {
    for (const domain of BACKUP_DOMAINS) {
      writeDomain(storage, domain, file.data[domain.id]);
    }
    return { ok: true, safetyBackup };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore failed.";
    let rolledBack = true;
    for (const domain of BACKUP_DOMAINS) {
      try {
        writeDomain(storage, domain, snapshot.get(domain.id));
      } catch {
        rolledBack = false;
      }
    }
    return {
      ok: false,
      message,
      safetyBackup,
      rolledBack,
      ...(rolledBack
        ? {}
        : { rollbackMessage: "Rollback could not fully restore your previous data. Use the safety backup file that was just generated to recover manually." }),
    };
  }
}

/** Writes one domain's target value (or clears it, for undefined/empty) and verifies the write actually took. Throws on any mismatch. */
function writeDomain(storage: Storage, domain: BackupDomainDescriptor, incoming: string | undefined): void {
  if (incoming != null) {
    storage.setItem(domain.storageKey, incoming);
    if (storage.getItem(domain.storageKey) !== incoming) {
      throw new Error(`Verify failed writing "${domain.label}".`);
    }
    return;
  }
  // Missing domain -> that domain's empty state: "[]" for record lists, or
  // simply unset for flag-style raw-string domains (there is no meaningful
  // empty string for a preference flag).
  if (domain.kind === "json-array") {
    storage.setItem(domain.storageKey, "[]");
    if (storage.getItem(domain.storageKey) !== "[]") {
      throw new Error(`Verify failed clearing "${domain.label}".`);
    }
    return;
  }
  storage.removeItem(domain.storageKey);
  if (storage.getItem(domain.storageKey) != null) {
    throw new Error(`Verify failed clearing "${domain.label}".`);
  }
}

function buildSafetyBackup(snapshot: Map<string, string | undefined>, now: Date): BackupFile {
  const data: Record<string, string> = {};
  const domains: Record<string, number | string> = {};
  for (const domain of BACKUP_DOMAINS) {
    const value = snapshot.get(domain.id);
    if (value == null) continue;
    data[domain.id] = value;
    if (domain.kind === "raw-string") {
      domains[domain.id] = "set";
      continue;
    }
    try {
      const parsed = JSON.parse(value);
      domains[domain.id] = Array.isArray(parsed) ? parsed.length : "unreadable";
    } catch {
      domains[domain.id] = "unreadable";
    }
  }
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    summary: { domains, unsupported: [] },
    data,
  };
}
