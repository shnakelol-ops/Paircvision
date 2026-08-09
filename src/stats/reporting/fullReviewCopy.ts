/**
 * fullReviewCopy.ts
 *
 * Shared coach-facing copy for the Full Review's three-part structure.
 * Centralised so the explanation text is identical everywhere it appears
 * (chapter divider + Scoring Possession Origins page) and easy to audit.
 */

/**
 * Printed before any origin-derived scoring table in Part 3. Explains that
 * Game Origin Analysis answers a different question than the direct
 * Scoring Breakdown (Part 1) — a score can legitimately appear on both
 * pages without the two figures disagreeing.
 */
export const GAME_ORIGIN_EXPLANATION =
  "Game Origin Analysis looks at where a scoring possession began, not how the final score was recorded. " +
  "A point scored from a free may also count here as a restart-origin score, if the possession it came from " +
  "started at a kickout — the two figures are answering different questions, not disagreeing with each other. " +
  "Use Scoring Breakdown (Part 1) for what was scored, and Game Origin Analysis (Part 3) for where the pressure " +
  "that led to it began.";

export const PART_TITLES = {
  MATCH_FACTS: "MATCH FACTS",
  POSSESSION_FACTS: "POSSESSION FACTS",
  GAME_ORIGIN: "GAME ORIGIN / CHAIN ANALYSIS",
} as const;

export const PART_QUESTIONS = {
  MATCH_FACTS: "What happened?",
  POSSESSION_FACTS: "What did we win/lose and where?",
  GAME_ORIGIN: "What happened after those possessions began?",
} as const;
