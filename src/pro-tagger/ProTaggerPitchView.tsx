import type { CSSProperties, PointerEvent } from "react";

import {
  boardNormToWorld,
  worldToBoardNorm,
  type BoardNorm,
  type PitchWorldPoint,
} from "../core/coordinates/pitch-coordinates";
import { getPitchConfig, type PitchMarking } from "../core/pitch/pitch-config";
import type { ProTaggerAttackDirection, ProTaggerSport } from "./pro-tagger-session";

interface Props {
  sport: ProTaggerSport;
  attackDirection: ProTaggerAttackDirection;
  half: 1 | 2;
  feedbackDot: BoardNorm | null;
  interactive: boolean;
  onTap: (nx: number, ny: number) => void;
}

type EllipseArcMarking = Extract<PitchMarking, { kind: "ellipseArc" }>;
type SvgViewBox = { w: number; h: number };
type ClientRectLike = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

const GAELIC_PITCH_CONFIG = getPitchConfig("gaelic");
const PORTRAIT_VIEWBOX = {
  w: GAELIC_PITCH_CONFIG.viewBox.h,
  h: GAELIC_PITCH_CONFIG.viewBox.w,
} as const;
// Rotates canonical landscape pitch space (X = length axis 0..160, Y = width/
// touchline axis 0..100 — see src/core/pitch/pitch-space.ts) a genuine 90°
// clockwise turn into this portrait view: screenX = landscapeH - Y, screenY = X.
// This MUST stay the exact inverse of svgPointToPitchNorm below — together they
// are what keep a tapped location, the live feedback dot, and every downstream
// consumer of stored nx/ny (Review, HT/FT snapshots, PDFs, Intelligence Pack)
// agreeing on which physical sideline an event happened on. A bare axis swap
// (no landscapeH - Y term) is a mirror reflection, not a rotation, and silently
// flips every tap onto the opposite touchline — see the coordinate integrity
// audit that introduced this comment.
const PORTRAIT_MARKINGS_TRANSFORM = `matrix(0 1 -1 0 ${GAELIC_PITCH_CONFIG.viewBox.h} 0)`;
const SVG_EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSvgNumber(value: number): string {
  if (Math.abs(value) < SVG_EPSILON) return "0";
  return Number(value.toFixed(6)).toString();
}

export function ellipseArcToSvgPath(mark: EllipseArcMarking): string {
  const startX = mark.cx + Math.cos(mark.startAngle) * mark.rx;
  const startY = mark.cy + Math.sin(mark.startAngle) * mark.ry;
  const endX = mark.cx + Math.cos(mark.endAngle) * mark.rx;
  const endY = mark.cy + Math.sin(mark.endAngle) * mark.ry;
  const delta = mark.endAngle - mark.startAngle;
  const largeArcFlag = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweepFlag = delta >= 0 ? 1 : 0;

  return [
    "M",
    formatSvgNumber(startX),
    formatSvgNumber(startY),
    "A",
    formatSvgNumber(mark.rx),
    formatSvgNumber(mark.ry),
    "0",
    largeArcFlag.toString(),
    sweepFlag.toString(),
    formatSvgNumber(endX),
    formatSvgNumber(endY),
  ].join(" ");
}

export function svgPointToPitchNorm(
  svgX: number,
  svgY: number,
  landscapeViewBox: SvgViewBox = GAELIC_PITCH_CONFIG.viewBox,
): BoardNorm {
  const clampedSvgX = clamp(svgX, 0, PORTRAIT_VIEWBOX.w);
  const clampedSvgY = clamp(svgY, 0, PORTRAIT_VIEWBOX.h);
  // Inverse of PORTRAIT_MARKINGS_TRANSFORM's 90° clockwise rotation
  // (screenX = landscapeH - Y, screenY = X) — must stay in lockstep with it.
  const world: PitchWorldPoint = { x: clampedSvgY, y: landscapeViewBox.h - clampedSvgX };

  return worldToBoardNorm(world.x, world.y, landscapeViewBox);
}

export function clientPointToPitchNorm(
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
  landscapeViewBox: SvgViewBox = GAELIC_PITCH_CONFIG.viewBox,
): BoardNorm {
  const scale = Math.min(rect.width / PORTRAIT_VIEWBOX.w, rect.height / PORTRAIT_VIEWBOX.h);
  if (!Number.isFinite(scale) || scale <= 0) return { nx: 0.5, ny: 0.5 };

  const renderedW = PORTRAIT_VIEWBOX.w * scale;
  const renderedH = PORTRAIT_VIEWBOX.h * scale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = (rect.height - renderedH) / 2;
  const svgX = (clientX - rect.left - offsetX) / scale;
  const svgY = (clientY - rect.top - offsetY) / scale;

  return svgPointToPitchNorm(svgX, svgY, landscapeViewBox);
}

