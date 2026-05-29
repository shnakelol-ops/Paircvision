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

export function ProTaggerPitchView({
  sport,
  attackDirection,
  half,
  feedbackDot,
  interactive,
  onTap,
}: Props) {
  const isHurling = sport === "hurling" || sport === "camogie";

  // x positions in viewBox units (0–100). GAA pitch ~145m long.
  // Football: 45m lines at 31/69, 20m at 14/86, 13m at 9/91
  // Hurling:  65m lines at 45/55, 21m at 14/86, 14m at 10/90
  const bigLine1 = isHurling ? 45 : 31;
  const bigLine2 = isHurling ? 55 : 69;
  const midLine1 = 14;
  const midLine2 = 86;
  const smallLine1 = isHurling ? 10 : 9;
  const smallLine2 = isHurling ? 90 : 91;

  // Which end the home team attacks toward in this half
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

  return (
    <svg
      viewBox="0 0 100 62"
      style={svgStyle(interactive)}
      onPointerDown={handlePointerDown}
      aria-label="Football pitch — tap to place event"
    >
      {/* Grass background */}
      <rect x="0" y="0" width="100" height="62" fill="#166534" />

      {/* Outer boundary */}
      <rect
        x="1" y="1" width="98" height="60"
        fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.5"
      />

      {/* 13m / 14m lines */}
      <line x1={smallLine1} y1="1" x2={smallLine1} y2="61" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
      <line x1={smallLine2} y1="1" x2={smallLine2} y2="61" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />

      {/* 20m / 21m lines */}
      <line x1={midLine1} y1="1" x2={midLine1} y2="61" stroke="rgba(255,255,255,0.5)" strokeWidth="0.35" />
      <line x1={midLine2} y1="1" x2={midLine2} y2="61" stroke="rgba(255,255,255,0.5)" strokeWidth="0.35" />

      {/* 45m / 65m lines */}
      <line x1={bigLine1} y1="1" x2={bigLine1} y2="61" stroke="rgba(255,255,255,0.65)" strokeWidth="0.4" />
      <line x1={bigLine2} y1="1" x2={bigLine2} y2="61" stroke="rgba(255,255,255,0.65)" strokeWidth="0.4" />

      {/* Center line */}
      <line x1="50" y1="1" x2="50" y2="61" stroke="rgba(255,255,255,0.65)" strokeWidth="0.4" />

      {/* Center circle */}
      <circle cx="50" cy="31" r="5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.4" />
      <circle cx="50" cy="31" r="0.8" fill="rgba(255,255,255,0.5)" />

      {/* Left goal posts (goals at x=1, posts span y=26–36) */}
      <line x1="1" y1="26" x2="1" y2="36" stroke="white" strokeWidth="1.5" />
      <line x1="1" y1="26" x2="5" y2="26" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="1" y1="36" x2="5" y2="36" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="5" y1="26" x2="5" y2="36" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />

      {/* Right goal posts */}
      <line x1="99" y1="26" x2="99" y2="36" stroke="white" strokeWidth="1.5" />
      <line x1="99" y1="26" x2="95" y2="26" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="99" y1="36" x2="95" y2="36" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      <line x1="95" y1="26" x2="95" y2="36" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />

      {/* Attack direction indicator */}
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
