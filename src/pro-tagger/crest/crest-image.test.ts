// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";

import {
  CREST_MAX_EDGE,
  CREST_MESSAGES,
  assessCrestBackgroundRemoval,
  checkCrestBytes,
  checkCrestFile,
  crestAlpha,
  crestNeedsBacking,
  crestVisibleBounds,
  isStructurallyComplete,
  readImageDimensions,
  sniffImageType,
} from "./crest-image";
import { assessRemoval } from "../../internal-team-sheet/kit-image-processing";
import { CLEAR, RED, WHITE, makeImage, pngHeaderBytes, plainBackgroundCrest, transparentCrest } from "./crestTestFixtures";

// ── Byte fixtures ────────────────────────────────────────────────────────

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** A complete, genuine RGBA PNG (decodable by any PNG decoder). */
function realPng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (1 + width * 4)); // filter byte 0 + transparent pixels
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function jpegBytes(width: number, height: number, opts: { sof?: number; exifBytes?: number; noFrame?: boolean } = {}): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  bytes.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0); // APP0 JFIF
  if (opts.exifBytes) {
    const len = opts.exifBytes + 2;
    bytes.push(0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...new Array(opts.exifBytes).fill(0x45));
  }
  bytes.push(0xff, 0xdb, 0x00, 0x43, ...new Array(65).fill(1)); // DQT
  if (!opts.noFrame) {
    bytes.push(0xff, opts.sof ?? 0xc0, 0x00, 0x11, 8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 3,
      1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  }
  bytes.push(0xff, 0xda, 0x00, 0x0c, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0); // SOS
  bytes.push(0x12, 0x34, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

function riff(chunk: string, payload: number[]): Uint8Array {
  const b = new Uint8Array(20 + payload.length);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(b.buffer).setUint32(4, 12 + payload.length, true);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  for (let i = 0; i < 4; i++) b[12 + i] = chunk.charCodeAt(i);
  new DataView(b.buffer).setUint32(16, payload.length, true);
  b.set(payload, 20);
  return b;
}
const webpLossy = (w: number, h: number) => riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, w & 0xff, (w >> 8) & 0x3f, h & 0xff, (h >> 8) & 0x3f, 0, 0]);
function webpLossless(w: number, h: number) {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return riff("VP8L", [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0, 0, 0]);
}
function webpExtended(w: number, h: number) {
  const a = w - 1;
  const b = h - 1;
  return riff("VP8X", [0x10, 0, 0, 0, a & 0xff, (a >> 8) & 0xff, (a >> 16) & 0xff, b & 0xff, (b >> 8) & 0xff, (b >> 16) & 0xff]);
}
const text = (s: string) => new TextEncoder().encode(s);

// ── Tests ────────────────────────────────────────────────────────────────

