// reference.mjs — INDEPENDENT reference calculator for the Event Stats ultra test.
//
// Independence contract: this file imports nothing from src/. It reads the
// fixture's *facts* (who acted, what happened) — never PáircVision event kinds,
// teamSide conventions or aggregation functions — and derives every statistic
// from the documented GAA rules and the definitions written next to each metric.
//
// Usage: node reference.mjs <fixture.json> <out-ledger.json>

import { readFileSync, writeFileSync } from "node:fs";

const other = (t) => (t === "FOR" ? "OPP" : "FOR");
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);
const frac = (num, den, definition) => ({ num, den, pct: pct(num, den), definition });

// ─── 1. Facts: fixture taps → semantic facts ───────────────────────────────

const PLACED_SOURCES = new Set(["Free", "Penalty", "Mark", "45", "65"]);

/** Points value of a score under the sport's rules. */
function scoreValue(sport, family, tile) {
  if (family === "GOAL") return 3; // goal = 3 points in football and hurling
  if (family === "TWO_POINT") {
    if (sport === "hurling") throw new Error("hurling has no two-point score");
    return 2; // 2025 football rules: point from outside the 40m arc (incl. 45s)
  }
  return 1;
}

function factFromTap(sport, ev) {
  const base = {
    id: ev.id, half: ev.half, clock: ev.clock, nx: ev.nx, ny: ev.ny,
    player: ev.player ? { team: ev.player.team, number: ev.player.number } : null,
  };
  switch (ev.family) {
    case "GOAL": case "POINT": case "TWO_POINT":
      return { ...base, type: "score", team: ev.row, value: scoreValue(sport, ev.family, ev.tile), goal: ev.family === "GOAL",
        source: ev.tile, placed: PLACED_SOURCES.has(ev.tile) };
    case "WIDE":
      return { ...base, type: "wide", team: ev.row, source: ev.tile, placed: PLACED_SOURCES.has(ev.tile) };
    case "SHOT":
      // Event Stats' Shot tiles (Short / Block/Save / Post) record no source.
      return { ...base, type: "shot", team: ev.row, outcome: ev.tile, source: null, placed: false };
    case "RESTART":
      return { ...base, type: "restart", owner: ev.owner, winner: ev.row, method: ev.tile };
    case "FORTY_FIVE":
      return { ...base, type: "fortyFive", winner: ev.row };
    case "SIDELINE":
      return { ...base, type: "sideline", winner: ev.row };
    case "TURNOVER":
      return { ...base, type: "turnover", winner: ev.row, loser: other(ev.row), method: ev.tile };
    case "FREE":
      return { ...base, type: "free", awardedTo: ev.tile === "Won" ? "FOR" : "OPP" };
    case "DISCIPLINE":
      return { ...base, type: "card", team: ev.row, card: ev.tile };
    default:
      throw new Error(`unknown family ${ev.family}`);
  }
}

function applyReviewOp(facts, op) {
  const i = facts.findIndex((f) => f.id === op.targetId);
  if (i < 0) throw new Error(`review op target missing ${op.targetId}`);
  if (op.op === "delete") { facts.splice(i, 1); return; }
  const f = facts[i];
  const t = op.truthAfter;
  if (t.action === "score") {
    // The Edit dialog changes only the type; it offers no source field. A
    // former WIDE keeps its "Play" source; a former SHOT never had a source,
    // so the honest expectation is "source unknown".
    const source = f.type === "wide" ? f.source : null;
    facts[i] = { ...f, type: "score", team: f.team, value: 1, goal: false, source, placed: source != null && PLACED_SOURCES.has(source), editedFrom: f.type };
  } else if (t.action === "restart") {
    facts[i] = { ...f, winner: t.winner, editedFrom: "restart-outcome" };
  } else if (t.action === "turnover") {
    facts[i] = { ...f, winner: t.winner, loser: other(t.winner), editedFrom: "turnover-direction" };
  } else throw new Error(`unsupported edit ${t.action}`);
}

export function buildFacts(fixture) {
  const facts = fixture.steps
    .filter((s) => s.op === "tag" && !s.ev.erroneous)
    .map((s) => factFromTap(fixture.sport, s.ev));
  for (const op of fixture.reviewOps ?? []) applyReviewOp(facts, op);
  // Chronological order: half, then clock (stable on ties = tap order).
  return facts.map((f, i) => ({ ...f, _seq: i })).sort((a, b) => a.half - b.half || a.clock - b.clock || a._seq - b._seq);
}

