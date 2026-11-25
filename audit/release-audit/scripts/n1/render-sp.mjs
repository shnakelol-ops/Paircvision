// Renders the HT and FT Snapshot PDFs of the real Samsung match through the running app.
// Usage: node render-sp.mjs <baseUrl> <outDir>
import { chromium, devices } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const S = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad";
const match = JSON.parse(readFileSync(`${S}/samsung/original.json`, "utf8"));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const ctx = await browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
const page = await ctx.newPage();
await page.goto(`${BASE}/pro-tagger`);
for (const [mode, file] of [["HALF_TIME_SNAPSHOT", "HT-snapshot.pdf"], ["FULL_TIME_SNAPSHOT", "FT-snapshot.pdf"]]) {
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.evaluate(async ({ m, mode }) => {
    const adapter = await import("/src/pro-tagger/pro-tagger-review-adapter.ts");
    const pdfMod = await import("/src/stats/reviewPdfExport.ts");
    await pdfMod.exportSnapshotPdf(adapter.proTaggerMatchToSnapshotInput(m, mode));
  }, { m: match, mode });
  await (await dl).saveAs(`${OUT}/${file}`);
}
await browser.close();
