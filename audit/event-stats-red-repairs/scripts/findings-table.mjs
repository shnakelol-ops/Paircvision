// findings-table.mjs — F-01…F-06 before/after, built from the check-level
// joins (results/before-after-*.json) and the legacy-import comparisons.
// Each changed check is assigned to the finding whose defect it measures.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");

function finding(key) {
  const [surface, page, , stat] = key.split(" ¦ ");
  if (/HOW WON — (Clean|Break) Won/.test(stat)) return "F-05";
  if (/HOW WON — Foul Won/.test(stat)) return "F-01 / F-05";
  if (/[Bb]lock|blocked/.test(stat)) return "F-06";
  if (/Swarm|Slack|Foul (Won|Conceded)|Unforced/.test(stat)) return "F-01";
  if (/placed|Placed|Unclassified|source 45|unattributed|from general play/i.test(stat)) return "F-02";
  if (/turnover|lost → (scores|shots)|scores conceded|shots against|punishment|origin score against|conversion rate/i.test(stat) || /Origin/.test(page)) return "F-03";
  return "other";
}

const rows = [];
for (const id of ["A", "B", "C"]) {
  const { changes } = JSON.parse(readFileSync(`${root}/results/before-after-${id}.json`, "utf8"));
  for (const c of changes) rows.push({ id, f: finding(c.key), ...c });
}
const legacyBefore = JSON.parse(readFileSync(`${root}/results/compare-legacy-BEFORE.json`, "utf8"));
const legacyAfter = JSON.parse(readFileSync(`${root}/results/compare-legacy.json`, "utf8"));
for (const a of legacyAfter.checks) {
  const b = legacyBefore.checks.find((x) => x.surface === a.surface && x.stat === a.stat);
  if (b && (b.status !== a.status || b.actual !== a.actual)) {
    rows.push({ id: "A-legacy", f: "F-04", change: `${b.status}→${a.status}`, key: `${a.surface} ¦ ¦ ¦ ${a.stat}`, expected: a.expected, beforeActual: b.actual, afterActual: a.actual });
  }
}

const out = ["# F-01 – F-06 — before / after", "",
  "Every row is one automated check whose result changed between the original audit run (`a8581a5`, main `a2384fd`) and the repaired code. Expected values are from the **unchanged** independent ledgers.", ""];
const byF = rows.reduce((m, r) => ((m[r.f] ??= []).push(r), m), {});
out.push("| Finding | Checks changed | FAIL→PASS | Other transitions |", "|---|---|---|---|");
for (const f of Object.keys(byF).sort()) {
  const list = byF[f];
  out.push(`| ${f} | ${list.length} | ${list.filter((r) => r.change === "FAIL→PASS" || r.change === "MISSING→PASS").length} | ${list.filter((r) => !/→PASS$/.test(r.change)).map((r) => r.change).join(", ") || "none"} |`);
}
out.push("");
for (const f of Object.keys(byF).sort()) {
  out.push(`## ${f}`, "", "| Match | Surface | Page | Statistic | Team | Expected | Before | After | Result |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of byF[f]) {
    const [surface, page, , stat, team] = r.key.split(" ¦ ");
    out.push(`| ${r.id} | ${esc(surface)} | ${esc(page)} | ${esc(stat)} | ${esc(team)} | ${esc(r.expected)} | ${esc(r.beforeActual)} | ${esc(r.afterActual)} | ${r.change} |`);
  }
  out.push("");
}
writeFileSync(`${root}/results/F01-F06-BEFORE-AFTER.md`, out.join("\n"));
console.log(Object.fromEntries(Object.entries(byF).map(([k, v]) => [k, v.length])));
