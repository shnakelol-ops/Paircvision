import type { CSSProperties, PointerEvent } from "react";

import {
  boardNormToWorld,
  worldToBoardNorm,
  type BoardNorm,
  type PitchWorldPoint,
} from "../core/coordinates/pitch-coordinates";
import { getPitchConfig, type PitchMarking } from "../core/pitch/pitch-config";

export type ProTaggerSport = "gaelic" | "ladies_football" | "hurling" | "camogie";
export type ProTaggerPitchOrientation = "landscape" | "portrait";
export type ProTaggerAttackDirection = "left" | "right";

export type ProTaggerPitchViewProps = {
  sport: ProTaggerSport;
  orientation?: ProTaggerPitchOrientation;
  interactive?: boolean;
  feedbackDot?: BoardNorm | null;
  onTap?: (nx: number, ny: number) => void;
  className?: string;
  style?: CSSProperties;
  attackDirection?: ProTaggerAttackDirection;
  half?: 1 | 2;
};

type EllipseArcMarking = Extract<PitchMarking, { kind: "ellipseArc" }>;
type SvgViewBox = { w: number; h: number };
type ClientRectLike = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

const GAELIC_PITCH_CONFIG = getPitchConfig("gaelic");
const PORTRAIT_MARKINGS_TRANSFORM = "matrix(0 1 1 0 0 0)";
const SVG_EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSvgNumber(value: number): string {
  if (Math.abs(value) < SVG_EPSILON) return "0";
  return Number(value.toFixed(6)).toString();
}

function svgViewBoxForOrientation(
  orientation: ProTaggerPitchOrientation,
  landscapeViewBox: SvgViewBox,
): SvgViewBox {
  return orientation === "portrait"
    ? { w: landscapeViewBox.h, h: landscapeViewBox.w }
    : landscapeViewBox;
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
  orientation: ProTaggerPitchOrientation,
  landscapeViewBox: SvgViewBox = GAELIC_PITCH_CONFIG.viewBox,
): BoardNorm {
  const svgViewBox = svgViewBoxForOrientation(orientation, landscapeViewBox);
  const clampedSvgX = clamp(svgX, 0, svgViewBox.w);
  const clampedSvgY = clamp(svgY, 0, svgViewBox.h);
  const world: PitchWorldPoint =
    orientation === "portrait"
      ? { x: clampedSvgY, y: clampedSvgX }
      : { x: clampedSvgX, y: clampedSvgY };

  return worldToBoardNorm(world.x, world.y, landscapeViewBox);
}

export function clientPointToPitchNorm(
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
  orientation: ProTaggerPitchOrientation,
  landscapeViewBox: SvgViewBox = GAELIC_PITCH_CONFIG.viewBox,
): BoardNorm {
  const svgViewBox = svgViewBoxForOrientation(orientation, landscapeViewBox);
  const scale = Math.min(rect.width / svgViewBox.w, rect.height / svgViewBox.h);
  if (!Number.isFinite(scale) || scale <= 0) return { nx: 0.5, ny: 0.5 };

  const renderedW = svgViewBox.w * scale;
  const renderedH = svgViewBox.h * scale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = (rect.height - renderedH) / 2;
  const svgX = (clientX - rect.left - offsetX) / scale;
  const svgY = (clientY - rect.top - offsetY) / scale;

  return svgPointToPitchNorm(svgX, svgY, orientation, landscapeViewBox);
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
  orientation = "portrait",
  interactive = true,
  feedbackDot = null,
  onTap,
  className,
  style,
  attackDirection,
  half,
}: ProTaggerPitchViewProps) {
  // Pro Tagger intentionally uses one trusted GAA layout for every sport for now.
  void sport;
  void attackDirection;
  void half;

  const pitchConfig = GAELIC_PITCH_CONFIG;
  const svgViewBox = svgViewBoxForOrientation(orientation, pitchConfig.viewBox);
  const markingsTransform =
    orientation === "portrait" ? PORTRAIT_MARKINGS_TRANSFORM : undefined;

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!interactive || !onTap) return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const { nx, ny } = clientPointToPitchNorm(
      event.clientX,
      event.clientY,
      rect,
      orientation,
      pitchConfig.viewBox,
    );
    onTap(nx, ny);
  }

  const feedbackWorld = feedbackDot
    ? boardNormToWorld(feedbackDot.nx, feedbackDot.ny, pitchConfig.viewBox)
    : null;

  return (
    <svg
      viewBox={`0 0 ${svgViewBox.w} ${svgViewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{
        ...proTaggerPitchSvgStyle(svgViewBox, interactive),
        ...style,
      }}
      onPointerDown={handlePointerDown}
      role={interactive ? "button" : "img"}
      aria-label="GAA pitch - tap to place event"
    >
      <rect x="0" y="0" width={svgViewBox.w} height={svgViewBox.h} fill="#103629" />
      <g transform={markingsTransform}>
        {pitchConfig.markings.map(renderPitchMarking)}
        {feedbackWorld && (
          <g pointerEvents="none">
            <circle
              cx={feedbackWorld.x}
              cy={feedbackWorld.y}
              r="3.3"
              fill="none"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="0.5"
            />
            <circle cx={feedbackWorld.x} cy={feedbackWorld.y} r="1.55" fill="white" />
          </g>
        )}
      </g>
    </svg>
  );
}

function proTaggerPitchSvgStyle(
  svgViewBox: SvgViewBox,
  interactive: boolean,
): CSSProperties {
  return {
    width: "100%",
    display: "block",
    aspectRatio: `${svgViewBox.w} / ${svgViewBox.h}`,
    cursor: interactive ? "crosshair" : "default",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    touchAction: interactive ? "none" : "auto",
  };
}

export default ProTaggerPitchView;
