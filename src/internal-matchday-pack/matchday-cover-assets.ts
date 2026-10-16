import { PRESET_KITS, type TeamSheetKit } from "../internal-team-sheet/team-sheet-kits";
import {
  loadUserKitImage,
  loadUserKitRecords,
  userKitRecordToKit,
  type KitImageBackend,
} from "../internal-team-sheet/team-sheet-kit-store";
import { alphaBounds, keepLargestComponent } from "../internal-team-sheet/kit-image-processing";
import type { MatchdaySide } from "./matchday-pack-types";

// Reads jerseys from the existing kit registry + IndexedDB store; never
// copies or re-stores them. Deliberately does NOT use resolveKit() or
// useKitImage(): those fall back to the Ballylanders presets, which is right
// for the Ballylanders Team Sheet but would put Ballylanders' jersey on an
// opponent. Here a missing, deleted, wrong-role or other-team kit resolves
// to "none" and the cover draws a neutral jersey in the side's own colours.

export type CoverJerseySource =
  | { kind: "preset"; kitId: string; src: string }
  | { kind: "user"; kitId: string }
  | { kind: "none" };

/** Presets plus every user kit saved on this device. */
export function loadAvailableKits(): TeamSheetKit[] {
  return [...PRESET_KITS, ...loadUserKitRecords().map(userKitRecordToKit)];
}

export function resolveCoverJersey(side: MatchdaySide, kits: readonly TeamSheetKit[]): CoverJerseySource {
  if (!side.outfieldKitId) return { kind: "none" };
  const kit = kits.find((k) => k.id === side.outfieldKitId);
  if (!kit || kit.role !== "outfield" || kit.teamId !== side.teamId) return { kind: "none" };
  if (kit.source === "preset") return kit.src ? { kind: "preset", kitId: kit.id, src: kit.src } : { kind: "none" };
  return { kind: "user", kitId: kit.id };
}

/** A source rectangle inside an image — the part of it that is visible jersey. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Something drawImage() accepts and whose intrinsic size we know. */
export interface CoverImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Draw only this part of `source` (the jersey without its transparent
   * margin). Absent → the whole image. */
  crop?: CropRect;
}

export function loadImageFromUrl(url: string): Promise<CoverImage | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      resolve(width > 0 && height > 0 ? { source: img, width, height } : null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Decodes a stored kit Blob; the object URL lives only for the decode. */
export async function loadImageFromBlob(blob: Blob): Promise<CoverImage | null> {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Preparing a jersey for the poster ─────────────────────────────────────
//
// Both kinds are trimmed to their visible pixels so a preset (cropped
// tight) and an uploaded kit (saved by the Kit Builder centred in a padded
// 600×738 frame) are scaled by the jersey itself, not by its margin — they
// come out the same apparent size. Trimming is a source rectangle only.
//
// Speck cleanup (reusing the Kit Builder's own keepLargestComponent) runs on
// built-in PRESETS ONLY — the yellow preset carries two detached resize
// specks near its hem. Uploaded kits were already cleaned by the Kit Builder
// and may hold deliberate manual Restore edits, so their pixels are never
// modified here.

const ALPHA_VISIBLE = 0; // any non-zero alpha counts as visible — nothing is cropped away
const ALPHA_SPECK = 16; // same "opaque enough" cut-off the Kit Builder uses

function alphaChannel(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(rgba.length / 4);
  for (let p = 0; p < alpha.length; p++) alpha[p] = rgba[p * 4 + 3];
  return alpha;
}

/**
 * Pure: clears (alpha → 0) every opaque pixel outside the largest connected
 * shape. Colour channels are never touched. Presets only. Returns the
 * number of pixels cleared.
 */
export function clearPresetSpecks(rgba: Uint8ClampedArray, width: number, height: number): number {
  const n = width * height;
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) mask[p] = rgba[p * 4 + 3] > ALPHA_SPECK ? 1 : 0;
  const keep = keepLargestComponent(mask, width, height);
  let cleared = 0;
  for (let p = 0; p < n; p++) {
    if (mask[p] && !keep[p]) {
      rgba[p * 4 + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

/** Pure: bounds of every visible pixel (alpha > 0), or null if none. */
export function visibleBounds(rgba: Uint8ClampedArray, width: number, height: number): CropRect | null {
  return alphaBounds(alphaChannel(rgba), width, height, ALPHA_VISIBLE);
}

export type JerseyKind = "preset" | "user";

/**
 * Browser glue: reads the pixels once, then
 *  - preset → specks cleared on a private copy, drawn from that copy;
 *  - user   → drawn from the ORIGINAL decoded image, pixels untouched;
 * both cropped to their visible bounds. A jersey with no visible pixels is
 * treated as missing. If pixels can't be read, the image is used as-is.
 */
export function prepareCoverJersey(img: CoverImage, kind: JerseyKind): CoverImage | null {
  if (typeof document === "undefined") return img;
  const canvas = document.createElement("canvas");
  try {
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return img;
    ctx.drawImage(img.source, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height);
    if (kind === "preset" && clearPresetSpecks(pixels.data, img.width, img.height) > 0) {
      ctx.putImageData(pixels, 0, 0);
    }
    const crop = visibleBounds(pixels.data, img.width, img.height);
    if (!crop) return null;
    if (kind === "preset") return { source: canvas, width: img.width, height: img.height, crop };
    canvas.width = 0; // release the read-only copy
    return { ...img, crop };
  } catch {
    canvas.width = 0;
    return img;
  }
}

export interface CoverAssetDeps {
  loadUrl?: (url: string) => Promise<CoverImage | null>;
  loadBlob?: (blob: Blob) => Promise<CoverImage | null>;
  backend?: KitImageBackend;
  prepare?: (img: CoverImage, kind: JerseyKind) => CoverImage | null;
}

/** Any failure (missing blob, decode error, evicted storage) → null, never a substitute kit. */
export async function loadCoverJersey(source: CoverJerseySource, deps: CoverAssetDeps = {}): Promise<CoverImage | null> {
  const loadUrl = deps.loadUrl ?? loadImageFromUrl;
  const loadBlob = deps.loadBlob ?? loadImageFromBlob;
  const prepare = deps.prepare ?? prepareCoverJersey;
  try {
    if (source.kind === "preset") {
      const img = await loadUrl(source.src);
      return img ? prepare(img, "preset") : null;
    }
    if (source.kind === "user") {
      const blob = await loadUserKitImage(source.kitId, deps.backend);
      const img = blob ? await loadBlob(blob) : null;
      return img ? prepare(img, "user") : null;
    }
  } catch {
    return null;
  }
  return null;
}
