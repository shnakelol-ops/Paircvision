#!/usr/bin/env node
// PáircVision Guardian V1 — test-integrity guard.
//
// Runs after `vitest run --reporter=json` and checks the run against two
// committed, reviewable baselines:
//
//   .github/test-baseline.txt          every existing test, by file and full name
//   .github/protected-expectations.txt SHA-256 of the files that hold Event Stats
//                                      statistical expectations (tests, fixtures)
//
// FAILS on:
//   - a missing, unreadable or failed Vitest report, or any failed test file
//   - a test file in the repo that the run did not execute
//   - any skipped / todo / pending test, or a skip/only/todo marker in source
//   - a baseline test that did not run (deleted file, removed or renamed test)
//   - executed test count below the baseline count
//   - a protected expectation file that changed or disappeared
//
// ACCEPTS new tests and new protected files (listed as notices).
//
// A legitimate removal or expectation change is made by updating the baseline
// files in the same PR (`update` mode). On pull requests the guard compares them
// with the base branch and lists every removed test and every changed protected
// file under "REVIEW REQUIRED", so it is never silently accepted.
//
// It CANNOT tell whether an assertion inside a test was weakened, an expected
// value edited in a non-protected file, or a test made to return early.
//
// Usage (repo root):
//   node .github/scripts/test-guard.mjs check --report vitest-report.json
//        [--base-baseline <file>] [--base-manifest <file>] [--summary <file>]
//   node .github/scripts/test-guard.mjs update --report vitest-report.json   # owner-reviewed only

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE_PATH = ".github/test-baseline.txt";
export const MANIFEST_PATH = ".github/protected-expectations.txt";

/** Test files Vitest runs (mirrors vitest.config.ts `include`). */
export const TEST_FILE = /^src\/.*\.test\.tsx?$/;

/** Files that hold Event Stats statistical expectations. Changing this list is a reviewed code change. */
export const PROTECTED = [
  /^src\/stats\/.*\.test\.ts$/,
  /^src\/stats\/.*fixture[^/]*\.ts$/,
  /^src\/stats\/.*\/fixtures\//,
  /^src\/core\/stats\/.*\.test\.ts$/,
  /^src\/pro-tagger\/(eventStatsP0Integration|pro-tagger-score|quickReviewShotsReconciliation|turnoverOurPlayer|pro-tagger-review-zones-parity|ProTaggerLiveScreen\.turnoverKickoutCounts|pro-tagger-adapter|pro-tagger-review-edit|pro-tagger-discipline|pro-tagger-families)\.test\.tsx?$/,
  /^src\/pro-tagger\/dashboard\/(matchMapTestFixtures\.ts|scoringMapView\.test\.ts|turnoverMapView\.test\.ts|htFtDashboardView\.test\.ts)$/,
  /^src\/StatsModeSurface\.saved-match-persistence\.test\.ts$/,
  // Event Stats laboratory: independent reference calculators, generator, synthetic matches,
  // expected ledgers, the kickout-origin definition, and the engine comparison + its classifications.
  /^lab\/event-stats\/scripts\/(reference|reference-kickout-phase|gen-fixtures|gen-fixture-d)\.mjs$/,
  /^lab\/event-stats\/(fixtures|expected|expected-authoritative)\//,
  /^lab\/event-stats\/docs\/KICKOUT-ORIGIN-DEFINITION\.md$/,
  /^lab\/event-stats\/engine\//,
  /^lab\/event-stats\/tools\/(reproduce|check-lab-types|verify-lab-run)\.mjs$/,
  /^lab\/event-stats\/tsconfig\.json$/,
];

/** skip / only / todo / conditional / expected-failure markers that stop a test from really running. */
export const MARKER =
  /\b(?:describe|it|test|suite|bench)\s*(?:\.\s*(?:concurrent|sequential)\s*)?\.\s*(?:only|skip|todo|skipIf|runIf|fails)\b|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(|\bctx\s*\.\s*skip\s*\(/;

// ─── Parsing and formatting ──────────────────────────────────────────────────

/** Vitest JSON report → Map(file → string[] of full names) plus run facts. Throws if the shape is wrong. */
export function readVitestReport(json, rootDir) {
  if (!json || !Array.isArray(json.testResults)) throw new Error("Vitest report has no testResults.");
  const files = new Map();
  const notPassedFiles = [];
  const notPassedTests = [];
  const prefix = rootDir.endsWith(sep) ? rootDir : rootDir + sep;
  for (const f of json.testResults) {
    if (typeof f.name !== "string" || !Array.isArray(f.assertionResults)) throw new Error("Malformed test file entry in report.");
    const rel = (f.name.startsWith(prefix) ? f.name.slice(prefix.length) : f.name).split(sep).join("/");
    if (f.status !== "passed") notPassedFiles.push(`${rel} (${f.status})`);
    const names = files.get(rel) ?? [];
    for (const a of f.assertionResults) {
      names.push(a.fullName);
      if (a.status !== "passed") notPassedTests.push(`${rel} › ${a.fullName} (${a.status})`);
    }
    files.set(rel, names);
  }
  return {
    files,
    success: json.success === true,
    total: Number(json.numTotalTests),
    failed: Number(json.numFailedTests) || 0,
    pending: (Number(json.numPendingTests) || 0) + (Number(json.numTodoTests) || 0),
    notPassedFiles,
    notPassedTests,
  };
}

/** Baseline format: `# comments`, then `@ <file>` followed by one `  <full test name>` line per test. */
export function parseBaseline(text) {
  const files = new Map();
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw === "" || raw.startsWith("#")) continue;
    if (raw.startsWith("@ ")) {
      current = raw.slice(2);
      if (files.has(current)) throw new Error(`Duplicate baseline file: ${current}`);
      files.set(current, []);
    } else if (raw.startsWith("  ") && current !== null) {
      files.get(current).push(raw.slice(2));
    } else {
      throw new Error(`Malformed baseline line: ${raw}`);
    }
  }
  return files;
}

