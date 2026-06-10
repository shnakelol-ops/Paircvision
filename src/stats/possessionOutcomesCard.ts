/**
 * possessionOutcomesCard.ts
 *
 * PNG card renderer — Possession Outcomes (PáircVision V1.1).
 * Outputs a 1080×1920 portrait card showing complete dual-branch possession stories.
 *
 * Entry point: buildPossessionOutcomesCardPng(input)
 *
 * Layout (Y positions):
 *   0–16    : 16px emerald accent bar
 *   16–190  : header (brand, title, team names, divider)
 *   196–346 : score panel
 *   356–736 : kickouts section (380px panel)
 *   746–1126: turnovers section (380px panel)
 *   1136–1516: frees section (380px panel)
 *   1526–   : match story (dynamic, max 268px)
 *   1896    : footer
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
const INNER_PAD = 28;

// ─── Brand palette (navy base, matching Match Summary) ────────────────────────

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

function formatGaelic(goals: number, points: number): string {
  return `${goals}-${points.toString().padStart(2, "0")}`;
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

function panelDivider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.strokeStyle = CLR.divider;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

// ─── Background ───────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D): void {
  // Navy gradient matching Match Summary
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, CLR.bg);
  g.addColorStop(1, CLR.bgGradEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Emerald upper glow (floodlit pitch atmosphere)
  const g1 = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.85);
  g1.addColorStop(0,   "rgba(34, 197, 94, 0.07)");
  g1.addColorStop(0.5, "rgba(34, 197, 94, 0.02)");
  g1.addColorStop(1,   "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g1;
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

  // 16px emerald accent bar at top
  ctx.fillStyle = CLR.green;
  ctx.fillRect(0, 0, W, 16);
}

// ─── Header ───────────────────────────────────────────────────────────────────

function drawHeader(
  ctx: CanvasRenderingContext2D,
  homeTeam: string,
  awayTeam: string,
  stageLabel: string,
): number {
  ctx.fillStyle = CLR.green;
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
  ctx.fillText("Possession Outcomes", PAD, 118);

  ctx.fillStyle = CLR.muted;
  ctx.font = "500 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${homeTeam}  ·  ${awayTeam}`, PAD, 158);

  ctx.strokeStyle = "rgba(34, 197, 94, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 174); ctx.lineTo(W - PAD, 174); ctx.stroke();

  return 184;
}

// ─── Score panel (matching Match Summary style) ───────────────────────────────

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

// ─── Glass panel ─────────────────────────────────────────────────────────────

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  accentColour: string = CLR.green,
): void {
  rrPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = CLR.panel;
  ctx.fill();
  ctx.strokeStyle = CLR.panelBorder;
  ctx.lineWidth = 1;
  rrPath(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.strokeStyle = accentColour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 1.5);
  ctx.lineTo(x + w - 14, y + 1.5);
  ctx.stroke();
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

  ctx.font = "700 24px Inter,system-ui,sans-serif";
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

// ─── Shared dual-branch family section ───────────────────────────────────────

type FamilySectionConfig = {
  /** Panel section title, e.g. "KICKOUTS" */
  title: string;
  accentColor: string;
  /** Left branch header, e.g. "WE WON IT" */
  leftLabel: string;
  /** Right branch header, e.g. "THEY WON IT" */
  rightLabel: string;
  /** Label used in the net badge, e.g. "Kickouts" */
  netLabel: string;
};

/**
 * Renders one possession family as a dual-branch panel.
 * Both branches show: scoring %, Gaelic score, detail line (wides · turnovers · recycled).
 * Returns the Y position after the panel + gap.
 */
