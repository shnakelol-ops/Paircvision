import type { PossessionOutcomeSummary } from "./chains/chain-types";

const W = 1080;
const H = 1920;
const PAD = 48;
const INNER_PAD = 28;

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

function netClr(net: number): string {
  if (net > 0) return CLR.green;
  if (net < 0) return CLR.red;
  return CLR.dim;
}

function fmtGaelic(goals: number, points: number): string {
  return `${goals}-${points.toString().padStart(2, "0")}`;
}

function hDivider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.strokeStyle = CLR.divider;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, CLR.bg); g.addColorStop(1, CLR.bgGradEnd);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.88);
  g1.addColorStop(0,   "rgba(6, 182, 212, 0.08)");
  g1.addColorStop(0.5, "rgba(6, 182, 212, 0.02)");
  g1.addColorStop(1,   "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.012)"; ctx.lineWidth = 1;
  for (let ly = 180; ly < H; ly += 88) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); }
  const gFade = ctx.createLinearGradient(0, H - 280, 0, H);
  gFade.addColorStop(0, "rgba(0,0,0,0)"); gFade.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = gFade; ctx.fillRect(0, H - 280, W, 280);
  ctx.fillStyle = CLR.cyan; ctx.fillRect(0, 0, W, 16);
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  homeTeam: string,
  awayTeam: string,
  stageLabel: string,
): number {
  ctx.fillStyle = CLR.cyan; ctx.font = "700 26px Inter,system-ui,sans-serif"; ctx.textAlign = "left";
  ctx.fillText("PÁIRCVISION", PAD, 56);
  ctx.fillStyle = CLR.muted; ctx.font = "600 26px Inter,system-ui,sans-serif"; ctx.textAlign = "right";
  ctx.fillText(stageLabel.toUpperCase(), W - PAD, 56); ctx.textAlign = "left";
  ctx.fillStyle = CLR.white; ctx.font = "700 52px Inter,system-ui,sans-serif";
  ctx.fillText("Match Impact", PAD, 118);
  ctx.fillStyle = CLR.muted; ctx.font = "500 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${homeTeam}  ·  ${awayTeam}`, PAD, 158);
  ctx.strokeStyle = "rgba(6, 182, 212, 0.24)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 174); ctx.lineTo(W - PAD, 174); ctx.stroke();
  return 188;
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  accent: string,
): void {
  rrPath(ctx, x, y, w, h, 14); ctx.fillStyle = CLR.panel; ctx.fill();
  ctx.strokeStyle = CLR.panelBorder; ctx.lineWidth = 1; rrPath(ctx, x, y, w, h, 14); ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 14, y + 1.5); ctx.lineTo(x + w - 14, y + 1.5); ctx.stroke();
}

function drawScorePanel(
  ctx: CanvasRenderingContext2D,
  homeTeam: string,
  awayTeam: string,
  homeScore: { goals: number; points: number; total: number },
  awayScore: { goals: number; points: number; total: number },
  startY: number,
): number {
  const pY = startY + 12; const pH = 150; const pX = 56; const pW = W - 112;
  ctx.fillStyle = CLR.score; ctx.fillRect(pX, pY, pW, pH);
  ctx.strokeStyle = CLR.scoreBorder; ctx.lineWidth = 2; ctx.strokeRect(pX, pY, pW, pH);
  ctx.fillStyle = CLR.white; ctx.font = "700 58px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(fmtGaelic(homeScore.goals, homeScore.points), pX + 24, pY + 82);
  ctx.textAlign = "right"; ctx.fillText(fmtGaelic(awayScore.goals, awayScore.points), pX + pW - 24, pY + 82);
  ctx.fillStyle = CLR.muted; ctx.font = "600 26px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(`${homeTeam} (${homeScore.total})`, pX + 24, pY + 124);
  ctx.textAlign = "right"; ctx.fillText(`${awayTeam} (${awayScore.total})`, pX + pW - 24, pY + 124);
  ctx.textAlign = "left";
  return pY + pH + 10;
}

