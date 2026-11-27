#!/usr/bin/env node
// Cross-sport switching test (Guardian V1, Phase B).
//
//   node run-cross-sport.mjs <outDir> [baseUrl]
//
// A coach who tags several sports on one phone creates matches back to back in ONE browser profile.
// Nothing from an earlier sport may carry into the next: capture families and source tiles, the
// restart term, the discipline options, the live-screen wording, or the sport the match is stored as.
//
// 1. Baselines: each of the four sports is created first in its own FRESH profile, and its live
//    screen is read (families, tiles, restart abbreviation, visible text).
// 2. Switching: in one profile the sports are created in the order SEQUENCE (every sport follows a
//    different one, and Ladies Football / Camogie each follow both a football-code and a hurling-code
//    sport). Each reading must equal that sport's fresh-profile baseline, and the stored match must
//    carry the chosen sport.
// 3. Rules: every reading is also checked against rules/sport-rules.json (restart term, forbidden
//    wording on the live screen, capture probes) — independent of the app.
//
// Writes <outDir>/state/cross-sport.json. Pass/fail is judged by tools/run-browser-lab.mjs.

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CHROME, readFamilyTiles } from "./ui-driver.mjs";

const [outDir, baseUrl = "http://localhost:5199"] = process.argv.slice(2);
mkdirSync(`${outDir}/state`, { recursive: true });
mkdirSync(`${outDir}/screens`, { recursive: true });
const RULES = JSON.parse(readFileSync(new URL("../rules/sport-rules.json", import.meta.url), "utf8")).sports;
const SPORT_BUTTON = { football: "Gaelic Football", ladies_football: "Ladies Football", hurling: "Hurling", camogie: "Camogie" };
/** Independent restart abbreviation per sport (kick-outs: Gaelic / Ladies Football; puck-outs: hurling / camogie). */
const RESTART = { football: "K/O", ladies_football: "K/O", hurling: "P/O", camogie: "P/O" };
/** The app's stored sport code (men's Gaelic Football is stored as "gaelic"). */
const STORED_SPORT = { football: "gaelic", ladies_football: "ladies_football", hurling: "hurling", camogie: "camogie" };
const FAMILIES = ["Goal", "Point", "2PT", "Wide", "Discipline", "45", "65", "Turnover", "Free"];
const SEQUENCE = ["football", "camogie", "ladies_football", "hurling", "camogie", "football", "ladies_football", "hurling"];

const browser = await chromium.launch({ executablePath: CHROME });

async function createAndRead(page, sport, n) {
  await page.goto(`${baseUrl}/pro-tagger`);
  await page.getByText("New Match").click();
  await page.getByRole("button", { name: SPORT_BUTTON[sport], exact: true }).first().click();
  await page.getByPlaceholder("e.g. Kilkenny").fill(`XS ${n} Home`);
  await page.getByPlaceholder("e.g. Tipperary").fill(`XS ${n} Away`);
  await page.getByText("Continue → Squads").click();
  await page.getByText("Go To Game").first().click();
  await page.getByText("RIGHT", { exact: true }).click();
  await page.getByRole("button", { name: "▶ Start", exact: true }).first().click();
  await page.waitForTimeout(300);
  const tiles = await readFamilyTiles(page, FAMILIES);
  const restart = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("button")).map((b) => b.textContent.trim());
    return { ko: t.some((x) => /\bK\/O\b/.test(x)), po: t.some((x) => /\bP\/O\b/.test(x)) };
  });
  const texts = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("button, span, div")).filter((e) => e.children.length === 0).map((e) => e.textContent.trim()).filter(Boolean))]);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pitchflow_pro_tagger_matches_v1") || "[]").map((m) => ({ home: m.homeTeamName ?? null, sport: m.sport })));
  await page.screenshot({ path: `${outDir}/screens/xs-${String(n).padStart(2, "0")}-${sport}.png` });
  return { sport, tiles, restart, texts, storedSport: stored.find((m) => m.home === `XS ${n} Home`)?.sport ?? null, storedMatches: stored.length };
}

