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
import {
  cpCol,
  cpRow,
  rankChainPatterns,
  type ChainPressureKind,
} from "./chains/chain-patterns";
import { deriveReviewPrompts } from "./chains/review-prompts";
import type { ReviewPrompt, ReviewPromptCategory } from "./chains/review-prompts";
import { getZoneCounts, getZoneHotspots } from "./zones/zone-engine";
import type { ZoneCount } from "./zones/zone-types";
import { eventSource, isFreeScore, isFreeMiss } from "./eventSource";
import type { ScoreSource } from "./eventSource";
import { resolvePlayerDisplayName } from "./player-display";

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

/** Minimal squad-player shape needed by the PDF export to seed the player report. */
export type PdfSquadPlayer = {
  id: string;
  number: number;
  name: string;
};

export type ReviewPdfExportInput = {
  events: readonly PdfExportEvent[];
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string;
  /** Defaults to "gaelic" */
  sport?: PitchSport;
  /**
   * When provided, every squad member gets a row in the Player Report even if
   * they had zero tagged events. Home squad maps to the FOR (home) section.
   */
  homeSquadPlayers?: readonly PdfSquadPlayer[];
  /** Away squad maps to the OPP (away) section. */
  awaySquadPlayers?: readonly PdfSquadPlayer[];
};

// ─── Snapshot export types ────────────────────────────────────────────────────

/**
 * Lightweight report mode.
 * - HALF_TIME_SNAPSHOT: first-half events only; 5 visual/spatial pages for a
 *   90-second sideline intervention. VISION FIRST — spatial before statistical.
 * - FULL_TIME_SNAPSHOT: full-match events; 10 pages for concise post-match debrief.
 */
export type SnapshotMode = "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT";

export type SnapshotPdfExportInput = ReviewPdfExportInput & {
  /** Controls which events are included and which pages are rendered. */
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
  FREES:     new Set<MatchEventKind>([
    "FREE_WON",
    "FREE_CONCEDED",
    "FREE_SCORED",
    "FREE_MISSED",
    "GOAL",
    "POINT",
    "TWO_POINTER",
    "FORTY_FIVE_TWO_POINT",
    "WIDE",
  ]),
};

function isFreeRelatedPdfEvent(event: PdfExportEvent): boolean {
  return (
    event.kind === "FREE_WON" ||
    event.kind === "FREE_CONCEDED" ||
    isFreeScore(event) ||
    isFreeMiss(event)
  );
}

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
    if (category === "FREES" && !isFreeRelatedPdfEvent(event)) return false;
    // Tactical side filter — groups by who BENEFITED, not raw event ownership
    if (teamSide !== "ALL" && tacticalSide(event) !== teamSide) return false;
    return true;
  });
}

// ─── Event colours (matches PáircVision CSS palette) ─────────────────────────

const EVENT_COLORS: Record<MatchEventKind, string> = {
  GOAL:                 "#16a34a",  // Dark green circle
  POINT:                "#4ade80",  // Light green circle
  TWO_POINTER:          "#fbbf24",  // Gold circle
  FORTY_FIVE_TWO_POINT: "#fbbf24",  // Gold circle (same as 2pt)
  WIDE:                 "#ef4444",  // Red
  SHOT:                 "#94a3b8",  // Grey (saved/blocked = neutral)
  FREE_MISSED:          "#ef4444",  // Red (miss = wide)
  FREE_SCORED:          "#4ade80",  // Light green (score = point)
  TURNOVER_WON:         "#a78bfa",  // Purple
  TURNOVER_LOST:        "#f97316",  // Orange
  KICKOUT_WON:          "#22d3ee",  // Cyan
  KICKOUT_CONCEDED:     "#fb7185",  // Pink
  FREE_WON:             "#818cf8",  // Indigo
  FREE_CONCEDED:        "#f472b6",  // Pink
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

  ctx.fillStyle = "#94a3b8";
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
  ctx.fillStyle = "#94a3b8";
  ctx.font = "16px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`${count} event${count !== 1 ? "s" : ""}`, CANVAS_W - 24, CANVAS_H - 20);
  ctx.restore();
}

function drawShotAttemptFooter(ctx: CanvasRenderingContext2D, count: number): void {
  ctx.save();
  ctx.fillStyle = "#94a3b8";
  ctx.font = "16px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`${count} shot attempt${count !== 1 ? "s" : ""}`, CANVAS_W - 24, CANVAS_H - 20);
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


// ─── Page builders ────────────────────────────────────────────────────────────


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
      freeScored:     ownEvts.filter((e) => isFreeScore(e)).length,
      freeMissed:     ownEvts.filter((e) => isFreeMiss(e)).length,
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
          { label: "Placed Scored",  value: String(st.freeScored) },
          { label: "Placed Missed",  value: String(st.freeMissed) },
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
  ctx.fillStyle = "#64748b";
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
  ctx.fillStyle = "#64748b";
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
  ctx.fillStyle = "#64748b";
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
  ctx.fillText(`${pageNum} / ${totalPages}`, CANVAS_W - 24, 38);
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
    ctx.fillStyle = "#64748b";
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
function collectPlayerStats(
  events: readonly PdfExportEvent[],
  homeSquad?: readonly PdfSquadPlayer[],
  awaySquad?: readonly PdfSquadPlayer[],
): PlayerStatsFull[] {
  const playerMap = new Map<string, PlayerStatsFull>();

  // Pre-seed from squad so zero-event players still appear.
  // Each player is stored under their UUID key AND a team-scoped number key so
  // that events tagged by number-only (no playerId) accumulate into the same row.
  function seedSquad(squad: readonly PdfSquadPlayer[], teamSide: "FOR" | "OPP"): void {
    for (const p of squad) {
      if (playerMap.has(p.id)) continue;
      const entry: PlayerStatsFull = {
        id:       p.id,
        number:   p.number,
        name:     p.name.trim() || null,
        teamSide,
        actions: 0,
        goals: 0, scorePoints: 0, scoreTotal: 0,
        shots: 0, wides: 0,
        toWon: 0, toLost: 0,
        koWon: 0, koCon: 0,
        freesWon: 0, freesCon: 0,
      };
      playerMap.set(p.id, entry);
      // Alias: events tagged by number only resolve to this same entry
      playerMap.set(`__num_${teamSide}_${p.number}`, entry);
    }
  }

  if (homeSquad) seedSquad(homeSquad, "FOR");
  if (awaySquad) seedSquad(awaySquad, "OPP");

  const validEvts = events.filter((e) => !e.id.includes("-instant-score-"));

  for (const e of validEvts) {
    if (e.playerId == null && e.playerNumber == null) continue;
    // Prefer player-ID key; fall back to team-scoped number key
    const numKey = `__num_${e.teamSide}_${e.playerNumber ?? "?"}`;
    const key =
      e.playerId && playerMap.has(e.playerId) ? e.playerId
      : playerMap.has(numKey)                 ? numKey
      : e.playerId                            ?? numKey;
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
    else if (e.kind === "POINT")                                               { ps.scorePoints += 1; ps.scoreTotal += 1; }
    if (PDF_KIND_SETS.SHOTS.has(e.kind)) ps.shots++;
    if (e.kind === "WIDE")               ps.wides++;
    if (e.kind === "TURNOVER_WON")       ps.toWon++;
    if (e.kind === "TURNOVER_LOST")      ps.toLost++;
    if (e.kind === "KICKOUT_WON")        ps.koWon++;
    if (e.kind === "KICKOUT_CONCEDED")   ps.koCon++;
    if (e.kind === "FREE_WON")           ps.freesWon++;
    if (e.kind === "FREE_CONCEDED")      ps.freesCon++;
  }

  // Deduplicate: each PlayerStatsFull object may be stored under two keys (UUID + number alias)
  const seen = new Set<PlayerStatsFull>();
  for (const ps of playerMap.values()) seen.add(ps);

  return Array.from(seen).sort((a, b) => {
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
function calcPlayerPageCount(
  events: readonly PdfExportEvent[],
  homeSquad?: readonly PdfSquadPlayer[],
  awaySquad?: readonly PdfSquadPlayer[],
): number {
  const players = collectPlayerStats(events, homeSquad, awaySquad);
  if (players.length === 0) return 1; // "no data" page

  const HDR_H = 54;   // table column header
  const SEC_H = 36;   // team section banner
  const ROW_H = 58;   // player data row
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
  homeSquad?: readonly PdfSquadPlayer[],
  awaySquad?: readonly PdfSquadPlayer[],
): HTMLCanvasElement[] {
  const players = collectPlayerStats(events, homeSquad, awaySquad);

  // ── Table geometry — 13 columns; Net T/O added; centered on 1920px canvas ────
  // #(65) Name(230) Score(150) Shots(100) Wides(75) T/O Won(100) T/O Lost(100)
  // Net T/O(80) K/O Won(100) K/O Lost(100) Frees Won(90) Frees Con(90) Actions(100)
  const colWs   = [65, 230, 150, 100, 75, 100, 100, 80, 100, 100, 90, 90, 100];
  const colHdrs = ["#", "Name", "Score", "Shots", "Wides",
                   "T/O Won", "T/O Lost", "Net T/O",
                   "Kickout Won", "Kickout Lost", "Frees Won", "Frees Con", "Actions"];
  const tableW  = colWs.reduce((a, b) => a + b, 0); // 1380
  const tL      = Math.round((CANVAS_W - tableW) / 2); // centered

  const HDR_H       = 54;
  const SEC_H       = 36;
  const ROW_H       = 58;
  const BREAK_LIMIT = CANVAS_H - 28; // 1052

  const colX: number[] = [];
  let cxStart = tL;
  for (const w of colWs) { colX.push(cxStart); cxStart += w; }

  const results: HTMLCanvasElement[] = [];
  let pageIdx = 0;
  let activeCanvas = document.createElement("canvas");
  let activeCtx    = activeCanvas.getContext("2d")!;
  let ry           = 0;

  function startNewCanvas(): void {
    activeCanvas        = document.createElement("canvas");
    activeCanvas.width  = CANVAS_W;
    activeCanvas.height = CANVAS_H;
    activeCtx           = activeCanvas.getContext("2d")!;
    fillDarkBg(activeCtx);
    drawTopAccentBar(activeCtx);
    drawPageHeader(activeCtx, "Player Breakdown",
      `${homeTeam} v ${awayTeam}`, startPageNum + pageIdx, totalPages);

    // Table column header row
    ry = 82;
    activeCtx.fillStyle = "rgba(255,255,255,0.07)";
    activeCtx.fillRect(tL, ry, tableW, HDR_H);
    activeCtx.fillStyle = "#7dd3fc";
    activeCtx.fillRect(tL, ry, 4, HDR_H);
    const midHdr = ry + HDR_H / 2;
    colHdrs.forEach((hdr, i) => {
      activeCtx.fillStyle    = "#94a3b8";
      activeCtx.font         = "bold 13px sans-serif";
      activeCtx.textBaseline = "middle";
      activeCtx.textAlign    = i <= 1 ? "left" : "center";
      activeCtx.fillText(hdr, i <= 1 ? colX[i] + 8 : colX[i] + colWs[i] / 2, midHdr);
    });
    // Bottom separator
    activeCtx.strokeStyle = "rgba(255,255,255,0.08)";
    activeCtx.lineWidth   = 1;
    activeCtx.beginPath();
    activeCtx.moveTo(tL + 4, ry + HDR_H);
    activeCtx.lineTo(tL + tableW, ry + HDR_H);
    activeCtx.stroke();
    ry += HDR_H;
  }

  function drawSecBanner(teamSide: "FOR" | "OPP"): void {
    const sAccent = teamSide === "FOR" ? "#7dd3fc" : "#fb7185";
    const sBg     = teamSide === "FOR" ? "rgba(125,211,252,0.10)" : "rgba(251,113,133,0.10)";
    const sLabel  = teamSide === "FOR" ? homeTeam.toUpperCase() : awayTeam.toUpperCase();
    activeCtx.fillStyle = sBg;
    activeCtx.fillRect(tL, ry, tableW, SEC_H);
    activeCtx.fillStyle = sAccent;
    activeCtx.fillRect(tL, ry, 4, SEC_H);
    activeCtx.font         = "bold 14px sans-serif";
    activeCtx.fillStyle    = "#f1f5f9";
    activeCtx.textBaseline = "middle";
    activeCtx.textAlign    = "left";
    activeCtx.fillText(sLabel, tL + 12, ry + SEC_H / 2);
    // Bottom separator
    activeCtx.strokeStyle = "rgba(255,255,255,0.06)";
    activeCtx.lineWidth   = 1;
    activeCtx.beginPath();
    activeCtx.moveTo(tL + 4, ry + SEC_H);
    activeCtx.lineTo(tL + tableW, ry + SEC_H);
    activeCtx.stroke();
    ry += SEC_H;
  }

  // ── Handle empty state ────────────────────────────────────────────────────────
  if (players.length === 0) {
    startNewCanvas();
    activeCtx.fillStyle    = "#64748b";
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
        currentSide = null;
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
      drawSecBanner(ps.teamSide);
    }

    // Row tint
    if (rowIdx % 2 === 0) {
      activeCtx.fillStyle = "rgba(255,255,255,0.025)";
      activeCtx.fillRect(tL, ry, tableW, ROW_H);
    }
    // Row separator
    activeCtx.strokeStyle = "rgba(255,255,255,0.05)";
    activeCtx.lineWidth   = 1;
    activeCtx.beginPath();
    activeCtx.moveTo(tL, ry + ROW_H);
    activeCtx.lineTo(tL + tableW, ry + ROW_H);
    activeCtx.stroke();

    const noEvents = ps.actions === 0;
    const numStr   = ps.number != null ? `#${ps.number}` : "—";
    const nameStr  = resolvePlayerDisplayName(ps.name, ps.number);
    const scoreStr = noEvents ? "—" : `${ps.goals}-${String(ps.scorePoints).padStart(2, "0")} (${ps.scoreTotal})`;
    const accent   = ps.teamSide === "FOR" ? "#7dd3fc" : "#fb7185";
    const dimmed   = noEvents ? 0.38 : 1.0;
    const midRow   = ry + ROW_H / 2;
    const netTo    = ps.toWon - ps.toLost;
    const netToStr = noEvents ? "—" : (netTo >= 0 ? `+${netTo}` : String(netTo));
    const netColor = noEvents ? "#475569" : (netTo > 0 ? "#4ade80" : netTo < 0 ? "#fb7185" : "#94a3b8");

    const vals      = [numStr, nameStr, scoreStr,
                       noEvents ? "—" : String(ps.shots), noEvents ? "—" : String(ps.wides),
                       noEvents ? "—" : String(ps.toWon), noEvents ? "—" : String(ps.toLost), netToStr,
                       noEvents ? "—" : String(ps.koWon), noEvents ? "—" : String(ps.koCon),
                       noEvents ? "—" : String(ps.freesWon), noEvents ? "—" : String(ps.freesCon),
                       noEvents ? "—" : String(ps.actions)];
    const valColors = vals.map((_, i) =>
      i === 0 ? accent : i === 1 ? "#f1f5f9" : i === 7 ? netColor : "#e2e8f0",
    );
    activeCtx.globalAlpha = dimmed;

    vals.forEach((val, i) => {
      const cx = i <= 1 ? colX[i] + 8 : colX[i] + colWs[i] / 2;

      activeCtx.fillStyle    = valColors[i];
      activeCtx.font         = i === 1 ? "16px sans-serif" : "bold 16px sans-serif";
      activeCtx.textBaseline = "middle";
      activeCtx.textAlign    = i <= 1 ? "left" : "center";
      activeCtx.fillText(val, cx, midRow, colWs[i] - 6);
    });
    activeCtx.globalAlpha = 1.0;

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
  drawPageHeader(ctx, "Chain Intelligence", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
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
      cy = drawStatRow(COL3_X, cy, COL_W, "No scoring runs (2+ scores)",   "—",            "#64748b", false);
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
      cy = drawStatRow(COL3_X, cy, COL_W, "No scoring runs (2+ scores)",   "—",            "#64748b", false);
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
      cy = drawStatRow(COL3_X, cy, COL_W, "No scoring runs detected", "—", "#64748b", false);
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
  drawPageHeader(ctx, "Restart Chain Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
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
      ctx.fillStyle = "#64748b";
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
      ctx.fillStyle = "#64748b";
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
      ctx.fillStyle = "#64748b";
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
      ctx.fillStyle = "#64748b";
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
  drawPageHeader(ctx, "Turnover Chain Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
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
      ctx.fillStyle = "#64748b";
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
      ctx.fillStyle = "#64748b";
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
      cy = drawStatRow(COL1_X, cy, COL_W, "Opposition unforced error", String(forTagUnforced),    "#fbbf24", false);
      drawStatRow(COL1_X, cy, COL_W,      "Opposition slack pass",     String(forTagSlack),       "#fbbf24", true);
    }
  }

  // ── COL 2: awayTeam — Attacking from Turnovers ───────────────────────────────
  {
    drawPanelBg(COL2_X, CONTENT_TOP, COL_W, CONTENT_H, "#fb7185");
    let cy = drawPanelTitle(COL2_X, CONTENT_TOP, `${awayTeam.slice(0, 18)} — Turnover Attack`, "#fb7185");

    if (oppWonTotal === 0) {
      ctx.save();
      ctx.fillStyle = "#64748b";
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
      cy = drawStatRow(COL2_X, cy, COL_W, "Opposition unforced error", String(oppTagUnforced),    "#fbbf24", false);
      drawStatRow(COL2_X, cy, COL_W,      "Opposition slack pass",     String(oppTagSlack),       "#fbbf24", true);
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

    // ── Possession Chain V1 observations ─────────────────────────────────────
    // Placed at bottom of COL3 when space allows; renders nothing below threshold.
    {
      const chainObs = derivePossessionChainObservations(analysis);
      if (chainObs.length > 0) {
        let chainCy = cy + 26 + 16;  // advance past last row + spacing
        chainCy = drawSubHeader(COL3_X, chainCy, COL_W, "POSSESSION CHAIN INSIGHTS", "#60a5fa");
        ctx.save();
        ctx.font         = "12px sans-serif";
        ctx.fillStyle    = "#64748b";
        ctx.textBaseline = "middle";
        ctx.textAlign    = "left";
        for (const ob of chainObs) {
          ctx.fillText(`• ${ob}`, COL3_X + 14, chainCy + 13);
          chainCy += 26;
        }
        ctx.restore();
      }
    }
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
  drawPageHeader(ctx, "Scoring Momentum", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
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
      ctx.fillStyle = "#64748b";
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
        ctx.fillStyle = "#64748b";
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
      ctx.fillStyle = "#64748b";
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
      const h1LateCol = h1LateRuns.length === 0 ? "#64748b" : "#fbbf24";
      drawStatRow(COL2_X, cy, COL_W, "1H late burst (seg 3)", h1LateStr, h1LateCol, false);
    }

    // ── 2H panel ─────────────────────────────────────────────────────────────────
    drawPanelBg(COL2_X, PANEL_Y2, COL_W, HALF_H, "#a78bfa");
    cy = drawPanelTitle(COL2_X, PANEL_Y2, "Second Half — Scoring Runs", "#a78bfa");

    if (h2Runs.length === 0) {
      ctx.save();
      ctx.fillStyle = "#64748b";
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
      const h2LateCol = h2LateRuns.length === 0 ? "#64748b" : "#fbbf24";
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
      cy = drawStatRow(COL3_X, cy, COL_W, `${homeTeam.slice(0, 16)} longest`, "No run ≥2", "#64748b", false);
    }
    if (lro) {
      cy = drawStatRow(COL3_X, cy, COL_W,
        `${awayTeam.slice(0, 16)} longest`,
        `×${lro.count}  ${runTimeLabel(lro)}  ${fmtScore(scoreFromEvents(lro.events))}`,
        "#fb7185", true,
      );
    } else {
      cy = drawStatRow(COL3_X, cy, COL_W, `${awayTeam.slice(0, 16)} longest`, "No run ≥2", "#64748b", true);
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
      cy = drawStatRow(COL3_X, cy, COL_W, "Insufficient alternating runs", "—", "#64748b", false);
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
        controlColor = "#64748b";
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
  drawPageHeader(ctx, "Intelligence Summary", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);
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
    ctx.fillStyle = "#64748b";
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
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Kickouts won → score",           `${koConvPct}%`, "#34d399", false);
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Kickouts lost → opposition scored", `${koExpPct}%`, "#fb7185", true);
  {
    const netColor = koNetAdv > 0 ? "#34d399" : koNetAdv < 0 ? "#fb7185" : "#94a3b8";
    const netStr   = koNetAdv === 0 ? "0 %pt" : (koNetAdv > 0 ? `+${koNetAdv} %pt` : `${koNetAdv} %pt`);
    drawMetricRow(L_COL_X, cy, L_COL_W, "Net kickout advantage (%pt)", netStr, netColor, false);
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
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Turnovers won → score",             `${tvConvPct}%`, "#34d399", false);
  cy = drawMetricRow(L_COL_X, cy, L_COL_W, "Turnovers won → shot, no score",   `${tvShotOnly}%`, "#fbbf24", true);
  drawMetricRow(L_COL_X, cy, L_COL_W, "Turnovers lost → opposition scored", `${tvDefExp}%`, "#fb7185", false);

  // ── LEFT — CARD 3: MATCH INTELLIGENCE ─────────────────────────────────────
  drawCardBg(L_COL_X, card3Y, L_COL_W, CARD_H_BOT, "#f59e0b");
  cy = drawCardTitle(L_COL_X, card3Y, L_COL_W, "Match Intelligence", "#f59e0b");
  cy += 10;

  // Deterministic insight sentences — each filled from match numbers only.
  const insights: Array<{ text: string }> = [];

  if (koTotal > 0) {
    if (koWinPct >= 55) {
      insights.push({ text: `${homeTeam.slice(0, 16)} won ${koWinPct}% of kickouts — ${koConvPct}% converted to scores.` });
    } else if (koWinPct < 45) {
      insights.push({ text: `${homeTeam.slice(0, 16)} won only ${koWinPct}% of kickouts (${koWon}/${koTotal}); ${awayTeam.slice(0, 16)} scored from ${koExpPct}% of their wins.` });
    } else {
      insights.push({ text: `Balanced kickout contest — ${homeTeam.slice(0, 16)} won ${koWinPct}%, converting ${koConvPct}% to scores.` });
    }
  }

  if (tvTotal > 0) {
    if (tvConvPct >= 35) {
      insights.push({ text: `${homeTeam.slice(0, 16)} converted ${tvConvPct}% of won turnovers to scores.` });
    } else if (tvConvPct < 20 && tvWon > 0) {
      insights.push({ text: `${homeTeam.slice(0, 16)} won ${tvWon}/${tvTotal} turnovers but converted only ${tvConvPct}% to scores.` });
    } else {
      insights.push({ text: `${homeTeam.slice(0, 16)} won ${tvWinPct}% of turnovers (${tvConvPct}% to scores). ${awayTeam.slice(0, 16)} scored from ${tvDefExp}% of theirs.` });
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
      insights.push({ text: `${homeTeam.slice(0, 16)} controlled possession — winning ${chainForPct}% of all sequences.` });
    } else if (chainForPct <= 40) {
      insights.push({ text: `${awayTeam.slice(0, 16)} held the possession edge — ${homeTeam.slice(0, 16)} won only ${chainForPct}% of sequences.` });
    } else {
      insights.push({ text: `Closely matched — ${homeTeam.slice(0, 16)} won ${chainForPct}% of ${chainTotal} possession sequences.` });
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
  if (koWinPct >= 55)    fx = drawFlagChip(fx, flagsY, "Kickout Strength",  "rgba(34,211,238,0.15)",  "#22d3ee");
  if (koNetAdv < -10)    fx = drawFlagChip(fx, flagsY, "Kickout Risk",      "rgba(251,113,133,0.15)", "#fb7185");
  if (tvConvPct >= 35)   fx = drawFlagChip(fx, flagsY, "Clinical",          "rgba(52,211,153,0.15)",  "#34d399");
  if (tvDefExp > 40)     fx = drawFlagChip(fx, flagsY, "Turnover Risk",     "rgba(251,113,133,0.15)", "#fb7185");
  if (maxConsFor >= 4)   fx = drawFlagChip(fx, flagsY, "Momentum Burst",    "rgba(34,211,238,0.15)",  "#22d3ee");
  if (maxConsOpp >= 4)   fx = drawFlagChip(fx, flagsY, "Opposition Run",    "rgba(251,113,133,0.15)", "#fb7185");
  if (chainForPct >= 60) drawFlagChip(fx, flagsY, "Possession Control", "rgba(167,139,250,0.15)", "#a78bfa");

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
      `Scoring Runs  (runs of ≥2 consecutive scores)`,
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
  rcy = drawCardTitle(R_COL_X, card2Y, R_COL_W, "Possession Sequences", "#a78bfa");
  {
    const chainColor = chainForPct >= 60 ? "#34d399"
      : chainForPct <= 40 ? "#fb7185"
      : "#94a3b8";
    rcy = drawHeroMetric(
      R_COL_X, rcy,
      chainTotal > 0 ? `${chainForPct}%` : "—",
      `Possession Sequence Win Rate  (${sm.forChains} of ${chainTotal} won)`,
      chainColor,
    );
  }
  rcy = drawMetricRow(R_COL_X, rcy, R_COL_W, "Kickouts leading to scores",    `${koToScore}`,  "#22d3ee", false);
  rcy = drawMetricRow(R_COL_X, rcy, R_COL_W, "Turnovers leading to scores",   `${tvToScore}`,  "#a78bfa", true);
  drawMetricRow(R_COL_X, rcy, R_COL_W, "Placed balls leading to goals",       `${freeToGoal}`, "#fbbf24", false);

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
      label:    "Turnover conversion rate",
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
      label:    "Possession sequences won",
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
    ctx.fillStyle = "#64748b";
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
    ctx.fillStyle = "#64748b";
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
    ctx.fillStyle = "#64748b";
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
    ctx.fillStyle = "#64748b";
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
    ctx.fillStyle = "#64748b";
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
    ctx.fillStyle = "#64748b";
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
    ctx.fillStyle = "#64748b";
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
 * Zone Analysis — dual-pitch spatial overview page.
 *
 * LEFT pitch:   FOR team combined zone activity (scores + turnovers won).
 *               Semi-transparent green overlays; opacity ∝ event count.
 * RIGHT pitch:  OPP team combined zone activity (scores against + opposition gains).
 *               Semi-transparent red overlays; opacity ∝ event count.
 * Bottom strip: Zone Summary | Key Zones | Zone Intelligence.
 *
 * Data calculations: unchanged — getZoneCounts / getZoneHotspots / event subsets.
 * Intelligence bullets: unchanged deterministic text from original Zone Notes strip.
 * Safari < 15.4 safe — no ctx.roundRect.
 */
function makeZoneAnalysisPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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

  // ── Event subsets (unchanged logic) ────────────────────────────────────────
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

  // ── Zone counts (9 entries each, stable order, zero-filled) ──────────────
  const forScoreCounts = getZoneCounts(forScoreEvts);
  const forTvWonCounts = getZoneCounts(forTvWonEvts);
  const oppScoreCounts = getZoneCounts(oppScoreEvts);
  const oppGainCounts  = getZoneCounts(oppGainEvts);

  // ── Hotspots ──────────────────────────────────────────────────────────────
  const forScoreHots = getZoneHotspots(forScoreEvts);
  const forTvWonHots = getZoneHotspots(forTvWonEvts);
  const oppScoreHots = getZoneHotspots(oppScoreEvts);
  const oppGainHots  = getZoneHotspots(oppGainEvts);

  // ── Merged activity counts for unified pitch overlays ─────────────────────
  function mergeZoneCounts(a: readonly ZoneCount[], b: readonly ZoneCount[]): ZoneCount[] {
    const map = new Map<string, ZoneCount>();
    for (const z of [...a, ...b]) {
      const ex = map.get(z.id);
      if (ex) { ex.count += z.count; } else { map.set(z.id, { ...z }); }
    }
    return Array.from(map.values());
  }
  const forActivityCounts = mergeZoneCounts(forScoreCounts, forTvWonCounts);
  const oppActivityCounts = mergeZoneCounts(oppScoreCounts, oppGainCounts);

  // ── Zone overlay renderer ──────────────────────────────────────────────────
  function renderZoneOverlay(
    counts: readonly ZoneCount[],
    inner: InnerPitch,
    baseColor: string,
  ): void {
    const maxCount = counts.reduce((m, c) => Math.max(m, c.count), 0);
    ctx.save();
    for (const zone of counts) {
      const zx = inner.x + (zone.bounds.xMin / 100) * inner.w;
      const zy = inner.y + (zone.bounds.yMin / 100) * inner.h;
      const zw = (zone.bounds.xMax - zone.bounds.xMin) / 100 * inner.w;
      const zh = (zone.bounds.yMax - zone.bounds.yMin) / 100 * inner.h;
      const isHot = zone.count > 0 && zone.count === maxCount;

      // Zone fill — opacity reflects activity density
      const alpha = zone.count > 0 ? 0.14 + (zone.count / maxCount) * 0.40 : 0.04;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = baseColor;
      ctx.fillRect(zx + 1, zy + 1, zw - 2, zh - 2);
      ctx.globalAlpha = 1;

      // Hottest zone: accent border + count + label
      if (isHot) {
        ctx.globalAlpha  = 0.55;
        ctx.strokeStyle  = baseColor;
        ctx.lineWidth    = 2;
        ctx.strokeRect(zx + 1, zy + 1, zw - 2, zh - 2);
        ctx.globalAlpha  = 1;

        ctx.fillStyle    = baseColor;
        ctx.globalAlpha  = 0.95;
        ctx.font         = "bold 22px sans-serif";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(zone.count), zx + zw / 2, zy + zh / 2 - 10);
        ctx.globalAlpha  = 1;

        ctx.fillStyle    = "#ffffff";
        ctx.globalAlpha  = 0.72;
        ctx.font         = "10px sans-serif";
        ctx.fillText(zone.label, zx + zw / 2, zy + zh / 2 + 10);
        ctx.globalAlpha  = 1;
      }
    }
    ctx.restore();
  }

  // ── Intelligence bullets (unchanged text from original Zone Notes) ─────────
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
  if (
    bullets.length < 5 &&
    forScoreHots.length > 0 &&
    oppScoreHots.length > 0 &&
    forScoreHots[0].zoneId === oppScoreHots[0].zoneId
  ) {
    bullets.push(`${forScoreHots[0].label} zone: highest-activity scoring zone for both teams`);
  }
  if (bullets.length === 0) bullets.push("No zone data recorded for this match");

  // ── Empty state ────────────────────────────────────────────────────────────
  if (events.length === 0) {
    ctx.fillStyle    = "#64748b";
    ctx.font         = "16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    ctx.fillText("No match data recorded", CANVAS_W / 2, CANVAS_H / 2);
    return canvas;
  }

  // ── Pitches ───────────────────────────────────────────────────────────────
  const forTotal  = forActivityCounts.reduce((s, z) => s + z.count, 0);
  const oppTotal  = oppActivityCounts.reduce((s, z) => s + z.count, 0);
  const CALLOUT_H = 120;
  const INNER_H   = DP_PITCH_H - CALLOUT_H;

  dpPitchTitle(ctx, DP_LEFT_X,  DP_PITCH_Y, DP_PITCH_W, `${homeTeam} Zone Activity`,        forTotal, "#34d399");
  dpPitchCallout(ctx, DP_LEFT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Most scoring: ${forScoreHots[0]?.label ?? "No data"}`,
    `Turnovers won: ${forTvWonHots[0]?.label ?? "No data"}`,
    `${forScoreEvts.length} scoring event${forScoreEvts.length !== 1 ? "s" : ""} recorded`,
    "#34d399",
  );
  const leftInner  = renderPitch(ctx, sport, { x: DP_LEFT_X,  y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderZoneOverlay(forActivityCounts, leftInner, "#34d399");

  dpPitchTitle(ctx, DP_RIGHT_X, DP_PITCH_Y, DP_PITCH_W, `${awayTeam} Zone Activity`, oppTotal, "#f87171");
  dpPitchCallout(ctx, DP_RIGHT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Opposition scoring: ${oppScoreHots[0]?.label ?? "No data"}`,
    `Opposition gains: ${oppGainHots[0]?.label ?? "No data"}`,
    `${oppScoreEvts.length} opposition scoring event${oppScoreEvts.length !== 1 ? "s" : ""}`,
    "#f87171",
  );
  const rightInner = renderPitch(ctx, sport, { x: DP_RIGHT_X, y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderZoneOverlay(oppActivityCounts, rightInner, "#f87171");

  // ── Panel 1: Zone Summary ─────────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P1_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Zone Summary", "#34d399");
    cy += 2;
    cy = dpPossessionBar(ctx, DP_P1_X, cy, DP_PANEL_W,
      forTotal, oppTotal,
      homeTeam.slice(0, 10), awayTeam.slice(0, 10),
      "#34d399", "#f87171",
    );
    cy += 2;
    const allMax = Math.max(forScoreEvts.length, forTvWonEvts.length, oppScoreEvts.length, oppGainEvts.length) || 1;
    cy = dpSubHeader(ctx, DP_P1_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14).toUpperCase()} ACTIVITY`, "#34d399");
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Scores",        String(forScoreEvts.length), forScoreEvts.length / allMax, "#4ade80", "#4ade80", false);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Turnovers Won", String(forTvWonEvts.length), forTvWonEvts.length / allMax, "#34d399", "#34d399", true);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P1_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14).toUpperCase()} ACTIVITY`, "#f87171");
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Scores Against",    String(oppScoreEvts.length), oppScoreEvts.length / allMax, "#f87171", "#f87171", false);
        dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Opposition Gains",   String(oppGainEvts.length),  oppGainEvts.length  / allMax, "#f97316", "#f97316", true);
  }

  // ── Panel 2: Key Zones ────────────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P2_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Key Zones", "#fbbf24");
    cy += 2;
    const maxScoringHot = Math.max(forScoreHots[0]?.count ?? 0, oppScoreHots[0]?.count ?? 0) || 1;
    const maxTvHot      = Math.max(forTvWonHots[0]?.count ?? 0, oppGainHots[0]?.count ?? 0)  || 1;

    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, "SCORING ZONES", "#4ade80");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W,
      `${homeTeam.slice(0, 14)} hotspot`,
      forScoreHots[0] ? `${forScoreHots[0].label} (${forScoreHots[0].count})` : "—",
      forScoreHots[0] ? forScoreHots[0].count / maxScoringHot : 0,
      "#4ade80", "#4ade80", false,
    );
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W,
      `${awayTeam.slice(0, 14)} hotspot`,
      oppScoreHots[0] ? `${oppScoreHots[0].label} (${oppScoreHots[0].count})` : "—",
      oppScoreHots[0] ? oppScoreHots[0].count / maxScoringHot : 0,
      "#f87171", "#f87171", true,
    );
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, "TURNOVER ZONES", "#fbbf24");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W,
      `${homeTeam.slice(0, 14)} won in`,
      forTvWonHots[0] ? `${forTvWonHots[0].label} (${forTvWonHots[0].count})` : "—",
      forTvWonHots[0] ? forTvWonHots[0].count / maxTvHot : 0,
      "#a78bfa", "#a78bfa", false,
    );
    dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W,
      "Opposition gained in",
      oppGainHots[0] ? `${oppGainHots[0].label} (${oppGainHots[0].count})` : "—",
      oppGainHots[0] ? oppGainHots[0].count / maxTvHot : 0,
      "#f97316", "#f97316", true,
    );
  }

  // ── Panel 3: Zone Intelligence ────────────────────────────────────────────
  {
    const panelY  = dpPanelStart(ctx, DP_P3_X, DP_STRIP_Y, DP_P3_W, DP_STRIP_H, "Zone Intelligence", "#34d399");
    const maxY    = DP_STRIP_Y + DP_STRIP_H - 8;
    const ITEM_H  = 52;
    const LINE_H  = 16;
    const MAX_TW  = DP_P3_W - 22;
    let   cy      = panelY + 6;

    ctx.save();
    for (const bullet of bullets.slice(0, 5)) {
      if (cy + ITEM_H > maxY - 4) break;

      ctx.fillStyle = "#34d399cc";
      ctx.fillRect(DP_P3_X + 7, cy + 4, 3, ITEM_H - 12);

      ctx.font = "12px sans-serif";
      let line1 = "";
      let line2 = "";
      for (const word of bullet.split(" ")) {
        const test1 = line1 ? `${line1} ${word}` : word;
        if (!line2 && ctx.measureText(test1).width <= MAX_TW) {
          line1 = test1;
        } else {
          const test2 = line2 ? `${line2} ${word}` : word;
          if (ctx.measureText(test2).width <= MAX_TW) {
            line2 = test2;
          } else {
            let t = test2;
            let i = 0;
            while (t.length > 0 && ctx.measureText(`${t}…`).width > MAX_TW && i < 500) {
              t = t.slice(0, -1);
              i++;
            }
            line2 = `${t}…`;
            break;
          }
        }
      }

      ctx.fillStyle    = "#e2e8f0";
      ctx.textBaseline = "top";
      ctx.textAlign    = "left";
      ctx.fillText(line1, DP_P3_X + 15, cy + 4);
      if (line2) {
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "11px sans-serif";
        ctx.fillText(line2, DP_P3_X + 15, cy + 4 + LINE_H);
      }

      cy += ITEM_H + 4;
    }
    ctx.restore();
  }

  drawEventCountFooter(ctx, events.length);
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
      ctx.fillStyle    = "#64748b";
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
    ctx.fillStyle    = "#64748b";
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

  // ── Data derivation ───────────────────────────────────────────────────────────
  type SrcKey = ScoreSource;
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
    const freeScored     = evts.filter((e) => isFreeScore(e)).length;
    const freeMissed     = evts.filter((e) => isFreeMiss(e)).length;
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
    cy = drawRow(colX, cy, "Placed Scored", String(stats.freeScored),
      stats.freeScored > 0 ? accentColor : MUTED, false);
    cy = drawRow(colX, cy, "Placed Missed", String(stats.freeMissed),
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

// ─── Chapter label stamper ───────────────────────────────────────────────────

/**
 * Post-renders a small chapter label chip onto an already-built canvas.
 * Called from exportReviewPdf on the first page of each chapter so that
 * the label appears in the top-right area without modifying any page builder.
 */
function stampChapterLabel(
  canvas: HTMLCanvasElement,
  label: string,
  accentColor: string,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.font = "bold 13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const text = label.toUpperCase();
  const tw = ctx.measureText(text).width;
  const chipW = tw + 20;
  const chipH = 20;
  const chipX = CANVAS_W - 24 - chipW;
  const chipY = 14;
  ctx.fillStyle = accentColor + "33";
  ctx.fillRect(chipX, chipY, chipW, chipH);
  ctx.fillStyle = accentColor;
  ctx.fillText(text, chipX + 10, chipY + chipH / 2);
  ctx.restore();
}

// ─── Layer badge ─────────────────────────────────────────────────────────────
// Stamps a small engine-ownership badge onto an already-rendered canvas page.
// Positioned at top-right, below the page number, above the header divider.
// Matches the same chip style as stampChapterLabel for visual consistency.

type LayerKind = "STATISTICS" | "POSSESSION" | "CHAIN" | "MIXED";

const LAYER_COLOURS: Record<LayerKind, string> = {
  STATISTICS: "#60a5fa",   // steel blue
  POSSESSION: "#34d399",   // emerald
  CHAIN:      "#818cf8",   // violet
  MIXED:      "#94a3b8",   // slate  (dual-engine pages)
};

const LAYER_LABELS: Record<LayerKind, string[]> = {
  STATISTICS: ["STATISTICS"],
  POSSESSION: ["POSSESSION"],
  CHAIN:      ["CHAIN"],
  MIXED:      ["POSSESSION", "CHAIN"],   // two stacked chips for dual-engine pages
};

function stampLayerBadge(canvas: HTMLCanvasElement, layer: LayerKind): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.font = "bold 11px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const chips = LAYER_LABELS[layer];
  const chipH = 16;
  const chipGap = 4;
  const startY = 51 - ((chips.length - 1) * (chipH + chipGap)) / 2;

  chips.forEach((label, i) => {
    const colour = chips.length === 1 ? LAYER_COLOURS[layer] : (i === 0 ? LAYER_COLOURS.POSSESSION : LAYER_COLOURS.CHAIN);
    const tw = ctx.measureText(label).width;
    const chipW = tw + 16;
    const chipX = CANVAS_W - 24 - chipW;
    const chipY = startY + i * (chipH + chipGap);
    ctx.fillStyle = colour + "33";
    ctx.fillRect(chipX, chipY, chipW, chipH);
    ctx.fillStyle = colour;
    ctx.fillText(label, chipX + 8, chipY + chipH / 2);
  });

  ctx.restore();
}

// ─── How To Read This Report page ────────────────────────────────────────────

function makeHowToReadPage(
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
  drawPageHeader(ctx, "Understanding PáircVision Analytics", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  ctx.save();
  ctx.textBaseline = "top";

  // ── Three-layer explanation ───────────────────────────────────────────────
  const COL = 90;
  const COL2 = 680;
  const COL3 = 1270;
  const TOP = 120;
  const CARD_W = 520;
  const CARD_H = 780;

  const layers: Array<{ colour: string; title: string; subtitle: string; question: string; body: string; surfaces: string[] }> = [
    {
      colour:   "#60a5fa",
      title:    "STATISTICS",
      subtitle: "What happened?",
      question: "Raw match events exactly as they were recorded.",
      body:     "Scores, shots, kickouts, turnovers and frees — the numbers you would record on a clipboard.",
      surfaces: ["Match Swing Timeline", "Game Segments", "Player Breakdown", "Shot Pitch Maps", "Shot Efficiency", "Zone Analysis", "Pitch Overviews"],
    },
    {
      colour:   "#34d399",
      title:    "POSSESSION INTELLIGENCE",
      subtitle: "What happened after each possession?",
      question: "Every restart, turnover and free is followed to its immediate outcome.",
      body:     "Each possession is tracked from its origin to its result — a score, a wide, or possession lost. This is the official source of truth for coaching summaries.",
      surfaces: ["Restart Analysis", "Turnover Analysis", "Free Kick Analysis", "Intelligence Summary"],
    },
    {
      colour:   "#818cf8",
      title:    "CHAIN INTELLIGENCE",
      subtitle: "Why did those attacks become scores?",
      question: "Complete attacking sequences showing how pressure became scores.",
      body:     "A chain traces a full attack, even when it spans multiple possessions. A turnover → free won → score is one chain. This layer explains how pressure became points.",
      surfaces: ["Chain Intelligence", "Restart Chain Analysis", "Turnover Chain Analysis", "Scoring Momentum"],
    },
  ];

  [COL, COL2, COL3].forEach((cx, i) => {
    const layer = layers[i];
    const { colour } = layer;

    // Card background
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(cx, TOP, CARD_W, CARD_H);

    // Left accent bar
    ctx.fillStyle = colour;
    ctx.fillRect(cx, TOP, 4, CARD_H);

    let y = TOP + 32;

    // Layer title
    ctx.fillStyle = colour;
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(layer.title, cx + 22, y);
    y += 36;

    // Subtitle
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 22px sans-serif";
    const subtitleLines = wrapText(ctx, layer.subtitle, CARD_W - 44);
    subtitleLines.forEach((line) => { ctx.fillText(line, cx + 22, y); y += 28; });
    y += 8;

    // Divider
    ctx.strokeStyle = colour + "44";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 22, y); ctx.lineTo(cx + CARD_W - 22, y); ctx.stroke();
    y += 20;

    // Question
    ctx.fillStyle = "#94a3b8";
    ctx.font = "italic 17px sans-serif";
    const qLines = wrapText(ctx, `"${layer.question}"`, CARD_W - 44);
    qLines.forEach((line) => { ctx.fillText(line, cx + 22, y); y += 24; });
    y += 14;

    // Body
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "16px sans-serif";
    const bodyLines = wrapText(ctx, layer.body, CARD_W - 44);
    bodyLines.forEach((line) => { ctx.fillText(line, cx + 22, y); y += 22; });
    y += 20;

    // Divider
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.moveTo(cx + 22, y); ctx.lineTo(cx + CARD_W - 22, y); ctx.stroke();
    y += 20;

    // "Found in this report:" label
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("FOUND IN THIS REPORT", cx + 22, y);
    y += 24;

    // Surface list
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px sans-serif";
    layer.surfaces.forEach((s) => {
      ctx.fillText(`· ${s}`, cx + 22, y);
      y += 22;
    });
  });

  // ── Footer disclaimer ─────────────────────────────────────────────────────
  const footY = CANVAS_H - 36;
  ctx.fillStyle = "#475569";
  ctx.font = "italic 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "Statistics, Possession Intelligence and Chain Intelligence answer different coaching questions. The numbers may differ because they measure different stages of play. Both are correct.",
    CANVAS_W / 2, footY,
  );

  ctx.restore();
  return canvas;
}

// ─── Chapter divider page ─────────────────────────────────────────────────────

function makeChapterDividerPage(
  chapterNum: number,
  title: string,
  layerName: string,
  description: string,
  coachQuestion: string,
  contents: readonly string[],
  accentColour: string,
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);

  // ── Left accent bar ───────────────────────────────────────────────────────
  ctx.fillStyle = accentColour;
  ctx.fillRect(0, 0, 12, CANVAS_H);

  // ── Top accent gradient bar ───────────────────────────────────────────────
  const g = ctx.createLinearGradient(12, 0, CANVAS_W, 0);
  g.addColorStop(0, accentColour + "22");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(12, 0, CANVAS_W - 12, 6);

  // ── Page number (top-right, consistent with all other pages) ──────────────
  ctx.save();
  ctx.fillStyle = "#94a3b8";
  ctx.font = "17px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`${pageNum} / ${totalPages}`, CANVAS_W - 24, 38);
  ctx.restore();

  // ── Content ───────────────────────────────────────────────────────────────
  const LEFT = 80;
  let y = 180;
  ctx.save();
  ctx.textBaseline = "top";

  // Chapter label
  ctx.fillStyle = accentColour;
  ctx.font = `bold 20px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`CHAPTER ${chapterNum}`, LEFT, y);
  y += 50;

  // Main title — large
  ctx.fillStyle = "#f8fafc";
  ctx.font = `bold 72px sans-serif`;
  const titleLines = wrapText(ctx, title, CANVAS_W - LEFT - 80);
  titleLines.forEach((line) => { ctx.fillText(line, LEFT, y); y += 84; });
  y += 4;

  // Layer name
  ctx.fillStyle = accentColour;
  ctx.font = `bold 30px sans-serif`;
  ctx.fillText(layerName, LEFT, y);
  y += 52;

  // Accent divider
  ctx.strokeStyle = accentColour + "55";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LEFT, y); ctx.lineTo(LEFT + 560, y); ctx.stroke();
  y += 28;

  // Description
  ctx.fillStyle = "#94a3b8";
  ctx.font = `italic 22px sans-serif`;
  ctx.fillText(`"${description}"`, LEFT, y);
  y += 50;

  // Coach question
  ctx.fillStyle = "#64748b";
  ctx.font = `20px sans-serif`;
  ctx.fillText(`Coach question answered: "${coachQuestion}"`, LEFT, y);
  y += 60;

  // Contents header
  ctx.fillStyle = "#64748b";
  ctx.font = `bold 15px sans-serif`;
  ctx.fillText("THIS CHAPTER CONTAINS", LEFT, y);
  y += 28;

  // Contents list
  ctx.fillStyle = "#94a3b8";
  ctx.font = `18px sans-serif`;
  contents.forEach((item) => {
    ctx.fillText(`· ${item}`, LEFT, y);
    y += 28;
  });

  ctx.restore();

  // ── Brand footer ──────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = accentColour + "66";
  ctx.font = "bold 13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText("PÁIRCVISION", CANVAS_W - 24, CANVAS_H - 24);
  ctx.restore();

  return canvas;
}

// ─── Text wrap helper (used by How To Read page) ─────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Dual-pitch visual analysis pages ────────────────────────────────────────
//
// Three page builders — Restart, Turnover, Free — each showing two pitches
// side-by-side (FOR left / OPP right) plus a 3-panel stats strip at the bottom.
// These replace the 2×2 quad map pages for their chapters; the companion
// chain/punishment detail pages remain unchanged.

// Shared geometry (all three builders use the same canvas layout).
const DP_LEFT_X  = 16;
const DP_PITCH_W = 938;
const DP_RIGHT_X = DP_LEFT_X + DP_PITCH_W + 12;   // 966
const DP_PITCH_Y = 82;
const DP_TITLE_H = 26;
const DP_PITCH_H = 660;
const DP_STRIP_Y = DP_PITCH_Y + DP_PITCH_H + 10;  // 752
const DP_PANEL_W = Math.floor((CANVAS_W - 32 - 24) / 3); // 621
const DP_P1_X    = 16;
const DP_P2_X    = DP_P1_X + DP_PANEL_W + 12;     // 649
const DP_P3_X    = DP_P2_X + DP_PANEL_W + 12;     // 1282
const DP_P3_W    = CANVAS_W - DP_P3_X - 16;       // 622
const DP_STRIP_H = CANVAS_H - DP_STRIP_Y - 14;    // 314

// Mini-bar layout constants.
const DP_BAR_OFFSET = 230;  // px from panel left edge where bar column starts
const DP_BAR_MAX_W  = 110;  // max bar fill width in px
const DP_BAR_H      =   8;  // bar height in px

/** Builds a pill-shaped path without filling. Safari < 15.4 — no ctx.roundRect. */
function dpRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = Math.min(h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
}

function dpPitchTitle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  label: string, count: number, accent: string,
): void {
  ctx.save();
  ctx.fillStyle = accent + "1e";  // ~12% tint
  ctx.fillRect(x, y, w, DP_TITLE_H);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 3, DP_TITLE_H);
  ctx.font = "bold 13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label.toUpperCase(), x + 12, y + DP_TITLE_H / 2);
  ctx.fillStyle = "#64748b";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${count} events`, x + w - 10, y + DP_TITLE_H / 2);
  ctx.restore();
}

