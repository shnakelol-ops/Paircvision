// N-1 repair proof in the real app. Usage: node n1-fix-e2e.mjs <baseUrl> <label> [device]
// Match B (release audit) as captured; every check is read from the real UI and storage.
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const [BASE, LABEL, DEVICE] = process.argv.slice(2);
const KEY = "pitchflow_pro_tagger_matches_v1";
const store = JSON.parse(readFileSync(`${S}/runs-release/B/state/before-review-ops.json`, "utf8"));
const geo = JSON.parse(readFileSync(`${S}/n1-geometry.json`, "utf8"));
const CAT = { ALL: "ALL", SCORES: "SCORES", SHOTS: "SHOTS", WIDES: "WIDES", TURNOVERS: "T/O", KICKOUTS: "K/O", FREES: "FREES" };
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const touch = !!DEVICE;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const ctx = await browser.newContext(DEVICE ? { ...devices[DEVICE] } : { viewport: { width: 430, height: 932 } });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const out = { label: LABEL, device: DEVICE ?? "desktop 430x932", targets: [], filters: [], checks: {} };

async function load(st) {
  await page.goto(`${BASE}/pro-tagger`);
  await page.evaluate(({ k, v }) => localStorage.setItem(k, JSON.stringify(v)), { k: KEY, v: st });
  await page.reload();
  await page.getByText("Saved Matches").click();
  await page.getByRole("button", { name: "Review match", exact: true }).first().click();
  await page.getByRole("button", { name: /Event Map/ }).first().click();
  await page.waitForTimeout(900);
}
const press = async (loc) => (touch ? loc.tap() : loc.click());
const chip = async (name, nth) => press(name === "ALL" ? page.getByRole("button", { name: "ALL", exact: true }).nth(nth) : page.getByRole("button", { name, exact: true }).first());
async function setView(half, team, category) { await chip(half, 0); await chip(team, 1); await chip(CAT[category], 2); await page.waitForTimeout(300); }
async function tapPitch(nx, ny, dx = 0, dy = 0) {
  const box = await page.locator("canvas").first().boundingBox();
  const m = Math.min(24, Math.max(8, Math.min(box.width, box.height) * 0.03));
  const scale = Math.min((box.width - 2 * m) / 160, (box.height - 2 * m) / 100);
  const offX = (box.width - 160 * scale) / 2, offY = (box.height - 100 * scale) / 2;
  const x = box.x + offX + nx * 160 * scale + dx, y = box.y + offY + ny * 100 * scale + dy;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await page.waitForTimeout(250);
}
const panel = () => page.evaluate(() => {
  const t = document.body.innerText; const i = t.search(/EVENT DETAIL/i); if (i < 0) return null;
  const seg = t.slice(i, i + 1500);
  const g = (l) => (seg.match(new RegExp(`\\n${l}\\s*\\n\\s*([^\\n]+)`, "i")) || [])[1] ?? null;
  const items = Array.from(document.querySelectorAll('[aria-label="Events at this spot"] button')).map((b) => ({ label: b.getAttribute("aria-label"), current: b.getAttribute("aria-current") === "true" }));
  return { type: g("Type"), half: g("Half"), time: g("Time"), items, confirmPending: !!document.querySelector('[aria-label="Confirm delete"]') };
});
const closePanel = async () => { const c = page.getByRole("button", { name: "Close", exact: true }); if (await c.count()) await press(c.first()); await page.waitForTimeout(150); };
const isTarget = (p, t) => p && p.half === t.half && p.time === t.time;

