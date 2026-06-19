import type { MatchEvent } from "../core/stats/stats-event-model";
import type { MatchTargets } from "./matchTargets";

const REVIEW_PERIOD_VALUES = ["FULL", "H1", "H2"] as const;
const REVIEW_SEGMENT_VALUES = ["ALL", "S1", "S2", "S3", "S4", "S5", "S6"] as const;
const REVIEW_TEAM_SIDE_VALUES = ["ALL", "FOR", "OPP"] as const;
const REVIEW_ZONE_VALUES = ["FULL", "OWN_HALF", "OPPOSITION_HALF"] as const;
const REVIEW_CATEGORY_VALUES = [
  "ALL",
  "SCORES",
  "SHOTS",
  "WIDES",
  "TURNOVERS",
  "KICKOUTS",
  "FREES",
  "PLAYERS",
] as const;

export type ReviewSessionContext = {
  period: "FULL" | "H1" | "H2";
  segment: "ALL" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6";
  teamSide: "ALL" | "FOR" | "OPP";
  category: "ALL" | "SCORES" | "SHOTS" | "WIDES" | "TURNOVERS" | "KICKOUTS" | "FREES" | "PLAYERS";
  activePlayerId?: string | null;
  activePlayerOnly?: boolean;
  zone?: "FULL" | "OWN_HALF" | "OPPOSITION_HALF";
};

export type ReviewSession = {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    venue?: string;
  };
  events: MatchEvent[];
  reviewContext: ReviewSessionContext;
  targets?: MatchTargets;
};

type CreateReviewSessionInput = {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    venue?: string;
  };
  events: readonly MatchEvent[];
  reviewContext: ReviewSessionContext;
  targets?: MatchTargets;
};

type RestoredReviewSession = Pick<ReviewSession, "matchInfo" | "events" | "reviewContext" | "targets">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

