#!/usr/bin/env node
// Confirms the Event Stats laboratory actually ran, completely, in this CI job — and writes the
// per-match result to the job summary. Node built-ins only.
//
//   node lab/event-stats/tools/verify-lab-run.mjs --vitest-report <json> --engine-report <json> [--summary <file>]
//
// FAILS on: a missing / unreadable / unsuccessful lab Vitest report; a required lab test that did
// not run and pass; any skipped or todo lab test; a missing or stale engine report; fewer checks
// than engine/coverage-minimum.json; a required match or ledger absent; a RED verdict.

import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const failures = [];
const minimum = JSON.parse(readFileSync(fileURLToPath(new URL("../engine/coverage-minimum.json", import.meta.url)), "utf8"));

const readJson = (path, what) => {
  if (!path || !existsSync(path)) { failures.push(`${what} not found (${path ?? "no path given"}) — the laboratory did not run.`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (err) { failures.push(`${what} is not valid JSON: ${err.message}`); return null; }
};

const vitest = readJson(opt("--vitest-report"), "Laboratory Vitest report");
if (vitest) {
  if (vitest.success !== true) failures.push("The laboratory Vitest run was not successful.");
  if ((vitest.numPendingTests ?? 0) + (vitest.numTodoTests ?? 0) > 0) failures.push("A laboratory test was skipped or left as todo.");
  const results = new Map();
  for (const f of vitest.testResults ?? []) for (const a of f.assertionResults ?? []) results.set(a.fullName, a.status);
  for (const name of minimum.requiredLabTests) {
    const status = results.get(name);
    if (status !== "passed") failures.push(`Required laboratory test ${status ? `did not pass (${status})` : "did not run"}: ${name}`);
  }
}

const reportPath = opt("--engine-report");
const engine = readJson(reportPath, "Engine report");
if (engine && vitest && Number.isFinite(vitest.startTime) && statSync(reportPath).mtimeMs + 1000 < vitest.startTime) {
  failures.push("The engine report is older than this laboratory run (stale).");
}

let perLedger = [];
if (engine) {
  const checks = Array.isArray(engine.checks) ? engine.checks : [];
  if (checks.length < minimum.minimumChecks) failures.push(`Only ${checks.length} engine checks ran; the minimum is ${minimum.minimumChecks}.`);
  for (const l of minimum.requiredLedgers) if (!checks.some((c) => c.ledger === l)) failures.push(`No checks ran against ${l}.`);
  for (const m of minimum.requiredMatches) if (!checks.some((c) => c.match === m)) failures.push(`No checks ran for match ${m}.`);
  if (engine.verdict === "RED") failures.push(`Engine verdict RED: ${engine.failed} failed check(s), ${engine.unclassified} unclassified.`);
  const keys = [...new Set(checks.map((c) => `${c.match}|${c.ledger}`))];
  perLedger = keys.map((k) => {
    const [match, ledger] = k.split("|");
    const rows = checks.filter((c) => c.match === match && c.ledger === ledger);
    return { match, ledger, total: rows.length, failed: rows.filter((c) => c.status === "FAIL") };
  });
}

const lines = [
  "## Event Stats laboratory (engine)",
  "",
  engine ? `**Verdict: ${failures.length ? "FAILED" : engine.verdict}** — ${engine.passed}/${engine.total} independent checks passed (minimum ${minimum.minimumChecks}).` : "**Verdict: FAILED** — no engine report.",
  "",
  "Expected values come only from the independent reference calculators (no app code). Browser, persistence and PDF checks are not part of this job.",
];
if (perLedger.length) {
  lines.push("", "| Match | Ledger | Checks | Failed |", "|---|---|---|---|");
  for (const r of perLedger) lines.push(`| ${r.match} | ${r.ledger} | ${r.total} | ${r.failed.length} |`);
  const failed = perLedger.flatMap((r) => r.failed);
  if (failed.length) {
    lines.push("", "### Failed expectations", "", "| Match | Ledger | Scope | Team | Statistic | Expected | Engine | Classification |", "|---|---|---|---|---|---|---|---|");
    for (const c of failed.slice(0, 100)) lines.push(`| ${c.match} | ${c.ledger} | ${c.scope} | ${c.team} | ${c.stat} | ${JSON.stringify(c.expected)} | ${JSON.stringify(c.actual)} | ${c.classification ?? "UNCLASSIFIED"} |`);
    if (failed.length > 100) lines.push(`| … ${failed.length - 100} more | | | | | | | |`);
  }
}
if (failures.length) lines.push("", "### Laboratory execution problems", ...failures.map((f) => `- ${f}`));
const report = lines.join("\n");
console.log(report);
if (opt("--summary")) appendFileSync(opt("--summary"), `${report}\n`);
for (const f of failures) console.log(`::error::${f}`);
process.exitCode = failures.length ? 1 : 0;
