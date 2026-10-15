import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOLERANCE,
  KIT_FRAME,
  MANUAL_ERASE,
  MANUAL_KEEP,
  alphaBounds,
  assessRemoval,
  buildAlpha,
  composeRgba,
  computeAutoMask,
  estimateBackdrop,
  fitIntoFrame,
  fitWithin,
  hasTransparency,
  paintBrush,
  type PixelImage,
} from "./kit-image-processing";

// ── helpers ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

function solid(width: number, height: number, color: RGB, alpha = 255): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([...color, alpha], p * 4);
  return { data, width, height };
}

function fillRect(img: PixelImage, x0: number, y0: number, w: number, h: number, color: (x: number, y: number) => RGB) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data.set([...color(x, y), 255], (y * img.width + x) * 4);
}

const px = (img: PixelImage, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const at = (mask: ArrayLike<number>, img: PixelImage, x: number, y: number) => mask[y * img.width + x];

/** A "jersey" block on a backdrop, with a white crest and a white collar fully enclosed by it. */
function jerseyWithWhiteDetails(backdrop: RGB, body: RGB): PixelImage {
  const img = solid(120, 150, backdrop);
  fillRect(img, 20, 20, 80, 110, () => body);
  fillRect(img, 70, 40, 12, 12, () => [255, 255, 255]); // crest
  fillRect(img, 50, 22, 20, 6, () => [250, 250, 250]); // collar interior
  return img;
}

/** Light jersey with soft shading (225–250) — like a real white kit photo. */
function shadedWhiteJersey(backdrop: RGB, outline?: RGB): PixelImage {
  const img = solid(120, 150, backdrop);
  fillRect(img, 20, 20, 80, 110, (x) => {
    const v = Math.round(250 - Math.abs(x - 60) * 0.65); // 250 centre → ~224 edges
    return [v, v, v];
  });
  if (outline) {
    fillRect(img, 19, 19, 82, 1, () => outline);
    fillRect(img, 19, 130, 82, 1, () => outline);
    fillRect(img, 19, 19, 1, 112, () => outline);
    fillRect(img, 100, 19, 1, 112, () => outline);
  }
  return img;
}

function loadFixture(name: string): PixelImage {
  const raw = gunzipSync(readFileSync(new URL(`./__fixtures__/${name}.rgb.gz`, import.meta.url)));
  const width = raw.readUInt32LE(0);
  const height = raw.readUInt32LE(4);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = raw[8 + p * 3];
    data[p * 4 + 1] = raw[8 + p * 3 + 1];
    data[p * 4 + 2] = raw[8 + p * 3 + 2];
    data[p * 4 + 3] = 255;
  }
  return { data, width, height };
}

const noManual = (img: PixelImage) => new Uint8Array(img.width * img.height);

// ── tests ──────────────────────────────────────────────────────────────

describe("fitWithin", () => {
  it("caps the long edge at 1024 and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(8064, 6048)).toEqual({ width: 1024, height: 768 }); // 48MP
  });
  it("never upscales a small image", () => {
    expect(fitWithin(300, 369)).toEqual({ width: 300, height: 369 });
  });
});

describe("hasTransparency", () => {
  it("is false for an opaque photo", () => {
    expect(hasTransparency(solid(40, 40, [255, 255, 255]))).toBe(false);
  });
  it("is true for an already cut-out image", () => {
    const img = solid(40, 40, [0, 0, 0], 0);
    fillRect(img, 10, 10, 20, 20, () => [200, 30, 30]);
    expect(hasTransparency(img)).toBe(true);
  });
});

describe("automatic background removal", () => {
  it("removes a plain backdrop and keeps white crest and collar details enclosed by the jersey", () => {
    const img = jerseyWithWhiteDetails([255, 255, 255], [40, 140, 70]);
    const result = assessRemoval(img);
    expect(result.confident).toBe(true);
    expect(at(result.mask, img, 2, 2)).toBe(0); // backdrop gone
    expect(at(result.mask, img, 60, 100)).toBe(1); // jersey kept
    expect(at(result.mask, img, 75, 45)).toBe(1); // white crest kept
    expect(at(result.mask, img, 60, 24)).toBe(1); // white collar interior kept
  });

  it("keeps a white jersey with a visible outline on a white backdrop — the body is never removed", () => {
    const img = shadedWhiteJersey([255, 255, 255], [150, 150, 150]);
    const result = assessRemoval(img);
    expect(result.confident).toBe(true);
    for (const [x, y] of [[60, 75], [22, 25], [97, 128], [40, 60]]) expect(at(result.mask, img, x, y)).toBe(1);
    expect(at(result.mask, img, 5, 5)).toBe(0);
  });

  it("refuses to trust removal for a shaded white jersey on a light grey backdrop", () => {
    const img = shadedWhiteJersey([233, 233, 233]);
    const result = assessRemoval(img);
    expect(result.confident).toBe(false);
    if (!result.confident) expect(result.reason).toBe("similar-colours");
  });

  it("refuses to trust removal on a busy backdrop", () => {
    const img = solid(100, 100, [0, 0, 0]);
    fillRect(img, 0, 0, 100, 100, (x, y) => [(x * 37 + y * 91) % 256, (x * 53) % 256, (y * 29) % 256]);
    fillRect(img, 30, 30, 40, 40, () => [20, 20, 200]);
    const result = assessRemoval(img);
    expect(result.confident).toBe(false);
    if (!result.confident) expect(result.reason).toBe("busy-background");
  });

  it("does not trust removal when the jersey fills the whole photo edge to edge", () => {
    expect(assessRemoval(solid(60, 60, [30, 120, 60])).confident).toBe(false);
  });

  it("does not trust removal when only a thin edge strip differs from the jersey", () => {
    const img = solid(60, 60, [30, 120, 60]);
    fillRect(img, 0, 0, 60, 1, () => [255, 255, 255]); // a thin white strip along the top only
    const result = assessRemoval(img);
    expect(result.confident).toBe(false);
  });

  it("drops stray specks that are not attached to the jersey", () => {
    const img = jerseyWithWhiteDetails([255, 255, 255], [40, 140, 70]);
    fillRect(img, 2, 70, 4, 4, () => [10, 10, 10]); // e.g. a carousel arrow at the photo edge
    expect(at(computeAutoMask(img, DEFAULT_TOLERANCE), img, 3, 71)).toBe(0);
  });

  it("estimates the backdrop colour from the edges", () => {
    expect(estimateBackdrop(jerseyWithWhiteDetails([233, 233, 233], [40, 140, 70])).color).toEqual([233, 233, 233]);
  });
});

