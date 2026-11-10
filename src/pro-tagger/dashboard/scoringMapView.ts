/**
 * scoringMapView.ts
 *
 * Display model for the Match Analysis Pack's Scoring & Shooting Map: one
 * selected team's shooting, as factual counts plus every shot's position on
 * a portrait map on which that team attacks upwards.
 *
 * SOURCES OF TRUTH (no new definitions):
 *   - Shots, scores, accuracy: viewShootingConversion() — the canonical
 *     Event Stats shot-attempt definition (SHOT_KINDS / score kinds), the
 *     same figure as the HT / FT dashboard and Quick Review.
 *   - Goals, two-pointers, points value, scoreline: buildTeamSummaryBlock().
 *   - Placed-ball scores: report.placedBalls (ledger classification) and, per
 *     event, isPlacedScore() — the same function placedBalls counts with.
 *   - Blocked / saved: isBlockedOrSavedAttempt() — the one shared definition.
 *
 * The miss breakdown and the markers come from one per-shot classification,
 * so the counts and the dots can never disagree. scoringMapView.test.ts
 * reconciles those counts with buildTeamSummaryBlock's wides / shotShort /
 * shotPost / shotBlock.
 *
 * Deliberately absent: placed-ball accuracy (a placed ball that drops short,
 * is blocked or hits the post is stored as SHOT with no source tag, so the
 * placed-ball denominator is incomplete), player names, and any origin /
 * chain attribution.
 *
 * Pure and serialisable: no canvas, no DOM, no storage; never mutates input.
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { ChainableEvent } from "../../stats/chains/chain-types";
import { isPlacedScore } from "../../stats/ledger/scoreLedger";
import { isBlockedOrSavedAttempt } from "../../stats/reporting/eventTagClassification";
import {
  SHOT_KINDS,
  buildTeamSummaryBlock,
  viewShootingConversion,
} from "../../stats/reporting/teamStatsViews";
import { getFamiliesForSport } from "../pro-tagger-families";
import type { ProTaggerSport } from "../pro-tagger-session";
import {
  buildScopedMapReport,
  mapOrientation,
  otherSide,
  plotEvent,
  recordedClockSeconds,
  scopeLabel,
  scopedScoreline,
  summariseLocations,
  teamIdentity,
  type MapLocationSummary,
  type MapOrientation,
  type MapPoint,
  type MapScope,
  type MapScoreline,
  type MapTeamIdentity,
  type MapTeamSide,
  type MatchMapSource,
} from "./matchMapPerspective";

/** How a shot ended, one value per shot. Order = legend order. */
export type ShotOutcome = "GOAL" | "TWO_POINT" | "POINT" | "WIDE" | "SHORT" | "POST" | "BLOCKED" | "OTHER";

/** Where a score came from. Only scores carry a source; misses do not (see header). */
export type ScoreSource = "PLAY" | "PLACED";

export type ShotMarker = {
  id: string;
  outcome: ShotOutcome;
  /** Set for scores only; null for every miss. */
  scoreSource: ScoreSource | null;
  period: "1H" | "2H" | null;
  clockSeconds: number | null;
  /** null = counted in the statistics but not placed on the map. */
  point: MapPoint | null;
};

/** Goals and points (value) scored from one source — enough for "0-19" style notation. */
export type ScoreSourceTotals = { scores: number; goals: number; points: number; total: number };

export type ScoringMapView = {
  scope: MapScope;
  scopeLabel: "HALF-TIME" | "FULL-TIME";
  sport: ProTaggerSport;
  team: MapTeamIdentity;
  opponent: MapTeamIdentity;
  scoreline: MapScoreline;
  shooting: {
    totalShots: number;
    scoringShots: number;
    missedShots: number;
    /** null when there were no shots — never a misleading 0%. */
    accuracyPct: number | null;
  };
  scores: {
    goals: number;
    /** Number of scores worth one point (points, frees, 45s/65s, marks…). */
    onePointScores: number;
    /** Number of two-point scores. */
    twoPointScores: number;
    /** False for hurling and camogie: their capture has no two-point score. */
    twoPointApplicable: boolean;
    /** Points value of all non-goal scores (a two-pointer counts 2). */
    pointsValue: number;
    /** goals × 3 + pointsValue — the team's total in the scoreline. */
    totalValue: number;
  };
  misses: {
    wides: number;
    short: number;
    post: number;
    blockedSaved: number;
    /** Non-scoring shots whose outcome was not recorded (e.g. legacy data). */
    otherOrUnknown: number;
  };
  sources: {
    fromPlay: ScoreSourceTotals;
    placedBalls: ScoreSourceTotals;
  };
  markers: ShotMarker[];
  location: MapLocationSummary;
  orientation: MapOrientation;
};

