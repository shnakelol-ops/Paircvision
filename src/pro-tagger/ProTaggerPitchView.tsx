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

// ── Portrait viewBox 100×160 ──────────────────────────────────────────────
// Landscape (pitch-config) → portrait: portrait(x,y) = landscape(y,x).
// All non-arc markings are axis-swapped by renderMarkings().
// EllipseArcs are skipped there and rendered explicitly below with named
// helpers that make the sweep-flag intent impossible to confuse.

const n = (v: number) => Math.round(v * 1000) / 1000;

// Goal posts in portrait — centreY=50, smallWide=(14/90)*96 from pitch-config.
const POST_X1 = n(50 - (14 / 90) * 96 / 2); // 42.533
const POST_X2 = n(50 + (14 / 90) * 96 / 2); // 57.467

// ── Arc helpers ───────────────────────────────────────────────────────────
//
// Both helpers draw a horizontal-chord arc whose chord endpoints are at
// (cx ± rx, cy).  They differ only in sweep flag:
//
//   topArcFacingMidfield    sweep=1 (CW  in SVG Y-down) → arc bulges DOWN ✓
//   bottomArcFacingMidfield sweep=0 (CCW in SVG Y-down) → arc bulges UP  ✓

function topArcFacingMidfield(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${n(cx - rx)},${n(cy)} A ${n(rx)},${n(ry)} 0 0 1 ${n(cx + rx)},${n(cy)}`;
}

function bottomArcFacingMidfield(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${n(cx - rx)},${n(cy)} A ${n(rx)},${n(ry)} 0 0 0 ${n(cx + rx)},${n(cy)}`;
}

// ── D arc geometry (13 m radius) ──────────────────────────────────────────
// Portrait: x = width axis (90 m → 96 SVG), y = length axis (145 m → 156 SVG).
const rxD   = (13 / 90) * 96;           // 13.867 — width-direction radius
const ryD   = (13 / 145) * 156;         // 13.986 — length-direction radius
const dTopY = 2 + (13 / 145) * 156;    // 15.986 — outer edge of top large box
const dBotY = 158 - (13 / 145) * 156;  // 144.014 — outer edge of bottom large box

const dArcTop = topArcFacingMidfield(50, dTopY, rxD, ryD);
const dArcBot = bottomArcFacingMidfield(50, dBotY, rxD, ryD);

// ── 2-point arc geometry (40 m radius, football only) ────────────────────
// Chord anchored at the 20 m line (matches pitch-config.ts twoPointAnchorAngle).
// Arc apex reaches ~43 SVG units from goal line (just inside the 45 m zone).
const rx2   = (40 / 90) * 96;           // 42.667
const ry2   = (40 / 145) * 156;         // 42.897
const _dy20 = (20 / 145) * 156;         // 21.517 — portrait Y dist, goal→20 m
const _a2hw = rx2 * Math.sqrt(Math.max(0, 1 - (_dy20 / ry2) ** 2)); // ≈ 36.903
const arc2x1 = n(50 - _a2hw);           // ≈ 13.097
const arc2x2 = n(50 + _a2hw);           // ≈ 86.903
const arc2yT = n(2 + _dy20);            // 23.517 — chord y for top arc
const arc2yB = n(158 - _dy20);          // 136.483 — chord y for bottom arc

// sweep=1 (CW) from left→right bulges DOWN (toward midfield) for top.
const pt2Top = `M ${arc2x1},${arc2yT} A ${n(rx2)},${n(ry2)} 0 0 1 ${arc2x2},${arc2yT}`;
// sweep=0 (CCW) from left→right bulges UP (toward midfield) for bottom.
const pt2Bot = `M ${arc2x1},${arc2yB} A ${n(rx2)},${n(ry2)} 0 0 0 ${arc2x2},${arc2yB}`;

// Arc stroke colours (match pitch-config.ts Lg.lineGridStrong)
const C_ARC = "rgba(255,255,255,0.42)";

// ── Non-arc marking renderer (axis-swap only) ─────────────────────────────
// EllipseArcs are skipped here — rendered with explicit helpers above.
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
        return null; // drawn explicitly below with correct sweep flags
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
  const isFootball = sport === "gaelic" || sport === "ladies_football";
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

      {/* Lines, rects, circles — axis-swapped from pitch-config.ts */}
      {renderMarkings(markings)}

      {/* D arcs — outside each large box, facing midfield */}
      <path d={dArcTop} fill="none" stroke={C_ARC} strokeWidth="0.48" />
      <path d={dArcBot} fill="none" stroke={C_ARC} strokeWidth="0.48" />

      {/* 2-point arcs — football / ladies only */}
      {isFootball && (
        <>
          <path d={pt2Top} fill="none" stroke={C_ARC} strokeWidth="0.48" strokeLinecap="round" />
          <path d={pt2Bot} fill="none" stroke={C_ARC} strokeWidth="0.48" strokeLinecap="round" />
        </>
      )}

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
