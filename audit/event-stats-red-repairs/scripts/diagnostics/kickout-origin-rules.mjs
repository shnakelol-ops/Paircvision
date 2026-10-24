// kickout-origin-rules.mjs — evaluates candidate "kickout-origin score" rules
// against the simulator's GROUND TRUTH (fixtures/*.json → ev.truth.origin),
// using only what Event Stats records (the taps), never the truth, to apply
// each rule. No src/ imports; expected/ is not read or changed.
//
// For every restart the rule credits at most one score (the restart winner's
// score in the possession the rule allows). A credit is CORRECT when the
// simulator says that score's possession began at that restart.
//   node kickout-origin-rules.mjs [windowSeconds=60]
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../..", import.meta.url).pathname;
const W = Number(process.argv[2] ?? 60);
const other = (t) => (t === "FOR" ? "OPP" : "FOR");

/** Recorded taps → facts (Event Stats capture contract, no truth). */
function facts(fx) {
  return fx.steps.filter((s) => s.op === "tag" && !s.ev.erroneous).map((s) => {
    const e = s.ev, abs = (e.half - 1) * 10000 + e.clock;
    const f = { id: e.id, abs, truth: e.truth };
    switch (e.family) {
      case "RESTART": return { ...f, type: "restart", owner: e.owner, winner: e.row };
      case "TURNOVER": return { ...f, type: "turnover", winner: e.row }; // FOR row = we won it, OPP row = they won it
      case "POINT": case "GOAL": case "TWO_POINT": return { ...f, type: "score", team: e.row };
      case "WIDE": return { ...f, type: "wide", team: e.row };
      case "SHOT": return { ...f, type: "shot", team: e.row, tile: e.tile };
      case "FREE": return { ...f, type: "free", awardedTo: e.tile === "Won" ? "FOR" : "OPP" };
      case "SIDELINE": return { ...f, type: "sideline", winner: e.row };
      case "FORTY_FIVE": return { ...f, type: "fortyFive", winner: e.row };
      default: return { ...f, type: "other" };
    }
  }).sort((a, b) => a.abs - b.abs);
}

/**
 * Possession-root truth: the simulator labels every free / 45-65 / sideline as
 * a new "origin" even when the same team keeps the ball. Under possession
 * semantics the root is the last event at which the ball changed hands, so an
 * award to the team already in possession inherits the root before it. Built
 * from simulator truth only (who won each restart / turnover / award).
 */
function possessionRoots(F) {
  const rootAt = new Map(); // award id → root in effect before it
  let poss = null, root = null;
  const rootOfScore = new Map();
  for (const f of F) {
    const t = f.truth ?? {};
    if (t.action === "restart") { poss = t.winner; root = { type: "RESTART", id: f.id }; }
    else if (t.action === "turnover") { poss = t.winner; root = { type: "TURNOVER", id: f.id }; }
    else if (t.action === "sideline" || t.action === "free" || t.action === "fortyFive") {
      const to = t.winner ?? t.awardedTo;
      rootAt.set(f.id, to === poss ? root : { type: t.action.toUpperCase(), id: f.id });
      if (to !== poss) { poss = to; root = { type: t.action.toUpperCase(), id: f.id }; }
    } else if (t.origin) {
      // attempts carry the simulator origin; OTHER = possession changed silently
      let o = t.origin;
      if (o.type === "OTHER" || o.type === "THROW_IN") { poss = t.team; root = o; }
      else if (["FREE", "SIDELINE", "FORTY_FIVE"].includes(o.type) && rootAt.has(o.id)) o = rootAt.get(o.id) ?? o;
      if (t.action === "score") rootOfScore.set(f.id, o);
    }
  }
  return rootOfScore;
}

