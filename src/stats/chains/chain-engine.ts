/**
 * chain-engine.ts
 *
 * Pure functional chain analysis engine for PáircVision.
 *
 * Entry point: analyseChains(events, rules?)
 *
 * Returns a fully structured ChainAnalysis object.
 * This function is a pure function — no side effects, no imports from
 * reviewPdfExport.ts, no UI dependencies, no async.
 *
 * Algorithm overview:
 *   1. Filter out virtual instant-score marker events.
 *   2. Assign each event an effective clock (matchClockSeconds when present,
 *      otherwise a deterministic fallback from period + segment).
 *   3. Sort the working array by effective clock, preserving period order.
 *   4. Run sequential rule detection (forward scan) for each ChainRule.
 *   5. Build named tactical sub-datasets via direct event-stream analysis.
 *   6. Index all results into the ChainAnalysis output structure.
 */

import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../../core/stats/stats-event-model";
import { CHAIN_RULES } from "./chain-rules";
import type {
  ChainableEvent,
  ChainAnalysis,
  ChainMatch,
  ChainRule,
  ChainRuleId,
  ChainStepSide,
  ChainSummary,
  KickoutChainDataset,
  KickoutOutcome,
  ScoringRun,
  ScoringRunDataset,
  TurnoverChainDataset,
  TurnoverOutcome,
} from "./chain-types";

// ─── Internal working type ────────────────────────────────────────────────────

/** Event enriched with a resolved clock for ordering/gap calculations */
type SortedEvent<TEvent extends ChainableEvent> = {
  event: TEvent;
  /** Resolved clock in seconds. 1H events: 0–3599. 2H events: 3600–7199. */
  clock: number;
  /** Whether clock data was real (matchClockSeconds present) or synthetic */
  clockIsReal: boolean;
};

// ─── Clock resolution ─────────────────────────────────────────────────────────

const SEGMENT_MIDPOINTS: Record<MatchEventSegment, number> = {
  1: 300,   // ~5 min into 1H
  2: 900,   // ~15 min into 1H
  3: 1500,  // ~25 min into 1H
  4: 300,   // ~5 min into 2H (offset added below)
  5: 900,   // ~15 min into 2H
  6: 1500,  // ~25 min into 2H
};

const SECOND_HALF_OFFSET = 3600; // keeps 2H events after 1H when sorting

/**
 * Returns a synthetic clock value for events without matchClockSeconds.
 * Places the event at the midpoint of its segment, with 2H offset applied.
 */
function syntheticClock(period: MatchEventPeriod, segment: MatchEventSegment): number {
  const mid = SEGMENT_MIDPOINTS[segment] ?? 300;
  return period === "2H" ? mid + SECOND_HALF_OFFSET : mid;
}

function resolveEventClock<TEvent extends ChainableEvent>(
  event: TEvent,
): { clock: number; clockIsReal: boolean } {
  const raw = event.matchClockSeconds;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    const base = event.period === "2H" ? SECOND_HALF_OFFSET : 0;
    return { clock: base + raw, clockIsReal: true };
  }
  return {
    clock: syntheticClock(event.period, event.segment),
    clockIsReal: false,
  };
}

// ─── Step side matching ───────────────────────────────────────────────────────

function sideMatches(
  candidateSide: "FOR" | "OPP",
  requirement: ChainStepSide,
  anchorSide: "FOR" | "OPP",
): boolean {
  switch (requirement) {
    case "FOR":      return candidateSide === "FOR";
    case "OPP":      return candidateSide === "OPP";
    case "ANY":      return true;
    case "SAME":     return candidateSide === anchorSide;
    case "OPPOSITE": return candidateSide !== anchorSide;
  }
}

// ─── Tactical kind sets ───────────────────────────────────────────────────────

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

const SHOT_OR_SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
  "SHOT", "WIDE", "FREE_MISSED",
]);

// ─── Sequential rule detection ────────────────────────────────────────────────

/**
 * Forward-scan sequential chain detection for a single rule.
 *
 * For each event matching step[0], scans forward to find a sequence of
 * subsequent events that satisfy steps[1..n] within the time constraints.
 *
 * A chain is only recorded if ALL steps are matched in order.
 * Events between steps are allowed (possession passes are not tracked).
 */
