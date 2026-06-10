/**
 * possessionOutcomesCard.ts
 *
 * PNG card renderer — Possession Outcomes (PáircVision V1.1).
 * Outputs a 1080×1920 portrait card suitable for WhatsApp sharing.
 *
 * Entry point: buildPossessionOutcomesCardPng(input)
 *
 * Background: programmatic dark pitch atmosphere (no external image dependency).
 * Panels: semi-transparent glass effect with green/cyan/amber accent borders.
 * Heroes: large coloured percentages — the first thing a coach reads.
 *
 * Regression note: this file is entirely additive.
 * It does NOT import from reviewPdfExport.ts, statsShareCard.ts, or any
 * other existing module. No existing exports are modified.
 */

import type {
  PossessionOutcomeFamily,
  PossessionOutcomeSummary,
  MatchIntelligence,
} from "./chains/chain-types";

// ─── Canvas constants ─────────────────────────────────────────────────────────

const W = 1080;
const H = 1920;
const PAD = 48;
const INNER_PAD = 28; // extra horizontal padding inside panels

// ─── Brand palette ────────────────────────────────────────────────────────────

const CLR = {
  green:       "#22c55e",
  greenDark:   "#15803d",
  amber:       "#f59e0b",
  red:         "#ef4444",
  cyan:        "#22d3ee",
  bg:          "#050d09",
  panel:       "rgba(10, 22, 14, 0.88)",
  panelBorder: "rgba(34, 197, 94, 0.16)",
  white:       "#f9fafb",
  offwhite:    "#e5e7eb",
  muted:       "#9ca3af",
  dim:         "#6b7280",
  divider:     "rgba(255,255,255,0.06)",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Draw a rounded rectangle path (works in all browsers; avoids ctx.roundRect compat issues). */
function rrPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
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

/** Colour for a percentage where higher is better (e.g. scoring %). */
function goodPctClr(pct: number): string {
  if (pct >= 50) return CLR.green;
  if (pct >= 28) return CLR.amber;
  return CLR.red;
}

/** Colour for a percentage where lower is better (e.g. damage %). */
function badPctClr(pct: number): string {
  if (pct < 30) return CLR.green;
  if (pct < 55) return CLR.amber;
  return CLR.red;
}

/** Colour for a net outcome value. */
function netClr(net: number): string {
  if (net > 0) return CLR.green;
  if (net < 0) return CLR.red;
  return CLR.dim;
}

/** Wrap and draw text, returning the Y of the last line drawn. */
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

// ─── Background ───────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D): void {
  // Deep near-black green-tinted base
  ctx.fillStyle = CLR.bg;
  ctx.fillRect(0, 0, W, H);

  // Upper radial spotlight: green glow (floodlit pitch atmosphere)
  const g1 = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.85);
  g1.addColorStop(0,   "rgba(34, 197, 94, 0.08)");
  g1.addColorStop(0.45,"rgba(6, 182, 212, 0.04)");
  g1.addColorStop(1,   "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  // Lower radial glow for depth
  const g2 = ctx.createRadialGradient(W / 2, H * 0.8, 0, W / 2, H * 0.8, W * 0.55);
  g2.addColorStop(0, "rgba(6, 182, 212, 0.05)");
  g2.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // Subtle horizontal pitch-line texture
  ctx.strokeStyle = "rgba(255, 255, 255, 0.013)";
  ctx.lineWidth = 1;
  for (let ly = 180; ly < H; ly += 88) {
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke();
  }

  // Bottom fade-to-dark
  const gFade = ctx.createLinearGradient(0, H - 280, 0, H);
  gFade.addColorStop(0, "rgba(0,0,0,0)");
  gFade.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = gFade;
  ctx.fillRect(0, H - 280, W, 280);

  // Brand accent bar at top
  ctx.fillStyle = CLR.green;
  ctx.fillRect(0, 0, W, 10);
}

// ─── Header ───────────────────────────────────────────────────────────────────

