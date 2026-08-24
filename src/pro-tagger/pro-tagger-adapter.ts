import { createMatchEvent } from "../core/stats/stats-event-model";
import type { MatchEventKind } from "../core/stats/stats-event-model";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { deriveSegmentFromPeriodClock, periodFromHalf } from "../stats/statsSegments";
import type { ProTaggerFamilyId } from "./pro-tagger-families";

export type ProTaggerAction = {
  familyId:          ProTaggerFamilyId;
  tileLabel:         string;           // resolved display label (e.g. "65" for hurling wide)
  teamSide:          "FOR" | "OPP";   // ignored for FREE (derived from tile) and re-derived for RESTART/FORTY_FIVE/SIDELINE/TURNOVER — see resolveKindAndSide
  /** Who took this restart. Set for RESTART, FORTY_FIVE, and SIDELINE tiles — every family with hasOwnerToggle. */
  restartOwner?:     "FOR" | "OPP";
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

/**
 * Shared Won/Conceded derivation for every restart family (Kickout/Puckout,
 * 45/65, Sideline). `restartOwner` names the side whose restart this is;
 * `teamSide` names the row actually tapped. When they agree, the owner kept
 * their own restart (WON, teamSide = the owner). When they disagree, the
 * owner lost it to the other side (CONCEDED, teamSide = the owner — the side
 * that conceded, not the side that benefited) — this is what lets
 * chain-engine's existing WON/CONCEDED ternary and possession-outcomes-engine
 * resolve the correct winner without any change on their side. `restartOwner`
 * is only ever absent for a family that hasn't wired up the owner toggle; in
 * that case the tapped row is treated as the owner (equivalent to today's
 * always-WON behaviour).
 */
function resolveRestartOutcome(
  teamSide: "FOR" | "OPP",
  restartOwner: "FOR" | "OPP" | undefined,
  wonKind: MatchEventKind,
  concededKind: MatchEventKind,
): { kind: MatchEventKind; teamSide: "FOR" | "OPP" } {
  const owner = restartOwner ?? teamSide;
  if (owner === teamSide) {
    return { kind: wonKind, teamSide };
  }
  return { kind: concededKind, teamSide: owner };
}

function resolveKindAndSide(
  familyId: ProTaggerFamilyId,
  rawLabel: string,
  teamSide: "FOR" | "OPP",
  restartOwner?: "FOR" | "OPP",
): Resolved {
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

    case "RESTART": {
      const resolved = resolveRestartOutcome(teamSide, restartOwner, "KICKOUT_WON", "KICKOUT_CONCEDED");
      return { ...resolved, tag };
    }

    case "FORTY_FIVE": {
      const resolved = resolveRestartOutcome(teamSide, restartOwner, "FORTY_FIVE_WON", "FORTY_FIVE_CONCEDED");
      return { ...resolved, tag };
    }

    case "SIDELINE": {
      const resolved = resolveRestartOutcome(teamSide, restartOwner, "SIDELINE_WON", "SIDELINE_CONCEDED");
      return { ...resolved, tag };
    }

    // A turnover has no independent "owner" fact the way a restart does — the
    // tapped row alone already fully determines both sides of the event.
    // FOR row: unchanged, we won it. OPP row: the opposition won it, i.e. we
    // lost it — recorded as TURNOVER_LOST with teamSide "FOR" (the side that
    // conceded), matching the same teamSide convention KICKOUT_CONCEDED uses,
    // so chain-engine's existing ternary and possession-outcomes-engine
    // resolve the correct winner with no change on their side.
    case "TURNOVER":
      return teamSide === "FOR"
        ? { kind: "TURNOVER_WON", teamSide: "FOR", tag }
        : { kind: "TURNOVER_LOST", teamSide: "FOR", tag };

    case "FREE": {
      const FREE_MAP: Record<string, Resolved> = {
        WON:      { kind: "FREE_WON",      teamSide: "FOR", tag: "WON" },
        CONCEDED: { kind: "FREE_CONCEDED", teamSide: "FOR", tag: "CONCEDED" },
      };
      return FREE_MAP[tag] ?? { kind: "FREE_WON", teamSide: "FOR", tag };
    }

    case "DISCIPLINE": {
      const DISCIPLINE_MAP: Record<string, MatchEventKind> = {
        YELLOW: "YELLOW_CARD",
        "SIN BIN": "SIN_BIN",
        RED: "RED_CARD",
      };
      return { kind: DISCIPLINE_MAP[tag] ?? "YELLOW_CARD", teamSide, tag };
    }
  }
}

export function adaptProTaggerAction(action: ProTaggerAction): LoggedMatchEvent {
  const { kind, teamSide, tag } = resolveKindAndSide(
    action.familyId,
    action.tileLabel,
    action.teamSide,
    action.restartOwner,
  );
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

  if (action.playerId)      event.playerId      = action.playerId;
  if (action.playerName)    event.playerName    = action.playerName;
  if (action.playerNumber)  event.playerNumber  = action.playerNumber;
  if (action.squadId)       event.squadId       = action.squadId;
  if (action.restartOwner)  event.restartOwner  = action.restartOwner;

  return event;
}
