// Independent check of kickout-origin scoring on the real Ballylanders v
// Galbally Event Stats log under the authoritative definition (no src/
// imports): the possession won from the kickout ends when the ball changes
// hands (any turnover, an opposition attempt, a free / 45 / sideline awarded
// to the other team), at the next kickout, the team's own wide, or 90 s.
// Frees / 45s / sidelines the same team keeps do not end it.
//   node real-kickouts.mjs <log.json> [FOR|OPP]
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const TEAM = process.argv[3] ?? "FOR";
const other = (t) => (t === "FOR" ? "OPP" : "FOR");
const ev = raw.events.map((e) => ({ ...e, abs: (e.period === "2H" ? 3600 : 0) + (e.matchClockSeconds ?? 0) })).sort((a, b) => a.abs - b.abs);
const SCORE = ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"];
const KICKOUT = ["KICKOUT_WON", "KICKOUT_CONCEDED"];
const AWARD = ["FREE_WON", "FREE_CONCEDED", "FORTY_FIVE_WON", "FORTY_FIVE_CONCEDED", "SIDELINE_WON", "SIDELINE_CONCEDED"];
const awardedTo = (g) => (g.kind.endsWith("_WON") ? g.teamSide : other(g.teamSide));
const CHANGE = ["TURNOVER_WON", "TURNOVER_LOST", "POSSESSION_WON", "POSSESSION_LOST"];
const attempt = (k) => SCORE.includes(k) || ["WIDE", "FREE_MISSED", "SHOT"].includes(k);
let won = 0, oldScored = 0, newScored = 0;
ev.forEach((k, i) => {
  if (k.kind !== "KICKOUT_WON" && k.kind !== "KICKOUT_CONCEDED") return;
  const w = k.kind === "KICKOUT_WON" ? k.teamSide : other(k.teamSide);
  if (w !== TEAM) return;
  won++;
  // previous rule: first FOR score before the next kickout, ≤ 90 s
  let oldS = null;
  for (const g of ev.slice(i + 1)) { if (g.abs - k.abs > 90 || g.kind.startsWith("KICKOUT")) break; if (g.teamSide === TEAM && SCORE.includes(g.kind)) { oldS = g; break; } }
  // authoritative phase
  let newS = null, end = "window";
  const trail = [];
  for (const g of ev.slice(i + 1)) {
    if (g.abs - k.abs > 90) break;
    trail.push(`${g.kind}/${g.teamSide}${g.tags?.length ? "[" + g.tags.join(",") + "]" : ""}@${g.abs - k.abs}s`);
    if (KICKOUT.includes(g.kind)) { end = "next kickout"; break; }
    if (AWARD.includes(g.kind)) { if (awardedTo(g) === TEAM) continue; end = "restart awarded to the other team"; break; }
    if (CHANGE.includes(g.kind)) { end = "possession change"; break; }
    if (attempt(g.kind) && g.teamSide !== TEAM) { end = "opposition attempt"; break; }
    if (attempt(g.kind) && SCORE.includes(g.kind)) { newS = g; end = "score"; break; }
    if (attempt(g.kind) && g.kind !== "SHOT") { end = "wide"; break; }
  }
  if (oldS) oldScored++;
  if (newS) newScored++;
  if (oldS || newS) console.log(`${k.id.slice(-6)} ${k.period} ${k.matchClockSeconds}s  previous: ${oldS ? oldS.kind : "-"}  authoritative: ${newS ? newS.kind : "- (" + end + ")"}\n      ${trail.slice(0, 8).join("  ")}`);
});
console.log(`${TEAM} kickouts won ${won}: previous rule ${oldScored} scored, authoritative ${newScored} scored`);
