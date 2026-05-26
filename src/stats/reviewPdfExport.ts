/**
 * reviewPdfExport.ts
 *
 * Builds a PáircVision Visual Review PDF report (page count is dynamic).
 *
 * Key design decisions:
 * - Uses a standalone 2D canvas renderer (no PixiJS dependency, no preserveDrawingBuffer needed).
 * - Pitch markings are sourced directly from pitchConfig so the visual matches the app exactly.
 * - Uses a STRICT PDF-only event selector (selectPdfEvents) with NO live-review inference.
 *   An event belongs to exactly one of FOR or AGAINST based solely on its stored teamSide field.
 *   TURNOVER_LOST/KICKOUT_CONCEDED/FREE_CONCEDED do NOT leak onto both sides.
 * - Live review selectors are untouched by this module.
 */

import jsPDF from "jspdf";
import { pitchConfig } from "../core/pitch/pitch-config";
import type { PitchSport, PitchMarking } from "../core/pitch/pitch-config";
import type {
  MatchEventKind,
  MatchEventPeriod,
  MatchEventSegment,
} from "../core/stats/stats-event-model";
import { selectChainAnalysis } from "./chains/chain-selectors";
import type { ChainAnalysis } from "./chains/chain-types";
import { deriveReviewPrompts } from "./chains/review-prompts";
import type { ReviewPrompt, ReviewPromptCategory } from "./chains/review-prompts";
import { getZoneCounts, getZoneHotspots } from "./zones/zone-engine";
import type { ZoneCount } from "./zones/zone-types";

// ─── Input type ──────────────────────────────────────────────────────────────

/** Minimal shape required from LoggedMatchEvent. All fields are guaranteed
 *  present on LoggedMatchEvent — just pass loggedEvents directly. */
export type PdfExportEvent = {
  id: string;
  kind: MatchEventKind;
  /** Normalised team side — guaranteed "FOR" | "OPP" on LoggedMatchEvent */
  teamSide: "FOR" | "OPP";
  /** Guaranteed on LoggedMatchEvent */
  period: MatchEventPeriod;
  /** Guaranteed on LoggedMatchEvent */
  segment: MatchEventSegment;
  /** Normalised pitch x (0–1) */
  nx: number;
  /** Normalised pitch y (0–1) */
  ny: number;
  x?: number | null;
  y?: number | null;
  /** Sub-type tags (CLEAN, BREAK, TACKLE, SHORT, BLOCK_SAVE, etc.) from LoggedMatchEvent */
  tags?: string[] | null;
  /**
   * Match clock position in seconds. Present on LoggedMatchEvent; flows through to
   * chain analysis for temporal sequencing. Optional — chain engine falls back to
   * segment-based ordering when absent.
   */
  matchClockSeconds?: number | null;
  /** Player tagging — optional, present when an event was tagged to a specific player */
  playerId?: string | null;
  playerName?: string | null;
  playerNumber?: number | null;
  squadId?: string | null;
};

export type ReviewPdfExportInput = {
  events: readonly PdfExportEvent[];
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string;
  /** Defaults to "gaelic" */
  sport?: PitchSport;
};

// ─── Snapshot export types ────────────────────────────────────────────────────

/**
 * Lightweight report mode — each mode produces exactly 10 pages.
 * - HALF_TIME_SNAPSHOT: first-half events only; ideal for half-time team talk.
 * - FULL_TIME_SNAPSHOT: full-match events; concise post-match debrief.
 */
export type SnapshotMode = "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT";

export type SnapshotPdfExportInput = ReviewPdfExportInput & {
  /** Controls which events are included and which 10 pages are rendered. */
  snapshotMode: SnapshotMode;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// ─── Strict PDF category kind sets (no inference, no overlap) ────────────────

type PdfCategory = "ALL" | "SCORES" | "SHOTS" | "TURNOVERS" | "KICKOUTS" | "FREES";

/**
 * Kind sets for the PDF-only strict selector.
 * SHOTS is deliberately broader than the live SHOTS filter —
 * it includes all shot outcomes per the report spec.
 */
const PDF_KIND_SETS: Record<Exclude<PdfCategory, "ALL">, ReadonlySet<MatchEventKind>> = {
  SCORES: new Set<MatchEventKind>([
    "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
  ]),
  SHOTS: new Set<MatchEventKind>([
    "SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER", "FORTY_FIVE_TWO_POINT",
    "FREE_MISSED", "FREE_SCORED",
  ]),
  TURNOVERS: new Set<MatchEventKind>(["TURNOVER_WON", "TURNOVER_LOST"]),
  KICKOUTS:  new Set<MatchEventKind>(["KICKOUT_WON", "KICKOUT_CONCEDED"]),
  FREES:     new Set<MatchEventKind>(["FREE_WON", "FREE_CONCEDED", "FREE_SCORED", "FREE_MISSED"]),
};

// ─── Tactical side helper ─────────────────────────────────────────────────────

/**
 * Three event kinds where the recording team is NOT the tactical beneficiary:
 *
 *   TURNOVER_LOST    — the ball went to the other team
 *   KICKOUT_CONCEDED — the other team won possession at the kickout
 *   FREE_CONCEDED    — a free was awarded to the other team
 *
 * For these kinds, the tactical beneficiary is the OPPOSITE of event.teamSide.
 * All other kinds benefit the recording team, so tacticalSide === event.teamSide.
 */
const TACTICAL_INVERT_KINDS: ReadonlySet<MatchEventKind> = new Set<MatchEventKind>([
  "TURNOVER_LOST",
  "KICKOUT_CONCEDED",
  "FREE_CONCEDED",
]);

/**
 * Returns the tactical beneficiary side of an event.
 *
 * Examples:
 *   TURNOVER_LOST  (FOR) → "OPP"  (opposition gained the ball)
 *   KICKOUT_CONCEDED (FOR) → "OPP" (opposition won our kickout)
 *   FREE_CONCEDED  (FOR) → "OPP"  (opposition won the free)
 *   TURNOVER_LOST  (OPP) → "FOR"  (we gained the ball from them)
 *   KICKOUT_CONCEDED (OPP) → "FOR" (we won their kickout)
 *   TURNOVER_WON   (FOR) → "FOR"  (we won possession — no inversion)
 *   KICKOUT_WON    (FOR) → "FOR"  (we retained kickout — no inversion)
 *   GOAL           (OPP) → "OPP"  (they scored — no inversion)
 */
function tacticalSide(event: PdfExportEvent): "FOR" | "OPP" {
  const raw = event.teamSide === "OPP" ? "OPP" : "FOR";
  return TACTICAL_INVERT_KINDS.has(event.kind) ? (raw === "FOR" ? "OPP" : "FOR") : raw;
}

// ─── Strict PDF event selector ────────────────────────────────────────────────

/**
 * PDF-only tactical event selector.
 *
 * Filtering rules:
 *   - Half     : strict period match ("1H" or "2H")
 *   - Kind     : only kinds in the category set pass (or all if category === "ALL")
 *   - Side     : filtered by TACTICAL BENEFICIARY, not raw event ownership.
 *
 * Tactical beneficiary logic (see tacticalSide()):
 *   TURNOVER_WON   (FOR) → FOR   TURNOVER_LOST  (FOR) → OPP (they got the ball)
 *   KICKOUT_WON    (FOR) → FOR   KICKOUT_CONCEDED (FOR) → OPP (they won possession)
 *   FREE_WON       (FOR) → FOR   FREE_CONCEDED  (FOR) → OPP (their free)
 *   Mirrors apply for OPP events.
 *
 * This is PDF-only. Live-review selectors are untouched.
 * Each event appears on exactly one side — zero overlap.
 */
function selectPdfEvents(
  events: readonly PdfExportEvent[],
  half: "H1" | "H2",
  teamSide: "FOR" | "OPP" | "ALL",
  category: PdfCategory,
): PdfExportEvent[] {
  const periodTarget: MatchEventPeriod = half === "H1" ? "1H" : "2H";
  const kindSet = category === "ALL" ? null : PDF_KIND_SETS[category];

  return events.filter((event) => {
    // Skip virtual instant-score markers
    if (event.id.includes("-instant-score-")) return false;
    // Strict half filter
    if (event.period !== periodTarget) return false;
    // Kind filter
    if (kindSet !== null && !kindSet.has(event.kind)) return false;
    // Tactical side filter — groups by who BENEFITED, not raw event ownership
    if (teamSide !== "ALL" && tacticalSide(event) !== teamSide) return false;
    return true;
  });
}

// ─── Event colours (matches PáircVision CSS palette) ─────────────────────────

const EVENT_COLORS: Record<MatchEventKind, string> = {
  GOAL:                 "#ef4444",
  POINT:                "#4ade80",
  TWO_POINTER:          "#60a5fa",
  FORTY_FIVE_TWO_POINT: "#7dd3fc",
  WIDE:                 "#6b7280",
  SHOT:                 "#fbbf24",
  FREE_MISSED:          "#94a3b8",
  FREE_SCORED:          "#34d399",
  TURNOVER_WON:         "#a78bfa",
  TURNOVER_LOST:        "#f97316",
  KICKOUT_WON:          "#22d3ee",
  KICKOUT_CONCEDED:     "#fb7185",
  FREE_WON:             "#818cf8",
  FREE_CONCEDED:        "#f472b6",
};

const KIND_LABELS: Record<MatchEventKind, string> = {
  GOAL:                 "Goal",
  POINT:                "Point",
  TWO_POINTER:          "2-Pointer",
  FORTY_FIVE_TWO_POINT: "45/2pt",
  WIDE:                 "Wide",
  SHOT:                 "Shot",
  FREE_MISSED:          "Free Missed",
  FREE_SCORED:          "Free Scored",
  TURNOVER_WON:         "Turnover Won",
  TURNOVER_LOST:        "Turnover Lost",
  KICKOUT_WON:          "Kickout Won",
  KICKOUT_CONCEDED:     "Kickout Conceded",
  FREE_WON:             "Free Won",
  FREE_CONCEDED:        "Free Conceded",
};

// ─── Score helpers ────────────────────────────────────────────────────────────

type ScoreResult = { goals: number; points: number; total: number };

function scoreFromEvents(evts: readonly PdfExportEvent[]): ScoreResult {
  let goals = 0;
  let points = 0;
  for (const e of evts) {
    if (!PDF_KIND_SETS.SCORES.has(e.kind)) continue;
    if (e.kind === "GOAL") { goals++; continue; }
    if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") { points += 2; continue; }
    points++;
  }
  return { goals, points, total: goals * 3 + points };
}

function fmtScore(s: ScoreResult): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
}

function countKinds(evts: readonly PdfExportEvent[], ...kinds: MatchEventKind[]): number {
  const set = new Set<MatchEventKind>(kinds);
  return evts.filter((e) => set.has(e.kind)).length;
}

/** Count events of a specific kind that carry ANY of the given tag values */
function countKindWithAnyTag(
  evts: readonly PdfExportEvent[],
  kind: MatchEventKind,
  ...tags: string[]
): number {
  return evts.filter((e) => e.kind === kind && tags.some((t) => e.tags?.includes(t))).length;
}

/** Count events from a set of kinds that carry a specific tag value */
function countTagOnKinds(
  evts: readonly PdfExportEvent[],
  tag: string,
  ...kinds: MatchEventKind[]
): number {
  const kindSet = new Set<MatchEventKind>(kinds);
  return evts.filter((e) => kindSet.has(e.kind) && e.tags?.includes(tag)).length;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function fillDarkBg(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawTopAccentBar(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  g.addColorStop(0, "#7dd3fc");
  g.addColorStop(1, "#a78bfa");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, 6);
}

function drawPageHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  pageNum: number,
  totalPages: number,
): void {
  ctx.save();
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 24, 38);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "20px sans-serif";
  ctx.fillText(subtitle, 24, 62);

  ctx.fillStyle = "#64748b";
  ctx.font = "17px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${pageNum} / ${totalPages}`, CANVAS_W - 24, 38);
  ctx.textAlign = "left";

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 74);
  ctx.lineTo(CANVAS_W, 74);
  ctx.stroke();
  ctx.restore();
}

function drawEventCountFooter(ctx: CanvasRenderingContext2D, count: number): void {
  ctx.save();
  ctx.fillStyle = "#475569";
  ctx.font = "16px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`${count} event${count !== 1 ? "s" : ""}`, CANVAS_W - 24, CANVAS_H - 20);
  ctx.restore();
}

// ─── Pitch rendering ──────────────────────────────────────────────────────────

type PitchArea = { x: number; y: number; w: number; h: number };
type InnerPitch = { x: number; y: number; w: number; h: number };

/**
 * Renders a single PitchMarking onto a 2D canvas using the same coordinate
 * data as the PixiJS renderer, so the markings are visually identical.
 */
function renderMarking(
  ctx: CanvasRenderingContext2D,
  mark: PitchMarking,
  toX: (wx: number) => number,
  toY: (wy: number) => number,
  toW: (ww: number) => number,
  toH: (wh: number) => number,
  scaleMin: number,
): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.lineCap = "butt";

  switch (mark.kind) {
    case "line": {
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(0.5, mark.strokeWidth * scaleMin);
      if (mark.strokeDasharray) {
        ctx.setLineDash(
          mark.strokeDasharray.split(/\s+/).map((v) => parseFloat(v) * scaleMin),
        );
      }
      ctx.beginPath();
      ctx.moveTo(toX(mark.x1), toY(mark.y1));
      ctx.lineTo(toX(mark.x2), toY(mark.y2));
      ctx.stroke();
      break;
    }
    case "rect": {
      if (mark.fill) {
        ctx.fillStyle = mark.fill;
        ctx.fillRect(toX(mark.x), toY(mark.y), toW(mark.w), toH(mark.h));
      }
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(0.5, mark.strokeWidth * scaleMin);
      ctx.strokeRect(toX(mark.x), toY(mark.y), toW(mark.w), toH(mark.h));
      break;
    }
    case "circle": {
      const r = Math.max(1, mark.r * scaleMin);
      ctx.beginPath();
      ctx.arc(toX(mark.cx), toY(mark.cy), r, 0, Math.PI * 2);
      if (mark.fill) {
        ctx.fillStyle = mark.fill;
        ctx.fill();
      }
      if (mark.stroke && (mark.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = mark.stroke;
        ctx.lineWidth = Math.max(0.5, (mark.strokeWidth ?? 0.5) * scaleMin);
        ctx.stroke();
      }
      break;
    }
    case "ellipse": {
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(0.5, mark.strokeWidth * scaleMin);
      ctx.beginPath();
      ctx.ellipse(
        toX(mark.cx), toY(mark.cy),
        Math.abs(toW(mark.rx)), Math.abs(toH(mark.ry)),
        0, 0, Math.PI * 2,
      );
      ctx.stroke();
      break;
    }
    case "ellipseArc": {
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(0.5, mark.strokeWidth * scaleMin);
      if (mark.strokeLinecap) ctx.lineCap = mark.strokeLinecap;
      if (mark.opacity != null) ctx.globalAlpha = mark.opacity;
      ctx.beginPath();
      ctx.ellipse(
        toX(mark.cx), toY(mark.cy),
        Math.abs(toW(mark.rx)), Math.abs(toH(mark.ry)),
        0,
        mark.startAngle,
        mark.endAngle,
        mark.anticlockwise ?? false,
      );
      ctx.stroke();
      break;
    }
    case "path": {
      // Transform SVG path coords from world space to canvas space.
      // The paths in pitchConfig use only M and A commands.
      const transformed = mark.d
        .replace(
          /M\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)/g,
          (_m, x, y) => `M ${toX(parseFloat(x))} ${toY(parseFloat(y))}`,
        )
        .replace(
          /A\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([01])\s+([01])\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g,
          (_m, rx, ry, rot, f1, f2, x, y) =>
            `A ${Math.abs(toW(parseFloat(rx)))} ${Math.abs(toH(parseFloat(ry)))} ${rot} ${f1} ${f2} ${toX(parseFloat(x))} ${toY(parseFloat(y))}`,
        );
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = Math.max(0.5, mark.strokeWidth * scaleMin);
      if (mark.strokeLinecap) ctx.lineCap = mark.strokeLinecap;
      if (mark.opacity != null) ctx.globalAlpha = mark.opacity;
      if (mark.strokeDasharray) {
        ctx.setLineDash(
          mark.strokeDasharray.split(/\s+/).map((v) => parseFloat(v) * scaleMin),
        );
      }
      try {
        ctx.stroke(new Path2D(transformed));
      } catch {
        // Ignore path parse failures (shouldn't happen with pitchConfig data)
      }
      break;
    }
    // "text" markings are not present in pitchConfig — skip silently.
  }

  ctx.restore();
}

/**
 * Renders the full GAA/hurling pitch (turf + all markings) into `area`.
 * Returns the inner pitch bounds in canvas pixel coordinates, which are used
 * to map normalised event positions (nx, ny) to pixel positions.
 */
function renderPitch(
  ctx: CanvasRenderingContext2D,
  sport: PitchSport,
  area: PitchArea,
): InnerPitch {
  const config = pitchConfig[sport];
  // Viewbox from BOARD_PITCH_VIEWBOX: 160 × 100
  const VBW = 160;
  const VBH = 100;
  const sx = area.w / VBW;
  const sy = area.h / VBH;
  const scaleMin = Math.min(sx, sy);

  const toX = (wx: number): number => area.x + wx * sx;
  const toY = (wy: number): number => area.y + wy * sy;
  const toW = (ww: number): number => ww * sx;
  const toH = (wh: number): number => wh * sy;

  // Turf background gradient (matches PITCH_STYLE_TOKENS.turf)
  const grad = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
  grad.addColorStop(0, "#0d3b2a");
  grad.addColorStop(0.48, "#1c5238");
  grad.addColorStop(1, "#0a2f22");
  ctx.fillStyle = grad;
  ctx.fillRect(area.x, area.y, area.w, area.h);

  // Vertical turf stripes (matches create-pitch-root.ts band pattern)
  const nStripes = 14;
  const sw = area.w / nStripes;
  for (let i = 0; i < nStripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.026)" : "rgba(0,0,0,0.18)";
    ctx.fillRect(area.x + i * sw, area.y, sw, area.h);
  }

  // All pitch markings sourced directly from pitchConfig
  for (const mark of config.markings) {
    renderMarking(ctx, mark, toX, toY, toW, toH, scaleMin);
  }

  const inner = config.inner;
  return {
    x: toX(inner.x),
    y: toY(inner.y),
    w: toW(inner.w),
    h: toH(inner.h),
  };
}

/**
 * Draws coloured event markers onto the pitch.
 * Positions are mapped from normalised (nx, ny) → canvas pixels using the
 * inner pitch bounds returned by renderPitch().
 */
