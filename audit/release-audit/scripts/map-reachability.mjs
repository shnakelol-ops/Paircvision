// map-reachability.mjs — which saved events can a coach open on the Review Event Map?
//
//   node map-reachability.mjs <store.json> <out.json> [baseUrl]
//
// Loads a saved match into the real app, opens Review → Event Map and, for
// every half (H1/H2) × team (FOR/OPP) × category view, taps the centre of every
// event of that half (and 4 points 5 px around it). Each Event detail that opens
// is identified by half + time + type. An event is reachable if any tap in any
// view opens it. Read-only: nothing is edited.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const [storePath, outFile, baseUrl = "http://localhost:5199"] = process.argv.slice(2);
const store = JSON.parse(readFileSync(storePath, "utf8"));
const match = store[0];
const CHROME = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const CATS = { SCORES: ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"], SHOTS: ["SHOT"], WIDES: ["WIDE"], "T/O": ["TURNOVER_WON", "TURNOVER_LOST"], KO: ["KICKOUT_WON", "KICKOUT_CONCEDED"], FREES: ["FREE_WON", "FREE_CONCEDED", "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "WIDE"], ALL: null };
const koLabel = match.sport === "hurling" || match.sport === "camogie" ? "P/O" : "K/O";
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const keyOf = (half, time, type) => `${half}|${time}|${type}`;

const browser = await chromium.launch({ executablePath: CHROME });
const page = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
await page.goto(`${baseUrl}/pro-tagger`);
await page.evaluate((v) => localStorage.setItem("pitchflow_pro_tagger_matches_v1", JSON.stringify(v)), store);
await page.reload();
await page.getByText("Saved Matches").click();
await page.getByRole("button", { name: "Review match", exact: true }).first().click();
await page.getByRole("button", { name: /Event Map/ }).first().click();
await page.waitForTimeout(1000);

const typeLabelOf = new Map(); // filled from what the app shows
const opened = new Set();
let taps = 0;
const chip = async (name, nth) => {
  if (name === "ALL") await page.getByRole("button", { name: "ALL", exact: true }).nth(nth).click();
  else await page.getByRole("button", { name, exact: true }).first().click();
};
for (const half of ["1H", "2H"]) {
  for (const team of ["FOR", "OPP"]) {
    for (const [cat, kinds] of Object.entries(CATS)) {
      await chip(half === "1H" ? "H1" : "H2", 0); await chip(team, 1); await chip(cat === "KO" ? koLabel : cat, 2);
      await page.waitForTimeout(300);
      const box = await page.locator("canvas").first().boundingBox();
      const pitchW = box.width - 28, pitchH = pitchW / 1.6, left = box.x + 14, top = box.y + (box.height - pitchH) / 2;
      const candidates = match.events.filter((e) => e.period === half && (!kinds || kinds.includes(e.kind)));
      for (const e of candidates) {
        const x = left + e.nx * pitchW, y = top + e.ny * pitchH;
        for (const [dx, dy] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) {
          taps++;
          await page.mouse.click(x + dx, y + dy);
          await page.waitForTimeout(110);
          const detail = await page.evaluate(() => {
            const t = document.body.innerText;
            const i = t.search(/EVENT DETAIL/i);
            if (i < 0) return null;
            const seg = t.slice(i, i + 300);
            const get = (label) => (seg.match(new RegExp(`${label}\\s*\\n\\s*([^\\n]+)`, "i")) || [null, null])[1];
            return { type: get("TYPE"), half: get("HALF"), time: get("TIME") };
          });
          if (!detail) continue;
          opened.add(keyOf(detail.half, detail.time, detail.type));
          if (!typeLabelOf.has(e.kind) && detail.time === fmt(e.matchClockSeconds) && detail.half === half) typeLabelOf.set(e.kind, detail.type);
          await page.getByRole("button", { name: "Close" }).first().click().catch(() => {});
        }
      }
    }
  }
}
await browser.close();

// Map each stored event to the detail key it would show (type label learnt from the app).
const rows = match.events.map((e) => {
  const label = typeLabelOf.get(e.kind) ?? null;
  const reachable = label != null && opened.has(keyOf(e.period, fmt(e.matchClockSeconds), label));
  return { id: e.id, kind: e.kind, teamSide: e.teamSide, half: e.period, time: fmt(e.matchClockSeconds), reachable, labelKnown: label != null };
});
const byKind = {};
for (const r of rows) { const k = (byKind[r.kind] ??= { total: 0, reachable: 0 }); k.total++; if (r.reachable) k.reachable++; }
const summary = { events: rows.length, reachable: rows.filter((r) => r.reachable).length, taps, byKind };
writeFileSync(outFile, JSON.stringify({ summary, unreachable: rows.filter((r) => !r.reachable), rows }, null, 1));
console.log(JSON.stringify(summary));
