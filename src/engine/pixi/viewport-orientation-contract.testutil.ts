import { describe, expect, it } from "vitest";

// Shared contract exercised by BOTH orientation-aware mapper implementations
// (engine/pixi/createWorldViewport.ts and movement-board/coordinates/viewport.ts).
// Structural types keep this decoupled from either module's own WorldPoint/WorldSize.

type Vec = { x: number; y: number };
type Size = { width: number; height: number };

type Transform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  quarterTurns: number;
};

type Mapper = {
  transform: Transform;
  worldToViewport: (p: Vec) => Vec;
  viewportToWorld: (p: Vec) => Vec;
  normalizedToViewport: (p: Vec) => Vec;
  viewportToNormalized: (p: Vec) => Vec;
  normalizedToWorld: (p: Vec) => Vec;
  worldToNormalized: (p: Vec) => Vec;
};

export type ViewportModule = {
  createWorldViewport: (world: Size, viewport: Size, quarterTurns?: number) => Mapper;
  getLetterboxTransform: (world: Size, viewport: Size, quarterTurns?: number) => Transform;
  normalizeQuarterTurns: (quarterTurns: number) => number;
};

// Canonical pitch world. Centre is (80, 50) — the required rotation origin.
const WORLD: Size = { width: 160, height: 100 };
const ROUND_TRIP_TOLERANCE = 1e-6;

// phone / tablet / desktop host dimensions, in both portrait and landscape.
const HOSTS: Array<{ label: string; size: Size }> = [
  { label: "phone portrait (390x844)", size: { width: 390, height: 844 } },
  { label: "phone landscape (844x390)", size: { width: 844, height: 390 } },
  { label: "tablet portrait (834x1194)", size: { width: 834, height: 1194 } },
  { label: "tablet landscape (1194x834)", size: { width: 1194, height: 834 } },
  { label: "desktop (1440x900)", size: { width: 1440, height: 900 } },
];

// 0 = landscape, 1 = portrait clockwise, 2 = 180 flip, 3 = portrait anticlockwise.
const ORIENTATIONS: Array<{ label: string; turns: number }> = [
  { label: "landscape (q=0)", turns: 0 },
  { label: "portrait clockwise (q=1)", turns: 1 },
  { label: "flip (q=2)", turns: 2 },
  { label: "portrait anticlockwise (q=3)", turns: 3 },
];

const CORNERS: Vec[] = [
  { x: 0, y: 0 },
  { x: 160, y: 0 },
  { x: 160, y: 100 },
  { x: 0, y: 100 },
];
const GOAL_CENTRES: Vec[] = [
  { x: 0, y: 50 },
  { x: 160, y: 50 },
];
const MIDFIELD: Vec[] = [{ x: 80, y: 50 }];
const BOUNDARIES: Vec[] = [
  { x: 80, y: 0 },
  { x: 80, y: 100 },
  { x: 0, y: 25 },
  { x: 160, y: 75 },
  { x: 40, y: 0 },
  { x: 120, y: 100 },
];

// >= 20 deterministic interior points from a fixed LCG (no randomness across runs).
function deterministicInteriorPoints(count: number, world: Size): Vec[] {
  const points: Vec[] = [];
  let seed = 0x2f6e2b1;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i += 1) {
    points.push({
      x: 1 + next() * (world.width - 2),
      y: 1 + next() * (world.height - 2),
    });
  }
  return points;
}

const INTERIOR = deterministicInteriorPoints(24, WORLD);
const ALL_POINTS: Vec[] = [...CORNERS, ...GOAL_CENTRES, ...MIDFIELD, ...BOUNDARIES, ...INTERIOR];

