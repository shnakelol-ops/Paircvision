import { createMatchEvent } from "../core/stats/stats-event-model";
import type { MatchEventKind } from "../core/stats/stats-event-model";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { deriveSegmentFromPeriodClock, periodFromHalf } from "../stats/statsSegments";
import type { ProTaggerFamilyId } from "./pro-tagger-families";

export type ProTaggerAction = {
  familyId:          ProTaggerFamilyId;
  tileLabel:         string;           // resolved display label (e.g. "65" for hurling wide)
  teamSide:          "FOR" | "OPP";   // ignored for FREE family (derived from tile)
  nx:                number;
  ny:                number;
  half:              1 | 2;
  matchClockSeconds: number;
  playerId?:         string;
  playerName?:       string;
  playerNumber?:     number;
  squadId?:          string;
};

type Resolved = { kind: MatchEventKind; teamSide: "FOR" | "OPP"; tag: string };

function resolveKindAndSide(familyId: ProTaggerFamilyId, rawLabel: string, teamSide: "FOR" | "OPP"): Resolved {
  const tag = rawLabel.trim().toUpperCase();

  switch (familyId) {
    case "GOAL":
      return { kind: "GOAL", teamSide, tag };

    case "POINT":
      return { kind: "POINT", teamSide, tag };

    case "TWO_POINT":
      return {
        kind: tag === "45" ? "FORTY_FIVE_TWO_POINT" : "TWO_POINTER",
        teamSide,
        tag,
      };

    case "SHOT":
      return { kind: "SHOT", teamSide, tag };

    case "WIDE":
      return { kind: "WIDE", teamSide, tag };

    case "RESTART":
      return {
        kind: teamSide === "FOR" ? "KICKOUT_WON" : "KICKOUT_CONCEDED",
        teamSide,
        tag,
      };

    case "TURNOVER":
      return {
        kind: teamSide === "FOR" ? "TURNOVER_WON" : "TURNOVER_LOST",
        teamSide,
        tag,
      };

    case "FREE": {
      const FREE_MAP: Record<string, Resolved> = {
        WON:      { kind: "FREE_WON",      teamSide: "FOR", tag: "WON" },
        CONCEDED: { kind: "FREE_CONCEDED", teamSide: "OPP", tag: "CONCEDED" },
        SCORED:   { kind: "FREE_SCORED",   teamSide: "FOR", tag: "SCORED" },
        MISSED:   { kind: "FREE_MISSED",   teamSide: "FOR", tag: "MISSED" },
      };
      return FREE_MAP[tag] ?? { kind: "FREE_WON", teamSide: "FOR", tag };
    }
  }
}

export function adaptProTaggerAction(action: ProTaggerAction): LoggedMatchEvent {
  const { kind, teamSide, tag } = resolveKindAndSide(action.familyId, action.tileLabel, action.teamSide);
  const period = periodFromHalf(action.half);
  const segment = deriveSegmentFromPeriodClock(period, action.matchClockSeconds);
  const createdAt = Date.now();

  const base = createMatchEvent({
    kind,
    nx: action.nx,
    ny: action.ny,
    half: action.half,
    period,
    timestamp: action.matchClockSeconds,
    matchClockSeconds: action.matchClockSeconds,
    teamSide,
    segment,
    tags: [tag],
    createdAt,
  });

  const event: LoggedMatchEvent = {
    ...base,
    type: kind,
    teamSide,
    x: base.nx,
    y: base.ny,
    period,
    segment,
    matchClockSeconds: action.matchClockSeconds,
    createdAt,
    team: teamSide === "FOR" ? "HOME" : "AWAY",
  };

  if (action.playerId)     event.playerId     = action.playerId;
  if (action.playerName)   event.playerName   = action.playerName;
  if (action.playerNumber) event.playerNumber = action.playerNumber;
  if (action.squadId)      event.squadId      = action.squadId;

  return event;
}
