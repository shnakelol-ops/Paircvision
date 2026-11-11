// Background removal repair (Club Crest V1): the real Ballylanders crest and
// other crest shapes. Pure pixel tests — no canvas.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EDGE_SPECK_MAX_SHARE,
  assessCrestBackgroundRemoval,
  assessPlainBackdrop,
  crestAlpha,
  crestVisibleBounds,
  removeEdgeSpecks,
} from "./crest-image";
import { estimateBackdrop, type PixelImage } from "../../internal-team-sheet/kit-image-processing";
import { WHITE, makeImage, plainBackgroundCrest } from "./crestTestFixtures";

// ─── The real crest ──────────────────────────────────────────────────────────
// The coach's own Ballylanders crest (a Samsung screenshot, 3392 × 3504 JPEG),
// decoded in Chromium exactly as the app decodes uploads (max edge 512 px) and
// stored as gzipped RGBA: an off-white, shaded photo backdrop, the circle
// touching the left and right edges, and a dark screenshot corner artefact.
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "ballylanders-crest-496x512.rgba.gz");
function ballylanders(): PixelImage {
  const data = new Uint8ClampedArray(gunzipSync(readFileSync(FIXTURE)));
  expect(data.length).toBe(496 * 512 * 4);
  return { data, width: 496, height: 512 };
}

const rgb = (img: PixelImage, p: number) => [img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]] as const;
const isGreen = ([r, g, b]: readonly number[]) => g > r + 25 && g > b + 10;
const isGold = ([r, g, b]: readonly number[]) => r > 150 && g > 120 && b < 120;

/** Independent geometry: the badge's disc, fitted from its green and gold pixels. */
function disc(img: PixelImage) {
  let x0 = img.width, x1 = -1, y0 = img.height, y1 = -1;
  for (let p = 0; p < img.width * img.height; p++) {
    const c = rgb(img, p);
    if (!isGreen(c) && !isGold(c)) continue;
    const x = p % img.width, y = (p - x) / img.width;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2 };
}

