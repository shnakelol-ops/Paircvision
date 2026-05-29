import type { CSSProperties, PointerEvent } from "react";
import type { ProTaggerSport, ProTaggerAttackDirection } from "./pro-tagger-session";

interface Props {
  sport: ProTaggerSport;
  attackDirection: ProTaggerAttackDirection;
  half: 1 | 2;
  feedbackDot: { nx: number; ny: number } | null;
  interactive: boolean;
  onTap: (nx: number, ny: number) => void;
}

// ── Pitch geometry constants ───────────────────────────────────────────────
//
// viewBox: 0 0 100 62   (pitch is ~145m × 88m; scale ≈ 0.69 SVG/m x, 0.70 SVG/m y)
// Goals sit at x=1 (left) and x=99 (right), centred on cy=31.
// Goal opening spans y=26–36 (≈ 10 SVG units ≈ 14m).

// Football (gaelic / ladies_football):
//   13m line  → x ≈  9 / 91
//   20m line  → x ≈ 14 / 86
//   45m line  → x ≈ 31 / 69
//
// Hurling / Camogie:
//   14m line  → x ≈ 10 / 90
//   21m line  → x ≈ 14 / 86   (same as football 20m in SVG space)
//   65m line  → x ≈ 45 / 55

// Two-point arc: centered on goal face (x=1 or x=99, cy=31), radius = 31 SVG (≈45m).
// At the pitch sidelines (y=1, y=61) the arc crosses x ≈ 8.8 / 91.2.
// Arc formula: at y=1, (x-1)^2 + (1-31)^2 = 31^2  →  x ≈ 8.81

// D arc: centered on goal face, radius ≈ 9.43 SVG (≈13m).
// Arc endpoints match goal post Y positions (y=26, y=36) exactly.

