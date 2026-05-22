import { selectReviewEvents } from "./review-selectors";
import type { MatchEvent, MatchEventKind, MatchEventTeamSide } from "../core/stats/stats-event-model";

export type ReviewSnapshotCategory =
  | "ALL"
  | "SCORES"
  | "SHOTS"
  | "WIDES"
  | "TURNOVERS"
  | "KICKOUTS"
  | "FREES"
  | "PLAYERS";

export type ReviewSnapshotPeriodFilter = "FULL" | "H1" | "H2";
export type ReviewSnapshotSegmentFilter = "ALL" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6";
export type ReviewSnapshotTeamSideFilter = "ALL" | "FOR" | "OPP";

export type ReviewSnapshotInputEvent = MatchEvent & {
  playerId?: string;
  playerName?: string;
  team?: "HOME" | "AWAY";
};

export type ReviewSnapshotFilters = {
  period: ReviewSnapshotPeriodFilter;
  segment: ReviewSnapshotSegmentFilter;
  teamSide: ReviewSnapshotTeamSideFilter;
  category: ReviewSnapshotCategory;
  activePlayerId?: string;
};

export type ReviewSnapshotInput = {
  events: readonly ReviewSnapshotInputEvent[];
  teamAName: string;
  teamBName: string;
  venue?: string;
  period: ReviewSnapshotPeriodFilter;
  segment: ReviewSnapshotSegmentFilter;
  teamSide: ReviewSnapshotTeamSideFilter;
  category: ReviewSnapshotCategory;
  activePlayerId?: string;
  matchClockSeconds?: number;
  generatedAt?: number;
};

export type ReviewSnapshotCounts = {
  totalVisibleEvents: number;
  forCount: number;
  oppCount: number;
  byEventType: Partial<Record<MatchEventKind, number>>;
  byTag: Record<string, number>;
};

export type ReviewSnapshotLegend = {
  byCategory: Partial<Record<ReviewSnapshotCategory, string[]>>;
  byEventType: Partial<Record<MatchEventKind, string[]>>;
  tags: string[];
};

export type ReviewSnapshot = {
  id: string;
  title: string;
  subtitle: string;
  filters: ReviewSnapshotFilters;
  visibleEvents: ReviewSnapshotInputEvent[];
  counts: ReviewSnapshotCounts;
  legend: ReviewSnapshotLegend;
  generatedAt: number;
};

const CATEGORY_EVENT_KINDS: Record<Exclude<ReviewSnapshotCategory, "ALL" | "PLAYERS">, readonly MatchEventKind[]> = {
  SCORES: ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"],
  SHOTS: ["SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_MISSED", "FREE_SCORED"],
  WIDES: ["WIDE", "FREE_MISSED"],
  TURNOVERS: ["TURNOVER_WON", "TURNOVER_LOST"],
  KICKOUTS: ["KICKOUT_WON", "KICKOUT_CONCEDED"],
  FREES: ["FREE_WON", "FREE_CONCEDED", "FREE_SCORED", "FREE_MISSED"],
};

function normalizeEventTeamSide(teamSide: MatchEventTeamSide | undefined, team: "HOME" | "AWAY" | undefined, eventId: string): "FOR" | "OPP" {
  if (teamSide === "FOR" || teamSide === "OPP") return teamSide;
  if (teamSide === "own") return "FOR";
  if (teamSide === "opposition") return "OPP";
  if (team === "AWAY" || eventId.startsWith("team-away-")) return "OPP";
  return "FOR";
}

function createSnapshotId(generatedAt: number): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `review-snapshot-${generatedAt}-${Math.random().toString(36).slice(2, 11)}`;
}

export function filterReviewSnapshotEvents(
  events: readonly ReviewSnapshotInputEvent[],
  filters: ReviewSnapshotFilters,
): ReviewSnapshotInputEvent[] {
  return selectReviewEvents(events, {
    half: filters.period,
    segment: filters.segment,
    teamSide: filters.teamSide,
    category: filters.category,
    categoryKinds: CATEGORY_EVENT_KINDS,
    activePlayerOnly: filters.activePlayerId != null,
    activePlayerId: filters.activePlayerId,
  });
}

