/**
 * reviewPdfExport.ts
 *
 * Generates a multi-page tactical review PDF.
 * Each pitch page captures the live Pixi canvas after applying
 * temporary event filters — no match state or ReviewSession JSON
 * is mutated.
 *
 * Pages:
 *  1.  Cover — match summary card (or fallback stats table)
 *  2.  Game Segments Breakdown — 1H Early/Mid/Late vs 2H Early/Mid/Late
 *  3.  Full pitch  — ALL events
 *  4.  H1
 *  5.  H2
 *  6.  Shots — For
 *  7.  Shots — Against
 *  8.  Turnovers — For
 *  9.  Turnovers — Against
 *  10. Frees — For
 *  11. Frees — Against
 */

import { jsPDF } from "jspdf";
import { selectReviewEvents } from "./review-selectors";
import type { ReviewSelectableEvent } from "./review-types";
import { deriveSegmentFromPeriodClock } from "./statsSegments";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ReviewPdfInput = {
  /** The host <div> that contains the live Pixi canvas. */
  hostElement: HTMLDivElement;
  /** PixiPitchSurfaceHandle – only `setEvents` is called. */
  handle: {
    setEvents: (events: readonly ReviewSelectableEvent[]) => void;
  };
  homeTeamName: string;
  awayTeamName: string;
  /** Optional venue string. */
  venueName?: string;
  /** Unix ms timestamp used to derive the match date. */
  createdAt?: number;
  /** The full logged event list (never mutated). */
  allEvents: readonly ReviewSelectableEvent[];
  /**
   * The events currently displayed on the pitch before export starts.
   * Restored after all captures complete.
   */
  originalDisplayedEvents: readonly ReviewSelectableEvent[];
  /** Maps category names → MatchEventKind arrays used by selectReviewEvents. */
  reviewFilterKinds: Partial<Record<string, readonly string[]>>;
  firstHalfAttackingDirection: "LEFT" | "RIGHT";
  /**
   * Pre-rendered full summary card as a PNG data URL (base64).
   * When provided, Page 1 shows this image (same card as Share Summary PNG).
   * When null/undefined, Page 1 falls back to the built-in simplified stats table.
   */
  coverImageDataUrl?: string | null;
};

// ---------------------------------------------------------------------------
// Capture specs — one per pitch page (pages 2-10)
// ---------------------------------------------------------------------------

type CaptureSpec = {
  pageLabel: string;
  half: "FULL" | "H1" | "H2";
  teamSide: "ALL" | "FOR" | "OPP";
  category: string;
};