function renderPitchMarking(mark: PitchMarking, index: number) {
  const key = `pitch-marking-${index}`;

  switch (mark.kind) {
    case "line":
      return (
        <line
          key={key}
          x1={mark.x1}
          y1={mark.y1}
          x2={mark.x2}
          y2={mark.y2}
          stroke={mark.stroke}
          strokeWidth={mark.strokeWidth}
          strokeDasharray={mark.strokeDasharray}
        />
      );
    case "rect":
      return (
        <rect
          key={key}
          x={mark.x}
          y={mark.y}
          width={mark.w}
          height={mark.h}
          fill={mark.fill ?? "none"}
          stroke={mark.stroke}
          strokeWidth={mark.strokeWidth}
        />
      );
    case "circle":
      return (
        <circle
          key={key}
          cx={mark.cx}
          cy={mark.cy}
          r={mark.r}
          fill={mark.fill ?? "none"}
          stroke={mark.stroke}
          strokeWidth={mark.strokeWidth}
        />
      );
    case "ellipse":
      return (
        <ellipse
          key={key}
          cx={mark.cx}
          cy={mark.cy}
          rx={mark.rx}
          ry={mark.ry}
          fill={mark.fill ?? "none"}
          stroke={mark.stroke}
          strokeWidth={mark.strokeWidth}
        />
      );
    case "path":
      return (
        <path
          key={key}
          d={mark.d}
          fill={mark.fill ?? "none"}
          stroke={mark.stroke}
          strokeWidth={mark.strokeWidth}
          strokeLinecap={mark.strokeLinecap}
          strokeDasharray={mark.strokeDasharray}
          opacity={mark.opacity}
        />
      );
    case "ellipseArc":
      return (
        <path
          key={key}
          d={ellipseArcToSvgPath(mark)}
          fill="none"
          stroke={mark.stroke}
          strokeWidth={mark.strokeWidth}
          strokeLinecap={mark.strokeLinecap}
          opacity={mark.opacity}
        />
      );
    case "text":
      return (
        <text
          key={key}
          x={mark.x}
          y={mark.y}
          fill={mark.fill}
          fontSize={mark.fontSize}
          fontWeight={mark.fontWeight}
          textAnchor={mark.textAnchor}
          opacity={mark.opacity}
        >
          {mark.text}
        </text>
      );
  }
}

export function ProTaggerPitchView({
  sport,
  attackDirection,
  half,
  feedbackDot,
  interactive,
  onTap,
}: Props) {
  // Pro Tagger intentionally uses one trusted GAA pitch layout for every sport for now.
  void sport;

  const attackingDown =
    (half === 1 && attackDirection === "right") ||
    (half === 2 && attackDirection === "left");

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const { nx, ny } = clientPointToPitchNorm(
      e.clientX,
      e.clientY,
      rect,
      GAELIC_PITCH_CONFIG.viewBox,
    );
    onTap(nx, ny);
  }

  const feedbackWorld = feedbackDot
    ? boardNormToWorld(feedbackDot.nx, feedbackDot.ny, GAELIC_PITCH_CONFIG.viewBox)
    : null;

  return (
    <svg
      viewBox={`0 0 ${PORTRAIT_VIEWBOX.w} ${PORTRAIT_VIEWBOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={svgStyle(interactive)}
      onPointerDown={handlePointerDown}
      aria-label="Pitch - tap to place event"
    >
      <rect x="0" y="0" width={PORTRAIT_VIEWBOX.w} height={PORTRAIT_VIEWBOX.h} fill="#166534" />

      <g transform={PORTRAIT_MARKINGS_TRANSFORM}>
        {GAELIC_PITCH_CONFIG.markings.map(renderPitchMarking)}
        {feedbackWorld && (
          // key forces animation restart if the dot position changes mid-flow
          <g key={`${feedbackDot!.nx.toFixed(4)}-${feedbackDot!.ny.toFixed(4)}`}>
            {/* Expanding pulse ring */}
            <circle
              cx={feedbackWorld.x}
              cy={feedbackWorld.y}
              r="2"
              fill="none"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth="0.45"
            >
              <animate attributeName="r" from="2" to="12" dur="0.75s" fill="freeze" />
              <animate attributeName="stroke-opacity" from="0.75" to="0" dur="0.75s" fill="freeze" />
            </circle>
            {/* Solid centre dot */}
            <circle cx={feedbackWorld.x} cy={feedbackWorld.y} r="1.55" fill="white" />
          </g>
        )}
      </g>

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

      {!interactive && (
        <rect x="0" y="0" width={PORTRAIT_VIEWBOX.w} height={PORTRAIT_VIEWBOX.h} fill="rgba(0,0,0,0.18)" />
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
