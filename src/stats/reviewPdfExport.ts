/**
 * reviewPdfExport.ts
 *
 * Pure PDF composition for the Visual Review export.
 * Handles layout and rendering only — no DOM access, no state mutation,
 * no canvas capture. DOM wiring and download live in StatsModeSurface.tsx.
 */
import jsPDF from "jspdf";

// ─── Input types ─────────────────────────────────────────────────────────────

export type ReviewPdfMatchInfo = {
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  matchDate: string; // YYYY-MM-DD
};

export type ReviewPdfScore = {
  homeGoals: number;
  homePoints: number;
  homeTotal: number;
  awayGoals: number;
  awayPoints: number;
  awayTotal: number;
};

export type ReviewPdfSideStats = {
  shots: number;
  scores: number;
  wides: number;
  conversionPct: string;
  turnoversWon: number;
  turnoversLost: number;
  kickoutsWon: number;
  kickoutsLost: number;
  freesFor: number;
  freesAgainst: number;
};

export type ReviewPdfKeyStats = {
  home: ReviewPdfSideStats;
  away: ReviewPdfSideStats;
};

export type ReviewPdfContextLabels = {
  period: string;
  segment: string;
  teamSide: string;
  category: string;
  activePlayer?: string | null;
};

export type ReviewPdfInput = {
  matchInfo: ReviewPdfMatchInfo;
  score: ReviewPdfScore;
  keyStats: ReviewPdfKeyStats;
  contextLabels: ReviewPdfContextLabels;
  /** PNG data URL from canvas.toDataURL(). Null → placeholder shown on page 2. */
  pitchImageDataUrl?: string | null;
};

// ─── Output ──────────────────────────────────────────────────────────────────

export type ReviewPdfOutput = {
  filename: string;
  blob: Blob;
};

// ─── Layout constants (A4 portrait, points) ──────────────────────────────────

const PW = 595; // page width
const PH = 842; // page height
const M = 40;   // margin
const COL_HOME = 370;
const COL_AWAY = 500;

// ─── Colour helpers ──────────────────────────────────────────────────────────

function rgb(r: number, g: number, b: number): [number, number, number] {
  return [r, g, b];
}

const C_BG        = rgb(11,  16,  32);
const C_BG2       = rgb(17,  24,  39);
const C_BORDER    = rgb(55,  65,  81);
const C_GREEN     = rgb(34, 197,  94);
const C_WHITE     = rgb(249, 250, 251);
const C_GRAY      = rgb(156, 163, 175);
const C_BLUE      = rgb(147, 197, 253);

// ─── Utility ─────────────────────────────────────────────────────────────────

function gaelicScore(goals: number, points: number): string {
  return `${goals}-${String(points).padStart(2, "0")}`;
}

