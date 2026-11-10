import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import {
  DASHBOARD_HEIGHT,
  DASHBOARD_WIDTH,
  MAX_WRAPPED_NAME_SIZE,
  MIN_NAME_SIZE,
  drawHtFtDashboard,
  fitText,
  renderHtFtDashboardPng,
} from "./htFtDashboardRenderer";
import { buildHtFtDashboardView, type HtFtDashboardSource } from "./htFtDashboardView";

// ─── Test-only recording context ───────────────────────────────────────────────
// Node has no canvas: this records fillText calls with a deterministic
// measureText (0.55 × font size per character) so layout can be asserted.
const CHAR_W = 0.55;

type TextCall = { text: string; x: number; y: number; size: number; left: number; right: number; color: string };

function sizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 10;
}

function recordingContext() {
  const texts: TextCall[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif", textAlign: "left" };
  const methods: Record<string, (...args: never[]) => unknown> = {
    measureText: (t: string) => ({ width: [...t].length * sizeOf(String(state.font)) * CHAR_W }),
    fillText: (t: string, x: number, y: number) => {
      const size = sizeOf(String(state.font));
      const width = [...t].length * size * CHAR_W;
      const align = state.textAlign;
      const left = align === "center" ? x - width / 2 : align === "right" || align === "end" ? x - width : x;
      texts.push({ text: t, x, y, size, left, right: left + width, color: String(state.fillStyle) });
    },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in methods) return methods[prop];
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function ev(id: string, kind: LoggedMatchEvent["kind"], teamSide: "FOR" | "OPP", period: "1H" | "2H" = "1H"): LoggedMatchEvent {
  return { id, kind, type: kind, teamSide, period, half: period === "1H" ? 1 : 2, nx: 0.5, ny: 0.5, x: 0.5, y: 0.5, segment: 1, timestamp: 1, matchClockSeconds: 1, createdAt: 1 } as LoggedMatchEvent;
}

const EVENTS = [ev("g", "GOAL", "FOR"), ev("p", "POINT", "OPP"), ev("w", "WIDE", "OPP"), ev("k", "KICKOUT_WON", "FOR")];

function source(over: Partial<HtFtDashboardSource> = {}): HtFtDashboardSource {
  return {
    events: EVENTS,
    matchState: "FULL_TIME",
    sport: "gaelic",
    homeTeamName: "Ballylanders",
    awayTeamName: "Galbally",
    venue: "Ballylanders GAA Grounds",
    matchType: "league",
    createdAt: new Date(2026, 10, 7).getTime(),
    homeColours: { primary: "#facc15", secondary: "#15803d" },
    awayColours: { primary: "#7f1d1d", secondary: "#ffffff" },
    ...over,
  };
}

const LONG_IRISH = {
  homeTeamName: "Cumann Lúthchleas Gael Ó Donnabháin Rossa",
  awayTeamName: "Na Piarsaigh Hurling and Camogie Club Luimneach",
  venue: "Páirc Uí Chaoimh, Baile an Chollaigh, Corcaigh — Pitch 2 (Back Field)",
};

function draw(over: Partial<HtFtDashboardSource> = {}, period: "HT" | "FT" = "FT") {
  const rec = recordingContext();
  const view = buildHtFtDashboardView(source(over), period);
  drawHtFtDashboard(rec.ctx, view);
  return { ...rec, view };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("drawHtFtDashboard layout", () => {
  it.each([
    ["short names", {}],
    ["long Irish names with fadas", LONG_IRISH],
    ["single unbroken long word", { homeTeamName: "Ballinasloughmacgillicuddyreeksclub", awayTeamName: "X" }],
  ])("keeps every line of text inside the 1080×1350 frame (%s)", (_label, over) => {
    for (const period of ["HT", "FT"] as const) {
      const { texts } = draw(over, period);
      expect(texts.length).toBeGreaterThan(10);
      for (const t of texts) {
        expect(t.left, t.text).toBeGreaterThanOrEqual(0);
        expect(t.right, t.text).toBeLessThanOrEqual(DASHBOARD_WIDTH);
        expect(t.y, t.text).toBeGreaterThan(0);
        expect(t.y, t.text).toBeLessThanOrEqual(DASHBOARD_HEIGHT);
      }
    }
  });

  it("team names stay readable (≥ minimum size), at most 2 lines, inside their column, fadas intact", () => {
    const { texts } = draw(LONG_IRISH);
    const nameLines = texts.filter((t) => t.y > 330 && t.y < 420);
    const home = nameLines.filter((t) => t.x === 290);
    const away = nameLines.filter((t) => t.x === DASHBOARD_WIDTH - 290);
    expect(home.length).toBeGreaterThanOrEqual(1);
    expect(home.length).toBeLessThanOrEqual(2);
    expect(away.length).toBeLessThanOrEqual(2);
    for (const t of [...home, ...away]) {
      expect(t.size).toBeGreaterThanOrEqual(MIN_NAME_SIZE);
      expect(t.size).toBeLessThanOrEqual(MAX_WRAPPED_NAME_SIZE);
      expect(t.right - t.left).toBeLessThanOrEqual(420);
    }
    expect(home.map((t) => t.text).join(" ")).toContain("Lúthchleas");
    expect(home.map((t) => t.text).join(" ")).toContain("Ó Donnabháin");
  });

  it("two-line names never reach the score digits", () => {
    const { texts, view } = draw(LONG_IRISH);
    const score = texts.find((t) => t.text === view.home.scoreText)!;
    const lastNameLine = Math.max(...texts.filter((t) => t.y > 330 && t.y < 420 && t.x === 290).map((t) => t.y));
    // Score glyph top ≈ baseline − 0.75 × size; name descenders ≈ baseline + 0.25 × size.
    expect(score.y - score.size * 0.75).toBeGreaterThan(lastNameLine + 10);
  });

  it("draws both scorelines, the stage label, the attributed panels and PáircVision branding", () => {
    const { texts, view } = draw({}, "HT");
    const all = texts.map((t) => t.text);
    expect(all).toContain("HALF-TIME");
    expect(all).toContain(view.home.scoreText);
    expect(all).toContain(view.away.scoreText);
    expect(all).toContain("SHOOTING ACCURACY");
    expect(all).toContain("OWN KICKOUTS RETAINED");
    expect(all).toContain("TURNOVERS WON");
    expect(all.filter((t) => t === "Páirc").length).toBe(2); // header + footer
    // Every stat panel names both teams.
    expect(all.filter((t) => t === "Ballylanders").length).toBeGreaterThanOrEqual(4);
    expect(all.filter((t) => t === "Galbally").length).toBeGreaterThanOrEqual(4);
  });

  it("hurling draws puckout wording and never 'kickout'", () => {
    const { texts } = draw({ sport: "hurling" });
    const all = texts.map((t) => t.text.toLowerCase());
    expect(all).toContain("own puckouts retained");
    expect(all.some((t) => t.includes("kickout"))).toBe(false);
  });

  it("draws the no-data dash muted, and the restart-owner note when takers are unknown", () => {
    const { texts, view } = draw({ events: [ev("k", "KICKOUT_WON", "FOR")] });
    expect(view.restartOwnerNote).not.toBeNull();
    expect(texts.map((t) => t.text)).toContain(view.restartOwnerNote);
    const dashes = texts.filter((t) => t.text === "—");
    expect(dashes.length).toBeGreaterThan(0);
    for (const d of dashes) expect(d.color).not.toBe("#f8fafc");
    expect(texts.some((t) => t.text.includes("%") && t.y > 700)).toBe(false);
  });

  it("omits the metadata line when the match has none", () => {
    const { texts } = draw({ venue: "", matchType: undefined, createdAt: undefined });
    expect(texts.some((t) => t.y === 682)).toBe(false);
  });
});

describe("fitText", () => {
  it("shrinks before wrapping, and truncates with … only as a last resort", () => {
    const { ctx } = recordingContext();
    expect(fitText(ctx, "Galbally", 420, { weight: 700, maxSize: 46, minSize: 28, maxLines: 2 })).toEqual({ size: 46, lines: ["Galbally"] });
    const wrapped = fitText(ctx, "Na Piarsaigh Hurling and Camogie Club Luimneach", 420, { weight: 700, maxSize: 46, minSize: 28, maxLines: 2 });
    expect(wrapped.lines.length).toBe(2);
    const forced = fitText(ctx, "a ".repeat(200), 100, { weight: 700, maxSize: 30, minSize: 20, maxLines: 2 });
    expect(forced.lines.length).toBe(2);
    expect(forced.lines[1].endsWith("…")).toBe(true);
    for (const l of forced.lines) expect([...l].length * 20 * CHAR_W).toBeLessThanOrEqual(100);
  });
});

describe("renderHtFtDashboardPng", () => {
  function fakeDoc(opts: { ctx?: boolean; blob?: Blob | null } = {}) {
    const canvases: { width: number; height: number; sizeAtEncode?: [number, number] }[] = [];
    const doc = {
      createElement: (tag: string) => {
        expect(tag).toBe("canvas");
        const c: { width: number; height: number; sizeAtEncode?: [number, number]; getContext: () => unknown; toBlob: (cb: (b: Blob | null) => void, type: string) => void } = {
          width: 0,
          height: 0,
          getContext: () => (opts.ctx === false ? null : recordingContext().ctx),
          toBlob: (cb, type) => {
            expect(type).toBe("image/png");
            c.sizeAtEncode = [c.width, c.height];
            cb(opts.blob === undefined ? new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }) : opts.blob);
          },
        };
        canvases.push(c);
        return c;
      },
    } as unknown as Document;
    return { doc, canvases };
  }

  it("produces a 1080 × 1350 PNG File named for the match and period", async () => {
    const { doc, canvases } = fakeDoc();
    const view = buildHtFtDashboardView(source({ homeTeamName: "Éire Óg" }), "HT");
    const file = await renderHtFtDashboardPng(view, doc);
    expect(canvases[0].sizeAtEncode).toEqual([1080, 1350]);
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(0);
    expect(file.name).toBe("eire-og-v-galbally-ht-dashboard.png");
  });

  it("fails clearly when the canvas is unavailable or encoding fails", async () => {
    const view = buildHtFtDashboardView(source(), "FT");
    await expect(renderHtFtDashboardPng(view, fakeDoc({ ctx: false }).doc)).rejects.toThrow(/Canvas is not available/);
    await expect(renderHtFtDashboardPng(view, fakeDoc({ blob: null }).doc)).rejects.toThrow(/Couldn't create/);
    await expect(renderHtFtDashboardPng(view, fakeDoc({ blob: new Blob([]) }).doc)).rejects.toThrow(/Couldn't create/);
  });
});
