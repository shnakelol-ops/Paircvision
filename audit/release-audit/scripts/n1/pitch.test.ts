// Scratch audit (not committed): every draw operation inside the pitch area of
// the Shot Profile pages, plus page counts and all other pages, main vs branch.
import { readFileSync, writeFileSync } from "node:fs";
import { it, vi } from "vitest";
const DIR = "/tmp/claude-0/-home-user-Paircvision/5b353f9c-46ec-5c23-9500-866989574214/scratchpad/audit390";
// Pitch area of the Shot Profile pages: x 24–1752, y 170–890.
const inPitch = (x: number, y: number) => x >= 24 && x <= 1752 && y >= 170 && y <= 890;
type Pg = { texts: string[]; pitchOps: string[]; all: string };
const pages: Pg[] = [];
class Ctx {
  fillStyle: any = ""; strokeStyle: any = ""; font = ""; lineWidth = 1; textBaseline = ""; textAlign = ""; globalAlpha = 1; lineCap = "";
  texts: string[] = []; pitchOps: string[] = []; log: string[] = []; path: string[] = []; px = 0; py = 0;
  st() { return `fs=${this.fillStyle} ss=${this.strokeStyle} lw=${this.lineWidth} ga=${this.globalAlpha}`; }
  save() {} restore() {}
  fillRect(x: number, y: number, w: number, h: number) { const o = `fillRect ${x},${y},${w},${h} ${this.st()}`; this.log.push(o); if (inPitch(x, y)) this.pitchOps.push(o); }
  strokeRect(x: number, y: number, w: number, h: number) { const o = `strokeRect ${x},${y},${w},${h} ${this.st()}`; this.log.push(o); if (inPitch(x, y)) this.pitchOps.push(o); }
  clearRect() {}
  fillText(t: string, x: number, y: number) { this.texts.push(String(t)); const o = `text ${t} ${x},${y} ${this.font} ${this.st()}`; this.log.push(o); if (inPitch(x, y)) this.pitchOps.push(o); }
  strokeText() {}
  beginPath() { this.path = []; }
  arc(x: number, y: number, r: number) { this.path.push(`arc ${x},${y},${r}`); this.px = x; this.py = y; }
  moveTo(x: number, y: number) { this.path.push(`m ${x},${y}`); this.px = x; this.py = y; }
  lineTo(x: number, y: number) { this.path.push(`l ${x},${y}`); }
  arcTo() {} ellipse() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} rect() {} roundRect() {}
  fill() { const o = `fill [${this.path.join(" ")}] ${this.st()}`; this.log.push(o); if (this.path.length && inPitch(this.px, this.py)) this.pitchOps.push(o); }
  stroke() { const o = `stroke [${this.path.join(" ")}] ${this.st()}`; this.log.push(o); if (this.path.length && inPitch(this.px, this.py)) this.pitchOps.push(o); }
  measureText(t: string) { return { width: String(t).length * 8 }; }
  setLineDash() {} clip() {} drawImage() {} translate() {} rotate() {} scale() {} setTransform() {} resetTransform() {}
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; } createPattern() { return null; }
}
class Cnv { width = 0; height = 0; style = {}; ctx = new Ctx(); getContext() { return this.ctx; }
  toDataURL() { pages.push({ texts: this.ctx.texts, pitchOps: this.ctx.pitchOps, all: this.ctx.log.join("|") }); return "data:,"; }
  toBlob(cb: any) { this.toDataURL(); cb(new Blob(["x"])); } }
vi.mock("jspdf", () => ({ default: class { addPage() {} addImage() {} save() {} output() { return new Blob(); } setProperties() {} } }));
(globalThis as any).document = { createElement: (t: string) => (t === "canvas" ? new Cnv() : { click() {}, style: {}, setAttribute() {}, remove() {} }), body: { appendChild() {}, removeChild() {} } };
URL.createObjectURL = () => "blob:x"; URL.revokeObjectURL = () => {};
it("audit", { timeout: 600000 }, async () => {
  const pdf = await import("../stats/reviewPdfExport");
  const ad = await import("../pro-tagger/pro-tagger-review-adapter");
  const out: any = {};
  for (const id of ["S", "A", "B", "C"]) {
    let m = JSON.parse(readFileSync(`${DIR}/match-${id}.json`, "utf8")); if (Array.isArray(m)) m = m[0];
    for (const mode of ["HALF_TIME_SNAPSHOT", "FULL_TIME_SNAPSHOT"] as const) {
      pages.length = 0; await pdf.exportSnapshotPdf(ad.proTaggerMatchToSnapshotInput(m, mode));
      out[`${id} ${mode}`] = pages.map((p) => ({ title: p.texts.find((t) => /Shot Profile/.test(t)) ?? null, texts: p.texts, pitchOps: p.pitchOps, all: p.all }));
    }
    pages.length = 0; await pdf.exportReviewPdf(ad.proTaggerMatchToPdfInput(m)); out[`${id} FULL_REVIEW`] = pages.map((p) => ({ all: p.all }));
  }
  // Empty and frees-only cases
  const base = { homeTeamName: "Home", awayTeamName: "Away", sport: "gaelic", homeSquadPlayers: [], awaySquadPlayers: [], homeAttackingDirection: "RIGHT", halfDurationMinutes: 30, snapshotMode: "HALF_TIME_SNAPSHOT" } as any;
  const mk = (id: string, kind: string) => ({ id, kind, teamSide: "FOR", period: "1H", clockSeconds: 60, tags: [], x: 0.7, y: 0.5 });
  for (const [k, events] of Object.entries({ empty: [], freesOnly: [mk("f1", "FREE_WON"), mk("f2", "FREE_CONCEDED")] })) {
    pages.length = 0; await pdf.exportSnapshotPdf({ ...base, events });
    out[`edge ${k}`] = pages.map((p) => ({ title: p.texts.find((t) => /Shot Profile/.test(t)) ?? null, texts: p.texts, pitchOps: p.pitchOps, all: p.all }));
  }
  writeFileSync(process.env.AUDIT_OUT!, JSON.stringify(out));
});
