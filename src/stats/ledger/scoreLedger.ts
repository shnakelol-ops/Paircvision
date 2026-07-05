/**
 * scoreLedger.ts
 *
 * "Where the Points Went" — decomposes the final margin into scoring sources
 * so a coach sees, in 10 seconds, which battle decided the game.
 *
 * This is an explicitly CROSS-ENGINE dataset (Statistics + Chain):
 *   - Score events and their sources come from the Event Engine
 *     (raw events + eventSource classification — same taxonomy as the
 *     Shot & Scoring Efficiency "Source Breakdown").
 *   - Restart / turnover origins come from the Chain Engine's kickout and
 *     turnover outcome datasets (analysis.kickouts / analysis.turnovers) —
 *     no new event classification is invented here.
 *
 * Partition guarantee: every score appears in EXACTLY ONE row, so the row
 * nets always sum to the final margin. When a score cannot be attributed
 * (no source tag, no chain origin) it lands in the "Unattributed" row —
 * honesty over neatness, the ledger never fudges.
 *
 * Row precedence per score event:
 *   1. PLACED       — placed balls (frees, 45s, penalties, marks) by source
 *   2. RESTART_WON / TURNOVER_WON — the score is the chain engine's next
 *      score after a restart/turnover won by the scoring side; when both
 *      origins claim the score the nearer origin wins
 *   3. FROM_PLAY    — source tagged "From Play"
 *   4. UNATTRIBUTED — no source, no chain origin (legacy data)
 *
 * Goals decompose as their point value within their source row
 * (a goal from a turnover chain = 3 pts in the turnover row).
 *
 * Design constraints: pure TypeScript, no canvas/DOM/React. Imports only
 * chain-types + eventSource (no circular import with reviewPdfExport).
 */

import type { ChainableEvent, ChainAnalysis, KickoutOutcome } from "../chains/chain-types";
import type { MatchEventKind } from "../../core/stats/stats-event-model";
import { eventSource, isFreeMiss } from "../eventSource";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LedgerRowId =
  | "FROM_PLAY"
  | "PLACED"
  | "RESTART_WON"
  | "TURNOVER_WON"
  | "UNATTRIBUTED";

export type LedgerSide = {
  /** Number of scores in this row. */
  scores: number;
  goals: number;
  /** Point value contributed (goals ×3, two-pointers ×2, points ×1). */
  value: number;
  /** PLACED row only: placed-ball attempts (scored + missed). */
  attempts?: number;
};

export type LedgerRow = {
  id: LedgerRowId;
  label: string;
  us: LedgerSide;
  them: LedgerSide;
  /** us.value − them.value. Row nets sum exactly to the final margin. */
  net: number;
};

export type ScoreLine = { goals: number; points: number; total: number };

export type ScoreLedger = {
  /** Partition rows in display order. UNATTRIBUTED present only when non-empty. */
  rows: LedgerRow[];
  /** Context mirror of the restart battle: value conceded off restarts each side lost. */
  restartLossContext: {
    /** Opposition points scored off restarts we lost. */
    usConcededValue: number;
    /** Our points scored off restarts they lost. */
    themConcededValue: number;
  };
  forScore: ScoreLine;
  oppScore: ScoreLine;
  /** forScore.total − oppScore.total. Always equals the sum of row nets. */
  margin: number;
  /** Block C — one sentence for the largest positive and largest negative net rows. */
  verdicts: string[];
};

// ─── Scoring helpers ──────────────────────────────────────────────────────────

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

function scoreValue(kind: MatchEventKind): number {
  if (kind === "GOAL") return 3;
  if (kind === "TWO_POINTER" || kind === "FORTY_FIVE_TWO_POINT") return 2;
  return 1;
}

function scoreLine(events: readonly ChainableEvent[], side: "FOR" | "OPP"): ScoreLine {
  let goals = 0;
  let points = 0;
  for (const e of events) {
    if (e.teamSide !== side || !SCORE_KINDS.has(e.kind)) continue;
    if (e.kind === "GOAL") goals++;
    else points += scoreValue(e.kind);
  }
  return { goals, points, total: goals * 3 + points };
}

