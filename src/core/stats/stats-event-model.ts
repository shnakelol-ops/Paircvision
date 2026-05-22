import { clamp01 } from "../coordinates/pitch-coordinates";

export const MATCH_EVENT_KINDS = [
  "GOAL",
  "POINT",
  "WIDE",
  "TURNOVER_WON",
  "TURNOVER_LOST",
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",
  "SHOT",
  "FREE_WON",
  "FREE_CONCEDED",
  "FREE_SCORED",
  "FREE_MISSED",
  "KICKOUT_WON",
  "KICKOUT_CONCEDED",
] as const;

export type MatchEventKind = (typeof MATCH_EVENT_KINDS)[number];

export type MatchEventTeamSide = "FOR" | "OPP" | "own" | "opposition";
export type MatchEventPeriod = "1H" | "2H";
export type MatchEventSegment = 1 | 2 | 3 | 4 | 5 | 6;

export type MatchEvent = {
  id: string;
  kind: MatchEventKind;
  type?: MatchEventKind;
  tags?: string[];
  nx: number;
  ny: number;
  x?: number;
  y?: number;
  half: 1 | 2;
  period?: MatchEventPeriod;
  timestamp: number;
  matchClockSeconds?: number;
  createdAt?: number;
  segment?: MatchEventSegment;
  teamSide?: MatchEventTeamSide;
  matchTimeSeconds?: number;
  halfSegment?: 1 | 2 | 3;
};

export type CreateMatchEventInput = {
  kind: MatchEventKind;
  type?: MatchEventKind;
  tags?: readonly string[];
  nx: number;
  ny: number;
  x?: number;
  y?: number;
  half: 1 | 2;
  period?: MatchEventPeriod;
  timestamp: number;
  matchClockSeconds?: number;
  createdAt?: number;
  segment?: MatchEventSegment;
  teamSide?: MatchEventTeamSide;
  matchTimeSeconds?: number;
  halfSegment?: 1 | 2 | 3;
  id?: string;
};

function newMatchEventId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeEventTags(tags: readonly string[] | undefined): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const normalized = Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toUpperCase())
        .filter((tag) => tag.length > 0),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

export function createMatchEvent(input: CreateMatchEventInput): MatchEvent {
  const normalizedKind = input.kind;
  const normalizedX =
    typeof input.x === "number" && Number.isFinite(input.x)
      ? clamp01(input.x)
      : clamp01(input.nx);
  const normalizedY =
    typeof input.y === "number" && Number.isFinite(input.y)
      ? clamp01(input.y)
      : clamp01(input.ny);
  const normalizedPeriod: MatchEventPeriod = input.period ?? (input.half === 1 ? "1H" : "2H");
  const normalizedClockSeconds =
    typeof input.matchClockSeconds === "number" && Number.isFinite(input.matchClockSeconds)
      ? Math.max(0, Math.floor(input.matchClockSeconds))
      : typeof input.matchTimeSeconds === "number" && Number.isFinite(input.matchTimeSeconds)
        ? Math.max(0, Math.floor(input.matchTimeSeconds))
        : Math.max(0, Math.floor(input.timestamp));
  const normalizedCreatedAt =
    typeof input.createdAt === "number" && Number.isFinite(input.createdAt) && input.createdAt > 0
      ? Math.floor(input.createdAt)
      : Date.now();
  const normalizedHalfSegment =
    input.halfSegment ??
    (input.segment != null
      ? (((input.segment - 1) % 3) + 1) as 1 | 2 | 3
      : undefined);
  const normalizedTags = normalizeEventTags(input.tags);
  return {
    id: input.id ?? newMatchEventId(),
    kind: normalizedKind,
    type: input.type ?? normalizedKind,
    ...(normalizedTags ? { tags: normalizedTags } : {}),
    nx: normalizedX,
    ny: normalizedY,
    x: normalizedX,
    y: normalizedY,
    half: input.half,
    period: normalizedPeriod,
    timestamp: normalizedClockSeconds,
    matchClockSeconds: normalizedClockSeconds,
    createdAt: normalizedCreatedAt,
    ...(input.segment != null ? { segment: input.segment } : {}),
    ...(input.teamSide ? { teamSide: input.teamSide } : {}),
    matchTimeSeconds: normalizedClockSeconds,
    ...(normalizedHalfSegment ? { halfSegment: normalizedHalfSegment } : {}),
  };
}
