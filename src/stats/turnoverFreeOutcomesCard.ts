import type {
  PossessionFamilySummary,
  PossessionOutcomeSummary,
} from "./chains/chain-types";

const W = 1080;
const H = 1920;
const PAD = 48;
const INNER_PAD = 28;
const GAP = 10;
const DESIGN_H = 380;

const CLR = {
  green:       "#22c55e",
  amber:       "#f59e0b",
  red:         "#ef4444",
  cyan:        "#22d3ee",
  bg:          "#0b1020",
  bgGradEnd:   "#101a37",
  panel:       "rgba(11, 17, 33, 0.88)",
  panelBorder: "rgba(255, 255, 255, 0.08)",
  white:       "#f9fafb",
  offwhite:    "#e5e7eb",
  muted:       "#9ca3af",
  dim:         "#6b7280",
  divider:     "rgba(255,255,255,0.06)",
} as const;

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
  ctx.strokeStyle = CLR.divider; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, CLR.bg); g.addColorStop(1, CLR.bgGradEnd);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.85);
  g1.addColorStop(0, "rgba(34,197,94,0.05)"); g1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.013)"; ctx.lineWidth = 1;
  for (let ly = 180; ly < H; ly += 88) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); }
  const gFade = ctx.createLinearGradient(0, H - 280, 0, H);
  gFade.addColorStop(0, "rgba(0,0,0,0)"); gFade.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = gFade; ctx.fillRect(0, H - 280, W, 280);
  ctx.fillStyle = CLR.cyan; ctx.fillRect(0, 0, W, 16);
}

function drawHeader(ctx: CanvasRenderingContext2D, homeTeam: string, awayTeam: string, stageLabel: string): number {
  ctx.fillStyle = CLR.cyan; ctx.font = "700 26px Inter,system-ui,sans-serif"; ctx.textAlign = "left";
  ctx.fillText("PÁIRCVISION", PAD, 56);
  ctx.fillStyle = CLR.muted; ctx.font = "600 26px Inter,system-ui,sans-serif"; ctx.textAlign = "right";
  ctx.fillText(stageLabel.toUpperCase(), W - PAD, 56); ctx.textAlign = "left";
  ctx.fillStyle = CLR.white; ctx.font = "700 52px Inter,system-ui,sans-serif";
  ctx.fillText("Turnover & Free Outcomes", PAD, 118);
  ctx.fillStyle = CLR.muted; ctx.font = "500 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${homeTeam}  ·  ${awayTeam}`, PAD, 158);
  ctx.strokeStyle = "rgba(34,211,238,0.22)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 174); ctx.lineTo(W - PAD, 174); ctx.stroke();
  return 184;
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string): void {
  rrPath(ctx, x, y, w, h, 14); ctx.fillStyle = CLR.panel; ctx.fill();
  ctx.strokeStyle = CLR.panelBorder; ctx.lineWidth = 1; rrPath(ctx, x, y, w, h, 14); ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 14, y + 1.5); ctx.lineTo(x + w - 14, y + 1.5); ctx.stroke();
}

// ─── Single-branch story section ─────────────────────────────────────────────

type SingleBranchCfg = {
  title: string;
  accentColor: string;
  count: number;
  producedLabel: string;
  summary: PossessionFamilySummary;
  lostLabel: string;
  isOurs: boolean;
  net: number;
};

