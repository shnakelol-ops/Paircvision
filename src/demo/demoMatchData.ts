/**
 * demoMatchData.ts
 *
 * Pure deterministic demo match event generator.
 *
 * Generates a realistic Ballylanders vs Galty Gaels fixture:
 *   Final score — Ballylanders [DEMO] 1-17 (20pts) · Galty Gaels 1-12 (15pts)
 *
 * Design notes:
 *  - No imports from React or any app-state module — pure function, zero side-effects.
 *  - IDs use "team-home-demo-N" / "team-away-demo-N" prefixes so computeTeamScore()
 *    (which filters by id.startsWith()) produces the correct scoreline.
 *  - All fields required by LoggedMatchEvent in StatsModeSurface.tsx are present.
 *  - Events are sorted chronologically (half ASC, matchClockSeconds ASC).
 *  - matchClockSeconds is relative to the start of each half (0 = kick-off of that half).
 *  - Segments follow statsSegments.ts: segs 1-3 = H1 (10-min windows), segs 4-6 = H2.
 *  - Chain events are spaced ≤30s apart so chain-rules (90s/60s windows) fire correctly.
 *
 * Score build-up:
 *   Seg 1 (H1 E): BL 0-4  GG 0-3  → BL 0-4  GG 0-3
 *   Seg 2 (H1 M): BL 1-2  GG 0-3  → BL 1-6  GG 0-6
 *   Seg 3 (H1 L): BL 0-3  GG 0-2  → BL 1-9  GG 0-8  (H/T)
 *   Seg 4 (2H E): BL 0-3  GG 1-1  → BL 1-12 GG 1-9
 *   Seg 5 (2H M): BL 0-3  GG 0-2  → BL 1-15 GG 1-11
 *   Seg 6 (2H L): BL 0-2  GG 0-1  → BL 1-17 GG 1-12  (F/T) ✓
 *
 * @module demo/demoMatchData
 */

import type {
  MatchEventKind,
  MatchEventPeriod,
  MatchEventSegment,
} from "../core/stats/stats-event-model";

// ── Exported type ─────────────────────────────────────────────────────────────

/**
 * Structurally compatible with (and safely castable to) LoggedMatchEvent
 * in StatsModeSurface.tsx. All required fields of LoggedMatchEvent are present.
 */
export type DemoMatchEvent = {
  readonly id: string;
  readonly kind: MatchEventKind;
  /** Mirrors `kind` — required by LoggedMatchEvent */
  readonly type: MatchEventKind;
  readonly teamSide: "FOR" | "OPP";
  readonly half: 1 | 2;
  readonly period: MatchEventPeriod;
  readonly segment: MatchEventSegment;
  readonly halfSegment: 1 | 2 | 3;
  /** Seconds elapsed in the current half (0 = half kick-off) */
  readonly matchClockSeconds: number;
  /** Same as matchClockSeconds — convention in LoggedMatchEvent */
  readonly timestamp: number;
  readonly matchTimeSeconds: number;
  /** Fixed epoch: 2026-01-15T14:00:00Z (non-live, stable for tests) */
  readonly createdAt: number;
  readonly nx: number;
  readonly ny: number;
  /** Same as nx/ny — LoggedMatchEvent requires x/y as required (not optional) */
  readonly x: number;
  readonly y: number;
  readonly tags?: readonly string[];
};

// ── Internal constants ────────────────────────────────────────────────────────

/** Fixed epoch used for all demo events: 2026-01-15T14:00:00 UTC */
const DEMO_CREATED_AT = 1768474800000;

// ── Internal raw-event type ───────────────────────────────────────────────────

