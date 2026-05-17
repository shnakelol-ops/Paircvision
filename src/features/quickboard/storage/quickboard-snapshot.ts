import type { TacticalBoardState, TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import { cloneQuickBoardState, sanitizeQuickBoardState, type QuickBoardBoardState } from "./quickboard-types";

export function captureQuickBoardSnapshot(surface: TacticalPadLiteSurface): QuickBoardBoardState | null {
  const boardState = surface.exportBoardState();
  const cloned = cloneQuickBoardState(boardState as QuickBoardBoardState);
  return sanitizeQuickBoardState(cloned);
}

export function restoreQuickBoardSnapshot(surface: TacticalPadLiteSurface, boardState: QuickBoardBoardState): boolean {
  const sanitized = sanitizeQuickBoardState(boardState);
  if (!sanitized) return false;
  const cloned = cloneQuickBoardState(sanitized);
  return surface.importBoardState(cloned as TacticalBoardState);
}