function renderEventMarkers(
  ctx: CanvasRenderingContext2D,
  events: readonly PdfExportEvent[],
  inner: InnerPitch,
): void {
  const r = Math.max(7, inner.w * 0.006);
  for (const event of events) {
    const ex = typeof event.x === "number" ? event.x : event.nx;
    const ey = typeof event.y === "number" ? event.y : event.ny;
    // Skip rendering if coordinates are invalid
    if (ex == null || ey == null || !isFinite(ex) || !isFinite(ey)) {
      continue;
    }
    const cx = inner.x + ex * inner.w;
    const cy = inner.y + ey * inner.h;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = EVENT_COLORS[event.kind] ?? "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** Right-side colour legend — only shows kinds present in the event list. */
function renderLegend(
  ctx: CanvasRenderingContext2D,
  events: readonly PdfExportEvent[],
): void {
  const presentKinds = [...new Set(events.map((e) => e.kind))];
  if (presentKinds.length === 0) return;

  const lx = CANVAS_W - 158;
  let ly = 90;

  ctx.save();
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#475569";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("LEGEND", lx, ly);
  ly += 22;

  for (const kind of presentKinds) {
    if (ly > CANVAS_H - 60) break;
    const color = EVENT_COLORS[kind] ?? "#ffffff";
    ctx.beginPath();
    ctx.arc(lx + 7, ly, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px sans-serif";
    ctx.fillText(KIND_LABELS[kind] ?? kind, lx + 18, ly + 1);
    ly += 22;
  }
  ctx.restore();
}

// ─── Page builders ────────────────────────────────────────────────────────────

/** Builds a single tactical pitch page canvas (pages 3–22). */
function makeTacticalPage(
  sport: PitchSport,
  events: readonly PdfExportEvent[],
  title: string,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const ctx2 = canvas.getContext("2d");
    if (ctx2) {
      ctx2.fillStyle = "#0d1117";
      ctx2.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx2.fillStyle = "#94a3b8";
      ctx2.font = "24px sans-serif";
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      ctx2.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    return canvas;
  }

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, title, `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, events.length);

  // Pitch occupies most of the canvas; right 168px reserved for legend
  const pitchArea: PitchArea = {
    x: 24,
    y: 80,
    w: CANVAS_W - 24 - 168,
    h: CANVAS_H - 80 - 38,
  };

  const inner = renderPitch(ctx, sport, pitchArea);
  renderEventMarkers(ctx, events, inner);
  renderLegend(ctx, events);

  return canvas;
}

/**
 * Draws two mirrored full-breakdown team stat blocks.
 *
 * Five sections per block: SCORING / SHOT DETAIL / KICKOUTS / TURNOVERS / FREES.
 * All tracked sub-type tags are represented — nothing is omitted.
 *
 * Row counts: SCORING=7, SHOT DETAIL=4, KICKOUTS=10, TURNOVERS=8, FREES=4 → 33 data rows.
 * Geometry: rowH=20, secH=18 → BLOCK_H≈793px.
 * With default blockY=244: bottom y=1037 — safe within canvas (footer at y=1060).
 * With blockY=162 (segment detail pages): bottom y=955 — very comfortable.
 */
function drawSummaryStatsTable(
  ctx: CanvasRenderingContext2D,
  events: readonly PdfExportEvent[],
  homeTeam: string,
  awayTeam: string,
  blockY = 244,
): void {
  const forEvts = events.filter(
    (e) => e.teamSide === "FOR" && !e.id.includes("-instant-score-"),
  );
  const oppEvts = events.filter(
    (e) => e.teamSide === "OPP" && !e.id.includes("-instant-score-"),
  );

  const SHOT_KINDS: MatchEventKind[] = [
    "SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER",
    "FORTY_FIVE_TWO_POINT", "FREE_MISSED", "FREE_SCORED",
  ];
  const SCORE_KINDS: MatchEventKind[] = [
    "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
  ];

  type BlockStats = {
    goals: number; points: number; twoPointers: number; scoreTotal: number;
    shots: number; wides: number; conv: string;
    shotShort: number; shotPost: number; shot45: number; shotBlock: number;
    koWon: number; koCon: number; koPct: string;
    koCleanWon: number; koBreakWon: number;
    koCleanLost: number; koBreakLost: number;
    koFoulWon: number; koFoulCon: number; koKickedDead: number;
    toWon: number; toLost: number; netTo: number;
    toTacklePress: number; toSwarmInt: number;
    toUnforced: number; toSlackKpHp: number; toOcStripped: number;
    freesWon: number; freesCon: number; freeScored: number; freeMissed: number;
  };

  function buildStats(ownEvts: readonly PdfExportEvent[], otherEvts: readonly PdfExportEvent[]): BlockStats {
    const scoreR    = scoreFromEvents(ownEvts);
    const shots     = countKinds(ownEvts, ...SHOT_KINDS);
    const scoreKind = countKinds(ownEvts, ...SCORE_KINDS);

    // ── Tactical mirroring: count by beneficiary, not recorder ──
    // K/O Won = kickouts we retained (ownKICKOUT_WON) + their kickouts we won (otherKICKOUT_CONCEDED)
    // K/O Lost = our kickouts they won (ownKICKOUT_CONCEDED) + their kickouts they retained (otherKICKOUT_WON)
    const koWon   = countKinds(ownEvts, "KICKOUT_WON")    + countKinds(otherEvts, "KICKOUT_CONCEDED");
    const koCon   = countKinds(ownEvts, "KICKOUT_CONCEDED") + countKinds(otherEvts, "KICKOUT_WON");
    const koTotal = koWon + koCon;

    // T/O Won = our own turnovers won + their turnovers lost (which we gained)
    const toWon  = countKinds(ownEvts, "TURNOVER_WON")  + countKinds(otherEvts, "TURNOVER_LOST");
    const toLost = countKinds(ownEvts, "TURNOVER_LOST") + countKinds(otherEvts, "TURNOVER_WON");

    // Frees Won = our own frees won + their frees conceded (which become our frees)
    const freesWon = countKinds(ownEvts, "FREE_WON")      + countKinds(otherEvts, "FREE_CONCEDED");
    const freesCon = countKinds(ownEvts, "FREE_CONCEDED") + countKinds(otherEvts, "FREE_WON");

    return {
      goals:          scoreR.goals,
      points:         scoreR.points,
      twoPointers:    countKinds(ownEvts, "TWO_POINTER", "FORTY_FIVE_TWO_POINT"),
      scoreTotal:     scoreR.total,
      shots,
      wides:          countKinds(ownEvts, "WIDE"),
      conv:           shots > 0 ? `${Math.round((scoreKind / shots) * 100)}%` : "—",
      // Shot sub-types — own events only (shots are not mirrored)
      shotShort:      countTagOnKinds(ownEvts, "SHORT",      ...SHOT_KINDS),
      shotPost:       countTagOnKinds(ownEvts, "POST",       ...SHOT_KINDS),
      shot45:         countTagOnKinds(ownEvts, "FORTY_FIVE", ...SHOT_KINDS),
      shotBlock:      countKindWithAnyTag(ownEvts, "SHOT", "BLOCK_SAVE", "BLOCKED")
                    + countKindWithAnyTag(ownEvts, "WIDE", "BLOCK_SAVE", "BLOCKED"),
      // Kickouts — mirrored top-level counts; sub-tags follow same mirror logic
      koWon, koCon,
      koPct:          koTotal > 0 ? `${Math.round((koWon / koTotal) * 100)}%` : "—",
      koCleanWon:     countKindWithAnyTag(ownEvts,   "KICKOUT_WON",      "CLEAN")
                    + countKindWithAnyTag(otherEvts, "KICKOUT_CONCEDED", "CLEAN"),
      koBreakWon:     countKindWithAnyTag(ownEvts,   "KICKOUT_WON",      "BREAK")
                    + countKindWithAnyTag(otherEvts, "KICKOUT_CONCEDED", "BREAK"),
      koCleanLost:    countKindWithAnyTag(ownEvts,   "KICKOUT_CONCEDED", "CLEAN")
                    + countKindWithAnyTag(otherEvts, "KICKOUT_WON",      "CLEAN"),
      koBreakLost:    countKindWithAnyTag(ownEvts,   "KICKOUT_CONCEDED", "BREAK")
                    + countKindWithAnyTag(otherEvts, "KICKOUT_WON",      "BREAK"),
      koFoulWon:      countKindWithAnyTag(ownEvts,   "KICKOUT_WON",      "FOUL_WON")
                    + countKindWithAnyTag(otherEvts, "KICKOUT_CONCEDED", "FOUL_WON"),
      koFoulCon:      countKindWithAnyTag(ownEvts,   "KICKOUT_CONCEDED", "FOUL_CONCEDED")
                    + countKindWithAnyTag(otherEvts, "KICKOUT_WON",      "FOUL_CONCEDED"),
      koKickedDead:   countKindWithAnyTag(ownEvts,   "KICKOUT_CONCEDED", "KICKED_DEAD")
                    + countKindWithAnyTag(otherEvts, "KICKOUT_WON",      "KICKED_DEAD"),
      // Turnovers — mirrored top-level counts; sub-tags on TURNOVER_WON are "how we won it",
      // on TURNOVER_LOST are "how we lost it" — mirror by inverting the kind too
      toWon, toLost, netTo: toWon - toLost,
      toTacklePress:  countKindWithAnyTag(ownEvts,   "TURNOVER_WON",  "TACKLE", "PRESS")
                    + countKindWithAnyTag(otherEvts, "TURNOVER_LOST", "TACKLE", "PRESS"),
      toSwarmInt:     countKindWithAnyTag(ownEvts,   "TURNOVER_WON",  "SWARM",  "INTERCEPT")
                    + countKindWithAnyTag(otherEvts, "TURNOVER_LOST", "SWARM",  "INTERCEPT"),
      toUnforced:     countKindWithAnyTag(ownEvts,   "TURNOVER_LOST", "UNFORCED")
                    + countKindWithAnyTag(otherEvts, "TURNOVER_WON",  "UNFORCED"),
      toSlackKpHp:    countKindWithAnyTag(ownEvts,   "TURNOVER_LOST", "SLACK_KICK_PASS", "SLACK_HAND_PASS")
                    + countKindWithAnyTag(otherEvts, "TURNOVER_WON",  "SLACK_KICK_PASS", "SLACK_HAND_PASS"),
      toOcStripped:   countKindWithAnyTag(ownEvts,   "TURNOVER_LOST", "OVERCARRIED", "STRIPPED")
                    + countKindWithAnyTag(otherEvts, "TURNOVER_WON",  "OVERCARRIED", "STRIPPED"),
      // Frees — mirrored
      freesWon,
      freesCon,
      freeScored:     countKinds(ownEvts, "FREE_SCORED"),
      freeMissed:     countKinds(ownEvts, "FREE_MISSED"),
    };
  }

  const forStats = buildStats(forEvts, oppEvts);
  const oppStats = buildStats(oppEvts, forEvts);

  // ── Block geometry ────────────────────────────────────────────────────────────
  // Rows: SCORING=7, SHOT DETAIL=4, KICKOUTS=10, TURNOVERS=8, FREES=4 → 33 data rows
  // BLOCK_H = hdrH(28)+hdrGap(3) + 5×secH(90) + 33×rowH(660) + 4×gap(12) = 793px
  const blockW  = 848;
  const blockX1 = 72;
  const blockX2 = 1000;
  const rowH    = 20;
  const secH    = 18;
  const hdrH    = 28;
  const gap     = 3;
  const BLOCK_H = 793;

  type SRow = { label: string; value: string; vColor?: string };
  type Section = { label: string; accent: string; bg: string; rows: SRow[] };

  function makeSections(st: BlockStats): Section[] {
    const netStr   = st.netTo >= 0 ? `+${st.netTo}` : String(st.netTo);
    const netColor = st.netTo > 0  ? "#4ade80" : st.netTo < 0 ? "#fb7185" : "#94a3b8";
    return [
      {
        label: "SCORING", accent: "#7dd3fc", bg: "rgba(125,211,252,0.08)",
        rows: [
          { label: "Goals",          value: String(st.goals) },
          { label: "Points",         value: String(st.points) },
          { label: "2-Pointers",     value: String(st.twoPointers) },
          { label: "Total Score",    value: String(st.scoreTotal) },
          { label: "Shots",          value: String(st.shots) },
          { label: "Wides",          value: String(st.wides) },
          { label: "Conversion",     value: st.conv },
        ],
      },
      {
        label: "SHOT DETAIL", accent: "#fbbf24", bg: "rgba(251,191,36,0.06)",
        rows: [
          { label: "Short",          value: String(st.shotShort) },
          { label: "Post",           value: String(st.shotPost) },
          { label: "45",             value: String(st.shot45) },
          { label: "Block / Save",   value: String(st.shotBlock) },
        ],
      },
      {
        label: "KICKOUTS", accent: "#22d3ee", bg: "rgba(34,211,238,0.06)",
        rows: [
          { label: "Kickout Won",        value: String(st.koWon) },
          { label: "Kickout Lost",       value: String(st.koCon) },
          { label: "Kickout %",          value: st.koPct },
          { label: "Clean Won",      value: String(st.koCleanWon) },
          { label: "Break Won",      value: String(st.koBreakWon) },
          { label: "Foul Won",       value: String(st.koFoulWon) },
          { label: "Clean Lost",     value: String(st.koCleanLost) },
          { label: "Break Lost",     value: String(st.koBreakLost) },
          { label: "Foul Conceded",  value: String(st.koFoulCon) },
          { label: "Kicked Dead",    value: String(st.koKickedDead) },
        ],
      },
      {
        label: "TURNOVERS", accent: "#a78bfa", bg: "rgba(167,139,250,0.08)",
        rows: [
          { label: "T/O Won",        value: String(st.toWon) },
          { label: "T/O Lost",       value: String(st.toLost) },
          { label: "Net T/O",        value: netStr, vColor: netColor },
          { label: "Tackle / Press", value: String(st.toTacklePress) },
          { label: "Swarm / Int.",   value: String(st.toSwarmInt) },
          { label: "Unforced",       value: String(st.toUnforced) },
          { label: "Slack KP / HP",  value: String(st.toSlackKpHp) },
          { label: "OC / Stripped",  value: String(st.toOcStripped) },
        ],
      },
      {
        label: "FREES", accent: "#34d399", bg: "rgba(52,211,153,0.08)",
        rows: [
          { label: "Frees Won",      value: String(st.freesWon) },
          { label: "Frees Conceded", value: String(st.freesCon) },
          { label: "Free Scored",    value: String(st.freeScored) },
          { label: "Free Missed",    value: String(st.freeMissed) },
        ],
      },
    ];
  }

  function drawBlock(bx: number, teamName: string, st: BlockStats, accent: string): void {
    const sections = makeSections(st);
    ctx.save();

    // Card background + left accent bar
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(bx, blockY, blockW, BLOCK_H);
    ctx.fillStyle = accent;
    ctx.fillRect(bx, blockY, 4, BLOCK_H);

    let cy = blockY;

    // Team-name header
    ctx.fillStyle = accent;
    ctx.font = "bold 16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(teamName.toUpperCase(), bx + 16, cy + hdrH / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + 4, cy + hdrH);
    ctx.lineTo(bx + blockW, cy + hdrH);
    ctx.stroke();
    cy += hdrH + gap;

    for (const sec of sections) {
      // Section header bar
      ctx.fillStyle = sec.bg;
      ctx.fillRect(bx + 4, cy, blockW - 4, secH);
      ctx.fillStyle = sec.accent;
      ctx.fillRect(bx + 4, cy, 3, secH);
      ctx.font = "bold 10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(sec.label, bx + 16, cy + secH / 2);
      cy += secH;

      sec.rows.forEach(({ label, value, vColor }, ri) => {
        if (ri % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.025)";
          ctx.fillRect(bx + 4, cy, blockW - 4, rowH);
        }
        const midY = cy + rowH / 2;
        ctx.fillStyle = "#94a3b8";
        ctx.font = "12px sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(label, bx + 12, midY);
        ctx.fillStyle = vColor ?? "#f1f5f9";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(value, bx + blockW - 10, midY);
        cy += rowH;
      });

      cy += gap;
    }

    ctx.restore();
  }

  drawBlock(blockX1, homeTeam, forStats, "#7dd3fc");
  drawBlock(blockX2, awayTeam, oppStats, "#fb7185");

  // "v" label centred in the gap between the two blocks
  ctx.save();
  ctx.fillStyle = "#334155";
  ctx.font = "bold 20px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("v", 960, blockY + hdrH / 2);
  ctx.restore();
}

/** Builds the Match Summary canvas (page 1). */
function makeSummaryPage(
  events: readonly PdfExportEvent[],
  homeTeam: string,
  awayTeam: string,
  venueName: string | undefined,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);

  const validEvts = events.filter((e) => !e.id.includes("-instant-score-"));
  const forEvts  = validEvts.filter((e) => e.teamSide === "FOR");
  const oppEvts  = validEvts.filter((e) => e.teamSide === "OPP");
  const forScore = scoreFromEvents(forEvts);
  const oppScore = scoreFromEvents(oppEvts);

  ctx.save();
  ctx.textBaseline = "middle";

  // ── Page header ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Match Summary", 24, 38);

  const venueStr = venueName ? `  ·  ${venueName}` : "";
  ctx.fillStyle = "#64748b";
  ctx.font = "18px sans-serif";
  ctx.fillText(`PáircVision Report${venueStr}`, 24, 62);

  ctx.fillStyle = "#64748b";
  ctx.font = "17px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`1 / ${totalPages}`, CANVAS_W - 24, 38);
  ctx.textAlign = "left";

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 74);
  ctx.lineTo(CANVAS_W, 74);
  ctx.stroke();

  // ── Scoreline zone: y=80–240 ──────────────────────────────────────────────────
  // Centres align with the FOR and OPP stat blocks below
  //   FOR block: x=72, w=848  → centre x=496
  //   OPP block: x=1000, w=848 → centre x=1424
  const forCX = 72 + 424;    // 496
  const oppCX = 1000 + 424;  // 1424

  // Team names — large, colour-coded to match their block accent
  ctx.font = "bold 44px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#7dd3fc";
  ctx.fillText(homeTeam.toUpperCase(), forCX, 118);
  ctx.fillStyle = "#fb7185";
  ctx.fillText(awayTeam.toUpperCase(), oppCX, 118);

  // Scores — large, boldly coloured
  ctx.font = "bold 64px sans-serif";
  ctx.fillStyle = "#4ade80";
  ctx.fillText(fmtScore(forScore), forCX, 198);
  ctx.fillStyle = "#fb7185";
  ctx.fillText(fmtScore(oppScore), oppCX, 198);

  // "v" centred between the two team columns
  ctx.font = "bold 38px sans-serif";
  ctx.fillStyle = "#334155";
  ctx.fillText("v", Math.round(CANVAS_W / 2), 158);

  // Gradient accent divider that separates the scoreline from the stat blocks
  const dg = ctx.createLinearGradient(72, 0, CANVAS_W - 72, 0);
  dg.addColorStop(0,   "rgba(125,211,252,0.45)");
  dg.addColorStop(0.5, "rgba(255,255,255,0.08)");
  dg.addColorStop(1,   "rgba(251,113,133,0.45)");
  ctx.strokeStyle = dg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(72, 240);
  ctx.lineTo(CANVAS_W - 72, 240);
  ctx.stroke();

  ctx.restore();

  // ── Two-block stats table (starts at y=244) ───────────────────────────────────
  drawSummaryStatsTable(ctx, events, homeTeam, awayTeam);

  // ── Footer ────────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = "#475569";
  ctx.font = "15px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`${validEvts.length} total events`, CANVAS_W - 24, CANVAS_H - 20);
  ctx.restore();

  return canvas;
}

/** Builds the Game Segments Breakdown canvas (page 2). */
function makeSegmentsPage(
  events: readonly PdfExportEvent[],
  homeTeam: string,
  awayTeam: string,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // ── Page header ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("Game Segments Breakdown", 24, 38);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "20px sans-serif";
  ctx.fillText(`${homeTeam} v ${awayTeam}`, 24, 62);
  ctx.fillStyle = "#64748b";
  ctx.font = "17px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`2 / ${totalPages}`, CANVAS_W - 24, 38);
  ctx.textAlign = "left";

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 74);
  ctx.lineTo(CANVAS_W, 74);
  ctx.stroke();

  const validEvts = events.filter((e) => !e.id.includes("-instant-score-"));

  type SegDef = { seg: MatchEventSegment; label: string; period: MatchEventPeriod };

  // ── Table geometry ─────────────────────────────────────────────────────────────
  // Centered: tableLeft=280, tableW=1360, right edge=1640, right margin=280
  // Columns: seg(160) | FOR: Score(170)+Shots(110)+K/O(120)+NetTO(80)+Frees(120)=600
  //                   | OPP: same 600
  const tL    = 280;   // tableLeft
  const segW  = 160;
  // column starts within each team block:
  const cScore = 0;   const wScore = 170;
  const cShots = 170; const wShots = 110;
  const cKO    = 280; const wKO    = 120;
  const cTO    = 400; const wTO    = 80;
  const cFree  = 480; const wFree  = 120;
  const teamW  = wScore + wShots + wKO + wTO + wFree; // 600
  const tableW = segW + teamW * 2;                     // 1360

  const titleH = 34;   // coloured section title bar
  const hdr1H  = 28;   // team-name banner row
  const hdr2H  = 26;   // stat-label sub-header row
  const dataH  = 54;   // per-segment data row
  const totH   = 54;   // total row
  // Per-half block height: titleH + hdr1H + hdr2H + 3×dataH + totH
  const blockH = titleH + hdr1H + hdr2H + 3 * dataH + totH; // 34+28+26+162+54 = 304
  const secGap = 50;
  const h1Top  = 82;
  const h2Top  = h1Top + blockH + secGap;  // 82+304+50 = 436

  type HalfSpec = {
    title: string; accent: string; accentBg: string;
    period: MatchEventPeriod; segs: SegDef[]; top: number;
  };
  const halves: HalfSpec[] = [
    {
      title: "FIRST HALF", accent: "#7dd3fc", accentBg: "rgba(125,211,252,0.1)",
      period: "1H", top: h1Top,
      segs: [
        { seg: 1, label: "Early (0–10)",  period: "1H" },
        { seg: 2, label: "Mid  (11–20)",  period: "1H" },
        { seg: 3, label: "Late (21–30+)", period: "1H" },
      ],
    },
    {
      title: "SECOND HALF", accent: "#a78bfa", accentBg: "rgba(167,139,250,0.1)",
      period: "2H", top: h2Top,
      segs: [
        { seg: 4, label: "Early (0–10)",  period: "2H" },
        { seg: 5, label: "Mid  (11–20)",  period: "2H" },
        { seg: 6, label: "Late (21–30+)", period: "2H" },
      ],
    },
  ];

  // Helper: build per-segment stats for one side — with tactical mirroring
  function segStats(evts: readonly PdfExportEvent[], period: MatchEventPeriod, seg: MatchEventSegment, side: "FOR" | "OPP") {
    const other = side === "FOR" ? "OPP" : "FOR";
    const own = evts.filter((ev) => ev.period === period && ev.segment === seg && ev.teamSide === side);
    const opp = evts.filter((ev) => ev.period === period && ev.segment === seg && ev.teamSide === other);
    const score  = scoreFromEvents(own);
    const shots  = countKinds(own, "SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_MISSED", "FREE_SCORED");
    const wides  = countKinds(own, "WIDE");
    // Tactical mirroring: K/O Won = own retained + other conceded; K/O Lost = own conceded + other retained
    const koWon  = countKinds(own, "KICKOUT_WON")    + countKinds(opp, "KICKOUT_CONCEDED");
    const koCon  = countKinds(own, "KICKOUT_CONCEDED") + countKinds(opp, "KICKOUT_WON");
    const koTot  = koWon + koCon;
    const toWon  = countKinds(own, "TURNOVER_WON")  + countKinds(opp, "TURNOVER_LOST");
    const toLost = countKinds(own, "TURNOVER_LOST") + countKinds(opp, "TURNOVER_WON");
    const fWon   = countKinds(own, "FREE_WON")      + countKinds(opp, "FREE_CONCEDED");
    const fCon   = countKinds(own, "FREE_CONCEDED") + countKinds(opp, "FREE_WON");
    return { score, shots, wides, koWon, koCon, koTot, toWon, toLost, netTo: toWon - toLost, fWon, fCon };
  }

  halves.forEach(({ title, accent, accentBg, period, segs, top }) => {
    const forX = tL + segW;           // FOR columns start
    const oppX = tL + segW + teamW;   // OPP columns start

    // ── Section title bar ────────────────────────────────────────────────────────
    ctx.fillStyle = accentBg;
    ctx.fillRect(tL, top, tableW, titleH);
    ctx.fillStyle = accent;
    ctx.fillRect(tL, top, 4, titleH);
    ctx.font = "bold 18px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(title, tL + 18, top + titleH / 2);

    // ── Team-name banner ─────────────────────────────────────────────────────────
    const hdr1Y = top + titleH;
    ctx.fillStyle = "rgba(125,211,252,0.07)";
    ctx.fillRect(forX, hdr1Y, teamW, hdr1H);
    ctx.fillStyle = "rgba(251,113,133,0.07)";
    ctx.fillRect(oppX, hdr1Y, teamW, hdr1H);

    ctx.font = "bold 16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(homeTeam.toUpperCase(), forX + teamW / 2, hdr1Y + hdr1H / 2);
    ctx.fillStyle = "#fb7185";
    ctx.fillText(awayTeam.toUpperCase(), oppX + teamW / 2, hdr1Y + hdr1H / 2);

    // Segment column label
    ctx.fillStyle = "#475569";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SEGMENT", tL + 10, hdr1Y + hdr1H / 2);

    // ── Stat-label sub-header row ─────────────────────────────────────────────────
    const hdr2Y = hdr1Y + hdr1H;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(tL, hdr2Y, tableW, hdr2H);
    ctx.fillStyle = accent;
    ctx.fillRect(tL, hdr2Y, 4, hdr2H);

    const subLabels = ["Score", "Shots/W", "Kickout W-L", "Net T/O", "Frees W/C"];
    const subOffsets = [cScore + wScore / 2, cShots + wShots / 2, cKO + wKO / 2, cTO + wTO / 2, cFree + wFree / 2];

    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    [forX, oppX].forEach((teamStart) => {
      subLabels.forEach((lbl, i) => {
        ctx.fillText(lbl, teamStart + subOffsets[i], hdr2Y + hdr2H / 2);
      });
    });

    // ── Data rows ─────────────────────────────────────────────────────────────────
    let totFor = { score: { goals: 0, points: 0, total: 0 } as ScoreResult, shots: 0, wides: 0, koWon: 0, koCon: 0, koTot: 0, toWon: 0, toLost: 0, netTo: 0, fWon: 0, fCon: 0 };
    let totOpp = { ...totFor };

    segs.forEach(({ seg, label }, si) => {
      const fs = segStats(validEvts, period, seg, "FOR");
      const os = segStats(validEvts, period, seg, "OPP");

      // Accumulate totals
      totFor = { score: { goals: totFor.score.goals + fs.score.goals, points: totFor.score.points + fs.score.points, total: totFor.score.total + fs.score.total }, shots: totFor.shots + fs.shots, wides: totFor.wides + fs.wides, koWon: totFor.koWon + fs.koWon, koCon: totFor.koCon + fs.koCon, koTot: totFor.koTot + fs.koTot, toWon: totFor.toWon + fs.toWon, toLost: totFor.toLost + fs.toLost, netTo: totFor.netTo + fs.netTo, fWon: totFor.fWon + fs.fWon, fCon: totFor.fCon + fs.fCon };
      totOpp = { score: { goals: totOpp.score.goals + os.score.goals, points: totOpp.score.points + os.score.points, total: totOpp.score.total + os.score.total }, shots: totOpp.shots + os.shots, wides: totOpp.wides + os.wides, koWon: totOpp.koWon + os.koWon, koCon: totOpp.koCon + os.koCon, koTot: totOpp.koTot + os.koTot, toWon: totOpp.toWon + os.toWon, toLost: totOpp.toLost + os.toLost, netTo: totOpp.netTo + os.netTo, fWon: totOpp.fWon + os.fWon, fCon: totOpp.fCon + os.fCon };

      const rowY = hdr2Y + hdr2H + si * dataH;
      const midY = rowY + dataH / 2;

      // Row tint
      if (si % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.022)";
        ctx.fillRect(tL, rowY, tableW, dataH);
      }
      // Row separator
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tL, rowY + dataH);
      ctx.lineTo(tL + tableW, rowY + dataH);
      ctx.stroke();

      // Segment label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "17px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(label, tL + 10, midY);

      // Helper: draw one team's values at teamStart offset
      function drawTeamCells(teamStart: number, st: typeof fs, isFor: boolean): void {
        ctx.textAlign = "center";
        const netCol = st.netTo >= 0 ? "#4ade80" : "#fb7185";
        const koStr  = `${st.koWon}-${st.koCon}`;
        const fStr   = `${st.fWon} / ${st.fCon}`;
        const shoStr = `${st.shots} / ${st.wides}`;
        const netStr = st.netTo >= 0 ? `+${st.netTo}` : String(st.netTo);

        ctx.fillStyle = isFor ? "#4ade80" : "#fb7185";
        ctx.font = "bold 17px sans-serif";
        ctx.fillText(fmtScore(st.score), teamStart + cScore + wScore / 2, midY);

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "16px sans-serif";
        ctx.fillText(shoStr, teamStart + cShots + wShots / 2, midY);
        ctx.fillText(koStr,  teamStart + cKO    + wKO    / 2, midY);
        ctx.fillStyle = netCol;
        ctx.font = "bold 17px sans-serif";
        ctx.fillText(netStr, teamStart + cTO    + wTO    / 2, midY);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "16px sans-serif";
        ctx.fillText(fStr,   teamStart + cFree  + wFree  / 2, midY);
      }

      drawTeamCells(forX, fs, true);
      drawTeamCells(oppX, os, false);
    });

    // ── TOTAL row ─────────────────────────────────────────────────────────────────
    const totalY = hdr2Y + hdr2H + segs.length * dataH;
    const totMidY = totalY + totH / 2;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tL, totalY);
    ctx.lineTo(tL + tableW, totalY);
    ctx.stroke();

    ctx.fillStyle = accentBg;
    ctx.fillRect(tL, totalY, tableW, totH);
    ctx.fillStyle = accent;
    ctx.fillRect(tL, totalY, 4, totH);

    ctx.fillStyle = accent;
    ctx.font = "bold 16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("TOTAL", tL + 10, totMidY);

    function drawTotalCells(teamStart: number, tot: typeof totFor, isFor: boolean): void {
      ctx.textAlign = "center";
      const netCol = tot.netTo >= 0 ? "#4ade80" : "#fb7185";
      const netStr = tot.netTo >= 0 ? `+${tot.netTo}` : String(tot.netTo);

      ctx.fillStyle = isFor ? "#4ade80" : "#fb7185";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(fmtScore(tot.score), teamStart + cScore + wScore / 2, totMidY);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(`${tot.shots} / ${tot.wides}`, teamStart + cShots + wShots / 2, totMidY);
      ctx.fillText(`${tot.koWon}-${tot.koCon}`,   teamStart + cKO    + wKO    / 2, totMidY);
      ctx.fillStyle = netCol;
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(netStr, teamStart + cTO + wTO / 2, totMidY);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(`${tot.fWon} / ${tot.fCon}`, teamStart + cFree + wFree / 2, totMidY);
    }

    drawTotalCells(forX, totFor, true);
    drawTotalCells(oppX, totOpp, false);

    // ── Column dividers ────────────────────────────────────────────────────────────
    const divTop  = hdr2Y;
    const divBot  = totalY + totH;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    // Major divider: seg / FOR, FOR / OPP
    [tL + segW, tL + segW + teamW].forEach((x) => {
      ctx.beginPath(); ctx.moveTo(x, divTop); ctx.lineTo(x, divBot); ctx.stroke();
    });
    // Minor stat dividers within each team block
    [cShots, cKO, cTO, cFree].forEach((offset) => {
      [forX + offset, oppX + offset].forEach((x) => {
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath(); ctx.moveTo(x, divTop); ctx.lineTo(x, divBot); ctx.stroke();
      });
    });
  });

  ctx.restore();
  return canvas;
}

// ─── Segment detail page ─────────────────────────────────────────────────────

/**
 * Builds a full-breakdown canvas for one game segment (pages 3–8).
 * Uses the same 5-section stats table as the match summary, filtered to a
 * single (period, segment) pair. Mini scoreline for that segment at the top.
 */
function makeSegmentDetailPage(
  events: readonly PdfExportEvent[],
  period: MatchEventPeriod,
  segment: MatchEventSegment,
  segLabel: string,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, segLabel, `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // Filter to this segment only
  const segEvts = events.filter(
    (e) => !e.id.includes("-instant-score-") && e.period === period && e.segment === segment,
  );
  const forEvts  = segEvts.filter((e) => e.teamSide === "FOR");
  const oppEvts  = segEvts.filter((e) => e.teamSide === "OPP");
  const forScore = scoreFromEvents(forEvts);
  const oppScore = scoreFromEvents(oppEvts);

  // Mini scoreline — y=80 to y=158
  const forCX = 72 + 424;   // 496 — centres align with stat blocks below
  const oppCX = 1000 + 424; // 1424

  ctx.save();
  ctx.textBaseline = "middle";

  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#7dd3fc";
  ctx.fillText(homeTeam.toUpperCase(), forCX, 102);
  ctx.fillStyle = "#fb7185";
  ctx.fillText(awayTeam.toUpperCase(), oppCX, 102);

  ctx.font = "bold 40px sans-serif";
  ctx.fillStyle = "#4ade80";
  ctx.fillText(fmtScore(forScore), forCX, 142);
  ctx.fillStyle = "#fb7185";
  ctx.fillText(fmtScore(oppScore), oppCX, 142);

  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#334155";
  ctx.fillText("v", Math.round(CANVAS_W / 2), 122);

  const dg = ctx.createLinearGradient(72, 0, CANVAS_W - 72, 0);
  dg.addColorStop(0,   "rgba(125,211,252,0.35)");
  dg.addColorStop(0.5, "rgba(255,255,255,0.06)");
  dg.addColorStop(1,   "rgba(251,113,133,0.35)");
  ctx.strokeStyle = dg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(72, 158);
  ctx.lineTo(CANVAS_W - 72, 158);
  ctx.stroke();
  ctx.restore();

  // Full stats table, starting at y=162 (BLOCK_H≈793, bottom≈955 — very comfortable)
  drawSummaryStatsTable(ctx, segEvts, homeTeam, awayTeam, 162);

  // Footer
  ctx.save();
  ctx.fillStyle = "#475569";
  ctx.font = "15px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`${segEvts.length} event${segEvts.length !== 1 ? "s" : ""} in segment`, CANVAS_W - 24, CANVAS_H - 20);
  ctx.restore();

  return canvas;
}

// ─── Player Breakdown pages ───────────────────────────────────────────────────

/**
 * Shared player stats type used by collectPlayerStats, calcPlayerPageCount,
 * and makePlayerPages.
 */
type PlayerStatsFull = {
  id: string;
  number: number | null;
  name: string | null;
  teamSide: "FOR" | "OPP";
  actions: number;
  goals: number; scorePoints: number; scoreTotal: number;
  shots: number; wides: number;
  toWon: number; toLost: number;
  koWon: number; koCon: number;
  freesWon: number; freesCon: number;
};

/** Collects and sorts all player-tagged stats from events. */
function collectPlayerStats(events: readonly PdfExportEvent[]): PlayerStatsFull[] {
  const playerMap = new Map<string, PlayerStatsFull>();
  const validEvts = events.filter((e) => !e.id.includes("-instant-score-"));

  for (const e of validEvts) {
    if (e.playerId == null && e.playerNumber == null) continue;
    const key = e.playerId ?? `__num_${e.playerNumber ?? "?"}`;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        id:         e.playerId ?? key,
        number:     typeof e.playerNumber === "number" ? e.playerNumber : null,
        name:       typeof e.playerName === "string" && e.playerName.trim() ? e.playerName.trim() : null,
        teamSide:   e.teamSide,
        actions: 0,
        goals: 0, scorePoints: 0, scoreTotal: 0,
        shots: 0, wides: 0,
        toWon: 0, toLost: 0,
        koWon: 0, koCon: 0,
        freesWon: 0, freesCon: 0,
      });
    }
    const ps = playerMap.get(key)!;
    ps.actions++;
    if (e.kind === "GOAL")                                                    { ps.goals++;         ps.scoreTotal += 3; }
    else if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT")  { ps.scorePoints += 2; ps.scoreTotal += 2; }
    else if (e.kind === "POINT" || e.kind === "FREE_SCORED")                 { ps.scorePoints += 1; ps.scoreTotal += 1; }
    if (PDF_KIND_SETS.SHOTS.has(e.kind)) ps.shots++;
    if (e.kind === "WIDE")               ps.wides++;
    if (e.kind === "TURNOVER_WON")       ps.toWon++;
    if (e.kind === "TURNOVER_LOST")      ps.toLost++;
    if (e.kind === "KICKOUT_WON")        ps.koWon++;
    if (e.kind === "KICKOUT_CONCEDED")   ps.koCon++;
    if (e.kind === "FREE_WON")           ps.freesWon++;
    if (e.kind === "FREE_CONCEDED")      ps.freesCon++;
  }

  return Array.from(playerMap.values()).sort((a, b) => {
    if (a.teamSide !== b.teamSide) return a.teamSide === "FOR" ? -1 : 1;
    if (a.number != null && b.number != null) return a.number - b.number;
    if (a.number != null) return -1;
    if (b.number != null) return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

/**
 * Pre-computes how many player breakdown pages will be needed.
 * Mirrors the exact page-break logic in makePlayerPages — must stay in sync.
 */
function calcPlayerPageCount(events: readonly PdfExportEvent[]): number {
  const players = collectPlayerStats(events);
  if (players.length === 0) return 1; // "no data" page

  const HDR_H = 44;   // table column header
  const SEC_H = 30;   // team section banner
  const ROW_H = 40;   // player data row
  const BREAK_LIMIT = CANVAS_H - 28; // 1052

  let pages = 1;
  let ry = 82 + HDR_H; // start below page header + table header
  let currentSide: "FOR" | "OPP" | null = null;

  for (const p of players) {
    // Section banner for new team?
    if (p.teamSide !== currentSide) {
      currentSide = p.teamSide;
      if (ry + SEC_H > BREAK_LIMIT) {
        pages++;
        ry = 82 + HDR_H;
      }
      ry += SEC_H;
    }
    // Player row
    if (ry + ROW_H > BREAK_LIMIT) {
      pages++;
      // On continuation pages we always redraw the section banner for context
      ry = 82 + HDR_H + SEC_H;
    }
    ry += ROW_H;
  }

  return pages;
}

/**
 * Builds the Player Breakdown canvas(es).
 * Returns an array — one canvas per page. No players are ever silently dropped.
 * Grouped by team (FOR first, then OPP), sorted by playerNumber within group.
 */
function makePlayerPages(
  events: readonly PdfExportEvent[],
  homeTeam: string,
  awayTeam: string,
  startPageNum: number,
  totalPages: number,
): HTMLCanvasElement[] {
  const players = collectPlayerStats(events);

  // ── Table geometry — 13 columns; Net T/O added; centered on 1920px canvas ────
  // #(65) Name(230) Score(150) Shots(100) Wides(75) T/O Won(100) T/O Lost(100)
  // Net T/O(80) K/O Won(100) K/O Lost(100) F Won(90) F Con(90) Actions(100)
  const colWs   = [65, 230, 150, 100, 75, 100, 100, 80, 100, 100, 90, 90, 100];
  const colHdrs = ["#", "Name", "Score", "Shots", "Wides",
                   "T/O Won", "T/O Lost", "Net T/O",
                   "Kickout Won", "Kickout Lost", "F Won", "F Con", "Actions"];
  const tableW  = colWs.reduce((a, b) => a + b, 0); // 1380
  const tL      = Math.round((CANVAS_W - tableW) / 2); // centered

  const HDR_H      = 44;
  const SEC_H      = 30;
  const ROW_H      = 40;
  const BREAK_LIMIT = CANVAS_H - 28; // 1052

  const colX: number[] = [];
  let cxStart = tL;
  for (const w of colWs) { colX.push(cxStart); cxStart += w; }

  const results: HTMLCanvasElement[] = [];
  let pageIdx = 0;
  // These are reassigned on each new page — declared here for closure access.
  let activeCanvas = document.createElement("canvas");
  let activeCtx    = activeCanvas.getContext("2d")!;
  let ry           = 0;

  function startNewCanvas(): void {
    activeCanvas         = document.createElement("canvas");
    activeCanvas.width   = CANVAS_W;
    activeCanvas.height  = CANVAS_H;
    activeCtx            = activeCanvas.getContext("2d")!;
    fillDarkBg(activeCtx);
    drawTopAccentBar(activeCtx);
    drawPageHeader(activeCtx, "Player Breakdown",
      `${homeTeam} v ${awayTeam}`, startPageNum + pageIdx, totalPages);

    // Table column header row
    ry = 82;
    activeCtx.fillStyle = "rgba(255,255,255,0.06)";
    activeCtx.fillRect(tL, ry, tableW, HDR_H);
    activeCtx.fillStyle = "#7dd3fc";
    activeCtx.fillRect(tL, ry, 4, HDR_H);
    const midHdr = ry + HDR_H / 2;
    colHdrs.forEach((hdr, i) => {
      activeCtx.fillStyle    = "#64748b";
      activeCtx.font         = "bold 12px sans-serif";
      activeCtx.textBaseline = "middle";
      activeCtx.textAlign    = i <= 1 ? "left" : "center";
      activeCtx.fillText(hdr, i <= 1 ? colX[i] + 8 : colX[i] + colWs[i] / 2, midHdr);
    });
    ry += HDR_H;
  }

  function drawSecBanner(teamSide: "FOR" | "OPP"): void {
    const sAccent = teamSide === "FOR" ? "#7dd3fc" : "#fb7185";
    const sBg     = teamSide === "FOR" ? "rgba(125,211,252,0.08)" : "rgba(251,113,133,0.08)";
    const sLabel  = teamSide === "FOR" ? homeTeam.toUpperCase() : awayTeam.toUpperCase();
    activeCtx.fillStyle = sBg;
    activeCtx.fillRect(tL, ry, tableW, SEC_H);
    activeCtx.fillStyle = sAccent;
    activeCtx.fillRect(tL, ry, 4, SEC_H);
    activeCtx.font         = "bold 13px sans-serif";
    activeCtx.textBaseline = "middle";
    activeCtx.textAlign    = "left";
    activeCtx.fillText(sLabel, tL + 12, ry + SEC_H / 2);
    ry += SEC_H;
  }

  // ── Handle empty state ────────────────────────────────────────────────────────
  if (players.length === 0) {
    startNewCanvas();
    activeCtx.fillStyle    = "#475569";
    activeCtx.font         = "22px sans-serif";
    activeCtx.textBaseline = "middle";
    activeCtx.textAlign    = "center";
    activeCtx.fillText("No player-tagged events recorded.", CANVAS_W / 2, CANVAS_H / 2);
    results.push(activeCanvas);
    return results;
  }

  // ── Paginated player rows ─────────────────────────────────────────────────────
  startNewCanvas();
  let currentSide: "FOR" | "OPP" | null = null;
  let rowIdx = 0;

  for (const ps of players) {
    // Section banner for new team
    if (ps.teamSide !== currentSide) {
      if (ry + SEC_H > BREAK_LIMIT) {
        results.push(activeCanvas);
        pageIdx++;
        startNewCanvas();
        currentSide = null; // re-draw banner on new page
        rowIdx = 0;
      }
      currentSide = ps.teamSide;
      drawSecBanner(ps.teamSide);
    }

    // Player row — page break if needed
    if (ry + ROW_H > BREAK_LIMIT) {
      results.push(activeCanvas);
      pageIdx++;
      startNewCanvas();
      rowIdx = 0;
      // Redraw section banner for context on continuation page
      drawSecBanner(ps.teamSide);
    }

    // Row tint
    if (rowIdx % 2 === 0) {
      activeCtx.fillStyle = "rgba(255,255,255,0.02)";
      activeCtx.fillRect(tL, ry, tableW, ROW_H);
    }
    // Row separator
    activeCtx.strokeStyle = "rgba(255,255,255,0.04)";
    activeCtx.lineWidth   = 1;
    activeCtx.beginPath();
    activeCtx.moveTo(tL, ry + ROW_H);
    activeCtx.lineTo(tL + tableW, ry + ROW_H);
    activeCtx.stroke();

    const scoreStr = `${ps.goals}-${String(ps.scorePoints).padStart(2, "0")} (${ps.scoreTotal})`;
    const numStr   = ps.number != null ? `#${ps.number}` : "—";
    const nameStr  = ps.name ?? numStr;
    const accent   = ps.teamSide === "FOR" ? "#7dd3fc" : "#fb7185";
    const midRow   = ry + ROW_H / 2;
    const netTo    = ps.toWon - ps.toLost;
    const netToStr = netTo >= 0 ? `+${netTo}` : String(netTo);
    const netColor = netTo > 0 ? "#4ade80" : netTo < 0 ? "#fb7185" : "#94a3b8";

    // Columns: #, Name, Score, Shots, Wides, T/OWon, T/OLost, NetTO, K/OWon, K/OLost, FWon, FCon, Actions
    const vals      = [numStr, nameStr, scoreStr,
                       String(ps.shots), String(ps.wides),
                       String(ps.toWon), String(ps.toLost), netToStr,
                       String(ps.koWon), String(ps.koCon),
                       String(ps.freesWon), String(ps.freesCon), String(ps.actions)];
    const valColors = vals.map((_, i) =>
      i === 0 ? accent : i === 1 ? "#f1f5f9" : i === 7 ? netColor : "#e2e8f0",
    );

    vals.forEach((val, i) => {
      activeCtx.fillStyle    = valColors[i];
      activeCtx.font         = i === 1 ? "14px sans-serif" : "bold 14px sans-serif";
      activeCtx.textBaseline = "middle";
      activeCtx.textAlign    = i <= 1 ? "left" : "center";
      activeCtx.fillText(val, i <= 1 ? colX[i] + 8 : colX[i] + colWs[i] / 2, midRow, colWs[i] - 6);
    });

    ry += ROW_H;
    rowIdx++;
  }

  results.push(activeCanvas);
  return results;
}

// ─── Chain Summary page ───────────────────────────────────────────────────────

/**
 * Renders the Tactical Chain Analysis summary page.
 *
 * Layout (1920×1080):
 *   Left panel  (x 24–630)  : Chain Pattern table — rule × FOR/OPP counts
 *   Mid panel   (x 654–1260): Kickout chains  (top) + Turnover chains (bottom)
 *   Right panel (x 1284–1896): Scoring runs + momentum summary
 *
 * This builder consumes a pre-computed ChainAnalysis so the engine runs
 * exactly once per export regardless of how many chain pages are added later.
 *
 * Future chain pages (kickout analysis, turnover punishment, momentum) will
 * each be separate builder functions that consume the same ChainAnalysis arg.
 */
function makeChainSummaryPage(
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Tactical Chain Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  const CONTENT_TOP  = 86;
  const CONTENT_BOT  = CANVAS_H - 36;
  const CONTENT_H    = CONTENT_BOT - CONTENT_TOP;
  const COL_W        = 606;
  const COL_GAP      = 24;
  const COL1_X       = 24;
  const COL2_X       = COL1_X + COL_W + COL_GAP;
  const COL3_X       = COL2_X + COL_W + COL_GAP;

  // ── Helper: draw a labelled panel card ──────────────────────────────────────
  function drawPanelBg(
    x: number, y: number, w: number, h: number,
    accentColor: string,
  ): void {
    ctx.save();
    // Use fillRect (not roundRect) — consistent with the existing PDF engine
    // and avoids a dependency on ctx.roundRect which is absent in Safari < 15.4.
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, h);
    ctx.restore();
  }

  function drawPanelTitle(
    x: number, y: number, label: string, accentColor: string,
  ): number {
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + 16, y + 13);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 26);
    ctx.lineTo(x + COL_W, y + 26);
    ctx.stroke();
    ctx.restore();
    return y + 28; // returns y after title area
  }

  function drawDataRow(
    x: number, cy: number, w: number,
    label: string, valFor: string, valOpp: string,
    isAlt: boolean,
    forColor = "#7dd3fc",
    oppColor = "#fb7185",
  ): number {
    const ROW_H = 26;
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 4, cy, w - 4, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, mid);
    // FOR value — right-aligned in left two-thirds
    const valCol = x + w * 0.58;
    ctx.fillStyle = forColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(valFor, valCol, mid);
    // OPP value
    ctx.fillStyle = oppColor;
    ctx.textAlign = "right";
    ctx.fillText(valOpp, x + w - 10, mid);
    return cy + ROW_H;
  }

  function drawColumnHeader(
    x: number, cy: number, w: number,
    forLabel: string, oppLabel: string,
  ): number {
    const H = 20;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x + 4, cy, w - 4, H);
    const mid = cy + H / 2;
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    const valCol = x + w * 0.58;
    ctx.fillStyle = "#7dd3fc";
    ctx.textAlign = "right";
    ctx.fillText(forLabel, valCol, mid);
    ctx.fillStyle = "#fb7185";
    ctx.textAlign = "right";
    ctx.fillText(oppLabel, x + w - 10, mid);
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText("PATTERN", x + 14, mid);
    return cy + H;
  }

  function drawStatRow(
    x: number, cy: number, w: number,
    label: string, value: string, valueColor: string,
    isAlt: boolean,
  ): number {
    const ROW_H = 26;
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 4, cy, w - 4, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, mid);
    ctx.fillStyle = valueColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 10, mid);
    return cy + ROW_H;
  }

  function pct(n: number): string {
    return `${n}%`;
  }

  function val(n: number): string {
    return String(n);
  }

  // ── COL 1: Chain Patterns Table ─────────────────────────────────────────────
  {
    const PANEL_H = CONTENT_H;
    drawPanelBg(COL1_X, CONTENT_TOP, COL_W, PANEL_H, "#a78bfa");
    let cy = drawPanelTitle(COL1_X, CONTENT_TOP, "Chain Patterns", "#a78bfa");
    cy = drawColumnHeader(COL1_X, cy, COL_W, homeTeam.slice(0, 12), awayTeam.slice(0, 12));

    const { byRule } = analysis;

    const chainRows: { label: string; ruleId: import("./chains/chain-types").ChainRuleId }[] = [
      { label: "Kickout Won → Score",        ruleId: "KICKOUT_TO_SCORE"               },
      { label: "Kickout Lost → Score Agst",  ruleId: "KICKOUT_LOST_TO_SCORE_AGAINST"  },
      { label: "Turnover Won → Score",       ruleId: "TURNOVER_TO_SCORE"              },
      { label: "Turnover Won → Shot",        ruleId: "TURNOVER_TO_SHOT"               },
      { label: "Free Won → Goal",            ruleId: "FREE_WON_TO_GOAL"               },
    ];

    chainRows.forEach(({ label, ruleId }, i) => {
      const ruleChains = byRule[ruleId] ?? [];
      const forCount   = ruleChains.filter((c) => c.teamSide === "FOR").length;
      const oppCount   = ruleChains.filter((c) => c.teamSide === "OPP").length;
      cy = drawDataRow(COL1_X, cy, COL_W, label, val(forCount), val(oppCount), i % 2 === 0);
    });

    // Divider
    cy += 10;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(COL1_X + 4, cy);
    ctx.lineTo(COL1_X + COL_W, cy);
    ctx.stroke();
    ctx.restore();
    cy += 10;

    // Summary totals
    const { summary } = analysis;
    const totalFor = summary.forChains;
    const totalOpp = summary.oppChains;
    ctx.save();
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("TOTAL CHAINS DETECTED", COL1_X + 14, cy + 10);
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(val(totalFor), COL1_X + COL_W * 0.58, cy + 10);
    ctx.fillStyle = "#fb7185";
    ctx.fillText(val(totalOpp), COL1_X + COL_W - 10, cy + 10);
    ctx.restore();
    cy += 30;

    // Momentum summary teaser
    cy += 12;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(COL1_X + 4, cy, COL_W - 4, 20);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("SCORING RUNS (≥2 consecutive)", COL1_X + 14, cy + 10);
    ctx.restore();
    cy += 20;

    const { scoringRuns } = analysis;
    cy = drawStatRow(COL1_X, cy, COL_W, "Longest run (For)", `${scoringRuns.maxConsecutiveFor} pts`, "#7dd3fc", false);
    cy = drawStatRow(COL1_X, cy, COL_W, "Longest run (Opp)", `${scoringRuns.maxConsecutiveOpp} pts`, "#fb7185", true);
    cy = drawStatRow(COL1_X, cy, COL_W, "Total runs detected", val(scoringRuns.runs.length), "#e2e8f0", false);
  }

  // ── COL 2: Kickout Chains (top half) + Turnover Chains (bottom half) ────────
  {
    const HALF_H  = Math.floor(CONTENT_H / 2) - 8;
    const PANEL_Y1 = CONTENT_TOP;
    const PANEL_Y2 = CONTENT_TOP + HALF_H + 16;

    // Kickout panel
    drawPanelBg(COL2_X, PANEL_Y1, COL_W, HALF_H, "#22d3ee");
    let cy = drawPanelTitle(COL2_X, PANEL_Y1, "Kickout Chains", "#22d3ee");

    const ko = analysis.kickouts;
    cy = drawStatRow(COL2_X, cy, COL_W, "Total kickouts",     val(ko.total), "#e2e8f0", false);
    cy = drawStatRow(COL2_X, cy, COL_W, "Won",                val(ko.won),   "#7dd3fc", true);
    cy = drawStatRow(COL2_X, cy, COL_W, "Lost / Conceded",    val(ko.lost),  "#fb7185", false);
    cy += 6;
    cy = drawStatRow(COL2_X, cy, COL_W, "Won → Score",        `${val(ko.wonToScore)} (${pct(ko.wonToScorePercent)})`,           "#4ade80", true);
    cy = drawStatRow(COL2_X, cy, COL_W, "Lost → Score Against", `${val(ko.lostAllowedScore)} (${pct(ko.lostAllowedScorePercent)})`, "#f97316", false);

    // Kickout possession efficiency bar
    cy += 10;
    if (ko.won + ko.lost > 0) {
      const barW = COL_W - 24;
      const barH = 12;
      const barX = COL2_X + 12;
      const barY = cy;
      const wonFrac = ko.won / (ko.won + ko.lost);
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(barX, barY, Math.max(4, barW * wonFrac), barH);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(`Possession rate: ${Math.round(wonFrac * 100)}%`, barX + barW / 2, barY + barH + 10);
      ctx.restore();
    }

    // Turnover panel
    drawPanelBg(COL2_X, PANEL_Y2, COL_W, HALF_H, "#a78bfa");
    cy = drawPanelTitle(COL2_X, PANEL_Y2, "Turnover Chains", "#a78bfa");

    const to = analysis.turnovers;
    cy = drawStatRow(COL2_X, cy, COL_W, "Total turnovers",    val(to.total), "#e2e8f0", false);
    cy = drawStatRow(COL2_X, cy, COL_W, "Won",                val(to.won),   "#7dd3fc", true);
    cy = drawStatRow(COL2_X, cy, COL_W, "Lost",               val(to.lost),  "#fb7185", false);
    cy += 6;
    cy = drawStatRow(COL2_X, cy, COL_W, "Won → Score",        `${val(to.wonToScore)} (${pct(to.wonToScorePercent)})`,  "#4ade80", true);
    cy = drawStatRow(COL2_X, cy, COL_W, "Won → Shot",         `${val(to.wonToShot)} (${pct(to.wonToShotPercent)})`,    "#a78bfa", false);
    cy = drawStatRow(COL2_X, cy, COL_W, "Lost → Score Agst",  val(to.lostAllowedScore),                                "#f97316", true);
  }

  // ── COL 3: Scoring Runs detail ──────────────────────────────────────────────
  {
    drawPanelBg(COL3_X, CONTENT_TOP, COL_W, CONTENT_H, "#fbbf24");
    let cy = drawPanelTitle(COL3_X, CONTENT_TOP, "Scoring Momentum", "#fbbf24");

    const { scoringRuns } = analysis;

    // Best runs for each side
    const { longestRunFor: lrf, longestRunOpp: lro } = scoringRuns;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(COL3_X + 4, cy, COL_W - 4, 20);
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`${homeTeam.slice(0, 16)} — Best Run`, COL3_X + 14, cy + 10);
    ctx.restore();
    cy += 20;

    if (lrf) {
      const seg = lrf.period === "1H"
        ? `1H · Seg ${lrf.events[0].segment}`
        : `2H · Seg ${lrf.events[0].segment}`;
      cy = drawStatRow(COL3_X, cy, COL_W, "Consecutive scores",  val(lrf.count), "#4ade80", false);
      cy = drawStatRow(COL3_X, cy, COL_W, "Period / Segment",    seg,            "#e2e8f0", true);
    } else {
      cy = drawStatRow(COL3_X, cy, COL_W, "No scoring runs (2+ scores)",   "—",            "#475569", false);
      cy++;
    }

    cy += 8;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(COL3_X + 4, cy, COL_W - 4, 20);
    ctx.fillStyle = "#fb7185";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`${awayTeam.slice(0, 16)} — Best Run`, COL3_X + 14, cy + 10);
    ctx.restore();
    cy += 20;

    if (lro) {
      const seg = lro.period === "1H"
        ? `1H · Seg ${lro.events[0].segment}`
        : `2H · Seg ${lro.events[0].segment}`;
      cy = drawStatRow(COL3_X, cy, COL_W, "Consecutive scores",  val(lro.count), "#4ade80", false);
      cy = drawStatRow(COL3_X, cy, COL_W, "Period / Segment",    seg,            "#e2e8f0", true);
    } else {
      cy = drawStatRow(COL3_X, cy, COL_W, "No scoring runs (2+ scores)",   "—",            "#475569", false);
      cy++;
    }

    // All runs list (up to 12, most recent first)
    cy += 12;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(COL3_X + 4, cy, COL_W - 4, 20);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`ALL SCORING RUNS (${scoringRuns.runs.length} total)`, COL3_X + 14, cy + 10);
    ctx.restore();
    cy += 20;

    const runsToShow = [...scoringRuns.runs]
      .sort((a, b) => b.startClockSeconds - a.startClockSeconds)
      .slice(0, 12);

    if (runsToShow.length === 0) {
      cy = drawStatRow(COL3_X, cy, COL_W, "No scoring runs detected", "—", "#475569", false);
    } else {
      runsToShow.forEach((run, i) => {
        const sideLabel = run.teamSide === "FOR" ? homeTeam.slice(0, 10) : awayTeam.slice(0, 10);
        const timeLabel = run.period === "1H" ? `1H S${run.events[0].segment}` : `2H S${run.events[0].segment}`;
        const color     = run.teamSide === "FOR" ? "#7dd3fc" : "#fb7185";
        cy = drawStatRow(
          COL3_X, cy, COL_W,
          `${sideLabel}  ×${run.count}  ${timeLabel}`,
          `${run.count} pts`,
          color,
          i % 2 === 0,
        );
      });
    }
  }

  return canvas;
}

