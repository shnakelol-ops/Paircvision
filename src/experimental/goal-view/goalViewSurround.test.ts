import { describe, expect, it } from "vitest";

import { TRAINING_GRASS_BANDS, trainingGrassBands } from "../../tactical-lite/pixi/tacticalPitchTheme";
import {
  DEFAULT_GOAL_VIEW_CAMERA,
  GOAL_VIEW_DISTANCES,
  GOAL_VIEW_ORBIT_LIMITS,
  cameraForDistance,
  createGoalViewProjection,
  wholePitchFitZoom,
  worldToBoard,
} from "./goalViewCamera";
import {
  FADED_SURROUND_OPTIONS,
  SURROUND_MARGIN,
  SURROUND_NEAR_DEPTH,
  SURROUND_OVERLAP,
  DEFAULT_SURROUND_DEPTH_FADE,
  bandColorAt,
  buildBandSurround,
  depthFadeSlabs,
  farthestPitchDepth,
  buildEdgeSampledSurround,
  projectClippedPolygon,
  projectSurround,
  type BoardSurroundCell,
  type SurroundEdgeSamples,
} from "./goalViewSurround";
import { DEFAULT_GOAL_VIEW_LENS_OPTIONS } from "./createGoalViewLens";
import { SEQUENCE_GAA_STRIPES } from "./goalViewSurroundSampling";

const BANDS = {
  bandWidth: 160 / TRAINING_GRASS_BANDS.count,
  colors: [TRAINING_GRASS_BANDS.light, TRAINING_GRASS_BANDS.dark] as const,
};
const PHONE = { width: 390, height: 640 };
// Phone portrait (narrow Android, iPhone), phone landscape, desktop.
const SCREENS = [
  { width: 340, height: 544 },
  { width: 382, height: 611 },
  { width: 700, height: 300 },
  { width: 1200, height: 750 },
];

const polyArea = (flat: number[] | null) => {
  if (!flat) return 0;
  let s2 = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    s2 += flat[i] * flat[j + 1] - flat[j] * flat[i + 1];
  }
  return Math.abs(s2) / 2;
};

const boardCells = (end: "left-end" | "right-end", cells = buildBandSurround(BANDS, FADED_SURROUND_OPTIONS).cells): BoardSurroundCell[] =>
  cells.map((c) => ({ poly: c.poly.map((pt) => worldToBoard(end, pt)), color: c.color, alpha: c.alpha }));

const cellBounds = (poly: ReadonlyArray<{ x: number; y: number }>) => ({
  x0: Math.min(...poly.map((p) => p.x)),
  x1: Math.max(...poly.map((p) => p.x)),
  y0: Math.min(...poly.map((p) => p.y)),
  y1: Math.max(...poly.map((p) => p.y)),
});

describe("goal view surround — bands", () => {
  it("continues the board's own band colours exactly, and alternates beyond both endlines", () => {
    for (const band of trainingGrassBands(160)) {
      expect(bandColorAt(BANDS, band.x + band.width / 2)).toBe(band.color);
    }
    expect(bandColorAt(BANDS, -8)).toBe(TRAINING_GRASS_BANDS.dark); // band −1
    expect(bandColorAt(BANDS, -24)).toBe(TRAINING_GRASS_BANDS.light); // band −2
    expect(bandColorAt(BANDS, 168)).toBe(TRAINING_GRASS_BANDS.light); // band 10 (board ends on dark band 9)
  });

  it("never covers the pitch interior beyond the hidden overlap, and reaches the margin", () => {
    const surround = buildBandSurround(BANDS, FADED_SURROUND_OPTIONS);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const cell of surround.cells) {
      const b = cellBounds(cell.poly);
      minX = Math.min(minX, b.x0);
      maxX = Math.max(maxX, b.x1);
      const overlapsHole = b.x1 > SURROUND_OVERLAP + 1e-9 && b.x0 < 160 - SURROUND_OVERLAP - 1e-9 && b.y1 > SURROUND_OVERLAP + 1e-9 && b.y0 < 100 - SURROUND_OVERLAP - 1e-9;
      expect(overlapsHole).toBe(false);
      // Every cell lies inside one band, so its colour is unambiguous.
      expect(Math.floor((b.x0 + 1e-9) / BANDS.bandWidth)).toBe(Math.floor((b.x1 - 1e-9) / BANDS.bandWidth));
    }
    expect(minX).toBe(-SURROUND_MARGIN);
    expect(maxX).toBe(160 + SURROUND_MARGIN);
  });

  it("covers the surround with no gaps or overlaps (area check), one cell per band per side", () => {
    for (const margin of [140, SURROUND_MARGIN]) {
      const surround = buildBandSurround(BANDS, { margin });
      const area = surround.cells.reduce((s, c) => {
        const b = cellBounds(c.poly);
        return s + (b.x1 - b.x0) * (b.y1 - b.y0);
      }, 0);
      const outer = (160 + 2 * margin) * (100 + 2 * margin);
      const hole = (160 - 2 * SURROUND_OVERLAP) * (100 - 2 * SURROUND_OVERLAP);
      expect(area).toBeCloseTo(outer - hole, 6);
    }
    // Small enough to rebuild on every orbit frame.
    expect(buildBandSurround(BANDS, FADED_SURROUND_OPTIONS).cells.length).toBeLessThanOrEqual(160);
  });

  it("is fully opaque grass: the fade comes only from camera depth", () => {
    const surround = buildBandSurround(BANDS, FADED_SURROUND_OPTIONS);
    expect(surround.cells.every((c) => c.alpha === 1)).toBe(true);
    expect(surround.depthFade).toEqual(DEFAULT_SURROUND_DEPTH_FADE);
  });
});

