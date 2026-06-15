import type { ChainableEvent, ChainAnalysis } from "./chain-types";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ChainPressureKind =
  | "DANGER_CHAIN"
  | "CHAIN_WEAPON"
  | "PRESSURE_PATTERN"
  | "WASTED_CHAIN";

export type ChainPressurePattern = {
  rank:          1 | 2 | 3;
  kind:          ChainPressureKind;
  badge:         string;
  headline:      string;
  observation:   string;
  primaryMetric: number;
  metricLabel:   string;
  occurrences:   number;
  priorityScore: number;
  side:          "FOR" | "OPP";
  zoneCol:       0 | 1 | 2 | null;
  zoneRow:       0 | 1 | 2 | null;
  arrowKind:     "TRAP" | "ENTRY_SCORE" | null;
};

// ─── Grid helpers (exported — used by PDF rendering code) ───────────────────

export function cpCol(nx: number): 0 | 1 | 2 {
  if (nx < 0.333) return 0;
  if (nx < 0.667) return 1;
  return 2;
}

export function cpRow(ny: number): 0 | 1 | 2 {
  if (ny < 0.333) return 0;
  if (ny < 0.667) return 1;
  return 2;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function cpRank(n: number): 1 | 2 | 3 {
  if (n === 0) return 1;
  if (n === 1) return 2;
  return 3;
}

function cpDominantZone(
  items: ReadonlyArray<{ nx: number; ny: number }>,
): { col: 0 | 1 | 2; row: 0 | 1 | 2 } | null {
  if (items.length === 0) return null;
  const tally = new Map<string, { col: 0 | 1 | 2; row: 0 | 1 | 2; n: number }>();
  for (const { nx, ny } of items) {
    const col = cpCol(nx);
    const row = cpRow(ny);
    const k = `${col},${row}`;
    const v = tally.get(k);
    if (v) v.n++; else tally.set(k, { col, row, n: 1 });
  }
  let best: { col: 0 | 1 | 2; row: 0 | 1 | 2; n: number } | null = null;
  for (const v of tally.values()) {
    if (!best || v.n > best.n) best = v;
  }
  return best ? { col: best.col, row: best.row } : null;
}

// ─── Qualification gate ─────────────────────────────────────────────────────

/**
 * FT mode: requires ≥1 direct score AND ≥2 occurrences.
 * HT mode: any one of three relaxed conditions qualifies.
 */
export function cpQualifies(
  scores: number,
  occurrences: number,
  shots: number,
  mode: "FT" | "HT",
): boolean {
  if (mode === "FT") return scores >= 1 && occurrences >= 2;
  if (scores >= 1) return true;
  if (occurrences >= 2 && occurrences > 0 && scores / occurrences >= 0.5) return true;
  if (occurrences >= 3 && shots >= 2) return true;
  return false;
}

// ─── Ranking function ───────────────────────────────────────────────────────

/**
 * Ranks possession chain patterns from a pre-computed ChainAnalysis.
 * Returns 0–3 ChainPressurePattern objects ordered by priority score.
 *
 * Pure function — no canvas, no side effects, no new chain computation.
 * Generic over TEvent so it works with any ChainableEvent subtype
 * (PdfExportEvent, LoggedMatchEvent, etc.).
 *
 * mode — "FT": standard thresholds for full-match datasets.
 *        "HT": relaxed qualification for smaller halftime event volumes.
 */
export function rankChainPatterns<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  mode: "FT" | "HT" = "FT",
): ChainPressurePattern[] {
  const ko = analysis.kickouts;
  const to = analysis.turnovers;

  type Candidate = Omit<ChainPressurePattern, "rank">;
  const candidates: Candidate[] = [];

  // ── 1. KICKOUT TRAP (DANGER_CHAIN) ─────────────────────────────────────────
  // OPP scored directly from kickouts we conceded.
  if (cpQualifies(ko.lostAllowedScore, ko.lost, 0, mode)) {
    const trapOutcomes = ko.outcomes.filter(
      (o) => o.winningSide === "OPP" && o.nextScore !== null,
    );
    const zone = cpDominantZone(
      trapOutcomes.map((o) => ({ nx: o.kickoutEvent.nx, ny: o.kickoutEvent.ny })),
    );
    candidates.push({
      kind:          "DANGER_CHAIN",
      badge:         "DANGER CHAIN",
      headline:      "Kickout Trap",
      observation:   `${ko.lostAllowedScore} of ${ko.lost} conceded kickouts led to opposition score`,
      primaryMetric: ko.lostAllowedScore,
      metricLabel:   "scores conceded",
      occurrences:   ko.lost,
      priorityScore: ko.lostAllowedScore * 5 + ko.lost * 2,
      side:          "OPP",
      zoneCol:       zone?.col ?? null,
      zoneRow:       zone?.row ?? null,
      arrowKind:     trapOutcomes.length >= 2 ? "TRAP" : null,
    });
  }

  // ── 2. KICKOUT PLATFORM (CHAIN_WEAPON) ─────────────────────────────────────
  // FOR scored directly from kickouts we won.
  if (cpQualifies(ko.wonToScore, ko.won, 0, mode)) {
    const weaponOutcomes = ko.outcomes.filter(
      (o) => o.winningSide === "FOR" && o.nextScore !== null,
    );
    const zone = cpDominantZone(
      weaponOutcomes.map((o) => ({ nx: o.kickoutEvent.nx, ny: o.kickoutEvent.ny })),
    );
    candidates.push({
      kind:          "CHAIN_WEAPON",
      badge:         "CHAIN WEAPON",
      headline:      "Kickout Platform",
      observation:   `${ko.wonToScore} of ${ko.won} kickout win${ko.won !== 1 ? "s" : ""} converted to score`,
      primaryMetric: ko.wonToScore,
      metricLabel:   "scores created",
      occurrences:   ko.won,
      priorityScore: ko.wonToScore * 5 + ko.won * 2,
      side:          "FOR",
      zoneCol:       zone?.col ?? null,
      zoneRow:       zone?.row ?? null,
      arrowKind:     "ENTRY_SCORE",
    });
  }

  // ── 3. TURNOVER DANGER (DANGER_CHAIN) ──────────────────────────────────────
  // OPP scored after winning possession from a FOR turnover.
  if (cpQualifies(to.lostAllowedScore, to.lost, 0, mode)) {
    const dangerOutcomes = to.outcomes.filter(
      (o) =>
        o.direction === "LOST" &&
        o.turnoverEvent.teamSide === "FOR" &&
        o.resultedInScore,
    );
    const zone = cpDominantZone(
      dangerOutcomes.map((o) => ({ nx: o.turnoverEvent.nx, ny: o.turnoverEvent.ny })),
    );
    candidates.push({
      kind:          "DANGER_CHAIN",
      badge:         "DANGER CHAIN",
      headline:      "Turnover Conceded",
      observation:   `${to.lostAllowedScore} possession loss${to.lostAllowedScore !== 1 ? "es" : ""} led directly to opposition score`,
      primaryMetric: to.lostAllowedScore,
      metricLabel:   "scores conceded",
      occurrences:   to.lost,
      priorityScore: to.lostAllowedScore * 5 + to.lost * 2,
      side:          "OPP",
      zoneCol:       zone?.col ?? null,
      zoneRow:       zone?.row ?? null,
      arrowKind:     null,
    });
  }

  // ── 4. TURNOVER WEAPON (CHAIN_WEAPON) ──────────────────────────────────────
  // FOR won possession from a turnover and scored.
  if (cpQualifies(to.wonToScore, to.won, to.wonToShot, mode)) {
    const weaponOutcomes = to.outcomes.filter(
      (o) =>
        o.direction === "WON" &&
        o.turnoverEvent.teamSide === "FOR" &&
        o.resultedInScore,
    );
    const zone = cpDominantZone(
      weaponOutcomes.map((o) => ({ nx: o.turnoverEvent.nx, ny: o.turnoverEvent.ny })),
    );
    candidates.push({
      kind:          "CHAIN_WEAPON",
      badge:         "CHAIN WEAPON",
      headline:      "Turnover Weapon",
      observation:   `${to.wonToScore} of ${to.won} possession win${to.won !== 1 ? "s" : ""} converted to score`,
      primaryMetric: to.wonToScore,
      metricLabel:   "scores created",
      occurrences:   to.won,
      priorityScore: to.wonToScore * 5 + to.won * 2 + to.wonToShot,
      side:          "FOR",
      zoneCol:       zone?.col ?? null,
      zoneRow:       zone?.row ?? null,
      arrowKind:     "ENTRY_SCORE",
    });
  }

  // ── 5. PRESSURE PATTERNS ────────────────────────────────────────────────────
  // High-frequency patterns without decisive conversion — only when no specific
  // chain for the same ball-source already qualifies above.
  {
    const hasKoPattern = candidates.some(
      (c) => c.headline === "Kickout Trap" || c.headline === "Kickout Platform",
    );
    const hasTvPattern = candidates.some(
      (c) => c.headline === "Turnover Conceded" || c.headline === "Turnover Weapon",
    );

    // HT: threshold lowered to 3 — smaller first-half dataset
    if (!hasKoPattern && ko.total >= (mode === "HT" ? 3 : 4)) {
      candidates.push({
        kind:          "PRESSURE_PATTERN",
        badge:         "PRESSURE PATTERN",
        headline:      "Kickout Battle",
        observation:   `${ko.total} contested restarts — ${ko.wonToScore} converted, ${ko.lostAllowedScore} conceded to score`,
        primaryMetric: ko.total,
        metricLabel:   "contested kickouts",
        occurrences:   ko.total,
        priorityScore: ko.total * 2,
        side:          ko.won >= ko.lost ? "FOR" : "OPP",
        zoneCol:       null,
        zoneRow:       null,
        arrowKind:     null,
      });
    }

    // HT: lower win threshold to 2 — half a match produces fewer events
    if (!hasTvPattern && to.won >= (mode === "HT" ? 2 : 3) && to.wonToShot >= 2) {
      candidates.push({
        kind:          "PRESSURE_PATTERN",
        badge:         "PRESSURE PATTERN",
        headline:      "Turnover Pressure",
        observation:   `${to.won} possession win${to.won !== 1 ? "s" : ""} produced ${to.wonToShot} shot${to.wonToShot !== 1 ? "s" : ""} — ${to.wonToScore} score${to.wonToScore !== 1 ? "s" : ""}`,
        primaryMetric: to.won,
        metricLabel:   "possession wins",
        occurrences:   to.won,
        priorityScore: to.won * 2 + to.wonToShot,
        side:          "FOR",
        zoneCol:       null,
        zoneRow:       null,
        arrowKind:     null,
      });
    }
  }

  // ── 6. WASTED CHAIN (WASTED_CHAIN) ─────────────────────────────────────────
  // FOR creating shots from turnovers but failing to convert.
  // HT: 1 unconverted shot qualifies — a missed chance at halftime is urgent.
  {
    const unconverted = to.wonToShot - to.wonToScore;
    if (unconverted >= (mode === "HT" ? 1 : 2) && to.won >= (mode === "HT" ? 1 : 2)) {
      const missOutcomes = to.outcomes.filter(
        (o) =>
          o.direction === "WON" &&
          o.turnoverEvent.teamSide === "FOR" &&
          o.resultedInShot &&
          !o.resultedInScore,
      );
      const zone = cpDominantZone(
        missOutcomes.map((o) => ({ nx: o.turnoverEvent.nx, ny: o.turnoverEvent.ny })),
      );
      candidates.push({
        kind:          "WASTED_CHAIN",
        badge:         "WASTED CHAIN",
        headline:      "Wasted Chain",
        observation:   `${to.wonToShot} shot${to.wonToShot !== 1 ? "s" : ""} from ${to.won} turnover win${to.won !== 1 ? "s" : ""} — only ${to.wonToScore} converted`,
        primaryMetric: unconverted,
        metricLabel:   "unconverted shots",
        occurrences:   to.won,
        priorityScore: to.wonToScore * 5 + to.won * 2 + unconverted,
        side:          "FOR",
        zoneCol:       zone?.col ?? null,
        zoneRow:       zone?.row ?? null,
        arrowKind:     null,
      });
    }
  }

  // ── Sort descending by priority score ──────────────────────────────────────
  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  // ── Select top 3, at most 2 of the same kind ──────────────────────────────
  const selected: Candidate[] = [];
  const kindCount = new Map<ChainPressureKind, number>();
  for (const c of candidates) {
    if (selected.length >= 3) break;
    const n = kindCount.get(c.kind) ?? 0;
    if (n >= 2) continue;
    selected.push(c);
    kindCount.set(c.kind, n + 1);
  }

  return selected.map((c, i) => ({ ...c, rank: cpRank(i) }));
}
