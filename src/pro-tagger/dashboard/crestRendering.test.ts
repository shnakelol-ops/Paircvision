import { describe, expect, it } from "vitest";

import type { CrestArtwork, MatchCrests } from "../crest/crest-artwork";
import { NO_CRESTS } from "../crest/crest-artwork";
import { DASHBOARD_CREST_SIZE, MAP_CREST_SIZE, crestRect, drawCrest, fitCrest, isDrawableCrest } from "./crestDraw";
import { drawHtFtDashboard } from "./htFtDashboardRenderer";
import { buildHtFtDashboardView } from "./htFtDashboardView";
import { mapSourceFromSavedMatch } from "./matchMapPerspective";
import { drawScoringMap, drawTurnoverMap } from "./matchMapRenderer";
import { ftFixtureMatch, htFixtureMatch } from "./matchMapTestFixtures";
import { buildScoringMapView } from "./scoringMapView";
import { buildTurnoverMapView } from "./turnoverMapView";

// ─── Recording context: every call and property write, in order ──────────────

type Call = { op: string; args: unknown[] };

function sizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 10;
}

function recorder() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif", textAlign: "left" };
  const tag = (v: unknown) => (v && typeof v === "object" && "tag" in (v as object) ? `img:${(v as { tag: string }).tag}` : v);
  const gradient = (kind: string) => () => ({ addColorStop: (o: number, c: string) => calls.push({ op: `${kind}.stop`, args: [o, c] }) });
  const special: Record<string, (...a: never[]) => unknown> = {
    measureText: (t: string) => ({ width: [...t].length * sizeOf(String(state.font)) * 0.55 }),
    createLinearGradient: gradient("linear"),
    createRadialGradient: gradient("radial"),
  };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in special) {
        return (...args: never[]) => {
          calls.push({ op: prop, args });
          return special[prop](...args);
        };
      }
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ op: prop, args: args.map(tag) });
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push({ op: `set:${prop}`, args: [typeof value === "object" ? "[object]" : value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, texts: () => calls.filter((c) => c.op === "fillText").map((c) => ({ text: String(c.args[0]), x: Number(c.args[1]), y: Number(c.args[2])})) };
}

function crest(tag: string, width: number, height: number, needsBacking = false): CrestArtwork {
  return { image: { tag, width, height } as unknown as CanvasImageSource, width, height, needsBacking, key: `${tag}:1` };
}
const closed = (tag: string): CrestArtwork => ({ ...crest(tag, 300, 400), image: { tag, width: 0, height: 0 } as unknown as CanvasImageSource });

const drawImages = (calls: Call[]) => calls.filter((c) => c.op === "drawImage");
const box = (cx: number, cy: number, size: typeof DASHBOARD_CREST_SIZE | typeof MAP_CREST_SIZE) => ({ cx, cy, ...size });
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 2);

// ─── Optical sizing (hand-computed expectations) ──────────────────────────────

describe("crest sizing — natural shape, consistent optical weight", () => {
  it("Dashboard box (≤ 180 × 140, area ≤ 124²)", () => {
    const circle = fitCrest(512, 512, DASHBOARD_CREST_SIZE); // area cap
    close(circle.width, 124); close(circle.height, 124);
    const shield = fitCrest(300, 400, DASHBOARD_CREST_SIZE); // height cap
    close(shield.width, 105); close(shield.height, 140);
    const wide = fitCrest(512, 256, DASHBOARD_CREST_SIZE); // area cap: 175.36 × 87.68 = 124²
    close(wide.width, 175.36); close(wide.height, 87.68);
    const banner = fitCrest(512, 100, DASHBOARD_CREST_SIZE); // width cap
    close(banner.width, 180); close(banner.height, 35.16);
  });

  it("Map box (≤ 140 × 150, area ≤ 118²)", () => {
    const circle = fitCrest(512, 512, MAP_CREST_SIZE);
    close(circle.width, 118); close(circle.height, 118);
    const shield = fitCrest(300, 400, MAP_CREST_SIZE); // area cap: 102.19 × 136.25
    close(shield.width, 102.19); close(shield.height, 136.25);
    const wide = fitCrest(512, 256, MAP_CREST_SIZE); // width cap
    close(wide.width, 140); close(wide.height, 70);
  });

  it("never distorts: the drawn aspect ratio always equals the artwork's", () => {
    for (const [w, h] of [[512, 512], [300, 400], [512, 256], [512, 100], [37, 511], [1, 1], [511, 3]]) {
      for (const size of [DASHBOARD_CREST_SIZE, MAP_CREST_SIZE]) {
        const f = fitCrest(w, h, size);
        expect(f.width / f.height).toBeCloseTo(w / h, 9);
        expect(f.width).toBeLessThanOrEqual(size.maxW + 1e-9);
        expect(f.height).toBeLessThanOrEqual(size.maxH + 1e-9);
        expect(f.width * f.height).toBeLessThanOrEqual(size.targetSide ** 2 + 1e-6);
      }
    }
  });

  it("is centred in its box", () => {
    const r = crestRect({ width: 300, height: 400 }, box(290, 248, DASHBOARD_CREST_SIZE));
    expect(r).toEqual({ x: 290 - 52.5, y: 248 - 70, width: 105, height: 140 });
  });
});

