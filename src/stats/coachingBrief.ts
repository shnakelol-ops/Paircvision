import type { MatchEventKind } from "../core/stats/stats-event-model";
import type { MatchState } from "../core/match/match-state-store";

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
};

export type CoachingBriefLine =
  | { type: "section"; text: string }
  | { type: "body"; text: string }
  | { type: "bullet"; text: string }
  | { type: "arrow"; text: string }
  | { type: "spacer" };

export type CoachingBriefInput = {
  loggedEvents: readonly CBEvent[];
  matchState: MatchState;
  homeTeamName: string;
  awayTeamName: string;
  isHurlingMode: boolean;
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
};

// ─── Event helpers ────────────────────────────────────────────────────────────

function isHomeEvent(e: CBEvent): boolean {
  return e.team === "HOME" || e.id.startsWith("team-home-");
}

function isAwayEvent(e: CBEvent): boolean {
  return e.team === "AWAY" || e.id.startsWith("team-away-");
}

function computeScore(events: readonly CBEvent[], forHome: boolean): TeamScore {
  let goals = 0;
  let points = 0;
  for (const e of events) {
    if (forHome ? !isHomeEvent(e) : !isAwayEvent(e)) continue;
    if (e.kind === "GOAL") goals += 1;
    else if (e.kind === "POINT") points += 1;
    else if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") points += 2;
  }
  return { goals, points, total: goals * 3 + points };
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

// ─── Stats aggregation ────────────────────────────────────────────────────────

function computeMatchStats(events: readonly CBEvent[]): MatchStats {
  let goals = 0, attempts = 0, scores = 0, wides = 0;
  let turnoversWon = 0, turnoversLost = 0;
  let kickoutsWon = 0, kickoutsLost = 0;
  let freesWon = 0, freesConceded = 0;

  for (const e of events) {
    if (!isHomeEvent(e)) continue;
    if (e.kind === "GOAL") { goals += 1; scores += 1; attempts += 1; }
    else if (e.kind === "POINT") { scores += 1; attempts += 1; }
    else if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") { scores += 1; attempts += 1; }
    else if (e.kind === "WIDE") { wides += 1; attempts += 1; }
    else if (e.kind === "SHOT") { attempts += 1; }
    else if (e.kind === "TURNOVER_WON") turnoversWon += 1;
    else if (e.kind === "TURNOVER_LOST") turnoversLost += 1;
    else if (e.kind === "KICKOUT_WON") kickoutsWon += 1;
    else if (e.kind === "KICKOUT_CONCEDED") kickoutsLost += 1;
    else if (e.kind === "FREE_WON") freesWon += 1;
    else if (e.kind === "FREE_CONCEDED") freesConceded += 1;
  }

  const kickoutTotal = kickoutsWon + kickoutsLost;
  return {
    homeScore: computeScore(events, true),
    awayScore: computeScore(events, false),
    goals,
    attempts,
    scores,
    wides,
    conversionPct: attempts > 0 ? Math.round((scores / attempts) * 100) : 0,
    turnoversWon,
    turnoversLost,
    kickoutsWon,
    kickoutsLost,
    kickoutTotal,
    kickoutPct: kickoutTotal > 0 ? Math.round((kickoutsWon / kickoutTotal) * 100) : 0,
    freesWon,
    freesConceded,
  };
}

// ─── Scoring run detection (turning point) ────────────────────────────────────

function deriveScoringRuns(events: readonly CBEvent[]): { longestFor: ScoringRun | null; longestOpp: ScoringRun | null } {
  const SCORE_KINDS = new Set<MatchEventKind>(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"]);

  const scoreEvents = [...events]
    .filter(e => SCORE_KINDS.has(e.kind) && (isHomeEvent(e) || isAwayEvent(e)))
    .sort((a, b) => {
      if (a.half !== b.half) return a.half - b.half;
      return (a.matchClockSeconds ?? a.timestamp) - (b.matchClockSeconds ?? b.timestamp);
    });

  if (scoreEvents.length < 3) return { longestFor: null, longestOpp: null };

  const runs: ScoringRun[] = [];
  let runTeam: "HOME" | "AWAY" = isHomeEvent(scoreEvents[0]) ? "HOME" : "AWAY";
  let runCount = 1;
  let runStartSecs = scoreEvents[0].matchClockSeconds ?? scoreEvents[0].timestamp;
  let runPeriod: 1 | 2 = scoreEvents[0].half;

  const commitRun = (endSecs: number) => {
    if (runCount >= 2) {
      runs.push({
        team: runTeam,
        count: runCount,
        startMin: Math.max(1, Math.floor(runStartSecs / 60) + 1),
        endMin: Math.max(1, Math.floor(endSecs / 60) + 1),
        period: runPeriod,
      });
    }
  };

  for (let i = 1; i < scoreEvents.length; i++) {
    const e = scoreEvents[i];
    const team: "HOME" | "AWAY" = isHomeEvent(e) ? "HOME" : "AWAY";
    const secs = e.matchClockSeconds ?? e.timestamp;
    if (team === runTeam) {
      runCount += 1;
    } else {
      commitRun(scoreEvents[i - 1].matchClockSeconds ?? scoreEvents[i - 1].timestamp);
      runTeam = team;
      runCount = 1;
      runStartSecs = secs;
      runPeriod = e.half;
    }
  }
  commitRun(scoreEvents[scoreEvents.length - 1].matchClockSeconds ?? scoreEvents[scoreEvents.length - 1].timestamp);

  const bestOf = (arr: ScoringRun[]): ScoringRun | null =>
    arr.length === 0 ? null : arr.reduce((a, b) => (b.count > a.count ? b : a));

  return {
    longestFor: bestOf(runs.filter(r => r.team === "HOME")),
    longestOpp: bestOf(runs.filter(r => r.team === "AWAY")),
  };
}

// ─── Player notes ─────────────────────────────────────────────────────────────

function buildPlayerNotes(events: readonly CBEvent[]): PlayerNote[] {
  const map = new Map<string, PlayerNote>();

  const resolveLabel = (e: CBEvent): string => {
    const num = typeof e.playerNumber === "number" && isFinite(e.playerNumber) ? `#${e.playerNumber}` : null;
    const name = typeof e.playerName === "string" && e.playerName.trim() ? e.playerName.trim() : null;
    if (num && name) return `${num} ${name}`;
    return name ?? num ?? "Tagged player";
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
    lines.push({ type: "body", text: `Most placed balls won — ${topFrees.label} (${topFrees.freesWon})` });
  }
}

// ─── Match pattern / story ────────────────────────────────────────────────────

function deriveMatchPattern(
  homeScore: TeamScore,
  awayScore: TeamScore,
  homeTeam: string,
  awayTeam: string,
): string | null {
  const total = homeScore.total + awayScore.total;
  if (total < 4) return null;
  const diff = homeScore.total - awayScore.total;

  if (diff === 0) return "The teams are level — the second half is an open contest.";
  if (diff > 5) return `${homeTeam} led throughout and controlled the tempo.`;
  if (diff < -5) return `${awayTeam} led throughout — ${homeTeam} needs a fast response.`;
  if (diff > 0) return `${homeTeam} edged ahead — a close contest that could go either way.`;
  return `${awayTeam} led at the break — ${homeTeam} must improve in the second half.`;
}

function deriveMatchStory(
  homeScore: TeamScore,
  awayScore: TeamScore,
  homeTeam: string,
  awayTeam: string,
): string | null {
  const total = homeScore.total + awayScore.total;
  if (total < 4) return null;
  const diff = homeScore.total - awayScore.total;

  if (diff > 7) return `${homeTeam} controlled the contest and won convincingly.`;
  if (diff >= 3) return `${homeTeam} led for most of the match and managed the game well.`;
  if (diff > 0) return `It was a close contest — ${homeTeam} edged it in the end.`;
  if (diff === 0) return "The teams were evenly matched and shared the spoils.";
  if (diff >= -3) return `It was a close contest — ${awayTeam} took it by the narrowest of margins.`;
  return `${awayTeam} controlled the contest and ran out clear winners.`;
}

// ─── Halftime Notes ───────────────────────────────────────────────────────────

function deriveHalftimeNotes(
  events: readonly CBEvent[],
  homeTeam: string,
  awayTeam: string,
  isHurlingMode: boolean,
): CoachingBriefLine[] {
  const restartWord = isHurlingMode ? "puckout" : "kickout";
  const s = computeMatchStats(events);
  const diff = s.homeScore.total - s.awayScore.total;
  const lines: CoachingBriefLine[] = [];

  // SITUATION
  lines.push({ type: "section", text: "SITUATION" });
  lines.push({ type: "body", text: `${homeTeam}  ${formatScore(s.homeScore)}` });
  lines.push({ type: "body", text: `${awayTeam}  ${formatScore(s.awayScore)}` });
  lines.push({ type: "body", text: formatMargin(s.homeScore, s.awayScore, homeTeam, awayTeam) });

  // WHAT'S WORKING
  const positives: string[] = [];

  if (s.kickoutTotal >= 5 && s.kickoutPct >= 60) {
    positives.push(`${homeTeam} won ${s.kickoutsWon} of ${s.kickoutTotal} ${restartWord}s (${s.kickoutPct}%)`);
  }
  if (s.attempts >= 5 && s.conversionPct >= 65) {
    positives.push(`${homeTeam} converted ${s.conversionPct}% of shots — efficient in front of goal`);
  }
  if (s.turnoversWon - s.turnoversLost >= 3) {
    positives.push(`${homeTeam} won the turnover battle ${s.turnoversWon}–${s.turnoversLost}`);
  }
  if (s.freesWon - s.freesConceded >= 4) {
    positives.push(`${homeTeam} earned ${s.freesWon} placed balls — getting into the right positions`);
  }
  if (s.goals >= 1 && positives.length < 3) {
    positives.push(`${homeTeam} found the net ${s.goals === 1 ? "once" : `${s.goals} times`} — taking the big chances`);
  }
  if (diff > 0 && positives.length < 3) {
    positives.push(`${homeTeam} ahead at the break — momentum is with us`);
  }
  if (positives.length === 0) {
    positives.push(`${homeTeam} stayed in the contest throughout — keep the work rate up`);
  }

  lines.push({ type: "spacer" });
  lines.push({ type: "section", text: "WHAT'S WORKING" });
  for (const p of positives.slice(0, 3)) {
    lines.push({ type: "bullet", text: p });
  }

  // WATCH
  const concerns: string[] = [];

  if (s.wides >= 4) {
    concerns.push(`${homeTeam} missed ${s.wides} shots wide — shot selection`);
  }
  if (s.kickoutTotal >= 5 && s.kickoutPct <= 45) {
    concerns.push(`${homeTeam} retained only ${s.kickoutPct}% of ${restartWord}s — ${awayTeam} winning this battle`);
  }
  if (s.turnoversLost - s.turnoversWon >= 3) {
    concerns.push(`${homeTeam} lost the turnover battle ${s.turnoversLost}–${s.turnoversWon}`);
  }
  if (s.freesConceded >= 8) {
    concerns.push(`${homeTeam} conceded ${s.freesConceded} placed balls — discipline`);
  }
  const { longestOpp } = deriveScoringRuns(events);
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

  // SECOND HALF FOCUS
  const focusItems: string[] = [];
  if (s.wides >= 4) focusItems.push("Take cleaner shots — build attacks from better positions");
  if (s.kickoutTotal >= 5 && s.kickoutPct <= 45) focusItems.push(`Win the ${restartWord} — press their restart high and early`);
  if (s.turnoversLost - s.turnoversWon >= 3) focusItems.push("Protect possession — fewer giveaways in the middle third");
  if (s.freesConceded >= 8) focusItems.push("Stay on your feet — win the ball, not the man");
  if (longestOpp && longestOpp.count >= 3) focusItems.push("Respond fast to their scores — do not let them settle");
  if (s.attempts >= 5 && s.conversionPct <= 45) focusItems.push("Build more attacks from inside the 45 — cut the wide count");

  const focusDefaults = [
    "Maintain the intensity — keep the pressure on",
    "Win every second ball — dominate the breakdown",
    `Back our ${restartWord} structure — keep the platform`,
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

  // MATCH PATTERN
  const pattern = deriveMatchPattern(s.homeScore, s.awayScore, homeTeam, awayTeam);
  if (pattern) {
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "MATCH PATTERN" });
    lines.push({ type: "body", text: pattern });
  }

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
): CoachingBriefLine[] {
  const restartWord = isHurlingMode ? "puckout" : "kickout";
  const s = computeMatchStats(events);
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

  // BIGGEST POSITIVE
  let biggestPositive: string | null = null;
  if (s.kickoutTotal >= 5 && s.kickoutPct >= 60) {
    biggestPositive = `${homeTeam} won ${s.kickoutsWon} of ${s.kickoutTotal} ${restartWord}s (${s.kickoutPct}%) — controlled the restarts throughout.`;
  } else if (s.attempts >= 5 && s.conversionPct >= 65) {
    biggestPositive = `${homeTeam} converted ${s.conversionPct}% of shots — clinical in front of goal.`;
  } else if (s.turnoversWon - s.turnoversLost >= 3) {
    biggestPositive = `${homeTeam} won the turnover battle ${s.turnoversWon}–${s.turnoversLost} — controlled possession.`;
  } else if (s.freesWon - s.freesConceded >= 4) {
    biggestPositive = `${homeTeam} earned ${s.freesWon} placed balls to ${awayTeam}'s ${s.freesConceded} — a territory advantage all day.`;
  } else if (s.goals >= 1) {
    biggestPositive = `${homeTeam} found the net ${s.goals === 1 ? "once" : `${s.goals} times`} and took the big chances when they came.`;
  } else if (diff > 0) {
    biggestPositive = `${homeTeam} managed the game well and earned the result.`;
  }

  if (biggestPositive) {
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "BIGGEST POSITIVE" });
    lines.push({ type: "body", text: biggestPositive });
  }

  // BIGGEST CONCERN
  let biggestConcern: string | null = null;
  if (s.wides >= 5) {
    biggestConcern = `${homeTeam} missed ${s.wides} shots wide — shot selection and accuracy must improve.`;
  } else if (s.kickoutTotal >= 5 && s.kickoutPct <= 45) {
    biggestConcern = `${homeTeam} retained only ${s.kickoutPct}% of ${restartWord}s — ${awayTeam} controlled the restarts.`;
  } else if (s.turnoversLost - s.turnoversWon >= 3) {
    biggestConcern = `${homeTeam} lost the turnover battle ${s.turnoversLost}–${s.turnoversWon} — possession discipline is a priority.`;
  } else if (s.freesConceded >= 8) {
    biggestConcern = `${homeTeam} conceded ${s.freesConceded} placed balls — the foul count cannot continue at this level.`;
  } else if (s.attempts >= 5 && s.conversionPct <= 45) {
    biggestConcern = `${homeTeam} converted only ${s.conversionPct}% of shots — the scoring did not reflect the work rate.`;
  }

  if (biggestConcern) {
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "BIGGEST CONCERN" });
    lines.push({ type: "body", text: biggestConcern });
  }

  // TURNING POINT — only shown when ≥3 consecutive scores found
  const { longestFor, longestOpp } = deriveScoringRuns(events);
  const topRun =
    longestFor && longestOpp
      ? longestFor.count >= longestOpp.count ? longestFor : longestOpp
      : longestFor ?? longestOpp;

  if (topRun && topRun.count >= 3) {
    const runTeamName = topRun.team === "HOME" ? homeTeam : awayTeam;
    const periodStr = topRun.period === 1 ? "first half" : "second half";
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "TURNING POINT" });
    lines.push({
      type: "body",
      text: `${runTeamName} hit ${topRun.count} unanswered scores in the ${periodStr} (${topRun.startMin}th–${topRun.endMin}th min).`,
    });
  }

  // MATCH STORY
  const story = deriveMatchStory(s.homeScore, s.awayScore, homeTeam, awayTeam);
  if (story) {
    lines.push({ type: "spacer" });
    lines.push({ type: "section", text: "MATCH STORY" });
    lines.push({ type: "body", text: story });
  }

  // COACHING PRIORITIES
  const priorities: string[] = [];
  if (s.wides >= 4) priorities.push("Shot selection and accuracy — work from closer positions");
  if (s.freesConceded >= 8) priorities.push("Tackle and footwork discipline — reduce the foul count");
  if (s.kickoutTotal >= 5 && s.kickoutPct <= 45) {
    priorities.push(`${restartWord.charAt(0).toUpperCase()}${restartWord.slice(1)} structure — and press their restart`);
  }
  if (s.turnoversLost - s.turnoversWon >= 3) priorities.push("Possession retention under pressure — reduce giveaways");
  if (s.attempts >= 5 && s.conversionPct <= 45) priorities.push("Shot quality and decision-making in front of goal");
  // Reinforce what's working
  if (s.kickoutTotal >= 5 && s.kickoutPct >= 60 && priorities.length < 3) {
    priorities.push(`Keep the ${restartWord} structure — it is a platform to build from`);
  }
  if (s.turnoversWon - s.turnoversLost >= 3 && priorities.length < 3) {
    priorities.push("Maintain the turnover intensity — this is a competitive edge");
  }
  if (s.conversionPct >= 65 && s.attempts >= 5 && priorities.length < 3) {
    priorities.push("Keep the shot quality high — the conversion rate is winning games");
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
    return deriveFullTimeSummary(reportEvents, home, away, isHurlingMode);
  }

  return deriveHalftimeNotes(reportEvents, home, away, isHurlingMode);
}
