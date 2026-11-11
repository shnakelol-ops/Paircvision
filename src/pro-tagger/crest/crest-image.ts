// Club crest image validation and processing (Club Crest V1, Checkpoint 1).
//
// Everything runs on the device. The pipeline is:
//   1. checkCrestFile(): read the file's first bytes, identify a genuine PNG,
//      JPEG or WebP by its signature (the browser-supplied MIME type and the
//      filename are ignored), and read the pixel size from the header BEFORE
//      anything is decoded — so a small file that declares a huge image can
//      never be decoded into memory.
//   2. decode straight down to at most CREST_MAX_EDGE (512 px) using the kit
//      builder's decoder (EXIF orientation applied by the browser; metadata
//      such as GPS is discarded because only pixels are kept).
//   3. optional background removal — only offered for a plain, edge-connected
//      backdrop; off by default.
//   4. encode as PNG (keeps transparency), trimmed only of fully transparent
//      margins. Never stretched, never cropped into the artwork, never masked.
//
// The kit builder's low-level utilities are imported unchanged from
// internal-team-sheet/. Kit-specific steps are deliberately NOT used:
// assessRemoval() (always keeps only the largest connected shape and applies
// a jersey-centre check — it would delete detached crest parts such as a
// motto ribbon, stars or lettering) and encodeKitImage()/fitIntoFrame()
// (fit into the 600×738 jersey frame).
import { MAX_UPLOAD_BYTES, decodeToPixels, paintToCanvas } from "../../internal-team-sheet/kit-image-codec";
import {
  DEFAULT_TOLERANCE,
  MAX_TOLERANCE,
  alphaBounds,
  buildAlpha,
  computeAutoMask,
  estimateBackdrop,
  hasTransparency,
  type Bounds,
  type PixelImage,
} from "../../internal-team-sheet/kit-image-processing";

export type { PixelImage };

/** Longest edge of a stored crest. The largest planned on-canvas crest is ~180 px, so 512 gives ≥2.8× headroom. */
export const CREST_MAX_EDGE = 512;
/** Same byte limit as the kit builder (a 48 MP phone JPEG is ~15–25 MB). */
export const CREST_MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
/** Pixel-count guard checked from the header, before decoding (~200 MB of RGBA at the limit). */
export const CREST_MAX_SOURCE_PIXELS = 50_000_000;
export const CREST_MAX_SOURCE_EDGE = 12_000;
/** Enough to reach a JPEG's frame header past large EXIF / ICC / XMP segments. */
const HEADER_READ_BYTES = 2 * 1024 * 1024;

export const CREST_ACCEPT_ATTRIBUTE = "image/png,image/jpeg,image/webp";

export type CrestImageType = "image/png" | "image/jpeg" | "image/webp";

export type CrestFileCheck =
  | { ok: true; type: CrestImageType; width: number; height: number }
  | { ok: false; message: string };

export const CREST_MESSAGES = {
  empty: "That file is empty.",
  tooLarge: "That file is too large. Choose an image under 40 MB.",
  unsupported: "That file type isn't supported. Choose a PNG, JPEG or WebP image.",
  svg: "SVG files aren't supported. Choose a PNG, JPEG or WebP image.",
  gif: "GIF files aren't supported. Choose a PNG, JPEG or WebP image.",
  heic: "HEIC photos aren't supported here. Save the crest as a JPEG or PNG first.",
  badHeader: "This image couldn't be read. Try a different PNG, JPEG or WebP file.",
  tooManyPixels:
    "This image is too large to process on the device. Crop it or take a screenshot of the crest and try again.",
  decodeFailed: "This image couldn't be opened. Try a different PNG, JPEG or WebP file.",
  incomplete: "This image file is incomplete or damaged. Try a different PNG, JPEG or WebP file.",
  nothingVisible: "This image has nothing visible in it. Choose a different image.",
} as const;

// ── File signature + header dimensions (pure) ────────────────────────────

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return "";
  let s = "";
  for (let i = start; i < start + length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export type SniffResult = CrestImageType | "svg" | "gif" | "heic" | null;

/** Identifies the file from its bytes alone. */
export function sniffImageType(bytes: Uint8Array): SniffResult {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "GIF8") return "gif";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(brand)) return "heic";
    return null;
  }
  // SVG / XML: text that starts (after an optional BOM and whitespace) with "<".
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  if (bytes[i] === 0x3c /* "<" */) return "svg";
  return null;
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}
function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    let marker = b[o + 1];
    o += 2;
    while (marker === 0xff && o < b.length) marker = b[o++]; // fill bytes
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // no length
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / scan before any frame header
    if (o + 2 > b.length) return null;
    const len = u16be(b, o);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (o + 7 > b.length) return null;
      return { height: u16be(b, o + 3), width: u16be(b, o + 5) };
    }
    o += len;
  }
  return null;
}

function webpSize(b: Uint8Array): { width: number; height: number } | null {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
    const height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
    return { width, height };
  }
  if (chunk === "VP8X") {
    if (b.length < 30) return null;
    return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  }
  return null;
}

