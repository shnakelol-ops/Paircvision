/**
 * teamStatsViews.ts
 *
 * Canonical team-level statistics blocks for summary tables and share cards.
 * Restart / turnover / possession percentages come from MatchReport views.
 * Tag and shot sub-type counts are centralized here (not in renderers).
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { ChainableEvent } from "../chains/chain-types";
import type { MatchReport } from "./matchReport";
import type { MetricFraction } from "./report-types";
import { fraction } from "./report-types";
import {
  viewMirroredPossessionCounts,
  viewRestartShare,
  viewTurnoverShare,
} from "./reportViews";

// ─── Team perspective helpers ─────────────────────────────────────────────────

export function viewRestartShareForTeam<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): MetricFraction {
  if (team === "FOR") return viewRestartShare(report);
  const f = viewRestartShare(report);
  return fraction(f.den - f.num, f.den);
}

export function viewTurnoverShareForTeam<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): MetricFraction {
  if (team === "FOR") return viewTurnoverShare(report);
  const f = viewTurnoverShare(report);
  return fraction(f.den - f.num, f.den);
}

export type TeamMirroredCounts = {
  kickoutsWon: number;
  kickoutsLost: number;
  kickoutsTotal: number;
  turnoversWon: number;
  turnoversLost: number;
  turnoversTotal: number;
};

export function viewMirroredCountsForTeam<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): TeamMirroredCounts {
  if (team === "FOR") {
    const m = viewMirroredPossessionCounts(report);
    return {
      kickoutsWon: m.kickoutsWon,
      kickoutsLost: m.kickoutsLost,
      kickoutsTotal: m.kickoutsTotal,
      turnoversWon: m.turnoversWon,
      turnoversLost: m.turnoversLost,
      turnoversTotal: m.turnoversTotal,
    };
  }
  let kickoutsWon = 0;
  let kickoutsLost = 0;
  let turnoversWon = 0;
  let turnoversLost = 0;
  for (const e of report.events) {
    if (e.kind === "KICKOUT_WON" && e.teamSide === "OPP") kickoutsWon++;
    else if (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "FOR") kickoutsWon++;
    else if (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP") kickoutsLost++;
    else if (e.kind === "KICKOUT_WON" && e.teamSide === "FOR") kickoutsLost++;
    else if (e.kind === "TURNOVER_WON" && e.teamSide === "OPP") turnoversWon++;
    else if (e.kind === "TURNOVER_LOST" && e.teamSide === "FOR") turnoversWon++;
    else if (e.kind === "TURNOVER_LOST" && e.teamSide === "OPP") turnoversLost++;
    else if (e.kind === "TURNOVER_WON" && e.teamSide === "FOR") turnoversLost++;
  }
  return {
    kickoutsWon,
    kickoutsLost,
    kickoutsTotal: kickoutsWon + kickoutsLost,
    turnoversWon,
    turnoversLost,
    turnoversTotal: turnoversWon + turnoversLost,
  };
}

// ─── Shooting conversion ──────────────────────────────────────────────────────

const SHOT_KINDS: MatchEventKind[] = [
  "SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT", "FREE_MISSED", "FREE_SCORED",
];
const SCORE_KINDS: MatchEventKind[] = [
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
];

export function viewShootingConversion<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): MetricFraction {
  const own = report.events.filter(
    (e) => e.teamSide === team && !e.id.includes("-instant-score-"),
  );
  const shots = own.filter((e) => SHOT_KINDS.includes(e.kind)).length;
  const scores = own.filter((e) => SCORE_KINDS.includes(e.kind)).length;
  return fraction(scores, shots);
}

export function viewShootingConversionLabel(f: MetricFraction): string {
  return f.den > 0 ? `${f.pct}%` : "—";
}

// ─── Tag / kind counting (canonical location for summary blocks) ───────────────

type TaggedEvent = ChainableEvent & { tags?: string[] | null };

function countKinds(evts: readonly TaggedEvent[], ...kinds: MatchEventKind[]): number {
  const set = new Set(kinds);
  return evts.filter((e) => set.has(e.kind)).length;
}

function hasTag(tags: readonly string[] | null | undefined, t: string): boolean {
  return !!tags?.includes(t);
}

function countTagOnKinds(
  evts: readonly TaggedEvent[],
  tag: string,
  ...kinds: MatchEventKind[]
): number {
  const set = new Set(kinds);
  return evts.filter((e) => set.has(e.kind) && hasTag(e.tags, tag)).length;
}

function countKindWithAnyTag(
  evts: readonly TaggedEvent[],
  kind: MatchEventKind,
  ...tags: string[]
): number {
  return evts.filter(
    (e) => e.kind === kind && tags.some((t) => hasTag(e.tags, t)),
  ).length;
}

type ScoreResult = { goals: number; points: number; total: number };

function scoreFromEvents(evts: readonly TaggedEvent[]): ScoreResult {
  let goals = 0;
  let points = 0;
  for (const e of evts) {
    if (e.kind === "GOAL") goals++;
    else if (e.kind === "POINT" || e.kind === "FREE_SCORED") points++;
    else if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") points += 2;
  }
  return { goals, points, total: goals * 3 + points };
}

// ─── Summary stats block (PDF match summary table) ────────────────────────────

export type TeamSummaryBlock = {
  goals: number;
  points: number;
  twoPointers: number;
  scoreTotal: number;
  shots: number;
  wides: number;
  conv: string;
  shotShort: number;
  shotPost: number;
  shot45: number;
  shotBlock: number;
  koWon: number;
  koCon: number;
  koPct: string;
  koCleanWon: number;
  koBreakWon: number;
  koCleanLost: number;
  koBreakLost: number;
  koFoulWon: number;
  koFoulCon: number;
  koKickedDead: number;
  koDeadWon: number;
  toWon: number;
  toLost: number;
  netTo: number;
  toTacklePress: number;
  toSwarmInt: number;
  toUnforced: number;
  toSlackKpHp: number;
  toOcStripped: number;
  freesWon: number;
  freesCon: number;
  freeScored: number;
  freeMissed: number;
};

export function buildTeamSummaryBlock<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): TeamSummaryBlock {
  const ownEvts = report.events.filter(
    (e) => e.teamSide === team && !e.id.includes("-instant-score-"),
  ) as TaggedEvent[];
  const otherTeam = team === "FOR" ? "OPP" : "FOR";
  const otherEvts = report.events.filter(
    (e) => e.teamSide === otherTeam && !e.id.includes("-instant-score-"),
  ) as TaggedEvent[];

  const scoreR = scoreFromEvents(ownEvts);
  const shots = countKinds(ownEvts, ...SHOT_KINDS);
  const mirrored = viewMirroredCountsForTeam(report, team);
  const koShare = viewRestartShareForTeam(report, team);

  const koWon = mirrored.kickoutsWon;
  const koCon = mirrored.kickoutsLost;
  const toWon = mirrored.turnoversWon;
  const toLost = mirrored.turnoversLost;

  const freesWon = countKinds(ownEvts, "FREE_WON") + countKinds(otherEvts, "FREE_CONCEDED");
  const freesCon = countKinds(ownEvts, "FREE_CONCEDED") + countKinds(otherEvts, "FREE_WON");

  return {
    goals: scoreR.goals,
    points: scoreR.points,
    twoPointers: countKinds(ownEvts, "TWO_POINTER", "FORTY_FIVE_TWO_POINT"),
    scoreTotal: scoreR.total,
    shots,
    wides: countKinds(ownEvts, "WIDE"),
    conv: viewShootingConversionLabel(viewShootingConversion(report, team)),
    shotShort: countTagOnKinds(ownEvts, "SHORT", ...SHOT_KINDS),
    shotPost: countTagOnKinds(ownEvts, "POST", ...SHOT_KINDS),
    shot45: countTagOnKinds(ownEvts, "FORTY_FIVE", ...SHOT_KINDS),
    shotBlock: countKindWithAnyTag(ownEvts, "SHOT", "BLOCK_SAVE", "BLOCKED")
      + countKindWithAnyTag(ownEvts, "WIDE", "BLOCK_SAVE", "BLOCKED"),
    koWon,
    koCon,
    koPct: koShare.den > 0 ? `${koShare.pct}%` : "—",
    koCleanWon: countKindWithAnyTag(ownEvts, "KICKOUT_WON", "CLEAN")
      + countKindWithAnyTag(otherEvts, "KICKOUT_CONCEDED", "CLEAN"),
    koBreakWon: countKindWithAnyTag(ownEvts, "KICKOUT_WON", "BREAK")
      + countKindWithAnyTag(otherEvts, "KICKOUT_CONCEDED", "BREAK"),
    koCleanLost: countKindWithAnyTag(ownEvts, "KICKOUT_CONCEDED", "CLEAN")
      + countKindWithAnyTag(otherEvts, "KICKOUT_WON", "CLEAN"),
    koBreakLost: countKindWithAnyTag(ownEvts, "KICKOUT_CONCEDED", "BREAK")
      + countKindWithAnyTag(otherEvts, "KICKOUT_WON", "BREAK"),
    koFoulWon: countKindWithAnyTag(ownEvts, "KICKOUT_WON", "FOUL_WON")
      + countKindWithAnyTag(otherEvts, "KICKOUT_CONCEDED", "FOUL_WON", "FOUL_CONCEDED"),
    koFoulCon: countKindWithAnyTag(ownEvts, "KICKOUT_CONCEDED", "FOUL_CONCEDED")
      + countKindWithAnyTag(otherEvts, "KICKOUT_WON", "FOUL_CONCEDED", "FOUL_WON"),
    koKickedDead: countKindWithAnyTag(ownEvts, "KICKOUT_CONCEDED", "KICKED_DEAD")
      + countKindWithAnyTag(otherEvts, "KICKOUT_WON", "KICKED_DEAD"),
    koDeadWon: countKindWithAnyTag(ownEvts, "KICKOUT_WON", "KICKED_DEAD")
      + countKindWithAnyTag(otherEvts, "KICKOUT_CONCEDED", "KICKED_DEAD"),
    toWon,
    toLost,
    netTo: toWon - toLost,
    toTacklePress: countKindWithAnyTag(ownEvts, "TURNOVER_WON", "TACKLE", "PRESS")
      + countKindWithAnyTag(otherEvts, "TURNOVER_LOST", "TACKLE", "PRESS"),
    toSwarmInt: countKindWithAnyTag(ownEvts, "TURNOVER_WON", "SWARM", "INTERCEPT")
      + countKindWithAnyTag(otherEvts, "TURNOVER_LOST", "SWARM", "INTERCEPT"),
    toUnforced: countKindWithAnyTag(ownEvts, "TURNOVER_LOST", "UNFORCED")
      + countKindWithAnyTag(otherEvts, "TURNOVER_WON", "UNFORCED"),
    toSlackKpHp: countKindWithAnyTag(ownEvts, "TURNOVER_LOST", "SLACK_KICK_PASS", "SLACK_HAND_PASS")
      + countKindWithAnyTag(otherEvts, "TURNOVER_WON", "SLACK_KICK_PASS", "SLACK_HAND_PASS"),
    toOcStripped: countKindWithAnyTag(ownEvts, "TURNOVER_LOST", "OVERCARRIED", "STRIPPED")
      + countKindWithAnyTag(otherEvts, "TURNOVER_WON", "OVERCARRIED", "STRIPPED"),
    freesWon,
    freesCon,
    freeScored: ownEvts.filter((e) => e.kind === "FREE_SCORED").length,
    freeMissed: ownEvts.filter((e) => e.kind === "FREE_MISSED").length,
  };
}

// ─── Share card breakdown ─────────────────────────────────────────────────────

export type ShareCardTeamBreakdown = {
  shots: number;
  scores: number;
  wides: number;
  goals: number;
  points: number;
  twoPt: number;
  short: number;
  post: number;
  fortyFive: number;
  blocked: number;
  kickWon: number;
  kickLost: number;
  kickWinPct: string;
  kickClean: number;
  kickBreak: number;
  kickFoulWon: number;
  kickFoulConceded: number;
  kickDead: number;
  toWon: number;
  toLost: number;
  toForced: number;
  toUnforced: number;
  toTackle: number;
  toPress: number;
  toSwarm: number;
  toIntercept: number;
  toSlackKP: number;
  toSlackHP: number;
  toOvercarried: number;
  toStripped: number;
  freesFor: number;
  freesAgainst: number;
  freeScored: number;
  freeMissed: number;
  yellow: number;
  black: number;
  red: number;
};

function initShareBreakdown(): ShareCardTeamBreakdown {
  return {
    shots: 0, scores: 0, wides: 0, goals: 0, points: 0, twoPt: 0,
    short: 0, post: 0, fortyFive: 0, blocked: 0,
    kickWon: 0, kickLost: 0, kickWinPct: "0%",
    kickClean: 0, kickBreak: 0, kickFoulWon: 0, kickFoulConceded: 0, kickDead: 0,
    toWon: 0, toLost: 0, toForced: 0, toUnforced: 0,
    toTackle: 0, toPress: 0, toSwarm: 0, toIntercept: 0,
    toSlackKP: 0, toSlackHP: 0, toOvercarried: 0, toStripped: 0,
    freesFor: 0, freesAgainst: 0, freeScored: 0, freeMissed: 0,
    yellow: 0, black: 0, red: 0,
  };
}

function applyShareTagCounts(
  b: ShareCardTeamBreakdown,
  e: TaggedEvent,
): void {
  const tags = e.tags;
  const k = e.kind;
  if (k === "SHOT") {
    b.shots++;
    if (hasTag(tags, "SHORT")) b.short++;
    if (hasTag(tags, "POST")) b.post++;
    if (hasTag(tags, "FORTY_FIVE")) b.fortyFive++;
    if (hasTag(tags, "BLOCKED")) b.blocked++;
  }
  if (k === "WIDE") { b.wides++; b.shots++; }
  if (k === "GOAL") { b.goals++; b.scores++; b.shots++; }
  if (k === "POINT") { b.points++; b.scores++; b.shots++; }
  if (k === "TWO_POINTER" || k === "FORTY_FIVE_TWO_POINT") { b.twoPt++; b.scores++; b.shots++; }
  if (k === "FREE_SCORED") b.freeScored++;
  if (k === "FREE_MISSED") b.freeMissed++;
  if (k === "FREE_WON") b.freesFor++;
  if (k === "FREE_CONCEDED") b.freesAgainst++;
  if (k === "KICKOUT_WON") {
    if (hasTag(tags, "CLEAN")) b.kickClean++;
    if (hasTag(tags, "BREAK")) b.kickBreak++;
    if (hasTag(tags, "FOUL_WON")) b.kickFoulWon++;
  }
  if (k === "KICKOUT_CONCEDED") {
    if (hasTag(tags, "CLEAN")) b.kickClean++;
    if (hasTag(tags, "BREAK")) b.kickBreak++;
    if (hasTag(tags, "FOUL_CONCEDED")) b.kickFoulConceded++;
    if (hasTag(tags, "KICKED_DEAD")) b.kickDead++;
  }
  if (k === "TURNOVER_WON") {
    if (hasTag(tags, "FORCED")) b.toForced++;
    if (hasTag(tags, "UNFORCED")) b.toUnforced++;
    if (hasTag(tags, "TACKLE")) b.toTackle++;
    if (hasTag(tags, "PRESS")) b.toPress++;
    if (hasTag(tags, "SWARM")) b.toSwarm++;
    if (hasTag(tags, "INTERCEPT")) b.toIntercept++;
  }
  if (k === "TURNOVER_LOST") {
    if (hasTag(tags, "FORCED")) b.toForced++;
    if (hasTag(tags, "UNFORCED")) b.toUnforced++;
    if (hasTag(tags, "SLACK_KICK_PASS")) b.toSlackKP++;
    if (hasTag(tags, "SLACK_HAND_PASS")) b.toSlackHP++;
    if (hasTag(tags, "OVERCARRIED")) b.toOvercarried++;
    if (hasTag(tags, "STRIPPED")) b.toStripped++;
  }
  if (k === "YELLOW_CARD") b.yellow++;
  if (k === "BLACK_CARD") b.black++;
  if (k === "RED_CARD") b.red++;
}

export function buildShareCardBreakdown<T extends ChainableEvent>(
  report: MatchReport<T>,
): { HOME: ShareCardTeamBreakdown; AWAY: ShareCardTeamBreakdown } {
  const r = {
    HOME: initShareBreakdown(),
    AWAY: initShareBreakdown(),
  };

  let hasOppKickoutEvents = false;
  let hasOppTurnoverEvents = false;
  let hasOppFreeEvents = false;

  for (const e of report.events) {
    if (e.teamSide === "OPP") {
      const k = e.kind;
      if (k === "KICKOUT_WON" || k === "KICKOUT_CONCEDED") hasOppKickoutEvents = true;
      if (k === "TURNOVER_WON" || k === "TURNOVER_LOST") hasOppTurnoverEvents = true;
      if (k === "FREE_WON" || k === "FREE_CONCEDED" || k === "FREE_SCORED" || k === "FREE_MISSED") {
        hasOppFreeEvents = true;
      }
    }
  }

  for (const e of report.events as TaggedEvent[]) {
    const team = e.teamSide === "FOR" ? "HOME" : "AWAY";
    const b = r[team];
    applyShareTagCounts(b, e);

    if (team === "HOME") {
      if (!hasOppKickoutEvents && e.kind === "KICKOUT_CONCEDED") r.AWAY.kickWon++;
      if (!hasOppKickoutEvents && e.kind === "KICKOUT_WON") r.AWAY.kickLost++;
      if (!hasOppTurnoverEvents && e.kind === "TURNOVER_LOST") r.AWAY.toWon++;
      if (!hasOppTurnoverEvents && e.kind === "TURNOVER_WON") r.AWAY.toLost++;
      if (!hasOppFreeEvents && e.kind === "FREE_CONCEDED") r.AWAY.freesFor++;
      if (!hasOppFreeEvents && e.kind === "FREE_WON") r.AWAY.freesAgainst++;
    } else {
      if (!hasOppKickoutEvents && e.kind === "KICKOUT_CONCEDED") r.HOME.kickWon++;
      if (!hasOppKickoutEvents && e.kind === "KICKOUT_WON") r.HOME.kickLost++;
      if (!hasOppTurnoverEvents && e.kind === "TURNOVER_LOST") r.HOME.toWon++;
      if (!hasOppTurnoverEvents && e.kind === "TURNOVER_WON") r.HOME.toLost++;
      if (!hasOppFreeEvents && e.kind === "FREE_CONCEDED") r.HOME.freesFor++;
      if (!hasOppFreeEvents && e.kind === "FREE_WON") r.HOME.freesAgainst++;
    }
  }

  const homeMirrored = viewMirroredCountsForTeam(report, "FOR");
  const awayMirrored = viewMirroredCountsForTeam(report, "OPP");
  r.HOME.kickWon = homeMirrored.kickoutsWon;
  r.HOME.kickLost = homeMirrored.kickoutsLost;
  r.AWAY.kickWon = awayMirrored.kickoutsWon;
  r.AWAY.kickLost = awayMirrored.kickoutsLost;
  r.HOME.toWon = homeMirrored.turnoversWon;
  r.HOME.toLost = homeMirrored.turnoversLost;
  r.AWAY.toWon = awayMirrored.turnoversWon;
  r.AWAY.toLost = awayMirrored.turnoversLost;

  const homeKoShare = viewRestartShareForTeam(report, "FOR");
  const awayKoShare = viewRestartShareForTeam(report, "OPP");
  r.HOME.kickWinPct = homeKoShare.den > 0 ? `${homeKoShare.pct}%` : "0%";
  r.AWAY.kickWinPct = awayKoShare.den > 0 ? `${awayKoShare.pct}%` : "0%";

  return r;
}

// ─── Coaching brief stats ───────────────────────────────────────────────────────

export type CoachingBriefStats = {
  turnoversWon: number;
  turnoversLost: number;
  kickoutsWon: number;
  kickoutsLost: number;
  kickoutTotal: number;
  kickoutPct: number;
  conversionPct: number;
  attempts: number;
  scores: number;
  goals: number;
  wides: number;
  freesWon: number;
  freesConceded: number;
};

export function viewCoachingBriefStats<T extends ChainableEvent>(
  report: MatchReport<T>,
): CoachingBriefStats {
  const mirrored = viewMirroredCountsForTeam(report, "FOR");
  const shooting = viewShootingConversion(report, "FOR");
  const own = report.events.filter((e) => e.teamSide === "FOR");
  let goals = 0;
  let scores = 0;
  let attempts = 0;
  let wides = 0;
  let freesWon = 0;
  let freesConceded = 0;
  for (const e of own) {
    if (e.kind === "GOAL") { goals++; scores++; attempts++; }
    else if (e.kind === "POINT") { scores++; attempts++; }
    else if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") { scores++; attempts++; }
    else if (e.kind === "WIDE") { wides++; attempts++; }
    else if (e.kind === "SHOT") { attempts++; }
    else if (e.kind === "FREE_WON") freesWon++;
    else if (e.kind === "FREE_CONCEDED") freesConceded++;
  }
  const kickoutPct = viewRestartShare(report).pct;
  return {
    turnoversWon: mirrored.turnoversWon,
    turnoversLost: mirrored.turnoversLost,
    kickoutsWon: mirrored.kickoutsWon,
    kickoutsLost: mirrored.kickoutsLost,
    kickoutTotal: mirrored.kickoutsTotal,
    kickoutPct,
    conversionPct: shooting.pct,
    attempts,
    scores,
    goals,
    wides,
    freesWon,
    freesConceded,
  };
}

export type CoachingScoringRun = {
  team: "HOME" | "AWAY";
  count: number;
  startMin: number;
  endMin: number;
  period: 1 | 2;
};

export function viewCoachingScoringRuns<T extends ChainableEvent>(
  report: MatchReport<T>,
): { longestFor: CoachingScoringRun | null; longestOpp: CoachingScoringRun | null } {
  const sr = report.chain.scoringRuns;
  const mapRun = (run: typeof sr.longestRunFor, team: "HOME" | "AWAY"): CoachingScoringRun | null => {
    if (run == null) return null;
    const period = run.period === "1H" ? 1 : 2;
    const startMin = Math.max(1, Math.floor(run.startClockSeconds / 60) + 1);
    const endMin = Math.max(1, Math.floor(run.endClockSeconds / 60) + 1);
    return { team, count: run.count, startMin, endMin, period };
  };
  return {
    longestFor: mapRun(sr.longestRunFor, "HOME"),
    longestOpp: mapRun(sr.longestRunOpp, "AWAY"),
  };
}
