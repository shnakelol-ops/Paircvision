// Thin, pure shape-adapter from Rapid Capture's own data model into the
// existing shared report contracts (reviewPdfExport.ts, intelligencePack.ts).
// Mirrors src/pro-tagger/pro-tagger-review-adapter.ts in spirit: no
// intelligence/analytics logic lives here, only field mapping. Every event
// field that already exists on a RapidMatchEvent (tags, player attribution,
// restartOwner, coordinates, timestamps) passes through unchanged; the only
// derived value is `segment`, computed via the same helper Match Stats and
// Event Stats already use. Never mutates its input.

import type {
  PdfExportEvent,
  PdfSquadPlayer,
  ReviewPdfExportInput,
  SnapshotMode,
  SnapshotPdfExportInput,
} from "../stats/reviewPdfExport";
import type { IntelligencePackInput, IntelligencePackStage } from "../stats/intelligencePack";
import type { PitchSport } from "../core/pitch/pitch-config";
import { deriveSegmentFromPeriodClock, periodFromHalf } from "../stats/statsSegments";
import { computeRapidScoreboard, type RapidMatchEvent, type RapidSquadPlayer } from "./rapid-capture-events";
import type { RapidSavedMatch } from "./rapid-capture-storage";
import type { RapidSession, Sport } from "./rapid-session";

const SPORT_TO_PITCH_SPORT: Record<Sport, PitchSport> = {
  hurling: "hurling",
  camogie: "camogie",
  gaelic: "gaelic",
  soccer: "soccer",
};

function toPitchSport(sport: Sport): PitchSport {
  return SPORT_TO_PITCH_SPORT[sport];
}

function normalizeTeamSide(event: RapidMatchEvent): "FOR" | "OPP" {
  return event.teamSide === "OPP" ? "OPP" : "FOR";
}

/**
 * Builds the one derived field (`segment`) via the canonical helper and
 * passes every other field through unchanged. Returns a brand-new object —
 * the source event is never touched.
 */
function normalizeRapidEventForReports(event: RapidMatchEvent): PdfExportEvent {
  const period = event.period ?? periodFromHalf(event.half);
  const clockSeconds = event.matchClockSeconds ?? event.timestamp ?? 0;
  const segment = event.segment ?? deriveSegmentFromPeriodClock(period, clockSeconds);
  return {
    id: event.id,
    kind: event.kind,
    teamSide: normalizeTeamSide(event),
    period,
    segment,
    nx: event.nx,
    ny: event.ny,
    x: event.x,
    y: event.y,
    tags: event.tags,
    matchClockSeconds: event.matchClockSeconds,
    playerId: event.playerId,
    playerName: event.playerName,
    playerNumber: event.playerNumber,
    squadId: event.squadId,
    restartOwner: event.restartOwner,
  };
}

function toSquadPlayers(squad: readonly RapidSquadPlayer[] | undefined): readonly PdfSquadPlayer[] | undefined {
  if (!squad || squad.length === 0) return undefined;
  return squad.map((p) => ({
    id: p.id ?? `rapid-squad-${p.number}`,
    number: p.number,
    name: p.name ?? "",
  }));
}

/** Builds the shared PDF pipeline's input from a Rapid Capture saved match — feeds both Full Review and (via the snapshot variant below) HT/FT Snapshot PDFs. */
export function rapidSessionToReviewPdfInput(match: RapidSavedMatch): ReviewPdfExportInput {
  const session: RapidSession = match.session;
  return {
    events: match.events.map(normalizeRapidEventForReports),
    homeTeamName: session.forTeamName,
    awayTeamName: session.oppTeamName,
    venueName: session.venue || undefined,
    sport: toPitchSport(session.sport),
    homeSquadPlayers: toSquadPlayers(session.forSquad),
    awaySquadPlayers: toSquadPlayers(session.oppSquad),
  };
}

export function rapidMatchToSnapshotPdfInput(
  match: RapidSavedMatch,
  snapshotMode: SnapshotMode,
): SnapshotPdfExportInput {
  return {
    ...rapidSessionToReviewPdfInput(match),
    snapshotMode,
    homeAttackingDirection: match.session.attackDirection === "left" ? "LEFT" : "RIGHT",
  };
}

/** Builds the (separate, PNG-based) Intelligence Pack pipeline's input. */
export function rapidMatchToIntelligencePackInput(
  match: RapidSavedMatch,
  stageLabel: IntelligencePackStage,
): IntelligencePackInput {
  const scoreboard = computeRapidScoreboard(match.events);
  return {
    stageLabel,
    homeTeamName: match.session.forTeamName || "FOR",
    awayTeamName: match.session.oppTeamName || "OPP",
    venueLabel: match.session.venue || "",
    clockLabel: stageLabel,
    homeScore: { goals: scoreboard.for.goals, points: scoreboard.for.points, total: scoreboard.for.total },
    awayScore: { goals: scoreboard.opp.goals, points: scoreboard.opp.points, total: scoreboard.opp.total },
    events: match.events.map(normalizeRapidEventForReports),
  };
}
