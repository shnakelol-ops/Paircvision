// run-match.mjs — full Event Stats lifecycle through the REAL application UI.
//
//   node run-match.mjs <fixture.json> <outDir> [baseUrl]
//
// Create match → squads → tag 1H (UI taps) → HT: Quick Review + HT Snapshot PDF
// → 2H → FT: Quick Review + FT Snapshot + Full Review PDF → Save → review
// edits/deletes on the Event Map (if scripted) → reload app → Saved Matches →
// Review → regenerate all PDFs.
//
// PDFs are the real files the app downloads. The app rasterises every PDF page
// to a JPEG, so PDFs have no text layer: an init script records every
// fillText() the app performs on each page canvas (text, position, font,
// measured width) at the moment the page is rasterised. That gives a text
// ledger per PDF page that is compared against the reference, alongside
// pdftoppm renders of the actual PDF files for visual inspection.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CHROME, tagEvent, readOwnerToggle } from "./ui-driver.mjs";

const [fixturePath, outDir, baseUrl = "http://localhost:5199"] = process.argv.slice(2);
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const sportKey = fx.sport === "hurling" ? "hurling" : "football";
mkdirSync(`${outDir}/pdf`, { recursive: true });
mkdirSync(`${outDir}/pdf-text`, { recursive: true });
mkdirSync(`${outDir}/screens`, { recursive: true });
mkdirSync(`${outDir}/state`, { recursive: true });

const log = [];
const note = (msg, extra) => {
  const line = { t: new Date().toISOString(), msg, ...(extra ? { extra } : {}) };
  log.push(line);
  if (msg === "CONSOLE ERROR" && /shorthand and non-shorthand/.test(extra?.text ?? "")) return; // React dev warning — logged, not echoed
  console.log(`[${fx.matchId}] ${msg}`, extra ? JSON.stringify(extra) : "");
};

// ── Canvas text capture (installed before any app code runs) ────────────────
const CAPTURE = () => {
  const texts = new WeakMap();
  const push = (canvas, rec) => { let a = texts.get(canvas); if (!a) { a = []; texts.set(canvas, a); } a.push(rec); };
  const P = CanvasRenderingContext2D.prototype;
  for (const fn of ["fillText", "strokeText"]) {
    const orig = P[fn];
    P[fn] = function (t, x, y, maxWidth) {
      try {
        const m = this.measureText(String(t));
        const tr = this.getTransform();
        push(this.canvas, {
          t: String(t), fn, x: +(tr.a * x + tr.c * y + tr.e).toFixed(1), y: +(tr.b * x + tr.d * y + tr.f).toFixed(1),
          w: +(m.width * Math.abs(tr.a || 1)).toFixed(1), font: this.font, align: this.textAlign, base: this.textBaseline,
          fill: String(this.fillStyle), maxWidth: maxWidth ?? null,
        });
      } catch { /* capture must never break rendering */ }
      return orig.apply(this, arguments);
    };
  }
  const origDraw = P.drawImage;
  P.drawImage = function (src, ...rest) {
    try {
      if (src instanceof HTMLCanvasElement && texts.get(src)) {
        for (const r of texts.get(src)) push(this.canvas, { ...r, nested: true });
      }
    } catch { /* ignore */ }
    return origDraw.call(this, src, ...rest);
  };
  window.__pdfPages = [];
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    try { window.__pdfPages.push({ w: this.width, h: this.height, texts: texts.get(this) ?? [] }); } catch { /* ignore */ }
    return origToDataURL.apply(this, args);
  };
};

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, acceptDownloads: true });
await context.addInitScript(CAPTURE);
const page = await context.newPage();
page.on("pageerror", (e) => { if (!/ServiceWorker/.test(e.message)) note("PAGE ERROR", { message: e.message }); });
page.on("console", (m) => { if (m.type() === "error" && !/ServiceWorker|sw\.js/.test(m.text())) note("CONSOLE ERROR", { text: m.text().slice(0, 300) }); });
await page.clock.install({ time: new Date("2026-10-23T14:00:00Z") });

const shot = (name) => page.screenshot({ path: `${outDir}/screens/${name}.png` });

async function readClock() {
  const txt = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span")).map((s) => s.textContent.trim());
    return spans.find((s) => /^\d{2}:\d{2}$/.test(s)) ?? null;
  });
  if (!txt) throw new Error("clock not found");
  const [m, s] = txt.split(":").map(Number);
  return m * 60 + s;
}

