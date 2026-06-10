/**
 * matchIntelligenceCard.ts
 *
 * PNG card renderer — Match Intelligence (PáircVision V1.1).
 * Outputs a 1080×1920 portrait card for the "coach's brief" view.
 *
 * Entry point: buildMatchIntelligenceCardPng(input)
 *
 * This card shows the WHY: highest damage source, best/worst family,
 * overall net outcome, and three coaching priorities.
 *
 * Regression note: entirely additive — no imports from existing modules.
 */

import type {
  PossessionOutcomeSummary,
  MatchIntelligence,
} from "./chains/chain-types";

// ─── Canvas constants ─────────────────────────────────────────────────────────

const W = 1080;
const H = 1920;
const PAD = 48;
const INNER_PAD = 28;

// ─── Brand palette ────────────────────────────────────────────────────────────

const CLR = {
  green:       "#22c55e",
  amber:       "#f59e0b",
  red:         "#ef4444",
  cyan:        "#22d3ee",
  bg:          "#0b1020",
  bgGradEnd:   "#101a37",
  panel:       "rgba(11, 17, 33, 0.88)",
  panelBorder: "rgba(255, 255, 255, 0.08)",
  score:       "#111827",
  scoreBorder: "#374151",
  white:       "#f9fafb",
  offwhite:    "#e5e7eb",
  muted:       "#9ca3af",
  dim:         "#6b7280",
  divider:     "rgba(255,255,255,0.06)",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function goodPctClr(pct: number): string {
  if (pct >= 50) return CLR.green;
  if (pct >= 28) return CLR.amber;
  return CLR.red;
}

function badPctClr(pct: number): string {
  if (pct < 30) return CLR.green;
  if (pct < 55) return CLR.amber;
  return CLR.red;
}

function netClr(net: number): string {
  if (net > 0) return CLR.green;
  if (net < 0) return CLR.red;
  return CLR.dim;
}

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
  // Navy gradient matching Match Summary
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, CLR.bg);
  g.addColorStop(1, CLR.bgGradEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Cyan upper glow (distinguishes this card from the Outcomes card)
  const g1 = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.88);
  g1.addColorStop(0,   "rgba(6, 182, 212, 0.08)");
  g1.addColorStop(0.5, "rgba(6, 182, 212, 0.02)");
  g1.addColorStop(1,   "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.012)";
  ctx.lineWidth = 1;
  for (let ly = 180; ly < H; ly += 88) {
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke();
  }

  const gFade = ctx.createLinearGradient(0, H - 280, 0, H);
  gFade.addColorStop(0, "rgba(0,0,0,0)");
  gFade.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = gFade;
  ctx.fillRect(0, H - 280, W, 280);

  // 16px cyan accent bar
  ctx.fillStyle = CLR.cyan;
  ctx.fillRect(0, 0, W, 16);
}

// ─── Header ───────────────────────────────────────────────────────────────────

function drawHeader(
  ctx: CanvasRenderingContext2D,
  homeTeam: string,
  awayTeam: string,
  stageLabel: string,
): number {
  ctx.fillStyle = CLR.cyan;
  ctx.font = "700 26px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("PÁIRCVISION", PAD, 56);

  ctx.fillStyle = CLR.muted;
  ctx.font = "600 26px Inter,system-ui,sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(stageLabel.toUpperCase(), W - PAD, 56);
  ctx.textAlign = "left";

  ctx.fillStyle = CLR.white;
  ctx.font = "700 52px Inter,system-ui,sans-serif";
  ctx.fillText("Match Intelligence", PAD, 118);

  ctx.fillStyle = CLR.muted;
  ctx.font = "500 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${homeTeam}  ·  ${awayTeam}`, PAD, 158);

  ctx.strokeStyle = "rgba(6, 182, 212, 0.24)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 174); ctx.lineTo(W - PAD, 174); ctx.stroke();

  return 188;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  accent: string = CLR.cyan,
): void {
  rrPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = CLR.panel;
  ctx.fill();
  ctx.strokeStyle = CLR.panelBorder;
  ctx.lineWidth = 1;
  rrPath(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 1.5);
  ctx.lineTo(x + w - 14, y + 1.5);
  ctx.stroke();
}