function drawNetBadge(
  ctx: CanvasRenderingContext2D,
  net: number,
  cx: number,
  y: number,
): number {
  const colour = netClr(net);
  const valueLabel = net === 0 ? "Even" : `${net > 0 ? "+" : ""}${net} pts`;
  const bw = 420; const bh = 90; const bx = cx - bw / 2;
  rrPath(ctx, bx, y, bw, bh, 45); ctx.fillStyle = colour + "1a"; ctx.fill();
  ctx.strokeStyle = colour + "60"; ctx.lineWidth = 2; rrPath(ctx, bx, y, bw, bh, 45); ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = CLR.muted; ctx.font = "500 20px Inter,system-ui,sans-serif";
  ctx.fillText("NET MATCH EFFECT", cx, y + 26);
  ctx.fillStyle = colour; ctx.font = "800 42px Inter,system-ui,sans-serif";
  ctx.fillText(valueLabel, cx, y + 68);
  ctx.textAlign = "left";
  return y + bh + 20;
}

// ─── How the Points Were Scored ───────────────────────────────────────────────

type ContributionRow = {
  sourceLabel: string;
  /** Optional clarifying line under the row (dim italic). */
  subLabel?: string;
  accentColor: string;
  homeWon: number;
  awayWon: number;
  homeScore: { goals: number; points: number };
  awayScore: { goals: number; points: number };
  net: number;
};

function drawContributionsPanel(
  ctx: CanvasRenderingContext2D,
  home: string,
  away: string,
  rows: ContributionRow[],
  startY: number,
): number {
  const panelH = 540;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.cyan);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 38;

  ctx.fillStyle = CLR.cyan;
  ctx.font = "700 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("HOW THE POINTS WERE SCORED", ix, y);
  y += 46;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowStart = y;

    // Source label left, net right
    ctx.fillStyle = r.accentColor;
    ctx.font = "700 22px Inter,system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(r.sourceLabel, ix, rowStart);

    const colour = netClr(r.net);
    const netTxt = r.net === 0 ? "Even" : `Net  ${r.net > 0 ? "+" : ""}${r.net} pts`;
    ctx.fillStyle = colour;
    ctx.font = "700 22px Inter,system-ui,sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(netTxt, ix + iw, rowStart);

    // Contest count
    ctx.fillStyle = CLR.muted;
    ctx.font = "500 18px Inter,system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${home} won ${r.homeWon}  ·  ${away} won ${r.awayWon}`, ix, rowStart + 30);

    // Scores
    const hHasScore = r.homeScore.goals > 0 || r.homeScore.points > 0;
    const aHasScore = r.awayScore.goals > 0 || r.awayScore.points > 0;

    ctx.fillStyle = hHasScore ? CLR.green : CLR.dim;
    ctx.font = "600 20px Inter,system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${home}  ${fmtGaelic(r.homeScore.goals, r.homeScore.points)} scored`, ix, rowStart + 62);

    ctx.fillStyle = aHasScore ? CLR.red : CLR.dim;
    ctx.font = "600 20px Inter,system-ui,sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${fmtGaelic(r.awayScore.goals, r.awayScore.points)} scored  ${away}`, ix + iw, rowStart + 62);

    if (r.subLabel) {
      ctx.fillStyle = CLR.dim;
      ctx.font = "italic 500 16px Inter,system-ui,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(r.subLabel, ix, rowStart + 88, iw);
    }

    y = rowStart + 100;

    if (i < rows.length - 1) {
      hDivider(ctx, ix, y + 5, iw);
      y += 24;
    }
  }

  ctx.textAlign = "left";
  return startY + panelH + 16;
}

// ─── Possession Contest ───────────────────────────────────────────────────────

type ContestRow = {
  label: string;
  value: string;
};

function drawContestPanel(
  ctx: CanvasRenderingContext2D,
  rows: ContestRow[],
  startY: number,
): number {
  const ROW_H = 80;
  const panelH = 46 + rows.length * ROW_H + 30;
  const panelX = PAD;
  const panelW = W - PAD * 2;
  drawPanel(ctx, panelX, startY, panelW, panelH, CLR.green);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  let y = startY + 38;

  ctx.fillStyle = CLR.green;
  ctx.font = "700 21px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("POSSESSION CONTEST", ix, y);
  y += 42;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    ctx.fillStyle = CLR.dim;
    ctx.font = "500 19px Inter,system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(r.label, ix, y + 24);

    ctx.fillStyle = CLR.offwhite;
    ctx.font = "600 21px Inter,system-ui,sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(r.value, ix + iw, y + 24);

    if (i < rows.length - 1) {
      hDivider(ctx, ix, y + ROW_H - 10, iw);
    }

    y += ROW_H;
  }

  ctx.textAlign = "left";
  return startY + panelH + 16;
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CLR.dim; ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "center"; ctx.fillText("PÁIRCVISION  ·  Match Impact", W / 2, H - 24);
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
};

