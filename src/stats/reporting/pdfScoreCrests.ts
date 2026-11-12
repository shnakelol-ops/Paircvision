/**
 * pdfScoreCrests.ts — club crests in the page-1 score header of the HT / FT
 * Snapshot and Full Review PDFs (Club Crest V1, Checkpoint 4).
 *
 * Page 1 of each report is a 1920 × 1080 canvas with the two team names and
 * scores centred at x 496 (Home) and x 1424 (Away). The crests go in the empty
 * outer space beside them: Home centred at (140, 158), Away at (1780, 158),
 * each within at most 140 × 136 px and an area of at most 120². They are drawn
 * with the shared Match Analysis routine (dashboard/crestDraw.ts): natural
 * shape, uniform scale, never masked, cropped or stretched.
 *
 * Rules (approved):
 *   - both crests  → both;
 *   - one crest    → that crest, and the other club's monogram;
 *   - no crest     → nothing is drawn: page 1 is exactly as before.
 * The crests are decoded beforehand (crest/crest-artwork.ts) and selected by
 * Saved Team id only — never by name.
 *
 * Layout safety: the header text is measured first. Both crests are scaled
 * down by the same factor if a long name or score would come within 16 px of
 * them, and nothing is drawn if they would have to be smaller than 64 px.
 *
 * Failure safety: every element is first drawn on its own small staging
 * canvas inside a try / catch, and composited onto the page only when all of
 * them succeeded. A crest problem therefore never draws a partial header and
 * never throws into the page builder (whose catch would replace the whole page
 * with "This review page could not be rendered").
 */
import type { CrestArtwork } from "../../pro-tagger/crest/crest-artwork";
import { drawCrest, isDrawableCrest } from "../../pro-tagger/dashboard/crestDraw";
import {
  DEFAULT_COLOURS,
  MIN_BG_CONTRAST,
  contrastRatio,
  normaliseHex,
  readableTextOn,
  teamMonogram,
} from "../../pro-tagger/dashboard/htFtDashboardView";

/** Decoded crests (and team colours for the monogram fallback) for the page-1 score header. */
export type PdfScoreCrests = {
  home: CrestArtwork | null;
  away: CrestArtwork | null;
  homeName: string;
  awayName: string;
  homeColours?: { primary?: string; secondary?: string };
  awayColours?: { primary?: string; secondary?: string };
};

/** One line of header text exactly as the page draws it. */
export type PdfHeaderText = { text: string; font: string };

export type PdfScoreHeaderLayout = {
  /** Centre x of the Home and Away name / score columns. */
  homeCX: number;
  awayCX: number;
  home: readonly PdfHeaderText[];
  away: readonly PdfHeaderText[];
};

export const PDF_PAGE_W = 1920;
/** The PDF page background (reviewPdfExport.ts fillDarkBg). */
export const PDF_PAGE_BG = "#0d1117";
export const PDF_CREST_CY = 158;
export const PDF_HOME_CREST_CX = 140;
export const PDF_AWAY_CREST_CX = PDF_PAGE_W - 140;
export const PDF_CREST_SIZE = { maxW: 140, maxH: 136, targetSide: 120 } as const;
/** Monogram fallback radius at full size (same optical weight as a crest). */
export const PDF_MONOGRAM_R = 58;
/** Clear space kept between a crest and the nearest header text, and the page edge margin. */
export const PDF_CREST_GAP = 16;
export const PDF_PAGE_MARGIN = 24;
/** Below this width the crests are left out rather than shown too small. */
export const PDF_CREST_MIN_W = 64;

/** Staging canvas: large enough for the crest plus its backing glow. */
const STAGE = 200;

export type PdfCrestPlan = {
  scale: number;
  home: "crest" | "monogram";
  away: "crest" | "monogram";
};

/**
 * What to draw, or null to draw nothing (no usable crest, or no safe room).
 * Pure apart from ctx.measureText; restores ctx.font.
 */
