import type { CSSProperties } from "react";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";

export type SelectedPlayer = {
  playerId: string;
  playerName: string;
  playerNumber: number;
  squadId: string;
};

interface Props {
  teamLabel: string;
  squad: ProTaggerSquadPlayer[];
  squadId: string;
  onSelect: (player: SelectedPlayer | null) => void;
}

export function ProTaggerPlayerPicker({ teamLabel, squad, squadId, onSelect }: Props) {
  return (
    <div style={S.shell}>
      <div style={S.header}>
        <span style={S.title}>{teamLabel} — Player</span>
      </div>

      <div style={S.grid}>
        {squad.map((p) => (
          <button
            key={p.id}
            style={S.playerBtn}
            onClick={() =>
              onSelect({
                playerId:     p.id,
                playerName:   p.name.trim() || `#${p.number}`,
                playerNumber: p.number,
                squadId,
              })
            }
          >
            <span style={S.number}>{p.number}</span>
            {p.name.trim() && <span style={S.name}>{p.name.trim()}</span>}
          </button>
        ))}
      </div>

      <div style={S.nullRow}>
        <button style={S.nullBtn} onClick={() => onSelect(null)}>
          NULL — No player
        </button>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#0d1117",
    overflow: "hidden",
    minHeight: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "10px 14px 8px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: "#e6edf3",
    letterSpacing: "-0.2px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 6,
    padding: "10px 12px 10px",
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
  },
  playerBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "8px 4px 6px",
    cursor: "pointer",
    outline: "none",
    minHeight: 56,
    WebkitTapHighlightColor: "transparent",
  },
  number: {
    fontSize: 18,
    fontWeight: 700,
    color: "#e6edf3",
    lineHeight: "1.1",
    fontVariantNumeric: "tabular-nums",
  },
  name: {
    fontSize: 9,
    color: "#8b949e",
    marginTop: 2,
    textAlign: "center" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    maxWidth: "100%",
    lineHeight: "1.2",
  },
  nullRow: {
    padding: "8px 12px 12px",
    flexShrink: 0,
    borderTop: "1px solid #21262d",
    background: "#0d1117",
  },
  nullBtn: {
    width: "100%",
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    boxSizing: "border-box" as const,
  },
};