describe("file signature — genuine PNG, JPEG and WebP only", () => {
  it("identifies the accepted formats from their bytes", () => {
    expect(sniffImageType(realPng(4, 4))).toBe("image/png");
    expect(sniffImageType(jpegBytes(10, 10))).toBe("image/jpeg");
    expect(sniffImageType(webpLossy(10, 10))).toBe("image/webp");
  });

  it("recognises and rejects SVG, GIF and HEIC", () => {
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBe("svg");
    expect(sniffImageType(text('﻿  \n<?xml version="1.0"?><svg/>'))).toBe("svg");
    expect(sniffImageType(text("GIF89a......"))).toBe("gif");
    expect(sniffImageType(new Uint8Array([0, 0, 0, 0x18, ...text("ftypheic"), 0, 0, 0, 0]))).toBe("heic");
    expect(checkCrestBytes(100, text("<svg/>"))).toEqual({ ok: false, message: CREST_MESSAGES.svg });
    expect(checkCrestBytes(100, text("GIF89a"))).toEqual({ ok: false, message: CREST_MESSAGES.gif });
    expect(checkCrestBytes(100, new Uint8Array([0, 0, 0, 0x18, ...text("ftypheic")]))).toEqual({ ok: false, message: CREST_MESSAGES.heic });
  });

  it("rejects unknown and random bytes", () => {
    expect(sniffImageType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
    expect(checkCrestBytes(12, new Uint8Array(12))).toEqual({ ok: false, message: CREST_MESSAGES.unsupported });
    expect(checkCrestBytes(5, text("%PDF-"))).toEqual({ ok: false, message: CREST_MESSAGES.unsupported });
  });

  it("trusts the bytes, not the filename or the browser's MIME type", async () => {
    const svgNamedPng = new File(["<svg onload='x()'/>"], "crest.png", { type: "image/png" });
    expect(await checkCrestFile(svgNamedPng)).toEqual({ ok: false, message: CREST_MESSAGES.svg });
    const pngNoType = new File([realPng(64, 80) as BlobPart], "../../etc/passwd", { type: "" });
    expect(await checkCrestFile(pngNoType)).toEqual({ ok: true, type: "image/png", width: 64, height: 80 });
  });
});

describe("dimensions are read from the header before decoding", () => {
  it("PNG (a complete real file)", () => {
    expect(readImageDimensions(realPng(300, 420), "image/png")).toEqual({ width: 300, height: 420 });
  });

  it("JPEG baseline and progressive, past a large EXIF segment", () => {
    expect(readImageDimensions(jpegBytes(4000, 3000), "image/jpeg")).toEqual({ width: 4000, height: 3000 });
    expect(readImageDimensions(jpegBytes(640, 480, { sof: 0xc2, exifBytes: 60000 }), "image/jpeg")).toEqual({ width: 640, height: 480 });
  });

  it("WebP lossy, lossless and extended", () => {
    expect(readImageDimensions(webpLossy(500, 600), "image/webp")).toEqual({ width: 500, height: 600 });
    expect(readImageDimensions(webpLossless(1024, 768), "image/webp")).toEqual({ width: 1024, height: 768 });
    expect(readImageDimensions(webpExtended(9000, 7000), "image/webp")).toEqual({ width: 9000, height: 7000 });
  });

  it("malformed or truncated headers are rejected", () => {
    expect(checkCrestBytes(100, jpegBytes(10, 10, { noFrame: true }))).toEqual({ ok: false, message: CREST_MESSAGES.badHeader });
    expect(checkCrestBytes(100, jpegBytes(10, 10).subarray(0, 25))).toEqual({ ok: false, message: CREST_MESSAGES.badHeader });
    expect(checkCrestBytes(100, realPng(4, 4).subarray(0, 14))).toEqual({ ok: false, message: CREST_MESSAGES.badHeader });
    const notIhdr = realPng(4, 4);
    notIhdr[12] = 0x58;
    expect(checkCrestBytes(100, notIhdr)).toEqual({ ok: false, message: CREST_MESSAGES.badHeader });
    expect(checkCrestBytes(100, pngHeaderBytes(0, 10))).toEqual({ ok: false, message: CREST_MESSAGES.badHeader });
    const badWebp = webpLossy(10, 10);
    badWebp[23] = 0;
    expect(checkCrestBytes(100, badWebp)).toEqual({ ok: false, message: CREST_MESSAGES.badHeader });
  });

  it("oversized images are rejected without decoding (decompression-bomb guard)", () => {
    // A tiny file that declares a 30000 × 30000 image.
    expect(checkCrestBytes(33, pngHeaderBytes(30000, 30000))).toEqual({ ok: false, message: CREST_MESSAGES.tooManyPixels });
    expect(checkCrestBytes(100, pngHeaderBytes(12001, 10))).toEqual({ ok: false, message: CREST_MESSAGES.tooManyPixels });
    expect(checkCrestBytes(100, pngHeaderBytes(8000, 7000))).toEqual({ ok: false, message: CREST_MESSAGES.tooManyPixels }); // 56 MP
    // A default 12 MP and a 48 MP phone photo are accepted.
    expect(checkCrestBytes(100, jpegBytes(4000, 3000))).toMatchObject({ ok: true });
    expect(checkCrestBytes(100, jpegBytes(8000, 6000))).toMatchObject({ ok: true });
  });

  it("empty and over-40 MB files are rejected", async () => {
    expect(await checkCrestFile(new File([], "x.png"))).toEqual({ ok: false, message: CREST_MESSAGES.empty });
    expect(checkCrestBytes(41 * 1024 * 1024, pngHeaderBytes(10, 10))).toEqual({ ok: false, message: CREST_MESSAGES.tooLarge });
  });

  it("the stored crest size limit is 512 px", () => {
    expect(CREST_MAX_EDGE).toBe(512);
  });
});

describe("truncated or damaged files are rejected (browsers decode them leniently)", () => {
  const file = (...parts: Uint8Array[]) => new File(parts as BlobPart[], "f");

  it("complete PNG, JPEG and WebP files pass", async () => {
    expect(await checkCrestFile(file(realPng(20, 30)))).toMatchObject({ ok: true });
    expect(await checkCrestFile(file(jpegBytes(20, 30)))).toMatchObject({ ok: true });
    expect(await checkCrestFile(file(webpLossy(20, 30)))).toMatchObject({ ok: true });
  });

  it("a truncated PNG (no IEND) is rejected", async () => {
    const png = realPng(20, 30);
    expect(await checkCrestFile(file(png.subarray(0, png.length - 12)))).toEqual({ ok: false, message: CREST_MESSAGES.incomplete });
  });

  it("a JPEG with no end-of-image marker (truncated, or a valid header on a garbage body) is rejected", async () => {
    const jpg = jpegBytes(20, 30);
    expect(await checkCrestFile(file(jpg.subarray(0, jpg.length - 2)))).toEqual({ ok: false, message: CREST_MESSAGES.incomplete });
    const garbage = new Uint8Array(5000).fill(0x13);
    // Complete headers up to the scan, then garbage instead of image data and no end marker.
    expect(await checkCrestFile(file(jpg.subarray(0, jpg.length - 4), garbage))).toEqual({ ok: false, message: CREST_MESSAGES.incomplete });
  });

  it("a JPEG with data appended after its end marker (e.g. Samsung Motion Photo) is accepted", async () => {
    const appended = new Uint8Array(200 * 1024).fill(0x22); // end marker is far outside the last 64 KB
    expect(await isStructurallyComplete(file(jpegBytes(20, 30), appended), "image/jpeg")).toBe(true);
    expect(await checkCrestFile(file(jpegBytes(20, 30), appended))).toMatchObject({ ok: true });
  });

  it("a WebP whose declared size exceeds the file is rejected", async () => {
    const webp = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 20, 0, 30, 0, ...new Array(200).fill(7)]);
    expect(await checkCrestFile(file(webp))).toMatchObject({ ok: true });
    expect(await checkCrestFile(file(webp.subarray(0, webp.length - 50)))).toEqual({ ok: false, message: CREST_MESSAGES.incomplete });
  });
});

