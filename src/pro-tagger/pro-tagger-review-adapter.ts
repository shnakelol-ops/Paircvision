import type { ReviewPdfExportInput, SnapshotPdfExportInput, PdfSquadPlayer } from "../stats/reviewPdfExport";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { ProTaggerSession, ProTaggerSquad } from "./pro-tagger-session";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { PitchSport } from "../core/pitch/pitch-config";
import type { RestartOwnerValue } from "../stats/chains/chain-types";

/** A stored Event Stats event as handed to the report layer. */
export type EventStatsReportEvent = Omit<LoggedMatchEvent, "restartOwner"> & { restartOwner?: RestartOwnerValue };

/**
 * Event Stats events → report-layer events, without touching the stored match.
 *
 * Every Event Stats restart has recorded its owner (who took it) since the
 * OUR / THEIR owner toggle was added. Older Event Stats matches stored a
 * restart as KICKOUT_WON with teamSide = the side that WON the ball and no
 * owner — the record never says who kicked out. Those restarts are marked
 * restartOwner "UNKNOWN" so own-kickout metrics treat them as unavailable
 * instead of inferring an owner (Restart Share is unaffected: the winner is
 * still known). Events that need no change are returned as the same object.
 */
export function toEventStatsReportEvents(events: readonly LoggedMatchEvent[]): readonly EventStatsReportEvent[] {
  let changed = false;
  const out = events.map((e): EventStatsReportEvent => {
    const isRestart = e.kind === "KICKOUT_WON" || e.kind === "KICKOUT_CONCEDED";
    if (!isRestart || e.restartOwner === "FOR" || e.restartOwner === "OPP") return e;
    changed = true;
    return { ...e, restartOwner: "UNKNOWN" };
  });
  return changed ? out : events;
}

function toPitchSport(sport: ProTaggerSavedMatch["sport"]): PitchSport {
  // ladies_football uses the same pitch layout as gaelic football
  return sport === "ladies_football" ? "gaelic" : sport;
}

function toSquadPlayers(squad: ProTaggerSquad): readonly PdfSquadPlayer[] {
  return squad.players.map((p) => ({ id: p.id, number: p.number, name: p.name }));
}

export function proTaggerMatchToPdfInput(m: ProTaggerSavedMatch): ReviewPdfExportInput {
  const rawDir = m.restoreContext.firstHalfAttackingDirection;
  return {
    events:           toEventStatsReportEvents(m.events),
    homeTeamName:     m.homeTeamName,
    awayTeamName:     m.awayTeamName,
    venueName:        m.venue || undefined,
    sport:            toPitchSport(m.sport),
    homeSquadPlayers: toSquadPlayers(m.homeSquad),
    awaySquadPlayers: toSquadPlayers(m.awaySquad),
    targets:          m.targets,
    homeAttackingDirection: rawDir === "left" ? "LEFT" : "RIGHT",
    halfDurationMinutes: m.halfDurationMinutes,
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
    events:           toEventStatsReportEvents(events),
    homeTeamName:     session.homeTeamName.trim() || "Team A",
    awayTeamName:     session.awayTeamName.trim() || "Team B",
    venueName:        session.venue.trim() || undefined,
    sport:            toPitchSport(session.sport),
    homeSquadPlayers: toSquadPlayers(session.homeSquad),
    awaySquadPlayers: toSquadPlayers(session.awaySquad),
    targets:          session.targets,
    homeAttackingDirection: session.attackDirection === "left" ? "LEFT" : "RIGHT",
    halfDurationMinutes: session.halfDurationMinutes,
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
