import type { MatchEventKind } from "../core/stats/stats-event-model";
import type { MatchState } from "../core/match/match-state-store";
import type { MatchIntelligenceSummary } from "./matchIntelligenceSummary";
import { resolvePlayerDisplayName } from "./player-display";
import { adaptEventsToChainable } from "./reporting/eventAdapter";
import { buildMatchReport } from "./reporting/matchReport";
import { viewCoachingBriefStats, viewCoachingScoringRuns } from "./reporting/teamStatsViews";

// Minimal structural interface — satisfied by both App.tsx's local LoggedMatchEvent
// and saved-match.ts's LoggedMatchEvent without any explicit cast.
type CBEvent = {
  id: string;
  kind: MatchEventKind;
  half: 1 | 2;
  timestamp: number;
  matchClockSeconds?: number;
  team?: "HOME" | "AWAY";
  playerId?: string;
  playerName?: string;
  playerNumber?: number;
  nx?: number;
  ny?: number;
};

export type ShotMapDot = {
  nx: number;
  ny: number;
  outcome: "GOAL" | "POINT" | "TWO_POINTER" | "WIDE" | "BLOCKED";
};

export type MiniShotMapData = {
  ourScores: ShotMapDot[];
  theirScores: ShotMapDot[];
  ourWides: ShotMapDot[];
  theirWides: ShotMapDot[];
};

export type CoachingBriefLine =
  | { type: "section"; text: string }
  | { type: "body"; text: string }
  | { type: "bullet"; text: string }
  | { type: "arrow"; text: string }
  | { type: "spacer" }
  | { type: "miniShotMaps"; homeTeam: string; awayTeam: string; data: MiniShotMapData };

export type CoachingBriefInput = {
  loggedEvents: readonly CBEvent[];
  matchState: MatchState;
  homeTeamName: string;
  awayTeamName: string;
  isHurlingMode: boolean;
  /** Pre-computed match intelligence. When absent the brief falls back to basic stat rules. */
  intelligence?: MatchIntelligenceSummary;
};

// ─── Internal types ───────────────────────────────────────────────────────────

type TeamScore = { goals: number; points: number; total: number };

type MatchStats = {
  homeScore: TeamScore;
  awayScore: TeamScore;
  goals: number;
  attempts: number;
  scores: number;
  wides: number;
  conversionPct: number;
  turnoversWon: number;
  turnoversLost: number;
  kickoutsWon: number;
  kickoutsLost: number;
  kickoutTotal: number;
  kickoutPct: number;
  freesWon: number;
  freesConceded: number;
};

type PlayerNote = {
  label: string;
  goals: number;
  points: number;
  scorePoints: number;
  turnoversWon: number;
  kickoutsWon: number;
  freesWon: number;
};

type ScoringRun = {
  team: "HOME" | "AWAY";
  count: number;
  startMin: number;
  endMin: number;
  period: 1 | 2;
  endPeriod: 1 | 2;
};

// ─── Event helpers ────────────────────────────────────────────────────────────

function isHomeEvent(e: CBEvent): boolean {
  return e.team === "HOME" || e.id.startsWith("team-home-");
}

function isAwayEvent(e: CBEvent): boolean {
  return e.team === "AWAY" || e.id.startsWith("team-away-");
}

function formatScore(s: TeamScore): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
}

function formatMargin(home: TeamScore, away: TeamScore, homeName: string, awayName: string): string {
  const diff = home.total - away.total;
  if (diff === 0) return "Level";
  const leader = diff > 0 ? homeName : awayName;
  return `${leader} ahead by ${Math.abs(diff)}`;
}

// ─── Stats aggregation (canonical — via MatchReport) ─────────────────────────

function buildCoachingReport(
  events: readonly CBEvent[],
  homeTeam: string,
  awayTeam: string,
  scope: "1H" | "FULL",
) {
  const chainable = adaptEventsToChainable(events);
  return buildMatchReport({
    events: chainable,
    homeTeam,
    awayTeam,
    scope: scope === "1H" ? "1H" : "FULL",
  });
}

