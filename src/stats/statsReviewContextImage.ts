type ReviewContextTeamSide = "FOR" | "OPP" | "own" | "opposition" | "HOME" | "AWAY" | string | null | undefined;

export type ReviewContextImageEvent = {
  x: number;
  y: number;
  teamSide?: ReviewContextTeamSide;
  team?: "HOME" | "AWAY" | string | null;
  id?: string;
};

export type ReviewContextImageInput = {
  events: readonly ReviewContextImageEvent[];
  homeTeamName: string;
  awayTeamName: string;
  venueLabel?: string;
  halfLabel: string;
  segmentLabel: string;
  teamContextLabel: string;
  filterLabel: string;
  generatedAt?: number;
};

const IMAGE_WIDTH = 1080;
const IMAGE_HEIGHT = 1520;
const HEADER_HEIGHT = 190;
const FOOTER_HEIGHT = 128;
const PITCH_MARGIN_X = 76;
const PITCH_TOP = HEADER_HEIGHT + 24;
const PITCH_BOTTOM = IMAGE_HEIGHT - FOOTER_HEIGHT - 24;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function sanitizeFilePart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "team";
}

function resolveEventTeamSide(event: ReviewContextImageEvent): "FOR" | "OPP" {
  if (event.teamSide === "OPP" || event.teamSide === "opposition" || event.team === "AWAY") return "OPP";
  if (typeof event.id === "string" && event.id.startsWith("team-away-")) return "OPP";
  return "FOR";
}

function drawPitch(ctx: CanvasRenderingContext2D, left: number, top: number, width: number, height: number): void {
  ctx.fillStyle = "#1f6f43";
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = "rgba(241,245,249,0.92)";
  ctx.lineWidth = 4;
  ctx.strokeRect(left, top, width, height);

  const midX = left + width / 2;
  const midY = top + height / 2;
  const circleRadius = Math.round(height * 0.13);

  ctx.beginPath();
  ctx.moveTo(midX, top);
  ctx.lineTo(midX, top + height);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(midX, midY, circleRadius, 0, Math.PI * 2);
  ctx.stroke();

  const smallBoxWidth = width * 0.08;
  const smallBoxHeight = height * 0.3;
  const bigBoxWidth = width * 0.16;
  const bigBoxHeight = height * 0.55;
  const topSmallY = midY - smallBoxHeight / 2;
  const topBigY = midY - bigBoxHeight / 2;

  ctx.strokeRect(left, topSmallY, smallBoxWidth, smallBoxHeight);
  ctx.strokeRect(left, topBigY, bigBoxWidth, bigBoxHeight);
  ctx.strokeRect(left + width - smallBoxWidth, topSmallY, smallBoxWidth, smallBoxHeight);
  ctx.strokeRect(left + width - bigBoxWidth, topBigY, bigBoxWidth, bigBoxHeight);

  const spotRadius = 6;
  ctx.fillStyle = "rgba(241,245,249,0.92)";
  ctx.beginPath();
  ctx.arc(left + width * 0.2, midY, spotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(left + width * 0.8, midY, spotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(midX, midY, spotRadius, 0, Math.PI * 2);
  ctx.fill();
}

export async function exportReviewContextImage(input: ReviewContextImageInput): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_WIDTH;
  canvas.height = IMAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
  gradient.addColorStop(0, "#020617");
  gradient.addColorStop(1, "#111827");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

  ctx.fillStyle = "#22c55e";
  ctx.fillRect(0, 0, IMAGE_WIDTH, 14);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 44px Inter, system-ui, sans-serif";
  ctx.fillText("Review Pitch", 68, 78);
  ctx.font = "600 36px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(`${input.homeTeamName} v ${input.awayTeamName}`, 68, 128);
  ctx.font = "500 24px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    `${input.halfLabel}/${input.segmentLabel}/${input.teamContextLabel}/${input.filterLabel}`,
    68,
    164,
  );

  const pitchWidth = IMAGE_WIDTH - PITCH_MARGIN_X * 2;
  const pitchHeight = PITCH_BOTTOM - PITCH_TOP;
  drawPitch(ctx, PITCH_MARGIN_X, PITCH_TOP, pitchWidth, pitchHeight);

  for (const event of input.events) {
    const dotX = PITCH_MARGIN_X + clamp01(event.x) * pitchWidth;
    const dotY = PITCH_TOP + clamp01(event.y) * pitchHeight;
    const side = resolveEventTeamSide(event);
    ctx.fillStyle = side === "OPP" ? "rgba(251,113,133,0.92)" : "rgba(56,189,248,0.94)";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const generatedAt = input.generatedAt ?? Date.now();
  const generatedTime = new Date(generatedAt).toLocaleString();
  const footerText = input.venueLabel && input.venueLabel.trim().length > 0 ? input.venueLabel.trim() : "Unknown venue";
  ctx.fillStyle = "rgba(148,163,184,0.22)";
  ctx.fillRect(56, IMAGE_HEIGHT - FOOTER_HEIGHT - 8, IMAGE_WIDTH - 112, FOOTER_HEIGHT);
  ctx.strokeStyle = "rgba(148,163,184,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(56, IMAGE_HEIGHT - FOOTER_HEIGHT - 8, IMAGE_WIDTH - 112, FOOTER_HEIGHT);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 24px Inter, system-ui, sans-serif";
  ctx.fillText(`Visible dots: ${input.events.length}`, 76, IMAGE_HEIGHT - 82);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 22px Inter, system-ui, sans-serif";
  ctx.fillText(`${footerText} · ${generatedTime}`, 76, IMAGE_HEIGHT - 44);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/png");
  });
  if (!blob) return null;

  const filename = `${sanitizeFilePart(input.homeTeamName)}-${sanitizeFilePart(input.awayTeamName)}-review-pitch.png`;
  return new File([blob], filename, { type: "image/png" });
}