export function planPdfScoreCrests(
  ctx: CanvasRenderingContext2D,
  crests: PdfScoreCrests | undefined,
  layout: PdfScoreHeaderLayout,
): PdfCrestPlan | null {
  if (!crests) return null;
  const homeOk = isDrawableCrest(crests.home);
  const awayOk = isDrawableCrest(crests.away);
  if (!homeOk && !awayOk) return null;

  const savedFont = ctx.font;
  const widest = (lines: readonly PdfHeaderText[]) => {
    let w = 0;
    for (const l of lines) {
      ctx.font = l.font;
      w = Math.max(w, ctx.measureText(l.text).width);
    }
    return w;
  };
  let homeHalf: number;
  let awayHalf: number;
  try {
    homeHalf = widest(layout.home) / 2;
    awayHalf = widest(layout.away) / 2;
  } finally {
    ctx.font = savedFont;
  }
  if (!Number.isFinite(homeHalf) || !Number.isFinite(awayHalf)) return null;

  // Half-width each crest may use: never past the page margin, never within PDF_CREST_GAP of the text.
  const homeRoom = Math.min(PDF_HOME_CREST_CX - PDF_PAGE_MARGIN, layout.homeCX - homeHalf - PDF_CREST_GAP - PDF_HOME_CREST_CX);
  const awayRoom = Math.min(PDF_PAGE_W - PDF_PAGE_MARGIN - PDF_AWAY_CREST_CX, PDF_AWAY_CREST_CX - (layout.awayCX + awayHalf) - PDF_CREST_GAP);
  const scale = Math.min(1, (2 * homeRoom) / PDF_CREST_SIZE.maxW, (2 * awayRoom) / PDF_CREST_SIZE.maxW);
  if (!(PDF_CREST_SIZE.maxW * scale >= PDF_CREST_MIN_W)) return null;
  return { scale, home: homeOk ? "crest" : "monogram", away: awayOk ? "crest" : "monogram" };
}

function drawMonogram(
  ctx: CanvasRenderingContext2D,
  name: string,
  colours: { primary?: string; secondary?: string } | undefined,
  defaults: { primary: string; secondary: string },
  cx: number,
  cy: number,
  r: number,
): void {
  const primary = normaliseHex(colours?.primary, defaults.primary);
  const secondary = normaliseHex(colours?.secondary, defaults.secondary);
  const monogram = teamMonogram(name);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = primary;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r - r * 0.09, 0, Math.PI * 2);
  ctx.strokeStyle = secondary;
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.stroke();
  if (contrastRatio(primary, PDF_PAGE_BG) < MIN_BG_CONTRAST) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.font = `800 ${Math.round(r * ([...monogram].length > 1 ? 0.78 : 0.9))}px system-ui, -apple-system, Roboto, "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = readableTextOn(primary);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(monogram, cx, cy + 2);
}

/** Draws one element centred on a fresh staging canvas; throws on any failure. */
function stage(doc: Document, draw: (ctx: CanvasRenderingContext2D, c: number) => boolean | void): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = STAGE;
  canvas.height = STAGE;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    if (draw(ctx, STAGE / 2) === false) throw new Error("crest not drawn");
    return canvas;
  } catch (err) {
    canvas.width = 0; // release before reporting the failure
    throw err;
  }
}

/**
 * Draws the page-1 score crests. Returns true when they were drawn; false —
 * with the page left exactly as it was (not a single call on `ctx`) — when
 * there is nothing to draw, no safe room, or anything failed. Never throws.
 */
export function drawPdfScoreCrests(
  ctx: CanvasRenderingContext2D,
  crests: PdfScoreCrests | undefined,
  layout: PdfScoreHeaderLayout,
  doc: Document = document,
): boolean {
  const staged: HTMLCanvasElement[] = [];
  try {
    if (!crests || (!isDrawableCrest(crests.home) && !isDrawableCrest(crests.away))) return false;
    // Text is measured on a scratch canvas: the page itself is only touched if the crests are composited.
    const scratch = doc.createElement("canvas");
    staged.push(scratch);
    const measure = scratch.getContext("2d");
    if (!measure) return false;
    const plan = planPdfScoreCrests(measure, crests, layout);
    if (!plan) return false;
    const box = {
      maxW: PDF_CREST_SIZE.maxW * plan.scale,
      maxH: PDF_CREST_SIZE.maxH * plan.scale,
      targetSide: PDF_CREST_SIZE.targetSide * plan.scale,
    };
    const element = (side: "home" | "away") =>
      stage(doc, (c, mid) => {
        if (plan[side] === "crest") return drawCrest(c, crests[side], { cx: mid, cy: mid, ...box });
        drawMonogram(
          c,
          side === "home" ? crests.homeName : crests.awayName,
          side === "home" ? crests.homeColours : crests.awayColours,
          side === "home" ? DEFAULT_COLOURS.home : DEFAULT_COLOURS.away,
          mid,
          mid,
          PDF_MONOGRAM_R * plan.scale,
        );
        return true;
      });
    staged.push(element("home")); // recorded at once so it is released even if Away fails
    staged.push(element("away"));
    const [home, away] = staged.slice(-2);
    // All elements succeeded: composite them (transparent staging pixels leave the page untouched).
    ctx.save();
    try {
      ctx.drawImage(home, PDF_HOME_CREST_CX - STAGE / 2, PDF_CREST_CY - STAGE / 2);
      ctx.drawImage(away, PDF_AWAY_CREST_CX - STAGE / 2, PDF_CREST_CY - STAGE / 2);
    } finally {
      ctx.restore();
    }
    return true;
  } catch {
    return false;
  } finally {
    for (const c of staged) c.width = 0; // release the staging bitmaps
  }
}