function computeMatchStats(
  events: readonly CBEvent[],
  homeTeam: string,
  awayTeam: string,
  scope: "1H" | "FULL",
): MatchStats {
  const report = buildCoachingReport(events, homeTeam, awayTeam, scope);
  const brief = viewCoachingBriefStats(report);
  return {
    homeScore: report.ledger.forScore,
    awayScore: report.ledger.oppScore,
    goals: brief.goals,
    attempts: brief.attempts,
    scores: brief.scores,
    wides: brief.wides,
    conversionPct: brief.conversionPct,
    turnoversWon: brief.turnoversWon,
    turnoversLost: brief.turnoversLost,
    kickoutsWon: brief.kickoutsWon,
    kickoutsLost: brief.kickoutsLost,
    kickoutTotal: brief.kickoutTotal,
    kickoutPct: brief.kickoutPct,
    freesWon: brief.freesWon,
    freesConceded: brief.freesConceded,
  };
}

// ─── Scoring run detection (canonical — via MatchReport chain scoring runs) ───

function deriveScoringRuns(
  events: readonly CBEvent[],
  homeTeam: string,
  awayTeam: string,
  scope: "1H" | "FULL",
): { longestFor: ScoringRun | null; longestOpp: ScoringRun | null } {
  const report = buildCoachingReport(events, homeTeam, awayTeam, scope);
  return viewCoachingScoringRuns(report);
}

// ─── Player notes ─────────────────────────────────────────────────────────────

function buildPlayerNotes(events: readonly CBEvent[]): PlayerNote[] {
  const map = new Map<string, PlayerNote>();

  const resolveLabel = (e: CBEvent): string => {
    const num = typeof e.playerNumber === "number" && isFinite(e.playerNumber) ? `#${e.playerNumber}` : null;
    const display = resolvePlayerDisplayName(e.playerName, e.playerNumber);
    if (display === "—") return "Tagged player";
    if (num && display !== num) return `${num} ${display}`;
    return display;
  };

  const eventKey = (e: CBEvent): string | null => {
    if (typeof e.playerId === "string" && e.playerId.trim()) return `id:${e.playerId}`;
    if (typeof e.playerNumber === "number" && isFinite(e.playerNumber)) return `num:${e.playerNumber}`;
    if (typeof e.playerName === "string" && e.playerName.trim()) return `name:${e.playerName.trim().toLowerCase()}`;
    return null;
  };

  for (const e of events) {
    if (!isHomeEvent(e)) continue;
    const k = eventKey(e);
    if (!k) continue;
    let note = map.get(k);
    if (!note) {
      note = { label: resolveLabel(e), goals: 0, points: 0, scorePoints: 0, turnoversWon: 0, kickoutsWon: 0, freesWon: 0 };
      map.set(k, note);
    }
    if (e.kind === "GOAL") { note.goals += 1; note.scorePoints += 3; }
    else if (e.kind === "POINT") { note.points += 1; note.scorePoints += 1; }
    else if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") { note.points += 2; note.scorePoints += 2; }
    else if (e.kind === "TURNOVER_WON") note.turnoversWon += 1;
    else if (e.kind === "KICKOUT_WON") note.kickoutsWon += 1;
    else if (e.kind === "FREE_WON") note.freesWon += 1;
  }

  return Array.from(map.values());
}

function appendPlayerNotes(
  notes: PlayerNote[],
  lines: CoachingBriefLine[],
  restartWord: string,
): void {
  lines.push({ type: "spacer" });
  lines.push({ type: "section", text: "PLAYER NOTES" });

  if (notes.length === 0) {
    lines.push({ type: "body", text: "No player tags yet." });
    return;
  }

  const pickBest = (fn: (n: PlayerNote) => number): PlayerNote | null => {
    let best: PlayerNote | null = null;
    for (const n of notes) {
      if (fn(n) <= 0) continue;
      if (!best || fn(n) > fn(best)) best = n;
    }
    return best;
  };

  const topScorer = pickBest(n => n.scorePoints);
  const topTurnovers = pickBest(n => n.turnoversWon);
  const topKickouts = pickBest(n => n.kickoutsWon);
  const topFrees = pickBest(n => n.freesWon);

  if (topScorer) {
    lines.push({
      type: "body",
      text: `Top scorer — ${topScorer.label}  ${topScorer.goals}-${String(topScorer.points).padStart(2, "0")} (${topScorer.scorePoints}pts)`,
    });
  }
  if (topTurnovers) {
    lines.push({ type: "body", text: `Most turnovers won — ${topTurnovers.label} (${topTurnovers.turnoversWon})` });
  }
  if (topKickouts) {
    lines.push({ type: "body", text: `Most ${restartWord}s won — ${topKickouts.label} (${topKickouts.kickoutsWon})` });
  }
  if (topFrees) {
    lines.push({ type: "body", text: `Most possession frees won — ${topFrees.label} (${topFrees.freesWon})` });
  }
}

