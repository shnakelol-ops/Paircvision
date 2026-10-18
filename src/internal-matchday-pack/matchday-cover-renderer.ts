// Matchday Cover renderer — one fixed 1080×1350 (4:5) poster drawn with
// Canvas 2D. Same pixels on every device: the size never depends on the
// screen, fonts are bundled (matchday-cover-fonts.ts) and every image is
// same-origin or a local blob, so the canvas is never tainted.
//
// The draw function is pure (pack + already-decoded images in, pixels out)
// so the same page can later become a PNG for the Share sheet or one page
// of a programme PDF without change.

import { JERSEY_ASPECT } from "../internal-team-sheet/team-sheet-jersey";
import type { CoverImage } from "./matchday-cover-assets";
import { COVER_DISPLAY_STACK, COVER_TEXT_STACK, loadCoverFonts } from "./matchday-cover-fonts";
import { fitText, formatCoverDate, formatThrowIn, type MeasureText } from "./matchday-cover-text";
import type { MatchdayPackV1, MatchdaySide, MatchdaySponsor, MatchdayTeamColours } from "./matchday-pack-types";

export const COVER_WIDTH = 1080;
export const COVER_HEIGHT = 1350;

export interface CoverAssets {
  homeJersey: CoverImage | null;
  awayJersey: CoverImage | null;
  /** Sponsor id → decoded logo. Absent/null → the sponsor's name is set in type. */
  sponsorLogos?: Readonly<Record<string, CoverImage | null>>;
}

const GOLD = "#e8c06a";
const GOLD_SOFT = "rgba(232, 192, 106, 0.55)";
const INK = "#05080e";
const WHITE = "#f8fafc";

const W = COVER_WIDTH;
// Small-print sizes, chosen for a phone: the 1080px cover is usually seen
// ~390pt wide (×0.36), so these land at roughly 8.5–9.5pt — the smallest
// that stays comfortably readable in a feed.
export const DETAIL_LABEL_SIZE = 26;
export const SPONSOR_CAPTION_SIZE = 24;
export const CREDIT_SIZE = 24;
const H = COVER_HEIGHT;
const MARGIN = 64;

// ── Colour ──────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [100, 116, 139];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const lin = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function mix(hex: string, other: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The colour a side "glows" with on the dark poster. A black or navy
 * primary would vanish, so a near-black primary hands over to the
 * secondary; a near-white one is kept but muted so it doesn't flood.
 */
export function glowColour(colours: MatchdayTeamColours): string {
  const p = luminance(colours.primary);
  if (p < 0.05) return luminance(colours.secondary) < 0.05 ? "#94a3b8" : colours.secondary;
  if (p > 0.8) return "#cbd5e1";
  return colours.primary;
}

// ── Layout ──────────────────────────────────────────────────────────────────

export interface CoverLayout {
  jerseyTop: number;
  jerseyHeight: number;
  homeX: number;
  awayX: number;
  nameTop: number;
  nameHeight: number;
  columnWidth: number;
  panelTop: number;
  panelHeight: number;
  /** Where the sponsor band starts; H when there are no sponsors. */
  sponsorTop: number;
}

/** Tallest jersey before the two kits would crowd the centre badge. */
export const MAX_JERSEY_HEIGHT = 580;
const NAME_HEIGHT = 132;
const PANEL_HEIGHT = 148;

export interface CoverLayoutInput {
  hasSponsors: boolean;
  hasDetails: boolean;
  /** Lowest pixel the header uses — jerseys never start above it. */
  headerBottom: number;
}

/**
 * Bottom-up layout: sponsor band (optional) → details panel (optional) →
 * names → jerseys, with jerseys taking whatever height is left up to
 * MAX_JERSEY_HEIGHT. Missing sponsors or details never leave a dead band —
 * the jersey + name group re-centres in the freed space instead.
 */
