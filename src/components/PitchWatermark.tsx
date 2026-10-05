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

// Tactical Slate Whiteboard only: clean black type in the same position, size,
// font and weight — solid black, no shadow/glow (the grass watermark's dark
// text-shadow would smear into a grey halo on the white board).
export const PITCH_WATERMARK_DARK_COLOR = "rgb(0, 0, 0)";
const PITCH_WATERMARK_DARK_OVERRIDES: CSSProperties = { color: PITCH_WATERMARK_DARK_COLOR, textShadow: "none" };

export function PitchWatermark({
  portrait,
  lowered,
  dark,
  hidden,
}: {
  portrait: boolean;
  lowered?: boolean;
  dark?: boolean;
  /**
   * Keeps the element's box (so it can still be measured) but stops painting
   * it — used while a Tactical Slate clip records, when the same watermark is
   * drawn into the recorded canvas instead (never two visible watermarks).
   */
  hidden?: boolean;
}) {
  const base = portrait
    ? lowered
      ? PORTRAIT_SLATE_PITCH_WATERMARK_STYLE
      : PORTRAIT_PITCH_WATERMARK_STYLE
    : PITCH_WATERMARK_STYLE;
  const style: CSSProperties = {
    ...base,
    ...(dark ? PITCH_WATERMARK_DARK_OVERRIDES : {}),
    ...(hidden ? { visibility: "hidden" } : {}),
  };
  return (
    <div style={style} data-pitch-watermark="">
      PáircVision
    </div>
  );
}
