// Independent check of turnover-origin scoring on the real Ballylanders v
// Galbally Event Stats log. Decodes stored events using the documented Event
// Stats capture contract (no src/ imports) and applies the audit reference
// rule: the turnover winner's next decisive action within 60 s — an attempt,
// losing the ball, or winning a fresh turnover — decides whether it scored.
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const other = (t) => (t === "FOR" ? "OPP" : "FOR");
const facts = raw.events.map((e) => {
  const abs = (e.period === "2H" ? 3600 : 0) + (e.matchClockSeconds ?? 0);
  if (e.kind === "TURNOVER_WON") return { id: e.id, abs, type: "turnover", winner: e.teamSide };
  if (e.kind === "TURNOVER_LOST") return { id: e.id, abs, type: "turnover", winner: other(e.teamSide) };
  if (["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"].includes(e.kind)) return { id: e.id, abs, type: "score", team: e.teamSide };
  if (["WIDE", "SHOT"].includes(e.kind)) return { id: e.id, abs, type: "attempt", team: e.teamSide };
  return { id: e.id, abs, type: "other" };
}).sort((a, b) => a.abs - b.abs);
const res = { FOR: { won: 0, scored: 0 }, OPP: { won: 0, scored: 0 } };
const detail = [];
facts.forEach((f, i) => {
  if (f.type !== "turnover") return;
  res[f.winner].won++;
  let outcome = "none";
  for (const g of facts.slice(i + 1)) {
    if (g.abs - f.abs > 60) break;
    if (g.type === "turnover") { outcome = `turnover ${g.id}`; break; }
    if ((g.type === "score" || g.type === "attempt") && g.team === f.winner) { outcome = g.type === "score" ? `SCORE ${g.id}` : `attempt ${g.id}`; break; }
  }
  if (outcome.startsWith("SCORE")) res[f.winner].scored++;
  detail.push(`${f.id} won by ${f.winner} → ${outcome}`);
});
console.log(JSON.stringify(res));
for (const d of detail.filter((d) => d.includes("won by OPP"))) console.log("  ", d);
