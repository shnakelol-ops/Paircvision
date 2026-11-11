/**
 * htFtDashboardRenderer.ts
 *
 * Draws the portrait HT / FT dashboard (1080 × 1350, 4:5 — WhatsApp and
 * Instagram friendly) from an HtFtDashboardView. Presentation only: every
 * string and number arrives pre-computed in the view.
 *
 * drawHtFtDashboard() is pure canvas drawing (no awaits, no I/O) so tests can
 * run it against a recording context. renderHtFtDashboardPng() creates the
 * canvas and encodes the PNG; it runs only when the coach asks for a
 * dashboard, never during live capture.
 *
 * Fonts: the system UI stack (Roboto on Samsung/Android), the same approach
 * as the existing Share Summary card — no font downloads, works offline, and
 * covers the Irish fadas.
 */

import type { MatchCrests } from "../crest/crest-artwork";
import { DASHBOARD_CREST_CY, DASHBOARD_CREST_SIZE, drawCrest } from "./crestDraw";
import {
  DASHBOARD_BG,
  NO_VALUE,
  dashboardFilename,
  type DashboardStat,
  type DashboardTeamView,
  type HtFtDashboardView,
} from "./htFtDashboardView";

export const DASHBOARD_WIDTH = 1080;
export const DASHBOARD_HEIGHT = 1350;

export const DASHBOARD_FONT_STACK = 'system-ui, -apple-system, Roboto, "Segoe UI", Arial, sans-serif';

export const MARGIN = 48;
const COLUMN_WIDTH = 420;
const HOME_X = 290;
const AWAY_X = DASHBOARD_WIDTH - HOME_X;

// Shared with the Match Analysis map pages (matchMapRenderer.ts) so all
// three pages keep one visual identity.
export const TEXT = "#f8fafc";
export const MUTED = "#94a3b8";
export const FAINT = "#64748b";
export const ACCENT = "#22c55e";
export const SECTION = "#93c5fd";
export const PANEL_FILL = "rgba(255,255,255,0.045)";
export const PANEL_STROKE = "rgba(255,255,255,0.09)";

/** Minimum team-name size: still readable on a phone without zooming. */
export const MIN_NAME_SIZE = 28;
export const MAX_NAME_SIZE = 46;
/** Two-line names are capped smaller so the second line clears the score. */
export const MAX_WRAPPED_NAME_SIZE = 36;

export function font(weight: number, size: number): string {
  return `${weight} ${size}px ${DASHBOARD_FONT_STACK}`;
}

// ─── Text fitting ─────────────────────────────────────────────────────────────

export type FittedText = { size: number; lines: string[] };

function widthAt(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number): number {
  ctx.font = font(weight, size);
  return ctx.measureText(text).width;
}