/** Pixel size declared in the file header, or null when the header is missing or malformed. */
export function readImageDimensions(bytes: Uint8Array, type: CrestImageType): { width: number; height: number } | null {
  const size = type === "image/png" ? pngSize(bytes) : type === "image/jpeg" ? jpegSize(bytes) : webpSize(bytes);
  if (!size || !(size.width > 0) || !(size.height > 0)) return null;
  return size;
}

/** Pure decision from the file's size and leading bytes. */
export function checkCrestBytes(fileSize: number, bytes: Uint8Array): CrestFileCheck {
  if (fileSize === 0) return { ok: false, message: CREST_MESSAGES.empty };
  if (fileSize > CREST_MAX_UPLOAD_BYTES) return { ok: false, message: CREST_MESSAGES.tooLarge };
  const sniffed = sniffImageType(bytes);
  if (sniffed === "svg") return { ok: false, message: CREST_MESSAGES.svg };
  if (sniffed === "gif") return { ok: false, message: CREST_MESSAGES.gif };
  if (sniffed === "heic") return { ok: false, message: CREST_MESSAGES.heic };
  if (sniffed === null) return { ok: false, message: CREST_MESSAGES.unsupported };
  const size = readImageDimensions(bytes, sniffed);
  if (!size) return { ok: false, message: CREST_MESSAGES.badHeader };
  if (
    size.width > CREST_MAX_SOURCE_EDGE ||
    size.height > CREST_MAX_SOURCE_EDGE ||
    size.width * size.height > CREST_MAX_SOURCE_PIXELS
  ) {
    return { ok: false, message: CREST_MESSAGES.tooManyPixels };
  }
  return { ok: true, type: sniffed, ...size };
}

async function readRange(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const part = blob.slice(start, end);
  if (typeof part.arrayBuffer === "function") return new Uint8Array(await part.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(part);
  });
}

