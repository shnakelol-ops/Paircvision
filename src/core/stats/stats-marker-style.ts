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
        fill: "rgba(22, 163, 74, 1)",      // dark green #16a34a
        stroke: "rgba(20, 83, 45, 1)",
        strokeWidth: 0.95,
        contrastStroke: "rgba(4, 15, 10, 0.62)",
        contrastStrokeWidth: 0.65,
        centerDot: "rgba(220, 252, 231, 0.96)",
        centerDotRadiusScale: 0.27,
      };
    case "POINT":
      return {
        radius: 3.0,
        fill: "rgba(74, 222, 128, 1)",     // light green #4ade80
        stroke: "rgba(34, 197, 94, 1)",
        strokeWidth: 0.82,
        contrastStroke: "rgba(30, 41, 59, 0.62)",
        contrastStrokeWidth: 0.58,
        centerDot: "rgba(240, 253, 244, 0.92)",
        centerDotRadiusScale: 0.24,
      };
    case "WIDE":
      return {
        radius: 2.28,
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
        radius: 2.08,
        fill: "rgba(167, 139, 250, 1)",    // purple #a78bfa
        stroke: "rgba(109, 40, 217, 1)",
        strokeWidth: 0.74,
        contrastStroke: "rgba(18, 8, 50, 0.58)",
        contrastStrokeWidth: 0.52,
        centerDot: "rgba(245, 243, 255, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "TURNOVER_LOST":
      return {
        radius: 2.08,
        fill: "rgba(249, 115, 22, 1)",     // orange #f97316
        stroke: "rgba(154, 52, 18, 1)",
        strokeWidth: 0.74,
        contrastStroke: "rgba(36, 18, 8, 0.62)",
        contrastStrokeWidth: 0.52,
        centerDot: "rgba(255, 237, 213, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "TWO_POINTER":
      return {
        radius: 3.2,
        fill: "rgba(251, 191, 36, 1)",     // gold #fbbf24
        stroke: "rgba(180, 120, 10, 1)",
        strokeWidth: 0.94,
        contrastStroke: "rgba(30, 18, 2, 0.66)",
        contrastStrokeWidth: 0.64,
        centerDot: "rgba(255, 252, 230, 0.96)",
        centerDotRadiusScale: 0.24,
      };
    case "FORTY_FIVE_TWO_POINT":
      return {
        radius: 3.2,
        fill: "rgba(251, 191, 36, 1)",     // gold #fbbf24 (same as 2pt)
        stroke: "rgba(180, 120, 10, 1)",
        strokeWidth: 0.9,
        contrastStroke: "rgba(30, 18, 2, 0.62)",
        contrastStrokeWidth: 0.6,
        centerDot: "rgba(255, 252, 230, 0.94)",
        centerDotRadiusScale: 0.22,
      };
    case "SHOT":
      return {
        radius: 2.16,
        fill: "rgba(148, 163, 184, 1)",    // grey #94a3b8 (blocked/saved = neutral)
        stroke: "rgba(71, 85, 105, 1)",
        strokeWidth: 0.8,
        contrastStroke: "rgba(15, 23, 42, 0.62)",
        contrastStrokeWidth: 0.56,
        centerDot: "rgba(248, 250, 252, 0.92)",
        centerDotRadiusScale: 0.2,
      };
    case "FREE_WON":
      return {
        radius: 2.11,
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
        radius: 2.11,
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
        radius: 2.2,
        fill: "rgba(74, 222, 128, 1)",     // light green #4ade80 (score = point)
        stroke: "rgba(34, 197, 94, 1)",
        strokeWidth: 0.8,
        contrastStroke: "rgba(8, 28, 14, 0.6)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(240, 253, 244, 0.92)",
        centerDotRadiusScale: 0.2,
      };
    case "FREE_MISSED":
      return {
        radius: 2.2,
        fill: "rgba(239, 68, 68, 1)",      // red #ef4444 (miss = wide)
        stroke: "rgba(185, 28, 28, 1)",
        strokeWidth: 0.8,
        contrastStroke: "rgba(28, 5, 10, 0.62)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(255, 241, 241, 0.92)",
        centerDotRadiusScale: 0.2,
      };
    case "KICKOUT_WON":
      return {
        radius: 2.2,
        fill: "rgba(34, 211, 238, 1)",     // cyan #22d3ee
        stroke: "rgba(8, 145, 178, 1)",
        strokeWidth: 0.78,
        contrastStroke: "rgba(6, 22, 30, 0.58)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(236, 254, 255, 0.9)",
        centerDotRadiusScale: 0.2,
      };
    case "KICKOUT_CONCEDED":
      return {
        radius: 2.2,
        fill: "rgba(251, 113, 133, 1)",    // pink #fb7185
        stroke: "rgba(190, 18, 60, 1)",
        strokeWidth: 0.78,
        contrastStroke: "rgba(36, 5, 14, 0.6)",
        contrastStrokeWidth: 0.54,
        centerDot: "rgba(255, 241, 242, 0.9)",
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
