// Review Edit in the real app (Android emulation): a saved match is seeded
// with four events, then edited through Saved Matches → Review → Event Map →
// marker → Edit, exactly as a coach would. Usage: node probe-review.mjs <baseUrl> <label>
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { CHROME } from "./ui-driver.mjs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const LABEL = process.argv[3] ?? "run";
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const KEY = "pitchflow_pro_tagger_matches_v1";
const src = JSON.parse(readFileSync(`${S}/runs-r1b/A/state/final.json`, "utf8")).reduce((a, x) => (x.events?.length ?? 0) > (a.events?.length ?? 0) ? x : a);
const home = src.homeSquad.id, away = src.awaySquad.id;
const p2 = src.homeSquadLiveState.find((p) => p.number === 2);
const base = { half: 1, period: "1H", segment: 1, createdAt: 1, team: "HOME", teamSide: "FOR" };
const mk = (id, kind, clock, nx, ny, tags, extra = {}) => ({ ...base, id, kind, type: kind, tags, nx, ny, x: nx, y: ny, timestamp: clock, matchClockSeconds: clock, ...extra });
const EVENTS = [
  mk("shot", "SHOT", 60, 0.82, 0.30, ["BLOCK/SAVE"]),
  mk("turnover", "TURNOVER_LOST", 120, 0.50, 0.50, ["HP ERROR"]),
  mk("kickout", "KICKOUT_WON", 180, 0.25, 0.75, ["CLEAN"], { restartOwner: "FOR", squadId: home, playerId: p2.id, playerNumber: 2, playerName: p2.name }),
  mk("fortyfive", "FORTY_FIVE_WON", 240, 0.70, 0.85, ["WON"], { restartOwner: "FOR" }),
];
const MATCH = { ...src, id: "review-probe", homeTeamName: "Ballyboden", awayTeamName: "Na Fianna", events: EVENTS, eventCount: EVENTS.length, restoreContext: { ...src.restoreContext, matchState: "FULL_TIME" } };

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage(); page.setDefaultTimeout(10000);
const alerts = [];
page.on("dialog", (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
await page.goto(`${BASE}/pro-tagger`);
await page.evaluate(({ k, v }) => localStorage.setItem(k, JSON.stringify([v])), { k: KEY, v: MATCH });
await page.reload();
await page.getByText("Saved Matches").first().click();
await page.getByRole("button", { name: /Review/ }).first().click();
await page.getByRole("button", { name: "Event Map" }).first().click();
await page.waitForTimeout(600);

const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k))[0].events, KEY);
async function openMarker(target) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const pitchW = box.width - 28; const pitchH = pitchW / 1.6;
  const left = box.x + 14; const top = box.y + (box.height - pitchH) / 2;
  const x = left + target.nx * pitchW; const y = top + target.ny * pitchH;
  const offsets = [[0, 0]];
  for (const r of [2, 4, 6, 9]) for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) offsets.push([ux * r, uy * r]);
  const mm = String(Math.floor(target.matchClockSeconds / 60)).padStart(2, "0"), ss = String(target.matchClockSeconds % 60).padStart(2, "0");
  for (const [dx, dy] of offsets) {
    await page.mouse.click(x + dx, y + dy);
    await page.waitForTimeout(200);
    if (!(await page.getByText("Event detail").count())) continue;
    if ((await page.evaluate(() => document.body.innerText)).includes(`${mm}:${ss}`)) return true;
    await page.getByRole("button", { name: "Close" }).first().click();
  }
  return false;
}
async function editTo(target, kind, { clearPlayer = false } = {}) {
  if (!(await openMarker(target))) return { error: "marker not found" };
  await page.getByRole("button", { name: "Edit event" }).click();
  const options = await page.locator("select").first().evaluate((s) => Array.from(s.options).map((o) => o.value));
  let selected = null;
  if (options.includes(kind)) { await page.locator("select").first().selectOption(kind); selected = kind; }
  if (clearPlayer) {
    await page.getByPlaceholder("—").first().fill("");
    await page.getByPlaceholder("—").nth(1).fill("");
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(250);
  const formError = await page.evaluate(() => (Array.from(document.querySelectorAll("span")).find((s) => /can't be changed|Clear the player|isn't recorded|Only a score/.test(s.textContent)) || {}).textContent ?? null);
  const stillEditing = (await page.getByText("Edit event").count()) > 0;
  const after = (await stored()).find((e) => e.id === target.id);
  if (await page.getByRole("button", { name: "Close" }).count()) await page.getByRole("button", { name: "Close" }).first().click();
  if (stillEditing && (await page.getByRole("button", { name: "Cancel" }).count())) await page.getByRole("button", { name: "Cancel" }).first().click().catch(() => {});
  if (await page.getByRole("button", { name: "Close" }).count()) await page.getByRole("button", { name: "Close" }).first().click().catch(() => {});
  return { optionsOffered: options, requested: kind, selectable: selected !== null, formError, stored: after && { kind: after.kind, teamSide: after.teamSide, tags: after.tags, player: after.playerNumber ?? null, squadId: after.squadId === home ? "home" : after.squadId === away ? "away" : after.squadId ?? null } };
}

const out = {};
out.shotToPoint = await editTo(EVENTS[0], "POINT");
out.turnoverToPoint = await editTo(EVENTS[1], "POINT");
out.kickoutFlipWithPlayer = await editTo(EVENTS[2], "KICKOUT_CONCEDED");
out.kickoutFlipPlayerCleared = await editTo(EVENTS[2], "KICKOUT_CONCEDED", { clearPlayer: true });
out.fortyFiveToConceded = await editTo(EVENTS[3], "FORTY_FIVE_CONCEDED");
// Failed persistence: storage writes fail while a valid edit (point → wide) is saved.
await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("quota", "QuotaExceededError"); }; });
const beforeFail = (await stored()).find((e) => e.id === "shot");
out.editWhileStorageFull = await editTo({ ...EVENTS[0] }, "WIDE");
out.editWhileStorageFull.alerts = alerts.slice();
out.editWhileStorageFull.storedUnchanged = JSON.stringify(beforeFail) === JSON.stringify((await stored()).find((e) => e.id === "shot"));
if (await openMarker(EVENTS[0])) {
  out.editWhileStorageFull.reviewShowsType = await page.evaluate(() => (document.body.innerText.match(/Type\s*\n?\s*([A-Z_ /0-9]+)/) || [null, null])[1]);
}
await page.screenshot({ path: `${S}/persist/results/review-${LABEL}.png` });
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
writeFileSync(`${S}/persist/results/review-${LABEL}.json`, JSON.stringify(out, null, 1));
await browser.close();