/** Shortens `text` with "…" until it fits `maxWidth` at the given size. */
export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  size: number,
): string {
  if (widthAt(ctx, text, weight, size) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join("").trimEnd()}…`;
    if (widthAt(ctx, candidate, weight, size) <= maxWidth) return candidate;
  }
  return "…";
}

function wrapWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  size: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || widthAt(ctx, candidate, weight, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Largest size (maxSize → minSize) at which `text` fits on one line, then on
 * up to `maxLines` lines. If it still cannot fit at minSize, the text is
 * wrapped at minSize and the last allowed line is truncated with "…" — so
 * nothing is ever drawn outside `maxWidth`.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  opts: { weight: number; maxSize: number; minSize: number; maxLines: number; maxWrappedSize?: number },
): FittedText {
  const clean = text.replace(/\s+/g, " ").trim();
  for (let size = opts.maxSize; size >= opts.minSize; size -= 2) {
    if (widthAt(ctx, clean, opts.weight, size) <= maxWidth) return { size, lines: [clean] };
  }
  if (opts.maxLines > 1) {
    for (let size = Math.min(opts.maxSize, opts.maxWrappedSize ?? opts.maxSize); size >= opts.minSize; size -= 2) {
      const lines = wrapWords(ctx, clean, maxWidth, opts.weight, size);
      if (lines.length <= opts.maxLines && lines.every((l) => widthAt(ctx, l, opts.weight, size) <= maxWidth)) {
        return { size, lines };
      }
    }
  }
  const size = opts.minSize;
  const wrapped = opts.maxLines > 1 ? wrapWords(ctx, clean, maxWidth, opts.weight, size) : [clean];
  const kept = wrapped.slice(0, opts.maxLines);
  if (wrapped.length > opts.maxLines) kept[kept.length - 1] = `${kept[kept.length - 1]}…`;
  return {
    size,
    lines: kept.map((l) => truncateToWidth(ctx, l, maxWidth, opts.weight, size)),
  };
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, y: number, h: number): void {
  roundRectPath(ctx, MARGIN, y, DASHBOARD_WIDTH - MARGIN * 2, h, 28);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.strokeStyle = PANEL_STROKE;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: { weight: number; size: number; color: string; align?: CanvasTextAlign },
): void {
  ctx.font = font(opts.weight, opts.size);
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

/** Centred single line, shrunk then truncated so it never exceeds maxWidth. */
export function fittedLine(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: { weight: number; maxSize: number; minSize: number; color: string; align?: CanvasTextAlign },
): void {
  const fit = fitText(ctx, value, maxWidth, { weight: opts.weight, maxSize: opts.maxSize, minSize: opts.minSize, maxLines: 1 });
  text(ctx, fit.lines[0], x, y, { weight: opts.weight, size: fit.size, color: opts.color, align: opts.align ?? "center" });
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, view: HtFtDashboardView): void {
  ctx.fillStyle = DASHBOARD_BG;
  ctx.fillRect(0, 0, DASHBOARD_WIDTH, DASHBOARD_HEIGHT);
  const glow = ctx.createLinearGradient(0, 0, 0, DASHBOARD_HEIGHT);
  glow.addColorStop(0, "rgba(34,197,94,0.10)");
  glow.addColorStop(0.45, "rgba(11,20,40,0)");
  glow.addColorStop(1, "rgba(59,130,246,0.08)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, DASHBOARD_WIDTH, DASHBOARD_HEIGHT);
  // Team-colour accent strip: home left, away right.
  ctx.fillStyle = view.home.primary;
  ctx.fillRect(0, 0, DASHBOARD_WIDTH / 2, 10);
  ctx.fillStyle = view.away.primary;
  ctx.fillRect(DASHBOARD_WIDTH / 2, 0, DASHBOARD_WIDTH / 2, 10);
}

export function drawHeader(ctx: CanvasRenderingContext2D, view: Pick<HtFtDashboardView, "stageLabel" | "period">): void {
  // Wordmark: "Páirc" + green "Vision".
  ctx.font = font(800, 42);
  const paircWidth = ctx.measureText("Páirc").width;
  text(ctx, "Páirc", MARGIN + 16, 100, { weight: 800, size: 42, color: TEXT });
  text(ctx, "Vision", MARGIN + 16 + paircWidth, 100, { weight: 800, size: 42, color: ACCENT });

  // Stage pill.
  ctx.font = font(800, 30);
  const label = view.stageLabel;
  const pillW = ctx.measureText(label).width + 56;
  const pillX = DASHBOARD_WIDTH - MARGIN - 16 - pillW;
  roundRectPath(ctx, pillX, 56, pillW, 60, 30);
  ctx.fillStyle = view.period === "HT" ? "rgba(251,191,36,0.16)" : "rgba(34,197,94,0.16)";
  ctx.fill();
  ctx.strokeStyle = view.period === "HT" ? "#fbbf24" : ACCENT;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, label, pillX + pillW / 2, 97, { weight: 800, size: 30, color: view.period === "HT" ? "#fde68a" : "#bbf7d0", align: "center" });
}

const BADGE_Y = 250;
const BADGE_R = 64;

function drawBadge(ctx: CanvasRenderingContext2D, team: DashboardTeamView, cx: number): void {
  ctx.beginPath();
  ctx.arc(cx, BADGE_Y, BADGE_R, 0, Math.PI * 2);
  ctx.fillStyle = team.primary;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, BADGE_Y, BADGE_R - 6, 0, Math.PI * 2);
  ctx.strokeStyle = team.secondary;
  ctx.lineWidth = 8;
  ctx.stroke();
  if (team.needsOutline) {
    ctx.beginPath();
    ctx.arc(cx, BADGE_Y, BADGE_R + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const size = [...team.monogram].length > 1 ? 50 : 60;
  ctx.font = font(800, size);
  ctx.fillStyle = team.monogramText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(team.monogram, cx, BADGE_Y + 2);
  ctx.textBaseline = "alphabetic";
}

function drawTeamColumn(ctx: CanvasRenderingContext2D, team: DashboardTeamView, cx: number, crest: MatchCrests["home"]): void {
  // Club crest in its natural shape when one is linked and decoded; otherwise the unchanged monogram badge.
  if (!drawCrest(ctx, crest, { cx, cy: DASHBOARD_CREST_CY, ...DASHBOARD_CREST_SIZE })) drawBadge(ctx, team, cx);

  const name = fitText(ctx, team.name, COLUMN_WIDTH, {
    weight: 700, maxSize: MAX_NAME_SIZE, minSize: MIN_NAME_SIZE, maxLines: 2, maxWrappedSize: MAX_WRAPPED_NAME_SIZE,
  });
  const lineHeight = Math.round(name.size * 1.15);
  // Names sit in a fixed box (baselines 360–400) above the score, so both
  // scores stay aligned and a two-line name never touches the score digits.
  const firstBaseline = name.lines.length === 1 ? 388 : 360;
  name.lines.forEach((line, i) => {
    text(ctx, line, cx, firstBaseline + i * lineHeight, { weight: 700, size: name.size, color: TEXT, align: "center" });
  });

  fittedLine(ctx, team.scoreText, cx, 520, COLUMN_WIDTH, { weight: 800, maxSize: 120, minSize: 72, color: TEXT });
  text(ctx, team.totalText, cx, 566, { weight: 600, size: 38, color: MUTED, align: "center" });
}

function drawScoreBlock(ctx: CanvasRenderingContext2D, view: HtFtDashboardView, crests: MatchCrests | undefined): void {
  panel(ctx, 140, 450);
  drawTeamColumn(ctx, view.home, HOME_X, crests?.home ?? null);
  drawTeamColumn(ctx, view.away, AWAY_X, crests?.away ?? null);
  // Centre divider + "v".
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(DASHBOARD_WIDTH / 2, 180);
  ctx.lineTo(DASHBOARD_WIDTH / 2, 560);
  ctx.stroke();
  text(ctx, "v", DASHBOARD_WIDTH / 2, 455, { weight: 600, size: 34, color: FAINT, align: "center" });

  fittedLine(ctx, view.marginText, DASHBOARD_WIDTH / 2, 642, DASHBOARD_WIDTH - MARGIN * 2, {
    weight: 700, maxSize: 36, minSize: 26, color: "#e2e8f0",
  });
  if (view.metaLine) {
    fittedLine(ctx, view.metaLine, DASHBOARD_WIDTH / 2, 682, DASHBOARD_WIDTH - MARGIN * 2, {
      weight: 500, maxSize: 26, minSize: 22, color: MUTED,
    });
  }
}

const STAT_PANEL_H = 160;
const STAT_GAP = 16;
const NOTE_EXTRA_H = 36;
/** Rate bars between the two values: home grows leftwards, away rightwards. */
const BAR_W = 190;
const BAR_H = 14;

function drawRateBar(ctx: CanvasRenderingContext2D, team: DashboardTeamView, stat: DashboardStat, side: "home" | "away", y: number): void {
  if (stat.ratio === null) return;
  const x = side === "home" ? DASHBOARD_WIDTH / 2 - 20 - BAR_W : DASHBOARD_WIDTH / 2 + 20;
  roundRectPath(ctx, x, y, BAR_W, BAR_H, BAR_H / 2);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fill();
  const w = Math.max(0, Math.min(1, stat.ratio)) * BAR_W;
  if (w > 0) {
    const fx = side === "home" ? x + BAR_W - w : x;
    roundRectPath(ctx, fx, y, w, BAR_H, Math.min(BAR_H / 2, w / 2));
    ctx.fillStyle = team.primary;
    ctx.fill();
    if (team.needsOutline) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawStatPanel(
  ctx: CanvasRenderingContext2D,
  view: HtFtDashboardView,
  y: number,
  title: string,
  pick: (t: DashboardTeamView) => DashboardStat,
  note: string | null,
): number {
  const h = STAT_PANEL_H + (note ? NOTE_EXTRA_H : 0);
  panel(ctx, y, h);
  text(ctx, title.toUpperCase(), DASHBOARD_WIDTH / 2, y + 42, { weight: 800, size: 24, color: SECTION, align: "center" });
  // Every figure is attributed: each side of the panel names its team.
  const labelMax = DASHBOARD_WIDTH / 2 - MARGIN - 36 - 210;
  fittedLine(ctx, view.home.name, MARGIN + 36, y + 42, labelMax, { weight: 700, maxSize: 20, minSize: 16, color: FAINT, align: "left" });
  fittedLine(ctx, view.away.name, DASHBOARD_WIDTH - MARGIN - 36, y + 42, labelMax, { weight: 700, maxSize: 20, minSize: 16, color: FAINT, align: "right" });

  const valueMax = DASHBOARD_WIDTH / 2 - 20 - BAR_W - MARGIN - 40;
  const home = pick(view.home);
  const away = pick(view.away);
  // "—" (no data) is drawn muted so it never reads as a figure or a bar.
  const valueColour = (s: DashboardStat) => (s.value === NO_VALUE ? FAINT : TEXT);
  fittedLine(ctx, home.value, MARGIN + 36, y + 108, valueMax, { weight: 800, maxSize: 64, minSize: 40, color: valueColour(home), align: "left" });
  fittedLine(ctx, away.value, DASHBOARD_WIDTH - MARGIN - 36, y + 108, valueMax, { weight: 800, maxSize: 64, minSize: 40, color: valueColour(away), align: "right" });
  const detailMax = DASHBOARD_WIDTH / 2 - MARGIN - 56;
  fittedLine(ctx, home.detail, MARGIN + 36, y + 142, detailMax, { weight: 500, maxSize: 24, minSize: 20, color: MUTED, align: "left" });
  fittedLine(ctx, away.detail, DASHBOARD_WIDTH - MARGIN - 36, y + 142, detailMax, { weight: 500, maxSize: 24, minSize: 20, color: MUTED, align: "right" });

  drawRateBar(ctx, view.home, home, "home", y + 88);
  drawRateBar(ctx, view.away, away, "away", y + 88);

  if (note) {
    fittedLine(ctx, note, DASHBOARD_WIDTH / 2, y + 180, DASHBOARD_WIDTH - MARGIN * 2 - 48, {
      weight: 500, maxSize: 22, minSize: 18, color: "#fbbf24",
    });
  }
  return y + h + STAT_GAP;
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 1282);
  ctx.lineTo(DASHBOARD_WIDTH - MARGIN, 1282);
  ctx.stroke();
  ctx.font = font(700, 26);
  const w = ctx.measureText("Páirc").width;
  text(ctx, "Páirc", MARGIN + 16, 1324, { weight: 700, size: 26, color: MUTED });
  text(ctx, "Vision", MARGIN + 16 + w, 1324, { weight: 700, size: 26, color: ACCENT });
  text(ctx, "Event Stats", DASHBOARD_WIDTH - MARGIN - 16, 1324, { weight: 500, size: 24, color: FAINT, align: "right" });
}

/**
 * Draws the whole dashboard onto a 1080 × 1350 context. Pure: no I/O, no awaits.
 * `crests` (already decoded) replace the monogram badges; without them the
 * output is exactly the monogram design.
 */
export function drawHtFtDashboard(ctx: CanvasRenderingContext2D, view: HtFtDashboardView, crests?: MatchCrests): void {
  drawBackground(ctx, view);
  drawHeader(ctx, view);
  drawScoreBlock(ctx, view, crests);
  let y = 712;
  y = drawStatPanel(ctx, view, y, "Shooting accuracy", (t) => t.shooting, null);
  y = drawStatPanel(ctx, view, y, view.restartTitle, (t) => t.restarts, view.restartOwnerNote);
  drawStatPanel(ctx, view, y, "Turnovers won", (t) => t.turnoversWon, null);
  drawFooter(ctx);
}

/** Creates the canvas, draws the dashboard and encodes it as a PNG File. */
export async function renderHtFtDashboardPng(view: HtFtDashboardView, doc: Document = document, crests?: MatchCrests): Promise<File> {
  const canvas = doc.createElement("canvas");
  canvas.width = DASHBOARD_WIDTH;
  canvas.height = DASHBOARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available on this device.");
  drawHtFtDashboard(ctx, view, crests);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  canvas.width = 0; // release the bitmap
  if (!blob || blob.size === 0) throw new Error("Couldn't create the dashboard image.");
  return new File([blob], dashboardFilename(view), { type: "image/png" });
}
