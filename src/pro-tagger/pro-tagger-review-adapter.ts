import type { ReviewPdfExportInput, SnapshotPdfExportInput } from "../stats/reviewPdfExport";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { ProTaggerSession } from "./pro-tagger-session";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { PitchSport } from "../core/pitch/pitch-config";

function toPitchSport(sport: ProTaggerSavedMatch["sport"]): PitchSport {
  // ladies_football uses the same pitch layout as gaelic football
  return sport === "ladies_football" ? "gaelic" : sport;
}

export function proTaggerMatchToPdfInput(m: ProTaggerSavedMatch): ReviewPdfExportInput {
  return {
    events:       m.events,
    homeTeamName: m.homeTeamName,
    awayTeamName: m.awayTeamName,
    venueName:    m.venue || undefined,
    sport:        toPitchSport(m.sport),
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
    homeTeamName: session.homeTeamName.trim() || "Team A",
    awayTeamName: session.awayTeamName.trim() || "Team B",
    venueName:    session.venue.trim() || undefined,
    sport:        toPitchSport(session.sport),
  };
}

export function buildLiveSnapshotInput(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
  snapshotMode: "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT",
): SnapshotPdfExportInput {
  return { ...buildLivePdfInput(session, events), snapshotMode };
}
