/**
 * reviewPdfExport.ts
 *
 * Generates a multi-page tactical review PDF.
 * Each pitch page captures the live Pixi canvas after applying
 * temporary event filters — no match state or ReviewSession JSON
 * is mutated.
 *
 * Pages:
 *  1.  Cover — match title, teams, venue/date, key stats table
 *  2.  Full pitch  — ALL events
 *  3.  H1
 *  4.  H2
 *  5.  Shots — For
 *  6.  Shots — Against
 *  7.  Turnovers — For
 *  8.  Turnovers — Against
 *  9.  Frees — For
 *  10. Frees — Against
 */

import { jsPDF } from "jspdf";
import { selectReviewEvents } from "./review-selectors";
import type { ReviewSelectableEvent } from "./review-types";

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

  // ── Page 1: Cover / stats ──────────────────────────────────────────────
  drawCoverPage(doc, input);

  // ── Pages 2-10: Pitch snapshots ────────────────────────────────────────
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