const SHOT_KIND_SET = new Set<MatchEventKind>(SHOT_KINDS);

function shotOutcome(e: ChainableEvent): ShotOutcome {
  switch (e.kind) {
    case "GOAL": return "GOAL";
    case "TWO_POINTER": case "FORTY_FIVE_TWO_POINT": return "TWO_POINT";
    case "POINT": case "FREE_SCORED": return "POINT";
    case "WIDE": case "FREE_MISSED": return "WIDE";
    default: {
      // SHOT — a non-scoring attempt.
      if (isBlockedOrSavedAttempt(e)) return "BLOCKED";
      const tags = e.tags ?? [];
      if (tags.includes("SHORT")) return "SHORT";
      if (tags.includes("POST")) return "POST";
      return "OTHER";
    }
  }
}

function isScore(outcome: ShotOutcome): boolean {
  return outcome === "GOAL" || outcome === "TWO_POINT" || outcome === "POINT";
}

function scoreValue(outcome: ShotOutcome): { goals: number; points: number } {
  if (outcome === "GOAL") return { goals: 1, points: 0 };
  if (outcome === "TWO_POINT") return { goals: 0, points: 2 };
  return { goals: 0, points: 1 };
}

function emptySource(): ScoreSourceTotals {
  return { scores: 0, goals: 0, points: 0, total: 0 };
}

export function buildScoringMapView(source: MatchMapSource, side: MapTeamSide, scope: MapScope): ScoringMapView {
  const report = buildScopedMapReport(source, scope);
  const orientation = mapOrientation(source, side, scope);
  const block = buildTeamSummaryBlock(report, side);
  const conv = viewShootingConversion(report, side);

  // The same event set viewShootingConversion counts: this team's shot
  // attempts, synthetic "-instant-score-" markers excluded.
  const shots = report.events.filter(
    (e) => e.teamSide === side && SHOT_KIND_SET.has(e.kind) && !e.id.includes("-instant-score-"),
  );

  const misses = { wides: 0, short: 0, post: 0, blockedSaved: 0, otherOrUnknown: 0 };
  const fromPlay = emptySource();
  const placedBalls = emptySource();
  const markers: ShotMarker[] = [];
  const reasons: ReturnType<typeof plotEvent>["reason"][] = [];

  for (const e of shots) {
    const outcome = shotOutcome(e);
    let scoreSource: ScoreSource | null = null;
    if (isScore(outcome)) {
      scoreSource = isPlacedScore(e) ? "PLACED" : "PLAY";
      const bucket = scoreSource === "PLACED" ? placedBalls : fromPlay;
      const v = scoreValue(outcome);
      bucket.scores += 1;
      bucket.goals += v.goals;
      bucket.points += v.points;
      bucket.total += v.goals * 3 + v.points;
    } else if (outcome === "WIDE") misses.wides++;
    else if (outcome === "SHORT") misses.short++;
    else if (outcome === "POST") misses.post++;
    else if (outcome === "BLOCKED") misses.blockedSaved++;
    else misses.otherOrUnknown++;

    const plotted = plotEvent(e, side, orientation.homeFirstHalfDirection);
    reasons.push(plotted.reason);
    markers.push({
      id: e.id,
      outcome,
      scoreSource,
      period: e.period === "1H" || e.period === "2H" ? e.period : null,
      clockSeconds: recordedClockSeconds(e),
      point: plotted.point,
    });
  }

  const twoPointScores = block.twoPointers;
  return {
    scope,
    scopeLabel: scopeLabel(scope),
    sport: source.sport,
    team: teamIdentity(source, side),
    opponent: teamIdentity(source, otherSide(side)),
    scoreline: scopedScoreline(report, source),
    shooting: {
      totalShots: conv.den,
      scoringShots: conv.num,
      missedShots: conv.den - conv.num,
      accuracyPct: conv.den > 0 ? conv.pct : null,
    },
    scores: {
      goals: block.goals,
      onePointScores: block.points - 2 * twoPointScores,
      twoPointScores,
      twoPointApplicable: getFamiliesForSport(source.sport).some((f) => f.id === "TWO_POINT"),
      pointsValue: block.points,
      totalValue: block.scoreTotal,
    },
    misses,
    sources: { fromPlay, placedBalls },
    markers,
    location: summariseLocations(reasons),
    orientation,
  };
}
