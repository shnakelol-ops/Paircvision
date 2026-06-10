/**
 * intelligencePack.ts
 *
 * Produces a PáircVision Intelligence Pack — three PNG coaching cards
 * generated in a single call from raw match data.
 *
 *   Card 1  Match Summary         "What happened?"
 *   Card 2  Possession Outcomes   "What became of every possession?"
 *   Card 3  Match Intelligence    "Why did the match unfold that way?"
 *
 * Entry points:
 *   buildIntelligencePack(input)  → Promise<IntelligencePack>
 *   packToFiles(pack)             → File[]   (ordered, non-null cards only)
 *
 * Design:
 *   - Possession outcomes are computed once and shared by Cards 2 and 3.
 *   - All three cards render in parallel (Promise.all).
 *   - No existing file is modified; all imports are additive.
 *   - ChainableEvent[] is the single event input; it is adapted internally
 *     for the Card 1 renderer which expects LoggedEventLike-shaped events.
 */

import type { ChainableEvent } from "./chains/chain-types";
import {
  buildPossessionOutcomeSummary,
  buildMatchIntelligence,
} from "./chains/possession-outcomes-engine";
import { buildPossessionOutcomesCardPng } from "./possessionOutcomesCard";
import { buildMatchIntelligenceCardPng } from "./matchIntelligenceCard";
import { buildStatsShareCardPng } from "./statsShareCard";

// ─── Public types ─────────────────────────────────────────────────────────────

export type IntelligencePackStage = "Half Time" | "Full Time";

export type IntelligencePackScore = {
  goals: number;
  points: number;
  /** Total in points (goals × 3 + points) */
  total: number;
};

/**
 * Everything needed to produce a full three-card Intelligence Pack.
 *
 * `events` must structurally satisfy ChainableEvent (id, kind, teamSide,
 * period, segment, nx, ny). In practice, LoggedMatchEvent[] and
 * PdfExportEvent[] both satisfy this requirement.
 */
export type IntelligencePackInput = {
  stageLabel: IntelligencePackStage;
  homeTeamName: string;
  awayTeamName: string;
  /** Venue name shown on Card 1 (Match Summary). */
  venueLabel: string;
  /** Match clock label shown on Card 1, e.g. "Half Time" or "90:00". */
  clockLabel: string;
  homeScore: IntelligencePackScore;
  awayScore: IntelligencePackScore;
  events: readonly ChainableEvent[];
};

/**
 * The three PNG coaching cards that make up one Intelligence Pack.
 *
 * Cards are File | null — null only if the browser canvas is unavailable
 * (e.g. headless rendering context). In normal browser use all three will
 * be non-null.
 *
 * Intended reading order: matchSummaryCard → possessionOutcomesCard → matchIntelligenceCard.
 */
export type IntelligencePack = {
  stageLabel: IntelligencePackStage;
  /** Card 1 — "What happened?" */
  matchSummaryCard: File | null;
  /** Card 2 — "What became of every possession?" */
  possessionOutcomesCard: File | null;
  /** Card 3 — "Why did the match unfold that way?" */
  matchIntelligenceCard: File | null;
};

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * buildIntelligencePack
 *
 * One call. Three coaching cards.
 *
 * Computes possession outcomes once and shares the result across Cards 2
 * and 3. All three cards are rendered in parallel for performance.
 *
 * @example
 *   const pack = await buildIntelligencePack({
 *     stageLabel:    "Half Time",
 *     homeTeamName:  "Ballyhale",
 *     awayTeamName:  "Kilmacud",
 *     venueLabel:    "Nowlan Park",
 *     clockLabel:    "Half Time",
 *     homeScore:     { goals: 1, points: 8, total: 11 },
 *     awayScore:     { goals: 0, points: 9, total: 9 },
 *     events:        loggedEvents,
 *   });
 *   const files = packToFiles(pack);  // [File, File, File]
 */
export async function buildIntelligencePack(
  input: IntelligencePackInput,
): Promise<IntelligencePack> {
  const {
    stageLabel, homeTeamName, awayTeamName,
    venueLabel, clockLabel, homeScore, awayScore, events,
  } = input;

  // Compute possession outcomes once — consumed by both Cards 2 and 3.
  const summary    = buildPossessionOutcomeSummary(events);
  const intelligence = buildMatchIntelligence(summary);

  // Adapt ChainableEvent[] → shape accepted by buildStatsShareCardPng.
  // The only structural incompatibility is tags: (string[] | null) vs
  // (readonly string[] | undefined) — resolved by coercing null → undefined.
  const summaryEvents = events.map((e) => ({
    id:       e.id,
    kind:     e.kind as string,
    teamSide: e.teamSide as string,
    tags:     e.tags ?? undefined,
  }));

  // Render all three cards in parallel.
  const [matchSummaryCard, possessionOutcomesCard, matchIntelligenceCard] =
    await Promise.all([
      buildStatsShareCardPng({
        stageLabel,
        homeTeamName,
        awayTeamName,
        venueLabel,
        clockLabel,
        homeScore,
        awayScore,
        eventCount: events.length,
        events:     summaryEvents,
      }),
      buildPossessionOutcomesCardPng({
        homeTeamName,
        awayTeamName,
        stageLabel,
        homeScore,
        awayScore,
        summary,
      }),
      buildMatchIntelligenceCardPng({
        homeTeamName,
        awayTeamName,
        stageLabel,
        homeScore,
        awayScore,
        summary,
        intelligence,
      }),
    ]);

  return { stageLabel, matchSummaryCard, possessionOutcomesCard, matchIntelligenceCard };
}

// ─── Convenience helper ───────────────────────────────────────────────────────

/**
 * packToFiles
 *
 * Extracts all non-null cards as an ordered File array.
 * Order: Match Summary → Possession Outcomes → Match Intelligence.
 *
 * Ready for multi-file download, Web Share API, or upload.
 *
 * @example
 *   // "Share Intelligence Pack" tap
 *   const files = packToFiles(pack);
 *   await navigator.share({ files, title: "PáircVision Intelligence Pack" });
 */
export function packToFiles(pack: IntelligencePack): File[] {
  return [
    pack.matchSummaryCard,
    pack.possessionOutcomesCard,
    pack.matchIntelligenceCard,
  ].filter((f): f is File => f !== null);
}