const CAPTURE_SPECS: readonly CaptureSpec[] = [
  { pageLabel: "Full Pitch — All Events", half: "FULL", teamSide: "ALL",  category: "ALL"       },
  { pageLabel: "First Half",              half: "H1",   teamSide: "ALL",  category: "ALL"       },
  { pageLabel: "Second Half",             half: "H2",   teamSide: "ALL",  category: "ALL"       },
  { pageLabel: "Shots — For",             half: "FULL", teamSide: "FOR",  category: "SHOTS"     },
  { pageLabel: "Shots — Against",         half: "FULL", teamSide: "OPP",  category: "SHOTS"     },
  { pageLabel: "Turnovers — For",         half: "FULL", teamSide: "FOR",  category: "TURNOVERS" },
  { pageLabel: "Turnovers — Against",     half: "FULL", teamSide: "OPP",  category: "TURNOVERS" },
  { pageLabel: "Frees — For",             half: "FULL", teamSide: "FOR",  category: "FREES"     },
  { pageLabel: "Frees — Against",         half: "FULL", teamSide: "OPP",  category: "FREES"     },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for `count` animation frames so Pixi can finish re-rendering. */
function waitFrames(count: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let remaining = count;
    const tick = () => {
      remaining--;
      if (remaining <= 0) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Capture the first <canvas> inside `host` as a PNG data-URL. */
function capturePixiCanvas(host: HTMLDivElement): string | null {
  const canvas = host.querySelector("canvas");
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Format a Unix-ms timestamp as YYYY-MM-DD. */
function formatDateYMD(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Build a safe filename token (no special chars). */
function safeFilenameToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Simple stats computation for the cover page
// ---------------------------------------------------------------------------

type TeamStats = {
  goals: number;
  points: number;
  shots: number;
  wides: number;
  toWon: number;
  toLost: number;
  kickWon: number;
  kickLost: number;
  freesFor: number;
  freesAgainst: number;
};

function emptyStats(): TeamStats {
  return { goals: 0, points: 0, shots: 0, wides: 0, toWon: 0, toLost: 0, kickWon: 0, kickLost: 0, freesFor: 0, freesAgainst: 0 };
}

function normaliseTeamSide(e: ReviewSelectableEvent): "FOR" | "OPP" {
  if (e.teamSide === "FOR" || e.teamSide === "own") return "FOR";
  if (e.teamSide === "OPP" || e.teamSide === "opposition") return "OPP";
  if (e.team === "AWAY" || String(e.id ?? "").startsWith("team-away-")) return "OPP";
  return "FOR";
}

function computeStats(events: readonly ReviewSelectableEvent[]): { FOR: TeamStats; OPP: TeamStats } {
  const r = { FOR: emptyStats(), OPP: emptyStats() };
  for (const e of events) {
    const side = normaliseTeamSide(e);
    const b = r[side];
    const k = e.kind;
    if (k === "GOAL")         { b.goals++; b.shots++; }
    else if (k === "POINT" || k === "FREE_SCORED" || k === "TWO_POINTER" || k === "FORTY_FIVE_TWO_POINT") {
      b.points++; b.shots++;
    } else if (k === "SHOT")  { b.shots++; }
    else if (k === "WIDE")    { b.wides++; b.shots++; }
    else if (k === "TURNOVER_WON")    b.toWon++;
    else if (k === "TURNOVER_LOST")   b.toLost++;
    else if (k === "KICKOUT_WON")     b.kickWon++;
    else if (k === "KICKOUT_CONCEDED") b.kickLost++;
    else if (k === "FREE_WON")         b.freesFor++;
    else if (k === "FREE_CONCEDED")    b.freesAgainst++;
  }
  return r;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "0%";
}

function gaelicScore(s: TeamStats): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.goals * 3 + s.points})`;
}

// ---------------------------------------------------------------------------
// Segment stats — for Game Segments Breakdown page (Page 2)
// ---------------------------------------------------------------------------

const SEGMENT_LABELS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "1H EARLY",
  2: "1H MID",
  3: "1H LATE",
  4: "2H EARLY",
  5: "2H MID",
  6: "2H LATE",
};

type SegStats = {
  goals: number;
  points: number;
  twoPtr: number;
  shots: number;
  wides: number;
  toWon: number;
  toLost: number;
  kickWon: number;
  kickLost: number;
  freesWon: number;
};

function emptySegStats(): SegStats {
  return { goals: 0, points: 0, twoPtr: 0, shots: 0, wides: 0, toWon: 0, toLost: 0, kickWon: 0, kickLost: 0, freesWon: 0 };
}

function resolveEventSegment(e: ReviewSelectableEvent): 1 | 2 | 3 | 4 | 5 | 6 {
  // Prefer explicit segment field
  if (e.segment != null && e.segment >= 1 && e.segment <= 6) {
    return e.segment as 1 | 2 | 3 | 4 | 5 | 6;
  }
  // Fall back to half + halfSegment
  if (e.half != null && e.halfSegment != null && e.halfSegment >= 1 && e.halfSegment <= 3) {
    const offset = e.half === 2 ? 3 : 0;
    return (e.halfSegment + offset) as 1 | 2 | 3 | 4 | 5 | 6;
  }
  // Fall back to period + clock (guaranteed path — timestamp is always present)
  const period = e.period ?? (e.half === 2 ? "2H" : "1H");
  const clock = e.matchClockSeconds ?? e.matchTimeSeconds ?? e.timestamp ?? 0;
  return deriveSegmentFromPeriodClock(period, clock);
}

type SegmentBreakdown = Record<1 | 2 | 3 | 4 | 5 | 6, { FOR: SegStats; OPP: SegStats }>;

function computeSegBreakdown(events: readonly ReviewSelectableEvent[]): SegmentBreakdown {
  const init = (): { FOR: SegStats; OPP: SegStats } => ({ FOR: emptySegStats(), OPP: emptySegStats() });
  const result: SegmentBreakdown = { 1: init(), 2: init(), 3: init(), 4: init(), 5: init(), 6: init() };

  for (const e of events) {
    const seg = resolveEventSegment(e);
    const side = normaliseTeamSide(e);
    const b = result[seg][side];
    const k = e.kind;
    if (k === "GOAL")              { b.goals++; b.shots++; }
    else if (k === "TWO_POINTER" || k === "FORTY_FIVE_TWO_POINT") { b.twoPtr++; b.points++; b.shots++; }
    else if (k === "POINT" || k === "FREE_SCORED") { b.points++; b.shots++; }
    else if (k === "SHOT")         { b.shots++; }
    else if (k === "WIDE")         { b.wides++; b.shots++; }
    else if (k === "TURNOVER_WON")     b.toWon++;
    else if (k === "TURNOVER_LOST")    b.toLost++;
    else if (k === "KICKOUT_WON")      b.kickWon++;
    else if (k === "KICKOUT_CONCEDED") b.kickLost++;
    else if (k === "FREE_WON")         b.freesWon++;
  }
  return result;
}

function segScoreLabel(s: SegStats): string {
  const total = s.goals * 3 + s.points;
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${total})`;
}

// ---------------------------------------------------------------------------
// Segment card drawing helpers
// ---------------------------------------------------------------------------

const CARD_W = 95;
const CARD_H = 80;

function drawSegmentCard(
  doc: jsPDF,
  cx: number,
  cy: number,
  segIndex: 1 | 2 | 3 | 4 | 5 | 6,
  homeTeam: string,
  awayTeam: string,
  forStats: SegStats,
  oppStats: SegStats,
): void {
  // Card background
  doc.setFillColor(18, 26, 46);
  doc.rect(cx, cy, CARD_W, CARD_H, "F");

  // Colour-coded top strip: cyan = H1, violet = H2
  const isH2 = segIndex > 3;
  if (isH2) {
    doc.setFillColor(139, 92, 246);   // violet-500
  } else {
    doc.setFillColor(6, 182, 212);    // cyan-500
  }
  doc.rect(cx, cy, CARD_W, 2.5, "F");

  // Segment label
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  if (isH2) {
    doc.setTextColor(196, 181, 253);  // violet-300
  } else {
    doc.setTextColor(103, 232, 249);  // cyan-300
  }
  doc.text(SEGMENT_LABELS[segIndex], cx + 3, cy + 8.5);

  // Score header (FOR green, OPP red)
  const colFor = cx + CARD_W * 0.57;
  const colOpp = cx + CARD_W - 2;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(34, 197, 94);
  doc.text(segScoreLabel(forStats), colFor, cy + 8.5, { align: "right" });
  doc.setTextColor(248, 113, 113);    // red-400
  doc.text(segScoreLabel(oppStats), colOpp, cy + 8.5, { align: "right" });

  // Column header labels
  const headerY = cy + 14;
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(147, 197, 253);    // blue-300 for FOR/home
  doc.text(homeTeam.slice(0, 9).toUpperCase(), colFor, headerY, { align: "right" });
  doc.setTextColor(252, 165, 165);    // red-300 for OPP/away
  doc.text(awayTeam.slice(0, 9).toUpperCase(), colOpp, headerY, { align: "right" });

  // Divider under headers
  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(0.25);
  doc.line(cx + 2, cy + 16, cx + CARD_W - 2, cy + 16);

  // Stat rows
  type StatLine = [string, number, number];
  const rows: StatLine[] = [
    ["Goals",    forStats.goals,    oppStats.goals],
    ["Points",   forStats.points,   oppStats.points],
    ["2-Pt",     forStats.twoPtr,   oppStats.twoPtr],
    ["Shots",    forStats.shots,    oppStats.shots],
    ["Wides",    forStats.wides,    oppStats.wides],
    ["T/O Won",  forStats.toWon,    oppStats.toWon],
    ["T/O Lost", forStats.toLost,   oppStats.toLost],
    ["K/O Won",  forStats.kickWon,  oppStats.kickWon],
    ["K/O Lost", forStats.kickLost, oppStats.kickLost],
  ];

  const STEP = (CARD_H - 19) / rows.length;  // distribute within card
  let ry = cy + 19 + STEP * 0.5;

  for (const [label, forVal, oppVal] of rows) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(156, 163, 175);
    doc.text(label, cx + 3, ry);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(241, 245, 249);
    doc.text(String(forVal), colFor, ry, { align: "right" });
    doc.setTextColor(252, 165, 165);
    doc.text(String(oppVal), colOpp, ry, { align: "right" });
    ry += STEP;
  }
}

// ---------------------------------------------------------------------------
// Segments page (Page 2)
// ---------------------------------------------------------------------------

function drawSegmentsPage(doc: jsPDF, input: ReviewPdfInput): void {
  const { homeTeamName, awayTeamName, allEvents } = input;

  // Background
  doc.setFillColor(BG_R, BG_G, BG_B);
  doc.rect(0, 0, PDF_W, PDF_H, "F");

  // Accent bar
  doc.setFillColor(34, 197, 94);
  doc.rect(0, 0, PDF_W, 3, "F");

  // Branding line
  doc.setTextColor(34, 197, 94);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("PÁIRCVISION — GAME SEGMENTS", 14, 11);

  // Page title
  doc.setTextColor(248, 250, 252);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("GAME SEGMENTS BREAKDOWN", 14, 20);

  // Half labels centred above each column
  const leftCentre  = 7 + CARD_W / 2;
  const rightCentre = 108 + CARD_W / 2;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(103, 232, 249);    // cyan-300 = H1
  doc.text("◀ FIRST HALF", leftCentre, 25.5, { align: "center" });
  doc.setTextColor(196, 181, 253);    // violet-300 = H2
  doc.text("SECOND HALF ▶", rightCentre, 25.5, { align: "center" });

  // Compute breakdown
  const breakdown = computeSegBreakdown(allEvents);

  // 2 × 3 grid: [colX, rowY, segIndex]
  const GRID: [number, number, 1 | 2 | 3 | 4 | 5 | 6][] = [
    [  7,  28, 1], [108,  28, 4],
    [  7, 112, 2], [108, 112, 5],
    [  7, 196, 3], [108, 196, 6],
  ];

  for (const [cx, cy, seg] of GRID) {
    drawSegmentCard(
      doc, cx, cy, seg,
      homeTeamName, awayTeamName,
      breakdown[seg].FOR,
      breakdown[seg].OPP,
    );
  }

  // Footer
  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(0.3);
  doc.line(14, PDF_H - 10, PDF_W - 14, PDF_H - 10);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(`${allEvents.length} events total`, 14, PDF_H - 5.5);
  doc.text("PáircVision", PDF_W - 14, PDF_H - 5.5, { align: "right" });
}

// ---------------------------------------------------------------------------
// PDF dimensions (A4 portrait, mm)
// ---------------------------------------------------------------------------

const PDF_W = 210;
const PDF_H = 297;

const BG_R = 11;
const BG_G = 16;
const BG_B = 32;

// ---------------------------------------------------------------------------
// Cover page (Page 1) — stats only, no canvas capture needed
// ---------------------------------------------------------------------------

function drawCoverPage(
  doc: jsPDF,
  input: ReviewPdfInput,
): void {
  const { homeTeamName, awayTeamName, venueName, createdAt, allEvents } = input;

  // Background
  doc.setFillColor(BG_R, BG_G, BG_B);
  doc.rect(0, 0, PDF_W, PDF_H, "F");

  // Accent bar
  doc.setFillColor(34, 197, 94);
  doc.rect(0, 0, PDF_W, 3, "F");

  // Branding
  doc.setTextColor(34, 197, 94);
  doc.setFontSize(8);
  doc.text("PÁIRCVISION — TACTICAL REVIEW", 14, 12);

  // Match title
  doc.setTextColor(248, 250, 252);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`${homeTeamName} v ${awayTeamName}`, 14, 26);

  // Venue / date
  const dateLabel = createdAt ? formatDateYMD(createdAt) : "";
  const metaLine = [venueName?.trim(), dateLabel].filter(Boolean).join("  ·  ");
  if (metaLine) {
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(metaLine, 14, 33);
  }

  // Divider
  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(0.4);
  doc.line(14, 38, PDF_W - 14, 38);

  // Stats
  const stats = computeStats(allEvents);
  let y = 48;

  const colHome = 90;
  const colAway = 148;

  // Column headers
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(147, 197, 253);
  doc.text(homeTeamName.slice(0, 16).toUpperCase(), colHome, y, { align: "right" });
  doc.text(awayTeamName.slice(0, 16).toUpperCase(), colAway, y, { align: "right" });
  y += 7;

  // Score row
  doc.setTextColor(34, 197, 94);
  doc.setFontSize(14);
  doc.text(gaelicScore(stats.FOR), colHome, y, { align: "right" });
  doc.text(gaelicScore(stats.OPP), colAway, y, { align: "right" });
  y += 12;
  doc.setLineWidth(0.3);
  doc.setDrawColor(55, 65, 81);
  doc.line(14, y - 3, PDF_W - 14, y - 3);

  const statRow = (label: string, home: string | number, away: string | number) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(156, 163, 175);
    doc.text(label, 14, y);
    doc.setTextColor(241, 245, 249);
    doc.setFont("helvetica", "bold");
    doc.text(String(home), colHome, y, { align: "right" });
    doc.text(String(away), colAway, y, { align: "right" });
    y += 6.5;
  };

  const sectionHead = (label: string) => {
    y += 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(147, 197, 253);
    doc.text(label, 14, y);
    y += 5.5;
  };

  const hs = stats.FOR;
  const as = stats.OPP;

  sectionHead("SHOOTING");
  statRow("Shots",      hs.shots,  as.shots);
  statRow("Goals",      hs.goals,  as.goals);
  statRow("Points",     hs.points, as.points);
  statRow("Wides",      hs.wides,  as.wides);
  statRow("Conversion", pct(hs.goals * 3 + hs.points, hs.shots), pct(as.goals * 3 + as.points, as.shots));

  sectionHead("TURNOVERS");
  statRow("Won",   hs.toWon,  as.toWon);
  statRow("Lost",  hs.toLost, as.toLost);
  statRow("Net",   hs.toWon - hs.toLost, as.toWon - as.toLost);

  sectionHead("KICKOUTS");
  statRow("Won",      hs.kickWon,  as.kickWon);
  statRow("Lost",     hs.kickLost, as.kickLost);
  statRow("Win %",    pct(hs.kickWon, hs.kickWon + hs.kickLost), pct(as.kickWon, as.kickWon + as.kickLost));

  sectionHead("FREES");
  statRow("Won",       hs.freesFor,     as.freesFor);
  statRow("Conceded",  hs.freesAgainst, as.freesAgainst);
  statRow("Net",       hs.freesFor - hs.freesAgainst, as.freesFor - as.freesAgainst);

  // Footer
  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(0.3);
  doc.line(14, PDF_H - 14, PDF_W - 14, PDF_H - 14);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(`${allEvents.length} events logged`, 14, PDF_H - 9);
  doc.text("PáircVision", PDF_W - 14, PDF_H - 9, { align: "right" });
}

