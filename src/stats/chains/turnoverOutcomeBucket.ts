/**
 * turnoverOutcomeBucket.ts
 *
 * Single source of truth for "what happened to this turnover" as a set of
 * mutually exclusive, exhaustive terminal buckets. Before this module,
 * reviewPdfExport.ts's Turnover Chain Analysis page computed "no shot
 * attempt" (forWonTotal - forWonToShotAny) and "attack immediately lost"
 * (whether the very next event was itself a turnover) as two independent
 * dimensions rather than one classification — an outcome could be counted
 * in both, so the four displayed rows could sum to more than the total
 * turnovers won (e.g. 12 outcomes reported from 10 turnovers).
 *
 * classifyTurnoverOutcomeBucket resolves each outcome to exactly one bucket
 * via fixed-order early return, so summing the four buckets always equals
 * the outcome count exactly.
 */
import type { ChainableEvent, TurnoverOutcome } from "./chain-types";

export type TurnoverOutcomeBucket =
  | "ORIGIN_SCORE"
  | "SHOT_NO_SCORE"
  | "ATTACK_LOST"
  | "NO_SHOT_ATTEMPT";

function nextEventIsTurnover<TEvent extends ChainableEvent>(o: TurnoverOutcome<TEvent>): boolean {
  return o.nextEvent !== null && (o.nextEvent.kind === "TURNOVER_WON" || o.nextEvent.kind === "TURNOVER_LOST");
}

/**
 * Classifies a single turnover outcome into exactly one terminal bucket,
 * checked in this fixed priority order:
 *   1. origin score   — the possession that began with this turnover scored
 *   2. shot, no score — produced a shot attempt but no score
 *   3. attack lost     — no shot, and the very next event was another turnover
 *   4. no shot attempt — no shot, and the attack didn't immediately turn over
 */
export function classifyTurnoverOutcomeBucket<TEvent extends ChainableEvent>(
  o: TurnoverOutcome<TEvent>,
): TurnoverOutcomeBucket {
  if (o.resultedInScore) return "ORIGIN_SCORE";
  if (o.resultedInShot) return "SHOT_NO_SCORE";
  if (nextEventIsTurnover(o)) return "ATTACK_LOST";
  return "NO_SHOT_ATTEMPT";
}

export type TurnoverOutcomeBucketCounts = {
  originScore: number;
  shotNoScore: number;
  attackLost: number;
  noShotAttempt: number;
  total: number;
};

/** Counts a set of outcomes into the four mutually-exclusive buckets above. Always sums to outcomes.length. */
export function computeTurnoverOutcomeBucketCounts<TEvent extends ChainableEvent>(
  outcomes: readonly TurnoverOutcome<TEvent>[],
): TurnoverOutcomeBucketCounts {
  let originScore = 0;
  let shotNoScore = 0;
  let attackLost = 0;
  let noShotAttempt = 0;
  for (const o of outcomes) {
    switch (classifyTurnoverOutcomeBucket(o)) {
      case "ORIGIN_SCORE":   originScore++; break;
      case "SHOT_NO_SCORE":  shotNoScore++; break;
      case "ATTACK_LOST":    attackLost++; break;
      case "NO_SHOT_ATTEMPT": noShotAttempt++; break;
    }
  }
  return { originScore, shotNoScore, attackLost, noShotAttempt, total: outcomes.length };
}