/** Independent 8-connected component count of visible pixels. */
function visibleRegions(alpha: Uint8ClampedArray, w: number, h: number): number[] {
  const seen = new Uint8Array(w * h);
  const sizes: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!alpha[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let size = 0;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (alpha[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

describe("the real Ballylanders crest", () => {
  const img = ballylanders();
  const offer = assessCrestBackgroundRemoval(img);
  const alpha = offer.offered ? crestAlpha(img, offer.mask) : null;
  const { cx, cy, r } = disc(img);
  const dist = (p: number) => Math.hypot((p % img.width) - cx, Math.floor(p / img.width) - cy);

  it("root cause: the old rule judged the whole edge, where the badge itself touches the sides", () => {
    // The old gate refused any backdrop whose median edge variation exceeded 12.
    expect(estimateBackdrop(img).spread).toBeGreaterThan(12);
    // The badge touches the left and right edges of the image.
    expect(cx - r).toBeLessThanOrEqual(1);
    expect(cx + r).toBeGreaterThanOrEqual(img.width - 2);
    // Judged only on the edge pixels that are backdrop, it is plain.
    const plain = assessPlainBackdrop(img);
    expect(plain.plain).toBe(true);
    expect(plain.share).toBeGreaterThan(0.8);
    expect(plain.spread).toBeLessThanOrEqual(12);
  });

  it("background removal is offered, at tolerance 32, and the corner artefact is cleaned up", () => {
    expect(offer.offered).toBe(true);
    if (!offer.offered) return;
    expect(offer.tolerance).toBe(32);
    expect(offer.specksRemoved).toBeGreaterThan(0);
    expect(offer.specksRemoved).toBeLessThanOrEqual(img.width * img.height * EDGE_SPECK_MAX_SHARE);
  });

  it("all four corners — the whole exterior — are transparent", () => {
    const a = alpha!;
    const w = img.width, h = img.height;
    for (const [x0, y0] of [[0, 0], [w - 40, 0], [0, h - 40], [w - 40, h - 40]]) {
      for (let y = y0; y < y0 + 40; y++) for (let x = x0; x < x0 + 40; x++) {
        if (dist(y * w + x) > r + 3) expect(a[y * w + x], `corner pixel ${x},${y}`).toBe(0);
      }
    }
    // Anything still visible beyond the fitted disc is the badge's own pale-cream outer rim
    // (just outside the strict gold/green colour fit) — close to it, and never backdrop-coloured.
    const [br, bg, bb] = estimateBackdrop(img).color;
    let rim = 0;
    for (let p = 0; p < a.length; p++) {
      if (!a[p] || dist(p) <= r + 3) continue;
      rim++;
      expect(dist(p)).toBeLessThan(r + 10); // measured max 9.5 px: the badge's shadowed rim at the right edge
      const [pr, pg, pb] = rgb(img, p);
      expect(Math.max(Math.abs(pr - br), Math.abs(pg - bg), Math.abs(pb - bb)), `backdrop-coloured pixel left at ${p % img.width},${Math.floor(p / img.width)}`).toBeGreaterThan(24);
    }
    expect(rim).toBeLessThan(2 * Math.PI * r * 2); // at most a thin rim
  });

  it("no specks remain: the crest is one single visible shape", () => {
    expect(visibleRegions(alpha!, img.width, img.height)).toHaveLength(1);
  });

  it("the circular crest is untouched: every pixel inside the disc, and every gold and green pixel, is fully opaque and unchanged", () => {
    const a = alpha!;
    let inside = 0, gold = 0, green = 0;
    for (let p = 0; p < a.length; p++) {
      const c = rgb(img, p);
      if (dist(p) <= r - 3) { inside++; expect(a[p]).toBe(255); }
      if (dist(p) <= r - 1 && isGold(c)) { gold++; expect(a[p]).toBe(255); }
      if (isGreen(c)) { green++; expect(a[p]).toBe(255); }
    }
    expect(inside).toBeGreaterThan(180_000);
    expect(gold).toBeGreaterThan(20_000); // gold border, C.L.C.G, Báile an Londraigh, shamrocks
    expect(green).toBeGreaterThan(100_000);
  });

  it("the gold border is complete all the way round", () => {
    const a = alpha!;
    for (let deg = 0; deg < 360; deg += 3) {
      // Walk inward along each radius: the first gold pixel within the outer 14 px must be opaque.
      let found = false;
      for (let d = r; d > r - 14 && !found; d -= 0.5) {
        const x = Math.round(cx + d * Math.cos((deg * Math.PI) / 180));
        const y = Math.round(cy + d * Math.sin((deg * Math.PI) / 180));
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const p = y * img.width + x;
        if (isGold(rgb(img, p))) { found = true; expect(a[p], `ring at ${deg}°`).toBe(255); }
      }
      expect(found, `gold ring found at ${deg}°`).toBe(true);
    }
  });

  it("trims to the badge's natural circular extent", () => {
    const b = crestVisibleBounds(img, alpha!)!;
    expect(Math.abs(b.width - 2 * r)).toBeLessThanOrEqual(6);
    expect(Math.abs(b.height - 2 * r)).toBeLessThanOrEqual(10);
  });

  it("declining removal keeps the original artwork exactly", () => {
    const original = crestAlpha(img, null);
    expect(original.every((v) => v === 255)).toBe(true);
  });
});

// ─── Other crest shapes ───────────────────────────────────────────────────────

/** Off-white, shaded and noisy like a phone photo: 238 → 222 left to right, ±5 noise. */
function photoBackdrop(seed = 3) {
  let s = seed;
  const noise = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 11) - 5;
  return (x: number, w: number): [number, number, number, number] => {
    const v = Math.round(238 - (16 * x) / w) + noise();
    return [v, v - 1, v - 9, 255];
  };
}
const NAVY: [number, number, number, number] = [20, 40, 120, 255];
const GOLD: [number, number, number, number] = [214, 170, 40, 255];

/** 200 × 220 shield touching left and right edges, enclosed white panel, detached motto ribbon. */
function shieldOnPhoto(extra?: (x: number, y: number) => [number, number, number, number] | null) {
  const bg = photoBackdrop();
  return makeImage(200, 220, WHITE, (x, y) => {
    const e = extra?.(x, y);
    if (e) return e;
    const inShield = y >= 20 && y < 160 && (y < 110 || Math.abs(x - 100) < (160 - y) * 2);
    if (inShield) {
      if (x >= 70 && x < 130 && y >= 50 && y < 100) return WHITE; // enclosed white panel
      return x < 4 || x > 195 ? GOLD : NAVY;
    }
    if (x >= 50 && x < 150 && y >= 172 && y < 190) return GOLD; // detached motto ribbon
    return bg(x, 200);
  });
}

describe("other crest shapes keep working", () => {
  it("shaded photo backdrop, shield touching the sides: offered; enclosed white and the detached ribbon are kept", () => {
    const img = shieldOnPhoto();
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered).toBe(true);
    if (!offer.offered) return;
    const at = (x: number, y: number) => offer.mask[y * img.width + x];
    expect([at(0, 0), at(199, 0), at(0, 219), at(199, 219)]).toEqual([0, 0, 0, 0]);
    expect(at(100, 75)).toBe(1); // enclosed white panel
    expect(at(100, 180)).toBe(1); // detached ribbon
    expect(at(100, 30)).toBe(1);
  });

  it("the synthetic shield with a motto bar (plain white backdrop) behaves as before", () => {
    const img = plainBackgroundCrest();
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered).toBe(true);
    if (!offer.offered) return;
    expect(offer.tolerance).toBe(24);
    expect(offer.specksRemoved).toBe(0);
    expect(offer.mask[46 * 60 + 30]).toBe(1);
  });

  it("a detached ribbon that touches the image edge is kept (too large to be an artefact)", () => {
    const img = shieldOnPhoto((x, y) => (x >= 60 && x < 140 && y >= 205 ? GOLD : null));
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered && offer.mask[(219) * 200 + 100]).toBe(1);
  });

  it("a small detail touching the edge right beside the crest is kept (not separated from it)", () => {
    // 3 × 3 gold dot on the left edge, 3 px below where the shield's straight side meets the edge (y < 110).
    const img = shieldOnPhoto((x, y) => (x < 3 && y >= 112 && y < 115 ? GOLD : null));
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered).toBe(true);
    expect(offer.offered && offer.mask[113 * 200 + 1]).toBe(1);
  });

  it("a small detail inside the image (a full stop, a star) is kept however small", () => {
    const img = shieldOnPhoto((x, y) => (x >= 20 && x < 22 && y >= 195 && y < 197 ? NAVY : null));
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered && offer.mask[195 * 200 + 20]).toBe(1);
  });

  it("a tiny artefact on the edge, far from the crest, is removed", () => {
    const img = shieldOnPhoto((x, y) => (x < 5 && y >= 214 ? [60, 60, 60, 255] : null));
    const offer = assessCrestBackgroundRemoval(img);
    expect(offer.offered).toBe(true);
    if (!offer.offered) return;
    expect(offer.specksRemoved).toBe(30);
    expect(offer.mask[218 * 200 + 2]).toBe(0);
  });

  it("removeEdgeSpecks never removes the main shape, and leaves a single region untouched", () => {
    const mask = new Uint8Array(10 * 10).fill(1);
    expect(removeEdgeSpecks(mask, 10, 10)).toEqual({ mask, removed: 0 });
  });
});

