// Persistence probe: drives the real Event Stats UI (main) in Chromium with a
// fake clock, then "kills" the tab at precise moments and reads what reached
// localStorage. Usage: node probe.mjs <scenario|all>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { CHROME, markTile, pitchTap } from "./ui-driver.mjs";

const BASE = "http://localhost:5199";
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
  await page.getByText("✓ Event saved").waitFor({ timeout: 3000 });
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

const scenarios = {
  // 1. Kill N ms after a completed event (pitch tap), no lifecycle events at all.
  async killAfterEvent() {
    const rows = [];
    for (const delay of [0, 250, 500, 750, 1000, 1150, 1199, 1200, 1250, 1500, 3000]) {
      const ctx = await freshContext();
      const page = await startMatch(ctx);
      await page.clock.runFor(30_000);
      await tag(page); await settle(page); await page.clock.runFor(2000); // event 1 fully settled + autosaved
      await page.clock.runFor(10_000);
      await tag(page);                                                    // event 2 completed at t=0
      if (delay) await page.clock.runFor(delay);
      const live = await liveCount(page);
      await crash(ctx, page);
      const m = (await readStore(ctx)).pro[0];
      rows.push({ delayMs: delay, liveEventsShown: live ?? "(confirmation)", storedEvents: m?.events.length ?? 0, secondEventPersisted: (m?.events.length ?? 0) === 2 });
      await ctx.close();
    }
    return rows;
  },

  // 2. Rapid consecutive events: the debounce restarts on every event.
  async rapidSequence() {
    const rows = [];
    for (const gapMs of [800, 1000, 1500, 2500]) {
      const ctx = await freshContext();
      const page = await startMatch(ctx);
      await page.clock.runFor(30_000);
      await tag(page); await settle(page); await page.clock.runFor(2000); // 1 event safely stored
      for (let i = 0; i < 5; i++) {
        await tag(page, i % 2 ? WIDE_OPP : POINT_FOR);
        await page.clock.runFor(gapMs);
      }
      // kill 100 ms after the 5-event burst's last gap
      const before = (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]")[0]?.events.length ?? 0, KEY));
      await crash(ctx, page);
      const m = (await readStore(ctx)).pro[0];
      rows.push({ gapBetweenEventsMs: gapMs, eventsInApp: 6, storedBeforeKill: before, storedAfterKill: m?.events.length ?? 0, lost: 6 - (m?.events.length ?? 0) });
      await ctx.close();
    }
    return rows;
  },

  // 3. Half-time / full-time transitions, then a kill.
  async htFt() {
    const rows = [];
    for (const [label, action, confirm] of [["HT", "HT", "End Half"], ["FT", "FT", "Finish Match"]]) {
      for (const delay of [0, 600, 1300]) {
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
          await tag(page, { ...POINT_FOR, nx: 0.15 }); await settle(page); await page.clock.runFor(2000); // 2H: home attacks the other way
        }
        await page.clock.runFor(120_000); // time passes, no events
        await page.getByRole("button", { name: action, exact: true }).click();
        await page.getByRole("button", { name: confirm, exact: true }).click();
        if (delay) await page.clock.runFor(delay);
        const screen = await page.evaluate(() => document.body.innerText.slice(0, 120).replace(/\n/g, " | "));
        await crash(ctx, page);
        const m = (await readStore(ctx)).pro[0];
        rows.push({ transition: label, killAfterMs: delay, screenBeforeKill: screen, stored: summary(m) });
        await ctx.close();
      }
    }
    return rows;
  },

  // 4. Lifecycle events that Android Chrome does fire when the app is
  //    backgrounded/swiped (visibilitychange→hidden, pagehide), then a kill.
  async backgrounded() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await tag(page); await page.clock.runFor(200);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
      document.dispatchEvent(new Event("freeze"));
    });
    await crash(ctx, page);
    const m = (await readStore(ctx)).pro[0];
    await ctx.close();
    return { firedEvents: ["visibilitychange(hidden)", "pagehide", "freeze"], killAfterMs: 200, storedEvents: m?.events.length ?? 0, expected: 2 };
  },

  // 5. A normal tab close / navigation (beforeunload does fire).
  async beforeunloadPath() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await tag(page); await page.clock.runFor(200);
    await page.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 800));
    const m = (await readStore(ctx)).pro[0];
    await ctx.close();
    return { killAfterMs: 200, storedEvents: m?.events.length ?? 0, expected: 2 };
  },

  // 6. Clock while no events are logged: what does a reopened match show?
  async staleClock() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(60_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);           // event at ~1:00
    await page.clock.runFor(7 * 60_000);                                          // 7 more minutes, no events
    const clockShown = await page.evaluate(() => Array.from(document.querySelectorAll("span")).map((s) => s.textContent.trim()).find((s) => /^\d{2}:\d{2}$/.test(s)));
    await crash(ctx, page);
    const m = (await readStore(ctx)).pro[0];
    // reopen through the app
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/pro-tagger`);
    await p2.getByText("Resume in-progress match").click();
    await p2.waitForTimeout(300);
    const reopened = await p2.evaluate(() => document.body.innerText.match(/paused at (\d{2}:\d{2})/)?.[1] ?? null);
    await ctx.close();
    return { clockWhenKilled: clockShown, storedClockSeconds: m.restoreContext.matchTimeSeconds, reopenedPausedAt: reopened };
  },

  // 7. localStorage write failure mid-match (quota exceeded).
  async storageFailure() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      window.__restoreSetItem = () => { Storage.prototype.setItem = orig; };
      Storage.prototype.setItem = function () { throw new DOMException("quota", "QuotaExceededError"); };
    });
    await tag(page); await settle(page); await page.clock.runFor(2000);
    const stripText = await page.evaluate(() => document.body.innerText.match(/Save failed[^\n]*/)?.[0] ?? null);
    // a 3rd event while failing: is the warning still visible on the capture strip?
    await tag(page); await settle(page); await page.clock.runFor(2000);
    const stillShown = await page.evaluate(() => /Save failed/.test(document.body.innerText));
    await page.evaluate(() => window.__restoreSetItem());
    await tag(page); await settle(page); await page.clock.runFor(2000);
    const clearedAfterRecovery = await page.evaluate(() => !/Save failed/.test(document.body.innerText));
    const m = (await readStore(ctx)).pro[0];
    await ctx.close();
    return { warningShown: stripText, warningPersistsWhileFailing: stillShown, clearedAfterRecovery, storedAfterRecovery: m.events.length, eventsInApp: 4 };
  },

  // 8. The 20-match cap: what happens to saved matches when a 21st is started?
  async matchCap() {
    const ctx = await freshContext();
    const seedPage = await ctx.newPage();
    await seedPage.goto(`${BASE}/pro-tagger`);
    const tmpl = { createdAt: 0, homeTeamName: "", awayTeamName: "", venue: "", sport: "gaelic", matchType: "Championship", halfDurationMinutes: 30, scorelineSnapshot: "", eventCount: 1, events: [{ id: "x", kind: "POINT", type: "POINT", teamSide: "FOR", nx: 0.8, ny: 0.5, half: 1, period: "1H", timestamp: 10, matchClockSeconds: 10, tags: ["PLAY"] }], homeSquad: { id: "h", teamName: "", players: [] }, awaySquad: { id: "a", teamName: "", players: [] }, homeSquadLiveState: [], awaySquadLiveState: [], restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 2000, firstHalfAttackingDirection: "right" } };
    const seeded = [];
    for (let i = 20; i >= 1; i--) seeded.push({ ...tmpl, id: `seed-${i}`, createdAt: 1_700_000_000_000 + i, homeTeamName: `Saved Match ${i}`, awayTeamName: "Opp" });
    await seedPage.evaluate(({ k, v }) => localStorage.setItem(k, JSON.stringify(v)), { k: KEY, v: seeded });
    const listedBefore = (await readStore(ctx)).pro.length;
    await seedPage.close();
    const page = await startMatch(ctx, "Match Twenty-One", "Opp");
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    const anyWarning = await page.evaluate(() => /oldest|limit|deleted|removed|20 matches/i.test(document.body.innerText));
    const store = (await readStore(ctx)).pro;
    await ctx.close();
    const names = store.map((m) => m.homeTeamName);
    return { savedBefore: listedBefore, savedAfter: store.length, newMatchSaved: names.includes("Match Twenty-One"), evicted: seeded.map((m) => m.homeTeamName).filter((n) => !names.includes(n)), warningShownToCoach: anyWarning };
  },

  // 9. Unparseable store value: does the next autosave discard it?
  async corruptStore() {
    const ctx = await freshContext();
    const corrupt = '[{"id":"older-match","createdAt":1,"homeTeamName":"Older","awayTeamName":"Opp","events":[],"restoreContext":{}}, {"truncated';
    const page = await startMatch(ctx, "Home FC", "Away FC", { key: KEY, value: corrupt });
    await page.clock.runFor(30_000);
    await tag(page); await settle(page); await page.clock.runFor(2000);
    const after = await page.evaluate((k) => localStorage.getItem(k), KEY);
    await ctx.close();
    return { before: corrupt.slice(0, 60) + "…", afterContainsOlder: after.includes("older-match"), afterMatches: JSON.parse(after).map((m) => m.homeTeamName) };
  },

  // 10. Reopen consistency after a kill mid-2nd-half + review of stored record.
  async reopenConsistency() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(30_000);
    for (let i = 0; i < 4; i++) { await tag(page, i % 2 ? WIDE_OPP : POINT_FOR); await settle(page); await page.clock.runFor(5000); }
    await crash(ctx, page);
    const m = (await readStore(ctx)).pro[0];
    const p2 = await ctx.newPage();
    await p2.clock.install({ time: new Date("2026-10-26T15:00:00Z") });
    await p2.goto(`${BASE}/pro-tagger`);
    await p2.getByText("Resume in-progress match").click();
    await p2.getByRole("button", { name: "RESUME MATCH" }).click();
    await p2.clock.runFor(1000);
    const shownAfterResume = await liveCount(p2);
    await p2.clock.runFor(5000);
    await tag(p2); await settle(p2); await p2.clock.runFor(2000);
    const m2 = (await readStore(ctx)).pro;
    await ctx.close();
    return { stored: summary(m), shownAfterResume, afterNewEvent: { matches: m2.length, ...summary(m2[0]) }, idsUnique: new Set(m2[0].events.map((e) => e.id)).size === m2[0].events.length };
  },
};

const pick = process.argv[2] ?? "all";
for (const [name, fn] of Object.entries(scenarios)) {
  if (pick !== "all" && pick !== name) continue;
  try { results[name] = await fn(); } catch (e) { results[name] = { error: String(e).slice(0, 400) }; }
  console.log(name, JSON.stringify(results[name]));
}
writeFileSync(`${OUT}/probe-${pick}.json`, JSON.stringify(results, null, 1));
await browser.close();