async function advanceTo(target) {
  // The app's displayed clock (and the clock it stamps on events) is updated by
  // a 500 ms interval, so step in 100 ms increments until it reads the target.
  let now = await readClock();
  if (target <= now) return;
  if (target - now > 2) await page.clock.runFor((target - now - 2) * 1000);
  for (let i = 0; i < 60 && (now = await readClock()) < target; i++) await page.clock.runFor(100);
  if (now !== target) note("clock drift", { target, after: now });
}

async function dumpStore(label) {
  const store = await page.evaluate(() => ({
    pro: JSON.parse(localStorage.getItem("pitchflow_pro_tagger_matches_v1") || "[]"),
  }));
  writeFileSync(`${outDir}/state/${label}.json`, JSON.stringify(store.pro, null, 1));
  return store.pro;
}

async function clickByText(text, opts = {}) {
  await page.getByRole("button", { name: text, exact: true, ...opts }).first().click();
}

async function openOptions() { await clickByText("⋯ Options"); await page.waitForTimeout(150); }
async function closeOptions() { const c = page.getByRole("button", { name: "Close", exact: true }); if (await c.count()) await c.first().click(); }

/** Triggers a PDF export button and captures the real downloaded file + per-page text. */
async function exportPdf(buttonName, label) {
  await page.evaluate(() => { window.__pdfPages = []; });
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: buttonName, exact: true }).first().click();
  // Export code may await timers — keep the (frozen at HT/FT) fake clock moving.
  let done = false; let download;
  dl.then((d) => { done = true; download = d; });
  for (let i = 0; i < 600 && !done; i++) { await page.clock.runFor(200).catch(() => {}); await page.waitForTimeout(50); }
  if (!done) throw new Error(`no download for ${label}`);
  const file = `${outDir}/pdf/${fx.matchId}-${label}.pdf`;
  await download.saveAs(file);
  const pages = await page.evaluate(() => window.__pdfPages);
  // Keep only page-sized canvases (the rasterised PDF pages).
  const pdfPages = pages.filter((p) => p.w >= 1000 && p.h >= 500);
  writeFileSync(`${outDir}/pdf-text/${fx.matchId}-${label}.json`, JSON.stringify({ suggestedFilename: download.suggestedFilename(), pages: pdfPages, otherCanvases: pages.length - pdfPages.length }, null, 0));
  note(`exported ${label}`, { file, suggested: download.suggestedFilename(), pages: pdfPages.length });
  return file;
}

/** Opens Quick Review and captures all of its pages (text + screenshots). */
async function captureQuickReview(label) {
  await openOptions();
  await clickByText("Quick Review");
  await page.waitForTimeout(400);
  const data = await page.evaluate(() => {
    // Pager panes: each page pane is a direct child of the translated track.
    const subheads = Array.from(document.querySelectorAll("div")).filter((d) => d.textContent === "Counts Sheet" && d.children.length === 0);
    const counts = [];
    if (subheads[0]) {
      const body = subheads[0].parentElement;
      for (const row of Array.from(body.children)) {
        const spans = Array.from(row.children).filter((c) => c.tagName === "SPAN");
        if (spans.length === 3) counts.push(spans.map((s) => s.textContent.trim()));
      }
    }
    const panes = subheads[0] ? Array.from(subheads[0].parentElement.parentElement.parentElement.children) : [];
    return { counts, panes: panes.map((p) => p.innerText) };
  });
  for (let i = 0; i < 3; i++) {
    const dot = page.locator("[role='tab']").nth(i);
    if (await dot.count()) { await dot.click(); await page.waitForTimeout(250); await shot(`${label}-quickreview-p${i + 1}`); }
  }
  writeFileSync(`${outDir}/state/${label}-quickreview.json`, JSON.stringify(data, null, 1));
  note(`captured Quick Review ${label}`, { countsRows: data.counts.length, panes: data.panes.length });
  // Close the sheet.
  const close = page.getByRole("button", { name: /^(✕|×|Close|Done)$/ });
  if (await close.count()) await close.first().click();
  await page.waitForTimeout(200);
  return data;
}

// ── 1. Create match ──────────────────────────────────────────────────────────
await page.goto(`${baseUrl}/pro-tagger`);
await page.getByText("New Match").click();
await clickByText(fx.sport === "hurling" ? "Hurling" : "Gaelic Football");
await page.getByPlaceholder("e.g. Kilkenny").fill(fx.homeTeam);
await page.getByPlaceholder("e.g. Tipperary").fill(fx.awayTeam);
await page.getByPlaceholder("e.g. Croke Park").fill(fx.venue);
await clickByText(fx.matchType);
await clickByText(`${fx.halfMinutes} min`);
await shot("01-setup");
await page.getByText("Continue → Squads").click();

