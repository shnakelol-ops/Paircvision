/**
 * crestDraw.ts — the one club-crest drawing routine shared by the Dashboard,
 * Scoring Map and Turnover Map (Club Crest V1, Checkpoint 2).
 *
 * Pure canvas drawing (no awaits, no I/O): the crest is decoded beforehand by
 * crest/crest-artwork.ts.
 *
 * Natural shape: the crest is drawn whole, scaled uniformly and centred in a
 * fixed box. Never masked, framed, stretched or cropped. Optical sizing:
 *
 *   scale = min(maxW / w, maxH / h, sqrt(targetSide² / (w × h)))
 *
 * The box stops tall or wide crests overflowing their area; the area cap stops
 * square and circular crests looking heavier than shields, so two different
 * clubs carry similar visual weight.
 *
 * drawCrest() returns false — having drawn nothing — when there is no usable
 * crest, so the caller draws the existing monogram badge unchanged.
 */
import type { CrestArtwork } from "../crest/crest-artwork";

export type CrestBox = {
  cx: number;
  cy: number;
  maxW: number;
  maxH: number;
  /** Side of the square whose area a crest may fill at most. */
  targetSide: number;
};

/** Dashboard columns: replaces the r = 64 monogram badge at (290 / 790, 250). */
export const DASHBOARD_CREST_SIZE = { maxW: 180, maxH: 140, targetSide: 124 } as const;
export const DASHBOARD_CREST_CY = 248;

/** Map banners: replaces the r = 58 monogram badge at (136, 247). */
export const MAP_CREST_SIZE = { maxW: 140, maxH: 150, targetSide: 118 } as const;

/** Subtle light glow behind dark crests only (never a frame or a mask). */
export const CREST_BACKING_ALPHA = 0.16;

export function fitCrest(width: number, height: number, box: Pick<CrestBox, "maxW" | "maxH" | "targetSide">): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(box.maxW / width, box.maxH / height, Math.sqrt((box.targetSide * box.targetSide) / (width * height)));
  return { width: width * scale, height: height * scale };
}

function sourceSize(image: CanvasImageSource): { w: number; h: number } {
  const s = image as unknown as { naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown };
  if (typeof s.naturalWidth === "number" && typeof s.naturalHeight === "number") return { w: s.naturalWidth, h: s.naturalHeight };
  const w = typeof s.width === "number" ? s.width : 0;
  const h = typeof s.height === "number" ? s.height : 0;
  return { w, h };
}

/** False for a missing crest, or an image that has been closed / failed (zero size). */
export function isDrawableCrest(crest: CrestArtwork | null | undefined): crest is CrestArtwork {
  if (!crest || !crest.image || !(crest.width > 0) || !(crest.height > 0)) return false;
  const { w, h } = sourceSize(crest.image);
  return w > 0 && h > 0;
}

/** Where the crest is drawn inside the box (centred, natural aspect ratio). */
export function crestRect(crest: Pick<CrestArtwork, "width" | "height">, box: CrestBox): { x: number; y: number; width: number; height: number } {
  const { width, height } = fitCrest(crest.width, crest.height, box);
  return { x: box.cx - width / 2, y: box.cy - height / 2, width, height };
}

/** Draws the crest centred in `box`. Returns false (nothing drawn) when the monogram should be used. */
export function drawCrest(ctx: CanvasRenderingContext2D, crest: CrestArtwork | null | undefined, box: CrestBox): boolean {
  if (!isDrawableCrest(crest)) return false;
  const r = crestRect(crest, box);
  if (!(r.width > 0 && r.height > 0)) return false;
  ctx.save();
  try {
    if (crest.needsBacking) {
      const radius = Math.max(r.width, r.height) * 0.62;
      const glow = ctx.createRadialGradient(box.cx, box.cy, 0, box.cx, box.cy, radius);
      glow.addColorStop(0, `rgba(255,255,255,${CREST_BACKING_ALPHA})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(box.cx, box.cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(crest.image, r.x, r.y, r.width, r.height);
  } finally {
    ctx.restore();
  }
  return true;
}
