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

// GAA formation rows: indices into the 0–14 starter slice.
const FORMATION_ROWS: readonly (readonly number[])[] = [
  [0],                // #1  GK
  [1, 2, 3],         // #2  #3  #4  (RB FB LB)
  [4, 5, 6],         // #5  #6  #7  (RHB CHB LHB)
  [7, 8],            // #8  #9      (MF MF)
  [9, 10, 11],       // #10 #11 #12 (RHF CHF LHF)
  [12, 13, 14],      // #13 #14 #15 (RF FF LF)
];

export function ProTaggerPlayerPicker({ teamLabel, squad, squadId, onSelect }: Props) {
  const starters = squad.slice(0, 15);
  const subs     = squad.slice(15);        // players 16–20

  function tap(p: ProTaggerSquadPlayer) {
    onSelect({
      playerId:     p.id,
      playerName:   p.name.trim() || `#${p.number}`,
      playerNumber: p.number,
      squadId,
    });
  }

  return (
    <div style={S.shell}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>{teamLabel} — Player</span>
      </div>

      {/* Scrollable formation + subs area */}
      <div style={S.scroll}>

        {/* Formation rows */}
        {FORMATION_ROWS.map((indices, ri) => (
          <div key={ri} style={S.formRow}>
            {indices.map((idx) => {
              const p = starters[idx];
              if (!p) return null;
              return (
                <button key={p.id} style={S.playerBtn} onClick={() => tap(p)}>
                  <span style={S.number}>{p.number}</span>
                  {p.name.trim()
                    ? <span style={S.name}>{p.name.trim()}</span>
                    : <span style={S.pos}>{p.position ?? ""}</span>
                  }
                </button>
              );
            })}
          </div>
        ))}

        {/* Substitutes */}
        {subs.length > 0 && (
          <>
            <div style={S.subsDivider}>Subs</div>
            <div style={S.subsRow}>
              {subs.map((p) => (
                <button key={p.id} style={S.subBtn} onClick={() => tap(p)}>
                  <span style={S.number}>{p.number}</span>
                  {p.name.trim()
                    ? <span style={S.name}>{p.name.trim()}</span>
                    : <span style={S.pos}>{p.position ?? "SUB"}</span>
                  }
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* NULL — no player */}
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

  // ── Formation ──────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "10px 8px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    alignItems: "center",
  },
  formRow: {
    display: "flex",
    justifyContent: "center",
    gap: 6,
  },
  playerBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    cursor: "pointer",
    outline: "none",
    width: 62,
    minHeight: 54,
    padding: "6px 4px 5px",
    WebkitTapHighlightColor: "transparent",
    flexShrink: 0,
  },

  // ── Subs ───────────────────────────────────────────────────────────────────
  subsDivider: {
    width: "100%",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#6e7681",
    textAlign: "center" as const,
    padding: "4px 0 2px",
    borderTop: "1px solid #21262d",
    marginTop: 2,
  },
  subsRow: {
    display: "flex",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  subBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 8,
    cursor: "pointer",
    outline: "none",
    width: 58,
    minHeight: 48,
    padding: "5px 4px 4px",
    WebkitTapHighlightColor: "transparent",
    flexShrink: 0,
  },

  // ── Shared text ────────────────────────────────────────────────────────────
  number: {
    fontSize: 17,
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
    maxWidth: 56,
    lineHeight: "1.2",
  },
  pos: {
    fontSize: 9,
    color: "#6e7681",
    marginTop: 2,
    textAlign: "center" as const,
    whiteSpace: "nowrap" as const,
    lineHeight: "1.2",
  },

  // ── NULL button ────────────────────────────────────────────────────────────
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