export function computeCoverLayout({ hasSponsors, hasDetails, headerBottom }: CoverLayoutInput): CoverLayout {
  const sponsorTop = hasSponsors ? 1168 : H;
  const bottom = hasSponsors ? sponsorTop : H - 72;
  const panelTop = hasDetails ? bottom - 34 - PANEL_HEIGHT : bottom;
  const regionTop = Math.max(244, headerBottom + 28);
  const regionBottom = hasDetails ? panelTop - 22 : bottom - 24;
  const nameGap = 24;
  const jerseyHeight = Math.max(260, Math.min(MAX_JERSEY_HEIGHT, regionBottom - regionTop - nameGap - NAME_HEIGHT));
  const groupHeight = jerseyHeight + nameGap + NAME_HEIGHT;
  // Spare space (only when details/sponsors are missing) is split so the
  // group sits optically centred — slightly high, like a printed poster.
  const spare = Math.max(0, regionBottom - regionTop - groupHeight);
  const jerseyTop = regionTop + spare * 0.42;
  return {
    jerseyTop,
    jerseyHeight,
    homeX: 284,
    awayX: W - 284,
    nameTop: jerseyTop + jerseyHeight + nameGap,
    nameHeight: NAME_HEIGHT,
    columnWidth: 460,
    panelTop,
    panelHeight: PANEL_HEIGHT,
    sponsorTop,
  };
}

// ── Drawing helpers ─────────────────────────────────────────────────────────

function displayFont(size: number, weight: 600 | 800 = 800, italic = false): string {
  return `${italic ? "italic " : ""}${weight} ${size}px ${COVER_DISPLAY_STACK}`;
}

function textFont(size: number): string {
  return `600 ${size}px ${COVER_TEXT_STACK}`;
}

function measurer(ctx: CanvasRenderingContext2D, font: (size: number) => string): MeasureText {
  return (text, size) => {
    ctx.font = font(size);
    return ctx.measureText(text).width;
  };
}

/** Tracked (letter-spaced) caps, drawn glyph by glyph — canvas letterSpacing
 * isn't available on older iOS Safari, so it isn't relied on. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width;
  return w + tracking * Math.max(0, [...text].length - 1);
}

function drawTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, tracking: number): void {
  const total = trackedWidth(ctx, text, tracking);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
  ctx.textAlign = "center";
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

/** Contains the image's visible part (its crop, else the whole image) in a
 * w×h box centred on (cx, cy), preserving its aspect ratio. */
function drawContained(ctx: CanvasRenderingContext2D, img: CoverImage, cx: number, cy: number, w: number, h: number): void {
  const src = img.crop ?? { x: 0, y: 0, width: img.width, height: img.height };
  const scale = Math.min(w / src.width, h / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.drawImage(img.source, src.x, src.y, src.width, src.height, cx - dw / 2, cy - dh / 2, dw, dh);
}

// ── Background ──────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, pack: MatchdayPackV1, layout: CoverLayout): void {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  const glowY = layout.jerseyTop + layout.jerseyHeight * 0.42;
  const sides: [MatchdaySide, number][] = [
    [pack.home, W * 0.16],
    [pack.away, W * 0.84],
  ];
  for (const [side, x] of sides) {
    const c = glowColour(side.colours);
    const g = ctx.createRadialGradient(x, glowY, 0, x, glowY, 820);
    g.addColorStop(0, rgba(c, 0.5));
    g.addColorStop(0.45, rgba(c, 0.16));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Dark spine between the clubs — the "versus" channel.
  const spine = ctx.createLinearGradient(0, 0, W, 0);
  spine.addColorStop(0, "rgba(5, 8, 14, 0)");
  spine.addColorStop(0.5, "rgba(5, 8, 14, 0.62)");
  spine.addColorStop(1, "rgba(5, 8, 14, 0)");
  ctx.fillStyle = spine;
  ctx.fillRect(0, 0, W, H);

  // Floodlight from above.
  const flood = ctx.createRadialGradient(W / 2, -140, 0, W / 2, -140, 900);
  flood.addColorStop(0, "rgba(255, 255, 255, 0.16)");
  flood.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
  flood.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = flood;
  ctx.fillRect(0, 0, W, H);

  // Floodlight beams from both top corners, crossing over each jersey.
  const floorY = layout.jerseyTop + layout.jerseyHeight;
  for (const [fromX, toX] of [
    [-40, layout.homeX],
    [W + 40, layout.awayX],
  ] as const) {
    const spread = layout.jerseyHeight * 0.42;
    const beam = ctx.createLinearGradient(fromX, -60, toX, floorY);
    beam.addColorStop(0, "rgba(255, 255, 255, 0.10)");
    beam.addColorStop(0.7, "rgba(255, 255, 255, 0.025)");
    beam.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(fromX - 30, -60);
    ctx.lineTo(fromX + 30, -60);
    ctx.lineTo(toX + spread, floorY);
    ctx.lineTo(toX - spread, floorY);
    ctx.closePath();
    ctx.fill();
  }

  // Fine diagonal grain — printed-poster texture.
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.022)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -H; x < W; x += 14) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H * 0.55, H);
  }
  ctx.stroke();
  ctx.restore();

  // Seat the lower half in shadow so names and details stay crisp.
  const floor = ctx.createLinearGradient(0, layout.nameTop - 120, 0, H);
  floor.addColorStop(0, "rgba(5, 8, 14, 0)");
  floor.addColorStop(0.35, "rgba(5, 8, 14, 0.7)");
  floor.addColorStop(1, "rgba(5, 8, 14, 0.94)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, layout.nameTop - 120, W, H - (layout.nameTop - 120));

  const vignette = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.38, W / 2, H * 0.42, W * 0.95);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

