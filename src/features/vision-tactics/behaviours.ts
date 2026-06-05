import type { NormalizedPoint } from "../../movement-board/coordinates/normalization";
import type { MovementBoardToken } from "../../movement-board/shell/types";

// ── Category ──────────────────────────────────────────────────────────────────

export type BehaviourCategory = "ATTACK" | "DEFENCE" | "TRANSITION";

// ── Participant ───────────────────────────────────────────────────────────────
// Each offset is incremental — relative to the previous waypoint (or the
// token's current position for the first offset). This makes behaviours
// formation-agnostic: they compose with any template or manual arrangement.

export type BehaviourParticipant = {
  jerseyNumber: number;
  offsets: Array<{ dx: number; dy: number }>;
};

// ── Behaviour ─────────────────────────────────────────────────────────────────

export type Behaviour = {
  id: string;
  name: string;
  category: BehaviourCategory;
  description: string;
  participants: BehaviourParticipant[];
};

// ── Route output type ─────────────────────────────────────────────────────────
// Structurally compatible with MovementBoardRoute — resolved at apply-time
// by mapping jersey numbers → token ids and offsets → absolute coordinates.

export type BehaviourRoute = {
  playerId: string;
  points: NormalizedPoint[];
};

// ── Support Run ───────────────────────────────────────────────────────────────
// CF drives into the central channel. Both half-forwards peel to widen the
// space and give the ball carrier triangle support options.

const supportRun: Behaviour = {
  id: "support-run",
  name: "Support Run",
  category: "ATTACK",
  description: "CF central drive, flanks peel wide.",
  participants: [
    {
      jerseyNumber: 11, // CF — curves into right channel
      offsets: [{ dx: 8, dy: -4 }, { dx: 6, dy: -3 }, { dx: 4, dy: -2 }],
    },
    {
      jerseyNumber: 10, // RHF — peels wider right and forward
      offsets: [{ dx: 6, dy: -8 }, { dx: 5, dy: -6 }],
    },
    {
      jerseyNumber: 12, // LHF — drifts wider left and forward
      offsets: [{ dx: 10, dy: 8 }, { dx: 8, dy: 5 }],
    },
  ],
};

// ── Overlap ───────────────────────────────────────────────────────────────────
// Right half-back bursts up the right flank. Right half-forward cuts inside
// to create the overlap space. Right midfielder follows up centrally.

const overlap: Behaviour = {
  id: "overlap",
  name: "Overlap",
  category: "ATTACK",
  description: "RHB bursts flank as RHF cuts inside.",
  participants: [
    {
      jerseyNumber: 5,  // RHB — burst up right flank
      offsets: [{ dx: 12, dy: -5 }, { dx: 10, dy: -4 }, { dx: 8, dy: -3 }],
    },
    {
      jerseyNumber: 10, // RHF — cut inside to open right channel
      offsets: [{ dx: 8, dy: 8 }, { dx: 6, dy: 5 }],
    },
    {
      jerseyNumber: 8,  // RMid — central follow-up support
      offsets: [{ dx: 8, dy: -3 }, { dx: 6, dy: -2 }],
    },
  ],
};

// ── Shadow Run ────────────────────────────────────────────────────────────────
// FF makes a shadow movement right to pull the last defender, then breaks hard
// left into space. CF takes the decoy run right. RCF exploits the gap.

const shadowRun: Behaviour = {
  id: "shadow-run",
  name: "Shadow Run",
  category: "ATTACK",
  description: "FF decoys right, breaks left into space.",
  participants: [
    {
      jerseyNumber: 14, // FF — shadow right, then sharp break left
      offsets: [{ dx: 4, dy: -5 }, { dx: 8, dy: 10 }],
    },
    {
      jerseyNumber: 11, // CF — decoy run far right to draw defender
      offsets: [{ dx: 5, dy: -10 }, { dx: 4, dy: -8 }],
    },
    {
      jerseyNumber: 13, // RCF — exploits space vacated by CF's decoy
      offsets: [{ dx: 10, dy: -3 }, { dx: 8, dy: -2 }],
    },
  ],
};

// ── Press Shift ───────────────────────────────────────────────────────────────
// Forward and midfield line shifts right together to press a ball carrier
// moving toward the right touchline. Cut off escape routes with angle runs.

