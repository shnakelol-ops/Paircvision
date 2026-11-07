// How many realistic saved matches fit before autosave of a NEW match fails?
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { CHROME, markTile, pitchTap } from "./ui-driver.mjs";
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const d = JSON.parse(readFileSync(`${S}/runs-r1b/B/state/final.json`, "utf8"));
const big = d.reduce((a, x) => (x.events?.length ?? 0) > (a.events?.length ?? 0) ? x : a);
const sharedTmpl = JSON.parse(readFileSync(`${S}/runs-r1b/B/state/final.json`, "utf8"));
const browser = await chromium.launch({ executablePath: CHROME });
const out = [];
for (const n of [8, 12, 14, 16, 18]) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.clock.install({ time: new Date("2026-10-26T14:00:00Z") });
  await page.goto("http://localhost:5199/pro-tagger");
  // n finished 300-event matches, saved the way Save & Finish saves them: full record + shared-archive record
  const seeded = await page.evaluate(({ big, n }) => {
    const pro = [], shared = [];
    for (let i = 0; i < n; i++) {
      pro.push({ ...big, id: `seed-${i}`, homeTeamName: `Saved ${i}` });
      shared.push({ id: `seed-${i}`, createdAt: big.createdAt, label: `Saved ${i}`, homeTeamName: `Saved ${i}`, awayTeamName: big.awayTeamName, venue: big.venue, events: big.events, eventCount: big.events.length, scorelineSnapshot: big.scorelineSnapshot, restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 2000, firstHalfAttackingDirection: "RIGHT" } });
    }
    try { localStorage.setItem("pitchflow_pro_tagger_matches_v1", JSON.stringify(pro)); } catch (e) { return "pro seed failed: " + e.name; }
    try { localStorage.setItem("pitchflow_matches_v1", JSON.stringify(shared)); } catch (e) { return "shared seed failed: " + e.name; }
    return (JSON.stringify(pro).length + JSON.stringify(shared).length);
  }, { big, n });
  await page.reload();
  await page.getByText("New Match").click();
  await page.getByRole("button", { name: "Gaelic Football", exact: true }).click();
  await page.getByPlaceholder("e.g. Kilkenny").fill("New Match FC");
  await page.getByPlaceholder("e.g. Tipperary").fill("Opp");
  await page.getByText("Continue → Squads").click();
  await page.getByText("Go To Game").first().click();
  await page.getByText("RIGHT", { exact: true }).click();
  await page.getByRole("button", { name: "▶ Start", exact: true }).click();
  await page.clock.runFor(30000);
  const sel = await markTile(page, "football", "POINT", "FOR", "Play"); await page.locator(sel).click();
  await page.getByRole("button", { name: "No player / Unknown" }).click();
  await pitchTap(page, 0.85, 0.5);
  await page.clock.runFor(3000);
  const warn = await page.evaluate(() => document.body.innerText.match(/Save failed[^\n]*/)?.[0] ?? null);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pitchflow_pro_tagger_matches_v1") || "[]").some((m) => m.homeTeamName === "New Match FC"));
  out.push({ savedFinishedMatches: n, seededChars: seeded, newMatchAutosaved: stored, warningShown: warn });
  console.log(JSON.stringify(out.at(-1)));
  await ctx.close();
}
writeFileSync(`${S}/persist/results/quota.json`, JSON.stringify(out, null, 1));
await browser.close();
