import type { MatchTargetResult, MatchTargetStatus } from "./matchTargets";

const W = 1920;
const H = 1080;

const STATUS_COLORS: Record<MatchTargetStatus, string> = {
  GREEN:   "#16a34a",
  AMBER:   "#fbbf24",
  RED:     "#ef4444",
  NO_DATA: "#94a3b8",
};

function fillDarkBg(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);
}

function drawTopAccentBar(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#7dd3fc");
  g.addColorStop(1, "#a78bfa");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 6);
}

function drawPageHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  pageNum: number,
  totalPages: number,
): void {
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 33px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 24, 38);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "22px sans-serif";
  ctx.fillText(subtitle, 24, 62);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "19px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${pageNum} / ${totalPages}`, W - 24, 38);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 74);
  ctx.lineTo(W, 74);
  ctx.stroke();
  ctx.restore();
}

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

function drawStatusDot(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  status: MatchTargetStatus,
): void {
  const color = STATUS_COLORS[status];
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color + "28";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.44, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function buildMatchTargetsCard(
  results: MatchTargetResult[],
  teamName: string,
  period: "HT" | "FT" | "REVIEW",
  pageNum: number,
  totalPages: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  fillDarkBg(ctx);
  drawTopAccentBar(ctx);

  const periodLabel = period === "HT" ? "Half Time" : period === "FT" ? "Full Time" : "Full Match";
  drawPageHeader(
    ctx,
    "Performance Against Targets",
    `${teamName} · ${periodLabel}`,
    pageNum,
    totalPages,
  );

  if (results.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No targets set", W / 2, H / 2);
    return canvas;
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  const CONTENT_TOP = 90;
  const CONTENT_BOT = H - 42;   // leave room for legend
  const GAP         = 8;
  const usable      = CONTENT_BOT - CONTENT_TOP;
  const rowH        = Math.floor((usable - GAP * (results.length - 1)) / results.length);

  // Column x positions
  const PNL_X  = 24;
  const PNL_W  = W - PNL_X * 2;
  const LBL_X  = PNL_X + 36;        // metric label left edge
  const LBL_W  = 520;               // label column width
  const ACT_CX = PNL_X + LBL_W + (W - PNL_X - LBL_W - 500) / 2 + 80; // ~890
  const DOT_CX = W - PNL_X - 180;  // status dot centre
  const DOT_R  = 40;

  results.forEach((result, i) => {
    const ry  = CONTENT_TOP + i * (rowH + GAP);
    const cy  = ry + rowH / 2;
    const clr = STATUS_COLORS[result.status];

    // Panel background
    ctx.save();
    rrPath(ctx, PNL_X, ry, PNL_W, rowH, 10);
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fill();
    ctx.restore();

    // Left status accent stripe
    ctx.fillStyle = clr;
    ctx.fillRect(PNL_X, ry, 4, rowH);

    // ── Label column ────────────────────────────────────────────────────────
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign    = "left";
    ctx.fillStyle    = "#f1f5f9";
    ctx.font         = "bold 30px sans-serif";
    ctx.fillText(result.label, LBL_X, cy - 2);

    const dirSym    = result.direction === "atLeast" ? "≥" : "≤";
    const unitSufx  = result.metric === "shots" ? " per half" : "%";
    ctx.fillStyle   = "#fbbf24";
    ctx.font        = "23px sans-serif";
    ctx.fillText(`Target: ${dirSym}${result.targetValue}${unitSufx}`, LBL_X, cy + 28);
    ctx.restore();

    // ── Actual value column ──────────────────────────────────────────────────
    const isShotsSplit = result.metric === "shots" && (period === "FT" || period === "REVIEW");

    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";

    if (isShotsSplit) {
      const h1Cx = ACT_CX - 130;
      const h2Cx = ACT_CX + 130;

      // H1
      ctx.fillStyle = "#64748b";
      ctx.font      = "bold 17px sans-serif";
      ctx.fillText("H1", h1Cx, cy - 38);
      ctx.fillStyle = result.actualH1 !== null ? "#f1f5f9" : "#475569";
      ctx.font      = "bold 68px sans-serif";
      ctx.fillText(result.actualH1 !== null ? String(result.actualH1) : "—", h1Cx, cy + 8);

      // H2
      ctx.fillStyle = "#64748b";
      ctx.font      = "bold 17px sans-serif";
      ctx.fillText("H2", h2Cx, cy - 38);
      ctx.fillStyle = result.actualH2 !== null ? "#f1f5f9" : "#475569";
      ctx.font      = "bold 68px sans-serif";
      ctx.fillText(result.actualH2 !== null ? String(result.actualH2) : "—", h2Cx, cy + 8);

      // Divider between H1 and H2
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(ACT_CX, cy - 50);
      ctx.lineTo(ACT_CX, cy + 46);
      ctx.stroke();
    } else {
      const valStr  = result.actual !== null
        ? `${result.actual}${result.metric !== "shots" ? "%" : ""}`
        : "—";
      ctx.fillStyle = result.actual !== null ? "#f1f5f9" : "#475569";
      ctx.font      = "bold 82px sans-serif";
      ctx.fillText(valStr, ACT_CX, cy);
    }
    ctx.restore();

    // ── Status indicator column ──────────────────────────────────────────────
    if (isShotsSplit) {
      const d1cx = DOT_CX - 52;
      const d2cx = DOT_CX + 52;
      drawStatusDot(ctx, d1cx, cy, DOT_R, result.statusH1);
      drawStatusDot(ctx, d2cx, cy, DOT_R, result.statusH2);
      ctx.save();
      ctx.fillStyle    = "#64748b";
      ctx.font         = "bold 15px sans-serif";
      ctx.textAlign    = "center";
      ctx.textBaseline = "top";
      ctx.fillText("H1", d1cx, cy + DOT_R + 7);
      ctx.fillText("H2", d2cx, cy + DOT_R + 7);
      ctx.restore();
    } else {
      drawStatusDot(ctx, DOT_CX, cy, DOT_R, result.status);
    }
  });

  // ── Legend strip ──────────────────────────────────────────────────────────
  const legendItems: Array<{ label: string; status: MatchTargetStatus }> = [
    { label: "On Target",  status: "GREEN"   },
    { label: "Close",      status: "AMBER"   },
    { label: "Off Target", status: "RED"     },
    { label: "No Data",    status: "NO_DATA" },
  ];

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = "16px sans-serif";
  const legendY = H - 20;
  let lx = 28;
  legendItems.forEach(({ label, status }) => {
    const color = STATUS_COLORS[status];
    ctx.beginPath();
    ctx.arc(lx + 7, legendY, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 20, legendY);
    lx += 20 + Math.ceil(ctx.measureText(label).width) + 32;
  });
  ctx.restore();

  return canvas;
}