describe("background removal", () => {
  it("is offered for a plain backdrop and keeps enclosed white areas and detached parts", () => {
    const img = plainBackgroundCrest();
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered).toBe(true);
    if (!offer.offered) return;
    const at = (x: number, y: number) => offer.mask[y * img.width + x];
    expect(at(0, 0)).toBe(0); // backdrop removed
    expect(at(59, 59)).toBe(0);
    expect(at(30, 22)).toBe(1); // enclosed white centre of the shield kept
    expect(at(20, 10)).toBe(1); // shield
    expect(at(30, 46)).toBe(1); // detached motto bar kept
  });

  it("does not use the kit's largest-shape rule, which would drop detached crest parts", () => {
    const img = plainBackgroundCrest();
    const kit = assessRemoval(img);
    expect(kit.mask[46 * img.width + 30]).toBe(0); // kit removal loses the motto bar
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered && offer.mask[46 * img.width + 30]).toBe(1);
  });

  it("is not offered for an already-transparent crest", () => {
    expect(assessCrestBackgroundRemoval(transparentCrest())).toEqual({ offered: false, reason: "already-transparent" });
  });

  it("is not offered for a busy background", () => {
    let seed = 7;
    const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    const img = makeImage(40, 40, WHITE, () => [noise(), noise(), noise(), 255]);
    expect(assessCrestBackgroundRemoval(img)).toEqual({ offered: false, reason: "busy-background" });
  });

  it("is not offered when there is almost no backdrop", () => {
    const img = makeImage(200, 200, RED, (x, y) => (x === 0 || y === 0 || x === 199 || y === 199 ? WHITE : null));
    expect(assessCrestBackgroundRemoval(img)).toEqual({ offered: false, reason: "nothing-found" });
  });

  it("is not offered when the artwork is the backdrop's colour", () => {
    const img = makeImage(60, 60, WHITE, (x, y) => (x > 2 && y > 2 && x < 57 && y < 57 ? [245, 245, 245, 255] : null));
    expect(assessCrestBackgroundRemoval(img)).toEqual({ offered: false, reason: "similar-colours" });
  });

  it("declining keeps the original artwork exactly (alpha untouched)", () => {
    const img = plainBackgroundCrest();
    const alpha = crestAlpha(img, null);
    for (let p = 0; p < alpha.length; p++) expect(alpha[p]).toBe(img.data[p * 4 + 3]);
    // An opaque image is not trimmed at all.
    expect(crestVisibleBounds(img, alpha)).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });

  it("accepting removes only the backdrop", () => {
    const img = plainBackgroundCrest();
    const offer = assessCrestBackgroundRemoval(img);
    if (!offer.offered) throw new Error("expected offer");
    const alpha = crestAlpha(img, offer.mask);
    expect(alpha[0]).toBe(0);
    expect(alpha[22 * 60 + 30]).toBe(255); // enclosed white kept fully opaque
    // Trimmed to the artwork's natural extent (shield top to motto bottom), not squared or cropped into it.
    expect(crestVisibleBounds(img, alpha)).toEqual({ x: 15, y: 8, width: 30, height: 42 });
  });
});

describe("visible bounds and contrast metadata", () => {
  it("trims only fully transparent margins — a faint pixel still counts", () => {
    const img = makeImage(20, 20, CLEAR, (x, y) => (x === 3 && y === 4 ? [255, 255, 255, 1] : x >= 8 && x < 12 && y >= 8 && y < 16 ? RED : null));
    const alpha = crestAlpha(img, null);
    expect(crestVisibleBounds(img, alpha)).toEqual({ x: 3, y: 4, width: 9, height: 12 });
    expect(crestVisibleBounds(makeImage(5, 5, CLEAR), crestAlpha(makeImage(5, 5, CLEAR), null))).toBeNull();
  });

  it("flags dark artwork that would vanish on the dark analysis background", () => {
    const dark = makeImage(10, 10, CLEAR, (x) => (x < 5 ? [10, 15, 30, 255] : null));
    const light = makeImage(10, 10, CLEAR, (x) => (x < 5 ? WHITE : null));
    expect(crestNeedsBacking(dark, crestAlpha(dark, null))).toBe(true);
    expect(crestNeedsBacking(light, crestAlpha(light, null))).toBe(false);
    expect(crestNeedsBacking(makeImage(4, 4, CLEAR), crestAlpha(makeImage(4, 4, CLEAR), null))).toBe(false);
  });
});