function indexOfBytes(haystack: Uint8Array, needle: readonly number[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const TAIL_BYTES = 64 * 1024;
const SCAN_CHUNK = 1024 * 1024;

/**
 * Browsers decode truncated or damaged files leniently (a half-grey JPEG
 * instead of an error), so a file must also be structurally complete:
 * a JPEG contains an end-of-image marker (searched through the whole file,
 * so data appended after it — e.g. Samsung Motion Photos — is fine), a PNG
 * contains its IEND chunk near the end, and a WebP's declared RIFF size fits
 * inside the file.
 */
export async function isStructurallyComplete(file: Blob, type: CrestImageType): Promise<boolean> {
  const size = file.size;
  if (type === "image/webp") {
    const head = await readRange(file, 0, 12);
    if (head.length < 12) return false;
    const riffSize = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(4, true);
    return 8 + riffSize <= size;
  }
  if (type === "image/png") {
    const tail = await readRange(file, Math.max(0, size - TAIL_BYTES), size);
    return indexOfBytes(tail, [0x49, 0x45, 0x4e, 0x44]) !== -1; // "IEND"
  }
  // JPEG: the common case has the marker in the last bytes; otherwise scan.
  const tail = await readRange(file, Math.max(2, size - TAIL_BYTES), size);
  if (indexOfBytes(tail, [0xff, 0xd9]) !== -1) return true;
  for (let start = 2; start < size; start += SCAN_CHUNK) {
    const chunk = await readRange(file, start, Math.min(size, start + SCAN_CHUNK + 1)); // 1-byte overlap
    if (indexOfBytes(chunk, [0xff, 0xd9]) !== -1) return true;
  }
  return false;
}

/** Validates a chosen file without decoding it. Never throws. */
export async function checkCrestFile(file: Blob): Promise<CrestFileCheck> {
  if (file.size === 0) return { ok: false, message: CREST_MESSAGES.empty };
  if (file.size > CREST_MAX_UPLOAD_BYTES) return { ok: false, message: CREST_MESSAGES.tooLarge };
  try {
    const result = checkCrestBytes(file.size, await readRange(file, 0, Math.min(file.size, HEADER_READ_BYTES)));
    if (!("type" in result)) return result;
    if (!(await isStructurallyComplete(file, result.type))) return { ok: false, message: CREST_MESSAGES.incomplete };
    return result;
  } catch {
    return { ok: false, message: CREST_MESSAGES.badHeader };
  }
}

// ── Background removal (pure) ────────────────────────────────────────────

export type BackgroundRemovalOffer =
  | { offered: true; mask: Uint8Array }
  | { offered: false; reason: "already-transparent" | "busy-background" | "nothing-found" | "similar-colours" };

function keptRatio(mask: Uint8Array): number {
  let kept = 0;
  for (let i = 0; i < mask.length; i++) kept += mask[i];
  return mask.length === 0 ? 0 : kept / mask.length;
}

/**
 * Whether "Remove plain background" can be offered for this crest.
 *
 * Uses the kit builder's edge flood fill (computeAutoMask) with
 * largestOnly = false: only backdrop pixels connected to the image edge are
 * removed, so white areas enclosed by the crest are never touched, and crest
 * parts that are not joined to the main shape (lettering, stars, ribbons) are
 * all kept. Offered only for a plain backdrop whose removed area is stable
 * when the tolerance is loosened (an unstable area means the backdrop colour
 * is bleeding into the artwork).
 */
export function assessCrestBackgroundRemoval(img: PixelImage, tolerance = DEFAULT_TOLERANCE): BackgroundRemovalOffer {
  if (hasTransparency(img)) return { offered: false, reason: "already-transparent" };
  const backdrop = estimateBackdrop(img);
  if (backdrop.spread > 12) return { offered: false, reason: "busy-background" };
  const mask = computeAutoMask(img, tolerance, backdrop, false);
  const kept = keptRatio(mask);
  if (kept > 0.97) return { offered: false, reason: "nothing-found" };
  if (kept < 0.1) return { offered: false, reason: "similar-colours" };
  const looser = keptRatio(computeAutoMask(img, Math.min(MAX_TOLERANCE + 16, tolerance + 16), backdrop, false));
  if ((kept - looser) / kept > 0.04) return { offered: false, reason: "similar-colours" };
  return { offered: true, mask };
}

/**
 * Final alpha: with no mask, the image's own alpha (artwork untouched);
 * with a mask, the kit builder's buildAlpha (removed backdrop, softened cut
 * edge, never more opaque than the source).
 */
export function crestAlpha(img: PixelImage, mask: Uint8Array | null): Uint8ClampedArray {
  return buildAlpha(img, mask, new Uint8Array(img.width * img.height));
}

/** Tight box around every pixel that is not fully transparent — trims only invisible margins. */
export function crestVisibleBounds(img: PixelImage, alpha: Uint8ClampedArray): Bounds | null {
  return alphaBounds(alpha, img.width, img.height, 0);
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
/** The Match Analysis background (htFtDashboardView.ts DASHBOARD_BG, #0b1428). */
const ANALYSIS_BG_LUMINANCE = relLuminance(0x0b, 0x14, 0x28);
export const MIN_CREST_CONTRAST = 2;

/** True when the visible artwork, on average, contrasts less than 2:1 with the dark analysis background. */
export function crestNeedsBacking(img: PixelImage, alpha: Uint8ClampedArray): boolean {
  const { data } = img;
  let sum = 0;
  let weight = 0;
  for (let p = 0; p < alpha.length; p++) {
    const a = alpha[p];
    if (a < 128) continue;
    sum += relLuminance(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) * a;
    weight += a;
  }
  if (weight === 0) return false;
  const lum = sum / weight;
  const hi = Math.max(lum, ANALYSIS_BG_LUMINANCE);
  const lo = Math.min(lum, ANALYSIS_BG_LUMINANCE);
  return (hi + 0.05) / (lo + 0.05) < MIN_CREST_CONTRAST;
}

// ── Browser codec (canvas) ───────────────────────────────────────────────

export type EncodedCrest = { blob: Blob; width: number; height: number };

/** Seam so the crest sheet can be tested without a real canvas. */
export interface CrestCodec {
  check(file: File): Promise<CrestFileCheck>;
  /** Decodes to at most CREST_MAX_EDGE; rejects with a user-facing message. */
  decode(file: File): Promise<PixelImage>;
  /** Paints exactly what encode() would store into a preview canvas. */
  paint(canvas: HTMLCanvasElement, img: PixelImage, alpha: Uint8ClampedArray): void;
  encode(img: PixelImage, alpha: Uint8ClampedArray): Promise<EncodedCrest>;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Draws the image with this alpha, trimmed of fully transparent margins, at 1:1 into `target`. */
function paintTrimmed(target: HTMLCanvasElement, img: PixelImage, alpha: Uint8ClampedArray): Bounds {
  const bounds = crestVisibleBounds(img, alpha);
  if (!bounds) throw new Error(CREST_MESSAGES.nothingVisible);
  const full = makeCanvas(img.width, img.height);
  try {
    paintToCanvas(full, img, alpha);
    target.width = bounds.width;
    target.height = bounds.height;
    const ctx = target.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available on this device.");
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    ctx.drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  } finally {
    full.width = 0; // release the bitmap
  }
  return bounds;
}

export const browserCrestCodec: CrestCodec = {
  check: (file) => checkCrestFile(file),
  async decode(file) {
    let img: PixelImage;
    try {
      img = await decodeToPixels(file, CREST_MAX_EDGE);
    } catch {
      throw new Error(CREST_MESSAGES.decodeFailed);
    }
    if (!img.width || !img.height) throw new Error(CREST_MESSAGES.decodeFailed);
    return img;
  },
  paint(canvas, img, alpha) {
    paintTrimmed(canvas, img, alpha);
  },
  async encode(img, alpha) {
    const canvas = makeCanvas(1, 1);
    try {
      const bounds = paintTrimmed(canvas, img, alpha);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b && b.size > 0 ? resolve(b) : reject(new Error("Couldn't encode the crest."))), "image/png"),
      );
      return { blob, width: bounds.width, height: bounds.height };
    } finally {
      canvas.width = 0;
    }
  },
};
