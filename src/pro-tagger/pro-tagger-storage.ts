import {
  SAVED_MATCHES_STORAGE_KEY,
  MAX_SAVED_MATCHES,
} from "../core/stats/saved-match";
import type { SavedMatch } from "../core/stats/saved-match";

function safeRead(): string | null {
  try {
    return window.localStorage.getItem(SAVED_MATCHES_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value: string): boolean {
  try {
    window.localStorage.setItem(SAVED_MATCHES_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function readExisting(): SavedMatch[] {
  const raw = safeRead();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedMatch[]) : [];
  } catch {
    return [];
  }
}

export function saveProTaggerMatch(record: SavedMatch): boolean {
  const existing = readExisting();
  const next = [record, ...existing].slice(0, MAX_SAVED_MATCHES);
  return safeWrite(JSON.stringify(next));
}