// ─── 2. Statistics ──────────────────────────────────────────────────────────

const isAttempt = (f) => f.type === "score" || f.type === "wide" || f.type === "shot";
const restartTaken = (f) => f.type === "restart";

/** Is nx in `team`'s own (defensive) half during `half`? */
function inOwnHalf(fixture, team, half, nx) {
  const forHigh = fixture.attackDirection === "right" ? half === 1 : half === 2;
  const high = team === "FOR" ? forHigh : !forHigh;
  return high ? nx < 0.5 : nx >= 0.5;
}

function scoreLine(facts, team) {
  const s = facts.filter((f) => f.type === "score" && f.team === team);
  const goals = s.filter((f) => f.goal).length;
  const points = s.filter((f) => !f.goal).reduce((a, f) => a + f.value, 0);
  return { goals, points, total: goals * 3 + points, text: `${goals}-${String(points).padStart(2, "0")}`, scores: s.length };
}

/** Documented-rule origin attribution (independent implementation of the
 *  ledger's documented semantics, using possession facts, not event kinds):
 *   PLACED   — score taken from a placed ball (Free / Penalty / Mark / 45 / 65)
 *   RESTART  — first score by the restart winner within 90 s of the restart,
 *              before the next restart
 *   TURNOVER — the turnover winner's next decisive action within 60 s
 *              (score / wide / shot / losing the ball / winning a fresh
 *              turnover) is a score
 *   both     — the nearer (later) origin wins
 *   FROM_PLAY— a source-tagged score with no origin
 *   UNATTRIBUTED — score with no source (e.g. a review-edited shot) and no origin */
function attributeOrigins(facts) {
  const restartOrigin = new Map();
  const turnoverOrigin = new Map();
  const ordered = facts;
  const abs = (f) => (f.half === 2 ? 3600 : 0) + f.clock;
  ordered.forEach((f, i) => {
    if (f.type === "restart") {
      for (let j = i + 1; j < ordered.length; j++) {
        const g = ordered[j];
        if (abs(g) - abs(f) > 90) break;
        if (g.type === "restart") break;
        if (g.type === "score" && g.team === f.winner) { restartOrigin.set(g.id, abs(f)); break; }
      }
    }
    if (f.type === "turnover") {
      const acting = f.winner;
      for (let j = i + 1; j < ordered.length; j++) {
        const g = ordered[j];
        if (abs(g) - abs(f) > 60) break;
        const decisive =
          (isAttempt(g) && g.team === acting) ||
          (g.type === "turnover" && (g.loser === acting || g.winner === acting));
        if (!decisive) continue;
        if (g.type === "score") turnoverOrigin.set(g.id, abs(f));
        break;
      }
    }
  });
  const rows = { FROM_PLAY: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, PLACED: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, RESTART: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, TURNOVER: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, UNATTRIBUTED: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 } };
  const perScore = [];
  for (const f of ordered.filter((x) => x.type === "score")) {
    let row;
    if (f.placed) row = "PLACED";
    else {
      const k = restartOrigin.get(f.id), t = turnoverOrigin.get(f.id);
      if (k != null && t != null) row = t >= k ? "TURNOVER" : "RESTART";
      else if (k != null) row = "RESTART";
      else if (t != null) row = "TURNOVER";
      else row = f.source == null ? "UNATTRIBUTED" : "FROM_PLAY";
    }
    rows[row][f.team] += f.value;
    rows[row][`${f.team}n`] += 1;
    perScore.push({ id: f.id, team: f.team, row });
  }
  return { rows, perScore };
}

/** Possession outcomes (documented Quick Review semantics, independent):
 *  origin = restart (90 s window) / turnover (60 s) / free (45 s); acting team =
 *  the team that gained the ball. Scan forward; stop at the first of: acting
 *  team scores (GOAL / POINT) or misses (WIDE); acting team loses the ball; any
 *  restart or free (new phase); window expiry. A non-scoring SHOT is noted but
 *  does not end the scan; if nothing decisive follows the possession is SHOT. */