// ─── Kickout Chain Analysis page ─────────────────────────────────────────────

/**
 * Builds the Kickout Chain Analysis canvas (second-to-last page).
 *
 * Three columns:
 *   COL 1 — Overall possession overview with half split
 *   COL 2 — Kickout type breakdown (CLEAN/BREAK/FOUL) for each team
 *   COL 3 — Chain rule outcomes and possession efficiency
 *
 * Layout mirrors makeChainSummaryPage (3 × 606 px columns, 24 px gaps).
 * All ctx.fillRect() — ctx.roundRect() is intentionally absent (Safari < 15.4).
 */
function makeKickoutChainPage(
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Kickout Chain Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  const CONTENT_TOP = 86;
  const CONTENT_BOT = CANVAS_H - 36;
  const CONTENT_H   = CONTENT_BOT - CONTENT_TOP;
  const COL_W       = 606;
  const COL_GAP     = 24;
  const COL1_X      = 24;
  const COL2_X      = COL1_X + COL_W + COL_GAP;
  const COL3_X      = COL2_X + COL_W + COL_GAP;

  const ko       = analysis.kickouts;
  const outcomes = ko.outcomes;

  // ── Local helpers (same style as makeChainSummaryPage) ──────────────────────

  function drawPanelBg(x: number, y: number, w: number, h: number, accentColor: string): void {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, h);
    ctx.restore();
  }

  function drawPanelTitle(x: number, y: number, label: string, accentColor: string): number {
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + 16, y + 13);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 26);
    ctx.lineTo(x + COL_W, y + 26);
    ctx.stroke();
    ctx.restore();
    return y + 28;
  }

  function drawStatRow(
    x: number, cy: number, w: number,
    label: string, value: string, valueColor: string,
    isAlt: boolean,
  ): number {
    const ROW_H = 26;
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 4, cy, w - 4, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, mid);
    ctx.fillStyle = valueColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 10, mid);
    return cy + ROW_H;
  }

  /** Draws a two-segment possession bar (FOR left, OPP right) with percentage labels. */
  function drawPossessionBar(
    x: number, cy: number, w: number,
    forCount: number, oppCount: number,
    forLabel: string, oppLabel: string,
  ): number {
    const barH    = 14;
    const barX    = x + 12;
    const barW    = w - 24;
    const total   = forCount + oppCount;
    const forFrac = total > 0 ? forCount / total : 0.5;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(barX, cy, barW, barH);
    if (total > 0) {
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(barX, cy, Math.max(4, Math.floor(barW * forFrac)), barH);
      if (forFrac < 1) {
        const oppW = Math.max(4, barW - Math.floor(barW * forFrac));
        ctx.fillStyle = "#fb7185";
        ctx.fillRect(barX + barW - oppW, cy, oppW, barH);
      }
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      const labelY = cy + barH + 12;
      ctx.fillStyle = "#22d3ee";
      ctx.textAlign = "left";
      ctx.fillText(`${forLabel} ${Math.round(forFrac * 100)}%`, barX, labelY);
      ctx.fillStyle = "#fb7185";
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round((1 - forFrac) * 100)}% ${oppLabel}`, barX + barW, labelY);
    } else {
      ctx.fillStyle = "#475569";
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No kickout data", barX + barW / 2, cy + barH + 12);
    }
    ctx.restore();
    return cy + barH + 26;
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Per-period possession split
  const h1Out     = outcomes.filter((o) => o.kickoutEvent.period === "1H");
  const h2Out     = outcomes.filter((o) => o.kickoutEvent.period === "2H");
  const h1Won     = h1Out.filter((o) => o.winningSide === "FOR").length;
  const h1Lost    = h1Out.filter((o) => o.winningSide === "OPP").length;
  const h2Won     = h2Out.filter((o) => o.winningSide === "FOR").length;
  const h2Lost    = h2Out.filter((o) => o.winningSide === "OPP").length;
  const h1WonToScore = h1Out.filter((o) => o.winningSide === "FOR" && o.nextScore !== null).length;
  const h2WonToScore = h2Out.filter((o) => o.winningSide === "FOR" && o.nextScore !== null).length;

  // Tag counting helper (operates on a filtered sub-slice)
  function countOutcomeTag(
    sub: readonly typeof outcomes[number][],
    ...tags: string[]
  ): number {
    return sub.filter((o) => tags.some((t) => o.kickoutEvent.tags?.includes(t))).length;
  }

  // FOR own kickout sub-slices
  const forKoWonOut  = outcomes.filter((o) => o.kickoutEvent.kind === "KICKOUT_WON"      && o.kickoutEvent.teamSide === "FOR");
  const forKoConOut  = outcomes.filter((o) => o.kickoutEvent.kind === "KICKOUT_CONCEDED"  && o.kickoutEvent.teamSide === "FOR");
  const forCleanWon  = countOutcomeTag(forKoWonOut,  "CLEAN");
  const forBreakWon  = countOutcomeTag(forKoWonOut,  "BREAK");
  const forFoulWon   = countOutcomeTag(forKoWonOut,  "FOUL_WON");
  const forCleanLost = countOutcomeTag(forKoConOut,  "CLEAN");
  const forBreakLost = countOutcomeTag(forKoConOut,  "BREAK");
  const forFoulCon   = countOutcomeTag(forKoConOut,  "FOUL_CONCEDED");
  const forKickedDead = countOutcomeTag(
    outcomes.filter((o) => o.kickoutEvent.teamSide === "FOR"),
    "KICKED_DEAD",
  );

  // OPP own kickout sub-slices
  const oppKoWonOut  = outcomes.filter((o) => o.kickoutEvent.kind === "KICKOUT_WON"      && o.kickoutEvent.teamSide === "OPP");
  const oppKoConOut  = outcomes.filter((o) => o.kickoutEvent.kind === "KICKOUT_CONCEDED"  && o.kickoutEvent.teamSide === "OPP");
  const oppCleanWon  = countOutcomeTag(oppKoWonOut,  "CLEAN");
  const oppBreakWon  = countOutcomeTag(oppKoWonOut,  "BREAK");
  const oppFoulWon   = countOutcomeTag(oppKoWonOut,  "FOUL_WON");
  const oppCleanLost = countOutcomeTag(oppKoConOut,  "CLEAN");
  const oppBreakLost = countOutcomeTag(oppKoConOut,  "BREAK");
  const oppFoulCon   = countOutcomeTag(oppKoConOut,  "FOUL_CONCEDED");
  const oppKickedDead = countOutcomeTag(
    outcomes.filter((o) => o.kickoutEvent.teamSide === "OPP"),
    "KICKED_DEAD",
  );

  // Possession outcome counts (FOR won possession)
  const forWonTotal    = outcomes.filter((o) => o.winningSide === "FOR").length;
  const forScoredFromKo = outcomes.filter((o) => o.winningSide === "FOR" && o.nextScore      !== null).length;
  const forShotFromKo  = outcomes.filter((o) => o.winningSide === "FOR" && o.nextShotOrScore !== null).length;
  const oppScoredFromKo = outcomes.filter((o) => o.winningSide === "OPP" && o.nextScore     !== null).length;

  // Average seconds to score across all kickouts that led to a score
  const scoringOuts    = outcomes.filter((o) => o.secondsToScore !== null);
  const avgSecsToScore = scoringOuts.length > 0
    ? Math.round(scoringOuts.reduce((s, o) => s + (o.secondsToScore ?? 0), 0) / scoringOuts.length)
    : null;

  // Chain rule matches
  const koToScoreChains   = analysis.byRule["KICKOUT_TO_SCORE"]               ?? [];
  const koLostScoreChains = analysis.byRule["KICKOUT_LOST_TO_SCORE_AGAINST"]  ?? [];

  // ── COL 1: Overall Kickout Possession ─────────────────────────────────────────
  {
    drawPanelBg(COL1_X, CONTENT_TOP, COL_W, CONTENT_H, "#22d3ee");
    let cy = drawPanelTitle(COL1_X, CONTENT_TOP, "Kickout Possession Overview", "#22d3ee");

    if (ko.total === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "16px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No kickout events recorded", COL1_X + COL_W / 2, CONTENT_TOP + CONTENT_H / 2);
      ctx.restore();
    } else {
      // Possession bar
      cy += 6;
      cy = drawPossessionBar(COL1_X, cy, COL_W, ko.won, ko.lost, homeTeam.slice(0, 12), awayTeam.slice(0, 12));
      cy += 4;

      // Summary
      cy = drawStatRow(COL1_X, cy, COL_W, "Total kickout events",         String(ko.total),         "#e2e8f0", false);
      cy = drawStatRow(COL1_X, cy, COL_W, `${homeTeam.slice(0, 16)} won`, String(ko.won),            "#22d3ee", true);
      cy = drawStatRow(COL1_X, cy, COL_W, `${awayTeam.slice(0, 16)} won`, String(ko.lost),           "#fb7185", false);
      cy += 8;

      const wonPctStr  = ko.won  > 0 ? `${ko.wonToScore} (${ko.wonToScorePercent}%)`             : "0 (—)";
      const lostPctStr = ko.lost > 0 ? `${ko.lostAllowedScore} (${ko.lostAllowedScorePercent}%)` : "0 (—)";
      cy = drawStatRow(COL1_X, cy, COL_W, "Won → Score",          wonPctStr,  "#4ade80", true);
      cy = drawStatRow(COL1_X, cy, COL_W, "Lost → Score Against", lostPctStr, "#f97316", false);
      cy += 8;

      // Half split sub-header
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(COL1_X + 4, cy, COL_W - 4, 20);
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("BY HALF", COL1_X + 14, cy + 10);
      ctx.restore();
      cy += 20;

      const h1Total  = h1Won + h1Lost;
      const h2Total  = h2Won + h2Lost;
      const h1WonPct = h1Total > 0 ? `${Math.round((h1Won / h1Total) * 100)}%` : "—";
      const h2WonPct = h2Total > 0 ? `${Math.round((h2Won / h2Total) * 100)}%` : "—";

      cy = drawStatRow(COL1_X, cy, COL_W, "1H — Won / Lost",    `${h1Won} / ${h1Lost}`, "#e2e8f0", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "1H — Won %",         h1WonPct,               "#22d3ee", true);
      cy = drawStatRow(COL1_X, cy, COL_W, "1H — Won → Score",   String(h1WonToScore),   "#4ade80", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "2H — Won / Lost",    `${h2Won} / ${h2Lost}`, "#e2e8f0", true);
      cy = drawStatRow(COL1_X, cy, COL_W, "2H — Won %",         h2WonPct,               "#22d3ee", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "2H — Won → Score",   String(h2WonToScore),   "#4ade80", true);
      cy += 8;

      const avgStr = avgSecsToScore !== null ? `${avgSecsToScore}s` : "—";
      drawStatRow(COL1_X, cy, COL_W, "Avg secs to score (won Kickout)", avgStr, "#fbbf24", false);
    }
  }

  // ── COL 2: Kickout Type Breakdown (FOR top, OPP bottom) ──────────────────────
  {
    const HALF_H   = Math.floor(CONTENT_H / 2) - 8;
    const PANEL_Y1 = CONTENT_TOP;
    const PANEL_Y2 = CONTENT_TOP + HALF_H + 16;

    // FOR team panel
    drawPanelBg(COL2_X, PANEL_Y1, COL_W, HALF_H, "#7dd3fc");
    let cy = drawPanelTitle(COL2_X, PANEL_Y1, `${homeTeam.slice(0, 18)} — Kickout Types`, "#7dd3fc");

    if (forKoWonOut.length + forKoConOut.length === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "14px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No kickouts recorded", COL2_X + COL_W / 2, PANEL_Y1 + HALF_H / 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(COL2_X + 4, cy, COL_W - 4, 20);
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "bold 10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("OWN KICKOUTS RETAINED", COL2_X + 14, cy + 10);
      ctx.restore();
      cy += 20;
      cy = drawStatRow(COL2_X, cy, COL_W, "Clean Won",     String(forCleanWon),  "#4ade80", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "Break Won",     String(forBreakWon),  "#e2e8f0", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "Foul Won",      String(forFoulWon),   "#fbbf24", false);
      cy += 8;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(COL2_X + 4, cy, COL_W - 4, 20);
      ctx.fillStyle = "#fb7185";
      ctx.font = "bold 10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("OWN KICKOUTS CONCEDED", COL2_X + 14, cy + 10);
      ctx.restore();
      cy += 20;
      cy = drawStatRow(COL2_X, cy, COL_W, "Clean Lost",    String(forCleanLost),   "#fb7185", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "Break Lost",    String(forBreakLost),   "#e2e8f0", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "Foul Conceded", String(forFoulCon),     "#f97316", false);
      drawStatRow(COL2_X, cy, COL_W,      "Kicked Dead",   String(forKickedDead),  "#64748b", true);
    }

    // OPP team panel
    drawPanelBg(COL2_X, PANEL_Y2, COL_W, HALF_H, "#fb7185");
    cy = drawPanelTitle(COL2_X, PANEL_Y2, `${awayTeam.slice(0, 18)} — Kickout Types`, "#fb7185");

    if (oppKoWonOut.length + oppKoConOut.length === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "14px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No kickouts recorded", COL2_X + COL_W / 2, PANEL_Y2 + HALF_H / 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(COL2_X + 4, cy, COL_W - 4, 20);
      ctx.fillStyle = "#fb7185";
      ctx.font = "bold 10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("OWN KICKOUTS RETAINED", COL2_X + 14, cy + 10);
      ctx.restore();
      cy += 20;
      cy = drawStatRow(COL2_X, cy, COL_W, "Clean Won",     String(oppCleanWon),  "#4ade80", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "Break Won",     String(oppBreakWon),  "#e2e8f0", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "Foul Won",      String(oppFoulWon),   "#fbbf24", false);
      cy += 8;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(COL2_X + 4, cy, COL_W - 4, 20);
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("OWN KICKOUTS CONCEDED", COL2_X + 14, cy + 10);
      ctx.restore();
      cy += 20;
      cy = drawStatRow(COL2_X, cy, COL_W, "Clean Lost",    String(oppCleanLost),   "#fb7185", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "Break Lost",    String(oppBreakLost),   "#e2e8f0", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "Foul Conceded", String(oppFoulCon),     "#f97316", false);
      drawStatRow(COL2_X, cy, COL_W,      "Kicked Dead",   String(oppKickedDead),  "#64748b", true);
    }
  }

  // ── COL 3: Chain Outcomes ─────────────────────────────────────────────────────
  {
    drawPanelBg(COL3_X, CONTENT_TOP, COL_W, CONTENT_H, "#fbbf24");
    let cy = drawPanelTitle(COL3_X, CONTENT_TOP, "Kickout Chain Outcomes", "#fbbf24");

    // Chain rule match counts
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(COL3_X + 4, cy, COL_W - 4, 20);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("CHAIN RULE MATCHES", COL3_X + 14, cy + 10);
    ctx.restore();
    cy += 20;

    const koToScoreFor = koToScoreChains.filter((c) => c.teamSide === "FOR").length;
    const koToScoreOpp = koToScoreChains.filter((c) => c.teamSide === "OPP").length;
    const koLostFor    = koLostScoreChains.filter((c) => c.teamSide === "FOR").length;
    const koLostOpp    = koLostScoreChains.filter((c) => c.teamSide === "OPP").length;

    cy = drawStatRow(COL3_X, cy, COL_W, `KO Won → Score  (${homeTeam.slice(0, 10)})`,     String(koToScoreFor), "#7dd3fc", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `KO Won → Score  (${awayTeam.slice(0, 10)})`,     String(koToScoreOpp), "#fb7185", true);
    cy = drawStatRow(COL3_X, cy, COL_W, `KO Lost → Score Agst (${homeTeam.slice(0, 8)})`, String(koLostFor),    "#f97316", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `KO Lost → Score Agst (${awayTeam.slice(0, 8)})`, String(koLostOpp),    "#f97316", true);
    cy += 12;

    // Scoring from kickout possession
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(COL3_X + 4, cy, COL_W - 4, 20);
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("SCORING FROM POSSESSION", COL3_X + 14, cy + 10);
    ctx.restore();
    cy += 20;

    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} — Scores from Kickout`, String(forScoredFromKo),  "#4ade80", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} — Shots from Kickout`,  String(forShotFromKo),    "#7dd3fc", true);
    cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 16)} — Scores from Kickout`, String(oppScoredFromKo),  "#fb7185", false);
    cy += 12;

    // FOR possession outcome breakdown
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(COL3_X + 4, cy, COL_W - 4, 20);
    ctx.fillStyle = "#22d3ee";
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`${homeTeam.slice(0, 16).toUpperCase()} POSSESSION OUTCOMES`, COL3_X + 14, cy + 10);
    ctx.restore();
    cy += 20;

    const forNoShot    = Math.max(0, forWonTotal - forShotFromKo);
    const forShotPct   = forWonTotal > 0 ? `${Math.round((forShotFromKo   / forWonTotal) * 100)}%` : "—";
    const forScorePct  = forWonTotal > 0 ? `${Math.round((forScoredFromKo / forWonTotal) * 100)}%` : "—";

    cy = drawStatRow(COL3_X, cy, COL_W, "Won kickouts total",   String(forWonTotal),                             "#e2e8f0", false);
    cy = drawStatRow(COL3_X, cy, COL_W, "→ Generated a shot",   `${forShotFromKo} (${forShotPct})`,              "#22d3ee", true);
    cy = drawStatRow(COL3_X, cy, COL_W, "→ Converted to score", `${forScoredFromKo} (${forScorePct})`,           "#4ade80", false);
    cy = drawStatRow(COL3_X, cy, COL_W, "→ No shot attempt",    String(forNoShot),                               "#f97316", true);
    cy += 8;

    const avgStr = avgSecsToScore !== null ? `${avgSecsToScore}s avg` : "—";
    cy = drawStatRow(COL3_X, cy, COL_W, "Avg time to score (Kickout)", avgStr, "#fbbf24", false);

    // Possession rate summary bar
    if (ko.won + ko.lost > 0) {
      cy += 16;
      ctx.save();
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("OVERALL POSSESSION RATE", COL3_X + 14, cy);
      ctx.restore();
      cy += 14;
      drawPossessionBar(COL3_X, cy, COL_W, ko.won, ko.lost, homeTeam.slice(0, 10), awayTeam.slice(0, 10));
    }
  }

  return canvas;
}