describe("real Ballylanders photos (256px fixtures of the club's product shots)", () => {
  it("green/yellow on white: confident, backdrop removed, jersey core and white crest kept", () => {
    const img = loadFixture("jersey-green-on-white");
    const result = assessRemoval(img);
    expect(result.confident).toBe(true);
    expect(at(result.mask, img, 1, 1)).toBe(0);
    let coreKept = 0;
    let core = 0;
    for (let y = Math.floor(img.height * 0.3); y < img.height * 0.8; y++) {
      for (let x = Math.floor(img.width * 0.3); x < img.width * 0.7; x++, core++) coreKept += at(result.mask, img, x, y);
    }
    expect(coreKept / core).toBe(1);
  });

  it("white/yellow on light grey: NOT trusted, so no part of the white jersey is removed automatically", () => {
    const img = loadFixture("jersey-white-on-grey");
    expect(assessRemoval(img).confident).toBe(false);
  });
});

describe("manual correction", () => {
  it("erase and keep brushes override the automatic mask", () => {
    const img = jerseyWithWhiteDetails([255, 255, 255], [40, 140, 70]);
    const auto = computeAutoMask(img, DEFAULT_TOLERANCE);
    const manual = noManual(img);
    paintBrush(manual, img.width, img.height, 60, 100, 3, MANUAL_ERASE); // wrongly kept → erase
    paintBrush(manual, img.width, img.height, 5, 5, 3, MANUAL_KEEP); // wrongly removed → restore
    const alpha = buildAlpha(img, auto, manual);
    expect(at(alpha, img, 60, 100)).toBe(0);
    expect(at(alpha, img, 5, 5)).toBeGreaterThan(0);
    expect(at(alpha, img, 40, 60)).toBe(255);
  });

  it("with removal off, everything is kept except what is erased by hand", () => {
    const img = shadedWhiteJersey([233, 233, 233]);
    const manual = noManual(img);
    paintBrush(manual, img.width, img.height, 5, 5, 4, MANUAL_ERASE);
    const alpha = buildAlpha(img, null, manual);
    expect(at(alpha, img, 5, 5)).toBe(0);
    expect(at(alpha, img, 60, 75)).toBe(255);
    expect(at(alpha, img, 110, 140)).toBe(255);
  });
});

describe("composition never alters jersey colours", () => {
  it("copies RGB byte-for-byte and only changes alpha", () => {
    const img = loadFixture("jersey-green-on-white");
    const alpha = buildAlpha(img, assessRemoval(img).mask, noManual(img));
    const out = composeRgba(img, alpha);
    let changedRgb = 0;
    for (let i = 0; i < out.length; i++) if (i % 4 !== 3 && out[i] !== img.data[i]) changedRgb++;
    expect(changedRgb).toBe(0);
    expect(alpha.some((a) => a === 0)).toBe(true); // and something really was removed
  });

  it("never makes a pixel more opaque than the source", () => {
    const img = solid(20, 20, [200, 0, 0], 100);
    const alpha = buildAlpha(img, null, noManual(img));
    expect(Math.max(...alpha)).toBe(100);
    expect(px(img, 0, 0)).toEqual([200, 0, 0, 100]);
  });
});

describe("trim and frame", () => {
  it("finds the visible jersey bounds", () => {
    const img = jerseyWithWhiteDetails([255, 255, 255], [40, 140, 70]);
    const alpha = buildAlpha(img, computeAutoMask(img, DEFAULT_TOLERANCE), noManual(img));
    expect(alphaBounds(alpha, img.width, img.height)).toEqual({ x: 20, y: 20, width: 80, height: 110 });
    expect(alphaBounds(new Uint8ClampedArray(16), 4, 4)).toBeNull();
  });

  it("contains and centres the jersey in the 600×738 frame", () => {
    const fit = fitIntoFrame({ x: 0, y: 0, width: 800, height: 1000 });
    expect(fit.width).toBeLessThanOrEqual(KIT_FRAME.width);
    expect(fit.height).toBeLessThanOrEqual(KIT_FRAME.height);
    expect(Math.max(fit.width / KIT_FRAME.width, fit.height / KIT_FRAME.height)).toBeCloseTo(1, 2);
    expect(fit.x).toBe(Math.round((KIT_FRAME.width - fit.width) / 2));
  });
});
