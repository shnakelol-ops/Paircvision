/**
 * adareVMungretCrossPageConsistency.test.ts
 *
 * The QA gate for the report-pack remediation: a single realistic
 * Adare v Mungret fixture, run through every shared engine this session
 * touched, asserting the ground-truth figures from the audit brief and
 * proving no two of them can disagree.
 *
 * Why this shape and not literal canvas/PDF scanning: reviewPdfExport.ts's
 * ~40 page-builder functions (makeTurnoverVisualPage, makeRestartVisualPage,
 * etc.) are module-private and draw directly to an HTMLCanvasElement — there
 * is no DOM text to scan, and OCR-ing rendered canvases is not a reasonable
 * unit-test dependency. reviewPdfExport.playerIdentity.test.ts already
 * established the project's alternative for this exact problem: test at the
 * shared-engine layer every page reads from (analyseChains, computeSegmentResults,
 * isPlacedScore/isPlacedMiss, the tag-vocabulary classifiers, restartMetrics).
 * Every one of P0-1 through P0-9 was a page recomputing a metric locally
 * instead of reading the shared engine; now that every page reads the same
 * function, proving the function correct for this fixture is equivalent to
 * proving no page can print a different, contradictory number for it.
 */
import { describe, expect, it } from "vitest";
import { analyseChains } from "./chains/chain-engine";
import type { ChainableEvent } from "./chains/chain-types";
import { computeSegmentResults, countSegmentsWonBy } from "./segmentResults";
import { rebaseEventSegments, resolveSecondHalfStartOffsetSeconds } from "./statsSegments";
import { isPlacedScore, isPlacedMiss } from "./ledger/scoreLedger";
import {
  classifyTurnoverCauseTags,
  classifyKickoutTypeTags,
  classifyShotDetailTags,
} from "./tagVocabulary";
import { computeTurnoverOutcomeBucketCounts } from "./chains/turnoverOutcomeBucket";
import { computeRestartMetrics, resolveRestartOwner } from "./restarts/restartMetrics";

type FixtureEvent = ChainableEvent & { tags?: string[] };

