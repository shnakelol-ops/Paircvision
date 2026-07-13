/**
 * chain-types.ts
 *
 * Type definitions for the PáircVision tactical chain analysis system.
 *
 * Design goals:
 * - All types are pure data shapes — no logic lives here.
 * - ChainAnalysis is the central output type: a structured dataset that
 *   ALL current and future PDF tactical pages consume independently.
 * - Named sub-datasets (kickouts, turnovers, scoringRuns) are designed
 *   to each power a dedicated future page type without additional processing.
 * - This file imports only from core/stats/stats-event-model to keep
 *   the dependency chain clean (no circular imports with reviewPdfExport).
 */

import type {
  MatchEventKind,
  MatchEventPeriod,
  MatchEventSegment,
} from "../../core/stats/stats-event-model";

// ─── Minimal event interface ──────────────────────────────────────────────────
// The chain engine operates on this interface, not on PdfExportEvent directly.
// PdfExportEvent (and LoggedMatchEvent) both structurally satisfy this type.
// This avoids any circular import with reviewPdfExport.ts.

export type ChainableEvent = {
  id: string;
  kind: MatchEventKind;
  /** Normalised raw recording side — guaranteed on PdfExportEvent */
  teamSide: "FOR" | "OPP";
  period: MatchEventPeriod;
  segment: MatchEventSegment;
  /** Optional match clock in seconds. Used for temporal chain ordering and
   *  gap calculation. Falls back to segment-based ordering when absent. */
  matchClockSeconds?: number | null;
  /** Normalised pitch x (0–1). Used in spatial analysis / future pitch pages. */
  nx: number;
  /** Normalised pitch y (0–1). */
  ny: number;
  tags?: string[] | null;
  /** Who took this restart (kickout/puckout/45/sideline). "FOR" = we took it; "OPP" = they took it.
   *  Absent on non-restart events and on matches recorded before V1.2. */
  restartOwner?: "FOR" | "OPP" | null;
};

// ─── Rule Identification ──────────────────────────────────────────────────────

export type ChainRuleId =
  | "KICKOUT_TO_SCORE"
  | "KICKOUT_LOST_TO_SCORE_AGAINST"
  | "TURNOVER_TO_SCORE"
  | "TURNOVER_TO_SHOT"
  | "FREE_WON_TO_GOAL";

// ─── Rule Definition ──────────────────────────────────────────────────────────

/**
 * Side requirement for a chain step, relative to the anchor (step 0) event.
 *
 *   "FOR"      — raw teamSide must be "FOR" (absolute)
 *   "OPP"      — raw teamSide must be "OPP" (absolute)
 *   "ANY"      — any teamSide passes
 *   "SAME"     — must match the anchor event's teamSide
 *   "OPPOSITE" — must be opposite of the anchor event's teamSide
 */
export type ChainStepSide = "FOR" | "OPP" | "ANY" | "SAME" | "OPPOSITE";

export type ChainStepCondition = {
  /** Event kinds that satisfy this step */
  kinds: ReadonlySet<MatchEventKind>;
  /** Team side requirement (see ChainStepSide) */
  side: ChainStepSide;
  /**
   * Maximum seconds allowed since the previous step's event.
   * Ignored when matchClockSeconds is absent on either event.
   */
  maxGapSeconds?: number;
};

/**
 * A sequential tactical pattern definition.
 *
 * Rules are pure data — no logic. New rules can be appended to chain-rules.ts
 * without touching the engine. The engine processes all rules identically.
 */
export type ChainRule = {
  id: ChainRuleId;
  label: string;
  description: string;
  steps: readonly ChainStepCondition[];
  /**
   * Optional total window cap (seconds from step[0] to final step).
   * Ignored when clock data is absent.
   */
  maxWindowSeconds?: number;
};

// ─── Chain Match ──────────────────────────────────────────────────────────────