function createReviewSessionId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `review-session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function normalizeTeamName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  return next.length > 0 ? next : fallback;
}

function normalizeVenue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

function cloneMatchEvents(events: readonly MatchEvent[]): MatchEvent[] {
  return events.map((event) => ({ ...event }));
}

function parseReviewPeriod(value: unknown): ReviewSessionContext["period"] | null {
  return REVIEW_PERIOD_VALUES.includes(value as ReviewSessionContext["period"])
    ? (value as ReviewSessionContext["period"])
    : null;
}

function parseReviewSegment(value: unknown): ReviewSessionContext["segment"] | null {
  return REVIEW_SEGMENT_VALUES.includes(value as ReviewSessionContext["segment"])
    ? (value as ReviewSessionContext["segment"])
    : null;
}

function parseReviewTeamSide(value: unknown): ReviewSessionContext["teamSide"] | null {
  return REVIEW_TEAM_SIDE_VALUES.includes(value as ReviewSessionContext["teamSide"])
    ? (value as ReviewSessionContext["teamSide"])
    : null;
}

function parseReviewCategory(value: unknown): ReviewSessionContext["category"] | null {
  return REVIEW_CATEGORY_VALUES.includes(value as ReviewSessionContext["category"])
    ? (value as ReviewSessionContext["category"])
    : null;
}

function parseReviewZone(value: unknown): ReviewSessionContext["zone"] | null {
  return REVIEW_ZONE_VALUES.includes(value as NonNullable<ReviewSessionContext["zone"]>)
    ? (value as ReviewSessionContext["zone"])
    : null;
}

function parseActivePlayerId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseActivePlayerOnly(value: unknown): boolean | null {
  if (typeof value !== "boolean") return null;
  return value;
}

function normalizeReviewContext(input: ReviewSessionContext): ReviewSessionContext {
  const activePlayerId = parseActivePlayerId(input.activePlayerId);
  const activePlayerOnly = parseActivePlayerOnly(input.activePlayerOnly);
  return {
    period: parseReviewPeriod(input.period) ?? "FULL",
    segment: parseReviewSegment(input.segment) ?? "ALL",
    teamSide: parseReviewTeamSide(input.teamSide) ?? "ALL",
    category: parseReviewCategory(input.category) ?? "ALL",
    activePlayerId,
    activePlayerOnly: activePlayerOnly ?? activePlayerId != null,
    zone: parseReviewZone(input.zone) ?? "FULL",
  };
}

function normalizeMatchInfo(input: CreateReviewSessionInput["matchInfo"]): ReviewSession["matchInfo"] {
  const venue = normalizeVenue(input.venue);
  return {
    homeTeam: normalizeTeamName(input.homeTeam, "Team A"),
    awayTeam: normalizeTeamName(input.awayTeam, "Team B"),
    ...(venue ? { venue } : {}),
  };
}

export function createReviewSession(input: CreateReviewSessionInput): ReviewSession {
  const now = Date.now();
  const createdAt = normalizeTimestamp(input.createdAt, now);
  const updatedAt = Math.max(createdAt, normalizeTimestamp(input.updatedAt, now));
  return {
    version: 1,
    id: typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : createReviewSessionId(),
    createdAt,
    updatedAt,
    matchInfo: normalizeMatchInfo(input.matchInfo),
    events: cloneMatchEvents(input.events),
    reviewContext: normalizeReviewContext(input.reviewContext),
    ...(input.targets != null ? { targets: input.targets } : {}),
  };
}

export function restoreReviewSession(session: ReviewSession): RestoredReviewSession {
  return {
    matchInfo: normalizeMatchInfo(session.matchInfo),
    events: cloneMatchEvents(session.events),
    reviewContext: normalizeReviewContext(session.reviewContext),
    ...(session.targets != null ? { targets: session.targets } : {}),
  };
}

export function serializeReviewSession(session: ReviewSession): string {
  const normalized = createReviewSession({
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    matchInfo: session.matchInfo,
    events: session.events,
    reviewContext: session.reviewContext,
    targets: session.targets,
  });
  return JSON.stringify(normalized);
}

export function parseReviewSession(raw: unknown): ReviewSession | null {
  if (raw == null) return null;

  let parsedValue: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim().length === 0) return null;
    try {
      parsedValue = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsedValue)) return null;
  if (parsedValue.version != null && parsedValue.version !== 1) return null;
  const maybeEvents = parsedValue.events;
  const maybeReviewContext = parsedValue.reviewContext;
  const maybeMatchInfo = parsedValue.matchInfo;
  if (!Array.isArray(maybeEvents)) return null;
  if (!isRecord(maybeReviewContext)) return null;
  if (!isRecord(maybeMatchInfo)) return null;

  const period = parseReviewPeriod(maybeReviewContext.period);
  const segment = parseReviewSegment(maybeReviewContext.segment);
  const teamSide = parseReviewTeamSide(maybeReviewContext.teamSide);
  const category = parseReviewCategory(maybeReviewContext.category);
  if (period == null || segment == null || teamSide == null || category == null) return null;

  const homeTeam = normalizeTeamName(maybeMatchInfo.homeTeam, "");
  const awayTeam = normalizeTeamName(maybeMatchInfo.awayTeam, "");
  if (homeTeam.length === 0 || awayTeam.length === 0) return null;

  if (!maybeEvents.every((event) => isRecord(event))) return null;

  const now = Date.now();
  const createdAt = normalizeTimestamp(parsedValue.createdAt, now);
  const updatedAt = Math.max(createdAt, normalizeTimestamp(parsedValue.updatedAt, now));
  const activePlayerId = parseActivePlayerId(maybeReviewContext.activePlayerId);
  const activePlayerOnly = parseActivePlayerOnly(maybeReviewContext.activePlayerOnly);
  const zone = parseReviewZone(maybeReviewContext.zone);
  const venue = normalizeVenue(maybeMatchInfo.venue);

  // Silently recover targets if present — no deep validation, just pass through.
  const maybeTargets = parsedValue.targets;
  const recoveredTargets: MatchTargets | undefined =
    isRecord(maybeTargets) && Array.isArray(maybeTargets.targets)
      ? (maybeTargets as MatchTargets)
      : undefined;

  return {
    version: 1,
    id:
      typeof parsedValue.id === "string" && parsedValue.id.trim().length > 0
        ? parsedValue.id.trim()
        : createReviewSessionId(),
    createdAt,
    updatedAt,
    matchInfo: {
      homeTeam,
      awayTeam,
      ...(venue ? { venue } : {}),
    },
    events: maybeEvents.map((event) => ({ ...(event as MatchEvent) })),
    reviewContext: {
      period,
      segment,
      teamSide,
      category,
      activePlayerId,
      activePlayerOnly: activePlayerOnly ?? activePlayerId != null,
      zone: zone ?? "FULL",
    },
    ...(recoveredTargets != null ? { targets: recoveredTargets } : {}),
  };
}
