/**
 * influence.ts
 *
 * Player Influence layer — turns existing player-attributed events into
 * ranked influence intelligence for BOTH teams. No new tagging: every metric
 * derives from events already captured.
 *
 * Metrics (per player, per match):
 *   Scoring Share     — player's points value ÷ team's total points value
 *   Shot Efficiency   — scores ÷ shots, always shown as "n/m" not just %
 *   Chain Involvement — team scoring chains in which the player logged ANY
 *                       event ÷ team scoring chains. Uses existing chain
 *                       membership (analysis.allChains) — the corner-back-
 *                       credit stat.
 *   Net Ball Impact   — (T/O won + kickouts won + frees won)
 *                       − (T/O lost + kickouts lost + frees conceded)
 *   Influence Index   — v1, deliberately dumb and explainable. Weights live
 *                       in the exported INFLUENCE_WEIGHTS object so they can
 *                       be tuned in one place; the formula is printed on the
 *                       report page ("How this is calculated").
 *
 * Insight rules (minimum-sample guarded; below thresholds the data still
 * shows but insights are suppressed):
 *   Dependency flag   — any player's Scoring Share ≥ 40% with team total
 *                       ≥ 5 scores. The spread insight fires otherwise.
 *   Efficiency watch  — ≥ 3 shots and < 34% conversion. Neutral tone.
 *   Quiet influence   — highest Chain Involvement among players with 0 scores.
 *
 * Design constraints: pure TypeScript — no canvas/DOM/React. Imports only
 * chain-types (no circular import with reviewPdfExport). All insight strings
 * carry evidence tags and name the team/player performing the action.
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { ChainableEvent, ChainAnalysis, ChainMatch } from "../chains/chain-types";
import {
  buildPlayerNumberAliasMap,
  resolvePlayerDisplayName,
  resolvePlayerIdentityKey,
} from "../player-display";

// ─── Input event shape ────────────────────────────────────────────────────────

export type InfluenceEvent = ChainableEvent & {
  playerId?: string | null;
  playerName?: string | null;
  playerNumber?: number | null;
};

// ─── Tunable weights ──────────────────────────────────────────────────────────

/**
 * Influence Index v1 weights — one place to tune. Keep it dumb and explainable:
 *   index = pointsValue×w + toWon×w − toLost×w + koWon×w − koLost×w
 *         + freesWon×w − freesConceded×w + assistsProxy×w
 * assistsProxy = chain involvements in team scores that were NOT the player's
 * own score (goals already carry their 3-point value — no extra goal bonus).
 */
export const INFLUENCE_WEIGHTS = {
  pointsValue:   1,
  turnoverWon:   1,
  turnoverLost:  1,
  kickoutWon:    1,
  kickoutLost:   1,
  freeWon:       1,
  freeConceded:  1,
  assistsProxy:  1,
} as const;

/** Human-readable formula string — printed on the Player Influence page. */
export function influenceFormulaText(): string {
  const w = INFLUENCE_WEIGHTS;
  return (
    `Influence Index = points value ×${w.pointsValue} + turnovers won ×${w.turnoverWon} − turnovers lost ×${w.turnoverLost} ` +
    `+ kickouts won ×${w.kickoutWon} − kickouts lost ×${w.kickoutLost} + frees won ×${w.freeWon} − frees conceded ×${w.freeConceded} ` +
    `+ scoring-chain involvements beyond own scores ×${w.assistsProxy}. Goals count as 3 points, 2-pointers as 2.`
  );
}

// ─── Output types ─────────────────────────────────────────────────────────────

export type PlayerInfluence = {
  key: string;
  teamSide: "FOR" | "OPP";
  name: string | null;
  number: number | null;
  /** "Shane" / "#15" / "—" — resolved via resolvePlayerDisplayName, the same
   *  function every other report surface uses for the same playerId. */
  displayName: string;
  goals: number;
  /** Non-goal points value (points + 2×two-pointers). */
  points: number;
  /** Total points value: goals×3 + points. */
  scoreValue: number;
  scores: number;
  shots: number;
  toWon: number;
  toLost: number;
  koWon: number;
  koLost: number;
  freesWon: number;
  freesConceded: number;
  /** Scoring Share, 0–100 integer (0 when team hasn't scored). */
  scoringSharePct: number;
  /** Shot efficiency 0–100 integer (0 when no shots). */
  shotEfficiencyPct: number;
  /** Team scoring chains this player logged any event in. */
  chainInvolvementCount: number;
  /** chainInvolvementCount ÷ team scoring chains, 0–100 integer. */
  chainInvolvementPct: number;
  /** Chain involvements in team scores that were not the player's own score. */
  assistsProxy: number;
  netBallImpact: number;
  influenceIndex: number;
};

