/**
 * demoMatchData.ts  —  Scenario Engine Lite
 *
 * Deterministic demo match: Ballylanders [DEMO] 1-17 · Galtee Gaels 1-12
 *
 * ── Spatial realism design ──────────────────────────────────────────────────
 *
 * All coordinates are drawn from named positional archetypes that encode real
 * GAA tactical situations.  No randomness, no generation logic — every nx/ny
 * is a deliberate, one-sentence-justifiable choice.
 *
 * Zone grid (zone-engine 3×3, boundaries at 0.333 / 0.667 on each axis):
 *   x-axis: 0–0.333 = Defensive  │  0.333–0.667 = Middle  │  0.667–1.0 = Attacking
 *   y-axis: 0–0.333 = Left       │  0.333–0.667 = Centre   │  0.667–1.0 = Right
 *
 * Team spatial identities:
 *   Ballylanders  — right-channel attack bias, high central transition,
 *                   turnover wins in MIDDLE_RIGHT, goal from ATTACKING_CENTRE
 *   Galtee Gaels  — longer-range shooting, corner-wide trademark,
 *                   defensive-half kickout losses, left-midfield channel
 *
 * Directional convention:
 *   H1: HOME (Ballylanders) attacks RIGHT  (scores nx → 1.0)
 *   H2: HOME (Ballylanders) attacks LEFT   (scores nx → 0.0)
 *   Absolute coordinates — the zone engine and PDF renderers do NOT flip.
 *
 * ID prefix convention (computeTeamScore filters by id.startsWith):
 *   Ballylanders  →  "team-home-demo-N"
 *   Galtee Gaels  →  "team-away-demo-N"
 *
 * Final score verification:
 *   Ballylanders:  1 GOAL + 12 POINT + 5 FREE_SCORED  =  1-17  (20 pts)
 *   Galtee Gaels:  1 GOAL + 10 POINT + 2 FREE_SCORED  =  1-12  (15 pts)
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
 * in StatsModeSurface.tsx.  All required fields present.
 */
