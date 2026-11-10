/**
 * matchMapRenderer.ts
 *
 * Draws the Match Analysis Pack's Scoring Map and Turnover Map as portrait
 * 1080 × 1350 PNGs from the validated view models (scoringMapView.ts,
 * turnoverMapView.ts). Presentation only: every number, label and marker
 * position arrives pre-computed in the view.
 *
 * Shares the HT / FT dashboard's visual identity — background, PáircVision
 * wordmark, HALF-TIME / FULL-TIME pill, panels, system font stack and text
 * fitting all come from htFtDashboardRenderer.ts — so the three pages read
 * as one pack. Offline: no fonts, images or network.
 *
 * PITCH: drawn from the shared pitch markings (core/pitch/pitch-config.ts:
 * football layout for football / ladies football, hurling layout for hurling
 * / camogie) through one canvas transform that turns landscape pitch space
 * into the portrait map — the same rotation the markers use
 * (matchMapPerspective.ts → projectToPortrait), so markings and markers
 * always agree. A marker at (px, py) sits at px across the full pitch width
 * and py down its full length, matching how capture normalises a tap.
 *
 * The Scoring Map shows the selected team's attacking end, extended down the
 * pitch until every plotted shot is inside — a shot is never cropped off.
 *
 * Marker language (CLAUDE.md Visual Language):
 *   Goal #16a34a (larger) · Point #4ade80 · Two-pointer #fbbf24 · Wide red ✕
 *   Blocked / saved: solid grey #94a3b8 · Post: grey ring with a centre dot
 *   Dropped short: grey ↓ · Other / not recorded: dashed white ring
 *   Turnover won: purple #a78bfa circle · Turnover lost: orange #f97316 diamond
 */

import { getPitchConfig, type PitchMarking, type PitchSport } from "../../core/pitch/pitch-config";
import type { ProTaggerSport } from "../pro-tagger-session";
import {
  ACCENT,
  DASHBOARD_HEIGHT,
  DASHBOARD_WIDTH,
  FAINT,
  MARGIN,
  MUTED,
  PANEL_FILL,
  PANEL_STROKE,
  SECTION,
  TEXT,
  drawHeader,
  fitText,
  fittedLine,
  font,
  roundRectPath,
  text,
} from "./htFtDashboardRenderer";
import {
  DASHBOARD_BG,
  DEFAULT_COLOURS,
  MIN_BG_CONTRAST,
  contrastRatio,
  fileSlug,
  normaliseHex,
  readableTextOn,
  teamMonogram,
} from "./htFtDashboardView";
import type { MapPoint, MapScope, MapScoreline, MapTeamIdentity } from "./matchMapPerspective";
import type { ScoringMapView, ShotOutcome } from "./scoringMapView";
import type { TurnoverMapView, TurnoverOutcomeForTeam } from "./turnoverMapView";

export const MAP_WIDTH = DASHBOARD_WIDTH;
export const MAP_HEIGHT = DASHBOARD_HEIGHT;

/** Landscape pitch space (core/pitch/pitch-space.ts BOARD_PITCH_VIEWBOX): length × width. */
const PITCH_LEN = 160;
const PITCH_WID = 100;

const BODY_TOP = 374;
const BODY_BOTTOM = 1268;

// ─── Team colours ─────────────────────────────────────────────────────────────

export type ResolvedTeam = {
  name: string;
  primary: string;
  secondary: string;
  monogram: string;
  monogramText: string;
  needsOutline: boolean;
};

/** The dashboard's colour rules: recorded squad colours, else the established Home / Away defaults. */
export function resolveTeam(team: MapTeamIdentity): ResolvedTeam {
  const d = team.role === "HOME" ? DEFAULT_COLOURS.home : DEFAULT_COLOURS.away;
  const primary = normaliseHex(team.colours.primary, d.primary);
  return {
    name: team.name,
    primary,
    secondary: normaliseHex(team.colours.secondary, d.secondary),
    monogram: teamMonogram(team.name),
    monogramText: readableTextOn(primary),
    needsOutline: contrastRatio(primary, DASHBOARD_BG) < MIN_BG_CONTRAST,
  };
}

// ─── Portrait pitch ───────────────────────────────────────────────────────────

/** Where the visible pitch sits on the canvas, and how much of its length is shown. */
export type PitchFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Canvas pixels per pitch unit. */
  scale: number;
  /** Visible length as a fraction of the pitch, from the attacking end (1 = whole pitch). */
  pyMax: number;
};

export function pitchFrame(box: { x: number; y: number; w: number; h: number }, pyMax: number): PitchFrame {
  const shown = Math.max(0.05, Math.min(1, pyMax));
  const scale = Math.min(box.w / PITCH_WID, box.h / (PITCH_LEN * shown));
  const w = PITCH_WID * scale;
  const h = PITCH_LEN * shown * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y, w, h, scale, pyMax: shown };
}

/** Canvas position of a map point. */
export function framePoint(frame: PitchFrame, p: MapPoint): { x: number; y: number } {
  return { x: frame.x + p.px * frame.w, y: frame.y + (p.py / frame.pyMax) * frame.h };
}

/**
 * How much of the pitch the Scoring Map shows: the attacking 55% at least,
 * extended in 5% steps until every plotted shot fits (never crops a shot).
 */
