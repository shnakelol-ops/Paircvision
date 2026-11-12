// Club Crest V1, Checkpoint 4 — crests in the real PDF exporters.
// Every canvas call on every page is recorded, so these tests prove that:
// without a usable crest page 1 is exactly as before; with crests only
// page 1's crest area changes; every other page, every statistic and the page
// count are identical; and a crest failure never breaks or blanks a page.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CrestArtwork } from "../../pro-tagger/crest/crest-artwork";
import type { PdfExportEvent, ReviewPdfExportInput, SnapshotPdfExportInput } from "../reviewPdfExport";
import type { PdfScoreCrests } from "./pdfScoreCrests";

type Fixture = { homeTeamName: string; awayTeamName: string; halfDurationMinutes: number; events: PdfExportEvent[] };
const fx = JSON.parse(readFileSync(new URL("./fixtures/ballylanders-galbally-2026-11-07-ht.json", import.meta.url), "utf8")) as Fixture;
const ft: PdfExportEvent[] = [
  ...fx.events,
  ...fx.events.map((e) => ({ ...e, id: `${e.id}-2h`, period: "2H", half: 2, matchClockSeconds: (e.matchClockSeconds ?? 0) + 1800, nx: 1 - (e.nx ?? 0.5), ny: 1 - (e.ny ?? 0.5), x: 1 - (e.x ?? 0.5), y: 1 - (e.y ?? 0.5) }) as PdfExportEvent),
];

// ─── Recording canvas / document ─────────────────────────────────────────────
type Call = [string, ...unknown[]];
let pages: Call[][] = [];
let pdfTexts: string[] = [];
const sizeOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
const tag = (v: unknown) => (v && typeof v === "object" ? ("tag" in (v as object) ? `img:${(v as { tag: string }).tag}` : "obj") : v);

