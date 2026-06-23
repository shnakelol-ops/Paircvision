import type { ReviewPdfExportInput, SnapshotPdfExportInput, PdfSquadPlayer } from "../stats/reviewPdfExport";
import { createReviewSession, serializeReviewSession } from "../stats/reviewSession";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { ProTaggerSession, ProTaggerSquad } from "./pro-tagger-session";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { deriveSegmentFromPeriodClock, periodFromHalf } from "../stats/statsSegments";
import type { PitchSport } from "../core/pitch/pitch-config";

const REVIEW_SESSION_STORAGE_KEY = "paircvision.reviewSession.v1.last";
const MATCH_STATS_REVIEW_URL = "/flowstats?review=last";

type ProReviewStage = "HALF_TIME" | "FULL_TIME";

function toPitchSport(sport: ProTaggerSavedMatch["sport"]): PitchSport {
  // ladies_football uses the same pitch layout as gaelic football
  return sport === "ladies_football" ? "gaelic" : sport;
}

function toSquadPlayers(squad: ProTaggerSquad): readonly PdfSquadPlayer[] {
  return squad.players.map((p) => ({ id: p.id, number: p.number, name: p.name }));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function normalizeClock(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeReviewEvent(event: LoggedMatchEvent, index: number): LoggedMatchEvent {
  const nx = clamp01(
    typeof event.nx === "number" && Number.isFinite(event.nx)
      ? event.nx
      : typeof event.x === "number" && Number.isFinite(event.x)
        ? event.x
        : 0.5,
  );
  const ny = clamp01(
    typeof event.ny === "number" && Number.isFinite(event.ny)
      ? event.ny
      : typeof event.y === "number" && Number.isFinite(event.y)
        ? event.y
        : 0.5,
  );
  const half = event.half === 2 || event.period === "2H" ? 2 : 1;
  const period = event.period ?? periodFromHalf(half);
  const matchClockSeconds = normalizeClock(
    event.matchClockSeconds ?? event.matchTimeSeconds ?? event.timestamp,
  );
  const segment = event.segment ?? deriveSegmentFromPeriodClock(period, matchClockSeconds);
  const teamSide = event.teamSide === "OPP" ? "OPP" : "FOR";

  return {
    ...event,
    id: event.id || `pro-review-${Date.now()}-${index}`,
    kind: event.kind,
    type: event.type ?? event.kind,
    nx,
    ny,
    x: nx,
    y: ny,
    half,
    period,
    segment,
    halfSegment: event.halfSegment ?? (((segment - 1) % 3) + 1) as 1 | 2 | 3,
    timestamp: normalizeClock(event.timestamp) || matchClockSeconds,
    matchClockSeconds,
    matchTimeSeconds: matchClockSeconds,
    createdAt: normalizeClock(event.createdAt) || Date.now(),
    teamSide,
    team: event.team ?? (teamSide === "OPP" ? "AWAY" : "HOME"),
  };
}

function reviewPeriodForStage(stage: ProReviewStage): "FULL" | "H1" {
  return stage === "HALF_TIME" ? "H1" : "FULL";
}

function writeLastReviewSession(json: string): boolean {
  try {
    window.localStorage.setItem(REVIEW_SESSION_STORAGE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

function openMatchStatsReview(json: string): boolean {
  if (!writeLastReviewSession(json)) return false;
  window.location.assign(MATCH_STATS_REVIEW_URL);
  return true;
}

export function buildProTaggerReviewSessionJson(input: {
  id?: string;
  createdAt?: number;
  homeTeamName: string;
  awayTeamName: string;
  venue?: string;
  events: readonly LoggedMatchEvent[];
  targets?: ProTaggerSavedMatch["targets"];
  stage: ProReviewStage;
}): string {
  const reviewSession = createReviewSession({
    id: input.id ? `${input.id}-review` : undefined,
    createdAt: input.createdAt,
    matchInfo: {
      homeTeam: input.homeTeamName.trim() || "Team A",
      awayTeam: input.awayTeamName.trim() || "Team B",
      venue: input.venue?.trim() || undefined,
    },
    events: input.events.map(normalizeReviewEvent),
    reviewContext: {
      period: reviewPeriodForStage(input.stage),
      segment: "ALL",
      teamSide: "ALL",
      category: "ALL",
      activePlayerId: null,
      activePlayerOnly: false,
      zone: "FULL",
    },
    targets: input.targets,
  });
  return serializeReviewSession(reviewSession);
}

export function openProTaggerMatchStatsReview(match: ProTaggerSavedMatch): boolean {
  const stage = match.restoreContext.matchState === "HALF_TIME" ? "HALF_TIME" : "FULL_TIME";
  return openMatchStatsReview(
    buildProTaggerReviewSessionJson({
      id: match.id,
      createdAt: match.createdAt,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      venue: match.venue,
      events: match.events,
      targets: match.targets,
      stage,
    }),
  );
}

export function openLiveProTaggerMatchStatsReview(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
  stage: ProReviewStage,
): boolean {
  return openMatchStatsReview(
    buildProTaggerReviewSessionJson({
      id: session.id,
      createdAt: session.createdAt,
      homeTeamName: session.homeTeamName,
      awayTeamName: session.awayTeamName,
      venue: session.venue,
      events,
      targets: session.targets,
      stage,
    }),
  );
}

export function proTaggerMatchToPdfInput(m: ProTaggerSavedMatch): ReviewPdfExportInput {
  return {
    events:           m.events,
    homeTeamName:     m.homeTeamName,
    awayTeamName:     m.awayTeamName,
    venueName:        m.venue || undefined,
    sport:            toPitchSport(m.sport),
    homeSquadPlayers: toSquadPlayers(m.homeSquad),
    awaySquadPlayers: toSquadPlayers(m.awaySquad),
    targets:          m.targets,
  };
}

export function proTaggerMatchToSnapshotInput(
  m: ProTaggerSavedMatch,
  snapshotMode: "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT",
): SnapshotPdfExportInput {
  const rawDir = m.restoreContext.firstHalfAttackingDirection;
  return {
    ...proTaggerMatchToPdfInput(m),
    snapshotMode,
    homeAttackingDirection: rawDir === "left" ? "LEFT" : "RIGHT",
  };
}

export function buildLivePdfInput(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
): ReviewPdfExportInput {
  return {
    events,
    homeTeamName:     session.homeTeamName.trim() || "Team A",
    awayTeamName:     session.awayTeamName.trim() || "Team B",
    venueName:        session.venue.trim() || undefined,
    sport:            toPitchSport(session.sport),
    homeSquadPlayers: toSquadPlayers(session.homeSquad),
    awaySquadPlayers: toSquadPlayers(session.awaySquad),
    targets:          session.targets,
  };
}

export function buildLiveSnapshotInput(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
  snapshotMode: "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT",
): SnapshotPdfExportInput {
  return {
    ...buildLivePdfInput(session, events),
    snapshotMode,
    homeAttackingDirection: session.attackDirection === "left" ? "LEFT" : "RIGHT",
  };
}
