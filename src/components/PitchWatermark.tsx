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

export function PitchWatermark({ portrait }: { portrait: boolean }) {
  return <div style={portrait ? PORTRAIT_PITCH_WATERMARK_STYLE : PITCH_WATERMARK_STYLE}>PáircVision</div>;
}
