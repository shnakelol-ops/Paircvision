import { describe, expect, it } from "vitest";

import type { CrestArtwork } from "../../pro-tagger/crest/crest-artwork";
import { teamMonogram } from "../../pro-tagger/dashboard/htFtDashboardView";
import {
  PDF_AWAY_CREST_CX,
  PDF_CREST_CY,
  PDF_CREST_GAP,
  PDF_HOME_CREST_CX,
  drawPdfScoreCrests,
  planPdfScoreCrests,
  type PdfScoreCrests,
  type PdfScoreHeaderLayout,
} from "./pdfScoreCrests";

// ─── Recording canvas: deterministic text widths (0.55 × px per character) ───
type Call = { op: string; args: unknown[] };
const px = (font: string) => Number(/(\d+)px/.exec(font)?.[1] ?? 10);

class Ctx {
  calls: Call[] = [];
  font = "10px sans-serif";
  fillStyle: unknown = "#000";
  strokeStyle: unknown = "#000";
  lineWidth = 1;
  textAlign = "left";
  textBaseline = "alphabetic";
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "low";
  throwOnDrawImageOf: string | null = null;
  tag: string;
  constructor(tag: string) { this.tag = tag; }
  private rec(op: string, ...args: unknown[]) { this.calls.push({ op, args: args.map((a) => (a && typeof a === "object" && "tag" in (a as object) ? `#${(a as { tag: string }).tag}` : a)) }); }
  measureText(t: string) { return { width: [...t].length * px(this.font) * 0.55 }; }
  save() { this.rec("save"); } restore() { this.rec("restore"); }
  beginPath() { this.rec("beginPath"); } arc(...a: unknown[]) { this.rec("arc", ...a); } fill() { this.rec("fill", this.fillStyle); }
  stroke() { this.rec("stroke", this.strokeStyle); } fillText(t: string, x: number, y: number) { this.rec("fillText", t, x, y, this.fillStyle); }
  createRadialGradient() { this.rec("radial"); return { addColorStop: () => {} }; }
  drawImage(img: { tag: string }, ...a: number[]) {
    if (this.throwOnDrawImageOf && img.tag === this.throwOnDrawImageOf) throw new DOMException("The image is broken", "InvalidStateError");
    this.rec("drawImage", img, ...a);
  }
}
class Cnv {
  static made: Cnv[] = [];
  width = 0; height = 0; ctx: Ctx; tag: string; noContext: boolean;
  constructor(noContext = false) { this.noContext = noContext; this.tag = `stage${Cnv.made.length}`; this.ctx = new Ctx(this.tag); Cnv.made.push(this); }
  getContext() { return this.noContext ? null : this.ctx; }
}
function fakeDoc(opts: { noContext?: boolean; throwOn?: string } = {}) {
  Cnv.made = [];
  return {
    createElement: () => {
      const c = new Cnv(opts.noContext);
      c.ctx.throwOnDrawImageOf = opts.throwOn ?? null;
      return c;
    },
  } as unknown as Document;
}

const art = (tag: string, w: number, h: number, needsBacking = false): CrestArtwork => ({
  image: { tag, width: w, height: h } as unknown as CanvasImageSource, width: w, height: h, needsBacking, key: `${tag}:1`,
});
const closed = (tag: string): CrestArtwork => ({ ...art(tag, 300, 400), image: { tag, width: 0, height: 0 } as unknown as CanvasImageSource });

/** Full Review page-1 header, as makeSummaryPage draws it. */
const summary = (home = "Ballylanders", away = "Galbally"): PdfScoreHeaderLayout => ({
  homeCX: 496, awayCX: 1424,
  home: [{ text: home, font: "bold 44px sans-serif" }, { text: "0-12 (12)", font: "bold 64px sans-serif" }],
  away: [{ text: away, font: "bold 44px sans-serif" }, { text: "0-10 (10)", font: "bold 64px sans-serif" }],
});
const crests = (home: CrestArtwork | null, away: CrestArtwork | null, extra: Partial<PdfScoreCrests> = {}): PdfScoreCrests => ({
  home, away, homeName: "Ballylanders", awayName: "Galbally", ...extra,
});