function possessionOutcomes(facts) {
  const abs = (f) => (f.half === 2 ? 3600 : 0) + f.clock;
  const results = [];
  facts.forEach((f, i) => {
    let kind = null, acting = null, win = 0;
    if (f.type === "restart") { kind = "RESTART"; acting = f.winner; win = 90; }
    else if (f.type === "turnover") { kind = "TURNOVER"; acting = f.winner; win = 60; }
    else if (f.type === "free") { kind = "FREE"; acting = f.awardedTo; win = 45; }
    if (!kind) return;
    let outcome = "RECYCLED", sawShot = false;
    for (let j = i + 1; j < facts.length; j++) {
      const g = facts[j];
      if (abs(g) - abs(f) > win) break;
      if (g.type === "restart" || g.type === "free") break;
      if (g.team === acting && g.type === "score") { outcome = g.goal ? "GOAL" : "POINT"; break; }
      if (g.team === acting && g.type === "wide") { outcome = "WIDE"; break; }
      if (g.team === acting && g.type === "shot") sawShot = true;
      if (g.type === "turnover" && g.loser === acting) { outcome = "TURNOVER"; break; }
    }
    if (outcome === "RECYCLED" && sawShot) outcome = "SHOT";
    results.push({ originId: f.id, kind, acting, outcome });
  });
  const fam = (k, team) => {
    const rs = results.filter((r) => r.kind === k && r.acting === team);
    const goals = rs.filter((r) => r.outcome === "GOAL").length;
    const points = rs.filter((r) => r.outcome === "POINT").length;
    const wides = rs.filter((r) => r.outcome === "WIDE" || r.outcome === "SHOT").length;
    return { count: rs.length, goals, points, wides, shots: goals + points + wides, scores: goals + points };
  };
  return {
    restartWon: fam("RESTART", "FOR"), restartLost: fam("RESTART", "OPP"),
    turnoverWon: fam("TURNOVER", "FOR"), turnoverLost: fam("TURNOVER", "OPP"),
    freeWon: fam("FREE", "FOR"), freeConceded: fam("FREE", "OPP"),
  };
}

/** Restart / turnover outcome chains (documented Part 3 semantics, independent):
 *   restart  — scan forward ≤ 90 s, stopping at the next restart: first score by
 *              the winner (→ score) and first attempt by the winner (→ shot attempt)
 *   turnover — scan forward ≤ 60 s: the acting (winning) team's next decisive
 *              action — an attempt, losing the ball, or winning a fresh turnover
 *              (possession changed hands in between) — decides →score / →shot. */