export function scoringPitchExtent(points: readonly (MapPoint | null)[]): number {
  const deepest = points.reduce((m, p) => (p ? Math.max(m, p.py) : m), 0);
  return Math.min(1, Math.max(0.55, Math.ceil((deepest + 0.05) * 20) / 20));
}

function pitchSportFor(sport: ProTaggerSport): PitchSport {
  return sport === "hurling" || sport === "camogie" ? sport : "gaelic";
}

function dashes(spec: string | undefined): number[] {
  return spec ? spec.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n)) : [];
}

/** One pitch marking in landscape pitch units (the caller has set the transform). */
function drawMarking(ctx: CanvasRenderingContext2D, mark: PitchMarking, minLine: number): void {
  ctx.save();
  ctx.setLineDash([]);
  switch (mark.kind) {
    case "line":
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(minLine, mark.strokeWidth);
      ctx.setLineDash(dashes(mark.strokeDasharray));
      ctx.beginPath();
      ctx.moveTo(mark.x1, mark.y1);
      ctx.lineTo(mark.x2, mark.y2);
      ctx.stroke();
      break;
    case "rect":
      if (mark.fill) {
        ctx.fillStyle = mark.fill;
        ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
      }
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(minLine, mark.strokeWidth);
      ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(mark.cx, mark.cy, mark.r, 0, Math.PI * 2);
      if (mark.fill) {
        ctx.fillStyle = mark.fill;
        ctx.fill();
      }
      if (mark.stroke && (mark.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = mark.stroke;
        ctx.lineWidth = Math.max(minLine, mark.strokeWidth ?? 0);
        ctx.stroke();
      }
      break;
    case "ellipse":
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(minLine, mark.strokeWidth);
      ctx.beginPath();
      ctx.ellipse(mark.cx, mark.cy, Math.abs(mark.rx), Math.abs(mark.ry), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "ellipseArc":
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(minLine, mark.strokeWidth);
      if (mark.strokeLinecap) ctx.lineCap = mark.strokeLinecap;
      if (mark.opacity != null) ctx.globalAlpha = mark.opacity;
      ctx.beginPath();
      ctx.ellipse(mark.cx, mark.cy, Math.abs(mark.rx), Math.abs(mark.ry), 0, mark.startAngle, mark.endAngle, mark.anticlockwise ?? false);
      ctx.stroke();
      break;
    case "path":
      if (typeof Path2D === "undefined") break;
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(minLine, mark.strokeWidth);
      if (mark.strokeLinecap) ctx.lineCap = mark.strokeLinecap;
      if (mark.opacity != null) ctx.globalAlpha = mark.opacity;
      ctx.setLineDash(dashes(mark.strokeDasharray));
      try {
        ctx.stroke(new Path2D(mark.d));
      } catch {
        // pitch-config paths are static M/A data; a parse failure only skips that line.
      }
      break;
    case "text":
      // Rotated pitch text would read sideways on the portrait map — not drawn.
      break;
  }
  ctx.restore();
}

/** Turf, mowing stripes and every pitch marking, turned to portrait with the attacking end at the top. */
export function drawPortraitPitch(ctx: CanvasRenderingContext2D, sport: ProTaggerSport, frame: PitchFrame): void {
  ctx.save();
  roundRectPath(ctx, frame.x, frame.y, frame.w, frame.h, 18);
  ctx.clip();

  const turf = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.h);
  turf.addColorStop(0, "#2f8f4e");
  turf.addColorStop(1, "#25773f");
  ctx.fillStyle = turf;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  // Mowing stripes across the pitch every 10 pitch units of length.
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (let u = 0; u < PITCH_LEN; u += 20) {
    ctx.fillRect(frame.x, frame.y + u * frame.scale, frame.w, 10 * frame.scale);
  }

  // Landscape (X along the length, Y across) → portrait canvas:
  //   canvasX = frame.x + Y·scale,  canvasY = frame.y + (160 − X)·scale
  // i.e. px = Y / 100, py = 1 − X / 160 — projectToPortrait's rotation.
  ctx.transform(0, -frame.scale, frame.scale, 0, frame.x, frame.y + PITCH_LEN * frame.scale);
  const minLine = 2.2 / frame.scale;
  for (const mark of getPitchConfig(pitchSportFor(sport)).markings) drawMarking(ctx, mark, minLine);
  ctx.restore();

  // A cropped pitch fades out at the bottom edge rather than stopping on a hard line.
  if (frame.pyMax < 1) {
    const fade = ctx.createLinearGradient(0, frame.y + frame.h - 70, 0, frame.y + frame.h);
    fade.addColorStop(0, "rgba(11,20,40,0)");
    fade.addColorStop(1, "rgba(11,20,40,0.55)");
    ctx.fillStyle = fade;
    ctx.fillRect(frame.x, frame.y + frame.h - 70, frame.w, 70);
  }
  roundRectPath(ctx, frame.x, frame.y, frame.w, frame.h, 18);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ─── Markers ──────────────────────────────────────────────────────────────────

export const SHOT_MARKER_COLOURS = {
  GOAL: "#16a34a",
  POINT: "#4ade80",
  TWO_POINT: "#fbbf24",
  WIDE: "#ef4444",
  GREY: "#94a3b8",
} as const;
export const TURNOVER_WON_COLOUR = "#a78bfa";
export const TURNOVER_LOST_COLOUR = "#f97316";
const MARKER_OUTLINE = "#0b1428";

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, outline = MARKER_OUTLINE, lineWidth = 3): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Draws one shot marker centred on (x, y); r is the base point radius. */
export function drawShotMarker(ctx: CanvasRenderingContext2D, outcome: ShotOutcome, x: number, y: number, r: number): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  switch (outcome) {
    case "GOAL":
      disc(ctx, x, y, r * 1.3, SHOT_MARKER_COLOURS.GOAL, "#ffffff", 3);
      break;
    case "POINT":
      disc(ctx, x, y, r, SHOT_MARKER_COLOURS.POINT);
      break;
    case "TWO_POINT":
      disc(ctx, x, y, r, SHOT_MARKER_COLOURS.TWO_POINT);
      break;
    case "WIDE": {
      const s = r * 0.85;
      for (const [colour, width] of [[MARKER_OUTLINE, r * 0.62], [SHOT_MARKER_COLOURS.WIDE, r * 0.34]] as const) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
      }
      break;
    }
    case "BLOCKED":
      disc(ctx, x, y, r, SHOT_MARKER_COLOURS.GREY);
      break;
    case "POST":
      // Grey ring with a small centre dot — deliberately distinct from the solid blocked / saved disc.
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(11,20,40,0.55)";
      ctx.fill();
      ctx.strokeStyle = SHOT_MARKER_COLOURS.GREY;
      ctx.lineWidth = r * 0.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = SHOT_MARKER_COLOURS.GREY;
      ctx.fill();
      break;
    case "SHORT": {
      // ↓ drawn as strokes, so it never depends on a font glyph.
      const top = y - r;
      const bottom = y + r * 0.9;
      for (const [colour, width] of [[MARKER_OUTLINE, r * 0.6], [SHOT_MARKER_COLOURS.GREY, r * 0.3]] as const) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.moveTo(x - r * 0.65, bottom - r * 0.65);
        ctx.lineTo(x, bottom);
        ctx.lineTo(x + r * 0.65, bottom - r * 0.65);
        ctx.stroke();
      }
      break;
    }
    case "OTHER":
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(11,20,40,0.45)";
      ctx.fill();
      ctx.setLineDash([r * 0.4, r * 0.3]);
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = r * 0.22;
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Turnover won = purple circle; lost = orange diamond (shape differs too, not just colour). */
export function drawTurnoverMarker(ctx: CanvasRenderingContext2D, outcome: TurnoverOutcomeForTeam, x: number, y: number, r: number): void {
  ctx.save();
  if (outcome === "WON") {
    disc(ctx, x, y, r, TURNOVER_WON_COLOUR);
  } else {
    const d = r * 1.18;
    ctx.beginPath();
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y);
    ctx.lineTo(x, y + d);
    ctx.lineTo(x - d, y);
    ctx.closePath();
    ctx.fillStyle = TURNOVER_LOST_COLOUR;
    ctx.fill();
    ctx.strokeStyle = MARKER_OUTLINE;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

const MARKER_R = 15;
/** Furthest a drawn marker reaches from its centre (goal disc 1.3 × r plus its outline). */
const MARKER_REACH = MARKER_R * 1.3 + 3;

// ─── Attacking-direction arrow ───────────────────────────────────────────────
//
// A white ↑ in the gutter just outside the right-hand touchline. The map is
// always drawn in the selected team's attacking frame (matchMapPerspective.ts),
// so whenever that frame is in use the arrow points up — for Home and Away,
// at HT and FT. With no recorded direction the map shows positions as
// captured, so no arrow is drawn (the fallback caption explains instead).

const ARROW_HEAD_W = 26;
const ARROW_HEAD_H = 26;
const ARROW_SHAFT_W = 9;
const ARROW_LEN = 132;
const ARROW_MIN_LEN = 64;
const ARROW_LABEL = "ATTACKING";
const ARROW_LABEL_SIZE = 15;
const ARROW_LABEL_GAP = 12;
/** Clear space kept between the arrow and the touchline, the image edge and any marker. */
const ARROW_CLEARANCE = 8;

export type AttackArrowPlacement = {
  /** Centre line of the arrow column. */
  cx: number;
  /** Tip of the arrow head (the top). */
  tipY: number;
  /** Bottom of the shaft. */
  tailY: number;
  /** Rotated "ATTACKING" label below the shaft (reads bottom to top), or null when it doesn't fit. */
  label: { top: number; bottom: number } | null;
};

/**
 * Where the arrow goes: centred in the gutter between the pitch's right edge
 * and the image edge, as near the middle of the pitch's length as possible
 * while staying clear of any marker that reaches into the gutter, and within
 * the pitch's height. null when the gutter is too narrow or no clear slot
 * exists — the arrow is then simply not drawn.
 */
export function attackArrowPlacement(
  frame: PitchFrame,
  markers: readonly { x: number; y: number }[],
  labelWidth: number,
): AttackArrowPlacement | null {
  const right = frame.x + frame.w;
  const gutter = MAP_WIDTH - right;
  if (gutter < ARROW_HEAD_W + ARROW_CLEARANCE * 2) return null;
  const cx = right + gutter / 2;
  const columnLeft = cx - ARROW_HEAD_W / 2 - ARROW_CLEARANCE;
  // Vertical bands blocked by markers that reach into the arrow column.
  const blocked = markers
    .filter((m) => m.x + MARKER_REACH > columnLeft)
    .map((m) => [m.y - MARKER_REACH - ARROW_CLEARANCE, m.y + MARKER_REACH + ARROW_CLEARANCE] as const);
  const clear = (top: number, bottom: number) => blocked.every(([a, b]) => bottom <= a || top >= b);

  const minTop = frame.y + ARROW_CLEARANCE;
  const maxBottom = frame.y + frame.h - ARROW_CLEARANCE;
  const mid = frame.y + frame.h / 2;
  const options: { len: number; withLabel: boolean }[] = [
    { len: ARROW_LEN, withLabel: true },
    { len: ARROW_LEN, withLabel: false },
    { len: ARROW_MIN_LEN, withLabel: false },
  ];
  for (const { len, withLabel } of options) {
    const height = len + (withLabel ? ARROW_LABEL_GAP + labelWidth : 0);
    if (height > maxBottom - minTop) continue;
    // Nearest clear slot to the middle: try 0, +4, −4, +8, −8 … px.
    for (let step = 0; step <= frame.h; step += 4) {
      for (const dy of step === 0 ? [0] : [step, -step]) {
        const top = mid - height / 2 + dy;
        const bottom = top + height;
        if (top < minTop || bottom > maxBottom || !clear(top, bottom)) continue;
        return {
          cx,
          tipY: top,
          tailY: top + len,
          label: withLabel ? { top: top + len + ARROW_LABEL_GAP, bottom } : null,
        };
      }
    }
  }
  return null;
}

/** Draws the arrow (and its label) when the map is in the selected team's attacking frame. */
export function drawAttackArrow(
  ctx: CanvasRenderingContext2D,
  frame: PitchFrame,
  orientation: { status: "ATTACKING_UP" | "AS_CAPTURED" },
  markers: readonly { x: number; y: number }[],
): AttackArrowPlacement | null {
  if (orientation.status !== "ATTACKING_UP") return null;
  ctx.save();
  ctx.font = font(800, ARROW_LABEL_SIZE);
  const labelWidth = ctx.measureText(ARROW_LABEL).width;
  const placement = attackArrowPlacement(frame, markers, labelWidth);
  if (placement) {
    const { cx, tipY, tailY, label } = placement;
    const baseY = tipY + ARROW_HEAD_H;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx + ARROW_HEAD_W / 2, baseY);
    ctx.lineTo(cx + ARROW_SHAFT_W / 2, baseY);
    ctx.lineTo(cx + ARROW_SHAFT_W / 2, tailY);
    ctx.lineTo(cx - ARROW_SHAFT_W / 2, tailY);
    ctx.lineTo(cx - ARROW_SHAFT_W / 2, baseY);
    ctx.lineTo(cx - ARROW_HEAD_W / 2, baseY);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (label) {
      // Rotated to read upwards, the same way the arrow points.
      ctx.translate(cx, label.bottom);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(ARROW_LABEL, 0, 0);
      ctx.textBaseline = "alphabetic";
    }
  }
  ctx.restore();
  return placement;
}