// ---------------------------------------------------------------------------
// Pitch page (Pages 2-10) — drawn with captured canvas PNG
// ---------------------------------------------------------------------------

function drawPitchPage(
  doc: jsPDF,
  spec: CaptureSpec,
  eventCount: number,
  dataUrl: string | null,
  homeTeamName: string,
  awayTeamName: string,
): void {
  // Background
  doc.setFillColor(BG_R, BG_G, BG_B);
  doc.rect(0, 0, PDF_W, PDF_H, "F");

  // Accent bar
  doc.setFillColor(34, 197, 94);
  doc.rect(0, 0, PDF_W, 2.5, "F");

  // Match label (top-left)
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(`${homeTeamName} v ${awayTeamName}`, 14, 10);

  // Page label (large)
  doc.setTextColor(241, 245, 249);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(spec.pageLabel.toUpperCase(), 14, 18);

  if (dataUrl) {
    // Image area: x=14, y=22, w=182, h=256 (fills most of A4 under the header)
    const IMG_X = 14;
    const IMG_Y = 22;
    const IMG_W = PDF_W - 28;
    const IMG_H = 256;
    doc.addImage(dataUrl, "PNG", IMG_X, IMG_Y, IMG_W, IMG_H);
  } else {
    // Placeholder
    doc.setFillColor(20, 30, 50);
    doc.rect(14, 22, PDF_W - 28, 256, "F");
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("Pitch capture unavailable", PDF_W / 2, 22 + 128, { align: "center" });
  }

  // Footer: event count + branding
  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(0.3);
  doc.line(14, PDF_H - 14, PDF_W - 14, PDF_H - 14);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(`${eventCount} events shown`, 14, PDF_H - 9);
  doc.text("PáircVision", PDF_W - 14, PDF_H - 9, { align: "right" });
}