// ── Header ──────────────────────────────────────────────────────────────────

const EYEBROW_TRACKING = 5;

export interface HeaderPlan {
  /** Competition in tracked gold caps — only when a round is the headline. */
  eyebrow: { size: number; lines: string[]; baselines: number[] } | null;
  ruleY: number;
  headline: { size: number; lines: string[]; baselines: number[] };
  bottom: number;
}

/**
 * Measures the header without drawing, so the layout can push the jerseys
 * down when a long competition wraps. The round is the headline with the
 * competition as eyebrow; with no round the competition is the headline.
 */
export function planHeader(ctx: CanvasRenderingContext2D, pack: MatchdayPackV1): HeaderPlan {
  const { competition, round } = pack.fixture;
  const maxWidth = W - MARGIN * 2;
  const eyebrowText = round ? competition.toUpperCase() : "";
  const headlineText = (round || competition || "Matchday").toUpperCase();

  let eyebrow: HeaderPlan["eyebrow"] = null;
  let ruleY = 70;
  if (eyebrowText) {
    const fit = fitText(
      (t, s) => {
        ctx.font = displayFont(s, 600);
        return trackedWidth(ctx, t, EYEBROW_TRACKING);
      },
      eyebrowText,
      { maxWidth, maxSize: 32, minSize: 22, maxLines: 2, wrapBelow: 26 },
    );
    const baselines = fit.lines.map((_, i) => 90 + i * (fit.size + 10));
    eyebrow = { size: fit.size, lines: fit.lines, baselines };
    ruleY = baselines[baselines.length - 1] + 28;
  }

  const fit = fitText(measurer(ctx, (s) => displayFont(s, 800, true)), headlineText, {
    maxWidth,
    maxSize: eyebrow ? 104 : 96,
    minSize: 54,
    maxLines: eyebrow ? 1 : 2,
    wrapBelow: 72,
  });
  const first = ruleY + 20 + fit.size * 0.8;
  const baselines = fit.lines.map((_, i) => first + i * fit.size * 0.92);
  return {
    eyebrow,
    ruleY,
    headline: { size: fit.size, lines: fit.lines, baselines },
    bottom: baselines[baselines.length - 1] + fit.size * 0.12,
  };
}