// ─── Intelligence row (label + value right-aligned) ───────────────────────────

function drawIntelRow(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  valueColour: string,
  x: number,
  y: number,
  w: number,
): number {
  ctx.fillStyle = CLR.dim;
  ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);

  ctx.fillStyle = valueColour;
  ctx.font = "700 30px Inter,system-ui,sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(value, x + w, y);
  ctx.textAlign = "left";

  return y + 50;
}

// ─── Divider ─────────────────────────────────────────────────────────────────

function panelDivider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.strokeStyle = CLR.divider;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

// ─── Score panel ─────────────────────────────────────────────────────────────

function drawScorePanel(
  ctx: CanvasRenderingContext2D,
  homeTeam: string,
  awayTeam: string,
  homeScore: { goals: number; points: number; total: number },
  awayScore: { goals: number; points: number; total: number },
  startY: number,
): number {
  const panelY = startY + 12;
  const panelH = 150;
  const panelX = 56;
  const panelW = W - 112;
  const formatGaelic = (g: number, p: number) => `${g}-${p.toString().padStart(2, "0")}`;

  ctx.fillStyle = CLR.score;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = CLR.scoreBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = CLR.white;
  ctx.font = "700 58px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(formatGaelic(homeScore.goals, homeScore.points), panelX + 24, panelY + 82);
  ctx.textAlign = "right";
  ctx.fillText(formatGaelic(awayScore.goals, awayScore.points), panelX + panelW - 24, panelY + 82);
  ctx.textAlign = "left";

  ctx.fillStyle = CLR.muted;
  ctx.font = "600 26px Inter,system-ui,sans-serif";
  ctx.fillText(`${homeTeam} (${homeScore.total})`, panelX + 24, panelY + 124);
  ctx.textAlign = "right";
  ctx.fillText(`${awayTeam} (${awayScore.total})`, panelX + panelW - 24, panelY + 124);
  ctx.textAlign = "left";

  return panelY + panelH + 10;
}

// ─── Key Intelligence panel ───────────────────────────────────────────────────

function drawIntelligencePanel(
  ctx: CanvasRenderingContext2D,
  intel: MatchIntelligence,
  startY: number,
): number {
  const panelH = 310;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.cyan);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 36;

  ctx.fillStyle = CLR.cyan;
  ctx.font = "700 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("KEY INTELLIGENCE", ix, y);
  y += 40;

  if (intel.highestDamageFamily) {
    y = drawIntelRow(
      ctx,
      "Highest Damage Source",
      `${intel.highestDamageFamily.label}  ${intel.highestDamageFamily.damagePct}%`,
      badPctClr(intel.highestDamageFamily.damagePct),
      ix, y, iw,
    );
    panelDivider(ctx, ix, y - 10, iw);
  }

  if (intel.bestScoringFamily) {
    y = drawIntelRow(
      ctx,
      "Best Possession Family",
      `${intel.bestScoringFamily.label}  ${intel.bestScoringFamily.scoringPct}%`,
      goodPctClr(intel.bestScoringFamily.scoringPct),
      ix, y, iw,
    );
    panelDivider(ctx, ix, y - 10, iw);
  }

  if (intel.worstScoringFamily) {
    y = drawIntelRow(
      ctx,
      "Lowest Converting Family",
      `${intel.worstScoringFamily.label}  ${intel.worstScoringFamily.scoringPct}%`,
      goodPctClr(intel.worstScoringFamily.scoringPct),
      ix, y, iw,
    );
  }

  if (!intel.highestDamageFamily && !intel.bestScoringFamily && !intel.worstScoringFamily) {
    ctx.fillStyle = CLR.dim;
    ctx.font = "500 26px Inter,system-ui,sans-serif";
    ctx.fillText("Insufficient data for intelligence analysis", ix, y + 40);
  }

  return startY + panelH + 20;
}

