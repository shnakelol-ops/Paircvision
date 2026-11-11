// Shared fixtures for the club crest tests (not imported by app code).
import type { PixelImage } from "../../internal-team-sheet/kit-image-processing";
import type { ClubCrestRecord, CrestBackend } from "./crest-store";

/** The first 33 bytes of a PNG: signature + IHDR declaring width × height. */
export function pngHeaderBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}

/** PNG header plus a closing IEND chunk: passes the header and completeness checks (decoding is faked in UI tests). */
export function pngFile(width: number, height: number, name = "crest.png", type = "image/png"): File {
  const iend = new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return new File([pngHeaderBytes(width, height) as BlobPart, iend as BlobPart], name, { type });
}

export function textFile(text: string, name: string, type: string): File {
  return new File([text], name, { type });
}

/** Solid image, then `paint` sets individual pixels. */
export function makeImage(
  width: number,
  height: number,
  fill: [number, number, number, number],
  paint?: (x: number, y: number) => [number, number, number, number] | null,
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = paint?.(x, y) ?? fill;
      data.set(c, (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

export const WHITE: [number, number, number, number] = [255, 255, 255, 255];
export const RED: [number, number, number, number] = [200, 20, 30, 255];
export const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

/**
 * 60×60 crest on a plain white backdrop: a red ring (shield) with an enclosed
 * white centre, plus a detached red "motto" bar below it that does not touch
 * the ring.
 */
export function plainBackgroundCrest(): PixelImage {
  return makeImage(60, 60, WHITE, (x, y) => {
    const inRing = x >= 15 && x < 45 && y >= 8 && y < 38;
    const inHole = x >= 22 && x < 38 && y >= 15 && y < 31;
    if (inRing && !inHole) return RED;
    if (x >= 18 && x < 42 && y >= 44 && y < 50) return RED; // detached motto bar
    return null;
  });
}

/** Same artwork with a transparent backdrop. */
export function transparentCrest(): PixelImage {
  return makeImage(60, 60, CLEAR, (x, y) => (x >= 15 && x < 45 && y >= 8 && y < 38 ? RED : null));
}

export type MemoryCrestBackend = CrestBackend & {
  data: Map<string, unknown>;
  failPut: Error | null;
  failDelete: Error | null;
  failGet: Error | null;
};

export function memoryCrestBackend(): MemoryCrestBackend {
  const backend: MemoryCrestBackend = {
    data: new Map(),
    failPut: null,
    failDelete: null,
    failGet: null,
    async put(id: string, record: ClubCrestRecord) {
      if (backend.failPut) throw backend.failPut;
      backend.data.set(id, record);
    },
    async get(id: string) {
      if (backend.failGet) throw backend.failGet;
      return backend.data.get(id);
    },
    async delete(id: string) {
      if (backend.failDelete) throw backend.failDelete;
      backend.data.delete(id);
    },
  };
  return backend;
}

export function quotaError(): DOMException {
  return new DOMException("Quota exceeded", "QuotaExceededError");
}

/** Blob → text via FileReader (jsdom's Blob has no .text()). */
export function blobText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}
