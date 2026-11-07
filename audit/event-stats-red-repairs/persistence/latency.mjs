// Save latency on realistic data, through the real live screen (P0 build).
// For each stored-match count and CPU throttle, place events and measure:
//  - write: time inside the synchronous storage write (getItem+parse+stringify+setItem),
//  - tapToSaved: pitch tap → "✓ Event saved" visible,
//  - longest main-thread task during the event.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { CHROME, markTile, pitchTap } from "./ui-driver.mjs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const d = JSON.parse(readFileSync(`${S}/runs-r1b/B/state/final.json`, "utf8"));
const big = d.reduce((a, x) => (x.events?.length ?? 0) > (a.events?.length ?? 0) ? x : a);
const browser = await chromium.launch({ executablePath: CHROME });
const out = [];

const INSTRUMENT = () => {
  window.__writes = [];
  window.__long = [];
  const set = Storage.prototype.setItem, get = Storage.prototype.getItem;
  let t0 = null;
  Storage.prototype.getItem = function (k) { if (k === "pitchflow_pro_tagger_matches_v1") t0 = performance.now(); return get.apply(this, arguments); };
  Storage.prototype.setItem = function (k) {
    const r = set.apply(this, arguments);
    if (k === "pitchflow_pro_tagger_matches_v1" && t0 != null) { window.__writes.push(performance.now() - t0); t0 = null; }
    return r;
  };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: "longtask", buffered: false }); } catch { /* unsupported */ }
};

for (const throttle of [1, 4]) {
  for (const stored of [0, 10, 19]) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    await ctx.addInitScript(INSTRUMENT);
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    await page.goto(`${BASE}/pro-tagger`);
    await page.evaluate(({ big, stored }) => {
      const pro = Array.from({ length: stored }, (_, i) => ({ ...big, id: `seed-${i}`, homeTeamName: `Saved ${i}` }));
      localStorage.setItem("pitchflow_pro_tagger_matches_v1", JSON.stringify(pro));
    }, { big, stored });
    await page.reload();
    await page.getByText("New Match").click();
    await page.getByRole("button", { name: "Gaelic Football", exact: true }).click();
    await page.getByPlaceholder("e.g. Kilkenny").fill("Latency FC");
    await page.getByPlaceholder("e.g. Tipperary").fill("Opp");
    await page.getByText("Continue → Squads").click();
    await page.getByText("Go To Game").first().click();
    await page.getByText("RIGHT", { exact: true }).click();
    await page.getByRole("button", { name: "▶ Start", exact: true }).click();
    // Every write rewrites the whole store, so the stored matches set the cost.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    const samples = [];
    for (let i = 0; i < 6; i++) {
      const sel = await markTile(page, "football", "TURNOVER", "FOR", "Tackle");
      await page.locator(sel).click();
      await page.getByRole("button", { name: "No player / Unknown" }).click();
      await page.evaluate(() => { window.__long = []; window.__writes = []; window.__tap = null; document.querySelector("svg[aria-label='Pitch - tap to place event']").addEventListener("pointerdown", () => { window.__tap = performance.now(); }, { once: true, capture: true }); });
      await pitchTap(page, 0.5, 0.5);
      await page.waitForFunction(() => /✓ Event saved/.test(document.body.innerText));
      const r = await page.evaluate(() => ({ tapToSaved: performance.now() - window.__tap, writes: window.__writes.slice(), longest: Math.max(0, ...window.__long) }));
      samples.push(r);
      await page.getByText("✓ Event saved").waitFor({ state: "detached" });
    }
    const liveSize = await page.evaluate(() => localStorage.getItem("pitchflow_pro_tagger_matches_v1").length);
    const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(1); };
    const mx = (xs) => +Math.max(...xs).toFixed(1);
    const s = samples.slice(1); // first is warm-up
    const writes = s.flatMap((x) => x.writes);
    const row = { cpuThrottle: `${throttle}x`, storedMatches: stored, storeChars: liveSize, writesPerEvent: s.map((x) => x.writes.length), writeMs: { median: med(writes), max: mx(writes) }, tapToSavedMs: { median: med(s.map((x) => x.tapToSaved)), max: mx(s.map((x) => x.tapToSaved)) }, longestTaskMs: mx(s.map((x) => x.longest)) };
    out.push(row);
    console.log(JSON.stringify(row));
    await ctx.close();
  }
}
writeFileSync(`${S}/persist/results/latency-${process.argv[3] ?? "p0"}.json`, JSON.stringify(out, null, 1));
await browser.close();