const pressShift: Behaviour = {
  id: "press-shift",
  name: "Press Shift",
  category: "DEFENCE",
  description: "Forward line shifts right, angles closed.",
  participants: [
    {
      jerseyNumber: 14, // FF — leads press toward right
      offsets: [{ dx: 4, dy: -8 }, { dx: 3, dy: -6 }],
    },
    {
      jerseyNumber: 13, // RCF — closes down escape angle
      offsets: [{ dx: 5, dy: -5 }, { dx: 4, dy: -4 }],
    },
    {
      jerseyNumber: 11, // CF — covers center, shifts right
      offsets: [{ dx: 3, dy: -6 }, { dx: 2, dy: -4 }],
    },
    {
      jerseyNumber: 10, // RHF — tracks play wide
      offsets: [{ dx: 4, dy: -4 }, { dx: 3, dy: -3 }],
    },
    {
      jerseyNumber: 8,  // RMid — presses midfield right
      offsets: [{ dx: 5, dy: -3 }, { dx: 4, dy: -2 }],
    },
  ],
};

// ── Defensive Slide ───────────────────────────────────────────────────────────
// Full-back and half-back lines slide left together to protect the central
// channel as the ball moves to the left side.

const defensiveSlide: Behaviour = {
  id: "defensive-slide",
  name: "Defensive Slide",
  category: "DEFENCE",
  description: "Backline slides left, central channel closed.",
  participants: [
    {
      jerseyNumber: 2, // RCB — slides toward center
      offsets: [{ dx: 0, dy: 8 }, { dx: 0, dy: 5 }],
    },
    {
      jerseyNumber: 3, // FB — slides left
      offsets: [{ dx: 0, dy: 8 }, { dx: 0, dy: 6 }],
    },
    {
      jerseyNumber: 4, // LCB — slides further left
      offsets: [{ dx: 0, dy: 10 }, { dx: 0, dy: 7 }],
    },
    {
      jerseyNumber: 6, // CB — drops and adjusts centrally
      offsets: [{ dx: -3, dy: 5 }, { dx: -2, dy: 4 }],
    },
    {
      jerseyNumber: 5, // RHB — drops and slides left
      offsets: [{ dx: -2, dy: 6 }, { dx: -2, dy: 5 }],
    },
  ],
};

// ── Forward Rotation ──────────────────────────────────────────────────────────
// Corner forwards cross and rotate, FF drops and re-emerges opposite side,
// CF drifts into the space vacated by RCF. Breaks defensive shape.

const forwardRotation: Behaviour = {
  id: "forward-rotation",
  name: "Forward Rotation",
  category: "ATTACK",
  description: "Forwards rotate to break defensive shape.",
  participants: [
    {
      jerseyNumber: 13, // RCF — rotates left across the face of goal
      offsets: [{ dx: 3, dy: 14 }, { dx: 3, dy: 10 }, { dx: 2, dy: 8 }],
    },
    {
      jerseyNumber: 15, // LCF — rotates right across
      offsets: [{ dx: 3, dy: -14 }, { dx: 3, dy: -10 }, { dx: 2, dy: -8 }],
    },
    {
      jerseyNumber: 14, // FF — drops deep, then breaks hard left
      offsets: [{ dx: -6, dy: -4 }, { dx: 10, dy: 8 }],
    },
    {
      jerseyNumber: 11, // CF — drifts right into space vacated by RCF
      offsets: [{ dx: 5, dy: -10 }, { dx: 4, dy: -7 }],
    },
  ],
};

// ── Registry ──────────────────────────────────────────────────────────────────
// Display order shown in the Runs drawer. Add a new behaviour here — no other
// files need changing.

export const BEHAVIOURS: Behaviour[] = [
  supportRun,
  overlap,
  shadowRun,
  pressShift,
  defensiveSlide,
  forwardRotation,
];

// ── Application ───────────────────────────────────────────────────────────────
// Resolves a behaviour against the current token positions. Offsets are
// accumulated incrementally (each offset is relative to the previous waypoint).
// Returned routes are compatible with MovementBoardRoute / shell.setRoutes().

function clampNorm(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export function applyBehaviour(
  tokens: MovementBoardToken[],
  behaviour: Behaviour,
): BehaviourRoute[] {
  return behaviour.participants.flatMap((participant) => {
    const token = tokens.find((t) => t.number === participant.jerseyNumber);
    if (!token) return [];

    let x = token.position.x;
    let y = token.position.y;
    const points: NormalizedPoint[] = [];

    for (const { dx, dy } of participant.offsets) {
      x = clampNorm(x + dx);
      y = clampNorm(y + dy);
      points.push({ x, y });
    }

    if (points.length === 0) return [];
    return [{ playerId: token.id, points }];
  });
}