export function buildReviewSnapshotTitle(filters: ReviewSnapshotFilters, teamAName: string, teamBName: string): string {
  return `${teamAName} vs ${teamBName} · ${filters.category} · ${filters.period}/${filters.segment}/${filters.teamSide}`;
}

export function buildReviewSnapshotCounts(events: readonly ReviewSnapshotInputEvent[]): ReviewSnapshotCounts {
  const byEventType: Partial<Record<MatchEventKind, number>> = {};
  const byTag: Record<string, number> = {};
  let forCount = 0;
  let oppCount = 0;

  for (const event of events) {
    byEventType[event.kind] = (byEventType[event.kind] ?? 0) + 1;
    const normalizedTeamSide = normalizeEventTeamSide(event.teamSide, event.team, event.id);
    if (normalizedTeamSide === "FOR") forCount += 1;
    if (normalizedTeamSide === "OPP") oppCount += 1;

    for (const tag of event.tags ?? []) {
      const normalizedTag = tag.trim().toUpperCase();
      if (!normalizedTag) continue;
      byTag[normalizedTag] = (byTag[normalizedTag] ?? 0) + 1;
    }
  }

  return { totalVisibleEvents: events.length, forCount, oppCount, byEventType, byTag };
}

export function buildReviewSnapshotLegend(events: readonly ReviewSnapshotInputEvent[]): ReviewSnapshotLegend {
  const tagSet = new Set<string>();
  for (const event of events) {
    for (const tag of event.tags ?? []) {
      const normalized = tag.trim().toUpperCase();
      if (normalized) tagSet.add(normalized);
    }
  }

  return {
    byCategory: {
      SCORES: ["GOAL", "POINT", "2PT", "FREE SCORED"],
      WIDES: ["WIDE", "FREE MISSED"],
      KICKOUTS: ["CLEAN", "BREAK", "FOUL", "KICKED DEAD"],
      TURNOVERS: ["WON", "LOST", "TACKLE", "PRESS", "SWARM", "INTERCEPT", "UNFORCED", "SLACK KP"],
      FREES: ["WON", "CONCEDED", "SCORED", "MISSED"],
    },
    byEventType: {
      GOAL: ["GREEN"],
      POINT: ["BLUE"],
      WIDE: ["RED"],
      KICKOUT_WON: ["CLEAN", "BREAK", "FOUL", "KICKED DEAD"],
      KICKOUT_CONCEDED: ["CLEAN", "BREAK", "FOUL", "KICKED DEAD"],
      TURNOVER_WON: ["TACKLE", "PRESS", "SWARM", "INTERCEPT", "UNFORCED", "SLACK KP"],
      TURNOVER_LOST: ["TACKLE", "PRESS", "SWARM", "INTERCEPT", "UNFORCED", "SLACK KP"],
    },
    tags: Array.from(tagSet).sort(),
  };
}

export function createReviewSnapshot(input: ReviewSnapshotInput): ReviewSnapshot {
  const generatedAt = input.generatedAt ?? Date.now();
  const filters: ReviewSnapshotFilters = {
    period: input.period,
    segment: input.segment,
    teamSide: input.teamSide,
    category: input.category,
    ...(input.activePlayerId ? { activePlayerId: input.activePlayerId } : {}),
  };
  const visibleEvents = filterReviewSnapshotEvents(input.events, filters);
  const title = buildReviewSnapshotTitle(filters, input.teamAName, input.teamBName);
  const subtitleParts = [input.venue, input.matchClockSeconds != null ? `Clock ${input.matchClockSeconds}s` : null].filter(Boolean);

  return {
    id: createSnapshotId(generatedAt),
    title,
    subtitle: subtitleParts.join(" · "),
    filters,
    visibleEvents,
    counts: buildReviewSnapshotCounts(visibleEvents),
    legend: buildReviewSnapshotLegend(visibleEvents),
    generatedAt,
  };
}
