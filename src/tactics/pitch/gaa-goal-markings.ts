import type { PitchMarking } from "../../core/pitch/pitch-config";

/**
 * Tactics-only GAA goal geometry.
 *
 * Consumed exclusively by:
 *   - src/tactical-lite/pixi/renderTacticalPitch.ts (Tactical Slate)
 *   - src/movement-board/pitch/create-pitch-root.ts (Tactical Play)
 *
 * This module must never be imported by src/core/pitch/**, src/pro-tagger/**,
 * src/stats/**, or src/rapid-capture/** — those surfaces render from
 * src/core/pitch/pitch-config.ts, which intentionally has no goal markings.
 * Pure data/geometry only: no PixiJS, no DOM, no renderer logic.
 */

// Tactics viewbox — matches BOARD_PITCH_VIEWBOX used by both consuming renderers.
const LEFT_ENDLINE_X = 2;
const RIGHT_ENDLINE_X = 158;
const CENTRE_Y = 50;

// Normalized goal dimensions (viewbox units). Deliberately compressed relative
// to real GAA measurements — see the goalposts audit — to fit the turf margin
// between the endline and the viewbox edge without touching it.
const HALF_GOAL_WIDTH = 3.47;
const CROSSBAR_DEPTH = 0.8;
const TOTAL_POST_DEPTH = 1.15;

const POST_STROKE_WIDTH = 0.17;
const CROSSBAR_STROKE_WIDTH = 0.2;
const FRAME_STROKE_WIDTH = 0.12;

// Near-white — matches the base pitch-line color language. Renderers apply
// their own theme tint (e.g. Slate's whiteboard mode) on top of this, the
// same way they already tint the shared base pitch markings.
const GOAL_STROKE = "rgba(255,255,255,0.85)";

function buildGoalMarkings(endlineX: number, outward: 1 | -1): PitchMarking[] {
  const postDepthX = endlineX + outward * TOTAL_POST_DEPTH;
  const crossbarX = endlineX + outward * CROSSBAR_DEPTH;
  const topY = CENTRE_Y - HALF_GOAL_WIDTH;
  const bottomY = CENTRE_Y + HALF_GOAL_WIDTH;

  return [
    // Near upright
    {
      kind: "line",
      x1: endlineX,
      y1: topY,
      x2: postDepthX,
      y2: topY,
      stroke: GOAL_STROKE,
      strokeWidth: POST_STROKE_WIDTH,
    },
    // Far upright
    {
      kind: "line",
      x1: endlineX,
      y1: bottomY,
      x2: postDepthX,
      y2: bottomY,
      stroke: GOAL_STROKE,
      strokeWidth: POST_STROKE_WIDTH,
    },
    // Crossbar, connecting the uprights partway along their depth so both
    // posts read as continuing above it.
    {
      kind: "line",
      x1: crossbarX,
      y1: topY,
      x2: crossbarX,
      y2: bottomY,
      stroke: GOAL_STROKE,
      strokeWidth: CROSSBAR_STROKE_WIDTH,
    },
    // Minimal unfilled goal-opening frame, between the endline and the
    // crossbar depth — no fill, no net.
    {
      kind: "rect",
      x: Math.min(endlineX, crossbarX),
      y: topY,
      w: Math.abs(crossbarX - endlineX),
      h: bottomY - topY,
      stroke: GOAL_STROKE,
      strokeWidth: FRAME_STROKE_WIDTH,
    },
  ];
}

/**
 * Builds both goals (mirrored left/right) as PitchMarking line/rect entries,
 * ready to hand to either renderer's existing marking-drawing path.
 */
export function buildGaaGoalMarkings(): PitchMarking[] {
  return [
    ...buildGoalMarkings(LEFT_ENDLINE_X, -1),
    ...buildGoalMarkings(RIGHT_ENDLINE_X, 1),
  ];
}
