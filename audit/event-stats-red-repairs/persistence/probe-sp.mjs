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



const tmpl = (n, name) => ({ id: `seed-${n}`, createdAt: 1_700_000_000_000 + n, homeTeamName: name, awayTeamName: "Opp", venue: "", sport: "gaelic", matchType: "league", halfDurationMinutes: 30, scorelineSnapshot: "", eventCount: 1, events: [{ id: `x${n}`, kind: "POINT", type: "POINT", teamSide: "FOR", nx: 0.8, ny: 0.5, half: 1, period: "1H", timestamp: 10, matchClockSeconds: 10, tags: ["PLAY"] }], homeSquad: { id: "h", players: [] }, awaySquad: { id: "a", players: [] }, homeSquadLiveState: [], awaySquadLiveState: [], restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 2000, firstHalfAttackingDirection: "right" } });
const strip = (page) => page.evaluate(() => document.body.innerText.match(/(Save (failed|blocked)[^\n]*|Match saved\.[^\n]*)/)?.[0] ?? null);
const CORRUPT = '[{"id":"older-match","createdAt":1,"homeTeamName":"Older","awayTeamName":"Opp","events":[],"restoreContext":{}}, {"truncated';
const MALFORMED = { id: "legacy-broken", homeTeamName: "Legacy", events: "not-an-array", note: "kept" };

const scenarios = {
  async s1_twentyFirstMatch() {
    const ctx = await freshContext();
    const seeded = Array.from({ length: 20 }, (_, i) => tmpl(20 - i, `Saved Match ${20 - i}`));
    const page = await startMatch(ctx, "Match Twenty-One", "Opp", { key: KEY, value: JSON.stringify(seeded) });
    await page.clock.runFor(30_000);
    await tag(page); await settle(page);
    const store = (await readStore(ctx)).pro;
    await ctx.close();
    const names = store.map((m) => m.homeTeamName);
    return { savedBefore: 20, savedAfter: store.length, newMatchSaved: names.includes("Match Twenty-One"), firstMatchKept: names.includes("Saved Match 1"), evicted: seeded.map((m) => m.homeTeamName).filter((n) => !names.includes(n)) };
  },

  async s2_unreadableEventStatsStore() {
    const ctx = await freshContext();
    const page = await startMatch(ctx, "Home FC", "Away FC", { key: KEY, value: CORRUPT });
    await page.clock.runFor(30_000);
    await tag(page);
    const pitchFooter = await page.evaluate(() => document.body.innerText.match(/✓ Event saved|Save (failed|blocked)[^\n]*/)?.[0] ?? null);
    await settle(page);
    const warning = await strip(page);
    const after = await page.evaluate((k) => localStorage.getItem(k), KEY);
    await ctx.close();
    return { pitchFooter, stripWarning: warning, storedValueUnchanged: after === CORRUPT, olderMatchStillPresent: after.includes("older-match") };
  },

  async s3_unreadableMatchStatsArchive_SaveMatch() {
    const ctx = await freshContext();
    const page = await startMatch(ctx, "Home FC", "Away FC", { key: "pitchflow_matches_v1", value: CORRUPT });
    await page.clock.runFor(30_000);
    await tag(page); await settle(page);
    await page.getByRole("button", { name: "⋯ Options", exact: true }).click();
    await page.getByRole("button", { name: "Save Match", exact: true }).click();
    await page.waitForTimeout(200);
    const feedback = await strip(page);
    const archive = await page.evaluate(() => localStorage.getItem("pitchflow_matches_v1"));
    const pro = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]").length, KEY);
    await ctx.close();
    return { feedback, archiveUnchanged: archive === CORRUPT, eventStatsMatchesStored: pro };
  },

  async s4_malformedRecordSurvives() {
    const ctx = await freshContext();
    const page = await startMatch(ctx, "Home FC", "Away FC", { key: KEY, value: JSON.stringify([tmpl(1, "Valid Older"), MALFORMED]) });
    await page.clock.runFor(30_000);
    await tag(page); await settle(page);
    const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
    await ctx.close();
    const kept = stored.find((r) => r.id === "legacy-broken");
    return { recordsStored: stored.length, malformedKept: !!kept, malformedUnchanged: JSON.stringify(kept) === JSON.stringify(MALFORMED), validOlderKept: stored.some((r) => r.id === "seed-1") };
  },

  async s5_storageFull() {
    const ctx = await freshContext();
    const page = await startMatch(ctx);
    await page.clock.runFor(30_000);
    await tag(page); await settle(page);
    const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
    // Fill the origin's quota with an unrelated key until a write fails.
    const filled = await page.evaluate(() => { let s = "x".repeat(1_000_000); let n = 0; for (let i = 0; i < 400; i++) { try { localStorage.setItem("filler" + n, s); n++; } catch { s = s.slice(0, Math.floor(s.length / 2)); if (s.length < 2) break; } } return n; });
    await tag(page);
    const pitchFooter = await page.evaluate(() => document.body.innerText.match(/✓ Event saved|Save (failed|blocked)[^\n]*/)?.[0] ?? null);
    await settle(page);
    const warning = await strip(page);
    const after = await page.evaluate((k) => localStorage.getItem(k), KEY);
    // Free space (as a coach deleting/exporting would), then the next event saves and the warning clears.
    await page.evaluate((n) => { for (let i = 0; i < n; i++) localStorage.removeItem("filler" + i); }, filled);
    await tag(page); await settle(page);
    const cleared = (await strip(page)) === null;
    const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))[0].events.length;
    await ctx.close();
    return { pitchFooter, stripWarning: warning, existingMatchUnchangedWhileFull: after === before, warningClearedAfterSpaceFreed: cleared, eventsStoredAfterRecovery: stored, eventsInApp: 3 };
  },
};

const pick = process.argv[2] ?? "all";
const label = process.argv[4] ?? "run";
for (const [name, fn] of Object.entries(scenarios)) {
  if (pick !== "all" && pick !== name) continue;
  try { results[name] = await fn(); } catch (e) { results[name] = { error: String(e).slice(0, 400) }; }
  console.log(name, JSON.stringify(results[name]));
}
writeFileSync(`${OUT}/sp-${label}.json`, JSON.stringify(results, null, 1));
await browser.close();
