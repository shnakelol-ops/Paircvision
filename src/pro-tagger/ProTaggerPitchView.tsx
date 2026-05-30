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

// ── Portrait pitch geometry ────────────────────────────────────────────────
//
// viewBox: 0 0 75 122
// Pitch boundary: x=1, y=6, width=73, height=110  (endlines at y=6 and y=116)
// Goal posts: two uprights centred on x=37.5 ± 3.5  →  x=34 and x=41
//   Top goal posts from y=2 to y=6 (above pitch boundary)
//   Bot goal posts from y=116 to y=120
//
// All Y positions measured from top endline (y=6):
//   Football  13m → y=16        Hurling 14m → y=17
//   Football  20m → y=22        Hurling 21m → y=23
//   Football  45m → y=42        Hurling 65m → y=56
//   Halfway       → y=61
//   Football  45m → y=80        Hurling 65m → y=66
//   Football  20m → y=100       Hurling 21m → y=99
//   Football  13m → y=106       Hurling 14m → y=105
//
// Small goal box:  width=11 centred (x=32..43), depth=3 (y=6..9 / y=113..116)
// Large rectangle: width=55 centred (x=10..65), depth=16 (y=6..22 / y=100..116)
//
// D arc (football): centred on goal face midpoint (37.5, 6) or (37.5, 116),
//   radius=10. Endpoints at x=27.5 and x=47.5 on goal line.
//   Top:  M 27.5,6  A 10,10 0 0 1 47.5,6   (bulges downward into field)
//   Bot:  M 27.5,116 A 10,10 0 0 0 47.5,116 (bulges upward into field)
//
// Two-point arc (football only): centred on goal face midpoint, radius=32.
//   Endpoints at x≈5.5 and x≈69.5 (near-sidelines at endline level).
//   Top:  M 5.5,6  A 32,32 0 0 1 69.5,6   (dome sweeps down into field)
//   Bot:  M 5.5,116 A 32,32 0 0 0 69.5,116

