// Pure, browser-free image processing for the Team Sheet Kit Builder.
// Everything works on raw RGBA pixels so it can be unit-tested without a
// canvas. Golden rule: processing only ever changes ALPHA. Jersey colours,
// crests and sponsor logos are copied byte-for-byte; a pixel is either kept
// exactly as photographed or made transparent.

export interface PixelImage {
  data: Uint8ClampedArray; // RGBA, row-major
  width: number;
  height: number;
}

/** Longest edge the decoder scales photos down to before any processing. */
export const MAX_WORKING_EDGE = 1024;
/** Saved kit frame: 2x the 300×369 frame of the built-in jersey assets. */
export const KIT_FRAME = { width: 600, height: 738 } as const;
export const DEFAULT_TOLERANCE = 24;
export const MIN_TOLERANCE = 4;
export const MAX_TOLERANCE = 64;

export function fitWithin(width: number, height: number, maxEdge = MAX_WORKING_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// ── Transparency ─────────────────────────────────────────────────────────

/** True when the image is already cut out (a transparent PNG/WebP). */
export function hasTransparency(img: PixelImage): boolean {
  const { data, width, height } = img;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  if (transparent === 0) return false;
  if (transparent / (width * height) > 0.01) return true;
  // A few transparent pixels can still mean "cut out" if they ring the edge.
  let edge = 0;
  let edgeTransparent = 0;
  forEachBorderPixel(width, height, (p) => {
    edge++;
    if (data[p * 4 + 3] < 250) edgeTransparent++;
  });
  return edgeTransparent / edge > 0.2;
}

// ── Backdrop estimate ────────────────────────────────────────────────────

export interface Backdrop {
  color: [number, number, number];
  /** Median distance of border pixels from the backdrop colour (0 = flat). */
  spread: number;
}

function forEachBorderPixel(width: number, height: number, fn: (p: number) => void) {
  for (let x = 0; x < width; x++) {
    fn(x);
    if (height > 1) fn((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    fn(y * width);
    if (width > 1) fn(y * width + width - 1);
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function estimateBackdrop(img: PixelImage): Backdrop {
  const { data, width, height } = img;
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  forEachBorderPixel(width, height, (p) => {
    if (data[p * 4 + 3] < 128) return; // already-transparent border isn't "backdrop colour"
    r.push(data[p * 4]);
    g.push(data[p * 4 + 1]);
    b.push(data[p * 4 + 2]);
  });
  const color: [number, number, number] = [median(r), median(g), median(b)];
  const dists = r.map((_, i) => Math.max(Math.abs(r[i] - color[0]), Math.abs(g[i] - color[1]), Math.abs(b[i] - color[2])));
  return { color, spread: median(dists) };
}

// ── Automatic background mask ────────────────────────────────────────────

/**
 * 1 = keep, 0 = background. The background is ONLY what can be reached from
 * the photo's edge through pixels within `tolerance` of the backdrop colour,
 * so white areas enclosed by the jersey (crest details, collar interior,
 * sponsor lettering) can never be removed, however close to the backdrop
 * they are. Stray specks not attached to the jersey are dropped.
 */
export function computeAutoMask(
  img: PixelImage,
  tolerance: number,
  backdrop = estimateBackdrop(img),
  largestOnly = true,
): Uint8Array {
  const { data, width, height } = img;
  const n = width * height;
  const [br, bg, bb] = backdrop.color;
  const isCandidate = (p: number) => {
    const i = p * 4;
    if (data[i + 3] < 16) return true; // existing transparency is background
    return Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb)) <= tolerance;
  };

  const isBackground = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (p: number) => {
    if (!isBackground[p] && isCandidate(p)) {
      isBackground[p] = 1;
      queue[tail++] = p;
    }
  };
  forEachBorderPixel(width, height, push);
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (p >= width) push(p - width);
    if (p < n - width) push(p + width);
  }

  const keep = new Uint8Array(n);
  for (let p = 0; p < n; p++) keep[p] = isBackground[p] ? 0 : 1;
  return largestOnly ? keepLargestComponent(keep, width, height) : keep;
}

function keepLargestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const label = new Int32Array(n);
  const queue = new Int32Array(n);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (!mask[start] || label[start]) continue;
    next++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = next;
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const q = yy * width + xx;
          if (mask[q] && !label[q]) {
            label[q] = next;
            queue[tail++] = q;
          }
        }
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      best = next;
    }
  }
  const out = new Uint8Array(n);
  if (best) for (let p = 0; p < n; p++) out[p] = label[p] === best ? 1 : 0;
  return out;
}

function keptRatio(mask: Uint8Array): number {
  let kept = 0;
  for (let p = 0; p < mask.length; p++) kept += mask[p];
  return mask.length ? kept / mask.length : 0;
}