// Squads: enter player names exactly as a coach would.
await page.getByText("Edit Player Names").click();
for (const team of ["FOR", "OPP"]) {
  await clickByText(team === "FOR" ? fx.homeTeam : fx.awayTeam);
  await page.waitForTimeout(150);
  for (const pl of fx.squads[team]) {
    if (!pl.name) continue;
    const input = page.getByPlaceholder(`#${pl.number}`, { exact: true });
    if (await input.count()) await input.first().fill(pl.name);
  }
}
await shot("02-squads");
await page.getByText("Go To Game").first().click();
await page.getByText(fx.attackDirection === "right" ? "RIGHT" : "LEFT", { exact: true }).click();
await clickByText("▶ Start");
note("match started");

// ── 2. Replay the fixture through the UI ────────────────────────────────────
const ownerToggleChecks = [];
const tagResults = [];
let half = 1;
for (const step of fx.steps) {
  if (step.op === "tag") {
    const ev = step.ev;
    await advanceTo(ev.clock);
    await tagEvent(page, sportKey, ev);
    tagResults.push({ id: ev.id, erroneous: !!ev.erroneous, wrongWayOverride: !!ev._wrongWayOverride });
    if (ev.family === "RESTART" && ev.owner === "OPP") {
      const st = await readOwnerToggle(page, sportKey);
      ownerToggleChecks.push({ afterEvent: ev.id, toggle: st });
    }
  } else if (step.op === "undo") {
    await page.getByRole("button", { name: "↩", exact: true }).first().click();
    await page.waitForTimeout(100);
    note("undo", { undoes: step.undoes });
  } else if (step.op === "pause") {
    const before = await readClock();
    await clickByText("⏸ Pause");
    await page.clock.runFor(step.realSeconds * 1000);
    const during = await readClock();
    await clickByText("▶ Resume");
    note("pause/resume", { before, afterPause: during, realSeconds: step.realSeconds });
  } else if (step.op === "reload") {
    await page.clock.runFor(1500); // let the 1.2 s autosave debounce fire, as on a real device
    const before = await readClock().catch(() => null);
    await page.reload();
    await page.getByText("Resume in-progress match").click();
    await page.waitForTimeout(300);
    await shot(`reload-${half}-${tagResults.length}`);
    const resumeBtn = page.getByRole("button", { name: "RESUME MATCH", exact: true });
    if (await resumeBtn.count()) await resumeBtn.click();
    const after = await readClock().catch(() => null);
    note("reload + resume", { clockBefore: before, clockAfter: after, events: (await dumpStore(`reload-${tagResults.length}`))[0]?.events.length });
  } else if (step.op === "halftime") {
    await advanceTo(Math.max(await readClock(), step.clock));
    await clickByText("HT");
    await clickByText("End Half");
    await page.waitForTimeout(300);
    await shot("10-halftime");
    await dumpStore("HT");
    await captureQuickReview("HT");
    await openOptions();
    await exportPdf("HT Snapshot PDF", "HT-snapshot-live");
    await closeOptions();
    half = 2;
    await clickByText("START SECOND HALF");
    note("second half started");
  } else if (step.op === "fulltime") {
    await advanceTo(Math.max(await readClock(), step.clock));
    await clickByText("FT");
    await clickByText("Finish Match");
    await page.waitForTimeout(300);
    await shot("20-fulltime");
    await dumpStore("FT");
    await captureQuickReview("FT");
    await openOptions();
    await exportPdf("FT Snapshot PDF", "FT-snapshot-live");
    await exportPdf("Full Review PDF", "FullReview-live");
    await clickByText("Save Match");
    await closeOptions();
    note("full time + saved");
  }
}
writeFileSync(`${outDir}/state/owner-toggle-checks.json`, JSON.stringify(ownerToggleChecks, null, 1));
writeFileSync(`${outDir}/state/tag-results.json`, JSON.stringify(tagResults, null, 1));

// ── 3. Reload the app, reopen from Saved Matches, review ops, regenerate ────
await page.goto(`${baseUrl}/pro-tagger`);
await page.getByText("Saved Matches").click();
await page.waitForTimeout(300);
await shot("30-saved-matches");
await clickByText("Review match");
await page.waitForTimeout(500);
await shot("31-review");
writeFileSync(`${outDir}/state/review-screen.txt`, await page.locator("body").innerText());

