import { BACKUP_DOMAINS, type BackupDomainDescriptor } from "./backup-domains";

/** Keys that must never appear as own-enumerable properties on anything parsed from an untrusted backup file. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * True if `value` (or, recursively, any of its own-enumerable object/array
 * members) carries a dangerous key as an own property. JSON.parse never
 * pollutes the real prototype chain, but a value shaped like
 * `{"__proto__": {...}}` can still cause harm the moment something later
 * spreads or Object.assigns it — this rejects that shape outright before it
 * gets anywhere near a write.
 */
export function containsDangerousKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null || typeof value !== "object") return false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) return true;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (containsDangerousKey(child, depth + 1)) return true;
  }
  return false;
}

/** Soft sanity ceiling against a maliciously/accidentally huge file — not a realistic limit for this app's real data volumes. */
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

/**
 * Validates one domain's raw stored string against its declared kind.
 * "json-array" must parse to a JSON array with no dangerous keys anywhere
 * inside it. "raw-string" accepts any string verbatim — it isn't JSON.
 */
export function isDomainValueValid(domain: BackupDomainDescriptor, raw: string): boolean {
  if (domain.kind === "raw-string") return true;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    return !containsDangerousKey(parsed);
  } catch {
    return false;
  }
}

/** Number of entries in a "json-array" domain's raw value, or null if it can't be read as one. */
export function countDomainEntries(domain: BackupDomainDescriptor, raw: string | undefined): number | null {
  if (raw == null || domain.kind !== "json-array") return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

export function formatDomainCount(domain: BackupDomainDescriptor, count: number): string {
  if (!domain.noun) return String(count);
  const [singular, plural] = domain.noun;
  return `${count} ${count === 1 ? singular : plural}`;
}

export { BACKUP_DOMAINS };