export async function buildMatchIntelligenceCardPng(
  input: MatchIntelligenceCardInput,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { summary, homeTeamName, awayTeamName, stageLabel, homeScore, awayScore } = input;

  const home = homeTeamName || "Team A";
  const away = awayTeamName || "Team B";

  const { kickouts, turnovers, frees } = summary;

  drawBackground(ctx);
  let y = drawHeader(ctx, home, away, stageLabel);
  y = drawScorePanel(ctx, home, away, homeScore, awayScore, y);
  y = drawNetBadge(ctx, summary.overallNetOutcome, W / 2, y + 10);

  // ── How the Points Were Scored ─────────────────────────────────────────────
  const contributionRows: ContributionRow[] = [
    {
      sourceLabel: "KICKOUTS",
      accentColor: CLR.cyan,
      homeWon:     kickouts.retainedCount,
      awayWon:     kickouts.concededCount,
      homeScore:   { goals: kickouts.retained.goals, points: kickouts.retained.points },
      awayScore:   { goals: kickouts.conceded.goals, points: kickouts.conceded.points },
      net:         kickouts.netOutcome,
    },
    {
      sourceLabel: "TURNOVERS",
      accentColor: CLR.amber,
      homeWon:     turnovers.retainedCount,
      awayWon:     turnovers.concededCount,
      homeScore:   { goals: turnovers.retained.goals, points: turnovers.retained.points },
      awayScore:   { goals: turnovers.conceded.goals, points: turnovers.conceded.points },
      net:         turnovers.netOutcome,
    },
    {
      // Possession-frees family (possession-outcomes engine) — a different
      // defined set from Placed Balls in the ledger. The sub-label makes the
      // source visible so this row reconciles with the Turnover & Free
      // Outcomes card ("POSSESSION FREES WON") and Free Kick Analysis.
      sourceLabel: "POSSESSION FREES",
      subLabel:    "Scores in possessions after frees won — placed-ball conversion is in the scoring ledger",
      accentColor: CLR.green,
      homeWon:     frees.retainedCount,
      awayWon:     frees.concededCount,
      homeScore:   { goals: frees.retained.goals, points: frees.retained.points },
      awayScore:   { goals: frees.conceded.goals, points: frees.conceded.points },
      net:         frees.netOutcome,
    },
  ];
  y = drawContributionsPanel(ctx, home, away, contributionRows, y + 10);

  // ── Possession Contest ─────────────────────────────────────────────────────
  const homeStarts = kickouts.retainedCount + turnovers.retainedCount + frees.retainedCount;
  const awayStarts = kickouts.concededCount + turnovers.concededCount + frees.concededCount;

  const contestRows: ContestRow[] = [
    {
      label: "Possession starts",
      value: `${home}: ${homeStarts}  ·  ${away}: ${awayStarts}`,
    },
    {
      label: "Kickout wins",
      value: `${home}: ${kickouts.retainedCount}/${kickouts.total}  ·  ${away}: ${kickouts.concededCount}/${kickouts.total}`,
    },
    {
      label: "Turnovers",
      value: `${home} won ${turnovers.retainedCount}  ·  ${away} won ${turnovers.concededCount}`,
    },
    {
      label: "Possession frees",
      value: `${home} won ${frees.retainedCount}  ·  ${away} won ${frees.concededCount}`,
    },
  ];
  y = drawContestPanel(ctx, contestRows, y);

  void y;
  drawFooter(ctx);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return null;

  const stem = `${homeTeamName}-${awayTeamName}-match-impact-${stageLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return new File([blob], `${stem || "match-impact"}.png`, { type: "image/png" });
}