function run(c: PdfScoreCrests | undefined, layout = summary(), docOpts: Parameters<typeof fakeDoc>[0] = {}) {
  const page = new Ctx("page");
  const drawn = drawPdfScoreCrests(page as unknown as CanvasRenderingContext2D, c, layout, fakeDoc(docOpts));
  const stages = Cnv.made.slice(1); // Cnv.made[0] is the scratch canvas used to measure the header text
  return { drawn, page, stages };
}
const stagedImage = (stage: Cnv) => stage.ctx.calls.find((c) => c.op === "drawImage")?.args as [string, number, number, number, number] | undefined;

describe("fallback rules", () => {
  it("neither crest (undefined, nulls, closed or empty images): nothing is drawn — not a single canvas call on the page", () => {
    for (const c of [undefined, crests(null, null), crests(closed("a"), closed("b")), crests(art("z", 0, 0), null)]) {
      const r = run(c);
      expect(r.drawn).toBe(false);
      expect(r.page.calls).toEqual([]);
      expect(Cnv.made).toHaveLength(0); // not even a scratch canvas
    }
  });

  it("both crests: both drawn, Home at x 140 and Away at x 1780, each composited once", () => {
    const r = run(crests(art("home", 300, 400), art("away", 512, 512)));
    expect(r.drawn).toBe(true);
    const composites = r.page.calls.filter((c) => c.op === "drawImage");
    expect(composites.map((c) => c.args)).toEqual([["#stage1", PDF_HOME_CREST_CX - 100, PDF_CREST_CY - 100], ["#stage2", PDF_AWAY_CREST_CX - 100, PDF_CREST_CY - 100]]);
    expect(stagedImage(r.stages[0])![0]).toBe("#home");
    expect(stagedImage(r.stages[1])![0]).toBe("#away");
  });

  it("Home crest only: Away gets its monogram in its own colours", () => {
    const r = run(crests(art("home", 300, 400), null, { awayColours: { primary: "#7c3aed", secondary: "#ffffff" } }));
    expect(r.drawn).toBe(true);
    expect(stagedImage(r.stages[0])![0]).toBe("#home");
    expect(stagedImage(r.stages[1])).toBeUndefined();
    expect(r.stages[1].ctx.calls.find((c) => c.op === "fillText")?.args[0]).toBe(teamMonogram("Galbally"));
    expect(r.stages[1].ctx.calls.find((c) => c.op === "fill")?.args[0]).toBe("#7c3aed");
  });

  it("Away crest only: Home gets its monogram (default Home colour when the squad has none)", () => {
    const r = run(crests(null, art("away", 512, 256)));
    expect(stagedImage(r.stages[1])![0]).toBe("#away");
    expect(r.stages[0].ctx.calls.find((c) => c.op === "fillText")?.args[0]).toBe("B");
    expect(r.stages[0].ctx.calls.find((c) => c.op === "fill")?.args[0]).toBe("#16a34a");
  });
});

describe("natural shape and placement (hand-computed sizes, box 140 × 136, area ≤ 120²)", () => {
  const size = (w: number, h: number) => {
    const r = run(crests(art("c", w, h), art("d", w, h)));
    const [, x, y, sw, sh] = stagedImage(r.stages[0])!;
    return { x, y, w: sw, h: sh };
  };
  it("circle 512² → 120 × 120; tall shield 300 × 400 → 102 × 136; wide 512 × 256 → 140 × 70", () => {
    const circle = size(512, 512);
    expect(circle.w).toBeCloseTo(120, 3); expect(circle.h).toBeCloseTo(120, 3);
    const shield = size(300, 400);
    expect(shield.w).toBeCloseTo(102, 3); expect(shield.h).toBeCloseTo(136, 3);
    const wide = size(512, 256);
    expect(wide.w).toBeCloseTo(140, 3); expect(wide.h).toBeCloseTo(70, 3);
  });
  it("aspect ratio is always the artwork's own; the crest is centred on its staging canvas and so on (140, 158)", () => {
    for (const [w, h] of [[512, 512], [300, 400], [512, 256], [37, 511], [511, 40]]) {
      const s = size(w, h);
      expect(s.w / s.h).toBeCloseTo(w / h, 9);
      expect(s.x + s.w / 2).toBeCloseTo(100, 9);
      expect(s.y + s.h / 2).toBeCloseTo(100, 9);
    }
  });
  it("vertically the crests stay inside the score header (below the y 74 rule, above the y 240 divider)", () => {
    for (const [w, h] of [[300, 400], [37, 511]]) {
      const s = size(w, h);
      expect(PDF_CREST_CY - 100 + s.y).toBeGreaterThan(74);
      expect(PDF_CREST_CY - 100 + s.y + s.h).toBeLessThan(240);
    }
  });
});

