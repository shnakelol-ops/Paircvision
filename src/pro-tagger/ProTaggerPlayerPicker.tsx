import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { SAVED_SQUADS_STORAGE_KEY } from "../core/stats/saved-match";

export type SelectedPlayer = {
  playerId: string;
  playerName: string;
  playerNumber: number;
  squadId: string;
};

interface Props {
  forTeamName: string;
  onSelect: (player: SelectedPlayer | null) => void;
}

type StoredPlayer = { id: string; number: number; name: string; isActive?: boolean };
type StoredSquad  = { id: string; name: string; players: StoredPlayer[] };

function loadForSquad(): { id: string; players: StoredPlayer[] } | null {
  try {
    const raw = window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY);
    if (!raw) return null;
    const squads = JSON.parse(raw) as StoredSquad[];
    if (!Array.isArray(squads) || squads.length === 0) return null;
    const home = squads.find((s) => s.name === "HOME" || s.name === "Home") ?? squads[0];
    if (!home?.id || !Array.isArray(home.players)) return null;
    return { id: home.id, players: home.players };
  } catch {
    return null;
  }
}

export function ProTaggerPlayerPicker({ forTeamName, onSelect }: Props) {
  const [squad, setSquad] = useState<{ id: string; players: StoredPlayer[] } | null>(null);

  useEffect(() => {
    setSquad(loadForSquad());
  }, []);

  const teamLabel = forTeamName.trim() || "Team";
  const players = squad?.players.filter((p) => p.isActive !== false) ?? [];

  return (
    <div style={S.shell}>
      <div style={S.header}>
        <span style={S.title}>{teamLabel} — Player</span>
        <button style={S.skipBtn} onClick={() => onSelect(null)}>
          Skip
        </button>
      </div>

      {players.length === 0 ? (
        <div style={S.emptyMsg}>
          No squad loaded.{" "}
          <span style={S.emptyHint}>Set up a squad in Stats first, then return here.</span>
        </div>
      ) : (
        <div style={S.grid}>
          {players.map((p) => (
            <button
              key={p.id}
              style={S.playerBtn}
              onClick={() =>
                onSelect({
                  playerId:     p.id,
                  playerName:   p.name.trim() || `#${p.number}`,
                  playerNumber: p.number,
                  squadId:      squad!.id,
                })
              }
            >
              <span style={S.number}>{p.number}</span>
              {p.name.trim() && <span style={S.name}>{p.name.trim()}</span>}
            </button>
          ))}
        </div>
      )}
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
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
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
  skipBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "5px 12px",
    cursor: "pointer",
    outline: "none",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 6,
    padding: "10px 12px 16px",
    overflowY: "auto",
    flex: 1,
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
  emptyMsg: {
    padding: "20px 16px",
    fontSize: 13,
    color: "#8b949e",
    lineHeight: "1.5",
  },
  emptyHint: {
    color: "#6e7681",
    fontSize: 12,
  },
};
