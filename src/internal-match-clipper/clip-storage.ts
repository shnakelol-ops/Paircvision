import {
  MAX_CLIP_SECONDS,
  MIN_CLIP_SECONDS,
  isClipCategory,
  sourceKey,
  type ClipProject,
  type ClipSelection,
  type ClipperStoreV1,
} from "./clip-types";

// Own key — separate from every Event Stats, Team Sheet and Matchday key, so
// the clipper can never corrupt them. Metadata only: no video bytes are ever
// written here (a 451 MB match would not fit, and must never be copied).
export const MATCH_CLIPPER_STORAGE_KEY = "paircvision_internal_match_clipper_v1";

/** Saved clip lists kept per device; the least recently used is dropped first. */
export const MAX_PROJECTS = 30;
export const MAX_CLIPS_PER_PROJECT = 500;
const MAX_NAME_LENGTH = 80;

export type LoadResult =
  | { status: "empty"; store: ClipperStoreV1 }
  | { status: "ok"; store: ClipperStoreV1 }
  /** The key holds something that can't be read. It is never overwritten. */
  | { status: "unreadable"; store: ClipperStoreV1 };

export type SaveResult = { ok: true } | { ok: false; reason: "unreadable" | "full" | "unavailable" };

export function emptyStore(): ClipperStoreV1 {
  return { version: 1, lastProjectKey: null, projects: [] };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function cleanClipName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

export function parseClip(value: unknown): ClipSelection | null {
  const v = asObject(value);
  if (!v) return null;
  if (typeof v.id !== "string" || !v.id) return null;
  if (!finiteNonNegative(v.start) || !finiteNonNegative(v.end)) return null;
  const span = v.end - v.start;
  if (span < MIN_CLIP_SECONDS - 1e-6 || span > MAX_CLIP_SECONDS + 1e-6) return null;
  return {
    id: v.id,
    name: cleanClipName(v.name) || "Clip",
    category: isClipCategory(v.category) ? v.category : "other",
    start: v.start,
    end: v.end,
    origin: v.origin === "timestamp" ? "timestamp" : "manual",
    createdAt: finiteNonNegative(v.createdAt) ? v.createdAt : 0,
  };
}

export function parseProject(value: unknown): ClipProject | null {
  const v = asObject(value);
  if (!v) return null;
  if (typeof v.fileName !== "string" || !finiteNonNegative(v.fileSize)) return null;
  const clips = Array.isArray(v.clips)
    ? v.clips.map(parseClip).filter((c): c is ClipSelection => c !== null).slice(0, MAX_CLIPS_PER_PROJECT)
    : [];
  return {
    key: sourceKey(v.fileName, v.fileSize),
    fileName: v.fileName,
    fileSize: v.fileSize,
    duration: finiteNonNegative(v.duration) && v.duration > 0 ? v.duration : null,
    clips,
    updatedAt: finiteNonNegative(v.updatedAt) ? v.updatedAt : 0,
  };
}

/** Parses a stored value. Returns null when it isn't a clipper store at all. */
export function parseStore(raw: unknown): ClipperStoreV1 | null {
  const v = asObject(raw);
  if (!v || v.version !== 1 || !Array.isArray(v.projects)) return null;
  const seen = new Set<string>();
  const projects: ClipProject[] = [];
  for (const p of v.projects) {
    const project = parseProject(p);
    if (project && !seen.has(project.key)) {
      seen.add(project.key);
      projects.push(project);
    }
  }
  const last = typeof v.lastProjectKey === "string" && seen.has(v.lastProjectKey) ? v.lastProjectKey : null;
  return { version: 1, lastProjectKey: last, projects };
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadClipperStore(): LoadResult {
  const ls = storage();
  if (!ls) return { status: "empty", store: emptyStore() };
  let raw: string | null;
  try {
    raw = ls.getItem(MATCH_CLIPPER_STORAGE_KEY);
  } catch {
    return { status: "empty", store: emptyStore() };
  }
  if (raw === null) return { status: "empty", store: emptyStore() };
  try {
    const parsed = parseStore(JSON.parse(raw));
    return parsed ? { status: "ok", store: parsed } : { status: "unreadable", store: emptyStore() };
  } catch {
    return { status: "unreadable", store: emptyStore() };
  }
}

/**
 * Writes the store and reads it back. Refuses to write over a value that
 * can't be read, so a damaged clip list is never silently replaced.
 */
export function saveClipperStore(store: ClipperStoreV1): SaveResult {
  const ls = storage();
  if (!ls) return { ok: false, reason: "unavailable" };
  if (loadClipperStore().status === "unreadable") return { ok: false, reason: "unreadable" };
  const trimmed: ClipperStoreV1 = {
    ...store,
    projects: [...store.projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROJECTS),
  };
  if (trimmed.lastProjectKey && !trimmed.projects.some((p) => p.key === trimmed.lastProjectKey)) {
    trimmed.lastProjectKey = null;
  }
  const json = JSON.stringify(trimmed);
  try {
    ls.setItem(MATCH_CLIPPER_STORAGE_KEY, json);
  } catch {
    return { ok: false, reason: "full" };
  }
  try {
    if (ls.getItem(MATCH_CLIPPER_STORAGE_KEY) !== json) return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

/** Returns a new store with `project` inserted or replaced and marked as last used. */
export function upsertProject(store: ClipperStoreV1, project: ClipProject): ClipperStoreV1 {
  const others = store.projects.filter((p) => p.key !== project.key);
  return { version: 1, lastProjectKey: project.key, projects: [project, ...others] };
}

export function removeProject(store: ClipperStoreV1, key: string): ClipperStoreV1 {
  return {
    version: 1,
    lastProjectKey: store.lastProjectKey === key ? null : store.lastProjectKey,
    projects: store.projects.filter((p) => p.key !== key),
  };
}
