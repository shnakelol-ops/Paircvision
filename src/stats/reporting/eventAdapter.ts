/**
 * eventAdapter.ts
 *
 * Adapts loosely-typed logged events to ChainableEvent for MatchReport builds.
 */

import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../../core/stats/stats-event-model";
import type { ChainableEvent } from "../chains/chain-types";

export type AdaptableEvent = {
  id: string;
  kind: MatchEventKind;
  half?: 1 | 2;
  period?: MatchEventPeriod;
  timestamp?: number;
  matchClockSeconds?: number | null;
  team?: "HOME" | "AWAY";
  teamSide?: "FOR" | "OPP" | string;
  nx?: number;
  ny?: number;
  segment?: MatchEventSegment;
  restartOwner?: "FOR" | "OPP" | null;
  tags?: string[] | null;
};

function resolveTeamSide(e: AdaptableEvent): "FOR" | "OPP" | null {
  if (e.teamSide === "FOR" || e.teamSide === "own") return "FOR";
  if (e.teamSide === "OPP" || e.teamSide === "opposition") return "OPP";
  if (e.team === "HOME" || e.id.startsWith("team-home-")) return "FOR";
  if (e.team === "AWAY" || e.id.startsWith("team-away-")) return "OPP";
  return null;
}

function resolvePeriod(e: AdaptableEvent): MatchEventPeriod | null {
  if (e.period === "1H" || e.period === "2H") return e.period;
  if (e.half === 1) return "1H";
  if (e.half === 2) return "2H";
  return null;
}

function resolveSegment(e: AdaptableEvent, period: MatchEventPeriod, clock: number): MatchEventSegment {
  if (e.segment != null && e.segment >= 1 && e.segment <= 6) return e.segment;
  if (clock < 600) return period === "1H" ? 1 : 4;
  if (clock < 1200) return period === "1H" ? 2 : 5;
  return period === "1H" ? 3 : 6;
}

/** Converts logged events to ChainableEvent[], skipping unresolvable rows. */
export function adaptEventsToChainable(events: readonly AdaptableEvent[]): ChainableEvent[] {
  const out: ChainableEvent[] = [];
  for (const e of events) {
    const teamSide = resolveTeamSide(e);
    const period = resolvePeriod(e);
    if (teamSide == null || period == null) continue;
    const clock = e.matchClockSeconds ?? e.timestamp ?? 0;
    out.push({
      id: e.id,
      kind: e.kind,
      teamSide,
      period,
      segment: resolveSegment(e, period, clock),
      matchClockSeconds: clock,
      nx: e.nx ?? 0.5,
      ny: e.ny ?? 0.5,
      tags: e.tags,
      restartOwner: e.restartOwner,
    });
  }
  return out;
}
