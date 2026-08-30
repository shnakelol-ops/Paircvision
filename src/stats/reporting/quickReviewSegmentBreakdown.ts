/**
 * quickReviewSegmentBreakdown.ts
 *
 * Pure data builder for Quick Review Page 3 ("Segment Comparison").
 *
 * PROVENANCE BOUNDARY — separate from Page 1's, deliberately:
 * quickReviewMatchOverview.ts (Page 1) has its own locked provenance
 * boundary — it never reads chain/origin data, only immediate
 * possession-outcome data (see that file's header and
 * quickReviewMatchOverview.provenance.test.ts). Page 3 has a genuinely
 * different, wider analytical scope: it reads per-event pitch location
 * (for own/opposition-half turnover territory) and restart ownership (for
 * kickout retained/taken) that Page 1 was explicitly built to exclude. That
 * is why Page 3 gets its OWN builder file and its OWN provenance test
 * (quickReviewSegmentBreakdown.provenance.test.ts) rather than being added
 * to quickReviewMatchOverview.ts — the two boundaries protect different
 * things and must not be merged.
 *
 * Page 3 is still bound by the same "report the numbers, not the cause"
 * rule Page 1 follows, and by an additional, narrower rule of its own:
 * even though this event data is rich enough to compute chain-origin
 * facts (turnover -> shot, kickout -> score, seconds-to-outcome), Page 3
 * deliberately does NOT compute or expose any of them in this scope. See
 * QUICK_REVIEW_SEGMENT_FORBIDDEN_KEYS below and its provenance test.
 *
 * Segmentation: delegates entirely to each event's own already-assigned
 * `segment` field (1 = 1H Early, 2 = 1H Mid, 3 = 1H Late — the same
 * canonical buckets produced by statsSegments.ts's
 * deriveSegmentFromPeriodClock()). This file does not re-derive segment
 * boundaries and does not fork segmentation logic.
 *
 * Scope: first half only, by product decision (see the Page 3 audit) —
 * this keeps the page small and avoids a stale-page-index class of bug.
 * Second-half events are filtered out up front and never contribute to
 * any figure below.
 *
 * The React component (QuickReviewPage3.tsx) performs no calculation —
 * every field on the returned model is already display-ready.
 */

import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { computeScoreSide, fmtGP } from "../../pro-tagger/pro-tagger-score";
import { resolveRestartOwner } from "../restarts/restartMetrics";
import {
  toTeamRelativeZoneEvent,
  type AttackingDirection,
  type ZoneLabelPerspective,
} from "../zones/zone-orientation";

// ─── Forbidden-field guard ──────────────────────────────────────────────────
//
// Mirrors QUICK_REVIEW_FORBIDDEN_KEYS (quickReviewMatchOverview.ts) and
// MATCH_AND_POSSESSION_FACTS_FORBIDDEN_KEYS (reportProvenance.ts). Enforced
// by quickReviewSegmentBreakdown.provenance.test.ts via a runtime key-scan
// of a built model, kept here (not just relied on via the type) so the
// guard survives even if an `any` cast is introduced later.
export const QUICK_REVIEW_SEGMENT_FORBIDDEN_KEYS = [
  "resultedInShot",
  "resultedInScore",
  "secondsToOutcome",
  "secondsToScore",
  "nextShotOrScore",
  "nextScore",
  "restartOrigin",
  "turnoverOrigin",
  "originScore",
  "originScoreAgainst",
  "restartOriginScore",
  "turnoverOriginScore",
  "chainRate",
  "chainShare",
  "chainInvolvement",
  "ruleMatch",
  "wonToScore",
  "lostAllowedScore",
  "restartToScore",
  "restartLossPunishment",
  "turnoverWinsToScore",
  "turnoverLossPunishment",
] as const;

// ─── Display value shapes ───────────────────────────────────────────────────

export type QuickReviewSegmentLabel = "EARLY" | "MID" | "LATE";

export type QuickReviewSegmentScoreLine = {
  goals: number;
  points: number;
  total: number;
  /** "1-03" (fmtGP output). */
  text: string;
};

export type QuickReviewTurnoverHalfSplit = {
  ownHalf: number;
  oppositionHalf: number;
};

export type QuickReviewKickoutRetention = {
  retained: number;
  taken: number;
  /** "4/5 (80%)"; "—" when taken is 0. Counts always precede the percentage. */
  text: string;
};