// Each rule: (fact g, winner) → "credit" | "stop" | "continue"
/** Who has the ball after a recorded award (free / sideline / 45-65). */
const awardedTo = (g) => (g.type === "free" ? g.awardedTo : g.winner);
/** P — the authoritative possession boundary (see KICKOUT-ORIGIN-DEFINITION.md). */
const P_RULE = (g, w) => {
  if (g.type === "restart" || g.type === "turnover") return "stop";
  if (["free", "sideline", "fortyFive"].includes(g.type)) return awardedTo(g) === w ? "continue" : "stop";
  if (["shot", "wide", "score"].includes(g.type) && g.team !== w) return "stop";
  if (g.type === "score") return "credit";
  if (g.type === "wide") return "stop";
  return "continue";
};
const RULES = {
  "R0 current: next restart or window only": (g, w) =>
    g.type === "restart" ? "stop" : g.type === "score" && g.team === w ? "credit" : "continue",
  "R1 + any turnover ends it": (g, w) =>
    g.type === "restart" || g.type === "turnover" ? "stop" : g.type === "score" && g.team === w ? "credit" : "continue",
  "R2 + any free / sideline / 45-65 award ends it": (g, w) =>
    ["restart", "turnover", "free", "sideline", "fortyFive"].includes(g.type) ? "stop" : g.type === "score" && g.team === w ? "credit" : "continue",
  "R3 + an opposition attempt ends it (they had the ball)": (g, w) =>
    ["restart", "turnover", "free", "sideline", "fortyFive"].includes(g.type) || (["shot", "wide", "score"].includes(g.type) && g.team !== w)
      ? "stop" : g.type === "score" && g.team === w ? "credit" : "continue",
  "P possession change ends it (awards to the same team do not)": P_RULE,
  "R4 + the winner's own wide or non-scoring shot ends it": (g, w) =>
    ["restart", "turnover", "free", "sideline", "fortyFive"].includes(g.type) || (["shot", "wide", "score"].includes(g.type) && g.team !== w) ||
    (["shot", "wide"].includes(g.type) && g.team === w)
      ? "stop" : g.type === "score" && g.team === w ? "credit" : "continue",
};

function evaluate(F, rule) {
  const credited = new Map(); // score id → restart id
  for (let i = 0; i < F.length; i++) {
    const f = F[i];
    if (f.type !== "restart") continue;
    for (let j = i + 1; j < F.length; j++) {
      const g = F[j];
      if (Math.floor(g.abs / 10000) !== Math.floor(f.abs / 10000) || g.abs - f.abs > W) break;
      const v = rule(g, f.winner);
      if (v === "credit") { if (!credited.has(g.id)) credited.set(g.id, f.id); break; }
      if (v === "stop") break;
    }
  }
  const truthRestart = F.filter((g) => g.type === "score" && g.truth?.origin?.type === "RESTART");
  const roots = possessionRoots(F);
  const pTruth = F.filter((g) => g.type === "score" && roots.get(g.id)?.type === "RESTART");
  let pCorrect = 0;
  for (const [sid, rid] of credited) if (roots.get(sid)?.type === "RESTART" && roots.get(sid).id === rid) pCorrect++;
  let correct = 0; const wrong = {};
  for (const [sid, rid] of credited) {
    const t = F.find((g) => g.id === sid).truth?.origin;
    if (t?.type === "RESTART" && t.id === rid) correct++;
    else { const k = t?.type === "RESTART" ? "RESTART (a later restart)" : (F.find((g) => g.id === sid).truth?.placed ? `${t?.type} (placed)` : t?.type ?? "?"); wrong[k] = (wrong[k] ?? 0) + 1; }
  }
  const missed = truthRestart.filter((g) => credited.get(g.id) !== g.truth.origin.id).length;
  return { credited: credited.size, correct, wrong, truthRestartScores: truthRestart.length, missed,
    possession: { truth: pTruth.length, correct: pCorrect, wrong: credited.size - pCorrect, missed: pTruth.filter((g) => credited.get(g.id) !== roots.get(g.id).id).length } };
}