// ─── Page chrome (shared by both maps) ───────────────────────────────────────

function panelAt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  roundRectPath(ctx, x, y, w, h, 24);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.strokeStyle = PANEL_STROKE;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawMapBackground(ctx: CanvasRenderingContext2D, team: ResolvedTeam): void {
  ctx.fillStyle = DASHBOARD_BG;
  ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  const glow = ctx.createLinearGradient(0, 0, 0, MAP_HEIGHT);
  glow.addColorStop(0, "rgba(34,197,94,0.10)");
  glow.addColorStop(0.45, "rgba(11,20,40,0)");
  glow.addColorStop(1, "rgba(59,130,246,0.08)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  // Selected team's colour across the top — the page is about this team.
  ctx.fillStyle = team.primary;
  ctx.fillRect(0, 0, MAP_WIDTH, 10);
}

function drawBadge(ctx: CanvasRenderingContext2D, team: ResolvedTeam, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = team.primary;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
  ctx.strokeStyle = team.secondary;
  ctx.lineWidth = 7;
  ctx.stroke();
  if (team.needsOutline) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.font = font(800, [...team.monogram].length > 1 ? 44 : 52);
  ctx.fillStyle = team.monogramText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(team.monogram, cx, cy + 2);
  ctx.textBaseline = "alphabetic";
}

/** "0-12 (12)" */
function scoreWithTotal(s: MapScoreline["home"]): string {
  return `${s.text} (${s.total})`;
}

/** Selected team first: "0-12 (12) v Galbally 0-10 (10)". */
export function selectedScoreLine(team: MapTeamIdentity, scoreline: MapScoreline): string {
  const own = team.role === "HOME" ? scoreline.home : scoreline.away;
  const opp = team.role === "HOME" ? scoreline.away : scoreline.home;
  const oppName = team.role === "HOME" ? scoreline.awayName : scoreline.homeName;
  return `${scoreWithTotal(own)} v ${oppName} ${scoreWithTotal(opp)}`;
}

const BANNER_TEXT_X = 228;
const BANNER_TEXT_W = MAP_WIDTH - MARGIN - 28 - BANNER_TEXT_X;

function drawTeamBanner(
  ctx: CanvasRenderingContext2D,
  pageTitle: string,
  team: ResolvedTeam,
  identity: MapTeamIdentity,
  scoreline: MapScoreline,
  metaLine: string | null,
): void {
  panelAt(ctx, MARGIN, 140, MAP_WIDTH - MARGIN * 2, 214);
  drawBadge(ctx, team, MARGIN + 88, 247, 58);
  text(ctx, pageTitle, BANNER_TEXT_X, 190, { weight: 800, size: 24, color: SECTION });
  fittedLine(ctx, team.name, BANNER_TEXT_X, 250, BANNER_TEXT_W, { weight: 800, maxSize: 56, minSize: 30, color: TEXT, align: "left" });
  fittedLine(ctx, selectedScoreLine(identity, scoreline), BANNER_TEXT_X, 296, BANNER_TEXT_W, {
    weight: 700, maxSize: 30, minSize: 20, color: "#e2e8f0", align: "left",
  });
  if (metaLine) {
    fittedLine(ctx, metaLine, BANNER_TEXT_X, 334, BANNER_TEXT_W, { weight: 500, maxSize: 24, minSize: 18, color: MUTED, align: "left" });
  }
}

function drawMapFooter(ctx: CanvasRenderingContext2D, pageName: string): void {
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 1282);
  ctx.lineTo(MAP_WIDTH - MARGIN, 1282);
  ctx.stroke();
  ctx.font = font(700, 26);
  const w = ctx.measureText("Páirc").width;
  text(ctx, "Páirc", MARGIN + 16, 1324, { weight: 700, size: 26, color: MUTED });
  text(ctx, "Vision", MARGIN + 16 + w, 1324, { weight: 700, size: 26, color: ACCENT });
  text(ctx, `${pageName} · Event Stats`, MAP_WIDTH - MARGIN - 16, 1324, { weight: 500, size: 24, color: FAINT, align: "right" });
}