// ─── Turnover Punishment Analysis page ───────────────────────────────────────

/**
 * Builds the Turnover Punishment Analysis canvas (second-to-last chain page).
 *
 * Three columns:
 *   COL 1 — homeTeam attacking from turnovers (won TOs → consequences)
 *   COL 2 — awayTeam attacking from turnovers (won TOs → consequences)
 *   COL 3 — Comparative efficiency, chain rule matches, damage conceded
 *
 * Layout mirrors makeKickoutChainPage (3 × 606 px columns, 24 px gaps).
 * All ctx.fillRect() — ctx.roundRect() is intentionally absent (Safari < 15.4).
 *
 * Important: wonToShot in the dataset INCLUDES scores. "Shot but no score"
 * must be computed as wonToShot - wonToScore, never as raw wonToShot.
 */
function makeTurnoverPunishmentPage(
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Turnover Punishment Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  const CONTENT_TOP = 86;
  const CONTENT_BOT = CANVAS_H - 36;
  const CONTENT_H   = CONTENT_BOT - CONTENT_TOP;
  const COL_W       = 606;
  const COL_GAP     = 24;
  const COL1_X      = 24;
  const COL2_X      = COL1_X + COL_W + COL_GAP;
  const COL3_X      = COL2_X + COL_W + COL_GAP;

  const to       = analysis.turnovers;
  const outcomes = to.outcomes;

  // ── Local helpers (same style as makeKickoutChainPage) ───────────────────────

  function drawPanelBg(x: number, y: number, w: number, h: number, accentColor: string): void {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, h);
    ctx.restore();
  }

  function drawPanelTitle(x: number, y: number, label: string, accentColor: string): number {
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + 16, y + 13);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 26);
    ctx.lineTo(x + COL_W, y + 26);
    ctx.stroke();
    ctx.restore();
    return y + 28;
  }

  function drawStatRow(
    x: number, cy: number, w: number,
    label: string, value: string, valueColor: string,
    isAlt: boolean,
  ): number {
    const ROW_H = 26;
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 4, cy, w - 4, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, mid);
    ctx.fillStyle = valueColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 10, mid);
    return cy + ROW_H;
  }

  function drawSubHeader(x: number, cy: number, w: number, label: string, accentColor: string): number {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x + 4, cy, w - 4, 20);
    ctx.fillStyle = accentColor;
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, cy + 10);
    ctx.restore();
    return cy + 20;
  }

  /** Two-segment bar: left = FOR side (accentFor), right = OPP side (accentOpp) */
  function drawComparisonBar(
    x: number, cy: number, w: number,
    forVal: number, oppVal: number,
    forLabel: string, oppLabel: string,
    accentFor: string, accentOpp: string,
  ): number {
    const barH  = 14;
    const barX  = x + 12;
    const barW  = w - 24;
    const total = forVal + oppVal;
    const forFrac = total > 0 ? forVal / total : 0.5;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(barX, cy, barW, barH);
    if (total > 0) {
      ctx.fillStyle = accentFor;
      ctx.fillRect(barX, cy, Math.max(4, Math.floor(barW * forFrac)), barH);
      if (forFrac < 1) {
        const oppW = Math.max(4, barW - Math.floor(barW * forFrac));
        ctx.fillStyle = accentOpp;
        ctx.fillRect(barX + barW - oppW, cy, oppW, barH);
      }
      const labelY = cy + barH + 12;
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillStyle = accentFor;
      ctx.textAlign = "left";
      ctx.fillText(`${forLabel} ${Math.round(forFrac * 100)}%`, barX, labelY);
      ctx.fillStyle = accentOpp;
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round((1 - forFrac) * 100)}% ${oppLabel}`, barX + barW, labelY);
    } else {
      const labelY = cy + barH + 12;
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#475569";
      ctx.textAlign = "center";
      ctx.fillText("No turnover data", barX + barW / 2, labelY);
    }
    ctx.restore();
    return cy + barH + 26;
  }

  // ── Derive acting side — who gained possession from this turnover event ───────
  // Engine logic: TURNOVER_WON → recording side gained ball;
  //               TURNOVER_LOST → opposite side gained ball.
  // Not stored in TurnoverOutcome; derived here.
  function actingSide(o: typeof outcomes[number]): "FOR" | "OPP" {
    if (o.direction === "WON") return o.turnoverEvent.teamSide;
    return o.turnoverEvent.teamSide === "FOR" ? "OPP" : "FOR";
  }

  // ── Per-team attacking outcome slices ─────────────────────────────────────────
  // "FOR attacking" = FOR gained possession (TURNOVER_WON by FOR, or TURNOVER_LOST by OPP)
  // "OPP attacking" = OPP gained possession (TURNOVER_WON by OPP, or TURNOVER_LOST by FOR)
  const forAttacking = outcomes.filter((o) => actingSide(o) === "FOR");
  const oppAttacking = outcomes.filter((o) => actingSide(o) === "OPP");

  // FOR attacking consequences
  const forWonTotal       = forAttacking.length;
  const forWonToScore     = forAttacking.filter((o) => o.resultedInScore).length;
  // wonToShot includes scores — "shot but no score" = wonToShot minus wonToScore
  const forWonToShotAny   = forAttacking.filter((o) => o.resultedInShot).length;
  const forWonToShotOnly  = forWonToShotAny - forWonToScore;
  const forWonNoShot      = forWonTotal - forWonToShotAny;
  // Transition breakdown: next event immediately turned over again
  const forBrokenAttacks  = forAttacking.filter((o) =>
    o.nextEvent !== null &&
    (o.nextEvent.kind === "TURNOVER_WON" || o.nextEvent.kind === "TURNOVER_LOST")
  ).length;
  // Average time to outcome (when available)
  const forWithTime = forAttacking.filter((o) => o.secondsToOutcome !== null);
  const forAvgSecs  = forWithTime.length > 0
    ? Math.round(forWithTime.reduce((s, o) => s + (o.secondsToOutcome ?? 0), 0) / forWithTime.length)
    : null;

  // OPP attacking consequences (mirrors above)
  const oppWonTotal       = oppAttacking.length;
  const oppWonToScore     = oppAttacking.filter((o) => o.resultedInScore).length;
  const oppWonToShotAny   = oppAttacking.filter((o) => o.resultedInShot).length;
  const oppWonToShotOnly  = oppWonToShotAny - oppWonToScore;
  const oppWonNoShot      = oppWonTotal - oppWonToShotAny;
  const oppBrokenAttacks  = oppAttacking.filter((o) =>
    o.nextEvent !== null &&
    (o.nextEvent.kind === "TURNOVER_WON" || o.nextEvent.kind === "TURNOVER_LOST")
  ).length;
  const oppWithTime = oppAttacking.filter((o) => o.secondsToOutcome !== null);
  const oppAvgSecs  = oppWithTime.length > 0
    ? Math.round(oppWithTime.reduce((s, o) => s + (o.secondsToOutcome ?? 0), 0) / oppWithTime.length)
    : null;

  // ── Per-half slices (from FOR attacking perspective) ─────────────────────────
  const forH1 = forAttacking.filter((o) => o.turnoverEvent.period === "1H");
  const forH2 = forAttacking.filter((o) => o.turnoverEvent.period === "2H");
  const oppH1 = oppAttacking.filter((o) => o.turnoverEvent.period === "1H");
  const oppH2 = oppAttacking.filter((o) => o.turnoverEvent.period === "2H");

  // ── Tag breakdown on turnover-won events (FOR) ────────────────────────────────
  // Tags come from the turnoverEvent itself; count across all FOR-attacking outcomes
  function countTag(slice: typeof outcomes, ...tags: string[]): number {
    return slice.filter((o) => tags.some((t) => o.turnoverEvent.tags?.includes(t))).length;
  }
  const forTagTacklePress = countTag(forAttacking, "TACKLE", "PRESS");
  const forTagSwarmInt    = countTag(forAttacking, "SWARM", "INTERCEPT");
  const forTagUnforced    = countTag(forAttacking, "UNFORCED");
  const forTagSlack       = countTag(forAttacking, "SLACK_KICK_PASS", "SLACK_HAND_PASS");

  // ── Tag breakdown for OPP ─────────────────────────────────────────────────────
  const oppTagTacklePress = countTag(oppAttacking, "TACKLE", "PRESS");
  const oppTagSwarmInt    = countTag(oppAttacking, "SWARM", "INTERCEPT");
  const oppTagUnforced    = countTag(oppAttacking, "UNFORCED");
  const oppTagSlack       = countTag(oppAttacking, "SLACK_KICK_PASS", "SLACK_HAND_PASS");

  // ── Chain rule matches ─────────────────────────────────────────────────────────
  const toToScoreChains = analysis.byRule["TURNOVER_TO_SCORE"] ?? [];
  const toToShotChains  = analysis.byRule["TURNOVER_TO_SHOT"]  ?? [];
  const toToScoreFor    = toToScoreChains.filter((c) => c.teamSide === "FOR").length;
  const toToScoreOpp    = toToScoreChains.filter((c) => c.teamSide === "OPP").length;
  const toToShotFor     = toToShotChains.filter((c) => c.teamSide === "FOR").length;
  const toToShotOpp     = toToShotChains.filter((c) => c.teamSide === "OPP").length;

  // ── Formatting helpers ────────────────────────────────────────────────────────
  function pctStr(num: number, den: number): string {
    return den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
  }
  function withPct(num: number, den: number): string {
    return den > 0 ? `${num} (${pctStr(num, den)})` : String(num);
  }

  // ── COL 1: homeTeam — Attacking from Turnovers ───────────────────────────────
  {
    drawPanelBg(COL1_X, CONTENT_TOP, COL_W, CONTENT_H, "#a78bfa");
    let cy = drawPanelTitle(COL1_X, CONTENT_TOP, `${homeTeam.slice(0, 18)} — Turnover Attack`, "#a78bfa");

    if (forWonTotal === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "16px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No attacking turnovers recorded", COL1_X + COL_W / 2, CONTENT_TOP + CONTENT_H / 2);
      ctx.restore();
    } else {
      // Consequence summary
      cy = drawStatRow(COL1_X, cy, COL_W, "Turnovers won / gained",  String(forWonTotal),                    "#e2e8f0", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "→ Converted to score",    withPct(forWonToScore,   forWonTotal),  "#4ade80", true);
      cy = drawStatRow(COL1_X, cy, COL_W, "→ Shot / wide, no score", withPct(forWonToShotOnly, forWonTotal), "#fbbf24", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "→ No shot attempt",       withPct(forWonNoShot,    forWonTotal),  "#f97316", true);
      cy = drawStatRow(COL1_X, cy, COL_W, "→ Attack immediately lost", withPct(forBrokenAttacks, forWonTotal), "#94a3b8", false);
      const avgStr = forAvgSecs !== null ? `${forAvgSecs}s` : "—";
      cy = drawStatRow(COL1_X, cy, COL_W, "Avg time to outcome",     avgStr,                                "#e2e8f0", true);
      cy += 8;

      // Half split
      cy = drawSubHeader(COL1_X, cy, COL_W, "BY HALF", "#a78bfa");
      cy = drawStatRow(COL1_X, cy, COL_W, "1H — Turnovers won",   String(forH1.length),                                         "#e2e8f0", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "1H — Scored",          withPct(forH1.filter((o) => o.resultedInScore).length, forH1.length), "#4ade80", true);
      cy = drawStatRow(COL1_X, cy, COL_W, "2H — Turnovers won",   String(forH2.length),                                         "#e2e8f0", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "2H — Scored",          withPct(forH2.filter((o) => o.resultedInScore).length, forH2.length), "#4ade80", true);
      cy += 8;

      // How turnovers were won (pressure tags)
      cy = drawSubHeader(COL1_X, cy, COL_W, "HOW TURNOVERS WERE WON / GAINED", "#a78bfa");
      cy = drawStatRow(COL1_X, cy, COL_W, "Tackle / Press",     String(forTagTacklePress), "#22d3ee", false);
      cy = drawStatRow(COL1_X, cy, COL_W, "Swarm / Intercept",  String(forTagSwarmInt),    "#22d3ee", true);
      cy = drawStatRow(COL1_X, cy, COL_W, "Opp unforced error", String(forTagUnforced),    "#fbbf24", false);
      drawStatRow(COL1_X, cy, COL_W,      "Opp slack pass",     String(forTagSlack),       "#fbbf24", true);
    }
  }

  // ── COL 2: awayTeam — Attacking from Turnovers ───────────────────────────────
  {
    drawPanelBg(COL2_X, CONTENT_TOP, COL_W, CONTENT_H, "#fb7185");
    let cy = drawPanelTitle(COL2_X, CONTENT_TOP, `${awayTeam.slice(0, 18)} — Turnover Attack`, "#fb7185");

    if (oppWonTotal === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "16px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No attacking turnovers recorded", COL2_X + COL_W / 2, CONTENT_TOP + CONTENT_H / 2);
      ctx.restore();
    } else {
      cy = drawStatRow(COL2_X, cy, COL_W, "Turnovers won / gained",  String(oppWonTotal),                    "#e2e8f0", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "→ Converted to score",    withPct(oppWonToScore,   oppWonTotal),  "#4ade80", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "→ Shot / wide, no score", withPct(oppWonToShotOnly, oppWonTotal), "#fbbf24", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "→ No shot attempt",       withPct(oppWonNoShot,    oppWonTotal),  "#f97316", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "→ Attack immediately lost", withPct(oppBrokenAttacks, oppWonTotal), "#94a3b8", false);
      const avgStr = oppAvgSecs !== null ? `${oppAvgSecs}s` : "—";
      cy = drawStatRow(COL2_X, cy, COL_W, "Avg time to outcome",     avgStr,                                "#e2e8f0", true);
      cy += 8;

      cy = drawSubHeader(COL2_X, cy, COL_W, "BY HALF", "#fb7185");
      cy = drawStatRow(COL2_X, cy, COL_W, "1H — Turnovers won",   String(oppH1.length),                                         "#e2e8f0", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "1H — Scored",          withPct(oppH1.filter((o) => o.resultedInScore).length, oppH1.length), "#4ade80", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "2H — Turnovers won",   String(oppH2.length),                                         "#e2e8f0", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "2H — Scored",          withPct(oppH2.filter((o) => o.resultedInScore).length, oppH2.length), "#4ade80", true);
      cy += 8;

      cy = drawSubHeader(COL2_X, cy, COL_W, "HOW TURNOVERS WERE WON / GAINED", "#fb7185");
      cy = drawStatRow(COL2_X, cy, COL_W, "Tackle / Press",     String(oppTagTacklePress), "#22d3ee", false);
      cy = drawStatRow(COL2_X, cy, COL_W, "Swarm / Intercept",  String(oppTagSwarmInt),    "#22d3ee", true);
      cy = drawStatRow(COL2_X, cy, COL_W, "Opp unforced error", String(oppTagUnforced),    "#fbbf24", false);
      drawStatRow(COL2_X, cy, COL_W,      "Opp slack pass",     String(oppTagSlack),       "#fbbf24", true);
    }
  }

  // ── COL 3: Comparative + Chain Outcomes + Damage Conceded ────────────────────
  {
    drawPanelBg(COL3_X, CONTENT_TOP, COL_W, CONTENT_H, "#fbbf24");
    let cy = drawPanelTitle(COL3_X, CONTENT_TOP, "Turnover Punishment Summary", "#fbbf24");

    // Transition efficiency comparison bar
    cy = drawSubHeader(COL3_X, cy, COL_W, "TRANSITION EFFICIENCY (WON → SCORE %)", "#fbbf24");
    cy = drawComparisonBar(
      COL3_X, cy, COL_W,
      forWonToScore, oppWonToScore,
      homeTeam.slice(0, 10), awayTeam.slice(0, 10),
      "#a78bfa", "#fb7185",
    );
    cy += 4;
    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} — Won → Score %`, pctStr(forWonToScore, forWonTotal),  "#a78bfa", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 16)} — Won → Score %`, pctStr(oppWonToScore, oppWonTotal),  "#fb7185", true);
    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} — Won → Shot %`,  pctStr(forWonToShotAny, forWonTotal), "#a78bfa", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 16)} — Won → Shot %`,  pctStr(oppWonToShotAny, oppWonTotal), "#fb7185", true);
    cy += 10;

    // Chain rule matches
    cy = drawSubHeader(COL3_X, cy, COL_W, "CHAIN RULE MATCHES", "#fbbf24");
    cy = drawStatRow(COL3_X, cy, COL_W, `T/O Won → Score  (${homeTeam.slice(0, 10)})`,  String(toToScoreFor),  "#a78bfa", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `T/O Won → Score  (${awayTeam.slice(0, 10)})`,  String(toToScoreOpp),  "#fb7185", true);
    cy = drawStatRow(COL3_X, cy, COL_W, `T/O Won → Shot   (${homeTeam.slice(0, 10)})`,  String(toToShotFor),   "#a78bfa", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `T/O Won → Shot   (${awayTeam.slice(0, 10)})`,  String(toToShotOpp),   "#fb7185", true);
    cy += 10;

    // Damage conceded
    cy = drawSubHeader(COL3_X, cy, COL_W, "DAMAGE CONCEDED FROM TURNOVERS LOST", "#f97316");
    // FOR lost TOs → OPP scored / shot (= oppAttacking outcomes where source was a FOR-lost TO)
    const forLostToOppScore = oppAttacking.filter((o) => o.turnoverEvent.teamSide === "FOR" && o.resultedInScore).length;
    const forLostToOppShot  = oppAttacking.filter((o) => o.turnoverEvent.teamSide === "FOR" && o.resultedInShot).length;
    const forLostTotal      = outcomes.filter((o) => o.turnoverEvent.kind === "TURNOVER_LOST" && o.turnoverEvent.teamSide === "FOR").length;
    // OPP lost TOs → FOR scored / shot
    const oppLostToForScore = forAttacking.filter((o) => o.turnoverEvent.teamSide === "OPP" && o.resultedInScore).length;
    const oppLostToForShot  = forAttacking.filter((o) => o.turnoverEvent.teamSide === "OPP" && o.resultedInShot).length;
    const oppLostTotal      = outcomes.filter((o) => o.turnoverEvent.kind === "TURNOVER_LOST" && o.turnoverEvent.teamSide === "OPP").length;

    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 14)} lost → OPP scored`, withPct(forLostToOppScore, forLostTotal), "#f97316", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 14)} lost → OPP shot`,   withPct(forLostToOppShot,  forLostTotal), "#fbbf24", true);
    cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 14)} lost → FOR scored`, withPct(oppLostToForScore, oppLostTotal), "#f97316", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 14)} lost → FOR shot`,   withPct(oppLostToForShot,  oppLostTotal), "#fbbf24", true);
    cy += 10;

    // Net turnover pressure
    cy = drawSubHeader(COL3_X, cy, COL_W, "NET TURNOVER PRESSURE", "#4ade80");
    const netScore = forWonToScore - oppWonToScore;
    const netStr   = netScore > 0 ? `+${netScore} ${homeTeam.slice(0, 10)}` :
                     netScore < 0 ? `${netScore} ${awayTeam.slice(0, 10)}` : "Level";
    const netColor = netScore > 0 ? "#4ade80" : netScore < 0 ? "#fb7185" : "#94a3b8";
    cy = drawStatRow(COL3_X, cy, COL_W, "Score differential from T/Os", netStr, netColor, false);

    const netShot = forWonToShotAny - oppWonToShotAny;
    const netShotStr = netShot > 0 ? `+${netShot} ${homeTeam.slice(0, 10)}` :
                       netShot < 0 ? `${netShot} ${awayTeam.slice(0, 10)}` : "Level";
    const netShotColor = netShot > 0 ? "#4ade80" : netShot < 0 ? "#fb7185" : "#94a3b8";
    cy = drawStatRow(COL3_X, cy, COL_W, "Shot differential from T/Os",  netShotStr, netShotColor, true);
    cy += 10;

    // Transition breakdown summary
    cy = drawSubHeader(COL3_X, cy, COL_W, "TRANSITION OUTCOMES (BOTH TEAMS)", "#94a3b8");
    const bothTotal       = forWonTotal + oppWonTotal;
    const bothScored      = forWonToScore + oppWonToScore;
    const bothShotOnly    = forWonToShotOnly + oppWonToShotOnly;
    const bothBroken      = forBrokenAttacks + oppBrokenAttacks;
    const bothNoShot      = forWonNoShot + oppWonNoShot;
    cy = drawStatRow(COL3_X, cy, COL_W, "Total turnovers gained",   String(bothTotal),                 "#e2e8f0", false);
    cy = drawStatRow(COL3_X, cy, COL_W, "Led to score",             withPct(bothScored, bothTotal),    "#4ade80", true);
    cy = drawStatRow(COL3_X, cy, COL_W, "Led to shot (no score)",   withPct(bothShotOnly, bothTotal),  "#fbbf24", false);
    cy = drawStatRow(COL3_X, cy, COL_W, "Attack immediately lost",  withPct(bothBroken, bothTotal),    "#94a3b8", true);
    drawStatRow(COL3_X, cy, COL_W,      "No shot generated",        withPct(bothNoShot, bothTotal),    "#f97316", false);
  }

  return canvas;
}

// ─── Momentum & Scoring Runs page ────────────────────────────────────────────

/**
 * Builds the Momentum & Scoring Runs Analysis canvas (second-to-last chain page).
 *
 * Three columns:
 *   COL 1 — Chronological run timeline (all unanswered runs ≥ 2, capped at 14 rows)
 *   COL 2 — Half-by-half momentum breakdown (1H top panel, 2H bottom panel)
 *   COL 3 — Run quality, response timing, and segment control
 *
 * Layout mirrors existing chain pages (3 × 606 px columns, 24 px gaps).
 * All ctx.fillRect() — ctx.roundRect() intentionally absent (Safari < 15.4).
 *
 * Clock note: ScoringRun.startClockSeconds / endClockSeconds include
 * SECOND_HALF_OFFSET = 3600 for 2H events. All time formatting subtracts
 * 3600 before converting to minutes when period === "2H".
 *
 * "Unanswered runs" framing: the engine only records runs of length ≥ 2,
 * so every entry in scoringRuns.runs is already an unanswered burst.
 * Single isolated scores between bursts are absent by design.
 */
function makeMomentumRunsPage(
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Momentum & Scoring Runs", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  const CONTENT_TOP = 86;
  const CONTENT_BOT = CANVAS_H - 36;
  const CONTENT_H   = CONTENT_BOT - CONTENT_TOP;
  const COL_W       = 606;
  const COL_GAP     = 24;
  const COL1_X      = 24;
  const COL2_X      = COL1_X + COL_W + COL_GAP;
  const COL3_X      = COL2_X + COL_W + COL_GAP;

  const { runs, longestRunFor: lrf, longestRunOpp: lro } = analysis.scoringRuns;

  // ── Local helpers ─────────────────────────────────────────────────────────────

  function drawPanelBg(x: number, y: number, w: number, h: number, accentColor: string): void {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, h);
    ctx.restore();
  }

  function drawPanelTitle(x: number, y: number, label: string, accentColor: string): number {
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + 16, y + 13);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 26);
    ctx.lineTo(x + COL_W, y + 26);
    ctx.stroke();
    ctx.restore();
    return y + 28;
  }

  function drawStatRow(
    x: number, cy: number, w: number,
    label: string, value: string, valueColor: string,
    isAlt: boolean,
  ): number {
    const ROW_H = 26;
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 4, cy, w - 4, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, mid);
    ctx.fillStyle = valueColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 10, mid);
    return cy + ROW_H;
  }

  function drawSubHeader(x: number, cy: number, w: number, label: string, accentColor: string): number {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x + 4, cy, w - 4, 20);
    ctx.fillStyle = accentColor;
    ctx.font = "bold 10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, cy + 10);
    ctx.restore();
    return cy + 20;
  }

  // ── Clock formatting ──────────────────────────────────────────────────────────
  // ScoringRun clocks include SECOND_HALF_OFFSET = 3600 for 2H events.
  // Subtract before converting to display minutes.
  function clockToMin(clockSecs: number, period: "1H" | "2H"): number {
    const adjusted = period === "2H" ? clockSecs - 3600 : clockSecs;
    return Math.floor(Math.max(0, adjusted) / 60);
  }

  function runTimeLabel(run: typeof runs[number]): string {
    const startMin = clockToMin(run.startClockSeconds, run.period);
    const endMin   = clockToMin(run.endClockSeconds,   run.period);
    const halfLabel = run.period === "1H" ? "1H" : "2H";
    if (startMin === endMin) return `${halfLabel} ${startMin}'`;
    return `${halfLabel} ${startMin}'–${endMin}'`;
  }

  function runTeamLabel(run: typeof runs[number]): string {
    return run.teamSide === "FOR" ? homeTeam.slice(0, 14) : awayTeam.slice(0, 14);
  }

  function runColor(run: typeof runs[number]): string {
    return run.teamSide === "FOR" ? "#22d3ee" : "#fb7185";
  }

  // ── Derived data ──────────────────────────────────────────────────────────────

  // Per-half run slices
  const h1Runs = runs.filter((r) => r.period === "1H");
  const h2Runs = runs.filter((r) => r.period === "2H");
  const h1For  = h1Runs.filter((r) => r.teamSide === "FOR");
  const h1Opp  = h1Runs.filter((r) => r.teamSide === "OPP");
  const h2For  = h2Runs.filter((r) => r.teamSide === "FOR");
  const h2Opp  = h2Runs.filter((r) => r.teamSide === "OPP");

  // Total run-scores (sum of count) per side per half
  const h1ForScore = h1For.reduce((s, r) => s + r.count, 0);
  const h1OppScore = h1Opp.reduce((s, r) => s + r.count, 0);
  const h2ForScore = h2For.reduce((s, r) => s + r.count, 0);
  const h2OppScore = h2Opp.reduce((s, r) => s + r.count, 0);

  // Longest run in each half
  function longestInSet(set: typeof runs): typeof runs[number] | null {
    if (set.length === 0) return null;
    return set.reduce((best, r) => (r.count > best.count ? r : best));
  }
  const h1Longest = longestInSet(h1Runs);
  const h2Longest = longestInSet(h2Runs);

  // Late-game runs: segment 3 (1H late) and segment 6 (2H late)
  const h1LateRuns = h1Runs.filter((r) => r.events[0].segment === 3);
  const h2LateRuns = h2Runs.filter((r) => r.events[0].segment === 6);

  // Response timing — alternating-side consecutive pairs only
  type ResponsePair = { runnerSide: "FOR" | "OPP"; gapSeconds: number };
  const responsePairs: ResponsePair[] = [];
  for (let i = 0; i < runs.length - 1; i++) {
    const curr = runs[i];
    const next = runs[i + 1];
    // Only meaningful when sides alternate (opposition responded)
    if (curr.teamSide === next.teamSide) continue;
    const gap = Math.max(0, next.startClockSeconds - curr.endClockSeconds);
    responsePairs.push({ runnerSide: curr.teamSide, gapSeconds: gap });
  }

  // Split response pairs by who had to respond (next.teamSide responds)
  // If curr = FOR run, next = OPP run → OPP responded to FOR
  // So gapSeconds is OPP's response time; runnerSide = FOR means OPP responded
  const forRanPairs  = responsePairs.filter((p) => p.runnerSide === "FOR");  // OPP responded after FOR run
  const oppRanPairs  = responsePairs.filter((p) => p.runnerSide === "OPP"); // FOR responded after OPP run

  function avgGap(pairs: ResponsePair[]): number | null {
    if (pairs.length === 0) return null;
    return Math.round(pairs.reduce((s, p) => s + p.gapSeconds, 0) / pairs.length);
  }
  function minGap(pairs: ResponsePair[]): number | null {
    if (pairs.length === 0) return null;
    return Math.min(...pairs.map((p) => p.gapSeconds));
  }
  const forResponseAvg = avgGap(oppRanPairs);  // FOR's avg response after OPP ran
  const oppResponseAvg = avgGap(forRanPairs);  // OPP's avg response after FOR ran
  const forResponseMin = minGap(oppRanPairs);
  const oppResponseMin = minGap(forRanPairs);

  function formatGap(secs: number | null): string {
    if (secs === null) return "—";
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  // Segment control: for each segment 1–6, sum run counts by side
  const SEG_LABELS: Record<number, string> = {
    1: "1H Early (0–10)",
    2: "1H Mid   (11–20)",
    3: "1H Late  (21–30+)",
    4: "2H Early (0–10)",
    5: "2H Mid   (11–20)",
    6: "2H Late  (21–30+)",
  };
  type SegControl = { forScore: number; oppScore: number };
  const segControl: Record<number, SegControl> = {
    1: { forScore: 0, oppScore: 0 },
    2: { forScore: 0, oppScore: 0 },
    3: { forScore: 0, oppScore: 0 },
    4: { forScore: 0, oppScore: 0 },
    5: { forScore: 0, oppScore: 0 },
    6: { forScore: 0, oppScore: 0 },
  };
  for (const run of runs) {
    const seg = run.events[0].segment as number;
    if (seg >= 1 && seg <= 6) {
      if (run.teamSide === "FOR") segControl[seg].forScore += run.count;
      else                        segControl[seg].oppScore += run.count;
    }
  }

  // Overall run totals
  const forRuns       = runs.filter((r) => r.teamSide === "FOR");
  const oppRuns       = runs.filter((r) => r.teamSide === "OPP");
  const forRunTotal   = forRuns.length;
  const oppRunTotal   = oppRuns.length;
  const forRunScores  = forRuns.reduce((s, r) => s + r.count, 0);
  const oppRunScores  = oppRuns.reduce((s, r) => s + r.count, 0);
  const netRunScores  = forRunScores - oppRunScores;

  // ── COL 1: Scoring Run Timeline ───────────────────────────────────────────────
  {
    drawPanelBg(COL1_X, CONTENT_TOP, COL_W, CONTENT_H, "#fbbf24");
    let cy = drawPanelTitle(COL1_X, CONTENT_TOP, "Unanswered Scoring Runs (≥2 consecutive)", "#fbbf24");

    if (runs.length === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "16px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No unanswered scoring runs detected", COL1_X + COL_W / 2, CONTENT_TOP + CONTENT_H / 2);
      ctx.restore();
    } else {
      // Column labels
      cy = drawSubHeader(COL1_X, cy, COL_W, "TEAM  ×SCORES  WHEN  SCORE VALUE", "#fbbf24");

      const MAX_VISIBLE = 14;
      const visible = runs.slice(0, MAX_VISIBLE);

      visible.forEach((run, i) => {
        const ROW_H   = 26;
        const isAlt   = i % 2 === 0;
        const team    = runTeamLabel(run);
        const color   = runColor(run);
        const time    = runTimeLabel(run);
        const score   = fmtScore(scoreFromEvents(run.events));
        const runStr  = `×${run.count}`;

        if (isAlt) {
          ctx.fillStyle = "rgba(255,255,255,0.025)";
          ctx.fillRect(COL1_X + 4, cy, COL_W - 4, ROW_H);
        }

        const mid = cy + ROW_H / 2;
        ctx.save();
        ctx.textBaseline = "middle";

        // Team name
        ctx.fillStyle = color;
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(team, COL1_X + 14, mid);

        // Run count — centre-ish
        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(runStr, COL1_X + 190, mid);

        // Time
        ctx.fillStyle = "#64748b";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(time, COL1_X + 260, mid);

        // Score value
        ctx.fillStyle = color;
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(score, COL1_X + COL_W - 10, mid);

        ctx.restore();
        cy += ROW_H;
      });

      if (runs.length > MAX_VISIBLE) {
        cy += 4;
        ctx.save();
        ctx.fillStyle = "#475569";
        ctx.font = "12px sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(
          `... and ${runs.length - MAX_VISIBLE} more run${runs.length - MAX_VISIBLE !== 1 ? "s" : ""}`,
          COL1_X + 14,
          cy + 10,
        );
        ctx.restore();
      }
    }
  }

  // ── COL 2: Half-by-Half Momentum ──────────────────────────────────────────────
  {
    const HALF_H   = Math.floor(CONTENT_H / 2) - 8;
    const PANEL_Y1 = CONTENT_TOP;
    const PANEL_Y2 = CONTENT_TOP + HALF_H + 16;

    // ── 1H panel ─────────────────────────────────────────────────────────────────
    drawPanelBg(COL2_X, PANEL_Y1, COL_W, HALF_H, "#7dd3fc");
    let cy = drawPanelTitle(COL2_X, PANEL_Y1, "First Half — Scoring Runs", "#7dd3fc");

    if (h1Runs.length === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "14px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No unanswered runs in 1H", COL2_X + COL_W / 2, PANEL_Y1 + HALF_H / 2);
      ctx.restore();
    } else {
      cy = drawStatRow(COL2_X, cy, COL_W, `${homeTeam.slice(0, 16)} runs (≥2)`,   String(h1For.length),   "#22d3ee", false);
      cy = drawStatRow(COL2_X, cy, COL_W, `${homeTeam.slice(0, 16)} run-scores`,  String(h1ForScore),     "#22d3ee", true);
      cy = drawStatRow(COL2_X, cy, COL_W, `${awayTeam.slice(0, 16)} runs (≥2)`,   String(h1Opp.length),   "#fb7185", false);
      cy = drawStatRow(COL2_X, cy, COL_W, `${awayTeam.slice(0, 16)} run-scores`,  String(h1OppScore),     "#fb7185", true);
      cy += 6;
      if (h1Longest) {
        const best = `${runTeamLabel(h1Longest)} ×${h1Longest.count}  ${runTimeLabel(h1Longest)}`;
        cy = drawStatRow(COL2_X, cy, COL_W, "Longest 1H run", best, runColor(h1Longest), false);
      }
      const h1ControlColor = h1ForScore > h1OppScore ? "#22d3ee" : h1OppScore > h1ForScore ? "#fb7185" : "#94a3b8";
      const h1Control = h1ForScore > h1OppScore
        ? homeTeam.slice(0, 14)
        : h1OppScore > h1ForScore ? awayTeam.slice(0, 14)
        : "Level";
      cy = drawStatRow(COL2_X, cy, COL_W, "1H momentum edge", h1Control, h1ControlColor, true);
      cy += 6;
      // Late 1H
      const h1LateFor = h1LateRuns.filter((r) => r.teamSide === "FOR").reduce((s, r) => s + r.count, 0);
      const h1LateOpp = h1LateRuns.filter((r) => r.teamSide === "OPP").reduce((s, r) => s + r.count, 0);
      const h1LateStr = h1LateRuns.length === 0
        ? "No burst in 1H closing phase"
        : `${homeTeam.slice(0, 10)}: ${h1LateFor} pts  ${awayTeam.slice(0, 10)}: ${h1LateOpp} pts`;
      const h1LateCol = h1LateRuns.length === 0 ? "#475569" : "#fbbf24";
      drawStatRow(COL2_X, cy, COL_W, "1H late burst (seg 3)", h1LateStr, h1LateCol, false);
    }

    // ── 2H panel ─────────────────────────────────────────────────────────────────
    drawPanelBg(COL2_X, PANEL_Y2, COL_W, HALF_H, "#a78bfa");
    cy = drawPanelTitle(COL2_X, PANEL_Y2, "Second Half — Scoring Runs", "#a78bfa");

    if (h2Runs.length === 0) {
      ctx.save();
      ctx.fillStyle = "#475569";
      ctx.font = "14px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("No unanswered runs in 2H", COL2_X + COL_W / 2, PANEL_Y2 + HALF_H / 2);
      ctx.restore();
    } else {
      cy = drawStatRow(COL2_X, cy, COL_W, `${homeTeam.slice(0, 16)} runs (≥2)`,   String(h2For.length),   "#22d3ee", false);
      cy = drawStatRow(COL2_X, cy, COL_W, `${homeTeam.slice(0, 16)} run-scores`,  String(h2ForScore),     "#22d3ee", true);
      cy = drawStatRow(COL2_X, cy, COL_W, `${awayTeam.slice(0, 16)} runs (≥2)`,   String(h2Opp.length),   "#fb7185", false);
      cy = drawStatRow(COL2_X, cy, COL_W, `${awayTeam.slice(0, 16)} run-scores`,  String(h2OppScore),     "#fb7185", true);
      cy += 6;
      if (h2Longest) {
        const best = `${runTeamLabel(h2Longest)} ×${h2Longest.count}  ${runTimeLabel(h2Longest)}`;
        cy = drawStatRow(COL2_X, cy, COL_W, "Longest 2H run", best, runColor(h2Longest), false);
      }
      const h2ControlColor = h2ForScore > h2OppScore ? "#22d3ee" : h2OppScore > h2ForScore ? "#fb7185" : "#94a3b8";
      const h2Control = h2ForScore > h2OppScore
        ? homeTeam.slice(0, 14)
        : h2OppScore > h2ForScore ? awayTeam.slice(0, 14)
        : "Level";
      cy = drawStatRow(COL2_X, cy, COL_W, "2H momentum edge", h2Control, h2ControlColor, true);
      cy += 6;
      // Late 2H
      const h2LateFor = h2LateRuns.filter((r) => r.teamSide === "FOR").reduce((s, r) => s + r.count, 0);
      const h2LateOpp = h2LateRuns.filter((r) => r.teamSide === "OPP").reduce((s, r) => s + r.count, 0);
      const h2LateStr = h2LateRuns.length === 0
        ? "No burst in 2H closing phase"
        : `${homeTeam.slice(0, 10)}: ${h2LateFor} pts  ${awayTeam.slice(0, 10)}: ${h2LateOpp} pts`;
      const h2LateCol = h2LateRuns.length === 0 ? "#475569" : "#fbbf24";
      drawStatRow(COL2_X, cy, COL_W, "2H late burst (seg 6)", h2LateStr, h2LateCol, false);
    }
  }

  // ── COL 3: Run Quality, Response Timing, Segment Control ─────────────────────
  {
    drawPanelBg(COL3_X, CONTENT_TOP, COL_W, CONTENT_H, "#a78bfa");
    let cy = drawPanelTitle(COL3_X, CONTENT_TOP, "Run Quality & Match Control", "#a78bfa");

    // ── Best runs ─────────────────────────────────────────────────────────────────
    cy = drawSubHeader(COL3_X, cy, COL_W, "BEST SCORING RUNS", "#fbbf24");

    if (lrf) {
      cy = drawStatRow(COL3_X, cy, COL_W,
        `${homeTeam.slice(0, 16)} longest`,
        `×${lrf.count}  ${runTimeLabel(lrf)}  ${fmtScore(scoreFromEvents(lrf.events))}`,
        "#22d3ee", false,
      );
    } else {
      cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} longest`, "No run ≥2", "#475569", false);
    }
    if (lro) {
      cy = drawStatRow(COL3_X, cy, COL_W,
        `${awayTeam.slice(0, 16)} longest`,
        `×${lro.count}  ${runTimeLabel(lro)}  ${fmtScore(scoreFromEvents(lro.events))}`,
        "#fb7185", true,
      );
    } else {
      cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 16)} longest`, "No run ≥2", "#475569", true);
    }

    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} total runs`,        String(forRunTotal),  "#22d3ee", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 16)} total runs`,        String(oppRunTotal),  "#fb7185", true);
    cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} total run-scores`,  String(forRunScores), "#22d3ee", false);
    cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 16)} total run-scores`,  String(oppRunScores), "#fb7185", true);

    const netColor  = netRunScores > 0 ? "#4ade80" : netRunScores < 0 ? "#fb7185" : "#94a3b8";
    const netStr    = netRunScores > 0 ? `+${netRunScores} ${homeTeam.slice(0, 10)}`
                    : netRunScores < 0 ? `${netRunScores} ${awayTeam.slice(0, 10)}`
                    : "Level";
    cy = drawStatRow(COL3_X, cy, COL_W, "Net run-score advantage", netStr, netColor, false);
    cy += 10;

    // ── Response timing ───────────────────────────────────────────────────────────
    cy = drawSubHeader(COL3_X, cy, COL_W, "RESPONSE AFTER OPPOSITION RUN", "#f97316");

    if (responsePairs.length < 2) {
      cy = drawStatRow(COL3_X, cy, COL_W, "Insufficient alternating runs", "—", "#475569", false);
      cy++;
    } else {
      cy = drawStatRow(COL3_X, cy, COL_W,
        `${homeTeam.slice(0, 16)} avg response`,
        formatGap(forResponseAvg), "#22d3ee", false,
      );
      cy = drawStatRow(COL3_X, cy, COL_W,
        `${homeTeam.slice(0, 16)} fastest response`,
        formatGap(forResponseMin), "#22d3ee", true,
      );
      cy = drawStatRow(COL3_X, cy, COL_W,
        `${awayTeam.slice(0, 16)} avg response`,
        formatGap(oppResponseAvg), "#fb7185", false,
      );
      cy = drawStatRow(COL3_X, cy, COL_W,
        `${awayTeam.slice(0, 16)} fastest response`,
        formatGap(oppResponseMin), "#fb7185", true,
      );
    }
    cy += 10;

    // ── Segment control ───────────────────────────────────────────────────────────
    cy = drawSubHeader(COL3_X, cy, COL_W, "SEGMENT CONTROL (BY RUN-SCORES)", "#22d3ee");

    ([1, 2, 3, 4, 5, 6] as const).forEach((seg, i) => {
      const { forScore, oppScore } = segControl[seg];
      const total = forScore + oppScore;
      let controlStr: string;
      let controlColor: string;
      if (total === 0) {
        controlStr  = "No runs";
        controlColor = "#475569";
      } else if (forScore > oppScore) {
        controlStr  = `${homeTeam.slice(0, 10)} +${forScore - oppScore}`;
        controlColor = "#22d3ee";
      } else if (oppScore > forScore) {
        controlStr  = `${awayTeam.slice(0, 10)} +${oppScore - forScore}`;
        controlColor = "#fb7185";
      } else {
        controlStr  = "Level";
        controlColor = "#94a3b8";
      }
      cy = drawStatRow(COL3_X, cy, COL_W, SEG_LABELS[seg], controlStr, controlColor, i % 2 === 0);
    });
  }

  return canvas;
}

