// compare-repairs-extra.mjs — cross-page F-05 consistency added for the repair
// batch: "Clean / Break / Foul Won" for own restarts must equal the reference
// (own restarts the team took AND kept, by method) on BOTH the Restart
// Analysis panel and the Restart Chain Analysis page. Kept separate from the
// audit's compare.mjs so the before/after join stays like-for-like.
//   node compare-repairs-extra.mjs
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const checks = [];
for (const id of ["A", "B", "C"]) {
  const fx = JSON.parse(readFileSync(`${root}/fixtures/match-${id}.json`, "utf8"));
  const L = JSON.parse(readFileSync(`${root}/expected/ledger-${id}${id === "B" ? "-live" : ""}.json`, "utf8"));
  const pages = JSON.parse(readFileSync(`${root}/runs/${id}/pdf-text/${id}-FullReview-live.json`, "utf8")).pages;
  const page = (title) => pages.find((p) => p.texts.some((t) => t.t === title && Math.abs(t.y - 38) < 3));
  const valRight = (p, label, x0, x1, nth = 0) => {
    const lab = p.texts.filter((t) => t.t === label && t.x >= x0 && t.x < x1)[nth];
    if (!lab) return undefined;
    const v = p.texts.filter((t) => Math.abs(t.y - lab.y) <= 3 && t.x > lab.x && t.x < x1).sort((a, b) => b.x - a.x)[0];
    return v?.t;
  };
  const ra = page("Restart Analysis"), rc = page("Restart Chain Analysis");
  const methods = [["Clean Won", "retainedClean"], ["Break Won", "retainedBreak"], ["Foul Won", "retainedFoul"]];
  for (const [lab, key] of methods) {
    const exp = L.FULL.FOR.ownRestartMethods[key];
    const raV = valRight(ra, lab, 0, 640);
    const rcV = valRight(rc, lab, 600, 1290, 0);
    const rcOpp = valRight(rc, lab, 600, 1290, 1);
    for (const [surface, team, e, a] of [["Restart Analysis — HOW WON", "FOR", exp, raV], ["Restart Chain Analysis — own kickouts retained", "FOR", exp, rcV], ["Restart Chain Analysis — own kickouts retained", "OPP", L.FULL.OPP.ownRestartMethods[key], rcOpp]]) {
      checks.push({ match: id, sport: fx.sport, surface, stat: lab, team, expected: String(e), actual: String(a), status: String(e) === String(a) ? "PASS" : "FAIL" });
    }
  }
}
const summary = { total: checks.length, pass: checks.filter((c) => c.status === "PASS").length, fail: checks.filter((c) => c.status === "FAIL").length };
writeFileSync(`${root}/results/compare-repairs-extra.json`, JSON.stringify({ summary, checks }, null, 1));
console.log(JSON.stringify(summary));
for (const c of checks.filter((x) => x.status === "FAIL")) console.log("FAIL", c.match, c.surface, c.stat, c.team, "exp", c.expected, "act", c.actual);
