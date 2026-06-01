import type { ReviewPdfExportInput, SnapshotPdfExportInput } from "../stats/reviewPdfExport";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
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