/**
 * Draws a headline + 2-bullet callout band between the pitch title bar and inner pitch.
 * headline — large bold summary (21px), displayed first.
 * bullet1/bullet2 — supporting detail (14px), displayed below with accent dot.
 * y/h describe the callout area (DP_PITCH_Y + DP_TITLE_H → DP_PITCH_Y + CALLOUT_H).
 */
function dpPitchCallout(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  headline: string,
  bullet1: string, bullet2: string,
  accentColor: string,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = accentColor;
  ctx.fillRect(x, y, 3, h);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 21px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(headline, x + 26, y + 20, w - 34);

  [bullet1, bullet2].forEach((text, i) => {
    const cy = y + 48 + i * 22;
    ctx.fillStyle = accentColor + "cc";
    ctx.beginPath();
    ctx.arc(x + 14, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, x + 26, cy, w - 34);
  });

  ctx.restore();
}

/**
 * Draws a panel card background with subtle border, left accent bar, and title.
 * Returns the y coordinate where content should start.
 */
function dpPanelStart(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  title: string, accent: string,
): number {
  ctx.save();

  // Card background
  ctx.fillStyle = "rgba(255,255,255,0.022)";
  ctx.fillRect(x, y, w, h);

  // Subtle perimeter border
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Left accent bar
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 3, h);

  // Panel title — brighter than stat labels to anchor the eye
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(title.toUpperCase(), x + 14, y + 16);

  // Title separator
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 30);
  ctx.lineTo(x + w, y + 30);
  ctx.stroke();

  ctx.restore();
  return y + 34;
}

/** Standard key-value stat row (ROW_H = 26). */
function dpStatRow(
  ctx: CanvasRenderingContext2D,
  x: number, cy: number, w: number,
  label: string, value: string, valueColor: string, isAlt: boolean,
): number {
  const ROW_H = 26;
  if (isAlt) {
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(x + 3, cy, w - 3, ROW_H);
  }
  const mid = cy + ROW_H / 2;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 10, mid);
  ctx.fillStyle = valueColor;
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(value, x + w - 8, mid);
  return cy + ROW_H;
}

/**
 * Mini-bar row: label | rounded bar indicator | bold value.
 *
 * fraction ∈ [0,1] — controls how much of DP_BAR_MAX_W is filled.
 * Numbers remain visible right-aligned; the bar is a visual indicator only.
 * Minimum fill = one rounded cap (DP_BAR_H px) when fraction > 0.
 */
function dpMiniBarRow(
  ctx: CanvasRenderingContext2D,
  x: number, cy: number, w: number,
  label: string, value: string,
  fraction: number,
  barColor: string, valueColor: string,
  isAlt: boolean,
): number {
  const ROW_H = 26;
  if (isAlt) {
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(x + 3, cy, w - 3, ROW_H);
  }
  const mid  = cy + ROW_H / 2;
  const barX = x + DP_BAR_OFFSET;
  const barY = mid - DP_BAR_H / 2;
  const clampedFrac = Math.min(Math.max(fraction, 0), 1);
  const fillW = clampedFrac > 0
    ? Math.max(DP_BAR_H, Math.floor(clampedFrac * DP_BAR_MAX_W))
    : 0;

  ctx.save();

  // Label
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 10, mid);

  // Bar track
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  dpRoundedRect(ctx, barX, barY, DP_BAR_MAX_W, DP_BAR_H);
  ctx.fill();

  // Bar fill
  if (fillW >= DP_BAR_H) {
    ctx.fillStyle = barColor + "99";  // ~60% opacity
    dpRoundedRect(ctx, barX, barY, fillW, DP_BAR_H);
    ctx.fill();
  }

  // Value — right-aligned, bold
  ctx.fillStyle = valueColor;
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(value, x + w - 8, mid);

  ctx.restore();
  return cy + ROW_H;
}

/** Sub-section header row (height = 20). */
function dpSubHeader(
  ctx: CanvasRenderingContext2D,
  x: number, cy: number, w: number,
  label: string, accent: string,
): number {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(x + 3, cy, w - 3, 20);
  ctx.fillStyle = accent;
  ctx.fillRect(x + 3, cy, 2, 20);
  ctx.fillStyle = accent + "cc";
  ctx.font = "bold 10px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 12, cy + 10);
  ctx.restore();
  return cy + 20;
}

/**
 * Full-width two-team possession bar with rounded caps and percentage labels.
 * Returns the next y coordinate.
 */
function dpPossessionBar(
  ctx: CanvasRenderingContext2D,
  x: number, cy: number, w: number,
  forCount: number, oppCount: number,
  forLabel: string, oppLabel: string,
  forAccent: string, oppAccent: string,
): number {
  const BAR_H   = 14;
  const barX    = x + 12;
  const barW    = w - 24;
  const total   = forCount + oppCount;
  const forFrac = total > 0 ? forCount / total : 0.5;

  ctx.save();

  // Track — full bar width, rounded
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  dpRoundedRect(ctx, barX, cy, barW, BAR_H);
  ctx.fill();

  if (total > 0) {
    const forW = Math.max(BAR_H, Math.floor(barW * forFrac));
    const oppW = Math.max(BAR_H, barW - forW);

    // FOR segment (left, rounded pill)
    ctx.fillStyle = forAccent;
    dpRoundedRect(ctx, barX, cy, forW, BAR_H);
    ctx.fill();

    // OPP segment (right, rounded pill)
    if (forFrac < 1) {
      ctx.fillStyle = oppAccent;
      dpRoundedRect(ctx, barX + barW - oppW, cy, oppW, BAR_H);
      ctx.fill();
    }

    const labelY = cy + BAR_H + 12;
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = forAccent;
    ctx.textAlign = "left";
    ctx.fillText(`${forLabel}  ${Math.round(forFrac * 100)}%`, barX, labelY);
    ctx.fillStyle = oppAccent;
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round((1 - forFrac) * 100)}%  ${oppLabel}`, barX + barW, labelY);
  } else {
    ctx.fillStyle = "#64748b";
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("No data", barX + barW / 2, cy + BAR_H / 2);
  }

  ctx.restore();
  return cy + BAR_H + 24;
}

/**
 * Renders coaching prompts (filtered by category) as a compact intelligence list.
 * Each item: 3px accent bar | wrapped text (2 lines max) | evidence tag.
 */
function dpIntelligencePanel(
  ctx: CanvasRenderingContext2D,
  prompts: readonly ReviewPrompt[],
  category: ReviewPromptCategory,
  x: number, startY: number, w: number, maxY: number,
  accent: string,
): void {
  const filtered = prompts.filter((p) => p.category === category);

  if (filtered.length === 0) {
    ctx.save();
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("Insufficient data for coaching prompts.", x + w / 2, startY + (maxY - startY) / 2);
    ctx.restore();
    return;
  }

  let cy      = startY + 6;
  const MAX_W = w - 22;
  const LINE_H = 16;
  const ITEM_H = 52;

  ctx.save();

  for (const prompt of filtered) {
    if (cy + ITEM_H > maxY - 4) break;

    // Left accent bar
    ctx.fillStyle = accent + "cc";
    ctx.fillRect(x + 7, cy + 4, 3, ITEM_H - 12);

    // Word-wrap up to 2 lines
    ctx.font = "12px sans-serif";
    let line1 = "";
    let line2 = "";
    for (const word of prompt.text.split(" ")) {
      const test1 = line1 ? `${line1} ${word}` : word;
      if (!line2 && ctx.measureText(test1).width <= MAX_W) {
        line1 = test1;
      } else {
        const test2 = line2 ? `${line2} ${word}` : word;
        if (ctx.measureText(test2).width <= MAX_W) {
          line2 = test2;
        } else {
          let t = test2;
          while (t.length > 0 && ctx.measureText(`${t}…`).width > MAX_W) {
            t = t.slice(0, -1);
          }
          line2 = `${t}…`;
          break;
        }
      }
    }

    ctx.fillStyle = "#e2e8f0";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(line1, x + 15, cy + 4);

    if (line2) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.fillText(line2, x + 15, cy + 4 + LINE_H);
    }

    ctx.font = "9px sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(prompt.evidenceTag, x + w - 10, cy + ITEM_H - 6);

    cy += ITEM_H + 4;
  }

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Restart Visual Analysis — replaces the 2×2 kickout quad map page (p.5).
 *
 * LEFT pitch:   Kickouts won by FOR (our retained + their conceded to us).
 * RIGHT pitch:  Kickouts won by OPP (their retained + ours conceded to them).
 * Bottom strip: Summary | Chain Outcomes | Restart Intelligence.
 *
 * The Kickout Chain Analysis detail page (p.6) is retained as a companion.
 */
function makeRestartVisualPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Restart Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets (tactical beneficiary, same logic as selectPdfEvents) ────
  const forWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP"),
  );
  const oppWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "OPP") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "FOR"),
  );

  // ── Chain data (hoisted before pitches for callout bullets) ─────────────
  const ko            = analysis.kickouts;
  const outcomes      = ko.outcomes;
  const totalKO       = ko.won + ko.lost;
  const forWonTotal     = outcomes.filter((o) => o.winningSide === "FOR").length;
  const oppWonTotal     = outcomes.filter((o) => o.winningSide === "OPP").length;
  const forScoredFromKo = outcomes.filter((o) => o.winningSide === "FOR" && o.nextScore      !== null).length;
  const forShotFromKo   = outcomes.filter((o) => o.winningSide === "FOR" && o.nextShotOrScore !== null).length;
  const oppScoredFromKo = outcomes.filter((o) => o.winningSide === "OPP" && o.nextScore      !== null).length;
  const scoringOuts    = outcomes.filter((o) => o.secondsToScore !== null);
  const avgSecsToScore = scoringOuts.length > 0
    ? Math.round(scoringOuts.reduce((s, o) => s + (o.secondsToScore ?? 0), 0) / scoringOuts.length)
    : null;
  const h1Out = outcomes.filter((o) => o.kickoutEvent.period === "1H");
  const h2Out = outcomes.filter((o) => o.kickoutEvent.period === "2H");
  const h1For = h1Out.filter((o) => o.winningSide === "FOR").length;
  const h1Opp = h1Out.length - h1For;
  const h2For = h2Out.filter((o) => o.winningSide === "FOR").length;
  const h2Opp = h2Out.length - h2For;
  const forKoEvts = events.filter((e) => PDF_KIND_SETS.KICKOUTS.has(e.kind) && e.teamSide === "FOR");
  function countKoTag(tag: string): number {
    return forKoEvts.filter((e) => e.tags?.includes(tag)).length;
  }
  function pct(num: number, den: number): string {
    return den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
  }
  function withPct(num: number, den: number): string {
    return den > 0 ? `${num} (${pct(num, den)})` : String(num);
  }
  const prompts = deriveReviewPrompts(analysis, homeTeam, awayTeam);

  // ── Pitches ───────────────────────────────────────────────────────────────
  const CALLOUT_H = 120;
  const INNER_H   = DP_PITCH_H - CALLOUT_H;

  dpPitchTitle(ctx, DP_LEFT_X,  DP_PITCH_Y, DP_PITCH_W, `Our Restarts — ${homeTeam}`,        forWonEvts.length, "#22d3ee");
  dpPitchCallout(ctx, DP_LEFT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Won ${ko.won} of ${totalKO} restart${totalKO !== 1 ? "s" : ""}`,
    `${forScoredFromKo} led to score${forScoredFromKo !== 1 ? "s" : ""}`,
    `H1: ${h1For}–${h1Opp} / H2: ${h2For}–${h2Opp}`,
    "#22d3ee",
  );
  const leftInner  = renderPitch(ctx, sport, { x: DP_LEFT_X,  y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderEventMarkers(ctx, forWonEvts, leftInner);

  dpPitchTitle(ctx, DP_RIGHT_X, DP_PITCH_Y, DP_PITCH_W, `Opposition Restarts — ${awayTeam}`, oppWonEvts.length, "#fb7185");
  dpPitchCallout(ctx, DP_RIGHT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Opposition won ${ko.lost} of ${totalKO} restart${totalKO !== 1 ? "s" : ""}`,
    `${oppScoredFromKo} score${oppScoredFromKo !== 1 ? "s" : ""} conceded`,
    `H1: ${h1Opp}–${h1For} / H2: ${h2Opp}–${h2For}`,
    "#fb7185",
  );
  const rightInner = renderPitch(ctx, sport, { x: DP_RIGHT_X, y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderEventMarkers(ctx, oppWonEvts, rightInner);

  // ── Panel 1: Restart Summary ──────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P1_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Restart Summary", "#22d3ee");
    cy += 2;
    cy = dpPossessionBar(ctx, DP_P1_X, cy, DP_PANEL_W,
      ko.won, ko.lost,
      homeTeam.slice(0, 10), awayTeam.slice(0, 10),
      "#22d3ee", "#fb7185",
    );
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14)} Won`, `${ko.won} (${pct(ko.won, totalKO)})`,  totalKO > 0 ? ko.won  / totalKO : 0, "#22d3ee", "#22d3ee", false);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14)} Won`, `${ko.lost} (${pct(ko.lost, totalKO)})`, totalKO > 0 ? ko.lost / totalKO : 0, "#fb7185", "#fb7185", true);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P1_X, cy, DP_PANEL_W, "BY HALF", "#22d3ee");
    cy = dpStatRow(ctx, DP_P1_X, cy, DP_PANEL_W, "H1 — Won / Lost", `${h1For} / ${h1Opp}`, "#e2e8f0", false);
    cy = dpStatRow(ctx, DP_P1_X, cy, DP_PANEL_W, "H2 — Won / Lost", `${h2For} / ${h2Opp}`, "#e2e8f0", true);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P1_X, cy, DP_PANEL_W, "HOW WON", "#22d3ee");
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Clean Won", String(countKoTag("CLEAN")),    ko.won > 0 ? countKoTag("CLEAN")    / ko.won : 0, "#4ade80", "#4ade80", false);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Break Won", String(countKoTag("BREAK")),    ko.won > 0 ? countKoTag("BREAK")    / ko.won : 0, "#e2e8f0", "#e2e8f0", true);
        dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Foul Won",  String(countKoTag("FOUL_WON")), ko.won > 0 ? countKoTag("FOUL_WON") / ko.won : 0, "#fbbf24", "#fbbf24", false);
  }

  // ── Panel 2: Chain Outcomes ───────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P2_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Chain Outcomes", "#fbbf24");
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14).toUpperCase()} WON POSSESSION`, "#22d3ee");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → Score",        withPct(forScoredFromKo, forWonTotal), forWonTotal > 0 ? forScoredFromKo / forWonTotal : 0, "#4ade80", "#4ade80", false);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → Shot attempt", withPct(forShotFromKo,   forWonTotal), forWonTotal > 0 ? forShotFromKo   / forWonTotal : 0, "#7dd3fc", "#7dd3fc", true);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → No shot",      String(Math.max(0, forWonTotal - forShotFromKo)), forWonTotal > 0 ? Math.max(0, forWonTotal - forShotFromKo) / forWonTotal : 0, "#f97316", "#f97316", false);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14).toUpperCase()} WON POSSESSION`, "#fb7185");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Lost → Score against", withPct(oppScoredFromKo, oppWonTotal), oppWonTotal > 0 ? oppScoredFromKo / oppWonTotal : 0, "#f97316", "#f97316", false);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Lost → No score",      String(Math.max(0, oppWonTotal - oppScoredFromKo)), oppWonTotal > 0 ? Math.max(0, oppWonTotal - oppScoredFromKo) / oppWonTotal : 0, "#94a3b8", "#94a3b8", true);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, "OVERALL", "#fbbf24");
    cy = dpStatRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Retention %", pct(ko.won, totalKO), "#22d3ee", false);
    if (avgSecsToScore !== null) {
      dpStatRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Avg secs to score (won)", `${avgSecsToScore}s`, "#fbbf24", true);
    }
  }

  // ── Panel 3: Restart Intelligence ─────────────────────────────────────────
  {
    const panelY = dpPanelStart(ctx, DP_P3_X, DP_STRIP_Y, DP_P3_W, DP_STRIP_H, "Restart Intelligence", "#14b8a6");
    dpIntelligencePanel(ctx, prompts, "KICKOUT", DP_P3_X, panelY, DP_P3_W, DP_STRIP_Y + DP_STRIP_H - 8, "#22d3ee");
  }

  drawEventCountFooter(ctx, forWonEvts.length + oppWonEvts.length);
  return canvas;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turnover Visual Analysis — replaces the 2×2 turnover quad map page (p.7).
 *
 * LEFT pitch:   Turnovers gained by FOR (we won or they lost).
 * RIGHT pitch:  Turnovers lost by FOR (we lost or they won).
 * Bottom strip: Summary | Consequences | Turnover Intelligence.
 *
 * The Turnover Punishment Analysis detail page (p.8) is retained as a companion.
 */
function makeTurnoverVisualPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Turnover Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const wonEvts  = events.filter(
    (e) => (e.kind === "TURNOVER_WON"  && e.teamSide === "FOR") ||
           (e.kind === "TURNOVER_LOST" && e.teamSide === "OPP"),
  );
  const lostEvts = events.filter(
    (e) => (e.kind === "TURNOVER_LOST" && e.teamSide === "FOR") ||
           (e.kind === "TURNOVER_WON"  && e.teamSide === "OPP"),
  );

  // ── Chain data (hoisted before pitches for callout bullets) ─────────────
  const outcomes = analysis.turnovers.outcomes;

  function actingSideTo(o: typeof outcomes[number]): "FOR" | "OPP" {
    if (o.direction === "WON") return o.turnoverEvent.teamSide;
    return o.turnoverEvent.teamSide === "FOR" ? "OPP" : "FOR";
  }

  const forAttacking  = outcomes.filter((o) => actingSideTo(o) === "FOR");
  const oppAttacking  = outcomes.filter((o) => actingSideTo(o) === "OPP");
  const forWonTotal   = forAttacking.length;
  const oppWonTotal   = oppAttacking.length;
  const forWonToScore = forAttacking.filter((o) => o.resultedInScore).length;
  const forWonToShot  = forAttacking.filter((o) => o.resultedInShot).length;
  const oppWonToScore = oppAttacking.filter((o) => o.resultedInScore).length;
  const oppWonToShot  = oppAttacking.filter((o) => o.resultedInShot).length;

  const netTO    = forWonTotal - oppWonTotal;
  const netColor = netTO > 0 ? "#4ade80" : netTO < 0 ? "#fb7185" : "#94a3b8";
  const netStr   = netTO > 0 ? `+${netTO}` : String(netTO);

  function pct(num: number, den: number): string {
    return den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
  }
  function withPct(num: number, den: number): string {
    return den > 0 ? `${num} (${pct(num, den)})` : String(num);
  }

  function countToTag(slice: typeof outcomes, ...tags: string[]): number {
    return slice.filter((o) => tags.some((t) => o.turnoverEvent.tags?.includes(t))).length;
  }
  const tagTackle  = countToTag(forAttacking, "TACKLE", "PRESS");
  const tagSwarm   = countToTag(forAttacking, "SWARM", "INTERCEPT");
  const tagUnforce = countToTag(forAttacking, "UNFORCED");
  const tagSlack   = countToTag(forAttacking, "SLACK_KICK_PASS", "SLACK_HAND_PASS");

  const forLostTotal      = outcomes.filter((o) => o.turnoverEvent.kind === "TURNOVER_LOST" && o.turnoverEvent.teamSide === "FOR").length;
  const forLostToOppScore = oppAttacking.filter((o) => o.turnoverEvent.teamSide === "FOR" && o.resultedInScore).length;
  const forLostToOppShot  = oppAttacking.filter((o) => o.turnoverEvent.teamSide === "FOR" && o.resultedInShot).length;

  const prompts = deriveReviewPrompts(analysis, homeTeam, awayTeam);

  // ── Pitches ───────────────────────────────────────────────────────────────
  const CALLOUT_H = 120;
  const INNER_H   = DP_PITCH_H - CALLOUT_H;

  dpPitchTitle(ctx, DP_LEFT_X,  DP_PITCH_Y, DP_PITCH_W, `Turnovers Won — ${homeTeam}`, wonEvts.length,  "#a78bfa");
  dpPitchCallout(ctx, DP_LEFT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Won ${forWonTotal} turnover${forWonTotal !== 1 ? "s" : ""}`,
    `${forWonToScore} led to score${forWonToScore !== 1 ? "s" : ""}`,
    `${forWonToShot} led to shots`,
    "#a78bfa",
  );
  const leftInner  = renderPitch(ctx, sport, { x: DP_LEFT_X,  y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderEventMarkers(ctx, wonEvts, leftInner);

  dpPitchTitle(ctx, DP_RIGHT_X, DP_PITCH_Y, DP_PITCH_W, `Turnovers Lost — ${homeTeam}`, lostEvts.length, "#f97316");
  dpPitchCallout(ctx, DP_RIGHT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Opposition won ${oppWonTotal} turnover${oppWonTotal !== 1 ? "s" : ""}`,
    `${oppWonToScore} score${oppWonToScore !== 1 ? "s" : ""} conceded`,
    `${oppWonToShot} shot${oppWonToShot !== 1 ? "s" : ""} against`,
    "#f97316",
  );
  const rightInner = renderPitch(ctx, sport, { x: DP_RIGHT_X, y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderEventMarkers(ctx, lostEvts, rightInner);

  // ── Panel 1: Turnover Summary ─────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P1_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Turnover Summary", "#a78bfa");
    cy += 2;
    cy = dpPossessionBar(ctx, DP_P1_X, cy, DP_PANEL_W,
      forWonTotal, oppWonTotal,
      homeTeam.slice(0, 10), awayTeam.slice(0, 10),
      "#a78bfa", "#fb7185",
    );
    const totalTO = forWonTotal + oppWonTotal;
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14)} Won`, String(forWonTotal), totalTO > 0 ? forWonTotal / totalTO : 0, "#a78bfa", "#a78bfa", false);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14)} Won`, String(oppWonTotal), totalTO > 0 ? oppWonTotal / totalTO : 0, "#fb7185", "#fb7185", true);
    cy = dpStatRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Net Turnover", netStr, netColor, false);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P1_X, cy, DP_PANEL_W, "HOW WON", "#a78bfa");
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Tackle / Press",    String(tagTackle),  forWonTotal > 0 ? tagTackle  / forWonTotal : 0, "#22d3ee", "#22d3ee", false);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Swarm / Intercept", String(tagSwarm),   forWonTotal > 0 ? tagSwarm   / forWonTotal : 0, "#22d3ee", "#22d3ee", true);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Unforced error",    String(tagUnforce), forWonTotal > 0 ? tagUnforce / forWonTotal : 0, "#fbbf24", "#fbbf24", false);
        dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Slack pass",        String(tagSlack),   forWonTotal > 0 ? tagSlack   / forWonTotal : 0, "#fbbf24", "#fbbf24", true);
  }

  // ── Panel 2: Consequences ─────────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P2_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Consequences", "#fbbf24");
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14).toUpperCase()} ATTACKED`, "#a78bfa");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → Score",        withPct(forWonToScore, forWonTotal), forWonTotal > 0 ? forWonToScore / forWonTotal : 0, "#4ade80", "#4ade80", false);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → Shot attempt", withPct(forWonToShot,  forWonTotal), forWonTotal > 0 ? forWonToShot  / forWonTotal : 0, "#7dd3fc", "#7dd3fc", true);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → No shot",      String(Math.max(0, forWonTotal - forWonToShot)), forWonTotal > 0 ? Math.max(0, forWonTotal - forWonToShot) / forWonTotal : 0, "#f97316", "#f97316", false);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, "DAMAGE CONCEDED", "#f97316");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Lost → Score against", withPct(forLostToOppScore, forLostTotal), forLostTotal > 0 ? forLostToOppScore / forLostTotal : 0, "#f97316", "#f97316", false);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Lost → Shot against",  withPct(forLostToOppShot,  forLostTotal), forLostTotal > 0 ? forLostToOppShot  / forLostTotal : 0, "#fbbf24", "#fbbf24", true);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14).toUpperCase()} ATTACKED`, "#fb7185");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → Score",        withPct(oppWonToScore, oppWonTotal), oppWonTotal > 0 ? oppWonToScore / oppWonTotal : 0, "#fb7185", "#fb7185", false);
        dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Won → Shot attempt", withPct(oppWonToShot,  oppWonTotal), oppWonTotal > 0 ? oppWonToShot  / oppWonTotal : 0, "#fbbf24", "#fbbf24", true);
  }

  // ── Panel 3: Turnover Intelligence ───────────────────────────────────────
  {
    const panelY = dpPanelStart(ctx, DP_P3_X, DP_STRIP_Y, DP_P3_W, DP_STRIP_H, "Turnover Intelligence", "#a78bfa");
    dpIntelligencePanel(ctx, prompts, "TURNOVER", DP_P3_X, panelY, DP_P3_W, DP_STRIP_Y + DP_STRIP_H - 8, "#a78bfa");
  }

  drawEventCountFooter(ctx, wonEvts.length + lostEvts.length);
  return canvas;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Free Kick Analysis — replaces the 2×2 free kick quad map page (p.17+N).
 *
 * LEFT pitch:   Free kick events benefiting FOR (all periods).
 * RIGHT pitch:  Free kick events benefiting OPP (all periods).
 * Bottom strip: Free Summary | Free Outcomes | Free Intelligence.
 *
 * No new data is calculated — all values use existing event filters.
 */
function makeFreeAnalysisPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Free Kick Analysis", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const forFreeEvts = events.filter(
    (e) => isFreeRelatedPdfEvent(e) && tacticalSide(e) === "FOR",
  );
  const oppFreeEvts = events.filter(
    (e) => isFreeRelatedPdfEvent(e) && tacticalSide(e) === "OPP",
  );

  // ── Derived stats (hoisted before pitches for callout bullets) ───────────
  const forEvts = events.filter((e) => e.teamSide === "FOR" && !e.id.includes("-instant-score-"));
  const oppEvts = events.filter((e) => e.teamSide === "OPP" && !e.id.includes("-instant-score-"));

  const forFreesWon     = countKinds(forEvts, "FREE_WON")      + countKinds(oppEvts, "FREE_CONCEDED");
  const oppFreesWon     = countKinds(oppEvts, "FREE_WON")      + countKinds(forEvts, "FREE_CONCEDED");
  const forFreeScored   = forEvts.filter((e) => isFreeScore(e)).length;
  const forFreeMissed   = forEvts.filter((e) => isFreeMiss(e)).length;
  const oppFreeScored   = oppEvts.filter((e) => isFreeScore(e)).length;
  const oppFreeMissed   = oppEvts.filter((e) => isFreeMiss(e)).length;

  const forFreeAttempts = forFreeScored + forFreeMissed;
  const oppFreeAttempts = oppFreeScored + oppFreeMissed;
  const totalScored     = forFreeScored + oppFreeScored;
  const totalAttempts   = forFreeAttempts + oppFreeAttempts;

  const netFrees = forFreesWon - oppFreesWon;
  const netColor = netFrees > 0 ? "#4ade80" : netFrees < 0 ? "#fb7185" : "#94a3b8";
  const netStr   = netFrees > 0 ? `+${netFrees}` : String(netFrees);

  function pct(num: number, den: number): string {
    return den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
  }

  const forConv = pct(forFreeScored, forFreeAttempts);
  const oppConv = pct(oppFreeScored, oppFreeAttempts);

  // Prompts: CHAIN category covers FREE_WON_TO_GOAL rule; fall back to GENERAL.
  const allPrompts   = deriveReviewPrompts(analysis, homeTeam, awayTeam);
  const chainPrompts = allPrompts.filter((p) => p.category === "CHAIN");
  const freePomptCat: ReviewPromptCategory = chainPrompts.length > 0 ? "CHAIN" : "GENERAL";

  // Scoring chains from free wins — FREE_WON_TO_GOAL chains already in ChainAnalysis
  const forFreeScoringChains = (analysis.byRule["FREE_WON_TO_GOAL"] ?? []).filter((c) => c.teamSide === "FOR").length;
  const oppFreeScoringChains = (analysis.byRule["FREE_WON_TO_GOAL"] ?? []).filter((c) => c.teamSide === "OPP").length;

  // ── Pitches ───────────────────────────────────────────────────────────────
  const CALLOUT_H = 120;
  const INNER_H   = DP_PITCH_H - CALLOUT_H;

  dpPitchTitle(ctx, DP_LEFT_X,  DP_PITCH_Y, DP_PITCH_W, `Our Frees — ${homeTeam}`,        forFreeEvts.length, "#818cf8");
  dpPitchCallout(ctx, DP_LEFT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Won ${forFreesWon} possession free${forFreesWon !== 1 ? "s" : ""}`,
    `${forFreeScoringChains} scoring chain${forFreeScoringChains !== 1 ? "s" : ""} from those frees`,
    forFreeAttempts > 0 ? `Placed balls: ${forFreeScored}/${forFreeAttempts} scored` : "No placed balls attempted",
    "#818cf8",
  );
  const leftInner  = renderPitch(ctx, sport, { x: DP_LEFT_X,  y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderEventMarkers(ctx, forFreeEvts, leftInner);

  dpPitchTitle(ctx, DP_RIGHT_X, DP_PITCH_Y, DP_PITCH_W, `Opposition Frees — ${awayTeam}`, oppFreeEvts.length, "#f472b6");
  dpPitchCallout(ctx, DP_RIGHT_X, DP_PITCH_Y + DP_TITLE_H, DP_PITCH_W, CALLOUT_H - DP_TITLE_H,
    `Opposition won ${oppFreesWon} possession free${oppFreesWon !== 1 ? "s" : ""}`,
    `${oppFreeScoringChains} scoring chain${oppFreeScoringChains !== 1 ? "s" : ""} from those frees`,
    oppFreeAttempts > 0 ? `Placed balls: ${oppFreeScored}/${oppFreeAttempts} scored` : "No placed balls attempted",
    "#f472b6",
  );
  const rightInner = renderPitch(ctx, sport, { x: DP_RIGHT_X, y: DP_PITCH_Y + CALLOUT_H, w: DP_PITCH_W, h: INNER_H });
  renderEventMarkers(ctx, oppFreeEvts, rightInner);

  // ── Panel 1: Free Summary ─────────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P1_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Free Summary", "#818cf8");
    cy += 2;
    cy = dpPossessionBar(ctx, DP_P1_X, cy, DP_PANEL_W,
      forFreesWon, oppFreesWon,
      homeTeam.slice(0, 10), awayTeam.slice(0, 10),
      "#818cf8", "#f472b6",
    );
    const totalFreesWon = forFreesWon + oppFreesWon;
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14)} Frees Won`, String(forFreesWon), totalFreesWon > 0 ? forFreesWon / totalFreesWon : 0, "#818cf8", "#818cf8", false);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14)} Frees Won`, String(oppFreesWon), totalFreesWon > 0 ? oppFreesWon / totalFreesWon : 0, "#f472b6", "#f472b6", true);
    cy = dpStatRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Advantage", netStr, netColor, false);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P1_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14).toUpperCase()} PLACED BALLS`, "#818cf8");
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Placed Scored", String(forFreeScored), forFreeAttempts > 0 ? forFreeScored / forFreeAttempts : 0, "#7dd3fc", "#7dd3fc", false);
    cy = dpMiniBarRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Placed Missed", String(forFreeMissed), forFreeAttempts > 0 ? forFreeMissed / forFreeAttempts : 0, "#ef4444", "#ef4444", true);
        dpStatRow(ctx, DP_P1_X, cy, DP_PANEL_W, "Conversion",   forConv, "#818cf8", false);
  }

  // ── Panel 2: Free Outcomes ────────────────────────────────────────────────
  {
    let cy = dpPanelStart(ctx, DP_P2_X, DP_STRIP_Y, DP_PANEL_W, DP_STRIP_H, "Free Outcomes", "#fbbf24");
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, "CONVERSION COMPARISON", "#fbbf24");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, `${homeTeam.slice(0, 14)} Conversion`, forConv, forFreeAttempts > 0 ? forFreeScored / forFreeAttempts : 0, "#818cf8", "#818cf8", false);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14)} Conversion`, oppConv, oppFreeAttempts > 0 ? oppFreeScored / oppFreeAttempts : 0, "#f472b6", "#f472b6", true);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, `${awayTeam.slice(0, 14).toUpperCase()} PLACED BALLS`, "#f472b6");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Placed Scored", String(oppFreeScored), oppFreeAttempts > 0 ? oppFreeScored / oppFreeAttempts : 0, "#f472b6", "#f472b6", false);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Placed Missed", String(oppFreeMissed), oppFreeAttempts > 0 ? oppFreeMissed / oppFreeAttempts : 0, "#ef4444", "#ef4444", true);
    cy = dpStatRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Conversion",  oppConv, "#f472b6", false);
    cy += 2;
    cy = dpSubHeader(ctx, DP_P2_X, cy, DP_PANEL_W, "ALL FREES COMBINED", "#94a3b8");
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Total scored", String(totalScored),                 totalAttempts > 0 ? totalScored                 / totalAttempts : 0, "#4ade80", "#4ade80", false);
    cy = dpMiniBarRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Total missed", String(totalAttempts - totalScored), totalAttempts > 0 ? (totalAttempts - totalScored) / totalAttempts : 0, "#94a3b8", "#94a3b8", true);
        dpStatRow(ctx, DP_P2_X, cy, DP_PANEL_W, "Overall conv.", pct(totalScored, totalAttempts), "#e2e8f0", false);
  }

  // ── Panel 3: Free Intelligence ────────────────────────────────────────────
  {
    const panelY = dpPanelStart(ctx, DP_P3_X, DP_STRIP_Y, DP_P3_W, DP_STRIP_H, "Free Intelligence", "#818cf8");
    dpIntelligencePanel(ctx, allPrompts, freePomptCat, DP_P3_X, panelY, DP_P3_W, DP_STRIP_Y + DP_STRIP_H - 8, "#818cf8");
  }

  drawEventCountFooter(ctx, forFreeEvts.length + oppFreeEvts.length);
  return canvas;
}

// ─── Quad pitch map page ─────────────────────────────────────────────────────

type QuadPanel = {
  title: string;
  events: readonly PdfExportEvent[];
  accentColor?: string;
};

/**
 * Renders four mini pitch maps in a 2×2 grid on a single canvas.
 * Each panel shows its own pitch rendering and event markers.
 * Used in the Analyst Review to consolidate 20 single-page raw maps into
 * 5 chapter-level comparison pages.
 */
function makeQuadPitchMapPage(
  sport: PitchSport,
  quads: readonly [QuadPanel, QuadPanel, QuadPanel, QuadPanel],
  pageTitle: string,
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
  drawPageHeader(ctx, pageTitle, `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  const HEADER_H = 80;
  const FOOTER_H = 38;
  const GUTTER   = 14;
  const TITLE_H  = 28;

  const gridTop = HEADER_H + 2;
  const gridH   = CANVAS_H - gridTop - FOOTER_H;
  const panelW  = Math.floor((CANVAS_W - GUTTER * 3) / 2);
  const panelH  = Math.floor((gridH - GUTTER * 3) / 2);

  const positions: ReadonlyArray<{ col: 0 | 1; row: 0 | 1 }> = [
    { col: 0, row: 0 }, { col: 1, row: 0 },
    { col: 0, row: 1 }, { col: 1, row: 1 },
  ];

  let totalEvents = 0;

  quads.forEach((quad, i) => {
    const { col, row } = positions[i];
    const px = GUTTER + col * (panelW + GUTTER);
    const py = gridTop + GUTTER + row * (panelH + GUTTER);
    const accent = quad.accentColor ?? "#94a3b8";

    totalEvents += quad.events.length;

    // Panel background
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(px, py, panelW, panelH);

    // Title strip
    ctx.fillStyle = accent + "22";
    ctx.fillRect(px, py, panelW, TITLE_H);

    ctx.save();
    ctx.textBaseline = "middle";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.fillText(quad.title.toUpperCase(), px + 10, py + TITLE_H / 2);
    ctx.fillStyle = "#64748b";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${quad.events.length}`, px + panelW - 8, py + TITLE_H / 2);
    ctx.restore();

    // Pitch area below the title strip
    const pitchArea: PitchArea = {
      x: px,
      y: py + TITLE_H,
      w: panelW,
      h: panelH - TITLE_H,
    };

    const inner = renderPitch(ctx, sport, pitchArea);
    renderEventMarkers(ctx, quad.events, inner);
  });

  drawEventCountFooter(ctx, totalEvents);
  return canvas;
}


// Retained PDF page builders/helpers referenced here so TypeScript does not prune
// dormant report sections while preserving current export page order and behaviour.
void stampChapterLabel;
void makeHtPressureDamageMapPage;
void makeHtKickoutVisionPage;
void makeHtAttackShotVisionPage;
void makeHtGameFlowPage;
void makeHtGameFlowFactorsPage;
void makeOurRestartPlatformPage;
void makeOppRestartPlatformPage;

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
    homeSquadPlayers,
    awaySquadPlayers,
  } = input;

  // 19 fixed pages + player pages.
  // Fixed: p.1 Match Summary, p.2 Match Swing, p.3 Tactical Intelligence,
  //        p.4 Segment Control, p.5–6 Kickout chapter, p.7–8 Turnover chapter,
  // Page count — three analytical chapters + one intro page + three chapter dividers.
  // Fixed pages (excluding player pages):
  //   p.1  Match Summary (cover)
  //   p.2  Understanding PáircVision Analytics (intro)
  //   p.3  Chapter 1 divider — Statistics
  //   p.4  Match Swing Timeline
  //   p.5  Segment Control
  //   p.6…5+N  Player Breakdown (N = playerPageCount)
  //   p.6+N  Shot Pitch Maps
  //   p.7+N  Shot & Scoring Efficiency
  //   p.8+N  Zone Analysis
  //   p.9+N  1H Pitch Overview
  //   p.10+N  2H Pitch Overview
  //   p.11+N  Opposition Snapshot
  //   p.12+N  Chapter 2 divider — Possession Intelligence
  //   p.13+N  Restart Analysis
  //   p.14+N  Turnover Analysis
  //   p.15+N  Free Kick Analysis
  //   p.16+N  Intelligence Summary     (mixed — POSSESSION primary)
  //   p.17+N  Tactical Review Guide    (mixed)
  //   p.18+N  Chapter 3 divider — Chain Intelligence
  //   p.19+N  Chain Intelligence
  //   p.20+N  Restart Chain Analysis
  //   p.21+N  Turnover Chain Analysis
  //   p.22+N  Scoring Momentum
  //   Total fixed: 22 + N
  const playerPageCount = calcPlayerPageCount(events, homeSquadPlayers, awaySquadPlayers);
  const TOTAL_PAGES = 22 + playerPageCount;

  // Chain analysis — computed once; shared by all chain page builders.
  const chainAnalysis = selectChainAnalysis(events);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297;
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

  function fallbackCanvas(label: string): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = CANVAS_W; c.height = CANVAS_H;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#94a3b8"; ctx.font = "24px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(`${label} — could not be rendered`, CANVAS_W / 2, CANVAS_H / 2);
    }
    return c;
  }

  // ── p.1 — Match Summary (cover) ─────────────────────────────────────────────

  const p1 = makeSummaryPage(events, homeTeamName, awayTeamName, venueName, TOTAL_PAGES);
  addCanvasPage(p1, false, "Match Summary");

  // ── p.2 — Understanding PáircVision Analytics ────────────────────────────────

  addCanvasPage(
    makeHowToReadPage(homeTeamName, awayTeamName, 2, TOTAL_PAGES),
    true, "How to Read This Report",
  );

  // ════════════════════════════════════════════════════════════════════════════
  // CHAPTER 1 — WHAT HAPPENED?   (Statistics — blue #60a5fa)
  // ════════════════════════════════════════════════════════════════════════════

  addCanvasPage(
    makeChapterDividerPage(
      1, "WHAT HAPPENED?", "Statistics",
      "Raw match events exactly as they were recorded.",
      "What happened during the game?",
      ["Match Swing Timeline", "Game Segments", "Player Breakdown",
       "Shot Pitch Maps", "Shot & Scoring Efficiency",
       "Zone Analysis", "1H & 2H Pitch Overviews", "Opposition Snapshot"],
      "#60a5fa", 3, TOTAL_PAGES,
    ),
    true, "Chapter 1 — Statistics",
  );

  // p.4 — Match Swing Timeline
  try {
    const c = makeMatchSwingTimelinePage(events, chainAnalysis, homeTeamName, awayTeamName, 4, TOTAL_PAGES);
    stampLayerBadge(c, "STATISTICS");
    addCanvasPage(c, true, "Match Swing Timeline");
  } catch (err) {
    console.error("Match Swing Timeline page generation failed", err);
    addCanvasPage(fallbackCanvas("Match Swing Timeline"), true, "Match Swing Timeline");
  }

  // p.5 — Segment Control
  const p_seg = makeSegmentsPage(events, homeTeamName, awayTeamName, 5, TOTAL_PAGES);
  stampLayerBadge(p_seg, "STATISTICS");
  addCanvasPage(p_seg, true, "Segment Control");

  // p.6…5+N — Player Breakdown
  const playerCanvases = makePlayerPages(events, homeTeamName, awayTeamName, 6, TOTAL_PAGES, homeSquadPlayers, awaySquadPlayers);
  playerCanvases.forEach((c) => { stampLayerBadge(c, "STATISTICS"); addCanvasPage(c, true); });

  // p.6+N — Shot Pitch Maps
  const p_shotBase = 6 + playerPageCount;
  try {
    const c = makeQuadPitchMapPage(
      sport,
      [
        { title: `1H — ${homeTeamName} Shots`, events: selectPdfEvents(events, "H1", "FOR", "SHOTS"), accentColor: "#34d399" },
        { title: `1H — ${awayTeamName} Shots`, events: selectPdfEvents(events, "H1", "OPP", "SHOTS"), accentColor: "#fb923c" },
        { title: `2H — ${homeTeamName} Shots`, events: selectPdfEvents(events, "H2", "FOR", "SHOTS"), accentColor: "#34d399" },
        { title: `2H — ${awayTeamName} Shots`, events: selectPdfEvents(events, "H2", "OPP", "SHOTS"), accentColor: "#fb923c" },
      ],
      "Shot Pitch Maps",
      homeTeamName, awayTeamName, p_shotBase, TOTAL_PAGES,
    );
    stampLayerBadge(c, "STATISTICS");
    addCanvasPage(c, true, "Shot Pitch Maps");
  } catch (err) {
    console.error("Shot Pitch Maps page generation failed", err);
    addCanvasPage(fallbackCanvas("Shot Pitch Maps"), true, "Shot Pitch Maps");
  }

  // p.7+N — Shot & Scoring Efficiency
  try {
    const c = makeShotEfficiencyPage(events, homeTeamName, awayTeamName, p_shotBase + 1, TOTAL_PAGES);
    stampLayerBadge(c, "STATISTICS");
    addCanvasPage(c, true, "Shot & Scoring Efficiency");
  } catch (err) {
    console.error("Shot & Scoring Efficiency page generation failed", err);
    addCanvasPage(fallbackCanvas("Shot & Scoring Efficiency"), true, "Shot & Scoring Efficiency");
  }

  // p.8+N — Zone Analysis
  try {
    const c = makeZoneAnalysisPage(events, sport, homeTeamName, awayTeamName, p_shotBase + 2, TOTAL_PAGES);
    stampLayerBadge(c, "STATISTICS");
    addCanvasPage(c, true, "Zone Analysis");
  } catch (err) {
    console.error("Zone Analysis page generation failed", err);
    addCanvasPage(fallbackCanvas("Zone Analysis"), true, "Zone Analysis");
  }

  // p.9+N — 1H Pitch Overview
  const p_arch = p_shotBase + 3;
  try {
    const c = makeQuadPitchMapPage(
      sport,
      [
        { title: "1H — All Events",            events: selectPdfEvents(events, "H1", "ALL", "ALL"),    accentColor: "#94a3b8" },
        { title: "1H — Scores",                events: selectPdfEvents(events, "H1", "ALL", "SCORES"), accentColor: "#4ade80" },
        { title: `1H — ${homeTeamName} Shots`, events: selectPdfEvents(events, "H1", "FOR", "SHOTS"), accentColor: "#7dd3fc" },
        { title: `1H — ${awayTeamName} Shots`, events: selectPdfEvents(events, "H1", "OPP", "SHOTS"), accentColor: "#fb7185" },
      ],
      "1H Pitch Overview",
      homeTeamName, awayTeamName, p_arch, TOTAL_PAGES,
    );
    stampLayerBadge(c, "STATISTICS");
    addCanvasPage(c, true, "1H Pitch Overview");
  } catch (err) {
    console.error("1H Pitch Overview page generation failed", err);
    addCanvasPage(fallbackCanvas("1H Pitch Overview"), true, "1H Pitch Overview");
  }

  // p.10+N — 2H Pitch Overview
  try {
    const c = makeQuadPitchMapPage(
      sport,
      [
        { title: "2H — All Events",            events: selectPdfEvents(events, "H2", "ALL", "ALL"),    accentColor: "#94a3b8" },
        { title: "2H — Scores",                events: selectPdfEvents(events, "H2", "ALL", "SCORES"), accentColor: "#4ade80" },
        { title: `2H — ${homeTeamName} Shots`, events: selectPdfEvents(events, "H2", "FOR", "SHOTS"), accentColor: "#7dd3fc" },
        { title: `2H — ${awayTeamName} Shots`, events: selectPdfEvents(events, "H2", "OPP", "SHOTS"), accentColor: "#fb7185" },
      ],
      "2H Pitch Overview",
      homeTeamName, awayTeamName, p_arch + 1, TOTAL_PAGES,
    );
    stampLayerBadge(c, "STATISTICS");
    addCanvasPage(c, true, "2H Pitch Overview");
  } catch (err) {
    console.error("2H Pitch Overview page generation failed", err);
    addCanvasPage(fallbackCanvas("2H Pitch Overview"), true, "2H Pitch Overview");
  }

  // p.11+N — Opposition Snapshot
  try {
    const c = makeOppositionSnapshotPage(events, chainAnalysis, homeTeamName, awayTeamName, p_arch + 2, TOTAL_PAGES);
    stampLayerBadge(c, "STATISTICS");
    addCanvasPage(c, true, "Opposition Snapshot");
  } catch (err) {
    console.error("Opposition Snapshot page generation failed", err);
    addCanvasPage(fallbackCanvas("Opposition Snapshot"), true, "Opposition Snapshot");
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CHAPTER 2 — WHAT HAPPENED FROM OUR POSSESSIONS?
  //             (Possession Intelligence — emerald #34d399)
  // ════════════════════════════════════════════════════════════════════════════

  const p_ch2div = p_arch + 3;  // p.12+N
  addCanvasPage(
    makeChapterDividerPage(
      2, "WHAT HAPPENED FROM OUR POSSESSIONS?", "Possession Intelligence",
      "Every restart, turnover and free is followed to its immediate outcome.",
      "What happened every time possession changed?",
      ["Restart Analysis", "Turnover Analysis", "Free Kick Analysis",
       "Intelligence Summary", "Tactical Review Guide"],
      "#34d399", p_ch2div, TOTAL_PAGES,
    ),
    true, "Chapter 2 — Possession Intelligence",
  );

  // p.13+N — Restart Analysis
  try {
    const c = makeRestartVisualPage(events, sport, chainAnalysis, homeTeamName, awayTeamName, p_ch2div + 1, TOTAL_PAGES);
    stampLayerBadge(c, "POSSESSION");
    addCanvasPage(c, true, "Restart Analysis");
  } catch (err) {
    console.error("Restart Analysis page generation failed", err);
    addCanvasPage(fallbackCanvas("Restart Analysis"), true, "Restart Analysis");
  }

  // p.14+N — Turnover Analysis
  try {
    const c = makeTurnoverVisualPage(events, sport, chainAnalysis, homeTeamName, awayTeamName, p_ch2div + 2, TOTAL_PAGES);
    stampLayerBadge(c, "POSSESSION");
    addCanvasPage(c, true, "Turnover Analysis");
  } catch (err) {
    console.error("Turnover Analysis page generation failed", err);
    addCanvasPage(fallbackCanvas("Turnover Analysis"), true, "Turnover Analysis");
  }

  // p.15+N — Free Kick Analysis
  try {
    const c = makeFreeAnalysisPage(events, sport, chainAnalysis, homeTeamName, awayTeamName, p_ch2div + 3, TOTAL_PAGES);
    stampLayerBadge(c, "POSSESSION");
    addCanvasPage(c, true, "Free Kick Analysis");
  } catch (err) {
    console.error("Free Kick Analysis page generation failed", err);
    addCanvasPage(fallbackCanvas("Free Kick Analysis"), true, "Free Kick Analysis");
  }

  // p.16+N — Intelligence Summary (mixed — Possession primary, Chain context)
  try {
    const c = makeTacticalIntelligencePage(chainAnalysis, homeTeamName, awayTeamName, p_ch2div + 4, TOTAL_PAGES);
    stampLayerBadge(c, "MIXED");
    addCanvasPage(c, true, "Intelligence Summary");
  } catch (err) {
    console.error("Intelligence Summary page generation failed", err);
    addCanvasPage(fallbackCanvas("Intelligence Summary"), true, "Intelligence Summary");
  }

  // p.17+N — Tactical Review Guide (mixed)
  try {
    const c = makeTacticalReviewGuidePage(chainAnalysis, homeTeamName, awayTeamName, p_ch2div + 5, TOTAL_PAGES);
    stampLayerBadge(c, "MIXED");
    addCanvasPage(c, true, "Tactical Review Guide");
  } catch (err) {
    console.error("Tactical Review Guide page generation failed", err);
    addCanvasPage(fallbackCanvas("Tactical Review Guide"), true, "Tactical Review Guide");
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CHAPTER 3 — WHY DID THOSE ATTACKS BECOME SCORES?
  //             (Chain Intelligence — violet #818cf8)
  // ════════════════════════════════════════════════════════════════════════════

  const p_ch3div = p_ch2div + 6;  // p.18+N
  addCanvasPage(
    makeChapterDividerPage(
      3, "WHY DID THOSE ATTACKS BECOME SCORES?", "Chain Intelligence",
      "Complete attacking sequences showing how pressure became scores.",
      "Why did those attacks actually become scores?",
      ["Chain Intelligence", "Restart Chain Analysis",
       "Turnover Chain Analysis", "Scoring Momentum"],
      "#818cf8", p_ch3div, TOTAL_PAGES,
    ),
    true, "Chapter 3 — Chain Intelligence",
  );

  // p.19+N — Chain Intelligence
  try {
    const c = makeChainSummaryPage(chainAnalysis, homeTeamName, awayTeamName, p_ch3div + 1, TOTAL_PAGES);
    stampLayerBadge(c, "CHAIN");
    addCanvasPage(c, true, "Chain Intelligence");
  } catch (err) {
    console.error("Chain Intelligence page generation failed", err);
    addCanvasPage(fallbackCanvas("Chain Intelligence"), true, "Chain Intelligence");
  }

  // p.20+N — Restart Chain Analysis
  try {
    const c = makeKickoutChainPage(chainAnalysis, homeTeamName, awayTeamName, p_ch3div + 2, TOTAL_PAGES);
    stampLayerBadge(c, "CHAIN");
    addCanvasPage(c, true, "Restart Chain Analysis");
  } catch (err) {
    console.error("Restart Chain Analysis page generation failed", err);
    addCanvasPage(fallbackCanvas("Restart Chain Analysis"), true, "Restart Chain Analysis");
  }

  // p.21+N — Turnover Chain Analysis
  try {
    const c = makeTurnoverPunishmentPage(chainAnalysis, homeTeamName, awayTeamName, p_ch3div + 3, TOTAL_PAGES);
    stampLayerBadge(c, "CHAIN");
    addCanvasPage(c, true, "Turnover Chain Analysis");
  } catch (err) {
    console.error("Turnover Chain Analysis page generation failed", err);
    addCanvasPage(fallbackCanvas("Turnover Chain Analysis"), true, "Turnover Chain Analysis");
  }

  // p.22+N — Scoring Momentum
  try {
    const c = makeMomentumRunsPage(chainAnalysis, homeTeamName, awayTeamName, p_ch3div + 4, TOTAL_PAGES);
    stampLayerBadge(c, "CHAIN");
    addCanvasPage(c, true, "Scoring Momentum");
  } catch (err) {
    console.error("Scoring Momentum page generation failed", err);
    addCanvasPage(fallbackCanvas("Scoring Momentum"), true, "Scoring Momentum");
  }

  // Download
  const safeName = (s: string) => s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const filename  = `${safeName(homeTeamName)}_v_${safeName(awayTeamName)}_review.pdf`;
  pdf.save(filename);
}

// ─── HT Vision Page Builders ──────────────────────────────────────────────────
//
// Four canvas builders for the 5-page VISION FIRST halftime snapshot.
// Events are pre-filtered to period "1H" by exportSnapshotPdf before any
// builder is called — no individual builder changes are required.
//
// Shared pitch geometry (120 px callout strip reserved at the bottom):
//   HT_PITCH_AREA = { x: 24, y: 80, w: 1728, h: 842 }
//   HT_STRIP_TOP  = 932    HT_STRIP_H = 138
//
// Zone fill rendering order for pitch pages:
//   1. fillDarkBg
//   2. renderPitch(ctx, sport, HT_PITCH_AREA) → inner
//   3. ctx.fillRect(zone pixel bounds)    — semi-transparent colour overlays
//   4. renderEventMarkers(ctx, events, inner) — event dots on top
//   5. zone badge pills                   — count labels at zone centres
//   6. bottom callout strip               — 2–3 tactical facts

const HT_PITCH_AREA: PitchArea = {
  x: 24,
  y: 80,
  w: CANVAS_W - 24 - 168,       // 1728 — right 168 px reserved for legend
  h: CANVAS_H - 80 - 38 - 152,  // 810  — 152 px reserved for bottom callout strip
};
const HT_STRIP_TOP = HT_PITCH_AREA.y + HT_PITCH_AREA.h + 10; // 900
const HT_STRIP_H   = CANVAS_H - HT_STRIP_TOP - 10;            // 170

// Zone engine type-bridge helpers.
// PdfExportEvent.x / .y are typed as number | null | undefined, but the zone
// engine's ZoneCoordinateEvent expects x?: number (no null). At runtime the zone
// engine uses nx/ny (0–1 normalised) for zone assignment — x/y are never read —
// so null vs undefined is inconsequential. The casts below silence the mismatch
// without touching the zone engine or PdfExportEvent schema.
function pdfZoneCounts(evts: readonly PdfExportEvent[]) {
  return getZoneCounts(evts as unknown as Parameters<typeof getZoneCounts>[0]);
}
function pdfZoneHotspots(evts: readonly PdfExportEvent[]) {
  return getZoneHotspots(evts as unknown as Parameters<typeof getZoneHotspots>[0]);
}

/**
 * Maps a zone's normalised bounds (0–100 domain) to canvas pixel coordinates
 * within `inner` (the inner pitch rectangle returned by renderPitch).
 */
function zonePixelRect(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  inner: InnerPitch,
): { x: number; y: number; w: number; h: number } {
  return {
    x: inner.x + (bounds.xMin / 100) * inner.w,
    y: inner.y + (bounds.yMin / 100) * inner.h,
    w: ((bounds.xMax - bounds.xMin) / 100) * inner.w,
    h: ((bounds.yMax - bounds.yMin) / 100) * inner.h,
  };
}

/** High-contrast event marker colours for HT Vision pages. Sideline-optimised palette. */
const HT_MARKER_COLORS: Partial<Record<MatchEventKind, string>> = {
  GOAL:                 "#16a34a",   // dark green circle — largest marker (×1.38)
  POINT:                "#4ade80",   // light green circle
  TWO_POINTER:          "#fbbf24",   // gold circle
  FORTY_FIVE_TWO_POINT: "#fbbf24",   // gold circle (same as 2pt)
  FREE_SCORED:          "#4ade80",   // light green (score = point)
  // WIDE / FREE_MISSED / KICKOUT_CONCEDED → drawn as ✕, handled separately
  KICKOUT_WON:          "#22d3ee",   // cyan
  TURNOVER_WON:         "#a78bfa",   // purple
  TURNOVER_LOST:        "#f97316",   // orange
  FREE_WON:             "#818cf8",   // indigo
  FREE_CONCEDED:        "#f472b6",   // pink
};

/**
 * High-contrast, symbol-rich event marker renderer for HT Vision pages only.
 * Replaces generic renderEventMarkers() — never called by the full-report path.
 *
 * Visual language (coach reads at arm's length in 3 seconds, outdoors):
 *   SCORE (GOAL, POINT, FREE_SCORED…) — filled coloured circle; GOAL is 38% larger
 *   WIDE / FREE_MISSED                — red ✕              (possession wasted)
 *   KICKOUT_CONCEDED                  — pink ✕             (restart territory lost)
 *   SHOT + BLOCK_SAVE tag             — grey hollow ring    (keeper stopped it)
 *   SHOT + SHORT tag                  — grey ↓             (possession ceded short)
 *   SHOT (other)                      — grey filled circle  (neutral / blocked attempt)
 *   KICKOUT_WON / TURNOVER… / etc.   — filled coloured circle
 *
 * Every marker has a dark halo drawn first for pitch-line separation.
 * Marker radius: max(9, inner.w × 0.007) — slightly larger than generic (0.006).
 */
function renderHtMarkers(
  ctx: CanvasRenderingContext2D,
  events: readonly PdfExportEvent[],
  inner: InnerPitch,
): void {
  const r = Math.max(9, inner.w * 0.007);

  for (const event of events) {
    const ex = typeof event.x === "number" ? event.x : event.nx;
    const ey = typeof event.y === "number" ? event.y : event.ny;
    if (ex == null || ey == null || !isFinite(ex) || !isFinite(ey)) continue;

    const cx   = inner.x + ex * inner.w;
    const cy   = inner.y + ey * inner.h;
    const kind = event.kind;
    const tags = event.tags ?? [];

    ctx.save();

    if (kind === "WIDE" || kind === "FREE_MISSED" || kind === "KICKOUT_CONCEDED") {
      // ✕ marker: red for WIDE/FREE_MISSED (miss = waste), pink for KICKOUT_CONCEDED (restart lost)
      const color = kind === "KICKOUT_CONCEDED" ? "#fb7185" : "#ef4444";
      const sz = r * 0.90;

      // Dark halo first (separates X from pitch lines)
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth   = Math.max(6.5, r * 0.75);
      ctx.lineCap     = "round";
      ctx.beginPath(); ctx.moveTo(cx - sz, cy - sz); ctx.lineTo(cx + sz, cy + sz); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + sz, cy - sz); ctx.lineTo(cx - sz, cy + sz); ctx.stroke();
      ctx.restore();

      // Coloured ✕ on top
      ctx.strokeStyle = color;
      ctx.lineWidth   = Math.max(3.0, r * 0.38);
      ctx.lineCap     = "round";
      ctx.beginPath(); ctx.moveTo(cx - sz, cy - sz); ctx.lineTo(cx + sz, cy + sz); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + sz, cy - sz); ctx.lineTo(cx - sz, cy + sz); ctx.stroke();

    } else if (kind === "SHOT" && tags.includes("BLOCK_SAVE")) {
      // Grey hollow ring — keeper save
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
      ctx.fillStyle = "#94a3b8"; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth   = Math.max(2.5, r * 0.28);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.33, 0, Math.PI * 2);
      ctx.fillStyle = "#e2e8f0"; ctx.fill();

    } else if (kind === "SHOT" && tags.includes("SHORT")) {
      // ↓ grey symbol — possession ceded short of target
      const fontSize = Math.round(r * 2.4);
      ctx.font         = `bold ${fontSize}px sans-serif`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle   = "#000000";
      ctx.fillText("↓", cx + 1.5, cy + 1.5);
      ctx.restore();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("↓", cx, cy);

    } else {
      // Filled coloured circle: GOAL (larger), POINT, SHOT/other, KICKOUT_WON, TURNOVER, etc.
      const fill    = HT_MARKER_COLORS[kind] ?? (kind === "SHOT" ? "#94a3b8" : "#ffffff");
      const markerR = kind === "GOAL" ? r * 1.38 : r;
      ctx.beginPath(); ctx.arc(cx, cy, markerR, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.70)";
      ctx.lineWidth   = kind === "GOAL" ? 2.2 : 1.8;
      ctx.stroke();
    }

    ctx.restore();
  }
}

/**
 * Renders the bottom tactical callout strip — shared across all HT vision pages.
 * Each fact gets its own panel with a coloured accent block at the left edge.
 *
 * Designed for outdoor, arm's-length readability:
 *   - 24 px bold white text on dark panel backgrounds
 *   - 8 px coloured accent block at each panel's left edge
 *   - 2 px separator line between pitch and strip (dark, not translucent)
 *   - No decorative dots — direct and unambiguous
 *
 * @param facts   Up to 3 tactical fact strings (longer strings are truncated with …).
 * @param colors  Accent block colour per fact (index-matched; fallback: slate).
 */
function drawHtCalloutStrip(
  ctx: CanvasRenderingContext2D,
  facts: readonly string[],
  colors: readonly string[],
): void {
  const factsToShow = facts.slice(0, 3);
  ctx.save();

  // Separator line — dark solid, clearly legible
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(24, HT_STRIP_TOP);
  ctx.lineTo(CANVAS_W - 24, HT_STRIP_TOP);
  ctx.stroke();

  if (factsToShow.length === 0) { ctx.restore(); return; }

  const STRIP_X    = 24;
  const STRIP_USEW = CANVAS_W - 48;                                               // 1872 px
  const GAP        = factsToShow.length > 1 ? 20 : 0;
  const panelW     = Math.floor((STRIP_USEW - GAP * (factsToShow.length - 1)) / factsToShow.length);
  const panelY     = HT_STRIP_TOP + 10;
  const panelH     = HT_STRIP_H - 18;
  const ACCENT_W   = 8;
  const TEXT_X_OFF = ACCENT_W + 14;

  factsToShow.forEach((fact, i) => {
    const px    = STRIP_X + i * (panelW + GAP);
    const color = colors[i] ?? "#94a3b8";

    // Panel background
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fillRect(px, panelY, panelW, panelH);

    // Left accent colour block
    ctx.fillStyle = color;
    ctx.fillRect(px, panelY, ACCENT_W, panelH);

    // Fact text — bold 24 px, full white, vertically centred
    ctx.font         = "bold 24px sans-serif";
    ctx.fillStyle    = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "left";
    const MAX_TW = panelW - TEXT_X_OFF - 12;
    let display  = fact;
    if (ctx.measureText(display).width > MAX_TW) {
      while (display.length > 0 && ctx.measureText(display + "…").width > MAX_TW) {
        display = display.slice(0, -1);
      }
      display += "…";
    }
    ctx.fillText(display, px + TEXT_X_OFF, panelY + panelH / 2);
  });

  ctx.restore();
}

// ─── Tactical Threat Engine — Phase 1 helpers ─────────────────────────────────
//
// Four shared drawing primitives used by all five pitch-map builders.
// All functions take an explicit `ctx` parameter — no closures — so the
// TypeScript build-time analyser sees a non-null CanvasRenderingContext2D.
//
// Threat formula (per zone):
//   score = (3 × primary) + (2 × secondary) − mitigating
//   CRITICAL ≥ 8  / HIGH ≥ 5  / ELEVATED ≥ 3  / NONE < 3
//
// Product voice: SHOW the threat. LABEL the pattern. STOP.
// No prescriptive coaching advice. Observational truth only.

/**
 * Compute a raw threat score for a pitch zone.
 *   primary    — highest-weight danger signal (3×): OPP scores, OPP kickout wins
 *   secondary  — medium-weight danger signal  (2×): FOR losses, FOR wides
 *   mitigating — FOR success in same zone    (1×): reduces raw score
 */
function computeZoneThreatScore(
  primary: number,
  secondary: number,
  mitigating: number,
): number {
  return Math.max(0, 3 * primary + 2 * secondary - mitigating);
}

type ThreatLevel = "CRITICAL" | "HIGH" | "ELEVATED" | "NONE";

function getThreatLevel(score: number): ThreatLevel {
  if (score >= 8) return "CRITICAL";
  if (score >= 5) return "HIGH";
  if (score >= 3) return "ELEVATED";
  return "NONE";
}

/**
 * Draw concentric dashed danger rings centred on a zone.
 *   CRITICAL → 3 rings (red)
 *   HIGH     → 2 rings (orange)
 *   ELEVATED → 1 ring  (yellow)
 * Semi-transparent (α=0.55) so existing fills and markers remain visible.
 */
function drawThreatRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  level: ThreatLevel,
): void {
  if (level === "NONE") return;
  const radii = level === "CRITICAL" ? [30, 48, 66] : level === "HIGH" ? [30, 48] : [30];
  const rgb   = level === "CRITICAL" ? "239,68,68" : level === "HIGH" ? "249,115,22" : "250,204,21";
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2.5;
  for (const r of radii) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb},0.55)`;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw a threat badge (pill chip) centred at (cx, cy).
 * Position cy ~50 px above zone centre so badge floats inside the zone.
 * label: short UPPER CASE, max ~16 chars for sideline legibility.
 */
function drawThreatBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  label: string,
  level: ThreatLevel,
): void {
  if (level === "NONE") return;
  ctx.save();
  ctx.font         = "bold 18px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  const tw = ctx.measureText(label).width;
  const pw = tw + 24;
  const ph = 30;
  const px = cx - pw / 2;
  const py = cy - ph / 2;
  const r  = 8;
  const rgb       = level === "CRITICAL" ? "239,68,68" : level === "HIGH" ? "249,115,22" : "250,204,21";
  const textColor = level === "ELEVATED" ? "#0d1117" : "#ffffff";
  // Rounded-rect pill
  ctx.fillStyle = `rgba(${rgb},0.88)`;
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + pw - r, py);
  ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
  ctx.lineTo(px + pw, py + ph - r);
  ctx.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph);
  ctx.lineTo(px + r, py + ph);
  ctx.quadraticCurveTo(px, py + ph, px, py + ph - r);
  ctx.lineTo(px, py + r);
  ctx.quadraticCurveTo(px, py, px + r, py);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