export type InfluenceInsight = {
  text: string;
  evidenceTag: string;
};

export type TeamInfluence = {
  teamSide: "FOR" | "OPP";
  teamName: string;
  /** All players with ≥1 logged event, ranked by Influence Index (desc). */
  players: PlayerInfluence[];
  top3: PlayerInfluence[];
  /** Team total scores (count) and points value. */
  teamScores: number;
  teamScoreValue: number;
  teamGoals: number;
  teamPoints: number;
  /** Dependency flag (share ≥ 40%, team ≥ 5 scores) or the spread insight. */
  dependencyInsight: InfluenceInsight | null;
  dependencyPlayer: PlayerInfluence | null;
  /** Neutral efficiency-watch flags (≥3 shots, <34% conversion). */
  efficiencyWatch: InfluenceInsight[];
  /** Highest chain involvement among players with 0 scores. */
  quietInfluence: InfluenceInsight | null;
};

export type InfluenceAnalysis = {
  home: TeamInfluence;
  away: TeamInfluence;
};

// ─── Scoring constants ────────────────────────────────────────────────────────

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);
const SHOT_KINDS = new Set<MatchEventKind>([
  "SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER", "FORTY_FIVE_TWO_POINT",
  "FREE_MISSED", "FREE_SCORED",
]);

function scoreValueOf(kind: MatchEventKind): number {
  if (kind === "GOAL") return 3;
  if (kind === "TWO_POINTER" || kind === "FORTY_FIVE_TWO_POINT") return 2;
  return 1;
}