export function formatBaseline(files) {
  const lines = [
    "# PáircVision Guardian V1 — every existing Vitest test, by file and full name.",
    `# ${total(files)} tests in ${files.size} files. New tests are accepted; removing one needs this file updated`,
    "# in the same PR, which the guard lists under REVIEW REQUIRED. Regenerate (owner-reviewed only):",
    "#   npx vitest run --reporter=json --outputFile=vitest-report.json",
    "#   node .github/scripts/test-guard.mjs update --report vitest-report.json",
  ];
  for (const file of [...files.keys()].sort()) {
    lines.push(`@ ${file}`);
    for (const name of [...files.get(file)].sort()) lines.push(`  ${name}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Manifest format: `<sha256>  <path>` per line (same as sha256sum), `#` comments. */
export function parseManifest(text) {
  const m = new Map();
  for (const raw of text.split(/\r?\n/)) {
    if (raw === "" || raw.startsWith("#")) continue;
    const match = /^([0-9a-f]{64})  (\S.*)$/.exec(raw);
    if (!match) throw new Error(`Malformed manifest line: ${raw}`);
    if (m.has(match[2])) throw new Error(`Duplicate manifest entry: ${match[2]}`);
    m.set(match[2], match[1]);
  }
  return m;
}

export function formatManifest(hashes) {
  const lines = [
    "# PáircVision Guardian V1 — protected Event Stats statistical expectations (SHA-256).",
    "# A change to any listed file needs this manifest updated in the same PR, which the guard",
    "# lists under REVIEW REQUIRED. Regenerate with `test-guard.mjs update` (owner-reviewed only).",
  ];
  for (const path of [...hashes.keys()].sort()) lines.push(`${hashes.get(path)}  ${path}`);
  return `${lines.join("\n")}\n`;
}

function total(files) {
  let n = 0;
  for (const names of files.values()) n += names.length;
  return n;
}

/** Multiset difference per file: entries of `a` not covered by `b`. */
function missingFrom(a, b) {
  const out = [];
  for (const [file, names] of a) {
    const have = new Map();
    for (const n of b.get(file) ?? []) have.set(n, (have.get(n) ?? 0) + 1);
    for (const n of names) {
      const left = have.get(n) ?? 0;
      if (left > 0) have.set(n, left - 1);
      else out.push(`${file} › ${n}`);
    }
  }
  return out.sort();
}

export function scanMarkers(sources) {
  const hits = [];
  for (const [file, text] of sources) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (MARKER.test(line)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return hits.sort();
}

// ─── Evaluation (pure) ───────────────────────────────────────────────────────

/**
 * @param {object} input
 *   run           readVitestReport(...) result
 *   trackedTests  string[] test files in the repo
 *   sources       Map(file → source text) of tracked test files
 *   baseline      Map(file → names) from .github/test-baseline.txt
 *   manifest      Map(path → sha256) from .github/protected-expectations.txt
 *   currentHashes Map(path → sha256) of every tracked file matching PROTECTED
 *   baseBaseline / baseManifest  optional, the base branch's copies (PRs)
 */
export function evaluate({ run, trackedTests, sources, baseline, manifest, currentHashes, baseBaseline, baseManifest }) {
  const failures = [];
  const review = [];
  const notices = [];

  if (!run.success) failures.push("Vitest reported an unsuccessful run.");
  if (run.failed > 0) failures.push(`${run.failed} test(s) failed.`);
  for (const f of run.notPassedFiles) failures.push(`Test file did not pass: ${f}`);
  for (const t of run.notPassedTests) failures.push(`Test not passed (failed / skipped / todo): ${t}`);
  if (run.pending > 0) failures.push(`${run.pending} skipped or todo test(s) in the run.`);

  for (const file of trackedTests) if (!run.files.has(file)) failures.push(`Test file not executed: ${file}`);
  for (const hit of scanMarkers(sources)) failures.push(`Skip / only / todo marker: ${hit}`);

  for (const t of missingFrom(baseline, run.files)) failures.push(`Baseline test did not run (deleted, removed or renamed): ${t}`);
  if (run.total < total(baseline)) failures.push(`Executed ${run.total} tests; the baseline has ${total(baseline)}.`);
  const added = missingFrom(run.files, baseline);
  if (added.length) notices.push(`${added.length} new test(s) not yet in the baseline (accepted).`);

  for (const [path, hash] of manifest) {
    const now = currentHashes.get(path);
    if (now === undefined) failures.push(`Protected expectation file missing: ${path}`);
    else if (now !== hash) failures.push(`Protected expectation file changed without a manifest update: ${path}`);
  }
  const unlisted = [...currentHashes.keys()].filter((p) => !manifest.has(p)).sort();
  for (const p of unlisted) notices.push(`New protected file, not yet in the manifest (accepted): ${p}`);

  if (baseBaseline) for (const t of missingFrom(baseBaseline, baseline)) review.push(`Test removed from the baseline: ${t}`);
  if (baseManifest) {
    for (const [path, hash] of baseManifest) {
      if (!manifest.has(path)) review.push(`Protected file removed from the manifest: ${path}`);
      else if (manifest.get(path) !== hash) review.push(`Protected expectation changed: ${path}`);
    }
  }
  return { failures, review, notices, executed: run.total, baselineTotal: total(baseline) };
}

// ─── I/O ──────────────────────────────────────────────────────────────────────

function gitTrackedFiles() {
  const r = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
  return r.stdout.split("\0").filter(Boolean);
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function protectedHashes(tracked) {
  const m = new Map();
  for (const p of tracked) if (PROTECTED.some((re) => re.test(p))) m.set(p, sha256(p));
  return m;
}

function loadRun(reportPath) {
  if (!reportPath || !existsSync(reportPath)) throw new Error(`Vitest report not found: ${reportPath ?? "(none given)"} — the test run did not complete.`);
  let json;
  try {
    json = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    throw new Error(`Vitest report is not valid JSON: ${err.message}`);
  }
  return readVitestReport(json, resolve("."));
}

function main(argv) {
  const [mode, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const tracked = gitTrackedFiles();

  if (mode === "update") {
    const run = loadRun(opt("--report"));
    if (!run.success || run.failed || run.pending || run.notPassedFiles.length) throw new Error("Refusing to write a baseline from a run that did not fully pass.");
    writeFileSync(BASELINE_PATH, formatBaseline(run.files));
    writeFileSync(MANIFEST_PATH, formatManifest(protectedHashes(tracked)));
    console.log(`Wrote ${BASELINE_PATH} (${run.total} tests) and ${MANIFEST_PATH}. Review the diff before committing.`);
    return 0;
  }
  if (mode !== "check") {
    console.error("Usage: test-guard.mjs check|update --report <vitest-json> [--base-baseline <f>] [--base-manifest <f>] [--summary <f>]");
    return 2;
  }

  const run = loadRun(opt("--report"));
  for (const p of [BASELINE_PATH, MANIFEST_PATH]) if (!existsSync(p)) throw new Error(`${p} is missing.`);
  const trackedTests = tracked.filter((p) => TEST_FILE.test(p));
  const optional = (name, parse) => {
    const p = opt(name);
    return p && existsSync(p) ? parse(readFileSync(p, "utf8")) : undefined;
  };
  const result = evaluate({
    run,
    trackedTests,
    sources: new Map(trackedTests.map((p) => [p, readFileSync(p, "utf8")])),
    baseline: parseBaseline(readFileSync(BASELINE_PATH, "utf8")),
    manifest: parseManifest(readFileSync(MANIFEST_PATH, "utf8")),
    currentHashes: protectedHashes(tracked),
    baseBaseline: optional("--base-baseline", parseBaseline),
    baseManifest: optional("--base-manifest", parseManifest),
  });

  const list = (title, items) => (items.length ? ["", `### ${title}`, ...items.slice(0, 200).map((x) => `- ${x}`), ...(items.length > 200 ? [`- … ${items.length - 200} more`] : [])] : []);
  const report = [
    "## Test-integrity guard",
    "",
    `- Tests executed: **${result.executed}** (baseline: ${result.baselineTotal})`,
    `- Failures: **${result.failures.length}**`,
    `- Review required: **${result.review.length}**`,
    "",
    "This guard checks that every baselined test ran and passed, nothing was skipped, and protected expectation files are unchanged. It cannot tell whether an assertion inside a test was weakened.",
    ...list("Failures", result.failures),
    ...list("REVIEW REQUIRED — removals or expectation changes made in this PR", result.review),
    ...list("Notices", result.notices),
  ].join("\n");
  console.log(report);
  const summary = opt("--summary");
  if (summary) appendFileSync(summary, `${report}\n`);
  for (const f of result.failures.slice(0, 50)) console.log(`::error::${f}`);
  for (const r of result.review.slice(0, 50)) console.log(`::warning::REVIEW REQUIRED: ${r}`);
  return result.failures.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.log(`::error::Test-integrity guard could not run: ${err.message}`);
    process.exitCode = 1;
  }
}