/** Draws the header block and returns the next available Y position. */
function drawHeader(
  ctx: CanvasRenderingContext2D,
  homeTeam: string,
  awayTeam: string,
  stageLabel: string,
): number {
  // Brand name
  ctx.fillStyle = CLR.green;
  ctx.font = "700 26px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("PÁIRCVISION", PAD, 56);

  // Stage label right-aligned
  ctx.fillStyle = CLR.muted;
  ctx.font = "600 26px Inter,system-ui,sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(stageLabel.toUpperCase(), W - PAD, 56);
  ctx.textAlign = "left";

  // Card title
  ctx.fillStyle = CLR.white;
  ctx.font = "700 52px Inter,system-ui,sans-serif";
  ctx.fillText("Possession Outcomes", PAD, 118);

  // Team names
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${homeTeam}  ·  ${awayTeam}`, PAD, 158);

  // Divider line
  ctx.strokeStyle = "rgba(34, 197, 94, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 174); ctx.lineTo(W - PAD, 174); ctx.stroke();

  return 184;
}

// ─── Glass panel ─────────────────────────────────────────────────────────────

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  accentColour: string = CLR.green,
): void {
  // Semi-transparent fill
  rrPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = CLR.panel;
  ctx.fill();

  // Outer border
  ctx.strokeStyle = CLR.panelBorder;
  ctx.lineWidth = 1;
  rrPath(ctx, x, y, w, h, 14);
  ctx.stroke();

  // Top accent line
  ctx.strokeStyle = accentColour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 1.5);
  ctx.lineTo(x + w - 14, y + 1.5);
  ctx.stroke();
}

// ─── Section label ────────────────────────────────────────────────────────────

function drawSectionLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  colour: string = CLR.cyan,
): void {
  ctx.fillStyle = colour;
  ctx.font = "700 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);
}

// ─── Horizontal divider inside a panel ───────────────────────────────────────

function panelDivider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.strokeStyle = CLR.divider;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

// ─── Gaelic score formatter ───────────────────────────────────────────────────

/** Formats a goals + points pair as Gaelic score notation, e.g. "1-05". */
function formatGaelic(goals: number, points: number): string {
  return `${goals}-${points.toString().padStart(2, "0")}`;
}

// ─── Net outcome badge ────────────────────────────────────────────────────────

function drawNetBadge(
  ctx: CanvasRenderingContext2D,
  familyLabel: string,
  net: number,
  cx: number,
  y: number,
): void {
  const colour = netClr(net);
  const valueText = net === 0 ? "Even" : `${net > 0 ? "+" : ""}${net} pts`;
  const fullText = `Net ${familyLabel}: ${valueText}`;

  ctx.font = "700 26px Inter,system-ui,sans-serif";
  const tw = ctx.measureText(fullText).width;
  const bw = tw + 52;
  const bh = 44;
  const bx = cx - bw / 2;

  rrPath(ctx, bx, y, bw, bh, 22);
  ctx.fillStyle = colour + "20";
  ctx.fill();
  ctx.strokeStyle = colour + "55";
  ctx.lineWidth = 1.5;
  rrPath(ctx, bx, y, bw, bh, 22);
  ctx.stroke();

  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.font = "700 24px Inter,system-ui,sans-serif";
  ctx.fillText(fullText, cx, y + 28);
  ctx.textAlign = "left";
}

// ─── Kickouts section ─────────────────────────────────────────────────────────

function drawKickoutsSection(
  ctx: CanvasRenderingContext2D,
  family: PossessionOutcomeFamily,
  startY: number,
): number {
  const panelH = 334;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.green);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 36;

  drawSectionLabel(ctx, "KICKOUTS", ix, y, CLR.green);
  y += 44;

  if (family.total === 0) {
    ctx.fillStyle = CLR.dim;
    ctx.font = "500 26px Inter,system-ui,sans-serif";
    ctx.fillText("No kickouts recorded", ix, y + 40);
    return startY + panelH + 18;
  }

  // Hero row: Our Retention % LEFT | Their Steal % RIGHT
  const retC = goodPctClr(family.retentionPct);
  const stlC = badPctClr(family.stealPct);

  ctx.fillStyle = retC;
  ctx.font = "800 82px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${family.retentionPct}%`, ix, y + 74);
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.fillText(`We retained  ${family.retainedCount}/${family.total}`, ix, y + 100);

  ctx.textAlign = "right";
  ctx.fillStyle = stlC;
  ctx.font = "800 82px Inter,system-ui,sans-serif";
  ctx.fillText(`${family.stealPct}%`, ix + iw, y + 74);
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.fillText(`They won  ${family.concededCount}/${family.total}`, ix + iw, y + 100);
  ctx.textAlign = "left";

  y += 116;
  panelDivider(ctx, ix, y, iw);
  y += 18;

  // Sub-row: Our Scoring % | Their Damage %
  const scC = goodPctClr(family.retained.scoringPct);
  const dmC = badPctClr(family.damagePct);

  ctx.fillStyle = CLR.dim;
  ctx.font = "500 23px Inter,system-ui,sans-serif";
  ctx.fillText("Our scoring %", ix, y);

  ctx.fillStyle = scC;
  ctx.font = "700 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${family.retained.scoringPct}%`, ix + 240, y);

  ctx.textAlign = "right";
  ctx.fillStyle = CLR.dim;
  ctx.font = "500 23px Inter,system-ui,sans-serif";
  ctx.fillText("Their damage", ix + iw, y);
  y -= 2;
  ctx.fillStyle = dmC;
  ctx.font = "700 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${family.damagePct}%`, ix + iw - 180, y);
  ctx.textAlign = "left";

  // Score breakdown: "Scored: 1-05    Conceded: 2-04"
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Scored: ${formatGaelic(family.retained.goals, family.retained.points)}`, ix, y);
  ctx.textAlign = "right";
  ctx.fillText(`Conceded: ${formatGaelic(family.conceded.goals, family.conceded.points)}`, ix + iw, y);
  ctx.textAlign = "left";

  y += 34;
  drawNetBadge(ctx, "Kickouts", family.netOutcome, W / 2, y);

  return startY + panelH + 18;
}

// ─── Turnovers section ────────────────────────────────────────────────────────

function drawTurnoversSection(
  ctx: CanvasRenderingContext2D,
  family: PossessionOutcomeFamily,
  startY: number,
): number {
  const panelH = 340;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.cyan);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 36;

  drawSectionLabel(ctx, "TURNOVERS", ix, y, CLR.cyan);
  y += 44;

  if (family.total === 0) {
    ctx.fillStyle = CLR.dim;
    ctx.font = "500 26px Inter,system-ui,sans-serif";
    ctx.fillText("No turnovers recorded", ix, y + 40);
    return startY + panelH + 18;
  }

  // Won / Lost count strip
  ctx.fillStyle = CLR.offwhite;
  ctx.font = "700 34px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Won  ${family.retainedCount}`, ix, y + 30);
  ctx.textAlign = "right";
  ctx.fillText(`Lost  ${family.concededCount}`, ix + iw, y + 30);
  ctx.textAlign = "left";
  y += 50;

  // Hero row: Our conversion % | Their damage %
  const ourC = goodPctClr(family.retained.scoringPct);
  const theirC = badPctClr(family.damagePct);

  ctx.fillStyle = ourC;
  ctx.font = "800 78px Inter,system-ui,sans-serif";
  ctx.fillText(`${family.retained.scoringPct}%`, ix, y + 68);
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 21px Inter,system-ui,sans-serif";
  ctx.fillText("Our conversion", ix, y + 94);

  ctx.textAlign = "right";
  ctx.fillStyle = theirC;
  ctx.font = "800 78px Inter,system-ui,sans-serif";
  ctx.fillText(`${family.damagePct}%`, ix + iw, y + 68);
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 21px Inter,system-ui,sans-serif";
  ctx.fillText("Their damage", ix + iw, y + 94);
  ctx.textAlign = "left";

  y += 112;
  panelDivider(ctx, ix, y, iw);
  y += 18;

  // Escape %
  ctx.fillStyle = CLR.dim;
  ctx.font = "500 23px Inter,system-ui,sans-serif";
  ctx.fillText("Escape %", ix, y);
  ctx.fillStyle = goodPctClr(family.escapePct);
  ctx.font = "700 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${family.escapePct}%`, ix + 200, y);

  // Score breakdown
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Scored: ${formatGaelic(family.retained.goals, family.retained.points)}`, ix, y);
  ctx.textAlign = "right";
  ctx.fillText(`Conceded: ${formatGaelic(family.conceded.goals, family.conceded.points)}`, ix + iw, y);
  ctx.textAlign = "left";

  y += 34;
  drawNetBadge(ctx, "Turnovers", family.netOutcome, W / 2, y);

  return startY + panelH + 18;
}

// ─── Frees section ────────────────────────────────────────────────────────────

function drawFreesSection(
  ctx: CanvasRenderingContext2D,
  family: PossessionOutcomeFamily,
  startY: number,
): number {
  const panelH = 280;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.amber);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 36;

  drawSectionLabel(ctx, "FREES", ix, y, CLR.amber);
  y += 44;

  if (family.total === 0) {
    ctx.fillStyle = CLR.dim;
    ctx.font = "500 26px Inter,system-ui,sans-serif";
    ctx.fillText("No frees recorded", ix, y + 40);
    return startY + panelH + 18;
  }

  const ourC = goodPctClr(family.retained.scoringPct);
  const dmC  = badPctClr(family.damagePct);
  const ourScores  = family.retained.goals + family.retained.points;
  const theirScores = family.conceded.goals + family.conceded.points;

  // Hero row
  ctx.fillStyle = ourC;
  ctx.font = "800 78px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${family.retained.scoringPct}%`, ix, y + 68);
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 21px Inter,system-ui,sans-serif";
  ctx.fillText(`Our frees  ${ourScores}/${family.retainedCount}`, ix, y + 94);

  ctx.textAlign = "right";
  ctx.fillStyle = dmC;
  ctx.font = "800 78px Inter,system-ui,sans-serif";
  ctx.fillText(`${family.damagePct}%`, ix + iw, y + 68);
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 21px Inter,system-ui,sans-serif";
  ctx.fillText(`Their frees  ${theirScores}/${family.concededCount}`, ix + iw, y + 94);
  ctx.textAlign = "left";

  // Score breakdown
  y += 110;
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Scored: ${formatGaelic(family.retained.goals, family.retained.points)}`, ix, y);
  ctx.textAlign = "right";
  ctx.fillText(`Conceded: ${formatGaelic(family.conceded.goals, family.conceded.points)}`, ix + iw, y);
  ctx.textAlign = "left";

  y += 34;
  drawNetBadge(ctx, "Frees", family.netOutcome, W / 2, y);

  return startY + panelH + 18;
}

// ─── Match Story ──────────────────────────────────────────────────────────────

function drawMatchStory(
  ctx: CanvasRenderingContext2D,
  priorities: readonly string[],
  startY: number,
): void {
  const panelH = Math.min(H - startY - 60, 272);
  if (panelH < 80) return;

  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.dim);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 34;

  ctx.fillStyle = CLR.muted;
  ctx.font = "700 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("MATCH STORY", ix, y);
  y += 34;

  const pillColours = [CLR.green, CLR.amber, CLR.red];

  for (let i = 0; i < Math.min(3, priorities.length); i++) {
    if (y > startY + panelH - 30) break;

    const pc = pillColours[i] ?? CLR.muted;

    // Accent pill/bar on left
    rrPath(ctx, ix, y - 14, 5, 22, 2.5);
    ctx.fillStyle = pc;
    ctx.fill();

    ctx.fillStyle = CLR.white;
    ctx.font = "500 24px Inter,system-ui,sans-serif";
    const lastY = drawWrapped(ctx, priorities[i], ix + 18, y, iw - 20, 30);
    y = lastY + 40;
  }
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CLR.dim;
  ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PÁIRCVISION  ·  Possession Intelligence", W / 2, H - 24);
  ctx.textAlign = "left";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type PossessionOutcomesCardInput = {
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: "Half Time" | "Full Time";
  summary: PossessionOutcomeSummary;
  intelligence: MatchIntelligence;
};

export async function buildPossessionOutcomesCardPng(
  input: PossessionOutcomesCardInput,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { summary, intelligence, homeTeamName, awayTeamName, stageLabel } = input;

  drawBackground(ctx);
  let y = drawHeader(ctx, homeTeamName, awayTeamName, stageLabel);
  y = drawKickoutsSection(ctx, summary.kickouts, y);
  y = drawTurnoversSection(ctx, summary.turnovers, y);
  y = drawFreesSection(ctx, summary.frees, y);
  drawMatchStory(ctx, intelligence.coachingPriorities, y);
  drawFooter(ctx);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return null;

  const stem = `${homeTeamName}-${awayTeamName}-possession-outcomes-${stageLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return new File([blob], `${stem || "possession-outcomes"}.png`, { type: "image/png" });
}
