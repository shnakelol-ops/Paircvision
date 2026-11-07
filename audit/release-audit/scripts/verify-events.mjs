// verify-events.mjs — every stored event against the independent reference facts.
//
//   node verify-events.mjs <A|B|C> <runDir> <out.json>
//
// The reference (reference.mjs) turns each fixture tap into a real-world fact:
// who scored / shot / won the restart, turnover, free or 45, which card, the
// score source, the player and their team. This script decodes each event the
// app STORED back into the same terms, using only the documented Event Stats
// storage rules (no src/ imports):
//   score / wide / shot / card .... team = teamSide
//   *_WON (restart, 45/65, sideline) winner = teamSide; *_CONCEDED winner = the other side
//   TURNOVER_WON / FREE_WON ........ our team won it; *_LOST / *_CONCEDED: the opposition did
//   player team ................... from the squad the player was picked from (squadId)
// and compares field by field: at full time (live facts) and after the Review
// edits/deletes (final facts).
import { readFileSync, writeFileSync } from "node:fs";
import { buildFacts } from "./reference.mjs";

const [id, runDir, outFile] = process.argv.slice(2);
const root = new URL("..", import.meta.url).pathname;
const fx = JSON.parse(readFileSync(`${root}/fixtures/match-${id}.json`, "utf8"));
const other = (t) => (t === "FOR" ? "OPP" : "FOR");
const SOURCE = { PLAY: "Play", FREE: "Free", PENALTY: "Penalty", MARK: "Mark", "45": "45", "65": "65" };

function decode(e, squads) {
  const k = e.kind;
  const playerTeam = e.squadId === squads.home ? "FOR" : e.squadId === squads.away ? "OPP" : null;
  const player = e.playerNumber != null ? { number: e.playerNumber, team: playerTeam } : null;
  const base = { half: e.half, clock: e.matchClockSeconds, player };
  const src = (e.tags ?? []).map((t) => SOURCE[t]).find(Boolean) ?? null;
  if (["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"].includes(k)) return { ...base, type: "score", team: e.teamSide, value: k === "GOAL" ? 3 : k === "POINT" ? 1 : 2, goal: k === "GOAL", source: k === "FORTY_FIVE_TWO_POINT" ? "45" : src };
  if (k === "WIDE") return { ...base, type: "wide", team: e.teamSide, source: src };
  if (k === "SHOT") return { ...base, type: "shot", team: e.teamSide };
  if (k === "KICKOUT_WON" || k === "KICKOUT_CONCEDED") return { ...base, type: "restart", owner: e.restartOwner ?? null, winner: k === "KICKOUT_WON" ? e.teamSide : other(e.teamSide) };
  if (k.startsWith("FORTY_FIVE_")) return { ...base, type: "fortyFive", winner: k.endsWith("_WON") ? e.teamSide : other(e.teamSide) };
  if (k.startsWith("SIDELINE_")) return { ...base, type: "sideline", winner: k.endsWith("_WON") ? e.teamSide : other(e.teamSide) };
  if (k === "TURNOVER_WON" || k === "TURNOVER_LOST") return { ...base, type: "turnover", winner: k === "TURNOVER_WON" ? "FOR" : "OPP", sideField: e.teamSide };
  if (k === "FREE_WON" || k === "FREE_CONCEDED") return { ...base, type: "free", awardedTo: k === "FREE_WON" ? "FOR" : "OPP" };
  if (k === "YELLOW_CARD" || k === "SIN_BIN" || k === "RED_CARD") return { ...base, type: "card", team: e.teamSide, card: { YELLOW_CARD: "Yellow", SIN_BIN: "Sin Bin", RED_CARD: "Red" }[k] };
  return { ...base, type: `unknown:${k}` };
}

function expectedOf(f) {
  const exp = { half: f.half, clock: f.clock, player: f.player ? { number: f.player.number, team: f.player.team } : null, type: f.type };
  if (f.type === "score") Object.assign(exp, { team: f.team, value: f.value, goal: f.goal, source: f.source ?? null });
  if (f.type === "wide") Object.assign(exp, { team: f.team, source: f.source ?? null });
  if (f.type === "shot") Object.assign(exp, { team: f.team });
  if (f.type === "restart") Object.assign(exp, { owner: f.owner, winner: f.winner });
  if (f.type === "fortyFive" || f.type === "sideline") Object.assign(exp, { winner: f.winner });
  if (f.type === "turnover") Object.assign(exp, { winner: f.winner });
  if (f.type === "free") Object.assign(exp, { awardedTo: f.awardedTo });
  if (f.type === "card") Object.assign(exp, { team: f.team, card: f.card });
  return exp;
}

function compareStage(label, storeFile, facts, deleted) {
  const match = JSON.parse(readFileSync(`${runDir}/state/${storeFile}`, "utf8")).find((m) => m.homeTeamName === fx.homeTeam);
  const squads = { home: match.homeSquad.id, away: match.awaySquad.id };
  // Stored events are in tap order; fixture live taps (minus undone taps, minus deletes) give their ids.
  const byId = new Map(facts.map((f) => [f.id, f]));
  const ids = fx.steps.filter((s) => s.op === "tag" && !s.ev.erroneous).map((s) => s.ev.id).filter((x) => !deleted.has(x) && byId.has(x));
  const rows = [];
  if (ids.length !== match.events.length) rows.push({ id: "(count)", field: "events", expected: ids.length, actual: match.events.length });
  ids.forEach((fid, i) => {
    const e = match.events[i];
    if (!e) return;
    const got = decode(e, squads);
    const exp = expectedOf(byId.get(fid));
    for (const field of Object.keys(exp)) {
      const a = JSON.stringify(got[field] ?? null), x = JSON.stringify(exp[field] ?? null);
      if (a !== x) rows.push({ id: fid, field, expected: exp[field] ?? null, actual: got[field] ?? null, kind: e.kind, tags: e.tags });
    }
    if (got.type === "turnover" && got.sideField !== "FOR") rows.push({ id: fid, field: "turnover teamSide", expected: "FOR", actual: got.sideField });
  });
  const fieldsChecked = ids.reduce((n, fid) => n + Object.keys(expectedOf(byId.get(fid))).length, 0);
  return { stage: label, events: ids.length, stored: match.events.length, fieldsChecked, mismatches: rows };
}

const liveFacts = buildFacts({ ...fx, reviewOps: [] });
const finalFacts = buildFacts(fx);
const deleted = new Set((fx.reviewOps ?? []).filter((o) => o.op === "delete").map((o) => o.targetId));
const stages = [
  compareStage("HT (stored at half-time, first-half events)", "HT.json", liveFacts.filter((f) => f.half === 1), new Set()),
  compareStage("FT (stored at full time)", "FT.json", liveFacts, new Set()),
  compareStage("Final (after Review edits/deletes, reopened)", "final.json", finalFacts, deleted),
];
writeFileSync(outFile, JSON.stringify({ match: id, stages }, null, 1));
for (const s of stages) console.log(`${id} ${s.stage}: ${s.events} events, ${s.fieldsChecked} fields, ${s.mismatches.length} mismatches`);