export function ProTaggerPitchView({
  sport,
  attackDirection,
  half,
  feedbackDot,
  interactive,
  onTap,
}: Props) {
  const isHurling  = sport === "hurling" || sport === "camogie";
  const isFootball = !isHurling;

  // ── Horizontal line Y positions ─────────────────────────────────────
  const smallLineTop = isHurling ? 17 : 16;
  const smallLineBot = isHurling ? 105 : 106;
  const midLineTop   = isHurling ? 23 : 22;
  const midLineBot   = isHurling ? 99 : 100;
  const bigLineTop   = isHurling ? 56 : 42;
  const bigLineBot   = isHurling ? 66 : 80;

  const attackingDown =
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

  const lineColour     = "rgba(255,255,255,0.65)";
  const subLineColour  = "rgba(255,255,255,0.45)";
  const thinLineColour = "rgba(255,255,255,0.30)";
  const markColour     = "rgba(255,255,255,0.40)";

  return (
    <svg
      viewBox="0 0 75 122"
      style={svgStyle(interactive)}
      onPointerDown={handlePointerDown}
      aria-label="Pitch — tap to place event"
    >
      {/* Grass */}
      <rect x="0" y="0" width="75" height="122" fill="#166534" />

      {/* Pitch boundary */}
      <rect
        x="1" y="6" width="73" height="110"
        fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.5"
      />

      {/* ── Goal posts (above/below pitch boundary) ─────────────────── */}

      {/* Top goal posts */}
      <line x1="34" y1="2" x2="34" y2="6" stroke="white" strokeWidth="1.2" />
      <line x1="41" y1="2" x2="41" y2="6" stroke="white" strokeWidth="1.2" />
      <line x1="34" y1="2" x2="41" y2="2" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />

      {/* Bottom goal posts */}
      <line x1="34" y1="116" x2="34" y2="120" stroke="white" strokeWidth="1.2" />
      <line x1="41" y1="116" x2="41" y2="120" stroke="white" strokeWidth="1.2" />
      <line x1="34" y1="120" x2="41" y2="120" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />

      {/* ── Small goal boxes ────────────────────────────────────────── */}
      <rect x="32" y="6"   width="11" height="3" fill="none" stroke={markColour} strokeWidth="0.35" />
      <rect x="32" y="113" width="11" height="3" fill="none" stroke={markColour} strokeWidth="0.35" />

      {/* ── Large rectangles ────────────────────────────────────────── */}
      <rect x="10" y="6"   width="55" height="16" fill="none" stroke={markColour} strokeWidth="0.35" />
      <rect x="10" y="100" width="55" height="16" fill="none" stroke={markColour} strokeWidth="0.35" />

      {/* ── Football-only markings ──────────────────────────────────── */}
      {isFootball && (
        <>
          {/* D arcs at 13m (radius=10, centre on goal line midpoint) */}
          <path
            d="M 27.5,6 A 10,10 0 0 1 47.5,6"
            fill="none" stroke={markColour} strokeWidth="0.35"
          />
          <path
            d="M 27.5,116 A 10,10 0 0 0 47.5,116"
            fill="none" stroke={markColour} strokeWidth="0.35"
          />

          {/* Two-point arcs (radius=32, centre on goal face midpoint) */}
          <path
            d="M 5.5,6 A 32,32 0 0 1 69.5,6"
            fill="none" stroke={subLineColour} strokeWidth="0.5"
          />
          <path
            d="M 5.5,116 A 32,32 0 0 0 69.5,116"
            fill="none" stroke={subLineColour} strokeWidth="0.5"
          />
        </>
      )}

      {/* ── Horizontal lines ────────────────────────────────────────── */}

      {/* 13m / 14m lines */}
      <line x1="1" y1={smallLineTop} x2="74" y2={smallLineTop}
        stroke={thinLineColour} strokeWidth="0.3" />
      <line x1="1" y1={smallLineBot} x2="74" y2={smallLineBot}
        stroke={thinLineColour} strokeWidth="0.3" />

      {/* 20m / 21m lines */}
      <line x1="1" y1={midLineTop} x2="74" y2={midLineTop}
        stroke={subLineColour} strokeWidth="0.35" />
      <line x1="1" y1={midLineBot} x2="74" y2={midLineBot}
        stroke={subLineColour} strokeWidth="0.35" />

      {/* 45m / 65m lines */}
      <line x1="1" y1={bigLineTop} x2="74" y2={bigLineTop}
        stroke={lineColour} strokeWidth="0.4" />
      <line x1="1" y1={bigLineBot} x2="74" y2={bigLineBot}
        stroke={lineColour} strokeWidth="0.4" />

      {/* Halfway line — dashed */}
      <line x1="1" y1="61" x2="74" y2="61"
        stroke={lineColour} strokeWidth="0.4" strokeDasharray="2 2" />

      {/* Centre circle */}
      <circle cx="37.5" cy="61" r="5"
        fill="none" stroke={subLineColour} strokeWidth="0.4" />
      <circle cx="37.5" cy="61" r="0.8" fill="rgba(255,255,255,0.5)" />

      {/* ── Attack direction indicator ──────────────────────────────── */}
      <text
        x="37.5"
        y={attackingDown ? 75 : 47}
        textAnchor="middle"
        fontSize="4"
        fill="rgba(255,255,255,0.85)"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {attackingDown ? "ATK ↓" : "ATK ↑"}
      </text>

      {/* Dim overlay when not interactive */}
      {!interactive && (
        <rect x="0" y="0" width="75" height="122" fill="rgba(0,0,0,0.18)" />
      )}

      {/* Feedback dot */}
      {feedbackDot && (
        <>
          <circle
            cx={feedbackDot.nx * 75}
            cy={feedbackDot.ny * 122}
            r="4"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="0.6"
          />
          <circle
            cx={feedbackDot.nx * 75}
            cy={feedbackDot.ny * 122}
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