/**
 * Draw a pattern arrow from zone centre (x1,y1) to zone centre (x2,y2).
 * Called ONLY with explicit chain-analysis evidence (≥2 occurrences).
 * Quadratic curve prevents visual overlap with existing fills.
 *   TRAP        — red   — OPP won kickout here → OPP scored there
 *   ENTRY_SCORE — green — FOR entered here → FOR scored there
 *   ENTRY_FAIL  — amber — FOR entered here → FOR failed there
 */
function drawPatternArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind: "TRAP" | "ENTRY_SCORE" | "ENTRY_FAIL",
): void {
  const color = kind === "TRAP" ? "#ef4444" : kind === "ENTRY_SCORE" ? "#22c55e" : "#f59e0b";
  const dx    = x2 - x1;
  const dy    = y2 - y1;
  const len   = Math.sqrt(dx * dx + dy * dy) || 1;
  const mx    = (x1 + x2) / 2;
  const my    = (y1 + y2) / 2;
  // Perpendicular control-point offset → curved arc, not a straight overlay
  const cpx = mx - (dy / len) * 60;
  const cpy = my + (dx / len) * 60;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 4;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cpx, cpy, x2, y2);
  ctx.stroke();
  // Arrowhead: tangent direction at destination
  const tx = x2 - cpx;
  const ty = y2 - cpy;
  const tl = Math.sqrt(tx * tx + ty * ty) || 1;
  const ax = (tx / tl) * 14;
  const ay = (ty / tl) * 14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ax - ay * 0.4, y2 - ay + ax * 0.4);
  ctx.lineTo(x2 - ax + ay * 0.4, y2 - ay - ax * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1.0;
  ctx.restore();
}

/**
 * Draw an atmospheric directional pressure sweep inside a hot zone.
 *
 * These are NOT route arrows, NOT ball trajectories, NOT coaching lines.
 * They are TERRITORIAL PRESSURE CURRENTS — the repeated arrival direction
 * of tactical stress. A coach reads: "it keeps coming from here."
 *
 * Visual feel: tactical chalk-flow on dark board
 * NOT: cinematic fog / VFX glow / telestrator route
 *
 * 3-pass rendering — calibrated for phone/PDF/WhatsApp/outdoor readability:
 *   Pass 1 — soft edge  (α×0.30, w=7,   shadowBlur=4):  chalk-edge softening
 *   Pass 2 — core       (α×1.00, w=6,   shadowBlur=2):  clean chalk stroke
 *   Pass 3 — tip fade   (α×0.45, w=3,   shadowBlur=0):  directional terminus
 *
 * intensity: 0–1 (drives alpha 0.42–0.70 and edge strength)
 * kind:
 *   PRESSURE_INWARD   — red   (248,113,113) — OPP danger entering zone
 *   PRESSURE_EXIT     — teal  (52,211,153)  — FOR successful attacking release
 *   PRESSURE_COLLAPSE — amber (251,191,36)  — FOR attacks converging / dying in zone
 *
 * Colors match the existing zone fill palette for visual coherence.
 * Constraint: only called when zone threat level ≥ HIGH or pattern count ≥ 2.
 * Max 3 sweeps per page. Never across the full field — localised pressure only.
 */
function drawDirectionalPressureSweep(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  intensity: number,
  kind: "PRESSURE_INWARD" | "PRESSURE_EXIT" | "PRESSURE_COLLAPSE",
): void {
  // Chalk-flow alpha: 0.42 (min visible at 30% brightness) – 0.70 (readable, below arrow 0.82)
  const baseAlpha = 0.42 + Math.min(intensity, 1) * 0.28;  // 0.42 – 0.70

  // Colors match existing fill palette — sweeps read as directional extensions of zone fills
  const rgb =
    kind === "PRESSURE_EXIT"     ? "52,211,153"   :   // matches FOR score fill
    kind === "PRESSURE_COLLAPSE" ? "251,191,36"   :   // matches FOR loss fill
                                   "248,113,113"; // matches OPP score fill

  const dx  = x2 - x1;
  const dy  = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Gentle arc — 16% perpendicular (reduced from 18% for clearer directional read)
  const cpx = (x1 + x2) / 2 - (dy / len) * (len * 0.16);
  const cpy = (y1 + y2) / 2 + (dx / len) * (len * 0.16);

  ctx.save();
  ctx.lineCap  = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  // ── Pass 1: Soft chalk edge ─────────────────────────────────────────────────
  // Low blur (4px) gives a clean soft edge, not cinematic fog. Survives PDF/JPEG.
  ctx.globalAlpha = baseAlpha * 0.30;
  ctx.lineWidth   = 7;
  ctx.strokeStyle = `rgba(${rgb},1)`;
  ctx.shadowColor = `rgba(${rgb},0.40)`;
  ctx.shadowBlur  = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cpx, cpy, x2, y2);
  ctx.stroke();

  // ── Pass 2: Core chalk stroke ───────────────────────────────────────────────
  // 6px at full baseAlpha: clearly readable at phone scale without dominating.
  // shadowBlur=2 keeps edge crisp (no fog), just removes pixel aliasing.
  ctx.globalAlpha = baseAlpha;
  ctx.lineWidth   = 6;
  ctx.shadowColor = `rgba(${rgb},0.20)`;
  ctx.shadowBlur  = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cpx, cpy, x2, y2);
  ctx.stroke();

  // ── Pass 3: Directional tip terminus ───────────────────────────────────────
  // Slightly more visible (×0.45 vs old ×0.28) to clearly indicate direction.
  // Zero blur — clean terminus, reads as "direction ends here", not arrowhead.
  const tipLen = Math.min(len * 0.20, 38);
  const tx     = x2 - cpx;
  const ty     = y2 - cpy;
  const tl     = Math.sqrt(tx * tx + ty * ty) || 1;
  const tipX   = x2 - (tx / tl) * tipLen;
  const tipY   = y2 - (ty / tl) * tipLen;

  ctx.globalAlpha = baseAlpha * 0.45;
  ctx.lineWidth   = 3;
  ctx.shadowBlur  = 0;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // ── Cleanup ────────────────────────────────────────────────────────────────
  ctx.globalAlpha = 1.0;
  ctx.shadowBlur  = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();
}

// ─── Possession Chain Lite V1 helpers ─────────────────────────────────────────
//
// Read-only consumers of the pre-computed ChainAnalysis object.
// No new chain computation — all data flows from selectChainAnalysis(events).
//
// Product voice: observational only. No tactical advice. No false certainty.
// Low-event matches (ko.total < 3 AND to.total < 3) degrade cleanly to [].

/**
 * Derives 0–3 possession chain observation strings from existing ChainAnalysis.
 * Returns an empty array when neither kickouts nor turnovers meet the threshold
 * so pages with insufficient data render without spurious insights.
 */
function derivePossessionChainObservations(
  analysis: ChainAnalysis<PdfExportEvent>,
): string[] {
  const ko  = analysis.kickouts;
  const to  = analysis.turnovers;
  const obs: string[] = [];

  if (ko.total >= 3) {
    if (ko.wonToScore > 0) {
      const pct = Math.round(ko.wonToScorePercent);
      obs.push(
        `Kickout retention converted to score on ${ko.wonToScore} of ${ko.won} occasion${ko.wonToScore !== 1 ? "s" : ""} (${pct}%)`,
      );
    }
    if (ko.lostAllowedScore > 0) {
      const lostPct = Math.round(ko.lostAllowedScorePercent);
      obs.push(
        `Conceded restarts led to opposition score in ${lostPct}% of cases (${ko.lostAllowedScore} of ${ko.lost})`,
      );
    }
  }

  if (to.total >= 3 && to.wonToScore > 0) {
    const pct = Math.round(to.wonToScorePercent);
    obs.push(
      `Turnover possession produced direct scores ${to.wonToScore} time${to.wonToScore !== 1 ? "s" : ""} (${pct}% conversion)`,
    );
  }

  return obs.slice(0, 3);
}

/**
 * Renders a labelled possession chain observation block onto a canvas page.
 * Used on p.12 (Tactical Match Story) which has space in the narrative area.
 * Other pages inject possession chain observations into their existing strip/facts.
 * Renders nothing when observations array is empty.
 */
function drawPossessionChainBlock(
  ctx: CanvasRenderingContext2D,
  observations: string[],
  x: number,
  y: number,
  w: number,
): void {
  if (observations.length === 0) return;

  ctx.save();

  // Section label
  ctx.fillStyle    = "#64748b";
  ctx.font         = "bold 13px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign    = "left";
  ctx.fillText("POSSESSION CHAINS", x, y);

  // Separator line
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x + w, y + 6);
  ctx.stroke();

  // Observation rows: accent bar + text
  const LINE_H = 36;
  observations.forEach((obs, i) => {
    ctx.fillStyle = "rgba(96,165,250,0.55)";
    ctx.fillRect(x, y + 16 + i * LINE_H, 3, 24);
    ctx.font         = "20px sans-serif";
    ctx.fillStyle    = "#94a3b8";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(obs, x + 12, y + 34 + i * LINE_H);
  });

  ctx.restore();
}

// ─── HT Page 1: Pressure & Damage Map ────────────────────────────────────────

/**
 * Pressure & Damage Map — territorial scoring danger and possession loss zones.
 *
 * Zone fills:
 *   RED   — zones where the opposition scored FROM (scoring danger territory)
 *   AMBER — zones where the FOR team lost possession (pressure loss zones)
 * Fill intensity scales with zone count so the hottest zones are most visible.
 * Event dots are overlaid on top for spatial precision.
 * Bottom strip surfaces 2–3 territorial facts.
 *
 * Data: OPP SCORES events + FOR TURNOVER_LOST events (H1 only, pre-filtered).
 */
function makeHtPressureDamageMapPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Pressure & Damage", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const oppScoreEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind),
  );
  const forLossEvts = events.filter(
    (e) => e.teamSide === "FOR" && e.kind === "TURNOVER_LOST",
  );
  const mapEvts = [...oppScoreEvts, ...forLossEvts];

  // ── Pitch + zone colour overlays ──────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  const oppScoreCounts = pdfZoneCounts(oppScoreEvts);
  const forLossCounts  = pdfZoneCounts(forLossEvts);
  const maxOpp = oppScoreCounts.reduce((m, z) => Math.max(m, z.count), 0);
  const maxFor = forLossCounts.reduce((m, z) => Math.max(m, z.count), 0);

  // OPP scoring zone fills (red — increased opacity for sideline visibility)
  for (const zone of oppScoreCounts) {
    if (zone.count === 0) continue;
    const alpha = 0.20 + (maxOpp > 0 ? (zone.count / maxOpp) * 0.42 : 0);
    const rect  = zonePixelRect(zone.bounds, inner);
    ctx.fillStyle = `rgba(248,113,113,${alpha.toFixed(2)})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // FOR possession-loss zone fills (amber — increased opacity)
  for (const zone of forLossCounts) {
    if (zone.count === 0) continue;
    const alpha = 0.18 + (maxFor > 0 ? (zone.count / maxFor) * 0.37 : 0);
    const rect  = zonePixelRect(zone.bounds, inner);
    ctx.fillStyle = `rgba(251,191,36,${alpha.toFixed(2)})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Event markers (vision-first: symbol-rich, high contrast) ──────────────
  renderHtMarkers(ctx, mapEvts, inner);

  // ── Zone badge pills ──────────────────────────────────────────────────────
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  ctx.font         = "bold 13px sans-serif";

  // OPP score badges (red pill, top-third of zone)
  for (const zone of oppScoreCounts) {
    if (zone.count === 0) continue;
    const rect  = zonePixelRect(zone.bounds, inner);
    const midX  = rect.x + rect.w / 2;
    const midY  = rect.y + rect.h * 0.30;
    const label = `▾${zone.count}`;
    const tw    = ctx.measureText(label).width + 14;
    ctx.fillStyle = "rgba(248,113,113,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, midX, midY);
  }

  // FOR loss badges (amber pill, bottom-third of zone)
  for (const zone of forLossCounts) {
    if (zone.count === 0) continue;
    const rect  = zonePixelRect(zone.bounds, inner);
    const midX  = rect.x + rect.w / 2;
    const midY  = rect.y + rect.h * 0.70;
    const label = `✕${zone.count}`;
    const tw    = ctx.measureText(label).width + 14;
    ctx.fillStyle = "rgba(251,191,36,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = "#0d1117";
    ctx.fillText(label, midX, midY);
  }
  ctx.restore();

  // ── Tactical Threat Overlays ──────────────────────────────────────────────
  // Rings + badges: primary=OPP scores (3×), secondary=FOR losses (2×)
  // Observational labels only — no prescriptions.
  for (let i = 0; i < oppScoreCounts.length; i++) {
    const oZone = oppScoreCounts[i];
    const fZone = forLossCounts[i];
    const score = computeZoneThreatScore(oZone.count, fZone.count, 0);
    const level = getThreatLevel(score);
    if (level === "NONE") continue;
    const rect = zonePixelRect(oZone.bounds, inner);
    const cx   = rect.x + rect.w / 2;
    const cy   = rect.y + rect.h / 2;
    drawThreatRings(ctx, cx, cy, level);
    const lbl =
      level === "CRITICAL" ? "DANGER ZONE" :
      level === "HIGH"     ? "SCORING THREAT" :
                             "WATCH";
    drawThreatBadge(ctx, cx, cy - 50, lbl, level);
  }

  // ── Directional Pressure Sweeps ───────────────────────────────────────────
  // Sweeps convey WHERE pressure is repeatedly arriving from — not event paths.
  // "They keep coming through here" — atmospheric directional language.
  // Max 3 sweeps total. Only renders on zones with threat level ≥ HIGH.
  {
    // Find hottest combined OPP threat zone (OPP scores + FOR losses combined)
    let bestOppIdx = -1, bestOppScore = 0;
    for (let i = 0; i < oppScoreCounts.length; i++) {
      const s = computeZoneThreatScore(oppScoreCounts[i].count, forLossCounts[i].count, 0);
      if (s > bestOppScore) { bestOppScore = s; bestOppIdx = i; }
    }
    // Find hottest standalone FOR loss zone (separate from OPP hotspot)
    let bestForIdx = -1, bestForScore = 0;
    for (let i = 0; i < forLossCounts.length; i++) {
      if (i === bestOppIdx) continue;
      const s = computeZoneThreatScore(0, forLossCounts[i].count, 0);
      if (s > bestForScore) { bestForScore = s; bestForIdx = i; }
    }

    let sweepsDrawn = 0;

    if (bestOppIdx >= 0 && getThreatLevel(bestOppScore) !== "NONE") {
      const rect      = zonePixelRect(oppScoreCounts[bestOppIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestOppScore / 10, 1.0);
      // OPP scoring pressure arrives from the midfield side (right = high nx in pixel space)
      drawDirectionalPressureSweep(ctx, cx + rect.w * 0.40, cy - rect.h * 0.22, cx - rect.w * 0.08, cy, intensity, "PRESSURE_INWARD");
      sweepsDrawn++;
      if (getThreatLevel(bestOppScore) === "CRITICAL" && sweepsDrawn < 3) {
        drawDirectionalPressureSweep(ctx, cx + rect.w * 0.40, cy + rect.h * 0.22, cx - rect.w * 0.08, cy, intensity * 0.70, "PRESSURE_INWARD");
        sweepsDrawn++;
      }
    }
    if (bestForIdx >= 0 && getThreatLevel(bestForScore) !== "NONE" && sweepsDrawn < 3) {
      const rect      = zonePixelRect(forLossCounts[bestForIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestForScore / 6, 1.0);
      // FOR possession lost — pressure converging from entry direction
      drawDirectionalPressureSweep(ctx, cx - rect.w * 0.40, cy - rect.h * 0.22, cx, cy, intensity, "PRESSURE_COLLAPSE");
    }
  }

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(248,113,113,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("OPP Score", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(251,191,36,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Possession Lost", lx + 22, ly);
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const totalOppScores = oppScoreEvts.length;
  const totalForLosses = forLossEvts.length;
  const oppScoreHot    = pdfZoneHotspots(oppScoreEvts)[0];
  const forLossHot     = pdfZoneHotspots(forLossEvts)[0];

  const facts: string[] = [];
  if (totalOppScores > 0) facts.push(`${awayTeam.slice(0, 14)} scored ${totalOppScores} time${totalOppScores !== 1 ? "s" : ""}`);
  if (oppScoreHot)        facts.push(`Scoring danger: ${oppScoreHot.label} (${oppScoreHot.count})`);
  if (totalForLosses > 0) facts.push(`${homeTeam.slice(0, 14)} lost possession ${totalForLosses} time${totalForLosses !== 1 ? "s" : ""}`);
  if (forLossHot && facts.length < 3) facts.push(`Loss zone: ${forLossHot.label} (${forLossHot.count})`);
  if (facts.length === 0) facts.push("No scoring threats or possession losses recorded.");

  drawHtCalloutStrip(ctx, facts, ["#ef4444", "#fbbf24", "#94a3b8"]);

  drawEventCountFooter(ctx, mapEvts.length);
  return canvas;
}

// ─── HT Page 3: Kickout Vision ────────────────────────────────────────────────

/**
 * Kickout Vision — territorial kickout dominance map.
 *
 * Zone fills per-zone kickout outcome:
 *   TEAL  — FOR team won majority in this zone (territorial dominance)
 *   RED   — OPP team won majority (concession territory)
 *   AMBER — contested zone (within 1 possession)
 * Fill intensity scales with zone kickout volume.
 * "X W / Y L" badge pills at zone centres for instant read.
 * Bottom strip: total won/lost ratio, dominant zone, main concession zone.
 *
 * Data: KICKOUT_WON + KICKOUT_CONCEDED events (H1 only, pre-filtered).
 */
function makeHtKickoutVisionPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, sport === "hurling" ? "Puckout Vision" : "Kickout Vision", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  // FOR won = KICKOUT_WON recorded by FOR, OR KICKOUT_CONCEDED recorded by OPP
  const forWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP"),
  );
  // OPP won = KICKOUT_CONCEDED recorded by FOR, OR KICKOUT_WON recorded by OPP
  const oppWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_WON"      && e.teamSide === "OPP"),
  );
  const allKickoutEvts = events.filter((e) => PDF_KIND_SETS.KICKOUTS.has(e.kind));

  // ── Pitch + zone colour overlays ──────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  const forWonCounts = pdfZoneCounts(forWonEvts);
  const oppWonCounts = pdfZoneCounts(oppWonEvts);

  for (let i = 0; i < forWonCounts.length; i++) {
    const forZone = forWonCounts[i];
    const oppZone = oppWonCounts[i];
    const total   = forZone.count + oppZone.count;
    if (total === 0) continue;

    const rect      = zonePixelRect(forZone.bounds, inner);
    const diff      = forZone.count - oppZone.count;
    const intensity = Math.min(total / 4, 1); // saturates at 4 events per zone

    if (diff > 1) {
      ctx.fillStyle = `rgba(20,184,166,${(0.20 + intensity * 0.38).toFixed(2)})`;
    } else if (diff < -1) {
      ctx.fillStyle = `rgba(248,113,113,${(0.20 + intensity * 0.38).toFixed(2)})`;
    } else {
      ctx.fillStyle = "rgba(251,191,36,0.28)";
    }
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Event markers (vision-first: symbol-rich, high contrast) ──────────────
  renderHtMarkers(ctx, allKickoutEvts, inner);

  // ── Zone badge pills ──────────────────────────────────────────────────────
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  ctx.font         = "bold 12px sans-serif";

  for (let i = 0; i < forWonCounts.length; i++) {
    const forZone = forWonCounts[i];
    const oppZone = oppWonCounts[i];
    const total   = forZone.count + oppZone.count;
    if (total === 0) continue;

    const rect   = zonePixelRect(forZone.bounds, inner);
    const midX   = rect.x + rect.w / 2;
    const midY   = rect.y + rect.h / 2;
    const label  = `${forZone.count}W / ${oppZone.count}L`;
    const tw     = ctx.measureText(label).width + 16;
    const isTeal = forZone.count > oppZone.count;
    const isRed  = oppZone.count > forZone.count;
    ctx.fillStyle = isTeal ? "rgba(20,184,166,0.88)"
                 : isRed  ? "rgba(248,113,113,0.88)"
                 :           "rgba(251,191,36,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = (isTeal || isRed) ? "#ffffff" : "#0d1117";
    ctx.fillText(label, midX, midY);
  }
  ctx.restore();

  // ── Tactical Threat Overlays ──────────────────────────────────────────────
  // primary=OPP kickout wins (3×), mitigating=FOR kickout wins (1×)
  // OPP-dominant zones surface as danger; FOR dominance reduces the signal.
  for (let i = 0; i < oppWonCounts.length; i++) {
    const oZone = oppWonCounts[i];
    const fZone = forWonCounts[i];
    const score = computeZoneThreatScore(oZone.count, 0, fZone.count);
    const level = getThreatLevel(score);
    if (level === "NONE") continue;
    const rect = zonePixelRect(oZone.bounds, inner);
    const cx   = rect.x + rect.w / 2;
    const cy   = rect.y + rect.h / 2;
    drawThreatRings(ctx, cx, cy, level);
    const lbl =
      level === "CRITICAL" ? "KICKOUT TRAP" :
      level === "HIGH"     ? "CONCESSION ZONE" :
                             "WATCH";
    drawThreatBadge(ctx, cx, cy - 50, lbl, level);
  }

  // ── Directional Pressure Sweeps ───────────────────────────────────────────
  // "OPP keeps winning possession HERE" — OPP players flooding the landing zone.
  // Sweep direction: pressure inward from field toward contested zone.
  {
    let bestIdx = -1, bestScore = 0;
    for (let i = 0; i < oppWonCounts.length; i++) {
      const s = computeZoneThreatScore(oppWonCounts[i].count, 0, forWonCounts[i].count);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    if (bestIdx >= 0 && getThreatLevel(bestScore) !== "NONE") {
      const rect      = zonePixelRect(oppWonCounts[bestIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestScore / 10, 1.0);
      // OPP flooding kickout zone from midfield direction (right = high nx)
      drawDirectionalPressureSweep(ctx, cx + rect.w * 0.40, cy - rect.h * 0.24, cx - rect.w * 0.08, cy, intensity, "PRESSURE_INWARD");
      if (getThreatLevel(bestScore) === "CRITICAL") {
        // Critical trap: second converging sweep from opposite lateral edge
        drawDirectionalPressureSweep(ctx, cx - rect.w * 0.36, cy + rect.h * 0.24, cx, cy, intensity * 0.65, "PRESSURE_COLLAPSE");
      }
    }
  }

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(20,184,166,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Our possession", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(248,113,113,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Their possession", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(251,191,36,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Contested", lx + 22, ly);
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const totalFor = forWonEvts.length;
  const totalOpp = oppWonEvts.length;
  const totalKO  = totalFor + totalOpp;
  const forPct   = totalKO > 0 ? Math.round((totalFor / totalKO) * 100) : 0;
  const forHot   = pdfZoneHotspots(forWonEvts)[0];
  const oppHot   = pdfZoneHotspots(oppWonEvts)[0];
  // Sport-aware terminology: kickouts (GAA football) / puckouts (hurling)
  const restartTerm = sport === "hurling" ? "puckouts" : "kickouts";

  const facts: string[] = [];
  if (totalKO > 0) facts.push(`${homeTeam.slice(0, 14)} ${restartTerm}: ${totalFor}W · ${totalOpp}L (${forPct}% won)`);
  if (forHot)      facts.push(`Best zone: ${forHot.label}`);
  if (oppHot)      facts.push(`Conceded most: ${oppHot.label}`);
  if (facts.length === 0) facts.push(`No ${restartTerm} data recorded.`);

  drawHtCalloutStrip(ctx, facts, ["#14b8a6", "#14b8a6", "#ef4444"]);

  drawEventCountFooter(ctx, allKickoutEvts.length);
  return canvas;
}

// ─── HT Page 4: Attack Shape & Shot Vision ────────────────────────────────────

/**
 * Attack Shape & Shot Vision — scoring origin heat map.
 *
 * Zone fills:
 *   GREEN — zones where FOR team scored FROM (scoring corridors)
 *   RED   — zones where FOR team had wides / missed frees (danger/waste zones)
 * Fill intensity scales with event count per zone (red drawn first, green on top).
 * All FOR shot events overlaid as vision-first markers for spatial precision.
 * Bottom strip: shot efficiency, wide count, hottest scoring zone.
 *
 * Data: FOR SHOTS events (H1 only, pre-filtered).
 */
function makeHtAttackShotVisionPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Attack Shape", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const forScoreEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind),
  );
  const forWideEvts = events.filter(
    (e) => e.teamSide === "FOR" && (e.kind === "WIDE" || isFreeMiss(e)),
  );

  const forShotEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SHOTS.has(e.kind),
  );
  // OPP shots — for callout comparison only; OPP zone fills/badges not drawn
  // (page remains FOR-side visual to avoid clutter)
  const oppScoreEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind),
  );
  const oppWideEvts = events.filter(
    (e) => e.teamSide === "OPP" && (e.kind === "WIDE" || isFreeMiss(e)),
  );

  const oppShotEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SHOTS.has(e.kind),
  );
  // Frees won/conceded — spatial markers only (small dots, already colour-coded
  // in HT_MARKER_COLORS: FREE_WON=indigo, FREE_CONCEDED=pink).
  // Only included when at least one free event is logged.
  const freeEvts = events.filter(
    (e) => e.kind === "FREE_WON" || e.kind === "FREE_CONCEDED",
  );

  // ── Pitch + zone colour overlays ──────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  const scoreCounts = pdfZoneCounts(forScoreEvts);
  const wideCounts  = pdfZoneCounts(forWideEvts);
  const maxScore    = scoreCounts.reduce((m, z) => Math.max(m, z.count), 0);
  const maxWide     = wideCounts.reduce((m, z) => Math.max(m, z.count), 0);

  // Red wide zone fills (drawn first, behind score fills) — aggressive danger signal
  for (const zone of wideCounts) {
    if (zone.count === 0) continue;
    const alpha = 0.18 + (maxWide > 0 ? (zone.count / maxWide) * 0.32 : 0);
    const rect  = zonePixelRect(zone.bounds, inner);
    ctx.fillStyle = `rgba(239,68,68,${alpha.toFixed(2)})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // Green score zone fills (drawn on top of red — success overrides waste)
  for (const zone of scoreCounts) {
    if (zone.count === 0) continue;
    const alpha = 0.20 + (maxScore > 0 ? (zone.count / maxScore) * 0.45 : 0);
    const rect  = zonePixelRect(zone.bounds, inner);
    ctx.fillStyle = `rgba(52,211,153,${alpha.toFixed(2)})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Event markers (vision-first: symbol-rich, high contrast) ──────────────
  // FOR shots + any logged frees (spatial context — indigo=won, pink=conceded)
  // freeEvts is empty when no frees are logged so this degrades cleanly.
  renderHtMarkers(ctx, [...forShotEvts, ...freeEvts], inner);

  // ── Zone badge pills ──────────────────────────────────────────────────────
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  ctx.font         = "bold 13px sans-serif";

  // Score badges (green, top-third of zone)
  for (const zone of scoreCounts) {
    if (zone.count === 0) continue;
    const rect  = zonePixelRect(zone.bounds, inner);
    const midX  = rect.x + rect.w / 2;
    const midY  = rect.y + rect.h * 0.30;
    const label = `⚡${zone.count}`;
    const tw    = ctx.measureText(label).width + 14;
    ctx.fillStyle = "rgba(52,211,153,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = "#0d1117";
    ctx.fillText(label, midX, midY);
  }

  // Wide badges (red — aggressive miss indicator, bottom-third of zone)
  for (const zone of wideCounts) {
    if (zone.count === 0) continue;
    const rect  = zonePixelRect(zone.bounds, inner);
    const midX  = rect.x + rect.w / 2;
    const midY  = rect.y + rect.h * 0.72;
    const label = `✕${zone.count}`;
    const tw    = ctx.measureText(label).width + 14;
    ctx.fillStyle = "rgba(239,68,68,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, midX, midY);
  }
  ctx.restore();

  // ── Tactical Threat Overlays (wasted attack zones) ───────────────────────
  // primary=wides (3×), mitigating=scores in same zone (1×)
  // Zones where FOR keeps missing while scoring nothing are the highest threat.
  for (let i = 0; i < wideCounts.length; i++) {
    const wZone = wideCounts[i];
    const sZone = scoreCounts[i];
    const score = computeZoneThreatScore(wZone.count, 0, sZone.count);
    const level = getThreatLevel(score);
    if (level === "NONE") continue;
    const rect = zonePixelRect(wZone.bounds, inner);
    const cx   = rect.x + rect.w / 2;
    const cy   = rect.y + rect.h / 2;
    drawThreatRings(ctx, cx, cy, level);
    const lbl =
      level === "CRITICAL" ? "WIDES ALERT" :
      level === "HIGH"     ? "WASTAGE ZONE" :
                             "WATCH";
    drawThreatBadge(ctx, cx, cy - 50, lbl, level);
  }

  // ── Directional Pressure Sweeps ───────────────────────────────────────────
  // Wide zones: attacks entering and dying — COLLAPSE sweeps converging inward.
  // Score zones: successful attacking release — EXIT sweep outward.
  {
    // Hottest waste zone (for COLLAPSE sweeps)
    let bestWideIdx = -1, bestWideScore = 0;
    for (let i = 0; i < wideCounts.length; i++) {
      const s = computeZoneThreatScore(wideCounts[i].count, 0, scoreCounts[i].count);
      if (s > bestWideScore) { bestWideScore = s; bestWideIdx = i; }
    }
    // Hottest scoring zone (for EXIT sweep) — must differ from waste zone
    let bestScoreIdx = -1, bestScoreCount = 0;
    for (let i = 0; i < scoreCounts.length; i++) {
      if (i === bestWideIdx) continue;
      if (scoreCounts[i].count > bestScoreCount) { bestScoreCount = scoreCounts[i].count; bestScoreIdx = i; }
    }

    let sweepsDrawn = 0;

    if (bestWideIdx >= 0 && getThreatLevel(bestWideScore) !== "NONE") {
      const rect      = zonePixelRect(wideCounts[bestWideIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestWideScore / 8, 1.0);
      // Wasted attacks converging — enter from left (FOR attacks left→right in pixel space)
      drawDirectionalPressureSweep(ctx, cx - rect.w * 0.40, cy - rect.h * 0.22, cx, cy, intensity, "PRESSURE_COLLAPSE");
      sweepsDrawn++;
      if (getThreatLevel(bestWideScore) === "CRITICAL" && sweepsDrawn < 3) {
        drawDirectionalPressureSweep(ctx, cx + rect.w * 0.38, cy + rect.h * 0.22, cx, cy, intensity * 0.65, "PRESSURE_COLLAPSE");
        sweepsDrawn++;
      }
    }
    if (bestScoreIdx >= 0 && bestScoreCount >= 2 && sweepsDrawn < 3) {
      const rect      = zonePixelRect(scoreCounts[bestScoreIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestScoreCount / 5, 1.0);
      // Successful exit direction — FOR scoring corridor opening outward
      drawDirectionalPressureSweep(ctx, cx - rect.w * 0.20, cy + rect.h * 0.10, cx + rect.w * 0.40, cy - rect.h * 0.22, intensity, "PRESSURE_EXIT");
    }
  }

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(52,211,153,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Our scores", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(239,68,68,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Our wides", lx + 22, ly); ly += 26;
  // Free markers — only shown when frees are logged; colours match HT_MARKER_COLORS
  if (freeEvts.length > 0) {
    ctx.fillStyle = "#818cf8";
    ctx.fillRect(lx, ly - 8, 16, 16);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Free won", lx + 22, ly); ly += 26;
    ctx.fillStyle = "#f472b6";
    ctx.fillRect(lx, ly - 8, 16, 16);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Free conceded", lx + 22, ly);
  }
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const totalShots    = forShotEvts.length;
  const totalScores   = forScoreEvts.length;
  const totalWides    = forWideEvts.length;
  const shotEff       = totalShots > 0 ? Math.round((totalScores / totalShots) * 100) : 0;
  const totalOppShots  = oppShotEvts.length;
  const totalOppScores = oppScoreEvts.length;
  const totalOppWides  = oppWideEvts.length;
  const oppShotEff     = totalOppShots > 0 ? Math.round((totalOppScores / totalOppShots) * 100) : 0;
  const scoreHot      = pdfZoneHotspots(forScoreEvts)[0];

  const facts: string[]  = [];
  const colors: string[] = [];
  if (totalShots > 0) {
    facts.push(`${homeTeam.slice(0, 12)} shots: ${totalScores} scored · ${totalWides} wide (${shotEff}%)`);
    colors.push("#34d399");
  }
  if (totalOppShots > 0) {
    facts.push(`${awayTeam.slice(0, 12)} shots: ${totalOppScores} scored · ${totalOppWides} wide (${oppShotEff}%)`);
    colors.push("#ef4444");
  }
  if (scoreHot && facts.length < 3) {
    facts.push(`${homeTeam.slice(0, 12)} top zone: ${scoreHot.label} (${scoreHot.count})`);
    colors.push("#34d399");
  }
  if (facts.length === 0) facts.push("No shot data recorded.");

  drawHtCalloutStrip(ctx, facts, colors.length > 0 ? colors : ["#34d399", "#ef4444", "#34d399"]);

  drawEventCountFooter(ctx, forShotEvts.length + freeEvts.length);
  return canvas;
}

// ─── HT Page 2: Game Flow ─────────────────────────────────────────────────────

/**
 * Game Flow — segment-by-segment control dominance.
 *
 * Large horizontal flow bar divided into match segments (3 per first half, ~10 min each).
 * Each segment block is coloured:
 *   GREEN  — FOR team controlled (positive score + kickout differential)
 *   RED    — OPP team controlled
 *   AMBER  — contested (close differential)
 *
 * Under each block: segment time label + up to 3 short tactical bullet causes.
 * Answers: "When did we lose/gain control, and why?"
 *
 * Data: pre-filtered H1 events (scores, kickouts, turnovers per segment).
 */
function makeHtGameFlowPage(
  events: readonly PdfExportEvent[],
  _analysis: ChainAnalysis<PdfExportEvent>,
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
  drawPageHeader(ctx, "Game Flow", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Gather unique segments present in events ──────────────────────────────
  const segNums = Array.from(
    new Set(
      events
        .map((e) => e.segment)
        .filter((s): s is MatchEventSegment => s != null),
    ),
  ).sort((a, b) => a - b);

  // Fallback: no segment data
  if (segNums.length === 0) {
    ctx.fillStyle    = "#64748b";
    ctx.font         = "20px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    ctx.fillText("No segment data available for this half.", CANVAS_W / 2, CANVAS_H / 2);
    drawEventCountFooter(ctx, _analysis.totalEventsAnalysed);
    return canvas;
  }

  // ── Segment time label helper (~10 min bands, H1 uses segments 1–3) ───────
  function segLabel(s: MatchEventSegment): string {
    const start = (s - 1) * 10;
    const end   = s * 10;
    return `${start}–${end}'`;
  }

  // ── Per-segment data computation ──────────────────────────────────────────
  type SegControl = "FOR" | "OPP" | "CONTESTED";
  type SegData = {
    seg: MatchEventSegment;
    label: string;
    forScore: number;
    oppScore: number;
    kickoutBalance: number;
    turnoverBalance: number;
    controlScore: number;
    status: SegControl;
    bullets: string[];
  };

  const segDataList: SegData[] = segNums.map((seg) => {
    const segEvts    = events.filter((e) => e.segment === seg);
    const forSEvts   = segEvts.filter((e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind));
    const oppSEvts   = segEvts.filter((e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind));
    const forScore   = scoreFromEvents(forSEvts).total;
    const oppScore   = scoreFromEvents(oppSEvts).total;
    const koWon      = segEvts.filter((e) => e.kind === "KICKOUT_WON").length;
    const koConceded = segEvts.filter((e) => e.kind === "KICKOUT_CONCEDED").length;
    const toWon      = segEvts.filter((e) => e.kind === "TURNOVER_WON").length;
    const toLost     = segEvts.filter((e) => e.kind === "TURNOVER_LOST").length;

    const kickoutBalance  = koWon - koConceded;
    const turnoverBalance = toWon - toLost;

    // Composite control score: scoring weighted 2×, kickout balance 1×, turnover 0.5×
    const controlScore =
      (forScore - oppScore) * 2 + kickoutBalance + Math.round(turnoverBalance * 0.5);

    const status: SegControl =
      controlScore >= 2 ? "FOR" : controlScore <= -2 ? "OPP" : "CONTESTED";

    // Tactical bullet causes (up to 3, highest impact first)
    const bullets: string[] = [];
    const scoreDiff = forScore - oppScore;
    if (scoreDiff > 0)           bullets.push(`• Scored ${forScore}${oppScore === 0 ? ", nil conceded" : ` — opp ${oppScore}`}`);
    else if (scoreDiff < 0)      bullets.push(`• Conceded ${oppScore}${forScore === 0 ? ", scored nil" : ` — scored ${forScore}`}`);
    if (kickoutBalance > 0)      bullets.push(`• Kickout dominance (+${kickoutBalance})`);
    else if (kickoutBalance < 0) bullets.push(`• Kickout losses (${kickoutBalance})`);
    if (turnoverBalance > 1)     bullets.push(`• Won possession (+${turnoverBalance} turnovers)`);
    else if (turnoverBalance < -1) bullets.push(`• Turnover vulnerability (${turnoverBalance})`);
    if (bullets.length === 0)    bullets.push("• Even — no clear advantage");

    return {
      seg, label: segLabel(seg),
      forScore, oppScore,
      kickoutBalance, turnoverBalance,
      controlScore, status,
      bullets: bullets.slice(0, 3),
    };
  });

  // ── Layout constants ──────────────────────────────────────────────────────
  const FLOW_X  = 80;
  const FLOW_Y  = 130;
  const FLOW_W  = CANVAS_W - 160;  // 1760
  const FLOW_H  = 230;
  const N       = segDataList.length;
  const SEG_GAP = 8;
  const segW    = Math.floor((FLOW_W - SEG_GAP * (N - 1)) / N);

  // Sub-title context line
  ctx.fillStyle    = "#64748b";
  ctx.font         = "16px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign    = "left";
  ctx.fillText("SEGMENT CONTROL FLOW  ·  Who controlled each phase and why?", FLOW_X, FLOW_Y - 12);

  // ── Draw dominance flow bar ───────────────────────────────────────────────
  segDataList.forEach((sd, i) => {
    const bx = FLOW_X + i * (segW + SEG_GAP);
    const by = FLOW_Y;

    const barColor =
      sd.status === "FOR"  ? "#22c55e" :
      sd.status === "OPP"  ? "#ef4444" :
                             "#f59e0b";

    ctx.globalAlpha = 0.88;
    ctx.fillStyle   = barColor;
    ctx.fillRect(bx, by, segW, FLOW_H);
    ctx.globalAlpha = 1.0;

    // Subtle inner border
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, segW, FLOW_H);

    // Status label (top of bar, subtle dark overlay)
    ctx.font         = "bold 16px sans-serif";
    ctx.fillStyle    = "rgba(0,0,0,0.50)";
    ctx.textBaseline = "top";
    ctx.textAlign    = "center";
    ctx.fillText(sd.status, bx + segW / 2, by + 10);

    // Score differential — large, centred
    const diff      = sd.forScore - sd.oppScore;
    const diffLabel = diff > 0 ? `+${diff}` : String(diff);
    ctx.font         = "bold 56px sans-serif";
    ctx.fillStyle    = "rgba(255,255,255,0.92)";
    ctx.textBaseline = "middle";
    ctx.fillText(diffLabel, bx + segW / 2, by + FLOW_H / 2 + 6);

    // Time label bottom of bar
    ctx.font      = "bold 15px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.68)";
    ctx.fillText(sd.label, bx + segW / 2, by + FLOW_H - 14);
  });

  // ── Bullet analysis blocks below flow bar ─────────────────────────────────
  const BULLET_TOP = FLOW_Y + FLOW_H + 38;

  segDataList.forEach((sd, i) => {
    const bx = FLOW_X + i * (segW + SEG_GAP);

    // Segment chip header
    ctx.fillStyle    = "rgba(255,255,255,0.06)";
    ctx.fillRect(bx, BULLET_TOP - 6, segW, 36);
    ctx.fillStyle    = "#94a3b8";
    ctx.font         = "bold 16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    ctx.fillText(sd.label, bx + segW / 2, BULLET_TOP + 12);

    // Bullet items
    sd.bullets.forEach((bullet, bi) => {
      const by = BULLET_TOP + 50 + bi * 38;
      ctx.font         = "18px sans-serif";
      ctx.fillStyle    = "#e2e8f0";
      ctx.textBaseline = "middle";
      ctx.textAlign    = "left";
      const MAX_TW = segW - 20;
      let display  = bullet;
      if (ctx.measureText(display).width > MAX_TW) {
        while (display.length > 0 && ctx.measureText(display + "…").width > MAX_TW) {
          display = display.slice(0, -1);
        }
        display += "…";
      }
      ctx.fillText(display, bx + 10, by);
    });
  });

  // ── Colour legend ─────────────────────────────────────────────────────────
  const LEG_Y = BULLET_TOP + 50 + 3 * 38 + 30;
  ctx.save();
  const legendItems: [string, string][] = [
    ["#22c55e", "FOR control"],
    ["#ef4444", "OPP control"],
    ["#f59e0b", "Contested"],
  ];
  let lx = FLOW_X;
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  for (const [color, label] of legendItems) {
    ctx.globalAlpha = 0.88;
    ctx.fillStyle   = color;
    ctx.fillRect(lx, LEG_Y - 9, 18, 18);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#64748b";
    ctx.font      = "14px sans-serif";
    ctx.fillText(label, lx + 26, LEG_Y);
    lx += 140;
  }
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const forCtrl      = segDataList.filter((s) => s.status === "FOR").length;
  const oppCtrl      = segDataList.filter((s) => s.status === "OPP").length;
  const contestedCt  = segDataList.filter((s) => s.status === "CONTESTED").length;
  const facts: string[] = [];
  if (forCtrl > 0)     facts.push(`${homeTeam.slice(0, 14)} controlled ${forCtrl} segment${forCtrl !== 1 ? "s" : ""}`);
  if (oppCtrl > 0)     facts.push(`${awayTeam.slice(0, 14)} controlled ${oppCtrl} segment${oppCtrl !== 1 ? "s" : ""}`);
  if (contestedCt > 0) facts.push(`${contestedCt} contested segment${contestedCt !== 1 ? "s" : ""}`);
  if (facts.length === 0) facts.push("No segment data available.");

  drawHtCalloutStrip(ctx, facts, ["#22c55e", "#ef4444", "#f59e0b"]);
  drawEventCountFooter(ctx, _analysis.totalEventsAnalysed);
  return canvas;
}

// ─── HT Page 5: Game Flow Factors ─────────────────────────────────────────────

/**
 * Game Flow Factors — two-column "Working For Us / Working Against Us" debrief.
 *
 * Left column (green header): up to 3 positive tactical facts.
 * Right column (red header): up to 3 negative tactical facts.
 *
 * Card layout (per card):
 *   6 px left accent bar (green or red)
 *   Bold 22 px headline — the fact
 *   16 px evidence subline — supporting data
 *
 * Fact priority order:
 *   FOR: kickout control → shot efficiency → turnovers→scores → score lead → scoring run
 *   AGAINST: trailing → kickout deficit → turnovers allowed → wides → OPP scoring run
 *
 * No AI language. No prescriptions. Facts only.
 */
function makeHtGameFlowFactorsPage(
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
  drawPageHeader(ctx, "Game Flow Factors", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Derive raw data ────────────────────────────────────────────────────────
  const forShotEvts  = events.filter((e) => e.teamSide === "FOR" && PDF_KIND_SETS.SHOTS.has(e.kind));
  const forScoreEvts = events.filter((e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind));
  const forWideEvts  = events.filter((e) => e.teamSide === "FOR" && (e.kind === "WIDE" || isFreeMiss(e)));
  const oppScoreEvts = events.filter((e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind));

  const forScoreTotal = scoreFromEvents(forScoreEvts).total;
  const oppScoreTotal = scoreFromEvents(oppScoreEvts).total;
  const scoreDiff     = forScoreTotal - oppScoreTotal;
  const shotTotal     = forShotEvts.length;
  const shotEff       = shotTotal > 0 ? Math.round((forScoreEvts.length / shotTotal) * 100) : 0;
  const wideCount     = forWideEvts.length;

  const ko   = analysis.kickouts;
  const tos  = analysis.turnovers;
  const runs = analysis.scoringRuns;

  // ── Build FOR factors (what is working for us) ─────────────────────────────
  type FactCard = { headline: string; evidence: string };

  const forFacts: FactCard[] = [];
  if (ko.won > ko.lost)
    forFacts.push({
      headline: `Kickout control: ${ko.won} of ${ko.total} won`,
      evidence: `${ko.won}W / ${ko.lost}L — dominant on restarts`,
    });
  if (shotEff >= 50 && shotTotal >= 3)
    forFacts.push({
      headline: `Shot efficiency: ${forScoreEvts.length} / ${shotTotal} (${shotEff}%)`,
      evidence: `${shotTotal - forScoreEvts.length} miss${(shotTotal - forScoreEvts.length) !== 1 ? "es" : ""} in the half`,
    });
  if (tos.wonToScore > 0)
    forFacts.push({
      headline: `${tos.wonToScore} turnover→score conversion${tos.wonToScore !== 1 ? "s" : ""}`,
      evidence: `from ${tos.won} possession${tos.won !== 1 ? "s" : ""} won`,
    });
  if (scoreDiff > 0)
    forFacts.push({
      headline: `Leading by ${scoreDiff} point${scoreDiff !== 1 ? "s" : ""}`,
      evidence: `${fmtScore(scoreFromEvents(forScoreEvts))} vs ${fmtScore(scoreFromEvents(oppScoreEvts))}`,
    });
  if ((runs.maxConsecutiveFor ?? 0) >= 3)
    forFacts.push({
      headline: `${runs.maxConsecutiveFor}-score run (best FOR run)`,
      evidence: "best scoring sequence this half",
    });

  // ── Build AGAINST factors (what is working against us) ────────────────────
  const againstFacts: FactCard[] = [];
  if (scoreDiff < 0)
    againstFacts.push({
      headline: `Trailing by ${Math.abs(scoreDiff)} point${Math.abs(scoreDiff) !== 1 ? "s" : ""}`,
      evidence: `${fmtScore(scoreFromEvents(forScoreEvts))} vs ${fmtScore(scoreFromEvents(oppScoreEvts))}`,
    });
  if (ko.lost > ko.won)
    againstFacts.push({
      headline: `Kickout deficit: ${ko.lost} of ${ko.total} lost`,
      evidence: `${ko.won}W / ${ko.lost}L — restarts conceded`,
    });
  if (tos.lostAllowedScore > 0)
    againstFacts.push({
      headline: `${tos.lostAllowedScore} turnover→score against`,
      evidence: `from ${tos.lost} possession${tos.lost !== 1 ? "s" : ""} lost`,
    });
  if (wideCount >= 2)
    againstFacts.push({
      headline: `${wideCount} wide${wideCount !== 1 ? "s" : ""} / miss${wideCount !== 1 ? "es" : ""} in the half`,
      evidence: `${wideCount} scoring chance${wideCount !== 1 ? "s" : ""} wasted`,
    });
  if ((runs.maxConsecutiveOpp ?? 0) >= 3)
    againstFacts.push({
      headline: `OPP ${runs.maxConsecutiveOpp}-score run this half`,
      evidence: "opposition best scoring sequence",
    });

  // ── Layout ─────────────────────────────────────────────────────────────────
  const COL_W    = (CANVAS_W - 144) / 2;  // ~888 px each
  const COL_L_X  = 48;
  const COL_R_X  = COL_L_X + COL_W + 48;
  const HDR_Y    = 100;
  const CARD_TOP = 160;
  const CARD_H   = 185;
  const CARD_GAP = 18;
  const ACCENT_W = 6;

  // ── Column headers ─────────────────────────────────────────────────────────
  // "Working For Us" — green
  ctx.fillStyle    = "rgba(34,197,94,0.12)";
  ctx.fillRect(COL_L_X, HDR_Y - 10, COL_W, 52);
  ctx.fillStyle    = "#22c55e";
  ctx.fillRect(COL_L_X, HDR_Y - 10, ACCENT_W, 52);
  ctx.font         = "bold 24px sans-serif";
  ctx.fillStyle    = "#22c55e";
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.fillText("Working For Us ▲", COL_L_X + 18, HDR_Y + 16);

  // Separator line
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(COL_L_X + COL_W + 24, HDR_Y - 10);
  ctx.lineTo(COL_L_X + COL_W + 24, CARD_TOP + 3 * (CARD_H + CARD_GAP) + 10);
  ctx.stroke();

  // "Working Against Us" — red
  ctx.fillStyle    = "rgba(239,68,68,0.12)";
  ctx.fillRect(COL_R_X, HDR_Y - 10, COL_W, 52);
  ctx.fillStyle    = "#ef4444";
  ctx.fillRect(COL_R_X, HDR_Y - 10, ACCENT_W, 52);
  ctx.font         = "bold 24px sans-serif";
  ctx.fillStyle    = "#ef4444";
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.fillText("Working Against Us ▼", COL_R_X + 18, HDR_Y + 16);

  // ── Render fact cards helper ───────────────────────────────────────────────
  // ctx passed explicitly so the build-time type-checker sees it as non-null.
  function renderFactCards(
    c: CanvasRenderingContext2D,
    facts: FactCard[],
    colX: number,
    accentColor: string,
  ): void {
    const toRender = facts.slice(0, 3);
    if (toRender.length === 0) {
      c.fillStyle    = "#64748b";
      c.font         = "18px sans-serif";
      c.textBaseline = "middle";
      c.textAlign    = "left";
      c.fillText("No significant patterns recorded.", colX + 18, CARD_TOP + CARD_H / 2);
      return;
    }
    toRender.forEach((fact, i) => {
      const cardY = CARD_TOP + i * (CARD_H + CARD_GAP);

      // Card background
      c.fillStyle = "rgba(255,255,255,0.04)";
      c.fillRect(colX + ACCENT_W, cardY, COL_W - ACCENT_W, CARD_H);

      // Accent bar
      c.fillStyle = accentColor;
      c.fillRect(colX, cardY, ACCENT_W, CARD_H);

      // Headline — 22px bold, word-wrap to 2 lines
      const HEADLINE_X  = colX + ACCENT_W + 18;
      const HEADLINE_Y  = cardY + 60;
      const MAX_TW      = COL_W - ACCENT_W - 36;
      c.font          = "bold 22px sans-serif";
      c.fillStyle     = "#f1f5f9";
      c.textBaseline  = "alphabetic";
      c.textAlign     = "left";
      const hl          = fact.headline;
      if (c.measureText(hl).width <= MAX_TW) {
        c.fillText(hl, HEADLINE_X, HEADLINE_Y);
      } else {
        const words = hl.split(" ");
        let line1 = "";
        let line2 = hl;
        for (let w = 1; w <= words.length; w++) {
          const candidate = words.slice(0, w).join(" ");
          if (c.measureText(candidate).width > MAX_TW * 0.55) {
            line1 = words.slice(0, w - 1).join(" ");
            line2 = words.slice(w - 1).join(" ");
            break;
          }
          if (w === words.length) { line1 = candidate; line2 = ""; }
        }
        c.fillText(line1 || hl, HEADLINE_X, HEADLINE_Y - 13);
        if (line2) c.fillText(line2, HEADLINE_X, HEADLINE_Y + 13);
      }

      // Evidence subline — 16px, dimmed
      c.font         = "16px sans-serif";
      c.fillStyle    = "#64748b";
      c.textBaseline = "alphabetic";
      c.fillText(fact.evidence, HEADLINE_X, cardY + CARD_H - 22);
    });
  }

  renderFactCards(ctx, forFacts,     COL_L_X, "#22c55e");
  renderFactCards(ctx, againstFacts, COL_R_X, "#ef4444");

  // ── Bottom callout strip ───────────────────────────────────────────────────
  const facts: string[] = [];
  if (forFacts.length > 0)     facts.push(`${homeTeam.slice(0, 14)}: ${forFacts.length} positive factor${forFacts.length !== 1 ? "s" : ""} identified`);
  if (againstFacts.length > 0) facts.push(`${homeTeam.slice(0, 14)}: ${againstFacts.length} challenge${againstFacts.length !== 1 ? "s" : ""} flagged`);
  if (facts.length === 0)      facts.push("Not enough data to identify clear patterns.");

  // ── Possession Chain V1: kickout win-to-score efficiency (threshold ≥ 3) ──
  if (ko.total >= 3 && ko.wonToScore > 0 && facts.length < 3) {
    const pct = Math.round(ko.wonToScorePercent);
    facts.push(`${homeTeam.slice(0, 14)} kickout→score: ${ko.wonToScore} of ${ko.won} won converted (${pct}%)`);
  }

  drawHtCalloutStrip(ctx, facts, ["#22c55e", "#ef4444", "#94a3b8"]);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);
  return canvas;
}

// ─── FT Page 9: Attack Corridors ─────────────────────────────────────────────

/**
 * Attack Corridors — where FOR attacks form and where they die, by lateral channel.
 *
 * The pitch is divided into three lateral channels (LEFT / CENTRE / RIGHT)
 * via ny < 0.33 / 0.33–0.67 / > 0.67. Subtle dashed lines mark the channel
 * boundaries on the pitch.
 *
 * Zone fills:
 *   GREEN — zones where FOR scored (score corridor, scaled by count)
 *   RED   — zones where FOR had wides, missed frees, or lost possession
 * Fills are layered: red first, green on top so success overrides waste.
 *
 * Show layer: territorial zone fills across the three channels.
 * Tell layer: callout strip — which channel is the scoring corridor and
 *             which channel is the main wastage zone.
 *
 * Data: FOR SHOTS events (full match, all periods).
 */
function makeFtAttackCorridorsPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Attack Corridors", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const forScoreEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind),
  );

  const forWideEvts = events.filter(
    (e) => e.teamSide === "FOR" && (e.kind === "WIDE" || isFreeMiss(e)),
  );
  const forLossEvts = events.filter(
    (e) => e.teamSide === "FOR" && e.kind === "TURNOVER_LOST",
  );
  const forFailEvts = [...forWideEvts, ...forLossEvts];
  const forShotEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SHOTS.has(e.kind),
  );

  // ── Pitch + zone colour overlays ──────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  const scoreCounts = pdfZoneCounts(forScoreEvts);
  const failCounts  = pdfZoneCounts(forFailEvts);
  const maxScore    = scoreCounts.reduce((m, z) => Math.max(m, z.count), 0);
  const maxFail     = failCounts.reduce((m, z) => Math.max(m, z.count), 0);

  // Red failure zone fills (drawn first, behind score fills)
  for (const zone of failCounts) {
    if (zone.count === 0) continue;
    const alpha = 0.16 + (maxFail > 0 ? (zone.count / maxFail) * 0.34 : 0);
    const rect  = zonePixelRect(zone.bounds, inner);
    ctx.fillStyle = `rgba(239,68,68,${alpha.toFixed(2)})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // Green score zone fills (on top — success overrides waste visually)
  for (const zone of scoreCounts) {
    if (zone.count === 0) continue;
    const alpha = 0.20 + (maxScore > 0 ? (zone.count / maxScore) * 0.42 : 0);
    const rect  = zonePixelRect(zone.bounds, inner);
    ctx.fillStyle = `rgba(52,211,153,${alpha.toFixed(2)})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Channel lane dividers (horizontal dashed lines at ny = 0.33 and 0.67) ─
  const yAt33 = inner.y + inner.h * 0.33;
  const yAt67 = inner.y + inner.h * 0.67;
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(inner.x, yAt33); ctx.lineTo(inner.x + inner.w, yAt33); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(inner.x, yAt67); ctx.lineTo(inner.x + inner.w, yAt67); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Channel labels (left of pitch)
  const LBL_X = HT_PITCH_AREA.x - 6;
  const channelMids = [
    { name: "LEFT",   yMid: inner.y + inner.h * 0.165 },
    { name: "CENTRE", yMid: inner.y + inner.h * 0.500 },
    { name: "RIGHT",  yMid: inner.y + inner.h * 0.835 },
  ];
  ctx.save();
  ctx.font         = "bold 12px sans-serif";
  ctx.fillStyle    = "#64748b";
  ctx.textBaseline = "middle";
  ctx.textAlign    = "right";
  for (const ch of channelMids) ctx.fillText(ch.name, LBL_X, ch.yMid);
  ctx.restore();

  // ── Event markers ─────────────────────────────────────────────────────────
  renderHtMarkers(ctx, forShotEvts, inner);

  // ── Zone score / fail count badges ────────────────────────────────────────
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  ctx.font         = "bold 13px sans-serif";

  for (const zone of scoreCounts) {
    if (zone.count === 0) continue;
    const rect  = zonePixelRect(zone.bounds, inner);
    const midX  = rect.x + rect.w / 2;
    const midY  = rect.y + rect.h * 0.30;
    const label = `⚡${zone.count}`;
    const tw    = ctx.measureText(label).width + 14;
    ctx.fillStyle = "rgba(52,211,153,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = "#0d1117";
    ctx.fillText(label, midX, midY);
  }

  for (const zone of failCounts) {
    if (zone.count === 0) continue;
    const rect  = zonePixelRect(zone.bounds, inner);
    const midX  = rect.x + rect.w / 2;
    const midY  = rect.y + rect.h * 0.72;
    const label = `✕${zone.count}`;
    const tw    = ctx.measureText(label).width + 14;
    ctx.fillStyle = "rgba(239,68,68,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, midX, midY);
  }
  ctx.restore();

  // ── Tactical Threat Overlays (attack failure zones) ──────────────────────
  // primary=failures/wides/losses (3×), mitigating=scores in same zone (1×)
  // Zones where attacks consistently die but never convert = highest threat.
  for (let i = 0; i < failCounts.length; i++) {
    const fZone = failCounts[i];
    const sZone = scoreCounts[i];
    const score = computeZoneThreatScore(fZone.count, 0, sZone.count);
    const level = getThreatLevel(score);
    if (level === "NONE") continue;
    const rect = zonePixelRect(fZone.bounds, inner);
    const cx   = rect.x + rect.w / 2;
    const cy   = rect.y + rect.h / 2;
    drawThreatRings(ctx, cx, cy, level);
    const lbl =
      level === "CRITICAL" ? "ATTACK STALLING" :
      level === "HIGH"     ? "FAILURE ZONE" :
                             "WATCH";
    drawThreatBadge(ctx, cx, cy - 50, lbl, level);
  }

  // ── Directional Pressure Sweeps ───────────────────────────────────────────
  // Failure zones: attacks entering and collapsing — COLLAPSE sweep.
  // Scoring zones: successful corridor opening — EXIT sweep.
  {
    // Hottest failure zone
    let bestFailIdx = -1, bestFailScore = 0;
    for (let i = 0; i < failCounts.length; i++) {
      const s = computeZoneThreatScore(failCounts[i].count, 0, scoreCounts[i].count);
      if (s > bestFailScore) { bestFailScore = s; bestFailIdx = i; }
    }
    // Hottest scoring zone (distinct from failure zone)
    let bestScoIdx = -1, bestScoCount = 0;
    for (let i = 0; i < scoreCounts.length; i++) {
      if (i === bestFailIdx) continue;
      if (scoreCounts[i].count > bestScoCount) { bestScoCount = scoreCounts[i].count; bestScoIdx = i; }
    }

    let sweepsDrawn = 0;

    if (bestFailIdx >= 0 && getThreatLevel(bestFailScore) !== "NONE") {
      const rect      = zonePixelRect(failCounts[bestFailIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestFailScore / 8, 1.0);
      // FOR attack entering from left (defensive side), dying in zone
      drawDirectionalPressureSweep(ctx, cx - rect.w * 0.40, cy - rect.h * 0.22, cx, cy, intensity, "PRESSURE_COLLAPSE");
      sweepsDrawn++;
      if (getThreatLevel(bestFailScore) === "CRITICAL" && sweepsDrawn < 3) {
        drawDirectionalPressureSweep(ctx, cx + rect.w * 0.38, cy + rect.h * 0.22, cx, cy, intensity * 0.65, "PRESSURE_COLLAPSE");
        sweepsDrawn++;
      }
    }
    if (bestScoIdx >= 0 && bestScoCount >= 2 && sweepsDrawn < 3) {
      const rect      = zonePixelRect(scoreCounts[bestScoIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestScoCount / 5, 1.0);
      // Successful corridor: FOR scoring release direction
      drawDirectionalPressureSweep(ctx, cx - rect.w * 0.20, cy + rect.h * 0.10, cx + rect.w * 0.40, cy - rect.h * 0.22, intensity, "PRESSURE_EXIT");
    }
  }

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(52,211,153,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Scores", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(239,68,68,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Wides / Losses", lx + 22, ly); ly += 36;
  ctx.fillStyle = "#64748b";
  ctx.fillText("CHANNELS", lx, ly); ly += 20;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 130, ly); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  ctx.fillStyle = "#64748b";
  ctx.font = "12px sans-serif";
  ctx.fillText("Left / Centre / Right", lx, ly + 14);
  ctx.restore();

  // ── Channel corridor analysis ─────────────────────────────────────────────
  type ChannelKey = "LEFT" | "CENTRE" | "RIGHT";
  function channelOf(e: PdfExportEvent): ChannelKey {
    return e.ny < 0.33 ? "LEFT" : e.ny < 0.67 ? "CENTRE" : "RIGHT";
  }
  const chScores: Record<ChannelKey, number> = { LEFT: 0, CENTRE: 0, RIGHT: 0 };
  const chFails:  Record<ChannelKey, number> = { LEFT: 0, CENTRE: 0, RIGHT: 0 };
  for (const e of forScoreEvts) chScores[channelOf(e)]++;
  for (const e of forFailEvts)  chFails[channelOf(e)]++;

  const allCh: ChannelKey[] = ["LEFT", "CENTRE", "RIGHT"];
  const bestScoreCh   = allCh.reduce((a, b) => chScores[a] >= chScores[b] ? a : b);
  const mostWastedCh  = allCh.reduce((a, b) => chFails[a]  >= chFails[b]  ? a : b);
  const totalShots    = forShotEvts.length;
  const totalScores   = forScoreEvts.length;
  const shotEff       = totalShots > 0 ? Math.round((totalScores / totalShots) * 100) : 0;

  const facts: string[] = [];
  if (chScores[bestScoreCh] > 0)
    facts.push(`Scoring corridor: ${bestScoreCh.toLowerCase()} channel (${chScores[bestScoreCh]} score${chScores[bestScoreCh] !== 1 ? "s" : ""})`);
  if (chFails[mostWastedCh] > 0 && mostWastedCh !== bestScoreCh)
    facts.push(`Most wastage: ${mostWastedCh.toLowerCase()} channel (${chFails[mostWastedCh]} miss${chFails[mostWastedCh] !== 1 ? "es" : ""})`);
  if (totalShots > 0)
    facts.push(`${totalScores} / ${totalShots} shots converted (${shotEff}%)`);
  if (facts.length === 0) facts.push("No FOR attack data recorded.");

  drawHtCalloutStrip(ctx, facts, ["#34d399", "#ef4444", "#94a3b8"]);
  drawEventCountFooter(ctx, forShotEvts.length);
  return canvas;
}

// ─── FT Page 10: Restart Escape Routes ───────────────────────────────────────

/**
 * Restart Escape Routes — kickout destination zones coloured by outcome.
 *
 * Each of the 9 pitch zones shows the FOR win/loss ratio for kickouts
 * landing in that zone, derived from analysis.kickouts.outcomes[].
 *
 * Zone fill colour:
 *   TEAL  — FOR won majority of kickouts in this zone (reliable escape route)
 *   RED   — OPP won majority (territorial trap)
 *   AMBER — Contested (within 1)
 * Fill intensity scales with kickout volume in the zone.
 *
 * Right-side panel: "Best escape route" and "Main trap zone" with W/L breakdown.
 * Bottom strip: overall kickout rate + conversion highlights.
 *
 * Data: analysis.kickouts.outcomes[] (kickoutEvent.nx/ny for zone placement).
 */
function makeFtRestartEscapeRoutesPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Restart Escape Routes", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Pitch ─────────────────────────────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  // ── Zone grid from kickout outcomes ──────────────────────────────────────
  // 3×3 grid: col = nx depth (DEFENSIVE/MIDDLE/ATTACKING), row = ny lateral (LEFT/CENTRE/RIGHT)
  type ZoneStats = { forWon: number; oppWon: number; forToScore: number; total: number };
  const COL_BOUNDS = [
    { xMin: 0,     xMax: 33.33 },
    { xMin: 33.33, xMax: 66.67 },
    { xMin: 66.67, xMax: 100   },
  ];
  const ROW_BOUNDS = [
    { yMin: 0,     yMax: 33.33 },
    { yMin: 33.33, yMax: 66.67 },
    { yMin: 66.67, yMax: 100   },
  ];
  const COL_NAMES = ["Defensive", "Middle", "Attacking"];
  const ROW_NAMES = ["Left", "Centre", "Right"];

  const grid: ZoneStats[][] = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({ forWon: 0, oppWon: 0, forToScore: 0, total: 0 })),
  );

  for (const outcome of analysis.kickouts.outcomes) {
    const { nx, ny } = outcome.kickoutEvent;
    const col = nx < 0.333 ? 0 : nx < 0.667 ? 1 : 2;
    const row = ny < 0.333 ? 0 : ny < 0.667 ? 1 : 2;
    const cell = grid[col][row];
    cell.total++;
    if (outcome.winningSide === "FOR") {
      cell.forWon++;
      if (outcome.nextScore !== null) cell.forToScore++;
    } else {
      cell.oppWon++;
    }
  }

  // ── Zone fills ────────────────────────────────────────────────────────────
  const maxTotal = grid.flat().reduce((m, z) => Math.max(m, z.total), 0);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const cell = grid[col][row];
      if (cell.total === 0) continue;
      const bounds = {
        xMin: COL_BOUNDS[col].xMin, xMax: COL_BOUNDS[col].xMax,
        yMin: ROW_BOUNDS[row].yMin, yMax: ROW_BOUNDS[row].yMax,
      };
      const rect      = zonePixelRect(bounds, inner);
      const volFactor = maxTotal > 0 ? cell.total / maxTotal : 0;
      let fillStyle: string;
      if (cell.forWon > cell.oppWon && cell.forWon >= 2) {
        // Teal — FOR escape route
        const alpha = 0.18 + volFactor * 0.40;
        fillStyle = `rgba(20,184,166,${alpha.toFixed(2)})`;
      } else if (cell.oppWon > cell.forWon) {
        // Red — OPP trap zone
        const alpha = 0.18 + volFactor * 0.40;
        fillStyle = `rgba(239,68,68,${alpha.toFixed(2)})`;
      } else {
        // Amber — contested
        fillStyle = `rgba(245,158,11,0.22)`;
      }
      ctx.fillStyle = fillStyle;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  // ── Kickout event markers (spatial precision overlay) ─────────────────────
  const kickoutEvts = events.filter(
    (e) => e.kind === "KICKOUT_WON" || e.kind === "KICKOUT_CONCEDED",
  );
  renderHtMarkers(ctx, kickoutEvts, inner);

  // ── Zone W/L badges ───────────────────────────────────────────────────────
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  ctx.font         = "bold 12px sans-serif";
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const cell = grid[col][row];
      if (cell.total === 0) continue;
      const bounds = {
        xMin: COL_BOUNDS[col].xMin, xMax: COL_BOUNDS[col].xMax,
        yMin: ROW_BOUNDS[row].yMin, yMax: ROW_BOUNDS[row].yMax,
      };
      const rect    = zonePixelRect(bounds, inner);
      const midX    = rect.x + rect.w / 2;
      const midY    = rect.y + rect.h / 2;
      const label   = `${cell.forWon}W/${cell.oppWon}L`;
      const tw      = ctx.measureText(label).width + 14;
      const isEsc   = cell.forWon > cell.oppWon && cell.forWon >= 2;
      ctx.fillStyle = isEsc ? "rgba(20,184,166,0.88)" : "rgba(239,68,68,0.88)";
      ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, midX, midY);
    }
  }
  ctx.restore();

  // ── Tactical Threat Overlays + Pattern Arrows ─────────────────────────────
  // Threat rings/badges on OPP-dominant zones.
  // primary=OPP kickout wins (3×), mitigating=FOR kickout wins (1×)
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const cell  = grid[col][row];
      const score = computeZoneThreatScore(cell.oppWon, 0, cell.forWon);
      const level = getThreatLevel(score);
      if (level === "NONE") continue;
      const bounds = {
        xMin: COL_BOUNDS[col].xMin, xMax: COL_BOUNDS[col].xMax,
        yMin: ROW_BOUNDS[row].yMin, yMax: ROW_BOUNDS[row].yMax,
      };
      const rect = zonePixelRect(bounds, inner);
      const cx   = rect.x + rect.w / 2;
      const cy   = rect.y + rect.h / 2;
      drawThreatRings(ctx, cx, cy, level);
      const lbl =
        level === "CRITICAL" ? "KICKOUT TRAP" :
        level === "HIGH"     ? "DANGER RESTART" :
                               "WATCH";
      drawThreatBadge(ctx, cx, cy - 50, lbl, level);
    }
  }

  // ── Directional Pressure Sweeps ───────────────────────────────────────────
  // Drawn BEFORE pattern arrows so arrows render on top (higher precision).
  // Sweeps: "OPP repeatedly dominating HERE" — territorial pressure current.
  // Max 1–2 sweeps (page already has TRAP arrows; keep total density low).
  {
    let bestCol = -1, bestRow = -1, bestScore = 0;
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        const s = computeZoneThreatScore(grid[col][row].oppWon, 0, grid[col][row].forWon);
        if (s > bestScore) { bestScore = s; bestCol = col; bestRow = row; }
      }
    }
    if (bestCol >= 0 && getThreatLevel(bestScore) !== "NONE") {
      const rect = zonePixelRect({
        xMin: COL_BOUNDS[bestCol].xMin, xMax: COL_BOUNDS[bestCol].xMax,
        yMin: ROW_BOUNDS[bestRow].yMin, yMax: ROW_BOUNDS[bestRow].yMax,
      }, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestScore / 10, 1.0);
      // OPP flooding this kickout landing zone from midfield direction
      drawDirectionalPressureSweep(ctx, cx + rect.w * 0.40, cy - rect.h * 0.24, cx - rect.w * 0.08, cy, intensity, "PRESSURE_INWARD");
      if (getThreatLevel(bestScore) === "CRITICAL") {
        // Critical trap: converging second sweep from lateral edge
        drawDirectionalPressureSweep(ctx, cx - rect.w * 0.36, cy + rect.h * 0.24, cx, cy, intensity * 0.60, "PRESSURE_COLLAPSE");
      }
    }
  }

  // Pattern arrows: TRAP (OPP wins kickout → OPP scores next).
  // Source = kickout landing zone; destination = OPP's next score zone.
  // Uses explicit KickoutOutcome chain data — no spatial inference.
  // Threshold: ≥2 occurrences per zone pair; max 3 arrows.
  {
    const trapCounts = new Map<string, {
      srcCol: number; srcRow: number; dstCol: number; dstRow: number; count: number;
    }>();

    for (const outcome of analysis.kickouts.outcomes) {
      if (outcome.winningSide !== "OPP") continue;
      if (outcome.nextScore === null) continue;
      const kNx    = outcome.kickoutEvent.nx;
      const kNy    = outcome.kickoutEvent.ny;
      const sNx    = outcome.nextScore.nx;
      const sNy    = outcome.nextScore.ny;
      const srcCol = kNx < 0.333 ? 0 : kNx < 0.667 ? 1 : 2;
      const srcRow = kNy < 0.333 ? 0 : kNy < 0.667 ? 1 : 2;
      const dstCol = sNx < 0.333 ? 0 : sNx < 0.667 ? 1 : 2;
      const dstRow = sNy < 0.333 ? 0 : sNy < 0.667 ? 1 : 2;
      if (srcCol === dstCol && srcRow === dstRow) continue;   // same zone — no arrow
      const key = `${srcCol},${srcRow}→${dstCol},${dstRow}`;
      const existing = trapCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        trapCounts.set(key, { srcCol, srcRow, dstCol, dstRow, count: 1 });
      }
    }

    const arrowList = [...trapCounts.values()]
      .filter((a) => a.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    for (const arrow of arrowList) {
      const srcRect = zonePixelRect({
        xMin: COL_BOUNDS[arrow.srcCol].xMin, xMax: COL_BOUNDS[arrow.srcCol].xMax,
        yMin: ROW_BOUNDS[arrow.srcRow].yMin, yMax: ROW_BOUNDS[arrow.srcRow].yMax,
      }, inner);
      const dstRect = zonePixelRect({
        xMin: COL_BOUNDS[arrow.dstCol].xMin, xMax: COL_BOUNDS[arrow.dstCol].xMax,
        yMin: ROW_BOUNDS[arrow.dstRow].yMin, yMax: ROW_BOUNDS[arrow.dstRow].yMax,
      }, inner);
      drawPatternArrow(
        ctx,
        srcRect.x + srcRect.w / 2, srcRect.y + srcRect.h / 2,
        dstRect.x + dstRect.w / 2, dstRect.y + dstRect.h / 2,
        "TRAP",
      );
    }
  }

  // ── Right-side analysis panel ─────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";

  // Legend
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(20,184,166,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("FOR wins", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(239,68,68,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("OPP wins", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(245,158,11,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Contested", lx + 22, ly); ly += 36;

  // Find best escape route (highest FOR win rate, min 2 kicks)
  let bestEscCol = -1, bestEscRow = -1, bestEscRate = 0;
  let worstTrapCol = -1, worstTrapRow = -1, worstTrapRate = 0;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const cell = grid[col][row];
      if (cell.total < 2) continue;
      const winRate  = cell.forWon  / cell.total;
      const lossRate = cell.oppWon / cell.total;
      if (winRate > bestEscRate)   { bestEscRate  = winRate;  bestEscCol  = col; bestEscRow  = row; }
      if (lossRate > worstTrapRate) { worstTrapRate = lossRate; worstTrapCol = col; worstTrapRow = row; }
    }
  }

  if (bestEscCol >= 0) {
    const esc = grid[bestEscCol][bestEscRow];
    ctx.fillStyle = "#14b8a6";
    ctx.font      = "bold 12px sans-serif";
    ctx.fillText("ESCAPE ROUTE", lx, ly); ly += 20;
    ctx.fillStyle = "#f1f5f9";
    ctx.font      = "14px sans-serif";
    ctx.fillText(`${COL_NAMES[bestEscCol]}`, lx, ly); ly += 18;
    ctx.fillText(`${ROW_NAMES[bestEscRow]} channel`, lx, ly); ly += 18;
    ctx.fillStyle = "#64748b";
    ctx.fillText(`${esc.forWon}W / ${esc.oppWon}L`, lx, ly);
    if (esc.forToScore > 0) {
      ly += 16;
      ctx.fillText(`${esc.forToScore} led to score`, lx, ly);
    }
    ly += 28;
  }

  if (worstTrapCol >= 0 && !(worstTrapCol === bestEscCol && worstTrapRow === bestEscRow)) {
    const trap = grid[worstTrapCol][worstTrapRow];
    ctx.fillStyle = "#ef4444";
    ctx.font      = "bold 12px sans-serif";
    ctx.fillText("TRAP ZONE", lx, ly); ly += 20;
    ctx.fillStyle = "#f1f5f9";
    ctx.font      = "14px sans-serif";
    ctx.fillText(`${COL_NAMES[worstTrapCol]}`, lx, ly); ly += 18;
    ctx.fillText(`${ROW_NAMES[worstTrapRow]} channel`, lx, ly); ly += 18;
    ctx.fillStyle = "#64748b";
    ctx.fillText(`${trap.forWon}W / ${trap.oppWon}L`, lx, ly);
  }
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const ko          = analysis.kickouts;
  const koRate      = ko.total > 0 ? Math.round((ko.won / ko.total) * 100) : 0;
  const ftRestartTerm = sport === "hurling" ? "puckouts" : "kickouts";
  const facts: string[] = [];
  if (ko.total > 0)
    facts.push(`${homeTeam.slice(0, 14)} ${ftRestartTerm}: ${ko.won}W · ${ko.total - ko.won}L (${koRate}% won)`);
  // Possession Chain V1: richer conversion language (rate, not just count)
  if (ko.wonToScore > 0) {
    const wsPct = Math.round(ko.wonToScorePercent);
    facts.push(`${homeTeam.slice(0, 14)}: ${ko.wonToScore} of ${ko.won} wins converted to score (${wsPct}%)`);
  }
  if (ko.lostAllowedScore > 0) {
    const lsPct = Math.round(ko.lostAllowedScorePercent);
    facts.push(`${awayTeam.slice(0, 14)} scored from ${ko.lostAllowedScore} of those restarts won (${lsPct}%)`);
  }
  if (bestEscCol >= 0 && facts.length < 3) {
    const esc = grid[bestEscCol][bestEscRow];
    facts.push(`Best escape: ${COL_NAMES[bestEscCol].toLowerCase()} ${ROW_NAMES[bestEscRow].toLowerCase()} (${esc.forWon}W/${esc.oppWon}L)`);
  }
  if (facts.length === 0) facts.push(`No ${ftRestartTerm} data recorded.`);

  drawHtCalloutStrip(ctx, facts, ["#14b8a6", "#14b8a6", "#ef4444"]);
  drawEventCountFooter(ctx, kickoutEvts.length);
  return canvas;
}

// ─── FT Page 12: Tactical Match Story ────────────────────────────────────────

/**
 * Tactical Match Story — the narrative arc of the match in visual + editorial form.
 *
 * Structure:
 *   FLOW RIVER  Full-width segment control bar (green/red/amber, same logic as
 *               makeHtGameFlowPage). The spine of the story — instant visual read.
 *
 *   STORY PINS  Up to 6 pinned moments hanging below the flow bar. Each pin
 *               is a colour-coded vertical stem + card with a 2-line caption:
 *               control swings, best/worst phases, scoring runs ≥ 3.
 *
 *   MATCH STORY  3–4 editorial sentences derived algorithmically from segment
 *               control data, kickout analysis, shot efficiency, and scoring runs.
 *               Template-based — no AI, no natural-language generation.
 *               Reads like a match programme, not a stats dump.
 *
 * Show layer: flow river + story pins (spatial/visual narrative at a glance).
 * Tell layer: match story sentences (confirm and deepen the visual read).
 *
 * Data: events (all periods) + ChainAnalysis (scoringRuns, kickouts, turnovers).
 */
function makeFtTacticalMatchStoryPage(
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
  drawPageHeader(ctx, "Tactical Match Story", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Segment control data (same logic as makeHtGameFlowPage, inline) ───────
  const segNums = Array.from(
    new Set(
      events
        .map((e) => e.segment)
        .filter((s): s is MatchEventSegment => s != null),
    ),
  ).sort((a, b) => a - b);

  type SegControl = "FOR" | "OPP" | "CONTESTED";
  type SegData = {
    seg: MatchEventSegment;
    label: string;
    forScore: number;
    oppScore: number;
    kickoutBalance: number;
    controlScore: number;
    status: SegControl;
  };

  const segDataList: SegData[] = segNums.map((seg) => {
    const segEvts       = events.filter((e) => e.segment === seg);
    const forScore      = scoreFromEvents(segEvts.filter((e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind))).total;
    const oppScore      = scoreFromEvents(segEvts.filter((e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind))).total;
    const koWon         = segEvts.filter((e) => e.kind === "KICKOUT_WON").length;
    const koConceded    = segEvts.filter((e) => e.kind === "KICKOUT_CONCEDED").length;
    const toWon         = segEvts.filter((e) => e.kind === "TURNOVER_WON").length;
    const toLost        = segEvts.filter((e) => e.kind === "TURNOVER_LOST").length;
    const kickoutBalance  = koWon - koConceded;
    const turnoverBalance = toWon - toLost;
    const controlScore    = (forScore - oppScore) * 2 + kickoutBalance + Math.round(turnoverBalance * 0.5);
    const status: SegControl = controlScore >= 2 ? "FOR" : controlScore <= -2 ? "OPP" : "CONTESTED";
    const start = (seg - 1) * 10;
    const end   = seg * 10;
    return { seg, label: `${start}–${end}'`, forScore, oppScore, kickoutBalance, controlScore, status };
  });

  // ── Layout constants ──────────────────────────────────────────────────────
  const RIVER_X  = 80;
  const RIVER_Y  = 130;
  const RIVER_W  = CANVAS_W - 160;
  const RIVER_H  = 160;
  const N        = segDataList.length;
  const SEG_GAP  = 8;
  const segW     = N > 0 ? Math.floor((RIVER_W - SEG_GAP * (N - 1)) / N) : RIVER_W;

  // Sub-heading
  ctx.fillStyle    = "#64748b";
  ctx.font         = "16px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign    = "left";
  ctx.fillText("MATCH NARRATIVE  ·  Segment control + key moments + editorial summary", RIVER_X, RIVER_Y - 12);

  // ── Draw flow river ───────────────────────────────────────────────────────
  if (segDataList.length > 0) {
    segDataList.forEach((sd, i) => {
      const bx = RIVER_X + i * (segW + SEG_GAP);
      const barColor =
        sd.status === "FOR"  ? "#22c55e" :
        sd.status === "OPP"  ? "#ef4444" :
                               "#f59e0b";
      ctx.globalAlpha = 0.88;
      ctx.fillStyle   = barColor;
      ctx.fillRect(bx, RIVER_Y, segW, RIVER_H);
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth   = 1;
      ctx.strokeRect(bx, RIVER_Y, segW, RIVER_H);

      // Score diff (large, centred)
      const diff      = sd.forScore - sd.oppScore;
      const diffLabel = diff > 0 ? `+${diff}` : String(diff);
      ctx.font         = "bold 40px sans-serif";
      ctx.fillStyle    = "rgba(255,255,255,0.90)";
      ctx.textBaseline = "middle";
      ctx.textAlign    = "center";
      ctx.fillText(diffLabel, bx + segW / 2, RIVER_Y + RIVER_H / 2 + 4);

      // Time label bottom of bar
      ctx.font      = "bold 14px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(sd.label, bx + segW / 2, RIVER_Y + RIVER_H - 12);
    });
  } else {
    // No segment data fallback
    ctx.fillStyle    = "#64748b";
    ctx.font         = "20px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    ctx.fillText("No segment data available.", CANVAS_W / 2, RIVER_Y + RIVER_H / 2);
  }

  // ── Story pins ────────────────────────────────────────────────────────────
  // Pins hang below the flow river: stem from RIVER_Y+RIVER_H downward, card below.
  type StoryPin = {
    segIdx: number;
    title: string;
    sub: string;
    color: string;
  };

  const pins: StoryPin[] = [];

  // 1. Control flips (adjacent segments switching between FOR and OPP)
  for (let i = 1; i < segDataList.length && pins.length < 6; i++) {
    const prev = segDataList[i - 1];
    const curr = segDataList[i];
    if (
      prev.status !== "CONTESTED" &&
      curr.status !== "CONTESTED" &&
      prev.status !== curr.status
    ) {
      pins.push({
        segIdx: i,
        title:  "CONTROL SWING",
        sub:    `${prev.status} → ${curr.status}`,
        color:  curr.status === "OPP" ? "#ef4444" : "#22c55e",
      });
    }
  }

  // 2. Best FOR segment (control score ≥ 4)
  const bestForIdx = segDataList.reduce(
    (best, sd, idx) => sd.controlScore > (segDataList[best]?.controlScore ?? -Infinity) ? idx : best, 0,
  );
  const bestSd = segDataList[bestForIdx];
  if (bestSd && bestSd.controlScore >= 4 && !pins.some((p) => p.segIdx === bestForIdx) && pins.length < 6) {
    pins.push({
      segIdx: bestForIdx,
      title:  "BEST PHASE",
      sub:    `+${bestSd.forScore - bestSd.oppScore} score diff`,
      color:  "#22c55e",
    });
  }

  // 3. Hardest FOR segment (control score ≤ -4)
  const worstForIdx = segDataList.reduce(
    (worst, sd, idx) => sd.controlScore < (segDataList[worst]?.controlScore ?? Infinity) ? idx : worst, 0,
  );
  const worstSd = segDataList[worstForIdx];
  if (worstSd && worstSd.controlScore <= -4 && !pins.some((p) => p.segIdx === worstForIdx) && pins.length < 6) {
    pins.push({
      segIdx: worstForIdx,
      title:  "TOUGH PHASE",
      sub:    `${worstSd.forScore - worstSd.oppScore} score diff`,
      color:  "#ef4444",
    });
  }

  // 4. Scoring runs ≥ 3
  for (const run of analysis.scoringRuns.runs) {
    if (run.count < 3 || pins.length >= 6) break;
    // Map clock seconds to segment index (600s = ~10 min per segment)
    const rawIdx  = run.startClockSeconds > 0
      ? Math.min(Math.floor(run.startClockSeconds / 600), segDataList.length - 1)
      : (run.period === "1H" ? 1 : Math.max(3, segDataList.length - 2));
    const segIdx  = Math.max(0, Math.min(rawIdx, segDataList.length - 1));
    if (pins.some((p) => p.segIdx === segIdx)) continue;
    const teamLabel = run.teamSide === "FOR" ? homeTeam : "Opposition";
    pins.push({
      segIdx,
      title: `${run.count}-SCORE RUN`,
      sub:   `${teamLabel}`,
      color: run.teamSide === "FOR" ? "#22c55e" : "#ef4444",
    });
  }

  // Sort pins by segment position
  pins.sort((a, b) => a.segIdx - b.segIdx);

  // Render pins
  const PIN_STEM_TOP  = RIVER_Y + RIVER_H;
  const PIN_STEM_H    = 28;
  const PIN_CARD_H    = 72;
  const PIN_CARD_ACCW = 4;

  for (const pin of pins) {
    if (pin.segIdx >= segDataList.length) continue;
    const bx     = RIVER_X + pin.segIdx * (segW + SEG_GAP);
    const stemX  = bx + segW / 2;
    const cardY  = PIN_STEM_TOP + PIN_STEM_H;
    const cardW  = Math.min(segW + SEG_GAP - 4, 260);
    const cardX  = Math.max(RIVER_X, Math.min(stemX - cardW / 2, RIVER_X + RIVER_W - cardW));

    // Stem
    ctx.strokeStyle = pin.color;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(stemX, PIN_STEM_TOP);
    ctx.lineTo(stemX, PIN_STEM_TOP + PIN_STEM_H);
    ctx.stroke();

    // Stem circle
    ctx.fillStyle = pin.color;
    ctx.beginPath();
    ctx.arc(stemX, PIN_STEM_TOP + PIN_STEM_H, 5, 0, Math.PI * 2);
    ctx.fill();

    // Card background
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(cardX + PIN_CARD_ACCW, cardY, cardW - PIN_CARD_ACCW, PIN_CARD_H);

    // Card accent bar
    ctx.fillStyle = pin.color;
    ctx.fillRect(cardX, cardY, PIN_CARD_ACCW, PIN_CARD_H);

    // Card title
    ctx.font         = "bold 16px sans-serif";
    ctx.fillStyle    = "#f1f5f9";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign    = "left";
    ctx.fillText(pin.title, cardX + PIN_CARD_ACCW + 10, cardY + 28);

    // Card sub-text
    ctx.font      = "13px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(pin.sub, cardX + PIN_CARD_ACCW + 10, cardY + 50);
  }

  // ── Editorial match story text ────────────────────────────────────────────
  const STORY_Y = PIN_STEM_TOP + PIN_STEM_H + PIN_CARD_H + 44;

  // Section label
  ctx.fillStyle    = "#64748b";
  ctx.font         = "bold 13px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign    = "left";
  ctx.fillText("MATCH STORY", RIVER_X, STORY_Y);

  // Separator line
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(RIVER_X, STORY_Y + 10);
  ctx.lineTo(RIVER_X + RIVER_W, STORY_Y + 10);
  ctx.stroke();

  // Derive editorial sentences (template-based, no AI)
  const forCtrlCount = segDataList.filter((s) => s.status === "FOR").length;
  const oppCtrlCount = segDataList.filter((s) => s.status === "OPP").length;
  const totalSegs    = segDataList.length;
  const ko           = analysis.kickouts;
  const forShots     = events.filter((e) => e.teamSide === "FOR" && PDF_KIND_SETS.SHOTS.has(e.kind));
  const forScoreEvts = events.filter((e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind));
  const forWides     = events.filter((e) => e.teamSide === "FOR" && (e.kind === "WIDE" || isFreeMiss(e))).length;
  const shotEff      = forShots.length > 0 ? Math.round((forScoreEvts.length / forShots.length) * 100) : 0;

  const sentences: string[] = [];

  // 1. Control summary
  if (forCtrlCount > oppCtrlCount) {
    sentences.push(
      `${homeTeam} controlled ${forCtrlCount} of ${totalSegs} segments, dominating possession for long periods.`,
    );
  } else if (oppCtrlCount > forCtrlCount) {
    sentences.push(
      `A difficult match — ${homeTeam} conceded control in ${oppCtrlCount} of ${totalSegs} segments.`,
    );
  } else if (totalSegs > 0) {
    sentences.push(
      `An evenly contested match — both teams controlled ${forCtrlCount} segment${forCtrlCount !== 1 ? "s" : ""} each.`,
    );
  }

  // 2. Kickout narrative
  if (ko.total >= 3) {
    if (ko.won > ko.lost) {
      sentences.push(
        `Restart dominance was a clear platform: won ${ko.won} of ${ko.total} kickouts${ko.wonToScore > 0 ? `, converting ${ko.wonToScore} to score${ko.wonToScore !== 1 ? "s" : ""}` : ""}.`,
      );
    } else if (ko.lost > ko.won) {
      sentences.push(
        `Restart losses were costly — conceded ${ko.lost} of ${ko.total} kickouts${ko.lostAllowedScore > 0 ? `, allowing ${ko.lostAllowedScore} opposition score${ko.lostAllowedScore !== 1 ? "s" : ""}` : ""}.`,
      );
    }
  }

  // 3. Attack narrative
  if (forShots.length >= 3) {
    if (shotEff >= 60) {
      sentences.push(
        `Clinical in front of goal: ${forScoreEvts.length} scores from ${forShots.length} attempts (${shotEff}% efficiency).`,
      );
    } else if (forWides >= 4) {
      sentences.push(
        `${forWides} wides and misses undermined the tally — ${shotEff}% efficiency from ${forShots.length} attempts.`,
      );
    } else {
      sentences.push(
        `Shot accuracy: ${forScoreEvts.length} of ${forShots.length} attempts converted (${shotEff}%).`,
      );
    }
  }

  // 4. Momentum / scoring run narrative
  const bestFor = analysis.scoringRuns.maxConsecutiveFor;
  const bestOpp = analysis.scoringRuns.maxConsecutiveOpp;
  if (bestFor >= 3 || bestOpp >= 3) {
    if (bestFor >= bestOpp) {
      sentences.push(`Best scoring run: ${bestFor} consecutive — a key period of momentum.`);
    } else {
      sentences.push(`Opposition mounted a ${bestOpp}-score run — a momentum shift to address.`);
    }
  } else if (analysis.turnovers.wonToScore > 0) {
    sentences.push(
      `Turnover-to-score: ${analysis.turnovers.wonToScore} possession win${analysis.turnovers.wonToScore !== 1 ? "s" : ""} converted directly into scores.`,
    );
  }

  // Render sentences (22px, 44px line spacing)
  const SENTENCE_X   = RIVER_X;
  const SENTENCE_Y0  = STORY_Y + 30;
  const LINE_SPACING = 42;
  ctx.font         = "22px sans-serif";
  ctx.fillStyle    = "#e2e8f0";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign    = "left";
  sentences.slice(0, 4).forEach((sentence, i) => {
    ctx.fillText(sentence, SENTENCE_X, SENTENCE_Y0 + i * LINE_SPACING);
  });

  // ── Possession Chain V1 block ─────────────────────────────────────────────
  // Rendered in the gap between the editorial sentences and the callout strip.
  // drawPossessionChainBlock is a no-op when chain observations array is empty.
  {
    const pcObs = derivePossessionChainObservations(analysis);
    const sentenceCount = Math.min(sentences.length, 4);
    const pcY = SENTENCE_Y0 + sentenceCount * LINE_SPACING + 28;
    drawPossessionChainBlock(ctx, pcObs, RIVER_X, pcY, RIVER_W);
  }

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const forFinal  = scoreFromEvents(forScoreEvts);
  const oppFinal  = scoreFromEvents(events.filter((e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind)));
  const scoreDiff = forFinal.total - oppFinal.total;
  const facts: string[] = [];
  facts.push(`${fmtScore(forFinal)} vs ${fmtScore(oppFinal)} — ${scoreDiff > 0 ? `${homeTeam} won by ${scoreDiff}` : scoreDiff < 0 ? `${awayTeam.slice(0, 12)} won by ${Math.abs(scoreDiff)}` : "draw"}`);
  if (forCtrlCount > 0) facts.push(`${homeTeam.slice(0, 14)} controlled ${forCtrlCount} segment${forCtrlCount !== 1 ? "s" : ""}`);
  if (ko.total > 0)     facts.push(`${homeTeam.slice(0, 14)} won ${ko.won} of ${ko.total} kickouts`);

  drawHtCalloutStrip(ctx, facts, ["#f8fafc", "#22c55e", "#14b8a6"]);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);
  return canvas;
}

// ─── Chain Pressure — FT Page 6 ──────────────────────────────────────────────
// rankChainPatterns, ChainPressurePattern, cpCol, cpRow, cpQualifies imported
// from ./chains/chain-patterns — shared with HT Notes / FT Summary intelligence.

/**
 * CHAIN PRESSURE — FT Page 6
 *
 * Split-field layout:
 *   LEFT  (55%): pitch with overlays for rank #1 and #2 patterns only
 *   RIGHT (42%): three ranked insight cards, largest at top
 *
 * Builder signature follows existing FT page convention (events + sport + analysis).
 */
function makeChainPressurePage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
  mode: "FT" | "HT" = "FT",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Possession Patterns", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Rank patterns ──────────────────────────────────────────────────────────
  const patterns = rankChainPatterns(analysis, mode, homeTeam, awayTeam);

  // ── Colour helpers (all based on kind — no new palette colours) ───────────
  // headline is threaded through so "Possession Lost → Score" (a DANGER_CHAIN
  // whose root cause is a turnover, not a kickout error) renders amber instead
  // of red — amber = possession-loss patterns across pitch AND cards.
  function cpRgb(kind: ChainPressureKind, headline?: string): string {
    if (kind === "DANGER_CHAIN") {
      // Possession Lost → Score: amber — possession loss. Kickout Loss → Score: red — scoring danger.
      return headline === "Possession Lost → Score" ? "245,158,11" : "239,68,68";
    }
    if (kind === "CHAIN_WEAPON")     return "34,197,94";
    if (kind === "PRESSURE_PATTERN") return "245,158,11";
    return "129,140,248";
  }
  function cpHex(kind: ChainPressureKind, headline?: string): string {
    if (kind === "DANGER_CHAIN") {
      return headline === "Possession Lost → Score" ? "#f59e0b" : "#ef4444";
    }
    if (kind === "CHAIN_WEAPON")     return "#22c55e";
    if (kind === "PRESSURE_PATTERN") return "#f59e0b";
    return "#818cf8";
  }
  function cpSeverity(score: number): "CRITICAL" | "HIGH" | "ELEVATED" | "WATCH" {
    if (score >= 15) return "CRITICAL";
    if (score >= 10) return "HIGH";
    if (score >= 6)  return "ELEVATED";
    return "WATCH";
  }
  function cpThreatLevel(score: number): ThreatLevel {
    if (score >= 15) return "CRITICAL";
    if (score >= 10) return "HIGH";
    if (score >= 6)  return "ELEVATED";
    return "NONE";
  }

  // ── Pitch (narrower than full-width — panel reserved on right) ─────────────
  // w=1044: same math as HT_PITCH_AREA but stopping before the right panel gap.
  const CP_PITCH = { x: 24, y: 80, w: 1044, h: 810 };
  const inner    = renderPitch(ctx, sport, CP_PITCH);

  const CP_COL_BOUNDS = [
    { xMin: 0,     xMax: 33.33 },
    { xMin: 33.33, xMax: 66.67 },
    { xMin: 66.67, xMax: 100   },
  ] as const;
  const CP_ROW_BOUNDS = [
    { yMin: 0,     yMax: 33.33 },
    { yMin: 33.33, yMax: 66.67 },
    { yMin: 66.67, yMax: 100   },
  ] as const;

  // ── Pitch event markers ────────────────────────────────────────────────────
  // Show kickout + turnover events so the pitch has spatial reference.
  const pitchEvts = events.filter(
    (e) => e.kind === "KICKOUT_WON"    ||
           e.kind === "KICKOUT_CONCEDED" ||
           e.kind === "TURNOVER_WON"   ||
           e.kind === "TURNOVER_LOST",
  );
  renderHtMarkers(ctx, pitchEvts, inner);

  // ── Soft amber ground-tone: PRESSURE_PATTERN / turnover-pressure zones ───
  // Drawn first so stronger rank-based fills render on top.
  // Covers all ranked patterns of the pressure/turnover type — including rank #3
  // which the main overlay loop intentionally skips for labels/rings/arrows.
  // Green = success platform · Amber = pressure building · Red = active damage.
  // No rings, no badges, no arrows — ambient fill only.
  for (const pattern of patterns) {
    const isTurnoverConceded = pattern.headline === "Possession Lost → Score";
    if (pattern.kind !== "PRESSURE_PATTERN" && !isTurnoverConceded) continue;
    if (pattern.zoneCol === null || pattern.zoneRow === null) continue;

    const col    = pattern.zoneCol;
    const row    = pattern.zoneRow;
    const bounds = {
      xMin: CP_COL_BOUNDS[col].xMin, xMax: CP_COL_BOUNDS[col].xMax,
      yMin: CP_ROW_BOUNDS[row].yMin, yMax: CP_ROW_BOUNDS[row].yMax,
    };
    const rect = zonePixelRect(bounds, inner);
    // rank #1 → 0.22; rank #2 → 0.18; rank #3 → 0.14 (lightest — no other decoration)
    const alpha = pattern.rank === 1 ? 0.22 : pattern.rank === 2 ? 0.18 : 0.14;
    ctx.fillStyle = `rgba(245,158,11,${alpha})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Pitch overlays: rank #1 and rank #2 ONLY ─────────────────────────────
  const seenZones = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.rank === 3) continue;                          // anti-clutter law
    if (pattern.zoneCol === null || pattern.zoneRow === null) continue;

    const col  = pattern.zoneCol;
    const row  = pattern.zoneRow;
    const zKey = `${col},${row}`;

    // If rank #2 wants the same zone as rank #1, skip its overlay — card still renders
    if (seenZones.has(zKey)) continue;
    seenZones.add(zKey);

    const bounds = {
      xMin: CP_COL_BOUNDS[col].xMin, xMax: CP_COL_BOUNDS[col].xMax,
      yMin: CP_ROW_BOUNDS[row].yMin, yMax: CP_ROW_BOUNDS[row].yMax,
    };
    const rect      = zonePixelRect(bounds, inner);
    const cx        = rect.x + rect.w / 2;
    const cy        = rect.y + rect.h / 2;
    const rgb       = cpRgb(pattern.kind, pattern.headline);
    const hex       = cpHex(pattern.kind, pattern.headline);
    const fillAlpha = pattern.rank === 1 ? 0.26 : 0.16;

    // Zone fill
    ctx.fillStyle = `rgba(${rgb},${fillAlpha})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    // Threat rings
    const ringLevel = cpThreatLevel(pattern.priorityScore);
    const isTurnoverConceded = pattern.headline === "Possession Lost → Score";
    if (isTurnoverConceded && ringLevel !== "NONE") {
      // Amber dashed ring — signals possession-loss origin, not scoring danger.
      // Mirrors drawThreatRings ring count logic but locks colour to amber so
      // the pitch reads: amber zone + amber ring = turnover pressure.
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
      const amberRgb = "245,158,11";
      const tcRadii = ringLevel === "CRITICAL" ? [30, 48, 66]
                    : ringLevel === "HIGH"      ? [30, 48]
                    :                            [30];
      for (const r of tcRadii) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${amberRgb},0.55)`;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    } else if (ringLevel !== "NONE") {
      drawThreatRings(ctx, cx, cy, ringLevel);
    }

    // Threat badge — rank #1 only (keeps rank #2 visually quieter)
    if (pattern.rank === 1) {
      // "Possession Lost → Score" gets a distinct label; badge colour is still
      // threat-level driven (communicates urgency separately from pattern type).
      const badgeLbl =
        isTurnoverConceded                   ? "POSSESSION RISK"  :
        pattern.kind === "DANGER_CHAIN"      ? "KICKOUT RISK"     :
        pattern.kind === "CHAIN_WEAPON"      ? "POSSESSION WIN"   :
        pattern.kind === "PRESSURE_PATTERN"  ? "KICKOUT CONTEST"  :
                                               "MISSED CHANCES";
      drawThreatBadge(ctx, cx, cy - 52, badgeLbl, ringLevel !== "NONE" ? ringLevel : "ELEVATED");
    }

    // Directional pressure sweep
    {
      const intensity =
        pattern.rank === 1
          ? Math.min(pattern.priorityScore / 20, 1.0)
          : Math.min(pattern.priorityScore / 32, 0.65);
      // Possession Lost → Score uses PRESSURE_COLLAPSE (amber sweep) — possession
      // lost in zone, not an active scoring threat entering from outside.
      const sweepKind =
        pattern.kind === "CHAIN_WEAPON"                                            ? "PRESSURE_EXIT"    :
        isTurnoverConceded                                                         ? "PRESSURE_COLLAPSE" :
        pattern.kind === "DANGER_CHAIN"                                            ? "PRESSURE_INWARD"  :
        pattern.kind === "PRESSURE_PATTERN"                                        ? "PRESSURE_INWARD"  :
                                                                                     "PRESSURE_COLLAPSE";
      drawDirectionalPressureSweep(
        ctx,
        cx + rect.w * 0.36, cy - rect.h * 0.22,
        cx,                  cy,
        intensity, sweepKind,
      );
    }

    // Pattern arrow — rank #1 only, requires explicit chain evidence (≥2 occurrences)
    if (pattern.rank === 1 && pattern.arrowKind !== null) {
      if (pattern.arrowKind === "TRAP" && pattern.headline === "Kickout Loss → Score") {
        // TRAP: OPP won kickout here → OPP scored there
        // Zone-pair deduplication + ≥2 threshold (identical guard as RestartEscapeRoutes)
        const trapMap = new Map<string, {
          sc: number; sr: number; dc: number; dr: number; n: number;
        }>();
        for (const o of analysis.kickouts.outcomes) {
          if (o.winningSide !== "OPP" || o.nextScore === null) continue;
          const sc = cpCol(o.kickoutEvent.nx); const sr = cpRow(o.kickoutEvent.ny);
          const dc = cpCol(o.nextScore.nx);    const dr = cpRow(o.nextScore.ny);
          if (sc === dc && sr === dr) continue;
          const k = `${sc},${sr}→${dc},${dr}`;
          const v = trapMap.get(k);
          if (v) v.n++; else trapMap.set(k, { sc, sr, dc, dr, n: 1 });
        }
        const topTrap = [...trapMap.values()]
          .filter((a) => a.n >= 2)
          .sort((a, b) => b.n - a.n)
          .slice(0, 1);
        for (const a of topTrap) {
          const sr = zonePixelRect({ xMin: CP_COL_BOUNDS[a.sc].xMin, xMax: CP_COL_BOUNDS[a.sc].xMax, yMin: CP_ROW_BOUNDS[a.sr].yMin, yMax: CP_ROW_BOUNDS[a.sr].yMax }, inner);
          const dr = zonePixelRect({ xMin: CP_COL_BOUNDS[a.dc].xMin, xMax: CP_COL_BOUNDS[a.dc].xMax, yMin: CP_ROW_BOUNDS[a.dr].yMin, yMax: CP_ROW_BOUNDS[a.dr].yMax }, inner);
          drawPatternArrow(ctx, sr.x + sr.w / 2, sr.y + sr.h / 2, dr.x + dr.w / 2, dr.y + dr.h / 2, "TRAP");
        }

      } else if (pattern.arrowKind === "ENTRY_SCORE") {
        // ENTRY_SCORE: FOR won possession here → FOR scored there
        const entryMap = new Map<string, {
          sc: number; sr: number; dc: number; dr: number; n: number;
        }>();
        // Source outcomes: kickout wins or turnover wins that led to FOR score
        const entryOutcomes: Array<{ srcNx: number; srcNy: number; dstNx: number; dstNy: number }> = [];
        if (pattern.headline === "Kickout Platform") {
          for (const o of analysis.kickouts.outcomes) {
            if (o.winningSide !== "FOR" || o.nextScore === null) continue;
            entryOutcomes.push({ srcNx: o.kickoutEvent.nx, srcNy: o.kickoutEvent.ny, dstNx: o.nextScore.nx, dstNy: o.nextScore.ny });
          }
        } else {
          for (const o of analysis.turnovers.outcomes) {
            if (o.direction !== "WON" || o.turnoverEvent.teamSide !== "FOR" || !o.resultedInScore) continue;
            const dst = o.nextEvent;
            if (!dst) continue;
            entryOutcomes.push({ srcNx: o.turnoverEvent.nx, srcNy: o.turnoverEvent.ny, dstNx: dst.nx, dstNy: dst.ny });
          }
        }
        for (const { srcNx, srcNy, dstNx, dstNy } of entryOutcomes) {
          const sc = cpCol(srcNx); const sr = cpRow(srcNy);
          const dc = cpCol(dstNx); const dr = cpRow(dstNy);
          if (sc === dc && sr === dr) continue;
          const k = `${sc},${sr}→${dc},${dr}`;
          const v = entryMap.get(k);
          if (v) v.n++; else entryMap.set(k, { sc, sr, dc, dr, n: 1 });
        }
        const topEntry = [...entryMap.values()]
          .filter((a) => a.n >= 2)
          .sort((a, b) => b.n - a.n)
          .slice(0, 1);
        for (const a of topEntry) {
          const sr = zonePixelRect({ xMin: CP_COL_BOUNDS[a.sc].xMin, xMax: CP_COL_BOUNDS[a.sc].xMax, yMin: CP_ROW_BOUNDS[a.sr].yMin, yMax: CP_ROW_BOUNDS[a.sr].yMax }, inner);
          const dr = zonePixelRect({ xMin: CP_COL_BOUNDS[a.dc].xMin, xMax: CP_COL_BOUNDS[a.dc].xMax, yMin: CP_ROW_BOUNDS[a.dr].yMin, yMax: CP_ROW_BOUNDS[a.dr].yMax }, inner);
          drawPatternArrow(ctx, sr.x + sr.w / 2, sr.y + sr.h / 2, dr.x + dr.w / 2, dr.y + dr.h / 2, "ENTRY_SCORE");
        }
      }
    }

    // Rank indicator — filled circle with numeral, topmost layer on pitch
    {
      const IR  = 14;   // indicator radius
      const IX  = rect.x + 10 + IR;
      const IY  = rect.y + 10 + IR;
      ctx.save();
      ctx.fillStyle   = hex;
      ctx.globalAlpha = pattern.rank === 1 ? 0.95 : 0.78;
      ctx.beginPath();
      ctx.arc(IX, IY, IR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle    = "#ffffff";
      ctx.font         = `bold 14px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign    = "center";
      ctx.fillText(String(pattern.rank), IX, IY);
      ctx.restore();
    }
  }

  // ── Right-side ranked card panel ───────────────────────────────────────────
  const PANEL_X   = 1080;
  const PANEL_W   = CANVAS_W - PANEL_X - 20;    // 820px; 20px right gutter
  const PANEL_TOP = 80;
  const PANEL_BOT = HT_STRIP_TOP - 10;           // 890
  const PANEL_H   = PANEL_BOT - PANEL_TOP;       // 810

  if (patterns.length === 0) {
    // Empty state — degrade cleanly
    ctx.save();
    ctx.fillStyle    = "#64748b";
    ctx.font         = "18px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    const EX = PANEL_X + PANEL_W / 2;
    const EY = PANEL_TOP + PANEL_H / 2;
    ctx.fillText("Not enough possession data to rank patterns.", EX, EY - 14);
    ctx.font = "15px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Tag at least 6 events to generate possession patterns.", EX, EY + 14);
    ctx.restore();
  } else {
    // ── Card height proportions: [40%, 33%, 27%] — rank-3 bumped from 24% ───
    // 24% gave rank-3 only 184px (too cramped). 27% = 207px allows readable
    // text stack with proper breathing room around the metric number.
    const CARD_GAP  = 20;
    const totalGaps = (patterns.length - 1) * CARD_GAP;
    const usableH   = PANEL_H - totalGaps;

    const WEIGHT_TABLE: number[][] = [[1.0], [0.55, 0.45], [0.40, 0.33, 0.27]];
    const weights    = WEIGHT_TABLE[patterns.length - 1];
    const cardHeights = weights.map((w) => Math.floor(usableH * w));

    // Give rounding remainder to rank #1 card
    const sumH = cardHeights.reduce((s, h) => s + h, 0);
    if (cardHeights.length > 0) cardHeights[0] += usableH - sumH;

    let cardY = PANEL_TOP;

    for (let i = 0; i < patterns.length; i++) {
      const p     = patterns[i];
      const cardH = cardHeights[i];
      const rgb   = cpRgb(p.kind, p.headline);
      const hex   = cpHex(p.kind, p.headline);

      // Accent bar width: 8 / 6 / 4 px by rank
      const AW    = p.rank === 1 ? 8 : p.rank === 2 ? 6 : 4;
      const IX    = PANEL_X + AW + 18;  // inner content X
      const IW    = PANEL_W - AW - 28;  // inner content width

      // Card background
      const bgA = p.rank === 1 ? 0.062 : p.rank === 2 ? 0.040 : 0.026;
      ctx.fillStyle = `rgba(255,255,255,${bgA})`;
      ctx.fillRect(PANEL_X, cardY, PANEL_W, cardH);

      // Accent bar (rank #1 has subtle glow)
      ctx.save();
      if (p.rank === 1) {
        ctx.shadowColor = hex;
        ctx.shadowBlur  = 6;
      }
      ctx.fillStyle = hex;
      ctx.fillRect(PANEL_X, cardY, AW, cardH);
      ctx.restore();

      // ── HEADER: rank circle + badge chip ────────────────────────────────
      const HDR_MID = cardY + 24;

      // Rank circle
      {
        const R = 13;
        const CX = PANEL_X + AW + 10 + R;
        const CY = HDR_MID;
        ctx.save();
        ctx.fillStyle   = hex;
        ctx.globalAlpha = p.rank === 1 ? 1.0 : 0.82;
        ctx.beginPath();
        ctx.arc(CX, CY, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha  = 1.0;
        ctx.fillStyle    = "#ffffff";
        ctx.font         = `bold ${p.rank === 1 ? 14 : 13}px sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign    = "center";
        ctx.fillText(String(p.rank), CX, CY);
        ctx.restore();
      }

      // Badge chip
      {
        const BX   = PANEL_X + AW + 36;
        const CHIP_H = 26;   // was 24; larger chip accommodates 13px bold text
        const BY   = HDR_MID - CHIP_H / 2;
        ctx.save();
        ctx.font = "bold 13px sans-serif";  // was 10px — 4.4pt on PDF, unreadable
        const chipTW = ctx.measureText(p.badge).width;
        const CHIP_W = chipTW + 18;
        ctx.fillStyle    = `rgba(${rgb},0.20)`;
        ctx.fillRect(BX, BY, CHIP_W, CHIP_H);
        ctx.fillStyle    = hex;
        ctx.textBaseline = "middle";
        ctx.textAlign    = "left";
        ctx.fillText(p.badge, BX + 9, HDR_MID);
        ctx.restore();
      }

      // ── HEADLINE ────────────────────────────────────────────────────────
      const HL_SZ = p.rank === 1 ? 26 : p.rank === 2 ? 22 : 20;  // R3: 19→20px
      const HL_Y  = cardY + 56;
      ctx.save();
      ctx.font         = `bold ${HL_SZ}px sans-serif`;
      ctx.fillStyle    = "#f1f5f9";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign    = "left";
      ctx.fillText(p.headline, IX, HL_Y);
      ctx.restore();

      // ── OBSERVATION ─────────────────────────────────────────────────────
      const OBS_SZ = p.rank === 1 ? 16 : p.rank === 2 ? 15 : 15;  // R3: 14→15px
      const OBS_Y  = HL_Y + HL_SZ + 9;
      ctx.save();
      ctx.font         = `${OBS_SZ}px sans-serif`;
      ctx.fillStyle    = "#94a3b8";   // was #64748b — 4.07:1, below AA
      ctx.textBaseline = "alphabetic";
      ctx.textAlign    = "left";
      let obsText = p.observation;
      if (ctx.measureText(obsText).width > IW) {
        while (obsText.length > 0 && ctx.measureText(obsText + "…").width > IW) {
          obsText = obsText.slice(0, -1);
        }
        obsText += "…";
      }
      ctx.fillText(obsText, IX, OBS_Y);
      ctx.restore();

      // ── PRIMARY METRIC ───────────────────────────────────────────────────
      // Hero number — largest element in the card, immediately readable.
      // MET_GAPA is set per rank so the metric cap-top clears the observation
      // text descenders with ≥6px breathing room (previously 1–13px overlap).
      //   Rank-1 (68px): cap-top ≈ MET_Y−48; needs MET_Y ≥ OBS descenders+54
      //   Rank-2 (52px): cap-top ≈ MET_Y−36; needs MET_Y ≥ OBS descenders+42
      //   Rank-3 (40px): cap-top ≈ MET_Y−28; needs MET_Y ≥ OBS descenders+34
      const MET_SZ   = p.rank === 1 ? 68 : p.rank === 2 ? 52 : 40;
      const MET_GAPA = p.rank === 1 ? 40 : p.rank === 2 ? 28 : 22;
      const MET_Y    = OBS_Y + OBS_SZ + MET_GAPA;
      ctx.save();
      ctx.font         = `bold ${MET_SZ}px sans-serif`;
      ctx.fillStyle    = hex;
      ctx.globalAlpha  = p.rank === 1 ? 1.0 : 0.85;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign    = "left";
      ctx.fillText(String(p.primaryMetric), IX, MET_Y);
      ctx.globalAlpha  = 1.0;
      // Metric label — right of the number
      const numW = ctx.measureText(String(p.primaryMetric)).width;
      ctx.font      = "14px sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(p.metricLabel, IX + numW + 12, MET_Y - 10);
      ctx.restore();

      // ── META STRIP ───────────────────────────────────────────────────────
      // Occurrences count + severity chip — anchored to card bottom
      const META_BOT  = p.rank === 1 ? 26 : 22;
      const META_ABS  = cardY + cardH - META_BOT;
      const severity  = cpSeverity(p.priorityScore);
      // ELEVATED chip inherits the pattern's accent colour — amber for
      // possession-loss patterns (Possession Lost → Score, PRESSURE_PATTERN),
      // red for scoring-danger patterns (Kickout Loss → Score). This ends the
      // yellow-chip-on-red-card confusion.
      // CRITICAL and HIGH keep universal urgency colours (red / orange).
      const sevBg =
        severity === "CRITICAL" ? "#ef4444" :
        severity === "HIGH"     ? "#f97316" :
        severity === "ELEVATED" ? hex        :
                                  "#64748b";
      // Contrast: amber (#f59e0b) and green (#22c55e) are light-valued —
      // use dark text. All other chip backgrounds use white.
      const sevTextDark =
        severity === "ELEVATED" && (hex === "#f59e0b" || hex === "#22c55e");
      ctx.save();
      ctx.font         = "14px sans-serif";
      ctx.fillStyle    = "#94a3b8";
      ctx.textBaseline = "middle";
      ctx.textAlign    = "left";
      const occStr  = `${p.occurrences} time${p.occurrences !== 1 ? "s" : ""}`;
      ctx.fillText(occStr, IX, META_ABS);
      const occW    = ctx.measureText(occStr).width;
      // Severity chip — SEV_H 22 (was 20) to accommodate 12px bold text
      const SEV_H   = 22;
      const SEV_W   = ctx.measureText(severity).width + 16;
      ctx.font = "bold 12px sans-serif";   // was 10px — 4.4pt on PDF, unreadable
      ctx.fillStyle = sevBg;
      ctx.fillRect(IX + occW + 12, META_ABS - SEV_H / 2, SEV_W, SEV_H);
      ctx.fillStyle    = sevTextDark ? "#0d1117" : "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(severity, IX + occW + 12 + 8, META_ABS);
      ctx.restore();

      cardY += cardH + CARD_GAP;
    }
  }

  // ── Bottom callout strip ───────────────────────────────────────────────────
  const cpFacts: string[] = [];
  const cpColors: string[] = [];

  const eventsLabel = mode === "HT"
    ? "First-half possession sequences reviewed"
    : `${analysis.totalEventsAnalysed} events analysed`;

  if (patterns.length === 0) {
    cpFacts.push("Not enough first-half data to rank possession patterns.");
    cpFacts.push(eventsLabel);
    cpColors.push("#64748b", "#64748b");
  } else {
    cpFacts.push("Top 3 possession patterns");
    cpFacts.push(eventsLabel);
    cpFacts.push("Patterns ranked by match impact");
    cpColors.push(cpHex(patterns[0].kind, patterns[0].headline), "#94a3b8", "#64748b");
  }

  drawHtCalloutStrip(ctx, cpFacts, cpColors);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);
  return canvas;
}

// ─── Phase 6 coaching page builders ──────────────────────────────────────────
//
// Five new builders that form the permanent HT/FT coaching review structure.
// Inserted here (after makeChainPressurePage, before exportSnapshotPdf) so
// they share the same scope as all supporting helpers without touching anything
// above this line.
//
// Pages: Our Shot Profile · Opp Shot Profile · Our Restart Platform ·
//        Opp Restart Platform · Tactical Match Summary
//
// Free-event integration rules:
//   FREE_SCORED / FREE_MISSED are already in PDF_KIND_SETS.SHOTS → render as
//   regular shot markers and zone fills with no extra code.
//   FREE_WON  (Our Shots) — spatial marker dots when events exist.
//   FREE_CONCEDED (Opp Shots) — spatial marker dots when events exist.
//   Callout language (placed-ball counts) only from event.kind directly.
//   No schema changes. No fake inference.

// ─── p.1 Our Shot Profile ─────────────────────────────────────────────────────
/**
 * Our Shot Profile — "Where are we getting joy?"
 * FOR shots only (green = scores, red = wides). STRICT: no OPP shots.
 * FREE_SCORED / FREE_MISSED already in SHOTS → zone fills render naturally.
 * FREE_WON spatial markers added when logged (indigo dots).
 * Callout: placed-ball scores/wides + frees won count when non-zero.
 */
function makeOurShotProfilePage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Our Shot Profile", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const forScoreEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind),
  );

  const forShotEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SHOTS.has(e.kind),
  );
  // FREE_WON spatial markers — where we won frees on the pitch
  const freeWonEvts = events.filter(
    (e) => e.teamSide === "FOR" && e.kind === "FREE_WON",
  );
  // Placed-ball counts — source-tag aware
  const forFreeScored = events.filter(
    (e) => e.teamSide === "FOR" && isFreeScore(e),
  ).length;
  const forFreeMissed = events.filter(
    (e) => e.teamSide === "FOR" && isFreeMiss(e),
  ).length;

  // ── Zone counts (for headline + hotspot highlight) ────────────────────────
  const scoreCounts = pdfZoneCounts(forScoreEvts);
  // ── Headline band ─────────────────────────────────────────────────────────
  const SHOT_HEADLINE_H = 90;
  const topScoreZone = scoreCounts.reduce(
    (top, z) => z.count > (top?.count ?? 0) ? z : top,
    null as typeof scoreCounts[0] | null,
  );
  const totalShots  = forShotEvts.length;
  const totalScores = forScoreEvts.length;
  const shotEff     = totalShots > 0 ? Math.round((totalScores / totalShots) * 100) : 0;
  const headlineText = totalShots > 0
    ? `${totalScores} score${totalScores !== 1 ? "s" : ""} from ${totalShots} shot${totalShots !== 1 ? "s" : ""} · ${shotEff}% efficiency${topScoreZone && topScoreZone.count > 0 ? ` · Best zone: ${topScoreZone.label}` : ""}`
    : "No shot data recorded for this match";
  ctx.save();
  ctx.fillStyle = "rgba(52,211,153,0.12)";
  ctx.fillRect(24, HT_PITCH_AREA.y, HT_PITCH_AREA.w, SHOT_HEADLINE_H);
  ctx.fillStyle = "#34d399";
  ctx.fillRect(24, HT_PITCH_AREA.y, 3, SHOT_HEADLINE_H);
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 22px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(headlineText, 54, HT_PITCH_AREA.y + SHOT_HEADLINE_H / 2, HT_PITCH_AREA.w - 60);
  ctx.restore();

  // ── Pitch ─────────────────────────────────────────────────────────────────
  const pitchArea = { x: HT_PITCH_AREA.x, y: HT_PITCH_AREA.y + SHOT_HEADLINE_H, w: HT_PITCH_AREA.w, h: HT_PITCH_AREA.h - SHOT_HEADLINE_H };
  const inner = renderPitch(ctx, sport, pitchArea);

  // Subtle border on the hottest scoring zone — no fills elsewhere
  if (topScoreZone && topScoreZone.count >= 2) {
    const rect = zonePixelRect(topScoreZone.bounds, inner);
    ctx.fillStyle = "rgba(52,211,153,0.10)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "rgba(52,211,153,0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  }

  // ── Event markers — dots tell the story ──────────────────────────────────
  // Goal = dark green  ·  Point = light green  ·  Wide = red X
  // Free won = indigo dot (spatial marker, shown when logged)
  renderHtMarkers(ctx, [...forShotEvts, ...freeWonEvts], inner);

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 180;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(52,211,153,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Our scores", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(239,68,68,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Our wides", lx + 22, ly); ly += 26;
  if (freeWonEvts.length > 0) {
    ctx.fillStyle = "#818cf8";
    ctx.fillRect(lx, ly - 8, 16, 16);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Free won", lx + 22, ly);
  }
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const totalMisses = totalShots - totalScores;
  const scoreHot    = pdfZoneHotspots(forScoreEvts)[0];

  const facts: string[]  = [];
  const colors: string[] = [];

  if (totalShots > 0) {
    facts.push(`${homeTeam.slice(0, 12)} shots: ${totalScores} scored from ${totalShots} attempts · ${totalMisses} missed (${shotEff}%)`);
    colors.push("#34d399");
  }
  if (forFreeScored > 0 || forFreeMissed > 0) {
    const parts: string[] = [];
    if (forFreeScored > 0) parts.push(`${forFreeScored} placed-ball score${forFreeScored !== 1 ? "s" : ""}`);
    if (forFreeMissed > 0) parts.push(`${forFreeMissed} placed-ball wide${forFreeMissed !== 1 ? "s" : ""}`);
    facts.push(`${homeTeam.slice(0, 12)}: ${parts.join(" · ")}`);
    colors.push("#818cf8");
  } else if (freeWonEvts.length > 0 && facts.length < 2) {
    facts.push(`${homeTeam.slice(0, 12)} won ${freeWonEvts.length} free${freeWonEvts.length !== 1 ? "s" : ""}`);
    colors.push("#818cf8");
  }
  if (scoreHot && facts.length < 3) {
    facts.push(`Best scoring zone: ${scoreHot.label} (${scoreHot.count})`);
    colors.push("#34d399");
  }
  if (facts.length === 0) facts.push("No shot data recorded.");

  drawHtCalloutStrip(ctx, facts, colors.length > 0 ? colors : ["#34d399", "#818cf8", "#34d399"]);
  drawShotAttemptFooter(ctx, totalShots);
  return canvas;
}

// ─── p.2 Opposition Shot Profile ─────────────────────────────────────────────
/**
 * Opposition Shot Profile — "Where are they hurting us?"
 * OPP shots only (red = scores, amber = wides). STRICT: no FOR shots.
 * FREE_CONCEDED (FOR teamSide) = where we gave away frees to OPP — pink spatial markers.
 * Callout: OPP placed-ball scores/wides when non-zero.
 */
function makeOppShotProfilePage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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
  drawPageHeader(ctx, "Opposition Shot Profile", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const oppScoreEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind),
  );

  const oppShotEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SHOTS.has(e.kind),
  );
  // FREE_CONCEDED (FOR) = positions where we gave away frees — pink danger markers
  const freeConcededEvts = events.filter(
    (e) => e.teamSide === "FOR" && e.kind === "FREE_CONCEDED",
  );
  // OPP placed-ball counts — source-tag aware
  const oppFreeScored = events.filter(
    (e) => e.teamSide === "OPP" && isFreeScore(e),
  ).length;
  const oppFreeMissed = events.filter(
    (e) => e.teamSide === "OPP" && isFreeMiss(e),
  ).length;

  // ── Zone counts (for headline + hotspot highlight) ────────────────────────
  const scoreCounts = pdfZoneCounts(oppScoreEvts);

  // ── Headline band ─────────────────────────────────────────────────────────
  const SHOT_HEADLINE_H = 90;
  const topScoreZone = scoreCounts.reduce(
    (top, z) => z.count > (top?.count ?? 0) ? z : top,
    null as typeof scoreCounts[0] | null,
  );
  const totalOppShots  = oppShotEvts.length;
  const totalOppScores = oppScoreEvts.length;
  const oppShotEff     = totalOppShots > 0 ? Math.round((totalOppScores / totalOppShots) * 100) : 0;
  const headlineText = totalOppShots > 0
    ? `${totalOppScores} score${totalOppScores !== 1 ? "s" : ""} from ${totalOppShots} shot${totalOppShots !== 1 ? "s" : ""} · ${oppShotEff}% efficiency${topScoreZone && topScoreZone.count > 0 ? ` · Most dangerous zone: ${topScoreZone.label}` : ""}`
    : "No opposition shot data recorded for this match";
  ctx.save();
  ctx.fillStyle = "rgba(239,68,68,0.12)";
  ctx.fillRect(24, HT_PITCH_AREA.y, HT_PITCH_AREA.w, SHOT_HEADLINE_H);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(24, HT_PITCH_AREA.y, 3, SHOT_HEADLINE_H);
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 22px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(headlineText, 54, HT_PITCH_AREA.y + SHOT_HEADLINE_H / 2, HT_PITCH_AREA.w - 60);
  ctx.restore();

  // ── Pitch ─────────────────────────────────────────────────────────────────
  const pitchArea = { x: HT_PITCH_AREA.x, y: HT_PITCH_AREA.y + SHOT_HEADLINE_H, w: HT_PITCH_AREA.w, h: HT_PITCH_AREA.h - SHOT_HEADLINE_H };
  const inner = renderPitch(ctx, sport, pitchArea);

  // Subtle border on the hottest OPP scoring zone — pitch stays clean
  if (topScoreZone && topScoreZone.count >= 2) {
    const rect = zonePixelRect(topScoreZone.bounds, inner);
    ctx.fillStyle = "rgba(239,68,68,0.10)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "rgba(239,68,68,0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  }

  // ── Event markers — dots tell the story ──────────────────────────────────
  // Goal = dark green  ·  Point = light green  ·  Wide = red X
  // Free conceded = pink dot (spatial marker, shown when logged)
  renderHtMarkers(ctx, [...oppShotEvts, ...freeConcededEvts], inner);

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 180;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(52,211,153,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Their scores", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(239,68,68,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Their wides", lx + 22, ly); ly += 26;
  if (freeConcededEvts.length > 0) {
    ctx.fillStyle = "#f472b6";
    ctx.fillRect(lx, ly - 8, 16, 16);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Free conceded", lx + 22, ly);
  }
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const totalOppMisses = totalOppShots - totalOppScores;
  const oppScoreHot    = pdfZoneHotspots(oppScoreEvts)[0];

  const facts: string[]  = [];
  const colors: string[] = [];

  if (totalOppShots > 0) {
    facts.push(`${awayTeam.slice(0, 12)} shots: ${totalOppScores} scored from ${totalOppShots} attempts · ${totalOppMisses} missed (${oppShotEff}%)`);
    colors.push("#ef4444");
  }
  if (oppFreeScored > 0 || oppFreeMissed > 0) {
    const parts: string[] = [];
    if (oppFreeScored > 0) parts.push(`${oppFreeScored} placed-ball score${oppFreeScored !== 1 ? "s" : ""}`);
    if (oppFreeMissed > 0) parts.push(`${oppFreeMissed} placed-ball wide${oppFreeMissed !== 1 ? "s" : ""}`);
    facts.push(`${awayTeam.slice(0, 12)}: ${parts.join(" · ")}`);
    colors.push("#f472b6");
  } else if (freeConcededEvts.length > 0 && facts.length < 2) {
    facts.push(`${homeTeam.slice(0, 12)} conceded ${freeConcededEvts.length} free${freeConcededEvts.length !== 1 ? "s" : ""}`);
    colors.push("#f472b6");
  }
  if (oppScoreHot && facts.length < 3) {
    facts.push(`Their best zone: ${oppScoreHot.label} (${oppScoreHot.count})`);
    colors.push("#ef4444");
  }
  if (facts.length === 0) facts.push("No opposition shot data recorded.");

  drawHtCalloutStrip(ctx, facts, colors.length > 0 ? colors : ["#ef4444", "#f472b6", "#ef4444"]);
  drawShotAttemptFooter(ctx, totalOppShots);
  return canvas;
}

// ─── p.3 Our Restart Platform ─────────────────────────────────────────────────
/**
 * Our Restart Platform — "How are our kickouts/puckouts functioning?"
 * Teal = zones we won; red = zones we lost (OPP won).
 * Threat overlays surface OPP-dominant zones as danger.
 */
function makeOurRestartPlatformPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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

  const restartTitle = sport === "hurling" ? "Our Puckout Platform" : "Our Kickout Platform";
  const restartTermLC = sport === "hurling" ? "puckouts" : "kickouts";
  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, restartTitle, `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  // FOR won = KICKOUT_WON by FOR, or KICKOUT_CONCEDED by OPP
  const forWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP"),
  );
  // OPP won = KICKOUT_CONCEDED by FOR, or KICKOUT_WON by OPP
  const oppWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_WON"      && e.teamSide === "OPP"),
  );
  const allKickoutEvts = events.filter((e) => PDF_KIND_SETS.KICKOUTS.has(e.kind));

  // ── Pitch + zone colour overlays ──────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  const forWonCounts = pdfZoneCounts(forWonEvts);
  const oppWonCounts = pdfZoneCounts(oppWonEvts);

  for (let i = 0; i < forWonCounts.length; i++) {
    const forZone = forWonCounts[i];
    const oppZone = oppWonCounts[i];
    const total   = forZone.count + oppZone.count;
    if (total === 0) continue;
    const rect      = zonePixelRect(forZone.bounds, inner);
    const diff      = forZone.count - oppZone.count;
    const intensity = Math.min(total / 4, 1);
    if (diff > 1) {
      ctx.fillStyle = `rgba(20,184,166,${(0.20 + intensity * 0.38).toFixed(2)})`;
    } else if (diff < -1) {
      ctx.fillStyle = `rgba(248,113,113,${(0.20 + intensity * 0.38).toFixed(2)})`;
    } else {
      ctx.fillStyle = "rgba(251,191,36,0.28)";
    }
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Event markers ─────────────────────────────────────────────────────────
  renderHtMarkers(ctx, allKickoutEvts, inner);

  // ── Zone badge pills ──────────────────────────────────────────────────────
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  ctx.font         = "bold 12px sans-serif";

  for (let i = 0; i < forWonCounts.length; i++) {
    const forZone = forWonCounts[i];
    const oppZone = oppWonCounts[i];
    const total   = forZone.count + oppZone.count;
    if (total === 0) continue;
    const rect   = zonePixelRect(forZone.bounds, inner);
    const midX   = rect.x + rect.w / 2;
    const midY   = rect.y + rect.h / 2;
    const label  = `${forZone.count}W / ${oppZone.count}L`;
    const tw     = ctx.measureText(label).width + 16;
    const isTeal = forZone.count > oppZone.count;
    const isRed  = oppZone.count > forZone.count;
    ctx.fillStyle = isTeal ? "rgba(20,184,166,0.88)"
                 : isRed  ? "rgba(248,113,113,0.88)"
                 :           "rgba(251,191,36,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = (isTeal || isRed) ? "#ffffff" : "#0d1117";
    ctx.fillText(label, midX, midY);
  }
  ctx.restore();

  // ── Tactical Threat Overlays ──────────────────────────────────────────────
  // OPP-dominant zones = kickout loss zones (we are conceding possession there)
  for (let i = 0; i < oppWonCounts.length; i++) {
    const oZone = oppWonCounts[i];
    const fZone = forWonCounts[i];
    const score = computeZoneThreatScore(oZone.count, 0, fZone.count);
    const level = getThreatLevel(score);
    if (level === "NONE") continue;
    const rect = zonePixelRect(oZone.bounds, inner);
    const cx   = rect.x + rect.w / 2;
    const cy   = rect.y + rect.h / 2;
    drawThreatRings(ctx, cx, cy, level);
    const lbl =
      level === "CRITICAL" ? "KICKOUT TRAP" :
      level === "HIGH"     ? "CONCESSION ZONE" :
                             "WATCH";
    drawThreatBadge(ctx, cx, cy - 50, lbl, level);
  }

  // ── Directional Pressure Sweeps ───────────────────────────────────────────
  {
    let bestIdx = -1, bestScore = 0;
    for (let i = 0; i < oppWonCounts.length; i++) {
      const s = computeZoneThreatScore(oppWonCounts[i].count, 0, forWonCounts[i].count);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    if (bestIdx >= 0 && getThreatLevel(bestScore) !== "NONE") {
      const rect      = zonePixelRect(oppWonCounts[bestIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestScore / 10, 1.0);
      drawDirectionalPressureSweep(ctx, cx + rect.w * 0.40, cy - rect.h * 0.24, cx - rect.w * 0.08, cy, intensity, "PRESSURE_INWARD");
      if (getThreatLevel(bestScore) === "CRITICAL") {
        drawDirectionalPressureSweep(ctx, cx - rect.w * 0.36, cy + rect.h * 0.24, cx, cy, intensity * 0.65, "PRESSURE_COLLAPSE");
      }
    }
  }

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(20,184,166,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("We won", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(248,113,113,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("They won", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(251,191,36,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Contested", lx + 22, ly);
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const totalFor = forWonEvts.length;
  const totalOpp = oppWonEvts.length;
  const totalKO  = totalFor + totalOpp;
  const forPct   = totalKO > 0 ? Math.round((totalFor / totalKO) * 100) : 0;
  const forHot   = pdfZoneHotspots(forWonEvts)[0];
  const oppHot   = pdfZoneHotspots(oppWonEvts)[0];

  const facts: string[] = [];
  if (totalKO > 0) facts.push(`${homeTeam.slice(0, 14)} ${restartTermLC}: ${totalFor}W · ${totalOpp}L (${forPct}% won)`);
  if (forHot)      facts.push(`Best zone: ${forHot.label}`);
  if (oppHot)      facts.push(`Conceded most: ${oppHot.label}`);
  if (facts.length === 0) facts.push(`No ${restartTermLC} data recorded.`);

  drawHtCalloutStrip(ctx, facts, ["#14b8a6", "#14b8a6", "#ef4444"]);
  drawEventCountFooter(ctx, allKickoutEvts.length);
  return canvas;
}

// ─── p.4 Opposition Restart Platform ─────────────────────────────────────────
/**
 * Opposition Restart Platform — "What are they trying to do on restarts?"
 * Amber = zones they won; teal = zones we won (our pressure on their kickouts).
 * Badge: `${oppCount}W / ${forCount}L` (THEIR wins / THEIR losses = OUR wins on their ball).
 * Threat: OPP-dominant zones = their kickout weapon.
 */
function makeOppRestartPlatformPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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

  const restartTitle = sport === "hurling" ? "Opposition Puckout Platform" : "Opposition Kickout Platform";
  const restartTermLC = sport === "hurling" ? "puckouts" : "kickouts";
  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, restartTitle, `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  // OPP won = KICKOUT_WON by OPP, or KICKOUT_CONCEDED by FOR
  const oppWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "OPP") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "FOR"),
  );
  // FOR won = KICKOUT_WON by FOR, or KICKOUT_CONCEDED by OPP (our pressure on their restarts)
  const forWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP"),
  );
  const allKickoutEvts = events.filter((e) => PDF_KIND_SETS.KICKOUTS.has(e.kind));

  // ── Pitch + zone colour overlays ──────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  const oppWonCounts = pdfZoneCounts(oppWonEvts);
  const forWonCounts = pdfZoneCounts(forWonEvts);

  for (let i = 0; i < oppWonCounts.length; i++) {
    const oppZone = oppWonCounts[i];
    const forZone = forWonCounts[i];
    const total   = oppZone.count + forZone.count;
    if (total === 0) continue;
    const rect      = zonePixelRect(oppZone.bounds, inner);
    const diff      = oppZone.count - forZone.count;
    const intensity = Math.min(total / 4, 1);
    if (diff > 1) {
      // They dominate — amber danger
      ctx.fillStyle = `rgba(245,158,11,${(0.20 + intensity * 0.38).toFixed(2)})`;
    } else if (diff < -1) {
      // We win here — teal (our pressure working)
      ctx.fillStyle = `rgba(20,184,166,${(0.20 + intensity * 0.38).toFixed(2)})`;
    } else {
      ctx.fillStyle = "rgba(251,191,36,0.22)";
    }
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Event markers ─────────────────────────────────────────────────────────
  renderHtMarkers(ctx, allKickoutEvts, inner);

  // ── Zone badge pills ──────────────────────────────────────────────────────
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";
  ctx.font         = "bold 12px sans-serif";

  for (let i = 0; i < oppWonCounts.length; i++) {
    const oppZone = oppWonCounts[i];
    const forZone = forWonCounts[i];
    const total   = oppZone.count + forZone.count;
    if (total === 0) continue;
    const rect    = zonePixelRect(oppZone.bounds, inner);
    const midX    = rect.x + rect.w / 2;
    const midY    = rect.y + rect.h / 2;
    // THEIR wins / THEIR losses (= our wins on their ball)
    const label   = `${oppZone.count}W / ${forZone.count}L`;
    const tw      = ctx.measureText(label).width + 16;
    const isAmber = oppZone.count > forZone.count;
    const isTeal  = forZone.count > oppZone.count;
    ctx.fillStyle = isAmber ? "rgba(245,158,11,0.88)"
                 : isTeal  ? "rgba(20,184,166,0.88)"
                 :            "rgba(251,191,36,0.88)";
    ctx.fillRect(midX - tw / 2, midY - 12, tw, 24);
    ctx.fillStyle = isAmber ? "#0d1117" : "#ffffff";
    ctx.fillText(label, midX, midY);
  }
  ctx.restore();

  // ── Tactical Threat Overlays ──────────────────────────────────────────────
  // OPP-dominant zones = their kickout weapon
  for (let i = 0; i < oppWonCounts.length; i++) {
    const oZone = oppWonCounts[i];
    const fZone = forWonCounts[i];
    const score = computeZoneThreatScore(oZone.count, 0, fZone.count);
    const level = getThreatLevel(score);
    if (level === "NONE") continue;
    const rect = zonePixelRect(oZone.bounds, inner);
    const cx   = rect.x + rect.w / 2;
    const cy   = rect.y + rect.h / 2;
    drawThreatRings(ctx, cx, cy, level);
    const lbl =
      level === "CRITICAL" ? "THEIR ZONE" :
      level === "HIGH"     ? "DANGER RESTART" :
                             "WATCH";
    drawThreatBadge(ctx, cx, cy - 50, lbl, level);
  }

  // ── Directional Pressure Sweeps ───────────────────────────────────────────
  {
    let bestIdx = -1, bestScore = 0;
    for (let i = 0; i < oppWonCounts.length; i++) {
      const s = computeZoneThreatScore(oppWonCounts[i].count, 0, forWonCounts[i].count);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    if (bestIdx >= 0 && getThreatLevel(bestScore) !== "NONE") {
      const rect      = zonePixelRect(oppWonCounts[bestIdx].bounds, inner);
      const cx        = rect.x + rect.w / 2;
      const cy        = rect.y + rect.h / 2;
      const intensity = Math.min(bestScore / 10, 1.0);
      // OPP sweeping possession in this zone
      drawDirectionalPressureSweep(ctx, cx + rect.w * 0.40, cy - rect.h * 0.24, cx - rect.w * 0.08, cy, intensity, "PRESSURE_INWARD");
      if (getThreatLevel(bestScore) === "CRITICAL") {
        drawDirectionalPressureSweep(ctx, cx - rect.w * 0.36, cy + rect.h * 0.24, cx, cy, intensity * 0.65, "PRESSURE_COLLAPSE");
      }
    }
  }

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "rgba(245,158,11,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("They won", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(20,184,166,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("We won", lx + 22, ly); ly += 26;
  ctx.fillStyle = "rgba(251,191,36,0.88)";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Contested", lx + 22, ly);
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const totalOpp = oppWonEvts.length;
  const totalFor = forWonEvts.length;
  const totalKO  = totalOpp + totalFor;
  const oppPct   = totalKO > 0 ? Math.round((totalOpp / totalKO) * 100) : 0;
  const oppHot   = pdfZoneHotspots(oppWonEvts)[0];
  const forHot   = pdfZoneHotspots(forWonEvts)[0];

  const facts: string[] = [];
  if (totalKO > 0) facts.push(`${awayTeam.slice(0, 14)} ${restartTermLC}: ${totalOpp}W · ${totalFor}L (${oppPct}% won)`);
  if (oppHot)      facts.push(`${awayTeam.slice(0, 14)} best zone: ${oppHot.label}`);
  if (forHot)      facts.push(`${homeTeam.slice(0, 14)} pressure zone: ${forHot.label}`);
  if (facts.length === 0) facts.push(`No ${restartTermLC} data recorded.`);

  drawHtCalloutStrip(ctx, facts, ["#ef4444", "#ef4444", "#14b8a6"]);
  drawEventCountFooter(ctx, allKickoutEvts.length);
  return canvas;
}

// ─── Comparison callout strip ─────────────────────────────────────────────────
/**
 * Two-panel callout strip for pages that compare two sides directly.
 * Each panel renders a heading (accent-coloured) followed by up to 3 detail lines.
 * Drop-in companion to drawHtCalloutStrip; shares the same strip geometry.
 */
function drawTwoColumnHtStrip(
  ctx: CanvasRenderingContext2D,
  left: { heading: string; lines: readonly string[]; color: string },
  right: { heading: string; lines: readonly string[]; color: string },
): void {
  ctx.save();

  // Separator line — matches drawHtCalloutStrip
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(24, HT_STRIP_TOP);
  ctx.lineTo(CANVAS_W - 24, HT_STRIP_TOP);
  ctx.stroke();

  const STRIP_X  = 24;
  const STRIP_W  = CANVAS_W - 48;          // 1872 px
  const GAP      = 20;
  const panelW   = Math.floor((STRIP_W - GAP) / 2);
  const panelY   = HT_STRIP_TOP + 10;
  const panelH   = HT_STRIP_H - 18;
  const ACCENT_W = 8;
  const TEXT_X   = ACCENT_W + 14;

  [left, right].forEach((panel, i) => {
    const px = STRIP_X + i * (panelW + GAP);

    // Panel background
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fillRect(px, panelY, panelW, panelH);

    // Left accent block
    ctx.fillStyle = panel.color;
    ctx.fillRect(px, panelY, ACCENT_W, panelH);

    let ty = panelY + 18;

    // Heading (accent colour)
    ctx.font         = "bold 20px sans-serif";
    ctx.fillStyle    = panel.color;
    ctx.textBaseline = "top";
    ctx.textAlign    = "left";
    ctx.fillText(panel.heading, px + TEXT_X, ty);
    ty += 28;

    // Detail lines
    ctx.font      = "22px sans-serif";
    ctx.fillStyle = "#ffffff";
    const MAX_TW  = panelW - TEXT_X - 12;
    for (const line of panel.lines.slice(0, 3)) {
      let display = line;
      if (ctx.measureText(display).width > MAX_TW) {
        while (display.length > 0 && ctx.measureText(display + "…").width > MAX_TW) {
          display = display.slice(0, -1);
        }
        display += "…";
      }
      ctx.fillText(display, px + TEXT_X, ty);
      ty += 28;
    }
  });

  ctx.restore();
}

// ─── p.3 Restart Battle ───────────────────────────────────────────────────────
/**
 * Restart Battle — single comparative pitch showing who is winning possession
 * at restarts and where. Replaces the two-page Our/Opp restart split.
 *
 * Zone colour:
 *   Teal  = FOR wins possession here (we retained / we won theirs)
 *   Red   = OPP wins possession here (they retained / they won ours)
 *   Amber = contested (diff ≤ 1 each way)
 *
 * Threat rings on OPP-dominant zones; directional sweep on worst zone.
 * Bottom strip: drawTwoColumnHtStrip — Our record vs Their record side-by-side.
 */
function makeRestartBattlePage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
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

  const restartTerm   = sport === "hurling" ? "Puckout" : "Kickout";
  const restartTermLC = sport === "hurling" ? "puckouts" : "kickouts";

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Restart Battle", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  // FOR won = homeTeam kickout retained + awayTeam kickout homeTeam won
  const forWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP"),
  );
  // OPP won = awayTeam kickout retained + homeTeam kickout awayTeam won
  const oppWonEvts = events.filter(
    (e) => (e.kind === "KICKOUT_WON"      && e.teamSide === "OPP") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "FOR"),
  );
  const allKickoutEvts = events.filter((e) => PDF_KIND_SETS.KICKOUTS.has(e.kind));

  // ── Layout: two equal mini-pitches — one owner, one story ─────────────────
  const BAND_H    = 44;
  const BAND_Y    = 80;
  const PITCH_TOP = BAND_Y + BAND_H + 4;           // 128
  const PITCH_H   = HT_STRIP_TOP - PITCH_TOP - 8;  // 764
  const GAP       = 24;
  const HALF_W    = (CANVAS_W - 3 * GAP) / 2;      // 924
  const leftArea  = { x: GAP,              y: PITCH_TOP, w: HALF_W, h: PITCH_H };
  const rightArea = { x: GAP + HALF_W + GAP, y: PITCH_TOP, w: HALF_W, h: PITCH_H };

  // ── Team header bands ─────────────────────────────────────────────────────
  ctx.save();
  ctx.font         = "bold 19px sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  // Left band: homeTeam
  ctx.fillStyle    = "rgba(34,197,94,0.12)";
  ctx.fillRect(leftArea.x, BAND_Y, leftArea.w, BAND_H);
  ctx.strokeStyle  = "rgba(34,197,94,0.45)";
  ctx.lineWidth    = 1.5;
  ctx.strokeRect(leftArea.x + 0.75, BAND_Y + 0.75, leftArea.w - 1.5, BAND_H - 1.5);
  ctx.fillStyle    = "#4ade80";
  ctx.fillText(`${homeTeam.slice(0, 20)} ${restartTerm}s`, leftArea.x + leftArea.w / 2, BAND_Y + BAND_H / 2);
  // Right band: awayTeam
  ctx.fillStyle    = "rgba(239,68,68,0.12)";
  ctx.fillRect(rightArea.x, BAND_Y, rightArea.w, BAND_H);
  ctx.strokeStyle  = "rgba(239,68,68,0.45)";
  ctx.strokeRect(rightArea.x + 0.75, BAND_Y + 0.75, rightArea.w - 1.5, BAND_H - 1.5);
  ctx.fillStyle    = "#f87171";
  ctx.fillText(`${awayTeam.slice(0, 20)} ${restartTerm}s`, rightArea.x + rightArea.w / 2, BAND_Y + BAND_H / 2);
  ctx.restore();

  // ── Render both pitches ───────────────────────────────────────────────────
  const leftInner  = renderPitch(ctx, sport, leftArea);
  const rightInner = renderPitch(ctx, sport, rightArea);

  // ── Marker: green circle = retained ──────────────────────────────────────
  const drawRetained = (inner: InnerPitch, evts: readonly PdfExportEvent[]) => {
    const r = Math.max(9, inner.w * 0.012);
    ctx.save();
    for (const e of evts) {
      const ex = typeof e.x === "number" ? e.x : e.nx;
      const ey = typeof e.y === "number" ? e.y : e.ny;
      const cx = inner.x + ex * inner.w;
      const cy = inner.y + ey * inner.h;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(cx + 1, cy + 1, r + 1, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e"; ctx.fill();
      ctx.strokeStyle = "#15803d"; ctx.lineWidth = Math.max(1.5, r * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(240,253,244,0.85)"; ctx.fill();
    }
    ctx.restore();
  };

  // ── Marker: red X = lost ──────────────────────────────────────────────────
  const drawLost = (inner: InnerPitch, evts: readonly PdfExportEvent[]) => {
    const r = Math.max(9, inner.w * 0.012);
    ctx.save();
    ctx.lineCap = "round";
    for (const e of evts) {
      const ex = typeof e.x === "number" ? e.x : e.nx;
      const ey = typeof e.y === "number" ? e.y : e.ny;
      const cx = inner.x + ex * inner.w;
      const cy = inner.y + ey * inner.h;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = Math.max(2.5, r * 0.35);
      const arm = r * 0.82;
      ctx.beginPath(); ctx.moveTo(cx - arm, cy - arm); ctx.lineTo(cx + arm, cy + arm); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + arm, cy - arm); ctx.lineTo(cx - arm, cy + arm); ctx.stroke();
    }
    ctx.restore();
  };

  // Left pitch: homeTeam's story — green = they retained, red X = they lost
  drawRetained(leftInner, forWonEvts);
  drawLost(leftInner, oppWonEvts);

  // Right pitch: awayTeam's story — green = they retained, red X = they lost
  drawRetained(rightInner, oppWonEvts);
  drawLost(rightInner, forWonEvts);

  // ── Two-column bottom strip ───────────────────────────────────────────────
  const totalFor = forWonEvts.length;
  const totalOpp = oppWonEvts.length;
  const totalKO  = totalFor + totalOpp;
  const forPct   = totalKO > 0 ? Math.round((totalFor / totalKO) * 100) : 0;
  const oppPct   = totalKO > 0 ? Math.round((totalOpp / totalKO) * 100) : 0;
  // forHot = zone where homeTeam wins most = zone where awayTeam loses most
  const forHot   = pdfZoneHotspots(forWonEvts)[0];
  // oppHot = zone where awayTeam wins most = zone where homeTeam loses most
  const oppHot   = pdfZoneHotspots(oppWonEvts)[0];

  drawTwoColumnHtStrip(ctx,
    {
      heading: `${homeTeam.slice(0, 16)} ${restartTerm}s`,
      lines: [
        totalKO > 0
          ? `${homeTeam.slice(0, 14)} retained ${totalFor}/${totalKO} (${forPct}%)`
          : `No ${restartTermLC} logged`,
        forHot ? `Best zone: ${forHot.label}`   : "Best zone: —",
        oppHot ? `Most losses: ${oppHot.label}` : "Loss zone: —",
      ],
      color: "#22c55e",
    },
    {
      heading: `${awayTeam.slice(0, 16)} ${restartTerm}s`,
      lines: [
        totalKO > 0
          ? `${awayTeam.slice(0, 14)} retained ${totalOpp}/${totalKO} (${oppPct}%)`
          : `No ${restartTermLC} logged`,
        oppHot ? `Best zone: ${oppHot.label}`   : "Best zone: —",
        forHot ? `Most losses: ${forHot.label}` : "Loss zone: —",
      ],
      color: "#ef4444",
    },
  );

  drawEventCountFooter(ctx, allKickoutEvts.length);
  return canvas;
}

// ─── p.4 Turnover & Territory ─────────────────────────────────────────────────
/**
 * Turnover & Territory — pure territorial possession pressure map.
 * Shows WHERE we win and lose the ball, not chain outcomes or scoring outcomes.
 *
 * Event semantics:
 *   wonEvts  = TURNOVER_WON by FOR  → we won possession
 *   lostEvts = TURNOVER_LOST by FOR OR TURNOVER_WON by OPP → they won possession
 *
 * Zone colour:
 *   Teal  = we dominate (wonCount > lostCount + 1)
 *   Red   = they dominate (lostCount > wonCount + 1)
 *   Amber = contested (both sides active ≥ 2)
 *
 * Callouts: DANGER ZONE on high-loss zones; teal PRESSURE ZONE on best win zone.
 */
function makeTurnoverTerritoryPage(
  events: readonly PdfExportEvent[],
  analysis: ChainAnalysis<PdfExportEvent>,
  sport: PitchSport,
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
  drawPageHeader(ctx, "Turnover & Territory", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Event subsets ─────────────────────────────────────────────────────────
  const wonEvts = events.filter(
    (e) => e.kind === "TURNOVER_WON" && e.teamSide === "FOR",
  );
  const lostEvts = events.filter(
    (e) => (e.kind === "TURNOVER_LOST" && e.teamSide === "FOR") ||
           (e.kind === "TURNOVER_WON"  && e.teamSide === "OPP"),
  );
  const allTurnoverEvts = events.filter((e) => PDF_KIND_SETS.TURNOVERS.has(e.kind));

  // ── Pitch ─────────────────────────────────────────────────────────────────
  const inner = renderPitch(ctx, sport, HT_PITCH_AREA);

  // ── Event markers — dots tell the story ──────────────────────────────────
  // Purple = turnover won  ·  Orange = turnover lost
  renderHtMarkers(ctx, allTurnoverEvts, inner);

  // ── Right-side legend ─────────────────────────────────────────────────────
  const lx = CANVAS_W - 158;
  let ly = 90;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.font         = "13px sans-serif";
  ctx.fillStyle    = "#64748b";
  ctx.fillText("LEGEND", lx, ly); ly += 26;
  ctx.fillStyle = "#a78bfa";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Turnover Won", lx + 22, ly); ly += 26;
  ctx.fillStyle = "#f97316";
  ctx.fillRect(lx, ly - 8, 16, 16);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Turnover Lost", lx + 22, ly);
  ctx.restore();

  // ── Bottom callout strip — 4 coaching panels ─────────────────────────────
  const to        = analysis.turnovers;
  const totalWon  = wonEvts.length;
  const totalLost = lostEvts.length;
  const totalTO   = totalWon + totalLost;
  const wonPct    = totalTO > 0 ? Math.round((totalWon / totalTO) * 100) : 0;
  const wonHot    = pdfZoneHotspots(wonEvts)[0];
  const lostHot   = pdfZoneHotspots(lostEvts)[0];

  type StripPanel = { label: string; text: string; accent: string; highlight: boolean };
  const panels: StripPanel[] = [
    {
      label: "Territory Balance",
      text: totalTO > 0 ? `Won ${totalWon} · Lost ${totalLost} (${wonPct}% won)` : "No turnovers recorded",
      accent: totalWon >= totalLost ? "#22c55e" : "#ef4444",
      highlight: false,
    },
    {
      label: "Best Press Zone",
      text: wonHot ? wonHot.label : "—",
      accent: "#a78bfa",
      highlight: false,
    },
    {
      label: "Danger Zone",
      text: lostHot ? lostHot.label : "—",
      accent: "#ef4444",
      highlight: false,
    },
    {
      label: "Consequence",
      text: totalTO > 0 ? `Created ${to.wonToScore} · Conceded ${to.lostAllowedScore}` : "—",
      accent: to.wonToScore > to.lostAllowedScore ? "#22c55e" : to.lostAllowedScore > to.wonToScore ? "#ef4444" : "#f59e0b",
      highlight: true,
    },
  ];

  ctx.save();
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(24, HT_STRIP_TOP);
  ctx.lineTo(CANVAS_W - 24, HT_STRIP_TOP);
  ctx.stroke();

  const STRIP_X  = 24;
  const STRIP_W  = CANVAS_W - 48;
  const GAP_PX   = 20;
  const panelW   = Math.floor((STRIP_W - GAP_PX * 3) / 4);
  const panelY   = HT_STRIP_TOP + 10;
  const panelH   = HT_STRIP_H - 18;
  const contentH = 15 + 10 + 24;
  const contentY = panelY + Math.floor((panelH - contentH) / 2);

  for (let i = 0; i < panels.length; i++) {
    const pd    = panels[i];
    const px    = STRIP_X + i * (panelW + GAP_PX);
    const bgA   = pd.highlight ? 0.09 : 0.045;
    const acW   = pd.highlight ? 10   : 8;
    const TEXT_X = acW + 14;
    const MAX_TW = panelW - TEXT_X - 12;

    ctx.fillStyle = `rgba(255,255,255,${bgA})`;
    ctx.fillRect(px, panelY, panelW, panelH);

    ctx.fillStyle = pd.accent;
    ctx.fillRect(px, panelY, acW, panelH);

    ctx.font         = "bold 15px sans-serif";
    ctx.fillStyle    = pd.accent;
    ctx.textBaseline = "top";
    ctx.textAlign    = "left";
    ctx.fillText(pd.label, px + TEXT_X, contentY);

    ctx.font      = "bold 24px sans-serif";
    ctx.fillStyle = "#ffffff";
    let display   = pd.text;
    if (ctx.measureText(display).width > MAX_TW) {
      while (display.length > 0 && ctx.measureText(display + "…").width > MAX_TW) {
        display = display.slice(0, -1);
      }
      display += "…";
    }
    ctx.fillText(display, px + TEXT_X, contentY + 15 + 10);
  }
  ctx.restore();
  drawEventCountFooter(ctx, allTurnoverEvts.length);
  return canvas;
}

// ─── p.6 Tactical Match Summary ───────────────────────────────────────────────
/**
 * Tactical Match Summary — "What are the actual coaching messages?"
 * 2×2 panel layout, no pitch canvas. Content derived from chain analysis.
 *
 * Panels:
 *   Working (green)      — our best tactical platform this period
 *   Danger  (red)        — their most dangerous threat pattern
 *   Match Swing (amber)  — scoring run / period of control context
 *   Watch   (blue)       — the repeating pattern that needs addressing
 *
 * All text is observational — metric-driven, no prescriptive coaching advice.
 */
function makeHtTacticalSummaryPage(
  events: readonly PdfExportEvent[],
  sport: PitchSport,
  analysis: ChainAnalysis<PdfExportEvent>,
  homeTeam: string,
  awayTeam: string,
  pageNum: number,
  totalPages: number,
  mode: "FT" | "HT" = "HT",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const restartTerm = sport === "hurling" ? "puckout" : "kickout";
  fillDarkBg(ctx);
  drawTopAccentBar(ctx);
  drawPageHeader(ctx, "Tactical Match Summary", `${homeTeam} v ${awayTeam}`, pageNum, totalPages);

  // ── Layout constants ──────────────────────────────────────────────────────
  const GAP   = 16;
  const P_TOP = 88;
  const P_BOT = HT_STRIP_TOP - 10;             // 890
  const COL_W = Math.floor((CANVAS_W - GAP) / 2);   // 952
  const ROW_H = Math.floor((P_BOT - P_TOP - GAP) / 2); // 393

  // ── Derive panel content from chain analysis ──────────────────────────────
  const patterns = rankChainPatterns(analysis, mode, homeTeam, awayTeam);
  const ko = analysis.kickouts;
  const to = analysis.turnovers;
  const sr = analysis.scoringRuns;

  const forScoreEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SCORES.has(e.kind),
  );
  const oppScoreEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SCORES.has(e.kind),
  );
  const forShotEvts = events.filter(
    (e) => e.teamSide === "FOR" && PDF_KIND_SETS.SHOTS.has(e.kind),
  );
  const oppShotEvts = events.filter(
    (e) => e.teamSide === "OPP" && PDF_KIND_SETS.SHOTS.has(e.kind),
  );
  const totalForKO = events.filter(
    (e) => (e.kind === "KICKOUT_WON" && e.teamSide === "FOR") ||
           (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP"),
  ).length;
  const totalAllKO = events.filter((e) => PDF_KIND_SETS.KICKOUTS.has(e.kind)).length;
  const koWinPct   = totalAllKO > 0 ? Math.round((totalForKO / totalAllKO) * 100) : 0;
  const forShotEff = forShotEvts.length > 0
    ? Math.round((forScoreEvts.length / forShotEvts.length) * 100) : 0;
  const oppShotEff = oppShotEvts.length > 0
    ? Math.round((oppScoreEvts.length / oppShotEvts.length) * 100) : 0;

  // Inline colour helper (mirrors cpHex inside makeChainPressurePage)
  function summaryPatternHex(kind: ChainPressureKind, headline?: string): string {
    if (kind === "DANGER_CHAIN")     return headline === "Possession Lost → Score" ? "#f59e0b" : "#ef4444";
    if (kind === "CHAIN_WEAPON")     return "#22c55e";
    if (kind === "PRESSURE_PATTERN") return "#f59e0b";
    return "#818cf8";
  }

  // ── Build panel bullet items ──────────────────────────────────────────────
  const workingItems: string[] = [];
  const dangerItems:  string[] = [];
  const swingItems:   string[] = [];
  const watchItems:   string[] = [];

  // Working — our best platform
  if (ko.wonToScore > 0) {
    workingItems.push(`${ko.wonToScore} ${restartTerm} win${ko.wonToScore !== 1 ? "s" : ""} → direct score`);
  }
  if (totalAllKO > 0 && koWinPct >= 50) {
    workingItems.push(`${koWinPct}% ${restartTerm} retention`);
  }
  if (forShotEff >= 50 && forShotEvts.length >= 3) {
    workingItems.push(`${forShotEff}% shooting efficiency`);
  }
  if (to.wonToScore > 0) {
    workingItems.push(`${to.wonToScore} turnover win${to.wonToScore !== 1 ? "s" : ""} → score`);
  }
  const weaponPattern = patterns.find((p) => p.kind === "CHAIN_WEAPON");
  if (weaponPattern && workingItems.length < 4) {
    workingItems.push(weaponPattern.observation);
  }
  if (workingItems.length === 0) {
    workingItems.push("Insufficient possession data this period");
    if (forScoreEvts.length > 0) {
      workingItems.push(`${forScoreEvts.length} score${forScoreEvts.length !== 1 ? "s" : ""} logged`);
    }
  }

  // Danger — their key threat
  const dangerPattern = patterns.find((p) => p.kind === "DANGER_CHAIN");
  if (dangerPattern) {
    dangerItems.push(dangerPattern.observation);
  }
  if (ko.lostAllowedScore > 0) {
    dangerItems.push(`${ko.lostAllowedScore} ${restartTerm} concession${ko.lostAllowedScore !== 1 ? "s" : ""} → score`);
  }
  if (oppShotEff >= 50 && oppShotEvts.length >= 3 && dangerItems.length < 3) {
    dangerItems.push(`OPP shooting ${oppShotEff}% efficiency`);
  }
  if (to.lostAllowedScore > 0 && dangerItems.length < 4) {
    dangerItems.push(`${to.lostAllowedScore} turnover${to.lostAllowedScore !== 1 ? "s" : ""} conceded → their score`);
  }
  if (dangerItems.length === 0) {
    dangerItems.push("No critical possession threat detected");
    if (oppScoreEvts.length > 0) {
      dangerItems.push(`${oppScoreEvts.length} opposition score${oppScoreEvts.length !== 1 ? "s" : ""}`);
    }
  }

  // Match Swing — scoring run context
  if (sr.maxConsecutiveFor >= 2) {
    swingItems.push(`Best FOR run: ${sr.maxConsecutiveFor} unanswered`);
  }
  if (sr.maxConsecutiveOpp >= 2) {
    swingItems.push(`Best OPP run: ${sr.maxConsecutiveOpp} unanswered`);
  }
  if (sr.maxConsecutiveFor > sr.maxConsecutiveOpp && sr.maxConsecutiveFor > 0) {
    swingItems.push(`${homeTeam} controlled the scoring`);
  } else if (sr.maxConsecutiveOpp > sr.maxConsecutiveFor && sr.maxConsecutiveOpp > 0) {
    swingItems.push(`${awayTeam} controlled the scoring`);
  }
  if (swingItems.length === 0) {
    const forTotal = forScoreEvts.length;
    const oppTotal = oppScoreEvts.length;
    if (forTotal > 0 || oppTotal > 0) {
      swingItems.push(`${homeTeam}: ${forTotal} score${forTotal !== 1 ? "s" : ""} · ${awayTeam}: ${oppTotal} score${oppTotal !== 1 ? "s" : ""}`);
    } else {
      swingItems.push("No scoring run data available");
    }
  }

  // Watch — repeating pressure pattern
  const pressurePattern = patterns.find(
    (p) => p.kind === "PRESSURE_PATTERN" || p.kind === "WASTED_CHAIN",
  );
  if (pressurePattern) {
    watchItems.push(pressurePattern.observation);
  }
  if (totalAllKO > 0 && koWinPct < 50 && watchItems.length < 2) {
    watchItems.push(`${100 - koWinPct}% ${restartTerm} possession lost`);
  }
  if (to.wonToShotPercent < 40 && to.won >= 3 && watchItems.length < 3) {
    watchItems.push(`Low turnover-to-shot conversion (${to.wonToShotPercent}%)`);
  }
  if (watchItems.length === 0) {
    watchItems.push("No repeating possession pattern ranked");
    if (patterns.length > 0) {
      watchItems.push(`${patterns.length} possession pattern${patterns.length !== 1 ? "s" : ""} in review`);
    }
  }

  // ── Panel definitions ─────────────────────────────────────────────────────
  type SummaryPanel = {
    title: string;
    color: string;
    rgb: string;
    items: string[];
    x: number;
    y: number;
  };

  const panels: SummaryPanel[] = [
    {
      title: "WORKING",
      color: "#22c55e",
      rgb:   "34,197,94",
      items: workingItems,
      x: 0,
      y: P_TOP,
    },
    {
      title: "DANGER",
      color: "#ef4444",
      rgb:   "239,68,68",
      items: dangerItems,
      x: COL_W + GAP,
      y: P_TOP,
    },
    {
      title: "MATCH SWING",
      color: "#f59e0b",
      rgb:   "245,158,11",
      items: swingItems,
      x: 0,
      y: P_TOP + ROW_H + GAP,
    },
    {
      title: "WATCH",
      color: "#60a5fa",
      rgb:   "96,165,250",
      items: watchItems,
      x: COL_W + GAP,
      y: P_TOP + ROW_H + GAP,
    },
  ];

  // ── Draw panels ───────────────────────────────────────────────────────────
  ctx.save();
  for (const panel of panels) {
    const px = panel.x;
    const py = panel.y;

    // Panel background
    ctx.fillStyle = `rgba(${panel.rgb},0.07)`;
    ctx.fillRect(px, py, COL_W, ROW_H);

    // 8px left accent bar
    ctx.fillStyle = panel.color;
    ctx.fillRect(px, py, 8, ROW_H);

    // Section title
    ctx.font         = "bold 22px sans-serif";
    ctx.fillStyle    = panel.color;
    ctx.textBaseline = "top";
    ctx.textAlign    = "left";
    ctx.fillText(panel.title, px + 24, py + 14);

    // Separator line under title
    ctx.strokeStyle = `rgba(${panel.rgb},0.30)`;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px + 24, py + 46);
    ctx.lineTo(px + COL_W - 16, py + 46);
    ctx.stroke();

    // Bullet items — up to 4, truncated if overlong
    ctx.font         = "18px sans-serif";
    ctx.fillStyle    = "#cbd5e1";
    ctx.textBaseline = "top";
    const MAX_ITEM_W  = COL_W - 50;
    const itemsToShow = panel.items.slice(0, 4);
    itemsToShow.forEach((item, idx) => {
      const iy = py + 66 + idx * 72;
      // Bullet dot
      ctx.fillStyle = `rgba(${panel.rgb},0.60)`;
      ctx.beginPath();
      ctx.arc(px + 32, iy + 10, 4, 0, Math.PI * 2);
      ctx.fill();
      // Item text (truncated if too wide)
      ctx.fillStyle = "#cbd5e1";
      let display   = item;
      if (ctx.measureText(display).width > MAX_ITEM_W) {
        while (display.length > 0 && ctx.measureText(display + "…").width > MAX_ITEM_W) {
          display = display.slice(0, -1);
        }
        display += "…";
      }
      ctx.fillText(display, px + 44, iy);
    });
  }
  ctx.restore();

  // ── Bottom callout strip ──────────────────────────────────────────────────
  const summaryFacts: string[]  = [];
  const summaryColors: string[] = [];

  const forFinal  = scoreFromEvents(forScoreEvts);
  const oppFinal  = scoreFromEvents(oppScoreEvts);
  const scoreDiff = forFinal.total - oppFinal.total;

  summaryFacts.push(
    `${fmtScore(forFinal)} vs ${fmtScore(oppFinal)} — ${scoreDiff > 0 ? `${homeTeam} won by ${scoreDiff}` : scoreDiff < 0 ? `lost by ${Math.abs(scoreDiff)}` : "draw"}`,
  );
  summaryColors.push("#94a3b8");

  if (patterns.length > 0) {
    summaryFacts.push(`${patterns.length} chain pattern${patterns.length !== 1 ? "s" : ""} ranked`);
    summaryColors.push(summaryPatternHex(patterns[0].kind, patterns[0].headline));
  }

  if (totalAllKO > 0) {
    summaryFacts.push(`${restartTerm} retention: ${koWinPct}%`);
    summaryColors.push(koWinPct >= 50 ? "#14b8a6" : "#f59e0b");
  }

  drawHtCalloutStrip(ctx, summaryFacts, summaryColors);
  drawEventCountFooter(ctx, analysis.totalEventsAnalysed);
  return canvas;
}

// ─── Snapshot PDF export ──────────────────────────────────────────────────────
//
// Lightweight coaching reports. All rendering delegates to the same page builders
// used by exportReviewPdf. exportReviewPdf and every pre-existing page builder
// function body are completely untouched.
//
// HT Snapshot (5 pages): VISION FIRST — events pre-filtered to period "1H".
//   Chain analysis is computed from the H1 event set only — no builder changes
//   needed; each builder naturally sees first-half data.
//   Pages: Pressure & Damage → Game Flow → Kickout Vision →
//          Attack Shape → Game Flow Factors
//
// FT Snapshot (12 pages): full-match events, two-part tactical narrative.
//   PART 1 — SEE  (p.1–5): pitch-based visual intelligence (reuses HT builders)
//   PART 2 — UNDERSTAND (p.6–12): analytical depth + narrative story

export async function exportSnapshotPdf(input: SnapshotPdfExportInput): Promise<void> {
  const {
    events: allEvents,
    homeTeamName,
    awayTeamName,
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

  const TOTAL_PAGES = isHT ? 6 : 12;

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
    // ── HT Snapshot ── 6 pages, coaching-first, first-half events only ────────
    //
    // Locked architecture (Phase 6). Coach-readable in under 90 seconds.
    // VISION FIRST: one page per side for shots, one page per side for restarts,
    // then chain pressure, then a 2×2 summary panel.
    //
    // 1. Our Shot Profile          — "Where are we getting joy?"
    // 2. Opposition Shot Profile   — "Where are they hurting us?"
    // 3. Our Restart Platform      — "How are our kickouts functioning?"
    // 4. Opposition Restart        — "What are they trying to do on restarts?"
    // 5. Chain Pressure            — ranked chain patterns (HT-calibrated)
    // 6. Tactical Match Summary    — 2×2 coaching panel (Working/Danger/Swing/Watch)

    // 1. Our Shot Profile
    addPage(
      makeOurShotProfilePage(events, sport, home, away, 1, TOTAL_PAGES),
      false,
      "Our Shots",
    );

    // 2. Opposition Shot Profile
    addPage(
      makeOppShotProfilePage(events, sport, home, away, 2, TOTAL_PAGES),
      true,
      "Their Shots",
    );

    // 3. Restart Battle
    addPage(
      makeRestartBattlePage(events, sport, home, away, 3, TOTAL_PAGES),
      true,
      "Restart Battle",
    );

    // 4. Turnover & Territory
    addPage(
      makeTurnoverTerritoryPage(events, chainAnalysis, sport, home, away, 4, TOTAL_PAGES),
      true,
      "Turnover & Territory",
    );

    // 5. Possession Patterns — HT-calibrated (relaxed thresholds for smaller H1 dataset)
    addPage(
      makeChainPressurePage(events, sport, chainAnalysis, home, away, 5, TOTAL_PAGES, "HT"),
      true,
      "Possession Patterns",
    );

    // 6. Tactical Match Summary — 2×2 panel, no pitch, coaching message board
    addPage(
      makeHtTacticalSummaryPage(events, sport, chainAnalysis, home, away, 6, TOTAL_PAGES, "HT"),
      true,
      "Tactical Summary",
    );
  } else {
    // ── FT Snapshot ── 12 pages ───────────────────────────────────────────────
    //
    // PART 1 — COACHING LAYER (p.1–6): same 6-page coaching structure as HT.
    //   Full-match events; chain pressure uses FT-calibrated thresholds.
    //
    // 1. Our Shot Profile          — "Where are we getting joy?"
    // 2. Opposition Shot Profile   — "Where are they hurting us?"
    // 3. Our Restart Platform      — "How are our kickouts functioning?"
    // 4. Opposition Restart        — "What are they trying to do on restarts?"
    // 5. Chain Pressure            — ranked chain patterns (FT-calibrated)
    // 6. Tactical Match Summary    — 2×2 coaching panel
    //
    // PART 2 — ANALYTICAL DEPTH (p.7–12): unchanged analytical review pages.
    //
    // 7.  Turnover Punishment      — possession chain punishment
    // 8.  Shot Efficiency          — scoring efficiency analysis
    // 9.  Attack Corridors         — channel-based attack shape
    // 10. Restart Escape Routes    — kickout landing zone outcome map
    // 11. Opposition Snapshot      — opposition tactical profile
    // 12. Tactical Match Story     — narrative arc of the match

    // ── PART 1 — COACHING LAYER ───────────────────────────────────────────────

    // 1. Our Shot Profile
    addPage(
      makeOurShotProfilePage(events, sport, home, away, 1, TOTAL_PAGES),
      false,
      "Our Shots",
    );

    // 2. Opposition Shot Profile
    addPage(
      makeOppShotProfilePage(events, sport, home, away, 2, TOTAL_PAGES),
      true,
      "Their Shots",
    );

    // 3. Restart Battle
    addPage(
      makeRestartBattlePage(events, sport, home, away, 3, TOTAL_PAGES),
      true,
      "Restart Battle",
    );

    // 4. Turnover & Territory
    addPage(
      makeTurnoverTerritoryPage(events, chainAnalysis, sport, home, away, 4, TOTAL_PAGES),
      true,
      "Turnover & Territory",
    );

    // 5. Possession Patterns — FT-calibrated (standard thresholds for full-match dataset)
    addPage(
      makeChainPressurePage(events, sport, chainAnalysis, home, away, 5, TOTAL_PAGES),
      true,
      "Possession Patterns",
    );

    // 6. Tactical Match Summary — 2×2 panel, no pitch, coaching message board
    addPage(
      makeHtTacticalSummaryPage(events, sport, chainAnalysis, home, away, 6, TOTAL_PAGES, "FT"),
      true,
      "Tactical Summary",
    );

    // ── PART 2 — ANALYTICAL DEPTH ─────────────────────────────────────────────

    // 7. Turnover Punishment
    addPage(
      makeTurnoverPunishmentPage(chainAnalysis, home, away, 7, TOTAL_PAGES),
      true,
      "Turnover Punishment",
    );

    // 8. Shot Efficiency
    addPage(
      makeShotEfficiencyPage(events, home, away, 8, TOTAL_PAGES),
      true,
      "Shot Efficiency",
    );

    // 9. Attack Corridors — channel-based attack shape analysis
    addPage(
      makeFtAttackCorridorsPage(events, sport, home, away, 9, TOTAL_PAGES),
      true,
      "Attack Corridors",
    );

    // 10. Restart Escape Routes — kickout destination zone outcome map
    addPage(
      makeFtRestartEscapeRoutesPage(events, sport, chainAnalysis, home, away, 10, TOTAL_PAGES),
      true,
      "Restart Escape Routes",
    );

    // 11. Opposition Snapshot
    addPage(
      makeOppositionSnapshotPage(events, chainAnalysis, home, away, 11, TOTAL_PAGES),
      true,
      "Opposition Snapshot",
    );

    // 12. Tactical Match Story — narrative arc of the match
    addPage(
      makeFtTacticalMatchStoryPage(events, chainAnalysis, home, away, 12, TOTAL_PAGES),
      true,
      "Tactical Match Story",
    );
  }

  const safeName = (s: string) => s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const suffix   = isHT ? "ht_snapshot" : "ft_snapshot";
  const filename  = `${safeName(homeTeamName)}_v_${safeName(awayTeamName)}_${suffix}.pdf`;
  pdf.save(filename);
}
