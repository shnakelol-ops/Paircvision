#!/usr/bin/env node
// Guardian V1 — Event Stats browser laboratory: one entry point for CI and local runs.
//
//   node lab/event-stats/tools/run-browser-lab.mjs [--base http://localhost:5199] [--matches A,B,C,D]
//        [--no-persistence] [--summary <file>]
//
// Needs the production build served at --base (vite preview) and Playwright's Chromium
// (`npx playwright install chromium`, or PLAYWRIGHT_CHROMIUM_EXECUTABLE=<binary>). Every browser run uses a fresh,
// isolated profile. Synthetic data only.
//
// What it runs, in order, and what fails the run:
//   1. Matches A, B, C, D through the real Event Stats UI (scripts/run-match.mjs): capture, HT/FT,
//      Quick Review, HT/FT Snapshot and Full Review PDFs, save, Review edits, reload, reopen, re-export.
//      Then scripts/verify-events.mjs (stored events vs fixture) and scripts/compare.mjs (UI and PDF
//      text vs the independent expected ledgers in expected-authoritative/).
//   2. Persistence probes (persistence/probe-p0, probe-sp, probe-final) with explicit pass rules.
//   3. Constructed tests, kept separate from capture: legacy-format import (run-legacy-import +
//      compare-legacy) and the hurling Review Edit probe (run-edit-probe).
//   4. PDF files: present, readable (%PDF- header, %%EOF trailer), non-empty, page count as in
//      browser/expected-pdf-pages.json and equal to the pages the app drew, no blank page.
//   A non-PASS result must match browser/known-findings.json (else UNCLASSIFIED → fail). An
//   'app-finding' still fails unless the owner accepted it; a register entry that matched nothing
//   fails as STALE. A crashed or incomplete step fails. No retries, no repairs.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LAB = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i < 0 ? dflt : args[i + 1]; };
const BASE = opt("--base", "http://localhost:5199");
const MATCHES = opt("--matches", "A,B,C,D").split(",").map((m) => m.trim()).filter(Boolean);
const PERSISTENCE = !args.includes("--no-persistence");
const SUMMARY = opt("--summary", null);
const FINDINGS = JSON.parse(readFileSync(join(LAB, "browser/known-findings.json"), "utf8")).findings;
const PDF_PAGES = JSON.parse(readFileSync(join(LAB, "browser/expected-pdf-pages.json"), "utf8")).pages;
const json = (p) => JSON.parse(readFileSync(join(LAB, p), "utf8"));

/** Every outcome the run reports: { area, item, status: PASS|FAIL, detail } plus classification. */
const results = [];
const steps = [];
const add = (area, item, pass, detail = null) => results.push({ area, item, status: pass ? "PASS" : "FAIL", detail });

function run(label, argv, env = {}, timeoutMs = 20 * 60_000) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, argv, { cwd: LAB, env: { ...process.env, ...env }, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  const ok = r.status === 0 && !r.error;
  steps.push({ label, secs, exit: r.status, ok });
  const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => !/shorthand and non-shorthand/.test(l)).slice(-15).join("\n");
  console.log(`${ok ? "✓" : "✗"} ${label} (${secs}s)${ok ? "" : `\n${tail}`}`);
  if (!ok) add("Run", label, false, `exit ${r.status}${r.error ? ` (${r.error.code ?? r.error.message})` : ""}: ${tail.slice(-1500)}`);
  return ok;
}

// ── 0. The app must be reachable ────────────────────────────────────────────
try {
  const res = await fetch(`${BASE}/pro-tagger`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`App not reachable at ${BASE}: ${e.message}`);
  process.exit(2);
}
for (const d of ["runs", "results", "out/browser", "persistence/results"]) mkdirSync(join(LAB, d), { recursive: true });