await load(store);
const ONLY = process.env.ONLY;
if (ONLY !== "iso") {
// 1. The 26 previously inaccessible events: tap the dot centre in the narrowest view, then pick from the list.
for (const t of geo) {
  const views = t.views.filter((v) => v.half !== "ALL" && v.team !== "ALL" && v.category !== "ALL").sort((a, b) => a.drawn - b.drawn);
  const v = views[0] ?? t.views.sort((a, b) => a.drawn - b.drawn)[0];
  await setView(v.half, v.team, v.category);
  await tapPitch(t.nx, t.ny);
  const first = await panel();
  const rec = { half: t.half, time: t.time, kind: t.kind, view: `${v.half}/${v.team}/${v.category}`, opened: first && `${first.type} ${first.time}`, directlyOpened: isTarget(first, t) };
  if (!rec.directlyOpened && first) {
    const item = page.locator('[aria-label="Events at this spot"] button').filter({ hasText: t.time });
    const n = await item.count();
    rec.listedAt = n;
    rec.listSize = first.items.length;
    if (n) {
      // If two listed events share a time, pick the one whose type matches.
      let pick = item.first();
      for (let i = 0; i < n; i++) { const lab = await item.nth(i).getAttribute("aria-label"); if (lab.toLowerCase().includes(t.kind.split("_")[0].toLowerCase().slice(0, 4))) { pick = item.nth(i); break; } }
      await press(pick); await page.waitForTimeout(200);
      const after = await panel();
      rec.viaList = isTarget(after, t);
      rec.shownAfterPick = after && `${after.type} ${after.half} ${after.time}`;
      rec.currentMarked = after?.items.find((x) => x.current)?.label ?? null;
    }
  }
  rec.reachable = rec.directlyOpened || !!rec.viaList;
  out.targets.push(rec);
  await closePanel();
}

// 2. Filters: every list item belongs to the active view (half/category) — sample all 26 views used above.
for (const t of geo.slice(0, 26)) {
  for (const v of t.views.filter((x) => x.category !== "ALL").slice(0, 2)) {
    await setView(v.half, v.team, v.category);
    await tapPitch(t.nx, t.ny);
    const p = await panel();
    if (!p) continue;
    const bad = p.items.filter((it) => (v.half === "H1" && / 2H$|2H /.test(it.label)) || (v.half === "H2" && / 1H$|1H /.test(it.label)));
    const typeOk = p.items.every((it) => {
      const l = it.label.toUpperCase();
      return ({ SCORES: /GOAL|POINT|2PT|TWO|45/, SHOTS: /SHOT/, WIDES: /WIDE/, TURNOVERS: /TURNOVER/, KICKOUTS: /KICKOUT|PUCKOUT/, FREES: /FREE|GOAL|POINT|WIDE|TWO|2PT/ })[v.category].test(l);
    });
    out.filters.push({ view: `${v.half}/${v.team}/${v.category}`, items: p.items.length, halfMismatch: bad.length, allItemsInCategory: typeOk });
    await closePanel();
  }
}
const footerCounts = {};
for (const half of ["ALL", "H1", "H2"]) for (const team of ["ALL", "FOR", "OPP"]) for (const cat of Object.keys(CAT)) {
  await setView(half, team, cat);
  footerCounts[`${half}/${team}/${cat}`] = await page.evaluate(() => (document.body.innerText.match(/(\d+) events?\s*$/m) || [])[1] ?? null);
}
out.footerCounts = footerCounts;

// 3. Delete safety: arm Delete on the shown event, then switch to another listed event → confirm must reset.
const card = geo.find((t) => t.kind === "YELLOW_CARD");
await setView("H1", "FOR", "ALL"); await tapPitch(card.nx, card.ny);
let p = await panel();
await press(page.getByRole("button", { name: "Delete event" })); await page.waitForTimeout(150);
const armed = (await panel()).confirmPending;
const other = page.locator('[aria-label="Events at this spot"] button:not([aria-current="true"])').first();
await press(other); await page.waitForTimeout(150);
const afterSwitch = await panel();
out.checks.deleteConfirmResetsOnSwitch = { armedBefore: armed, confirmPendingAfterSwitch: afterSwitch.confirmPending, pass: armed && !afterSwitch.confirmPending };
await closePanel();

// 4. Delete the yellow card (identical coordinates with its free) through the list.
const cardEvent = store[0].events.find((e) => e.kind === "YELLOW_CARD" && fmt(e.matchClockSeconds) === card.time);
const freeTwin = store[0].events.find((e) => e.id !== cardEvent.id && e.nx === cardEvent.nx && e.ny === cardEvent.ny);
await setView("H1", "FOR", "ALL"); await tapPitch(card.nx, card.ny);
p = await panel();
if (!isTarget(p, card)) await press(page.locator('[aria-label="Events at this spot"] button').filter({ hasText: card.time }).filter({ hasText: /yellow/i }).first());
await page.waitForTimeout(150);
const shownBeforeDelete = await panel();
await press(page.getByRole("button", { name: "Delete event" })); await press(page.getByRole("button", { name: "Confirm delete" }));
await page.waitForTimeout(300);
let stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k))[0].events, KEY);
out.checks.deleteIdenticalCoordinates = { identicalTwin: freeTwin ? { kind: freeTwin.kind, time: fmt(freeTwin.matchClockSeconds) } : null, shown: shownBeforeDelete && `${shownBeforeDelete.type} ${shownBeforeDelete.time}`,
  cardGone: !stored.some((e) => e.id === cardEvent.id), twinKept: !!freeTwin && stored.some((e) => e.id === freeTwin.id), countAfter: stored.length, countBefore: store[0].events.length,
  pass: !stored.some((e) => e.id === cardEvent.id) && !!freeTwin && stored.some((e) => e.id === freeTwin.id) && stored.length === store[0].events.length - 1 };