function drawHeader(ctx: CanvasRenderingContext2D, plan: HeaderPlan): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  if (plan.eyebrow) {
    ctx.fillStyle = GOLD;
    ctx.font = displayFont(plan.eyebrow.size, 600);
    plan.eyebrow.lines.forEach((line, i) => drawTracked(ctx, line, W / 2, plan.eyebrow!.baselines[i], EYEBROW_TRACKING));
  }

  // Gold rule with a centre diamond.
  ctx.fillStyle = GOLD_SOFT;
  ctx.fillRect(W / 2 - 150, plan.ruleY - 1, 130, 2);
  ctx.fillRect(W / 2 + 20, plan.ruleY - 1, 130, 2);
  ctx.save();
  ctx.translate(W / 2, plan.ruleY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-6, -6, 12, 12);
  ctx.restore();

  const { size, lines, baselines } = plan.headline;
  ctx.font = displayFont(size, 800, true);
  lines.forEach((line, i) => {
    const y = baselines[i];
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillText(line, W / 2 + 3, y + 4);
    const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#d8dee8");
    ctx.fillStyle = g;
    ctx.fillText(line, W / 2, y);
  });
}

// ── Jerseys ─────────────────────────────────────────────────────────────────

/** Generic GAA jersey outline in a 300×369 frame (the preset assets' frame). */
function jerseyOutline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const px = (u: number) => x + (u / 300) * w;
  const py = (v: number) => y + (v / 369) * h;
  ctx.beginPath();
  ctx.moveTo(px(112), py(18));
  ctx.quadraticCurveTo(px(150), py(62), px(188), py(18));
  ctx.lineTo(px(234), py(30));
  ctx.quadraticCurveTo(px(266), py(40), px(278), py(66));
  ctx.lineTo(px(298), py(138));
  ctx.lineTo(px(254), py(156));
  ctx.lineTo(px(240), py(124));
  ctx.lineTo(px(244), py(348));
  ctx.quadraticCurveTo(px(150), py(362), px(56), py(348));
  ctx.lineTo(px(60), py(124));
  ctx.lineTo(px(46), py(156));
  ctx.lineTo(px(2), py(138));
  ctx.lineTo(px(22), py(66));
  ctx.quadraticCurveTo(px(34), py(40), px(66), py(30));
  ctx.closePath();
}

/** Drawn when a side has no kit (or its image is missing): the club's own
 * colours, never another club's jersey. */
