#!/usr/bin/env node
// Guardian V1 — Event Stats browser laboratory: one entry point for CI and local runs.
//
//   node lab/event-stats/tools/run-browser-lab.mjs [--base http://localhost:5199] [--matches A,B,C,D,E,F] [--no-cross-sport]
//        [--no-persistence] [--no-offline] [--summary <file>]
//
// Needs the production build served at --base (vite preview) and Playwright's Chromium
// (`npx playwright install chromium`, or PLAYWRIGHT_CHROMIUM_EXECUTABLE=<binary>). Every browser run uses a fresh,
// isolated profile. Synthetic data only.
//
// What it runs, in order, and what fails the run:
//   1. Matches A–F (E Ladies Football, F Camogie — events the app does not offer are recorded, never substituted) through the real Event Stats UI (scripts/run-match.mjs): capture, HT/FT,
//      Quick Review, HT/FT Snapshot and Full Review PDFs, save, Review edits, reload, reopen, re-export.
//      Then scripts/verify-events.mjs (stored events vs fixture) and scripts/compare.mjs (UI and PDF
//      text vs the independent expected ledgers in expected-authoritative/).
//   1b. Offline reliability: match A again, entirely offline — installed online from its own
//      `vite preview` (port 5299), then the server stopped and the browser offline; close/reopen and
//      reload inserted (browser/offline-plan.json); a negative control with service workers blocked.
//   1c. Cross-sport switching (scripts/run-cross-sport.mjs): the four sports created back to back in
//      one profile vs fresh-profile baselines and rules/sport-rules.json.
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
import { authoritativeLedger } from "../scripts/reference-kickout-phase.mjs";

const LAB = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i < 0 ? dflt : args[i + 1]; };
const BASE = opt("--base", "http://localhost:5199");
const MATCHES = opt("--matches", "A,B,C,D,E,F").split(",").map((m) => m.trim()).filter(Boolean);
const PERSISTENCE = !args.includes("--no-persistence");
const SUMMARY = opt("--summary", null);
const FINDINGS = JSON.parse(readFileSync(join(LAB, "browser/known-findings.json"), "utf8")).findings;
const PDF_PAGES = JSON.parse(readFileSync(join(LAB, "browser/expected-pdf-pages.json"), "utf8")).pages;
const COVERAGE = JSON.parse(readFileSync(join(LAB, "browser/coverage-minimum.json"), "utf8"));
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
const downstream = {}; // match → Set of compare row keys explained by events the app could not record
const rowKey = (x) => `${x.surface} · ${x.page} · ${x.scope} · ${x.stat}${x.team ? ` · ${x.team}` : ""}`;
/**
 * One match through the real UI, then every check on it. `key` names the run (results, register
 * matching, coverage): "A" … "D", or "A-offline" for match A run entirely offline.
 */