function drawSingleBranchSection(
  ctx: CanvasRenderingContext2D,
  cfg: SingleBranchCfg,
  startY: number,
  panelH: number,
): number {
  const panelX = PAD;
  const panelW = W - PAD * 2;
  const sc = panelH / DESIGN_H;

  // Scaled Y offsets (designed at DESIGN_H = 380)
  const yTitle    = Math.round(35  * sc);
  const yCount    = Math.round(66  * sc);
  const yDiv1     = Math.round(84  * sc);
  const yProdLbl  = Math.round(108 * sc);
  const yScore    = Math.round(144 * sc);
  const yWides    = Math.round(176 * sc);
  const yLost     = Math.round(203 * sc);
  const yNoOut    = Math.round(228 * sc);
  const yDiv2     = Math.round(252 * sc);
  const yNet      = Math.round(278 * sc);

  drawPanel(ctx, panelX, startY, panelW, panelH, cfg.accentColor);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  const cx = W / 2;
  const sm = cfg.summary;

  ctx.fillStyle = cfg.accentColor; ctx.font = "700 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(cfg.title, ix, startY + yTitle);

  // Count (large, right-aligned)
  ctx.fillStyle = CLR.offwhite; ctx.font = "700 34px Inter,system-ui,sans-serif";
  ctx.textAlign = "right"; ctx.fillText(`${cfg.count}`, ix + iw, startY + yCount);

  hDivider(ctx, ix, startY + yDiv1, iw);

  // "Produced" / "They produced"
  ctx.fillStyle = CLR.muted; ctx.font = "500 17px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(cfg.producedLabel, ix, startY + yProdLbl);

  // Score
  const hasScore = sm.goals > 0 || sm.points > 0;
  ctx.fillStyle = hasScore ? (cfg.isOurs ? CLR.green : CLR.red) : CLR.dim;
  ctx.font = "700 26px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(`${fmtGaelic(sm.goals, sm.points)} scored`, ix, startY + yScore);

  ctx.fillStyle = sm.wides > 0 ? CLR.amber : CLR.dim;
  ctx.font = "500 19px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(`${sm.wides} wides`, ix, startY + yWides);

  ctx.fillStyle = sm.turnovers > 0 ? (cfg.isOurs ? CLR.red : CLR.green) : CLR.dim;
  ctx.font = "500 19px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(`${sm.turnovers} ${cfg.lostLabel}`, ix, startY + yLost);

  ctx.fillStyle = CLR.dim; ctx.font = "500 19px Inter,system-ui,sans-serif";
  ctx.textAlign = "left"; ctx.fillText(`${sm.recycled} no outcome`, ix, startY + yNoOut);

  hDivider(ctx, ix, startY + yDiv2, iw);

  // Inline net (no badge — too small for badge at this height)
  const colour = netClr(cfg.net);
  const valTxt = cfg.net === 0 ? "Even" : `${cfg.net > 0 ? "+" : ""}${cfg.net} pts`;
  ctx.fillStyle = colour; ctx.font = "700 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "center"; ctx.fillText(`Net  ${valTxt}`, cx, startY + yNet);
  ctx.textAlign = "left";

  return startY + panelH + GAP;
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CLR.dim; ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "center"; ctx.fillText("PÁIRCVISION  ·  Turnover & Free Outcomes", W / 2, H - 24);
  ctx.textAlign = "left";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type TurnoverFreeOutcomesCardInput = {
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: "Half Time" | "Full Time";
  summary: PossessionOutcomeSummary;
};

export async function buildTurnoverFreeOutcomesCardPng(
  input: TurnoverFreeOutcomesCardInput,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { summary, homeTeamName, awayTeamName, stageLabel } = input;
  const { turnovers, frees } = summary;

  drawBackground(ctx);
  let y = drawHeader(ctx, homeTeamName, awayTeamName, stageLabel);

  const sections: SingleBranchCfg[] = [
    {
      title:         "TURNOVERS WON",
      accentColor:   CLR.cyan,
      count:         turnovers.retainedCount,
      producedLabel: "Produced",
      summary:       turnovers.retained,
      lostLabel:     "lost ball again",
      isOurs:        true,
      net:           turnovers.retained.scoreValue,
    },
    {
      title:         "TURNOVERS LOST",
      accentColor:   CLR.red,
      count:         turnovers.concededCount,
      producedLabel: "They produced",
      summary:       turnovers.conceded,
      lostLabel:     "won back",
      isOurs:        false,
      net:           -turnovers.conceded.scoreValue,
    },
    {
      title:         "FREES WON",
      accentColor:   CLR.amber,
      count:         frees.retainedCount,
      producedLabel: "Produced",
      summary:       frees.retained,
      lostLabel:     "lost",
      isOurs:        true,
      net:           frees.retained.scoreValue,
    },
    {
      title:         "FREES CONCEDED",
      accentColor:   "#f97316",
      count:         frees.concededCount,
      producedLabel: "They produced",
      summary:       frees.conceded,
      lostLabel:     "won back",
      isOurs:        false,
      net:           -frees.conceded.scoreValue,
    },
  ];

  const availableH = (H - 24) - y - GAP;
  const panelH = Math.floor((availableH - (sections.length - 1) * GAP) / sections.length);

  for (const cfg of sections) {
    y = drawSingleBranchSection(ctx, cfg, y, panelH);
  }

  void y;
  drawFooter(ctx);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return null;

  const stem = `${homeTeamName}-${awayTeamName}-turnover-free-outcomes-${stageLabel}`
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return new File([blob], `${stem || "turnover-free-outcomes"}.png`, { type: "image/png" });
}