// ─── Tactical Intelligence Summary page ───────────────────────────────────────

/**
 * Renders the Tactical Intelligence Summary — the closing briefing page.
 *
 * Synthesises kickout, turnover, momentum and chain-efficiency data into a
 * premium two-column layout with large insight cards and coach-readable
 * statements. All conclusions are deterministic arithmetic — no heuristics,
 * no invented prose. Every sentence is filled from the actual match numbers.
 *
 * Layout (1920×1080, 2 wide columns):
 *   Left  (x 24–951):  Kickout Platform · Turnover Efficiency · Match Intelligence
 *   Right (x 968–1895): Momentum Control · Chain Efficiency   · Performance Summary
 *
 * Division guards: every percentage computation checks denominator > 0.
 * Empty state: renders "No match data recorded" when totalEventsAnalysed === 0.
 * No ctx.roundRect() — uses ctx.fillRect() throughout (Safari < 15.4 safe).
 */
function makeTacticalIntelligencePage(
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Tactical Intelligence Summary", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  // ── Layout constants ───────────────────────────────────────────────────────
  const CONTENT_TOP = 86;
  const CONTENT_BOT = CANVAS_H - 36;
  const L_COL_X     = 24;
  const L_COL_W     = 928;
  const R_COL_X     = 968;
  const R_COL_W     = 928;  // 968 + 928 = 1896  (24 px right gutter)
  const CARD_GAP    = 20;   // vertical gap between cards within a column

  // ── Derived data ───────────────────────────────────────────────────────────

  // Kickout
  const ko       = analysis.kickouts;
  const koTotal  = ko.total;
  const koWon    = ko.won;
  const koWinPct = koTotal > 0 ? Math.round((koWon  / koTotal) * 100) : 0;
  // wonToScorePercent and lostAllowedScorePercent are pre-computed and
  // already division-guarded by the chain engine — use directly.
  const koConvPct = ko.wonToScorePercent;
  const koExpPct  = ko.lostAllowedScorePercent;
  const koNetAdv  = koConvPct - koExpPct;  // positive = net kickout advantage

  // Turnover
  const tv        = analysis.turnovers;
  const tvTotal   = tv.total;
  const tvWon     = tv.won;
  const tvLost    = tv.lost;
  const tvWinPct  = tvTotal > 0 ? Math.round((tvWon  / tvTotal) * 100) : 0;
  const tvConvPct = tv.wonToScorePercent;   // pre-computed by engine
  // wonToShot includes scores; subtract to get shot-only rate
  const tvShotOnly = tvWon > 0
    ? Math.round(((tv.wonToShot - tv.wonToScore) / tvWon) * 100)
    : 0;
  const tvDefExp   = tvLost > 0
    ? Math.round((tv.lostAllowedScore / tvLost) * 100)
    : 0;

  // Scoring runs
  const sr         = analysis.scoringRuns;
  const allRuns    = sr.runs;
  const runsFor    = allRuns.filter((r) => r.teamSide === "FOR").length;
  const runsOpp    = allRuns.filter((r) => r.teamSide === "OPP").length;
  const longestFor = sr.longestRunFor?.count  ?? 0;
  const longestOpp = sr.longestRunOpp?.count  ?? 0;
  const maxConsFor = sr.maxConsecutiveFor;
  const maxConsOpp = sr.maxConsecutiveOpp;

  // Chain efficiency
  const sm         = analysis.summary;
  const chainTotal  = sm.totalChains;
  const chainForPct = chainTotal > 0
    ? Math.round((sm.forChains / chainTotal) * 100)
    : 0;
  const koToScore   = sm.byRule["KICKOUT_TO_SCORE"]  ?? 0;
  const tvToScore   = sm.byRule["TURNOVER_TO_SCORE"] ?? 0;
  const freeToGoal  = sm.byRule["FREE_WON_TO_GOAL"]  ?? 0;

  // ── Local helpers ──────────────────────────────────────────────────────────

  function drawCardBg(x: number, y: number, w: number, h: number, accentColor: string): void {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, h);
    ctx.restore();
  }

  function drawCardTitle(x: number, y: number, w: number, label: string, accentColor: string): number {
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + 16, y + 14);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 28);
    ctx.lineTo(x + w, y + 28);
    ctx.stroke();
    ctx.restore();
    return y + 30;
  }

  /** Large hero metric — primary value (42 px bold) + descriptor below.
   *  Returns cy after the block (~76 px consumed). */
  function drawHeroMetric(
    x: number, cy: number, value: string, label: string, valueColor: string,
  ): number {
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = valueColor;
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(value, x + 20, cy + 46);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.fillText(label.toUpperCase(), x + 20, cy + 63);
    ctx.restore();
    return cy + 76;
  }

  /** Compact metric row — label left, value right. Returns cy after the row (30 px). */
  function drawMetricRow(
    x: number, cy: number, w: number,
    label: string, value: string, valueColor: string, isAlt: boolean,
  ): number {
    const ROW_H = 30;
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 4, cy, w - 4, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 16, mid);
    ctx.fillStyle = valueColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 14, mid);
    return cy + ROW_H;
  }

  /** Single-line insight sentence (truncated with ellipsis if too wide).
   *  Returns cy after the line (22 px consumed). */
  function drawInsightLine(
    x: number, cy: number, w: number, text: string, textColor: string,
  ): number {
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = "italic 14px sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const maxW = w - 32;  // 16 px margin each side
    let display = text;
    if (ctx.measureText(display).width > maxW) {
      let iterations = 0;
      const maxIterations = 1000;
      while (display.length > 0 && ctx.measureText(display + "…").width > maxW && iterations < maxIterations) {
        display = display.slice(0, -1);
        iterations++;
      }
      display += "…";
    }
    ctx.fillText(display, x + 16, cy);
    ctx.restore();
    return cy + 22;
  }

  /** Flag chip — filled rect + bold label. Returns x after the chip + gap (8 px). */
  function drawFlagChip(
    x: number, cy: number,
    label: string, bgColor: string, textColor: string,
  ): number {
    ctx.save();
    ctx.font = "bold 11px sans-serif";
    const tw    = ctx.measureText(label).width;
    const chipW = tw + 20;
    const chipH = 24;
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, cy, chipW, chipH);
    ctx.fillStyle = textColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 10, cy + chipH / 2);
    ctx.restore();
    return x + chipW + 8;
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (analysis.totalEventsAnalysed === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No match data recorded", CANVAS_W / 2, CANVAS_H / 2);
    return canvas;
  }

  // ── Card geometry ──────────────────────────────────────────────────────────
  // Each column: top card 280 px, mid card 280 px, bottom card fills remainder.
  const CARD_H_TOP = 280;
  const CARD_H_MID = 280;
  const CARD_H_BOT = CONTENT_BOT - CONTENT_TOP
    - CARD_H_TOP - CARD_GAP
    - CARD_H_MID - CARD_GAP;  // = 958 − 280 − 20 − 280 − 20 = 358

  const card1Y = CONTENT_TOP;
  const card2Y = card1Y + CARD_H_TOP + CARD_GAP;
  const card3Y = card2Y + CARD_H_MID + CARD_GAP;

  // ── LEFT — CARD 1: KICKOUT PLATFORM ───────────────────────────────────────
  drawCardBg(L_COL_X, card1Y, L_COL_W, CARD_H_TOP, "#22d3ee");
  let cy = drawCardTitle(L_COL_X, card1Y, L_COL_W, "Kickout Platform", "#22d3ee");
  cy = drawHeroMetric(
    L_COL_X, cy,
    koTotal > 0 ? `${koWinPct}%` : "—",
    `Kickout Win Rate  (${koWon} won of ${koTotal} total)`,
    "#22d3ee",
  );
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Won kickouts → score",     `${koConvPct}%`, "#34d399", false);
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Lost kickouts → opp scored", `${koExpPct}%`, "#fb7185", true);
  {
    const netColor = koNetAdv > 0 ? "#34d399" : koNetAdv < 0 ? "#fb7185" : "#94a3b8";
    const netStr   = koNetAdv === 0 ? "0" : (koNetAdv > 0 ? `+${koNetAdv}` : `${koNetAdv}`);
    drawMetricRow(L_COL_X, cy, L_COL_W, "Net kickout advantage", netStr, netColor, false);
  }

  // ── LEFT — CARD 2: TURNOVER EFFICIENCY ────────────────────────────────────
  drawCardBg(L_COL_X, card2Y, L_COL_W, CARD_H_MID, "#a78bfa");
  cy = drawCardTitle(L_COL_X, card2Y, L_COL_W, "Turnover Efficiency", "#a78bfa");
  cy = drawHeroMetric(
    L_COL_X, cy,
    tvTotal > 0 ? `${tvWinPct}%` : "—",
    `Turnover Win Rate  (${tvWon} won of ${tvTotal} total)`,
    "#a78bfa",
  );
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Won turnovers → score",     `${tvConvPct}%`, "#34d399", false);
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Won turnovers → shot only", `${tvShotOnly}%`, "#fbbf24", true);
  drawMetricRow(L_COL_X, cy, L_COL_W, "Lost turnovers → opp scored", `${tvDefExp}%`, "#fb7185", false);

  // ── LEFT — CARD 3: MATCH INTELLIGENCE ─────────────────────────────────────
  drawCardBg(L_COL_X, card3Y, L_COL_W, CARD_H_BOT, "#f59e0b");
  cy = drawCardTitle(L_COL_X, card3Y, L_COL_W, "Match Intelligence", "#f59e0b");
  cy += 10;

  // Deterministic insight sentences — each filled from match numbers only.
  const insights: Array<{ text: string }> = [];

  if (koTotal > 0) {
    if (koWinPct >= 55) {
      insights.push({ text: `Strong kickout platform — ${koWinPct}% win rate, ${koConvPct}% converted to score.` });
    } else if (koWinPct < 45) {
      insights.push({ text: `Kickout vulnerability — won only ${koWinPct}% (${koWon}/${koTotal}), conceding ${koExpPct}% of losses.` });
    } else {
      insights.push({ text: `Balanced kickout contest — ${koWinPct}% win rate; ${koConvPct}% of wins converted.` });
    }
  }

  if (tvTotal > 0) {
    if (tvConvPct >= 35) {
      insights.push({ text: `Clinical turnover conversion — ${tvConvPct}% of won turnovers became scores.` });
    } else if (tvConvPct < 20 && tvWon > 0) {
      insights.push({ text: `Won ${tvWon}/${tvTotal} turnovers but converted only ${tvConvPct}% to scores.` });
    } else {
      insights.push({ text: `Turnover win rate ${tvWinPct}% — ${tvConvPct}% converted; opp punished ${tvDefExp}% of losses.` });
    }
  }

  const maxCons = Math.max(maxConsFor, maxConsOpp);
  if (maxCons >= 2) {
    const pressureSide = maxConsFor >= maxConsOpp
      ? homeTeam.slice(0, 16)
      : awayTeam.slice(0, 16);
    insights.push({
      text: `${pressureSide} had a ${maxCons}-score unanswered run — the game’s defining pressure period.`,
    });
  }

  if (chainTotal > 0) {
    if (chainForPct >= 60) {
      insights.push({ text: `Tactical chain dominance — ${chainForPct}% of all sequences resolved FOR.` });
    } else if (chainForPct <= 40) {
      insights.push({ text: `Opposition chain advantage — only ${chainForPct}% of tactical sequences resolved FOR.` });
    } else {
      insights.push({ text: `Competitive tactical contest — ${chainForPct}% of ${chainTotal} chains resolved FOR.` });
    }
  }

  const MAX_INSIGHTS = 4;
  for (let i = 0; i < Math.min(insights.length, MAX_INSIGHTS); i++) {
    cy = drawInsightLine(L_COL_X, cy, L_COL_W, insights[i].text, "#e2e8f0");
    cy += 10;
  }

  // Status flag chips — anchored near the bottom of the card
  const flagsY = Math.max(cy + 8, card3Y + CARD_H_BOT - 52);
  let fx = L_COL_X + 16;
  if (koWinPct >= 55)    fx = drawFlagChip(fx, flagsY, "KO Strength",    "rgba(34,211,238,0.15)",  "#22d3ee");
  if (koNetAdv < -10)    fx = drawFlagChip(fx, flagsY, "KO Risk",        "rgba(251,113,133,0.15)", "#fb7185");
  if (tvConvPct >= 35)   fx = drawFlagChip(fx, flagsY, "Clinical",       "rgba(52,211,153,0.15)",  "#34d399");
  if (tvDefExp > 40)     fx = drawFlagChip(fx, flagsY, "TV Exposure",    "rgba(251,113,133,0.15)", "#fb7185");
  if (maxConsFor >= 4)   fx = drawFlagChip(fx, flagsY, "Momentum Burst", "rgba(34,211,238,0.15)",  "#22d3ee");
  if (maxConsOpp >= 4)   fx = drawFlagChip(fx, flagsY, "Opp Pressure",   "rgba(251,113,133,0.15)", "#fb7185");
  if (chainForPct >= 60) drawFlagChip(fx, flagsY, "Chain Control",  "rgba(167,139,250,0.15)", "#a78bfa");

  // ── RIGHT — CARD 1: MOMENTUM CONTROL ──────────────────────────────────────
  drawCardBg(R_COL_X, card1Y, R_COL_W, CARD_H_TOP, "#22d3ee");
  let rcy = drawCardTitle(R_COL_X, card1Y, R_COL_W, "Momentum Control", "#22d3ee");
  {
    const runAdvColor = runsFor > runsOpp ? "#22d3ee"
      : runsFor < runsOpp ? "#fb7185"
      : "#94a3b8";
    rcy = drawHeroMetric(
      R_COL_X, rcy,
      allRuns.length > 0 ? `${runsFor} / ${runsOpp}` : "—",
      `Scoring Runs FOR / OPP  (runs of ≥2 consecutive scores)`,
      runAdvColor,
    );
  }
  rcy = drawMetricRow(R_COL_X, rcy, R_COL_W,
    `${homeTeam.slice(0, 22)} longest burst`,
    longestFor > 0 ? `${longestFor} scores` : "—", "#22d3ee", false);
  rcy = drawMetricRow(R_COL_X, rcy, R_COL_W,
    `${awayTeam.slice(0, 22)} longest burst`,
    longestOpp > 0 ? `${longestOpp} scores` : "—", "#fb7185", true);
  rcy = drawMetricRow(R_COL_X, rcy, R_COL_W,
    `${homeTeam.slice(0, 22)} max consecutive`, `${maxConsFor}`, "#22d3ee", false);
  drawMetricRow(R_COL_X, rcy, R_COL_W,
    `${awayTeam.slice(0, 22)} max consecutive`, `${maxConsOpp}`, "#fb7185", true);

  // ── RIGHT — CARD 2: CHAIN EFFICIENCY ──────────────────────────────────────
  drawCardBg(R_COL_X, card2Y, R_COL_W, CARD_H_MID, "#a78bfa");
  rcy = drawCardTitle(R_COL_X, card2Y, R_COL_W, "Chain Efficiency", "#a78bfa");
  {
    const chainColor = chainForPct >= 60 ? "#34d399"
      : chainForPct <= 40 ? "#fb7185"
      : "#94a3b8";
    rcy = drawHeroMetric(
      R_COL_X, rcy,
      chainTotal > 0 ? `${chainForPct}%` : "—",
      `Chain Win Rate  (${sm.forChains} of ${chainTotal} sequences resolved FOR)`,
      chainColor,
    );
  }
  rcy = drawMetricRow(R_COL_X, rcy, R_COL_W, "Kickout → Score chains",   `${koToScore}`,  "#22d3ee", false);
  rcy = drawMetricRow(R_COL_X, rcy, R_COL_W, "Turnover → Score chains",  `${tvToScore}`,  "#a78bfa", true);
  drawMetricRow(R_COL_X, rcy, R_COL_W, "Free Won → Goal chains",         `${freeToGoal}`, "#fbbf24", false);

  // ── RIGHT — CARD 3: PERFORMANCE SUMMARY ───────────────────────────────────
  drawCardBg(R_COL_X, card3Y, R_COL_W, CARD_H_BOT, "#34d399");
  rcy = drawCardTitle(R_COL_X, card3Y, R_COL_W, "Performance Summary", "#34d399");
  rcy += 12;

  // Two value columns: FOR (home) and OPP (away)
  const FOR_X = R_COL_X + Math.round(R_COL_W * 0.70);  // centre of FOR value
  const OPP_X = R_COL_X + Math.round(R_COL_W * 0.88);  // centre of OPP value

  // Column header strip
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(R_COL_X + 4, rcy, R_COL_W - 4, 24);
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 10px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("METRIC", R_COL_X + 16, rcy + 12);
  ctx.textAlign = "center";
  ctx.fillText(homeTeam.slice(0, 10).toUpperCase(), FOR_X, rcy + 12);
  ctx.fillText(awayTeam.slice(0, 10).toUpperCase(), OPP_X, rcy + 12);
  rcy += 24;

  const summaryRows: Array<{
    label: string;
    forVal: string;
    oppVal: string;
    forColor: string;
    oppColor: string;
  }> = [
    {
      label:    "Kickout win rate",
      forVal:   `${koWinPct}%`,
      oppVal:   koTotal > 0 ? `${100 - koWinPct}%` : "—",
      forColor: koWinPct >= 50 ? "#22d3ee" : "#94a3b8",
      oppColor: koTotal > 0 && koWinPct < 50 ? "#fb7185" : "#94a3b8",
    },
    {
      label:    "Turnover → score rate",
      forVal:   `${tvConvPct}%`,
      oppVal:   `${tvDefExp}%`,
      forColor: tvConvPct >= 30 ? "#34d399" : "#94a3b8",
      oppColor: tvDefExp > 35 ? "#fb7185" : "#94a3b8",
    },
    {
      label:    "Longest scoring run",
      forVal:   `${longestFor}`,
      oppVal:   `${longestOpp}`,
      forColor: longestFor >= longestOpp ? "#22d3ee" : "#94a3b8",
      oppColor: longestOpp > longestFor  ? "#fb7185" : "#94a3b8",
    },
    {
      label:    "Chains won (of total)",
      forVal:   `${sm.forChains}`,
      oppVal:   `${sm.oppChains}`,
      forColor: sm.forChains >= sm.oppChains ? "#22d3ee" : "#94a3b8",
      oppColor: sm.oppChains >  sm.forChains ? "#fb7185" : "#94a3b8",
    },
  ];

  summaryRows.forEach((row, i) => {
    const ROW_H = 30;
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(R_COL_X + 4, rcy, R_COL_W - 4, ROW_H);
    }
    const mid = rcy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(row.label, R_COL_X + 16, mid);
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = row.forColor;
    ctx.fillText(row.forVal, FOR_X, mid);
    ctx.fillStyle = row.oppColor;
    ctx.fillText(row.oppVal, OPP_X, mid);
    rcy += ROW_H;
  });
  // rcy holds final y after last row; no further content in this card

  return canvas;
}