// ---------------------------------------------------------------------------
// Reference implementation of the PRE-CHANGE (legacy, landscape-only) transform.
// Copied verbatim from the original getLetterboxTransform / toViewport / toWorld
// so the parity tests compare against exactly what production ran before PR-1.
// ---------------------------------------------------------------------------
function legacySafeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function legacyComputeSafeMarginPx(vw: number, vh: number): number {
  const minSide = Math.min(vw, vh);
  return Math.min(24, Math.max(8, minSide * 0.03));
}
function legacyLetterbox(world: Size, viewport: Size): { scale: number; offsetX: number; offsetY: number } {
  const worldWidth = legacySafeDimension(world.width);
  const worldHeight = legacySafeDimension(world.height);
  const viewportWidth = legacySafeDimension(viewport.width);
  const viewportHeight = legacySafeDimension(viewport.height);
  if (worldWidth <= 0 || worldHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const margin = legacyComputeSafeMarginPx(viewportWidth, viewportHeight);
  const availWidth = Math.max(1, viewportWidth - margin * 2);
  const availHeight = Math.max(1, viewportHeight - margin * 2);
  const scale = Math.min(availWidth / worldWidth, availHeight / worldHeight);
  const offsetX = (viewportWidth - worldWidth * scale) / 2;
  const offsetY = (viewportHeight - worldHeight * scale) / 2;
  return { scale, offsetX, offsetY };
}
function legacyToViewport(p: Vec, t: { scale: number; offsetX: number; offsetY: number }): Vec {
  return { x: p.x * t.scale + t.offsetX, y: p.y * t.scale + t.offsetY };
}
function legacyToWorld(p: Vec, t: { scale: number; offsetX: number; offsetY: number }): Vec {
  if (t.scale <= 0) return { x: 0, y: 0 };
  return { x: (p.x - t.offsetX) / t.scale, y: (p.y - t.offsetY) / t.scale };
}

export function describeViewportOrientationContract(label: string, mod: ViewportModule): void {
  const { createWorldViewport, getLetterboxTransform, normalizeQuarterTurns } = mod;

  describe(`${label} — quarter-turn normalization`, () => {
    it("wraps any integer into {0,1,2,3}", () => {
      expect(normalizeQuarterTurns(0)).toBe(0);
      expect(normalizeQuarterTurns(1)).toBe(1);
      expect(normalizeQuarterTurns(2)).toBe(2);
      expect(normalizeQuarterTurns(3)).toBe(3);
      expect(normalizeQuarterTurns(4)).toBe(0);
      expect(normalizeQuarterTurns(5)).toBe(1);
      expect(normalizeQuarterTurns(7)).toBe(3);
      expect(normalizeQuarterTurns(-1)).toBe(3);
      expect(normalizeQuarterTurns(-4)).toBe(0);
    });
    it("treats non-finite turn counts as landscape (0)", () => {
      expect(normalizeQuarterTurns(Number.NaN)).toBe(0);
      expect(normalizeQuarterTurns(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe(`${label} — default is landscape`, () => {
    it("omitting quarterTurns yields q=0", () => {
      const mapper = createWorldViewport(WORLD, HOSTS[0].size);
      expect(mapper.transform.quarterTurns).toBe(0);
    });
    it("q=4 collapses to q=0 and maps identically", () => {
      const base = createWorldViewport(WORLD, HOSTS[0].size, 0);
      const wrapped = createWorldViewport(WORLD, HOSTS[0].size, 4);
      expect(wrapped.transform.quarterTurns).toBe(0);
      for (const p of ALL_POINTS) {
        const a = base.worldToViewport(p);
        const b = wrapped.worldToViewport(p);
        expect(b.x).toBe(a.x);
        expect(b.y).toBe(a.y);
      }
    });
  });

  describe(`${label} — landscape parity with pre-change implementation`, () => {
    for (const host of HOSTS) {
      it(`transform is byte-identical to legacy — ${host.label}`, () => {
        const legacy = legacyLetterbox(WORLD, host.size);
        const next = getLetterboxTransform(WORLD, host.size, 0);
        expect(next.scale).toBe(legacy.scale);
        expect(next.offsetX).toBe(legacy.offsetX);
        expect(next.offsetY).toBe(legacy.offsetY);
      });
      it(`mapped coordinates are byte-identical to legacy — ${host.label}`, () => {
        const legacy = legacyLetterbox(WORLD, host.size);
        const mapper = createWorldViewport(WORLD, host.size, 0);
        for (const p of ALL_POINTS) {
          const nextV = mapper.worldToViewport(p);
          const legacyV = legacyToViewport(p, legacy);
          expect(nextV.x).toBe(legacyV.x);
          expect(nextV.y).toBe(legacyV.y);

          // Inverse: feed the legacy viewport point back through both.
          const nextW = mapper.viewportToWorld(legacyV);
          const legacyW = legacyToWorld(legacyV, legacy);
          expect(nextW.x).toBe(legacyW.x);
          expect(nextW.y).toBe(legacyW.y);
        }
      });
    }
  });

  describe(`${label} — world -> viewport -> world round-trips within 1e-6`, () => {
    for (const host of HOSTS) {
      for (const orientation of ORIENTATIONS) {
        it(`${host.label} / ${orientation.label}`, () => {
          const mapper = createWorldViewport(WORLD, host.size, orientation.turns);
          for (const p of ALL_POINTS) {
            const back = mapper.viewportToWorld(mapper.worldToViewport(p));
            expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
            expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
          }
        });
        it(`${host.label} / ${orientation.label} — normalized round-trip`, () => {
          const mapper = createWorldViewport(WORLD, host.size, orientation.turns);
          for (const p of ALL_POINTS) {
            const normalized = mapper.worldToNormalized(p);
            const back = mapper.viewportToNormalized(mapper.normalizedToViewport(normalized));
            expect(Math.abs(back.x - normalized.x)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
            expect(Math.abs(back.y - normalized.y)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
          }
        });
      }
    }
  });

  describe(`${label} — rotation is about the world centre (80, 50)`, () => {
    for (const host of HOSTS) {
      for (const orientation of ORIENTATIONS) {
        it(`world centre maps to viewport centre — ${host.label} / ${orientation.label}`, () => {
          const mapper = createWorldViewport(WORLD, host.size, orientation.turns);
          const centre = mapper.worldToViewport({ x: 80, y: 50 });
          expect(Math.abs(centre.x - host.size.width / 2)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
          expect(Math.abs(centre.y - host.size.height / 2)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
        });
      }
    }
  });

  describe(`${label} — portrait orientations stand the pitch vertical`, () => {
    for (const host of HOSTS) {
      for (const turns of [1, 3]) {
        it(`goals sit on one vertical column, a full pitch-length apart — ${host.label} / q=${turns}`, () => {
          const mapper = createWorldViewport(WORLD, host.size, turns);
          const scale = mapper.transform.scale;
          const goalA = mapper.worldToViewport({ x: 0, y: 50 });
          const goalB = mapper.worldToViewport({ x: 160, y: 50 });
          // Same screen column (goal-to-goal axis is vertical in portrait).
          expect(Math.abs(goalA.x - goalB.x)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE);
          // Separated vertically by the full pitch length (160 world units).
          expect(Math.abs(Math.abs(goalB.y - goalA.y) - 160 * scale)).toBeLessThanOrEqual(1e-4);
        });
      }
    }
  });

  describe(`${label} — clockwise and anticlockwise portrait are mirror opposites`, () => {
    for (const host of HOSTS) {
      it(`q=1 and q=3 place the same goal at opposite ends — ${host.label}`, () => {
        const cw = createWorldViewport(WORLD, host.size, 1);
        const ccw = createWorldViewport(WORLD, host.size, 3);
        const goalCw = cw.worldToViewport({ x: 0, y: 50 });
        const goalCcw = ccw.worldToViewport({ x: 0, y: 50 });
        const centreY = host.size.height / 2;
        // One puts the goal above centre, the other below.
        expect(Math.sign(goalCw.y - centreY)).toBe(-Math.sign(goalCcw.y - centreY));
      });
    }
  });
}
