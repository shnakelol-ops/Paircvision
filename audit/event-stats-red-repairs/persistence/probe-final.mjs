// Persistence probe: drives the real Event Stats UI (main) in Chromium with a
// fake clock, then "kills" the tab at precise moments and reads what reached
// localStorage. Usage: node probe.mjs <scenario|all>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { CHROME, markTile, pitchTap } from "./ui-driver.mjs";

const BASE = process.argv[3] ?? "http://localhost:5199";
const KEY = "pitchflow_pro_tagger_matches_v1";
const SHARED_KEY = "pitchflow_matches_v1";
const OUT = new URL("./results/", import.meta.url).pathname;
const results = {};

const browser = await chromium.launch({ executablePath: CHROME });

import { devices } from "playwright";
// Android phone emulation: Pixel 7 user agent, viewport, touch, mobile.
async function freshContext() {
  return browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
}

async function startMatch(ctx, home = "Home FC", away = "Away FC", seed = null) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.clock.install({ time: new Date("2026-10-26T14:00:00Z") });
  await page.goto(`${BASE}/pro-tagger`);
  if (seed) {
    await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: seed.key, v: seed.value });
    await page.reload();
  }
  await page.getByText("New Match").click();
  await page.getByRole("button", { name: "Gaelic Football", exact: true }).click();
  await page.getByPlaceholder("e.g. Kilkenny").fill(home);
  await page.getByPlaceholder("e.g. Tipperary").fill(away);
  await page.getByText("Continue → Squads").click();
  await page.getByText("Go To Game").first().click();
  await page.getByText("RIGHT", { exact: true }).click();
  await page.getByRole("button", { name: "▶ Start", exact: true }).click();
  return page;
}

const POINT_FOR = { family: "POINT", row: "FOR", tile: "Play", nx: 0.85, ny: 0.5 };
const WIDE_OPP = { family: "WIDE", row: "OPP", tile: "Play", nx: 0.15, ny: 0.5 };

/** Three taps: tile → No player → pitch. Returns at the instant the event is completed (pitch tap). */
async function tag(page, ev = POINT_FOR) {
  const sel = await markTile(page, "football", ev.family, ev.row, ev.tile);
  await page.locator(sel).click();
  await page.getByRole("button", { name: "No player / Unknown" }).click();
  await pitchTap(page, ev.nx, ev.ny);
  await page.getByText(/✓ Event saved|Save failed|Save blocked/).first().waitFor({ timeout: 3000 });
}
/** Lets the 750 ms "Event saved" confirmation finish so the grid is back. */
async function settle(page) { await page.clock.runFor(800); }

async function liveCount(page) {
  const t = await page.evaluate(() => document.body.innerText.match(/(\d+) events? logged/)?.[1] ?? null);
  return t == null ? null : Number(t);
}

/** Abrupt process death: no beforeunload, no pagehide, no visibilitychange. */
async function crash(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await Promise.race([cdp.send("Page.crash").catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  await new Promise((r) => setTimeout(r, 300));
  await Promise.race([page.close().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}

async function readStore(ctx) {
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  await p.goto(`${BASE}/`);
  const v = await p.evaluate(({ k, s }) => ({ pro: localStorage.getItem(k), shared: localStorage.getItem(s) }), { k: KEY, s: SHARED_KEY });
  await p.close();
  const pro = v.pro ? JSON.parse(v.pro) : [];
  return { pro, shared: v.shared ? JSON.parse(v.shared) : [], proBytes: v.pro?.length ?? 0, sharedBytes: v.shared?.length ?? 0 };
}
const summary = (m) => m && ({ events: m.events.length, eventCount: m.eventCount, state: m.restoreContext.matchState, clock: m.restoreContext.matchTimeSeconds, score: m.scorelineSnapshot });



import { readFileSync as rf } from "node:fs";
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const BIG = (() => { const d = JSON.parse(rf(`${S}/runs-r1b/B/state/final.json`, "utf8")); return d.reduce((a, x) => (x.events?.length ?? 0) > (a.events?.length ?? 0) ? x : a); })();
const CORRUPT = '[{"id":"older-match","createdAt":1,"homeTeamName":"Older","awayTeamName":"Opp","events":[],"restoreContext":{}}, {"truncated';
const footerOrStrip = (page) => page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("span,div")).find((n) => n.children.length === 0 && /^(✓ Event saved|Save (failed|blocked)|Match saved\.)/.test(n.textContent.trim()));
  return el ? { text: el.textContent.trim(), colour: getComputedStyle(el).color } : null;
});
async function fill(page) {
  return page.evaluate(() => { let s = "x".repeat(1_000_000); let n = 0; for (let i = 0; i < 400; i++) { try { localStorage.setItem("filler" + n, s); n++; } catch { s = s.slice(0, Math.floor(s.length / 2)); if (s.length < 2) break; } } return n; });
}
const proMatches = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), KEY);

