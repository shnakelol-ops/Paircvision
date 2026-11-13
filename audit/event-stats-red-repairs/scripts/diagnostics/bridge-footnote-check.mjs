// bridge-footnote-check.mjs — independent count of placed-ball scores inside
// kickout-origin possessions (authoritative definition), per team, compared
// with the bridge footnote printed on Restart Analysis (no src/ imports).
import { readFileSync } from "node:fs";
import { buildFacts } from "../reference.mjs";
const root = new URL("../..", import.meta.url).pathname;
const abs = (f) => (f.half === 2 ? 3600 : 0) + f.clock;
const isAttempt = (f) => ["score", "wide", "shot"].includes(f.type);
for (const id of ["A", "B", "C"]) {
  const fx = JSON.parse(readFileSync(`${root}/fixtures/match-${id}.json`, "utf8"));
  const facts = buildFacts({ ...fx, reviewOps: [] });
  const n = { FOR: 0, OPP: 0 };
  facts.forEach((f, i) => {
    if (f.type !== "restart") return;
    for (let j = i + 1; j < facts.length; j++) {
      const g = facts[j];
      if (abs(g) - abs(f) > 90 || g.type === "restart" || g.type === "turnover") break;
      if (["free", "fortyFive", "sideline"].includes(g.type)) { if ((g.type === "free" ? g.awardedTo : g.winner) === f.winner) continue; break; }
      if (!isAttempt(g)) continue;
      if (g.team !== f.winner) break;
      if (g.type === "score") { if (g.placed) n[f.winner]++; break; }
      if (g.type === "wide") break;
    }
  });
  const printed = readFileSync(`${root}/runs/${id}/pdf-text-readable/${id}-FullReview-live.txt`, "utf8").match(/Origin possessions include (\d+) placed frees? won during kickout-origin possessions \([^)]*?(\d+) · [^)]*?(\d+)\)/);
  const exp = `${n.FOR + n.OPP} (${n.FOR} · ${n.OPP})`, act = printed ? `${printed[1]} (${printed[2]} · ${printed[3]})` : "(not printed)";
  console.log(id, "expected", exp, "printed", act, exp === act ? "PASS" : "FAIL");
}