if (fx.reviewOps?.length) {
  const store = await dumpStore("before-review-ops");
  const saved = store.find((m) => m.homeTeamName === fx.homeTeam);
  // Map fixture ids → stored events by tap order (undone taps were removed by ↩).
  const liveTags = fx.steps.filter((s) => s.op === "tag" && !s.ev.erroneous).map((s) => s.ev);
  if (liveTags.length !== saved.events.length) note("EVENT COUNT MISMATCH before review ops", { fixture: liveTags.length, stored: saved.events.length });
  const idMap = new Map(liveTags.map((e, i) => [e.id, saved.events[i]]));
  await page.getByRole("button", { name: /Event Map/ }).first().click();
  await page.waitForTimeout(1200);
  for (const op of fx.reviewOps) {
    const target = idMap.get(op.targetId);
    await applyReviewOp(op, target);
  }
  await clickByText("← Review");
  await page.waitForTimeout(300);
  await dumpStore("after-review-ops");
}

async function applyReviewOp(op, target) {
  // Narrow the board to the target's half + team so markers don't overlap.
  await clickByText(target.period === "1H" ? "H1" : "H2");
  const teamBtns = page.getByRole("button", { name: target.teamSide, exact: true });
  await teamBtns.first().click();
  const CATEGORY = { GOAL: "SCORES", POINT: "SCORES", TWO_POINTER: "SCORES", FORTY_FIVE_TWO_POINT: "SCORES", SHOT: "SHOTS", WIDE: "WIDES",
    TURNOVER_WON: "T/O", TURNOVER_LOST: "T/O", KICKOUT_WON: "K/O", KICKOUT_CONCEDED: "K/O", FREE_WON: "FREES", FREE_CONCEDED: "FREES" };
  const cat = CATEGORY[target.kind];
  const catBtns = page.getByRole("button", { name: cat ?? "ALL", exact: true });
  await catBtns.last().click();
  await page.waitForTimeout(400);
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const pitchW = box.width - 28; const pitchH = pitchW / 1.6;
  const left = box.x + 14; const top = box.y + (box.height - pitchH) / 2;
  const x = left + target.nx * pitchW; const y = top + target.ny * pitchH;
  let opened = false;
  const offsets = [[0, 0]];
  for (const r of [2, 4, 6]) for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) offsets.push([ux * r, uy * r]);
  for (const [dx, dy] of offsets) {
    await page.mouse.click(x + dx, y + dy);
    await page.waitForTimeout(250);
    const sheet = await page.getByText("Event detail").count();
    if (!sheet) continue;
    const time = await page.evaluate(() => document.body.innerText);
    const mm = String(Math.floor(target.matchClockSeconds / 60)).padStart(2, "0");
    const ss = String(target.matchClockSeconds % 60).padStart(2, "0");
    if (time.includes(`${mm}:${ss}`)) { opened = true; break; }
    await page.getByRole("button", { name: "Close" }).first().click();
  }
  if (!opened) { note("REVIEW OP: could not open target marker", { op, target: { id: target.id, kind: target.kind, nx: target.nx, ny: target.ny } }); return; }
  await shot(`40-review-${op.op}-${op.targetId}`);
  if (op.op === "delete") {
    await page.getByRole("button", { name: "Delete event" }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
  } else {
    await page.getByRole("button", { name: "Edit event" }).click();
    await page.locator("select").first().selectOption(op.newKind);
    await shot(`41-review-edit-form-${op.targetId}`);
    await clickByText("Save");
  }
  await page.waitForTimeout(300);
  note(`review ${op.op} applied`, { targetId: op.targetId, kind: target.kind, newKind: op.newKind ?? null });
  // Reset filters: half ALL (first), category ALL (last).
  await page.getByRole("button", { name: "ALL", exact: true }).first().click();
  await page.getByRole("button", { name: "ALL", exact: true }).last().click();
}

// Regenerate every PDF from the reopened saved match.
await exportPdf("HT Snapshot PDF", "HT-snapshot-reopened");
await exportPdf("FT Snapshot PDF", "FT-snapshot-reopened");
await exportPdf("Full Review PDF", "FullReview-reopened");
await dumpStore("final");

// Second reopen: reload the app again and regenerate the FT snapshot to prove stability.
await page.goto(`${baseUrl}/pro-tagger`);
await page.getByText("Saved Matches").click();
await clickByText("Review match");
await page.waitForTimeout(400);
await exportPdf("FT Snapshot PDF", "FT-snapshot-reopened2");

writeFileSync(`${outDir}/state/run-log.json`, JSON.stringify(log, null, 1));
await browser.close();
note("done");