/**
 * A single detected tactical chain instance.
 * Generic over TEvent so the engine can return the original event objects
 * (e.g. PdfExportEvent with all its extra fields) without type loss.
 */
export type ChainMatch<TEvent extends ChainableEvent = ChainableEvent> = {
  ruleId: ChainRuleId;
  label: string;
  /** The matched events in step order */
  events: readonly TEvent[];
  /**
   * Tactical beneficiary side: the teamSide of the final step's event.
   * This is who ultimately benefited from the chain sequence.
   */
  teamSide: "FOR" | "OPP";
  /** Period of the anchor (step 0) event */
  period: MatchEventPeriod;
  /** Segment of the anchor (step 0) event */
  segment: MatchEventSegment;
  startClockSeconds: number;
  endClockSeconds: number;
  durationSeconds: number;
};

// ─── Tactical Sub-Datasets ────────────────────────────────────────────────────
// Each dataset is designed to independently power a dedicated future page type.
// They are built by the engine via direct event-stream scanning, separate from
// the rules-based sequential chain detection.

// ── Kickout dataset (powers future "Kickout Analysis" page) ──────────────────

export type KickoutOutcome<TEvent extends ChainableEvent = ChainableEvent> = {
  kickoutEvent: TEvent;
  /** Which side won possession from this kickout */
  winningSide: "FOR" | "OPP";
  /** First score by the winning side after the kickout (within window), or null */
  nextScore: TEvent | null;
  /** First shot or score attempt by the winning side after the kickout, or null */
  nextShotOrScore: TEvent | null;
  /** Seconds from kickout to next score; null if no score followed in window */
  secondsToScore: number | null;
};

export type KickoutChainDataset<TEvent extends ChainableEvent = ChainableEvent> = {
  total: number;
  won: number;
  lost: number;
  /** Won kickouts followed by a score within the window */
  wonToScore: number;
  wonToScorePercent: number;
  /** Conceded kickouts followed by an opposition score within the window */
  lostAllowedScore: number;
  lostAllowedScorePercent: number;
  outcomes: readonly KickoutOutcome<TEvent>[];
};

// ── Turnover dataset (powers future "Turnover Punishment" page) ───────────────

export type TurnoverOutcome<TEvent extends ChainableEvent = ChainableEvent> = {
  turnoverEvent: TEvent;
  direction: "WON" | "LOST";
  /**
   * Which side actually gained possession from this turnover — WON events
   * are gained by turnoverEvent.teamSide, LOST events are gained by the
   * opposite side. Resolved once here so every consumer filters on the same
   * value instead of re-deriving direction+teamSide locally (the mirrors of
   * that flip in reviewPdfExport.ts previously drifted from each other).
   */
  actingSide: "FOR" | "OPP";
  /** First relevant event (shot/score/turnover) after this turnover, or null */
  nextEvent: TEvent | null;
  resultedInScore: boolean;
  resultedInShot: boolean;
  /** Seconds from turnover to next relevant outcome; null if none found */
  secondsToOutcome: number | null;
};

export type TurnoverChainDataset<TEvent extends ChainableEvent = ChainableEvent> = {
  total: number;
  won: number;
  lost: number;
  wonToScore: number;
  wonToScorePercent: number;
  wonToShot: number;
  wonToShotPercent: number;
  /** Lost turnovers where opposition scored directly after */
  lostAllowedScore: number;
  outcomes: readonly TurnoverOutcome<TEvent>[];
};

// ── Scoring run dataset (powers future "Momentum" page) ──────────────────────

export type ScoringRun<TEvent extends ChainableEvent = ChainableEvent> = {
  events: readonly TEvent[];
  teamSide: "FOR" | "OPP";
  count: number;
  startClockSeconds: number;
  endClockSeconds: number;
  period: MatchEventPeriod;
};

