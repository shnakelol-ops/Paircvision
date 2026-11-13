import { describe, expect, it } from "vitest";
import { pitchThirdOf, projectToPortrait, mapSourceFromSavedMatch, type MapTeamSide } from "./matchMapPerspective";
import {
  MAP_HEIGHT,
  PITCH_THIRD_LABELS,
  drawPitchThirds,
  pitchThirdLabelBoxes,
  thirdLabelMaxWidth,
  pitchThirdRects,
  MAP_WIDTH,
  SHOT_MARKER_COLOURS,
  SHOT_MARKER_R,
  TURNOVER_LOST_COLOUR,
  TURNOVER_WON_COLOUR,
  drawScoringMap,
  drawShotMarker,
  drawTurnoverMap,
  framePoint,
  mapFilename,
  pitchFrame,
  renderScoringMapPng,
  renderTurnoverMapPng,
  resolveTeam,
  scoringPitchExtent,
  selectedScoreLine,
} from "./matchMapRenderer";
import { HT_FIXTURE, ev, ftFixtureMatch, htFixtureMatch, savedMatch } from "./matchMapTestFixtures";
import { buildScoringMapView, type ScoringMapView } from "./scoringMapView";
import { buildTurnoverMapView } from "./turnoverMapView";

// ─── Test-only recording context ──────────────────────────────────────────────
// Records drawing operations (with the style in force) and text, with a
// deterministic measureText (0.55 × font size per character).
const CHAR_W = 0.55;
type Op = { op: string; args: number[]; fill: string; stroke: string };
type TextCall = { text: string; left: number; right: number; top: number; y: number; size: number; color: string; font: string };

function sizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 10;
}

