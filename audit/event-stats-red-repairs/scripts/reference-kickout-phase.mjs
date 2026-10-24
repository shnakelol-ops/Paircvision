// reference-kickout-phase.mjs — supplementary INDEPENDENT reference for the
// authoritative kickout-origin definition (repair batch, I-2 / I-3).
//
// The original ledgers in expected/ encode the previous restart rule (first
// score by the winner before the next kickout, ≤ 90 s). That rule is kept
// untouched in expected/. This script imports the unchanged reference.mjs,
// recomputes ONLY the fields that depend on the kickout-origin rule under the
// authoritative definition, and writes a separate set to
// expected-authoritative/. Every other field is copied unchanged.
//
// Authoritative kickout-origin definition (written from the definition, not
// from src/): a kickout-origin score is a score by the kickout winner in the
// possession the kickout started — "every score in a possession that began
// with a kickout, including frees won during it". The possession ends when
// the ball changes hands (any turnover; any attempt by the other team; a
// free, 45/65 or sideline awarded to the other team), at the next kickout, at
// the winner's own score or wide, or after 90 s. A free / 45 / sideline kept
// by the same team, or the winner's blocked / short / post shot, does not
// end it.
//
// Possession outcomes (Quick Review's immediate-outcome model) use the same
// change-of-possession rule; as before, any free starts a new phase there.
//
// Validation: credited kickout-origin scores are compared with possession
// roots reconstructed from the simulator's ground truth (fixture
// ev.truth): the last event at which the ball actually changed hands.
//
//   node reference-kickout-phase.mjs        (writes expected-authoritative/)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { buildFacts, buildLedger } from "./reference.mjs";

const root = new URL("..", import.meta.url).pathname;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);
const frac = (num, den, definition) => ({ num, den, pct: pct(num, den), definition });
const abs = (f) => (f.half === 2 ? 3600 : 0) + f.clock;
const isAttempt = (f) => f.type === "score" || f.type === "wide" || f.type === "shot";
const AWARDS = new Set(["free", "fortyFive", "sideline"]);
const awardedTo = (g) => (g.type === "free" ? g.awardedTo : g.winner);

/** One later fact against a restart won by `w`. */
function step(g, w) {
  if (g.type === "restart") return "NEXT_KICKOUT";
  if (AWARDS.has(g.type)) return awardedTo(g) === w ? "RESTART_RETAINED" : "POSSESSION_CHANGE";
  if (g.type === "turnover") return "POSSESSION_CHANGE";
  if (!isAttempt(g)) return "CONTINUE";
  if (g.team !== w) return "POSSESSION_CHANGE";
  return g.type === "score" ? "SCORE" : g.type === "wide" ? "MISS" : "SHOT";
}

/** Kickout-origin possession of the restart at index i (chain fields). */
function phase(facts, i) {
  const f = facts[i], w = f.winner;
  let nextScore = null, nextAttempt = null;
  for (let j = i + 1; j < facts.length; j++) {
    const g = facts[j];
    if (abs(g) - abs(f) > 90) break;
    const s = step(g, w);
    if (s === "NEXT_KICKOUT" || s === "POSSESSION_CHANGE") break;
    if (s === "CONTINUE" || s === "RESTART_RETAINED") continue;
    nextAttempt ??= g;
    if (s === "SCORE") { nextScore = g; break; }
    if (s === "MISS") break;
  }
  return { id: f.id, owner: f.owner, winner: w, nextScore, nextAttempt, secs: nextScore ? abs(nextScore) - abs(f) : null };
}

/** Immediate outcome of the restart at index i (possession fields). */
function immediate(facts, i) {
  const f = facts[i], w = f.winner;
  let outcome = "RECYCLED", sawShot = false;
  for (let j = i + 1; j < facts.length; j++) {
    const g = facts[j];
    if (abs(g) - abs(f) > 90) break;
    const s = step(g, w);
    if (s === "SCORE") { outcome = g.goal ? "GOAL" : "POINT"; break; }
    if (s === "MISS") { outcome = "WIDE"; break; }
    if (s === "SHOT") { sawShot = true; continue; }
    if (s === "POSSESSION_CHANGE") { if (g.type === "turnover" && g.loser === w) outcome = "TURNOVER"; break; }
    if (s === "NEXT_KICKOUT") break;
    if (s === "RESTART_RETAINED" && g.type === "free") break;
  }
  if (outcome === "RECYCLED" && sawShot) outcome = "SHOT";
  return { winner: w, outcome };
}