export type QuickReviewSegmentSideStats = {
  score: QuickReviewSegmentScoreLine;
  shots: number;
  wides: number;
  turnoversWon: number;
  turnoversWonHalf: QuickReviewTurnoverHalfSplit;
  turnoversLost: number;
  turnoversLostHalf: QuickReviewTurnoverHalfSplit;
  /** This side's own restarts: retained / taken. */
  ownKORetained: QuickReviewKickoutRetention;
  /** The other side's restarts: retained / taken. */
  oppKORetained: QuickReviewKickoutRetention;
};

export type QuickReviewSegmentEntry = {
  segment: 1 | 2 | 3;
  label: QuickReviewSegmentLabel;
  home: QuickReviewSegmentSideStats;
  away: QuickReviewSegmentSideStats;
};

export type QuickReviewSegmentBreakdown = {
  homeTeam: string;
  awayTeam: string;
  /** Exactly the three first-half segments — Early, Mid, Late. */
  segments: readonly [QuickReviewSegmentEntry, QuickReviewSegmentEntry, QuickReviewSegmentEntry];
};

// ─── Event kind sets ─────────────────────────────────────────────────────────
//
// Matches reviewPdfExport.ts's makeSegmentsPage()/segStats() shot definition
// verbatim (all attempt kinds, including frees) — reusing the established
// convention rather than inventing a new one. "Wides" is WIDE alone, matching
// the same source.

const SHOT_ATTEMPT_KINDS = new Set<LoggedMatchEvent["kind"]>([
  "SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER", "FORTY_FIVE_TWO_POINT",
  "FREE_MISSED", "FREE_SCORED",
]);

function otherSide(side: "FOR" | "OPP"): "FOR" | "OPP" {
  return side === "FOR" ? "OPP" : "FOR";
}

function countKind(events: readonly LoggedMatchEvent[], kinds: ReadonlySet<LoggedMatchEvent["kind"]>): number {
  let n = 0;
  for (const e of events) if (kinds.has(e.kind)) n++;
  return n;
}

// ─── Turnover territory (orientation-safe) ──────────────────────────────────
//
// Uses zone-orientation.ts's rotation primitive ONLY — never the 9-zone/
// thirds grid (that grid answers a different question, Defensive/Middle/
// Attacking; Page 3 needs a plain two-way own/opposition-half split) and
// never src/tactical/classify-event-zone.ts's naive x-mirror, which does not
// account for firstHalfAttackingDirection and was the source of a previously
// fixed orientation bug (see the Page 3 audit).
//
// perspective="REPORT" classifies using the home/FOR team's own attacking
// direction; perspective="OPP" classifies using the opposition's own
// attacking direction — required so the away team's "Own Half" genuinely
// means their own half, not home's. See zone-orientation.ts's own header
// comment for why teamSide is not the input that decides this.

function classifyHalf(
  event: LoggedMatchEvent,
  firstHalfAttackingDirection: AttackingDirection,
  perspective: ZoneLabelPerspective,
): "OWN" | "OPPOSITION" {
  const rotated = toTeamRelativeZoneEvent(event, firstHalfAttackingDirection, perspective);
  return rotated.nx < 0.5 ? "OWN" : "OPPOSITION";
}

function turnoverHalfSplit(
  events: readonly LoggedMatchEvent[],
  firstHalfAttackingDirection: AttackingDirection,
  perspective: ZoneLabelPerspective,
): QuickReviewTurnoverHalfSplit {
  let ownHalf = 0;
  let oppositionHalf = 0;
  for (const event of events) {
    if (classifyHalf(event, firstHalfAttackingDirection, perspective) === "OWN") ownHalf++;
    else oppositionHalf++;
  }
  return { ownHalf, oppositionHalf };
}

// ─── Kickout retention (retained / taken) ───────────────────────────────────
//
// "Who took this restart" always goes through resolveRestartOwner()
// (restartMetrics.ts), never a raw teamSide read — restartMetrics.ts
// documents a known legacy fallback disagreement between engines for
// pre-V1.2 data, and resolveRestartOwner() is the corrected canonical
// source (see the Page 3 audit).
//
// "Who won this restart" is derived the same way segStats()
// (reviewPdfExport.ts) and possession-outcomes-engine.ts's actingSideFor()
// already do it: KICKOUT_WON's teamSide is the winner; KICKOUT_CONCEDED's
// teamSide is the loser, so the winner is the other side. This is the
// already-corrected mirrored convention, not a reinterpretation of it.

const KICKOUT_KINDS = new Set<LoggedMatchEvent["kind"]>(["KICKOUT_WON", "KICKOUT_CONCEDED"]);