function detectRule<TEvent extends ChainableEvent>(
  sorted: readonly SortedEvent<TEvent>[],
  rule: ChainRule,
): ChainMatch<TEvent>[] {
  const results: ChainMatch<TEvent>[] = [];
  const steps = rule.steps;
  if (steps.length < 2) return results;

  for (let anchorIdx = 0; anchorIdx < sorted.length; anchorIdx++) {
    const anchorEntry = sorted[anchorIdx];
    const anchorStep = steps[0];
    const anchorSide = anchorEntry.event.teamSide;

    // Does this event match step 0?
    if (!anchorStep.kinds.has(anchorEntry.event.kind)) continue;
    if (!sideMatches(anchorSide, anchorStep.side, anchorSide)) continue;

    // Try to find each subsequent step
    const matchedEntries: SortedEvent<TEvent>[] = [anchorEntry];
    let success = true;

    for (let stepIdx = 1; stepIdx < steps.length; stepIdx++) {
      const step = steps[stepIdx];
      const prevEntry = matchedEntries[matchedEntries.length - 1];
      let found = false;

      for (let fwdIdx = anchorIdx + 1; fwdIdx < sorted.length; fwdIdx++) {
        const candidate = sorted[fwdIdx];

        // Per-step gap check (only when both events have real clock data)
        if (
          step.maxGapSeconds != null &&
          candidate.clockIsReal &&
          prevEntry.clockIsReal &&
          candidate.clock - prevEntry.clock > step.maxGapSeconds
        ) {
          break; // Too far from the previous step
        }

        // Total window check from anchor
        if (
          rule.maxWindowSeconds != null &&
          candidate.clockIsReal &&
          anchorEntry.clockIsReal &&
          candidate.clock - anchorEntry.clock > rule.maxWindowSeconds
        ) {
          break;
        }

        // Kind match
        if (!step.kinds.has(candidate.event.kind)) continue;

        // Side match (relative to anchor side, not step's side)
        if (!sideMatches(candidate.event.teamSide, step.side, anchorSide)) continue;

        // Step matched
        matchedEntries.push(candidate);
        found = true;
        break;
      }

      if (!found) {
        success = false;
        break;
      }
    }

    if (!success) continue;

    // Build the ChainMatch
    const firstEntry = matchedEntries[0];
    const lastEntry = matchedEntries[matchedEntries.length - 1];
    const startClock = firstEntry.clock;
    const endClock = lastEntry.clock;

    results.push({
      ruleId: rule.id,
      label: rule.label,
      events: matchedEntries.map((e) => e.event),
      // Beneficial side = teamSide of the final event (who ultimately acted last)
      teamSide: lastEntry.event.teamSide,
      period: firstEntry.event.period,
      segment: firstEntry.event.segment,
      startClockSeconds: startClock,
      endClockSeconds: endClock,
      durationSeconds: Math.max(0, endClock - startClock),
    });
  }

  return results;
}

// ─── Kickout dataset builder ──────────────────────────────────────────────────

const KICKOUT_KINDS = new Set<MatchEventKind>(["KICKOUT_WON", "KICKOUT_CONCEDED"]);

/**
 * Builds the kickout chain dataset by scanning all kickout events and
 * identifying the first score within 90 seconds by each side.
 *
 * This is independent of the rules engine and intended to power a dedicated
 * "Kickout Analysis" page in the future.
 */