/** Possession roots from simulator truth: the last event at which the ball changed hands. */
function possessionRoots(fixture, facts) {
  const ids = new Set(facts.map((f) => f.id));
  let poss = null, root = null;
  const rootAt = new Map(), rootOfScore = new Map();
  for (const st of fixture.steps) {
    if (st.op !== "tag" || st.ev.erroneous || !ids.has(st.ev.id)) continue;
    const t = st.ev.truth ?? {}, id = st.ev.id;
    if (t.action === "restart") { poss = t.winner; root = { type: "RESTART", id }; }
    else if (t.action === "turnover") { poss = t.winner; root = { type: "TURNOVER", id }; }
    else if (["sideline", "free", "fortyFive"].includes(t.action)) {
      const to = t.winner ?? t.awardedTo;
      rootAt.set(id, to === poss ? root : { type: t.action.toUpperCase(), id });
      if (to !== poss) { poss = to; root = { type: t.action.toUpperCase(), id }; }
    } else if (t.origin) {
      let o = t.origin;
      if (o.type === "OTHER" || o.type === "THROW_IN") { poss = t.team; root = o; }
      else if (["FREE", "SIDELINE", "FORTY_FIVE"].includes(o.type) && rootAt.has(o.id)) o = rootAt.get(o.id) ?? o;
      if (t.action === "score") rootOfScore.set(id, o);
    }
  }
  return rootOfScore;
}

const breakdown = (scores) => ({
  goals: scores.filter((s) => s.goal).length,
  points: scores.filter((s) => !s.goal && s.value === 1).length,
  twoPointers: scores.filter((s) => s.value === 2).length,
  value: scores.reduce((a, s) => a + s.value, 0),
  count: scores.length,
});

/** Recompute the restart-rule-dependent fields of one scope block. */
function rescope(block, facts) {
  const restarts = facts.map((f, i) => (f.type === "restart" ? phase(facts, i) : null)).filter(Boolean);
  const immediates = facts.map((f, i) => (f.type === "restart" ? immediate(facts, i) : null)).filter(Boolean);
  const out = structuredClone(block);
  for (const team of ["FOR", "OPP"]) {
    const won = restarts.filter((r) => r.winner === team);
    const lost = restarts.filter((r) => r.winner !== team);
    const secs = won.filter((r) => r.secs != null).map((r) => r.secs);
    Object.assign(out.chains[team], {
      restartWonToScore: frac(won.filter((r) => r.nextScore).length, won.length, `${team} restarts won whose possession produced a ${team} score ÷ restarts won`),
      restartWonToAttempt: frac(won.filter((r) => r.nextAttempt).length, won.length, `${team} restarts won whose possession produced a ${team} attempt ÷ restarts won`),
      restartWonNoAttempt: won.filter((r) => !r.nextAttempt).length,
      restartWonScoreBreakdown: breakdown(won.filter((r) => r.nextScore).map((r) => r.nextScore)),
      restartLostToScoreAgainst: frac(lost.filter((r) => r.nextScore).length, lost.length, `restarts lost by ${team} whose possession produced an opposition score ÷ restarts lost`),
      restartLostScoreBreakdown: breakdown(lost.filter((r) => r.nextScore).map((r) => r.nextScore)),
      ownRestartLostScoreBreakdown: breakdown(lost.filter((r) => r.owner === team && r.nextScore).map((r) => r.nextScore)),
      avgSecsToScoreWon: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : null,
    });
  }
  // Origin de-duplication and the ledger partition: the restart side changes,
  // the turnover rule is the original reference's (unchanged).
  const kClock = new Map();
  for (const r of restarts) if (r.nextScore) kClock.set(r.nextScore.id, abs(facts.find((f) => f.id === r.id)));
  const tClock = new Map();
  for (const t of block.chains.turnoverDetail) if (t.score) {
    const next = facts.find((f) => f.id === t.next);
    tClock.set(next.id, abs(facts.find((f) => f.id === t.id)));
  }
  for (const team of ["FOR", "OPP"]) {
    const rs = [], ts = [];
    for (const s of facts.filter((f) => f.type === "score" && f.team === team)) {
      const k = kClock.get(s.id), t = tClock.get(s.id);
      if (k != null && t != null) (t >= k ? ts : rs).push(s);
      else if (k != null) rs.push(s);
      else if (t != null) ts.push(s);
    }
    out.chains[team].origins = { restartOrigin: breakdown(rs), turnoverOrigin: breakdown(ts) };
  }
  const rows = { FROM_PLAY: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, PLACED: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, RESTART: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, TURNOVER: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 }, UNATTRIBUTED: { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 } };
  const perScore = [];
  for (const f of facts.filter((x) => x.type === "score")) {
    let row;
    if (f.placed) row = "PLACED";
    else {
      const k = kClock.get(f.id), t = tClock.get(f.id);
      if (k != null && t != null) row = t >= k ? "TURNOVER" : "RESTART";
      else if (k != null) row = "RESTART";
      else if (t != null) row = "TURNOVER";
      else row = f.source == null ? "UNATTRIBUTED" : "FROM_PLAY";
    }
    rows[row][f.team] += f.value;
    rows[row][`${f.team}n`] += 1;
    perScore.push({ id: f.id, team: f.team, row });
  }
  out.origins = { rows, perScore };
  // Possession outcomes: immediate outcome with the shared change-of-possession rule.
  const fam = (team, wonBy) => {
    const rs = immediates.filter((r) => (wonBy ? r.winner === team : r.winner !== team));
    const goals = rs.filter((r) => r.outcome === "GOAL").length;
    const points = rs.filter((r) => r.outcome === "POINT").length;
    const wides = rs.filter((r) => r.outcome === "WIDE" || r.outcome === "SHOT").length;
    return { count: rs.length, goals, points, wides, shots: goals + points + wides, scores: goals + points };
  };
  out.possession.restartWon = fam("FOR", true);
  out.possession.restartLost = fam("FOR", false);
  return { block: out, restarts };
}