type RawEvent = {
  /** 'h' = Ballylanders (HOME, FOR), 'a' = Galty Gaels (AWAY, OPP) */
  team: "h" | "a";
  kind: MatchEventKind;
  half: 1 | 2;
  /** matchClockSeconds relative to the half kick-off */
  t: number;
  /** Normalised pitch x [0, 1].
   *  H1: HOME attacks right (scores near nx=0.88–0.94), AWAY scores near nx=0.06–0.16.
   *  H2: directions flip — HOME scores near nx=0.06–0.14, AWAY near nx=0.86–0.94.
   *  Midfield/kickout/turnover events: nx ≈ 0.45–0.55. */
  nx: number;
  /** Normalised pitch y [0, 1]. Goal-mouth centre ≈ 0.50. */
  ny: number;
  tags?: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function segmentFromHalfAndClock(half: 1 | 2, t: number): MatchEventSegment {
  const hs = t < 600 ? 1 : t < 1200 ? 2 : 3;
  return (half === 1 ? hs : hs + 3) as MatchEventSegment;
}

function halfSegmentFromSegment(seg: MatchEventSegment): 1 | 2 | 3 {
  return (((seg - 1) % 3) + 1) as 1 | 2 | 3;
}

function buildEvent(raw: RawEvent, idx: number): DemoMatchEvent {
  const id =
    raw.team === "h"
      ? `team-home-demo-${idx}`
      : `team-away-demo-${idx}`;
  const teamSide: "FOR" | "OPP" = raw.team === "h" ? "FOR" : "OPP";
  const period: MatchEventPeriod = raw.half === 1 ? "1H" : "2H";
  const segment = segmentFromHalfAndClock(raw.half, raw.t);
  const halfSegment = halfSegmentFromSegment(segment);
  return {
    id,
    kind: raw.kind,
    type: raw.kind,
    teamSide,
    half: raw.half,
    period,
    segment,
    halfSegment,
    matchClockSeconds: raw.t,
    timestamp: raw.t,
    matchTimeSeconds: raw.t,
    createdAt: DEMO_CREATED_AT,
    nx: raw.nx,
    ny: raw.ny,
    x: raw.nx,
    y: raw.ny,
    ...(raw.tags ? { tags: raw.tags } : {}),
  };
}

// ── Raw event table ───────────────────────────────────────────────────────────
//
//  Chains verified against chain-rules.ts (maxWindowSeconds: KICKOUT=90s, TURNOVER=60s):
//    KICKOUT_TO_SCORE:             KICKOUT_WON  → SCORE   (SAME,     ≤30s gap) ← ×6 instances
//    KICKOUT_LOST_TO_SCORE_AGAINST:KICKOUT_CONCEDED→ SCORE (OPPOSITE, ≤30s gap) ← S4 t=30→60
//    TURNOVER_TO_SCORE:            TURNOVER_WON → SCORE   (SAME,     ≤30-40s)  ← ×3 instances
//    TURNOVER_TO_SHOT:             TURNOVER_WON → WIDE    (SAME,     ≤40s)     ← S6 t=1380→1420
//
//  Score ID prefix convention (for computeTeamScore):
//    Ballylanders events: id = "team-home-demo-N"  →  HOME score
//    Galty Gaels events:  id = "team-away-demo-N"  →  AWAY score

const RAW_HOME_EVENTS: RawEvent[] = [
  // ── Segment 1  (H1, 0–599s) ── BL score: 0-4 ─────────────────────────────
  { team: "h", kind: "KICKOUT_WON",  half: 1, t:   45, nx: 0.50, ny: 0.48 },          // chain anchor
  { team: "h", kind: "POINT",        half: 1, t:   75, nx: 0.88, ny: 0.50 },          // ← KICKOUT_TO_SCORE
  { team: "h", kind: "FREE_WON",     half: 1, t:  190, nx: 0.65, ny: 0.54 },
  { team: "h", kind: "FREE_SCORED",  half: 1, t:  220, nx: 0.84, ny: 0.50 },
  { team: "h", kind: "TURNOVER_WON", half: 1, t:  340, nx: 0.48, ny: 0.52 },          // chain anchor
  { team: "h", kind: "POINT",        half: 1, t:  370, nx: 0.86, ny: 0.45 },          // ← TURNOVER_TO_SCORE
  { team: "h", kind: "WIDE",         half: 1, t:  430, nx: 0.82, ny: 0.22 },
  { team: "h", kind: "POINT",        half: 1, t:  540, nx: 0.90, ny: 0.52 },

  // ── Segment 2  (H1, 600–1199s) ── BL score: 1-2 ──────────────────────────
  { team: "h", kind: "KICKOUT_WON",     half: 1, t:  630, nx: 0.50, ny: 0.50 },       // chain anchor
  { team: "h", kind: "GOAL",            half: 1, t:  660, nx: 0.92, ny: 0.50 },       // ← KICKOUT_TO_SCORE (goal!)
  { team: "h", kind: "POINT",           half: 1, t:  780, nx: 0.86, ny: 0.46 },
  { team: "h", kind: "POINT",           half: 1, t: 1010, nx: 0.89, ny: 0.55 },
  { team: "h", kind: "KICKOUT_CONCEDED",half: 1, t: 1060, nx: 0.50, ny: 0.52 },
  { team: "h", kind: "WIDE",            half: 1, t: 1150, nx: 0.80, ny: 0.18 },

  // ── Segment 3  (H1, 1200–1799s) ── BL score: 0-3 ─────────────────────────
  { team: "h", kind: "FREE_WON",     half: 1, t: 1260, nx: 0.62, ny: 0.48 },
  { team: "h", kind: "FREE_SCORED",  half: 1, t: 1290, nx: 0.85, ny: 0.50 },
  { team: "h", kind: "TURNOVER_WON", half: 1, t: 1420, nx: 0.46, ny: 0.54 },          // chain anchor
  { team: "h", kind: "POINT",        half: 1, t: 1450, nx: 0.88, ny: 0.48 },          // ← TURNOVER_TO_SCORE
  { team: "h", kind: "KICKOUT_WON",  half: 1, t: 1610, nx: 0.50, ny: 0.50 },          // chain anchor
  { team: "h", kind: "POINT",        half: 1, t: 1640, nx: 0.87, ny: 0.54 },          // ← KICKOUT_TO_SCORE
  { team: "h", kind: "WIDE",         half: 1, t: 1700, nx: 0.84, ny: 0.76 },

  // ── Segment 4  (H2, 0–599s) ── BL score: 0-3 ─────────────────────────────
  //  H2: Ballylanders attacks LEFT (nx → 0), Galty Gaels attacks RIGHT (nx → 1)
  { team: "h", kind: "KICKOUT_CONCEDED",half: 2, t:   30, nx: 0.50, ny: 0.50 },       // chain anchor (opp wins it)
  { team: "h", kind: "WIDE",            half: 2, t:  120, nx: 0.16, ny: 0.18 },
  { team: "h", kind: "FREE_WON",        half: 2, t:  160, nx: 0.38, ny: 0.52 },
  { team: "h", kind: "FREE_SCORED",     half: 2, t:  190, nx: 0.12, ny: 0.50 },
  { team: "h", kind: "KICKOUT_WON",     half: 2, t:  300, nx: 0.50, ny: 0.52 },       // chain anchor
  { team: "h", kind: "POINT",           half: 2, t:  330, nx: 0.14, ny: 0.48 },       // ← KICKOUT_TO_SCORE
  { team: "h", kind: "TURNOVER_WON",    half: 2, t:  400, nx: 0.44, ny: 0.56 },       // chain anchor
  { team: "h", kind: "POINT",           half: 2, t:  430, nx: 0.10, ny: 0.50 },       // ← TURNOVER_TO_SCORE

  // ── Segment 5  (H2, 600–1199s) ── BL score: 0-3 ──────────────────────────
  { team: "h", kind: "KICKOUT_WON",     half: 2, t:  640, nx: 0.50, ny: 0.50 },       // chain anchor
  { team: "h", kind: "POINT",           half: 2, t:  670, nx: 0.12, ny: 0.50 },       // ← KICKOUT_TO_SCORE
  { team: "h", kind: "WIDE",            half: 2, t:  800, nx: 0.18, ny: 0.80 },
  { team: "h", kind: "FREE_WON",        half: 2, t:  850, nx: 0.36, ny: 0.54 },
  { team: "h", kind: "FREE_SCORED",     half: 2, t:  880, nx: 0.10, ny: 0.50 },
  { team: "h", kind: "TURNOVER_LOST",   half: 2, t:  940, nx: 0.52, ny: 0.46 },
  { team: "h", kind: "TURNOVER_WON",    half: 2, t: 1020, nx: 0.44, ny: 0.52 },       // chain anchor
  { team: "h", kind: "POINT",           half: 2, t: 1060, nx: 0.14, ny: 0.48 },       // ← TURNOVER_TO_SCORE
  { team: "h", kind: "KICKOUT_CONCEDED",half: 2, t: 1160, nx: 0.50, ny: 0.50 },
  { team: "h", kind: "WIDE",            half: 2, t: 1185, nx: 0.16, ny: 0.18 },

  // ── Segment 6  (H2, 1200–1799s) ── BL score: 0-2 ─────────────────────────
  { team: "h", kind: "KICKOUT_WON",  half: 2, t: 1240, nx: 0.50, ny: 0.50 },          // chain anchor
  { team: "h", kind: "POINT",        half: 2, t: 1270, nx: 0.12, ny: 0.50 },          // ← KICKOUT_TO_SCORE
  { team: "h", kind: "TURNOVER_WON", half: 2, t: 1380, nx: 0.45, ny: 0.54 },          // chain anchor
  { team: "h", kind: "WIDE",         half: 2, t: 1420, nx: 0.18, ny: 0.76 },          // ← TURNOVER_TO_SHOT (gap=40s)
  { team: "h", kind: "KICKOUT_WON",  half: 2, t: 1590, nx: 0.50, ny: 0.48 },
  { team: "h", kind: "FREE_WON",     half: 2, t: 1640, nx: 0.35, ny: 0.52 },
  { team: "h", kind: "FREE_SCORED",  half: 2, t: 1680, nx: 0.10, ny: 0.50 },          // final score
  { team: "h", kind: "WIDE",         half: 2, t: 1730, nx: 0.16, ny: 0.24 },
];

const RAW_AWAY_EVENTS: RawEvent[] = [
  // ── Segment 1  (H1, 0–599s) ── GG score: 0-3 ─────────────────────────────
  { team: "a", kind: "POINT",        half: 1, t:  120, nx: 0.14, ny: 0.50 },
  { team: "a", kind: "KICKOUT_WON",  half: 1, t:  260, nx: 0.52, ny: 0.50 },          // chain anchor
  { team: "a", kind: "POINT",        half: 1, t:  290, nx: 0.12, ny: 0.48 },          // ← KICKOUT_TO_SCORE
  { team: "a", kind: "POINT",        half: 1, t:  480, nx: 0.16, ny: 0.55 },
  { team: "a", kind: "TURNOVER_WON", half: 1, t:  575, nx: 0.55, ny: 0.44 },

  // ── Segment 2  (H1, 600–1199s) ── GG score: 0-3 ──────────────────────────
  { team: "a", kind: "POINT",       half: 1, t:  720, nx: 0.10, ny: 0.50 },
  { team: "a", kind: "KICKOUT_WON", half: 1, t:  840, nx: 0.50, ny: 0.48 },           // chain anchor
  { team: "a", kind: "POINT",       half: 1, t:  870, nx: 0.16, ny: 0.52 },           // ← KICKOUT_TO_SCORE
  { team: "a", kind: "FREE_WON",    half: 1, t:  920, nx: 0.30, ny: 0.55 },
  { team: "a", kind: "FREE_SCORED", half: 1, t:  950, nx: 0.14, ny: 0.50 },
  { team: "a", kind: "WIDE",        half: 1, t: 1100, nx: 0.20, ny: 0.20 },

  // ── Segment 3  (H1, 1200–1799s) ── GG score: 0-2 ─────────────────────────
  { team: "a", kind: "TURNOVER_WON", half: 1, t: 1220, nx: 0.54, ny: 0.46 },
  { team: "a", kind: "POINT",        half: 1, t: 1350, nx: 0.12, ny: 0.48 },
  { team: "a", kind: "FREE_WON",     half: 1, t: 1510, nx: 0.35, ny: 0.55 },
  { team: "a", kind: "FREE_SCORED",  half: 1, t: 1540, nx: 0.15, ny: 0.50 },
  { team: "a", kind: "WIDE",         half: 1, t: 1750, nx: 0.18, ny: 0.80 },

  // ── Segment 4  (H2, 0–599s) ── GG score: 1-1 ─────────────────────────────
  //  KICKOUT_CONCEDED (HOME, t=30) → GOAL (AWAY, t=60): KICKOUT_LOST_TO_SCORE_AGAINST chain ✓
  { team: "a", kind: "GOAL",        half: 2, t:   60, nx: 0.90, ny: 0.50 },           // ← KICKOUT_LOST_TO_SCORE_AGAINST
  { team: "a", kind: "WIDE",        half: 2, t:  250, nx: 0.86, ny: 0.22 },
  { team: "a", kind: "KICKOUT_WON", half: 2, t:  490, nx: 0.52, ny: 0.48 },           // chain anchor
  { team: "a", kind: "POINT",       half: 2, t:  520, nx: 0.90, ny: 0.52 },           // ← KICKOUT_TO_SCORE

  // ── Segment 5  (H2, 600–1199s) ── GG score: 0-2 ──────────────────────────
  { team: "a", kind: "POINT", half: 2, t:  730, nx: 0.88, ny: 0.52 },
  { team: "a", kind: "POINT", half: 2, t:  970, nx: 0.88, ny: 0.46 },                 // after BL TURNOVER_LOST
  { team: "a", kind: "WIDE",  half: 2, t: 1110, nx: 0.82, ny: 0.22 },

  // ── Segment 6  (H2, 1200–1799s) ── GG score: 0-1 ─────────────────────────
  { team: "a", kind: "WIDE",        half: 2, t: 1320, nx: 0.84, ny: 0.22 },
  { team: "a", kind: "POINT",       half: 2, t: 1460, nx: 0.88, ny: 0.50 },           // consolation
  { team: "a", kind: "FREE_WON",    half: 2, t: 1510, nx: 0.68, ny: 0.52 },
  { team: "a", kind: "FREE_MISSED", half: 2, t: 1540, nx: 0.88, ny: 0.50 },           // GG can't convert
];

// ── Public generator ──────────────────────────────────────────────────────────

/**
 * Returns a deterministic, sorted array of demo match events.
 *
 * The return type is structurally identical to LoggedMatchEvent and may be
 * safely cast: `generateDemoMatchEvents() as unknown as readonly LoggedMatchEvent[]`
 *
 * Score verification:
 *   Ballylanders (HOME): 1 GOAL + 12 POINT + 5 FREE_SCORED = 1-17 (20pts)
 *   Galty Gaels   (AWAY): 1 GOAL + 10 POINT + 2 FREE_SCORED = 1-12 (15pts)
 */
export function generateDemoMatchEvents(): readonly DemoMatchEvent[] {
  const home: DemoMatchEvent[] = RAW_HOME_EVENTS.map((raw, i) =>
    buildEvent(raw, i),
  );
  const away: DemoMatchEvent[] = RAW_AWAY_EVENTS.map((raw, i) =>
    buildEvent(raw, i),
  );

  // Sort by half ASC then matchClockSeconds ASC — mirrors real logged-event order
  return [...home, ...away].sort((a, b) => {
    if (a.half !== b.half) return a.half - b.half;
    return a.matchClockSeconds - b.matchClockSeconds;
  });
}