function outcomeChains(facts) {
  const abs = (f) => (f.half === 2 ? 3600 : 0) + f.clock;
  const restarts = [], turnovers = [];
  facts.forEach((f, i) => {
    if (f.type === "restart") {
      let nextScore = null, nextAttempt = null;
      for (let j = i + 1; j < facts.length; j++) {
        const g = facts[j];
        if (g.type === "restart") break;
        if (abs(g) - abs(f) > 90) break;
        if (g.team !== f.winner) continue;
        if (isAttempt(g) && !nextAttempt) nextAttempt = g;
        if (g.type === "score") { nextScore = g; break; }
      }
      restarts.push({ id: f.id, half: f.half, owner: f.owner, winner: f.winner, nextScore, nextAttempt, secs: nextScore ? abs(nextScore) - abs(f) : null });
    }
    if (f.type === "turnover") {
      let next = null;
      for (let j = i + 1; j < facts.length; j++) {
        const g = facts[j];
        if (abs(g) - abs(f) > 60) break;
        // Decisive for the acting team: an attempt, losing the ball, or winning a
        // fresh turnover (which means possession changed hands in between).
        if ((isAttempt(g) && g.team === f.winner) || (g.type === "turnover" && (g.loser === f.winner || g.winner === f.winner))) { next = g; break; }
      }
      turnovers.push({ id: f.id, winner: f.winner, next, score: next?.type === "score", attempt: next != null && isAttempt(next) });
    }
  });
  const breakdown = (scores) => ({
    goals: scores.filter((s) => s.goal).length,
    points: scores.filter((s) => !s.goal && s.value === 1).length,
    twoPointers: scores.filter((s) => s.value === 2).length,
    value: scores.reduce((a, s) => a + s.value, 0),
    count: scores.length,
  });
  const side = (team) => {
    const won = restarts.filter((r) => r.winner === team);
    const lost = restarts.filter((r) => r.winner !== team);
    const tw = turnovers.filter((t) => t.winner === team);
    const tl = turnovers.filter((t) => t.winner !== team);
    const secs = won.filter((r) => r.secs != null).map((r) => r.secs);
    return {
      restartWonToScore: frac(won.filter((r) => r.nextScore).length, won.length, `${team} restarts won followed by a ${team} score (≤90 s, before next restart) ÷ restarts won`),
      restartWonToAttempt: frac(won.filter((r) => r.nextAttempt).length, won.length, `${team} restarts won followed by a ${team} attempt ÷ restarts won`),
      restartWonNoAttempt: won.filter((r) => !r.nextAttempt).length,
      restartWonScoreBreakdown: breakdown(won.filter((r) => r.nextScore).map((r) => r.nextScore)),
      restartLostToScoreAgainst: frac(lost.filter((r) => r.nextScore).length, lost.length, `restarts lost by ${team} followed by an opposition score ÷ restarts lost`),
      restartLostScoreBreakdown: breakdown(lost.filter((r) => r.nextScore).map((r) => r.nextScore)),
      ownRestartLostScoreBreakdown: breakdown(lost.filter((r) => r.owner === team && r.nextScore).map((r) => r.nextScore)),
      avgSecsToScoreWon: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : null,
      turnoverWonToScore: frac(tw.filter((t) => t.score).length, tw.length, `${team} turnovers won whose next decisive ${team} action (≤60 s) is a score ÷ turnovers won`),
      turnoverWonToAttempt: frac(tw.filter((t) => t.attempt).length, tw.length, `${team} turnovers won whose next decisive action is an attempt ÷ turnovers won`),
      turnoverWonAttemptNoScore: frac(tw.filter((t) => t.attempt && !t.score).length, tw.length, "attempt but no score ÷ turnovers won"),
      turnoverWonScoreBreakdown: breakdown(tw.filter((t) => t.score).map((t) => t.next)),
      turnoverLostToScoreAgainst: frac(tl.filter((t) => t.score).length, tl.length, `turnovers lost by ${team} followed by an opposition score ÷ turnovers lost`),
      turnoverLostToAttemptAgainst: frac(tl.filter((t) => t.attempt).length, tl.length, "turnovers lost followed by an opposition attempt ÷ turnovers lost"),
      turnoverLostScoreBreakdown: breakdown(tl.filter((t) => t.score).map((t) => t.next)),
    };
  };
  // Score-level de-duplication (no placed precedence): nearer origin wins.
  const kClock = new Map(), tClock = new Map();
  for (const r of restarts) if (r.nextScore) kClock.set(r.nextScore.id, abs(facts.find((f) => f.id === r.id)));
  for (const t of turnovers) if (t.score) tClock.set(t.next.id, abs(facts.find((f) => f.id === t.id)));
  const dedupe = (team) => {
    const rs = [], ts = [];
    for (const s of facts.filter((f) => f.type === "score" && f.team === team)) {
      const k = kClock.get(s.id), t = tClock.get(s.id);
      if (k != null && t != null) (t >= k ? ts : rs).push(s);
      else if (k != null) rs.push(s);
      else if (t != null) ts.push(s);
    }
    return { restartOrigin: breakdown(rs), turnoverOrigin: breakdown(ts) };
  };
  return {
    FOR: { ...side("FOR"), origins: dedupe("FOR") }, OPP: { ...side("OPP"), origins: dedupe("OPP") },
    turnoverDetail: turnovers.map((t) => ({ id: t.id, winner: t.winner, next: t.next?.id ?? null, score: t.score })),
  };
}

function scoringRunsDetail(facts) {
  const scores = facts.filter((f) => f.type === "score");
  const runs = [];
  let cur = [];
  for (const s of scores) {
    if (cur.length && cur[0].team !== s.team) { if (cur.length >= 2) runs.push(cur); cur = []; }
    cur.push(s);
  }
  if (cur.length >= 2) runs.push(cur);
  return runs.map((r) => ({ team: r[0].team, scores: r.length, value: r.reduce((a, s) => a + s.value, 0), startHalf: r[0].half, startMin: Math.floor(r[0].clock / 60), endHalf: r[r.length - 1].half, endMin: Math.floor(r[r.length - 1].clock / 60) }));
}

