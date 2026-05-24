/**
 * reviewPdfExport.ts
 *
 * Builds a 22-page PáircVision Visual Review PDF report.
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

// ─── Strict PDF event selector ────────────────────────────────────────────────

/**
 * PDF-only strict selector. NO live-review inference leakage.
 *
 * Filtering rules:
 *   - Half  : strict period match ("1H" or "2H")
 *   - Kind  : only kinds in the category set pass (or all if category === "ALL")
 *   - Side  : event.teamSide must EQUAL the requested side exactly.
 *             There is NO inferred OPP treatment of FOR-tagged events.
 *             TURNOVER_LOST (teamSide="FOR") → FOR page only.
 *             KICKOUT_CONCEDED (teamSide="FOR") → FOR page only.
 *             OPP events → AGAINST page only.
 *             Zero overlap between FOR and AGAINST pages.
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
    // Strict side filter — no inference
    if (teamSide !== "ALL" && event.teamSide !== teamSide) return false;
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
 * Draws two mirrored team stat blocks for the summary page.
 *
 * Layout: left block = FOR (home), right block = OPP (away).
 * Both blocks are structurally identical — three labelled sections
 * (SCORING / POSSESSION / DEAD BALL) each with the same row order.
 * Derived stats (Conversion %, K/O %, Net T/O) are computed here and
 * shown with colour accents for positive/negative Net T/O values.
 *
 * No external data or new event selectors — uses only the existing
 * scoreFromEvents / countKinds helpers already in this file.
 */
