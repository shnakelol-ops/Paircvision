// Independent pre-merge audit of PR #390 (scratch; not committed).
import { readFileSync, writeFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
const DIR = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad/audit390";
const LEGEND_X = 1756;
type Page = { texts: string[]; pitch: Record<string, number>; legend: Record<string, number>; all: string };
const pages: Page[] = [];
const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
class Ctx {
  fillStyle = ""; strokeStyle = ""; font = ""; lineWidth = 1; textBaseline = ""; textAlign = ""; globalAlpha = 1; lineCap = "";
  texts: string[] = []; pitch: Record<string, number> = {}; legend: Record<string, number> = {}; log: string[] = [];
  ax: number | null = null; mv: number[] = [];
  side(x: number) { return x >= LEGEND_X ? this.legend : this.pitch; }
  save() {} restore() {} fillRect(...a: number[]) { this.log.push("fr" + this.fillStyle + a.join(",")); } strokeRect() {} clearRect() {}
  fillText(t: string, x: number) { this.texts.push(String(t)); this.log.push("t" + t + x + this.fillStyle + this.font); if (t === "↓" && this.fillStyle === "#94a3b8") bump(this.side(x), "short"); }
  strokeText() {}
  beginPath() { this.ax = null; this.mv = []; } arc(x: number, y: number, r: number) { this.ax = x; this.log.push("a" + [x, y, r].join(",")); }
  moveTo(x: number, y: number) { this.mv.push(x); this.log.push("m" + x + "," + y); } lineTo(x: number, y: number) { this.log.push("l" + x + "," + y); }
  arcTo() {} ellipse() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} rect() {} roundRect() {}
  fill() { this.log.push("f" + this.fillStyle); if (this.ax !== null && !this.fillStyle.startsWith("rgba(255,255,255")) bump(this.side(this.ax), "dot " + this.fillStyle); }
  stroke() { this.log.push("s" + this.strokeStyle); if (this.ax !== null && this.strokeStyle === "#64748b") bump(this.side(this.ax), "ring");
    if (this.ax === null && this.mv.length === 1 && this.strokeStyle === "#ef4444") bump(this.side(this.mv[0]), "x"); }
  measureText(t: string) { return { width: String(t).length * 8 }; }
  setLineDash() {} clip() {} drawImage() {} translate() {} rotate() {} scale() {} setTransform() {} resetTransform() {}
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; } createPattern() { return null; }
}
class Cnv { width = 0; height = 0; style = {}; ctx = new Ctx(); getContext() { return this.ctx; }
  toDataURL() { pages.push({ texts: this.ctx.texts, pitch: this.ctx.pitch, legend: this.ctx.legend, all: this.ctx.log.join("|") }); return "data:,"; }
  toBlob(cb: any) { this.toDataURL(); cb(new Blob(["x"])); } }
vi.mock("jspdf", () => ({ default: class { addPage() {} addImage() {} save() {} output() { return new Blob(); } setProperties() {} } }));
(globalThis as any).document = { createElement: (t: string) => (t === "canvas" ? new Cnv() : { click() {}, style: {}, setAttribute() {}, remove() {} }), body: { appendChild() {}, removeChild() {} } };
URL.createObjectURL = () => "blob:x"; URL.revokeObjectURL = () => {};