/**
 * Caption + optional location note under the pitch, centred on it. Each
 * wraps to a second line rather than being cut short: these are the honesty
 * notes (orientation fallback, unplotted events) and must stay readable.
 * Returns the y below the last line.
 */
function drawPitchNotes(ctx: CanvasRenderingContext2D, frame: PitchFrame, y: number, caption: string, note: string | null): number {
  const cx = frame.x + frame.w / 2;
  const maxW = Math.min(MAP_WIDTH - MARGIN * 2, Math.max(frame.w, 420));
  const block = (value: string, at: number, weight: number, maxSize: number, color: string): number => {
    const fit = fitText(ctx, value, maxW, { weight, maxSize, minSize: 18, maxLines: 2 });
    const lh = Math.round(fit.size * 1.25);
    fit.lines.forEach((line, i) => text(ctx, line, cx, at + i * lh, { weight, size: fit.size, color, align: "center" }));
    return at + fit.lines.length * lh;
  };
  let next = block(caption, y, 700, 24, "#e2e8f0");
  if (note) next = block(note, next + 4, 600, 22, "#fbbf24");
  return next;
}

function drawEmptyPitchMessage(ctx: CanvasRenderingContext2D, frame: PitchFrame, message: string): void {
  roundRectPath(ctx, frame.x + 40, frame.y + frame.h / 2 - 42, frame.w - 80, 84, 20);
  ctx.fillStyle = "rgba(11,20,40,0.72)";
  ctx.fill();
  fittedLine(ctx, message, frame.x + frame.w / 2, frame.y + frame.h / 2 + 11, frame.w - 120, { weight: 700, maxSize: 30, minSize: 20, color: TEXT });
}