// ─── Tactical Review Guide page ───────────────────────────────────────────────

/**
 * Renders the Tactical Review Guide — the final PDF page.
 *
 * Calls deriveReviewPrompts() to obtain up to 10 deterministic, threshold-based
 * review prompts, then renders them as a vertical list of full-width strips.
 *
 * Layout (1920×1080):
 *   Row 1 (y 86–122):  Category summary chips (count per category)
 *   Rows 2–11:         One prompt strip per prompt (h=64, gap=10)
 *
 * Each strip:
 *   [4 px category-colour accent bar] [category chip] [prompt text] [evidence tag]
 *
 * All prompts from deriveReviewPrompts() are guaranteed to be:
 *   - Factual, non-prescriptive, and non-judgmental
 *   - Traceable to a specific metric via evidenceTag
 *   - Free of tactical prescriptions or manager-style advice
 *
 * No ctx.roundRect() — uses ctx.fillRect() throughout (Safari < 15.4 safe).
 * Empty state: "No review patterns identified — too few tactical events recorded."
 */
function makeTacticalReviewGuidePage(
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Tactical Review Guide", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  const prompts = deriveReviewPrompts(analysis, homeTeam, awayTeam);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (prompts.length === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(
      "No review patterns identified — too few tactical events recorded.",
      CANVAS_W / 2, CANVAS_H / 2,
    );
    return canvas;
  }

  // ── Layout constants ───────────────────────────────────────────────────────
  const CONTENT_TOP  = 86;
  const STRIP_X      = 24;
  const STRIP_W      = CANVAS_W - 48;   // 1872 px  (24 px margin each side)
  const STRIP_H      = 64;
  const STRIP_GAP    = 10;
  const SUMMARY_H    = 30;
  const SUMMARY_GAP  = 16;

  // ── Category helpers ───────────────────────────────────────────────────────

  function categoryColor(cat: ReviewPromptCategory): string {
    switch (cat) {
      case "KICKOUT":  return "#22d3ee";
      case "TURNOVER": return "#a78bfa";
      case "MOMENTUM": return "#fbbf24";
      case "CHAIN":    return "#34d399";
      case "GENERAL":  return "#94a3b8";
    }
  }

  function categoryBgColor(cat: ReviewPromptCategory): string {
    switch (cat) {
      case "KICKOUT":  return "rgba(34,211,238,0.15)";
      case "TURNOVER": return "rgba(167,139,250,0.15)";
      case "MOMENTUM": return "rgba(251,191,36,0.15)";
      case "CHAIN":    return "rgba(52,211,153,0.15)";
      case "GENERAL":  return "rgba(148,163,184,0.15)";
    }
  }

  // ── Summary chip row ───────────────────────────────────────────────────────
  // Shows count per category before the prompt list.

  const ORDERED_CATS: readonly ReviewPromptCategory[] = [
    "KICKOUT", "TURNOVER", "MOMENTUM", "CHAIN", "GENERAL",
  ];
  const countByCategory = new Map<ReviewPromptCategory, number>();
  for (const p of prompts) {
    countByCategory.set(p.category, (countByCategory.get(p.category) ?? 0) + 1);
  }

  let cx = STRIP_X;
  const summaryY = CONTENT_TOP;
  ctx.font = "bold 11px sans-serif";
  for (const cat of ORDERED_CATS) {
    const count = countByCategory.get(cat) ?? 0;
    if (count === 0) continue;
    const label  = `${cat}  ${count}`;
    const tw     = ctx.measureText(label).width;
    const chipW  = tw + 22;
    ctx.fillStyle = categoryBgColor(cat);
    ctx.fillRect(cx, summaryY, chipW, SUMMARY_H);
    ctx.fillStyle = categoryColor(cat);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, cx + 11, summaryY + SUMMARY_H / 2);
    cx += chipW + 12;
  }

  // ── Prompt strip renderer ──────────────────────────────────────────────────

  function drawPromptStrip(p: ReviewPrompt, stripY: number): void {
    const catColor = categoryColor(p.category);
    const catBg    = categoryBgColor(p.category);

    // Background panel
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(STRIP_X + 4, stripY, STRIP_W - 4, STRIP_H);

    // Left category accent bar
    ctx.fillStyle = catColor;
    ctx.fillRect(STRIP_X, stripY, 4, STRIP_H);

    // Vertical centre of the strip — content row 1
    const ROW1_Y = stripY + 22;
    const ROW2_Y = stripY + 50;

    // Category chip (row 1, left)
    ctx.font = "bold 10px sans-serif";
    const chipLabel = p.category;
    const chipTW    = ctx.measureText(chipLabel).width;
    const chipW     = chipTW + 18;
    const CHIP_X    = STRIP_X + 14;
    const CHIP_TOP  = ROW1_Y - 10;  // chip h=20, centred on ROW1_Y
    ctx.fillStyle = catBg;
    ctx.fillRect(CHIP_X, CHIP_TOP, chipW, 20);
    ctx.fillStyle = catColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(chipLabel, CHIP_X + 9, ROW1_Y);

    // Prompt text (row 1, after chip)
    const TEXT_X    = CHIP_X + chipW + 14;
    const MAX_TW    = STRIP_X + STRIP_W - TEXT_X - 14;  // right margin
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let display = p.text;
    if (ctx.measureText(display).width > MAX_TW) {
      let iterations = 0;
      const maxIterations = 1000;
      while (display.length > 0 && ctx.measureText(display + "…").width > MAX_TW && iterations < maxIterations) {
        display = display.slice(0, -1);
        iterations++;
      }
      display += "…";
    }
    ctx.fillText(display, TEXT_X, ROW1_Y);

    // Evidence tag (row 2, right-aligned — small, dimmed)
    ctx.fillStyle = "#334155";
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "right";
    ctx.fillText(p.evidenceTag, STRIP_X + STRIP_W - 10, ROW2_Y);
  }

  // ── Render all strips ──────────────────────────────────────────────────────

  const stripStartY = CONTENT_TOP + SUMMARY_H + SUMMARY_GAP;
  prompts.forEach((p, i) => {
    const stripY = stripStartY + i * (STRIP_H + STRIP_GAP);
    drawPromptStrip(p, stripY);
  });

  return canvas;
}

// ─── Opposition Snapshot page ──────────────────────────────────────────────────

/**
 * Renders the Opposition Snapshot — the final PDF page.
 *
 * Data sources:
 *   - ChainAnalysis: byTeamSide.opp, kickouts, turnovers, scoringRuns, byRule,
 *                    byPeriod, bySegment, summary.
 *   - Raw events array: for score position (nx/ny) and OPP shot count derivation.
 *
 * Accent colour: #f87171 (OPP red) — distinct from all other chain page accents.
 *
 * Layout: Two-column (L 928 px / R 928 px), dark background.
 *   Left  — Scoring Profile · Restart Threat · Turnover Threat
 *   Right — Momentum Spell  · Chain Rate     · Rematch Watchlist
 *
 * All metrics are deterministic — no AI language, no prescriptions.
 * Rematch Watchlist bullets are threshold-based rules only (max 5).
 * No ctx.roundRect() — uses ctx.fillRect() throughout (Safari < 15.4 safe).
 */
function makeOppositionSnapshotPage(
  events: readonly PdfExportEvent[],
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Opposition Snapshot", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  // ── Layout constants ───────────────────────────────────────────────────────
  const CONTENT_TOP = 86;
  const CONTENT_BOT = CANVAS_H - 36;
  const L_COL_X     = 24;
  const L_COL_W     = 928;
  const R_COL_X     = 968;
  const R_COL_W     = 928;
  const CARD_GAP    = 20;
  const OPP_ACCENT  = "#f87171";

  // ── Derived data ───────────────────────────────────────────────────────────

  // Scoring profile
  const oppScore   = scoreFromEvents(events.filter((e) => e.teamSide === "OPP"));
  const oppScore1H = scoreFromEvents(events.filter((e) => e.teamSide === "OPP" && e.period === "1H"));
  const oppScore2H = scoreFromEvents(events.filter((e) => e.teamSide === "OPP" && e.period === "2H"));

  const oppShotsAll = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SHOTS.has(e.kind),
  ).length;
  const oppShotAcc = oppShotsAll > 0
    ? Math.round((oppScore.total / oppShotsAll) * 100)
    : 0;

  // Score zone: average normalised-x across OPP score events (nx always finite on PdfExportEvent)
  const oppScoreEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind) && isFinite(e.nx),
  );
  let scoreZoneLabel = "—";
  if (oppScoreEvts.length > 0) {
    const avgNx = oppScoreEvts.reduce((sum, e) => sum + e.nx, 0) / oppScoreEvts.length;
    scoreZoneLabel = avgNx < 0.35 ? "Left Channel" : avgNx > 0.65 ? "Right Channel" : "Central";
  }

  // Kickout restart threat
  const ko          = analysis.kickouts;
  const koOppWon    = ko.outcomes.filter((o) => o.winningSide === "OPP").length;
  const koOppWinPct = ko.total > 0 ? Math.round((koOppWon / ko.total) * 100) : 0;
  const koOppChains = (analysis.byRule["KICKOUT_TO_SCORE"]             ?? []).filter((c) => c.teamSide === "OPP").length;
  const koFromLost  = (analysis.byRule["KICKOUT_LOST_TO_SCORE_AGAINST"] ?? []).filter((c) => c.teamSide === "OPP").length;
  const koLostScore    = ko.lostAllowedScore;
  const koLostScorePct = ko.lostAllowedScorePercent;

  // Turnover threat
  const tv           = analysis.turnovers;
  const tvLost       = tv.lost;
  const tvOppToScore = (analysis.byRule["TURNOVER_TO_SCORE"] ?? []).filter((c) => c.teamSide === "OPP").length;
  const tvOppToShot  = (analysis.byRule["TURNOVER_TO_SHOT"]  ?? []).filter((c) => c.teamSide === "OPP").length;
  const tvLostScore  = tv.lostAllowedScore;
  const tvConvPct    = tvLost > 0 ? Math.round((tvLostScore / tvLost) * 100) : 0;

  // Momentum spell
  const sr         = analysis.scoringRuns;
  const oppRuns    = sr.runs.filter((r) => r.teamSide === "OPP");
  const longestOpp = sr.longestRunOpp;   // may be null — always null-checked below
  const maxConsOpp = sr.maxConsecutiveOpp;

  function clockToMin(clockSecs: number, period: "1H" | "2H"): number {
    const adjusted = period === "2H" ? clockSecs - 3600 : clockSecs;
    return Math.floor(Math.max(0, adjusted) / 60);
  }

  const longestOppTimeLabel = longestOpp != null
    ? `${longestOpp.period === "1H" ? "1H" : "2H"} ~${clockToMin(longestOpp.startClockSeconds, longestOpp.period)}'`
    : "—";

  // Chain rate
  const sm          = analysis.summary;
  const oppChains   = sm.oppChains;
  const chainTotal  = sm.totalChains;
  const oppChainPct = chainTotal > 0 ? Math.round((oppChains / chainTotal) * 100) : 0;
  const opp1HChains = (analysis.byPeriod["1H"] ?? []).filter((c) => c.teamSide === "OPP").length;
  const opp2HChains = (analysis.byPeriod["2H"] ?? []).filter((c) => c.teamSide === "OPP").length;

  // Strongest OPP segment (by OPP chain count per segment — iterate 1–6)
  const SEG_LABELS: Record<number, string> = {
    1: "Seg 1 (1H Early)", 2: "Seg 2 (1H Mid)", 3: "Seg 3 (1H Late)",
    4: "Seg 4 (2H Early)", 5: "Seg 5 (2H Mid)", 6: "Seg 6 (2H Late)",
  };
  let strongestSeg   = 0;
  let strongestCount = 0;
  for (let seg = 1; seg <= 6; seg++) {
    const key   = seg as MatchEventSegment;
    const count = (analysis.bySegment[key] ?? []).filter((c) => c.teamSide === "OPP").length;
    if (count > strongestCount) { strongestCount = count; strongestSeg = seg; }
  }
  const strongestSegLabel = strongestSeg > 0 ? (SEG_LABELS[strongestSeg] ?? "—") : "—";

  // Rematch Watchlist — deterministic threshold rules only, max 5 bullets
  const watchlist: string[] = [];
  if (maxConsOpp >= 4)    watchlist.push(`Peak run of ${maxConsOpp} unanswered — sustained pressure threat`);
  if (tvConvPct  >= 40)   watchlist.push(`${tvConvPct}% of gifted possession converted to opposition scores`);
  if (koOppWinPct >= 55)  watchlist.push(`Opposition won ${koOppWinPct}% of kickout possession`);
  if (koLostScore >= 2)   watchlist.push(`${koLostScore} score${koLostScore !== 1 ? "s" : ""} conceded directly from kickout losses`);
  if (oppChainPct >= 55)  watchlist.push(`Held tactical chain advantage — ${oppChainPct}% of all detected chains`);
  // Fallback: always at least one bullet
  if (watchlist.length === 0) watchlist.push("No critical tactical thresholds exceeded in this match");
  const bullets = watchlist.slice(0, 5);

  // ── Local helpers ──────────────────────────────────────────────────────────

  function drawCardBg(x: number, y: number, w: number, h: number, accentColor: string): void {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, h);
    ctx.restore();
  }

  function drawCardTitle(x: number, y: number, w: number, label: string, accentColor: string): number {
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + 16, y + 14);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 28);
    ctx.lineTo(x + w, y + 28);
    ctx.stroke();
    ctx.restore();
    return y + 30;
  }

  /** Large hero value (42 px bold) + small descriptor below. Returns cy + 76. */
  function drawHeroStat(
    x: number, cy: number, value: string, label: string, valueColor: string,
  ): number {
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = valueColor;
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(value, x + 20, cy + 46);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.fillText(label.toUpperCase(), x + 20, cy + 63);
    ctx.restore();
    return cy + 76;
  }

  /** Compact label/value row. Returns cy + 30. */
  function drawMetricRow(
    x: number, cy: number, w: number,
    label: string, value: string, valueColor: string, isAlt: boolean,
  ): number {
    const ROW_H = 30;
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 4, cy, w - 4, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 16, mid);
    ctx.fillStyle = valueColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 14, mid);
    return cy + ROW_H;
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (analysis.totalEventsAnalysed === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No match data recorded", CANVAS_W / 2, CANVAS_H / 2);
    return canvas;
  }

  // ── Card geometry ──────────────────────────────────────────────────────────
  // CONTENT_H = 958 (= CANVAS_H − 36 − 86)
  // Left:  Scoring Profile 310 + gap + Restart Threat 220 + gap + Turnover Threat 388 = 958
  // Right: Momentum Spell  240 + gap + Chain Rate    240 + gap + Rematch Watchlist 438 = 958
  const CONTENT_H  = CONTENT_BOT - CONTENT_TOP;   // 958
  const L_CARD_H_1 = 310;
  const L_CARD_H_2 = 220;
  const L_CARD_H_3 = CONTENT_H - L_CARD_H_1 - CARD_GAP - L_CARD_H_2 - CARD_GAP; // 388

  const R_CARD_H_1 = 240;
  const R_CARD_H_2 = 240;
  const R_CARD_H_3 = CONTENT_H - R_CARD_H_1 - CARD_GAP - R_CARD_H_2 - CARD_GAP; // 438

  const lCard1Y = CONTENT_TOP;                                     //  86
  const lCard2Y = lCard1Y + L_CARD_H_1 + CARD_GAP;               // 416
  const lCard3Y = lCard2Y + L_CARD_H_2 + CARD_GAP;               // 656

  const rCard1Y = CONTENT_TOP;                                     //  86
  const rCard2Y = rCard1Y + R_CARD_H_1 + CARD_GAP;               // 346
  const rCard3Y = rCard2Y + R_CARD_H_2 + CARD_GAP;               // 606

  // ── LEFT CARD 1: Opposition Scoring Profile ────────────────────────────────
  drawCardBg(L_COL_X, lCard1Y, L_COL_W, L_CARD_H_1, OPP_ACCENT);
  let cy = drawCardTitle(
    L_COL_X, lCard1Y, L_COL_W,
    `${awayTeam.slice(0, 20)} — Scoring Profile`, OPP_ACCENT,
  );
  if (oppScore.total === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No opposition scores recorded", L_COL_X + L_COL_W / 2, lCard1Y + L_CARD_H_1 / 2);
  } else {
    cy = drawHeroStat(L_COL_X, cy, fmtScore(oppScore), "Full match score line", OPP_ACCENT);
    cy = drawMetricRow(L_COL_X, cy, L_COL_W, "1st Half", fmtScore(oppScore1H), "#f8fafc", false);
    cy = drawMetricRow(L_COL_X, cy, L_COL_W, "2nd Half", fmtScore(oppScore2H), "#f8fafc", true);
    cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Goals", String(oppScore.goals),
                       oppScore.goals >= 2 ? OPP_ACCENT : "#f8fafc", false);
    cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Points (incl. frees & 2-pointers)",
                       String(oppScore.points), "#f8fafc", true);
    cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Shot accuracy",
                       oppShotsAll > 0 ? `${oppShotAcc}%` : "—", "#f8fafc", false);
    drawMetricRow(L_COL_X, cy, L_COL_W, "Score zone (avg position)",
                  scoreZoneLabel, "#94a3b8", true);
  }

  // ── LEFT CARD 2: Opposition Restart Threat (Kickouts) ─────────────────────
  drawCardBg(L_COL_X, lCard2Y, L_COL_W, L_CARD_H_2, "#fbbf24");
  cy = drawCardTitle(L_COL_X, lCard2Y, L_COL_W, "Restart Threat (Kickouts)", "#fbbf24");
  if (ko.total === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No kickout data recorded", L_COL_X + L_COL_W / 2, lCard2Y + L_CARD_H_2 / 2);
  } else {
    cy = drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "OPP kickout win rate", `${koOppWinPct}%  (${koOppWon} of ${ko.total})`,
      koOppWinPct >= 55 ? OPP_ACCENT : "#f8fafc", false,
    );
    cy = drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "Kickout won → score chains", String(koOppChains),
      koOppChains >= 2 ? OPP_ACCENT : "#f8fafc", true,
    );
    cy = drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "Scores from kickout losses", `${koLostScore}  (${koLostScorePct}%)`,
      koLostScore >= 2 ? OPP_ACCENT : "#f8fafc", false,
    );
    drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "Direct kickout lost → score", String(koFromLost),
      koFromLost >= 2 ? OPP_ACCENT : "#f8fafc", true,
    );
  }

  // ── LEFT CARD 3: Opposition Turnover Threat ────────────────────────────────
  drawCardBg(L_COL_X, lCard3Y, L_COL_W, L_CARD_H_3, "#a78bfa");
  cy = drawCardTitle(L_COL_X, lCard3Y, L_COL_W, "Turnover Threat", "#a78bfa");
  if (tvLost === 0 && tvOppToScore === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No turnover data recorded", L_COL_X + L_COL_W / 2, lCard3Y + L_CARD_H_3 / 2);
  } else {
    cy = drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "Turnovers gifted to OPP", String(tvLost),
      tvLost >= 5 ? OPP_ACCENT : "#f8fafc", false,
    );
    cy = drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "OPP scores from turnovers", String(tvLostScore),
      tvLostScore >= 2 ? OPP_ACCENT : "#f8fafc", true,
    );
    cy = drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "Turnover conversion rate", tvLost > 0 ? `${tvConvPct}%` : "—",
      tvConvPct >= 40 ? OPP_ACCENT : "#f8fafc", false,
    );
    cy = drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "Turnover won → score chains", String(tvOppToScore),
      tvOppToScore >= 2 ? OPP_ACCENT : "#f8fafc", true,
    );
    drawMetricRow(
      L_COL_X, cy, L_COL_W,
      "Turnover won → shot chains", String(tvOppToShot),
      "#f8fafc", false,
    );
  }

  // ── RIGHT CARD 1: Opposition Momentum Spell ────────────────────────────────
  drawCardBg(R_COL_X, rCard1Y, R_COL_W, R_CARD_H_1, "#fbbf24");
  cy = drawCardTitle(R_COL_X, rCard1Y, R_COL_W, "Momentum Spell", "#fbbf24");
  if (longestOpp == null || maxConsOpp < 2) {
    cy = drawHeroStat(R_COL_X, cy, "None", "No OPP unanswered run of 2+ detected", "#64748b");
    drawMetricRow(R_COL_X, cy, R_COL_W, "Scoring runs ≥ 2", "0", "#f8fafc", false);
  } else {
    cy = drawHeroStat(
      R_COL_X, cy,
      String(maxConsOpp),
      `Longest unanswered run — ${longestOppTimeLabel}`,
      OPP_ACCENT,
    );
    cy = drawMetricRow(
      R_COL_X, cy, R_COL_W,
      "Total OPP runs ≥ 2", String(oppRuns.length),
      oppRuns.length >= 3 ? OPP_ACCENT : "#f8fafc", false,
    );
    drawMetricRow(
      R_COL_X, cy, R_COL_W,
      "Half of peak run", longestOpp.period,
      "#f8fafc", true,
    );
  }

  // ── RIGHT CARD 2: Opposition Chain Rate ────────────────────────────────────
  drawCardBg(R_COL_X, rCard2Y, R_COL_W, R_CARD_H_2, "#22d3ee");
  cy = drawCardTitle(R_COL_X, rCard2Y, R_COL_W, "Chain Rate", "#22d3ee");
  if (chainTotal === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No chain data recorded", R_COL_X + R_COL_W / 2, rCard2Y + R_CARD_H_2 / 2);
  } else {
    cy = drawHeroStat(
      R_COL_X, cy,
      `${oppChainPct}%`,
      `OPP chain share  (${oppChains} of ${chainTotal} chains)`,
      oppChainPct >= 55 ? OPP_ACCENT : "#22d3ee",
    );
    cy = drawMetricRow(R_COL_X, cy, R_COL_W,
                       "OPP chains — 1st Half", String(opp1HChains), "#f8fafc", false);
    cy = drawMetricRow(R_COL_X, cy, R_COL_W,
                       "OPP chains — 2nd Half", String(opp2HChains), "#f8fafc", true);
    drawMetricRow(R_COL_X, cy, R_COL_W,
                  "Busiest OPP segment", strongestSegLabel, "#94a3b8", false);
  }

  // ── RIGHT CARD 3: Rematch Watchlist ────────────────────────────────────────
  // Threshold-based bullets only — factual, no prescriptions, max 5.
  drawCardBg(R_COL_X, rCard3Y, R_COL_W, R_CARD_H_3, OPP_ACCENT);
  cy = drawCardTitle(R_COL_X, rCard3Y, R_COL_W, "Rematch Watchlist", OPP_ACCENT);

  const WATCH_LINE_H = 52;
  const watchStartY  = cy + 16;  // padding below title separator
  bullets.forEach((bullet, idx) => {
    const rowY = watchStartY + idx * WATCH_LINE_H;
    const midY = rowY + WATCH_LINE_H / 2;
    if (idx % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(R_COL_X + 4, rowY, R_COL_W - 4, WATCH_LINE_H);
    }
    ctx.fillStyle = OPP_ACCENT;
    ctx.font = "bold 14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("—", R_COL_X + 16, midY);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px sans-serif";
    const maxW = R_COL_W - 50;
    let display = bullet;
    if (ctx.measureText(display).width > maxW) {
      let iterations = 0;
      const maxIterations = 1000;
      while (display.length > 0 && ctx.measureText(display + "…").width > maxW && iterations < maxIterations) {
        display = display.slice(0, -1);
        iterations++;
      }
      display += "…";
    }
    ctx.fillText(display, R_COL_X + 34, midY);
  });

  return canvas;
}

// ─── Zone Analysis page ───────────────────────────────────────────────────────

/**
 * Renders the Zone Analysis page — the final PDF page.
 *
 * Data source: raw PdfExportEvent[] filtered by teamSide + kind.
 * Zone classification: src/stats/zones/ — getZoneCounts / getZoneHotspots.
 * Zone map: ZONE_MAP_V1_NINE_GRID (3×3 tactical grid, 0–100 coordinate domain).
 * PdfExportEvent.nx/ny (0–1) is auto-scaled to 0–100 by the zone engine.
 *
 * Layout: two-column (L 928 px / R 928 px), dark background, #34d399 green accent.
 *   Left  — FOR Zone Activity: Scores grid · Turnovers Won grid
 *   Right — OPP Zone Activity: Scores Against grid · Opposition Gains grid
 *   Bottom — Zone Notes strip: up to 5 deterministic factual bullets
 *
 * All rendering uses ctx.fillRect() — no ctx.roundRect() (Safari < 15.4 safe).
 * No heatmaps, no gradients, no AI language, no tactical prescriptions.
 */