export type ScoringRunDataset<TEvent extends ChainableEvent = ChainableEvent> = {
  /** All scoring runs of length ≥ 2 */
  runs: readonly ScoringRun<TEvent>[];
  longestRunFor: ScoringRun<TEvent> | null;
  longestRunOpp: ScoringRun<TEvent> | null;
  maxConsecutiveFor: number;
  maxConsecutiveOpp: number;
};

// ─── Possession Outcomes Engine ───────────────────────────────────────────────
// Powers the Possession Outcomes card and PDF page (V1.1).
// Computed by buildPossessionOutcomeSummary() in possession-outcomes-engine.ts.
// These types are additive — the existing chain datasets above are untouched.

/** The definitive end-state of a single possession. */
export type PossessionOutcomeKind =
  | "GOAL"      // Acting side scored a goal
  | "POINT"     // Acting side scored (point / 2-pointer / 45 / free scored)
  | "WIDE"      // Acting side shot wide or missed a free
  | "SHOT"      // Acting side took a shot; outcome ambiguous (blocked etc.)
  | "TURNOVER"  // Acting side lost possession before scoring
  | "RECYCLED"; // Window expired; acting side retained without a decisive event

/** Which group of origin events a PossessionOutcomeFamily covers. */
export type PossessionOriginKind = "KICKOUT" | "TURNOVER" | "FREE";

/** One possession: from origin event to definitive outcome. */
export type PossessionResult<TEvent extends ChainableEvent = ChainableEvent> = {
  originEvent: TEvent;
  /** Team that started with the ball after this origin event. */
  actingSide: "FOR" | "OPP";
  outcome: PossessionOutcomeKind;
  /** The event that closed this possession, or null (recycled / timeout). */
  outcomingEvent: TEvent | null;
  /** Clock seconds from origin to outcome; null when clock data absent. */
  secondsToOutcome: number | null;
  /** Goals scored by the acting side in this possession (0 or 1). */
  goals: number;
  /** Points scored by the acting side (POINT / 2-PT / 45 / FREE_SCORED). */
  points: number;
};

/** Aggregate outcome counts for one side within a possession family. */
export type PossessionFamilySummary = {
  count: number;
  goals: number;
  points: number;
  wides: number;
  turnovers: number;
  recycled: number;
  /** Equivalent point value: goals × 3 + points × 1. */
  scoreValue: number;
  /** (goals + points) / count × 100; 0 when count = 0. */
  scoringPct: number;
};

/**
 * Full analysis for one possession origin group
 * (e.g. all kickout events, or all free events).
 *
 * `retained`  = possessions where FOR team had the ball.
 * `conceded`  = possessions where OPP team had the ball.
 *
 * For kickouts:  retained=KICKOUT_WON, conceded=KICKOUT_CONCEDED.
 * For turnovers: retained=TURNOVER_WON, conceded=TURNOVER_LOST.
 * For frees:     retained=FREE_WON,     conceded=FREE_CONCEDED.
 */
export type PossessionOutcomeFamily<TEvent extends ChainableEvent = ChainableEvent> = {
  originKind: PossessionOriginKind;
  /** Total origin events (retained + conceded). */
  total: number;
  /** Possessions started by FOR (KICKOUT_WON / TURNOVER_WON / FREE_WON). */
  retainedCount: number;
  /** Possessions started by OPP (KICKOUT_CONCEDED / TURNOVER_LOST / FREE_CONCEDED). */
  concededCount: number;
  /** retainedCount / total × 100 (0–100 integer). */
  retentionPct: number;
  /** concededCount / total × 100 (0–100 integer). */
  stealPct: number;
  /** Outcome summary when FOR team had the ball. */
  retained: PossessionFamilySummary;
  /** Outcome summary when OPP team had the ball. */
  conceded: PossessionFamilySummary;
  /** When OPP got possession, how often did they score? (0–100 integer). */
  damagePct: number;
  /** When OPP got possession, how often did we avoid conceding? (0–100 integer). */
  escapePct: number;
  /** FOR score value minus OPP score value for this family. */
  netOutcome: number;
  /** Human-readable net, e.g. "+5", "-3", "0". */
  netLabel: string;
  results: readonly PossessionResult<TEvent>[];
};