function buildKickoutDataset<TEvent extends ChainableEvent>(
  sorted: readonly SortedEvent<TEvent>[],
): KickoutChainDataset<TEvent> {
  const outcomes: KickoutOutcome<TEvent>[] = [];
  let won = 0;
  let lost = 0;
  let wonToScore = 0;
  let lostAllowedScore = 0;

  const MAX_GAP = 90;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (!KICKOUT_KINDS.has(entry.event.kind)) continue;

    const kickoutEvent = entry.event;
    const isWon = kickoutEvent.kind === "KICKOUT_WON";
    const winningSide: "FOR" | "OPP" = isWon ? kickoutEvent.teamSide : (kickoutEvent.teamSide === "FOR" ? "OPP" : "FOR");

    if (winningSide === "FOR") won++; else lost++;

    // Look forward for first score by the winning side
    let nextScore: TEvent | null = null;
    let nextShotOrScore: TEvent | null = null;
    let secondsToScore: number | null = null;

    for (let j = i + 1; j < sorted.length; j++) {
      const fwd = sorted[j];

      // Stop if another kickout event is encountered (new possession reset)
      if (KICKOUT_KINDS.has(fwd.event.kind)) break;

      // Time window cap
      if (
        entry.clockIsReal &&
        fwd.clockIsReal &&
        fwd.clock - entry.clock > MAX_GAP
      ) break;

      if (fwd.event.teamSide !== winningSide) continue;

      if (SHOT_OR_SCORE_KINDS.has(fwd.event.kind) && nextShotOrScore == null) {
        nextShotOrScore = fwd.event;
      }
      if (SCORE_KINDS.has(fwd.event.kind) && nextScore == null) {
        nextScore = fwd.event;
        secondsToScore =
          entry.clockIsReal && fwd.clockIsReal
            ? Math.max(0, fwd.clock - entry.clock)
            : null;
        break;
      }
    }

    if (winningSide === "FOR" && nextScore != null) wonToScore++;
    if (winningSide === "OPP" && nextScore != null) lostAllowedScore++;

    outcomes.push({
      kickoutEvent,
      winningSide,
      nextScore,
      nextShotOrScore,
      secondsToScore,
    });
  }

  const wonToScorePercent = won > 0 ? Math.round((wonToScore / won) * 100) : 0;
  const lostAllowedScorePercent = lost > 0 ? Math.round((lostAllowedScore / lost) * 100) : 0;

  return {
    total: won + lost,
    won,
    lost,
    wonToScore,
    wonToScorePercent,
    lostAllowedScore,
    lostAllowedScorePercent,
    outcomes,
  };
}

// ─── Turnover dataset builder ─────────────────────────────────────────────────

const TURNOVER_KINDS = new Set<MatchEventKind>(["TURNOVER_WON", "TURNOVER_LOST"]);
const RELEVANT_FOLLOWUP_KINDS = new Set<MatchEventKind>([
  ...SHOT_OR_SCORE_KINDS,
  "TURNOVER_WON",
  "TURNOVER_LOST",
]);

/**
 * Builds the turnover chain dataset by scanning all turnover events and
 * identifying what happened next.
 *
 * Intended to power a dedicated "Turnover Punishment" page in the future.
 */