/** A two-column legend; returns the y below it. */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  items: readonly { label: string; draw: (x: number, y: number) => void }[],
  x: number,
  y: number,
  w: number,
): number {
  const colW = w / 2;
  const rowH = 38;
  items.forEach((item, i) => {
    const cx = x + (i % 2) * colW;
    const cy = y + Math.floor(i / 2) * rowH;
    item.draw(cx + 16, cy);
    fittedLine(ctx, item.label, cx + 40, cy + 8, colW - 48, { weight: 600, maxSize: 22, minSize: 16, color: "#cbd5e1", align: "left" });
  });
  return y + Math.ceil(items.length / 2) * rowH;
}

/** A labelled stat tile in the left column. */
function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  opts: { valueSize?: number; valueColour?: string; accent?: string },
): void {
  panelAt(ctx, x, y, w, h);
  if (opts.accent) {
    roundRectPath(ctx, x, y + 18, 6, h - 36, 3);
    ctx.fillStyle = opts.accent;
    ctx.fill();
  }
  fittedLine(ctx, label, x + 26, y + 40, w - 52, { weight: 800, maxSize: 22, minSize: 16, color: SECTION, align: "left" });
  fittedLine(ctx, value, x + 26, y + 40 + (opts.valueSize ?? 80) * 0.95, w - 52, {
    weight: 800, maxSize: opts.valueSize ?? 80, minSize: 36, color: opts.valueColour ?? TEXT, align: "left",
  });
}

