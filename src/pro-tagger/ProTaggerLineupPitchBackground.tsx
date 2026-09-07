import type { CSSProperties } from "react";
import { LINEUP_PITCH_MARKINGS, LINEUP_PITCH_VIEWBOX } from "./pro-tagger-lineup-geometry";

// Purely decorative static Gaelic pitch background for the Squad Setup
// visual lineup (ProTaggerLineupFormation) — NOT the live-capture pitch.
// Deliberately has no tap handler, no coordinate transform, no
// attackDirection/orientation input, and no relationship whatsoever to
// ProTaggerPitchView.tsx's locked nx/ny coordinate system — see the Event
// Stats visual lineup audit for why that component is unsafe to reuse here.
// Geometry lives in pro-tagger-lineup-geometry.ts (plain data, no React) so
// a future non-React renderer (e.g. a canvas-based share-card export) can
// draw the identical pitch without re-deriving these numbers.
export function ProTaggerLineupPitchBackground() {
  const { w, h } = LINEUP_PITCH_VIEWBOX;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={S.svg}
      aria-hidden="true"
    >
      <rect x={0} y={0} width={w} height={h} fill="#15803d" />
      {LINEUP_PITCH_MARKINGS.map((mark, i) => {
        if (mark.kind === "rect") {
          return (
            <rect
              key={i}
              x={mark.x} y={mark.y} width={mark.w} height={mark.h}
              fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.6}
            />
          );
        }
        if (mark.kind === "line") {
          return (
            <line
              key={i}
              x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2}
              stroke="rgba(255,255,255,0.55)" strokeWidth={0.6}
            />
          );
        }
        return (
          <circle
            key={i}
            cx={mark.cx} cy={mark.cy} r={mark.r}
            fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.6}
          />
        );
      })}
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
