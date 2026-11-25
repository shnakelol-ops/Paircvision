// Renders the real Samsung match through the running app (Pixel 7 emulation):
// Intelligence cards (HT), Quick Review page 1, HT Snapshot PDF and Full Review PDF.
// Usage: node render-samsung.mjs <baseUrl> <outDir>
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const match = JSON.parse(readFileSync(`${S}/samsung/original.json`, "utf8"));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const ctx = await browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
await page.goto(`${BASE}/pro-tagger`);
await page.evaluate((m) => localStorage.setItem("pitchflow_pro_tagger_matches_v1", JSON.stringify([m])), match);

// 1. Intelligence cards — the app's own builder, as the HT Review uses it.
const cards = await page.evaluate(async (m) => {
  const { buildIntelligencePack } = await import("/src/stats/intelligencePack.ts");
  const { toEventStatsReportEvents } = await import("/src/pro-tagger/pro-tagger-review-adapter.ts");
  const pack = await buildIntelligencePack({
    stageLabel: "Half Time", homeTeamName: m.homeTeamName, awayTeamName: m.awayTeamName, venueLabel: m.venue, clockLabel: "Half Time",
    homeScore: { goals: 0, points: 6, total: 6 }, awayScore: { goals: 0, points: 5, total: 5 },
    events: toEventStatsReportEvents(m.events),
  });
  const toB64 = async (f) => { const b = new Uint8Array(await f.arrayBuffer()); let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
  return { restart: await toB64(pack.restartOutcomesCard), tf: await toB64(pack.turnoverFreeOutcomesCard), mi: await toB64(pack.matchIntelligenceCard) };
}, match);
for (const [k, v] of Object.entries(cards)) writeFileSync(`${OUT}/card-${k}.png`, Buffer.from(v, "base64"));

// 2. PDFs — the app's own exporters on the saved match.
async function pdf(fnName, mode, file) {
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.evaluate(async ({ m, fnName, mode }) => {
    const adapter = await import("/src/pro-tagger/pro-tagger-review-adapter.ts");
    const pdfMod = await import("/src/stats/reviewPdfExport.ts");
    if (mode) await pdfMod[fnName](adapter.proTaggerMatchToSnapshotInput(m, mode));
    else await pdfMod[fnName](adapter.proTaggerMatchToPdfInput(m));
  }, { m: match, fnName, mode });
  await (await dl).saveAs(`${OUT}/${file}`);
}
await pdf("exportSnapshotPdf", "HALF_TIME_SNAPSHOT", "HT-snapshot.pdf");
await pdf("exportReviewPdf", null, "FullReview.pdf");

// 3. Quick Review page 1 — resume the half-time match and open it.
await page.reload();
await page.getByText("Resume in-progress match").click().catch(() => {});
await page.waitForTimeout(800);
await page.getByRole("button", { name: "⋯ Options", exact: true }).click();
await page.getByRole("button", { name: "Quick Review", exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/quick-review-p1.png`, fullPage: true });
const qr = await page.evaluate(() => { const t = document.body.innerText; const i = t.indexOf("RESTARTS"); return t.slice(i, i + 400); });
writeFileSync(`${OUT}/quick-review-p1.txt`, qr);
console.log(qr);
await browser.close();