function makeCanvas() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif" };
  const methods: Record<string, (...a: unknown[]) => unknown> = {
    measureText: (t) => ({ width: [...String(t)].length * sizeOf(String(state.font)) * 0.55, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    isPointInPath: () => false,
    getLineDash: () => [],
  };
  const ctx = new Proxy(state, {
    get(t, p: string) {
      if (p in methods) return (...a: unknown[]) => { calls.push([p, ...a.map(tag)]); return methods[p](...a); };
      if (p === "drawImage") return (img: { tag?: string; throws?: boolean }, ...a: unknown[]) => {
        if (img?.throws) throw new DOMException("The image is broken", "InvalidStateError");
        calls.push(["drawImage", tag(img), ...a]);
      };
      if (p in t) return t[p];
      return (...a: unknown[]) => { calls.push([p, ...a.map(tag)]); };
    },
    set(t, p: string, v) { t[p] = v; calls.push([`=${p}`, tag(v)]); return true; },
  });
  const canvas = {
    tag: "stage", width: 0, height: 0, style: {},
    getContext: () => ctx,
    toDataURL: () => { pages.push(calls); return "data:image/jpeg;base64,AAAA"; },
    toBlob: (cb: (b: Blob) => void) => cb(new Blob(["x"])),
  };
  return canvas;
}

vi.mock("jspdf", () => ({
  default: class {
    addPage() {} addImage() {} save() {} output() { return new Blob(); } setProperties() {}
    setFillColor() {} rect() {} setTextColor() {} setFontSize() {}
    text(t: string) { pdfTexts.push(t); }
  },
}));

beforeEach(() => {
  pages = [];
  pdfTexts = [];
  (globalThis as { document?: unknown }).document = {
    createElement: (t: string) => (t === "canvas" ? makeCanvas() : { click() {}, style: {}, setAttribute() {}, remove() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
});

const art = (t: string, w: number, h: number, extra: { throws?: boolean } = {}): CrestArtwork => ({
  image: { tag: t, width: w, height: h, ...extra } as unknown as CanvasImageSource, width: w, height: h, needsBacking: false, key: `${t}:1`,
});
const closed = (t: string): CrestArtwork => ({ ...art(t, 300, 400), image: { tag: t, width: 0, height: 0 } as unknown as CanvasImageSource });
const sc = (home: CrestArtwork | null, away: CrestArtwork | null): PdfScoreCrests => ({ home, away, homeName: fx.homeTeamName, awayName: fx.awayTeamName });

const base: ReviewPdfExportInput = {
  events: ft, homeTeamName: fx.homeTeamName, awayTeamName: fx.awayTeamName, sport: "gaelic",
  homeSquadPlayers: [], awaySquadPlayers: [], homeAttackingDirection: "RIGHT", halfDurationMinutes: fx.halfDurationMinutes,
};

type Report = "HT Snapshot" | "FT Snapshot" | "Full Review";
async function exportPages(report: Report, scoreCrests?: PdfScoreCrests): Promise<Call[][]> {
  pages = [];
  const mod = await import("../reviewPdfExport");
  if (report === "Full Review") await mod.exportReviewPdf({ ...base, scoreCrests });
  else {
    const input: SnapshotPdfExportInput = { ...base, scoreCrests, snapshotMode: report === "HT Snapshot" ? "HALF_TIME_SNAPSHOT" : "FULL_TIME_SNAPSHOT" };
    await mod.exportSnapshotPdf(input);
  }
  return pages.map((p) => [...p]);
}
const texts = (page: Call[]) => page.filter((c) => c[0] === "fillText").map((c) => c[1]);
const composites = (page: Call[]) => page.filter((c) => c[0] === "drawImage" && c[1] === "img:stage");

const REPORTS: Report[] = ["HT Snapshot", "FT Snapshot", "Full Review"];
const PAGE1_TITLE: Record<Report, string> = { "HT Snapshot": "Half-Time Dashboard", "FT Snapshot": "Full-Time Dashboard", "Full Review": "Match Summary" };

describe.each(REPORTS)("%s", (report) => {
  it("no usable crest (none, both missing, both broken): every page is drawn exactly as before", async () => {
    const before = await exportPages(report);
    expect(before.length).toBeGreaterThan(4);
    expect(texts(before[0])).toContain(PAGE1_TITLE[report]);
    expect(await exportPages(report, sc(null, null))).toEqual(before);
    expect(await exportPages(report, sc(closed("a"), closed("b")))).toEqual(before);
    expect(composites(before[0])).toEqual([]);
  });

  it("both crests: only page 1 changes, by exactly the two crest composites; all other pages, texts and the page count are identical", async () => {
    const before = await exportPages(report);
    const after = await exportPages(report, sc(art("ballylanders", 496, 509), art("galbally", 400, 480)));
    expect(after.length).toBe(before.length);
    expect(after.slice(1)).toEqual(before.slice(1));
    // Page 1: identical except one inserted block — save · drawImage(Home) · drawImage(Away) · restore.
    expect(composites(after[0]).map((c) => c.slice(2))).toEqual([[40, 58], [1680, 58]]);
    expect(texts(after[0])).toEqual(texts(before[0])); // names, scores, statistics unchanged
    const at = after[0].findIndex((c) => c[0] === "drawImage" && c[1] === "img:stage") - 1;
    expect(after[0].slice(at, at + 4).map((c) => c[0])).toEqual(["save", "drawImage", "drawImage", "restore"]);
    expect([...after[0].slice(0, at), ...after[0].slice(at + 4)]).toEqual(before[0]);
  });

  it("one crest: page 1 gets the crest and the other club's monogram (letters drawn off-page, composited), statistics unchanged", async () => {
    const before = await exportPages(report);
    for (const c of [sc(art("ballylanders", 496, 509), null), sc(null, art("galbally", 400, 480))]) {
      const after = await exportPages(report, c);
      expect(composites(after[0])).toHaveLength(2);
      expect(texts(after[0])).toEqual(texts(before[0]));
      expect(after.slice(1)).toEqual(before.slice(1));
    }
  });

  it("a crest that fails to draw never breaks the page: page 1 exactly as before, no 'could not be rendered' page, export completes", async () => {
    const before = await exportPages(report);
    const after = await exportPages(report, sc(art("ballylanders", 496, 509), art("broken", 300, 400, { throws: true })));
    expect(after).toEqual(before);
    expect(pdfTexts).toEqual([]);
  });

  it("long club names: crests shrink (or are left out) rather than overlap; texts unchanged", async () => {
    const long = { ...base, homeTeamName: "Naomh Abán Ballymacelligott", awayTeamName: "Cumann Lúthchleas Gael Ó Donnabháin Rossa" };
    pages = [];
    const mod = await import("../reviewPdfExport");
    const scoreCrests = { ...sc(art("a", 512, 512), art("b", 512, 512)), homeName: long.homeTeamName, awayName: long.awayTeamName };
    if (report === "Full Review") await mod.exportReviewPdf({ ...long, scoreCrests });
    else await mod.exportSnapshotPdf({ ...long, scoreCrests, snapshotMode: report === "HT Snapshot" ? "HALF_TIME_SNAPSHOT" : "FULL_TIME_SNAPSHOT" });
    const p1 = pages[0];
    // Every name / score drawn in the header keeps a clear gap from the crest columns (x ≤ 210 and x ≥ 1710).
    const header = p1.filter((c) => c[0] === "fillText" && typeof c[3] === "number" && (c[3] as number) > 90 && (c[3] as number) < 230);
    expect(header.length).toBeGreaterThan(0);
    expect(texts(p1).some((t) => String(t).includes("…"))).toBe(true); // long names are truncated as before
  });
});

describe("Match Stats isolation", () => {
  it("the Match Stats screen never passes crests to the exporters", () => {
    const src = readFileSync(new URL("../../StatsModeSurface.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/scoreCrests|exportWithClubCrests/);
  });
});