function emptySide(): LedgerSide {
  return { scores: 0, goals: 0, value: 0 };
}

function addToSide(side: LedgerSide, kind: MatchEventKind): void {
  side.scores++;
  if (kind === "GOAL") side.goals++;
  side.value += scoreValue(kind);
}

/** A placed ball: free / 45 / penalty / mark — by kind or by source tag. */
function isPlacedScore(e: ChainableEvent): boolean {
  if (e.kind === "FREE_SCORED" || e.kind === "FORTY_FIVE_TWO_POINT") return true;
  const src = eventSource(e);
  return src === "FREE" || src === "45" || src === "PENALTY" || src === "MARK";
}

function isPlacedMiss(e: ChainableEvent): boolean {
  if (isFreeMiss(e)) return true;
  if (e.kind !== "WIDE") return false;
  const src = eventSource(e);
  return src === "45" || src === "PENALTY" || src === "MARK";
}

// ─── Row labels ───────────────────────────────────────────────────────────────

export const LEDGER_ROW_LABELS: Record<LedgerRowId, string> = {
  FROM_PLAY:    "From play",
  PLACED:       "Placed balls",
  RESTART_WON:  "Direct restart scores",
  TURNOVER_WON: "Direct turnover scores",
  UNATTRIBUTED: "Unattributed",
};

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildScoreLedger<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
  analysis: ChainAnalysis<TEvent>,
  homeTeam: string,
  awayTeam: string,
): ScoreLedger {
  const valid = events.filter((e) => !e.id.includes("-instant-score-"));
  const home = homeTeam.slice(0, 18) || "Home";
  const away = awayTeam.slice(0, 18) || "Away";

  const forScore = scoreLine(valid, "FOR");
  const oppScore = scoreLine(valid, "OPP");
  const margin = forScore.total - oppScore.total;

  // Chain-origin lookups: score event id → clock of its origin event.
  // Built from the chain engine's outcome datasets — the same windows and
  // stop conditions as the Restart/Turnover Chain Analysis pages.
  const restartOriginClock = new Map<string, number>();
  for (const o of analysis.kickouts.outcomes) {
    if (o.nextScore != null) {
      restartOriginClock.set(
        o.nextScore.id,
        o.kickoutEvent.matchClockSeconds ?? 0,
      );
    }
  }
  const turnoverOriginClock = new Map<string, number>();
  for (const o of analysis.turnovers.outcomes) {
    if (o.nextEvent != null && o.resultedInScore) {
      turnoverOriginClock.set(
        o.nextEvent.id,
        o.turnoverEvent.matchClockSeconds ?? 0,
      );
    }
  }

  // Partition every score into exactly one row.
  const rowsById: Record<LedgerRowId, LedgerRow> = {
    FROM_PLAY:    { id: "FROM_PLAY",    label: LEDGER_ROW_LABELS.FROM_PLAY,    us: emptySide(), them: emptySide(), net: 0 },
    PLACED:       { id: "PLACED",       label: LEDGER_ROW_LABELS.PLACED,       us: emptySide(), them: emptySide(), net: 0 },
    RESTART_WON:  { id: "RESTART_WON",  label: LEDGER_ROW_LABELS.RESTART_WON,  us: emptySide(), them: emptySide(), net: 0 },
    TURNOVER_WON: { id: "TURNOVER_WON", label: LEDGER_ROW_LABELS.TURNOVER_WON, us: emptySide(), them: emptySide(), net: 0 },
    UNATTRIBUTED: { id: "UNATTRIBUTED", label: LEDGER_ROW_LABELS.UNATTRIBUTED, us: emptySide(), them: emptySide(), net: 0 },
  };

  function classify(e: TEvent): LedgerRowId {
    if (isPlacedScore(e)) return "PLACED";
    const koClock = restartOriginClock.get(e.id);
    const toClock = turnoverOriginClock.get(e.id);
    if (koClock != null && toClock != null) {
      // Both origins claim the score — the nearer (later) origin wins.
      return toClock >= koClock ? "TURNOVER_WON" : "RESTART_WON";
    }
    if (koClock != null) return "RESTART_WON";
    if (toClock != null) return "TURNOVER_WON";
    return eventSource(e) === "UNKNOWN" ? "UNATTRIBUTED" : "FROM_PLAY";
  }

  for (const e of valid) {
    if (!SCORE_KINDS.has(e.kind)) continue;
    const row = rowsById[classify(e)];
    addToSide(e.teamSide === "FOR" ? row.us : row.them, e.kind);
  }

  // Placed-ball attempts (scored + missed) for the conversion display.
  const usPlacedMisses   = valid.filter((e) => e.teamSide === "FOR" && isPlacedMiss(e)).length;
  const themPlacedMisses = valid.filter((e) => e.teamSide === "OPP" && isPlacedMiss(e)).length;
  rowsById.PLACED.us.attempts   = rowsById.PLACED.us.scores + usPlacedMisses;
  rowsById.PLACED.them.attempts = rowsById.PLACED.them.scores + themPlacedMisses;

  for (const row of Object.values(rowsById)) {
    row.net = row.us.value - row.them.value;
  }

  const rows: LedgerRow[] = [
    rowsById.FROM_PLAY,
    rowsById.PLACED,
    rowsById.RESTART_WON,
    rowsById.TURNOVER_WON,
    ...(rowsById.UNATTRIBUTED.us.scores + rowsById.UNATTRIBUTED.them.scores > 0
      ? [rowsById.UNATTRIBUTED]
      : []),
  ];

  // Context mirror: value conceded off restarts each side lost. A restart one
  // side lost is the restart the other side won, so these are the same scores
  // as the RESTART_WON row seen from the conceding side — context, not a new
  // partition row (it would double-count the margin).
  const restartLossContext = {
    usConcededValue: rowsById.RESTART_WON.them.value,
    themConcededValue: rowsById.RESTART_WON.us.value,
  };

  // ── Block C: verdicts ────────────────────────────────────────────────────
  const verdicts: string[] = [];
  const decisive = rows.filter((r) => r.id !== "UNATTRIBUTED");
  // Tie-break: the coachable battle rows (placed / restarts / turnovers)
  // outrank the open-play catch-all when nets are equal.
  const verdictPriority: Record<LedgerRowId, number> = {
    PLACED: 0, RESTART_WON: 1, TURNOVER_WON: 2, FROM_PLAY: 3, UNATTRIBUTED: 4,
  };
  const mostNegative = [...decisive].sort(
    (a, b) => a.net - b.net || verdictPriority[a.id] - verdictPriority[b.id],
  )[0];
  const mostPositive = [...decisive].sort(
    (a, b) => b.net - a.net || verdictPriority[a.id] - verdictPriority[b.id],
  )[0];

  const tv = analysis.turnovers;

  function verdictFor(row: LedgerRow): string | null {
    const net = row.net;
    if (net === 0) return null;
    const plural = Math.abs(net) !== 1 ? "points" : "point";
    switch (row.id) {
      case "PLACED": {
        const usConv   = `${row.us.scores}/${row.us.attempts ?? row.us.scores}`;
        const themConv = `${row.them.scores}/${row.them.attempts ?? row.them.scores}`;
        return net < 0
          ? `The placed-ball battle cost ${home} ${Math.abs(net)} ${plural}: ${home} scored ${usConv} against ${away}'s ${themConv}. Worth reviewing free-taking options.`
          : `${home} won the placed-ball battle by ${net} ${plural}: ${home} scored ${usConv} against ${away}'s ${themConv}.`;
      }
      case "TURNOVER_WON":
        return net < 0
          ? `Turnover exchanges netted ${net} for ${home}: ${row.us.value} ${row.us.value === 1 ? "point" : "points"} from ${tv.won} turnovers won against ${row.them.value} conceded from ${tv.lost} lost. Worth reviewing transition structure.`
          : `${home} won the turnover exchange by ${net} ${plural}: ${row.us.value} direct turnover point${row.us.value !== 1 ? "s" : ""} from ${tv.won} won against ${row.them.value} conceded from ${tv.lost} lost.`;
      case "RESTART_WON":
        return net < 0
          ? `The restart battle cost ${home} ${Math.abs(net)} ${plural}: ${row.us.value} direct restart points against ${row.them.value} by ${away}. Worth reviewing restart structure.`
          : `${home} won the restart battle by ${net} ${plural}: ${row.us.value} direct restart points against ${row.them.value} by ${away}.`;
      case "FROM_PLAY":
        return net < 0
          ? `${away} outscored ${home} from open play by ${Math.abs(net)} ${plural} (${row.them.value} to ${row.us.value}). Worth reviewing how open-play chances were created.`
          : `${home} outscored ${away} from open play by ${net} ${plural} (${row.us.value} to ${row.them.value}).`;
      default:
        return null;
    }
  }

  const negV = verdictFor(mostNegative);
  if (negV) verdicts.push(negV);
  if (mostPositive.id !== mostNegative.id) {
    const posV = verdictFor(mostPositive);
    if (posV) verdicts.push(posV);
  }
  if (verdicts.length === 0) {
    verdicts.push(
      `Every scoring source finished level between ${home} and ${away} — the margin came down to volume, not one battle.`,
    );
  }

  return { rows, restartLossContext, forScore, oppScore, margin, verdicts };
}