describe("drawCrest", () => {
  it("draws the whole image, with no frame, mask or clip", () => {
    const { ctx, calls } = recorder();
    expect(drawCrest(ctx, crest("c", 300, 400), box(136, 247, MAP_CREST_SIZE))).toBe(true);
    const ops = calls.map((c) => c.op);
    expect(ops).not.toContain("clip");
    expect(ops).not.toContain("stroke");
    expect(ops).not.toContain("arc");
    expect(drawImages(calls)).toHaveLength(1);
    const [img, x, y, w, h] = drawImages(calls)[0].args as [string, number, number, number, number];
    expect(img).toBe("img:c");
    close(x + w / 2, 136); close(y + h / 2, 247);
    // 5-argument form: the whole source image, never a cropped source rectangle.
    expect(drawImages(calls)[0].args).toHaveLength(5);
  });

  it("dark crests get a very subtle radial glow behind them; others get none", () => {
    const dark = recorder();
    drawCrest(dark.ctx, crest("d", 100, 100, true), box(0, 0, MAP_CREST_SIZE));
    const ops = dark.calls.map((c) => c.op);
    expect(ops.indexOf("createRadialGradient")).toBeLessThan(ops.indexOf("drawImage"));
    expect(dark.calls.find((c) => c.op === "radial.stop")?.args[1]).toBe("rgba(255,255,255,0.16)");
    const light = recorder();
    drawCrest(light.ctx, crest("l", 100, 100, false), box(0, 0, MAP_CREST_SIZE));
    expect(light.calls.map((c) => c.op)).not.toContain("createRadialGradient");
  });

  it("draws nothing and returns false for a missing, empty or closed (released) image", () => {
    for (const c of [null, undefined, crest("z", 0, 10), closed("x")]) {
      const { ctx, calls } = recorder();
      expect(drawCrest(ctx, c, box(0, 0, MAP_CREST_SIZE))).toBe(false);
      expect(calls).toEqual([]);
    }
    expect(isDrawableCrest({ ...crest("n", 10, 10), image: { naturalWidth: 0, naturalHeight: 0 } as unknown as CanvasImageSource })).toBe(false);
    expect(isDrawableCrest({ ...crest("n", 10, 10), image: { naturalWidth: 10, naturalHeight: 10 } as unknown as CanvasImageSource })).toBe(true);
  });
});

// ─── Pages ─────────────────────────────────────────────────────────────────────

const SOURCE = mapSourceFromSavedMatch(ftFixtureMatch());
const HT_SOURCE = mapSourceFromSavedMatch(htFixtureMatch());
const DASH = buildHtFtDashboardView(SOURCE, "FT");
const BALLY = crest("ballylanders", 300, 400); // tall shield
const GALB = crest("galbally", 512, 512, true); // circular, dark

function dashboardLog(crests?: MatchCrests) {
  const r = recorder();
  drawHtFtDashboard(r.ctx, DASH, crests);
  return r;
}

