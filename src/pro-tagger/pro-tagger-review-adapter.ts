import type { ReviewPdfExportInput, SnapshotPdfExportInput, PdfSquadPlayer } from "../stats/reviewPdfExport";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { ProTaggerSession, ProTaggerSquad } from "./pro-tagger-session";
import type { LoggedMatchEvent, SavedMatch } from "../core/stats/saved-match";
import { deriveSegmentFromPeriodClock, periodFromHalf } from "../stats/statsSegments";
import type { PitchSport } from "../core/pitch/pitch-config";

const PRO_REVIEW_HANDOFF_STORAGE_KEY = "paircvision.proReviewMatch.v1";

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

function fmtScore(score: { goals: number; points: number; total: number }): string {
  return `${score.goals}-${String(score.points).padStart(2, "0")} (${score.total})`;
}

function computeScoreSide(
  events: readonly LoggedMatchEvent[],
  side: "FOR" | "OPP",
): { goals: number; points: number; total: number } {
  const scored = events.filter((e) => e.teamSide === side);
  const goals = scored.filter((e) => e.kind === "GOAL").length;
  const onePointers = scored.filter((e) => e.kind === "POINT").length;
  const twoPointers = scored.filter((e) => e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT").length;
  const points = onePointers + twoPointers * 2;
  return { goals, points, total: goals * 3 + points };
}

function stageToMatchState(stage: ProReviewStage): "HALF_TIME" | "FULL_TIME" {
  return stage === "HALF_TIME" ? "HALF_TIME" : "FULL_TIME";
}

function sportToModeParam(sport: ProTaggerSession["sport"]): string {
  if (sport === "ladies_football") return "ladiesFootball";
  return sport === "gaelic" ? "football" : sport;
}

function writeReviewHandoff(record: SavedMatch): boolean {
  try {
    window.localStorage.setItem(PRO_REVIEW_HANDOFF_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function openMatchStatsReview(record: SavedMatch, sport: ProTaggerSession["sport"]): boolean {
  if (!writeReviewHandoff(record)) return false;
  const params = new URLSearchParams({
    proReview: "1",
    returnTo: "stats-pro",
    mode: sportToModeParam(sport),
  });
  window.location.assign(`/flowstats?${params.toString()}`);
  return true;
}

function buildReviewHandoffRecord(input: {
  id: string;
  createdAt: number;
  homeTeamName: string;
  awayTeamName: string;
  venue: string;
  events: readonly LoggedMatchEvent[];
  stage: ProReviewStage;
  currentHalf: 1 | 2;
  matchTimeSeconds: number;
  firstHalfAttackingDirection: "left" | "right";
  targets?: ProTaggerSavedMatch["targets"];
}): SavedMatch {
  const events = input.events.map(normalizeReviewEvent);
  const home = input.homeTeamName.trim() || "Team A";
  const away = input.awayTeamName.trim() || "Team B";
  const venue = input.venue.trim() || "Unknown venue";
  const forScore = computeScoreSide(events, "FOR");
  const oppScore = computeScoreSide(events, "OPP");

  return {
    id: input.id,
    createdAt: input.createdAt,
    label: `${home} v ${away}`,
    homeTeamName: home,
    awayTeamName: away,
    venue,
    events,
    eventCount: events.length,
    scorelineSnapshot: `${home} ${fmtScore(forScore)} v ${away} ${fmtScore(oppScore)}`,
    restoreContext: {
      matchState: stageToMatchState(input.stage),
      currentHalf: input.currentHalf,
      matchTimeSeconds: Math.max(0, Math.floor(input.matchTimeSeconds)),
      firstHalfAttackingDirection: input.firstHalfAttackingDirection === "left" ? "LEFT" : "RIGHT",
    },
    targets: input.targets,
  };
}

export function openProTaggerMatchStatsReview(match: ProTaggerSavedMatch): boolean {
  const stage = match.restoreContext.matchState === "HALF_TIME" ? "HALF_TIME" : "FULL_TIME";
  return openMatchStatsReview(
    buildReviewHandoffRecord({
      id: match.id,
      createdAt: match.createdAt,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      venue: match.venue,
      events: match.events,
      stage,
      currentHalf: match.restoreContext.currentHalf,
      matchTimeSeconds: match.restoreContext.matchTimeSeconds,
      firstHalfAttackingDirection: match.restoreContext.firstHalfAttackingDirection,
      targets: match.targets,
    }),
    match.sport,
  );
}

export function openLiveProTaggerMatchStatsReview(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
  stage: ProReviewStage,
  currentHalf: 1 | 2,
  matchTimeSeconds: number,
): boolean {
  return openMatchStatsReview(
    buildReviewHandoffRecord({
      id: `${session.id}-review`,
      createdAt: session.createdAt,
      homeTeamName: session.homeTeamName,
      awayTeamName: session.awayTeamName,
      venue: session.venue,
      events,
      stage,
      currentHalf,
      matchTimeSeconds,
      firstHalfAttackingDirection: session.attackDirection,
      targets: session.targets,
    }),
    session.sport,
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