function kickoutWinningSide(event: LoggedMatchEvent): "FOR" | "OPP" {
  return event.kind === "KICKOUT_WON" ? event.teamSide : otherSide(event.teamSide);
}

function formatRetention(retained: number, taken: number): QuickReviewKickoutRetention {
  if (taken === 0) return { retained, taken, text: "—" };
  const pct = Math.round((retained / taken) * 100);
  return { retained, taken, text: `${retained}/${taken} (${pct}%)` };
}

function kickoutRetention(segmentEvents: readonly LoggedMatchEvent[], side: "FOR" | "OPP"): QuickReviewKickoutRetention {
  const taken = segmentEvents.filter((e) => KICKOUT_KINDS.has(e.kind) && resolveRestartOwner(e) === side);
  const retained = taken.filter((e) => kickoutWinningSide(e) === side).length;
  return formatRetention(retained, taken.length);
}

// ─── Per-side, per-segment assembly ─────────────────────────────────────────

function buildSideStats(
  segmentEvents: readonly LoggedMatchEvent[],
  side: "FOR" | "OPP",
  firstHalfAttackingDirection: AttackingDirection,
  perspective: ZoneLabelPerspective,
): QuickReviewSegmentSideStats {
  const other = otherSide(side);
  const own = segmentEvents.filter((e) => e.teamSide === side);
  const opp = segmentEvents.filter((e) => e.teamSide === other);

  const scoreSide = computeScoreSide(segmentEvents, side);

  // Canonical mirrored semantics (per the Page 3 brief): a physical turnover
  // is logged once; which raw kind/teamSide combination represents "this
  // side won/lost it" depends on who recorded it, so both contributing
  // subsets are combined exactly as reviewPdfExport.ts's segStats() and
  // possession-outcomes-engine.ts's actingSideFor() already do.
  const turnoversWonEvents = [
    ...own.filter((e) => e.kind === "TURNOVER_WON"),
    ...opp.filter((e) => e.kind === "TURNOVER_LOST"),
  ];
  const turnoversLostEvents = [
    ...own.filter((e) => e.kind === "TURNOVER_LOST"),
    ...opp.filter((e) => e.kind === "TURNOVER_WON"),
  ];

  return {
    score: {
      goals: scoreSide.goals,
      points: scoreSide.points,
      total: scoreSide.total,
      text: fmtGP(scoreSide.goals, scoreSide.points),
    },
    shots: countKind(own, SHOT_ATTEMPT_KINDS),
    wides: countKind(own, new Set(["WIDE"] as const)),
    turnoversWon: turnoversWonEvents.length,
    turnoversWonHalf: turnoverHalfSplit(turnoversWonEvents, firstHalfAttackingDirection, perspective),
    turnoversLost: turnoversLostEvents.length,
    turnoversLostHalf: turnoverHalfSplit(turnoversLostEvents, firstHalfAttackingDirection, perspective),
    ownKORetained: kickoutRetention(segmentEvents, side),
    oppKORetained: kickoutRetention(segmentEvents, other),
  };
}

// ─── Public entry point ──────────────────────────────────────────────────────

const SEGMENT_DEFS: readonly { segment: 1 | 2 | 3; label: QuickReviewSegmentLabel }[] = [
  { segment: 1, label: "EARLY" },
  { segment: 2, label: "MID" },
  { segment: 3, label: "LATE" },
];

/**
 * Builds Page 3's complete, display-ready model.
 *
 * `firstHalfAttackingDirection` must be the match's real recorded first-half
 * attacking direction (e.g. `session.attackDirection === "left" ? "LEFT" : "RIGHT"`,
 * the same normalisation ProTaggerLiveScreen.tsx already applies elsewhere) —
 * never guessed, never independently re-derived.
 */
export function buildQuickReviewSegmentBreakdown(
  events: readonly LoggedMatchEvent[],
  homeTeam: string,
  awayTeam: string,
  firstHalfAttackingDirection: AttackingDirection,
): QuickReviewSegmentBreakdown {
  const firstHalfEvents = events.filter((e) => e.period === "1H");

  const segments = SEGMENT_DEFS.map(({ segment, label }) => {
    const segmentEvents = firstHalfEvents.filter((e) => e.segment === segment);
    return {
      segment,
      label,
      home: buildSideStats(segmentEvents, "FOR", firstHalfAttackingDirection, "REPORT"),
      away: buildSideStats(segmentEvents, "OPP", firstHalfAttackingDirection, "OPP"),
    };
  }) as [QuickReviewSegmentEntry, QuickReviewSegmentEntry, QuickReviewSegmentEntry];

  return { homeTeam, awayTeam, segments };
}
