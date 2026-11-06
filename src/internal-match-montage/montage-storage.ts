// Match Montage V2 — persistence. Own localStorage key, separate from Match
// Clipper V1's key and every other PáircVision key. Same safety rules as V1:
// every change is written and read back; an unreadable value is never
// overwritten.

import { MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, isClipCategory } from "../internal-match-clipper/clip-types";
import { MAX_MONTAGES, MAX_MONTAGE_ITEMS, MAX_MONTAGE_NAME, type MontageItem, type MontageProject, type MontageStoreV1 } from "./montage-types";

export const MONTAGE_STORAGE_KEY = "paircvision_internal_match_montage_v1";

export type MontageLoad =
  | { status: "empty"; store: MontageStoreV1 }
  | { status: "ok"; store: MontageStoreV1 }
  | { status: "unreadable"; store: MontageStoreV1 };

export type MontageSave = { ok: true } | { ok: false; reason: "unreadable" | "full" | "unavailable" };

export function emptyMontageStore(): MontageStoreV1 {
  return { version: 1, projects: [] };
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export function cleanMontageName(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_MONTAGE_NAME).trim() : "";
}

export function parseItem(v: unknown): MontageItem | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string" || !o.id || !num(o.start) || !num(o.end)) return null;
  const span = o.end - o.start;
  if (span < MIN_CLIP_SECONDS - 1e-6 || span > MAX_CLIP_SECONDS + 1e-6) return null;
  return {
    id: o.id,
    clipId: typeof o.clipId === "string" ? o.clipId : null,
    name: (typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim().slice(0, 80) : "") || "Clip",
    category: isClipCategory(o.category) ? o.category : "other",
    start: o.start,
    end: o.end,
    addedAt: num(o.addedAt) ? o.addedAt : 0,
  };
}

export function parseProject(v: unknown): MontageProject | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string" || !o.id || typeof o.sourceKey !== "string" || typeof o.sourceName !== "string" || !num(o.sourceSize)) {
    return null;
  }
  const items = Array.isArray(o.items) ? o.items.map(parseItem).filter((i): i is MontageItem => i !== null).slice(0, MAX_MONTAGE_ITEMS) : [];
  return {
    id: o.id,
    name: cleanMontageName(o.name) || "Montage",
    sourceKey: o.sourceKey,
    sourceName: o.sourceName,
    sourceSize: o.sourceSize,
    sourceDuration: num(o.sourceDuration) && o.sourceDuration > 0 ? o.sourceDuration : null,
    items,
    createdAt: num(o.createdAt) ? o.createdAt : 0,
    updatedAt: num(o.updatedAt) ? o.updatedAt : 0,
  };
}

export function parseMontageStore(raw: unknown): MontageStoreV1 | null {
  const o = obj(raw);
  if (!o || o.version !== 1 || !Array.isArray(o.projects)) return null;
  const seen = new Set<string>();
  const projects: MontageProject[] = [];
  for (const p of o.projects) {
    const parsed = parseProject(p);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      projects.push(parsed);
    }
  }
  return { version: 1, projects };
}

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadMontages(): MontageLoad {
  const s = ls();
  if (!s) return { status: "empty", store: emptyMontageStore() };
  let raw: string | null;
  try {
    raw = s.getItem(MONTAGE_STORAGE_KEY);
  } catch {
    return { status: "empty", store: emptyMontageStore() };
  }
  if (raw === null) return { status: "empty", store: emptyMontageStore() };
  try {
    const parsed = parseMontageStore(JSON.parse(raw));
    return parsed ? { status: "ok", store: parsed } : { status: "unreadable", store: emptyMontageStore() };
  } catch {
    return { status: "unreadable", store: emptyMontageStore() };
  }
}

/** Writes and reads back. Never writes over a value that can't be read. Keeps the most recently edited montages. */
export function saveMontages(store: MontageStoreV1): MontageSave {
  const s = ls();
  if (!s) return { ok: false, reason: "unavailable" };
  if (loadMontages().status === "unreadable") return { ok: false, reason: "unreadable" };
  const trimmed: MontageStoreV1 = {
    version: 1,
    projects: [...store.projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_MONTAGES),
  };
  const json = JSON.stringify(trimmed);
  try {
    s.setItem(MONTAGE_STORAGE_KEY, json);
  } catch {
    return { ok: false, reason: "full" };
  }
  try {
    if (s.getItem(MONTAGE_STORAGE_KEY) !== json) return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