/** Full possession outcome summary across all origin groups. */
export type PossessionOutcomeSummary<TEvent extends ChainableEvent = ChainableEvent> = {
  kickouts: PossessionOutcomeFamily<TEvent>;
  /** Kickouts taken by our team. Non-null only when restartOwner data is present (V1.2+). */
  ourKickouts: PossessionOutcomeFamily<TEvent> | null;
  /** Kickouts taken by the opposition. Non-null only when restartOwner data is present (V1.2+). */
  theirKickouts: PossessionOutcomeFamily<TEvent> | null;
  turnovers: PossessionOutcomeFamily<TEvent>;
  frees: PossessionOutcomeFamily<TEvent>;
  /** Sum of netOutcome across all three families. */
  overallNetOutcome: number;
};

/** Derived coaching intelligence from a PossessionOutcomeSummary. */
export type MatchIntelligence = {
  /** Family with the highest OPP scoring rate from conceded possessions. */
  highestDamageFamily: { label: string; damagePct: number } | null;
  /** Family where FOR's retained scoringPct was highest (retainedCount ≥ 3). */
  bestScoringFamily: { label: string; scoringPct: number } | null;
  /** Family where FOR's retained scoringPct was lowest (retainedCount ≥ 3). */
  worstScoringFamily: { label: string; scoringPct: number } | null;
  /** Combined net outcome across all families. */
  overallNetOutcome: number;
  /** Exactly 3 deterministic coaching priority strings. */
  coachingPriorities: readonly string[];
};

// ─── Main Analysis Output ─────────────────────────────────────────────────────

export type ChainSummary = {
  totalChains: number;
  byRule: Partial<Record<ChainRuleId, number>>;
  forChains: number;
  oppChains: number;
};

/**
 * ChainAnalysis — the central structured output of the chain engine.
 *
 * Architecture contract:
 *   - Computed ONCE per PDF export via selectChainAnalysis(events).
 *   - ALL current and future chain-related PDF pages consume slices of this object.
 *   - No page builder re-runs chain detection; they each call their selector on
 *     this object (see chain-selectors.ts).
 *   - Generic over TEvent so the full original event objects are preserved
 *     (e.g. a future page can access event.playerName, event.tags, etc.).
 *
 * Future page → dataset mapping:
 *   Chain Summary page   → allChains, summary, byRule
 *   Kickout Analysis     → kickouts
 *   Turnover Punishment  → turnovers
 *   Momentum / Scoring   → scoringRuns
 *   Opposition Trends    → byTeamSide.opp, byPeriod, bySegment
 */
export type ChainAnalysis<TEvent extends ChainableEvent = ChainableEvent> = {
  // ── All detected chain matches ──────────────────────────────────────────────
  allChains: readonly ChainMatch<TEvent>[];

  // ── Pre-indexed for efficient page-specific consumption ────────────────────
  byRule: Partial<Record<ChainRuleId, readonly ChainMatch<TEvent>[]>>;
  byPeriod: Partial<Record<MatchEventPeriod, readonly ChainMatch<TEvent>[]>>;
  bySegment: Partial<Record<MatchEventSegment, readonly ChainMatch<TEvent>[]>>;
  byTeamSide: {
    for: readonly ChainMatch<TEvent>[];
    opp: readonly ChainMatch<TEvent>[];
  };

  // ── Aggregate summary ───────────────────────────────────────────────────────
  summary: ChainSummary;

  // ── Named tactical sub-datasets ────────────────────────────────────────────
  kickouts: KickoutChainDataset<TEvent>;
  turnovers: TurnoverChainDataset<TEvent>;
  scoringRuns: ScoringRunDataset<TEvent>;

  // ── Metadata ────────────────────────────────────────────────────────────────
  totalEventsAnalysed: number;
};
