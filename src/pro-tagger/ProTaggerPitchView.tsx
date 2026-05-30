import type { CSSProperties, PointerEvent } from "react";
import type { ProTaggerSport, ProTaggerAttackDirection } from "./pro-tagger-session";
import { getPitchConfig, type PitchMarking } from "../core/pitch/pitch-config";

interface Props {
  sport: ProTaggerSport;
  attackDirection: ProTaggerAttackDirection;
  half: 1 | 2;
  feedbackDot: { nx: number; ny: number } | null;
  interactive: boolean;
  onTap: (nx: number, ny: number) => void;
}

// ── Landscape (160×100) → Portrait (100×160) axis-swap ────────────────────
//
// pitch-config.ts uses a landscape viewBox 160×100 (length along X, width
// along Y).  The portrait SVG here is 100×160 (same numbers, axes swapped).
// Transform: portrait(x, y) = landscape(y, x) — no scaling needed.

const n = (v: number) => Math.round(v * 1000) / 1000;

// Goal posts sit outside the pitch boundary — not in pitch-config markings.
// Derived from landscape constants: centreY=50, smallWide=(14/90)*96=14.933.
const POST_X1 = n(50 - (14 / 90) * 96 / 2); // 42.533
const POST_X2 = n(50 + (14 / 90) * 96 / 2); // 57.467

function ellipseArcToPath(m: Extract<PitchMarking, { kind: "ellipseArc" }>): string {
  // Portrait: pcx=m.cy, pcy=m.cx, prx=m.ry, pry=m.rx
  const pcx = m.cy, pcy = m.cx, prx = m.ry, pry = m.rx;
  // Angle rotation under 90° CW axis-swap: portrait φ = π/2 − landscape θ
  const pStart = Math.PI / 2 - m.endAngle;
  const pEnd   = Math.PI / 2 - m.startAngle;
  // Direction flips under axis-swap
  const pCCW = !(m.anticlockwise ?? false);

  const x1 = pcx + prx * Math.cos(pStart);
  const y1 = pcy + pry * Math.sin(pStart);
  const x2 = pcx + prx * Math.cos(pEnd);
  const y2 = pcy + pry * Math.sin(pEnd);

  // SVG sweep=1 CW (= canvas anticlockwise=false), sweep=0 CCW
  const sweepFlag = pCCW ? 0 : 1;
  const span = pCCW
    ? (pStart >= pEnd ? pStart - pEnd : 2 * Math.PI + pStart - pEnd)
    : (pEnd   >= pStart ? pEnd - pStart : 2 * Math.PI + pEnd - pStart);
  const largeArc = span > Math.PI ? 1 : 0;

  return `M ${n(x1)},${n(y1)} A ${n(prx)},${n(pry)} 0 ${largeArc} ${sweepFlag} ${n(x2)},${n(y2)}`;
}

function renderMarkings(markings: readonly PitchMarking[]) {
  return markings.map((m, i) => {
    switch (m.kind) {
      case "line":
        return (
          <line key={i}
            x1={n(m.y1)} y1={n(m.x1)} x2={n(m.y2)} y2={n(m.x2)}
            stroke={m.stroke} strokeWidth={m.strokeWidth}
            strokeDasharray={m.strokeDasharray}
          />
        );
      case "rect":
        // landscape (x, y, w, h) → portrait (y, x, h, w)
        return (
          <rect key={i}
            x={n(m.y)} y={n(m.x)} width={n(m.h)} height={n(m.w)}
            stroke={m.stroke} strokeWidth={m.strokeWidth} fill={m.fill ?? "none"}
          />
        );
      case "circle":
        return (
          <circle key={i}
            cx={n(m.cy)} cy={n(m.cx)} r={m.r}
            fill={m.fill ?? "none"} stroke={m.stroke} strokeWidth={m.strokeWidth}
          />
        );
      case "ellipse":
        return (
          <ellipse key={i}
            cx={n(m.cy)} cy={n(m.cx)} rx={n(m.ry)} ry={n(m.rx)}
            stroke={m.stroke} strokeWidth={m.strokeWidth} fill={m.fill ?? "none"}
          />
        );
      case "ellipseArc":
        return (
          <path key={i}
            d={ellipseArcToPath(m)}
            stroke={m.stroke} strokeWidth={m.strokeWidth} fill="none"
            strokeLinecap={m.strokeLinecap}
          />
        );
      default:
        return null;
    }
  });
}

export function ProTaggerPitchView({
  sport,
  attackDirection,
  half,
  feedbackDot,
  interactive,
  onTap,
}: Props) {
  // Map ProTaggerSport → PitchSport (ladies_football has no PitchSport entry)
  const pitchSport =
    sport === "hurling" || sport === "camogie" ? "hurling" as const : "gaelic" as const;
  const markings = getPitchConfig(pitchSport).markings;

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

  return (
    <svg
      viewBox="0 0 100 160"
      style={svgStyle(interactive)}
      onPointerDown={handlePointerDown}
      aria-label="Pitch — tap to place event"
    >
      {/* Grass */}
      <rect x="0" y="0" width="100" height="160" fill="#166534" />

      {/* All GAA markings — derived from pitch-config.ts landscape data */}
      {renderMarkings(markings)}

      {/* Goal posts (outside pitch boundary) */}
      <line x1={POST_X1} y1="0" x2={POST_X1} y2="2" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X2} y1="0" x2={POST_X2} y2="2" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X1} y1="0.3" x2={POST_X2} y2="0.3" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
      <line x1={POST_X1} y1="158" x2={POST_X1} y2="160" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X2} y1="158" x2={POST_X2} y2="160" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X1} y1="159.7" x2={POST_X2} y2="159.7" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />

      {/* Attack direction indicator */}
      <text
        x={50}
        y={attackingDown ? 142 : 22}
        textAnchor="middle"
        fontSize="3.8"
        fill="rgba(255,255,255,0.80)"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {attackingDown ? "ATK ↓" : "ATK ↑"}
      </text>

      {/* Dim overlay when not interactive */}
      {!interactive && (
        <rect x="0" y="0" width="100" height="160" fill="rgba(0,0,0,0.18)" />
      )}

      {/* Feedback dot */}
      {feedbackDot && (
        <>
          <circle
            cx={feedbackDot.nx * 100}
            cy={feedbackDot.ny * 160}
            r="4"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="0.6"
          />
          <circle
            cx={feedbackDot.nx * 100}
            cy={feedbackDot.ny * 160}
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