describe("busy and unsafe backgrounds are still refused", () => {
  it("random noise", () => {
    let seed = 7;
    const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    const img = makeImage(40, 40, WHITE, () => [noise(), noise(), noise(), 255]);
    expect(assessCrestBackgroundRemoval(img)).toEqual({ offered: false, reason: "busy-background" });
  });

  it("a photographic background with a strong gradient (e.g. sky to pitch)", () => {
    const img = makeImage(120, 120, WHITE, (x, y) => {
      if (Math.hypot(x - 60, y - 60) < 35) return NAVY;
      const v = Math.round(250 - (200 * y) / 119);
      return [v, Math.min(255, v + 10), Math.max(0, v - 30), 255];
    });
    expect(assessCrestBackgroundRemoval(img)).toEqual({ offered: false, reason: "busy-background" });
  });

  it("a crest whose colour fades into the backdrop (removal would keep growing): refused, never cut into", () => {
    const img = makeImage(120, 120, WHITE, (x, y) => {
      const d = Math.hypot(x - 60, y - 60);
      if (d >= 50) return null;
      const v = Math.round(255 - (50 - d) * 4); // 255 at the rim → 55 at the centre: no edge to stop at
      return [v, v, v, 255];
    });
    expect(assessCrestBackgroundRemoval(img)).toEqual({ offered: false, reason: "similar-colours" });
  });

  it("cream artwork on white, and already-transparent crests, as before", () => {
    const cream = makeImage(60, 60, WHITE, (x, y) => (x > 2 && y > 2 && x < 57 && y < 57 ? [245, 245, 245, 255] : null));
    expect(assessCrestBackgroundRemoval(cream)).toEqual({ offered: false, reason: "similar-colours" });
    const cutOut = makeImage(20, 20, [0, 0, 0, 0], (x) => (x > 5 && x < 15 ? NAVY : null));
    expect(assessCrestBackgroundRemoval(cutOut)).toEqual({ offered: false, reason: "already-transparent" });
  });
});