// Turnover-origin rules (60 s window, as production). The acting team is the
// turnover winner; its first attempt is the outcome (score = credited).
const T_RULES = {
  "T-current (F-03): any turnover ends it; acting team's first attempt is the outcome": (g, w) =>
    g.type === "turnover" ? "stop" : ["score", "wide", "shot"].includes(g.type) && g.team === w ? (g.type === "score" ? "credit" : "stop") : "continue",
  "T-P: possession change ends it; acting team's first attempt is the outcome": (g, w) => {
    const v = P_RULE(g, w);
    return v === "continue" && g.type === "shot" ? "stop" : v;
  },
  "T-authoritative: + restart / free / sideline / 45-65 award / opposition attempt ends it": (g, w) =>
    ["restart", "turnover", "free", "sideline", "fortyFive"].includes(g.type) || (["shot", "wide", "score"].includes(g.type) && g.team !== w)
      ? "stop" : ["score", "wide", "shot"].includes(g.type) ? (g.type === "score" ? "credit" : "stop") : "continue",
};
function evaluateTurnovers(F, rule) {
  const credited = new Map();
  for (let i = 0; i < F.length; i++) {
    const f = F[i];
    if (f.type !== "turnover") continue;
    for (let j = i + 1; j < F.length; j++) {
      const g = F[j];
      if (Math.floor(g.abs / 10000) !== Math.floor(f.abs / 10000) || g.abs - f.abs > 60) break;
      const v = rule(g, f.winner);
      if (v === "credit") { if (!credited.has(g.id)) credited.set(g.id, f.id); break; }
      if (v === "stop") break;
    }
  }
  const truthT = F.filter((g) => g.type === "score" && g.truth?.origin?.type === "TURNOVER");
  const roots = possessionRoots(F);
  const pTruth = F.filter((g) => g.type === "score" && roots.get(g.id)?.type === "TURNOVER");
  let pCorrect = 0;
  for (const [sid, tid] of credited) if (roots.get(sid)?.type === "TURNOVER" && roots.get(sid).id === tid) pCorrect++;
  let correct = 0; const wrong = {};
  for (const [sid, tid] of credited) {
    const t = F.find((g) => g.id === sid).truth;
    if (t?.origin?.type === "TURNOVER" && t.origin.id === tid) correct++;
    else { const k = `${t?.origin?.type}${t?.placed ? " (placed)" : ""}`; wrong[k] = (wrong[k] ?? 0) + 1; }
  }
  return { credited: credited.size, correct, wrong, truthTurnoverScores: truthT.length, missed: truthT.filter((g) => credited.get(g.id) !== g.truth.origin.id).length,
    possession: { truth: pTruth.length, correct: pCorrect, wrong: credited.size - pCorrect, missed: pTruth.filter((g) => credited.get(g.id) !== roots.get(g.id).id).length } };
}

const out = { window: W, matches: {} };
for (const id of ["A", "B", "C"]) {
  const F = facts(JSON.parse(readFileSync(`${root}/fixtures/match-${id}.json`, "utf8")));
  out.matches[id] = Object.fromEntries([
    ...Object.entries(RULES).map(([k, r]) => [k, evaluate(F, r)]),
    ...Object.entries(T_RULES).map(([k, r]) => [k, evaluateTurnovers(F, r)]),
  ]);
}
writeFileSync(`${root}/results/kickout-origin-rules-${W}s.json`, JSON.stringify(out, null, 1));
for (const k of [...Object.keys(RULES), ...Object.keys(T_RULES)]) {
  const tot = { credited: 0, correct: 0, truth: 0, missed: 0, wrong: {}, p: { truth: 0, correct: 0, wrong: 0, missed: 0 } };
  for (const id of ["A", "B", "C"]) {
    const e = out.matches[id][k];
    tot.credited += e.credited; tot.correct += e.correct; tot.truth += e.truthRestartScores ?? e.truthTurnoverScores; tot.missed += e.missed;
    for (const [w, n] of Object.entries(e.wrong)) tot.wrong[w] = (tot.wrong[w] ?? 0) + n;
    for (const k2 of Object.keys(tot.p)) tot.p[k2] += e.possession[k2];
  }
  console.log(`${k.slice(0, 58).padEnd(58)} | stoppage truth: credited ${String(tot.credited).padStart(3)} correct ${String(tot.correct).padStart(3)} wrong ${String(tot.credited - tot.correct).padStart(2)} ${JSON.stringify(tot.wrong)}  truth ${tot.truth} missed ${tot.missed} | POSSESSION truth ${tot.p.truth}: correct ${tot.p.correct} wrong ${tot.p.wrong} missed ${tot.p.missed}`);
}