function buildTurnoverDataset<TEvent extends ChainableEvent>(
  sorted: readonly SortedEvent<TEvent>[],
): TurnoverChainDataset<TEvent> {
  const outcomes: TurnoverOutcome<TEvent>[] = [];
  let won = 0;
  let lost = 0;
  let wonToScore = 0;
  let wonToShot = 0;
  let lostAllowedScore = 0;

  const MAX_GAP = 60;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (!TURNOVER_KINDS.has(entry.event.kind)) continue;

    const turnoverEvent = entry.event;
    const direction: "WON" | "LOST" = turnoverEvent.kind === "TURNOVER_WON" ? "WON" : "LOST";
    const actingSide: "FOR" | "OPP" = direction === "WON" ? turnoverEvent.teamSide : (turnoverEvent.teamSide === "FOR" ? "OPP" : "FOR");

    // Aggregate by acting side, not raw direction: capture sources that only
    // ever log kind TURNOVER_WON (teamSide = whichever team actually won it,
    // no TURNOVER_LOST counterpart) would otherwise count every event as
    // "won" and never populate "lost" at all. actingSide already resolves
    // the true beneficiary regardless of which kind/teamSide combination the
    // source used, so aggregating on it keeps FOR-locked dual-kind data
    // (direction and actingSide always agree there) and single-kind data
    // both correct.
    if (actingSide === "FOR") won++; else lost++;

    let nextEvent: TEvent | null = null;
    let resultedInScore = false;
    let resultedInShot = false;
    let secondsToOutcome: number | null = null;

    for (let j = i + 1; j < sorted.length; j++) {
      const fwd = sorted[j];

      // Time window cap
      if (
        entry.clockIsReal &&
        fwd.clockIsReal &&
        fwd.clock - entry.clock > MAX_GAP
      ) break;

      if (fwd.event.teamSide !== actingSide) continue;
      if (!RELEVANT_FOLLOWUP_KINDS.has(fwd.event.kind)) continue;

      nextEvent = fwd.event;
      resultedInScore = SCORE_KINDS.has(fwd.event.kind);
      resultedInShot = SHOT_OR_SCORE_KINDS.has(fwd.event.kind);
      secondsToOutcome =
        entry.clockIsReal && fwd.clockIsReal
          ? Math.max(0, fwd.clock - entry.clock)
          : null;
      break;
    }

    if (actingSide === "FOR" && resultedInScore) wonToScore++;
    if (actingSide === "FOR" && resultedInShot) wonToShot++;
    if (actingSide === "OPP" && resultedInScore) lostAllowedScore++;

    outcomes.push({
      turnoverEvent,
      direction,
      actingSide,
      nextEvent,
      resultedInScore,
      resultedInShot,
      secondsToOutcome,
    });
  }

  const wonToScorePercent = won > 0 ? Math.round((wonToScore / won) * 100) : 0;
  const wonToShotPercent = won > 0 ? Math.round((wonToShot / won) * 100) : 0;

  return {
    total: won + lost,
    won,
    lost,
    wonToScore,
    wonToScorePercent,
    wonToShot,
    wonToShotPercent,
    lostAllowedScore,
    outcomes,
  };
}

// ─── Scoring run dataset builder ──────────────────────────────────────────────

/**
 * Identifies consecutive scoring runs: sequences where one team scores ≥ 2
 * times in a row without the other team scoring.
 *
 * Intended to power a dedicated "Momentum" page in the future.
 */
function buildScoringRunDataset<TEvent extends ChainableEvent>(
  sorted: readonly SortedEvent<TEvent>[],
): ScoringRunDataset<TEvent> {
  const scoreEvents = sorted.filter((e) => SCORE_KINDS.has(e.event.kind));
  const runs: ScoringRun<TEvent>[] = [];

  if (scoreEvents.length === 0) {
    return { runs, longestRunFor: null, longestRunOpp: null, maxConsecutiveFor: 0, maxConsecutiveOpp: 0 };
  }

  let runEvents: SortedEvent<TEvent>[] = [scoreEvents[0]];
  let currentSide = scoreEvents[0].event.teamSide;

  const commitRun = () => {
    if (runEvents.length >= 2) {
      runs.push({
        events: runEvents.map((e) => e.event),
        teamSide: currentSide,
        count: runEvents.length,
        startClockSeconds: runEvents[0].clock,
        endClockSeconds: runEvents[runEvents.length - 1].clock,
        period: runEvents[0].event.period,
      });
    }
  };

  for (let i = 1; i < scoreEvents.length; i++) {
    const entry = scoreEvents[i];
    if (entry.event.teamSide === currentSide) {
      runEvents.push(entry);
    } else {
      commitRun();
      runEvents = [entry];
      currentSide = entry.event.teamSide;
    }
  }
  commitRun();

  const forRuns = runs.filter((r) => r.teamSide === "FOR");
  const oppRuns = runs.filter((r) => r.teamSide === "OPP");

  const longestRunFor = forRuns.length > 0
    ? forRuns.reduce((best, r) => (r.count > best.count ? r : best))
    : null;
  const longestRunOpp = oppRuns.length > 0
    ? oppRuns.reduce((best, r) => (r.count > best.count ? r : best))
    : null;

  return {
    runs,
    longestRunFor,
    longestRunOpp,
    maxConsecutiveFor: longestRunFor?.count ?? 0,
    maxConsecutiveOpp: longestRunOpp?.count ?? 0,
  };
}

// ─── Index builders ───────────────────────────────────────────────────────────

