import type { ReviewPdfExportInput, SnapshotPdfExportInput, PdfSquadPlayer } from "../stats/reviewPdfExport";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { ProTaggerSession, ProTaggerSquad } from "./pro-tagger-session";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { PitchSport } from "../core/pitch/pitch-config";

function toPitchSport(sport: ProTaggerSavedMatch["sport"]): PitchSport {
  // ladies_football uses the same pitch layout as gaelic football
  return sport === "ladies_football" ? "gaelic" : sport;
}

function toSquadPlayers(squad: ProTaggerSquad): readonly PdfSquadPlayer[] {
  return squad.players.map((p) => ({ id: p.id, number: p.number, name: p.name }));
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
  };
}

export function proTaggerMatchToSnapshotInput(
  m: ProTaggerSavedMatch,
  snapshotMode: "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT",
): SnapshotPdfExportInput {
  return {
    ...proTaggerMatchToPdfInput(m),
    snapshotMode,
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
  };
}

export function buildLiveSnapshotInput(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
  snapshotMode: "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT",
): SnapshotPdfExportInput {
  return { ...buildLivePdfInput(session, events), snapshotMode };
}