function recordingContext() {
  const ops: Op[] = [];
  const texts: TextCall[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif", textAlign: "left", fillStyle: "", strokeStyle: "" };
  const record = (op: string) => (...args: number[]) => {
    ops.push({ op, args, fill: String(state.fillStyle), stroke: String(state.strokeStyle) });
  };
  // translate / rotate are tracked (rotation only in quarter turns, which is
  // all the renderer uses for text) so rotated text is recorded where it
  // really lands on the canvas.
  let tf = { tx: 0, ty: 0, rot: 0 };
  const stack: (typeof tf)[] = [];
  const methods: Record<string, (...args: never[]) => unknown> = {
    measureText: (t: string) => ({ width: [...t].length * sizeOf(String(state.font)) * CHAR_W }),
    save: () => { stack.push({ ...tf }); },
    restore: () => { tf = stack.pop() ?? { tx: 0, ty: 0, rot: 0 }; },
    translate: (x: number, y: number) => { tf = { ...tf, tx: tf.tx + x, ty: tf.ty + y }; },
    rotate: (a: number) => { tf = { ...tf, rot: tf.rot + a }; },
    fillText: (t: string, x: number, y: number) => {
      const size = sizeOf(String(state.font));
      const width = [...t].length * size * CHAR_W;
      if (Math.abs(tf.rot + Math.PI / 2) < 1e-9) {
        // Reads bottom-to-top from the (translated) origin, left-aligned, middle baseline.
        const ox = tf.tx + y;
        const oy = tf.ty - x;
        texts.push({ text: t, left: ox - size / 2, right: ox + size / 2, top: oy - width, y: oy, size, color: String(state.fillStyle), font: String(state.font) });
        return;
      }
      const left = tf.tx + (state.textAlign === "center" ? x - width / 2 : state.textAlign === "right" ? x - width : x);
      texts.push({ text: t, left, right: left + width, top: tf.ty + y - size, y: tf.ty + y, size, color: String(state.fillStyle), font: String(state.font) });
    },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    arc: record("arc"),
    fillRect: record("fillRect"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    fill: record("fill"),
    stroke: record("stroke"),
    transform: record("transform"),
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
  return { ctx, ops, texts };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const ftSrc = () => mapSourceFromSavedMatch(ftFixtureMatch());
const htSrc = () => mapSourceFromSavedMatch(htFixtureMatch());

/** The pitch frame the Scoring Map used, recovered from the pitch transform it set. */
function recordedFrame(ops: Op[], pyMax: number) {
  const t = ops.find((o) => o.op === "transform")!;
  const [, b, c, , e, f] = t.args;
  expect(b).toBeCloseTo(-c, 10); // a rotation with uniform scale, never a mirror
  const scale = c;
  return { x: e, y: f - 160 * scale, w: 100 * scale, h: 160 * pyMax * scale, scale, pyMax };
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

describe("pitch geometry", () => {
  it("the pitch-marking transform and the marker projection are the same rotation", () => {
    const frame = pitchFrame({ x: 432, y: 374, w: 600, h: 700 }, 0.6);
    // Canvas transform the pitch is drawn with: (X, Y) → (x + sY, y + (160 − X)s).
    const viaTransform = (X: number, Y: number) => ({ x: frame.x + frame.scale * Y, y: frame.y + frame.scale * (160 - X) });
    for (const [X, Y] of [[160, 50], [150, 10], [100, 90], [120, 0], [90, 100]]) {
      const p = framePoint(frame, projectToPortrait({ nx: X / 160, ny: Y / 100 }));
      expect(p.x).toBeCloseTo(viaTransform(X, Y).x, 9);
      expect(p.y).toBeCloseTo(viaTransform(X, Y).y, 9);
    }
  });

  it("the scoring pitch shows at least the attacking 55% and never crops a shot", () => {
    expect(scoringPitchExtent([])).toBe(0.55);
    expect(scoringPitchExtent([{ px: 0.5, py: 0.2 }, null])).toBe(0.55);
    expect(scoringPitchExtent([{ px: 0.5, py: 0.58 }])).toBeCloseTo(0.65, 10);
    expect(scoringPitchExtent([{ px: 0.5, py: 0.99 }])).toBe(1);
    for (const py of [0.1, 0.5, 0.51, 0.7, 0.93, 1]) expect(scoringPitchExtent([{ px: 0, py }])).toBeGreaterThanOrEqual(py);
  });

  it("frames keep the pitch's aspect ratio inside their box", () => {
    const f = pitchFrame({ x: 0, y: 0, w: 600, h: 2000 }, 1);
    expect(f.w).toBe(600);
    expect(f.h).toBe(960);
    const g = pitchFrame({ x: 0, y: 0, w: 600, h: 480 }, 1);
    expect(g.h).toBe(480);
    expect(g.w).toBe(300);
  });
});

// ─── Markers land where the model says ───────────────────────────────────────

function expectShotMarkersAt(view: ScoringMapView) {
  const { ctx, ops } = recordingContext();
  drawScoringMap(ctx, view);
  const frame = recordedFrame(ops, scoringPitchExtent(view.markers.map((m) => m.point)));
  for (const m of view.markers) {
    const p = framePoint(frame, m.point!);
    if (m.outcome === "WIDE") {
      expect(ops.some((o) => o.op === "moveTo" && near(o.args[0], p.x - SHOT_MARKER_R * 0.85) && near(o.args[1], p.y - SHOT_MARKER_R * 0.85))).toBe(true);
    } else if (m.outcome === "GOAL") {
      // Hexagon: first vertex straight above the goal's centre, at the base radius.
      const idx = ops.findIndex((o) => o.op === "moveTo" && near(o.args[0], p.x) && near(o.args[1], p.y - SHOT_MARKER_R));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(ops.slice(idx).find((o) => o.op === "fill")!.fill).toBe(SHOT_MARKER_COLOURS.GOAL);
    } else {
      const idx = ops.findIndex((o) => o.op === "arc" && near(o.args[0], p.x) && near(o.args[1], p.y));
      expect(idx).toBeGreaterThanOrEqual(0);
      const fill = ops.slice(idx).find((o) => o.op === "fill")!.fill;
      const want: Record<string, string> = {
        GOAL: SHOT_MARKER_COLOURS.GOAL, POINT: SHOT_MARKER_COLOURS.POINT, TWO_POINT: SHOT_MARKER_COLOURS.TWO_POINT,
        BLOCKED: SHOT_MARKER_COLOURS.GREY, SHORT: SHOT_MARKER_COLOURS.SHORT,
      };
      if (want[m.outcome]) expect(fill).toBe(want[m.outcome]);
    }
  }
}

describe("Scoring Map markers", () => {
  for (const [label, src] of [["HT", htSrc], ["FT", ftSrc]] as const) {
    for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
      it(`${label} · ${side}: every shot at its projected position, in its colour`, () => {
        expectShotMarkersAt(buildScoringMapView(src(), side, label === "HT" ? "HT" : "FT"));
      });
    }
  }

  it("goal, wide, short, post, blocked and 'other' all draw", () => {
    const view = buildScoringMapView(
      mapSourceFromSavedMatch(savedMatch({
        events: [
          ev("GOAL", "FOR", { tags: ["PLAY"], nx: 0.95, ny: 0.5 }),
          ev("WIDE", "FOR", { tags: ["PLAY"], nx: 0.8, ny: 0.2 }),
          ev("SHOT", "FOR", { tags: ["SHORT"], nx: 0.7, ny: 0.3 }),
          ev("SHOT", "FOR", { tags: ["POST"], nx: 0.85, ny: 0.45 }),
          ev("SHOT", "FOR", { tags: ["BLOCK/SAVE"], nx: 0.9, ny: 0.6 }),
          ev("SHOT", "FOR", { tags: [], nx: 0.75, ny: 0.7 }),
        ],
      })),
      "FOR",
      "FT",
    );
    expect(view.markers.map((m) => m.outcome)).toEqual(["GOAL", "WIDE", "SHORT", "POST", "BLOCKED", "OTHER"]);
    expectShotMarkersAt(view);
  });

  it("post (grey ring + centre dot) is drawn differently from blocked / saved (solid grey)", () => {
    const post = recordingContext();
    drawShotMarker(post.ctx, "POST", 100, 100, 15);
    const blocked = recordingContext();
    drawShotMarker(blocked.ctx, "BLOCKED", 100, 100, 15);
    // Post: ring stroked in grey, and a second, small grey dot.
    const postArcs = post.ops.filter((o) => o.op === "arc");
    expect(postArcs).toHaveLength(2);
    expect(postArcs[1].args[2]).toBeLessThan(postArcs[0].args[2] / 2);
    expect(post.ops.some((o) => o.op === "stroke" && o.stroke === SHOT_MARKER_COLOURS.GREY)).toBe(true);
    expect(post.ops.find((o) => o.op === "fill")!.fill).not.toBe(SHOT_MARKER_COLOURS.GREY);
    // Blocked: one solid grey disc.
    expect(blocked.ops.filter((o) => o.op === "arc")).toHaveLength(1);
    expect(blocked.ops.find((o) => o.op === "fill")!.fill).toBe(SHOT_MARKER_COLOURS.GREY);
  });

  it("dropped short is a burgundy disc with a white downward arrow centred inside it", () => {
    const { ctx, ops } = recordingContext();
    drawShotMarker(ctx, "SHORT", 100, 100, SHOT_MARKER_R);
    const arcs = ops.filter((o) => o.op === "arc");
    expect(arcs).toHaveLength(1);
    expect(arcs[0].args.slice(0, 3)).toEqual([100, 100, SHOT_MARKER_R]);
    expect(ops.find((o) => o.op === "fill")!.fill).toBe("#641E39");
    const arrow = ops.filter((o) => o.op === "moveTo" || o.op === "lineTo");
    expect(arrow.length).toBeGreaterThan(0);
    for (const o of arrow) {
      expect(Math.hypot(o.args[0] - 100, o.args[1] - 100)).toBeLessThan(SHOT_MARKER_R);
    }
    expect(ops.some((o) => o.op === "stroke" && o.stroke === "#ffffff")).toBe(true);
  });

  it("goal is a plain orange regular hexagon, vertices top and bottom, Point-sized, centred, dark outline", () => {
    const { ctx, ops } = recordingContext();
    drawShotMarker(ctx, "GOAL", 100, 100, SHOT_MARKER_R);
    expect(ops.filter((o) => o.op === "arc")).toHaveLength(0);
    const verts = ops.filter((o) => o.op === "moveTo" || o.op === "lineTo").map((o) => [o.args[0], o.args[1]]);
    expect(verts).toHaveLength(6);
    expect(ops.filter((o) => o.op === "moveTo")).toHaveLength(1);
    // Every vertex on the Point marker's radius (same footprint as a Point, 1.0×), 60° apart.
    for (const [vx, vy] of verts) expect(Math.hypot(vx - 100, vy - 100)).toBeCloseTo(SHOT_MARKER_R, 9);
    // Vertices at top and bottom.
    expect(verts[0][0]).toBeCloseTo(100, 9);
    expect(verts[0][1]).toBeCloseTo(100 - SHOT_MARKER_R, 9);
    expect(verts[3][0]).toBeCloseTo(100, 9);
    expect(verts[3][1]).toBeCloseTo(100 + SHOT_MARKER_R, 9);
    // Centred on the goal's coordinates.
    expect(verts.reduce((a, v) => a + v[0], 0) / 6).toBeCloseTo(100, 9);
    expect(verts.reduce((a, v) => a + v[1], 0) / 6).toBeCloseTo(100, 9);
    const fills = ops.filter((o) => o.op === "fill");
    expect(fills).toHaveLength(1);
    expect(fills[0].fill).toBe("#F28C28");
    const strokes = ops.filter((o) => o.op === "stroke");
    expect(strokes).toHaveLength(1);
    expect(strokes[0].stroke).toBe("#0b1428");
    expect(ops.some((o) => o.op === "stroke" && o.stroke === "#ffffff")).toBe(false);
  });

  it("shot markers are ~25–30% smaller than turnover markers' base size", () => {
    expect(SHOT_MARKER_R / 15).toBeGreaterThanOrEqual(0.7);
    expect(SHOT_MARKER_R / 15).toBeLessThanOrEqual(0.75);
  });
});

describe("Turnover Map markers", () => {
  for (const [label, src, scope] of [["HT", htSrc, "HT"], ["FT", ftSrc, "FT"]] as const) {
    for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
      it(`${label} · ${side}: won = purple circle, lost = orange diamond, each at its projected position`, () => {
        const view = buildTurnoverMapView(src(), side, scope);
        const { ctx, ops } = recordingContext();
        drawTurnoverMap(ctx, view);
        const frame = recordedFrame(ops, 1);
        for (const m of view.markers) {
          const p = framePoint(frame, m.point!);
          if (m.outcome === "WON") {
            const idx = ops.findIndex((o) => o.op === "arc" && near(o.args[0], p.x) && near(o.args[1], p.y));
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(ops.slice(idx).find((o) => o.op === "fill")!.fill).toBe(TURNOVER_WON_COLOUR);
          } else {
            const idx = ops.findIndex((o) => o.op === "moveTo" && near(o.args[0], p.x) && near(o.args[1], p.y - 15 * 1.18));
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(ops.slice(idx).find((o) => o.op === "fill")!.fill).toBe(TURNOVER_LOST_COLOUR);
          }
        }
      });
    }
  }
});

// ─── Text: identity, figures, and nothing outside the frame ──────────────────

function allTexts(draw: (ctx: CanvasRenderingContext2D) => void) {
  const { ctx, texts } = recordingContext();
  draw(ctx);
  for (const t of texts) {
    expect(t.left).toBeGreaterThanOrEqual(0);
    expect(t.right).toBeLessThanOrEqual(MAP_WIDTH);
    expect(t.y).toBeGreaterThan(0);
    expect(t.top).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeLessThanOrEqual(MAP_HEIGHT);
  }
  return texts.map((t) => t.text);
}

describe("page content", () => {
  it("Scoring Map names the team, scope, page, score and figures (FT, Galbally)", () => {
    const view = buildScoringMapView(ftSrc(), "OPP", "FT");
    const t = allTexts((ctx) => drawScoringMap(ctx, view));
    for (const s of [
      "Galbally", "SCORING MAP", "FULL-TIME", "0-10 (10) v Ballylanders 0-12 (12)", "80%", "8 of 10 shots scored",
      "1st half 4/5 · 2nd half 4/5", "Galbally attacking ↑ · both halves", "SCORES BY SOURCE",
      "6 scores · 0-08 (8)", "2 scores · 0-02 (2)", "Two-point scores", "Hit the post", "Scoring Map · Event Stats",
    ]) expect(t).toContain(s);
    expect(t.some((s) => /placed.*accuracy|accuracy.*placed/i.test(s))).toBe(false);
  });

  it("Turnover Map names the team and shows totals, balance and methods (HT, Ballylanders)", () => {
    const view = buildTurnoverMapView(htSrc(), "FOR", "HT");
    const t = allTexts((ctx) => drawTurnoverMap(ctx, view));
    for (const s of [
      "Ballylanders", "TURNOVER MAP", "HALF-TIME", "3", "5", "−2", "WON BY · 3", "LOST BY · 5",
      "Tackle", "Opposition KP Error", "Dispossessed", "HP Error", "KP Error", "Team-relative view · first half",
    ]) expect(t).toContain(s);
    expect(t.some((s) => s.startsWith("1st "))).toBe(false); // no half split at HT
  });

  it("Turnover Map at FT shows each half on its own line (Galbally: won 5 + 5, lost 3 + 3)", () => {
    const t = allTexts((ctx) => drawTurnoverMap(ctx, buildTurnoverMapView(ftSrc(), "OPP", "FT")));
    for (const s of ["10", "6", "+4", "1st half 5", "2nd half 5", "1st half 3", "2nd half 3", "1st half +2", "2nd half +2"]) expect(t).toContain(s);
  });

  it("hurling: no two-point row; long Irish names stay inside the frame", () => {
    const longName = "Cumann Lúthchleas Gael Ó Donnabháin Rossa";
    const src = mapSourceFromSavedMatch(savedMatch({
      events: HT_FIXTURE.events.filter((e) => e.kind !== "TWO_POINTER"),
      sport: "hurling",
      homeTeamName: longName,
      awayTeamName: "Na Piarsaigh Hurling and Camogie Club Luimneach",
      venue: "Páirc Uí Chaoimh, Corcaigh",
    }));
    const t = allTexts((ctx) => drawScoringMap(ctx, buildScoringMapView(src, "FOR", "FT")));
    expect(t).not.toContain("Two-point scores");
    allTexts((ctx) => drawTurnoverMap(ctx, buildTurnoverMapView(src, "OPP", "FT")));
  });

  it("empty and degraded data say so honestly", () => {
    const empty = mapSourceFromSavedMatch(savedMatch({ events: [] }));
    const s = allTexts((ctx) => drawScoringMap(ctx, buildScoringMapView(empty, "FOR", "FT")));
    expect(s).toContain("No shots recorded");
    expect(s).toContain("—");
    expect(allTexts((ctx) => drawTurnoverMap(ctx, buildTurnoverMapView(empty, "FOR", "FT")))).toContain("No turnovers recorded");

    const base = savedMatch({
      events: [
        ev("POINT", "FOR", { tags: ["PLAY"], nx: 0.9, ny: 0.5 }),
        ev("POINT", "FOR", { tags: ["PLAY"], nx: Number.NaN, ny: Number.NaN, x: Number.NaN, y: Number.NaN }),
      ],
    });
    const noDir = mapSourceFromSavedMatch({ ...base, restoreContext: { ...base.restoreContext, firstHalfAttackingDirection: undefined as never } });
    const d = allTexts((ctx) => drawScoringMap(ctx, buildScoringMapView(noDir, "FOR", "FT")));
    expect(d).toContain("Attack direction not recorded — positions shown as captured");
    expect(d).toContain("1 of 2 not shown on the map — location not recorded");
  });
});

// ─── Identity helpers, filenames and PNG export ──────────────────────────────

describe("identity, filenames and PNG", () => {
  it("uses recorded squad colours, else the established Home / Away defaults", () => {
    expect(resolveTeam({ side: "FOR", role: "HOME", name: "Ballylanders", colours: {} }).primary).toBe("#16a34a");
    expect(resolveTeam({ side: "OPP", role: "AWAY", name: "Galbally", colours: {} }).primary).toBe("#dc2626");
    expect(resolveTeam({ side: "OPP", role: "AWAY", name: "Galbally", colours: { primary: "#7F1D1D" } }).primary).toBe("#7f1d1d");
  });

  it("score line puts the selected team first", () => {
    const view = buildScoringMapView(ftSrc(), "OPP", "FT");
    expect(selectedScoreLine(view.team, view.scoreline)).toBe("0-10 (10) v Ballylanders 0-12 (12)");
  });

  it("file names identify match, scope, page and team (ASCII, fadas folded)", () => {
    expect(mapFilename(buildScoringMapView(ftSrc(), "OPP", "FT"), "scoring")).toBe("ballylanders-v-galbally-ft-scoring-map-galbally.png");
    expect(mapFilename(buildTurnoverMapView(htSrc(), "FOR", "HT"), "turnovers")).toBe("ballylanders-v-galbally-ht-turnover-map-ballylanders.png");
    const src = mapSourceFromSavedMatch(savedMatch({ events: [], homeTeamName: "Cill Chainnigh", awayTeamName: "Ó Donnabháin Rossa" }));
    expect(mapFilename(buildScoringMapView(src, "OPP", "FT"), "scoring")).toBe("cill-chainnigh-v-o-donnabhain-rossa-ft-scoring-map-o-donnabhain-rossa.png");
  });

  function fakeDocument(opts: { ctx: boolean; blob: boolean }) {
    const sizes: [number, number][] = [];
    const doc = {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => (opts.ctx ? (sizes.push([canvas.width, canvas.height]), recordingContext().ctx) : null),
          toBlob: (cb: (b: Blob | null) => void) => cb(opts.blob ? new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }) : null),
        };
        return canvas;
      },
    } as unknown as Document;
    return { doc, sizes };
  }

  it("renders a 1080 × 1350 PNG File with the right name", async () => {
    const { doc, sizes } = fakeDocument({ ctx: true, blob: true });
    const s = await renderScoringMapPng(buildScoringMapView(ftSrc(), "FOR", "FT"), doc);
    const t = await renderTurnoverMapPng(buildTurnoverMapView(ftSrc(), "OPP", "FT"), doc);
    expect(sizes).toEqual([[1080, 1350], [1080, 1350]]);
    expect([s.name, s.type]).toEqual(["ballylanders-v-galbally-ft-scoring-map-ballylanders.png", "image/png"]);
    expect(t.name).toBe("ballylanders-v-galbally-ft-turnover-map-galbally.png");
  });

  it("fails clearly when canvas or encoding is unavailable", async () => {
    const view = buildScoringMapView(ftSrc(), "FOR", "FT");
    await expect(renderScoringMapPng(view, fakeDocument({ ctx: false, blob: true }).doc)).rejects.toThrow("Canvas is not available on this device.");
    await expect(renderScoringMapPng(view, fakeDocument({ ctx: true, blob: false }).doc)).rejects.toThrow("Couldn't create the map image.");
  });
});

