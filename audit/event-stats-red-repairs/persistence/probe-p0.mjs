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

async function freshContext() {
  return browser.newContext({ viewport: { width: 430, height: 932 } });
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
  await page.getByText(/✓ Event saved|Save failed — storage unavailable\./).first().waitFor({ timeout: 3000 });
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


async function background(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  });
}
const shownClock = (page) => page.evaluate(() => Array.from(document.querySelectorAll("span")).map((s) => s.textContent.trim()).find((s) => /^\d{2}:\d{2}$/.test(s)));
async function reopenPausedAt(ctx) {
  const p2 = await ctx.newPage(); p2.setDefaultTimeout(8000);
  await p2.goto(`${BASE}/pro-tagger`);
  await p2.getByText("Resume in-progress match").click();
  await p2.waitForTimeout(300);
  const r = await p2.evaluate(() => ({ text: document.body.innerText.match(/MATCH REOPENED|HALF TIME|MATCH COMPLETE/)?.[0] ?? null, pausedAt: document.body.innerText.match(/paused at (\d{2}:\d{2})/)?.[1] ?? null }));
  await p2.close();
  return r;
}

const scenarios = {
  async t1_t2_killAfterEvent() {
    const rows = [];
    for (const delay of [0, 250, 500, 750, 1000]) {
      const ctx = await freshContext();
      const page = await startMatch(ctx);
      await page.clock.runFor(30_000);
      await tag(page); await settle(page); await page.clock.runFor(2000);
      await page.clock.runFor(10_000);
      await tag(page);
      const footer = await page.evaluate(() => document.body.innerText.match(/✓ Event saved|Save failed[^\n]*/)?.[0] ?? null);
      if (delay) await page.clock.runFor(delay);
      await crash(ctx, page);
      const m = (await readStore(ctx)).pro[0];
      rows.push({ killAfterMs: delay, confirmationShown: footer, storedEvents: m?.events.length ?? 0, lost: 2 - (m?.events.length ?? 0) });
      await ctx.close();
    }
    return rows;
  },

  async t3_fiveRapidEvents() {
    const rows = [];
    for (const gapMs of [800, 1000]) {
      const ctx = await freshContext();
      const page = await startMatch(ctx);
      await page.clock.runFor(30_000);
      await tag(page); await settle(page); await page.clock.runFor(2000);
      for (let i = 0; i < 5; i++) { await tag(page, i % 2 ? WIDE_OPP : POINT_FOR); await page.clock.runFor(gapMs); }
      await crash(ctx, page);
      const m = (await readStore(ctx)).pro[0];
      const ids = m.events.map((e) => e.id);
      rows.push({ gapBetweenEventsMs: gapMs, eventsInApp: 6, stored: m.events.length, lost: 6 - m.events.length, duplicateIds: ids.length - new Set(ids).size });
      await ctx.close();
    }
    return rows;
  },

  async t4_killAfterUndo() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await page.getByRole("button", { name: "↩", exact: true }).click();
    await crash(ctx, page);
    const m = (await readStore(ctx)).pro[0];
    await ctx.close();
    return { eventsBeforeUndo: 2, eventsAfterUndoInApp: 1, stored: m.events.length };
  },

  async t5_t6_killAfterHtFt() {
    const rows = [];
    for (const label of ["HT", "FT"]) {
      const ctx = await freshContext();
      const page = await startMatch(ctx);
      await page.clock.runFor(30_000);
      await tag(page); await settle(page); await page.clock.runFor(2000);
      if (label === "FT") {
        await page.getByRole("button", { name: "HT", exact: true }).click();
        await page.getByRole("button", { name: "End Half", exact: true }).click();
        await page.clock.runFor(2000);
        await page.getByRole("button", { name: "START SECOND HALF", exact: true }).click();
        await page.clock.runFor(60_000);
        await tag(page, { ...POINT_FOR, nx: 0.15 }); await settle(page); await page.clock.runFor(2000);
      }
      await page.clock.runFor(120_000);
      const clockAtPress = await shownClock(page);
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("button", { name: label === "HT" ? "End Half" : "Finish Match", exact: true }).click();
      await crash(ctx, page);
      const m = (await readStore(ctx)).pro[0];
      // A finished match is not offered as "in progress" — that is the correct outcome for FT.
      const reopened = m.restoreContext.matchState === "FULL_TIME" ? { text: "(finished: listed in Saved Matches)", pausedAt: null } : await reopenPausedAt(ctx);
      rows.push({ transition: label, killAfterMs: 0, clockAtPress, storedState: m.restoreContext.matchState, storedClockSeconds: m.restoreContext.matchTimeSeconds, storedEvents: m.events.length, reopensAs: reopened.text, reopenPausedAt: reopened.pausedAt });
      await ctx.close();
    }
    return rows;
  },

  async t7_backgroundWhileRunning() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(60_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await page.clock.runFor(7 * 60_000);
    await tag(page); await page.clock.runFor(100);
    const clockShown = await shownClock(page);
    await background(page);
    await crash(ctx, page);
    const m = (await readStore(ctx)).pro[0];
    const reopened = await reopenPausedAt(ctx);
    await ctx.close();
    return { clockWhenBackgrounded: clockShown, storedEvents: m.events.length, expectedEvents: 2, storedClockSeconds: m.restoreContext.matchTimeSeconds, reopenPausedAt: reopened.pausedAt };
  },

  async t7b_staleClockNoEvents() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(60_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await page.clock.runFor(7 * 60_000);
    const clockShown = await shownClock(page);
    await background(page);
    await crash(ctx, page);
    const m = (await readStore(ctx)).pro[0];
    const reopened = await reopenPausedAt(ctx);
    await ctx.close();
    return { clockWhenBackgrounded: clockShown, storedClockSeconds: m.restoreContext.matchTimeSeconds, reopenPausedAt: reopened.pausedAt };
  },

  async t8_backgroundWhilePaused() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(90_000);
    await tag(page); await settle(page); await page.clock.runFor(1000);
    await page.getByRole("button", { name: "⏸ Pause", exact: true }).click();
    const clockAtPause = await shownClock(page);
    await page.clock.runFor(120_000);
    const clockAfterPausedWait = await shownClock(page);
    await background(page);
    await crash(ctx, page);
    const m = (await readStore(ctx)).pro[0];
    const reopened = await reopenPausedAt(ctx);
    await ctx.close();
    return { clockAtPause, clockAfterPausedWait, storedClockSeconds: m.restoreContext.matchTimeSeconds, storedEvents: m.events.length, reopensAs: reopened.text, reopenPausedAt: reopened.pausedAt };
  },

  async t9_storageFailure() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      window.__restoreSetItem = () => { Storage.prototype.setItem = orig; };
      Storage.prototype.setItem = function () { throw new DOMException("quota", "QuotaExceededError"); };
    });
    await tag(page);
    const pitchFooterOnFailure = await page.evaluate(() => document.body.innerText.match(/✓ Event saved|Save failed[^\n]*/)?.[0] ?? null);
    await settle(page); await page.clock.runFor(2000);
    const stripWarning = await page.evaluate(() => document.body.innerText.match(/Save failed[^\n]*/)?.[0] ?? null);
    await page.evaluate(() => window.__restoreSetItem());
    await tag(page);
    const pitchFooterAfterRecovery = await page.evaluate(() => document.body.innerText.match(/✓ Event saved|Save failed[^\n]*/)?.[0] ?? null);
    await settle(page);
    const m = (await readStore(ctx)).pro[0];
    await ctx.close();
    return { pitchFooterOnFailure, stripWarning, pitchFooterAfterRecovery, eventsInApp: 3, storedAfterRecovery: m.events.length };
  },

  async t10_reloadAndResume() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(30_000);
    for (let i = 0; i < 4; i++) { await tag(page, i % 2 ? WIDE_OPP : POINT_FOR); await settle(page); await page.clock.runFor(5000); }
    const clockBefore = await shownClock(page);
    await page.reload();
    await page.getByText("Resume in-progress match").click();
    await page.waitForTimeout(300);
    const reopened = await page.evaluate(() => ({ text: document.body.innerText.match(/MATCH REOPENED/)?.[0] ?? null, pausedAt: document.body.innerText.match(/paused at (\d{2}:\d{2})/)?.[1] ?? null }));
    await page.getByRole("button", { name: "RESUME MATCH" }).click();
    await page.clock.runFor(3000);
    await tag(page, WIDE_OPP); await settle(page);
    const all = (await readStore(ctx)).pro;
    const m = all[0];
    const ids = m.events.map((e) => e.id);
    await ctx.close();
    return { clockBeforeReload: clockBefore, reopened, storedMatches: all.length, storedEvents: m.events.length, expectedEvents: 5, eventCount: m.eventCount, duplicateIds: ids.length - new Set(ids).size, score: m.scorelineSnapshot };
  },
};

const pick = process.argv[2] ?? "all";
const label = process.argv[4] ?? "run";
for (const [name, fn] of Object.entries(scenarios)) {
  if (pick !== "all" && pick !== name) continue;
  try { results[name] = await fn(); } catch (e) { results[name] = { error: String(e).slice(0, 400) }; }
  console.log(name, JSON.stringify(results[name]));
}
writeFileSync(`${OUT}/p0-${label}.json`, JSON.stringify(results, null, 1));
await browser.close();