// 5. Edit the covered turnover (1H 14:00, fully covered by the 28:43 turnover) through the list.
const tov = geo.find((t) => t.half === "1H" && t.time === "14:00");
const tovEvent = store[0].events.find((e) => e.period === "1H" && fmt(e.matchClockSeconds) === "14:00" && e.kind === "TURNOVER_WON");
const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k))[0].events, KEY);
await setView("H1", "FOR", "TURNOVERS"); await tapPitch(tov.nx, tov.ny);
p = await panel();
const coverShown = p && `${p.type} ${p.time}`;
if (!isTarget(p, tov)) await press(page.locator('[aria-label="Events at this spot"] button').filter({ hasText: "14:00" }).first());
await page.waitForTimeout(150);
await press(page.getByRole("button", { name: "Edit event" }));
await page.locator("select").first().selectOption("TURNOVER_LOST");
await press(page.getByRole("button", { name: "Save", exact: true }));
await page.waitForTimeout(300);
stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k))[0].events, KEY);
const changed = stored.filter((e, i) => JSON.stringify(e) !== JSON.stringify(before.find((b) => b.id === e.id)));
out.checks.editCoveredEvent = { firstOpened: coverShown, changedIds: changed.map((e) => ({ id: e.id === tovEvent.id ? "TARGET" : e.id, kind: e.kind, time: fmt(e.matchClockSeconds) })), pass: changed.length === 1 && changed[0].id === tovEvent.id && changed[0].kind === "TURNOVER_LOST" };
await closePanel();

}
// 6. Isolated markers behave as before: a sparse match (4 events far apart) shows no list.
const sparse = structuredClone(store);
// Greedy pick of 6 events at least 0.25 pitch apart (well beyond the 34 px reach on any screen here).
sparse[0].events = [];
for (const e of store[0].events) if (sparse[0].events.length < 6 && sparse[0].events.every((x) => Math.hypot(x.nx - e.nx, (x.ny - e.ny) * 0.625) > 0.25)) sparse[0].events.push(e);
sparse[0].eventCount = sparse[0].events.length;
await load(sparse);
const iso = [];
for (const e of sparse[0].events) {
  await setView("ALL", "ALL", "ALL"); await tapPitch(e.nx, e.ny);
  const q = await panel();
  iso.push({ kind: e.kind, time: fmt(e.matchClockSeconds), opened: q && q.time === fmt(e.matchClockSeconds), list: q?.items.length ?? null });
  await closePanel();
}
out.checks.isolatedMarkers = { iso, pass: iso.every((x) => x.opened && x.list === 0) };
if (ONLY === "iso") {
  await load(store);
  const fc = {};
  for (const half of ["ALL", "H1", "H2"]) for (const team of ["ALL", "FOR", "OPP"]) for (const cat of Object.keys(CAT)) {
    await setView(half, team, cat);
    fc[`${half}/${team}/${cat}`] = await page.evaluate(() => (document.body.innerText.match(/(\d+) events?\s*$/m) || [])[1] ?? null);
  }
  out.footerCounts = fc;
}

await page.screenshot({ path: `${S}/dbg/n1-fix-${LABEL}-last.png` });
writeFileSync(`${S}/n1-fix-${LABEL}${ONLY ? "-" + ONLY : ""}.json`, JSON.stringify(out, null, 1));
const reach = out.targets.filter((t) => t.reachable).length;
console.log(LABEL, "reachable", reach, "/", out.targets.length, JSON.stringify(Object.fromEntries(Object.entries(out.checks).map(([k, v]) => [k, v.pass]))), "filters", out.filters.length, "bad", out.filters.filter((f) => f.halfMismatch || !f.allItemsInCategory).length);
await browser.close();