describe("honesty notes are never cut short", () => {
  it("the orientation fallback caption and the location note wrap rather than truncate, on both pages", () => {
    const base = savedMatch({
      events: [
        ev("POINT", "FOR", { tags: ["PLAY"], nx: 0.9, ny: 0.5 }),
        ev("TURNOVER_WON", "FOR", { tags: ["TACKLE"], nx: 0.5, ny: 0.5 }),
        ev("TURNOVER_LOST", "FOR", { tags: ["TACKLE"], nx: Number.NaN, ny: Number.NaN, x: Number.NaN, y: Number.NaN }),
      ],
    });
    const src = mapSourceFromSavedMatch({ ...base, restoreContext: { ...base.restoreContext, firstHalfAttackingDirection: undefined as never } });
    const t = allTexts((ctx) => drawTurnoverMap(ctx, buildTurnoverMapView(src, "OPP", "FT")));
    const joined = t.join(" ");
    expect(joined).toContain("Attack direction not recorded — positions shown as captured");
    expect(joined).toContain("1 of 2 not shown on the map — location not recorded");
    expect(t.some((s) => s.endsWith("…"))).toBe(false);
  });
});

// ─── No external arrow on either map ─────────────────────────────────────────

describe("no external attacking-direction arrow", () => {
  it("neither map draws the white arrow or a vertical ATTACKING label (Home / Away, HT / FT)", () => {
    for (const [src, scope] of [[htSrc, "HT"], [ftSrc, "FT"]] as const) {
      for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
        for (const draw of [
          (ctx: CanvasRenderingContext2D) => drawScoringMap(ctx, buildScoringMapView(src(), side, scope)),
          (ctx: CanvasRenderingContext2D) => drawTurnoverMap(ctx, buildTurnoverMapView(src(), side, scope)),
        ]) {
          const { ctx, ops, texts } = recordingContext();
          draw(ctx);
          expect(texts.some((t) => t.text === "ATTACKING")).toBe(false);
          expect(ops.some((o) => o.op === "fill" && o.fill === "#ffffff")).toBe(false);
          // Nothing drawn in the gutter right of the pitch.
          expect(ops.some((o) => o.op === "moveTo" && o.args[0] > 1040)).toBe(false);
        }
      }
    }
  });
});