function drawNeutralJersey(ctx: CanvasRenderingContext2D, colours: MatchdayTeamColours, w: number, h: number): void {
  const x = -w / 2;
  const y = -h / 2;
  const px = (u: number) => x + (u / 300) * w;
  const py = (v: number) => y + (v / 369) * h;
  const unit = w / 300;

  const dark = luminance(colours.primary) < 0.04;
  // Inside of the back of the neck, seen through the collar — gives depth.
  ctx.beginPath();
  ctx.ellipse(px(150), py(24), 40 * unit, 16 * unit, 0, 0, Math.PI * 2);
  ctx.fillStyle = mix(colours.primary, "#000000", dark ? 0 : 0.45);
  ctx.fill();

  ctx.save();
  jerseyOutline(ctx, x, y, w, h);
  const body = ctx.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, mix(colours.primary, "#ffffff", dark ? 0.16 : 0.1));
  body.addColorStop(0.55, colours.primary);
  body.addColorStop(1, mix(colours.primary, "#000000", 0.18));
  ctx.fillStyle = body;
  ctx.fill();
  ctx.clip();

  // Sleeves a touch darker than the body (they turn away from the light).
  ctx.fillStyle = luminance(colours.primary) > 0.6 ? "rgba(0, 0, 0, 0.06)" : "rgba(0, 0, 0, 0.12)";
  for (const [outer, inner, pit] of [
    [px(2), px(46), px(60)],
    [px(298), px(254), px(240)],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(outer < pit ? px(22) : px(278), py(66));
    ctx.lineTo(outer, py(138));
    ctx.lineTo(inner, py(156));
    ctx.lineTo(pit, py(124));
    ctx.lineTo(pit, py(70));
    ctx.closePath();
    ctx.fill();
  }

  // Chest hoop in the secondary colour with fine piping — the classic GAA look.
  const hoopTop = py(150);
  const hoopH = 38 * unit;
  ctx.fillStyle = colours.secondary;
  ctx.fillRect(x, hoopTop, w, hoopH);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(x, hoopTop - 2 * unit, w, 2 * unit);
  ctx.fillRect(x, hoopTop + hoopH, w, 2 * unit);

  // Cuffs.
  ctx.strokeStyle = colours.secondary;
  ctx.lineWidth = 13 * unit;
  ctx.beginPath();
  ctx.moveTo(px(298), py(138));
  ctx.lineTo(px(254), py(156));
  ctx.moveTo(px(2), py(138));
  ctx.lineTo(px(46), py(156));
  ctx.stroke();

  // Fabric: light from the left, a soft fold right of centre, shaded hem.
  const shade = ctx.createLinearGradient(x, 0, x + w, 0);
  shade.addColorStop(0, "rgba(255, 255, 255, 0.16)");
  shade.addColorStop(0.4, "rgba(255, 255, 255, 0)");
  shade.addColorStop(0.62, "rgba(0, 0, 0, 0.10)");
  shade.addColorStop(0.7, "rgba(255, 255, 255, 0.04)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.26)");
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
  const hem = ctx.createLinearGradient(0, py(300), 0, py(360));
  hem.addColorStop(0, "rgba(0, 0, 0, 0)");
  hem.addColorStop(1, "rgba(0, 0, 0, 0.25)");
  ctx.fillStyle = hem;
  ctx.fillRect(x, py(300), w, py(360) - py(300));
  ctx.restore();

  // Rim light on the outline so a dark kit still separates from the night.
  jerseyOutline(ctx, x, y, w, h);
  ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.10)";
  ctx.lineWidth = 2 * unit;
  ctx.stroke();

  // Ribbed collar.
  ctx.strokeStyle = colours.secondary;
  ctx.lineWidth = 12 * unit;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px(114), py(20));
  ctx.quadraticCurveTo(px(150), py(60), px(186), py(20));
  ctx.stroke();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.lineWidth = 2 * unit;
  ctx.beginPath();
  ctx.moveTo(px(118), py(24));
  ctx.quadraticCurveTo(px(150), py(58), px(182), py(24));
  ctx.stroke();
  ctx.lineCap = "butt";
}

/** A lit "stage" line the two jerseys stand on. */
function drawStage(ctx: CanvasRenderingContext2D, layout: CoverLayout): void {
  const y = layout.jerseyTop + layout.jerseyHeight + 6;
  const line = ctx.createLinearGradient(MARGIN, 0, W - MARGIN, 0);
  line.addColorStop(0, "rgba(232, 192, 106, 0)");
  line.addColorStop(0.5, "rgba(232, 192, 106, 0.55)");
  line.addColorStop(1, "rgba(232, 192, 106, 0)");
  ctx.fillStyle = line;
  ctx.fillRect(MARGIN, y, W - MARGIN * 2, 2);
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.scale(1, 0.08);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.45);
  glow.addColorStop(0, "rgba(232, 192, 106, 0.22)");
  glow.addColorStop(1, "rgba(232, 192, 106, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-W / 2, -W * 0.45, W, W * 0.9);
  ctx.restore();
}

function drawJersey(
  ctx: CanvasRenderingContext2D,
  side: MatchdaySide,
  image: CoverImage | null,
  cx: number,
  layout: CoverLayout,
  tilt: number,
): void {
  const h = layout.jerseyHeight;
  const w = h / JERSEY_ASPECT;
  const cy = layout.jerseyTop + h / 2;
  const glow = glowColour(side.colours);

  // Halo in the club colour.
  const halo = ctx.createRadialGradient(cx, cy - h * 0.06, 0, cx, cy - h * 0.06, h * 0.62);
  halo.addColorStop(0, rgba(glow, 0.55));
  halo.addColorStop(0.6, rgba(glow, 0.12));
  halo.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - h, cy - h, h * 2, h * 2);

  // Contact shadow on the "floor".
  ctx.save();
  ctx.translate(cx, layout.jerseyTop + h + 4);
  ctx.scale(1, 0.12);
  const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
  floor.addColorStop(0, "rgba(0, 0, 0, 0.7)");
  floor.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = floor;
  ctx.fillRect(-w * 0.6, -w * 0.6, w * 1.2, w * 1.2);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 26;
  if (image) drawContained(ctx, image, 0, 0, w, h);
  else drawNeutralJersey(ctx, side.colours, w, h);
  ctx.restore();
}