/** Label … count rows inside a tile; returns the y after the last row. */
function drawRows(
  ctx: CanvasRenderingContext2D,
  rows: readonly { label: string; value: string; dot?: (x: number, y: number) => void; muted?: boolean }[],
  x: number,
  y: number,
  w: number,
  rowH = 34,
  size = 23,
): number {
  rows.forEach((row, i) => {
    const ry = y + i * rowH;
    const labelX = row.dot ? x + 30 : x;
    row.dot?.(x + 11, ry - size * 0.35);
    fittedLine(ctx, row.label, labelX, ry, w - (labelX - x) - 64, {
      weight: 600, maxSize: size, minSize: 16, color: row.muted ? FAINT : "#cbd5e1", align: "left",
    });
    text(ctx, row.value, x + w, ry, { weight: 800, size: size + 2, color: row.muted ? FAINT : TEXT, align: "right" });
  });
  return y + rows.length * rowH;
}

function pct(p: number | null): string {
  return p == null ? "—" : `${p}%`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ─── Scoring Map ──────────────────────────────────────────────────────────────

const SHOT_LEGEND: readonly { outcome: ShotOutcome; label: string }[] = [
  { outcome: "GOAL", label: "Goal" },
  { outcome: "POINT", label: "Point" },
  { outcome: "TWO_POINT", label: "Two-pointer" },
  { outcome: "WIDE", label: "Wide" },
  { outcome: "SHORT", label: "Dropped short" },
  { outcome: "POST", label: "Hit the post" },
  { outcome: "BLOCKED", label: "Blocked / saved" },
  { outcome: "OTHER", label: "Outcome not recorded" },
];

/** Draws the whole Scoring Map onto a 1080 × 1350 context. Pure: no I/O, no awaits. */
export function drawScoringMap(ctx: CanvasRenderingContext2D, view: ScoringMapView): void {
  const team = resolveTeam(view.team);
  drawMapBackground(ctx, team);
  drawHeader(ctx, { stageLabel: view.scopeLabel, period: view.scope });
  drawTeamBanner(ctx, "SCORING MAP", team, view.team, view.scoreline, view.metaLine);

  // ── Right: pitch, legend, caption ──
  const present = SHOT_LEGEND.filter((l) => view.markers.some((m) => m.outcome === l.outcome));
  const legendRows = Math.ceil(present.length / 2);
  const notesH = view.location.note ? 128 : 66; // caption and note may each wrap to two lines
  const rightX = 432;
  const rightW = MAP_WIDTH - MARGIN - rightX;
  const pitchMaxH = 1130 - BODY_TOP - legendRows * 38 - notesH - 24;
  const frame = pitchFrame({ x: rightX, y: BODY_TOP, w: rightW, h: pitchMaxH }, scoringPitchExtent(view.markers.map((m) => m.point)));
  drawPortraitPitch(ctx, view.sport, frame);
  // Misses first, scores on top: a score is never hidden under a miss.
  const order = (o: ShotOutcome) => (o === "GOAL" ? 3 : o === "TWO_POINT" || o === "POINT" ? 2 : 1);
  const shotPoints = view.markers.flatMap((m) => (m.point ? [framePoint(frame, m.point)] : []));
  for (const m of [...view.markers].sort((a, b) => order(a.outcome) - order(b.outcome))) {
    if (!m.point) continue;
    const p = framePoint(frame, m.point);
    drawShotMarker(ctx, m.outcome, p.x, p.y, MARKER_R);
  }
  drawAttackArrow(ctx, frame, view.orientation, shotPoints);
  if (view.shooting.totalShots === 0) drawEmptyPitchMessage(ctx, frame, "No shots recorded");
  const legendBottom = drawLegend(
    ctx,
    present.map((l) => ({ label: l.label, draw: (x: number, y: number) => drawShotMarker(ctx, l.outcome, x, y, 11) })),
    frame.x,
    frame.y + frame.h + 34,
    frame.w,
  );
  drawPitchNotes(ctx, frame, legendBottom + 18, view.orientation.caption, view.location.note);

  // ── Left: accuracy, scored, missed ──
  const lx = MARGIN;
  const lw = rightX - 24 - MARGIN;
  const { shooting, scores, misses, halves } = view;

  drawTile(ctx, lx, BODY_TOP, lw, 228, "SHOOTING ACCURACY", pct(shooting.accuracyPct), {
    valueSize: 96, valueColour: shooting.accuracyPct == null ? FAINT : TEXT, accent: ACCENT,
  });
  fittedLine(
    ctx,
    shooting.totalShots === 0 ? "No shots recorded" : `${shooting.scoringShots} of ${plural(shooting.totalShots, "shot")} scored`,
    lx + 26, BODY_TOP + 176, lw - 52, { weight: 600, maxSize: 24, minSize: 18, color: "#cbd5e1", align: "left" },
  );
  if (halves) {
    const h = (x: typeof halves.firstHalf) => `${x.scores}/${x.shots}`;
    fittedLine(ctx, `1st half ${h(halves.firstHalf)} · 2nd half ${h(halves.secondHalf)}`, lx + 26, BODY_TOP + 208, lw - 52, {
      weight: 500, maxSize: 21, minSize: 16, color: MUTED, align: "left",
    });
  }

  const showTwo = scores.twoPointApplicable || scores.twoPointScores > 0;
  const scoredRows = [
    { label: "Goals", value: String(scores.goals), dot: (x: number, y: number) => drawShotMarker(ctx, "GOAL", x, y, 8) },
    { label: "One-point scores", value: String(scores.onePointScores), dot: (x: number, y: number) => drawShotMarker(ctx, "POINT", x, y, 9) },
    ...(showTwo ? [{ label: "Two-point scores", value: String(scores.twoPointScores), dot: (x: number, y: number) => drawShotMarker(ctx, "TWO_POINT", x, y, 9) }] : []),
  ];
  const scoredY = BODY_TOP + 228 + 14;
  const scoredH = 128 + scoredRows.length * 34;
  drawTile(ctx, lx, scoredY, lw, scoredH, "SCORING SHOTS", String(shooting.scoringShots), { valueSize: 64, accent: SHOT_MARKER_COLOURS.POINT });
  drawRows(ctx, scoredRows, lx + 26, scoredY + 140, lw - 52);

  const missRows = [
    { label: "Wide", value: String(misses.wides), dot: (x: number, y: number) => drawShotMarker(ctx, "WIDE", x, y, 8) },
    { label: "Dropped short", value: String(misses.short), dot: (x: number, y: number) => drawShotMarker(ctx, "SHORT", x, y, 9) },
    { label: "Hit the post", value: String(misses.post), dot: (x: number, y: number) => drawShotMarker(ctx, "POST", x, y, 9) },
    { label: "Blocked / saved", value: String(misses.blockedSaved), dot: (x: number, y: number) => drawShotMarker(ctx, "BLOCKED", x, y, 9) },
    ...(misses.otherOrUnknown > 0
      ? [{ label: "Not recorded", value: String(misses.otherOrUnknown), dot: (x: number, y: number) => drawShotMarker(ctx, "OTHER", x, y, 9) }]
      : []),
  ].map((r) => ({ ...r, muted: r.value === "0" }));
  const missY = scoredY + scoredH + 14;
  const missH = 1130 - missY;
  drawTile(ctx, lx, missY, lw, missH, "MISSED", String(shooting.missedShots), { valueSize: 64, accent: SHOT_MARKER_COLOURS.WIDE });
  drawRows(ctx, missRows, lx + 26, missY + 140, lw - 52, Math.min(34, (missH - 150) / missRows.length));

  // ── Bottom: scores by source (counts and points value, never accuracy) ──
  const sy = 1146;
  panelAt(ctx, MARGIN, sy, MAP_WIDTH - MARGIN * 2, 122);
  text(ctx, "SCORES BY SOURCE", MARGIN + 26, sy + 36, { weight: 800, size: 22, color: SECTION });
  fittedLine(ctx, "count · goals-points (total)", MAP_WIDTH - MARGIN - 26, sy + 36, 420, { weight: 500, maxSize: 20, minSize: 16, color: FAINT, align: "right" });
  const half = (MAP_WIDTH - MARGIN * 2) / 2;
  const source = (label: string, s: ScoringMapView["sources"]["fromPlay"], x: number) => {
    fittedLine(ctx, label, x + 26, sy + 90, 200, { weight: 700, maxSize: 26, minSize: 18, color: "#cbd5e1", align: "left" });
    const value = `${plural(s.scores, "score")} · ${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
    fittedLine(ctx, value, x + half - 26, sy + 92, half - 250, { weight: 800, maxSize: 32, minSize: 20, color: TEXT, align: "right" });
  };
  source("From play", view.sources.fromPlay, MARGIN);
  source("Placed balls", view.sources.placedBalls, MARGIN + half);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN + half, sy + 56);
  ctx.lineTo(MARGIN + half, sy + 108);
  ctx.stroke();

  drawMapFooter(ctx, "Scoring Map");
}

// ─── Turnover Map ─────────────────────────────────────────────────────────────

/** Draws the whole Turnover Map onto a 1080 × 1350 context. Pure: no I/O, no awaits. */
export function drawTurnoverMap(ctx: CanvasRenderingContext2D, view: TurnoverMapView): void {
  const team = resolveTeam(view.team);
  drawMapBackground(ctx, team);
  drawHeader(ctx, { stageLabel: view.scopeLabel, period: view.scope });
  drawTeamBanner(ctx, "TURNOVER MAP", team, view.team, view.scoreline, view.metaLine);

  // ── Right: whole pitch (turnovers happen anywhere), legend, caption ──
  const notesH = view.location.note ? 128 : 66; // caption and note may each wrap to two lines
  const pitchMaxH = BODY_BOTTOM - BODY_TOP - 38 - notesH - 40;
  const pitchW = Math.min(520, (pitchMaxH * PITCH_WID) / PITCH_LEN);
  const rightX = MAP_WIDTH - MARGIN - pitchW;
  const frame = pitchFrame({ x: rightX, y: BODY_TOP, w: pitchW, h: pitchMaxH }, 1);
  drawPortraitPitch(ctx, view.sport, frame);
  for (const m of view.markers) {
    if (!m.point) continue;
    const p = framePoint(frame, m.point);
    drawTurnoverMarker(ctx, m.outcome, p.x, p.y, MARKER_R);
  }
  drawAttackArrow(ctx, frame, view.orientation, view.markers.flatMap((m) => (m.point ? [framePoint(frame, m.point)] : [])));
  if (view.totals.total === 0) drawEmptyPitchMessage(ctx, frame, "No turnovers recorded");
  const legendBottom = drawLegend(
    ctx,
    [
      { label: "Won", draw: (x: number, y: number) => drawTurnoverMarker(ctx, "WON", x, y, 11) },
      { label: "Lost", draw: (x: number, y: number) => drawTurnoverMarker(ctx, "LOST", x, y, 11) },
    ],
    frame.x,
    frame.y + frame.h + 34,
    frame.w,
  );
  drawPitchNotes(ctx, frame, legendBottom + 18, view.orientation.caption, view.location.note);

  // ── Left: totals and methods ──
  const lx = MARGIN;
  const lw = rightX - 24 - MARGIN;
  const gap = 12;
  const tileW = (lw - gap * 2) / 3;
  const { totals, halves } = view;
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
  const tiles: [label: string, value: string, accent: string, halfText: (h: { won: number; lost: number }) => string][] = [
    ["WON", String(totals.won), TURNOVER_WON_COLOUR, (h) => String(h.won)],
    ["LOST", String(totals.lost), TURNOVER_LOST_COLOUR, (h) => String(h.lost)],
    ["BALANCE", signed(totals.balance), "#e2e8f0", (h) => signed(h.won - h.lost)],
  ];
  const tileH = halves ? 226 : 168;
  tiles.forEach(([label, value, accent, halfText], i) => {
    const x = lx + i * (tileW + gap);
    drawTile(ctx, x, BODY_TOP, tileW, tileH, label, value, { valueSize: 72, accent });
    if (halves) {
      // One half per line, so the split stays readable in a narrow tile.
      const line = { weight: 600, maxSize: 21, minSize: 17, color: MUTED, align: "left" as const };
      fittedLine(ctx, `1st half ${halfText(halves.firstHalf)}`, x + 26, BODY_TOP + 174, tileW - 36, line);
      fittedLine(ctx, `2nd half ${halfText(halves.secondHalf)}`, x + 26, BODY_TOP + 204, tileW - 36, line);
    }
  });

  const methodPanel = (y: number, h: number, title: string, rows: TurnoverMapView["methods"]["won"], outcome: TurnoverOutcomeForTeam, total: number) => {
    panelAt(ctx, lx, y, lw, h);
    text(ctx, title, lx + 26, y + 42, { weight: 800, size: 22, color: SECTION });
    const shown = rows.filter((r) => r.count > 0);
    if (shown.length === 0) {
      fittedLine(ctx, total === 0 ? "None recorded" : "—", lx + 26, y + 92, lw - 52, { weight: 600, maxSize: 24, minSize: 18, color: FAINT, align: "left" });
      return;
    }
    drawRows(
      ctx,
      shown.map((r) => ({
        label: r.label,
        value: String(r.count),
        muted: r.method === "UNKNOWN",
        dot: (x: number, yy: number) => drawTurnoverMarker(ctx, outcome, x, yy, 10),
      })),
      lx + 26,
      y + 96,
      lw - 52,
      Math.min(50, (h - 110) / Math.max(1, shown.length)),
      26,
    );
  };
  const listTop = BODY_TOP + tileH + 14;
  const listH = (BODY_BOTTOM - listTop - 14) / 2;
  methodPanel(listTop, listH, `WON BY · ${totals.won}`, view.methods.won, "WON", totals.won);
  methodPanel(listTop + listH + 14, listH, `LOST BY · ${totals.lost}`, view.methods.lost, "LOST", totals.lost);

  drawMapFooter(ctx, "Turnover Map");
}

// ─── PNG export ───────────────────────────────────────────────────────────────

export type AnalysisPage = "dashboard" | "scoring" | "turnovers";

/** "ballylanders-v-galbally-ft-scoring-map-galbally.png" — match, scope, page and team; ASCII-only. */
export function mapFilename(
  view: { scope: MapScope; team: MapTeamIdentity; scoreline: MapScoreline },
  page: Exclude<AnalysisPage, "dashboard">,
): string {
  const home = fileSlug(view.scoreline.homeName) || "home";
  const away = fileSlug(view.scoreline.awayName) || "away";
  const team = fileSlug(view.team.name) || (view.team.role === "HOME" ? "home" : "away");
  const pageSlug = page === "scoring" ? "scoring-map" : "turnover-map";
  return `${home}-v-${away}-${view.scope.toLowerCase()}-${pageSlug}-${team}.png`;
}

async function renderPng(draw: (ctx: CanvasRenderingContext2D) => void, filename: string, doc: Document): Promise<File> {
  const canvas = doc.createElement("canvas");
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available on this device.");
  draw(ctx);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  canvas.width = 0; // release the bitmap
  if (!blob || blob.size === 0) throw new Error("Couldn't create the map image.");
  return new File([blob], filename, { type: "image/png" });
}

export function renderScoringMapPng(view: ScoringMapView, doc: Document = document): Promise<File> {
  return renderPng((ctx) => drawScoringMap(ctx, view), mapFilename(view, "scoring"), doc);
}

export function renderTurnoverMapPng(view: TurnoverMapView, doc: Document = document): Promise<File> {
  return renderPng((ctx) => drawTurnoverMap(ctx, view), mapFilename(view, "turnovers"), doc);
}