function safePdfFilename(home: string, away: string, date: string): string {
  const slug = `${home}-vs-${away}-${date}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `paircvision-review-report-${slug || "report"}.pdf`;
}

// ─── Page helpers ────────────────────────────────────────────────────────────

function darkPage(doc: jsPDF): void {
  doc.setFillColor(...C_BG);
  doc.rect(0, 0, PW, PH, "F");
  doc.setFillColor(...C_GREEN);
  doc.rect(0, 0, PW, 8, "F");
}

function sectionHeader(doc: jsPDF, label: string, y: number): void {
  doc.setTextColor(...C_BLUE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(label, M, y);
}

function statRow(
  doc: jsPDF,
  label: string,
  home: string,
  away: string,
  y: number,
): void {
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(label, M, y);
  doc.setTextColor(...C_WHITE);
  doc.setFont("helvetica", "bold");
  doc.text(home, COL_HOME, y, { align: "center" });
  doc.text(away, COL_AWAY, y, { align: "center" });
}

function hRule(doc: jsPDF, y: number): void {
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.5);
  doc.line(M, y, PW - M, y);
}

// ─── Page 1 ──────────────────────────────────────────────────────────────────

function drawPage1(doc: jsPDF, input: ReviewPdfInput): void {
  darkPage(doc);

  let y = 52;

  // Report label
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("PáircVision Review Report", M, y);
  y += 28;

  // Match title
  doc.setTextColor(...C_WHITE);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  const matchTitle = `${input.matchInfo.homeTeam} v ${input.matchInfo.awayTeam}`;
  doc.text(matchTitle, M, y);
  y += 22;

  // Venue / date
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const venueDateParts = [input.matchInfo.venue, input.matchInfo.matchDate].filter(Boolean);
  if (venueDateParts.length > 0) {
    doc.text(venueDateParts.join("  ·  "), M, y);
    y += 18;
  }
  y += 8;

  // Score box
  const boxH = 58;
  doc.setFillColor(...C_BG2);
  doc.rect(M, y, PW - M * 2, boxH, "F");
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(1);
  doc.rect(M, y, PW - M * 2, boxH, "S");

  const midY = y + boxH / 2;

  // Home score
  doc.setTextColor(...C_WHITE);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(gaelicScore(input.score.homeGoals, input.score.homePoints), M + 14, midY + 2);

  // Away score (right-aligned)
  doc.text(
    gaelicScore(input.score.awayGoals, input.score.awayPoints),
    PW - M - 14,
    midY + 2,
    { align: "right" },
  );

  // Team name + total below score
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${input.matchInfo.homeTeam} (${input.score.homeTotal})`, M + 14, midY + 16);
  doc.text(
    `${input.matchInfo.awayTeam} (${input.score.awayTotal})`,
    PW - M - 14,
    midY + 16,
    { align: "right" },
  );
  y += boxH + 18;

  // Column headers
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(input.matchInfo.homeTeam, COL_HOME, y, { align: "center" });
  doc.text(input.matchInfo.awayTeam, COL_AWAY, y, { align: "center" });
  y += 8;

  hRule(doc, y);
  y += 14;

  const ROW = 17;
  const GAP = 6;

  const hs = input.keyStats.home;
  const as_ = input.keyStats.away;

  // ── Shooting ──
  sectionHeader(doc, "Shooting", y);
  y += ROW;
  statRow(doc, "Shots",        String(hs.shots),          String(as_.shots),          y); y += ROW;
  statRow(doc, "Scores",       String(hs.scores),         String(as_.scores),         y); y += ROW;
  statRow(doc, "Wides",        String(hs.wides),          String(as_.wides),          y); y += ROW;
  statRow(doc, "Conversion",   hs.conversionPct,          as_.conversionPct,          y); y += ROW + GAP;

  // ── Turnovers ──
  sectionHeader(doc, "Turnovers", y);
  y += ROW;
  statRow(doc, "Won",     String(hs.turnoversWon),  String(as_.turnoversWon),  y); y += ROW;
  statRow(doc, "Lost",    String(hs.turnoversLost), String(as_.turnoversLost), y); y += ROW;
  const toBalHome = hs.turnoversWon - hs.turnoversLost;
  const toBalAway = as_.turnoversWon - as_.turnoversLost;
  statRow(doc, "Balance", String(toBalHome), String(toBalAway), y); y += ROW + GAP;

  // ── Kickouts ──
  sectionHeader(doc, "Kickouts", y);
  y += ROW;
  const koTotalHome = hs.kickoutsWon + hs.kickoutsLost;
  const koTotalAway = as_.kickoutsWon + as_.kickoutsLost;
  statRow(doc, "Won / Total",
    `${hs.kickoutsWon}/${koTotalHome}`,
    `${as_.kickoutsWon}/${koTotalAway}`,
    y);
  y += ROW;
  statRow(doc, "Lost", String(hs.kickoutsLost), String(as_.kickoutsLost), y); y += ROW + GAP;

  // ── Frees ──
  sectionHeader(doc, "Frees", y);
  y += ROW;
  statRow(doc, "Frees For",     String(hs.freesFor),     String(as_.freesFor),     y); y += ROW;
  statRow(doc, "Frees Against", String(hs.freesAgainst), String(as_.freesAgainst), y); y += ROW + GAP;

  // Page 1 footer
  hRule(doc, PH - 36);
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Generated from PáircVision Review", PW - M, PH - 22, { align: "right" });
}

// ─── Page 2 ──────────────────────────────────────────────────────────────────

function drawPage2(doc: jsPDF, input: ReviewPdfInput): void {
  doc.addPage();
  darkPage(doc);

  let y = 46;

  // Heading
  doc.setTextColor(...C_WHITE);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Pitch Review", M, y);
  y += 22;

  // Image area
  const imgW = PW - M * 2;
  const imgH = 440;

  if (input.pitchImageDataUrl) {
    try {
      doc.addImage(input.pitchImageDataUrl, "PNG", M, y, imgW, imgH);
    } catch {
      drawImagePlaceholder(doc, M, y, imgW, imgH, "Pitch snapshot could not be embedded");
    }
  } else {
    drawImagePlaceholder(doc, M, y, imgW, imgH, "Pitch snapshot unavailable — canvas capture failed");
  }
  y += imgH + 22;

  // Active filters
  sectionHeader(doc, "Active Filters", y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(10);

  const ctx = input.contextLabels;
  const filterParts: string[] = [
    `Period: ${ctx.period}`,
    `Segment: ${ctx.segment}`,
    `Team: ${ctx.teamSide}`,
    `Category: ${ctx.category}`,
  ];
  if (ctx.activePlayer) filterParts.push(`Player: ${ctx.activePlayer}`);

  // Wrap if long
  const filterLine = filterParts.join("  ·  ");
  const lines = doc.splitTextToSize(filterLine, PW - M * 2) as string[];
  doc.text(lines, M, y);

  // Footer
  hRule(doc, PH - 36);
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Generated from PáircVision Review", PW - M, PH - 22, { align: "right" });
}

function drawImagePlaceholder(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  message: string,
): void {
  doc.setFillColor(22, 32, 56);
  doc.rect(x, y, w, h, "F");
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(1);
  doc.rect(x, y, w, h, "S");
  doc.setTextColor(...C_GRAY);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(message, x + w / 2, y + h / 2, { align: "center" });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function buildReviewPdf(input: ReviewPdfInput): ReviewPdfOutput {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  drawPage1(doc, input);
  drawPage2(doc, input);

  const filename = safePdfFilename(
    input.matchInfo.homeTeam,
    input.matchInfo.awayTeam,
    input.matchInfo.matchDate,
  );

  const blob = doc.output("blob");
  return { filename, blob };
}