function teamBlock(fixture, facts, team) {
  const opp = other(team);
  const att = facts.filter((f) => isAttempt(f) && f.team === team);
  const scores = att.filter((f) => f.type === "score");
  const restarts = facts.filter(restartTaken);
  const own = restarts.filter((f) => f.owner === team);
  const theirs = restarts.filter((f) => f.owner === opp);
  const turnovers = facts.filter((f) => f.type === "turnover");
  const placed = att.filter((f) => f.placed && f.type !== "shot");
  const cards = facts.filter((f) => f.type === "card" && f.team === team);
  const methodCount = (list, m) => list.filter((f) => f.method === m).length;
  const toWon = turnovers.filter((f) => f.winner === team);
  const toLost = turnovers.filter((f) => f.loser === team);
  const koWonAll = restarts.filter((f) => f.winner === team);
  const koLostAll = restarts.filter((f) => f.winner === opp);
  return {
    score: scoreLine(facts, team),
    scoresCount: scores.length,
    goals: scores.filter((f) => f.goal).length,
    pointScores: scores.filter((f) => f.value === 1 && !f.goal).length,
    twoPointScores: scores.filter((f) => f.value === 2).length,
    attempts: att.length,
    wides: att.filter((f) => f.type === "wide").length,
    shotsNotScoredNotWide: att.filter((f) => f.type === "shot").length,
    shotShort: att.filter((f) => f.type === "shot" && f.outcome === "Short").length,
    shotBlockSave: att.filter((f) => f.type === "shot" && f.outcome === "Block/Save").length,
    shotPost: att.filter((f) => f.type === "shot" && f.outcome === "Post").length,
    conversion: frac(scores.length, att.length, "scores ÷ all attempts (goals + points + 2-pointers + wides + short/blocked/saved/post shots)"),
    ownRestarts: {
      taken: own.length,
      retained: own.filter((f) => f.winner === team).length,
      lost: own.filter((f) => f.winner === opp).length,
      retention: frac(own.filter((f) => f.winner === team).length, own.length, `${team} own kickouts/puckouts retained ÷ ${team} own kickouts/puckouts taken`),
    },
    oppRestarts: {
      taken: theirs.length,
      won: theirs.filter((f) => f.winner === team).length,
      lost: theirs.filter((f) => f.winner === opp).length,
      winRate: frac(theirs.filter((f) => f.winner === team).length, theirs.length, `opposition kickouts/puckouts won by ${team} ÷ opposition kickouts/puckouts taken`),
    },
    restartShare: frac(koWonAll.length, restarts.length, `all restarts won by ${team} ÷ all restarts taken by both teams`),
    restartsWon: koWonAll.length,
    restartsLost: koLostAll.length,
    ownRestartMethods: {
      retainedClean: own.filter((f) => f.winner === team && f.method === "Clean").length,
      retainedBreak: own.filter((f) => f.winner === team && f.method === "Break").length,
      retainedFoul: own.filter((f) => f.winner === team && f.method === "Foul").length,
      lostClean: own.filter((f) => f.winner === opp && f.method === "Clean").length,
      lostBreak: own.filter((f) => f.winner === opp && f.method === "Break").length,
      lostFoul: own.filter((f) => f.winner === opp && f.method === "Foul").length,
    },
    directBreakdown: (() => {
      const row = (pred) => { const ss = scores.filter(pred); const g = ss.filter((x) => x.goal).length; const v = ss.reduce((a, x) => a + x.value, 0); return { scores: ss.length, goals: g, value: v, text: `${g}-${String(v - 3 * g).padStart(2, "0")} (${v} pts)` }; };
      return {
        fromPlay: row((f) => !f.placed && f.source != null),
        placed: { ...row((f) => f.placed), attempts: placed.length },
        unattributed: row((f) => !f.placed && f.source == null),
      };
    })(),
    bySource: Object.fromEntries(["Play", "Free", "Mark", "45", "65", "Penalty", null].map((src) => {
      const a = att.filter((f) => (f.source ?? null) === src);
      return [src ?? "Unclassified", { attempts: a.length, scores: a.filter((f) => f.type === "score").length, misses: a.filter((f) => f.type !== "score").length }];
    })),
    twoPointBySource: {
      fromPlayFreeMark: scores.filter((f) => f.value === 2 && f.source !== "45").length,
      from45: scores.filter((f) => f.value === 2 && f.source === "45").length,
    },
    restartMethods: {
      wonClean: methodCount(koWonAll, "Clean"), wonBreak: methodCount(koWonAll, "Break"), wonFoul: methodCount(koWonAll, "Foul"),
      lostClean: methodCount(koLostAll, "Clean"), lostBreak: methodCount(koLostAll, "Break"), lostFoul: methodCount(koLostAll, "Foul"),
    },
    turnoversWon: toWon.length,
    turnoversLost: toLost.length,
    turnoverShare: frac(toWon.length, turnovers.length, `turnovers won by ${team} ÷ all turnovers`),
    turnoverMethodsWon: Object.fromEntries(["Tackle", "Interception", "HP Error", "KP Error", "Overcarried"].map((m) => [m, methodCount(toWon, m)])),
    turnoverMethodsLost: Object.fromEntries(["Tackle", "Interception", "HP Error", "KP Error", "Overcarried"].map((m) => [m, methodCount(toLost, m)])),
    freesWon: facts.filter((f) => f.type === "free" && f.awardedTo === team).length,
    freesConceded: facts.filter((f) => f.type === "free" && f.awardedTo === opp).length,
    placed: {
      attempts: placed.length,
      scores: placed.filter((f) => f.type === "score").length,
      pointsValue: placed.filter((f) => f.type === "score").reduce((a, f) => a + f.value, 0),
      misses: placed.filter((f) => f.type === "wide").length,
      conversion: frac(placed.filter((f) => f.type === "score").length, placed.length, "placed-ball scores ÷ placed-ball attempts (source Free / Penalty / Mark / 45 / 65)"),
    },
    fortyFivesWon: facts.filter((f) => f.type === "fortyFive" && f.winner === team).length,
    sidelinesWon: facts.filter((f) => f.type === "sideline" && f.winner === team).length,
    cards: { yellow: cards.filter((c) => c.card === "Yellow").length, sinBin: cards.filter((c) => c.card === "Sin Bin").length, red: cards.filter((c) => c.card === "Red").length },
    turnoversWonOwnHalf: toWon.filter((f) => inOwnHalf(fixture, team, f.half, f.nx)).length,
    turnoversWonOppHalf: toWon.filter((f) => !inOwnHalf(fixture, team, f.half, f.nx)).length,
    turnoversLostOwnHalf: toLost.filter((f) => inOwnHalf(fixture, team, f.half, f.nx)).length,
    turnoversLostOppHalf: toLost.filter((f) => !inOwnHalf(fixture, team, f.half, f.nx)).length,
  };
}