function makeZoneAnalysisPage(
  events: readonly PdfExportEvent[],
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Zone Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, events.length);

  // ── Layout constants ───────────────────────────────────────────────────────
  const CONTENT_TOP = 86;
  const CONTENT_BOT = CANVAS_H - 36;       // 1044
  const L_COL_X     = 24;
  const L_COL_W     = 928;
  const R_COL_X     = 968;
  const R_COL_W     = 928;
  const GRID_W      = 456;                  // (L_COL_W − GRID_GAP) / 2 = (928 − 16) / 2 = 456
  const GRID_GAP    = 16;                   // gap between the two grids in each column
  const ZONE_ACCENT = "#34d399";            // green — FOR side and notes accent
  const OPP_RED     = "#f87171";            // red   — OPP side

  // Vertical geometry
  const COL_HEADER_H = 36;                              // column team-name header height
  const GRID_TITLE_H = 28;                              // per-grid label above cell rows
  const CELL_W       = Math.floor(GRID_W / 3);          // 152  (3 × 152 = 456)
  const CELL_H       = 226;                             // 3 × 226 = 678
  const CELLS_H      = CELL_H * 3;                      // 678
  const CELLS_TOP    = CONTENT_TOP + COL_HEADER_H + GRID_TITLE_H;  // 150
  const GRID_SEC_H   = COL_HEADER_H + GRID_TITLE_H + CELLS_H;     // 742
  const NOTES_GAP    = 16;
  const NOTES_Y      = CONTENT_TOP + GRID_SEC_H + NOTES_GAP;       // 844
  const NOTES_H      = CONTENT_BOT - NOTES_Y;                       // 200
  const NOTES_X      = 24;
  const NOTES_W      = CANVAS_W - 48;                               // 1872

  // Grid x-positions (left col: two grids at 24 and 496; right col: two at 968 and 1440)
  const L_GRID1_X = L_COL_X;                        //   24  FOR Scores
  const L_GRID2_X = L_COL_X + GRID_W + GRID_GAP;   //  496  FOR Turnovers Won
  const R_GRID3_X = R_COL_X;                        //  968  OPP Scores
  const R_GRID4_X = R_COL_X + GRID_W + GRID_GAP;   // 1440  OPP Gains

  // ── Event subsets ──────────────────────────────────────────────────────────
  const forScoreEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind),
  );
  const forTvWonEvts = events.filter(
    (e) => e.teamSide === "FOR" && e.kind === "TURNOVER_WON",
  );
  const oppScoreEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind),
  );
  // OPP Gains: TURNOVER_LOST events (FOR team's side) record where OPP won possession
  const oppGainEvts = events.filter(
    (e) => e.teamSide === "FOR" && e.kind === "TURNOVER_LOST",
  );

  // ── Zone counts (9 entries each, stable order, zero-filled for empty zones) ──
  const forScoreCounts = getZoneCounts(forScoreEvts);
  const forTvWonCounts = getZoneCounts(forTvWonEvts);
  const oppScoreCounts = getZoneCounts(oppScoreEvts);
  const oppGainCounts  = getZoneCounts(oppGainEvts);

  // ── Hotspots (sorted by count; empty array when no events — always safe to index) ──
  const forScoreHots = getZoneHotspots(forScoreEvts);
  const forTvWonHots = getZoneHotspots(forTvWonEvts);
  const oppScoreHots = getZoneHotspots(oppScoreEvts);
  const oppGainHots  = getZoneHotspots(oppGainEvts);

  // ── Local helpers ──────────────────────────────────────────────────────────

  /** Column heading: accent left-bar + team label + full-width separator line. */
  function drawColHeader(
    x: number, y: number, w: number, label: string, accentColor: string,
  ): void {
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, COL_HEADER_H);
    ctx.font = "bold 14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 12, y + COL_HEADER_H / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + COL_HEADER_H);
    ctx.lineTo(x + w, y + COL_HEADER_H);
    ctx.stroke();
    ctx.restore();
  }

  /** Small uppercase label rendered above a grid's cell rows. */
  function drawGridTitle(x: number, label: string, accentColor: string): void {
    ctx.save();
    const titleY = CONTENT_TOP + COL_HEADER_H;
    ctx.fillStyle = accentColor;
    ctx.font = "bold 11px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + 4, titleY + GRID_TITLE_H / 2);
    ctx.restore();
  }

  /**
   * Renders a 3×3 zone grid.
   * Cell position derived from ZoneCount.bounds (0–100 → col/row 0–2).
   * Zone-engine xMin values are exact multiples of 100/3, so the mapping is lossless.
   * Highest-count cell is highlighted; zero-count cells show "—".
   */
  function drawZoneGrid(
    counts: readonly ZoneCount[],
    gridX: number,
    accentColor: string,
  ): void {
    const isGreen  = accentColor === ZONE_ACCENT;
    const hlFill   = isGreen ? "rgba(52,211,153,0.13)"  : "rgba(248,113,113,0.13)";
    const hlStroke = isGreen ? "rgba(52,211,153,0.40)"  : "rgba(248,113,113,0.40)";
    const maxCount = counts.reduce((m, c) => Math.max(m, c.count), 0);

    for (const zone of counts) {
      // xMin/yMin are exact multiples of 100/3 → result is exactly 0, 1, or 2
      const col   = Math.round((zone.bounds.xMin / 100) * 3);
      const row   = Math.round((zone.bounds.yMin / 100) * 3);
      const cellX = gridX + col * CELL_W;
      const cellY = CELLS_TOP + row * CELL_H;
      const CW    = CELL_W - 1;  // 1 px inter-cell gap
      const CH    = CELL_H - 1;
      const isHot = zone.count > 0 && zone.count === maxCount;

      // Background
      ctx.fillStyle = isHot ? hlFill : "rgba(255,255,255,0.025)";
      ctx.fillRect(cellX, cellY, CW, CH);

      // Border
      ctx.strokeStyle = isHot ? hlStroke : "rgba(255,255,255,0.07)";
      ctx.lineWidth   = isHot ? 1.5 : 1;
      ctx.strokeRect(cellX, cellY, CW, CH);

      // Count (bold large) or dash
      const midX = cellX + CELL_W / 2;
      const midY = cellY + CELL_H / 2;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";

      if (zone.count > 0) {
        ctx.fillStyle = isHot ? accentColor : "#f8fafc";
        ctx.font = "bold 24px sans-serif";
        ctx.fillText(String(zone.count), midX, midY - 10);
      } else {
        ctx.fillStyle = "#334155";
        ctx.font = "18px sans-serif";
        ctx.fillText("—", midX, midY - 10);
      }

      // Zone label (small, below count)
      ctx.fillStyle = "#475569";
      ctx.font = "9px sans-serif";
      ctx.fillText(zone.label, midX, midY + 10);
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (events.length === 0) {
    ctx.fillStyle = "#475569";
    ctx.font = "16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No match data recorded", CANVAS_W / 2, CANVAS_H / 2);
    return canvas;
  }

  // ── Column headers ─────────────────────────────────────────────────────────
  drawColHeader(
    L_COL_X, CONTENT_TOP, L_COL_W,
    `${homeTeam.slice(0, 22)} — Zone Activity`, ZONE_ACCENT,
  );
  drawColHeader(
    R_COL_X, CONTENT_TOP, R_COL_W,
    `${awayTeam.slice(0, 22)} — Zone Activity`, OPP_RED,
  );

  // ── Grid titles ────────────────────────────────────────────────────────────
  drawGridTitle(L_GRID1_X, "Scores (For)",       ZONE_ACCENT);
  drawGridTitle(L_GRID2_X, "Turnovers Won",       ZONE_ACCENT);
  drawGridTitle(R_GRID3_X, "Scores Against",      OPP_RED);
  drawGridTitle(R_GRID4_X, "Opposition Gains",    OPP_RED);

  // ── Zone grids ─────────────────────────────────────────────────────────────
  drawZoneGrid(forScoreCounts, L_GRID1_X, ZONE_ACCENT);
  drawZoneGrid(forTvWonCounts, L_GRID2_X, ZONE_ACCENT);
  drawZoneGrid(oppScoreCounts, R_GRID3_X, OPP_RED);
  drawZoneGrid(oppGainCounts,  R_GRID4_X, OPP_RED);

  // ── Zone Notes strip ───────────────────────────────────────────────────────
  // Background + green accent left-bar
  ctx.fillStyle = "rgba(255,255,255,0.015)";
  ctx.fillRect(NOTES_X, NOTES_Y, NOTES_W, NOTES_H);
  ctx.fillStyle = ZONE_ACCENT;
  ctx.fillRect(NOTES_X, NOTES_Y, 3, NOTES_H);

  // Notes heading + separator
  ctx.fillStyle = ZONE_ACCENT;
  ctx.font = "bold 11px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("ZONE NOTES", NOTES_X + 14, NOTES_Y + 16);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(NOTES_X + 4, NOTES_Y + 28);
  ctx.lineTo(NOTES_X + NOTES_W, NOTES_Y + 28);
  ctx.stroke();

  // Build bullets (deterministic, max 5, guarded against empty hotspot arrays)
  const bullets: string[] = [];
  if (forScoreHots.length > 0) {
    const t = forScoreHots[0];
    bullets.push(`Most scores for: ${t.label} (${t.count})`);
  }
  if (forTvWonHots.length > 0) {
    const t = forTvWonHots[0];
    bullets.push(`Most turnovers won: ${t.label} (${t.count})`);
  }
  if (oppScoreHots.length > 0) {
    const t = oppScoreHots[0];
    bullets.push(`Worth reviewing — opposition scoring in: ${t.label} (${t.count})`);
  }
  if (oppGainHots.length > 0) {
    const t = oppGainHots[0];
    bullets.push(`Highest concentration of opposition gains: ${t.label} (${t.count})`);
  }
  // Shared-zone note: same zone tops both FOR scores and OPP scores
  if (
    bullets.length < 5 &&
    forScoreHots.length > 0 &&
    oppScoreHots.length > 0 &&
    forScoreHots[0].zoneId === oppScoreHots[0].zoneId
  ) {
    bullets.push(`${forScoreHots[0].label} zone: highest-activity scoring zone for both teams`);
  }
  if (bullets.length === 0) {
    bullets.push("No zone data recorded for this match");
  }
  const displayBullets = bullets.slice(0, 5);

  // Render bullets — alternating faint row tint, red dash prefix, text with overflow ellipsis
  const BULLET_LINE_H = 32;
  const bulletStartY  = NOTES_Y + 36;
  displayBullets.forEach((bullet, idx) => {
    const bulletY = bulletStartY + idx * BULLET_LINE_H;
    if (idx % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.018)";
      ctx.fillRect(NOTES_X + 4, bulletY - BULLET_LINE_H / 2, NOTES_W - 4, BULLET_LINE_H);
    }
    ctx.fillStyle    = ZONE_ACCENT;
    ctx.font         = "bold 12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "left";
    ctx.fillText("—", NOTES_X + 14, bulletY);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px sans-serif";
    const maxW = NOTES_W - 50;
    let display = bullet;
    if (ctx.measureText(display).width > maxW) {
      let iterations = 0;
      const maxIterations = 1000;
      while (display.length > 0 && ctx.measureText(display + "…").width > maxW && iterations < maxIterations) {
        display = display.slice(0, -1);
        iterations++;
      }
      display += "…";
    }
    ctx.fillText(display, NOTES_X + 32, bulletY);
  });

  return canvas;
}

// ─── Page: Match Swing Timeline ──────────────────────────────────────────────

/**
 * Chronological factual summary of momentum and tactical shifts during the match.
 * Two-column layout: LEFT = First Half, RIGHT = Second Half.
 *
 * Five swing event types derived from existing ChainAnalysis data:
 *   SCORE_RUN        — unanswered scoring burst of ≥2 (from scoringRuns.runs)
 *   KICKOUT_CLUSTER  — kickout(s) won that converted directly to score
 *   TURNOVER_CLUSTER — turnover(s) that resulted in a score
 *   LEAD_CHANGE      — one team takes the lead for the first time / retakes it
 *   SCORE_EQUALISED  — scores drawn after previously behind
 *
 * Clock note: ScoringRun.startClockSeconds already includes SECOND_HALF_OFFSET (3600) for 2H
 * events (resolved by chain-engine). Raw PdfExportEvent.matchClockSeconds is the logged
 * value within the half; resolveRawClock() adds SECOND_HALF_OFFSET for 2H and falls back to
 * segment midpoint when matchClockSeconds is absent.
 */
function makeMatchSwingTimelinePage(
  events: readonly PdfExportEvent[],
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Match Swing Timeline", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);

  // ── Layout constants ──────────────────────────────────────────────────────────
  const CONTENT_TOP  = 86;
  const CONTENT_BOT  = CANVAS_H - 36;     // 1044
  const L_COL_X      = 24;
  const L_COL_W      = 928;
  const R_COL_X      = 968;
  const COL_HDR_H    = 36;
  const ITEMS_TOP    = CONTENT_TOP + COL_HDR_H;    // 122
  const ITEM_H       = 65;
  const MAX_ITEMS    = 13;
  const DOT_OFFSET_X = 92;    // px from column left to dot centre
  const CLOCK_MAX_X  = DOT_OFFSET_X - 12;   // 80 — right edge of clock label area (col-relative)
  const DESC_OFFSET  = DOT_OFFSET_X + 16;   // 108 — left edge of description text (col-relative)
  const DOT_HALF     = 4;                   // half-size of filled-square dot → 8×8 px
  const RING_HALF    = DOT_HALF + 5;        // 9 — strokeRect halo half-size
  // Description text available width (same for both columns since L_COL_W === R_COL_W)
  const DESC_MAX_W   = L_COL_W - DESC_OFFSET - 16;   // 804

  // Team accent colours
  const FOR_COLOR    = "#4ade80";
  const OPP_COLOR    = "#f87171";
  const STRUCT_COLOR = "#fbbf24";

  // ── Internal swing event type ─────────────────────────────────────────────────
  type SwingKind =
    | "SCORE_RUN"
    | "KICKOUT_CLUSTER"
    | "TURNOVER_CLUSTER"
    | "LEAD_CHANGE"
    | "SCORE_EQUALISED";

  type SwingEvent = {
    kind:       SwingKind;
    teamSide:   "FOR" | "OPP" | null;
    clockOrder: number;    // sort key; 2H = raw + 3600 (SECOND_HALF_OFFSET)
    period:     "1H" | "2H";
    label:      string;    // primary description line
    sublabel:   string;    // clock / time range — shown left of dot
    count:      number;    // run length / cluster size — drives priority cap
  };

  // ── Clock helpers ─────────────────────────────────────────────────────────────
  function clockToMin(clockSecs: number, period: "1H" | "2H"): number {
    const adjusted = period === "2H" ? clockSecs - 3600 : clockSecs;
    return Math.floor(Math.max(0, adjusted) / 60);
  }

  // Segment midpoint in half-relative seconds (no SECOND_HALF_OFFSET applied here).
  // Segment 1→4 (early), 2→5 (mid), 3→6 (late) collapse to 0,1,2 via mod-3.
  function segMidRaw(segment: MatchEventSegment): number {
    const halfSeg = (Number(segment) - 1) % 3;   // 0, 1, or 2 within the half
    return halfSeg * 600 + 300;                    // 300, 900, 1500
  }

  // Resolve a sort-order clock for a raw PdfExportEvent.
  // SECOND_HALF_OFFSET (3600) is added for 2H so all events remain sortable together.
  function resolveRawClock(e: PdfExportEvent): number {
    const base = e.period === "2H" ? 3600 : 0;
    const mc   = e.matchClockSeconds;
    if (typeof mc === "number" && Number.isFinite(mc) && mc > 0) return base + mc;
    return base + segMidRaw(e.segment);
  }

  // Format a clockOrder + period into a display string: "1H 12'" or "2H ~8'".
  function fmtClock(clockOrder: number, period: "1H" | "2H", approx: boolean): string {
    return `${period} ${approx ? "~" : ""}${clockToMin(clockOrder, period)}'`;
  }

  function teamLabel(side: "FOR" | "OPP"): string {
    return side === "FOR" ? homeTeam : awayTeam;
  }

  // ── Swing event derivation ────────────────────────────────────────────────────
  const swings: SwingEvent[] = [];

  // 1. Score runs — already ≥2 unanswered, already clock-sorted by chain-engine.
  for (const run of analysis.scoringRuns.runs) {
    const p: "1H" | "2H" = run.period === "2H" ? "2H" : "1H";
    const startMin        = clockToMin(run.startClockSeconds, p);
    const endMin          = clockToMin(run.endClockSeconds,   p);
    const timeStr         = startMin === endMin
      ? `${p} ${startMin}'`
      : `${p} ${startMin}'–${endMin}'`;
    swings.push({
      kind:       "SCORE_RUN",
      teamSide:   run.teamSide,
      clockOrder: run.startClockSeconds,
      period:     p,
      label:      `${teamLabel(run.teamSide)} scored ${run.count} unanswered`,
      sublabel:   timeStr,
      count:      run.count,
    });
  }

  // 2. Lead changes and equalisations — built from chronological raw score events.
  {
    const scoreEvts = events
      .filter((e) => PDF_KIND_SETS.SCORES.has(e.kind))
      .slice()
      .sort((a, b) => resolveRawClock(a) - resolveRawClock(b));

    let forG = 0;
    let forP = 0;
    let oppG = 0;
    let oppP = 0;
    let prevLeader: "FOR" | "OPP" | "LEVEL" = "LEVEL";

    for (const e of scoreEvts) {
      const isFor    = e.teamSide === "FOR";
      const isGoal   = e.kind === "GOAL";
      const isTwoPtr = e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT";

      if      (isFor && isGoal)         { forG++; }
      else if (isFor && isTwoPtr)       { forP += 2; }
      else if (isFor)                   { forP++; }
      else if (!isFor && isGoal)        { oppG++; }
      else if (!isFor && isTwoPtr)      { oppP += 2; }
      else                              { oppP++; }

      const forTotal  = forG * 3 + forP;
      const oppTotal  = oppG * 3 + oppP;
      const newLeader: "FOR" | "OPP" | "LEVEL" =
        forTotal > oppTotal ? "FOR" :
        oppTotal > forTotal ? "OPP" : "LEVEL";

      const clockOrd  = resolveRawClock(e);
      const p: "1H" | "2H" = e.period === "2H" ? "2H" : "1H";
      const mc        = e.matchClockSeconds;
      const hasReal   = typeof mc === "number" && Number.isFinite(mc) && mc > 0;
      const scoreStr  = `${forG}-${String(forP).padStart(2, "0")} v ${oppG}-${String(oppP).padStart(2, "0")}`;
      const clkStr    = fmtClock(clockOrd, p, !hasReal);

      if (newLeader === "LEVEL" && prevLeader !== "LEVEL") {
        swings.push({
          kind:       "SCORE_EQUALISED",
          teamSide:   null,
          clockOrder: clockOrd,
          period:     p,
          label:      `Scores level — ${scoreStr}`,
          sublabel:   clkStr,
          count:      0,
        });
      } else if (newLeader !== "LEVEL" && newLeader !== prevLeader) {
        swings.push({
          kind:       "LEAD_CHANGE",
          teamSide:   newLeader,
          clockOrder: clockOrd,
          period:     p,
          label:      `${teamLabel(newLeader)} took the lead — ${scoreStr}`,
          sublabel:   clkStr,
          count:      0,
        });
      }
      prevLeader = newLeader;
    }
  }

  // 3. Kickout clusters — kickout outcomes where the winning side converted to a score.
  //    Consecutive outcomes for the same side within 300s are merged into one entry.
  {
    const koScored = analysis.kickouts.outcomes
      .filter((o) => o.nextScore !== null)
      .slice()
      .sort((a, b) => resolveRawClock(a.kickoutEvent) - resolveRawClock(b.kickoutEvent));

    if (koScored.length > 0) {
      let cStart    = koScored[0]!;
      let cSide     = koScored[0]!.winningSide;
      let cCount    = 1;
      let cMinClock = resolveRawClock(koScored[0]!.kickoutEvent);

      for (let i = 1; i <= koScored.length; i++) {
        const cur  = koScored[i];
        const prev = koScored[i - 1]!;
        const merge = cur != null &&
          cur.winningSide === cSide &&
          cur.kickoutEvent.period === cStart.kickoutEvent.period &&
          Math.abs(resolveRawClock(cur.kickoutEvent) - resolveRawClock(prev.kickoutEvent)) <= 300;

        if (!merge) {
          const p: "1H" | "2H" = cStart.kickoutEvent.period === "2H" ? "2H" : "1H";
          const ckMc            = cStart.kickoutEvent.matchClockSeconds;
          const hasReal         = typeof ckMc === "number" && Number.isFinite(ckMc) && ckMc > 0;
          const n               = cCount;
          swings.push({
            kind:       "KICKOUT_CLUSTER",
            teamSide:   cSide,
            clockOrder: cMinClock,
            period:     p,
            label:      `${teamLabel(cSide)} converted ${n} kickout${n !== 1 ? "s" : ""} into score${n !== 1 ? "s" : ""}`,
            sublabel:   fmtClock(cMinClock, p, !hasReal),
            count:      n,
          });
          if (cur != null) {
            cStart    = cur;
            cSide     = cur.winningSide;
            cCount    = 1;
            cMinClock = resolveRawClock(cur.kickoutEvent);
          }
        } else {
          cCount++;
        }
      }
    }
  }

  // 4. Turnover punishment clusters — turnover outcomes that resulted in a score.
  //    Acting side: who benefited (team that won the ball and scored).
  {
    function actingSide(o: (typeof analysis.turnovers.outcomes)[number]): "FOR" | "OPP" {
      if (o.direction === "WON") return o.turnoverEvent.teamSide;
      return o.turnoverEvent.teamSide === "FOR" ? "OPP" : "FOR";
    }

    const tvScored = analysis.turnovers.outcomes
      .filter((o) => o.resultedInScore)
      .slice()
      .sort((a, b) => resolveRawClock(a.turnoverEvent) - resolveRawClock(b.turnoverEvent));

    if (tvScored.length > 0) {
      let cStart    = tvScored[0]!;
      let cSide     = actingSide(tvScored[0]!);
      let cCount    = 1;
      let cMinClock = resolveRawClock(tvScored[0]!.turnoverEvent);

      for (let i = 1; i <= tvScored.length; i++) {
        const cur  = tvScored[i];
        const prev = tvScored[i - 1]!;
        const merge = cur != null &&
          actingSide(cur) === cSide &&
          cur.turnoverEvent.period === cStart.turnoverEvent.period &&
          Math.abs(resolveRawClock(cur.turnoverEvent) - resolveRawClock(prev.turnoverEvent)) <= 300;

        if (!merge) {
          const p: "1H" | "2H" = cStart.turnoverEvent.period === "2H" ? "2H" : "1H";
          const tvMc            = cStart.turnoverEvent.matchClockSeconds;
          const hasReal         = typeof tvMc === "number" && Number.isFinite(tvMc) && tvMc > 0;
          const n               = cCount;
          swings.push({
            kind:       "TURNOVER_CLUSTER",
            teamSide:   cSide,
            clockOrder: cMinClock,
            period:     p,
            label:      `${teamLabel(cSide)} turnover${n !== 1 ? "s" : ""} led to score${n !== 1 ? "s" : ""}`,
            sublabel:   fmtClock(cMinClock, p, !hasReal),
            count:      n,
          });
          if (cur != null) {
            cStart    = cur;
            cSide     = actingSide(cur);
            cCount    = 1;
            cMinClock = resolveRawClock(cur.turnoverEvent);
          }
        } else {
          cCount++;
        }
      }
    }
  }

  // Sort all swing events chronologically by resolved clock.
  swings.sort((a, b) => a.clockOrder - b.clockOrder);

  // Split by period.
  const h1Raw = swings.filter((s) => s.period === "1H");
  const h2Raw = swings.filter((s) => s.period === "2H");

  // Priority score for cap selection: structural events are always preserved first.
  function priorityScore(s: SwingEvent): number {
    if (s.kind === "LEAD_CHANGE" || s.kind === "SCORE_EQUALISED") return 10000;
    return s.count;
  }

  // Cap at MAX_ITEMS by priority; restore chronological order among kept items.
  function capItems(arr: SwingEvent[]): SwingEvent[] {
    if (arr.length <= MAX_ITEMS) return arr;
    const ranked  = [...arr].sort((a, b) => priorityScore(b) - priorityScore(a));
    const keepIdx = new Set<number>(ranked.slice(0, MAX_ITEMS).map((item) => arr.indexOf(item)));
    return arr.filter((_, i) => keepIdx.has(i));
  }

  const col1Items = capItems(h1Raw);
  const col2Items = capItems(h2Raw);

  // ── Rendering ─────────────────────────────────────────────────────────────────

  function swingColor(s: SwingEvent): string {
    if (s.teamSide === "FOR") return FOR_COLOR;
    if (s.teamSide === "OPP") return OPP_COLOR;
    return STRUCT_COLOR;
  }

  function drawColHeader(colX: number, label: string): void {
    ctx.fillStyle    = "rgba(255,255,255,0.04)";
    ctx.fillRect(colX, CONTENT_TOP, L_COL_W, COL_HDR_H);
    ctx.fillStyle    = "#94a3b8";
    ctx.font         = "bold 11px sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), colX + 16, CONTENT_TOP + COL_HDR_H / 2);
  }

  function drawTimeline(colX: number, items: SwingEvent[], emptyText: string): void {
    const dotX  = colX + DOT_OFFSET_X;
    const descX = colX + DESC_OFFSET;

    if (items.length === 0) {
      ctx.fillStyle    = "#334155";
      ctx.font         = "12px sans-serif";
      ctx.textAlign    = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(emptyText, colX + 16, ITEMS_TOP + 32);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const s     = items[i]!;
      const itemY = ITEMS_TOP + i * ITEM_H;
      const midY  = itemY + ITEM_H / 2;
      const color = swingColor(s);

      // Connector: thin 1px-wide rectangle from bottom of previous dot to top of this one.
      if (i > 0) {
        const connY = itemY - ITEM_H / 2 + DOT_HALF + 2;
        const connH = ITEM_H - (DOT_HALF + 2) * 2;
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(dotX, connY, 1, connH);
      }

      // Dot — filled square in team colour.
      ctx.fillStyle = color;
      ctx.fillRect(dotX - DOT_HALF, midY - DOT_HALF, DOT_HALF * 2, DOT_HALF * 2);

      // Dot halo — strokeRect at low opacity.
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.28;
      ctx.strokeRect(dotX - RING_HALF, midY - RING_HALF, RING_HALF * 2, RING_HALF * 2);
      ctx.globalAlpha = 1;

      // Clock / time label — right-aligned, left of the dot.
      ctx.fillStyle    = "#64748b";
      ctx.font         = "10px sans-serif";
      ctx.textAlign    = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(s.sublabel, colX + CLOCK_MAX_X, midY);

      // Primary description — coloured, slightly above centre.
      ctx.fillStyle    = color;
      ctx.font         = "bold 13px sans-serif";
      ctx.textAlign    = "left";
      ctx.textBaseline = "middle";
      let primary = s.label;
      if (ctx.measureText(primary).width > DESC_MAX_W) {
        let iterations = 0;
        const maxIterations = 1000;
        while (primary.length > 0 && ctx.measureText(primary + "…").width > DESC_MAX_W && iterations < maxIterations) {
          primary = primary.slice(0, -1);
          iterations++;
        }
        primary += "…";
      }
      ctx.fillText(primary, descX, midY - 10);

      // Kind badge — muted label below primary.
      const badge =
        s.kind === "SCORE_RUN"        ? "scoring run"
        : s.kind === "KICKOUT_CLUSTER"  ? "kickout"
        : s.kind === "TURNOVER_CLUSTER" ? "turnover"
        : s.kind === "LEAD_CHANGE"      ? "lead change"
        :                                 "equalised";
      ctx.fillStyle    = "rgba(255,255,255,0.28)";
      ctx.font         = "10px sans-serif";
      ctx.textAlign    = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(badge.toUpperCase(), descX, midY + 12);
    }
  }

  // Full-page empty-state guard.
  if (col1Items.length === 0 && col2Items.length === 0) {
    ctx.fillStyle    = "#475569";
    ctx.font         = "16px sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Insufficient match data to derive swing events — clock or score data may be absent.",
      CANVAS_W / 2,
      (CONTENT_TOP + CONTENT_BOT) / 2,
    );
    return canvas;
  }

  // Column headers.
  drawColHeader(L_COL_X, "First Half");
  drawColHeader(R_COL_X, "Second Half");

  // Centre divider — 1px fillRect.
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(R_COL_X - 20, CONTENT_TOP, 1, CONTENT_BOT - CONTENT_TOP);

  // Render both halves.
  drawTimeline(L_COL_X, col1Items, "No significant swings detected in the first half");
  drawTimeline(R_COL_X, col2Items, "No significant swings detected in the second half");

  return canvas;
}

// ─── Page: Shot & Scoring Efficiency ─────────────────────────────────────────

/**
 * Overall shot conversion, source breakdown (Play/Free/Mark/45/Penalty/Unclassified),
 * 2-point profile, and free conversion for FOR and OPP sides.
 *
 * Two-column layout: LEFT = FOR (homeTeam), RIGHT = OPP (awayTeam).
 *
 * Source classification:
 *   FREE_SCORED / FREE_MISSED → "Free"       (kind-implicit, no SOURCE_ tag needed)
 *   FORTY_FIVE_TWO_POINT      → "45"         (kind-implicit)
 *   SHOT                      → "Unclassified" (no SOURCE_ tag assigned on this kind)
 *   GOAL/POINT/TWO_POINTER/WIDE with SOURCE_* tag → classified accordingly
 *   Any attempt with no SOURCE_ tag           → "Unclassified"
 *
 * Attempt kinds: SHOT, GOAL, POINT, WIDE, TWO_POINTER, FORTY_FIVE_TWO_POINT,
 *                FREE_MISSED, FREE_SCORED  (= PDF_KIND_SETS.SHOTS)
 * Score kinds:   GOAL, POINT, TWO_POINTER, FORTY_FIVE_TWO_POINT, FREE_SCORED
 *                (= PDF_KIND_SETS.SCORES)
 *
 * All division guarded. No ctx.roundRect() — fillRect/strokeRect only.
 */