// ── 1. Matches through the real UI ──────────────────────────────────────────
const compareRows = {}; // match → non-PASS rows
const verifyMismatches = {}; // match → [{stage, id, field}]
for (const m of MATCHES) {
  rmSync(join(LAB, "runs", m), { recursive: true, force: true });
  rmSync(join(LAB, `results/compare-${m}.json`), { force: true });
  rmSync(join(LAB, `results/verify-${m}.json`), { force: true });
  // Match D only: two events carry a player the live picker does not offer (register BL-L1); tag
  // them with no player and record it. Every other match fails on any picker mismatch.
  const env = m === "D" ? { UNSUPPORTED_PLAYER: "unknown" } : {};
  const captured = run(`Match ${m}: real-UI capture, PDFs, save, Review, reopen`, ["scripts/run-match.mjs", `fixtures/match-${m}.json`, `runs/${m}`, BASE], env);
  if (!captured) continue;
  if (run(`Match ${m}: stored events vs fixture`, ["scripts/verify-events.mjs", m, `runs/${m}`, `results/verify-${m}.json`])) {
    const v = json(`results/verify-${m}.json`);
    verifyMismatches[m] = v.stages.flatMap((s) => s.mismatches.map((x) => ({ stage: s.stage, id: x.id, field: x.field })));
    for (const s of v.stages) add(`Match ${m}`, `stored events — ${s.stage}: ${s.stored}/${s.events} events, ${s.fieldsChecked} fields`, s.mismatches.length === 0 && s.stored === s.events, s.mismatches.length ? `${s.mismatches.length} mismatches` : null);
  }
  if (run(`Match ${m}: UI and PDF text vs expected ledgers`, ["scripts/compare.mjs", m], { EXPECTED_DIR: "expected-authoritative" })) {
    const c = json(`results/compare-${m}.json`);
    compareRows[m] = c.checks.filter((x) => x.status === "FAIL" || x.status === "MISSING");
    add(`Match ${m}`, `UI/PDF comparison: ${c.summary.pass} pass, ${c.summary.fail} fail, ${c.summary.missing} missing, ${c.summary.unverified} unverified, ${c.summary.limitation} limitation (of ${c.summary.total})`, true);
    for (const x of compareRows[m]) add(`Match ${m}`, `${x.surface} · ${x.page} · ${x.scope} · ${x.stat}${x.team ? ` · ${x.team}` : ""}`, false, `expected ${x.expected} | actual ${x.actual}${x.note ? ` | ${x.note.slice(0, 400)}` : ""}`);
    Object.assign(results.at(-1 - compareRows[m].length), { counts: c.summary });
  }
  // Lifecycle and Review checks recorded by the runner itself.
  const st = (f) => (existsSync(join(LAB, `runs/${m}/state/${f}`)) ? json(`runs/${m}/state/${f}`) : null);
  for (const c of st("lifecycle-checks.json") ?? []) {
    if (c.op === "storageFail") continue; // the start marker; judged by the next two entries
    const pass = c.op === "storageFailing" ? c.stored === c.expectedStored && /^Save failed/.test(c.strip ?? "") && c.leaveDialog && c.stayedInMatch : c.pass === true;
    add(`Match ${m}`, `lifecycle — ${c.check ?? `${c.op} ${c.team ?? ""} #${c.out}→#${c.in}`}`, pass, pass ? null : JSON.stringify(c).slice(0, 400));
  }
  const rp = st("review-probes.json");
  if (rp) {
    for (const r of rp.reachability) add(`Match ${m}`, `Review — open ${r.targetId} (${r.kind}) on the Event Map`, r.opened, r.opened ? null : `not opened after ${r.taps} taps`);
    for (const p of rp.probes) add(`Match ${m}`, `Review probe ${p.targetId} — ${p.expect}`, p.pass === true, p.pass ? null : JSON.stringify(p).slice(0, 400));
    for (const e of rp.edits) add(`Match ${m}`, `Review edit ${e.targetId} → ${e.newKind ?? "delete"}`, e.applied !== false && !e.formError, e.applied === false || e.formError ? JSON.stringify(e) : null);
  }
  for (const t of st("tag-results.json") ?? []) if (t.pickerUnsupported) add(`Match ${m}`, `capture — ${t.id}: player not offered by the live picker`, false, t.pickerUnsupported);
}

// ── 2. Persistence probes ───────────────────────────────────────────────────
const PROBE_RULES = {
  t1_t2_killAfterEvent: (r) => r.every((x) => x.lost === 0),
  t3_fiveRapidEvents: (r) => r.every((x) => x.lost === 0 && x.duplicateIds === 0 && x.stored === x.eventsInApp),
  t4_killAfterUndo: (r) => r.stored === r.eventsAfterUndoInApp,
  t5_t6_killAfterHtFt: (r) => r.every((x) => x.storedState === (x.transition === "HT" ? "HALF_TIME" : "FULL_TIME")) && r[0].storedEvents === 1 && r[1].storedEvents === 2,
  t7_backgroundWhileRunning: (r) => r.storedEvents === r.expectedEvents && r.reopenPausedAt === r.clockWhenBackgrounded,
  t7b_staleClockNoEvents: (r) => r.reopenPausedAt === r.clockWhenBackgrounded,
  t8_backgroundWhilePaused: (r) => r.clockAfterPausedWait === r.clockAtPause && r.reopenPausedAt === r.clockAtPause && r.storedEvents === 1,
  t9_storageFailure: (r) => /^Save failed/.test(r.pitchFooterOnFailure ?? "") && /^Save failed/.test(r.stripWarning ?? "") && r.pitchFooterAfterRecovery === "✓ Event saved" && r.storedAfterRecovery === r.eventsInApp,
  t10_reloadAndResume: (r) => r.storedEvents === r.expectedEvents && r.duplicateIds === 0 && r.reopened?.pausedAt === r.clockBeforeReload,
  s1_twentyFirstMatch: (r) => r.newMatchSaved && r.firstMatchKept && r.evicted.length === 0,
  s2_unreadableEventStatsStore: (r) => /^Save blocked/.test(r.stripWarning ?? "") && r.storedValueUnchanged && r.olderMatchStillPresent,
  s3_unreadableMatchStatsArchive_SaveMatch: (r) => /not updated/.test(r.feedback ?? "") && r.archiveUnchanged && r.eventStatsMatchesStored === 1,
  s4_malformedRecordSurvives: (r) => r.malformedKept && r.malformedUnchanged && r.validOlderKept,
  s5_storageFull: (r) => /storage full/.test(r.stripWarning ?? "") && r.existingMatchUnchangedWhileFull && r.warningClearedAfterSpaceFreed && r.eventsStoredAfterRecovery === r.eventsInApp,
  f1_saveAndFinish_archiveCopyFails: (r) => /^Match saved/.test(r.shown?.text ?? "") && r.stored?.state === "FULL_TIME" && r.stored?.events === 3 && r.archiveUnchanged && r.reviewOpens,
  f2_storageFull_backupThenDeleteResumesSaving: (r) => /storage full/.test(r.onFail?.text ?? "") && r.backupHasLiveMatch && r.deletedOne && r.onRecovery?.text === "✓ Event saved" && r.liveEventsStored === r.eventsInApp,
  f3_storageFull_leavingLiveScreen: (r) => r.promptedBeforeLeaving && r.unsavedLostOnLeaving === 0,
  f4_storageFull_homeAsksFirst: (r) => r.dialogShown && r.stillInMatchAfterStay && r.storedAfterSpaceFreed === r.eventsInApp && r.homeLeavesNormallyOnceSaved,
};
if (PERSISTENCE) {
  // probe-final seeds realistic saved matches from the match B run (synthetic data).
  const probes = [["p0", "persistence/results/p0-browserlab.json"], ["sp", "persistence/results/sp-browserlab.json"], ["final", "persistence/results/final-browserlab.json"]];
  for (const [p, out] of probes) {
    rmSync(join(LAB, out), { force: true });
    if (p === "final" && !existsSync(join(LAB, "runs/B/state/final.json"))) { add("Persistence", "probe-final needs runs/B/state/final.json (match B)", false); continue; }
    if (!run(`Persistence probe ${p}`, [`persistence/probe-${p}.mjs`, "all", BASE, "browserlab"])) continue;
    const res = json(out);
    for (const [name, r] of Object.entries(res)) {
      const rule = PROBE_RULES[name];
      const pass = !r.error && !!rule && rule(r);
      add("Persistence", `${p} · ${name}`, pass, pass ? null : (r.error ?? (rule ? JSON.stringify(r).slice(0, 500) : "no pass rule for this scenario")));
    }
    for (const name of Object.keys(PROBE_RULES).filter((n) => n.startsWith({ p0: "t", sp: "s", final: "f" }[p]) && !(n in res))) add("Persistence", `${p} · ${name}`, false, "scenario did not run");
  }
}

// ── 3. Constructed tests (separate from normal capture) ─────────────────────
if (MATCHES.includes("A") && existsSync(join(LAB, "runs/A/state/final.json"))) {
  rmSync(join(LAB, "runs/A-legacy"), { recursive: true, force: true });
  if (run("Constructed: legacy-format import of match A", ["scripts/run-legacy-import.mjs", "runs/A/state/final.json", "runs/A-legacy", BASE])
    && run("Constructed: legacy import vs expected", ["scripts/compare-legacy.mjs"])) {
    const c = json("results/compare-legacy.json");
    const checks = c.checks ?? [];
    add("Constructed", `legacy import: ${checks.filter((x) => x.status === "PASS").length}/${checks.length} pass`, checks.length > 0 && checks.every((x) => x.status === "PASS"), checks.filter((x) => x.status !== "PASS").map((x) => `${x.surface} ${x.stat}: expected ${x.expected}, actual ${x.actual}`).join("; ") || null);
  }
}
if (MATCHES.includes("C") && existsSync(join(LAB, "runs/C/state/final.json"))) {
  if (run("Constructed: hurling Review Edit probe (copy of match C)", ["scripts/run-edit-probe.mjs", "runs/C/state/final.json", "out/browser", BASE])) {
    const r = json("out/browser/edit-probe-hurling.json");
    add("Constructed", "hurling Review Edit: football-only 2-pointer not offered; event and scoreline unchanged", r.pass === true, r.pass ? null : JSON.stringify(r).slice(0, 500));
  }
}

// ── 4. PDF files ────────────────────────────────────────────────────────────
for (const m of [...MATCHES, ...(existsSync(join(LAB, "runs/A-legacy/pdf")) ? ["A-legacy"] : [])]) {
  const dir = join(LAB, `runs/${m}/pdf`);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".pdf")).sort()) {
    const kind = Object.keys(PDF_PAGES).find((k) => f.includes(k));
    const buf = readFileSync(join(dir, f));
    const head = buf.subarray(0, 5).toString("latin1");
    const tail = buf.subarray(Math.max(0, buf.length - 64)).toString("latin1");
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    const textFile = join(LAB, `runs/${m}/pdf-text`, f.replace(/\.pdf$/, ".json"));
    const drawnPages = existsSync(textFile) ? JSON.parse(readFileSync(textFile, "utf8")).pages : null;
    const drawn = drawnPages?.length ?? null;
    // Non-blank: every page the app drew carries text (title, header and content); a page with fewer
    // than 5 drawn text items is reported as blank.
    const blank = (drawnPages ?? []).filter((p) => (p.texts?.length ?? 0) < 5).map((p) => p.index);
    const problems = [];
    if (statSync(join(dir, f)).size < 1024) problems.push("smaller than 1 KB");
    if (head !== "%PDF-") problems.push("no %PDF- header");
    if (!tail.includes("%%EOF")) problems.push("no %%EOF trailer");
    if (!kind) problems.push("unknown report type");
    else if (pages !== PDF_PAGES[kind]) problems.push(`${pages} pages, expected ${PDF_PAGES[kind]}`);
    if (drawn == null) problems.push("no drawn-text capture for this PDF");
    else if (drawn !== pages) problems.push(`${pages} PDF pages but the app drew ${drawn}`);
    if (blank.length) problems.push(`blank page(s): ${blank.join(", ")}`);
    add("PDF files", `${m}/${f}: ${pages} pages, ${Math.round(buf.length / 1024)} KB`, problems.length === 0, problems.join("; ") || null);
  }
}

