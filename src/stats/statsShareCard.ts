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

type ShareCardEventKind =
  | "GOAL"
  | "POINT"
  | "WIDE"
  | "TURNOVER_WON"
  | "TURNOVER_LOST"
  | "TWO_POINTER"
  | "FORTY_FIVE_TWO_POINT"
  | "SHOT"
  | "FREE_WON"
  | "FREE_CONCEDED"
  | "FREE_SCORED"
  | "FREE_MISSED"
  | "KICKOUT_WON"
  | "KICKOUT_CONCEDED";

type ShareCardEvent = {
  id: string;
  kind: ShareCardEventKind;
  teamSide?: "FOR" | "OPP" | "own" | "opposition";
  team?: "HOME" | "AWAY" | null;
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
  events?: readonly ShareCardEvent[];
};

const CARD_WIDTH = 1080;
const formatGaelicScore = (score: TeamScore): string => `${score.goals}-${score.points}`;
const BASE_CARD_HEIGHT = 1520;
const STATS_START_Y = 620;
const ROW_GAP = 74;
const FOOTER_SAFE_PADDING = 170;

type SideAggregate = ShareCardCounts & {
  loggedEvents: number;
};

function emptyAggregate(): SideAggregate {
  return {
    goals: 0,
    points: 0,
    twoPointers: 0,
    shots: 0,
    wides: 0,
    turnoverWon: 0,
    turnoverLost: 0,
    kickoutWon: 0,
    kickoutLost: 0,
    freeWon: 0,
    freeConceded: 0,
    loggedEvents: 0,
  };
}

function deriveEventTeamSideFromLegacyMetadata(team: ShareCardEvent["team"], eventId: string): "FOR" | "OPP" {
  if (team === "AWAY" || eventId.startsWith("team-away-")) return "OPP";
  return "FOR";
}

function normalizeEventTeamSide(
  teamSide: ShareCardEvent["teamSide"],
  team: ShareCardEvent["team"],
  eventId: string,
): "FOR" | "OPP" {
  if (teamSide === "FOR" || teamSide === "OPP") return teamSide;
  if (teamSide === "own") return "FOR";
  if (teamSide === "opposition") return "OPP";
  return deriveEventTeamSideFromLegacyMetadata(team, eventId);
}

function aggregateSideCounts(input: StatsShareCardInput): Record<"FOR" | "OPP", SideAggregate> {
  const grouped: Record<"FOR" | "OPP", SideAggregate> = {
    FOR: emptyAggregate(),
    OPP: emptyAggregate(),
  };
  const { events } = input;
  if (!Array.isArray(events) || events.length === 0) {
    grouped.FOR = { ...input.counts, loggedEvents: input.eventCount };
    return grouped;
  }

  for (const event of events) {
    const teamSide = normalizeEventTeamSide(event.teamSide, event.team, event.id);
    const side = grouped[teamSide];
    side.loggedEvents += 1;
    switch (event.kind) {
      case "GOAL":
        side.goals += 1;
        side.shots += 1;
        break;
      case "POINT":
      case "FREE_SCORED":
        side.points += 1;
        side.shots += 1;
        break;
      case "TWO_POINTER":
      case "FORTY_FIVE_TWO_POINT":
        side.twoPointers += 1;
        side.shots += 1;
        break;
      case "SHOT":
        side.shots += 1;
        break;
      case "WIDE":
      case "FREE_MISSED":
        side.wides += 1;
        side.shots += 1;
        break;
      case "TURNOVER_WON":
        side.turnoverWon += 1;
        break;
      case "TURNOVER_LOST":
        side.turnoverLost += 1;
        break;
      case "KICKOUT_WON":
        side.kickoutWon += 1;
        break;
      case "KICKOUT_CONCEDED":
        side.kickoutLost += 1;
        break;
      case "FREE_WON":
        side.freeWon += 1;
        break;
      case "FREE_CONCEDED":
        side.freeConceded += 1;
        break;
      default:
        break;
    }
  }
  return grouped;
}

function formatWonLost(won: number, lost: number): string {
  if (won === 0 && lost === 0) return "—";
  return `${won} / ${lost}`;
}

function formatConversion(shots: number, converted: number): string {
  if (shots === 0) return "—";
  return `${Math.round((converted / shots) * 100)}%`;
}

function drawRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  label: string,
  forValue: string,
  oppValue: string,
): void {
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 36px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(label, 88, y);
  ctx.fillStyle = "#f3f4f6";
  ctx.font = "700 40px Inter, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(forValue, 730, y);
  ctx.fillText(oppValue, CARD_WIDTH - 88, y);
  ctx.textAlign = "left";
}

export async function buildStatsShareCardPng(input: StatsShareCardInput): Promise<File | null> {
  const groupedCounts = aggregateSideCounts(input);
  const forCounts = groupedCounts.FOR;
  const oppCounts = groupedCounts.OPP;
  const statsRows = [
    { label: "Goals", forValue: String(forCounts.goals), oppValue: String(oppCounts.goals) },
    { label: "Points", forValue: String(forCounts.points), oppValue: String(oppCounts.points) },
    { label: "2PT", forValue: String(forCounts.twoPointers), oppValue: String(oppCounts.twoPointers) },
    {
      label: "Shots / Wides",
      forValue: `${forCounts.shots} / ${forCounts.wides}`,
      oppValue: `${oppCounts.shots} / ${oppCounts.wides}`,
    },
    {
      label: "Conversion",
      forValue: formatConversion(forCounts.shots, forCounts.goals + forCounts.points + forCounts.twoPointers),
      oppValue: formatConversion(oppCounts.shots, oppCounts.goals + oppCounts.points + oppCounts.twoPointers),
    },
    {
      label: "Turnovers W/L",
      forValue: formatWonLost(forCounts.turnoverWon, forCounts.turnoverLost),
      oppValue: formatWonLost(oppCounts.turnoverWon, oppCounts.turnoverLost),
    },
    {
      label: "Kickouts W/L",
      forValue: formatWonLost(forCounts.kickoutWon, forCounts.kickoutLost),
      oppValue: formatWonLost(oppCounts.kickoutWon, oppCounts.kickoutLost),
    },
    {
      label: "Frees W/C",
      forValue: formatWonLost(forCounts.freeWon, forCounts.freeConceded),
      oppValue: formatWonLost(oppCounts.freeWon, oppCounts.freeConceded),
    },
    {
      label: "Logged events",
      forValue: String(forCounts.loggedEvents),
      oppValue: String(oppCounts.loggedEvents),
    },
  ] as const;
  const lastRowY = STATS_START_Y + ROW_GAP * (statsRows.length - 1);
  const minCardHeight = lastRowY + FOOTER_SAFE_PADDING + 72;
  const cardHeight = Math.max(BASE_CARD_HEIGHT, minCardHeight);
  const footerTextY = cardHeight - 68;
  const footerBandY = cardHeight - FOOTER_SAFE_PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = cardHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, cardHeight);
  grad.addColorStop(0, "#0b1020");
  grad.addColorStop(1, "#101a37");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_WIDTH, cardHeight);

  ctx.fillStyle = "#22c55e";
  ctx.fillRect(0, 0, CARD_WIDTH, 20);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "600 38px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(input.stageLabel, 88, 110);

  ctx.fillStyle = "#f9fafb";
  ctx.font = "700 56px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText(`${input.homeTeamName} v ${input.awayTeamName}`, 88, 196);

  ctx.fillStyle = "#93c5fd";
  ctx.font = "700 30px Inter, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("PV", CARD_WIDTH - 88, 112);
  ctx.font = "600 24px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("PáircVision", CARD_WIDTH - 88, 144);
  ctx.textAlign = "left";

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

  ctx.fillStyle = "#6b7280";
  ctx.font = "700 28px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("STAT", 88, 548);
  ctx.textAlign = "right";
  ctx.fillStyle = "#22c55e";
  ctx.fillText("FOR", 730, 548);
  ctx.fillStyle = "#60a5fa";
  ctx.fillText("OPP", CARD_WIDTH - 88, 548);
  ctx.textAlign = "left";

  let y = STATS_START_Y;
  for (const row of statsRows) {
    drawRow(ctx, y, row.label, row.forValue, row.oppValue);
    y += ROW_GAP;
  }

  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(68, footerBandY);
  ctx.lineTo(CARD_WIDTH - 68, footerBandY);
  ctx.stroke();

  ctx.fillStyle = "#6b7280";
  ctx.font = "500 28px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillText("Páirc Stats Lite summary", 88, footerTextY);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) return null;
  const fileLabel = `${input.homeTeamName}-${input.awayTeamName}-${input.stageLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return new File([blob], `${fileLabel || "match"}-summary.png`, { type: "image/png" });
}