function makeShotEfficiencyPage(
  events: readonly PdfExportEvent[],
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const validEvts = events.filter((e) => !e.id.includes("-instant-score-"));

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Shot & Scoring Efficiency", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
  drawEventCountFooter(ctx, validEvts.length);

  // ── Layout constants ──────────────────────────────────────────────────────────
  const CONTENT_TOP = 86;
  const CONTENT_BOT = CANVAS_H - 36;    // 1044
  const L_COL_X     = 24;
  const L_COL_W     = 928;
  const R_COL_X     = 968;
  const COL_HDR_H   = 36;
  const SEC_HDR_H   = 26;
  const ROW_H       = 32;
  const SEC_GAP     = 20;
  // Source breakdown sub-column right-edge positions (relative to column left)
  const SRC_ATT_X   = 520;
  const SRC_SC_X    = 640;
  const SRC_MISS_X  = 756;
  const SRC_CONV_X  = L_COL_W - 12;    // 916

  const FOR_COLOR = "#4ade80";
  const OPP_COLOR = "#f87171";
  const NEUTRAL   = "#f8fafc";
  const MUTED     = "#94a3b8";

  // ── Source classifier ─────────────────────────────────────────────────────────
  function eventSource(e: PdfExportEvent): "PLAY" | "FREE" | "MARK" | "45" | "PENALTY" | "UNKNOWN" {
    if (e.kind === "FREE_SCORED" || e.kind === "FREE_MISSED") return "FREE";
    if (e.kind === "FORTY_FIVE_TWO_POINT")                    return "45";
    if (e.kind === "SHOT")                                    return "UNKNOWN";
    if (e.tags?.includes("SOURCE_FREE"))                      return "FREE";
    if (e.tags?.includes("SOURCE_PLAY"))                      return "PLAY";
    if (e.tags?.includes("SOURCE_MARK"))                      return "MARK";
    if (e.tags?.includes("SOURCE_45"))                        return "45";
    if (e.tags?.includes("SOURCE_PENALTY"))                   return "PENALTY";
    return "UNKNOWN";
  }

  // ── Data derivation ───────────────────────────────────────────────────────────
  type SrcKey = "PLAY" | "FREE" | "MARK" | "45" | "PENALTY" | "UNKNOWN";
  type SrcRow = { label: string; att: number; sc: number; miss: number; conv: string };
  type ShootingStats = {
    totalAtt:     number;
    totalSc:      number;
    convPct:      number;
    wides:        number;
    blocked:      number;
    srcRows:      SrcRow[];
    twoPointerSc:   number;
    fortyFiveTwoSc: number;
    freeScored:   number;
    freeMissed:   number;
    freeConvPct:  number;
  };

  const SRC_KEYS: readonly SrcKey[] = ["PLAY", "FREE", "MARK", "45", "PENALTY", "UNKNOWN"];
  const SRC_LABELS: Record<SrcKey, string> = {
    PLAY:    "From Play",
    FREE:    "Free",
    MARK:    "Mark",
    "45":    "45",
    PENALTY: "Penalty",
    UNKNOWN: "Unclassified",
  };

  function buildStats(evts: readonly PdfExportEvent[]): ShootingStats {
    const attempts  = evts.filter((e) => PDF_KIND_SETS.SHOTS.has(e.kind));
    const scores    = evts.filter((e) => PDF_KIND_SETS.SCORES.has(e.kind));
    const totalAtt  = attempts.length;
    const totalSc   = scores.length;
    const convPct   = totalAtt > 0 ? Math.round((totalSc  / totalAtt) * 100) : 0;
    const wides     = evts.filter((e) => e.kind === "WIDE").length;
    const blocked   = evts.filter((e) => e.kind === "SHOT").length;

    const srcRows: SrcRow[] = SRC_KEYS.map((src) => {
      const srcAtt  = attempts.filter((e) => eventSource(e) === src).length;
      const srcSc   = scores.filter((e)   => eventSource(e) === src).length;
      const srcMiss = srcAtt - srcSc;
      const srcConv = srcAtt > 0 ? `${Math.round((srcSc / srcAtt) * 100)}%` : "—";
      return { label: SRC_LABELS[src], att: srcAtt, sc: srcSc, miss: srcMiss, conv: srcConv };
    });

    const twoPointerSc   = evts.filter((e) => e.kind === "TWO_POINTER").length;
    const fortyFiveTwoSc = evts.filter((e) => e.kind === "FORTY_FIVE_TWO_POINT").length;
    const freeScored     = evts.filter((e) => e.kind === "FREE_SCORED").length;
    const freeMissed     = evts.filter((e) => e.kind === "FREE_MISSED").length;
    const freeTotal      = freeScored + freeMissed;
    const freeConvPct    = freeTotal  > 0 ? Math.round((freeScored / freeTotal) * 100) : 0;

    return {
      totalAtt, totalSc, convPct, wides, blocked, srcRows,
      twoPointerSc, fortyFiveTwoSc, freeScored, freeMissed, freeConvPct,
    };
  }

  const forEvts  = validEvts.filter((e) => e.teamSide === "FOR");
  const oppEvts  = validEvts.filter((e) => e.teamSide === "OPP");
  const forStats = buildStats(forEvts);
  const oppStats = buildStats(oppEvts);

  // ── Rendering helpers ─────────────────────────────────────────────────────────

  function drawColHeader(colX: number, label: string, accentColor: string): void {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(colX, CONTENT_TOP, L_COL_W, COL_HDR_H);
    ctx.fillStyle = accentColor;
    ctx.fillRect(colX, CONTENT_TOP, 3, COL_HDR_H);
    ctx.fillStyle    = accentColor;
    ctx.font         = "bold 12px sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), colX + 14, CONTENT_TOP + COL_HDR_H / 2);
  }

  function drawSecHeader(colX: number, cy: number, label: string, accentColor: string): number {
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(colX, cy, L_COL_W, SEC_HDR_H);
    ctx.fillStyle = accentColor;
    ctx.fillRect(colX, cy, 3, SEC_HDR_H);
    ctx.fillStyle    = accentColor;
    ctx.font         = "bold 11px sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), colX + 14, cy + SEC_HDR_H / 2);
    return cy + SEC_HDR_H;
  }

  function drawRow(
    colX: number, cy: number,
    label: string, value: string,
    valueColor: string, isAlt: boolean,
  ): number {
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.022)";
      ctx.fillRect(colX + 3, cy, L_COL_W - 3, ROW_H);
    }
    const mid = cy + ROW_H / 2;
    ctx.fillStyle    = MUTED;
    ctx.font         = "12px sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, colX + 14, mid);
    ctx.fillStyle    = valueColor;
    ctx.font         = "bold 13px sans-serif";
    ctx.textAlign    = "right";
    ctx.fillText(value, colX + L_COL_W - 12, mid);
    return cy + ROW_H;
  }

  function drawSrcHeader(colX: number, cy: number): number {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(colX + 3, cy, L_COL_W - 3, 22);
    const mid = cy + 11;
    ctx.fillStyle    = MUTED;
    ctx.font         = "bold 9px sans-serif";
    ctx.textBaseline = "middle";
    const colDefs: Array<[number, string]> = [
      [SRC_ATT_X,  "ATT"],
      [SRC_SC_X,   "SC"],
      [SRC_MISS_X, "MISS"],
      [SRC_CONV_X, "CONV%"],
    ];
    for (const [rx, lbl] of colDefs) {
      ctx.textAlign = "right";
      ctx.fillText(lbl, colX + rx, mid);
    }
    ctx.textAlign = "left";
    ctx.fillText("SOURCE", colX + 14, mid);
    return cy + 22;
  }

  function drawSrcRow(
    colX: number, cy: number,
    row: SrcRow, accentColor: string, isAlt: boolean,
  ): number {
    if (isAlt) {
      ctx.fillStyle = "rgba(255,255,255,0.022)";
      ctx.fillRect(colX + 3, cy, L_COL_W - 3, ROW_H);
    }
    const mid      = cy + ROW_H / 2;
    const hasData  = row.att > 0;
    ctx.fillStyle    = hasData ? NEUTRAL : MUTED;
    ctx.font         = "12px sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(row.label, colX + 14, mid);
    const vc = hasData ? accentColor : MUTED;
    const vals: Array<[number, string]> = [
      [SRC_ATT_X,  row.att > 0 ? String(row.att)  : "—"],
      [SRC_SC_X,   row.sc  > 0 ? String(row.sc)   : "—"],
      [SRC_MISS_X, row.att > 0 ? String(row.miss) : "—"],
      [SRC_CONV_X, row.conv],
    ];
    ctx.font      = "bold 12px sans-serif";
    ctx.textAlign = "right";
    for (const [rx, val] of vals) {
      ctx.fillStyle = vc;
      ctx.fillText(val, colX + rx, mid);
    }
    return cy + ROW_H;
  }

  function drawColumn(colX: number, stats: ShootingStats, accentColor: string): void {
    let cy = CONTENT_TOP + COL_HDR_H + 8;

    // ── Section 1: Overall Conversion ─────────────────────────────────────────
    cy = drawSecHeader(colX, cy, "Overall Conversion", accentColor);
    cy = drawRow(colX, cy, "Attempts",        String(stats.totalAtt),
      NEUTRAL, false);
    cy = drawRow(colX, cy, "Scores",          String(stats.totalSc),
      stats.totalAtt > 0 ? accentColor : MUTED, true);
    cy = drawRow(colX, cy, "Conversion",      stats.totalAtt > 0 ? `${stats.convPct}%` : "—",
      stats.totalAtt > 0 ? accentColor : MUTED, false);
    cy = drawRow(colX, cy, "Wides",           String(stats.wides),
      NEUTRAL, true);
    cy = drawRow(colX, cy, "Blocked / Saved", String(stats.blocked),
      NEUTRAL, false);
    cy += SEC_GAP;

    // ── Section 2: Source Breakdown ───────────────────────────────────────────
    cy = drawSecHeader(colX, cy, "Source Breakdown", accentColor);
    cy = drawSrcHeader(colX, cy);
    stats.srcRows.forEach((row, i) => {
      cy = drawSrcRow(colX, cy, row, accentColor, i % 2 === 1);
    });
    cy += SEC_GAP;

    // ── Section 3: 2-Point Profile ────────────────────────────────────────────
    cy = drawSecHeader(colX, cy, "2-Point Profile", accentColor);
    cy = drawRow(colX, cy, "TWO_POINTER Scores", String(stats.twoPointerSc),
      stats.twoPointerSc   > 0 ? accentColor : MUTED, false);
    cy = drawRow(colX, cy, "45+2 Scores",        String(stats.fortyFiveTwoSc),
      stats.fortyFiveTwoSc > 0 ? accentColor : MUTED, true);
    const totalTwoSc = stats.twoPointerSc + stats.fortyFiveTwoSc;
    cy = drawRow(colX, cy, "Total 2PT Scores",   String(totalTwoSc),
      totalTwoSc > 0 ? accentColor : MUTED, false);
    cy = drawRow(colX, cy, "Total 2PT Pts Value", String(totalTwoSc * 2),
      totalTwoSc > 0 ? NEUTRAL    : MUTED, true);
    cy += SEC_GAP;

    // ── Section 4: Free Conversion ────────────────────────────────────────────
    cy = drawSecHeader(colX, cy, "Free Conversion", accentColor);
    const freeTotal = stats.freeScored + stats.freeMissed;
    cy = drawRow(colX, cy, "Free Scored", String(stats.freeScored),
      stats.freeScored > 0 ? accentColor : MUTED, false);
    cy = drawRow(colX, cy, "Free Missed", String(stats.freeMissed),
      stats.freeMissed > 0 ? NEUTRAL    : MUTED, true);
    cy = drawRow(colX, cy, "Free Conv %", freeTotal > 0 ? `${stats.freeConvPct}%` : "—",
      freeTotal        > 0 ? accentColor : MUTED, false);
  }

  // Centre divider
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(R_COL_X - 20, CONTENT_TOP, 1, CONTENT_BOT - CONTENT_TOP);

  // Column headers
  drawColHeader(L_COL_X, `FOR — ${homeTeam}`, FOR_COLOR);
  drawColHeader(R_COL_X, `OPP — ${awayTeam}`, OPP_COLOR);

  // Render both sides
  drawColumn(L_COL_X, forStats, FOR_COLOR);
  drawColumn(R_COL_X, oppStats, OPP_COLOR);

  return canvas;
}

// ─── Tactical page spec table (20 pages) ────────────────────────────────────

type PageSpec = {
  title: string;
  half: "H1" | "H2";
  teamSide: "FOR" | "OPP" | "ALL";
  category: PdfCategory;
};

const TACTICAL_PAGE_SPECS: readonly PageSpec[] = [
  // FIRST HALF tactical pitch maps
  { title: "1H — All Events",        half: "H1", teamSide: "ALL", category: "ALL"       },
  { title: "1H — Scores",            half: "H1", teamSide: "ALL", category: "SCORES"    },
  { title: "1H — Shots For",         half: "H1", teamSide: "FOR", category: "SHOTS"     },
  { title: "1H — Shots Against",     half: "H1", teamSide: "OPP", category: "SHOTS"     },
  { title: "1H — Kickouts For",      half: "H1", teamSide: "FOR", category: "KICKOUTS"  },
  { title: "1H — Kickouts Against",  half: "H1", teamSide: "OPP", category: "KICKOUTS"  },
  { title: "1H — Turnovers For",     half: "H1", teamSide: "FOR", category: "TURNOVERS" },
  { title: "1H — Turnovers Against", half: "H1", teamSide: "OPP", category: "TURNOVERS" },
  { title: "1H — Frees For",         half: "H1", teamSide: "FOR", category: "FREES"     },
  { title: "1H — Frees Against",     half: "H1", teamSide: "OPP", category: "FREES"     },
  // SECOND HALF tactical pitch maps
  { title: "2H — All Events",        half: "H2", teamSide: "ALL", category: "ALL"       },
  { title: "2H — Scores",            half: "H2", teamSide: "ALL", category: "SCORES"    },
  { title: "2H — Shots For",         half: "H2", teamSide: "FOR", category: "SHOTS"     },
  { title: "2H — Shots Against",     half: "H2", teamSide: "OPP", category: "SHOTS"     },
  { title: "2H — Kickouts For",      half: "H2", teamSide: "FOR", category: "KICKOUTS"  },
  { title: "2H — Kickouts Against",  half: "H2", teamSide: "OPP", category: "KICKOUTS"  },
  { title: "2H — Turnovers For",     half: "H2", teamSide: "FOR", category: "TURNOVERS" },
  { title: "2H — Turnovers Against", half: "H2", teamSide: "OPP", category: "TURNOVERS" },
  { title: "2H — Frees For",         half: "H2", teamSide: "FOR", category: "FREES"     },
  { title: "2H — Frees Against",     half: "H2", teamSide: "OPP", category: "FREES"     },
] as const;

/** Segment detail pages (3–8): one full breakdown per segment. */
type SegmentDetailSpec = {
  period: MatchEventPeriod;
  segment: MatchEventSegment;
  label: string;
};

const SEGMENT_DETAIL_SPECS: readonly SegmentDetailSpec[] = [
  { period: "1H", segment: 1, label: "1H Early  (0 – 10 min)"  },
  { period: "1H", segment: 2, label: "1H Mid    (11 – 20 min)" },
  { period: "1H", segment: 3, label: "1H Late   (21 – 30+ min)"},
  { period: "2H", segment: 4, label: "2H Early  (0 – 10 min)"  },
  { period: "2H", segment: 5, label: "2H Mid    (11 – 20 min)" },
  { period: "2H", segment: 6, label: "2H Late   (21 – 30+ min)"},
] as const;

// ─── Main export entry point ──────────────────────────────────────────────────

/**
 * Generates the PáircVision Visual Review PDF and triggers a browser download.
 *
 * Page order:
 *   1.       Match Summary (full 5-section breakdown, all tracked rows)
 *   2.       Segment Overview (compact score + key stats table per segment)
 *   3–8.     Segment Detail pages — 1H Early/Mid/Late, 2H Early/Mid/Late
 *            Each shows the full 5-section breakdown filtered to that segment.
 *   9+.      Player Breakdown — one or more pages, no truncation
 *   (9+N)+.  20 tactical pitch map pages (N = player page count)
 *   Last−9.  Kickout Chain Analysis page
 *   Last−8.  Turnover Punishment Analysis page
 *   Last−7.  Momentum & Scoring Runs page
 *   Last−6.  Tactical Chain Analysis summary page
 *   Last−5.  Tactical Intelligence Summary page
 *   Last−4.  Tactical Review Guide page
 *   Last−3.  Opposition Snapshot page
 *   Last−2.  Zone Analysis page
 *   Last−1.  Match Swing Timeline page
 *   Last.    Shot & Scoring Efficiency page
 *
 * Total pages = 36 + N  (N ≥ 1 → minimum 37 pages).
 */
export async function exportReviewPdf(input: ReviewPdfExportInput): Promise<void> {
  const {
    events,
    homeTeamName,
    awayTeamName,
    venueName,
    sport = "gaelic",
  } = input;

  // Dynamic page count: 8 fixed analysis pages + player pages + 20 tactical maps + 6 chain pages + 1 review guide + 1 opposition snapshot + 1 zone analysis + 1 match swing timeline + 1 shot & scoring efficiency
  const playerPageCount = calcPlayerPageCount(events);
  const TOTAL_PAGES = 8 + playerPageCount + TACTICAL_PAGE_SPECS.length + 10;

  // Chain analysis — computed once here and shared with all chain page builders.
  // PdfExportEvent structurally satisfies ChainableEvent; no cast needed.
  const chainAnalysis = selectChainAnalysis(events);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297; // A4 landscape mm
  const PH = 210;

  function addCanvasPage(canvas: HTMLCanvasElement, addPageFirst: boolean, pageName?: string): void {
    if (addPageFirst) pdf.addPage("a4", "landscape");
    try {
      const imgData = canvas.toDataURL("image/jpeg", 0.88);
      pdf.addImage(imgData, "JPEG", 0, 0, PW, PH);
    } catch (err) {
      console.error(`PDF export failed for page${pageName ? ` "${pageName}"` : ""}`, err);
      pdf.setFillColor(13, 17, 23);
      pdf.rect(0, 0, PW, PH, "F");
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(12);
      pdf.text("This review page could not be rendered.", PW / 2, PH / 2, { align: "center" });
    }
  }

  // Page 1: Match Summary
  addCanvasPage(
    makeSummaryPage(events, homeTeamName, awayTeamName, venueName, TOTAL_PAGES),
    false,
  );

  // Page 2: Segment Overview (compact table)
  addCanvasPage(
    makeSegmentsPage(events, homeTeamName, awayTeamName, TOTAL_PAGES),
    true,
  );

  // Pages 3–8: Per-segment full breakdowns
  SEGMENT_DETAIL_SPECS.forEach(({ period, segment, label }, i) => {
    addCanvasPage(
      makeSegmentDetailPage(
        events, period, segment, label,
        homeTeamName, awayTeamName, 3 + i, TOTAL_PAGES,
      ),
      true,
    );
  });

  // Pages 9+: Player Breakdown (1 or more pages — no truncation)
  const playerCanvases = makePlayerPages(events, homeTeamName, awayTeamName, 9, TOTAL_PAGES);
  playerCanvases.forEach((c) => addCanvasPage(c, true));

  // Pages (9+N)+: 20 tactical pitch map pages
  TACTICAL_PAGE_SPECS.forEach((spec, i) => {
    const filtered = selectPdfEvents(events, spec.half, spec.teamSide, spec.category);
    const pageNum  = 9 + playerPageCount + i;
    let canvas: HTMLCanvasElement;
    try {
      canvas = makeTacticalPage(
        sport, filtered, spec.title, homeTeamName, awayTeamName, pageNum, TOTAL_PAGES,
      );
    } catch {
      canvas = document.createElement("canvas");
      canvas.width  = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx2 = canvas.getContext("2d");
      if (ctx2) {
        ctx2.fillStyle    = "#0d1117";
        ctx2.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx2.fillStyle    = "#64748b";
        ctx2.font         = "24px sans-serif";
        ctx2.textAlign    = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillText(`${spec.title} — render failed`, CANVAS_W / 2, CANVAS_H / 2);
      }
    }
    addCanvasPage(canvas!, true);
  });

  // Tenth-to-last page: Kickout Chain Analysis
  // chainAnalysis was computed once above; all chain builders consume slices of it.
  try {
    addCanvasPage(
      makeKickoutChainPage(
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 9,   // tenth-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Kickout Chain Analysis",
    );
  } catch (err) {
    console.error("Kickout Chain Analysis page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Kickout Chain Analysis");
  }

  // Ninth-to-last page: Turnover Punishment Analysis
  try {
    addCanvasPage(
      makeTurnoverPunishmentPage(
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 8,   // ninth-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Turnover Punishment Analysis",
    );
  } catch (err) {
    console.error("Turnover Punishment Analysis page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Turnover Punishment Analysis");
  }

  // Eighth-to-last page: Momentum & Scoring Runs Analysis
  try {
    addCanvasPage(
      makeMomentumRunsPage(
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 7,   // eighth-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Momentum & Scoring Runs Analysis",
    );
  } catch (err) {
    console.error("Momentum & Scoring Runs Analysis page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Momentum & Scoring Runs Analysis");
  }

  // Seventh-to-last page: Tactical Chain Analysis summary
  try {
    addCanvasPage(
      makeChainSummaryPage(
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 6,   // seventh-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Tactical Chain Analysis Summary",
    );
  } catch (err) {
    console.error("Tactical Chain Analysis Summary page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Tactical Chain Analysis Summary");
  }

  // Sixth-to-last page: Tactical Intelligence Summary
  try {
    addCanvasPage(
      makeTacticalIntelligencePage(
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 5,   // sixth-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Tactical Intelligence Summary",
    );
  } catch (err) {
    console.error("Tactical Intelligence Summary page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Tactical Intelligence Summary");
  }

  // Fifth-to-last page: Tactical Review Guide
  try {
    addCanvasPage(
      makeTacticalReviewGuidePage(
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 4,   // fifth-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Tactical Review Guide",
    );
  } catch (err) {
    console.error("Tactical Review Guide page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Tactical Review Guide");
  }

  // Fourth-to-last page: Opposition Snapshot
  try {
    addCanvasPage(
      makeOppositionSnapshotPage(
        events,
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 3,   // fourth-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Opposition Snapshot",
    );
  } catch (err) {
    console.error("Opposition Snapshot page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Opposition Snapshot");
  }

  // Third-to-last page: Zone Analysis
  try {
    addCanvasPage(
      makeZoneAnalysisPage(
        events,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 2,   // third-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Zone Analysis",
    );
  } catch (err) {
    console.error("Zone Analysis page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Zone Analysis");
  }

  // Second-to-last page: Match Swing Timeline
  try {
    addCanvasPage(
      makeMatchSwingTimelinePage(
        events,
        chainAnalysis,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES - 1,   // second-to-last page
        TOTAL_PAGES,
      ),
      true,
      "Match Swing Timeline",
    );
  } catch (err) {
    console.error("Match Swing Timeline page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Match Swing Timeline");
  }

  // Last page: Shot & Scoring Efficiency
  try {
    addCanvasPage(
      makeShotEfficiencyPage(
        events,
        homeTeamName,
        awayTeamName,
        TOTAL_PAGES,   // this IS the last page
        TOTAL_PAGES,
      ),
      true,
      "Shot & Scoring Efficiency",
    );
  } catch (err) {
    console.error("Shot & Scoring Efficiency page generation failed", err);
    const fallback = document.createElement("canvas");
    fallback.width = CANVAS_W;
    fallback.height = CANVAS_H;
    const ctx = fallback.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("This review page could not be rendered.", CANVAS_W / 2, CANVAS_H / 2);
    }
    addCanvasPage(fallback, true, "Shot & Scoring Efficiency");
  }

  // Download
  const safeName = (s: string) => s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const filename  = `${safeName(homeTeamName)}_v_${safeName(awayTeamName)}_review.pdf`;
  pdf.save(filename);
}

// ─── Snapshot PDF export ──────────────────────────────────────────────────────
//
// Lightweight 10-page coaching reports. All rendering delegates to the same
// page builders used by exportReviewPdf. exportReviewPdf and every page builder
// function body are completely untouched.
//
// HT Snapshot: events pre-filtered to period "1H" before any builder is called.
//   Chain analysis is computed from the H1 event set only — no builder changes
//   needed; each builder naturally sees first-half data.
//
// FT Snapshot: all events, curated 10-page selection from the full builder set.

export async function exportSnapshotPdf(input: SnapshotPdfExportInput): Promise<void> {
  const {
    events: allEvents,
    homeTeamName,
    awayTeamName,
    venueName,
    sport = "gaelic",
    snapshotMode,
  } = input;

  const isHT = snapshotMode === "HALF_TIME_SNAPSHOT";

  // HT: restrict every page to first-half data by pre-filtering events.
  // MatchEventPeriod values are "1H" and "2H".
  const events: readonly PdfExportEvent[] = isHT
    ? allEvents.filter((e) => e.period === "1H")
    : allEvents;

  // Chain analysis scoped to the same event set — H1-only for HT, full for FT.
  const chainAnalysis = selectChainAnalysis(events);

  const TOTAL_PAGES = isHT ? 7 : 10;

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297; // A4 landscape mm
  const PH = 210;

  function addPage(canvas: HTMLCanvasElement, addPageFirst: boolean, pageName?: string): void {
    if (addPageFirst) pdf.addPage("a4", "landscape");
    try {
      const imgData = canvas.toDataURL("image/jpeg", 0.88);
      pdf.addImage(imgData, "JPEG", 0, 0, PW, PH);
    } catch (err) {
      console.error(
        `Snapshot PDF export failed for page${pageName ? ` "${pageName}"` : ""}`,
        err,
      );
      pdf.setFillColor(13, 17, 23);
      pdf.rect(0, 0, PW, PH, "F");
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(12);
      pdf.text("This review page could not be rendered.", PW / 2, PH / 2, { align: "center" });
    }
  }

  const home = homeTeamName;
  const away = awayTeamName;

  if (isHT) {
    // ── HT Snapshot ── 7 pages, first-half events only ───────────────────────

    // 1. Match Summary
    addPage(
      makeSummaryPage(events, home, away, venueName, TOTAL_PAGES),
      false,
      "Match Summary",
    );

    // 2. Tactical Intelligence Summary
    addPage(
      makeTacticalIntelligencePage(chainAnalysis, home, away, 2, TOTAL_PAGES),
      true,
      "Tactical Intelligence Summary",
    );

    // 3. Match Swing Timeline
    addPage(
      makeMatchSwingTimelinePage(events, chainAnalysis, home, away, 3, TOTAL_PAGES),
      true,
      "Match Swing Timeline",
    );

    // 4. Kickout Chain Analysis
    addPage(
      makeKickoutChainPage(chainAnalysis, home, away, 4, TOTAL_PAGES),
      true,
      "Kickout Chain Analysis",
    );

    // 5. Turnover Punishment
    addPage(
      makeTurnoverPunishmentPage(chainAnalysis, home, away, 5, TOTAL_PAGES),
      true,
      "Turnover Punishment",
    );

    // 6. Shot + Wides Map — tactical pitch renderer, SHOTS category, H1 events
    const htShotEvents = selectPdfEvents(events, "H1", "ALL", "SHOTS");
    addPage(
      makeTacticalPage(sport, htShotEvents, "Shot + Wides Map", home, away, 6, TOTAL_PAGES),
      true,
      "Shot + Wides Map",
    );

    // 7. Opposition Snapshot
    addPage(
      makeOppositionSnapshotPage(events, chainAnalysis, home, away, 7, TOTAL_PAGES),
      true,
      "Opposition Snapshot",
    );
  } else {
    // ── FT Snapshot ── 10 pages, full-match events ────────────────────────────

    // 1. Match Summary
    addPage(
      makeSummaryPage(events, home, away, venueName, TOTAL_PAGES),
      false,
      "Match Summary",
    );

    // 2. Tactical Intelligence Summary
    addPage(
      makeTacticalIntelligencePage(chainAnalysis, home, away, 2, TOTAL_PAGES),
      true,
      "Tactical Intelligence Summary",
    );

    // 3. Match Swing Timeline
    addPage(
      makeMatchSwingTimelinePage(events, chainAnalysis, home, away, 3, TOTAL_PAGES),
      true,
      "Match Swing Timeline",
    );

    // 4. Kickout Chain Analysis
    addPage(
      makeKickoutChainPage(chainAnalysis, home, away, 4, TOTAL_PAGES),
      true,
      "Kickout Chain Analysis",
    );

    // 5. Turnover Punishment
    addPage(
      makeTurnoverPunishmentPage(chainAnalysis, home, away, 5, TOTAL_PAGES),
      true,
      "Turnover Punishment",
    );

    // 6. Shot Efficiency
    addPage(
      makeShotEfficiencyPage(events, home, away, 6, TOTAL_PAGES),
      true,
      "Shot Efficiency",
    );

    // 7. Shot + Wides Map — both halves combined; PDF_KIND_SETS["SHOTS"] used
    //    directly (same file) to avoid the single-half restriction of selectPdfEvents.
    const ftShotEvents = events.filter(
      (e) => !e.id.includes("-instant-score-") && PDF_KIND_SETS["SHOTS"].has(e.kind),
    );
    addPage(
      makeTacticalPage(sport, ftShotEvents, "Shot + Wides Map", home, away, 7, TOTAL_PAGES),
      true,
      "Shot + Wides Map",
    );

    // 8. Zone Analysis
    addPage(
      makeZoneAnalysisPage(events, home, away, 8, TOTAL_PAGES),
      true,
      "Zone Analysis",
    );

    // 9. Opposition Snapshot
    addPage(
      makeOppositionSnapshotPage(events, chainAnalysis, home, away, 9, TOTAL_PAGES),
      true,
      "Opposition Snapshot",
    );

    // 10. Tactical Chain Analysis
    addPage(
      makeChainSummaryPage(chainAnalysis, home, away, 10, TOTAL_PAGES),
      true,
      "Tactical Chain Analysis",
    );
  }

  const safeName = (s: string) => s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const suffix   = isHT ? "ht_snapshot" : "ft_snapshot";
  const filename  = `${safeName(homeTeamName)}_v_${safeName(awayTeamName)}_${suffix}.pdf`;
  pdf.save(filename);
}
