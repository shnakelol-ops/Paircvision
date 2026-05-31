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
  teamColour?: string;
  onSelect: (player: SelectedPlayer | null) => void;
}

// GAA formation: 1-based active slot numbers matching LiveScreen initialisation.
const FORMATION_ROWS: readonly (readonly number[])[] = [
  [1],            // #1  GK
  [2, 3, 4],      // #2  #3  #4  (RB FB LB)
  [5, 6, 7],      // #5  #6  #7  (RHB CHB LHB)
  [8, 9],         // #8  #9      (MF MF)
  [10, 11, 12],   // #10 #11 #12 (RHF CHF LHF)
  [13, 14, 15],   // #13 #14 #15 (RF FF LF)
];

export function ProTaggerPlayerPicker({ teamLabel, squad, squadId, teamColour, onSelect }: Props) {
  const colour = teamColour ?? "#238636";

  // Active players in formation slots (1–15).
  // isActive === false means subbed off — excluded entirely.
  function findSlot(slot: number): ProTaggerSquadPlayer | null {
    return squad.find((p) => p.activeSlot === slot && p.isActive !== false) ?? null;
  }

  // Active bench players — on the squad but not yet in a formation slot.
  const bench = squad.filter((p) => p.isActive !== false && p.activeSlot === undefined);

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
      <div style={{ ...S.header, borderLeft: `3px solid ${colour}` }}>
        <span style={S.title}>{teamLabel} — Player</span>
      </div>

      {/* Scrollable formation + bench */}
      <div style={S.scroll}>

        {/* Formation rows — slot-based */}
        {FORMATION_ROWS.map((slots, ri) => (
          <div key={ri} style={S.formRow}>
            {slots.map((slot) => {
              const p = findSlot(slot);
              if (!p) return null;
              return (
                <button
                  key={slot}
                  style={{ ...S.playerBtn, border: `1px solid ${colour}` }}
                  onClick={() => tap(p)}
                >
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

        {/* Bench — active but not in formation */}
        {bench.length > 0 && (
          <>
            <div style={S.subsDivider}>Bench</div>
            <div style={S.subsRow}>
              {bench.map((p) => (
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
    borderRadius: 8,
    cursor: "pointer",
    outline: "none",
    width: 62,
    minHeight: 54,
    padding: "6px 4px 5px",
    WebkitTapHighlightColor: "transparent",
    flexShrink: 0,
  },

  // ── Bench ──────────────────────────────────────────────────────────────────
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
