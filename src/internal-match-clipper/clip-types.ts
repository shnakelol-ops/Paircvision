// Match Clipper — internal tool. Clip selections are metadata only (a time
// range plus a name and category). Nothing here ever holds video bytes; the
// original match file is only read at export time and never modified.

export type ClipCategory = "score" | "hit" | "kickout" | "celebration" | "other";

export const CLIP_CATEGORIES: readonly { id: ClipCategory; label: string }[] = [
  { id: "score", label: "Score" },
  { id: "hit", label: "Hit/Tackle" },
  { id: "kickout", label: "Kickout" },
  { id: "celebration", label: "Celebration" },
  { id: "other", label: "Other" },
];

export function categoryLabel(id: ClipCategory): string {
  return CLIP_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

export function isClipCategory(value: unknown): value is ClipCategory {
  return typeof value === "string" && CLIP_CATEGORIES.some((c) => c.id === value);
}

export interface ClipSelection {
  id: string;
  name: string;
  category: ClipCategory;
  /** Seconds from the start of the source video. */
  start: number;
  /** Seconds from the start of the source video. Always > start. */
  end: number;
  origin: "manual" | "timestamp";
  createdAt: number;
}

/** One saved clip list, tied to one source video by its fingerprint. */
export interface ClipProject {
  /** Fingerprint key — see sourceKey(). */
  key: string;
  fileName: string;
  fileSize: number;
  /** Source duration in seconds once known, used to warn on a mismatched file. */
  duration: number | null;
  clips: ClipSelection[];
  updatedAt: number;
}

export interface ClipperStoreV1 {
  version: 1;
  lastProjectKey: string | null;
  projects: ClipProject[];
}

/** Shortest clip the tool will save or export, in seconds. */
export const MIN_CLIP_SECONDS = 0.5;
/** Longest single clip, in seconds — keeps in-memory exports bounded on phones. */
export const MAX_CLIP_SECONDS = 10 * 60;

/**
 * Identifies a source video across sessions. Name + size only: Android's file
 * picker often reports lastModified as "now" for content:// files, so it can't
 * be relied on to recognise the same match when it is reselected.
 */
export function sourceKey(fileName: string, fileSize: number): string {
  return `${fileName}::${fileSize}`;
}

export function newClipId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `clip:${c.randomUUID()}`;
  return `clip:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
