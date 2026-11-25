#!/usr/bin/env node
// PáircVision Guardian V1 — TypeScript known-diagnostics baseline.
//
// `tsc -b` currently reports pre-existing errors on main. This script records
// each one as  file + error code + first message line  (no line/column, so
// moving code does not change it) and compares every run against that list:
//
//   NEW       a diagnostic not in the baseline (or more copies of one)  → fail
//   RESOLVED  a baseline entry that no longer occurs                    → fail,
//             until the entry is removed from the baseline, so a fixed
//             error cannot silently come back later
//   GREW      (PRs only) the baseline file gained entries vs the base   → fail
//   COMPILER  tsc did not run, or printed output this script cannot
//             interpret                                                  → fail
//
// The baseline lists errors that EXIST. Passing this check never means the
// code type-checks cleanly.
//
// Usage (from the repo root, after `npm ci`):
//   node .github/scripts/ts-baseline.mjs check [--base-baseline <file>] [--summary <file>]
//   node .github/scripts/ts-baseline.mjs update     # owner-reviewed baseline edits only

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BASELINE_PATH = ".github/typescript-baseline.txt";

const FILE_DIAG = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const GLOBAL_DIAG = /^error (TS\d+): (.*)$/;
const FOUND_SUMMARY = /^Found (\d+) errors?\b/;

/** Parses `tsc --pretty false` output into diagnostic keys. Throws on any line it cannot interpret. */
export function parseTscOutput(text) {
  const keys = [];
  let reportedTotal = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") continue;
    if (/^\s/.test(line)) {
      if (keys.length === 0) throw new Error(`Unexpected indented line before any diagnostic: ${line}`);
      continue; // continuation of the previous diagnostic's message chain
    }
    let m = FILE_DIAG.exec(line);
    if (m) {
      keys.push(makeKey(m[1].replace(/\\/g, "/"), m[4], m[5]));
      continue;
    }
    m = GLOBAL_DIAG.exec(line);
    if (m) {
      keys.push(makeKey("<global>", m[1], m[2]));
      continue;
    }
    m = FOUND_SUMMARY.exec(line);
    if (m) {
      reportedTotal = Number(m[1]);
      continue;
    }
    throw new Error(`Uninterpretable compiler output line: ${line}`);
  }
  if (reportedTotal !== null && reportedTotal !== keys.length) {
    throw new Error(`Compiler reported ${reportedTotal} errors but ${keys.length} were parsed.`);
  }
  return keys;
}

function makeKey(file, code, message) {
  return [file, code, message.replace(/\t/g, " ").trim()].join("\t");
}

export function countKeys(keys) {
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}

/** Baseline format: `#` comments, then `count<TAB>file<TAB>code<TAB>message` per line. */
export function parseBaseline(text) {
  const counts = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length !== 4 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < 1) {
      throw new Error(`Malformed baseline line: ${line}`);
    }
    const key = parts.slice(1).join("\t");
    if (counts.has(key)) throw new Error(`Duplicate baseline entry: ${key}`);
    counts.set(key, Number(parts[0]));
  }
  return counts;
}

export function formatBaseline(counts) {
  const header = [
    "# PáircVision Guardian V1 — known TypeScript diagnostics (tsc -b).",
    "# These are EXISTING ERRORS, tolerated temporarily. This is not a clean type check.",
    "# Format: count<TAB>file<TAB>code<TAB>first message line (no line numbers).",
    "# Entries may only be removed (when fixed). Adding entries needs explicit owner approval.",
    "# Regenerate with: node .github/scripts/ts-baseline.mjs update",
  ];
  const body = [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, n]) => `${n}\t${key}`);
  return [...header, ...body, ""].join("\n");
}