function drawVersusBadge(ctx: CanvasRenderingContext2D, layout: CoverLayout): void {
  const cx = W / 2;
  const cy = layout.jerseyTop + layout.jerseyHeight * 0.46;
  const r = 50;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0f18";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 9, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(232, 192, 106, 0.25)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.font = displayFont(54, 800, true);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("V", cx - 2, cy + 19);
}

// ── Club names ──────────────────────────────────────────────────────────────

function drawClubName(ctx: CanvasRenderingContext2D, side: MatchdaySide, cx: number, layout: CoverLayout): void {
  const fit = fitText(measurer(ctx, (s) => displayFont(s, 800)), side.name.toUpperCase(), {
    maxWidth: layout.columnWidth - 20,
    maxSize: 76,
    minSize: 40,
    maxLines: 2,
    wrapBelow: 58,
  });
  const lineH = fit.size * 0.94;
  const barGap = 18;
  const barH = 8;
  const blockH = fit.size * 0.74 + lineH * (fit.lines.length - 1) + barGap + barH;
  let y = layout.nameTop + (layout.nameHeight - blockH) / 2 + fit.size * 0.74;

  ctx.font = displayFont(fit.size, 800);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const line of fit.lines) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillText(line, cx + 2, y + 3);
    ctx.fillStyle = WHITE;
    ctx.fillText(line, cx, y);
    y += lineH;
  }
  y -= lineH;

  // Club-colour bar: primary | secondary.
  const barW = 112;
  const bx = cx - barW / 2;
  const by = y + barGap;
  ctx.save();
  roundRectPath(ctx, bx, by, barW, barH, barH / 2);
  ctx.clip();
  ctx.fillStyle = side.colours.primary;
  ctx.fillRect(bx, by, barW / 2, barH);
  ctx.fillStyle = side.colours.secondary;
  ctx.fillRect(bx + barW / 2, by, barW / 2, barH);
  ctx.restore();
  roundRectPath(ctx, bx, by, barW, barH, barH / 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Fixture details ─────────────────────────────────────────────────────────

export interface DetailColumn {
  label: string;
  value: string;
  weight: number;
}

export function coverDetailColumns(pack: MatchdayPackV1): DetailColumn[] {
  const cols: DetailColumn[] = [];
  const date = formatCoverDate(pack.fixture.date);
  const time = formatThrowIn(pack.fixture.throwIn);
  if (date) cols.push({ label: "Date", value: date, weight: 1 });
  if (time) cols.push({ label: "Throw-in", value: time, weight: 0.8 });
  if (pack.fixture.venue) cols.push({ label: "Venue", value: pack.fixture.venue, weight: 1.6 });
  return cols;
}

const DETAIL_VALUE_SIZE = 46;
const DETAIL_PAD = 30; // clear space each side of a value, inside its column
const LABEL_TRACKING = 5;
/** Smallest venue size: ~10pt when the cover is seen ~390pt wide on a phone. */
export const VENUE_MIN_SIZE = 28;
const VENUE_MIN_SHARE = 0.45;

/**
 * Column widths for the details panel. With a venue, DATE and THROW-IN take
 * only the width their own (short) value and label need, and the venue gets
 * the rest — at least VENUE_MIN_SHARE of the panel — so long venue names have
 * room. Without a venue the original proportional weights are kept.
 * Pure: `need(col)` returns a column's content width.
 */
export function detailColumnWidths(
  cols: readonly DetailColumn[],
  totalWidth: number,
  need: (col: DetailColumn) => number,
): number[] {
  const venueIndex = cols.findIndex((c) => c.label === "Venue");
  if (venueIndex === -1 || cols.length === 1) {
    const total = cols.reduce((sum, c) => sum + c.weight, 0);
    return cols.map((c) => (totalWidth * c.weight) / total);
  }
  const widths = cols.map((c, i) => (i === venueIndex ? 0 : need(c) + DETAIL_PAD * 2));
  const fixed = widths.reduce((a, b) => a + b, 0);
  const maxFixed = totalWidth * (1 - VENUE_MIN_SHARE);
  if (fixed > maxFixed) {
    const scale = maxFixed / fixed;
    for (let i = 0; i < widths.length; i++) widths[i] *= scale;
  }
  widths[venueIndex] = totalWidth - widths.reduce((a, b) => a + b, 0);
  return widths;
}

function drawDetails(ctx: CanvasRenderingContext2D, pack: MatchdayPackV1, layout: CoverLayout): void {
  const cols = coverDetailColumns(pack);
  if (cols.length === 0) return;
  const x = MARGIN - 8;
  const w = W - x * 2;
  const y = layout.panelTop;
  const h = layout.panelHeight;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, 22);
  ctx.fillStyle = "rgba(10, 15, 24, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.clip();
  const edge = ctx.createLinearGradient(x, 0, x + w, 0);
  edge.addColorStop(0, "rgba(232, 192, 106, 0)");
  edge.addColorStop(0.5, GOLD);
  edge.addColorStop(1, "rgba(232, 192, 106, 0)");
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, 3);
  ctx.restore();

  const widths = detailColumnWidths(cols, w, (col) => {
    ctx.font = displayFont(DETAIL_VALUE_SIZE, 800);
    const value = ctx.measureText(col.value.toUpperCase()).width;
    ctx.font = textFont(DETAIL_LABEL_SIZE);
    return Math.max(value, trackedWidth(ctx, col.label.toUpperCase(), LABEL_TRACKING));
  });
  let cx0 = x;
  cols.forEach((col, i) => {
    const cw = widths[i];
    const isVenue = col.label === "Venue";
    const mid = cx0 + cw / 2;
    if (i > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(cx0, y + 26, 1.5, h - 52);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = GOLD;
    ctx.font = textFont(DETAIL_LABEL_SIZE);
    drawTracked(ctx, col.label.toUpperCase(), mid, y + 50, LABEL_TRACKING);

    const valueZoneTop = y + 62;
    const valueZoneH = h - 62 - 12;
    const fit = fitText(measurer(ctx, (s) => displayFont(s, 800)), col.value.toUpperCase(), {
      maxWidth: cw - DETAIL_PAD * 2,
      maxSize: DETAIL_VALUE_SIZE,
      minSize: isVenue ? VENUE_MIN_SIZE : 24,
      maxLines: 2,
      wrapBelow: isVenue ? 40 : 36,
      preferBreakAfter: isVenue ? "," : undefined,
    });
    // Two lines get roomier spacing and must fit the zone's height too.
    const lineGap = fit.lines.length === 2 ? 1.0 : 0.92;
    const size = fit.lines.length === 2 ? Math.min(fit.size, Math.floor(valueZoneH / (0.74 + lineGap + 0.04))) : fit.size;
    ctx.font = displayFont(size, 800);
    ctx.fillStyle = WHITE;
    const lineH = size * lineGap;
    const blockH = size * 0.74 + lineH * (fit.lines.length - 1);
    let vy = valueZoneTop + (valueZoneH - blockH) / 2 + size * 0.74;
    for (const line of fit.lines) {
      ctx.fillText(line, mid, vy);
      vy += lineH;
    }
    cx0 += cw;
  });
}

