import React from "react";
import type { ShotMapDot, MiniShotMapData } from "./coachingBrief";

// Canonical shot colours per CLAUDE.md visual language (locked — do not change)
const DOT_COLOUR: Record<ShotMapDot["outcome"], string> = {
  GOAL: "#16a34a",
  POINT: "#4ade80",
  TWO_POINTER: "#fbbf24",
  WIDE: "#ef4444",
  BLOCKED: "#94a3b8",
};

// Portrait viewBox: touchline-to-touchline (horizontal) × goal-to-goal (vertical)
// Matches the 1:1.6 GAA pitch ratio, rotated to goal-to-goal orientation.
const VW = 100;   // touchline-to-touchline
const VH = 160;   // goal-to-goal

function PitchLines(): React.ReactElement {
  return (
    <g stroke="#4b5563" fill="none">
      <rect x={0.5} y={0.5} width={VW - 1} height={VH - 1} strokeWidth={1.5} />
      {/* Halfway line — horizontal */}
      <line x1={0} y1={VH / 2} x2={VW} y2={VH / 2} strokeWidth={0.9} />
      {/* 45m lines — horizontal */}
      <line x1={0} y1={VH * 0.31} x2={VW} y2={VH * 0.31} strokeWidth={0.6} strokeDasharray="3 3" />
      <line x1={0} y1={VH * 0.69} x2={VW} y2={VH * 0.69} strokeWidth={0.6} strokeDasharray="3 3" />
      {/* 20m lines — horizontal */}
      <line x1={0} y1={VH * 0.138} x2={VW} y2={VH * 0.138} strokeWidth={0.5} strokeDasharray="2 4" />
      <line x1={0} y1={VH * 0.862} x2={VW} y2={VH * 0.862} strokeWidth={0.5} strokeDasharray="2 4" />
    </g>
  );
}

function MiniPitchMap({ dots }: { dots: ShotMapDot[] }): React.ReactElement {
  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: "100%", height: "auto", display: "block", background: "#0f172a", borderRadius: "3px" }}
      aria-hidden="true"
    >
      <PitchLines />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.ny * VW}
          cy={d.nx * VH}
          r={4}
          fill={DOT_COLOUR[d.outcome]}
          opacity={0.9}
        />
      ))}
      {dots.length === 0 && (
        <text x={VW / 2} y={VH / 2 + 3} textAnchor="middle" fontSize={8} fill="#6b7280">
          No data
        </text>
      )}
    </svg>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "6.5px",
  fontWeight: 600,
  letterSpacing: "0.05em",
  marginBottom: "2px",
  textTransform: "uppercase",
};

export function MiniShotMapGrid({
  data,
  homeTeam,
  awayTeam,
}: {
  data: MiniShotMapData;
  homeTeam: string;
  awayTeam: string;
}): React.ReactElement {
  const home = homeTeam.slice(0, 14);
  const away = awayTeam.slice(0, 14);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", marginTop: "4px" }}>
      <div>
        <div style={{ ...LABEL_STYLE, color: "#4ade80" }}>{home} Scores</div>
        <MiniPitchMap dots={data.ourScores} />
      </div>
      <div>
        <div style={{ ...LABEL_STYLE, color: "#fb7185" }}>{away} Scores</div>
        <MiniPitchMap dots={data.theirScores} />
      </div>
      <div>
        <div style={{ ...LABEL_STYLE, color: "#4ade80" }}>{home} Wides</div>
        <MiniPitchMap dots={data.ourWides} />
      </div>
      <div>
        <div style={{ ...LABEL_STYLE, color: "#fb7185" }}>{away} Wides</div>
        <MiniPitchMap dots={data.theirWides} />
      </div>
    </div>
  );
}