/** "1-04" */
export function fmtPlayerScore(p: PlayerInfluence): string {
  return `${p.goals}-${String(p.points).padStart(2, "0")}`;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildInfluenceAnalysis<TEvent extends InfluenceEvent>(
  events: readonly TEvent[],
  analysis: ChainAnalysis<TEvent>,
  homeTeam: string,
  awayTeam: string,
): InfluenceAnalysis {
  const valid = events.filter((e) => !e.id.includes("-instant-score-"));

  // Player keying: an explicit playerId always wins; a number-only event
  // resolves through the alias map so it lands on the same row as any
  // playerId-tagged event for the same team+number — a player tagged both
  // ways across the match (picker sometimes, number-only quick-tag other
  // times) never fragments into a named row and a separate "#N" row.
  const numberAliasMap = buildPlayerNumberAliasMap(valid);
  function playerKey(e: InfluenceEvent): string | null {
    return resolvePlayerIdentityKey(e, numberAliasMap);
  }

  const players = new Map<string, PlayerInfluence>();

  function getPlayer(e: TEvent): PlayerInfluence | null {
    const key = playerKey(e);
    if (key == null) return null;
    let p = players.get(key);
    if (!p) {
      const name = typeof e.playerName === "string" && e.playerName.trim() ? e.playerName.trim() : null;
      const number = typeof e.playerNumber === "number" ? e.playerNumber : null;
      p = {
        key,
        teamSide: e.teamSide,
        name,
        number,
        displayName: "", // resolved once, after all backfills, in the derived-metrics pass below
        goals: 0, points: 0, scoreValue: 0, scores: 0, shots: 0,
        toWon: 0, toLost: 0, koWon: 0, koLost: 0, freesWon: 0, freesConceded: 0,
        scoringSharePct: 0, shotEfficiencyPct: 0,
        chainInvolvementCount: 0, chainInvolvementPct: 0,
        assistsProxy: 0, netBallImpact: 0, influenceIndex: 0,
      };
      players.set(key, p);
    } else {
      // Backfill whichever identity field this event adds that earlier
      // events for the same key didn't carry (e.g. the first-seen event was
      // number-only; a later one resolves to the same key and carries a name).
      if (p.name == null && typeof e.playerName === "string" && e.playerName.trim()) {
        p.name = e.playerName.trim();
      }
      if (p.number == null && typeof e.playerNumber === "number") {
        p.number = e.playerNumber;
      }
    }
    return p;
  }

  // ── Accumulate raw counts ─────────────────────────────────────────────────
  for (const e of valid) {
    const p = getPlayer(e);
    if (!p) continue;
    if (SCORE_KINDS.has(e.kind)) {
      p.scores++;
      p.scoreValue += scoreValueOf(e.kind);
      if (e.kind === "GOAL") p.goals++;
      else p.points += scoreValueOf(e.kind);
    }
    if (SHOT_KINDS.has(e.kind))         p.shots++;
    if (e.kind === "TURNOVER_WON")      p.toWon++;
    if (e.kind === "TURNOVER_LOST")     p.toLost++;
    if (e.kind === "KICKOUT_WON")       p.koWon++;
    if (e.kind === "KICKOUT_CONCEDED")  p.koLost++;
    if (e.kind === "FREE_WON")          p.freesWon++;
    if (e.kind === "FREE_CONCEDED")     p.freesConceded++;
  }

  // ── Team totals ───────────────────────────────────────────────────────────
  function teamTotals(side: "FOR" | "OPP") {
    let scores = 0, value = 0, goals = 0, points = 0;
    for (const e of valid) {
      if (e.teamSide !== side || !SCORE_KINDS.has(e.kind)) continue;
      scores++;
      value += scoreValueOf(e.kind);
      if (e.kind === "GOAL") goals++;
      else points += scoreValueOf(e.kind);
    }
    return { scores, value, goals, points };
  }
  const forTotals = teamTotals("FOR");
  const oppTotals = teamTotals("OPP");

  // ── Chain involvement ─────────────────────────────────────────────────────
  // A "scoring chain" is one team score event plus any chain-engine chains
  // that end in that score (existing chain membership — no new detection).
  // Involvement = the player logged the score itself OR any event of a chain
  // ending in that score.
  const chainsByScoreId = new Map<string, ChainMatch<TEvent>[]>();
  for (const chain of analysis.allChains) {
    const last = chain.events[chain.events.length - 1];
    if (!SCORE_KINDS.has(last.kind)) continue;
    const list = chainsByScoreId.get(last.id);
    if (list) list.push(chain);
    else chainsByScoreId.set(last.id, [chain]);
  }

  const scoreEvents = valid.filter((e) => SCORE_KINDS.has(e.kind));
  for (const score of scoreEvents) {
    const involved = new Map<string, { player: PlayerInfluence; scoredIt: boolean }>();
    const scorer = getPlayer(score);
    if (scorer && scorer.teamSide === score.teamSide) {
      involved.set(scorer.key, { player: scorer, scoredIt: true });
    }
    for (const chain of chainsByScoreId.get(score.id) ?? []) {
      for (const ce of chain.events) {
        if (ce.teamSide !== score.teamSide) continue;
        const p = getPlayer(ce);
        if (!p) continue;
        if (!involved.has(p.key)) {
          involved.set(p.key, { player: p, scoredIt: ce.id === score.id });
        }
      }
    }
    for (const { player, scoredIt } of involved.values()) {
      player.chainInvolvementCount++;
      if (!scoredIt) player.assistsProxy++;
    }
  }

  // ── Derived metrics ───────────────────────────────────────────────────────
  const w = INFLUENCE_WEIGHTS;
  for (const p of players.values()) {
    // Resolved once, after every event (and identity backfill) has been
    // accumulated — the single source every insight and table row reads via
    // p.displayName, so no surface can print a name another surface doesn't.
    p.displayName = resolvePlayerDisplayName(p.name, p.number);
    const totals = p.teamSide === "FOR" ? forTotals : oppTotals;
    p.scoringSharePct    = totals.value  > 0 ? Math.round((p.scoreValue / totals.value) * 100) : 0;
    p.shotEfficiencyPct  = p.shots       > 0 ? Math.round((p.scores / p.shots) * 100) : 0;
    p.chainInvolvementPct = totals.scores > 0 ? Math.round((p.chainInvolvementCount / totals.scores) * 100) : 0;
    p.netBallImpact = (p.toWon + p.koWon + p.freesWon) - (p.toLost + p.koLost + p.freesConceded);
    p.influenceIndex =
      p.scoreValue * w.pointsValue +
      p.toWon * w.turnoverWon - p.toLost * w.turnoverLost +
      p.koWon * w.kickoutWon  - p.koLost * w.kickoutLost +
      p.freesWon * w.freeWon  - p.freesConceded * w.freeConceded +
      p.assistsProxy * w.assistsProxy;
  }

  // ── Team assembly ─────────────────────────────────────────────────────────
  function buildTeam(side: "FOR" | "OPP", teamName: string): TeamInfluence {
    const totals = side === "FOR" ? forTotals : oppTotals;
    const team = teamName.slice(0, 18) || (side === "FOR" ? "Home" : "Away");
    const ranked = Array.from(players.values())
      .filter((p) => p.teamSide === side)
      .sort((a, b) =>
        b.influenceIndex - a.influenceIndex ||
        b.scoreValue - a.scoreValue ||
        (a.number ?? 99) - (b.number ?? 99),
      );

    const teamScoreStr = `${totals.goals}-${String(totals.points).padStart(2, "0")}`;

    // Dependency flag — needs team total ≥ 5 scores
    let dependencyInsight: InfluenceInsight | null = null;
    let dependencyPlayer: PlayerInfluence | null = null;
    if (totals.scores >= 5 && ranked.length > 0) {
      const topScorer = ranked.reduce((a, b) => (b.scoringSharePct > a.scoringSharePct ? b : a));
      if (topScorer.scoringSharePct >= 40) {
        dependencyPlayer = topScorer;
        dependencyInsight = {
          text:
            `${team} scoring ran through ${topScorer.displayName} — ` +
            `${fmtPlayerScore(topScorer)} of ${teamScoreStr} (${topScorer.scoringSharePct}%). ` +
            `Worth reviewing matchup options for the rematch.`,
          evidenceTag: `influence:scoringShare=${topScorer.scoringSharePct}`,
        };
      } else if (topScorer.scoreValue > 0) {
        dependencyInsight = {
          text: `${team} scoring was spread — top scorer share ${topScorer.scoringSharePct}%.`,
          evidenceTag: `influence:topShare=${topScorer.scoringSharePct}`,
        };
      }
    }

    // Efficiency watch — ≥3 shots, <34% conversion; neutral tone
    const efficiencyWatch: InfluenceInsight[] = ranked
      .filter((p) => p.shots >= 3 && p.shotEfficiencyPct < 34)
      .map((p) => ({
        text:
          `${p.displayName} (${team}): ${p.scores} from ${p.shots} attempts. ` +
          `Worth reviewing shot selection or supply.`,
        evidenceTag: `influence:shotEff=${p.shotEfficiencyPct},shots=${p.shots}`,
      }));

    // Quiet influence — highest chain involvement among players with 0 scores
    let quietInfluence: InfluenceInsight | null = null;
    const quiet = ranked
      .filter((p) => p.scores === 0 && p.chainInvolvementCount > 0)
      .sort((a, b) => b.chainInvolvementCount - a.chainInvolvementCount)[0];
    if (quiet && totals.scores > 0) {
      quietInfluence = {
        text:
          `${quiet.displayName} (${team}) appeared in ${quiet.chainInvolvementCount} of ` +
          `${totals.scores} ${team} scoring chains without shooting.`,
        evidenceTag: `influence:quietChains=${quiet.chainInvolvementCount}/${totals.scores}`,
      };
    }

    return {
      teamSide: side,
      teamName,
      players: ranked,
      top3: ranked.slice(0, 3),
      teamScores: totals.scores,
      teamScoreValue: totals.value,
      teamGoals: totals.goals,
      teamPoints: totals.points,
      dependencyInsight,
      dependencyPlayer,
      efficiencyWatch,
      quietInfluence,
    };
  }

  return {
    home: buildTeam("FOR", homeTeam),
    away: buildTeam("OPP", awayTeam),
  };
}

// ─── Evidence line for Top-3 display ─────────────────────────────────────────

/** "#15: 1-04 (64% of St.Patricks total) from 6 shots." */
export function influenceEvidenceLine(p: PlayerInfluence, team: TeamInfluence): string {
  const teamName = team.teamName.slice(0, 18);
  const parts: string[] = [];
  if (p.scoreValue > 0) {
    parts.push(`${fmtPlayerScore(p)} (${p.scoringSharePct}% of ${teamName} total)`);
    if (p.shots > 0) parts.push(`from ${p.shots} shot${p.shots !== 1 ? "s" : ""}`);
  } else if (p.chainInvolvementCount > 0) {
    parts.push(`in ${p.chainInvolvementCount} of ${team.teamScores} scoring chains`);
  }
  if (p.netBallImpact !== 0) {
    parts.push(`${p.netBallImpact > 0 ? "+" : ""}${p.netBallImpact} net ball impact`);
  }
  if (parts.length === 0) parts.push(`${p.shots} shot${p.shots !== 1 ? "s" : ""}, index ${p.influenceIndex}`);
  return `${p.displayName}: ${parts.join(" · ")}`;
}
