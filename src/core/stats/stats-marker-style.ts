import type {
  MatchEvent,
  MatchEventKind,
} from "./stats-event-model";

export type StatsMarkerStyle = {
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  contrastStroke: string;
  contrastStrokeWidth: number;
  centerDot: string;
  centerDotRadiusScale: number;
};

const FALLBACK_MARKER_STYLE: StatsMarkerStyle = {
  radius: 2.9,
  fill: "rgba(148, 163, 184, 1)",
  stroke: "rgba(51, 65, 85, 1)",
  strokeWidth: 0.74,
  contrastStroke: "rgba(15, 23, 42, 0.58)",
  contrastStrokeWidth: 0.5,
  centerDot: "rgba(248, 250, 252, 0.9)",
  centerDotRadiusScale: 0.2,
};

function styleForType(type: MatchEventKind): StatsMarkerStyle {
  switch (type) {
    case "GOAL":
      return {
        radius: 3.35,
        fill: "rgba(22, 163, 74, 1)",
        stroke: "rgba(250, 204, 21, 1)",
        strokeWidth: 0.95,
        contrastStroke: "rgba(4, 15, 10, 0.62)",
        contrastStrokeWidth: 0.65,
        centerDot: "rgba(255, 255, 240, 0.96)",
        centerDotRadiusScale: 0.27,
      };
    case "POINT":
      return {
        radius: 3.0,
        fill: "rgba(134, 239, 172, 1)",
        stroke: "rgba(203, 213, 225, 1)",
        strokeWidth: 0.82,
        contrastStroke: "rgba(30, 41, 59, 0.62)",
        contrastStrokeWidth: 0.58,
        centerDot: "rgba(248, 250, 252, 0.92)",
        centerDotRadiusScale: 0.24,
      };
    case "WIDE":
      return {
        radius: 2.6,
        fill: "rgba(244, 63, 94, 1)",
        stroke: "rgba(190, 18, 60, 1)",
        strokeWidth: 0.85,
        contrastStroke: "rgba(28, 5, 10, 0.66)",
        contrastStrokeWidth: 0.62,
        centerDot: "rgba(255, 238, 242, 0.9)",
        centerDotRadiusScale: 0.22,
      };
    case "TURNOVER_WON":
      return {
        radius: 2.36,
        fill: "rgba(6, 182, 212, 1)",
        stroke: "rgba(3, 105, 161, 1)",
        strokeWidth: 0.74,
        contrastStroke: "rgba(6, 18, 24, 0.58)",
        contrastStrokeWidth: 0.52,
        centerDot: "rgba(236, 254, 255, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "TURNOVER_LOST":
      return {
        radius: 2.36,
        fill: "rgba(194, 65, 12, 1)",
        stroke: "rgba(124, 45, 18, 1)",
        strokeWidth: 0.74,
        contrastStroke: "rgba(36, 18, 8, 0.62)",
        contrastStrokeWidth: 0.52,
        centerDot: "rgba(255, 237, 213, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "TWO_POINTER":
      return {
        radius: 3.2,
        fill: "rgba(167, 243, 208, 1)",
        stroke: "rgba(5, 150, 105, 1)",
        strokeWidth: 0.94,
        contrastStroke: "rgba(2, 26, 20, 0.66)",
        contrastStrokeWidth: 0.64,
        centerDot: "rgba(250, 255, 253, 0.96)",
        centerDotRadiusScale: 0.24,
      };
    case "FORTY_FIVE_TWO_POINT":
      return {
        radius: 3.2,
        fill: "rgba(110, 231, 183, 1)",
        stroke: "rgba(16, 185, 129, 1)",
        strokeWidth: 0.9,
        contrastStroke: "rgba(3, 28, 22, 0.62)",
        contrastStrokeWidth: 0.6,
        centerDot: "rgba(236, 253, 245, 0.94)",
        centerDotRadiusScale: 0.22,
      };
    case "SHOT":
      return {
        radius: 2.45,
        fill: "rgba(251, 191, 36, 1)",
        stroke: "rgba(146, 64, 14, 1)",
        strokeWidth: 0.8,
        contrastStroke: "rgba(36, 22, 8, 0.62)",
        contrastStrokeWidth: 0.56,
        centerDot: "rgba(255, 249, 230, 0.92)",
        centerDotRadiusScale: 0.2,
      };
    case "FREE_WON":
      return {
        radius: 2.4,
        fill: "rgba(34, 197, 94, 1)",
        stroke: "rgba(21, 128, 61, 1)",
        strokeWidth: 0.76,
        contrastStroke: "rgba(8, 28, 14, 0.58)",
        contrastStrokeWidth: 0.52,
        centerDot: "rgba(238, 255, 244, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "FREE_CONCEDED":
      return {
        radius: 2.4,
        fill: "rgba(248, 113, 113, 1)",
        stroke: "rgba(185, 28, 28, 1)",
        strokeWidth: 0.76,
        contrastStroke: "rgba(36, 10, 10, 0.62)",
        contrastStrokeWidth: 0.52,
        centerDot: "rgba(255, 241, 241, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "FREE_SCORED":
      return {
        radius: 2.5,
        fill: "rgba(56, 189, 248, 1)",
        stroke: "rgba(14, 116, 144, 1)",
        strokeWidth: 0.8,
        contrastStroke: "rgba(8, 24, 34, 0.6)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(240, 249, 255, 0.92)",
        centerDotRadiusScale: 0.2,
      };
    case "FREE_MISSED":
      return {
        radius: 2.5,
        fill: "rgba(249, 115, 22, 1)",
        stroke: "rgba(154, 52, 18, 1)",
        strokeWidth: 0.8,
        contrastStroke: "rgba(40, 16, 8, 0.62)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(255, 237, 213, 0.92)",
        centerDotRadiusScale: 0.2,
      };
    case "KICKOUT_WON":
      return {
        radius: 2.5,
        fill: "rgba(45, 212, 191, 1)",
        stroke: "rgba(15, 118, 110, 1)",
        strokeWidth: 0.78,
        contrastStroke: "rgba(6, 30, 28, 0.58)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(236, 255, 252, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "KICKOUT_CONCEDED":
      return {
        radius: 2.5,
        fill: "rgba(168, 85, 247, 1)",
        stroke: "rgba(107, 33, 168, 1)",
        strokeWidth: 0.78,
        contrastStroke: "rgba(24, 9, 40, 0.6)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(245, 235, 255, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    default:
      // Defensive fallback: unknown kinds should never blank marker rendering.
      return FALLBACK_MARKER_STYLE;
  }
}

export function getStatsMarkerStyle(event: MatchEvent): StatsMarkerStyle {
  return styleForType(event.kind);
}