// ── Sponsors & credit ───────────────────────────────────────────────────────

function drawSponsors(
  ctx: CanvasRenderingContext2D,
  sponsors: readonly MatchdaySponsor[],
  logos: Readonly<Record<string, CoverImage | null>>,
  layout: CoverLayout,
): void {
  const top = layout.sponsorTop;
  const h = H - top;
  const band = ctx.createLinearGradient(0, top, 0, H);
  band.addColorStop(0, "#f7f8fa");
  band.addColorStop(1, "#e9edf2");
  ctx.fillStyle = band;
  ctx.fillRect(0, top, W, h);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, top, W, 4);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#64748b";
  ctx.font = textFont(SPONSOR_CAPTION_SIZE);
  drawTracked(ctx, "PROUDLY SUPPORTED BY", W / 2, top + 44, 5);

  const slotTop = top + 60;
  const slotH = h - 60 - 44;
  const slotW = (W - MARGIN * 2) / sponsors.length;
  sponsors.forEach((sponsor, i) => {
    const sx = MARGIN + slotW * i;
    const mid = sx + slotW / 2;
    if (i > 0) {
      ctx.fillStyle = "#cfd6df";
      ctx.fillRect(sx, slotTop + 10, 1.5, slotH - 20);
    }
    const logo = logos[sponsor.id];
    if (logo) {
      drawContained(ctx, logo, mid, slotTop + slotH / 2, slotW - 48, slotH - 8);
      return;
    }
    const fit = fitText(measurer(ctx, (s) => displayFont(s, 800)), sponsor.name.toUpperCase(), {
      maxWidth: slotW - 40,
      maxSize: 38,
      minSize: 22,
      maxLines: 2,
      wrapBelow: 30,
    });
    ctx.font = displayFont(fit.size, 800);
    ctx.fillStyle = "#111827";
    const lineH = fit.size * 0.98;
    const blockH = fit.size * 0.74 + lineH * (fit.lines.length - 1);
    let y = slotTop + (slotH - blockH) / 2 + fit.size * 0.74;
    for (const line of fit.lines) {
      ctx.fillText(line, mid, y);
      y += lineH;
    }
  });

  ctx.fillStyle = "#64748b";
  ctx.font = textFont(CREDIT_SIZE);
  drawTracked(ctx, "MADE WITH PÁIRCVISION", W / 2, H - 13, 4);
}