function drawFamilySection(
  ctx: CanvasRenderingContext2D,
  family: PossessionOutcomeFamily,
  config: FamilySectionConfig,
  startY: number,
): number {
  const PANEL_H = 380;
  const GAP = 10;
  const panelX = PAD;
  const panelW = W - PAD * 2;

  drawPanel(ctx, panelX, startY, panelW, PANEL_H, config.accentColor);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  const cx = W / 2;

  // Section title
  ctx.fillStyle = config.accentColor;
  ctx.font = "700 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(config.title, ix, startY + 38);

  if (family.total === 0) {
    ctx.fillStyle = CLR.dim;
    ctx.font = "500 24px Inter,system-ui,sans-serif";
    ctx.fillText("No events recorded", ix, startY + 100);
    return startY + PANEL_H + GAP;
  }

  // Vertical center divider between branches
  ctx.strokeStyle = CLR.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, startY + 54);
  ctx.lineTo(cx, startY + 356);
  ctx.stroke();

  // Branch headers
  ctx.fillStyle = CLR.muted;
  ctx.font = "600 17px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(config.leftLabel, ix, startY + 72);
  ctx.textAlign = "right";
  ctx.fillText(config.rightLabel, ix + iw, startY + 72);

  // Possession counts
  ctx.fillStyle = CLR.offwhite;
  ctx.font = "600 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${family.retainedCount}/${family.total}`, ix, startY + 98);
  ctx.textAlign = "right";
  ctx.fillText(`${family.concededCount}/${family.total}`, ix + iw, startY + 98);
  ctx.textAlign = "left";

  // Horizontal separator
  panelDivider(ctx, ix, startY + 113, iw);

  // Hero scoring percentages
  const leftClr  = goodPctClr(family.retained.scoringPct);
  const rightClr = badPctClr(family.conceded.scoringPct);

  ctx.fillStyle = leftClr;
  ctx.font = "800 76px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${family.retained.scoringPct}%`, ix, startY + 198);

  ctx.fillStyle = rightClr;
  ctx.textAlign = "right";
  ctx.fillText(`${family.conceded.scoringPct}%`, ix + iw, startY + 198);

  // "scoring %" sublabel
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 18px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("scoring %", ix, startY + 224);
  ctx.textAlign = "right";
  ctx.fillText("scoring %", ix + iw, startY + 224);

  // Gaelic scores
  ctx.fillStyle = leftClr;
  ctx.font = "700 30px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(formatGaelic(family.retained.goals, family.retained.points), ix, startY + 262);

  ctx.fillStyle = rightClr;
  ctx.textAlign = "right";
  ctx.fillText(formatGaelic(family.conceded.goals, family.conceded.points), ix + iw, startY + 262);

  // Detail lines: wides · turnovers · recycled
  ctx.fillStyle = CLR.dim;
  ctx.font = "500 18px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    `${family.retained.wides}wd · ${family.retained.turnovers}t · ${family.retained.recycled}rec`,
    ix, startY + 290,
  );
  ctx.textAlign = "right";
  ctx.fillText(
    `${family.conceded.wides}wd · ${family.conceded.turnovers}t · ${family.conceded.recycled}rec`,
    ix + iw, startY + 290,
  );
  ctx.textAlign = "left";

  // Net outcome badge (centred)
  drawNetBadge(ctx, config.netLabel, family.netOutcome, cx, startY + 312);

  return startY + PANEL_H + GAP;
}

// ─── Match Story ──────────────────────────────────────────────────────────────

function drawMatchStory(
  ctx: CanvasRenderingContext2D,
  priorities: readonly string[],
  startY: number,
): void {
  const panelH = Math.min(H - startY - 60, 268);
  if (panelH < 80) return;

  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.dim);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 34;

  ctx.fillStyle = CLR.muted;
  ctx.font = "700 20px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("MATCH STORY", ix, y);
  y += 34;

  const pillColours = [CLR.green, CLR.amber, CLR.red];

  for (let i = 0; i < Math.min(3, priorities.length); i++) {
    if (y > startY + panelH - 30) break;

    const pc = pillColours[i] ?? CLR.muted;

    rrPath(ctx, ix, y - 14, 5, 22, 2.5);
    ctx.fillStyle = pc;
    ctx.fill();

    ctx.fillStyle = CLR.white;
    ctx.font = "500 23px Inter,system-ui,sans-serif";
    const lastY = drawWrapped(ctx, priorities[i] ?? "—", ix + 18, y, iw - 20, 30);
    y = lastY + 38;
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
  homeScore: { goals: number; points: number; total: number };
  awayScore: { goals: number; points: number; total: number };
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

  const {
    summary, intelligence,
    homeTeamName, awayTeamName, stageLabel,
    homeScore, awayScore,
  } = input;

  drawBackground(ctx);
  let y = drawHeader(ctx, homeTeamName, awayTeamName, stageLabel);
  y = drawScorePanel(ctx, homeTeamName, awayTeamName, homeScore, awayScore, y);

  y = drawFamilySection(ctx, summary.kickouts, {
    title:       "KICKOUTS",
    accentColor: CLR.green,
    leftLabel:   "WE WON IT",
    rightLabel:  "THEY WON IT",
    netLabel:    "Kickouts",
  }, y);

  y = drawFamilySection(ctx, summary.turnovers, {
    title:       "TURNOVERS",
    accentColor: CLR.cyan,
    leftLabel:   "BALL WON",
    rightLabel:  "BALL LOST",
    netLabel:    "Turnovers",
  }, y);

  y = drawFamilySection(ctx, summary.frees, {
    title:       "FREES",
    accentColor: CLR.amber,
    leftLabel:   "FREES WON",
    rightLabel:  "CONCEDED",
    netLabel:    "Frees",
  }, y);

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