// ─── Origin ↔ direct reconciliation bridge ────────────────────────────────────
//
// The chain layer's restart-origin counts and the ledger's direct counts can
// legitimately differ: a placed free won inside a kickout-origin possession
// is a restart-origin score to the chain engine but lands under Placed balls
// in the ledger. These helpers compute that exact bridge so both ends can
// print a matching footnote with the real number — never a silent divergence.

/**
 * Counts scores that the chain engine attributes to a restart origin but the
 * ledger classifies as placed balls (frees / 45s / penalties / marks).
 */
export function countPlacedRestartOriginScores<TEvent extends ChainableEvent>(
  outcomes: readonly KickoutOutcome<TEvent>[],
): { us: number; them: number } {
  let us = 0;
  let them = 0;
  for (const o of outcomes) {
    if (o.nextScore != null && isPlacedScore(o.nextScore)) {
      if (o.winningSide === "FOR") us++;
      else them++;
    }
  }
  return { us, them };
}

/**
 * The bridging footnote printed on BOTH the chain-layer pages and the ledger.
 * When no placed scores sit inside restart-origin possessions, falls back to
 * the generic wording (callers pass it through restartAttributionFootnoteShort
 * when preferred).
 */
export function restartOriginBridgeNote(
  bridge: { us: number; them: number },
  homeTeam: string,
  awayTeam: string,
): string {
  const total = bridge.us + bridge.them;
  if (total === 0) {
    return "Origin chains include frees won in the possession. The ledger counts those under Placed balls.";
  }
  const home = homeTeam.slice(0, 14) || "Home";
  const away = awayTeam.slice(0, 14) || "Away";
  return (
    `Origin counts include ${total} placed free${total !== 1 ? "s" : ""} won inside ` +
    `kickout-origin possessions (${home} ${bridge.us} · ${away} ${bridge.them}) — ` +
    `counted under Placed balls in the scoring ledger.`
  );
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** "0-07 (7)" */
export function fmtScoreLine(s: ScoreLine): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
}

/** "St.Patricks by 4" / "Draw" */
export function fmtMarginLabel(margin: number, homeTeam: string, awayTeam: string): string {
  if (margin > 0) return `${homeTeam} by ${margin}`;
  if (margin < 0) return `${awayTeam} by ${Math.abs(margin)}`;
  return "Draw";
}

/** Ledger side cell: "1-04 (7 pts)" or "6 pts"; placed rows show conversion. */
export function fmtLedgerSide(row: LedgerRow, side: LedgerSide): string {
  if (row.id === "PLACED" && side.attempts != null) {
    return `${side.scores}/${side.attempts} scored · ${side.value} pts`;
  }
  if (side.goals > 0) {
    const pts = side.value - side.goals * 3;
    return `${side.goals}-${String(pts).padStart(2, "0")} (${side.value} pts)`;
  }
  return `${side.value} pts`;
}

/** "+1" / "-2" / "0" */
export function fmtNet(net: number): string {
  return net > 0 ? `+${net}` : `${net}`;
}
