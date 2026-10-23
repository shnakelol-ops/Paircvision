// before-after.mjs — joins the original audit results (a8581a5) with the
// post-repair results check-by-check and lists every status change.
//   node before-after.mjs <matchId> <beforeCompareJson> <afterCompareJson>
import { readFileSync, writeFileSync } from "node:fs";
const [id, beforePath, afterPath] = process.argv.slice(2);
const key = (c) => [c.surface, c.page, c.scope, c.stat, c.team].join(" ¦ ");
const before = new Map(JSON.parse(readFileSync(beforePath, "utf8")).checks.map((c) => [key(c), c]));
const after = JSON.parse(readFileSync(afterPath, "utf8")).checks;
const changes = [];
for (const a of after) {
  const b = before.get(key(a));
  if (!b) { changes.push({ change: "NEW", key: key(a), before: null, after: a }); continue; }
  if (b.status !== a.status || b.actual !== a.actual) changes.push({ change: `${b.status}→${a.status}`, key: key(a), expected: a.expected, beforeActual: b.actual, afterActual: a.actual });
}
for (const [k, b] of before) if (!after.find((a) => key(a) === k)) changes.push({ change: "REMOVED", key: k, before: b });
const counts = changes.reduce((m, c) => ((m[c.change] = (m[c.change] ?? 0) + 1), m), {});
writeFileSync(new URL(`../results/before-after-${id}.json`, import.meta.url), JSON.stringify({ counts, changes }, null, 1));
console.log(id, JSON.stringify(counts));