describe("Dashboard crests", () => {
  it("monogram-only output is unchanged: no crests, NO_CRESTS and unusable crests all draw the identical monogram design", () => {
    const base = dashboardLog().calls;
    expect(dashboardLog(NO_CRESTS).calls).toEqual(base);
    expect(dashboardLog({ home: closed("a"), away: crest("b", 0, 0) }).calls).toEqual(base);
    expect(drawImages(base)).toHaveLength(0);
    expect(base.some((c) => c.op === "fillText" && c.args[0] === "B")).toBe(true);
    expect(base.some((c) => c.op === "fillText" && c.args[0] === "G")).toBe(true);
  });

  it("both crests replace both monograms, Home at x 290 and Away at x 790", () => {
    const { calls } = dashboardLog({ home: BALLY, away: GALB });
    const imgs = drawImages(calls).map((c) => c.args as [string, number, number, number, number]);
    expect(imgs.map((a) => a[0])).toEqual(["img:ballylanders", "img:galbally"]);
    close(imgs[0][1] + imgs[0][3] / 2, 290);
    close(imgs[1][1] + imgs[1][3] / 2, 790);
    expect(calls.some((c) => c.op === "fillText" && (c.args[0] === "B" || c.args[0] === "G"))).toBe(false);
  });

  it("one crest: that side shows it, the other keeps its monogram", () => {
    const { calls } = dashboardLog({ home: null, away: GALB });
    expect(drawImages(calls).map((c) => c.args[0])).toEqual(["img:galbally"]);
    expect(calls.some((c) => c.op === "fillText" && c.args[0] === "B")).toBe(true);
    expect(calls.some((c) => c.op === "fillText" && c.args[0] === "G")).toBe(false);
  });

  it("only the identity graphic changes: every other text (names, scores, stats, labels) is identical", () => {
    const strip = (r: ReturnType<typeof recorder>) => r.texts().filter((t) => t.text !== "B" && t.text !== "G");
    expect(strip(dashboardLog({ home: BALLY, away: GALB }))).toEqual(strip(dashboardLog()));
  });

  it("crests of every shape stay clear of the names, scores and centre divider", () => {
    const texts = dashboardLog().texts();
    const below = texts.filter((t) => t.y > 330 && t.y < 600); // names and scores
    expect(below.length).toBeGreaterThan(0);
    for (const art of [crest("c", 512, 512), crest("t", 300, 400), crest("w", 512, 256), crest("b", 512, 100), crest("s", 37, 511)]) {
      for (const cx of [290, 790]) {
        const r = crestRect(art, box(cx, 248, DASHBOARD_CREST_SIZE));
        expect(r.y).toBeGreaterThanOrEqual(150); // inside the score panel (top 140)
        // Name glyph tops sit at least ~0.8 × size above the baseline; the largest name is 46 px at baseline 388,
        // and a wrapped name starts at 360 with ≤ 36 px: both tops are below 330.
        expect(r.y + r.height).toBeLessThanOrEqual(320);
        expect(Math.abs(r.x + r.width / 2 - 540)).toBeGreaterThan(r.width / 2 + 60); // never near the divider
      }
    }
  });
});

describe("Scoring Map and Turnover Map crests", () => {
  const views = [
    ["Scoring FT Ballylanders", (c?: CrestArtwork | null) => { const r = recorder(); drawScoringMap(r.ctx, buildScoringMapView(SOURCE, "FOR", "FT"), c); return r; }, "SCORING MAP"],
    ["Scoring HT Galbally", (c?: CrestArtwork | null) => { const r = recorder(); drawScoringMap(r.ctx, buildScoringMapView(HT_SOURCE, "OPP", "HT"), c); return r; }, "SCORING MAP"],
    ["Turnover FT Ballylanders", (c?: CrestArtwork | null) => { const r = recorder(); drawTurnoverMap(r.ctx, buildTurnoverMapView(SOURCE, "FOR", "FT"), c); return r; }, "TURNOVER MAP"],
    ["Turnover HT Galbally", (c?: CrestArtwork | null) => { const r = recorder(); drawTurnoverMap(r.ctx, buildTurnoverMapView(HT_SOURCE, "OPP", "HT"), c); return r; }, "TURNOVER MAP"],
  ] as const;

  for (const [label, draw, title] of views) {
    it(`${label}: monogram-only output unchanged; the crest replaces only the badge, everything else identical`, () => {
      const base = draw().calls;
      expect(draw(null).calls).toEqual(base);
      expect(draw(closed("x")).calls).toEqual(base);

      const withCrest = draw(BALLY).calls;
      expect(drawImages(withCrest)).toHaveLength(1);
      const [, x, y, w, h] = drawImages(withCrest)[0].args as [string, number, number, number, number];
      close(x + w / 2, 136);
      close(y + h / 2, 247);
      expect(x + w).toBeLessThan(228); // clear of the banner text column (x = 228)

      // Before the badge: identical. From the page title onwards (text, pitch,
      // markers, thirds, legend, captions): identical, call for call.
      const titleAt = (calls: typeof base) => calls.findIndex((c) => c.op === "fillText" && c.args[0] === title);
      const badgeStart = (calls: typeof base) => {
        // The banner panel is the last roundRect-path fill before the badge; both logs share everything up to it.
        let i = 0;
        while (i < calls.length && JSON.stringify(calls[i]) === JSON.stringify(withCrest[i])) i++;
        return i;
      };
      const split = badgeStart(base);
      expect(split).toBeGreaterThan(0);
      expect(withCrest.slice(0, split)).toEqual(base.slice(0, split));
      expect(withCrest.slice(titleAt(withCrest))).toEqual(base.slice(titleAt(base)));
    });
  }

  it("every crest shape stays inside the banner and clear of the text column", () => {
    for (const art of [crest("c", 512, 512), crest("t", 300, 400), crest("w", 512, 256), crest("b", 512, 100), crest("s", 37, 511)]) {
      const r = crestRect(art, box(136, 247, MAP_CREST_SIZE));
      expect(r.x).toBeGreaterThanOrEqual(48 + 8); // banner panel starts at x 48
      expect(r.x + r.width).toBeLessThanOrEqual(228 - 20);
      expect(r.y).toBeGreaterThan(140);
      expect(r.y + r.height).toBeLessThan(354);
    }
  });
});