function drawCredit(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = textFont(CREDIT_SIZE);
  drawTracked(ctx, "MADE WITH PÁIRCVISION", W / 2, H - 34, 5);
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Draws the full cover onto a 1080×1350 context. Pure: no I/O, no awaits. */
export function renderMatchdayCover(ctx: CanvasRenderingContext2D, pack: MatchdayPackV1, assets: CoverAssets): void {
  const sponsors = pack.sponsors;
  ctx.save();
  const header = planHeader(ctx, pack);
  const layout = computeCoverLayout({
    hasSponsors: sponsors.length > 0,
    hasDetails: coverDetailColumns(pack).length > 0,
    headerBottom: header.bottom,
  });
  drawBackground(ctx, pack, layout);
  drawHeader(ctx, header);
  drawStage(ctx, layout);
  drawJersey(ctx, pack.home, assets.homeJersey, layout.homeX, layout, -0.06);
  drawJersey(ctx, pack.away, assets.awayJersey, layout.awayX, layout, 0.06);
  drawVersusBadge(ctx, layout);
  drawClubName(ctx, pack.home, layout.homeX, layout);
  drawClubName(ctx, pack.away, layout.awayX, layout);
  drawDetails(ctx, pack, layout);
  if (sponsors.length > 0) drawSponsors(ctx, sponsors, assets.sponsorLogos ?? {}, layout);
  else drawCredit(ctx);
  ctx.restore();
}

/** Loads the bundled fonts, then renders into a fresh 1080×1350 canvas. */
export async function renderMatchdayCoverCanvas(pack: MatchdayPackV1, assets: CoverAssets): Promise<HTMLCanvasElement | null> {
  await loadCoverFonts();
  const canvas = document.createElement("canvas");
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  renderMatchdayCover(ctx, pack, assets);
  return canvas;
}

export function coverCanvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}
