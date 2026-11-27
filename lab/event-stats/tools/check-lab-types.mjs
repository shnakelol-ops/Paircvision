#!/usr/bin/env node
// Type-checks the laboratory's TypeScript (lab/event-stats/tsconfig.json — the app's compiler
// settings, unchanged). Run from the repo root after `npm ci`:
//   node lab/event-stats/tools/check-lab-types.mjs
//
// FAILS on: any error in a lab file; an error in an app file the lab imports that is NOT one of
// the app's known pre-existing errors (.github/typescript-baseline.txt); tsc not running or
// printing output that cannot be interpreted. Known app errors are listed, never hidden.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { BASELINE_PATH, countKeys, parseBaseline, parseTscOutput } from "../../../.github/scripts/ts-baseline.mjs";

const tsc = "node_modules/typescript/bin/tsc";
if (!existsSync(tsc)) {
  console.log(`::error::${tsc} not found — run npm ci first.`);
  process.exit(1);
}
const r = spawnSync(process.execPath, [tsc, "-p", "lab/event-stats/tsconfig.json", "--pretty", "false"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (r.error || r.signal || ![0, 1, 2].includes(r.status ?? -1)) {
  console.log(`::error::tsc did not run (status ${r.status}, ${r.signal ?? r.error?.message ?? ""}).`);
  process.exit(1);
}
let keys;
try {
  keys = parseTscOutput(`${r.stdout}${r.stderr}`);
} catch (err) {
  console.log(`::error::Could not interpret tsc output: ${err.message}`);
  process.exit(1);
}
if (r.status !== 0 && keys.length === 0) {
  console.log(`::error::tsc exited ${r.status} without an interpretable diagnostic.`);
  process.exit(1);
}

const known = parseBaseline(readFileSync(BASELINE_PATH, "utf8"));
const labErrors = keys.filter((k) => k.startsWith("lab/"));
const appErrors = countKeys(keys.filter((k) => !k.startsWith("lab/")));
const unknownApp = [...appErrors].filter(([k, n]) => n > (known.get(k) ?? 0)).map(([k]) => k);
const knownApp = [...appErrors].filter(([k]) => known.has(k)).map(([k]) => k);

const fmt = (k) => k.split("\t").join(": ");
console.log(`Lab TypeScript: ${labErrors.length} error(s) in lab files; ${unknownApp.length} new error(s) in imported app files; ${knownApp.length} known app error(s) (listed in ${BASELINE_PATH}, tolerated).`);
for (const k of knownApp) console.log(`  known app error (not a lab error): ${fmt(k)}`);
for (const k of labErrors) console.log(`::error::Lab TypeScript error: ${fmt(k)}`);
for (const k of unknownApp) console.log(`::error::New TypeScript error in an app file the lab imports: ${fmt(k)}`);
process.exitCode = labErrors.length || unknownApp.length ? 1 : 0;
