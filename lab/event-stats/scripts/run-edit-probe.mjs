// run-edit-probe.mjs — Review → Event Map → Edit, on a COPY of the saved hurling
// match (Match C), through the real UI. Constructed test: the saved match the app
// wrote during the match C run is loaded into a fresh browser profile.
//
// Pass: the football-only type (TWO_POINTER) is NOT offered for a hurling point,
// and the stored event and scoreline are unchanged. If it is offered, the edit is
// made so the report shows its effect.
//
//   node run-edit-probe.mjs <runs/C/state/final.json> <outDir> [baseUrl]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { CHROME } from "./ui-driver.mjs";
const [statePath, outDir, baseUrl = "http://localhost:5199"] = process.argv.slice(2);
const store = readFileSync(statePath, "utf8");
const match = JSON.parse(store)[0];
const scoreRe = new RegExp(`${match.homeTeamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+-\\d+ \\(\\d+\\) v ${match.awayTeamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+-\\d+ \\(\\d+\\)`);
const target = match.events.find((e) => e.kind === "POINT" && e.teamSide === "FOR" && e.period === "2H");
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 430, height: 932 } });
await p.goto(`${baseUrl}/pro-tagger`);
await p.evaluate((s) => localStorage.setItem("pitchflow_pro_tagger_matches_v1", s), store);
await p.goto(`${baseUrl}/pro-tagger`);
await p.getByText("Saved Matches").click();
await p.getByRole("button", { name: "Review match" }).click();
const before = (await p.locator("body").innerText()).match(scoreRe)?.[0];
await p.getByRole("button", { name: /Event Map/ }).first().click();
await p.waitForTimeout(1000);
await p.getByRole("button", { name: "H2", exact: true }).click();
await p.getByRole("button", { name: "FOR", exact: true }).click();
await p.getByRole("button", { name: "SCORES", exact: true }).click();
await p.waitForTimeout(400);
const box = await p.locator("canvas").first().boundingBox();
const W = box.width - 28, H = W / 1.6, x = box.x + 14 + target.nx * W, y = box.y + (box.height - H) / 2 + target.ny * H;
await p.mouse.click(x, y);
await p.waitForTimeout(300);
await p.getByRole("button", { name: "Edit event" }).click();
const options = await p.locator("select").first().locator("option").allInnerTexts();
const values = await p.locator("select").first().evaluate((sel) => Array.from(sel.options).map((o) => o.value));
const twoPointerOffered = values.includes("TWO_POINTER");
if (twoPointerOffered) {
  await p.locator("select").first().selectOption("TWO_POINTER");
  await p.getByRole("button", { name: "Save", exact: true }).click();
} else {
  await p.getByRole("button", { name: "Cancel", exact: true }).first().click();
}
await p.waitForTimeout(300);
const close = p.getByRole("button", { name: "Close" });
if (await close.count()) await close.first().click();
await p.getByRole("button", { name: "← Review" }).click();
await p.waitForTimeout(300);
const after = (await p.locator("body").innerText()).match(scoreRe)?.[0];
const stored = JSON.parse(await p.evaluate(() => localStorage.getItem("pitchflow_pro_tagger_matches_v1")))[0].events.find((e) => e.id === target.id);
const unchanged = JSON.stringify(stored) === JSON.stringify(target);
const result = { target: { id: target.id, kind: target.kind, tags: target.tags, clock: target.matchClockSeconds }, typeOptionsOffered: options, twoPointerOffered,
  scorelineBefore: before, scorelineAfter: after, storedAfter: { kind: stored.kind, tags: stored.tags, teamSide: stored.teamSide }, storedUnchanged: unchanged,
  pass: !twoPointerOffered && unchanged && before != null && before === after };
writeFileSync(`${outDir}/edit-probe-hurling.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
await b.close();
