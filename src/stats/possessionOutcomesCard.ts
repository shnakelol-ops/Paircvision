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
 *   356–826 : kickouts section (470px panel)
 *   836–1306: turnovers section (470px panel)
 *   1316–1786: frees section (470px panel)
 *   1896    : footer
 */

import type {
  PossessionOutcomeFamily,
  PossessionOutcomeSummary,
} from "./chains/chain-types";
import type { PitchSport } from "../core/pitch/pitch-config";

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
 * panelH defaults to 470 (3-section layout); pass a smaller value for 4-section split layouts.
 * Returns the Y position after the panel + gap.
 */
function drawFamilySection(
  ctx: CanvasRenderingContext2D,
  family: PossessionOutcomeFamily,
  config: FamilySectionConfig,
  startY: number,
  panelH = 470,
): number {
  const GAP = 10;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  const scale = panelH / 470;

  // Scaled Y offsets (relative to startY)
  const yTitle    = Math.round(38  * scale);
  const yDivTop   = Math.round(58  * scale);
  const yHeaders  = Math.round(76  * scale);
  const yCounts   = Math.round(104 * scale);
  const ySep      = Math.round(122 * scale);
  const yHero     = Math.round(228 * scale);
  const ySublabel = Math.round(256 * scale);
  const yGaelic   = Math.round(302 * scale);
  const yDetail   = Math.round(338 * scale);
  const yBadge    = Math.round(372 * scale);
  const heroFont  = Math.round(76  * scale);

  drawPanel(ctx, panelX, startY, panelW, panelH, config.accentColor);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  const cx = W / 2;

  // Section title
  ctx.fillStyle = config.accentColor;
  ctx.font = "700 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(config.title, ix, startY + yTitle);

  if (family.total === 0) {
    ctx.fillStyle = CLR.dim;
    ctx.font = "500 24px Inter,system-ui,sans-serif";
    ctx.fillText("No events recorded", ix, startY + yTitle + 60);
    return startY + panelH + GAP;
  }

  // Vertical center divider between branches
  ctx.strokeStyle = CLR.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, startY + yDivTop);
  ctx.lineTo(cx, startY + panelH - 18);
  ctx.stroke();

  // Branch headers
  ctx.fillStyle = CLR.muted;
  ctx.font = "600 17px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(config.leftLabel, ix, startY + yHeaders);
  ctx.textAlign = "right";
  ctx.fillText(config.rightLabel, ix + iw, startY + yHeaders);

  // Possession counts
  ctx.fillStyle = CLR.offwhite;
  ctx.font = "600 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${family.retainedCount}/${family.total}`, ix, startY + yCounts);
  ctx.textAlign = "right";
  ctx.fillText(`${family.concededCount}/${family.total}`, ix + iw, startY + yCounts);
  ctx.textAlign = "left";

  // Horizontal separator
  panelDivider(ctx, ix, startY + ySep, iw);

  // Hero scoring percentages
  const leftClr  = goodPctClr(family.retained.scoringPct);
  const rightClr = badPctClr(family.conceded.scoringPct);

  ctx.fillStyle = leftClr;
  ctx.font = `800 ${heroFont}px Inter,system-ui,sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`${family.retained.scoringPct}%`, ix, startY + yHero);

  ctx.fillStyle = rightClr;
  ctx.textAlign = "right";
  ctx.fillText(`${family.conceded.scoringPct}%`, ix + iw, startY + yHero);

  // "scoring %" sublabel
  ctx.fillStyle = CLR.muted;
  ctx.font = "500 18px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("scoring %", ix, startY + ySublabel);
  ctx.textAlign = "right";
  ctx.fillText("scoring %", ix + iw, startY + ySublabel);

  // Gaelic scores
  ctx.fillStyle = leftClr;
  ctx.font = "700 30px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(formatGaelic(family.retained.goals, family.retained.points), ix, startY + yGaelic);

  ctx.fillStyle = rightClr;
  ctx.textAlign = "right";
  ctx.fillText(formatGaelic(family.conceded.goals, family.conceded.points), ix + iw, startY + yGaelic);

  // Detail lines: wides · turnovers · recycled
  ctx.fillStyle = CLR.dim;
  ctx.font = "500 18px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    `${family.retained.wides}wd · ${family.retained.turnovers}t · ${family.retained.recycled}rec`,
    ix, startY + yDetail,
  );
  ctx.textAlign = "right";
  ctx.fillText(
    `${family.conceded.wides}wd · ${family.conceded.turnovers}t · ${family.conceded.recycled}rec`,
    ix + iw, startY + yDetail,
  );
  ctx.textAlign = "left";

  // Net outcome badge (centred)
  drawNetBadge(ctx, config.netLabel, family.netOutcome, cx, startY + yBadge);

  return startY + panelH + GAP;
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
  sport?: PitchSport;
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
    summary,
    homeTeamName, awayTeamName, stageLabel,
    homeScore, awayScore,
    sport = "gaelic",
  } = input;

  const isPuck = sport === "hurling" || sport === "camogie";
  const koLbl  = isPuck ? "Puckout" : "Kickout";
  const koLblU = koLbl.toUpperCase();
  const koAbbr = isPuck ? "P/Os" : "K/Os";

  drawBackground(ctx);
  let y = drawHeader(ctx, homeTeamName, awayTeamName, stageLabel);
  y = drawScorePanel(ctx, homeTeamName, awayTeamName, homeScore, awayScore, y);

  // Build the ordered section list. Split kickouts (OUR / THEIR) when
  // restartOwner data is present; fall back to the combined view for old matches.
  type Section = { family: PossessionOutcomeFamily; config: FamilySectionConfig };
  const sections: Section[] = [];

  if (summary.ourKickouts !== null || summary.theirKickouts !== null) {
    if (summary.ourKickouts) {
      sections.push({ family: summary.ourKickouts, config: {
        title:       `OUR ${koLblU}S`,
        accentColor: CLR.green,
        leftLabel:   "WE KEPT IT",
        rightLabel:  "THEY WON IT",
        netLabel:    `Our ${koAbbr}`,
      }});
    }
    if (summary.theirKickouts) {
      sections.push({ family: summary.theirKickouts, config: {
        title:       `THEIR ${koLblU}S`,
        accentColor: "#15803d",
        leftLabel:   "WE WON IT",
        rightLabel:  "THEY KEPT IT",
        netLabel:    `Their ${koAbbr}`,
      }});
    }
  } else {
    sections.push({ family: summary.kickouts, config: {
      title:       `${koLblU}S`,
      accentColor: CLR.green,
      leftLabel:   "WE WON IT",
      rightLabel:  "THEY WON IT",
      netLabel:    `${koLbl}s`,
    }});
  }

  sections.push({ family: summary.turnovers, config: {
    title:       "TURNOVERS",
    accentColor: CLR.cyan,
    leftLabel:   "BALL WON",
    rightLabel:  "BALL LOST",
    netLabel:    "Turnovers",
  }});
  sections.push({ family: summary.frees, config: {
    title:       "FREES",
    accentColor: CLR.amber,
    leftLabel:   "FREES WON",
    rightLabel:  "CONCEDED",
    netLabel:    "Frees",
  }});

  // Compute panel height so all sections fill the space between score panel and footer.
  const GAP = 10;
  const availableH = (H - 24) - y - GAP;
  const panelH = Math.min(470, Math.floor((availableH - (sections.length - 1) * GAP) / sections.length));

  for (const { family, config } of sections) {
    y = drawFamilySection(ctx, family, config, y, panelH);
  }

  void y;
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