function drawSummaryStatsTable(
  ctx: CanvasRenderingContext2D,
  events: readonly PdfExportEvent[],
  homeTeam: string,
  awayTeam: string,
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
    score: ScoreResult;
    shots: number; conv: string; wides: number;
    koWon: number; koCon: number; koTotal: number; koPct: string;
    toWon: number; toLost: number; netTo: number;
    freesWon: number; freesCon: number; freeScored: number; freeMissed: number;
  };

  function buildStats(evts: readonly PdfExportEvent[]): BlockStats {
    const score     = scoreFromEvents(evts);
    const shots     = countKinds(evts, ...SHOT_KINDS);
    const scoreKind = countKinds(evts, ...SCORE_KINDS);
    const koWon     = countKinds(evts, "KICKOUT_WON");
    const koCon     = countKinds(evts, "KICKOUT_CONCEDED");
    const koTotal   = koWon + koCon;
    const toWon     = countKinds(evts, "TURNOVER_WON");
    const toLost    = countKinds(evts, "TURNOVER_LOST");
    return {
      score, shots, wides: countKinds(evts, "WIDE"),
      conv:      shots > 0   ? `${Math.round((scoreKind / shots)  * 100)}%` : "—",
      koWon, koCon, koTotal,
      koPct:     koTotal > 0 ? `${Math.round((koWon   / koTotal)  * 100)}%` : "—",
      toWon, toLost, netTo: toWon - toLost,
      freesWon:  countKinds(evts, "FREE_WON"),
      freesCon:  countKinds(evts, "FREE_CONCEDED"),
      freeScored:countKinds(evts, "FREE_SCORED"),
      freeMissed:countKinds(evts, "FREE_MISSED"),
    };
  }

  const forStats = buildStats(forEvts);
  const oppStats = buildStats(oppEvts);

  // ── Block geometry ──────────────────────────────────────────────────────────
  const blockW  = 848;
  const blockX1 = 72;    // FOR (home) block left edge
  const blockX2 = 1000;  // OPP (away) block left edge
  const blockY  = 244;   // top of both blocks (below scoreline)
  const rowH    = 40;
  const secH    = 32;    // section-header bar height
  const hdrH    = 40;    // team-name header height
  const gap     = 12;    // vertical gap between sections

  // Three sections — identical structure for both blocks.
  type SRow = { label: string; value: string; vColor?: string };
  type Section = { label: string; accent: string; bg: string; rows: SRow[] };

  function makeSections(st: BlockStats): Section[] {
    const netStr   = st.netTo >= 0 ? `+${st.netTo}` : String(st.netTo);
    const netColor = st.netTo > 0  ? "#4ade80" : st.netTo < 0 ? "#fb7185" : "#94a3b8";
    return [
      {
        label: "SCORING", accent: "#7dd3fc", bg: "rgba(125,211,252,0.08)",
        rows: [
          { label: "Goals",       value: String(st.score.goals) },
          { label: "Points",      value: String(st.score.points) },
          { label: "Shots",       value: String(st.shots) },
          { label: "Conversion",  value: st.conv },
          { label: "Wides",       value: String(st.wides) },
        ],
      },
      {
        label: "POSSESSION", accent: "#a78bfa", bg: "rgba(167,139,250,0.08)",
        rows: [
          { label: "K/O Won",     value: `${st.koWon} / ${st.koTotal}` },
          { label: "K/O %",       value: st.koPct },
          { label: "T/O Won",     value: String(st.toWon) },
          { label: "T/O Lost",    value: String(st.toLost) },
          { label: "Net T/O",     value: netStr, vColor: netColor },
        ],
      },
      {
        label: "DEAD BALL", accent: "#34d399", bg: "rgba(52,211,153,0.08)",
        rows: [
          { label: "Frees Won",      value: String(st.freesWon) },
          { label: "Frees Conceded", value: String(st.freesCon) },
          { label: "Free Scored",    value: String(st.freeScored) },
          { label: "Free Missed",    value: String(st.freeMissed) },
        ],
      },
    ];
  }

  // Total block height:
  //   hdr(40) + gap(8) + SCORING(32+5×40) + gap(12) + POSSESSION(32+5×40) + gap(12) + DEADBALL(32+4×40)
  //   = 40+8+232+12+232+12+192 = 728px
  const BLOCK_H = 728;

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
    ctx.font = "bold 22px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(teamName.toUpperCase(), bx + 16, cy + hdrH / 2);
    // Separator
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + 4, cy + hdrH);
    ctx.lineTo(bx + blockW, cy + hdrH);
    ctx.stroke();
    cy += hdrH + 8;  // 8px internal gap after header

    for (const sec of sections) {
      // Section header bar
      ctx.fillStyle = sec.bg;
      ctx.fillRect(bx + 4, cy, blockW - 4, secH);
      ctx.fillStyle = sec.accent;
      ctx.fillRect(bx + 4, cy, 3, secH);  // inner accent pip
      ctx.font = "bold 13px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(sec.label, bx + 20, cy + secH / 2);
      cy += secH;

      sec.rows.forEach(({ label, value, vColor }, ri) => {
        // Alternate row tint
        if (ri % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.03)";
          ctx.fillRect(bx + 4, cy, blockW - 4, rowH);
        }
        const midY = cy + rowH / 2;
        ctx.fillStyle = "#94a3b8";
        ctx.font = "20px sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(label, bx + 16, midY);
        ctx.fillStyle = vColor ?? "#f1f5f9";
        ctx.font = "bold 21px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(value, bx + blockW - 14, midY);
        cy += rowH;
      });

      cy += gap;  // inter-section spacing
    }

    ctx.restore();
  }

  drawBlock(blockX1, homeTeam, forStats, "#7dd3fc");
  drawBlock(blockX2, awayTeam, oppStats, "#fb7185");

  // "v" label centred in the gap between the two blocks
  ctx.save();
  ctx.fillStyle = "#334155";
  ctx.font = "bold 24px sans-serif";
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

  // ── Table geometry (wider, centred — 260px margins each side) ────────────────
  const tableLeft = 260;
  const col0W     = 280;   // segment label column
  const col1W     = 560;   // FOR score column
  const col2W     = 560;   // OPP score column
  const tableW    = col0W + col1W + col2W; // 1400; right edge=1660, right margin=260
  const rowH      = 62;    // taller rows for readability
  const labelH    = 38;    // height of the coloured section-title bar
  const secGap    = 72;    // vertical gap between the two half tables

  // Derived positions — each half block is: labelH + rowH×5 (hdr + 3 rows + total)
  const blockH = labelH + rowH * 5;
  const h1Top  = 88;
  const h2Top  = h1Top + blockH + secGap;

  const halves: Array<{
    title: string; accent: string; accentBg: string;
    period: MatchEventPeriod; segs: SegDef[]; tableTop: number;
  }> = [
    {
      title: "FIRST HALF", accent: "#7dd3fc", accentBg: "rgba(125,211,252,0.1)",
      period: "1H", tableTop: h1Top,
      segs: [
        { seg: 1, label: "1H Early  (0–10′)",   period: "1H" },
        { seg: 2, label: "1H Mid    (11–20′)",   period: "1H" },
        { seg: 3, label: "1H Late   (21–30′+)",  period: "1H" },
      ],
    },
    {
      title: "SECOND HALF", accent: "#a78bfa", accentBg: "rgba(167,139,250,0.1)",
      period: "2H", tableTop: h2Top,
      segs: [
        { seg: 4, label: "2H Early  (0–10′)",   period: "2H" },
        { seg: 5, label: "2H Mid    (11–20′)",   period: "2H" },
        { seg: 6, label: "2H Late   (21–30′+)",  period: "2H" },
      ],
    },
  ];

  halves.forEach(({ title, accent, accentBg, period, segs, tableTop }) => {
    // ── Section title bar (full-width, coloured bg + left accent pip) ──────────
    ctx.fillStyle = accentBg;
    ctx.fillRect(tableLeft, tableTop, tableW, labelH);
    ctx.fillStyle = accent;
    ctx.fillRect(tableLeft, tableTop, 4, labelH);
    ctx.fillStyle = accent;
    ctx.font = "bold 20px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(title, tableLeft + 18, tableTop + labelH / 2);

    const hY = tableTop + labelH; // header row top

    // ── Header row ─────────────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(tableLeft, hY, tableW, rowH);
    ctx.fillStyle = accent;
    ctx.fillRect(tableLeft, hY, 4, rowH);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 17px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("SEGMENT", tableLeft + 18, hY + rowH / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(homeTeam.toUpperCase(), tableLeft + col0W + col1W / 2,         hY + rowH / 2);
    ctx.fillStyle = "#fb7185";
    ctx.fillText(awayTeam.toUpperCase(), tableLeft + col0W + col1W + col2W / 2, hY + rowH / 2);
    ctx.textAlign = "left";

    let totFor: ScoreResult = { goals: 0, points: 0, total: 0 };
    let totOpp: ScoreResult = { goals: 0, points: 0, total: 0 };

    segs.forEach(({ seg, label }, si) => {
      const segEvts  = validEvts.filter((e) => e.period === period && e.segment === seg);
      const forScore = scoreFromEvents(segEvts.filter((e) => e.teamSide === "FOR"));
      const oppScore = scoreFromEvents(segEvts.filter((e) => e.teamSide === "OPP"));
      totFor = {
        goals:  totFor.goals  + forScore.goals,
        points: totFor.points + forScore.points,
        total:  totFor.total  + forScore.total,
      };
      totOpp = {
        goals:  totOpp.goals  + oppScore.goals,
        points: totOpp.points + oppScore.points,
        total:  totOpp.total  + oppScore.total,
      };

      const rowY = hY + rowH + si * rowH;

      // Alternate row tint
      if (si % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.025)";
        ctx.fillRect(tableLeft, rowY, tableW, rowH);
      }

      // Row separator
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tableLeft, rowY + rowH);
      ctx.lineTo(tableLeft + tableW, rowY + rowH);
      ctx.stroke();

      const midY = rowY + rowH / 2;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "19px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(label, tableLeft + 18, midY);
      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      ctx.fillText(fmtScore(forScore), tableLeft + col0W + col1W / 2,         midY);
      ctx.fillText(fmtScore(oppScore), tableLeft + col0W + col1W + col2W / 2, midY);
      ctx.textAlign = "left";
    });

    // ── TOTAL row — prominent, with 2px accent line above ──────────────────────
    const totalRowY = hY + rowH * (segs.length + 1);

    // Accent line above
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tableLeft, totalRowY);
    ctx.lineTo(tableLeft + tableW, totalRowY);
    ctx.stroke();

    // Coloured bg fill + left pip
    ctx.fillStyle = accentBg;
    ctx.fillRect(tableLeft, totalRowY, tableW, rowH);
    ctx.fillStyle = accent;
    ctx.fillRect(tableLeft, totalRowY, 4, rowH);

    const totalMidY = totalRowY + rowH / 2;
    ctx.fillStyle = accent;
    ctx.font = "bold 20px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("TOTAL", tableLeft + 18, totalMidY);
    ctx.textAlign = "center";
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(fmtScore(totFor), tableLeft + col0W + col1W / 2,         totalMidY);
    ctx.fillStyle = "#fb7185";
    ctx.fillText(fmtScore(totOpp), tableLeft + col0W + col1W + col2W / 2, totalMidY);
    ctx.textAlign = "left";

    // ── Vertical column dividers (span header + data rows + total) ─────────────
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    const divH = rowH * (segs.length + 2); // header(1) + rows(3) + total(1) = 5
    [tableLeft + col0W, tableLeft + col0W + col1W].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, hY);
      ctx.lineTo(x, hY + divH);
      ctx.stroke();
    });
  });

  ctx.restore();
  return canvas;
}

