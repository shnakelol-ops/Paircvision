#!/usr/bin/env node
// One-off recovery of the Event Stats laboratory from branch
// claude/pairc-event-stats-audit-ca55sj @ 76c6139 (kept for audit).
//
// Usage:
//   git archive 76c6139 audit | tar -x -C <tmp>
//   node lab/event-stats/tools/recover-from-history.mjs <tmp>/audit lab/event-stats
//
// What it does, and nothing else:
//   1. Copies an explicit allow-list of files (no PDFs, images, run captures).
//   2. Replaces real club, venue and player names with synthetic labels — a
//      label-only change. Statistics, ids, coordinates, clocks and every other
//      value are untouched (verified by tools/reproduce.mjs).
//   3. Refuses to finish if any original name survives in the output.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) throw new Error("usage: recover-from-history.mjs <audit-dir> <lab-dir>");

const RA = "release-audit";
const RR = "event-stats-red-repairs";
/** [source (relative to audit/), destination (relative to the lab)] */
const FILES = [
  [`${RA}/scripts/reference.mjs`, "scripts/reference.mjs"],
  [`${RA}/scripts/reference-kickout-phase.mjs`, "scripts/reference-kickout-phase.mjs"],
  [`${RA}/scripts/gen-fixtures.mjs`, "scripts/gen-fixtures.mjs"],
  [`${RA}/scripts/ui-driver.mjs`, "scripts/ui-driver.mjs"],
  [`${RA}/scripts/run-match.mjs`, "scripts/run-match.mjs"],
  [`${RA}/scripts/verify-events.mjs`, "scripts/verify-events.mjs"],
  [`${RA}/scripts/compare.mjs`, "scripts/compare.mjs"],
  [`${RA}/scripts/compare-legacy.mjs`, "scripts/compare-legacy.mjs"],
  [`${RA}/scripts/run-legacy-import.mjs`, "scripts/run-legacy-import.mjs"],
  [`${RA}/scripts/dump-pdf-text.mjs`, "scripts/dump-pdf-text.mjs"],
  [`${RR}/scripts/run-edit-probe.mjs`, "scripts/run-edit-probe.mjs"],
  ...["A", "B", "B.planned", "C"].map((m) => [`${RA}/fixtures/match-${m}.json`, `fixtures/match-${m}.json`]),
  ...["A", "B-live", "B", "C"].flatMap((l) => [
    [`${RA}/expected/ledger-${l}.json`, `expected/ledger-${l}.json`],
    [`${RA}/expected-authoritative/ledger-${l}.json`, `expected-authoritative/ledger-${l}.json`],
  ]),
  [`${RA}/expected-authoritative/VALIDATION.json`, "expected-authoritative/VALIDATION.json"],
  [`${RR}/KICKOUT-ORIGIN-DEFINITION.md`, "docs/KICKOUT-ORIGIN-DEFINITION.md"],
  ...["ui-driver", "probe", "probe-p0", "probe-sp", "probe-review", "probe-final", "quota", "quota2", "latency", "savecost", "run-match-clearplayer"].map(
    (f) => [`${RR}/persistence/${f}.mjs`, `persistence/${f}.mjs`],
  ),
];

/** Real clubs and venues → synthetic labels. Longest first so no partial overlap is replaced early. */
const PLACES = [
  ["Ballyhale Shamrocks", "Synthetic Hurling Club 2"], ["Kilmacud Crokes", "Synthetic Football Club 3"],
  ["FBD Semple Stadium", "Synthetic Venue C"], ["Semple Stadium", "Synthetic Venue C"],
  ["Páirc Uí Rinn", "Synthetic Venue A"], ["Pearse Stadium", "Synthetic Venue B"], ["Croke Park", "Synthetic Venue D"],
  ["Nemo Rangers", "Lab A Away"], ["Castlehaven", "Lab A Home"],
  ["Moycullen", "Lab B Away"], ["Corofin", "Lab B Home"],
  ["Ballygunner", "Lab C Away"], ["Kilmallock", "Lab C Home"],
  ["St Brigid's", "Synthetic Football Club 4"], ["Na Piarsaigh", "Synthetic Hurling Club 1"],
  ["Na Fianna", "Synthetic Football Club 2"], ["Ballyboden", "Synthetic Football Club 1"],
].sort((a, b) => b[0].length - a[0].length);

/** Player names: taken from the fixtures' squads → "<match> <Home|Away> <shirt number>". */
function playerMap() {
  const map = new Map();
  for (const m of ["A", "B", "C"]) {
    const fx = JSON.parse(readFileSync(join(src, `${RA}/fixtures/match-${m}.json`), "utf8"));
    for (const [side, label] of [["FOR", "Home"], ["OPP", "Away"]]) {
      for (const p of fx.squads[side]) {
        if (!p.name) continue;
        const synthetic = `${m} ${label} ${p.number}`;
        if (map.has(p.name) && map.get(p.name) !== synthetic) throw new Error(`player name used twice: ${p.name}`);
        map.set(p.name, synthetic);
      }
    }
  }
  return map;
}

const players = playerMap();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function anonymise(text, path) {
  let out = text;
  for (const [real, synthetic] of PLACES) out = out.split(real).join(synthetic);
  // Player names only ever appear as whole quoted strings (squads in fixtures and the generator).
  for (const [real, synthetic] of players) {
    out = out.replace(new RegExp(`(["'])${escape(real)}\\1`, "g"), (_m, q) => `${q}${synthetic}${q}`);
  }
  if (path.endsWith(".json")) JSON.parse(out); // still valid JSON
  return out;
}

const written = [];
for (const [from, to] of FILES) {
  const text = readFileSync(join(src, from), "utf8");
  const target = join(dst, to);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, anonymise(text, to));
  written.push(target);
}

// Refuse to finish if any original name survived anywhere in the output.
const leaks = [];
for (const file of written) {
  const text = readFileSync(file, "utf8");
  for (const real of [...PLACES.map(([r]) => r), ...players.keys()]) {
    if (new RegExp(`(^|[^A-Za-z])${escape(real)}($|[^A-Za-z])`).test(text)) leaks.push(`${file}: ${real}`);
  }
}
if (leaks.length) throw new Error(`original names survived:\n${leaks.join("\n")}`);
console.log(`Recovered ${written.length} files into ${dst}; ${PLACES.length} club/venue names and ${players.size} player names replaced; no original name remains.`);