// ── Classification against the known-findings register ─────────────────────
const re = (s) => (s == null ? null : new RegExp(s));
const used = new Map(FINDINGS.map((f) => [f.id, 0]));
function classifyCompare(m, row) {
  for (const f of FINDINGS) for (const s of f.select) {
    if (s.source !== "compare" || !s.matches.includes(m)) continue;
    if (s.surface && !re(s.surface).test(row.surface)) continue;
    if (s.page && !re(s.page).test(row.page)) continue;
    if (s.stat && !re(s.stat).test(row.stat)) continue;
    if (s.team && !re(s.team).test(row.team ?? "")) continue;
    if (s.actual && !re(s.actual).test(row.actual)) continue;
    if (s.onlyOverlapPairs) {
      let pairs; try { pairs = JSON.parse(row.note); } catch { continue; }
      const ok = (p) => s.onlyOverlapPairs.some(([a, b]) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
      if (!pairs.length || !pairs.every(ok)) continue;
    }
    return f;
  }
  return null;
}
const classify = (r) => {
  const m = r.area.replace(/^Match /, "");
  if (r.status === "PASS") return;
  const row = (compareRows[m] ?? []).find((x) => r.item === `${x.surface} · ${x.page} · ${x.scope} · ${x.stat}${x.team ? ` · ${x.team}` : ""}`);
  let f = row ? classifyCompare(m, row) : null;
  if (!f && /^stored events/.test(r.item)) {
    const mm = verifyMismatches[m] ?? [];
    const stage = r.item.replace(/^stored events — /, "").replace(/: .*$/, "");
    const mine = mm.filter((x) => x.stage === stage);
    f = FINDINGS.find((F) => F.select.some((s) => s.source === "verify" && s.matches.includes(m) && mine.length > 0 && mine.every((x) => s.ids.includes(x.id) && x.field === s.field))) ?? null;
  }
  if (!f && /^capture — .*player not offered/.test(r.item)) {
    const id = r.item.match(/^capture — (\S+):/)[1];
    f = FINDINGS.find((F) => F.select.some((s) => s.source === "verify" && s.matches.includes(m) && s.ids.includes(id))) ?? null;
  }
  if (!f) { r.classification = "UNCLASSIFIED"; return; }
  used.set(f.id, used.get(f.id) + 1);
  r.classification = f.id;
  r.kind = f.kind;
  r.blocking = f.kind === "app-finding" ? !f.ownerAccepted : false;
};
results.forEach(classify);
const ranMatches = new Set(MATCHES);
const stale = FINDINGS.filter((f) => used.get(f.id) === 0 && f.select.some((s) => s.matches.some((m) => ranMatches.has(m))));

// ── Verdict and report ──────────────────────────────────────────────────────
const failing = results.filter((r) => r.status === "FAIL");
const unclassified = failing.filter((r) => r.classification === "UNCLASSIFIED");
const openFindings = FINDINGS.filter((f) => f.kind === "app-finding" && !f.ownerAccepted && used.get(f.id) > 0);
const blocking = failing.filter((r) => r.blocking || r.classification === "UNCLASSIFIED");
const verdict = blocking.length === 0 && stale.length === 0 ? "PASS" : "FAIL";
const report = {
  verdict, base: BASE, matches: MATCHES, persistence: PERSISTENCE, generatedAt: new Date().toISOString(),
  totals: { results: results.length, pass: results.length - failing.length, fail: failing.length, unclassified: unclassified.length, blocking: blocking.length, stale: stale.map((f) => f.id) },
  findings: FINDINGS.map((f) => ({ id: f.id, kind: f.kind, title: f.title, ownerAccepted: f.ownerAccepted ?? null, occurrences: used.get(f.id) })),
  steps, results,
};
writeFileSync(join(LAB, "out/browser-report.json"), JSON.stringify(report, null, 1));

const md = [];
md.push(`## Event Stats browser laboratory — ${verdict === "PASS" ? "✅ PASS" : "❌ FAIL"}`, "");
md.push(`Matches ${MATCHES.join(", ")} through the real UI${PERSISTENCE ? ", persistence probes" : ""}, constructed tests, PDF files. ${results.length} results: ${results.length - failing.length} pass, ${failing.length} not passing (${unclassified.length} unclassified, ${blocking.length} blocking).`, "");
md.push("| Step | Seconds | Result |", "|---|---:|---|", ...steps.map((s) => `| ${s.label} | ${s.secs} | ${s.ok ? "ok" : `**exit ${s.exit}**`} |`), "");
for (const m of MATCHES) { const c = results.find((r) => r.area === `Match ${m}` && r.counts); if (c) md.push(`- **Match ${m}** — ${c.item}`); }
md.push("");
if (openFindings.length || FINDINGS.some((f) => used.get(f.id) > 0)) {
  md.push("### Registered findings seen in this run", "", "| Id | Kind | Finding | Occurrences | Blocks the run |", "|---|---|---|---:|---|");
  for (const f of FINDINGS.filter((F) => used.get(F.id) > 0)) md.push(`| ${f.id} | ${f.kind} | ${f.title} | ${used.get(f.id)} | ${f.kind === "app-finding" && !f.ownerAccepted ? "yes (open app finding)" : "no"} |`);
  md.push("");
}
if (unclassified.length) md.push("### ❌ Unclassified results (not in browser/known-findings.json)", "", ...unclassified.map((r) => `- ${r.area}: ${r.item} — ${r.detail ?? ""}`.slice(0, 600)), "");
if (stale.length) md.push("### ❌ Stale register entries (matched nothing — remove once fixed)", "", ...stale.map((f) => `- ${f.id}: ${f.title}`), "");
md.push("Full results: `lab/event-stats/out/browser-report.json` (uploaded with the PDFs as the run's artifact).");
writeFileSync(join(LAB, "out/browser-report.md"), md.join("\n") + "\n");
if (SUMMARY) appendFileSync(SUMMARY, md.join("\n") + "\n");
console.log(`\n${md.join("\n")}`);
process.exit(verdict === "PASS" ? 0 : 1);
