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

export function letterboxPitchWorld(
  viewportCssW: number,
  viewportCssH: number,
  viewBox: { w: number; h: number } = BOARD_PITCH_VIEWBOX,
): PitchLetterbox {
  if (viewportCssW <= 0 || viewportCssH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(viewportCssW / viewBox.w, viewportCssH / viewBox.h);
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
