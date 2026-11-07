// definition-impact.mjs — Intelligence branch: proves every check that fails
// against the ORIGINAL ledgers but passed on PR #374 is explained by the
// kickout-origin definition change (its expected value differs between
// expected/ and expected-authoritative/, and it passes against the latter),
// and lists every other changed check.
//   node definition-impact.mjs  → results/intelligence/DEFINITION-IMPACT.md + .json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const key = (c) => [c.surface, c.page, c.scope, c.stat, c.team].join(" ¦ ");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
const rows = [], other = [], summary = {};
for (const id of ["A", "B", "C"]) {
  const load = (f) => new Map(JSON.parse(readFileSync(`${root}/results/${f}`, "utf8")).checks.map((c) => [key(c), c]));
  const base = load(`compare-${id}.json`);                       // PR #374 vs original
  const vo = load(`intelligence/compare-${id}-intel-vs-original.json`);       // Intelligence vs original
  const va = load(`intelligence/compare-${id}-intel-vs-authoritative.json`);  // Intelligence vs authoritative
  const s = { explained: 0, f11: 0, unexplained: 0, otherChanged: 0 };
  for (const [k, a] of va) {
    const b = base.get(k), o = vo.get(k);
    const defChanged = o && o.expected !== a.expected;
    if (defChanged || (b && (b.status !== a.status || b.actual !== a.actual))) {
      const ok = defChanged && a.status === "PASS";
      // "Avg secs to score (won)" averages both teams' restarts (F-11, open):
      // its expected value moves with the definition but it keeps failing.
      const f11 = /Avg secs to score/.test(k) && a.status === "FAIL";
      const r = { id, key: k, f11, origExpected: o?.expected, authExpected: a.expected, before: b?.actual, after: a.actual, beforeStatus: b?.status, vsOriginal: o?.status, vsAuthoritative: a.status, explained: ok };
      if (defChanged) { rows.push(r); ok ? s.explained++ : f11 ? s.f11++ : s.unexplained++; } else if (f11) { other.push(r); s.f11++; } else { other.push(r); s.otherChanged++; }
    }
  }
  summary[id] = s;
}
mkdirSync(`${root}/results/intelligence`, { recursive: true });
writeFileSync(`${root}/results/intelligence/definition-impact.json`, JSON.stringify({ summary, rows, other }, null, 1));
const out = ["# Intelligence branch — what the kickout-origin definition changed", "",
  "Each row is a check whose expected value differs between the original ledgers (`expected/`, previous restart rule) and the authoritative ledgers (`expected-authoritative/`, authoritative kickout-origin possession — `KICKOUT-ORIGIN-DEFINITION.md`; validated against possession roots rebuilt from the simulator's ground truth, see `expected-authoritative/VALIDATION.json`).", "",
  "| Match | Definition change, now passes vs authoritative | Still failing: F-11 (both-teams average, open) | Not explained | Other checks whose value changed |", "|---|---|---|---|---|",
  ...Object.entries(summary).map(([id, s]) => `| ${id} | ${s.explained} | ${s.f11} | ${s.unexplained} | ${s.otherChanged} |`), "",
  "## Definition-driven changes", "", "| Match | Check | Previous rule (expected) | Authoritative (expected) | PR #374 printed | Intelligence branch printed | vs original | vs authoritative |", "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${esc(r.key.replace(/ ¦ /g, " · "))} | ${esc(r.origExpected)} | ${esc(r.authExpected)} | ${esc(r.before)} | ${esc(r.after)} | ${r.vsOriginal} | ${r.vsAuthoritative} |`), "",
  "## Other checks whose printed value changed", "", other.length ? "| Match | Check | Expected | PR #374 printed | Intelligence printed | Status |\n|---|---|---|---|---|---|\n" + other.map((r) => `| ${r.id} | ${esc(r.key.replace(/ ¦ /g, " · "))} | ${esc(r.authExpected)} | ${esc(r.before)} | ${esc(r.after)} | ${r.beforeStatus} → ${r.vsAuthoritative} |`).join("\n") : "None.", ""];
writeFileSync(`${root}/results/intelligence/DEFINITION-IMPACT.md`, out.join("\n"));
console.log(JSON.stringify(summary));
for (const r of rows.filter((x) => !x.explained && !x.f11)) console.log("UNEXPLAINED", r.id, r.key, r.authExpected, r.after);
for (const r of other.filter((x) => !x.f11)) console.log("OTHER", r.id, r.key, "|", r.before, "→", r.after, r.beforeStatus, "→", r.vsAuthoritative);