// ─── Scoring run clock label ─────────────────────────────────────────────────

/** "1H 2'–9'", or "1H 33'–2H 0'" for a run that continues past half-time —
 *  the same convention as the Full Report's run labels. */
function fmtRunWindow(run: ScoringRun): string {
  const start = `${run.period === 1 ? "1H" : "2H"} ${run.startMin}'`;
  if (run.endPeriod !== run.period) return `${start}–${run.endPeriod === 1 ? "1H" : "2H"} ${run.endMin}'`;
  return run.startMin === run.endMin ? start : `${start}–${run.endMin}'`;
}

// ─── Shot map builder ─────────────────────────────────────────────────────────

function buildMiniShotMapData(events: readonly CBEvent[]): MiniShotMapData {
  const ourScores: ShotMapDot[] = [];
  const theirScores: ShotMapDot[] = [];
  const ourWides: ShotMapDot[] = [];
  const theirWides: ShotMapDot[] = [];

  for (const e of events) {
    if (typeof e.nx !== "number" || typeof e.ny !== "number") continue;
    const forHome = isHomeEvent(e);
    const forAway = isAwayEvent(e);
    if (!forHome && !forAway) continue;
    const { nx, ny } = e;
    const scores = forHome ? ourScores : theirScores;
    const wides = forHome ? ourWides : theirWides;

    if (e.kind === "GOAL") {
      scores.push({ nx, ny, outcome: "GOAL" });
    } else if (e.kind === "POINT" || e.kind === "FREE_SCORED") {
      scores.push({ nx, ny, outcome: "POINT" });
    } else if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") {
      scores.push({ nx, ny, outcome: "TWO_POINTER" });
    } else if (e.kind === "WIDE" || e.kind === "FREE_MISSED") {
      wides.push({ nx, ny, outcome: "WIDE" });
    }
    // SHOT (blocked/saved) intentionally excluded — not a wide, not a score
  }

  return { ourScores, theirScores, ourWides, theirWides };
}

// ─── Halftime Notes ───────────────────────────────────────────────────────────