function longestRun(facts) {
  const scores = facts.filter((f) => f.type === "score");
  const best = { FOR: 0, OPP: 0 };
  let cur = null, n = 0;
  for (const s of scores) {
    if (s.team === cur) n++; else { cur = s.team; n = 1; }
    if (n >= 2) best[cur] = Math.max(best[cur], n); // runs are ≥ 2 consecutive scores
  }
  return best;
}

function playerTable(facts) {
  const rows = new Map();
  const get = (p) => {
    const k = `${p.team}#${p.number}`;
    if (!rows.has(k)) rows.set(k, { team: p.team, number: p.number, actions: 0, goals: 0, pointsValue: 0, totalValue: 0, attempts: 0, wides: 0, toWon: 0, toLost: 0, koWon: 0, koLost: 0, freesWon: 0, freesConceded: 0, yellow: 0, sinBin: 0, red: 0, fortyFivesWon: 0, sidelinesWon: 0 });
    return rows.get(k);
  };
  for (const f of facts) {
    if (!f.player) continue;
    const r = get(f.player);
    r.actions++;
    const pt = f.player.team;
    if (f.type === "score") { r.attempts++; if (f.goal) { r.goals++; r.totalValue += 3; } else { r.pointsValue += f.value; r.totalValue += f.value; } }
    if (f.type === "wide") { r.attempts++; r.wides++; }
    if (f.type === "shot") r.attempts++;
    if (f.type === "turnover") { if (f.winner === pt) r.toWon++; else r.toLost++; }
    if (f.type === "restart") { if (f.winner === pt) r.koWon++; else r.koLost++; }
    if (f.type === "free") { if (f.awardedTo === pt) r.freesWon++; else r.freesConceded++; }
    if (f.type === "card") { if (f.card === "Yellow") r.yellow++; if (f.card === "Sin Bin") r.sinBin++; if (f.card === "Red") r.red++; }
    if (f.type === "fortyFive") r.fortyFivesWon++;
    if (f.type === "sideline") r.sidelinesWon++;
  }
  return [...rows.values()].sort((a, b) => (a.team === b.team ? a.number - b.number : a.team === "FOR" ? -1 : 1));
}

