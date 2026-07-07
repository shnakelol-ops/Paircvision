import { BOARD_PITCH_VIEWBOX } from "../pitch/pitch-space";

export type BoardNorm = { nx: number; ny: number };

export type PitchWorldPoint = { x: number; y: number };

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function boardNormToWorld(
  nx: number,
  ny: number,
  viewBox: { w: number; h: number } = BOARD_PITCH_VIEWBOX,
): PitchWorldPoint {
  return {
    x: clamp01(nx) * viewBox.w,
    y: clamp01(ny) * viewBox.h,
  };
}

export function worldToBoardNorm(
  x: number,
  y: number,
  viewBox: { w: number; h: number } = BOARD_PITCH_VIEWBOX,
): BoardNorm {
  return {
    nx: viewBox.w > 0 ? clamp01(x / viewBox.w) : 0.5,
    ny: viewBox.h > 0 ? clamp01(y / viewBox.h) : 0.5,
  };
}

export type PitchLetterbox = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

// Shared viewport-fit rule: the pitch is fit-to-contain inside its host, then
// inset by a small safe margin so it never touches (and can't be overlapped
// by) chrome drawn at the edge of the host, e.g. the stadium light fixtures.
// The margin is a fraction of the smaller viewport side so it stays subtle on
// phones (which already get generous letterbox bars from the aspect-ratio
// mismatch) while still guaranteeing real breathing room on wide tablets
// (where the fit can otherwise land within a few px of the host edge).
// Keep this formula identical to the copies in engine/pixi/createWorldViewport.ts
// and movement-board/coordinates/viewport.ts.
const PITCH_SAFE_MARGIN_RATIO = 0.03;
const PITCH_SAFE_MARGIN_MIN_PX = 8;
const PITCH_SAFE_MARGIN_MAX_PX = 24;

export function computePitchSafeMarginPx(viewportCssW: number, viewportCssH: number): number {
  const minSide = Math.min(viewportCssW, viewportCssH);
  return Math.min(
    PITCH_SAFE_MARGIN_MAX_PX,
    Math.max(PITCH_SAFE_MARGIN_MIN_PX, minSide * PITCH_SAFE_MARGIN_RATIO),
  );
}

export function letterboxPitchWorld(
  viewportCssW: number,
  viewportCssH: number,
  viewBox: { w: number; h: number } = BOARD_PITCH_VIEWBOX,
): PitchLetterbox {
  if (viewportCssW <= 0 || viewportCssH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const margin = computePitchSafeMarginPx(viewportCssW, viewportCssH);
  const availW = Math.max(1, viewportCssW - margin * 2);
  const availH = Math.max(1, viewportCssH - margin * 2);
  const scale = Math.min(availW / viewBox.w, availH / viewBox.h);
  const offsetX = (viewportCssW - viewBox.w * scale) / 2;
  const offsetY = (viewportCssH - viewBox.h * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function viewportCssToBoardNorm(
  pxCss: number,
  pyCss: number,
  viewportCssW: number,
  viewportCssH: number,
  viewBox: { w: number; h: number } = BOARD_PITCH_VIEWBOX,
): BoardNorm {
  const { scale, offsetX, offsetY } = letterboxPitchWorld(
    viewportCssW,
    viewportCssH,
    viewBox,
  );
  if (scale <= 0) return { nx: 0.5, ny: 0.5 };
  const wx = (pxCss - offsetX) / scale;
  const wy = (pyCss - offsetY) / scale;
  return worldToBoardNorm(wx, wy, viewBox);
}
