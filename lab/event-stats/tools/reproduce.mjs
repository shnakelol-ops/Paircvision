#!/usr/bin/env node
// Reproducibility and independence check for the Event Stats laboratory.
// Node built-ins only; imports nothing from src/. Never writes inside the lab:
// everything is regenerated in a temporary directory and compared byte for byte.
//
//   node lab/event-stats/tools/reproduce.mjs
//
// Checks:
//   1. Independence: the reference calculators and the generator import only
//      node: built-ins and each other — never src/.
//   2. Fixtures: the seeded generators reproduce match-A, match-B.planned,
//      match-C, match-D, match-E and match-F exactly; match-B (as run) differs from the plan only by
//      dropping planned Review ops (no op added or altered).
//   3. Ledgers: reference.mjs reproduces every expected/ ledger exactly, and
//      reference-kickout-phase.mjs reproduces every expected-authoritative/
//      ledger and VALIDATION.json exactly.
//   4. Determinism: a second regeneration is byte-identical to the first.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LAB = fileURLToPath(new URL("..", import.meta.url));
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
const read = (p) => readFileSync(p, "utf8");

// 1. Independence
const INDEPENDENT = ["scripts/reference.mjs", "scripts/reference-kickout-phase.mjs", "scripts/gen-fixtures.mjs", "scripts/gen-fixture-d.mjs", "scripts/gen-fixture-ef.mjs"];
/** Lab modules an independent script may import (each is itself in INDEPENDENT). */
const LAB_IMPORTS = new Set(["./reference.mjs", "./gen-fixtures.mjs"]);
for (const f of INDEPENDENT) {
  const imports = [...read(join(LAB, f)).matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const bad = imports.filter((s) => !s.startsWith("node:") && !LAB_IMPORTS.has(s));
  check(`independence: ${f} imports only node: built-ins / lab scripts (${[...LAB_IMPORTS].join(", ")})`, bad.length === 0, bad.join(", "));
  // No dynamic import() / require() of anything outside the lab (comments that merely say
  // "imports nothing from src/" are fine).
  const dynamic = [...read(join(LAB, f)).matchAll(/\b(?:import|require)\s*\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  const badDynamic = dynamic.filter((s) => !s.startsWith("node:") && !LAB_IMPORTS.has(s));
  check(`independence: ${f} loads no module dynamically from outside the lab`, badDynamic.length === 0, badDynamic.join(", "));
}

function regenerate() {
  const tmp = mkdtempSync(join(tmpdir(), "lab-reproduce-"));
  for (const d of ["scripts", "fixtures", "expected", "rules"]) cpSync(join(LAB, d), join(tmp, d), { recursive: true });
  const node = (args) => execFileSync(process.execPath, args, { cwd: tmp, stdio: "pipe" });
  node(["scripts/gen-fixtures.mjs", join(tmp, "generated")]);
  node(["scripts/gen-fixture-d.mjs", join(tmp, "generated")]);
  node(["scripts/gen-fixture-ef.mjs", join(tmp, "generated")]);
  mkdirSync(join(tmp, "ledgers"));
  for (const m of ["A", "B", "C", "D", "E", "F"]) node(["scripts/reference.mjs", `fixtures/match-${m}.json`, join(tmp, "ledgers", `ledger-${m}.json`)]);
  // Writes tmp/expected-authoritative/ (never the lab's own copy).
  node(["scripts/reference-kickout-phase.mjs"]);
  return tmp;
}

const runA = regenerate();
const runB = regenerate();
try {
  // 2. Fixtures
  for (const [gen, committed] of [["match-A", "match-A"], ["match-B", "match-B.planned"], ["match-C", "match-C"], ["match-D", "match-D"], ["match-E", "match-E"], ["match-F", "match-F"]]) {
    check(`fixture: generator reproduces fixtures/${committed}.json`, read(join(runA, "generated", `${gen}.json`)) === read(join(LAB, "fixtures", `${committed}.json`)));
  }
  const planned = JSON.parse(read(join(LAB, "fixtures/match-B.planned.json")));
  const asRun = JSON.parse(read(join(LAB, "fixtures/match-B.json")));
  const sameExceptReviewOps = Object.keys(planned).every((k) => k === "reviewOps" || JSON.stringify(planned[k]) === JSON.stringify(asRun[k]));
  const plannedOps = planned.reviewOps.map((o) => JSON.stringify(o));
  let i = 0;
  const dropped = [];
  for (const op of asRun.reviewOps.map((o) => JSON.stringify(o))) {
    while (i < plannedOps.length && plannedOps[i] !== op) dropped.push(plannedOps[i++]);
    if (i === plannedOps.length) { dropped.push("NOT A SUBSEQUENCE"); break; }
    i++;
  }
  dropped.push(...plannedOps.slice(i));
  check("fixture: match-B (as run) equals the plan apart from dropped Review ops", sameExceptReviewOps && !dropped.includes("NOT A SUBSEQUENCE"),
    `dropped: ${dropped.map((d) => { const o = JSON.parse(d); return `${o.op} ${o.targetId}${o.newKind ? ` → ${o.newKind}` : ""}`; }).join("; ")}`);

  // 3. Ledgers
  for (const l of ["A", "B", "B-live", "C", "D", "D-live", "E", "E-live", "F", "F-live"]) {
    check(`ledger: reference.mjs reproduces expected/ledger-${l}.json`, read(join(runA, "ledgers", `ledger-${l}.json`)) === read(join(LAB, "expected", `ledger-${l}.json`)));
  }
  for (const f of readdirSync(join(LAB, "expected-authoritative")).sort()) {
    check(`ledger: reference-kickout-phase.mjs reproduces expected-authoritative/${f}`, read(join(runA, "expected-authoritative", f)) === read(join(LAB, "expected-authoritative", f)));
  }

  // 4. Determinism
  for (const d of ["generated", "ledgers", "expected-authoritative"]) {
    for (const f of readdirSync(join(runA, d)).sort()) {
      check(`determinism: ${d}/${f} identical on a second run`, read(join(runA, d, f)) === read(join(runB, d, f)));
    }
  }
} finally {
  rmSync(runA, { recursive: true, force: true });
  rmSync(runB, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} reproducibility checks passed.`);
process.exitCode = failed ? 1 : 0;
