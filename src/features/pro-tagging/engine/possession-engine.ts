/**
 * possession-engine.ts
 *
 * PáircVision Pro Tagging — Possession Derivation Engine
 *
 * Pure function. No side effects. No imports from React or DOM.
 *
 * Given a sorted list of ProEvents, derives possessions using:
 *   - Explicit possession-start events (RESTART_WON, TURNOVER_WON, etc.)
 *   - Explicit possession-end events (GOAL, WIDE, TURNOVER_LOST, etc.)
 *   - Implicit breaks (team change without explicit transfer event)
 *   - Period boundaries
 *
 * V1 NOTE: This is deliberately "best-effort". The more events the analyst logs,
 * the more accurate possession derivation becomes. Unlabelled events between
 * possession markers are attributed to the active possession team.
 *
 * Phase 5 — Possession Chain Prototype
 */

import type { ProEvent, PossessionEndReason, PossessionStartReason } from "../model/pro-event-model";
import { POSSESSION_START_KINDS, POSSESSION_END_KINDS, SCORING_KINDS, SHOT_OR_SCORE_KINDS } from "../model/pro-event-model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Possession = {
  id: string;
  teamSide: "FOR" | "OPP";
  startEvent: ProEvent;
  /** null if possession is still live (last unfinished possession in session) */
  endEvent: ProEvent | null;
  events: readonly ProEvent[];
  startReason: PossessionStartReason;
  endReason: PossessionEndReason | null;
  /** null if endEvent is null or clock data unavailable */
  durationSeconds: number | null;
  resultedInScore: boolean;
  resultedInShot: boolean;
  period: "1H" | "2H";
  segment: 1 | 2 | 3 | 4 | 5 | 6;
};

