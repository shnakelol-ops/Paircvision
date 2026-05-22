type TeamScore = { goals: number; points: number; total: number };

type ShareCardCounts = {
  goals: number;
  points: number;
  twoPointers: number;
  shots: number;
  wides: number;
  turnoverWon: number;
  turnoverLost: number;
  kickoutWon: number;
  kickoutLost: number;
  freeWon: number;
  freeConceded: number;
};

type StatsShareCardInput = {
  stageLabel: "Half Time" | "Full Time";
  homeTeamName: string;
  awayTeamName: string;
  venueLabel: string;
  clockLabel: string;
  homeScore: TeamScore;
  awayScore: TeamScore;
  counts: ShareCardCounts;
  eventCount: number;
};

const CARD_WIDTH = 1080;
const formatGaelicScore = (score: TeamScore): string => `${score.goals}-${score.points}`;
const CARD_HEIGHT = 1350;

function drawRow(ctx: CanvasRenderingContext2D, y: number, label: string, value: string): void {
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 36px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(label, 88, y);
  ctx.fillStyle = "#f3f4f6";
  ctx.font = "700 40px Inter, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(value, CARD_WIDTH - 88, y);
  ctx.textAlign = "left";
}

export async function buildStatsShareCardPng(input: StatsShareCardInput): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  grad.addColorStop(0, "#0b1020");
  grad.addColorStop(1, "#101a37");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = "#22c55e";
  ctx.fillRect(0, 0, CARD_WIDTH, 20);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "600 38px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(input.stageLabel, 88, 110);

  ctx.fillStyle = "#f9fafb";
  ctx.font = "700 56px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(`${input.homeTeamName} v ${input.awayTeamName}`, 88, 196);

  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 32px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(`${input.venueLabel} · ${input.clockLabel}`, 88, 244);

  ctx.fillStyle = "#111827";
  ctx.fillRect(68, 286, CARD_WIDTH - 136, 170);
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.strokeRect(68, 286, CARD_WIDTH - 136, 170);

  ctx.fillStyle = "#f9fafb";
  ctx.font = "700 64px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(formatGaelicScore(input.homeScore), 96, 394);
  ctx.textAlign = "right";
  ctx.fillText(formatGaelicScore(input.awayScore), CARD_WIDTH - 96, 394);
  ctx.textAlign = "left";

  ctx.fillStyle = "#9ca3af";
  ctx.font = "600 30px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(`${input.homeTeamName} (${input.homeScore.total})`, 96, 438);
  ctx.textAlign = "right";
  ctx.fillText(`${input.awayTeamName} (${input.awayScore.total})`, CARD_WIDTH - 96, 438);
  ctx.textAlign = "left";

  let y = 560;
  drawRow(ctx, y, "Goals", String(input.counts.goals));
  y += 82;
  drawRow(ctx, y, "Points", String(input.counts.points));
  y += 82;
  drawRow(ctx, y, "2PT", String(input.counts.twoPointers));
  y += 82;
  drawRow(ctx, y, "Shots / Wides", `${input.counts.shots} / ${input.counts.wides}`);
  y += 82;
  drawRow(ctx, y, "Turnovers W/L", `${input.counts.turnoverWon} / ${input.counts.turnoverLost}`);
  y += 82;
  drawRow(ctx, y, "Kickouts W/L", `${input.counts.kickoutWon} / ${input.counts.kickoutLost}`);
  y += 82;
  drawRow(ctx, y, "Frees W/C", `${input.counts.freeWon} / ${input.counts.freeConceded}`);
  y += 110;
  drawRow(ctx, y, "Logged events", String(input.eventCount));

  ctx.fillStyle = "#6b7280";
  ctx.font = "500 28px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Páirc Stats Lite summary", 88, CARD_HEIGHT - 64);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) return null;
  const fileLabel = `${input.homeTeamName}-${input.awayTeamName}-${input.stageLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return new File([blob], `${fileLabel || "match"}-summary.png`, { type: "image/png" });
}
