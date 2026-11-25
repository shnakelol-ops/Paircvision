// Renders HT/FT Snapshot PDFs of several matches through the running app (real Chromium
// fonts) and records every fillText on the Shot Profile canvases with its real bounding box.
// Usage: node render-rd.mjs <baseUrl> <outDir>
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const D = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad/audit390";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.addInitScript(() => {
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y, maxW) {
    const m = this.measureText(String(t));
    const w = maxW !== undefined ? Math.min(m.width, maxW) : m.width;
    const left = this.textAlign === "center" ? x - w / 2 : this.textAlign === "right" || this.textAlign === "end" ? x - w : x;
    const top = y - m.actualBoundingBoxAscent, bottom = y + m.actualBoundingBoxDescent;
    (this.canvas.__t ??= []).push({ t: String(t), left, right: left + w, top, bottom, font: this.font, squeezed: maxW !== undefined && m.width > maxW + 0.5, natural: m.width });
    return orig.call(this, t, x, y, maxW);
  };
  const td = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...a) { (window.__pages ??= []).push(this.__t ?? []); return td.apply(this, a); };
});
const page = await ctx.newPage();
await page.goto(`${BASE}/pro-tagger`);
const result = {};
for (const id of ["S", "B", "L"]) {
  let m = JSON.parse(readFileSync(`${D}/match-${id}.json`, "utf8")); if (Array.isArray(m)) m = m[0];
  for (const mode of ["HALF_TIME_SNAPSHOT", "FULL_TIME_SNAPSHOT"]) {
    await page.evaluate(() => { window.__pages = []; });
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await page.evaluate(async ({ m, mode }) => {
      const adapter = await import("/src/pro-tagger/pro-tagger-review-adapter.ts");
      const pdfMod = await import("/src/stats/reviewPdfExport.ts");
      await pdfMod.exportSnapshotPdf(adapter.proTaggerMatchToSnapshotInput(m, mode));
    }, { m, mode });
    await (await dl).saveAs(`${OUT}/${id}-${mode.slice(0, 2)}.pdf`);
    const pages = await page.evaluate(() => window.__pages);
    result[`${id} ${mode}`] = pages.filter((p) => p.some((x) => /Shot Profile$/.test(x.t)));
  }
}
writeFileSync(`${OUT}/text-boxes.json`, JSON.stringify(result));
await browser.close();