export type DemoMatchEvent = {
  readonly id: string;
  readonly kind: MatchEventKind;
  readonly type: MatchEventKind;
  readonly teamSide: "FOR" | "OPP";
  readonly half: 1 | 2;
  readonly period: MatchEventPeriod;
  readonly segment: MatchEventSegment;
  readonly halfSegment: 1 | 2 | 3;
  readonly matchClockSeconds: number;
  readonly timestamp: number;
  readonly matchTimeSeconds: number;
  readonly createdAt: number;
  readonly nx: number;
  readonly ny: number;
  readonly x: number;
  readonly y: number;
  readonly tags?: readonly string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fixed epoch: 2026-01-15T14:00:00 UTC — stable for tests */
const DEMO_CREATED_AT = 1768474800000;

// ── Spatial archetype table ───────────────────────────────────────────────────
//
//  Each constant is [nx, ny].  Comments state the zone and one-sentence justification.
//  Only used inside RAW_HOME_EVENTS / RAW_AWAY_EVENTS below.
//
//  H1 = Ballylanders attack RIGHT (nx→1), Galtee Gaels attack LEFT (nx→0)
//  H2 = Ballylanders attack LEFT  (nx→0), Galtee Gaels attack RIGHT (nx→1)

// ── Ballylanders H1 attacking positions ──────────────────────────────────────
/** ATTACKING_RIGHT — right-channel run, BL's primary scoring lane H1 */
const BL_H1_SCORE_RIGHT   = [0.87, 0.67] as const;
/** ATTACKING_RIGHT — second right-channel variation, slightly deeper */
const BL_H1_SCORE_RIGHT2  = [0.83, 0.72] as const;
/** ATTACKING_CENTRE — central finish, left of centre */
const BL_H1_SCORE_CTR     = [0.91, 0.48] as const;
/** ATTACKING_CENTRE — central finish, right of centre */
const BL_H1_SCORE_CTR2    = [0.89, 0.54] as const;
/** ATTACKING_LEFT — left-wing point, shows BL width */
const BL_H1_SCORE_LEFT    = [0.85, 0.32] as const;
/** ATTACKING_CENTRE — close-range goal from danger zone, right of post */
const BL_H1_GOAL          = [0.93, 0.57] as const;
/** ATTACKING_RIGHT — right-corner shot, drifted wide of far post */
const BL_H1_WIDE_R        = [0.84, 0.82] as const;
/** ATTACKING_LEFT — left-angle shot, wide of near post */
const BL_H1_WIDE_L        = [0.87, 0.16] as const;
/** ATTACKING_CENTRE — long-range attempt, straight but tailing wide */
const BL_H1_WIDE_DEEP     = [0.78, 0.56] as const;
/** ATTACKING_RIGHT — fouled in the right channel, free awarded */
const BL_H1_FREE_WON_R    = [0.70, 0.64] as const;
/** ATTACKING_CENTRE — central free position */
const BL_H1_FREE_WON_CTR  = [0.65, 0.50] as const;
/** ATTACKING_CENTRE — free bisects posts centrally */
const BL_H1_FREE_SCORED   = [0.85, 0.50] as const;
/** MIDDLE_RIGHT — BL high-press wins turnover in right midfield channel */
const BL_H1_TO_WIN_R      = [0.58, 0.68] as const;
/** MIDDLE_CENTRE — BL wins ball centrally in transition */
const BL_H1_TO_WIN_CTR    = [0.53, 0.52] as const;
/** MIDDLE_RIGHT — BL retains own kickout, right midfield corridor */
const BL_H1_KO_WIN_OWN_R  = [0.54, 0.66] as const;
/** MIDDLE_CENTRE — BL retains own kickout slightly left of centre */
const BL_H1_KO_WIN_OWN_L  = [0.52, 0.42] as const;
/** ATTACKING_CENTRE — BL wins GG's kickout deep in GG's half */
const BL_H1_KO_WIN_OPP   = [0.70, 0.58] as const;
/** MIDDLE_LEFT — BL kickout lost, GG win the contest in left channel */
const BL_H1_KO_CONCEDED   = [0.42, 0.34] as const;

// ── Galtee Gaels H1 attacking positions ──────────────────────────────────────
/** DEFENSIVE_CENTRE — GG central score, typical longer-range effort */
const GG_H1_SCORE_CTR     = [0.11, 0.50] as const;
/** DEFENSIVE_RIGHT — long-range point from GG's right channel */
const GG_H1_SCORE_LONG_R  = [0.22, 0.68] as const;
/** DEFENSIVE_LEFT — long-range effort from left channel */
const GG_H1_SCORE_LONG_L  = [0.20, 0.30] as const;
/** DEFENSIVE_RIGHT — GG corner shot, trademark wide from right corner */
const GG_H1_WIDE_CRN_R    = [0.13, 0.88] as const;
/** DEFENSIVE_LEFT — GG corner shot, trademark wide from left corner */
const GG_H1_WIDE_CRN_L    = [0.17, 0.08] as const;
/** MIDDLE_CENTRE — GG free won deep in their own attacking effort */
const GG_H1_FREE_WON      = [0.32, 0.56] as const;
/** DEFENSIVE_CENTRE — GG free scored centrally */
const GG_H1_FREE_SCORED   = [0.14, 0.50] as const;
/** MIDDLE_CENTRE — GG wins ball in central midfield */
const GG_H1_TO_WIN        = [0.57, 0.44] as const;
/** MIDDLE_LEFT — GG wins kickout, left midfield channel */
const GG_H1_KO_WIN_L      = [0.47, 0.28] as const;

// ── Ballylanders H2 attacking positions (attacks LEFT, nx→0) ─────────────────
/** MIDDLE_CENTRE — H2 restart, GG win the opening kickoff */
const BL_H2_KO_CONCEDED   = [0.50, 0.52] as const;
/** DEFENSIVE_LEFT — BL miss left post angle, H2 */
const BL_H2_WIDE_L        = [0.15, 0.18] as const;
/** DEFENSIVE_RIGHT — BL wide, right post angle, H2 */
const BL_H2_WIDE_R        = [0.17, 0.80] as const;
/** MIDDLE_CENTRE — BL free won centrally, H2 */
const BL_H2_FREE_WON_CTR  = [0.38, 0.52] as const;
/** MIDDLE_CENTRE — BL free won slightly left of centre, H2 */
const BL_H2_FREE_WON_L    = [0.36, 0.52] as const;
/** DEFENSIVE_CENTRE — BL point, central finish attacking left end */
const BL_H2_SCORE_CTR     = [0.10, 0.50] as const;
/** DEFENSIVE_RIGHT — BL point, right channel (mirror of H1 left channel) */
const BL_H2_SCORE_RIGHT   = [0.13, 0.66] as const;
/** DEFENSIVE_LEFT — BL point, left channel variation H2 */
const BL_H2_SCORE_LEFT    = [0.14, 0.36] as const;
/** MIDDLE_CENTRE — BL retains own kickout, H2 */
const BL_H2_KO_WIN_CTR   = [0.52, 0.46] as const;
/** MIDDLE_RIGHT — BL wins GG's kickout, right midfield channel H2 */
const BL_H2_KO_WIN_DEEP  = [0.36, 0.62] as const;
/** MIDDLE_CENTRE — BL turnover win, H2 */
const BL_H2_TO_WIN        = [0.46, 0.56] as const;
/** MIDDLE_CENTRE — BL turnover lost, H2 */
const BL_H2_TO_LOST       = [0.53, 0.46] as const;
/** DEFENSIVE_CENTRE — BL late free, closing score of match */
const BL_H2_FREE_SCORED   = [0.09, 0.50] as const;
/** MIDDLE_CENTRE — kickout conceded late in H2 */
const BL_H2_KO_CONCEDED_L = [0.50, 0.50] as const;

// ── Galtee Gaels H2 attacking positions (attacks RIGHT, nx→1) ────────────────
/** ATTACKING_CENTRE — GG goal from danger zone, left of post — big H2 moment */
const GG_H2_GOAL          = [0.91, 0.43] as const;
/** ATTACKING_LEFT — GG trademark corner shot, wide left in H2 */
const GG_H2_WIDE_CORNER   = [0.86, 0.18] as const;
/** MIDDLE_CENTRE — GG wins kickout, H2 */
const GG_H2_KO_WIN        = [0.52, 0.54] as const;
/** ATTACKING_CENTRE — GG central point, H2 */
const GG_H2_SCORE_CTR     = [0.90, 0.54] as const;
/** ATTACKING_CENTRE — GG longer-range point, H2 identity maintained */
const GG_H2_SCORE_LONG    = [0.80, 0.46] as const;
/** ATTACKING_RIGHT — GG corner shot wide, right side H2 */
const GG_H2_WIDE_FAR      = [0.83, 0.82] as const;
/** ATTACKING_CENTRE — GG free awarded centrally, H2 */
const GG_H2_FREE_WON      = [0.70, 0.54] as const;
/** ATTACKING_CENTRE — GG free missed under pressure, H2 */
const GG_H2_FREE_MISSED   = [0.89, 0.52] as const;

// ── Internal raw-event type ───────────────────────────────────────────────────

type RawEvent = {
  team: "h" | "a";
  kind: MatchEventKind;
  half: 1 | 2;
  t: number;
  nx: number;
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

// ── Raw event tables ──────────────────────────────────────────────────────────
//
//  Chains verified against chain-rules.ts window constraints:
//    KICKOUT_TO_SCORE:              KICKOUT_WON  → SCORE   SAME     ≤90s
//    KICKOUT_LOST_TO_SCORE_AGAINST: KICKOUT_CONCEDED → SCORE OPP    ≤90s
//    TURNOVER_TO_SCORE:             TURNOVER_WON → SCORE   SAME     ≤60s
//    TURNOVER_TO_SHOT:              TURNOVER_WON → SHOT    SAME     ≤60s
//
//  Score segments:
//    Seg 1 (H1 0–599s):   BL 0-4  GG 0-3  →  BL 0-4   GG 0-3
//    Seg 2 (H1 600–1199s): BL 1-2  GG 0-3  →  BL 1-6   GG 0-6
//    Seg 3 (H1 1200–1799s):BL 0-3  GG 0-2  →  BL 1-9   GG 0-8  (H/T)
//    Seg 4 (H2 0–599s):   BL 0-3  GG 1-1  →  BL 1-12  GG 1-9
//    Seg 5 (H2 600–1199s): BL 0-3  GG 0-2  →  BL 1-15  GG 1-11
//    Seg 6 (H2 1200–1799s):BL 0-2  GG 0-1  →  BL 1-17  GG 1-12 ✓

const RAW_HOME_EVENTS: RawEvent[] = [
  // ── Segment 1  (H1, 0–599s) ── BL score: 0-4 ─────────────────────────────
  // KICKOUT_TO_SCORE chain: KO win at right-midfield → point right channel
  { team: "h", kind: "KICKOUT_WON",   half: 1, t:   45, ...arr(BL_H1_KO_WIN_OWN_R) },
  { team: "h", kind: "POINT",         half: 1, t:   75, ...arr(BL_H1_SCORE_RIGHT)   }, // ← chain
  { team: "h", kind: "FREE_WON",      half: 1, t:  190, ...arr(BL_H1_FREE_WON_R)   },
  { team: "h", kind: "FREE_SCORED",   half: 1, t:  220, ...arr(BL_H1_FREE_SCORED)  },
  // TURNOVER_TO_SCORE chain: turnover win in right midfield → point right channel
  { team: "h", kind: "TURNOVER_WON",  half: 1, t:  340, ...arr(BL_H1_TO_WIN_R)     },
  { team: "h", kind: "POINT",         half: 1, t:  370, ...arr(BL_H1_SCORE_RIGHT2) }, // ← chain
  { team: "h", kind: "WIDE",          half: 1, t:  430, ...arr(BL_H1_WIDE_R)       },
  { team: "h", kind: "POINT",         half: 1, t:  540, ...arr(BL_H1_SCORE_CTR)    },

  // ── Segment 2  (H1, 600–1199s) ── BL score: 1-2 ──────────────────────────
  // KICKOUT_TO_SCORE chain: BL wins GG's kickout deep → GOAL from danger zone
  { team: "h", kind: "KICKOUT_WON",      half: 1, t:  630, ...arr(BL_H1_KO_WIN_OPP)  },
  { team: "h", kind: "GOAL",             half: 1, t:  660, ...arr(BL_H1_GOAL)         }, // ← chain
  { team: "h", kind: "POINT",            half: 1, t:  780, ...arr(BL_H1_SCORE_CTR2)  },
  { team: "h", kind: "POINT",            half: 1, t: 1010, ...arr(BL_H1_SCORE_LEFT)  },
  { team: "h", kind: "KICKOUT_CONCEDED", half: 1, t: 1060, ...arr(BL_H1_KO_CONCEDED) },
  { team: "h", kind: "WIDE",             half: 1, t: 1150, ...arr(BL_H1_WIDE_L)      },

  // ── Segment 3  (H1, 1200–1799s) ── BL score: 0-3 ─────────────────────────
  { team: "h", kind: "FREE_WON",      half: 1, t: 1260, ...arr(BL_H1_FREE_WON_CTR) },
  { team: "h", kind: "FREE_SCORED",   half: 1, t: 1290, ...arr(BL_H1_FREE_SCORED)  },
  // TURNOVER_TO_SCORE chain: central turnover → point central
  { team: "h", kind: "TURNOVER_WON",  half: 1, t: 1420, ...arr(BL_H1_TO_WIN_CTR)  },
  { team: "h", kind: "POINT",         half: 1, t: 1450, ...arr(BL_H1_SCORE_CTR2)  }, // ← chain
  // KICKOUT_TO_SCORE chain: own kickout retained → late H1 point
  { team: "h", kind: "KICKOUT_WON",   half: 1, t: 1610, ...arr(BL_H1_KO_WIN_OWN_L) },
  { team: "h", kind: "POINT",         half: 1, t: 1640, ...arr(BL_H1_SCORE_CTR)   }, // ← chain
  // TURNOVER_TO_SHOT: turnover won → wide attempt (close but no score)
  { team: "h", kind: "WIDE",          half: 1, t: 1700, ...arr(BL_H1_WIDE_DEEP)   },

  // ── Segment 4  (H2, 0–599s) ── BL score: 0-3 ─────────────────────────────
  // KICKOUT_LOST_TO_SCORE_AGAINST chain anchor (GG wins opening H2 kickout → GOAL)
  { team: "h", kind: "KICKOUT_CONCEDED", half: 2, t:   30, ...arr(BL_H2_KO_CONCEDED)  },
  { team: "h", kind: "WIDE",             half: 2, t:  120, ...arr(BL_H2_WIDE_L)        },
  { team: "h", kind: "FREE_WON",         half: 2, t:  160, ...arr(BL_H2_FREE_WON_CTR) },
  { team: "h", kind: "FREE_SCORED",      half: 2, t:  190, ...arr(BL_H2_SCORE_CTR)    },
  // KICKOUT_TO_SCORE chain: BL wins own kickout → point right channel
  { team: "h", kind: "KICKOUT_WON",      half: 2, t:  300, ...arr(BL_H2_KO_WIN_CTR)   },
  { team: "h", kind: "POINT",            half: 2, t:  330, ...arr(BL_H2_SCORE_RIGHT)  }, // ← chain
  // TURNOVER_TO_SCORE chain: turnover win → point
  { team: "h", kind: "TURNOVER_WON",     half: 2, t:  400, ...arr(BL_H2_TO_WIN)       },
  { team: "h", kind: "POINT",            half: 2, t:  430, ...arr(BL_H2_SCORE_CTR)    }, // ← chain

  // ── Segment 5  (H2, 600–1199s) ── BL score: 0-3 ──────────────────────────
  // KICKOUT_TO_SCORE chain: BL wins deep kickout → point
  { team: "h", kind: "KICKOUT_WON",      half: 2, t:  640, ...arr(BL_H2_KO_WIN_DEEP)  },
  { team: "h", kind: "POINT",            half: 2, t:  670, ...arr(BL_H2_SCORE_LEFT)   }, // ← chain
  { team: "h", kind: "WIDE",             half: 2, t:  800, ...arr(BL_H2_WIDE_R)        },
  { team: "h", kind: "FREE_WON",         half: 2, t:  850, ...arr(BL_H2_FREE_WON_L)   },
  { team: "h", kind: "FREE_SCORED",      half: 2, t:  880, ...arr(BL_H2_SCORE_CTR)    },
  { team: "h", kind: "TURNOVER_LOST",    half: 2, t:  940, ...arr(BL_H2_TO_LOST)      },
  // TURNOVER_TO_SCORE chain: BL wins ball back → point
  { team: "h", kind: "TURNOVER_WON",     half: 2, t: 1020, ...arr(BL_H2_TO_WIN)       },
  { team: "h", kind: "POINT",            half: 2, t: 1060, ...arr(BL_H2_SCORE_RIGHT)  }, // ← chain
  { team: "h", kind: "KICKOUT_CONCEDED", half: 2, t: 1160, ...arr(BL_H2_KO_CONCEDED_L) },
  { team: "h", kind: "WIDE",             half: 2, t: 1185, ...arr(BL_H2_WIDE_L)        },

  // ── Segment 6  (H2, 1200–1799s) ── BL score: 0-2 ─────────────────────────
  // KICKOUT_TO_SCORE chain: BL wins own kickout → point
  { team: "h", kind: "KICKOUT_WON",  half: 2, t: 1240, ...arr(BL_H2_KO_WIN_CTR)   },
  { team: "h", kind: "POINT",        half: 2, t: 1270, ...arr(BL_H2_SCORE_CTR)    }, // ← chain
  // TURNOVER_TO_SHOT: turnover win → wide (so close in closing minutes)
  { team: "h", kind: "TURNOVER_WON", half: 2, t: 1380, ...arr(BL_H2_TO_WIN)       },
  { team: "h", kind: "WIDE",         half: 2, t: 1420, ...arr(BL_H2_WIDE_R)        }, // ← chain
  { team: "h", kind: "KICKOUT_WON",  half: 2, t: 1590, ...arr(BL_H2_KO_WIN_DEEP)  },
  { team: "h", kind: "FREE_WON",     half: 2, t: 1640, ...arr(BL_H2_FREE_WON_CTR) },
  { team: "h", kind: "FREE_SCORED",  half: 2, t: 1680, ...arr(BL_H2_FREE_SCORED)  }, // final score
  { team: "h", kind: "WIDE",         half: 2, t: 1730, ...arr(BL_H2_WIDE_L)        },
];

const RAW_AWAY_EVENTS: RawEvent[] = [
  // ── Segment 1  (H1, 0–599s) ── GG score: 0-3 ─────────────────────────────
  { team: "a", kind: "POINT",        half: 1, t:  120, ...arr(GG_H1_SCORE_CTR)    },
  // KICKOUT_TO_SCORE chain: GG wins kickout left channel → point right of centre
  { team: "a", kind: "KICKOUT_WON",  half: 1, t:  260, ...arr(GG_H1_KO_WIN_L)    },
  { team: "a", kind: "POINT",        half: 1, t:  290, ...arr(GG_H1_SCORE_LONG_R) }, // ← chain
  { team: "a", kind: "POINT",        half: 1, t:  480, ...arr(GG_H1_SCORE_LONG_L) },
  { team: "a", kind: "TURNOVER_WON", half: 1, t:  575, ...arr(GG_H1_TO_WIN)       },

  // ── Segment 2  (H1, 600–1199s) ── GG score: 0-3 ──────────────────────────
  { team: "a", kind: "POINT",       half: 1, t:  720, ...arr(GG_H1_SCORE_CTR)    },
  // KICKOUT_TO_SCORE chain: GG wins kickout left → longer-range point
  { team: "a", kind: "KICKOUT_WON", half: 1, t:  840, ...arr(GG_H1_KO_WIN_L)    },
  { team: "a", kind: "POINT",       half: 1, t:  870, ...arr(GG_H1_SCORE_LONG_L) }, // ← chain
  { team: "a", kind: "FREE_WON",    half: 1, t:  920, ...arr(GG_H1_FREE_WON)    },
  { team: "a", kind: "FREE_SCORED", half: 1, t:  950, ...arr(GG_H1_FREE_SCORED)  },
  { team: "a", kind: "WIDE",        half: 1, t: 1100, ...arr(GG_H1_WIDE_CRN_L)  }, // corner trademark

  // ── Segment 3  (H1, 1200–1799s) ── GG score: 0-2 ─────────────────────────
  { team: "a", kind: "TURNOVER_WON", half: 1, t: 1220, ...arr(GG_H1_TO_WIN)      },
  { team: "a", kind: "POINT",        half: 1, t: 1350, ...arr(GG_H1_SCORE_LONG_R) },
  { team: "a", kind: "FREE_WON",     half: 1, t: 1510, ...arr(GG_H1_FREE_WON)    },
  { team: "a", kind: "FREE_SCORED",  half: 1, t: 1540, ...arr(GG_H1_FREE_SCORED)  },
  { team: "a", kind: "WIDE",         half: 1, t: 1750, ...arr(GG_H1_WIDE_CRN_R)  }, // corner trademark

  // ── Segment 4  (H2, 0–599s) ── GG score: 1-1 ─────────────────────────────
  // KICKOUT_LOST_TO_SCORE_AGAINST: BL KICKOUT_CONCEDED(t=30) → GG GOAL(t=60) ✓
  { team: "a", kind: "GOAL",        half: 2, t:   60, ...arr(GG_H2_GOAL)         }, // ← chain: danger zone goal
  { team: "a", kind: "WIDE",        half: 2, t:  250, ...arr(GG_H2_WIDE_CORNER)  }, // corner trademark H2
  // KICKOUT_TO_SCORE chain: GG wins kickout → point
  { team: "a", kind: "KICKOUT_WON", half: 2, t:  490, ...arr(GG_H2_KO_WIN)       },
  { team: "a", kind: "POINT",       half: 2, t:  520, ...arr(GG_H2_SCORE_CTR)    }, // ← chain

  // ── Segment 5  (H2, 600–1199s) ── GG score: 0-2 ──────────────────────────
  { team: "a", kind: "POINT", half: 2, t:  730, ...arr(GG_H2_SCORE_LONG)         },
  { team: "a", kind: "POINT", half: 2, t:  970, ...arr(GG_H2_SCORE_CTR)          }, // after BL turnover lost
  { team: "a", kind: "WIDE",  half: 2, t: 1110, ...arr(GG_H2_WIDE_FAR)           }, // corner trademark

  // ── Segment 6  (H2, 1200–1799s) ── GG score: 0-1 ─────────────────────────
  { team: "a", kind: "WIDE",        half: 2, t: 1320, ...arr(GG_H2_WIDE_CORNER)  }, // corner trademark
  { team: "a", kind: "POINT",       half: 2, t: 1460, ...arr(GG_H2_SCORE_LONG)   }, // consolation
  { team: "a", kind: "FREE_WON",    half: 2, t: 1510, ...arr(GG_H2_FREE_WON)    },
  { team: "a", kind: "FREE_MISSED", half: 2, t: 1540, ...arr(GG_H2_FREE_MISSED)  }, // GG can't convert
];

// ── Spread helper (keeps RawEvent construction readable) ─────────────────────

function arr(pos: readonly [number, number]): { nx: number; ny: number } {
  return { nx: pos[0], ny: pos[1] };
}

// ── Public generator ──────────────────────────────────────────────────────────

/**
 * Returns deterministic, sorted demo match events.
 *
 * Safe cast at call site:
 *   `generateDemoMatchEvents() as unknown as readonly LoggedMatchEvent[]`
 *
 * Score verification:
 *   Ballylanders (HOME): 1 GOAL + 12 POINT + 5 FREE_SCORED = 1-17 (20 pts)
 *   Galtee Gaels  (AWAY): 1 GOAL + 10 POINT + 2 FREE_SCORED = 1-12 (15 pts)
 */
export function generateDemoMatchEvents(): readonly DemoMatchEvent[] {
  const home: DemoMatchEvent[] = RAW_HOME_EVENTS.map((raw, i) =>
    buildEvent(raw, i),
  );
  const away: DemoMatchEvent[] = RAW_AWAY_EVENTS.map((raw, i) =>
    buildEvent(raw, i),
  );
  return [...home, ...away].sort((a, b) => {
    if (a.half !== b.half) return a.half - b.half;
    return a.matchClockSeconds - b.matchClockSeconds;
  });
}