// ─── Turnover Map pitch thirds ────────────────────────────────────────────────

describe("Turnover Map pitch thirds", () => {
  const THIRD_LABEL_TEXTS = Object.values(PITCH_THIRD_LABELS);

  for (const [label, src, scope] of [["HT", htSrc, "HT"], ["FT", ftSrc, "FT"]] as const) {
    for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
      it(`${label} · ${side}: three labelled bands in the same orientation; every marker sits in its own third`, () => {
        const view = buildTurnoverMapView(src(), side, scope);
        const { ctx, ops, texts } = recordingContext();
        drawTurnoverMap(ctx, view);
        const frame = recordedFrame(ops, 1);
        const rects = pitchThirdRects(frame);
        // Attacking at the top, defensive at the bottom, equal thirds of the pitch length.
        expect(rects.map((r) => r.third)).toEqual(["ATTACKING", "MIDDLE", "DEFENSIVE"]);
        expect(rects[0].y0).toBeCloseTo(frame.y, 6);
        expect(rects[2].y1).toBeCloseTo(frame.y + frame.h, 6);
        for (const r of rects) expect(r.y1 - r.y0).toBeCloseTo(frame.h / 3, 6);
        // Labels: each once, horizontal, inside the pitch near its left edge, inside its own band.
        for (const r of rects) {
          const t = texts.filter((x) => x.text === PITCH_THIRD_LABELS[r.third]);
          expect(t).toHaveLength(1);
          expect(t[0].left).toBeGreaterThan(frame.x);
          expect(t[0].right).toBeLessThan(frame.x + frame.w);
          expect(t[0].top).toBeGreaterThan(r.y0);
          expect(t[0].y).toBeLessThan(r.y1);
        }
        // The shaded bands are drawn before any marker, so markers stay on top.
        const lastBand = ops.map((o) => o.op).lastIndexOf("fillRect");
        const firstMarkerFill = ops.findIndex((o) => o.op === "fill" && (o.fill === TURNOVER_WON_COLOUR || o.fill === TURNOVER_LOST_COLOUR));
        expect(lastBand).toBeLessThan(firstMarkerFill);
        // Every marker is drawn inside the band pitchThirdOf assigns it.
        for (const m of view.markers) {
          const y = framePoint(frame, m.point!).y;
          const band = rects.find((r) => r.third === pitchThirdOf(m.point!))!;
          expect(y).toBeGreaterThanOrEqual(band.y0 - 1e-9);
          expect(y).toBeLessThanOrEqual(band.y1 + 1e-9);
        }
        expect(texts.map((x) => x.text)).toContain(scope === "HT" ? "Team-relative view · first half" : "Team-relative view · both halves combined");
        expect(texts.some((x) => /attacking ↑/.test(x.text))).toBe(false);
      });
    }
  }

  it("labels move to a clear corner of their third rather than sit under a marker", () => {
    const frame = pitchFrame({ x: 560, y: 374, w: 470, h: 752 }, 1);
    const width = () => 180;
    const free = pitchThirdLabelBoxes(frame, [], width);
    expect(free.map((b) => [b.x, b.y])).toEqual(pitchThirdRects(frame).map((r) => [frame.x + 14, r.y0 + 14])); // top-left by default
    const onTopLeft = { x: free[2].x + 40, y: free[2].y + 16 };
    const moved = pitchThirdLabelBoxes(frame, [onTopLeft], width);
    expect(moved[0]).toEqual(free[0]);
    expect(moved[2]).not.toEqual(free[2]);
    const reach = 15 * 1.18 + 3;
    const b = moved[2];
    expect(onTopLeft.x + reach <= b.x || onTopLeft.x - reach >= b.x + b.w || onTopLeft.y + reach <= b.y || onTopLeft.y - reach >= b.y + b.h).toBe(true);
    // Deterministic.
    expect(pitchThirdLabelBoxes(frame, [onTopLeft], width)).toEqual(moved);
  });

  it("real fixtures: no third label sits under a marker (Home / Away, HT / FT)", () => {
    for (const [src, scope] of [[htSrc, "HT"], [ftSrc, "FT"]] as const) {
      for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
        const view = buildTurnoverMapView(src(), side, scope);
        const { ctx, ops, texts } = recordingContext();
        drawTurnoverMap(ctx, view);
        const frame = recordedFrame(ops, 1);
        const pts = view.markers.map((m) => framePoint(frame, m.point!));
        for (const label of Object.values(PITCH_THIRD_LABELS)) {
          const t = texts.find((x) => x.text === label)!;
          for (const p of pts) {
            const clear = p.x + 21 <= t.left - 8 || p.x - 21 >= t.right + 8 || p.y + 21 <= t.top - 2 || p.y - 21 >= t.y + 6;
            expect(clear).toBe(true);
          }
        }
      }
    }
  });

  it("labels are faint watermarks: medium weight, small, 35% white, no badge behind them (Home / Away, HT / FT)", () => {
    for (const [src, scope] of [[htSrc, "HT"], [ftSrc, "FT"]] as const) {
      for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
        const { ctx, ops, texts } = recordingContext();
        drawTurnoverMap(ctx, buildTurnoverMapView(src(), side, scope));
        const labels = texts.filter((t) => THIRD_LABEL_TEXTS.includes(t.text));
        expect(labels).toHaveLength(3);
        for (const t of labels) {
          expect(t.color).toBe("rgba(255,255,255,0.35)");
          expect(t.size).toBe(16); // 27% smaller than the previous 22 px
          expect(t.font.startsWith("500 ")).toBe(true);
        }
        // No dark pill / badge fill anywhere on the page.
        expect(ops.some((o) => o.op === "fill" && o.fill === "rgba(11,20,40,0.42)")).toBe(false);
      }
    }
  });

  it("labels never run into the goal-area boxes (every sport, Home / Away, HT / FT)", async () => {
    const { getPitchConfig } = await import("../../core/pitch/pitch-config");
    for (const sport of ["gaelic", "ladies_football", "hurling", "camogie"] as const) {
      const pitchSport = sport === "ladies_football" ? "gaelic" : sport;
      const boxes = getPitchConfig(pitchSport).markings.filter((m) => m.kind === "rect" && m.h < 90) as { y: number; h: number }[];
      const leftSide = Math.min(...boxes.map((b) => b.y)) / 100;
      const rightSide = Math.max(...boxes.map((b) => b.y + b.h)) / 100;
      for (const [label, match] of [["HT", htFixtureMatch()], ["FT", ftFixtureMatch()]] as const) {
        const src = mapSourceFromSavedMatch({ ...match, sport });
        for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
          const { ctx, ops, texts } = recordingContext();
          drawTurnoverMap(ctx, buildTurnoverMapView(src, side, label));
          const frame = recordedFrame(ops, 1);
          for (const t of texts.filter((x) => THIRD_LABEL_TEXTS.includes(x.text))) {
            const onLeft = t.left < frame.x + frame.w / 2;
            if (onLeft) expect(t.right).toBeLessThanOrEqual(frame.x + leftSide * frame.w - 8);
            else expect(t.left).toBeGreaterThanOrEqual(frame.x + rightSide * frame.w + 8 - 0.5);
          }
        }
      }
    }
  });

  it("on a narrower pitch the labels shrink (never below 13 px) rather than cross a marking", () => {
    // Real Turnover Map pitches are ~470 px wide (labels fit at 16 px). At 370 px the
    // longest label needs a smaller size; 13 px is the floor for tiny pitches.
    const frame = pitchFrame({ x: 0, y: 0, w: 370, h: 592 }, 1);
    const { ctx, texts } = recordingContext();
    drawPitchThirds(ctx, frame, [], "gaelic");
    const labels = texts.filter((t) => THIRD_LABEL_TEXTS.includes(t.text));
    expect(labels).toHaveLength(3);
    const maxW = thirdLabelMaxWidth(frame, "gaelic");
    for (const t of labels) {
      expect(t.size).toBeLessThan(16);
      expect(t.size).toBeGreaterThanOrEqual(13);
      expect(t.right - t.left).toBeLessThanOrEqual(maxW);
    }
    expect(new Set(labels.map((t) => t.size)).size).toBe(1); // one consistent style
  });

  it("labels sit in the same corner of every third unless a marker is there", () => {
    const view = buildTurnoverMapView(htSrc(), "OPP", "HT");
    const { ctx, ops, texts } = recordingContext();
    drawTurnoverMap(ctx, { ...view, markers: [] });
    const frame = recordedFrame(ops, 1);
    const rects = pitchThirdRects(frame);
    for (const r of rects) {
      const t = texts.find((x) => x.text === PITCH_THIRD_LABELS[r.third])!;
      expect(t.left).toBeCloseTo(frame.x + 14 + 8, 6);
      expect(t.y).toBeCloseTo(r.y0 + 14 + 18, 6);
    }
  });

  it("markers and totals are identical with and without the overlay", () => {
    for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
      const view = buildTurnoverMapView(ftSrc(), side, "FT");
      const withThirds = recordingContext();
      drawTurnoverMap(withThirds.ctx, view);
      const without = recordingContext();
      drawTurnoverMap(without.ctx, { ...view, orientation: { ...view.orientation, status: "AS_CAPTURED", homeFirstHalfDirection: null } });
      // Each marker fill, paired with the path start (arc / moveTo) just before it.
      const markerOps = (ops: Op[]) => ops.flatMap((o, i) => {
        if (o.op !== "fill" || ![TURNOVER_WON_COLOUR, TURNOVER_LOST_COLOUR].includes(o.fill)) return [];
        const start = ops.slice(0, i).reverse().find((p) => p.op === "arc" || p.op === "moveTo")!;
        return [{ fill: o.fill, at: start.args.slice(0, 2) }];
      });
      expect(markerOps(withThirds.ops)).toEqual(markerOps(without.ops));
      const figures = (t: TextCall[]) => t.filter((x) => /^[+−]?\d+$/.test(x.text)).map((x) => x.text);
      expect(figures(withThirds.texts)).toEqual(figures(without.texts));
    }
  });

  it("missing attack direction: no third bands or labels, and an explanatory caption", () => {
    const base = savedMatch({ events: HT_FIXTURE.events });
    const src = mapSourceFromSavedMatch({ ...base, restoreContext: { ...base.restoreContext, firstHalfAttackingDirection: undefined as never } });
    const view = buildTurnoverMapView(src, "OPP", "FT");
    const { ctx, ops, texts } = recordingContext();
    drawTurnoverMap(ctx, view);
    expect(texts.some((t) => THIRD_LABEL_TEXTS.includes(t.text))).toBe(false);
    expect(ops.some((o) => o.op === "fillRect" && /rgba\((255,255,255,0\.07|0,0,0,0\.12)\)/.test(o.fill))).toBe(false);
    expect(texts.map((t) => t.text).join(" ")).toContain("Attack direction not recorded — positions shown as captured; thirds not shown");
  });

  it("the Scoring Map never gets the thirds overlay or the Turnover caption", () => {
    for (const side of ["FOR", "OPP"] as MapTeamSide[]) {
      const { ctx, texts } = recordingContext();
      drawScoringMap(ctx, buildScoringMapView(ftSrc(), side, "FT"));
      expect(texts.some((t) => THIRD_LABEL_TEXTS.includes(t.text))).toBe(false);
      expect(texts.some((t) => t.text.startsWith("Team-relative view"))).toBe(false);
      expect(texts.map((t) => t.text)).toContain(`${side === "FOR" ? "Ballylanders" : "Galbally"} attacking ↑ · both halves`);
    }
  });
});
