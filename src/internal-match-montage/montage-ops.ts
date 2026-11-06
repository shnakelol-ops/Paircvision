// Match Montage V2 — pure editing operations. Every function returns new
// objects; inputs (including V1 clips) are never mutated.

import { MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, type ClipSelection } from "../internal-match-clipper/clip-types";
import { cleanMontageName } from "./montage-storage";
import { MAX_MONTAGE_ITEMS, newMontageId, type MontageProject, type MontageStoreV1 } from "./montage-types";

export interface MontageSource {
  key: string;
  fileName: string;
  fileSize: number;
  duration: number | null;
}

export function createMontage(name: string, source: MontageSource, now = Date.now()): MontageProject {
  return {
    id: newMontageId("montage"),
    name: cleanMontageName(name) || defaultMontageName(new Date(now)),
    sourceKey: source.key,
    sourceName: source.fileName,
    sourceSize: source.fileSize,
    sourceDuration: source.duration,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultMontageName(d: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `Montage ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export interface AddResult {
  project: MontageProject;
  added: number;
  /** Clips already in the montage (by V1 clip id) — not added twice. */
  skippedDuplicates: number;
  /** Clips that did not fit under MAX_MONTAGE_ITEMS. */
  skippedFull: number;
}

/** Copies clips (range, name, category) into the montage, in the given order, at the end. */
export function addClips(project: MontageProject, clips: readonly ClipSelection[], now = Date.now()): AddResult {
  const present = new Set(project.items.map((i) => i.clipId).filter((id): id is string => id !== null));
  const items = [...project.items];
  let added = 0, skippedDuplicates = 0, skippedFull = 0;
  for (const c of clips) {
    if (present.has(c.id)) {
      skippedDuplicates++;
      continue;
    }
    if (items.length >= MAX_MONTAGE_ITEMS) {
      skippedFull++;
      continue;
    }
    present.add(c.id);
    items.push({ id: newMontageId("item"), clipId: c.id, name: c.name, category: c.category, start: c.start, end: c.end, addedAt: now + added });
    added++;
  }
  return { project: added ? { ...project, items, updatedAt: now } : project, added, skippedDuplicates, skippedFull };
}

export function removeItem(project: MontageProject, itemId: string, now = Date.now()): MontageProject {
  const items = project.items.filter((i) => i.id !== itemId);
  return items.length === project.items.length ? project : { ...project, items, updatedAt: now };
}

export function moveItem(project: MontageProject, itemId: string, delta: number, now = Date.now()): MontageProject {
  const from = project.items.findIndex((i) => i.id === itemId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= project.items.length || delta === 0) return project;
  const items = [...project.items];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved!);
  return { ...project, items, updatedAt: now };
}

export type TrimResult = { ok: true; project: MontageProject } | { ok: false; reason: string };

/** Sets an item's range. Kept inside the source video and between MIN/MAX clip lengths. */
export function trimItem(project: MontageProject, itemId: string, range: { start: number; end: number }, now = Date.now()): TrimResult {
  const item = project.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: "That clip is no longer in this montage." };
  const start = round1(range.start), end = round1(range.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) return { ok: false, reason: "Enter a valid time." };
  if (project.sourceDuration !== null && end > project.sourceDuration + 0.05) return { ok: false, reason: "The end is after the end of the video." };
  if (end - start < MIN_CLIP_SECONDS) return { ok: false, reason: `A clip must be at least ${MIN_CLIP_SECONDS} s long.` };
  if (end - start > MAX_CLIP_SECONDS) return { ok: false, reason: `A clip can be at most ${MAX_CLIP_SECONDS / 60} minutes long.` };
  if (start === item.start && end === item.end) return { ok: true, project };
  return { ok: true, project: { ...project, items: project.items.map((i) => (i.id === itemId ? { ...i, start, end } : i)), updatedAt: now } };
}

export function renameMontage(project: MontageProject, name: string, now = Date.now()): MontageProject {
  const clean = cleanMontageName(name);
  return clean && clean !== project.name ? { ...project, name: clean, updatedAt: now } : project;
}

export function setSourceDuration(project: MontageProject, duration: number): MontageProject {
  return project.sourceDuration === duration ? project : { ...project, sourceDuration: duration };
}

export function totals(project: Pick<MontageProject, "items">): { count: number; seconds: number } {
  return { count: project.items.length, seconds: project.items.reduce((n, i) => n + (i.end - i.start), 0) };
}

export function upsertMontage(store: MontageStoreV1, project: MontageProject): MontageStoreV1 {
  return { version: 1, projects: [project, ...store.projects.filter((p) => p.id !== project.id)] };
}

export function deleteMontage(store: MontageStoreV1, id: string): MontageStoreV1 {
  return { version: 1, projects: store.projects.filter((p) => p.id !== id) };
}

export function montagesForSource(store: MontageStoreV1, sourceKey: string): MontageProject[] {
  return store.projects.filter((p) => p.sourceKey === sourceKey).sort((a, b) => b.updatedAt - a.updatedAt);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