describe("long names: crests shrink together, or are left out — never overlap", () => {
  const name = (n: number) => "Ballylanders Naomh Abán Baile Átha Cliath".padEnd(n, "x").slice(0, n);

  it("a realistic long 22-character name leaves full-size crests", () => {
    expect(planPdfScoreCrests(new Ctx("p") as unknown as CanvasRenderingContext2D, crests(art("a", 1, 1), art("b", 1, 1)), summary(name(22), name(22)))?.scale).toBe(1);
  });

  it("a wider name shrinks BOTH crests by the same factor and keeps a 16 px gap", () => {
    const layout = summary(name(24), "Galbally"); // 24 × 24.2 px = 581 px wide
    const plan = planPdfScoreCrests(new Ctx("p") as unknown as CanvasRenderingContext2D, crests(art("a", 1, 1), art("b", 1, 1)), layout)!;
    expect(plan.scale).toBeLessThan(1);
    const crestHalf = (140 * plan.scale) / 2;
    const nameLeft = 496 - (24 * 44 * 0.55) / 2;
    expect(PDF_HOME_CREST_CX + crestHalf).toBeLessThanOrEqual(nameLeft - PDF_CREST_GAP + 1e-9);
    const r = run(crests(art("a", 512, 512), art("b", 512, 512)), layout);
    expect(stagedImage(r.stages[0])![3]).toBeCloseTo(stagedImage(r.stages[1])![3], 9); // balanced
  });

  it("when crests would have to be smaller than 64 px they are left out and the page is untouched", () => {
    const r = run(crests(art("a", 512, 512), art("b", 512, 512)), summary(name(26), "Galbally"));
    expect(r.drawn).toBe(false);
    expect(r.page.calls).toEqual([]);
  });
});

describe("failure safety: never throws, never draws a partial header", () => {
  it("a crest whose image fails to draw: nothing reaches the page, the function returns false", () => {
    const r = run(crests(art("home", 300, 400), art("broken", 300, 400)), summary(), { throwOn: "broken" });
    expect(r.drawn).toBe(false);
    expect(r.page.calls.filter((c) => c.op === "drawImage")).toEqual([]);
  });
  it("no canvas context for staging: returns false, page untouched", () => {
    const r = run(crests(art("home", 300, 400), art("away", 300, 400)), summary(), { noContext: true });
    expect(r.drawn).toBe(false);
    expect(r.page.calls).toEqual([]);
  });
  it("text measuring throws: returns false, and the page is never touched (measuring uses a scratch canvas)", () => {
    const page = new Ctx("page");
    page.font = "bold 33px sans-serif";
    const doc = fakeDoc();
    const make = doc.createElement.bind(doc);
    (doc as unknown as { createElement: () => unknown }).createElement = () => {
      const c = make("canvas") as unknown as Cnv;
      c.ctx.measureText = () => { throw new Error("boom"); };
      return c;
    };
    expect(drawPdfScoreCrests(page as unknown as CanvasRenderingContext2D, crests(art("a", 1, 1), null), summary(), doc)).toBe(false);
    expect(page.calls).toEqual([]);
    expect(page.font).toBe("bold 33px sans-serif");
  });
  it("staging canvases are released after drawing and after failures", () => {
    run(crests(art("a", 300, 400), art("b", 300, 400)));
    expect(Cnv.made.map((s) => s.width)).toEqual([0, 0, 0]);
    run(crests(art("a", 300, 400), art("broken", 300, 400)), summary(), { throwOn: "broken" });
    expect(Cnv.made.map((s) => s.width)).toEqual(Cnv.made.map(() => 0));
  });
  it("dark crests get the subtle glow on their staging canvas (inside its 200 px bounds)", () => {
    const r = run(crests(art("dark", 512, 512, true), art("light", 512, 512)));
    expect(r.stages[0].ctx.calls.some((c) => c.op === "radial")).toBe(true);
    expect(r.stages[1].ctx.calls.some((c) => c.op === "radial")).toBe(false);
    const glowArc = r.stages[0].ctx.calls.find((c) => c.op === "arc")!.args as number[];
    expect(glowArc[2]).toBeLessThan(100); // radius stays on the staging canvas
  });
});