function centreKeptRatio(mask: Uint8Array, width: number, height: number): number {
  const x0 = Math.floor(width * 0.35);
  const x1 = Math.ceil(width * 0.65);
  const y0 = Math.floor(height * 0.35);
  const y1 = Math.ceil(height * 0.65);
  let kept = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++, total++) kept += mask[y * width + x];
  return total ? kept / total : 1;
}

// ── Confidence ───────────────────────────────────────────────────────────

export type RemovalAssessment =
  | { confident: true; mask: Uint8Array }
  | { confident: false; mask: Uint8Array; reason: "busy-background" | "similar-colours" | "nothing-found" };

/**
 * Whether automatic removal can be trusted for this photo. A plain backdrop
 * in a colour distinct from the jersey gives a mask that barely changes as
 * tolerance rises. When the jersey shares the backdrop's colour (a white
 * jersey on a light background) the removed area keeps growing INTO the
 * jersey as tolerance rises — that instability is the signal to stop and
 * leave the background in rather than cut into the jersey.
 */
export function assessRemoval(img: PixelImage, tolerance = DEFAULT_TOLERANCE): RemovalAssessment {
  const backdrop = estimateBackdrop(img);
  const raw = computeAutoMask(img, tolerance, backdrop, false);
  const mask = keepLargestComponent(raw, img.width, img.height);
  if (backdrop.spread > 12) return { confident: false, mask, reason: "busy-background" };
  const kept = keptRatio(mask);
  if (kept > 0.97) return { confident: false, mask, reason: "nothing-found" };
  // Almost everything "matched the backdrop": the jersey itself is that colour.
  if (kept < 0.1) return { confident: false, mask, reason: "similar-colours" };
  // Comparison passes only need the removed-area size, so they skip the
  // (slower) largest-component step.
  const looser = keptRatio(computeAutoMask(img, Math.min(MAX_TOLERANCE + 16, tolerance + 16), backdrop, false));
  const tighter = keptRatio(computeAutoMask(img, Math.max(1, Math.floor(tolerance / 3)), backdrop, false));
  const keptRaw = keptRatio(raw);
  const growsIntoJersey = (keptRaw - looser) / keptRaw > 0.04 || (tighter - keptRaw) / tighter > 0.04;
  if (growsIntoJersey || centreKeptRatio(mask, img.width, img.height) < 0.97) {
    return { confident: false, mask, reason: "similar-colours" };
  }
  return { confident: true, mask };
}

// ── Manual correction ────────────────────────────────────────────────────

/** Per-pixel manual overrides: 0 = none, 1 = force keep, 2 = force erase. */
export const MANUAL_NONE = 0;
export const MANUAL_KEEP = 1;
export const MANUAL_ERASE = 2;

export function paintBrush(
  manual: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  value: typeof MANUAL_KEEP | typeof MANUAL_ERASE,
): void {
  const r2 = radius * radius;
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) manual[y * width + x] = value;
    }
  }
}

// ── Final alpha + composition ────────────────────────────────────────────

/**
 * Final alpha: the automatic mask (or "keep everything" when removal is
 * off), then manual overrides, never more opaque than the source pixel.
 * Pixels on the cut edge get a slightly softened alpha so the outline
 * doesn't look jagged on the pitch.
 */
export function buildAlpha(img: PixelImage, autoMask: Uint8Array | null, manual: Uint8Array): Uint8ClampedArray {
  const { data, width, height } = img;
  const n = width * height;
  const keep = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const m = manual[p];
    keep[p] = m === MANUAL_KEEP ? 1 : m === MANUAL_ERASE ? 0 : autoMask ? autoMask[p] : 1;
  }
  const alpha = new Uint8ClampedArray(n);
  for (let p = 0; p < n; p++) {
    if (!keep[p]) continue;
    const x = p % width;
    const onCut =
      (x > 0 && !keep[p - 1]) || (x < width - 1 && !keep[p + 1]) || (p >= width && !keep[p - width]) || (p < n - width && !keep[p + width]);
    alpha[p] = Math.min(data[p * 4 + 3], onCut ? 170 : 255);
  }
  return alpha;
}

/** RGB copied verbatim; only alpha changes. */
export function composeRgba(img: PixelImage, alpha: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(img.data);
  for (let p = 0; p < alpha.length; p++) out[p * 4 + 3] = alpha[p];
  return out;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tight box around the visible jersey, or null if nothing is left. */
export function alphaBounds(alpha: Uint8ClampedArray, width: number, height: number, threshold = 8): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Where the trimmed jersey goes in the saved frame: contained and centred, never upscaled past 2x. */
export function fitIntoFrame(bounds: Bounds, frame: { width: number; height: number } = KIT_FRAME): Bounds {
  const scale = Math.min(frame.width / bounds.width, frame.height / bounds.height, 2);
  const width = Math.round(bounds.width * scale);
  const height = Math.round(bounds.height * scale);
  return { x: Math.round((frame.width - width) / 2), y: Math.round((frame.height - height) / 2), width, height };
}