// ─── 22-page spec table ───────────────────────────────────────────────────────

type PageSpec = {
  title: string;
  half: "H1" | "H2";
  teamSide: "FOR" | "OPP" | "ALL";
  category: PdfCategory;
};

const TACTICAL_PAGE_SPECS: readonly PageSpec[] = [
  // FIRST HALF (pages 3–12)
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
  // SECOND HALF (pages 13–22)
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

/** Total page count: 2 fixed pages + 20 tactical pages = 22 */
const TOTAL_PAGES = 2 + TACTICAL_PAGE_SPECS.length;

// ─── Main export entry point ──────────────────────────────────────────────────

/**
 * Generates the 22-page Visual Review PDF and triggers a browser download.
 *
 * Page order:
 *   1. Match Summary
 *   2. Game Segments Breakdown
 *   3–12. First Half tactical pages (All, Scores, Shots/For, Shots/Opp,
 *          Kickouts/For, Kickouts/Opp, Turnovers/For, Turnovers/Opp,
 *          Frees/For, Frees/Opp)
 *   13–22. Second Half mirror of 3–12.
 */
export async function exportReviewPdf(input: ReviewPdfExportInput): Promise<void> {
  const {
    events,
    homeTeamName,
    awayTeamName,
    venueName,
    sport = "gaelic",
  } = input;

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

  // Page 2: Game Segments Breakdown
  addCanvasPage(
    makeSegmentsPage(events, homeTeamName, awayTeamName, TOTAL_PAGES),
    true,
  );

  // Pages 3–22: Tactical pitch pages
  TACTICAL_PAGE_SPECS.forEach((spec, i) => {
    const filtered = selectPdfEvents(events, spec.half, spec.teamSide, spec.category);
    const pageNum = 3 + i;
    let canvas: HTMLCanvasElement;
    try {
      canvas = makeTacticalPage(
        sport, filtered, spec.title, homeTeamName, awayTeamName, pageNum, TOTAL_PAGES,
      );
    } catch {
      canvas = document.createElement("canvas");
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx2 = canvas.getContext("2d");
      if (ctx2) {
        ctx2.fillStyle = "#0d1117";
        ctx2.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx2.fillStyle = "#64748b";
        ctx2.font = "24px sans-serif";
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillText(`${spec.title} — render failed`, CANVAS_W / 2, CANVAS_H / 2);
      }
    }
    addCanvasPage(canvas, true);
  });

  // Download
  const safeName = (s: string) => s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const filename = `${safeName(homeTeamName)}_v_${safeName(awayTeamName)}_review.pdf`;
  pdf.save(filename);
}
