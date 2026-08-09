/**
 * reportProvenance.ts
 *
 * Formal provenance model for the Full Review's three-part structure.
 *
 * PART 1 — MATCH FACTS            allowed = match-fact
 * PART 2 — POSSESSION FACTS       allowed = match-fact | possession-fact
 * PART 3 — GAME ORIGIN / CHAIN    allowed = chain-origin | interpretive
 *
 * Every split/moved page in the Full Review builds a small typed "row" list
 * (label + provenance) before it touches a canvas. Tests assert on that row
 * list directly — a renderer cannot silently accept a chain-origin number
 * into a Part 1/2 page without a provenance-guard test failing, and it does
 * not depend on fragile full-PDF text scanning.
 *
 * Does not replace or duplicate MatchReport / scoreLedger / influence.ts —
 * this module only classifies and gates the numbers those already compute.
 */

export type ReportProvenance =
  | "match-fact"
  | "possession-fact"
  | "chain-origin"
  | "interpretive";

export type FullReviewPart = "MATCH_FACTS" | "POSSESSION_FACTS" | "GAME_ORIGIN";

export const PART_ALLOWED_PROVENANCE: Record<FullReviewPart, ReadonlySet<ReportProvenance>> = {
  MATCH_FACTS: new Set<ReportProvenance>(["match-fact"]),
  POSSESSION_FACTS: new Set<ReportProvenance>(["match-fact", "possession-fact"]),
  GAME_ORIGIN: new Set<ReportProvenance>(["chain-origin", "interpretive"]),
};

export function isProvenanceAllowedInPart(part: FullReviewPart, provenance: ReportProvenance): boolean {
  return PART_ALLOWED_PROVENANCE[part].has(provenance);
}

export type ProvenanceRow = { label: string; provenance: ReportProvenance };

/**
 * Throws listing every violation (not just the first) so a failing test
 * reports the full set of offending rows in one go.
 */
export function assertPartProvenance(part: FullReviewPart, rows: readonly ProvenanceRow[]): void {
  const violations = rows.filter((r) => !isProvenanceAllowedInPart(part, r.provenance));
  if (violations.length > 0) {
    const list = violations.map((v) => `"${v.label}" (${v.provenance})`).join(", ");
    throw new Error(`${part} contains disallowed provenance rows: ${list}`);
  }
}

/**
 * Field names a chain/origin/possession-attribution value would use if one
 * ever leaked into a Part 1 (Match Facts) or Part 2 (Possession Facts) page
 * model. Mirrors the pattern established by
 * SNAPSHOT_DASHBOARD_FORBIDDEN_KEYS (snapshotDashboardModel.ts) for the
 * frozen HT/FT Snapshot. Not exhaustive by construction — pair with
 * assertPartProvenance on the actual row provenance, not this list alone.
 */
export const MATCH_AND_POSSESSION_FACTS_FORBIDDEN_KEYS = [
  "originScore",
  "restartOriginScore",
  "turnoverOriginScore",
  "originScoreAgainst",
  "chainRate",
  "chainShare",
  "chainInvolvement",
  "chainInvolvementCount",
  "chainInvolvementPct",
  "assistsProxy",
  "punishmentRate",
  "wonToScore",
  "lostAllowedScore",
  "influenceIndex",
  "restartOrigin",
  "turnoverOrigin",
] as const;

/** Recursively scans a plain data object/array for forbidden key names. */
export function scanForForbiddenKeys(
  value: unknown,
  forbidden: readonly string[],
  path = "",
): string[] {
  const forbiddenSet = new Set(forbidden);
  const hits: string[] = [];
  function walk(v: unknown, p: string): void {
    if (v == null || typeof v !== "object") return;
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      const nextPath = p ? `${p}.${key}` : key;
      if (forbiddenSet.has(key)) hits.push(nextPath);
      walk(val, nextPath);
    }
  }
  walk(value, path);
  return hits;
}

/**
 * Part 3 language guard: an origin-derived row must never say "Direct" /
 * "Directly" — that word claims direct attribution for a value that is
 * actually chain/origin attribution (a different, non-interchangeable
 * measurement). See scoreLedger.ts's LEDGER_ROW_LABELS for the historical
 * example this guards against ("Direct scores attributed to restarts").
 */
const DIRECT_LANGUAGE_PATTERN = /\bdirect(ly)?\b/i;

export function containsDirectLanguage(text: string): boolean {
  return DIRECT_LANGUAGE_PATTERN.test(text);
}

/** Full Review page → part ownership, single source of truth for page-order
 *  and page-ownership regression tests. Kept in sync with exportReviewPdf's
 *  actual call sequence by reviewComposition.test.ts. */
export type FullReviewPageEntry = { title: string; part: FullReviewPart | "FRONT_MATTER" };