const scenarios = {
  async f1_saveAndFinish_archiveCopyFails() {
    const ctx = await freshContext();
    const page = await startMatch(ctx, "Ballyboden", "Na Fianna", { key: "pitchflow_matches_v1", value: CORRUPT });
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(5_000);
    await tag(page); await settle(page);
    await page.getByRole("button", { name: "HT", exact: true }).click();
    await page.getByRole("button", { name: "End Half", exact: true }).click();
    await page.getByRole("button", { name: "START SECOND HALF", exact: true }).click();
    await page.clock.runFor(30_000);
    await tag(page, { ...POINT_FOR, nx: 0.15 }); await settle(page);
    await page.getByRole("button", { name: "FT", exact: true }).click();
    await page.getByRole("button", { name: "Finish Match", exact: true }).click();
    await page.getByRole("button", { name: "Save & Finish", exact: true }).click();
    await page.waitForTimeout(100);
    const shown = await footerOrStrip(page);
    await page.screenshot({ path: `${OUT}/f1-save-finish-warning.png` });
    const stillOnScreenBeforeTimeout = await page.evaluate(() => /MATCH COMPLETE/.test(document.body.innerText));
    await page.clock.runFor(3_200);
    await page.waitForTimeout(200);
    const leftToHome = await page.evaluate(() => /New Match/.test(document.body.innerText));
    const stored = (await proMatches(page)).find((m) => m.homeTeamName === "Ballyboden");
    const archiveUnchanged = (await page.evaluate(() => localStorage.getItem("pitchflow_matches_v1"))) === CORRUPT;
    // Reopen the saved match after a full page reload: Saved Matches → Review, and Saved Matches → open.
    await page.reload();
    await page.getByText("Saved Matches").first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /Review/ }).first().click();
    await page.waitForTimeout(300);
    const reviewText = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n/g, " | "));
    await ctx.close();
    return { shown, stillOnScreenBeforeTimeout, leftToHomeAfter3s: leftToHome, stored: stored && { state: stored.restoreContext.matchState, events: stored.events.length, score: stored.scorelineSnapshot }, archiveUnchanged, reviewOpens: /Ballyboden/.test(reviewText) && /Na Fianna/.test(reviewText), reviewHead: reviewText.slice(0, 200) };
  },

  async f2_storageFull_backupThenDeleteResumesSaving() {
    const ctx = await freshContext();
    const seeded = Array.from({ length: 12 }, (_, i) => ({ ...BIG, id: `seed-${i}`, homeTeamName: `Saved ${i}`, createdAt: 1_700_000_000_000 + i }));
    const page = await startMatch(ctx, "Live FC", "Opp", { key: KEY, value: JSON.stringify(seeded) });
    await page.clock.runFor(30_000);
    await tag(page); await settle(page);
    const fillers = await fill(page);
    await tag(page);
    const onFail = await footerOrStrip(page);
    await settle(page);
    await tag(page); await settle(page);
    const stripWhileFull = await footerOrStrip(page);
    const storedWhileFull = (await proMatches(page)).find((m) => m.homeTeamName === "Live FC").events.length;
    // Second tab (same phone browser): Settings → Backup & Restore → Create Backup, with storage full.
    const tabB = await ctx.newPage(); tabB.setDefaultTimeout(10000);
    await tabB.goto(`${BASE}/settings`);
    await tabB.getByText("Backup & Restore").first().click();
    const [download] = await Promise.all([tabB.waitForEvent("download"), tabB.getByRole("button", { name: "Create Backup" }).click()]);
    const file = `${OUT}/f2-backup.json`;
    await download.saveAs(file);
    const backup = JSON.parse(rf(file, "utf8"));
    const backedUp = JSON.parse(backup.data.proTaggerMatches);
    const backupStatus = await tabB.evaluate(() => (document.body.innerText.match(/Downloaded [^\n]*/) || [null])[0]);
    // Then delete one old match in Saved Matches.
    await tabB.goto(`${BASE}/pro-tagger`);
    await tabB.getByText("Saved Matches").first().click();
    await tabB.waitForTimeout(200);
    const noticeBeforeDelete = await tabB.evaluate(() => (document.body.innerText.match(/Storage nearly full[^\n]*/) || [null])[0]);
    const card = tabB.locator("div").filter({ hasText: /^Saved 0/ }).first();
    await tabB.getByRole("button", { name: "Delete" }).last().click();
    await tabB.getByRole("button", { name: "Delete" }).last().click();
    await tabB.waitForTimeout(200);
    const afterDelete = await tabB.evaluate((k) => JSON.parse(localStorage.getItem(k)).map((m) => m.homeTeamName), KEY);
    await tabB.close();
    // Back in the live match: the next event saves, the warning clears, every event is stored.
    await tag(page);
    const onRecovery = await footerOrStrip(page);
    await settle(page);
    const stripAfter = await footerOrStrip(page);
    const live = (await proMatches(page)).find((m) => m.homeTeamName === "Live FC");
    await ctx.close();
    return { fillers, onFail, stripWhileFull, storedWhileFull, eventsInApp: 4, backupStatus, backupHasLiveMatch: backedUp.some((m) => m.homeTeamName === "Live FC"), backupMatches: backedUp.length, noticeBeforeDelete, deletedOne: afterDelete.length === 12, seededRemaining: afterDelete.filter((n) => n.startsWith("Saved")).length, onRecovery, stripAfter, liveEventsStored: live.events.length };
  },

  async f3_storageFull_leavingLiveScreenLosesUnsavedEvents() {
    const ctx = await freshContext();
    const page = await startMatch(ctx, "Live FC", "Opp");
    await page.clock.runFor(30_000);
    await tag(page); await settle(page);
    await fill(page);
    await tag(page); await settle(page);
    await tag(page); await settle(page);
    await page.getByRole("button", { name: "⋯ Options", exact: true }).click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.waitForTimeout(200);
    const promptedBeforeLeaving = false; // "Home" has no confirmation (unchanged behaviour)
    const stored = (await proMatches(page)).find((m) => m.homeTeamName === "Live FC").events.length;
    await ctx.close();
    return { eventsInApp: 3, eventsStored: stored, unsavedLostOnLeaving: 3 - stored, promptedBeforeLeaving };
  },
};

const pick = process.argv[2] ?? "all";
const label = process.argv[4] ?? "run";
for (const [name, fn] of Object.entries(scenarios)) {
  if (pick !== "all" && pick !== name) continue;
  try { results[name] = await fn(); } catch (e) { results[name] = { error: String(e).slice(0, 500) }; }
  console.log(name, JSON.stringify(results[name]));
}
writeFileSync(`${OUT}/final-${label}.json`, JSON.stringify(results, null, 1));
await browser.close();