const TARGETS = [["A", "ledger-A"], ["B", "ledger-B"], ["B", "ledger-B-live"], ["C", "ledger-C"]];
const outDir = `${root}/expected-authoritative`;
mkdirSync(outDir, { recursive: true });
const validation = {};
for (const [id, name] of TARGETS) {
  const fixture = JSON.parse(readFileSync(`${root}/fixtures/match-${id}.json`, "utf8"));
  const fx = name.endsWith("-live") ? { ...fixture, reviewOps: [] } : fixture;
  const original = JSON.parse(readFileSync(`${root}/expected/${name}.json`, "utf8"));
  // Guard: the unchanged reference must reproduce the committed ledger exactly.
  const regenerated = buildLedger(fx);
  if (JSON.stringify(regenerated.FULL) !== JSON.stringify(original.FULL)) throw new Error(`${name}: reference.mjs no longer reproduces expected/${name}.json`);
  const facts = buildFacts(fx);
  const next = structuredClone(original);
  let restartsFull = null;
  for (const [scope, sub] of [["FULL", facts], ["H1", facts.filter((f) => f.half === 1)], ["H2", facts.filter((f) => f.half === 2)]]) {
    const r = rescope(original[scope], sub);
    next[scope] = r.block;
    if (scope === "FULL") restartsFull = r.restarts;
  }
  next.generatedBy = "audit/event-stats-red-repairs/scripts/reference-kickout-phase.mjs over reference.mjs (no src/ imports) — authoritative kickout-origin definition";
  next.definitionChange = "Kickout-origin fields (chains.*.restart*, chains.*.origins, origins) use the authoritative kickout-origin possession; possession.restartWon/Lost use the immediate-outcome model with the same change-of-possession rule. All other fields equal expected/.";
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify(next, null, 1));
  // Ground-truth validation (FULL): credited kickout-origin scores vs possession roots.
  const roots = possessionRoots(fx, facts);
  const credited = restartsFull.filter((r) => r.nextScore);
  const correct = credited.filter((r) => { const t = roots.get(r.nextScore.id); return t?.type === "RESTART" && t.id === r.id; });
  const truthRestart = [...roots.entries()].filter(([, o]) => o.type === "RESTART");
  const missed = truthRestart.filter(([sid, o]) => !credited.some((r) => r.id === o.id && r.nextScore.id === sid));
  validation[name] = { credited: credited.length, correct: correct.length, wrong: credited.filter((r) => !correct.includes(r)).map((r) => ({ restart: r.id, score: r.nextScore.id, truthRoot: roots.get(r.nextScore.id) })), truthKickoutOriginScores: truthRestart.length, missed: missed.map(([sid, o]) => ({ score: sid, restart: o.id })) };
}
writeFileSync(`${outDir}/VALIDATION.json`, JSON.stringify(validation, null, 1));
for (const [k, v] of Object.entries(validation)) console.log(k, `credited ${v.credited}, correct vs simulator possession roots ${v.correct}, wrong ${v.wrong.length}, missed ${v.missed.length} (truth kickout-origin scores ${v.truthKickoutOriginScores})`, v.wrong.length || v.missed.length ? JSON.stringify({ wrong: v.wrong, missed: v.missed }) : "");