function runMatchSuite(key, fixtureId, { env = {}, extraLifecycle = [], offline = false } = {}) {
  const m = key;
  const runDir = `runs/${key}`;
  const suffix = key === fixtureId ? "" : key.slice(fixtureId.length);
  const compareFile = `results/compare-${fixtureId}${suffix}.json`;
  const verifyFile = `results/verify-${key}.json`;
  rmSync(join(LAB, runDir), { recursive: true, force: true });
  rmSync(join(LAB, compareFile), { force: true });
  rmSync(join(LAB, verifyFile), { force: true });
  const what = offline ? "entirely OFFLINE (service worker): install, capture, close/reopen, reload, HT/FT, PDFs, save, reopen" : "real-UI capture, PDFs, save, Review, reopen";
  const captured = run(`Match ${m}: ${what}`, ["scripts/run-match.mjs", `fixtures/match-${fixtureId}.json`, runDir, BASE], env);
  if (captured && run(`Match ${m}: stored events vs fixture`, ["scripts/verify-events.mjs", fixtureId, runDir, verifyFile])) {
    const v = json(verifyFile);
    verifyMismatches[m] = v.stages.flatMap((s) => s.mismatches.map((x) => ({ stage: s.stage, id: x.id, field: x.field, kind: x.kind })));
    for (const s of v.stages) add(`Match ${m}`, `stored events — ${s.stage}: ${s.stored}/${s.events} events, ${s.fieldsChecked} fields${s.notEntered ? `, ${s.notEntered} not entered` : ""}`, s.mismatches.length === 0 && s.stored === s.events, s.mismatches.length ? `${s.mismatches.length} mismatches` : null);
  }
  if (captured && run(`Match ${m}: UI and PDF text vs expected ledgers`, ["scripts/compare.mjs", fixtureId], { EXPECTED_DIR: "expected-authoritative", RUN_DIR: runDir, RESULTS_SUFFIX: suffix })) {
    const c = json(compareFile);
    compareRows[m] = c.checks.filter((x) => x.status === "FAIL" || x.status === "MISSING");
    add(`Match ${m}`, `UI/PDF comparison: ${c.summary.pass} pass, ${c.summary.fail} fail, ${c.summary.missing} missing, ${c.summary.unverified} unverified, ${c.summary.limitation} limitation (of ${c.summary.total})`, true);
    for (const x of compareRows[m]) add(`Match ${m}`, rowKey(x), false, `expected ${x.expected} | actual ${x.actual}${x.note ? ` | ${x.note.slice(0, 400)}` : ""}`);
    Object.assign(results.at(-1 - compareRows[m].length), { counts: c.summary });
    // Events the app could not record (Golden Matches E / F): re-run the comparison against the same
    // independent reference computed without them. A row that passes there is DOWNSTREAM of the
    // missing events; one that still fails is a direct difference needing its own register entry.
    const notOffered = (existsSync(join(LAB, `${runDir}/state/tag-results.json`)) ? json(`${runDir}/state/tag-results.json`) : []).filter((t) => t.notOffered).map((t) => t.id);
    if (notOffered.length) {
      const fx0 = json(`fixtures/match-${fixtureId}.json`);
      const dir = `results/reduced-${key}`;
      mkdirSync(join(LAB, dir), { recursive: true });
      writeFileSync(join(LAB, dir, `ledger-${fixtureId}.json`), JSON.stringify(authoritativeLedger({ ...fx0, excludeIds: notOffered }).ledger));
      if ((fx0.reviewOps ?? []).length) writeFileSync(join(LAB, dir, `ledger-${fixtureId}-live.json`), JSON.stringify(authoritativeLedger({ ...fx0, reviewOps: [], excludeIds: notOffered }).ledger));
      if (run(`Match ${m}: comparison without the ${notOffered.length} events the app could not record`, ["scripts/compare.mjs", fixtureId], { EXPECTED_DIR: dir, RUN_DIR: runDir, RESULTS_SUFFIX: `${suffix}-reduced` })) {
        const passing = new Set(json(`results/compare-${fixtureId}${suffix}-reduced.json`).checks.filter((x) => x.status === "PASS").map(rowKey));
        downstream[m] = new Set(compareRows[m].map(rowKey).filter((k) => passing.has(k)));
      }
    }
  }
  // Lifecycle and Review checks recorded by the runner itself.
  const st = (f) => (existsSync(join(LAB, `${runDir}/state/${f}`)) ? json(`${runDir}/state/${f}`) : null);
  for (const c of st("lifecycle-checks.json") ?? []) {
    if (c.op === "storageFail") continue; // the start marker; judged by the next two entries
    const pass = c.op === "storageFailing" ? c.stored === c.expectedStored && /^Save failed/.test(c.strip ?? "") && c.leaveDialog && c.stayedInMatch : c.pass === true;
    add(`Match ${m}`, `lifecycle — ${c.check ?? `${c.op} ${c.team ?? ""} #${c.out}→#${c.in}`}`, pass, pass ? null : JSON.stringify(c).slice(0, 400));
  }
  const rp = st("review-probes.json");
  if (rp) {
    for (const r of rp.reachability) add(`Match ${m}`, r.notEntered ? `Review — ${r.op} ${r.targetId}: target was not entered (not offered by the app)` : `Review — open ${r.targetId} (${r.kind}) on the Event Map`, r.opened, r.opened ? null : r.notEntered ? "not entered" : `not opened after ${r.taps} taps`);
    for (const p of rp.probes) add(`Match ${m}`, `Review probe ${p.targetId} — ${p.expect}`, p.pass === true, p.pass ? null : JSON.stringify(p).slice(0, 400));
    for (const e of rp.edits) add(`Match ${m}`, `Review edit ${e.targetId} → ${e.newKind ?? "delete"}`, e.applied !== false && !e.formError, e.applied === false || e.formError ? JSON.stringify(e) : null);
  }
  for (const t of st("tag-results.json") ?? []) if (t.pickerUnsupported) add(`Match ${m}`, `capture — ${t.id}: player not offered by the live picker`, false, t.pickerUnsupported);
  for (const t of st("tag-results.json") ?? []) if (t.notOffered) add(`Match ${m}`, `capture — ${t.id}: not offered by the app (not entered)`, false, t.notOffered);
  // Capture options the sport's rules require (rules/sport-rules.json → captureProbes).
  const cp = st("capture-probes.json");
  if (cp) {
    for (const p of cp.probes) {
      const tiles = cp.tiles[p.familyLabel];
      add(`Match ${m}`, `capture option ${p.family}: family offered (${p.rule})`, tiles != null, tiles == null ? "not offered" : null);
      for (const t of p.present) add(`Match ${m}`, `capture option ${p.family}: tile "${t}" offered (${p.rule})`, !!tiles?.includes(t), `tiles shown: ${JSON.stringify(tiles)}`);
      for (const t of p.absent) add(`Match ${m}`, `capture option ${p.family}: tile "${t}" not offered (${p.rule})`, !tiles?.includes(t), `tiles shown: ${JSON.stringify(tiles)}`);
    }
  } else if (json("rules/sport-rules.json").sports[json(`fixtures/match-${fixtureId}.json`).sport]?.captureProbes) {
    add(`Match ${m}`, "coverage — capture-option probes ran", false, "capture-probes.json missing");
  }

  if (offline) {
    // Offline pass rules: genuinely offline (server stopped and not answering, browser offline, no
    // network response from the app's origin), served by the service worker, and the negative control
    // (service workers blocked) unable to open the app.
    const o = st("offline-checks.json");
    const rules = [
      ["preview server answered before installation", (x) => x.serverUpBeforeInstall === true],
      ["service worker installed and active", (x) => x.swActive === true],
      ["page controlled by the service worker after a reload", (x) => x.controlled === true],
      ["precache populated", (x) => (x.precache?.entries ?? 0) > 0],
      ["preview server stopped and no longer answering", (x) => x.serverStopped === true],
      ["Event Stats opened with no server and the browser offline", (x) => x.openedOffline === true],
      ["no response from the network for the app's origin while offline", (x) => x.networkResponsesWhileOffline === 0],
      ["Save & Finish offline: no failure shown, returned home, match stored FULL_TIME with every event", (x) => !/fail|blocked/i.test(x.saveAndFinish?.feedback ?? "") && x.saveAndFinish?.leftToHome === true && x.saveAndFinish?.storedState === "FULL_TIME" && x.saveAndFinish?.storedEvents === x.saveAndFinish?.expectedEvents],
      ["negative control: the same app loaded online with service workers blocked", (x) => x.negativeLoadedOnline === true],
      ["negative control: with service workers blocked it cannot open offline", (x) => x.negativeControl?.navigationFailed === true],
    ];
    for (const [item, rule] of rules) add(`Match ${m}`, `offline — ${item}`, !!o && rule(o), o ? (rule(o) ? null : JSON.stringify(o).slice(0, 500)) : "offline-checks.json missing");
    // Not precached by the app's service worker (documented limitation, reported — not judged).
    if (o?.failedRequestsWhileOffline?.length) add(`Match ${m}`, `offline — same-origin requests not served offline (not precached; limitation): ${o.failedRequestsWhileOffline.join(", ")}`, true);
  }

  // Coverage: everything the fixture asks for was actually done and judged (counts come from the
  // fixture and browser/coverage-minimum.json, never from the run itself).
  const fx = json(`fixtures/match-${fixtureId}.json`);
  const cov = (item, got, want, atLeast = false) => add(`Match ${m}`, `coverage — ${item}: ${got ?? "none"} ${atLeast ? "≥" : "="} ${want}`, got != null && (atLeast ? got >= want : got === want), got != null && (atLeast ? got >= want : got === want) ? null : "incomplete run");
  const LIFECYCLE_OPS = ["sub", "close", "storageFail", "storageRestore", "reload", "undo", "pause"];
  cov("fixture taps entered", st("tag-results.json")?.length ?? null, fx.steps.filter((x) => x.op === "tag").length);
  cov("lifecycle checks judged", (st("lifecycle-checks.json") ?? null)?.filter((c) => c.op !== "storageFail").length ?? null, fx.steps.filter((x) => LIFECYCLE_OPS.includes(x.op)).length + extraLifecycle.length);
  cov("Review operations judged", (rp?.reachability.length ?? 0), (fx.reviewOps ?? []).length);
  cov("stored-event stages verified", existsSync(join(LAB, verifyFile)) ? json(verifyFile).stages.length : null, 3);
  cov("UI/PDF checks performed", existsSync(join(LAB, compareFile)) ? json(compareFile).summary.total : null, COVERAGE.compareChecksMin[m] ?? Infinity, true);
  for (const name of COVERAGE.pdfsPerMatch) add(`Match ${m}`, `coverage — PDF ${key}/${fixtureId}-${name}.pdf exported`, existsSync(join(LAB, `${runDir}/pdf/${fixtureId}-${name}.pdf`)), "missing");
}

// Match D only: two events carry a player the live picker does not offer (register BL-L1); tag them
// with no player and record it. Every other match fails on any picker mismatch.
// Golden Matches E and F record (never substitute) events the app does not offer (NOT_OFFERED=record).
for (const m of MATCHES) runMatchSuite(m, m, { env: { ...(m === "D" ? { UNSUPPORTED_PLAYER: "unknown" } : {}), ...(["E", "F"].includes(m) ? { NOT_OFFERED: "record" } : {}) } });

// ── 1b. Offline reliability: match A entirely offline from the service worker ──
// Its own `vite preview` of this repository's build (port 5299), stopped once the app is installed.
const OFFLINE = !args.includes("--no-offline");
if (OFFLINE) {
  const plan = json("browser/offline-plan.json");
  runMatchSuite(`${plan.match}-offline`, plan.match, {
    offline: true, extraLifecycle: plan.insert,
    env: { OFFLINE_SERVE_ROOT: join(LAB, "../.."), OFFLINE_PLAN: join(LAB, "browser/offline-plan.json") },
  });
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

// Cross-sport switching (scripts/run-cross-sport.mjs): the four sports created back to back in one
// browser profile, each compared with a fresh-profile baseline and with rules/sport-rules.json.
const CROSS_SPORT = !args.includes("--no-cross-sport");
if (CROSS_SPORT) {
  rmSync(join(LAB, "runs/XS"), { recursive: true, force: true });
  if (run("Cross-sport: four sports created back to back in one browser profile", ["scripts/run-cross-sport.mjs", "runs/XS", BASE])) {
    const xs = json("runs/XS/state/cross-sport.json");
    for (const [sport, checks] of Object.entries(xs.baselineChecks)) for (const c of checks) add("Cross-sport", `${sport} (fresh profile): ${c.check}`, c.pass, c.pass ? null : JSON.stringify(c.detail).slice(0, 400));
    for (const st of xs.steps) for (const c of st.checks) add("Cross-sport", `${st.sport} (step ${st.step}${st.after ? `, after ${st.after}` : ""}): ${c.check}`, c.pass, c.pass ? null : JSON.stringify(c.detail).slice(0, 400));
  }
  const judged = results.filter((r) => r.area === "Cross-sport").length;
  add("Cross-sport", `coverage — cross-sport checks judged: ${judged} ≥ ${COVERAGE.crossSportChecksMin}`, judged >= COVERAGE.crossSportChecksMin, judged >= COVERAGE.crossSportChecksMin ? null : "incomplete run");
}

if (PERSISTENCE) {
  const judged = results.filter((r) => r.area === "Persistence" && / · /.test(r.item)).length;
  add("Persistence", `coverage — persistence scenarios judged: ${judged} ≥ ${COVERAGE.persistenceScenarios}`, judged >= COVERAGE.persistenceScenarios, judged >= COVERAGE.persistenceScenarios ? null : "incomplete run");
}
for (const [label, re] of [["legacy import", /^legacy import: /], ["hurling Review Edit", /^hurling Review Edit/]]) {
  if (!results.some((r) => r.area === "Constructed" && re.test(r.item))) add("Constructed", `coverage — ${label} did not run`, false, "incomplete run");
}
for (const name of COVERAGE.legacyPdfs) if (!existsSync(join(LAB, `runs/A-legacy/pdf/${name}.pdf`))) add("PDF files", `coverage — A-legacy/${name}.pdf exported`, false, "missing");

// ── 4. PDF files ────────────────────────────────────────────────────────────
for (const m of [...MATCHES, ...(OFFLINE ? [`${json("browser/offline-plan.json").match}-offline`] : []), ...(existsSync(join(LAB, "runs/A-legacy/pdf")) ? ["A-legacy"] : [])]) {
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
const rowMatches = (s, m, row) => s.source === "compare" && s.matches.includes(m)
  && (!s.surface || re(s.surface).test(row.surface)) && (!s.page || re(s.page).test(row.page))
  && (!s.stat || re(s.stat).test(row.stat)) && (!s.team || re(s.team).test(row.team ?? ""))
  && (!s.actual || re(s.actual).test(row.actual));
/** A row whose note lists occurrences (overlap pairs, wording hits) is explained only when EVERY
 *  occurrence is matched by some register entry; it may need several entries (one per defect). */
function occurrencesOf(row) {
  try { const n = JSON.parse(row.note); return Array.isArray(n) && n.length && typeof n[0] === "object" ? n : null; } catch { return null; }
}
const usedPatterns = new Set(); // "findingId|selectIndex|occurrenceIndex" matched at least once
const occMatches = (o, occ) => {
  if (o.pair) return (occ.a === o.pair[0] && occ.b === o.pair[1]) || (occ.a === o.pair[1] && occ.b === o.pair[0]);
  return (!o.where || re(o.where).test(occ.where ?? occ.title ?? "")) && (!o.text || re(o.text).test(occ.text ?? ""));
};
function classifyCompare(m, row) {
  const occ = occurrencesOf(row);
  const ids = new Set();
  if (occ) {
    for (const x of occ) {
      let hit = null;
      for (const F of FINDINGS) F.select.forEach((s, si) => { if (hit || !s.occurrences || !rowMatches(s, m, row)) return;
        const oi = s.occurrences.findIndex((o) => occMatches(o, x)); if (oi >= 0) hit = [F, `${F.id}|${si}|${oi}`]; });
      if (!hit) return null;
      ids.add(hit[0].id);
      usedPatterns.add(hit[1]);
    }
    return [...ids].map((id) => FINDINGS.find((F) => F.id === id));
  }
  const f = FINDINGS.find((F) => F.select.some((s) => !s.occurrences && rowMatches(s, m, row)));
  return f ? [f] : null;
}
const classify = (r) => {
  const m = r.area.replace(/^Match /, "");
  if (r.status === "PASS") return;
  const row = (compareRows[m] ?? []).find((x) => r.item === `${x.surface} · ${x.page} · ${x.scope} · ${x.stat}${x.team ? ` · ${x.team}` : ""}`);
  let fs = row ? classifyCompare(m, row) : null;
  let f = null;
  // Downstream of events the app could not record: attributed to the register entry that owns the
  // capture failure (blockedCapture), so it stays blocking until that defect is repaired.
  if (!fs && row && downstream[m]?.has(r.item)) {
    const owner = FINDINGS.find((F) => F.blockedCapture?.includes(m));
    if (owner) { fs = [owner]; r.effect = "downstream"; }
  }
  // Generic item selectors (capture options, not-entered events, Review targets).
  if (!fs) {
    const F = FINDINGS.find((x) => x.select.some((s) => s.source === "item" && s.matches.includes(m) && new RegExp(s.item).test(r.item)));
    if (F) fs = [F];
  }
  if (!f && /^stored events/.test(r.item)) {
    const mm = verifyMismatches[m] ?? [];
    const stage = r.item.replace(/^stored events — /, "").replace(/: .*$/, "");
    const mine = mm.filter((x) => x.stage === stage);
    f = FINDINGS.find((F) => F.select.some((s) => s.source === "verify" && s.matches.includes(m) && mine.length > 0 && mine.every((x) => s.notEntered ? x.kind === "notEntered" : s.ids?.includes(x.id) && x.field === s.field))) ?? null;
  }
  if (!f && /^capture — .*player not offered/.test(r.item)) {
    const id = r.item.match(/^capture — (\S+):/)[1];
    f = FINDINGS.find((F) => F.select.some((s) => s.source === "verify" && s.matches.includes(m) && s.ids.includes(id))) ?? null;
  }
  if (!fs && f) fs = [f];
  if (!fs) { r.classification = "UNCLASSIFIED"; return; }
  for (const F of fs) used.set(F.id, used.get(F.id) + 1);
  r.classification = fs.map((F) => F.id).join("+");
  r.kind = [...new Set(fs.map((F) => F.kind))].join("+");
  r.blocking = fs.some((F) => F.kind === "app-finding" && !F.ownerAccepted);
};
results.forEach(classify);
const ranMatches = new Set([...MATCHES, ...(OFFLINE ? [`${json("browser/offline-plan.json").match}-offline`] : []), ...(CROSS_SPORT ? ["Cross-sport"] : [])]);
const stale = FINDINGS.filter((f) => used.get(f.id) === 0 && f.select.some((s) => s.matches.some((m) => ranMatches.has(m))));
// Partial fixes: every occurrence pattern of a register entry must still occur somewhere in the run.
const stalePatterns = FINDINGS.flatMap((f) => f.select.flatMap((s, si) => (s.occurrences && s.matches.some((m) => ranMatches.has(m)))
  ? s.occurrences.map((o, oi) => [f, `${f.id}|${si}|${oi}`, o]).filter(([, k]) => !usedPatterns.has(k)) : []));
for (const [f, , o] of stalePatterns) if (!stale.includes(f)) stale.push({ ...f, title: `${f.title} — occurrence ${JSON.stringify(o)} no longer seen` });

// ── Verdict and report ──────────────────────────────────────────────────────
const failing = results.filter((r) => r.status === "FAIL");
const unclassified = failing.filter((r) => r.classification === "UNCLASSIFIED");
const openFindings = FINDINGS.filter((f) => f.kind === "app-finding" && !f.ownerAccepted && used.get(f.id) > 0);
const blocking = failing.filter((r) => r.blocking || r.classification === "UNCLASSIFIED");
// A run that did not cover the full required scope is never PASS, whatever its results.
const missingScope = [
  ...COVERAGE.requiredMatches.filter((m) => !MATCHES.includes(m)).map((m) => `match ${m} not run`),
  ...(PERSISTENCE ? [] : ["persistence probes not run"]),
  ...(OFFLINE ? [] : ["offline reliability run not run"]),
  ...(CROSS_SPORT ? [] : ["cross-sport switching test not run"]),
];
const verdict = blocking.length || stale.length ? "FAIL" : missingScope.length ? "INCOMPLETE" : "PASS";
const report = {
  verdict, missingScope, base: BASE, matches: MATCHES, persistence: PERSISTENCE, generatedAt: new Date().toISOString(),
  totals: { results: results.length, pass: results.length - failing.length, fail: failing.length, unclassified: unclassified.length, blocking: blocking.length, stale: stale.map((f) => f.id) },
  findings: FINDINGS.map((f) => ({ id: f.id, kind: f.kind, title: f.title, ownerAccepted: f.ownerAccepted ?? null, occurrences: used.get(f.id), downstream: failing.filter((r) => r.effect === "downstream" && r.classification === f.id).length })),
  steps, results,
};
writeFileSync(join(LAB, "out/browser-report.json"), JSON.stringify(report, null, 1));

const md = [];
md.push(`## Event Stats browser laboratory — ${verdict === "PASS" ? "✅ PASS" : verdict === "INCOMPLETE" ? "⚠️ INCOMPLETE (not a pass)" : "❌ FAIL"}`, "");
if (missingScope.length) md.push(`Partial run — ${missingScope.join("; ")}. Only a run of the full required scope can pass.`, "");
md.push(`Matches ${MATCHES.join(", ")} through the real UI${PERSISTENCE ? ", persistence probes" : ""}, constructed tests, PDF files. ${results.length} results: ${results.length - failing.length} pass, ${failing.length} not passing (${unclassified.length} unclassified, ${blocking.length} blocking).`, "");
md.push("| Step | Seconds | Result |", "|---|---:|---|", ...steps.map((s) => `| ${s.label} | ${s.secs} | ${s.ok ? "ok" : `**exit ${s.exit}**`} |`), "");
for (const m of ranMatches) { const c = results.find((r) => r.area === `Match ${m}` && r.counts); if (c) md.push(`- **Match ${m}** — ${c.item}`); }
md.push("");
if (openFindings.length || FINDINGS.some((f) => used.get(f.id) > 0)) {
  md.push("### Registered findings seen in this run", "", "| Id | Kind | Finding | Occurrences (direct + downstream) | Blocks the run |", "|---|---|---|---:|---|");
  for (const f of FINDINGS.filter((F) => used.get(F.id) > 0)) {
    const ds = failing.filter((r) => r.effect === "downstream" && r.classification === f.id).length;
    md.push(`| ${f.id} | ${f.kind} | ${f.title} | ${used.get(f.id)}${ds ? ` (${used.get(f.id) - ds} + ${ds})` : ""} | ${f.kind === "app-finding" && !f.ownerAccepted ? "yes (open app finding)" : "no"} |`);
  }
  md.push("");
}
if (unclassified.length) md.push("### ❌ Unclassified results (not in browser/known-findings.json)", "", ...unclassified.map((r) => `- ${r.area}: ${r.item} — ${r.detail ?? ""}`.slice(0, 600)), "");
if (stale.length) md.push("### ❌ Stale register entries (matched nothing — remove once fixed)", "", ...stale.map((f) => `- ${f.id}: ${f.title}`), "");
md.push("Full results: `lab/event-stats/out/browser-report.json` (uploaded with the PDFs as the run's artifact).");
writeFileSync(join(LAB, "out/browser-report.md"), md.join("\n") + "\n");
if (SUMMARY) appendFileSync(SUMMARY, md.join("\n") + "\n");
console.log(`\n${md.join("\n")}`);
process.exit(verdict === "PASS" ? 0 : verdict === "INCOMPLETE" ? 3 : 1);