export function ProTaggerPitchView({
  sport,
  attackDirection,
  half,
  feedbackDot,
  interactive,
  onTap,
}: Props) {
  const isHurling   = sport === "hurling" || sport === "camogie";
  const isFootball  = !isHurling;

  // ── Line positions ──────────────────────────────────────────────────
  const bigLine1  = isHurling ? 45 : 31;
  const bigLine2  = isHurling ? 55 : 69;
  const midLine1  = 14;
  const midLine2  = 86;
  const smallLine1 = isHurling ? 10 : 9;
  const smallLine2 = isHurling ? 90 : 91;

  // Which end home team attacks toward this half
  const attackingRight =
    (half === 1 && attackDirection === "right") ||
    (half === 2 && attackDirection === "left");

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onTap(nx, ny);
  }

  // ── Football-only geometry ──────────────────────────────────────────
  // Small goal area rect: 4.5m deep × 14m wide — matches y=26–36 exactly.
  // Large rectangle:      ~20m deep × ~43m wide (ends at 20m line, ≈14 SVG units deep).
  // D arc:                radius = sqrt((9-1)^2 + (26-31)^2) = sqrt(89) ≈ 9.43
  //                       M 9,26 A 9.43,9.43 0 0 1 9,36  — bulges into field (CW)
  // Two-point arc:        radius = 31 (≈45m), arc endpoints at (8.8, 1) and (8.8, 61)
  //                       M 8.8,1 A 31,31 0 0 1 8.8,61   — short CW arc, bulges right

  const lineColour       = "rgba(255,255,255,0.65)";
  const subLineColour    = "rgba(255,255,255,0.45)";
  const thinLineColour   = "rgba(255,255,255,0.30)";
  const markingColour    = "rgba(255,255,255,0.40)";

  return (
    <svg
      viewBox="0 0 100 62"
      style={svgStyle(interactive)}
      onPointerDown={handlePointerDown}
      aria-label="Pitch — tap to place event"
    >
      {/* Grass */}
      <rect x="0" y="0" width="100" height="62" fill="#166534" />

      {/* Outer boundary */}
      <rect
        x="1" y="1" width="98" height="60"
        fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.5"
      />

      {/* ── Football-only markings ──────────────────────────────────── */}
      {isFootball && (
        <>
          {/* Small goal area rectangles (4.5m × 14m) */}
          <rect x="1" y="26" width="3" height="10"
            fill="none" stroke={markingColour} strokeWidth="0.35" />
          <rect x="96" y="26" width="3" height="10"
            fill="none" stroke={markingColour} strokeWidth="0.35" />

          {/* Large rectangles (≈20m deep × ≈43m wide, ends at 20m line) */}
          <rect x="1" y="16" width="13" height="30"
            fill="none" stroke={markingColour} strokeWidth="0.35" />
          <rect x="86" y="16" width="13" height="30"
            fill="none" stroke={markingColour} strokeWidth="0.35" />

          {/* D arcs at 13m line (radius ≈ 9.43, centered on goal face) */}
          <path
            d="M 9,26 A 9.43,9.43 0 0 1 9,36"
            fill="none" stroke={markingColour} strokeWidth="0.35"
          />
          <path
            d="M 91,26 A 9.43,9.43 0 0 0 91,36"
            fill="none" stroke={markingColour} strokeWidth="0.35"
          />

          {/* Two-point arcs
              Center on goal face (x=1 or x=99, cy=31), radius ≈ 32.7.
              r = √((14-1)²+(1-31)²) = √1069 ≈ 32.7 ensures the arc
              intersects the sidelines exactly at the 20m line (x=14/86),
              then peaks at x≈33.7 (just past the 45m line) at centre height. */}
          <path
            d="M 14,1 A 32.7,32.7 0 0 1 14,61"
            fill="none" stroke={subLineColour} strokeWidth="0.5"
          />
          <path
            d="M 86,1 A 32.7,32.7 0 0 0 86,61"
            fill="none" stroke={subLineColour} strokeWidth="0.5"
          />
        </>
      )}

      {/* ── Lines (both sports) ─────────────────────────────────────── */}

      {/* 13m / 14m lines */}
      <line x1={smallLine1} y1="1" x2={smallLine1} y2="61"
        stroke={thinLineColour} strokeWidth="0.3" />
      <line x1={smallLine2} y1="1" x2={smallLine2} y2="61"
        stroke={thinLineColour} strokeWidth="0.3" />

      {/* 20m / 21m lines */}
      <line x1={midLine1} y1="1" x2={midLine1} y2="61"
        stroke={subLineColour} strokeWidth="0.35" />
      <line x1={midLine2} y1="1" x2={midLine2} y2="61"
        stroke={subLineColour} strokeWidth="0.35" />

      {/* 45m / 65m lines */}
      <line x1={bigLine1} y1="1" x2={bigLine1} y2="61"
        stroke={lineColour} strokeWidth="0.4" />
      <line x1={bigLine2} y1="1" x2={bigLine2} y2="61"
        stroke={lineColour} strokeWidth="0.4" />

      {/* Halfway line */}
      <line x1="50" y1="1" x2="50" y2="61"
        stroke={lineColour} strokeWidth="0.4" />

      {/* Centre circle */}
      <circle cx="50" cy="31" r="5"
        fill="none" stroke={subLineColour} strokeWidth="0.4" />
      <circle cx="50" cy="31" r="0.8" fill="rgba(255,255,255,0.5)" />

      {/* ── Goal posts ─────────────────────────────────────────────── */}

      {/* Left goal */}
      <line x1="1" y1="26" x2="1" y2="36" stroke="white" strokeWidth="1.5" />
      <line x1="1" y1="26" x2="5" y2="26" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="1" y1="36" x2="5" y2="36" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="5" y1="26" x2="5" y2="36" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />

      {/* Right goal */}
      <line x1="99" y1="26" x2="99" y2="36" stroke="white" strokeWidth="1.5" />
      <line x1="99" y1="26" x2="95" y2="26" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="99" y1="36" x2="95" y2="36" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="95" y1="26" x2="95" y2="36" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />

      {/* ── Attack direction indicator ──────────────────────────────── */}
      <text
        x={attackingRight ? 77 : 23}
        y="8"
        textAnchor="middle"
        fontSize="4.2"
        fill="rgba(255,255,255,0.85)"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {attackingRight ? "ATK →" : "← ATK"}
      </text>

      {/* Dim overlay when not interactive */}
      {!interactive && (
        <rect x="0" y="0" width="100" height="62" fill="rgba(0,0,0,0.18)" />
      )}

      {/* Feedback dot */}
      {feedbackDot && (
        <>
          <circle
            cx={feedbackDot.nx * 100}
            cy={feedbackDot.ny * 62}
            r="4"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="0.6"
          />
          <circle
            cx={feedbackDot.nx * 100}
            cy={feedbackDot.ny * 62}
            r="2"
            fill="white"
          />
        </>
      )}
    </svg>
  );
}

function svgStyle(interactive: boolean): CSSProperties {
  return {
    width: "100%",
    display: "block",
    cursor: interactive ? "crosshair" : "default",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    touchAction: interactive ? "none" : "auto",
  };
}