// Independent expected tally, from the raw saved events (spec: CLAUDE.md visual language).
const SHOT_KINDS = new Set(["SHOT", "GOAL", "POINT", "WIDE", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_MISSED", "FREE_SCORED"]);
function expected(events: any[], side: "FOR" | "OPP") {
  const e: Record<string, number> = {};
  for (const ev of events) {
    if (ev.teamSide !== side || !SHOT_KINDS.has(ev.kind) || String(ev.id).includes("-instant-score-")) continue;
    const x = typeof ev.x === "number" ? ev.x : ev.nx, y = typeof ev.y === "number" ? ev.y : ev.ny;
    if (x == null || y == null || !isFinite(x) || !isFinite(y)) { bump(e, "_noLocation"); continue; }
    const tags: string[] = ev.tags ?? [];
    const blocked = ev.kind === "SHOT" && tags.some((t) => /BLOCK|SAVE/.test(t));
    if (ev.kind === "GOAL") bump(e, "dot #16a34a");
    else if (ev.kind === "POINT" || ev.kind === "FREE_SCORED") bump(e, "dot #4ade80");
    else if (ev.kind === "TWO_POINTER" || ev.kind === "FORTY_FIVE_TWO_POINT") bump(e, "dot #fbbf24");
    else if (ev.kind === "WIDE" || ev.kind === "FREE_MISSED") { e.x = (e.x ?? 0) + 2; }
    else if (blocked) { bump(e, "ring"); bump(e, "dot #e2e8f0"); bump(e, "dot #94a3b8"); }
    else if (tags.includes("SHORT")) bump(e, "short");
    else bump(e, "dot #94a3b8");
  }
  return e;
}
it("audit", { timeout: 600000 }, async () => {
  const pdf = await import("../stats/reviewPdfExport");
  const ad = await import("../pro-tagger/pro-tagger-review-adapter");
  const out: any = { matches: {}, edge: {} };
  for (const id of ["S", "A", "B", "C"]) {
    let m = JSON.parse(readFileSync(`${DIR}/match-${id}.json`, "utf8")); if (Array.isArray(m)) m = m[0];
    const res: any = {};
    for (const mode of ["HALF_TIME_SNAPSHOT", "FULL_TIME_SNAPSHOT"] as const) {
      pages.length = 0;
      const input = ad.proTaggerMatchToSnapshotInput(m, mode);
      await pdf.exportSnapshotPdf(input);
      const pg = (t: string) => pages.find((p) => p.texts.includes(t))!;
      const evs = input.events as any[];
      const scoped = mode === "HALF_TIME_SNAPSHOT" ? evs.filter((e) => e.period === "1H") : evs;
      res[mode] = {
        pages: pages.map((p) => p.all),
        ours: { drawn: pg("Our Shot Profile").pitch, expected: expected(scoped, "FOR"), legend: pg("Our Shot Profile").texts.slice(pg("Our Shot Profile").texts.indexOf("LEGEND")), texts: pg("Our Shot Profile").texts },
        opp: { drawn: pg("Opposition Shot Profile").pitch, expected: expected(scoped, "OPP"), texts: pg("Opposition Shot Profile").texts },
        freeEvents: { FREE_WON: evs.filter((e) => e.kind === "FREE_WON").length, FREE_CONCEDED: evs.filter((e) => e.kind === "FREE_CONCEDED").length },
      };
    }
    pages.length = 0; await pdf.exportReviewPdf(ad.proTaggerMatchToPdfInput(m)); res.FULL_REVIEW = pages.map((p) => p.all);
    out.matches[id] = res;
  }
  // Edge cases: no shots at all (frees only); shots with no location; Opposition only.
  const base = { homeTeamName: "Home", awayTeamName: "Away", sport: "gaelic", homeSquadPlayers: [], awaySquadPlayers: [], homeAttackingDirection: "RIGHT", halfDurationMinutes: 30, snapshotMode: "HALF_TIME_SNAPSHOT" } as any;
  const mk = (id: string, kind: string, side: string, extra: any = {}) => ({ id, kind, teamSide: side, period: "1H", clockSeconds: 60, tags: [], x: 0.7, y: 0.5, ...extra });
  const cases: Record<string, any[]> = {
    empty: [],
    freesOnly: [mk("f1", "FREE_WON", "FOR"), mk("f2", "FREE_CONCEDED", "FOR")],
    noLocation: [mk("p1", "POINT", "FOR", { x: undefined, y: undefined }), mk("w1", "WIDE", "OPP", { x: undefined, y: undefined }), mk("f1", "FREE_WON", "FOR")],
  };
  for (const [k, events] of Object.entries(cases)) {
    pages.length = 0; let err: string | null = null;
    try { await pdf.exportSnapshotPdf({ ...base, events }); } catch (e: any) { err = String(e?.message ?? e); }
    const pg = (t: string) => pages.find((p) => p.texts.includes(t));
    out.edge[k] = { err, pages: pages.length, ours: { pitch: pg("Our Shot Profile")?.pitch, legend: pg("Our Shot Profile")?.legend, hasLegendTitle: pg("Our Shot Profile")?.texts.includes("LEGEND"), texts: pg("Our Shot Profile")?.texts.filter((t) => /shot|free|score/i.test(t)) },
      opp: { pitch: pg("Opposition Shot Profile")?.pitch, hasLegendTitle: pg("Opposition Shot Profile")?.texts.includes("LEGEND"), texts: pg("Opposition Shot Profile")?.texts.filter((t) => /shot|free|score/i.test(t)) } };
  }
  writeFileSync(process.env.AUDIT_OUT!, JSON.stringify(out));
  expect(true).toBe(true);
});
