import type { MatchEventKind } from "../core/stats/stats-event-model";

type ReviewContextEvent = {
  id: string;
  kind: MatchEventKind;
  nx: number;
  ny: number;
  x?: number;
  y?: number;
  teamSide?: "FOR" | "OPP" | "own" | "opposition";
  team?: "HOME" | "AWAY";
};

export type ExportReviewContextImageInput = {
  teamAName: string;
  teamBName: string;
  venue?: string;
  contextLabel: string;
  visibleEvents: readonly ReviewContextEvent[];
  generatedAt?: number;
};

function colorForEvent(kind: MatchEventKind): string {
  if (kind === "GOAL") return "#22c55e";
  if (kind === "POINT") return "#38bdf8";
  if (kind === "WIDE") return "#f87171";
  if (kind === "TWO_POINTER" || kind === "FORTY_FIVE_TWO_POINT") return "#f59e0b";
  if (kind === "SHOT") return "#e5e7eb";
  if (kind === "KICKOUT_WON") return "#34d399";
  if (kind === "KICKOUT_CONCEDED") return "#f97316";
  if (kind === "TURNOVER_WON") return "#a78bfa";
  if (kind === "TURNOVER_LOST") return "#ef4444";
  if (kind === "FREE_WON") return "#60a5fa";
  if (kind === "FREE_CONCEDED") return "#fb7185";
  if (kind === "FREE_SCORED") return "#22d3ee";
  if (kind === "FREE_MISSED") return "#fda4af";
  return "#cbd5e1";
}

function normalizeTeamSide(input: ReviewContextEvent): "FOR" | "OPP" {
  if (input.teamSide === "FOR" || input.teamSide === "OPP") return input.teamSide;
  if (input.teamSide === "own") return "FOR";
  if (input.teamSide === "opposition") return "OPP";
  if (input.team === "AWAY" || input.id.startsWith("team-away-")) return "OPP";
  return "FOR";
}

function drawPitch(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  const line = "rgba(226, 232, 240, 0.85)";
  ctx.fillStyle = "#0b4f30";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  const midX = x + width / 2;
  ctx.beginPath();
  ctx.moveTo(midX, y);
  ctx.lineTo(midX, y + height);
  ctx.stroke();

  const centerR = Math.min(width, height) * 0.08;
  ctx.beginPath();
  ctx.arc(midX, y + height / 2, centerR, 0, Math.PI * 2);
  ctx.stroke();

  const boxW = width * 0.16;
  const boxH = height * 0.5;
  const smallBoxW = width * 0.08;
  const smallBoxH = height * 0.26;
  ctx.strokeRect(x, y + (height - boxH) / 2, boxW, boxH);
  ctx.strokeRect(x, y + (height - smallBoxH) / 2, smallBoxW, smallBoxH);
  ctx.strokeRect(x + width - boxW, y + (height - boxH) / 2, boxW, boxH);
  ctx.strokeRect(x + width - smallBoxW, y + (height - smallBoxH) / 2, smallBoxW, smallBoxH);

  ctx.beginPath();
  ctx.arc(x + width * 0.21, y + height / 2, width * 0.06, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + width * 0.79, y + height / 2, width * 0.06, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.stroke();
}

export async function exportReviewContextImage(input: ExportReviewContextImageInput): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const generatedAt = input.generatedAt ?? Date.now();
  const headerH = 230;
  const footerH = 190;
  const pitchX = 70;
  const pitchY = headerH + 20;
  const pitchW = canvas.width - 140;
  const pitchH = canvas.height - headerH - footerH - 40;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#0b1020");
  grad.addColorStop(1, "#111827");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 52px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("PáircVision Review", 70, 82);
  ctx.font = "600 34px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(`${input.teamAName} v ${input.teamBName} · ${input.venue?.trim() || "Unknown venue"}`, 70, 138);
  ctx.fillStyle = "#93c5fd";
  ctx.font = "600 30px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(input.contextLabel, 70, 186);

  drawPitch(ctx, pitchX, pitchY, pitchW, pitchH);

  for (const event of input.visibleEvents) {
    const xNorm = event.x ?? event.nx;
    const yNorm = event.y ?? event.ny;
    const px = pitchX + Math.max(0, Math.min(1, xNorm)) * pitchW;
    const py = pitchY + Math.max(0, Math.min(1, yNorm)) * pitchH;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fillStyle = colorForEvent(event.kind);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.95)";
    ctx.stroke();
  }

  let forCount = 0;
  let oppCount = 0;
  for (const event of input.visibleEvents) {
    const side = normalizeTeamSide(event);
    if (side === "FOR") forCount += 1;
    else oppCount += 1;
  }

  const footerY = canvas.height - footerH + 44;
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 34px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(`Visible events: ${input.visibleEvents.length}`, 70, footerY);
  ctx.font = "500 30px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(`FOR: ${forCount}   OPP: ${oppCount}`, 70, footerY + 48);
  ctx.fillStyle = "#64748b";
  ctx.font = "500 24px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("PáircVision", 70, canvas.height - 44);
  ctx.textAlign = "right";
  ctx.fillText(new Date(generatedAt).toLocaleString(), canvas.width - 70, canvas.height - 44);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) return null;
  const name = `paircvision-review-${generatedAt}.png`;
  return new File([blob], name, { type: "image/png" });
}