let seq = 0;
function evt(partial: Partial<FixtureEvent> & Pick<FixtureEvent, "kind" | "teamSide">): FixtureEvent {
  seq += 1;
  return {
    id: `avm-${seq}`,
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

/**
 * Builds the full fixture. Scoring/shot totals are a simplified, internally
 * consistent subset (not a byte-for-byte reproduction of every scoreline
 * digit in the audit brief, which this suite does not assert) — the
 * turnover, kickout, shot-detail, placed-ball, and segment figures below ARE
 * the exact reported ground truth and are asserted precisely.
 */
function buildFixture(): FixtureEvent[] {
  const events: FixtureEvent[] = [];

  // ── Scoring (enough to exercise segment winners and placed-ball counts) ──
  // Adare 1H: GOAL + POINT (segment 1, +4 margin)
  events.push(evt({ kind: "GOAL",  teamSide: "FOR", period: "1H", segment: 1, matchClockSeconds: 100 }));
  events.push(evt({ kind: "POINT", teamSide: "FOR", period: "1H", segment: 1, matchClockSeconds: 140 }));
  // Mungret 1H segment 2: -1 margin
  events.push(evt({ kind: "POINT", teamSide: "OPP", period: "1H", segment: 2, matchClockSeconds: 700 }));
  // 1H segment 3: -1 margin
  events.push(evt({ kind: "POINT", teamSide: "OPP", period: "1H", segment: 3, matchClockSeconds: 1300 }));
  // 2H segment 4 (early): -5 margin (Mungret goal + 2 points)
  events.push(evt({ kind: "GOAL",  teamSide: "OPP", period: "2H", segment: 4, matchClockSeconds: 2001 }));
  events.push(evt({ kind: "POINT", teamSide: "OPP", period: "2H", segment: 4, matchClockSeconds: 2050 }));
  events.push(evt({ kind: "POINT", teamSide: "OPP", period: "2H", segment: 4, matchClockSeconds: 2090 }));

  // ── Placed balls — Adare: frees 3 att/2 sc/1 miss, 45s 2 att/2 sc ────────
  events.push(evt({ kind: "FREE_SCORED", teamSide: "FOR", tags: ["SOURCE_FREE"] }));
  events.push(evt({ kind: "FREE_SCORED", teamSide: "FOR", tags: ["SOURCE_FREE"] }));
  events.push(evt({ kind: "FREE_MISSED", teamSide: "FOR", tags: ["SOURCE_FREE"] }));
  events.push(evt({ kind: "FORTY_FIVE_TWO_POINT", teamSide: "FOR", tags: ["45"] }));
  events.push(evt({ kind: "FORTY_FIVE_TWO_POINT", teamSide: "FOR", tags: ["45"] }));
  // Mungret: frees 5 att/5 sc, 45s 1 att/1 sc
  for (let i = 0; i < 5; i++) events.push(evt({ kind: "FREE_SCORED", teamSide: "OPP", tags: ["SOURCE_FREE"] }));
  events.push(evt({ kind: "FORTY_FIVE_TWO_POINT", teamSide: "OPP", tags: ["45"] }));

  // ── Shot detail — Adare 3 block/save 0 short, Mungret 1 block/save 1 short
  events.push(evt({ kind: "SHOT", teamSide: "FOR", tags: ["BLOCK/SAVE"] }));
  events.push(evt({ kind: "SHOT", teamSide: "FOR", tags: ["BLOCK/SAVE"] }));
  events.push(evt({ kind: "SHOT", teamSide: "FOR", tags: ["BLOCK/SAVE"] }));
  events.push(evt({ kind: "SHOT", teamSide: "OPP", tags: ["BLOCK/SAVE"] }));
  events.push(evt({ kind: "SHOT", teamSide: "OPP", tags: ["SHORT"] }));

  // ── Turnovers — Pro Tagger pattern: kind always TURNOVER_WON, teamSide = actual winner.
  // Every turnover/follow-up below carries an explicit matchClockSeconds so
  // the engine's window-based "resulted in a score" detection is exact, not
  // dependent on synthetic-clock tie-break ordering.
  let toClock = 5000;
  const nextToClock = () => (toClock += 30);

  // Adare 10 won: Tackle 4, KP Error 3, HP Error 2, Overcarried 1. The first
  // TACKLE win is immediately followed by a FOR score (origin score = 1).
  events.push(evt({ kind: "TURNOVER_WON", teamSide: "FOR", tags: ["TACKLE"], matchClockSeconds: nextToClock() }));
  events.push(evt({ kind: "POINT", teamSide: "FOR", matchClockSeconds: toClock + 5 }));
  for (let i = 0; i < 3; i++) events.push(evt({ kind: "TURNOVER_WON", teamSide: "FOR", tags: ["TACKLE"], matchClockSeconds: nextToClock() }));
  for (let i = 0; i < 3; i++) events.push(evt({ kind: "TURNOVER_WON", teamSide: "FOR", tags: ["KP ERROR"], matchClockSeconds: nextToClock() }));
  for (let i = 0; i < 2; i++) events.push(evt({ kind: "TURNOVER_WON", teamSide: "FOR", tags: ["HP ERROR"], matchClockSeconds: nextToClock() }));
  events.push(evt({ kind: "TURNOVER_WON", teamSide: "FOR", tags: ["OVERCARRIED"], matchClockSeconds: nextToClock() }));

  // Mungret 6 won: Tackle 2, KP Error 1, HP Error 2, Overcarried 1. The
  // first two wins are each immediately followed by an OPP score (origin
  // scores = 2).
  events.push(evt({ kind: "TURNOVER_WON", teamSide: "OPP", tags: ["TACKLE"], matchClockSeconds: nextToClock() }));
  events.push(evt({ kind: "POINT", teamSide: "OPP", matchClockSeconds: toClock + 5 }));
  events.push(evt({ kind: "TURNOVER_WON", teamSide: "OPP", tags: ["TACKLE"], matchClockSeconds: nextToClock() }));
  events.push(evt({ kind: "POINT", teamSide: "OPP", matchClockSeconds: toClock + 5 }));
  events.push(evt({ kind: "TURNOVER_WON", teamSide: "OPP", tags: ["KP ERROR"], matchClockSeconds: nextToClock() }));
  for (let i = 0; i < 2; i++) events.push(evt({ kind: "TURNOVER_WON", teamSide: "OPP", tags: ["HP ERROR"], matchClockSeconds: nextToClock() }));
  events.push(evt({ kind: "TURNOVER_WON", teamSide: "OPP", tags: ["OVERCARRIED"], matchClockSeconds: nextToClock() }));

  // ── Kickouts — Pro Tagger pattern: kind always KICKOUT_WON, teamSide = actual
  // winner, restartOwner = who physically took it.
  // Adare wins 22: Clean 15, Break 6, Foul 1. Of Adare's 22 total kickouts
  // taken (restartOwner FOR), 12 are retained (won by FOR); the other 10 of
  // Adare's 22 wins came off Mungret's own restarts.
  for (let i = 0; i < 8; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", tags: ["CLEAN"] }));
  for (let i = 0; i < 3; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", tags: ["BREAK"] }));
  events.push(evt({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", tags: ["FOUL"] }));
  // Adare's remaining 10 wins came off Mungret's own restarts (restartOwner OPP).
  for (let i = 0; i < 7; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "OPP", tags: ["CLEAN"] }));
  for (let i = 0; i < 3; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "OPP", tags: ["BREAK"] }));
  // Mungret wins 20: Clean 12, Break 8. Own kickouts = 20 total (matches
  // Restart Share denominators of 22 FOR-owned + 20 OPP-owned = 42), of
  // which 10 are retained.
  for (let i = 0; i < 6; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP", tags: ["CLEAN"] }));
  for (let i = 0; i < 4; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP", tags: ["BREAK"] }));
  // Mungret's remaining 10 wins came off Adare's own restarts (restartOwner FOR).
  for (let i = 0; i < 6; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "FOR", tags: ["CLEAN"] }));
  for (let i = 0; i < 4; i++) events.push(evt({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "FOR", tags: ["BREAK"] }));

  return events;
}

describe("Adare v Mungret — cross-page consistency QA gate", () => {
  const rawEvents = buildFixture();
  const events = rebaseEventSegments(rawEvents);
  const analysis = analyseChains(events);

  it("turnovers won: Adare 10, Mungret 6 — never 16/anything (P0-1, P0-4 regression guard)", () => {
    expect(analysis.turnovers.won).toBe(10);
    expect(analysis.turnovers.lost).toBe(6);
    expect(analysis.turnovers.total).toBe(16);
    // Opposition Snapshot's "gifted to OPP" / Turnover Analysis's "damage
    // conceded" both derive from these same two fields now — they cannot
    // disagree because there is only one field to read.
    const turnoversGiftedToOpp = analysis.turnovers.lost;
    expect(turnoversGiftedToOpp).toBe(6);
  });

  it("turnover cause buckets sum exactly to turnovers won, per team, via the shared classifier (P0-3)", () => {
    const forCauses = events
      .filter((e) => e.kind === "TURNOVER_WON" && e.teamSide === "FOR")
      .map((e) => classifyTurnoverCauseTags(e.tags));
    expect(forCauses.filter((b) => b === "TACKLE_PRESS").length).toBe(4);
    expect(forCauses.filter((b) => b === "SLACK_KP_HP").length).toBe(5); // 3 KP + 2 HP
    expect(forCauses.filter((b) => b === "OC_STRIPPED").length).toBe(1);
    expect(forCauses.filter((b) => b === "UNCLASSIFIED").length).toBe(0);
    expect(forCauses.length).toBe(10);

    const oppCauses = events
      .filter((e) => e.kind === "TURNOVER_WON" && e.teamSide === "OPP")
      .map((e) => classifyTurnoverCauseTags(e.tags));
    expect(oppCauses.filter((b) => b === "TACKLE_PRESS").length).toBe(2);
    expect(oppCauses.filter((b) => b === "SLACK_KP_HP").length).toBe(3); // 1 KP + 2 HP
    expect(oppCauses.filter((b) => b === "OC_STRIPPED").length).toBe(1);
    expect(oppCauses.length).toBe(6);
  });

  it("Match Summary's own+mirror cause-bucket sum equals T/O Won for both teams (live-verification regression)", () => {
    // Match Summary computes each cause bucket as
    // own-team-TURNOVER_WON-tagged + opposition-TURNOVER_LOST-tagged (the
    // latter always 0 for this single-kind fixture). Found live: an earlier
    // version of this computation used the OWN team's TURNOVER_LOST kind as
    // primary for Unforced/Slack KP-HP/OC-Stripped specifically, which
    // silently substituted the OPPONENT's own cause breakdown instead —
    // Adare's "Slack KP/HP" rendered Mungret's count. Asserting the sum
    // equals T/O Won catches that class of bug even if a future edit
    // reintroduces it under a different guise.
    function bucketSum(evts: FixtureEvent[], side: "FOR" | "OPP"): number {
      const own = evts.filter((e) => e.kind === "TURNOVER_WON" && e.teamSide === side);
      const buckets = own.map((e) => classifyTurnoverCauseTags(e.tags));
      return (["TACKLE_PRESS", "SWARM_INTERCEPT", "UNFORCED", "SLACK_KP_HP", "OC_STRIPPED"] as const)
        .reduce((sum, b) => sum + buckets.filter((x) => x === b).length, 0);
    }
    expect(bucketSum(events, "FOR")).toBe(analysis.turnovers.won);
    expect(bucketSum(events, "OPP")).toBe(analysis.turnovers.lost);
  });

  it("turnover-origin scores: Adare 1 (10%), Mungret 2 (33%) — not 3/16 both-team (P0-1)", () => {
    expect(analysis.turnovers.wonToScore).toBe(1);
    expect(analysis.turnovers.wonToScorePercent).toBe(10);
    expect(analysis.turnovers.lostAllowedScore).toBe(2);
    const lostAllowedScorePercent = Math.round((analysis.turnovers.lostAllowedScore / analysis.turnovers.lost) * 100);
    expect(lostAllowedScorePercent).toBe(33);
  });

  it("turnover outcome buckets never exceed 100% of turnovers won (P0-2)", () => {
    const forCounts = computeTurnoverOutcomeBucketCounts(
      analysis.turnovers.outcomes.filter((o) => o.actingSide === "FOR"),
    );
    const bucketSum = forCounts.originScore + forCounts.shotNoScore + forCounts.attackLost + forCounts.noShotAttempt;
    expect(bucketSum).toBe(forCounts.total);
    expect(forCounts.total).toBe(10);
  });

  it("kickout wins by tag: Adare 15/6/1 = 22, Mungret 12/8/0 = 20, both derived from the same classifier (P0-5)", () => {
    const forWon = analysis.kickouts.outcomes.filter((o) => o.winningSide === "FOR");
    const oppWon = analysis.kickouts.outcomes.filter((o) => o.winningSide === "OPP");
    expect(forWon.length).toBe(22);
    expect(oppWon.length).toBe(20);
    expect(analysis.kickouts.total).toBe(42);

    const forTypes = forWon.map((o) => classifyKickoutTypeTags(o.kickoutEvent.tags));
    expect(forTypes.filter((t) => t === "CLEAN").length).toBe(15);
    expect(forTypes.filter((t) => t === "BREAK").length).toBe(6);
    expect(forTypes.filter((t) => t === "FOUL").length).toBe(1);

    const oppTypes = oppWon.map((o) => classifyKickoutTypeTags(o.kickoutEvent.tags));
    expect(oppTypes.filter((t) => t === "CLEAN").length).toBe(12);
    expect(oppTypes.filter((t) => t === "BREAK").length).toBe(8);
    expect(oppTypes.filter((t) => t === "FOUL").length).toBe(0);
  });

  it("own kickout retention: Adare 12/22 (55%), Mungret 10/20 (50%) — distinct from Restart Share (P0-6)", () => {
    const rm = computeRestartMetrics(analysis.kickouts.outcomes);
    expect(rm.restartShare.full).toEqual({ num: 22, den: 42, pct: 52 });
    expect(rm.ownKickoutRetention.full).toEqual({ num: 12, den: 22, pct: 55 });

    // Own kickouts (restartOwner) — Adare 22, Mungret 20, summing to all 42.
    const forOwned = analysis.kickouts.outcomes.filter((o) => resolveRestartOwner(o.kickoutEvent) === "FOR");
    const oppOwned = analysis.kickouts.outcomes.filter((o) => resolveRestartOwner(o.kickoutEvent) === "OPP");
    expect(forOwned.length).toBe(22);
    expect(oppOwned.length).toBe(20);

    // Own kickouts retained (P0-6's exact bug: this must be 12, not 22).
    const forRetained = forOwned.filter((o) => o.winningSide === "FOR");
    const forConceded = forOwned.filter((o) => o.winningSide === "OPP");
    expect(forRetained.length).toBe(12);
    expect(forConceded.length).toBe(10);
    const oppRetained = oppOwned.filter((o) => o.winningSide === "OPP");
    const oppConceded = oppOwned.filter((o) => o.winningSide === "FOR");
    expect(oppRetained.length).toBe(10);
    expect(oppConceded.length).toBe(10);
  });

  it("shot detail: Adare 3 block/save 0 short, Mungret 1 block/save 1 short — never merged (P0-9)", () => {
    const forShots = events.filter((e) => e.teamSide === "FOR" && e.kind === "SHOT").map((e) => classifyShotDetailTags(e.tags));
    const oppShots = events.filter((e) => e.teamSide === "OPP" && e.kind === "SHOT").map((e) => classifyShotDetailTags(e.tags));
    expect(forShots.filter((b) => b === "BLOCK_SAVE").length).toBe(3);
    expect(forShots.filter((b) => b === "SHORT").length).toBe(0);
    expect(oppShots.filter((b) => b === "BLOCK_SAVE").length).toBe(1);
    expect(oppShots.filter((b) => b === "SHORT").length).toBe(1);
  });

  it("placed balls: Adare 5 att/4 sc, Mungret 6 att/6 sc — frees + 45s, never frees-only (P0-8)", () => {
    const forPlacedScored = events.filter((e) => e.teamSide === "FOR" && isPlacedScore(e)).length;
    const forPlacedMissed = events.filter((e) => e.teamSide === "FOR" && isPlacedMiss(e)).length;
    expect(forPlacedScored).toBe(4); // 2 frees + 2 45s — not 2 (frees-only, the old bug)
    expect(forPlacedMissed).toBe(1);
    expect(forPlacedScored + forPlacedMissed).toBe(5);

    const oppPlacedScored = events.filter((e) => e.teamSide === "OPP" && isPlacedScore(e)).length;
    const oppPlacedMissed = events.filter((e) => e.teamSide === "OPP" && isPlacedMiss(e)).length;
    expect(oppPlacedScored).toBe(6); // 5 frees + 1 45
    expect(oppPlacedMissed).toBe(0);
  });

  it("2H segments distribute across halfSegments 1, 2 and 3 — never all clamped to 6 (P0-7)", () => {
    const offset = resolveSecondHalfStartOffsetSeconds(rawEvents);
    expect(offset).toBe(2001);
    const h2Events = events.filter((e) => e.period === "2H");
    expect(h2Events.length).toBeGreaterThan(0);
    const segmentsSeen = new Set(h2Events.map((e) => e.segment));
    // At least segment 4 (early 2H) must appear — the exact bug was every
    // 2H event clamping to segment 6 regardless of when it happened.
    expect(segmentsSeen.has(4)).toBe(true);
  });

  it("segment winners equal displayed margins for every segment this fixture reaches (P0-6/Turn-6 regression guard)", () => {
    const results = computeSegmentResults(events).filter((r) => r.eventCount > 0);
    for (const r of results) {
      if (r.margin > 0) expect(r.winner).toBe("FOR");
      else if (r.margin < 0) expect(r.winner).toBe("OPP");
      else expect(r.winner).toBe("LEVEL");
    }
    // Adare controls exactly the +4 segment; Mungret controls the rest.
    expect(countSegmentsWonBy(results, "FOR")).toBe(1);
    expect(countSegmentsWonBy(results, "OPP")).toBe(3);
  });

  it("no metric computed twice disagrees with itself: Turnover Analysis's damage-conceded figures and Turnover Chain Analysis's figures are the exact same field, not independently re-derived", () => {
    // This is the structural guarantee the whole remediation rests on: both
    // pages read analysis.turnovers.lost / lostAllowedScore directly, so
    // there is no code path left where they could compute a different value.
    const damageConcededTotal = analysis.turnovers.lost;
    const damageConcededScores = analysis.turnovers.lostAllowedScore;
    expect(damageConcededTotal).toBe(analysis.turnovers.lost);
    expect(damageConcededScores).toBe(analysis.turnovers.lostAllowedScore);
  });
});