function ruleChecks(r) {
  const out = [];
  const want = RESTART[r.sport];
  out.push({ check: `restart abbreviation is ${want}`, pass: want === "K/O" ? r.restart.ko && !r.restart.po : r.restart.po && !r.restart.ko, detail: r.restart });
  const forbidden = (RULES[r.sport]?.wording?.forbidden ?? []).filter((w) => w.where !== "capture");
  // Football / hurling: the restart wording of the other code must not appear on the live screen.
  if (r.sport === "football") forbidden.push({ id: "puck", pattern: "\\bpuck|\\bP/O\\b", flags: "i", why: "Gaelic Football uses kick-outs" });
  if (r.sport === "hurling") forbidden.push({ id: "kick", pattern: "\\bkick|\\bK/O\\b", flags: "i", why: "Hurling uses puck-outs" });
  for (const w of forbidden) {
    const hits = r.texts.filter((t) => new RegExp(w.pattern, w.flags).test(t));
    out.push({ check: `live-screen wording: ${w.why}`, pass: hits.length === 0, detail: hits });
  }
  for (const p of RULES[r.sport]?.captureProbes ?? []) {
    const tiles = r.tiles[p.familyLabel];
    out.push({ check: `capture option ${p.family}: family offered (${p.rule})`, pass: tiles != null, detail: tiles });
    for (const t of p.present) out.push({ check: `capture option ${p.family}: tile "${t}" offered (${p.rule})`, pass: !!tiles?.includes(t), detail: tiles });
    for (const t of p.absent) out.push({ check: `capture option ${p.family}: tile "${t}" not offered (${p.rule})`, pass: !tiles?.includes(t), detail: tiles });
  }
  out.push({ check: `stored match sport is ${STORED_SPORT[r.sport]}`, pass: r.storedSport === STORED_SPORT[r.sport], detail: r.storedSport });
  return out;
}

const signature = (r) => JSON.stringify({ tiles: r.tiles, restart: r.restart });

// 1. Fresh-profile baselines.
const baselines = {};
for (const sport of Object.keys(SPORT_BUTTON)) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  baselines[sport] = await createAndRead(page, sport, `B-${sport}`);
  await ctx.close();
}

// 2. Switching in one profile.
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await ctx.newPage();
const steps = [];
for (const [i, sport] of SEQUENCE.entries()) {
  const r = await createAndRead(page, sport, i + 1);
  const prev = i ? SEQUENCE[i - 1] : null;
  const checks = [
    { check: `same capture families, tiles and restart term as a fresh ${sport} profile`, pass: signature(r) === signature(baselines[sport]), detail: signature(r) === signature(baselines[sport]) ? null : { got: { tiles: r.tiles, restart: r.restart }, fresh: { tiles: baselines[sport].tiles, restart: baselines[sport].restart } } },
    { check: "every earlier match still stored", pass: r.storedMatches === i + 1, detail: r.storedMatches },
    ...ruleChecks(r),
  ];
  steps.push({ step: i + 1, sport, after: prev, checks });
}
await ctx.close();
await browser.close();

const baselineChecks = Object.fromEntries(Object.entries(baselines).map(([s, r]) => [s, ruleChecks(r)]));
writeFileSync(`${outDir}/state/cross-sport.json`, JSON.stringify({ sequence: SEQUENCE, baselines: Object.fromEntries(Object.entries(baselines).map(([s, r]) => [s, { tiles: r.tiles, restart: r.restart, storedSport: r.storedSport }])), baselineChecks, steps }, null, 1));
const all = [...Object.values(baselineChecks).flat(), ...steps.flatMap((s) => s.checks)];
console.log(`cross-sport: ${all.filter((c) => c.pass).length}/${all.length} checks pass`);