function segmentOf(f) {
  const s = f.clock < 600 ? 1 : f.clock < 1200 ? 2 : 3;
  return f.half === 1 ? s : s + 3;
}

function segmentStats(fixture, facts) {
  const out = {};
  for (let seg = 1; seg <= 6; seg++) {
    const sf = facts.filter((f) => segmentOf(f) === seg);
    out[seg] = {};
    for (const team of ["FOR", "OPP"]) {
      const b = teamBlock(fixture, sf, team);
      out[seg][team] = {
        score: b.score.text, total: b.score.total, attempts: b.attempts, wides: b.wides,
        turnoversWon: b.turnoversWon, turnoversLost: b.turnoversLost,
        turnoversWonOwnHalf: b.turnoversWonOwnHalf, turnoversWonOppHalf: b.turnoversWonOppHalf,
        turnoversLostOwnHalf: b.turnoversLostOwnHalf, turnoversLostOppHalf: b.turnoversLostOppHalf,
        ownRestarts: `${b.ownRestarts.retained}/${b.ownRestarts.taken}`,
      };
    }
  }
  return out;
}

function scopeStats(fixture, facts) {
  return {
    eventCount: facts.length,
    FOR: teamBlock(fixture, facts, "FOR"),
    OPP: teamBlock(fixture, facts, "OPP"),
    margin: scoreLine(facts, "FOR").total - scoreLine(facts, "OPP").total,
    longestRun: longestRun(facts),
    scoringRuns: scoringRunsDetail(facts),
    chains: outcomeChains(facts),
    origins: attributeOrigins(facts),
    possession: possessionOutcomes(facts),
  };
}

export function buildLedger(fixture) {
  const facts = buildFacts(fixture);
  const h1 = facts.filter((f) => f.half === 1);
  const h2 = facts.filter((f) => f.half === 2);
  // Ground-truth possession origin of every score (known to the simulator).
  const truthOrigins = {};
  for (const s of fixture.steps) {
    if (s.op !== "tag" || s.ev.erroneous || !s.ev.truth?.origin) continue;
    truthOrigins[s.ev.id] = s.ev.truth.placed ? "PLACED" : s.ev.truth.origin.type;
  }
  return {
    matchId: fixture.matchId,
    title: fixture.title,
    sport: fixture.sport,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    generatedBy: "audit/event-stats-ultra-test/scripts/reference.mjs (no src/ imports)",
    eventCounts: { total: facts.length, h1: h1.length, h2: h2.length },
    FULL: scopeStats(fixture, facts),
    H1: scopeStats(fixture, h1),
    H2: scopeStats(fixture, h2),
    segments: segmentStats(fixture, facts),
    players: playerTable(facts),
    truthOrigins,
    facts,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const ledger = buildLedger(fixture);
  writeFileSync(process.argv[3], JSON.stringify(ledger, null, 1));
  if (fixture.reviewOps?.length) {
    // The match as it stood at full time, before any post-match review edits —
    // the reference for every live surface (HT/FT Quick Review, live PDFs).
    const live = buildLedger({ ...fixture, reviewOps: [] });
    writeFileSync(process.argv[3].replace(/\.json$/, "-live.json"), JSON.stringify(live, null, 1));
  }
  const F = ledger.FULL, H = ledger.H1;
  console.log(`${ledger.matchId}: HT ${ledger.homeTeam} ${H.FOR.score.text} (${H.FOR.score.total}) v ${H.OPP.score.text} (${H.OPP.score.total}) ${ledger.awayTeam}; FT ${F.FOR.score.text} (${F.FOR.score.total}) v ${F.OPP.score.text} (${F.OPP.score.total}); events ${JSON.stringify(ledger.eventCounts)}`);
}
