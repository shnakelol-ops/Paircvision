import type { PitchMarking } from "../../core/pitch/pitch-config";
import { RUGBY_TRY_LINE_LEFT_X, RUGBY_TRY_LINE_RIGHT_X } from "../../core/pitch/pitch-config";

/**
 * Tactics-only Rugby Union post geometry.
 *
 * Consumed exclusively by:
 *   - src/tactical-lite/pixi/renderTacticalPitch.ts (Tactical Slate, /internal/slate/rugby)
 *
 * Mirrors gaa-goal-markings.ts's abstraction — a compressed plan-view H-shape
 * sitting on the line, not a to-scale post/crossbar render — so Rugby posts
 * read in the same visual language as the existing GAA goals. Posts sit on
 * the try line and extend into the in-goal area (the same "outward" reading
 * gaa-goal-markings.ts uses for goals sitting on the endline).
 * Pure data/geometry only: no PixiJS, no DOM, no renderer logic.
 */

// 5.6m post separation scaled to the shared viewbox at rugby's 70m pitch
// width (96 viewbox units / 70m), matching how gaa-goal-markings.ts derives
// its own HALF_GOAL_WIDTH from real goal width at GAA's pitch scale.
const HALF_GOAL_WIDTH = 3.84;
const CROSSBAR_DEPTH = 0.8;
const TOTAL_POST_DEPTH = 1.15;

const POST_STROKE_WIDTH = 0.17;
const CROSSBAR_STROKE_WIDTH = 0.2;
const FRAME_STROKE_WIDTH = 0.12;

const CENTRE_Y = 50;

// Matches gaa-goal-markings.ts's GOAL_STROKE — same base pitch-line color
// language; renderers apply their own theme tint on top, as they already do
// for GAA goals and the shared pitchConfig markings.
const GOAL_STROKE = "rgba(255,255,255,0.85)";

function buildPostMarkings(tryLineX: number, outward: 1 | -1): PitchMarking[] {
  const postDepthX = tryLineX + outward * TOTAL_POST_DEPTH;
  const crossbarX = tryLineX + outward * CROSSBAR_DEPTH;
  const topY = CENTRE_Y - HALF_GOAL_WIDTH;
  const bottomY = CENTRE_Y + HALF_GOAL_WIDTH;

  return [
    // Near upright
    {
      kind: "line",
      x1: tryLineX,
      y1: topY,
      x2: postDepthX,
      y2: topY,
      stroke: GOAL_STROKE,
      strokeWidth: POST_STROKE_WIDTH,
    },
    // Far upright
    {
      kind: "line",
      x1: tryLineX,
      y1: bottomY,
      x2: postDepthX,
      y2: bottomY,
      stroke: GOAL_STROKE,
      strokeWidth: POST_STROKE_WIDTH,
    },
    // Crossbar, connecting the uprights partway along their depth so both
    // posts read as continuing beyond it.
    {
      kind: "line",
      x1: crossbarX,
      y1: topY,
      x2: crossbarX,
      y2: bottomY,
      stroke: GOAL_STROKE,
      strokeWidth: CROSSBAR_STROKE_WIDTH,
    },
    // Minimal unfilled post-opening frame, between the try line and the
    // crossbar depth — no fill, no net.
    {
      kind: "rect",
      x: Math.min(tryLineX, crossbarX),
      y: topY,
      w: Math.abs(crossbarX - tryLineX),
      h: bottomY - topY,
      stroke: GOAL_STROKE,
      strokeWidth: FRAME_STROKE_WIDTH,
    },
  ];
}

/**
 * Builds both sets of rugby posts (mirrored left/right), sitting exactly on
 * the try lines derived in src/core/pitch/pitch-config.ts's rugby markings.
 */
export function buildRugbyPostMarkings(): PitchMarking[] {
  return [
    ...buildPostMarkings(RUGBY_TRY_LINE_LEFT_X, -1),
    ...buildPostMarkings(RUGBY_TRY_LINE_RIGHT_X, 1),
  ];
}
