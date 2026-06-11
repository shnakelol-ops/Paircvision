import type {
  PossessionFamilySummary,
  PossessionOutcomeSummary,
} from "./chains/chain-types";

const W = 1080;
const H = 1920;
const PAD = 48;
const INNER_PAD = 28;
const GAP = 10;
const DESIGN_H = 750;

const CLR = {
  green:       "#22c55e",
  amber:       "#f59e0b",
  red:         "#ef4444",
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
  ctx.strokeStyle = CLR.divider;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, CLR.bg); g.addColorStop(1, CLR.bgGradEnd);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.85);
  g1.addColorStop(0, "rgba(34,197,94,0.07)"); g1.addColorStop(0.5, "rgba(34,197,94,0.02)"); g1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.013)"; ctx.lineWidth = 1;
  for (let ly = 180; ly < H; ly += 88) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); }
  const gFade = ctx.createLinearGradient(0, H - 280, 0, H);
  gFade.addColorStop(0, "rgba(0,0,0,0)"); gFade.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = gFade; ctx.fillRect(0, H - 280, W, 280);
  ctx.fillStyle = CLR.green; ctx.fillRect(0, 0, W, 16);
}

function drawHeader(ctx: CanvasRenderingContext2D, homeTeam: string, awayTeam: string, stageLabel: string): number {
  ctx.fillStyle = CLR.green; ctx.font = "700 26px Inter,system-ui,sans-serif"; ctx.textAlign = "left";
  ctx.fillText("PÁIRCVISION", PAD, 56);
  ctx.fillStyle = CLR.muted; ctx.font = "600 26px Inter,system-ui,sans-serif"; ctx.textAlign = "right";
  ctx.fillText(stageLabel.toUpperCase(), W - PAD, 56); ctx.textAlign = "left";
  ctx.fillStyle = CLR.white; ctx.font = "700 52px Inter,system-ui,sans-serif";
  ctx.fillText("Restart Outcomes", PAD, 118);
  ctx.fillStyle = CLR.muted; ctx.font = "500 28px Inter,system-ui,sans-serif";
  ctx.fillText(`${homeTeam}  ·  ${awayTeam}`, PAD, 158);
  ctx.strokeStyle = "rgba(34,197,94,0.22)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 174); ctx.lineTo(W - PAD, 174); ctx.stroke();
  return 184;
}

function drawScorePanel(ctx: CanvasRenderingContext2D, homeTeam: string, awayTeam: string, homeScore: { goals: number; points: number; total: number }, awayScore: { goals: number; points: number; total: number }, startY: number): number {
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

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string): void {
  rrPath(ctx, x, y, w, h, 14); ctx.fillStyle = CLR.panel; ctx.fill();
  ctx.strokeStyle = CLR.panelBorder; ctx.lineWidth = 1; rrPath(ctx, x, y, w, h, 14); ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 14, y + 1.5); ctx.lineTo(x + w - 14, y + 1.5); ctx.stroke();
}

function drawNetBadge(ctx: CanvasRenderingContext2D, label: string, net: number, cx: number, y: number): void {
  const colour = netClr(net);
  const valTxt = net === 0 ? "Even" : `${net > 0 ? "+" : ""}${net} pts`;
  const txt = `Net ${label}: ${valTxt}`;
  ctx.font = "700 24px Inter,system-ui,sans-serif";
  const tw = ctx.measureText(txt).width;
  const bw = tw + 52; const bh = 44; const bx = cx - bw / 2;
  rrPath(ctx, bx, y, bw, bh, 22); ctx.fillStyle = colour + "20"; ctx.fill();
  ctx.strokeStyle = colour + "55"; ctx.lineWidth = 1.5; rrPath(ctx, bx, y, bw, bh, 22); ctx.stroke();
  ctx.fillStyle = colour; ctx.textAlign = "center";
  ctx.font = "700 24px Inter,system-ui,sans-serif"; ctx.fillText(txt, cx, y + 28);
  ctx.textAlign = "left";
}

// ─── Two-sided kickout section ────────────────────────────────────────────────

type BranchData = {
  header: string;
  count: number;
  total: number;
  pct: number;
  producedLabel: string;
  summary: PossessionFamilySummary;
  lostLabel: string;
  isOurs: boolean;
};

