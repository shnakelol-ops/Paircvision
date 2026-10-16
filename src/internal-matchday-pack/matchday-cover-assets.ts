import { PRESET_KITS, type TeamSheetKit } from "../internal-team-sheet/team-sheet-kits";
import {
  loadUserKitImage,
  loadUserKitRecords,
  userKitRecordToKit,
  type KitImageBackend,
} from "../internal-team-sheet/team-sheet-kit-store";
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

/** Something drawImage() accepts and whose intrinsic size we know. */
export interface CoverImage {
  source: CanvasImageSource;
  width: number;
  height: number;
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

/**
 * Clears small opaque islands that aren't attached to the jersey — resize
 * fringe left in cut-out images (the yellow preset has two near its hem).
 * Invisible at Team Sheet size, obvious on a 1080px poster. Only alpha is
 * touched; the jersey itself (the largest connected shape) and anything at
 * least `minFraction` of its size is kept byte-for-byte. Returns the number
 * of pixels cleared.
 */
export function clearDetachedSpecks(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minFraction = 0.02,
  alphaThreshold = 16,
): number {
  const n = width * height;
  const label = new Int32Array(n);
  const queue = new Int32Array(n);
  const sizes: number[] = [0];
  for (let start = 0; start < n; start++) {
    if (label[start] || data[start * 4 + 3] <= alphaThreshold) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
      for (const q of neighbours) {
        if (q < 0 || q >= n || label[q] || data[q * 4 + 3] <= alphaThreshold) continue;
        label[q] = id;
        queue[tail++] = q;
      }
    }
    sizes.push(tail);
  }
  const largest = Math.max(0, ...sizes);
  const minSize = largest * minFraction;
  let cleared = 0;
  for (let p = 0; p < n; p++) {
    const id = label[p];
    if (id && sizes[id] < minSize) {
      data[p * 4 + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

/** Copies a decoded jersey into its own canvas with specks cleared. Falls
 * back to the untouched image if pixel access is unavailable. */
export function cleanJerseyImage(img: CoverImage): CoverImage {
  if (typeof document === "undefined") return img;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return img;
    ctx.drawImage(img.source, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height);
    if (clearDetachedSpecks(pixels.data, img.width, img.height) > 0) ctx.putImageData(pixels, 0, 0);
    return { source: canvas, width: img.width, height: img.height };
  } catch {
    return img;
  }
}

export interface CoverAssetDeps {
  loadUrl?: (url: string) => Promise<CoverImage | null>;
  loadBlob?: (blob: Blob) => Promise<CoverImage | null>;
  backend?: KitImageBackend;
  clean?: (img: CoverImage) => CoverImage;
}

/** Any failure (missing blob, decode error, evicted storage) → null, never a substitute kit. */
export async function loadCoverJersey(source: CoverJerseySource, deps: CoverAssetDeps = {}): Promise<CoverImage | null> {
  const loadUrl = deps.loadUrl ?? loadImageFromUrl;
  const loadBlob = deps.loadBlob ?? loadImageFromBlob;
  const clean = deps.clean ?? cleanJerseyImage;
  try {
    let img: CoverImage | null = null;
    if (source.kind === "preset") img = await loadUrl(source.src);
    if (source.kind === "user") {
      const blob = await loadUserKitImage(source.kitId, deps.backend);
      img = blob ? await loadBlob(blob) : null;
    }
    return img ? clean(img) : null;
  } catch {
    return null;
  }
}
