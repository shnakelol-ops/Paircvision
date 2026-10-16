// Thin browser layer for the Kit Builder: file validation, decoding a photo
// straight down to the working size, and encoding the results. All pixel
// logic lives in kit-image-processing.ts (pure, unit-tested); this file only
// talks to canvas/createImageBitmap, and is verified in a real browser.
import {
  KIT_FRAME,
  MAX_WORKING_EDGE,
  alphaBounds,
  composeRgba,
  fitIntoFrame,
  fitWithin,
  type PixelImage,
} from "./kit-image-processing";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
/** Generous: a 48MP phone JPEG is ~15–25MB. Anything bigger is almost certainly not a photo we want. */
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export function validateUpload(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "That file type isn't supported. Choose a JPG, PNG or WebP photo.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "That photo is too large. Choose one under 40 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/** Codec seam so the upload sheet can be tested without a real canvas. */
export interface KitImageCodec {
  decode(file: File): Promise<PixelImage>;
  /** Draw the image with this alpha; with `fit`, trim to the jersey and contain it in that size. */
  paint(canvas: HTMLCanvasElement, img: PixelImage, alpha: Uint8ClampedArray, fit?: { width: number; height: number }): void;
  encodeKit(img: PixelImage, alpha: Uint8ClampedArray): Promise<Blob>;
  encodeOriginal(img: PixelImage, transparent: boolean): Promise<Blob>;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available on this device.");
  return ctx;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image."))), type, quality),
  );
}

type Source = { image: CanvasImageSource; width: number; height: number; release: () => void };

async function openSource(file: File): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall through to <img>, which some Safari versions decode more leniently.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This photo couldn't be opened. Try a different JPG, PNG or WebP image.");
  }
}

/**
 * Decode a photo and scale it down to at most MAX_WORKING_EDGE before any
 * processing. The full-size decode is released immediately; downscaling
 * halves in steps so large phone photos stay sharp instead of aliasing.
 * Photo orientation (EXIF) is applied by the browser's decoder.
 */
export async function decodeToPixels(file: File, maxEdge = MAX_WORKING_EDGE): Promise<PixelImage> {
  const opened = await openSource(file);
  let released = false;
  const source = { ...opened, release: () => (released ? undefined : ((released = true), opened.release())) };
  try {
    if (!source.width || !source.height) throw new Error("This photo couldn't be opened.");
    const target = fitWithin(source.width, source.height, maxEdge);
    // Fast path: let the browser resize while decoding (~5x faster than
    // drawing a 48MP photo through canvases on a phone). Browsers that
    // ignore the resize options return the full size, and fall through to
    // the stepwise canvas path below.
    if (typeof createImageBitmap === "function" && typeof ImageBitmap !== "undefined" && source.image instanceof ImageBitmap) {
      try {
        const resized = await createImageBitmap(source.image, {
          resizeWidth: target.width,
          resizeHeight: target.height,
          resizeQuality: "high",
        });
        try {
          if (resized.width === target.width && resized.height === target.height) {
            source.release();
            const out = makeCanvas(target.width, target.height);
            const ctx = context2d(out);
            ctx.drawImage(resized, 0, 0);
            const { data } = ctx.getImageData(0, 0, target.width, target.height);
            return { data, width: target.width, height: target.height };
          }
        } finally {
          resized.close();
        }
      } catch {
        // resize options unsupported — use the canvas path
      }
    }
    let current: CanvasImageSource = source.image;
    let w = source.width;
    let h = source.height;
    while (w / 2 >= target.width * 1.5) {
      const nw = Math.round(w / 2);
      const nh = Math.round(h / 2);
      const step = makeCanvas(nw, nh);
      const ctx = context2d(step);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(current, 0, 0, nw, nh);
      if (current === source.image) source.release(); // full-size decode no longer needed
      else (current as HTMLCanvasElement).width = 0; // free the previous intermediate step
      current = step;
      w = nw;
      h = nh;
    }
    const out = makeCanvas(target.width, target.height);
    const ctx = context2d(out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, target.width, target.height);
    const { data } = ctx.getImageData(0, 0, target.width, target.height);
    return { data, width: target.width, height: target.height };
  } finally {
    source.release();
  }
}

/** Draw the image with the given alpha into a canvas (used for previews). */
export function paintToCanvas(canvas: HTMLCanvasElement, img: PixelImage, alpha: Uint8ClampedArray): void {
  if (canvas.width !== img.width) canvas.width = img.width;
  if (canvas.height !== img.height) canvas.height = img.height;
  context2d(canvas).putImageData(new ImageData(composeRgba(img, alpha), img.width, img.height), 0, 0);
}

/** Small preview at a fixed size: trimmed to the jersey and contained, like a saved kit in its frame. */
function paintFitted(canvas: HTMLCanvasElement, img: PixelImage, alpha: Uint8ClampedArray, fit: { width: number; height: number }): void {
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, fit.width, fit.height);
  const bounds = alphaBounds(alpha, img.width, img.height);
  if (!bounds) return;
  const full = makeCanvas(img.width, img.height);
  paintToCanvas(full, img, alpha);
  const placed = fitIntoFrame(bounds, fit);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height, placed.x, placed.y, placed.width, placed.height);
  full.width = 0;
}

/** Trim to the visible jersey and fit it into the 600×738 kit frame as PNG (Safari can't encode WebP). */
export async function encodeKitImage(img: PixelImage, alpha: Uint8ClampedArray): Promise<Blob> {
  const bounds = alphaBounds(alpha, img.width, img.height);
  if (!bounds) throw new Error("Nothing is left of the jersey — restore some of it before saving.");
  const full = makeCanvas(img.width, img.height);
  paintToCanvas(full, img, alpha);
  const frame = makeCanvas(KIT_FRAME.width, KIT_FRAME.height);
  const ctx = context2d(frame);
  ctx.imageSmoothingQuality = "high";
  const fit = fitIntoFrame(bounds);
  ctx.drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height, fit.x, fit.y, fit.width, fit.height);
  full.width = 0;
  return canvasToBlob(frame, "image/png");
}

/** The resized source photo, kept so a kit can be re-processed later. */
export async function encodeOriginalImage(img: PixelImage, transparent: boolean): Promise<Blob> {
  const canvas = makeCanvas(img.width, img.height);
  context2d(canvas).putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const blob = await canvasToBlob(canvas, transparent ? "image/png" : "image/jpeg", 0.9);
  canvas.width = 0;
  return blob;
}

export const browserKitImageCodec: KitImageCodec = {
  decode: (file) => decodeToPixels(file),
  paint: (canvas, img, alpha, fit) => (fit ? paintFitted(canvas, img, alpha, fit) : paintToCanvas(canvas, img, alpha)),
  encodeKit: encodeKitImage,
  encodeOriginal: encodeOriginalImage,
};
