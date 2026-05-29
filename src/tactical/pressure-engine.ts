// Territorial pressure accumulation engine.
// No React, no Pixi, no DOM, no possession inference.
//
// Groups events by (teamSide × category × semantic zone) within a rolling
// match-clock window and returns pressure states ranked by escalation level.
//
// teamSide is annotation perspective (FOR = our events, OPP = opposition
// events) — NOT ball ownership.

import type { MatchEventKind } from "../core/stats/stats-event-model";
import { PRESSURE_WINDOW_SECONDS, countToEscalation } from "./escalation-rules";
import { classifyEventZone } from "./classify-event-zone";
import type { SemanticZoneId, TacticalCategory } from "./semantic-zones";

export type PressureCategory = "TURNOVER" | "RESTART" | "FREE" | "SCORING_CORRIDOR" | "POSSESSION";

export type PressureLevel = "notable" | "amber" | "red";

// Minimal structural input — any MatchEvent satisfies this.
export type PressureEngineInput = {
  kind: MatchEventKind;
  teamSide?: string;
  nx: number;
  ny: number;
  matchClockSeconds?: number;
};

export type TerritorialPressureState = {
  id: string;                    // "${teamSide}:${category}:${zoneId}"
  level: PressureLevel;
  teamSide: "FOR" | "OPP";
  category: PressureCategory;
  zoneId: SemanticZoneId;
  zoneCategory: TacticalCategory;
  count: number;
  firstEventClock: number;
  lastEventClock: number;
  eventKinds: MatchEventKind[];  // distinct kinds contributing to this group
};

// Maps event kinds to territorial pressure categories.
// Unlisted kinds are silently ignored — no throw, no default fallback.
const KIND_TO_CATEGORY: Partial<Record<MatchEventKind, PressureCategory>> = {
  TURNOVER_WON:         "TURNOVER",
  TURNOVER_LOST:        "TURNOVER",
  KICKOUT_WON:          "RESTART",
  KICKOUT_CONCEDED:     "RESTART",
  FREE_WON:             "FREE",
  FREE_CONCEDED:        "FREE",
  FREE_MISSED:          "FREE",
  SHOT:                 "SCORING_CORRIDOR",
  WIDE:                 "SCORING_CORRIDOR",
  POINT:                "SCORING_CORRIDOR",
  GOAL:                 "SCORING_CORRIDOR",
  TWO_POINTER:          "SCORING_CORRIDOR",
  FORTY_FIVE_TWO_POINT: "SCORING_CORRIDOR",
  FREE_SCORED:          "SCORING_CORRIDOR",
  POSSESSION_WON:       "POSSESSION",
  POSSESSION_LOST:      "POSSESSION",
};

type GroupAccumulator = {
  teamSide: "FOR" | "OPP";
  category: PressureCategory;
  zoneId: SemanticZoneId;
  zoneCategory: TacticalCategory;
  count: number;
  firstEventClock: number;
  lastEventClock: number;
  kindsSeen: Set<MatchEventKind>;
};

const LEVEL_MAP: Record<1 | 2 | 3, PressureLevel> = {
  1: "notable",
  2: "amber",
  3: "red",
};

const LEVEL_RANK: Record<PressureLevel, number> = {
  red: 3,
  amber: 2,
  notable: 1,
};

export function computeTerritorialPressure(
  events: readonly PressureEngineInput[],
  clockNow: number,
): TerritorialPressureState[] {
  const windowStart = clockNow - PRESSURE_WINDOW_SECONDS;
  const groups = new Map<string, GroupAccumulator>();

  for (const event of events) {
    const ts = event.matchClockSeconds ?? 0;
    if (ts < windowStart) continue;

    if (event.teamSide !== "FOR" && event.teamSide !== "OPP") continue;
    const side = event.teamSide;

    const category = KIND_TO_CATEGORY[event.kind];
    if (category === undefined) continue;

    // classifyEventZone applies OPP x-mirror so both teams are evaluated
    // in team-relative space — attacking-right, defending-left.
    const classification = classifyEventZone({ nx: event.nx, ny: event.ny, teamSide: side });
    if (classification === null) continue;

    const key = `${side}:${category}:${classification.zone}`;
    const acc = groups.get(key);

    if (acc) {
      acc.count += 1;
      if (ts < acc.firstEventClock) acc.firstEventClock = ts;
      if (ts > acc.lastEventClock)  acc.lastEventClock  = ts;
      acc.kindsSeen.add(event.kind);
    } else {
      groups.set(key, {
        teamSide: side,
        category,
        zoneId: classification.zone,
        zoneCategory: classification.category,
        count: 1,
        firstEventClock: ts,
        lastEventClock: ts,
        kindsSeen: new Set([event.kind]),
      });
    }
  }

  const states: TerritorialPressureState[] = [];

  for (const [key, acc] of groups) {
    const escalation = countToEscalation(acc.count);
    if (escalation === 0) continue;

    states.push({
      id: key,
      level: LEVEL_MAP[escalation],
      teamSide: acc.teamSide,
      category: acc.category,
      zoneId: acc.zoneId,
      zoneCategory: acc.zoneCategory,
      count: acc.count,
      firstEventClock: acc.firstEventClock,
      lastEventClock: acc.lastEventClock,
      eventKinds: Array.from(acc.kindsSeen),
    });
  }

  // Highest level first, then count, then most recent activity
  states.sort((a, b) => {
    const ld = LEVEL_RANK[b.level] - LEVEL_RANK[a.level];
    if (ld !== 0) return ld;
    const cd = b.count - a.count;
    if (cd !== 0) return cd;
    return b.lastEventClock - a.lastEventClock;
  });

  return states;
}