// ---------------------------------------------------------------------------
// Main export entry-point
// ---------------------------------------------------------------------------

export async function buildReviewPdf(input: ReviewPdfInput): Promise<void> {
  const {
    hostElement,
    handle,
    homeTeamName,
    awayTeamName,
    createdAt,
    allEvents,
    originalDisplayedEvents,
    reviewFilterKinds,
    firstHalfAttackingDirection,
  } = input;

  // Snapshot which events are currently on the pitch so we can restore later.
  const savedDisplayedEvents = originalDisplayedEvents;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Page 1: Cover ─────────────────────────────────────────────────────
  // Prefer the full rich summary card (same image as Share Summary PNG).
  // Fall back to the built-in simplified stats table when unavailable.
  if (input.coverImageDataUrl) {
    // Dark background first so transparent edges (if any) match the card.
    doc.setFillColor(BG_R, BG_G, BG_B);
    doc.rect(0, 0, PDF_W, PDF_H, "F");
    // Stretch the card to fill the A4 page.  The card (1080×≥1640 px) is
    // close enough in proportion to A4 (210×297 mm) that distortion is
    // imperceptible in print / screen PDF viewing.
    doc.addImage(input.coverImageDataUrl, "PNG", 0, 0, PDF_W, PDF_H);
  } else {
    // Fallback: lightweight stats table drawn directly with jsPDF primitives.
    drawCoverPage(doc, input);
  }

  // ── Page 2: Game Segments Breakdown ───────────────────────────────────
  doc.addPage();
  drawSegmentsPage(doc, input);

  // ── Pages 3-11: Pitch snapshots ────────────────────────────────────────
  for (const spec of CAPTURE_SPECS) {
    // 1. Build the filtered event list
    const categoryKinds: Partial<Record<string, readonly string[]>> =
      spec.category === "ALL"
        ? {}
        : { [spec.category]: reviewFilterKinds[spec.category] ?? [] };

    const filtered = selectReviewEvents(allEvents, {
      half: spec.half,
      segment: "ALL",
      teamSide: spec.teamSide,
      category: spec.category,
      categoryKinds: categoryKinds as never,
      zone: "FULL",
      attackingDirection: firstHalfAttackingDirection,
    });

    // 2. Apply to the live Pixi canvas
    handle.setEvents(filtered);

    // 3. Wait for Pixi to finish rendering (two frames for safety)
    await waitFrames(2);

    // 4. Capture
    let dataUrl: string | null = null;
    try {
      dataUrl = capturePixiCanvas(hostElement);
    } catch {
      // dataUrl stays null → placeholder page
    }

    // 5. Add page to PDF
    doc.addPage();
    drawPitchPage(doc, spec, filtered.length, dataUrl, homeTeamName, awayTeamName);
  }

  // ── Restore original events ────────────────────────────────────────────
  handle.setEvents(savedDisplayedEvents);

  // ── Save PDF ───────────────────────────────────────────────────────────
  const dateToken = createdAt ? formatDateYMD(createdAt) : formatDateYMD(Date.now());
  const homeToken = safeFilenameToken(homeTeamName) || "home";
  const awayToken = safeFilenameToken(awayTeamName) || "away";
  const filename = `paircvision-review-${homeToken}-vs-${awayToken}-${dateToken}.pdf`;
  doc.save(filename);
}