/** Multiset difference: what `a` has more of than `b`. */
function excess(a, b) {
  const out = [];
  for (const [key, n] of a) {
    const extra = n - (b.get(key) ?? 0);
    if (extra > 0) out.push({ key, extra });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

export function compare(current, baseline) {
  return { added: excess(current, baseline), resolved: excess(baseline, current) };
}

export function runTsc() {
  const tscBin = "node_modules/typescript/bin/tsc";
  if (!existsSync(tscBin)) throw new Error(`${tscBin} not found — run npm ci first.`);
  // --force: ignore any incremental .tsbuildinfo so the result never depends on a stale cache.
  const r = spawnSync(process.execPath, [tscBin, "-b", "--force", "--pretty", "false"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`tsc could not be started: ${r.error.message}`);
  if (r.signal) throw new Error(`tsc was killed by signal ${r.signal}`);
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const keys = parseTscOutput(output);
  // tsc exit codes: 0 = no errors; 1 / 2 = diagnostics reported. Anything else is a failure to run.
  if (r.status === 0 && keys.length > 0) throw new Error("tsc exited 0 but printed errors.");
  if ((r.status === 1 || r.status === 2) && keys.length === 0) {
    throw new Error(`tsc exited ${r.status} without any interpretable diagnostic.`);
  }
  if (r.status !== 0 && r.status !== 1 && r.status !== 2) throw new Error(`tsc exited with unexpected status ${r.status}.`);
  return keys;
}

function total(counts) {
  let n = 0;
  for (const v of counts.values()) n += v;
  return n;
}

function describe(list) {
  return list.map(({ key, extra }) => {
    const [file, code, message] = key.split("\t");
    return `${extra > 1 ? `${extra}× ` : ""}${file}: ${code}: ${message}`;
  });
}

function main(argv) {
  const [mode, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (mode === "update") {
    const counts = countKeys(runTsc());
    writeFileSync(BASELINE_PATH, formatBaseline(counts));
    console.log(`Wrote ${BASELINE_PATH}: ${total(counts)} known errors in ${counts.size} entries. Review the diff before committing.`);
    return 0;
  }
  if (mode !== "check") {
    console.error("Usage: ts-baseline.mjs check [--base-baseline <file>] [--summary <file>] | update");
    return 2;
  }

  if (!existsSync(BASELINE_PATH)) throw new Error(`${BASELINE_PATH} is missing.`);
  const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"));
  const current = countKeys(runTsc());
  const { added, resolved } = compare(current, baseline);

  let grew = [];
  const basePath = opt("--base-baseline");
  if (basePath && existsSync(basePath)) {
    grew = excess(baseline, parseBaseline(readFileSync(basePath, "utf8")));
  }

  const lines = [
    "## TypeScript known-errors baseline",
    "",
    `**This is not a clean type check.** tsc -b reports ${total(current)} errors; ${total(baseline)} are recorded as known pre-existing errors.`,
    "",
    `- New errors: **${added.reduce((n, x) => n + x.extra, 0)}**`,
    `- Resolved errors still listed in the baseline: **${resolved.reduce((n, x) => n + x.extra, 0)}**`,
    `- Baseline entries added by this change: **${grew.reduce((n, x) => n + x.extra, 0)}**`,
  ];
  const section = (title, list) => (list.length ? ["", `### ${title}`, "```", ...describe(list), "```"] : []);
  lines.push(
    ...section("New errors (fix them; do not add them to the baseline)", added),
    ...section("Resolved — remove these from .github/typescript-baseline.txt", resolved),
    ...section("Baseline grew — needs explicit owner approval", grew),
  );
  const report = lines.join("\n");
  console.log(report);
  const summary = opt("--summary");
  if (summary) appendFileSync(summary, `${report}\n`);

  for (const d of describe(added)) console.log(`::error::New TypeScript error: ${d}`);
  for (const d of describe(resolved)) console.log(`::error::Resolved error still in baseline (remove it): ${d}`);
  for (const d of describe(grew)) console.log(`::error::Baseline entry added: ${d}`);
  return added.length || resolved.length || grew.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.log(`::error::TypeScript baseline check could not run: ${err.message}`);
    process.exitCode = 1;
  }
}
