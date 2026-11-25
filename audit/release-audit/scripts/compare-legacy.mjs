// compare-legacy.mjs — F-04 checks on the historical-format import (Match A's
// stored events in the pre-owner shape, imported through Options → Import).
// Expected values come from the independent ledger for Match A; own-kickout
// figures are expected to be UNAVAILABLE because the legacy record does not
// say who took each restart.
//
//   node compare-legacy.mjs [runDir] [outFile]
//   (defaults: runs/A-legacy, results/compare-legacy.json; expected/ledger-A.json)

import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const L = JSON.parse(readFileSync(`${root}/expected/ledger-A.json`, "utf8"));
const runDir = process.argv[2] ?? `${root}/runs/A-legacy`;
const outFile = process.argv[3] ?? `${root}/results/compare-legacy.json`;
const load = (label) => JSON.parse(readFileSync(`${runDir}/pdf-text/L-${label}.json`, "utf8")).pages;
const checks = [];
const check = (surface, stat, expected, actual) =>
  checks.push({ surface, stat, expected: String(expected), actual: actual === undefined ? "(not found)" : String(actual), status: String(expected) === String(actual) ? "PASS" : "FAIL" });
const texts = (page) => page.texts.map((t) => t.t);
const after = (arr, label, k = 1) => { const i = arr.indexOf(label); return i < 0 ? undefined : arr[i + k]; };

for (const [label, S, scopeName] of [["FT-snapshot-legacy", L.FULL, "FT"], ["HT-snapshot-legacy", L.H1, "HT"]]) {
  const d = texts(load(label)[0]);
  const surf = `Snapshot ${scopeName} (legacy import) — Dashboard`;
  const scores = d.filter((t) => /^\d+-\d{2} \(\d+\)$/.test(t));
  check(surf, "score FOR", `${S.FOR.score.text} (${S.FOR.score.total})`, scores[0]);
  check(surf, "score OPP", `${S.OPP.score.text} (${S.OPP.score.total})`, scores[1]);
  check(surf, "OUR KICKOUTS value (owner not recorded → unavailable)", "—", after(d, "OUR KICKOUTS"));
  check(surf, "OUR KICKOUTS note", "Restart taker not recorded", after(d, "OUR KICKOUTS", 3));
  check(surf, "THEIR KICKOUTS value (owner not recorded → unavailable)", "—", after(d, "THEIR KICKOUTS"));
  check(surf, "turnovers won", S.FOR.turnoversWon, after(d, "Won"));
  check(surf, "turnovers lost", S.FOR.turnoversLost, after(d, "Lost"));
  check(surf, "no fabricated 100% own retention", 0, d.filter((t) => t === "100%").length);
  const rb = load(label).filter((p) => /^Restart Battle/.test(p.texts.find((t) => Math.abs(t.y - 38) < 3)?.t ?? ""));
  for (const p of rb) {
    const lines = texts(p).filter((t) => / retained \d+\/\d+|Restart taker not recorded|No kickouts logged/.test(t));
    check(`Snapshot ${scopeName} (legacy) — ${texts(p)[0]}`, "own-restart lines", "Restart taker not recorded | Restart taker not recorded", lines.join(" | "));
  }
}

const fr = load("FullReview-legacy");
const page = (title) => fr.find((p) => p.texts.some((t) => t.t === title && Math.abs(t.y - 38) < 3));
const p1 = texts(page("Match Summary"));
const sum = p1.filter((t) => /^\d+-\d{2} \(\d+\)$/.test(t));
check("Full Review (legacy) — Match Summary", "score FOR", `${L.FULL.FOR.score.text} (${L.FULL.FOR.score.total})`, sum[0]);
check("Full Review (legacy) — Match Summary", "Restart Share FOR", `${L.FULL.FOR.restartShare.pct}%`, after(p1, "Restart Share"));
check("Full Review (legacy) — Match Summary", "T/O Won FOR", L.FULL.FOR.turnoversWon, after(p1, "T/O Won"));
const ra = texts(page("Restart Analysis"));
check("Full Review (legacy) — Restart Analysis", "Own Kickout Retention (unavailable)", "—", after(ra, "Own Kickout Retention"));
check("Full Review (legacy) — Restart Analysis", "Restart Share", `${L.FULL.FOR.restartShare.pct}% (${L.FULL.FOR.restartShare.num} of ${L.FULL.FOR.restartShare.den})`, after(ra, "Restart Share"));
check("Full Review (legacy) — all pages", "no 'retention 100% (27 of 27)'-style fabricated own figure", 0, fr.flatMap(texts).filter((t) => /100% \(27 of 27\)|27\/27/.test(t)).length);

// Restart Chain Analysis: when the restart taker was not recorded, each
// team's own-kickout panel must say so — not invent own retained/lost counts
// and not claim that no kickouts were recorded.
const rc = page("Restart Chain Analysis");
const panel = rc.texts.filter((t) => t.x >= 650 && t.x < 1290).sort((a, b) => a.y - b.y || a.x - b.x);
const heads = panel.filter((t) => /— KICKOUT TYPES$/.test(t.t));
heads.forEach((h, n) => {
  const y1 = heads[n + 1]?.y ?? Infinity;
  const body = panel.filter((t) => t.y > h.y && t.y < y1).map((t) => t.t);
  const surf = `Full Review (legacy) — Restart Chain Analysis (${h.t.replace(/ — KICKOUT TYPES$/, "")})`;
  check(surf, "own-kickout panel state", "Restart taker not recorded", body.join(" | "));
});
check("Full Review (legacy) — Restart Chain Analysis", "own-kickout panels found", 2, heads.length);

const summary = { total: checks.length, pass: checks.filter((c) => c.status === "PASS").length, fail: checks.filter((c) => c.status === "FAIL").length };
writeFileSync(outFile, JSON.stringify({ summary, checks }, null, 1));
console.log(JSON.stringify(summary));
for (const c of checks.filter((x) => x.status !== "PASS")) console.log("FAIL", c.surface, "|", c.stat, "| exp", c.expected, "| act", c.actual);
