// Read-only: confirms the N-1 geometry verdicts by tapping in the real app (saved match B).
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const store = JSON.parse(readFileSync(`${S}/runs-release/B/state/before-review-ops.json`, "utf8"));
const geo = JSON.parse(readFileSync(`${S}/n1-geometry.json`, "utf8"));
const CAT = { ALL: "ALL", SCORES: "SCORES", SHOTS: "SHOTS", WIDES: "WIDES", TURNOVERS: "T/O", KICKOUTS: "K/O", FREES: "FREES" };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const page = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
await page.goto("http://localhost:5199/pro-tagger");
await page.evaluate((v) => localStorage.setItem("pitchflow_pro_tagger_matches_v1", JSON.stringify(v)), store);
await page.reload();
await page.getByText("Saved Matches").click();
await page.getByRole("button", { name: "Review match", exact: true }).first().click();
await page.getByRole("button", { name: /Event Map/ }).first().click();
await page.waitForTimeout(1000);
const chip = async (name, nth) => name === "ALL" ? page.getByRole("button", { name: "ALL", exact: true }).nth(nth).click() : page.getByRole("button", { name, exact: true }).first().click();
async function setView(v) { await chip(v.half, 0); await chip(v.team, 1); await chip(CAT[v.category], 2); await page.waitForTimeout(350); }
async function tapAt(t, dx, dy) {
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(box.x + t.screen.x + dx, box.y + (t.screen.y - 101) + dy);
  await page.waitForTimeout(250);
  const d = await page.evaluate(() => { const s = document.body.innerText; const i = s.search(/EVENT DETAIL/i); if (i < 0) return null; const seg = s.slice(i, i + 300); const g = (l) => (seg.match(new RegExp(`${l}\\s*\\n\\s*([^\\n]+)`, "i")) || [])[1] ?? null; return { type: g("TYPE"), half: g("HALF"), time: g("TIME") }; });
  if (d) await page.getByRole("button", { name: "Close" }).first().click().catch(() => {});
  return d;
}
const out = [];
for (const t of geo) {
  const dotViews = t.views.filter((v) => v.dotFree > 0).sort((a, b) => b.dotFree - a.dotFree);
  const anyViews = t.views.filter((v) => v.tapAreaFree > 0).sort((a, b) => b.tapAreaFree - a.tapAreaFree);
  const best = dotViews[0] ?? anyViews[0] ?? null;
  const rec = { time: t.time, half: t.half, kind: t.kind, model: dotViews.length ? "dot-selectable" : anyViews.length ? "edge-only" : "never" };
  if (best) { await setView(best); const o = await tapAt(t, best.best.dx, best.best.dy); rec.bestTap = { view: `${best.half}/${best.team}/${best.category}`, dx: best.best.dx, dy: best.best.dy, onDot: best.best.onDot, opened: o, ok: o?.time === t.time && o?.half === t.half }; }
  // Dot-centre tap in the narrowest view (own half + a team filter + own category) — what a coach would try.
  const narrow = t.views.filter((v) => v.half !== "ALL" && v.team !== "ALL" && v.category !== "ALL").sort((a, b) => a.drawn - b.drawn)[0] ?? t.views[0];
  await setView(narrow); const c = await tapAt(t, 0, 0);
  rec.centreTapNarrowest = { view: `${narrow.half}/${narrow.team}/${narrow.category}`, drawn: narrow.drawn, opened: c, ok: c?.time === t.time && c?.half === t.half, predictedCover: narrow.laterNearest[0] ?? null };
  out.push(rec); console.log(JSON.stringify(rec));
}
writeFileSync(`${S}/n1-verify.json`, JSON.stringify(out, null, 1));
await browser.close();
