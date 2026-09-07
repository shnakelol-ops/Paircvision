import type { CSSProperties } from "react";
import { getPitchConfig, type PitchMarking } from "../core/pitch/pitch-config";

// ── Static, presentation-only reproduction of the Event Stats tagging pitch ──
//
// AUTHORITATIVE VISUAL SOURCE: src/pro-tagger/ProTaggerPitchView.tsx (the
// live-capture pitch) and the marking DATA it renders from —
// getPitchConfig("gaelic") in src/core/pitch/pitch-config.ts. This file
// imports ONLY that pure marking data module (never ProTaggerPitchView.tsx
// itself, and never its coordinate-capture exports svgPointToPitchNorm /
// clientPointToPitchNorm), so the pitch drawn here uses the exact same
// lines/boxes/arcs, at the exact same proportions, as the real tagging
// pitch — not a hand-approximated subset.
//
// The portrait viewBox swap, the 90° rotation matrix, the arc-to-path
// conversion, and the marking-to-SVG-element switch below are byte-for-byte
// reproductions of the equivalent (non-exported) logic in
// ProTaggerPitchView.tsx — copied, not imported, because that file must not
// be modified in this pass (see the Event Stats visual lineup audit's hard
// do-not-touch fence) and does not export them. Copying pure, stateless
// rendering logic creates no runtime dependency on that component; this
// file has no import of it at all.
//
// Deliberately excludes every interactive/match-state element
// ProTaggerPitchView.tsx also renders: pointer/tap handling, the animated
// dot shown while an event is mid-capture, the "ATK ↓/↑" label (which
// needs the live attacking-direction and half state), and the dimming
// overlay shown when that view is non-interactive. This component takes no
// props and has no match-state dependency at all — pure decoration for
// Squad Setup's lineup summary, reusable later for a share-card export.
const GAELIC_PITCH_CONFIG = getPitchConfig("gaelic");

// Portrait swap of the landscape pitch config's viewBox — same derivation
// ProTaggerPitchView.tsx uses. Exported so ProTaggerLineupFormation.tsx can
// size its wrapping box to the same aspect ratio as this actual pitch.
export const LINEUP_PITCH_PORTRAIT_VIEWBOX = {
  w: GAELIC_PITCH_CONFIG.viewBox.h,
  h: GAELIC_PITCH_CONFIG.viewBox.w,
} as const;

// Same 90° rotation ProTaggerPitchView.tsx uses for its own portrait view.
// Purely a visual layout transform here — this component never reads or
// writes nx/ny, so there is no coordinate-capture meaning to preserve.
const PORTRAIT_MARKINGS_TRANSFORM = `matrix(0 1 -1 0 ${GAELIC_PITCH_CONFIG.viewBox.h} 0)`;
const SVG_EPSILON = 1e-9;

function formatSvgNumber(value: number): string {
  if (Math.abs(value) < SVG_EPSILON) return "0";
  return Number(value.toFixed(6)).toString();
}

type EllipseArcMarking = Extract<PitchMarking, { kind: "ellipseArc" }>;

function ellipseArcToSvgPath(mark: EllipseArcMarking): string {
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

function renderPitchMarking(mark: PitchMarking, index: number) {
  const key = `lineup-pitch-marking-${index}`;

  switch (mark.kind) {
    case "line":
      return (
        <line
          key={key}
          x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2}
          stroke={mark.stroke} strokeWidth={mark.strokeWidth} strokeDasharray={mark.strokeDasharray}
        />
      );
    case "rect":
      return (
        <rect
          key={key}
          x={mark.x} y={mark.y} width={mark.w} height={mark.h}
          fill={mark.fill ?? "none"} stroke={mark.stroke} strokeWidth={mark.strokeWidth}
        />
      );
    case "circle":
      return (
        <circle
          key={key}
          cx={mark.cx} cy={mark.cy} r={mark.r}
          fill={mark.fill ?? "none"} stroke={mark.stroke} strokeWidth={mark.strokeWidth}
        />
      );
    case "ellipse":
      return (
        <ellipse
          key={key}
          cx={mark.cx} cy={mark.cy} rx={mark.rx} ry={mark.ry}
          fill={mark.fill ?? "none"} stroke={mark.stroke} strokeWidth={mark.strokeWidth}
        />
      );
    case "path":
      return (
        <path
          key={key}
          d={mark.d}
          fill={mark.fill ?? "none"} stroke={mark.stroke} strokeWidth={mark.strokeWidth}
          strokeLinecap={mark.strokeLinecap} strokeDasharray={mark.strokeDasharray} opacity={mark.opacity}
        />
      );
    case "ellipseArc":
      return (
        <path
          key={key}
          d={ellipseArcToSvgPath(mark)}
          fill="none" stroke={mark.stroke} strokeWidth={mark.strokeWidth}
          strokeLinecap={mark.strokeLinecap} opacity={mark.opacity}
        />
      );
    case "text":
      return (
        <text
          key={key}
          x={mark.x} y={mark.y}
          fill={mark.fill} fontSize={mark.fontSize} fontWeight={mark.fontWeight}
          textAnchor={mark.textAnchor} opacity={mark.opacity}
        >
          {mark.text}
        </text>
      );
  }
}

export function ProTaggerLineupPitchBackground() {
  const { w, h } = LINEUP_PITCH_PORTRAIT_VIEWBOX;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      style={S.svg}
      aria-hidden="true"
    >
      {/* Slightly quietened vs. the live tagging pitch (fill/line opacity
          only, no marking geometry change) — the jerseys are the focal
          point here, not the pitch itself. */}
      <rect x={0} y={0} width={w} height={h} fill="#166534" fillOpacity={0.9} />
      <g transform={PORTRAIT_MARKINGS_TRANSFORM} opacity={0.82}>
        {GAELIC_PITCH_CONFIG.markings.map(renderPitchMarking)}
      </g>
    </svg>
  );
}

const S: Record<string, CSSProperties> = {
  svg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
  },
};