// ─── Net Outcome badge (large centred) ───────────────────────────────────────

function drawLargeNetBadge(
  ctx: CanvasRenderingContext2D,
  net: number,
  cx: number,
  y: number,
): number {
  const colour = netClr(net);
  const valueLabel = net === 0 ? "Even" : `${net > 0 ? "+" : ""}${net} pts`;

  const bw = 420;
  const bh = 90;
  const bx = cx - bw / 2;

  rrPath(ctx, bx, y, bw, bh, 45);
  ctx.fillStyle = colour + "1a";
  ctx.fill();
  ctx.strokeStyle = colour + "60";
  ctx.lineWidth = 2;
  rrPath(ctx, bx, y, bw, bh, 45);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 20px Inter,system-ui,sans-serif";
  ctx.fillText("OVERALL NET OUTCOME", cx, y + 26);

  ctx.fillStyle = colour;
  ctx.font = "800 42px Inter,system-ui,sans-serif";
  ctx.fillText(valueLabel, cx, y + 68);
  ctx.textAlign = "left";

  return y + bh + 24;
}

// ─── Coaching Priorities panel ────────────────────────────────────────────────

function drawPrioritiesPanel(
  ctx: CanvasRenderingContext2D,
  priorities: readonly string[],
  startY: number,
): number {
  const panelH = 564;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.green);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 36;

  ctx.fillStyle = CLR.green;
  ctx.font = "700 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("COACHING PRIORITIES", ix, y);
  y += 44;

  const ordinalColours = [CLR.green, CLR.amber, CLR.red];

  for (let i = 0; i < 3; i++) {
    const text = priorities[i] ?? "—";
    const oc = ordinalColours[i] ?? CLR.muted;

    // Large ordinal number
    ctx.fillStyle = oc;
    ctx.font = "800 44px Inter,system-ui,sans-serif";
    ctx.fillText(`0${i + 1}`, ix, y + 36);

    // Priority text, wrapped
    ctx.fillStyle = CLR.white;
    ctx.font = "500 25px Inter,system-ui,sans-serif";
    const lastLineY = drawWrapped(ctx, text, ix + 72, y + 8, iw - 72, 32);
    y = lastLineY + 48;

    if (i < 2) {
      panelDivider(ctx, ix, y - 14, iw);
    }
  }

  return startY + panelH + 18;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CLR.dim;
  ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PÁIRCVISION  ·  Match Intelligence", W / 2, H - 24);
  ctx.textAlign = "left";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type MatchIntelligenceCardInput = {
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: "Half Time" | "Full Time";
  homeScore: { goals: number; points: number; total: number };
  awayScore: { goals: number; points: number; total: number };
  summary: PossessionOutcomeSummary;
  intelligence: MatchIntelligence;
};

export async function buildMatchIntelligenceCardPng(
  input: MatchIntelligenceCardInput,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { intelligence, homeTeamName, awayTeamName, stageLabel, homeScore, awayScore } = input;

  drawBackground(ctx);
  let y = drawHeader(ctx, homeTeamName, awayTeamName, stageLabel);
  y = drawScorePanel(ctx, homeTeamName, awayTeamName, homeScore, awayScore, y);
  y = drawIntelligencePanel(ctx, intelligence, y);
  y = drawLargeNetBadge(ctx, intelligence.overallNetOutcome, W / 2, y);
  drawPrioritiesPanel(ctx, intelligence.coachingPriorities, y);
  drawFooter(ctx);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return null;

  const stem = `${homeTeamName}-${awayTeamName}-match-intelligence-${stageLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return new File([blob], `${stem || "match-intelligence"}.png`, { type: "image/png" });
}