function buildByRule<TEvent extends ChainableEvent>(
  chains: readonly ChainMatch<TEvent>[],
): Partial<Record<ChainRuleId, readonly ChainMatch<TEvent>[]>> {
  const map: Partial<Record<ChainRuleId, ChainMatch<TEvent>[]>> = {};
  for (const chain of chains) {
    if (!map[chain.ruleId]) map[chain.ruleId] = [];
    map[chain.ruleId]!.push(chain);
  }
  return map;
}

function buildByPeriod<TEvent extends ChainableEvent>(
  chains: readonly ChainMatch<TEvent>[],
): Partial<Record<MatchEventPeriod, readonly ChainMatch<TEvent>[]>> {
  const map: Partial<Record<MatchEventPeriod, ChainMatch<TEvent>[]>> = {};
  for (const chain of chains) {
    if (!map[chain.period]) map[chain.period] = [];
    map[chain.period]!.push(chain);
  }
  return map;
}

function buildBySegment<TEvent extends ChainableEvent>(
  chains: readonly ChainMatch<TEvent>[],
): Partial<Record<MatchEventSegment, readonly ChainMatch<TEvent>[]>> {
  const map: Partial<Record<MatchEventSegment, ChainMatch<TEvent>[]>> = {};
  for (const chain of chains) {
    if (!map[chain.segment]) map[chain.segment] = [];
    map[chain.segment]!.push(chain);
  }
  return map;
}

function buildSummary<TEvent extends ChainableEvent>(
  chains: readonly ChainMatch<TEvent>[],
): ChainSummary {
  const byRule: Partial<Record<ChainRuleId, number>> = {};
  let forChains = 0;
  let oppChains = 0;

  for (const chain of chains) {
    byRule[chain.ruleId] = (byRule[chain.ruleId] ?? 0) + 1;
    if (chain.teamSide === "FOR") forChains++;
    else oppChains++;
  }

  return { totalChains: chains.length, byRule, forChains, oppChains };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * analyseChains — the single entry point for the chain analysis engine.
 *
 * Takes a raw event array (PdfExportEvent[] or any ChainableEvent[]) and
 * returns a fully structured ChainAnalysis.
 *
 * This is a pure function. It does not mutate the input array.
 * It is safe to call from any context (PDF export, tests, future UI panels).
 *
 * @param events - Raw events (unsorted, unfiltered)
 * @param rules  - Optional rule set override; defaults to CHAIN_RULES
 */
export function analyseChains<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
  rules: readonly ChainRule[] = CHAIN_RULES,
): ChainAnalysis<TEvent> {
  // 1. Filter out virtual instant-score markers
  const validEvents = events.filter((e) => !e.id.includes("-instant-score-"));

  // 2. Resolve effective clock for every event
  const withClock: SortedEvent<TEvent>[] = validEvents.map((event) => ({
    event,
    ...resolveEventClock(event),
  }));

  // 3. Sort by effective clock (stable — preserves original order for ties)
  const sorted = [...withClock].sort((a, b) => a.clock - b.clock);

  // 4. Run sequential rule detection for each rule
  const allChains: ChainMatch<TEvent>[] = [];
  for (const rule of rules) {
    const ruleChains = detectRule(sorted, rule);
    allChains.push(...ruleChains);
  }

  // Sort all chains by start clock for consistent page rendering order
  allChains.sort((a, b) => a.startClockSeconds - b.startClockSeconds);

  // 5. Build named tactical sub-datasets
  const kickouts = buildKickoutDataset(sorted);
  const turnovers = buildTurnoverDataset(sorted);
  const scoringRuns = buildScoringRunDataset(sorted);

  // 6. Index and return
  return {
    allChains,
    byRule:     buildByRule(allChains),
    byPeriod:   buildByPeriod(allChains),
    bySegment:  buildBySegment(allChains),
    byTeamSide: {
      for: allChains.filter((c) => c.teamSide === "FOR"),
      opp: allChains.filter((c) => c.teamSide === "OPP"),
    },
    summary:    buildSummary(allChains),
    kickouts,
    turnovers,
    scoringRuns,
    totalEventsAnalysed: validEvents.length,
  };
}
