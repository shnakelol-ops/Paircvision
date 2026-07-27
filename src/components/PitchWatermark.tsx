import type { CSSProperties } from "react";

// Canonical PáircVision pitch watermark. Originates from Tactical Play; reused
// as-is (position, scale, opacity, colour) wherever a playable pitch is
// rendered so every mode stays visually identical. Do not fork this style —
// change it here and every surface picks up the update.
const PITCH_WATERMARK_STYLE: CSSProperties = {
  position: "absolute",
  bottom: "14px",
  right: "18px",
  zIndex: 2,
  color: "rgba(220, 235, 255, 0.22)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.55), 0 0 12px rgba(0, 0, 0, 0.35)",
  pointerEvents: "none",
  userSelect: "none",
};

// Portrait watermark position only (size/opacity/style unchanged): lifted above
// the bottom end line and kept inside the right pitch border. Percentage bottom
// tracks the end line as the pitch scales.
const PORTRAIT_PITCH_WATERMARK_STYLE: CSSProperties = {
  ...PITCH_WATERMARK_STYLE,
  bottom: "14%",
  right: "24px",
};

// Tactical Slate portrait only: same right-edge offset as Tactical Play, but
// held lower so it sits in the endline-to-13m strip instead of drifting up
// toward the 20m line (GAA pitch markings sit at 13/145 ≈ 9% and 20/145 ≈ 13.8%
// of pitch length from the endline — see t13/t20 in core/pitch/pitch-config.ts).
const PORTRAIT_SLATE_PITCH_WATERMARK_STYLE: CSSProperties = {
  ...PORTRAIT_PITCH_WATERMARK_STYLE,
  bottom: "5%",
};

export function PitchWatermark({ portrait, lowered }: { portrait: boolean; lowered?: boolean }) {
  const style = portrait
    ? lowered
      ? PORTRAIT_SLATE_PITCH_WATERMARK_STYLE
      : PORTRAIT_PITCH_WATERMARK_STYLE
    : PITCH_WATERMARK_STYLE;
  return <div style={style}>PáircVision</div>;
}