function deriveHalftimeNotes(
  events: readonly CBEvent[],
  homeTeam: string,
  awayTeam: string,
  isHurlingMode: boolean,
  intel?: MatchIntelligenceSummary,
): CoachingBriefLine[] {
  const restartWord = isHurlingMode ? "puckout" : "kickout";
  const s = computeMatchStats(events, homeTeam, awayTeam, "1H");
  const diff = s.homeScore.total - s.awayScore.total;
  const lines: CoachingBriefLine[] = [];

  // SITUATION
  lines.push({ type: "section", text: "SITUATION" });
  lines.push({ type: "body", text: `${homeTeam}  ${formatScore(s.homeScore)}` });
  lines.push({ type: "body", text: `${awayTeam}  ${formatScore(s.awayScore)}` });
  lines.push({ type: "body", text: formatMargin(s.homeScore, s.awayScore, homeTeam, awayTeam) });

  // WHAT'S WORKING — intelligence tier first, basic stats as fallback
  const positives: string[] = [];

  if (intel && !intel.lowSampleWarning) {
    for (const w of intel.weaponInsights) {
      if (positives.length >= 3) break;
      positives.push(w);
    }
    if (positives.length < 3 && intel.ourRestartInsight) {
      positives.push(intel.ourRestartInsight);
    }
    if (positives.length < 3 && intel.bestAttackInsight) {
      const alreadyCovered = positives.some((p) =>
        (intel.bestAttackInsight!.includes(restartWord) && p.includes(restartWord)) ||
        (intel.bestAttackInsight!.includes("turnover") && p.includes("turnover")) ||
        (intel.bestAttackInsight!.includes("free") && p.includes("free"))
      );
      if (!alreadyCovered) positives.push(intel.bestAttackInsight);
    }
  }

  if (positives.length < 3 && s.kickoutTotal >= 5 && s.kickoutPct >= 65) {
    positives.push(`${homeTeam} held ${s.kickoutPct}% Restart Share (${s.kickoutsWon} of ${s.kickoutTotal} ${restartWord}s)`);
  }
  if (positives.length < 3 && s.attempts >= 5 && s.conversionPct >= 65) {
    positives.push(`${homeTeam} converted ${s.conversionPct}% of shots — efficient in front of goal`);
  }
  if (positives.length < 3 && s.turnoversWon - s.turnoversLost >= 3) {
    positives.push(`${homeTeam} won the turnover battle ${s.turnoversWon}–${s.turnoversLost}`);
  }
  if (positives.length < 3 && s.freesWon - s.freesConceded >= 4) {
    positives.push(`${homeTeam} won ${s.freesWon} possession frees to ${awayTeam}'s ${s.freesConceded}`);
  }
  if (positives.length < 3 && s.goals >= 1) {
    positives.push(`${homeTeam} found the net ${s.goals === 1 ? "once" : `${s.goals} times`}`);
  }
  if (positives.length === 0) {
    if (diff > 0) {
      positives.push(`${homeTeam} ahead at halftime — protect the lead in the second half.`);
    } else if (diff === 0) {
      positives.push(`${homeTeam} level at halftime — everything to play for in the second half.`);
    } else {
      positives.push(`${homeTeam} still in the contest — a strong second half start can change this.`);
    }
  }

  lines.push({ type: "spacer" });
  lines.push({ type: "section", text: "WHAT'S WORKING" });
  for (const p of positives.slice(0, 3)) {
    lines.push({ type: "bullet", text: p });
  }

  // HOW THEY'RE HURTING US — intelligence only, skipped when low sample
  if (intel && !intel.lowSampleWarning) {
    const hurtingUs: string[] = [];
    for (const d of intel.dangerInsights) {
      if (hurtingUs.length >= 3) break;
      hurtingUs.push(d);
    }
    if (hurtingUs.length < 3 && intel.theirRestartInsight && !hurtingUs.some((h) => h.includes(restartWord))) {
      hurtingUs.push(intel.theirRestartInsight);
    }
    if (
      hurtingUs.length < 3 &&
      intel.turnoverDangerInsight &&
      (intel.turnoverDangerLevel === "HIGH" || intel.turnoverDangerLevel === "MEDIUM") &&
      !hurtingUs.some((h) => h.includes("turnover"))
    ) {
      hurtingUs.push(intel.turnoverDangerInsight);
    }
    if (hurtingUs.length < 3 && intel.worstExposureInsight) {
      hurtingUs.push(intel.worstExposureInsight);
    }
    if (hurtingUs.length > 0) {
      lines.push({ type: "spacer" });
      lines.push({ type: "section", text: "HOW THEY'RE HURTING US" });
      for (const h of hurtingUs) {
        lines.push({ type: "bullet", text: h });
      }
    }
  }

  // WATCH
  const concerns: string[] = [];

  if (s.wides >= 4) {
    concerns.push(`${homeTeam} missed ${s.wides} shots wide`);
  }
  if (s.kickoutTotal >= 5 && s.kickoutPct <= 45) {
    concerns.push(`${homeTeam} held only ${s.kickoutPct}% Restart Share — ${awayTeam} winning this battle`);
  }
  if (s.turnoversLost - s.turnoversWon >= 3) {
    concerns.push(`${homeTeam} lost the turnover battle ${s.turnoversLost}–${s.turnoversWon}`);
  }
  if (s.freesConceded >= 8) {
    concerns.push(`${homeTeam} conceded ${s.freesConceded} possession frees`);
  }
  const { longestOpp } = deriveScoringRuns(events, homeTeam, awayTeam, "1H");
  if (longestOpp && longestOpp.count >= 3) {
    concerns.push(`${awayTeam} hit ${longestOpp.count} unanswered — check the momentum swing`);
  }
  if (s.attempts >= 5 && s.conversionPct <= 45) {
    concerns.push(`${homeTeam} converted only ${s.conversionPct}% of shots — not taking the chances`);
  }

  if (concerns.length > 0) {
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "WATCH" });
    for (const c of concerns.slice(0, 3)) {
      lines.push({ type: "bullet", text: c });
    }
  }

  // SECOND HALF FOCUS — intelligence priorities first, basic stats fill remainder
  const focusItems: string[] = [];

  if (intel && !intel.lowSampleWarning) {
    for (const p of intel.coachingPriorities.slice(0, 2)) {
      focusItems.push(p);
    }
  }

  if (focusItems.length < 3 && s.wides >= 4) focusItems.push("Take cleaner shots — build attacks from better positions");
  if (focusItems.length < 3 && s.kickoutTotal >= 5 && s.kickoutPct <= 45) focusItems.push(`Win the ${restartWord} — press their restart high and early`);
  if (focusItems.length < 3 && s.turnoversLost - s.turnoversWon >= 3) focusItems.push("Protect possession — fewer giveaways in the middle third");
  if (focusItems.length < 3 && s.freesConceded >= 8) focusItems.push("Stay on your feet — win the ball, not the man");
  if (focusItems.length < 3 && longestOpp && longestOpp.count >= 3) focusItems.push("Respond fast to their scores — do not let them settle");
  if (focusItems.length < 3 && s.attempts >= 5 && s.conversionPct <= 45) focusItems.push("Build more attacks from inside the 45 — cut the wide count");

  const focusDefaults = [
    "Protect possession — limit the giveaways.",
    "Stay disciplined — win the ball, not the man.",
  ];
  for (const d of focusDefaults) {
    if (focusItems.length >= 3) break;
    focusItems.push(d);
  }

  lines.push({ type: "spacer" });
  lines.push({ type: "section", text: "SECOND HALF FOCUS" });
  for (const f of focusItems.slice(0, 3)) {
    lines.push({ type: "arrow", text: f });
  }

  // SHOT MAPS
  lines.push({ type: "spacer" });
  lines.push({ type: "section", text: "SHOT MAPS" });
  lines.push({ type: "miniShotMaps", homeTeam, awayTeam, data: buildMiniShotMapData(events) });

  // No MATCH PATTERN section: its sentences ("led throughout", "controlled
  // the tempo") were inferred from the half-time margin alone. The margin
  // itself is already stated under SITUATION.

  // PLAYER NOTES
  appendPlayerNotes(buildPlayerNotes(events), lines, restartWord);

  return lines;
}