type KickoutSectionCfg = {
  title: string;
  accentColor: string;
  netLabel: string;
  left: BranchData;
  right: BranchData;
  net: number;
};

function drawKickoutSection(
  ctx: CanvasRenderingContext2D,
  cfg: KickoutSectionCfg,
  startY: number,
  panelH: number,
): number {
  const panelX = PAD;
  const panelW = W - PAD * 2;
  const sc = panelH / DESIGN_H;

  // Scaled Y offsets relative to startY (designed at DESIGN_H = 750)
  const yTitle     = Math.round(38  * sc);
  const yDivVStart = Math.round(58  * sc);
  const yHeaders   = Math.round(82  * sc);
  const yCounts    = Math.round(112 * sc);
  const yDivH1     = Math.round(132 * sc);
  const yProdLbl   = Math.round(160 * sc);
  const yScore     = Math.round(200 * sc);
  const yWides     = Math.round(238 * sc);
  const yLost      = Math.round(272 * sc);
  const yNoOut     = Math.round(304 * sc);
  const yDivH2     = Math.round(332 * sc);
  const yBadge     = Math.round(372 * sc);

  drawPanel(ctx, panelX, startY, panelW, panelH, cfg.accentColor);

  const ix = panelX + INNER_PAD;
  const iw = panelW - INNER_PAD * 2;
  const cx = W / 2;

  ctx.fillStyle = cfg.accentColor;
  ctx.font = "700 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(cfg.title, ix, startY + yTitle);

  if (cfg.left.total === 0) {
    ctx.fillStyle = CLR.dim; ctx.font = "500 24px Inter,system-ui,sans-serif";
    ctx.fillText("No events recorded", ix, startY + yTitle + 50);
    return startY + panelH + GAP;
  }

  // Center vertical divider
  ctx.strokeStyle = CLR.divider; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, startY + yDivVStart); ctx.lineTo(cx, startY + panelH - 18); ctx.stroke();

  // Full-width horizontal dividers
  hDivider(ctx, ix, startY + yDivH1, iw);
  hDivider(ctx, ix, startY + yDivH2, iw);

  const branches: Array<[BranchData, CanvasTextAlign, number]> = [
    [cfg.left,  "left",  ix],
    [cfg.right, "right", ix + iw],
  ];

  for (const [b, ta, ex] of branches) {
    const sm = b.summary;

    ctx.fillStyle = CLR.muted; ctx.font = "600 19px Inter,system-ui,sans-serif";
    ctx.textAlign = ta; ctx.fillText(b.header, ex, startY + yHeaders);

    ctx.fillStyle = CLR.offwhite; ctx.font = "600 22px Inter,system-ui,sans-serif";
    ctx.textAlign = ta;
    ctx.fillText(
      b.total > 0 ? `${b.count} / ${b.total}  (${b.pct}%)` : "—",
      ex, startY + yCounts,
    );

    ctx.fillStyle = CLR.muted; ctx.font = "500 17px Inter,system-ui,sans-serif";
    ctx.textAlign = ta; ctx.fillText(b.producedLabel, ex, startY + yProdLbl);

    const hasScore = sm.goals > 0 || sm.points > 0;
    ctx.fillStyle = hasScore ? (b.isOurs ? CLR.green : CLR.red) : CLR.dim;
    ctx.font = "700 26px Inter,system-ui,sans-serif";
    ctx.textAlign = ta; ctx.fillText(`${fmtGaelic(sm.goals, sm.points)} scored`, ex, startY + yScore);

    ctx.fillStyle = sm.wides > 0 ? CLR.amber : CLR.dim;
    ctx.font = "500 19px Inter,system-ui,sans-serif";
    ctx.textAlign = ta; ctx.fillText(`${sm.wides} wides`, ex, startY + yWides);

    ctx.fillStyle = sm.turnovers > 0 ? (b.isOurs ? CLR.red : CLR.green) : CLR.dim;
    ctx.font = "500 19px Inter,system-ui,sans-serif";
    ctx.textAlign = ta; ctx.fillText(`${sm.turnovers} ${b.lostLabel}`, ex, startY + yLost);

    ctx.fillStyle = CLR.dim; ctx.font = "500 19px Inter,system-ui,sans-serif";
    ctx.textAlign = ta; ctx.fillText(`${sm.recycled} no outcome`, ex, startY + yNoOut);
  }

  ctx.textAlign = "left";
  drawNetBadge(ctx, cfg.netLabel, cfg.net, cx, startY + yBadge);

  return startY + panelH + GAP;
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CLR.dim; ctx.font = "500 22px Inter,system-ui,sans-serif";
  ctx.textAlign = "center"; ctx.fillText("PÁIRCVISION  ·  Restart Outcomes", W / 2, H - 24);
  ctx.textAlign = "left";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type RestartOutcomesCardInput = {
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: "Half Time" | "Full Time";
  homeScore: { goals: number; points: number; total: number };
  awayScore: { goals: number; points: number; total: number };
  summary: PossessionOutcomeSummary;
};

