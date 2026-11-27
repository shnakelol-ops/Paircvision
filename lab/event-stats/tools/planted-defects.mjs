#!/usr/bin/env node
// Four-sport isolation: planted-defect detection (Guardian V1, Phase B).
//
//   node lab/event-stats/tools/planted-defects.mjs <disposable-clone> [--only P1,P3] [--no-browser]
//
// Plants one sport-specific application defect at a time IN A DISPOSABLE CLONE of this repository
// (never in the working tree: the tool refuses to run on the repository it lives in), runs the
// laboratory there, and requires that the defect is detected — as new failures that the registers
// do not explain — in the affected sport ONLY. Every other sport's results must be exactly what
// they were before the defect was planted. Each plant is reverted (git checkout) before the next.
//
// Engine laboratory (all six Golden Matches, vitest) runs for every plant. Browser plants also
// build the clone, serve it on port 5399 and run the browser laboratory over the matches listed
// (and the cross-sport switching test), with persistence and offline runs left out.
//
// Writes <clone>/lab/event-stats/out/planted-defects.json and prints a summary. Exit 0 only when
// every planted defect was detected in exactly its own sport.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const CLONE = resolve(args[0] ?? "");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const BROWSER = !args.includes("--no-browser");
const HERE = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
if (!args[0] || !existsSync(join(CLONE, ".git")) || !existsSync(join(CLONE, "node_modules"))) {
  console.error("usage: planted-defects.mjs <disposable clone with node_modules>"); process.exit(2);
}
if (CLONE === HERE) { console.error("refusing to plant defects in the working repository — pass a disposable clone"); process.exit(2); }
const LAB = join(CLONE, "lab/event-stats");
const SPORT_OF_MATCH = { A: "football", B: "football", C: "hurling", D: "hurling", E: "ladies_football", F: "camogie" };

/** Each plant: one exact replacement in the app (must occur once), the sport it must affect, and
 *  the browser scope (matches) it is checked over in addition to the engine laboratory. */
const PLANTS = [
  { id: "P1", sport: "camogie", what: "camogie offers the football 2PT family",
    file: "src/pro-tagger/pro-tagger-families.ts", find: `    hideForSports: ["hurling", "camogie"],\n    hasMinus: true,\n  },\n  {\n    // Non-scoring`, replace: `    hideForSports: ["hurling"],\n    hasMinus: true,\n  },\n  {\n    // Non-scoring`, browser: [] },
  { id: "P2", sport: "camogie", what: "camogie offers a Sin Bin discipline option",
    file: "src/pro-tagger/pro-tagger-discipline.ts", find: `  if (sport === "gaelic" || sport === "ladies_football") {\n    return ["YELLOW_CARD", "SIN_BIN", "RED_CARD"];`, replace: `  if (sport === "gaelic" || sport === "ladies_football" || sport === "camogie") {\n    return ["YELLOW_CARD", "SIN_BIN", "RED_CARD"];`, browser: [] },
  { id: "P3", sport: "ladies_football", what: "Ladies Football live screen says P/O (puck-out) instead of K/O",
    file: "src/pro-tagger/pro-tagger-families.ts", find: `  return isHurlingOrCamogie(sport) ? "P/O" : "K/O";`, replace: `  return isHurlingOrCamogie(sport) || sport === "ladies_football" ? "P/O" : "K/O";`, browser: [], engineBlind: true },
  { id: "P4", sport: "ladies_football", what: "Ladies Football kickout owner taken from the tapped side (restart misclassification)",
    file: "src/pro-tagger/pro-tagger-families.ts", find: `  return PRO_TAGGER_FAMILIES.filter((f) => !f.hideForSports?.includes(sport));`, replace: `  return PRO_TAGGER_FAMILIES.filter((f) => !f.hideForSports?.includes(sport)).map((f) => (sport === "ladies_football" && f.id === "RESTART" ? { ...f, ownerImplicitFromTappedSide: true } : f));`, browser: [] },
  { id: "P5", sport: "camogie", what: "camogie Goal tiles record a 1-point score (goal value)",
    file: "src/pro-tagger/pro-tagger-families.ts", find: `  return PRO_TAGGER_FAMILIES.filter((f) => !f.hideForSports?.includes(sport));`, replace: `  return PRO_TAGGER_FAMILIES.filter((f) => !f.hideForSports?.includes(sport)).map((f) => (sport === "camogie" && f.id === "GOAL" ? { ...f, id: "POINT" as typeof f.id } : f));`, browser: [] },
  { id: "P6", sport: "camogie", what: "camogie PDFs say Kickout instead of Puckout",
    file: "src/stats/reviewPdfExport.ts", find: `function koLabel(sport: PitchSport): string {\n  return isPuck(sport) ? "Puckout" : "Kickout";`, replace: `function koLabel(sport: PitchSport): string {\n  return isPuck(sport) && sport !== "camogie" ? "Puckout" : "Kickout";`, browser: ["C", "F"], engineBlind: true, noCrossSport: true },
].filter((p) => !ONLY || ONLY.includes(p.id));

