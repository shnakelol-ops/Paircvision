// Match Montage V2 — data model (Stages 1–2: projects, editing, preview; no export yet).
//
// A montage item is a COPY of a Match Clipper clip's range, name and category,
// plus the id of the clip it came from. Trimming, reordering or removing items
// never touches V1 clip data, and deleting a V1 clip never breaks a montage.

import type { ClipCategory } from "../internal-match-clipper/clip-types";

export interface MontageItem {
  id: string;
  /** The V1 clip this item was copied from (informational; may no longer exist). */
  clipId: string | null;
  name: string;
  category: ClipCategory;
  /** Seconds in the source video. */
  start: number;
  end: number;
  addedAt: number;
}

export interface MontageProject {
  id: string;
  name: string;
  /** Source match video identity — same fingerprint as V1 (file name + size). */
  sourceKey: string;
  sourceName: string;
  sourceSize: number;
  /** Source duration in seconds once known; used to keep trims inside the video. */
  sourceDuration: number | null;
  items: MontageItem[];
  createdAt: number;
  updatedAt: number;
}

export interface MontageStoreV1 {
  version: 1;
  projects: MontageProject[];
}

export const MAX_MONTAGE_ITEMS = 150;
export const MAX_MONTAGES = 50;
export const MAX_MONTAGE_NAME = 60;
/** Above this total the workspace warns that export may be slow or large (export is Stage 3). */
export const LONG_MONTAGE_SECONDS = 20 * 60;

export function newMontageId(prefix: "montage" | "item"): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `${prefix}:${c.randomUUID()}`;
  return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
