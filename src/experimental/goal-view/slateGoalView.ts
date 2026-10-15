// EXPERIMENTAL — Goal View for Tactical Slate (flag-gated, see sequenceGoalView.tsx).
//
// Adapts the Slate surface to the ONE shared Goal View lens
// (createGoalViewLens.ts). No second renderer and no Slate-specific playback:
// the lens only re-projects whatever Slate has already drawn this frame.

import type {
  FlowItemType,
  TacticalPadLiteExperimentalRenderTargets,
} from "../../engine/pixi/createTacticalPadLiteSurface";
import type { TacticalPitchTheme } from "../../tactical-lite/pixi/tacticalPitchTheme";
import { resolveTacticalPitchThemeLayers } from "../../tactical-lite/pixi/tacticalPitchTheme";
import type { GoalViewLensOptions, GoalViewRenderTargets } from "./createGoalViewLens";

/**
 * Equipment that physically stands up and is drawn as an upright-readable icon,
 * so it gets the same upright stretch as players. Everything else stays flat on
 * the turf and is still shown (never hidden):
 *  - discCone, ladder: genuinely flat ground equipment.
 *  - miniGoal, gaaGoal: drawn as top-down goal icons; standing that artwork up
 *    would distort it, and true 3D equipment goals would need new art.
 *  - balls: already on the ball layer, which the lens always stands up.
 */
export const GOAL_VIEW_UPRIGHT_ITEM_TYPES: ReadonlySet<FlowItemType> = new Set<FlowItemType>([
  "cone",
  "pole",
  "mannequin",
  "hurdle",
  "tackleBag",
]);

export type SlateGoalViewSource = {
  setOrientation: (quarterTurns: number) => void;
  getExperimentalRenderTargets: () => TacticalPadLiteExperimentalRenderTargets;
};

export function toSlateGoalViewTargets(targets: TacticalPadLiteExperimentalRenderTargets): GoalViewRenderTargets {
  return {
    app: targets.app,
    world: targets.world,
    tokenLayer: targets.playersLayer,
    ballLayer: targets.ballLayer,
    // Slate's world is ordered by insertion: goals go directly beneath the
    // equipment layer, i.e. above pitch, drawings and practice areas but below
    // equipment, player origins, players and the ball.
    goalDecalBefore: targets.itemsLayer,
    extraBillboardLayers: [
      {
        layer: targets.itemsLayer,
        isUpright: (node) => {
          const type = targets.getItemTypeForNode(node);
          return type != null && GOAL_VIEW_UPRIGHT_ITEM_TYPES.has(type);
        },
      },
    ],
  };
}

/**
 * Goal View presents only what the board shows: upright goals appear only on
 * pitch themes that draw goals (none on the Training grass board), and on the
 * light Whiteboard theme the on-pitch part of each goal uses the board's own
 * dark goal tint (renderTacticalPitch: 0x0b1219) so it stays visible.
 */
export function slateGoalViewLensOptions(theme: TacticalPitchTheme): Partial<GoalViewLensOptions> {
  return {
    uprightGoals: resolveTacticalPitchThemeLayers(theme).goals !== false,
    ...(theme === "whiteboard" ? { goalDecalColor: 0x0b1219 } : {}),
  };
}

/** A Goal View host (setOrientation + render targets) backed by a Slate surface. */
export function createSlateGoalViewHost(surface: SlateGoalViewSource, theme: TacticalPitchTheme) {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    // Dev-server test hook only (compiled out of every build): lets browser
    // tests find real token positions to drive genuine pointer drags.
    (window as unknown as { __goalViewSlateTargets?: () => TacticalPadLiteExperimentalRenderTargets }).__goalViewSlateTargets =
      () => surface.getExperimentalRenderTargets();
  }
  return {
    lensOptions: slateGoalViewLensOptions(theme),
    setOrientation: (quarterTurns: number) => surface.setOrientation(quarterTurns),
    getExperimentalRenderTargets: () => toSlateGoalViewTargets(surface.getExperimentalRenderTargets()),
  };
}