const sh = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { cwd: CLONE, encoding: "utf8", maxBuffer: 1 << 28, ...opts });
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function engine() {
  sh(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "lab/event-stats/engine/vitest.lab.config.ts"]);
  const r = readJson(join(LAB, "out/engine-report.json"));
  const per = {};
  for (const m of Object.keys(SPORT_OF_MATCH)) {
    const mine = r.checks.filter((c) => c.match === m && c.status !== "PASS");
    per[m] = { failed: mine.length, unclassified: mine.filter((c) => !c.classification).length, keys: mine.map((c) => c.key ?? c.stat).sort() };
  }
  return per;
}

let server = null;
async function serve() {
  const b = sh(process.execPath, ["node_modules/vite/bin/vite.js", "build"]);
  if (b.status !== 0) throw new Error(`build failed: ${b.stderr.slice(-800)}`);
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", "5399", "--strictPort"], { cwd: CLONE, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { const r = await fetch("http://localhost:5399/"); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("preview server did not start");
}
function unserve() { if (server) { server.kill("SIGTERM"); server = null; } }

/** Browser signals: results the registers do not explain (coverage/scope rows aside), by sport. */
function browser(matches, crossSport) {
  sh(process.execPath, ["lab/event-stats/tools/run-browser-lab.mjs", "--base", "http://localhost:5399", "--matches", matches.join(","), "--no-persistence", "--no-offline", ...(crossSport ? [] : ["--no-cross-sport"])], { timeout: 30 * 60_000 });
  const r = readJson(join(LAB, "out/browser-report.json"));
  const per = {};
  for (const x of r.results.filter((x) => x.classification === "UNCLASSIFIED" && !/^coverage — /.test(x.item) && x.area !== "Constructed")) {
    const sport = x.area === "Cross-sport" ? x.item.split(" ")[0] : SPORT_OF_MATCH[x.area.replace(/^Match /, "")] ?? x.area;
    (per[sport] ??= []).push(`${x.area}: ${x.item}`);
  }
  return per;
}

const report = { clone: CLONE, generatedAt: new Date().toISOString(), plants: [] };
const baseline = engine();
let baseBrowser = null;
const needBrowser = BROWSER && PLANTS.some((p) => p.browser.length || !p.noCrossSport);
if (needBrowser) { await serve(); baseBrowser = browser(["C", "F"].filter((m) => PLANTS.some((p) => p.browser.includes(m))), true); unserve(); }
report.baseline = { engine: Object.fromEntries(Object.entries(baseline).map(([m, v]) => [m, { failed: v.failed, unclassified: v.unclassified }])), browserUnexplained: baseBrowser };

for (const p of PLANTS) {
  const file = join(CLONE, p.file);
  const src = readFileSync(file, "utf8");
  const n = src.split(p.find).length - 1;
  if (n !== 1) { report.plants.push({ ...p, error: `patch site found ${n} times` }); continue; }
  writeFileSync(file, src.replace(p.find, p.replace));
  const out = { id: p.id, sport: p.sport, what: p.what, file: p.file };
  try {
    const e = engine();
    const changed = Object.keys(SPORT_OF_MATCH).filter((m) => e[m].unclassified > 0 || JSON.stringify(e[m].keys) !== JSON.stringify(baseline[m].keys));
    out.engine = { matchesChanged: changed, sportsChanged: [...new Set(changed.map((m) => SPORT_OF_MATCH[m]))], newUnclassified: Object.fromEntries(changed.map((m) => [m, e[m].unclassified])) };
    if (BROWSER) {
      await serve();
      const b = browser(p.browser, !p.noCrossSport);
      unserve();
      out.browser = { scope: [...p.browser, ...(p.noCrossSport ? [] : ["Cross-sport"])], sportsChanged: Object.keys(b).filter((s) => JSON.stringify(b[s]) !== JSON.stringify(baseBrowser?.[s] ?? [])), sample: Object.fromEntries(Object.entries(b).map(([s, v]) => [s, v.slice(0, 5)])) };
    }
    const detected = [...new Set([...(out.engine.sportsChanged ?? []), ...(out.browser?.sportsChanged ?? [])])];
    out.detected = detected.includes(p.sport);
    out.isolated = detected.every((s) => s === p.sport);
    out.engineDetected = out.engine.sportsChanged.includes(p.sport);
    out.pass = out.detected && out.isolated && (p.engineBlind || out.engineDetected);
  } catch (err) { out.error = String(err.message ?? err).slice(0, 600); unserve(); }
  finally { execFileSync("git", ["checkout", "--", p.file], { cwd: CLONE }); }
  report.plants.push(out);
  console.log(`${out.pass ? "PASS" : "FAIL"}  ${p.id} ${p.what} — detected in: ${[...new Set([...(out.engine?.sportsChanged ?? []), ...(out.browser?.sportsChanged ?? [])])].join(", ") || "nothing"}${out.error ? ` (${out.error})` : ""}`);
}
// Leave the clone's build unplanted too.
if (BROWSER) sh(process.execPath, ["node_modules/vite/bin/vite.js", "build"]);
const after = engine();
report.restored = Object.keys(SPORT_OF_MATCH).every((m) => JSON.stringify(after[m].keys) === JSON.stringify(baseline[m].keys));
writeFileSync(join(LAB, "out/planted-defects.json"), JSON.stringify(report, null, 1));
const ok = report.plants.every((p) => p.pass) && report.restored;
console.log(`\n${report.plants.filter((p) => p.pass).length}/${report.plants.length} planted defects detected in their own sport only; clone restored: ${report.restored}`);
process.exit(ok ? 0 : 1);
