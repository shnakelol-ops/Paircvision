import type { TacticalDrawingKind, TacticalDrawingRecord } from "./tacticalDrawingTypes";

export const DEFAULT_TACTICAL_DRAWING_WIDTH = 1.15;
export const DEFAULT_TACTICAL_DRAWING_OPACITY = 0.95;

export type TacticalStrokeStyle = {
  color: number;
  width: number;
  alpha: number;
  cap: "round";
  join: "round";
  alignment: number;
};

export function createTacticalStrokeStyle(drawing: Pick<TacticalDrawingRecord, "color" | "width" | "opacity">): TacticalStrokeStyle {
  return {
    color: drawing.color,
    width: Math.max(0.35, drawing.width),
    alpha: Math.max(0.15, Math.min(1, drawing.opacity)),
    cap: "round",
    join: "round",
    alignment: 0.5,
  };
}

export function getDashPattern(width: number): { dash: number; gap: number } {
  const safeWidth = Math.max(0.35, width);
  return {
    dash: Math.max(1.6, safeWidth * 2.45),
    gap: Math.max(1.05, safeWidth * 1.55),
  };
}

export function getArrowMetrics(width: number): { length: number; halfWidth: number; backoff: number } {
  const safeWidth = Math.max(0.35, width);
  const length = Math.max(2.6, Math.min(8.2, safeWidth * 3.75));
  return {
    length,
    halfWidth: length * 0.46,
    backoff: Math.max(0.18, safeWidth * 0.28),
  };
}

export function getWavyStyle(width: number): {
  wavelength: number;
  amplitude: number;
  sampleStep: number;
  maxSamples: number;
} {
  const safeWidth = Math.max(0.35, width);
  const wavelength = Math.max(3.8, Math.min(9, safeWidth * 4.9));
  return {
    wavelength,
    amplitude: Math.max(0.5, Math.min(2.1, safeWidth * 1.02)),
    sampleStep: Math.max(0.7, wavelength / 4),
    maxSamples: 240,
  };
}

export function getPointCleanupDistance(kind: TacticalDrawingKind): number {
  if (kind === "free-pen") return 0.19;
  if (kind === "wavy-line") return 0.23;
  if (kind === "curved-arrow") return 0.2;
  return 0.16;
}

export function getSmoothIterations(kind: TacticalDrawingKind): number {
  if (kind === "free-pen") return 1;
  if (kind === "wavy-line") return 1;
  if (kind === "curved-arrow") return 1;
  return 0;
}

export function getDeleteHitRadius(width: number): number {
  return Math.max(2.2, width * 2.5);
}
