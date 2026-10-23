// run-legacy-import.mjs — historical (pre-owner / pre-TURNOVER_LOST) Event Stats
// data through the REAL Options → Import Match JSON flow, then PDF exports.
//
//   node run-legacy-import.mjs <sourceMatchState.json> <outDir> [baseUrl]
//
// The legacy file is derived from a match the app itself saved, transformed to
// the older storage shape the current code documents:
//   - restarts: always KICKOUT_WON, teamSide = the team that won the ball, no
//     restartOwner (ProTaggerLiveScreen.turnoverKickoutCounts.test.ts "legacy-
//     shaped data"; restartMetrics.ts "pre-V1.2 events")
//   - turnovers: no TURNOVER_LOST — the opposition's win is TURNOVER_WON with
//     teamSide "OPP" (computeProTaggerCounts: "legacy matches, which never
//     contain TURNOVER_LOST at all"); player tag removed, because which squad
//     the legacy picker used for that row is not documented.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CHROME } from "./ui-driver.mjs";

const [srcPath, outDir, baseUrl = "http://localhost:5199"] = process.argv.slice(2);
const src = JSON.parse(readFileSync(srcPath, "utf8"))[0];
mkdirSync(`${outDir}/pdf`, { recursive: true });
mkdirSync(`${outDir}/pdf-text`, { recursive: true });
mkdirSync(`${outDir}/state`, { recursive: true });

const legacyEvents = src.events.map((e) => {
  const out = { ...e };
  delete out.restartOwner;
  if (e.kind === "KICKOUT_CONCEDED") {
    const winner = e.teamSide === "FOR" ? "OPP" : "FOR";
    Object.assign(out, { kind: "KICKOUT_WON", type: "KICKOUT_WON", teamSide: winner, team: winner === "FOR" ? "HOME" : "AWAY" });
  }
  if (e.kind === "TURNOVER_LOST") {
    Object.assign(out, { kind: "TURNOVER_WON", type: "TURNOVER_WON", teamSide: "OPP", team: "AWAY" });
    delete out.playerId; delete out.playerName; delete out.playerNumber; delete out.squadId;
  }
  return out;
});
const legacy = { ...src, id: `${src.id}-legacy`, homeTeamName: `${src.homeTeamName}`, events: legacyEvents, eventCount: legacyEvents.length };
const legacyFile = `${outDir}/state/legacy-import.json`;
writeFileSync(legacyFile, JSON.stringify(legacy, null, 1));

const CAPTURE = () => {
  const texts = new WeakMap();
  const push = (c, r) => { let a = texts.get(c); if (!a) { a = []; texts.set(c, a); } a.push(r); };
  const P = CanvasRenderingContext2D.prototype;
  const orig = P.fillText;
  P.fillText = function (t, x, y) {
    try { const tr = this.getTransform(); push(this.canvas, { t: String(t), x: +(tr.a * x + tr.e).toFixed(1), y: +(tr.d * y + tr.f).toFixed(1), w: this.measureText(String(t)).width, font: this.font, align: this.textAlign, base: this.textBaseline }); } catch { /* ignore */ }
    return orig.apply(this, arguments);
  };
  window.__pdfPages = [];
  const o = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...a) { window.__pdfPages.push({ w: this.width, h: this.height, texts: texts.get(this) ?? [] }); return o.apply(this, a); };
};

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, acceptDownloads: true });
await context.addInitScript(CAPTURE);
const page = await context.newPage();
await page.goto(`${baseUrl}/pro-tagger`);
await page.getByRole("button", { name: "Options", exact: true }).click();
await page.getByText("Import Match JSON").first().click();
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Choose file…" }).click()]);
await chooser.setFiles(legacyFile);
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/state/legacy-review.png` });

async function exportPdf(buttonName, label) {
  await page.evaluate(() => { window.__pdfPages = []; });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.getByRole("button", { name: buttonName, exact: true }).click()]);
  await download.saveAs(`${outDir}/pdf/L-${label}.pdf`);
  const pages = (await page.evaluate(() => window.__pdfPages)).filter((p) => p.w >= 1000);
  writeFileSync(`${outDir}/pdf-text/L-${label}.json`, JSON.stringify({ pages }));
  console.log(`exported ${label}: ${pages.length} pages`);
}
await exportPdf("HT Snapshot PDF", "HT-snapshot-legacy");
await exportPdf("FT Snapshot PDF", "FT-snapshot-legacy");
await exportPdf("Full Review PDF", "FullReview-legacy");
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pitchflow_pro_tagger_matches_v1") || "[]"));
writeFileSync(`${outDir}/state/legacy-stored.json`, JSON.stringify(stored, null, 1));
await browser.close();