describe("goal view surround — clipping", () => {
  it("cameraDepth agrees with project(): positive exactly where a point is visible", () => {
    for (const elevationDeg of [null, GOAL_VIEW_ORBIT_LIMITS.minElevationDeg, GOAL_VIEW_ORBIT_LIMITS.maxElevationDeg]) {
      for (const yawDeg of [0, 45, 90, 180, 270]) {
        const p = createGoalViewProjection(DEFAULT_GOAL_VIEW_CAMERA, PHONE, { orbit: { yawDeg, elevationDeg, zoom: 1 } });
        for (let a = -300; a <= 400; a += 25) {
          for (let b = -300; b <= 460; b += 25) {
            const d = p.cameraDepth(a, b);
            if (Math.abs(d) < 1e-3) continue;
            expect(p.project(a, b) !== null).toBe(d > 1e-6);
          }
        }
      }
    }
  });

  it("keeps every surround polygon finite and inside the canvas (so it cannot enlarge an export), for every preset, Fit, angle and tilt", () => {
    for (const end of ["left-end", "right-end"] as const) {
      const cells = boardCells(end);
      for (const screen of SCREENS) {
        for (const preset of GOAL_VIEW_DISTANCES) {
          const camera = cameraForDistance(preset.id);
          for (const elevationDeg of [null, GOAL_VIEW_ORBIT_LIMITS.minElevationDeg, 50, GOAL_VIEW_ORBIT_LIMITS.maxElevationDeg]) {
            for (const zoom of [wholePitchFitZoom(camera, screen, elevationDeg), 1, GOAL_VIEW_ORBIT_LIMITS.maxZoom]) {
              for (const yawDeg of [0, 45, 90, 135, 180, 270]) {
                const p = createGoalViewProjection(camera, screen, { orbit: { yawDeg, elevationDeg, zoom } });
                const { polygons } = projectSurround(cells, DEFAULT_SURROUND_DEPTH_FADE, p, screen);
                let bad = 0;
                for (const { flat, alpha } of polygons) {
                  if (flat.length < 6 || !(alpha > 0 && alpha <= 1)) bad += 1;
                  for (let i = 0; i < flat.length; i += 2) {
                    const x = flat[i];
                    const y = flat[i + 1];
                    if (!(x >= -1e-6 && x <= screen.width + 1e-6 && y >= -1e-6 && y <= screen.height + 1e-6)) bad += 1;
                  }
                }
                expect(bad).toBe(0);
                // At 2× zoom the pitch can fill the whole canvas; otherwise grass shows.
                if (zoom <= 1) expect(polygons.length).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });

  it("never shows the surround's outer edge: it is always beyond the depth fade or off-canvas", () => {
    const M = SURROUND_MARGIN;
    const outer: Array<{ x: number; y: number }> = [];
    for (let t = 0; t <= 1; t += 0.02) {
      outer.push({ x: -M + t * (160 + 2 * M), y: -M }, { x: -M + t * (160 + 2 * M), y: 100 + M });
      outer.push({ x: -M, y: -M + t * (100 + 2 * M) }, { x: 160 + M, y: -M + t * (100 + 2 * M) });
    }
    const pts = outer.map((w) => worldToBoard("left-end", w));
    let visible = 0;
    for (const screen of SCREENS) {
      for (const preset of GOAL_VIEW_DISTANCES) {
        const camera = cameraForDistance(preset.id);
        for (const elevationDeg of [null, 20, 45, 75]) {
          for (const zoom of [1, wholePitchFitZoom(camera, screen, elevationDeg)]) {
            for (let yawDeg = 0; yawDeg < 360; yawDeg += 15) {
              const p = createGoalViewProjection(camera, screen, { orbit: { yawDeg, elevationDeg, zoom } });
              const fadeEnd = farthestPitchDepth(p) + DEFAULT_SURROUND_DEPTH_FADE.end;
              for (const b of pts) {
                const d = p.cameraDepth(b.a, b.b);
                if (d <= SURROUND_NEAR_DEPTH || d >= fadeEnd) continue;
                const q = p.project(b.a, b.b);
                if (q && q.x >= 0 && q.x <= screen.width && q.y >= 0 && q.y <= screen.height) visible += 1;
              }
            }
          }
        }
      }
    }
    expect(visible).toBe(0);
  });

  it("culls depth slabs per cell without changing what is drawn", () => {
    const cells = boardCells("right-end");
    for (const elevationDeg of [null, 20, 75]) {
      for (const yawDeg of [0, 45, 90, 135, 180, 270]) {
        const p = createGoalViewProjection(DEFAULT_GOAL_VIEW_CAMERA, PHONE, { orbit: { yawDeg, elevationDeg, zoom: 1 } });
        const { polygons, clipCalls } = projectSurround(cells, DEFAULT_SURROUND_DEPTH_FADE, p, PHONE);
        // Brute force: every cell against every slab.
        const slabs = depthFadeSlabs(DEFAULT_SURROUND_DEPTH_FADE, farthestPitchDepth(p));
        const bySlab = (lo: number, hi: number) => cells.reduce((sum, c) => sum + polyArea(projectClippedPolygon(c.poly, p, PHONE, lo, hi)), 0);
        const bruteArea = slabs.reduce((sum, [lo, hi]) => sum + bySlab(lo, hi), 0);
        const fastArea = polygons.reduce((sum, poly) => sum + polyArea(poly.flat), 0);
        expect(fastArea).toBeCloseTo(bruteArea, 3);
        // Alpha-weighted coverage matches too (each region keeps its slab's alpha).
        const bruteWeighted = slabs.reduce((sum, [lo, hi, alpha]) => sum + alpha * bySlab(lo, hi), 0);
        const fastWeighted = polygons.reduce((sum, poly) => sum + poly.alpha * polyArea(poly.flat), 0);
        expect(fastWeighted).toBeCloseTo(bruteWeighted, 3);
        // Far fewer clips than testing every cell against every slab.
        expect(clipCalls).toBeLessThan((cells.length * slabs.length) / 3);
      }
    }
  });

  it("clips ground that reaches behind a low camera instead of dropping or exploding it", () => {
    // 20° tilt: the camera is close to the turf, so the margin behind it is behind the camera plane.
    const p = createGoalViewProjection(DEFAULT_GOAL_VIEW_CAMERA, PHONE, { orbit: { yawDeg: 0, elevationDeg: 20, zoom: 1 } });
    const big = [
      { a: -140, b: -140 },
      { a: 240, b: -140 },
      { a: 240, b: 300 },
      { a: -140, b: 300 },
    ];
    expect(p.cameraDepth(50, 300)).toBeLessThan(0); // genuinely straddles the near plane
    const flat = projectClippedPolygon(big, p, PHONE);
    expect(flat).not.toBeNull();
    // Covers (almost) the whole canvas bottom edge: the turf under the camera.
    const ys = flat!.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeCloseTo(PHONE.height, 6);
    // Entirely behind the camera → nothing.
    expect(projectClippedPolygon([{ a: 40, b: 320 }, { a: 60, b: 320 }, { a: 60, b: 340 }, { a: 40, b: 340 }], p, PHONE)).toBeNull();
  });
});

describe("goal view surround — camera-depth fade", () => {
  it("is solid from the near plane to just beyond the farthest pitch corner, then eases to nothing", () => {
    const slabs = depthFadeSlabs(DEFAULT_SURROUND_DEPTH_FADE, 300);
    expect(slabs[0]).toEqual([0.5, 300 + DEFAULT_SURROUND_DEPTH_FADE.start, 1]);
    for (let i = 1; i < slabs.length; i += 1) {
      expect(slabs[i][0]).toBeCloseTo(slabs[i - 1][1], 9);
      expect(slabs[i][2]).toBeLessThan(slabs[i - 1][2]);
    }
    expect(slabs[slabs.length - 1][1]).toBeCloseTo(300 + DEFAULT_SURROUND_DEPTH_FADE.end, 9);
    expect(depthFadeSlabs(null, 300)).toEqual([[0.5, Infinity, 1]]);
  });

  it("never fades grass nearer the camera than the far pitch edge, and slabs tile without gaps", () => {
    for (const elevationDeg of [null, 20, 75]) {
      for (const yawDeg of [0, 45, 90, 180, 270]) {
        const p = createGoalViewProjection(DEFAULT_GOAL_VIEW_CAMERA, PHONE, { orbit: { yawDeg, elevationDeg, zoom: 1 } });
        const far = farthestPitchDepth(p);
        for (const [a, b] of [[0, 0], [100, 0], [100, 160], [0, 160], [50, 80]]) expect(p.cameraDepth(a, b)).toBeLessThanOrEqual(far + 1e-9);
        const cell = [{ a: -60, b: -60 }, { a: 160, b: -60 }, { a: 160, b: 220 }, { a: -60, b: 220 }];
        const area = (flat: number[] | null) => {
          if (!flat) return 0;
          let s2 = 0;
          for (let i = 0; i < flat.length; i += 2) {
            const j = (i + 2) % flat.length;
            s2 += flat[i] * flat[j + 1] - flat[j] * flat[i + 1];
          }
          return Math.abs(s2) / 2;
        };
        const whole = area(projectClippedPolygon(cell, p, PHONE));
        const sliced = depthFadeSlabs({ start: 8, end: 1e6, slices: 20 }, far).reduce(
          (sum, [lo, hi]) => sum + area(projectClippedPolygon(cell, p, PHONE, lo, hi)),
          0,
        );
        expect(sliced).toBeCloseTo(whole, 3);
      }
    }
  });
});

describe("goal view surround — edge-sampled turf (Sequence investigation)", () => {
  const ramp = (n: number, base: number) => Array.from({ length: n }, (_, i) => base + ((i >> 2) & 0xff));
  const samples: SurroundEdgeSamples = { perUnit: 4, top: ramp(640, 0x102000), bottom: ramp(640, 0x204000), left: ramp(400, 0x300000), right: ramp(400, 0x400000) };

  it("continues the colour sampled just inside each boundary straight outwards", () => {
    const s = buildEdgeSampledSurround(samples, null, { stepUnits: 2, margin: 140 });
    const find = (x: number, y: number) =>
      s.cells.find((c) => {
        const b = cellBounds(c.poly);
        return x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
      });
    // Past the y = 0 touchline at x ≈ 41: the top samples for x ∈ [40, 42).
    expect(find(41, -1)?.color).toBe(find(41, -100)?.color);
    expect(find(41, -1)?.color).toBe(0x102000 + 40 + 1); // mean of samples 160…167 → 0x102000 + 40.875 ≈ +41
    // Past the x = 0 endline at y ≈ 21: left samples.
    expect(find(-1, 21)?.color).toBe(find(-80, 21)?.color);
  });

  it("continues Sequence's stripe repeat on every side with the same phase", () => {
    expect(SEQUENCE_GAA_STRIPES.period).toBeCloseTo(114.8, 9);
    expect(SEQUENCE_GAA_STRIPES.stripes.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)])).toEqual([
      [17.425, 26.486],
      [52.275, 61.336],
      [87.125, 96.186],
    ]);
    const s = buildEdgeSampledSurround(samples, SEQUENCE_GAA_STRIPES, { margin: 140 });
    const dark = s.cells.filter((c) => c.color === 0 && c.alpha > 0);
    expect(dark.some((c) => cellBounds(c.poly).y1 <= 0)).toBe(true); // past a touchline too
    expect(dark.some((c) => cellBounds(c.poly).x1 <= 0)).toBe(true); // and past an endline
    for (const c of dark) {
      const b = cellBounds(c.poly);
      expect(b.x1 <= 0 || b.x0 >= 160 || b.y1 <= 0 || b.y0 >= 100).toBe(true); // only outside the pitch
      const u = ((((b.x0 + b.x1) / 2) % 114.8) + 114.8) % 114.8;
      expect(SEQUENCE_GAA_STRIPES.stripes.some(([s0, e0]) => u >= s0 && u < e0)).toBe(true);
    }
  });
});

describe("goal view lens default", () => {
  it("has no surround unless one is set (production boards are unchanged)", () => {
    expect(DEFAULT_GOAL_VIEW_LENS_OPTIONS.surround).toBeNull();
  });
});
