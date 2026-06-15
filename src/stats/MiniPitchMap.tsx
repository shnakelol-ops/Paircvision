import React from "react";
import type { ShotMapDot, MiniShotMapData } from "./coachingBrief";

// Canonical shot colours per CLAUDE.md visual language
const DOT_COLOUR: Record<ShotMapDot["outcome"], string> = {
  GOAL: "#16a34a",
  POINT: "#4ade80",
  TWO_POINTER: "#fbbf24",
  WIDE: "#ef4444",
  BLOCKED: "#94a3b8",
};

// Matches pitch-config.ts canonical dimensions
const VW = 160;
const VH = 100;

function PitchLines(): React.ReactElement {
  return (
    <g stroke="#374151" fill="none">
      <rect x={0.5} y={0.5} width={VW - 1} height={VH - 1} strokeWidth={1.5} />
      <line x1={VW / 2} y1={0} x2={VW / 2} y2={VH} strokeWidth={0.8} />
      {/* 45m lines */}
      <line x1={VW * 0.31} y1={0} x2={VW * 0.31} y2={VH} strokeWidth={0.5} strokeDasharray="3 3" />
      <line x1={VW * 0.69} y1={0} x2={VW * 0.69} y2={VH} strokeWidth={0.5} strokeDasharray="3 3" />
      {/* 20m lines */}
      <line x1={VW * 0.138} y1={0} x2={VW * 0.138} y2={VH} strokeWidth={0.4} strokeDasharray="2 4" />
      <line x1={VW * 0.862} y1={0} x2={VW * 0.862} y2={VH} strokeWidth={0.4} strokeDasharray="2 4" />
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
          cx={d.nx * VW}
          cy={d.ny * VH}
          r={3.5}
          fill={DOT_COLOUR[d.outcome]}
          opacity={0.85}
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
        <div style={{ ...LABEL_STYLE, color: "#94a3b8" }}>{home} Wides</div>
        <MiniPitchMap dots={data.ourWides} />
      </div>
      <div>
        <div style={{ ...LABEL_STYLE, color: "#94a3b8" }}>{away} Wides</div>
        <MiniPitchMap dots={data.theirWides} />
      </div>
    </div>
  );
}
