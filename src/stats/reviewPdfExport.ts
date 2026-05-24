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
  KICKOUT_WON:          "K/O Won",
  KICKOUT_CONCEDED:     "K/O Conceded",
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
  if (!ctx) return canvas;

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

  function buildStats(evts: readonly PdfExportEvent[]): BlockStats {
    const scoreR    = scoreFromEvents(evts);
    const shots     = countKinds(evts, ...SHOT_KINDS);
    const scoreKind = countKinds(evts, ...SCORE_KINDS);
    const koWon     = countKinds(evts, "KICKOUT_WON");
    const koCon     = countKinds(evts, "KICKOUT_CONCEDED");
    const koTotal   = koWon + koCon;
    const toWon     = countKinds(evts, "TURNOVER_WON");
    const toLost    = countKinds(evts, "TURNOVER_LOST");
    return {
      goals:          scoreR.goals,
      points:         scoreR.points,
      twoPointers:    countKinds(evts, "TWO_POINTER", "FORTY_FIVE_TWO_POINT"),
      scoreTotal:     scoreR.total,
      shots,
      wides:          countKinds(evts, "WIDE"),
      conv:           shots > 0 ? `${Math.round((scoreKind / shots) * 100)}%` : "—",
      // Shot sub-types (from tags)
      shotShort:      countTagOnKinds(evts, "SHORT",      ...SHOT_KINDS),
      shotPost:       countTagOnKinds(evts, "POST",       ...SHOT_KINDS),
      shot45:         countTagOnKinds(evts, "FORTY_FIVE", ...SHOT_KINDS),
      shotBlock:      countKindWithAnyTag(evts, "SHOT", "BLOCK_SAVE", "BLOCKED")
                    + countKindWithAnyTag(evts, "WIDE", "BLOCK_SAVE", "BLOCKED"),
      // Kickouts — all tracked tags
      koWon, koCon,
      koPct:          koTotal > 0 ? `${Math.round((koWon / koTotal) * 100)}%` : "—",
      koCleanWon:     countKindWithAnyTag(evts, "KICKOUT_WON",      "CLEAN"),
      koBreakWon:     countKindWithAnyTag(evts, "KICKOUT_WON",      "BREAK"),
      koCleanLost:    countKindWithAnyTag(evts, "KICKOUT_CONCEDED", "CLEAN"),
      koBreakLost:    countKindWithAnyTag(evts, "KICKOUT_CONCEDED", "BREAK"),
      koFoulWon:      countKindWithAnyTag(evts, "KICKOUT_WON",      "FOUL_WON"),
      koFoulCon:      countKindWithAnyTag(evts, "KICKOUT_CONCEDED", "FOUL_CONCEDED"),
      koKickedDead:   countKindWithAnyTag(evts, "KICKOUT_CONCEDED", "KICKED_DEAD"),
      // Turnovers — all tracked tags (split, not merged)
      toWon, toLost, netTo: toWon - toLost,
      toTacklePress:  countKindWithAnyTag(evts, "TURNOVER_WON",  "TACKLE", "PRESS"),
      toSwarmInt:     countKindWithAnyTag(evts, "TURNOVER_WON",  "SWARM",  "INTERCEPT"),
      toUnforced:     countKindWithAnyTag(evts, "TURNOVER_LOST", "UNFORCED"),
      toSlackKpHp:    countKindWithAnyTag(evts, "TURNOVER_LOST", "SLACK_KICK_PASS", "SLACK_HAND_PASS"),
      toOcStripped:   countKindWithAnyTag(evts, "TURNOVER_LOST", "OVERCARRIED", "STRIPPED"),
      // Frees
      freesWon:       countKinds(evts, "FREE_WON"),
      freesCon:       countKinds(evts, "FREE_CONCEDED"),
      freeScored:     countKinds(evts, "FREE_SCORED"),
      freeMissed:     countKinds(evts, "FREE_MISSED"),
    };
  }

  const forStats = buildStats(forEvts);
  const oppStats = buildStats(oppEvts);

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
          { label: "K/O Won",        value: String(st.koWon) },
          { label: "K/O Lost",       value: String(st.koCon) },
          { label: "K/O %",          value: st.koPct },
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

  // Helper: build per-segment stats for one side
  function segStats(evts: readonly PdfExportEvent[], period: MatchEventPeriod, seg: MatchEventSegment, side: "FOR" | "OPP") {
    const e = evts.filter((ev) => ev.period === period && ev.segment === seg && ev.teamSide === side);
    const score  = scoreFromEvents(e);
    const shots  = countKinds(e, "SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_MISSED", "FREE_SCORED");
    const wides  = countKinds(e, "WIDE");
    const koWon  = countKinds(e, "KICKOUT_WON");
    const koCon  = countKinds(e, "KICKOUT_CONCEDED");
    const koTot  = koWon + koCon;
    const toWon  = countKinds(e, "TURNOVER_WON");
    const toLost = countKinds(e, "TURNOVER_LOST");
    const fWon   = countKinds(e, "FREE_WON");
    const fCon   = countKinds(e, "FREE_CONCEDED");
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

    const subLabels = ["Score", "Shots/W", "K/O W-L", "Net T/O", "Frees W/C"];
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
                   "K/O Won", "K/O Lost", "F Won", "F Con", "Actions"];
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
 *
 * Total pages = 28 + N  (N ≥ 1 → minimum 29 pages).
 */
export async function exportReviewPdf(input: ReviewPdfExportInput): Promise<void> {
  const {
    events,
    homeTeamName,
    awayTeamName,
    venueName,
    sport = "gaelic",
  } = input;

  // Dynamic page count: 8 fixed analysis pages + player pages + 20 tactical maps
  const playerPageCount = calcPlayerPageCount(events);
  const TOTAL_PAGES = 8 + playerPageCount + TACTICAL_PAGE_SPECS.length;

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297; // A4 landscape mm
  const PH = 210;

  function addCanvasPage(canvas: HTMLCanvasElement, addPageFirst: boolean): void {
    if (addPageFirst) pdf.addPage("a4", "landscape");
    try {
      const imgData = canvas.toDataURL("image/jpeg", 0.88);
      pdf.addImage(imgData, "JPEG", 0, 0, PW, PH);
    } catch {
      // Insert placeholder if canvas capture fails — report continues
      pdf.setFillColor(13, 17, 23);
      pdf.rect(0, 0, PW, PH, "F");
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(12);
      pdf.text("Page capture failed", PW / 2, PH / 2, { align: "center" });
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

  // Download
  const safeName = (s: string) => s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const filename  = `${safeName(homeTeamName)}_v_${safeName(awayTeamName)}_review.pdf`;
  pdf.save(filename);
}
