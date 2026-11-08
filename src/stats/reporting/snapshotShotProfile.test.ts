/**
 * snapshotShotProfile.test.ts
 *
 * HT and FT Snapshot → "Our Shot Profile" / "Opposition Shot Profile" draw
 * genuine shot attempts only. Free awards (FREE_WON, FREE_CONCEDED) are not
 * shots and are not plotted, listed in the legend or used as callout facts.
 * Shooting totals, conversion and placed-ball figures are unchanged.
 * Layout: the legend is one row between the headline and the pitch (canvas
 * y 130–170); the right-hand column is empty; the bottom strip does not repeat
 * the headline's shots / conversion figure.
 *
 * Real match: Ballylanders 0-06 v Galbally 0-05 (Samsung acceptance export,
 * half-time, anonymised). Expected markers come from the event list itself:
 *
 *   Ballylanders 8 attempts: points 0:19, 2:30 (free), 8:15 (45), 9:27;
 *     two-pointer 4:00 (free); wide 6:41; post 2:08; blocked/saved 7:57.
 *     Frees won (not shots): 2:18, 3:48.
 *   Galbally 5 attempts: points 1:00, 4:36, 7:05 (free); two-pointer 5:07;
 *     wide 8:46. Frees Galbally won (FREE_CONCEDED, not shots): 0:50, 6:57, 10:17.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfExportEvent } from "../reviewPdfExport";

type Fixture = { homeTeamName: string; awayTeamName: string; halfDurationMinutes: number; events: PdfExportEvent[] };
const fx = JSON.parse(readFileSync(new URL("./fixtures/ballylanders-galbally-2026-11-07-ht.json", import.meta.url), "utf8")) as Fixture;

// Canvas 1920×1080. Headline text band y 80–130, legend row y 130–170, pitch
// area y 170–890 (x 24–1752). The old right-hand legend column was x ≥ 1762.
const LEGEND_ROW = { top: 130, bottom: 170 };
const RIGHT_COLUMN_X = 1756;

// ── Canvas capture: text, and each drawn marker shape by colour and side ──
type Marks = Record<string, number>;
type Page = { texts: string[]; pitch: Marks; legend: Marks; rightColumn: number };
const pages: Page[] = [];
const bump = (m: Marks, k: string) => { m[k] = (m[k] ?? 0) + 1; };
class Ctx {
  fillStyle = ""; strokeStyle = ""; font = ""; lineWidth = 1; textBaseline = "alphabetic"; textAlign = "left"; globalAlpha = 1; lineCap = "butt";
  texts: string[] = []; pitch: Marks = {}; legend: Marks = {}; rightColumn = 0;
  private arcAt: [number, number] | null = null; private moves: [number, number][] = [];
  private side([x, y]: [number, number]) {
    if (x >= RIGHT_COLUMN_X) this.rightColumn++;
    return y >= LEGEND_ROW.top && y < LEGEND_ROW.bottom ? this.legend : this.pitch;
  }
  save() {} restore() {} fillRect() {} strokeRect() {} clearRect() {}
  fillText(t: string, x: number, y: number) { this.texts.push(String(t)); if (t === "↓" && this.fillStyle === "#94a3b8") bump(this.side([x, y]), "short"); }
  strokeText() {}
  beginPath() { this.arcAt = null; this.moves = []; }
  arc(x: number, y: number) { this.arcAt = [x, y]; }
  moveTo(x: number, y: number) { this.moves.push([x, y]); }
  arcTo() {} ellipse() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} rect() {} roundRect() {}
  // Pitch markings (centre and penalty spots) are white rgba; they are not event markers.
  fill() { if (this.arcAt !== null && !this.fillStyle.startsWith("rgba(255,255,255")) bump(this.side(this.arcAt), `dot ${this.fillStyle}`); }
  stroke() {
    if (this.arcAt !== null && this.strokeStyle === "#64748b") bump(this.side(this.arcAt), "ring");
    // A ✕ is two single-segment strokes; count the coloured diagonals only.
    if (this.arcAt === null && this.moves.length === 1 && this.strokeStyle === "#ef4444") bump(this.side(this.moves[0]), "x-stroke");
  }
  measureText(t: string) { return { width: String(t).length * 8 }; }
  setLineDash() {} clip() {} drawImage() {} translate() {} rotate() {} scale() {} setTransform() {} resetTransform() {}
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
}
class Cnv {
  width = 0; height = 0; style = {}; ctx = new Ctx();
  getContext() { return this.ctx; }
  toDataURL() { pages.push({ texts: this.ctx.texts, pitch: this.ctx.pitch, legend: this.ctx.legend, rightColumn: this.ctx.rightColumn }); return "data:image/jpeg;base64,AAAA"; }
  toBlob(cb: (b: Blob) => void) { this.toDataURL(); cb(new Blob(["x"])); }
}
vi.mock("jspdf", () => ({ default: class { addPage() {} addImage() {} save() {} output() { return new Blob(); } setProperties() {} } }));
beforeEach(() => {
  pages.length = 0;
  (globalThis as { document?: unknown }).document = {
    createElement: (t: string) => (t === "canvas" ? new Cnv() : { click() {}, style: {}, setAttribute() {}, remove() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
});

const MODES = ["HALF_TIME_SNAPSHOT", "FULL_TIME_SNAPSHOT"] as const;
async function snapshot(mode: (typeof MODES)[number], events: PdfExportEvent[] = fx.events) {
  const { exportSnapshotPdf } = await import("../reviewPdfExport");
  await exportSnapshotPdf({
    events, homeTeamName: fx.homeTeamName, awayTeamName: fx.awayTeamName, sport: "gaelic",
    homeSquadPlayers: [], awaySquadPlayers: [], homeAttackingDirection: "RIGHT",
    halfDurationMinutes: fx.halfDurationMinutes, snapshotMode: mode,
  });
  const page = (title: string) => {
    const p = pages.find((x) => x.texts.includes(title));
    if (!p) throw new Error(`no page "${title}"`);
    return { ...p, legendLabels: p.texts.filter((t) => LEGEND_LABELS.includes(t)) };
  };
  return { ours: page("Our Shot Profile"), theirs: page("Opposition Shot Profile") };
}
const LEGEND_LABELS = ["Goal", "Point", "Two-pointer", "Wide / missed", "Blocked / saved", "Dropped short", "Post / other"];
const FREE_TEXT = /free won|free conceded|won \d+ frees?\b|conceded \d+ frees?\b/i;

describe.each(MODES)("%s Shot Profiles — Ballylanders v Galbally", (mode) => {
  it("Our Shot Profile: the 8 Ballylanders attempts, no free-won markers", async () => {
    const { ours } = await snapshot(mode);
    expect(ours.pitch).toEqual({
      "dot #4ade80": 4,   // points 0:19, 2:30 free, 8:15 45, 9:27
      "dot #fbbf24": 1,   // two-pointer 4:00 free
      "x-stroke": 2,      // one ✕: wide 6:41
      "ring": 1,          // blocked/saved 7:57 (grey ring) …
      "dot #e2e8f0": 1,   // … its centre
      "dot #94a3b8": 2,   // … its halo, plus the post 2:08 (grey dot)
    });
    expect(ours.pitch["dot #818cf8"]).toBeUndefined();
  });

  it("Opposition Shot Profile: the 5 Galbally attempts, no free-conceded markers", async () => {
    const { theirs } = await snapshot(mode);
    expect(theirs.pitch).toEqual({
      "dot #4ade80": 3,   // points 1:00, 4:36, 7:05 free
      "dot #fbbf24": 1,   // two-pointer 5:07
      "x-stroke": 2,      // one ✕: wide 8:46
    });
    expect(theirs.pitch["dot #f472b6"]).toBeUndefined();
  });

  it("legends list only the marker types drawn, in the marker colours", async () => {
    const { ours, theirs } = await snapshot(mode);
    expect(ours.legendLabels).toEqual(["Point", "Two-pointer", "Wide / missed", "Blocked / saved", "Post / other"]);
    expect(ours.legend).toEqual({ "dot #4ade80": 1, "dot #fbbf24": 1, "x-stroke": 2, "ring": 1, "dot #e2e8f0": 1, "dot #94a3b8": 1 });
    expect(theirs.legendLabels).toEqual(["Point", "Two-pointer", "Wide / missed"]);
    expect(theirs.legend).toEqual({ "dot #4ade80": 1, "dot #fbbf24": 1, "x-stroke": 2 });
    for (const p of [ours, theirs]) expect(p.texts.filter((t) => FREE_TEXT.test(t))).toEqual([]);
    // The legend is a row above the pitch: nothing is drawn in the old right-hand column.
    for (const p of [ours, theirs]) expect(p.rightColumn).toBe(0);
  });

  it("headlines, conversion and placed-ball callouts are unchanged; the strip does not repeat the headline", async () => {
    const { ours, theirs } = await snapshot(mode);
    expect(ours.texts).toContain("5 scores from 8 shots · 63% efficiency · Best zone: Attacking Centre");
    expect(ours.texts.filter((t) => / shots: \d+ scored from \d+ attempts/.test(t))).toEqual([]);
    expect(ours.texts).toContain("Ballylanders: 3 placed-ball scores");
    expect(theirs.texts).toContain("4 scores from 5 shots · 80% efficiency · Most scoring zone: Attacking Centre");
    expect(theirs.texts.filter((t) => / shots: \d+ scored from \d+ attempts/.test(t))).toEqual([]);
    expect(theirs.texts).toContain("Galbally: 1 placed-ball score");
    expect(ours.texts).toContain("Ballylanders best zone: Attacking Centre (3)");
    expect(theirs.texts).toContain("Galbally best scoring zone: Attacking Centre (3)");
  });

  it("with no placed-ball shots, no free-count fallback callout: the next shooting fact is used", async () => {
    // Same match without its four placed-ball attempts; the free awards stay.
    const placed = new Set(["e10", "e14", "e31", "e25"]);
    const { ours, theirs } = await snapshot(mode, fx.events.filter((e) => !placed.has(e.id.slice(0, 3))));
    for (const p of [ours, theirs]) expect(p.texts.filter((t) => FREE_TEXT.test(t))).toEqual([]);
    expect(ours.pitch["dot #818cf8"]).toBeUndefined();
    expect(theirs.pitch["dot #f472b6"]).toBeUndefined();
    expect(ours.texts.some((t) => t.startsWith("Ballylanders best zone: "))).toBe(true);
    expect(theirs.texts.some((t) => t.startsWith("Galbally best scoring zone: "))).toBe(true);
  });
});