// ─── Full-Time Summary ────────────────────────────────────────────────────────

function deriveFullTimeSummary(
  events: readonly CBEvent[],
  homeTeam: string,
  awayTeam: string,
  isHurlingMode: boolean,
  intel?: MatchIntelligenceSummary,
): CoachingBriefLine[] {
  const restartWord = isHurlingMode ? "puckout" : "kickout";
  const s = computeMatchStats(events, homeTeam, awayTeam, "FULL");
  const diff = s.homeScore.total - s.awayScore.total;
  const lines: CoachingBriefLine[] = [];

  // FINAL RESULT
  lines.push({ type: "section", text: "FINAL RESULT" });
  lines.push({ type: "body", text: `${homeTeam}  ${formatScore(s.homeScore)}` });
  lines.push({ type: "body", text: `${awayTeam}  ${formatScore(s.awayScore)}` });
  const resultLine =
    diff > 0 ? `${homeTeam} won — ${diff} clear`
    : diff < 0 ? `${awayTeam} won — ${Math.abs(diff)} clear`
    : "Draw";
  lines.push({ type: "body", text: resultLine });

  // BIGGEST POSITIVE — intelligence tier first
  let biggestPositive: string | null = null;
  if (intel && !intel.lowSampleWarning && intel.weaponInsights.length > 0) {
    biggestPositive = intel.weaponInsights[0] + ".";
  } else if (intel && !intel.lowSampleWarning && intel.overallInsight) {
    biggestPositive = intel.overallInsight + ".";
  } else if (s.kickoutTotal >= 5 && s.kickoutPct >= 60) {
    biggestPositive = `${homeTeam} held ${s.kickoutPct}% Restart Share (${s.kickoutsWon} of ${s.kickoutTotal} ${restartWord}s).`;
  } else if (s.attempts >= 5 && s.conversionPct >= 65) {
    biggestPositive = `${homeTeam} converted ${s.conversionPct}% of shots — clinical in front of goal.`;
  } else if (s.turnoversWon - s.turnoversLost >= 3) {
    biggestPositive = `${homeTeam} won the turnover battle ${s.turnoversWon}–${s.turnoversLost}.`;
  } else if (s.freesWon - s.freesConceded >= 4) {
    biggestPositive = `${homeTeam} won ${s.freesWon} possession frees to ${awayTeam}'s ${s.freesConceded}.`;
  } else if (s.goals >= 1) {
    biggestPositive = `${homeTeam} found the net ${s.goals === 1 ? "once" : `${s.goals} times`}.`;
  }

  if (biggestPositive) {
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "BIGGEST POSITIVE" });
    lines.push({ type: "body", text: biggestPositive });
  }

  // BIGGEST CONCERN
  let biggestConcern: string | null = null;
  if (s.wides >= 5) {
    biggestConcern = `${homeTeam} missed ${s.wides} shots wide.`;
  } else if (s.kickoutTotal >= 5 && s.kickoutPct <= 45) {
    biggestConcern = `${homeTeam} held only ${s.kickoutPct}% Restart Share — ${awayTeam} controlled the restarts.`;
  } else if (s.turnoversLost - s.turnoversWon >= 3) {
    biggestConcern = `${homeTeam} lost the turnover battle ${s.turnoversLost}–${s.turnoversWon} — possession discipline is a priority.`;
  } else if (s.freesConceded >= 8) {
    biggestConcern = `${homeTeam} conceded ${s.freesConceded} possession frees.`;
  } else if (s.attempts >= 5 && s.conversionPct <= 45) {
    biggestConcern = `${homeTeam} converted only ${s.conversionPct}% of shots.`;
  }

  if (biggestConcern) {
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "BIGGEST CONCERN" });
    lines.push({ type: "body", text: biggestConcern });
  }

  // HOW THEY HURT US — intelligence only
  if (intel && !intel.lowSampleWarning) {
    const hurtingUs: string[] = [];
    for (const d of intel.dangerInsights) {
      if (hurtingUs.length >= 3) break;
      hurtingUs.push(d);
    }
    if (hurtingUs.length < 3 && intel.theirRestartInsight && !hurtingUs.some((h) => h.includes(restartWord))) {
      hurtingUs.push(intel.theirRestartInsight);
    }
    if (
      hurtingUs.length < 3 &&
      intel.turnoverDangerInsight &&
      intel.turnoverDangerLevel !== "LOW" &&
      !hurtingUs.some((h) => h.includes("turnover"))
    ) {
      hurtingUs.push(intel.turnoverDangerInsight);
    }
    if (hurtingUs.length < 3 && intel.worstExposureInsight) {
      hurtingUs.push(intel.worstExposureInsight);
    }
    if (hurtingUs.length > 0) {
      lines.push({ type: "spacer" });
      lines.push({ type: "section", text: "HOW THEY HURT US" });
      for (const h of hurtingUs) {
        lines.push({ type: "bullet", text: h });
      }
    }
  }

  // LONGEST SCORING RUN — only shown when ≥3 consecutive scores found.
  // Both teams are named when their longest runs are the same length.
  const { longestFor, longestOpp } = deriveScoringRuns(events, homeTeam, awayTeam, "FULL");
  const runs = [longestFor, longestOpp]
    .filter((r): r is NonNullable<typeof r> => r != null && r.count >= 3);
  const topCount = Math.max(0, ...runs.map((r) => r.count));
  const topRuns = runs.filter((r) => r.count === topCount);

  if (topRuns.length > 0) {
    const runText = (r: (typeof topRuns)[number]) =>
      `${r.team === "HOME" ? homeTeam : awayTeam} ${fmtRunWindow(r)}`;
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "LONGEST SCORING RUN" });
    lines.push({
      type: "body",
      text: topRuns.length === 2
        ? `${homeTeam} and ${awayTeam} each hit ${topCount} unanswered scores (${runText(topRuns[0])}; ${runText(topRuns[1])}).`
        : `${topRuns[0].team === "HOME" ? homeTeam : awayTeam} hit ${topCount} unanswered scores (${fmtRunWindow(topRuns[0])}).`,
    });
  }

  // No MATCH STORY section: its sentences ("led for most of the match",
  // "managed the game well") were inferred from the final margin alone. The
  // result and margin are already stated under FINAL RESULT.

  // COACHING PRIORITIES — intelligence first, basic stats fill remainder
  const priorities: string[] = [];

  if (intel && !intel.lowSampleWarning) {
    for (const p of intel.coachingPriorities) {
      if (priorities.length >= 3) break;
      priorities.push(p);
    }
  }

  if (priorities.length < 3 && s.wides >= 4) priorities.push("Shot selection and accuracy — work from closer positions");
  if (priorities.length < 3 && s.freesConceded >= 8) priorities.push("Tackle and footwork discipline — reduce the foul count");
  if (priorities.length < 3 && s.kickoutTotal >= 5 && s.kickoutPct <= 45) {
    priorities.push(`${restartWord.charAt(0).toUpperCase()}${restartWord.slice(1)} structure — and press their restart`);
  }
  if (priorities.length < 3 && s.turnoversLost - s.turnoversWon >= 3) priorities.push("Possession retention under pressure — reduce giveaways");
  if (priorities.length < 3 && s.attempts >= 5 && s.conversionPct <= 45) priorities.push("Shot quality and decision-making in front of goal");
  // Reinforce what's working
  if (priorities.length < 3 && s.kickoutTotal >= 5 && s.kickoutPct >= 60) {
    priorities.push(`Keep the ${restartWord} structure — it is a platform to build from`);
  }
  if (priorities.length < 3 && s.turnoversWon - s.turnoversLost >= 3) {
    priorities.push("Maintain the turnover intensity — this is a competitive edge");
  }
  if (priorities.length < 3 && s.conversionPct >= 65 && s.attempts >= 5) {
    priorities.push("Keep the shot quality high");
  }
  // Fallbacks
  const priorityFallbacks = [
    "Work every second ball — dominate the breakdown",
    "Maintain the intensity across all 70 minutes",
    "Keep building collective structure in training",
  ];
  for (const f of priorityFallbacks) {
    if (priorities.length >= 3) break;
    priorities.push(f);
  }

  lines.push({ type: "spacer" });
  lines.push({ type: "section", text: "COACHING PRIORITIES" });
  for (const p of priorities.slice(0, 3)) {
    lines.push({ type: "arrow", text: p });
  }

  // SHOT MAPS
  lines.push({ type: "spacer" });
  lines.push({ type: "section", text: "SHOT MAPS" });
  lines.push({ type: "miniShotMaps", homeTeam, awayTeam, data: buildMiniShotMapData(events) });

  // PLAYER NOTES
  appendPlayerNotes(buildPlayerNotes(events), lines, restartWord);

  return lines;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function deriveCoachingBrief(input: CoachingBriefInput): CoachingBriefLine[] {
  const { loggedEvents, matchState, homeTeamName, awayTeamName, isHurlingMode } = input;
  const home = homeTeamName.trim() || "Team A";
  const away = awayTeamName.trim() || "Team B";

  if (matchState === "PRE_MATCH") return [];

  const reportEvents =
    matchState === "HALF_TIME"
      ? loggedEvents.filter(e => e.half === 1)
      : loggedEvents;

  if (reportEvents.length === 0) {
    return [{ type: "body", text: "No match data yet — keep logging." }];
  }

  if (matchState === "FULL_TIME") {
    return deriveFullTimeSummary(reportEvents, home, away, isHurlingMode, input.intelligence);
  }

  return deriveHalftimeNotes(reportEvents, home, away, isHurlingMode, input.intelligence);
}