export async function buildRestartOutcomesCardPng(
  input: RestartOutcomesCardInput,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { summary, homeTeamName, awayTeamName, stageLabel, homeScore, awayScore } = input;

  drawBackground(ctx);
  let y = drawHeader(ctx, homeTeamName, awayTeamName, stageLabel);
  y = drawScorePanel(ctx, homeTeamName, awayTeamName, homeScore, awayScore, y);

  const sections: KickoutSectionCfg[] = [];

  if (summary.ourKickouts !== null || summary.theirKickouts !== null) {
    if (summary.ourKickouts) {
      const ok = summary.ourKickouts;
      sections.push({
        title:       "OUR KICKOUTS",
        accentColor: CLR.green,
        netLabel:    "Our K/Os",
        net:         ok.netOutcome,
        left: {
          header:        "We kept",
          count:         ok.retainedCount,
          total:         ok.total,
          pct:           ok.retentionPct,
          producedLabel: "Produced",
          summary:       ok.retained,
          lostLabel:     "lost",
          isOurs:        true,
        },
        right: {
          header:        "They won",
          count:         ok.concededCount,
          total:         ok.total,
          pct:           ok.stealPct,
          producedLabel: "They produced",
          summary:       ok.conceded,
          lostLabel:     "we won back",
          isOurs:        false,
        },
      });
    }
    if (summary.theirKickouts) {
      const tk = summary.theirKickouts;
      sections.push({
        title:       "THEIR KICKOUTS",
        accentColor: "#15803d",
        netLabel:    "Their K/Os",
        net:         tk.netOutcome,
        left: {
          header:        "They kept",
          count:         tk.concededCount,
          total:         tk.total,
          pct:           tk.stealPct,
          producedLabel: "They produced",
          summary:       tk.conceded,
          lostLabel:     "we won back",
          isOurs:        false,
        },
        right: {
          header:        "We won",
          count:         tk.retainedCount,
          total:         tk.total,
          pct:           tk.retentionPct,
          producedLabel: "Produced",
          summary:       tk.retained,
          lostLabel:     "lost",
          isOurs:        true,
        },
      });
    }
  } else {
    const ko = summary.kickouts;
    sections.push({
      title:       "KICKOUTS",
      accentColor: CLR.green,
      netLabel:    "Kickouts",
      net:         ko.netOutcome,
      left: {
        header:        "We won",
        count:         ko.retainedCount,
        total:         ko.total,
        pct:           ko.retentionPct,
        producedLabel: "Produced",
        summary:       ko.retained,
        lostLabel:     "lost",
        isOurs:        true,
      },
      right: {
        header:        "They won",
        count:         ko.concededCount,
        total:         ko.total,
        pct:           ko.stealPct,
        producedLabel: "They produced",
        summary:       ko.conceded,
        lostLabel:     "we won back",
        isOurs:        false,
      },
    });
  }

  const availableH = (H - 24) - y - GAP;
  const panelH = Math.min(
    DESIGN_H,
    Math.floor((availableH - (sections.length - 1) * GAP) / sections.length),
  );

  for (const cfg of sections) {
    y = drawKickoutSection(ctx, cfg, y, panelH);
  }

  void y;
  drawFooter(ctx);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return null;

  const stem = `${homeTeamName}-${awayTeamName}-restart-outcomes-${stageLabel}`
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return new File([blob], `${stem || "restart-outcomes"}.png`, { type: "image/png" });
}
