import type { CSSProperties, PointerEvent } from "react";

import { getPitchConfig, type PitchMarking } from "../core/pitch/pitch-config";

export type ProTaggerSport = "gaelic" | "ladies_football" | "hurling" | "camogie";
export type ProTaggerAttackDirection = "left" | "right";

interface Props {
  sport: ProTaggerSport;
  attackDirection: ProTaggerAttackDirection;
  half: 1 | 2;
  feedbackDot: { nx: number; ny: number } | null;
  interactive: boolean;
  onTap: (nx: number, ny: number) => void;
}

const n = (v: number) => Math.round(v * 1000) / 1000;

// Goal posts in portrait (0..100 x 0..160).
const POST_X1 = n(50 - ((14 / 90) * 96) / 2);
const POST_X2 = n(50 + ((14 / 90) * 96) / 2);

function topArcFacingMidfield(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${n(cx - rx)},${n(cy)} A ${n(rx)},${n(ry)} 0 0 1 ${n(cx + rx)},${n(cy)}`;
}

function bottomArcFacingMidfield(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${n(cx - rx)},${n(cy)} A ${n(rx)},${n(ry)} 0 0 0 ${n(cx + rx)},${n(cy)}`;
}

// D arcs: 13 m radius centred on outer edge of the large box (13 m line).
const rxD = (13 / 90) * 96;
const ryD = (13 / 145) * 156;
const dTopY = 2 + (13 / 145) * 156;
const dBotY = 158 - (13 / 145) * 156;
const dArcTop = topArcFacingMidfield(50, dTopY, rxD, ryD);
const dArcBot = bottomArcFacingMidfield(50, dBotY, rxD, ryD);

// 2-point arcs: 40 m radius with chord anchored at the 20 m line.
const rx2 = (40 / 90) * 96;
const ry2 = (40 / 145) * 156;
const dy20 = (20 / 145) * 156;
const arc2HalfWidth = rx2 * Math.sqrt(Math.max(0, 1 - (dy20 / ry2) ** 2));
const arc2yTop = n(2 + dy20);
const arc2yBottom = n(158 - dy20);
const twoPointArcTop = topArcFacingMidfield(50, arc2yTop, arc2HalfWidth, ry2);
const twoPointArcBottom = bottomArcFacingMidfield(50, arc2yBottom, arc2HalfWidth, ry2);

const ARC_STROKE = "rgba(255,255,255,0.42)";

function renderMarkings(markings: readonly PitchMarking[]) {
  return markings.map((mark, i) => {
    switch (mark.kind) {
      case "line":
        return (
          <line
            key={i}
            x1={n(mark.y1)}
            y1={n(mark.x1)}
            x2={n(mark.y2)}
            y2={n(mark.x2)}
            stroke={mark.stroke}
            strokeWidth={mark.strokeWidth}
            strokeDasharray={mark.strokeDasharray}
          />
        );
      case "rect":
        return (
          <rect
            key={i}
            x={n(mark.y)}
            y={n(mark.x)}
            width={n(mark.h)}
            height={n(mark.w)}
            stroke={mark.stroke}
            strokeWidth={mark.strokeWidth}
            fill={mark.fill ?? "none"}
          />
        );
      case "circle":
        return (
          <circle
            key={i}
            cx={n(mark.cy)}
            cy={n(mark.cx)}
            r={mark.r}
            fill={mark.fill ?? "none"}
            stroke={mark.stroke}
            strokeWidth={mark.strokeWidth}
          />
        );
      case "ellipse":
        return (
          <ellipse
            key={i}
            cx={n(mark.cy)}
            cy={n(mark.cx)}
            rx={n(mark.ry)}
            ry={n(mark.rx)}
            stroke={mark.stroke}
            strokeWidth={mark.strokeWidth}
            fill={mark.fill ?? "none"}
          />
        );
      case "ellipseArc":
        return null;
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
  // Pro Tagger uses one shared GAA pitch geometry for all sports.
  void sport;
  const markings = getPitchConfig("gaelic").markings;

  const attackingDown =
    (half === 1 && attackDirection === "right") ||
    (half === 2 && attackDirection === "left");

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onTap(nx, ny);
  }

  return (
    <svg
      viewBox="0 0 100 160"
      style={svgStyle(interactive)}
      onPointerDown={handlePointerDown}
      aria-label="Pitch — tap to place event"
    >
      <rect x="0" y="0" width="100" height="160" fill="#166534" />
      {renderMarkings(markings)}

      <path d={dArcTop} fill="none" stroke={ARC_STROKE} strokeWidth="0.48" />
      <path d={dArcBot} fill="none" stroke={ARC_STROKE} strokeWidth="0.48" />

      <path d={twoPointArcTop} fill="none" stroke={ARC_STROKE} strokeWidth="0.48" strokeLinecap="round" />
      <path d={twoPointArcBottom} fill="none" stroke={ARC_STROKE} strokeWidth="0.48" strokeLinecap="round" />

      <line x1={POST_X1} y1="0" x2={POST_X1} y2="2" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X2} y1="0" x2={POST_X2} y2="2" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X1} y1="0.3" x2={POST_X2} y2="0.3" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
      <line x1={POST_X1} y1="158" x2={POST_X1} y2="160" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X2} y1="158" x2={POST_X2} y2="160" stroke="white" strokeWidth="1.0" />
      <line x1={POST_X1} y1="159.7" x2={POST_X2} y2="159.7" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />

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

      {!interactive && <rect x="0" y="0" width="100" height="160" fill="rgba(0,0,0,0.18)" />}

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
          <circle cx={feedbackDot.nx * 100} cy={feedbackDot.ny * 160} r="2" fill="white" />
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