export type PossessionDataset = {
  possessions: readonly Possession[];
  // Team totals
  totalFor: number;
  totalOpp: number;
  // Scoring possessions
  scoringPossessionsFor: number;
  scoringPossessionsOpp: number;
  scoreReturnRateFor: number;   // 0–1, percentage as decimal
  scoreReturnRateOpp: number;
  // Shot possessions
  shotPossessionsFor: number;
  shotPossessionsOpp: number;
  shotReturnRateFor: number;
  shotReturnRateOpp: number;
  // Duration
  avgDurationSecondsFor: number | null;
  avgDurationSecondsOpp: number | null;
  // Source breakdown
  byStartReason: Partial<Record<PossessionStartReason, { for: number; opp: number }>>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `poss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clockDiff(start: ProEvent, end: ProEvent): number | null {
  const startClock = start.matchClockSeconds;
  const endClock = end.matchClockSeconds;
  if (!Number.isFinite(startClock) || !Number.isFinite(endClock)) return null;
  return Math.max(0, endClock - startClock);
}

function endReasonFromEvent(event: ProEvent): PossessionEndReason {
  const kind = event.proKind;
  if (SCORING_KINDS.has(kind)) return "SCORE";
  if (kind === "WIDE" || kind === "SHOT" || kind === "FREE_MISSED") return "SHOT_MISSED";
  if (kind === "TURNOVER_LOST") return "TURNOVER_LOST";
  if (kind === "FREE_CONCEDED") return "FREE_CONCEDED";
  if (kind === "POSSESSION_LOST") return "POSSESSION_LOST";
  if (kind === "RESTART_LOST") return "RESTART_AGAINST";
  return "TURNOVER_LOST"; // safe fallback
}

function startReasonFromEvent(event: ProEvent): PossessionStartReason {
  const kind = event.proKind;
  if (kind === "RESTART_WON") return "RESTART_WON";
  if (kind === "TURNOVER_WON") return "TURNOVER_WON";
  if (kind === "POSSESSION_WON") return "POSSESSION_WON";
  if (kind === "BREAK_WON") return "BREAK_WON";
  if (kind === "FREE_WON") return "FREE_WON";
  if (kind === "DELIVERY_WON") return "DELIVERY_WON";
  if (kind === "MARK") return "MARK";
  return "POSSESSION_WON"; // fallback
}

// ---------------------------------------------------------------------------
// Core derivation
// ---------------------------------------------------------------------------

/**
 * Derive possessions from a list of ProEvents.
 *
 * Events should already be sorted chronologically (by matchClockSeconds).
 * If events are unsorted, pass `{ sorted: false }` and they will be sorted here.
 */
export function derivePossessions(
  events: readonly ProEvent[],
  options: { sorted?: boolean; maxImplicitGapSeconds?: number } = {},
): PossessionDataset {
  const { sorted = true, maxImplicitGapSeconds = 45 } = options;

  if (events.length === 0) {
    return emptyDataset();
  }

  // Sort if needed
  const sorted_events = sorted
    ? events
    : [...events].sort((a, b) => a.matchClockSeconds - b.matchClockSeconds);

  const possessions: Possession[] = [];

  let activePossession: {
    id: string;
    teamSide: "FOR" | "OPP";
    startEvent: ProEvent;
    events: ProEvent[];
    startReason: PossessionStartReason;
    period: "1H" | "2H";
    segment: 1 | 2 | 3 | 4 | 5 | 6;
  } | null = null;

  function closePossession(endEvent: ProEvent | null, reason: PossessionEndReason | null): void {
    if (activePossession === null) return;
    const events = activePossession.events;
    const lastEvent = endEvent ?? events[events.length - 1] ?? activePossession.startEvent;
    const resultedInScore = events.some((e) => SCORING_KINDS.has(e.proKind)) ||
      (endEvent !== null && SCORING_KINDS.has(endEvent.proKind));
    const resultedInShot = events.some((e) => SHOT_OR_SCORE_KINDS.has(e.proKind)) ||
      (endEvent !== null && SHOT_OR_SCORE_KINDS.has(endEvent.proKind));

    possessions.push({
      id: activePossession.id,
      teamSide: activePossession.teamSide,
      startEvent: activePossession.startEvent,
      endEvent,
      events,
      startReason: activePossession.startReason,
      endReason: reason,
      durationSeconds: endEvent !== null ? clockDiff(activePossession.startEvent, lastEvent) : null,
      resultedInScore,
      resultedInShot,
      period: activePossession.period,
      segment: activePossession.segment,
    });

    activePossession = null;
  }

  for (const event of sorted_events) {
    const isStartEvent = POSSESSION_START_KINDS.has(event.proKind);
    const isEndEvent = POSSESSION_END_KINDS.has(event.proKind);

    // Implicit possession break: period changed
    if (activePossession !== null && event.period !== activePossession.period) {
      closePossession(null, "PERIOD_END");
    }

    // Implicit possession break: team side switched without an explicit event
    if (activePossession !== null && !isStartEvent && event.teamSide !== activePossession.teamSide) {
      // Only close if gap is large enough (avoid false breaks on conceded events)
      const gap = clockDiff(activePossession.startEvent, event);
      if (gap === null || gap > maxImplicitGapSeconds) {
        closePossession(null, "TURNOVER_LOST");
      }
    }

    if (isEndEvent) {
      // Add the end event to active possession before closing
      if (activePossession !== null && event.teamSide === activePossession.teamSide) {
        activePossession.events.push(event);
      }
      const reason = endReasonFromEvent(event);
      closePossession(event, reason);
    }

    if (isStartEvent) {
      // Close any active possession first
      if (activePossession !== null) {
        closePossession(event, "RESTART_AGAINST");
      }
      // Open new possession
      activePossession = {
        id: generateId(),
        teamSide: event.teamSide,
        startEvent: event,
        events: [event],
        startReason: startReasonFromEvent(event),
        period: event.period,
        segment: event.segment,
      };
    } else if (activePossession !== null) {
      // Accumulate into active possession (if same team or neutral event)
      activePossession.events.push(event);
    }
  }

  // Close any still-open possession at end of events
  if (activePossession !== null) {
    closePossession(null, null);
  }

  return buildDataset(possessions);
}

// ---------------------------------------------------------------------------
// Dataset aggregation
// ---------------------------------------------------------------------------

function buildDataset(possessions: readonly Possession[]): PossessionDataset {
  const forPoss = possessions.filter((p) => p.teamSide === "FOR");
  const oppPoss = possessions.filter((p) => p.teamSide === "OPP");

  const totalFor = forPoss.length;
  const totalOpp = oppPoss.length;
  const scoringFor = forPoss.filter((p) => p.resultedInScore).length;
  const scoringOpp = oppPoss.filter((p) => p.resultedInScore).length;
  const shotFor = forPoss.filter((p) => p.resultedInShot).length;
  const shotOpp = oppPoss.filter((p) => p.resultedInShot).length;

  const durationsFor = forPoss
    .map((p) => p.durationSeconds)
    .filter((d): d is number => d !== null);
  const durationsOpp = oppPoss
    .map((p) => p.durationSeconds)
    .filter((d): d is number => d !== null);

  const avgDurationFor = durationsFor.length > 0
    ? durationsFor.reduce((sum, d) => sum + d, 0) / durationsFor.length
    : null;
  const avgDurationOpp = durationsOpp.length > 0
    ? durationsOpp.reduce((sum, d) => sum + d, 0) / durationsOpp.length
    : null;

  // Group by start reason
  const byStartReason: Partial<Record<PossessionStartReason, { for: number; opp: number }>> = {};
  for (const p of possessions) {
    const entry = byStartReason[p.startReason] ?? { for: 0, opp: 0 };
    if (p.teamSide === "FOR") entry.for++;
    else entry.opp++;
    byStartReason[p.startReason] = entry;
  }

  return {
    possessions,
    totalFor,
    totalOpp,
    scoringPossessionsFor: scoringFor,
    scoringPossessionsOpp: scoringOpp,
    scoreReturnRateFor: totalFor > 0 ? scoringFor / totalFor : 0,
    scoreReturnRateOpp: totalOpp > 0 ? scoringOpp / totalOpp : 0,
    shotPossessionsFor: shotFor,
    shotPossessionsOpp: shotOpp,
    shotReturnRateFor: totalFor > 0 ? shotFor / totalFor : 0,
    shotReturnRateOpp: totalOpp > 0 ? shotOpp / totalOpp : 0,
    avgDurationSecondsFor: avgDurationFor,
    avgDurationSecondsOpp: avgDurationOpp,
    byStartReason,
  };
}

function emptyDataset(): PossessionDataset {
  return {
    possessions: [],
    totalFor: 0,
    totalOpp: 0,
    scoringPossessionsFor: 0,
    scoringPossessionsOpp: 0,
    scoreReturnRateFor: 0,
    scoreReturnRateOpp: 0,
    shotPossessionsFor: 0,
    shotPossessionsOpp: 0,
    shotReturnRateFor: 0,
    shotReturnRateOpp: 0,
    avgDurationSecondsFor: null,
    avgDurationSecondsOpp: null,
    byStartReason: {},
  };
}
