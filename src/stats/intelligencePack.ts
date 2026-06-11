/**
 * intelligencePack.ts
 *
 * Produces a PáircVision Intelligence Pack — three PNG coaching cards
 * generated in a single call from raw match data.
 *
 *   Card 1  Restart Outcomes       "What happened at restarts?"
 *   Card 2  Turnover & Free Outcomes "What did turnovers and frees produce?"
 *   Card 3  Match Intelligence      "Why did the match unfold that way?"
 *
 * Entry points:
 *   buildIntelligencePack(input)  → Promise<IntelligencePack>
 *   packToFiles(pack)             → File[]   (ordered, non-null cards only)
 *
 * Design:
 *   - Possession outcomes are computed once and shared by all three cards.
 *   - All three cards render in parallel (Promise.all).
 */

import type { ChainableEvent } from "./chains/chain-types";
import {
  buildPossessionOutcomeSummary,
  buildMatchIntelligence,
} from "./chains/possession-outcomes-engine";
import { buildRestartOutcomesCardPng } from "./restartOutcomesCard";
import { buildTurnoverFreeOutcomesCardPng } from "./turnoverFreeOutcomesCard";
import { buildMatchIntelligenceCardPng } from "./matchIntelligenceCard";

// ─── Public types ─────────────────────────────────────────────────────────────

export type IntelligencePackStage = "Half Time" | "Full Time";

export type IntelligencePackScore = {
  goals: number;
  points: number;
  /** Total in points (goals × 3 + points) */
  total: number;
};

export type IntelligencePackInput = {
  stageLabel: IntelligencePackStage;
  homeTeamName: string;
  awayTeamName: string;
  /** Venue name — kept for future use; not currently rendered on any card. */
  venueLabel: string;
  /** Match clock label e.g. "Half Time" or "90:00". */
  clockLabel: string;
  homeScore: IntelligencePackScore;
  awayScore: IntelligencePackScore;
  events: readonly ChainableEvent[];
};

/**
 * The three PNG coaching cards that make up one Intelligence Pack.
 *
 * Cards are File | null — null only if the browser canvas is unavailable.
 */
export type IntelligencePack = {
  stageLabel: IntelligencePackStage;
  /** Card 1 — "What happened at restarts?" */
  restartOutcomesCard: File | null;
  /** Card 2 — "What did turnovers and frees produce?" */
  turnoverFreeOutcomesCard: File | null;
  /** Card 3 — "Why did the match unfold that way?" */
  matchIntelligenceCard: File | null;
};

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function buildIntelligencePack(
  input: IntelligencePackInput,
): Promise<IntelligencePack> {
  const {
    stageLabel, homeTeamName, awayTeamName,
    homeScore, awayScore, events,
  } = input;

  const summary    = buildPossessionOutcomeSummary(events);
  const intelligence = buildMatchIntelligence(summary);

  const [restartOutcomesCard, turnoverFreeOutcomesCard, matchIntelligenceCard] =
    await Promise.all([
      buildRestartOutcomesCardPng({
        homeTeamName, awayTeamName, stageLabel, homeScore, awayScore, summary,
      }),
      buildTurnoverFreeOutcomesCardPng({
        homeTeamName, awayTeamName, stageLabel, summary,
      }),
      buildMatchIntelligenceCardPng({
        homeTeamName, awayTeamName, stageLabel, homeScore, awayScore,
        summary, intelligence,
      }),
    ]);

  return { stageLabel, restartOutcomesCard, turnoverFreeOutcomesCard, matchIntelligenceCard };
}

// ─── Convenience helper ───────────────────────────────────────────────────────

export function packToFiles(pack: IntelligencePack): File[] {
  return [
    pack.restartOutcomesCard,
    pack.turnoverFreeOutcomesCard,
    pack.matchIntelligenceCard,
  ].filter((f): f is File => f !== null);
}
