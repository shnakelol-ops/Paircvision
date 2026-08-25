import type { CSSProperties } from "react";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";
import { ProTaggerMiniJersey } from "./ProTaggerMiniJersey";
import type { DisciplinePlayerStatus } from "./pro-tagger-discipline";

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
  secondaryColour?: string;
  onSelect: (player: SelectedPlayer | null) => void;
  /**
   * Per-player Discipline status (derived from event history — see
   * pro-tagger-discipline.ts), keyed by playerId. Applied to every picker
   * usage so all Event Stats pickers behave consistently: RED disables the
   * tile (number stays visible, still identifiable); SIN_BIN marks the tile
   * but leaves it fully selectable. Omit for pickers where this doesn't
   * apply — every tile then renders normally.
   */
  disciplineStatus?: ReadonlyMap<string, DisciplinePlayerStatus>;
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

export function ProTaggerPlayerPicker({ teamLabel, squad, squadId, teamColour, secondaryColour, onSelect, disciplineStatus }: Props) {
  const colour = teamColour ?? "#238636";

  // Active players in formation slots (1–15).
  // isActive === false means subbed off — excluded entirely.
  function findSlot(slot: number): ProTaggerSquadPlayer | null {
    return squad.find((p) => p.activeSlot === slot && p.isActive !== false) ?? null;
  }

  // Active bench players — on the squad but not yet in a formation slot.
  const bench = squad.filter((p) => p.isActive !== false && p.activeSlot === undefined);

  function tap(p: ProTaggerSquadPlayer) {
    if (disciplineStatus?.get(p.id) === "RED") return; // sent off — not selectable
    onSelect({
      playerId:     p.id,
      playerName:   p.name.trim() || `#${p.number}`,
      playerNumber: p.number,
      squadId,
    });
  }

  // Status label always replaces the name/position line (never colour alone)
  // and the tile is disabled only for RED — SIN_BIN stays fully tappable.
  function renderTileContent(p: ProTaggerSquadPlayer, fallbackPos: string) {
    const status = disciplineStatus?.get(p.id);
    return (
      <>
        <span style={S.number}>{p.number}</span>
        {status === "RED" ? (
          <span style={S.statusRed}>RED</span>
        ) : status === "SIN_BIN" ? (
          <span style={S.statusSinBin}>SIN BIN</span>
        ) : p.name.trim() ? (
          <span style={S.name}>{p.name.trim()}</span>
        ) : (
          <span style={S.pos}>{p.position ?? fallbackPos}</span>
        )}
      </>
    );
  }

  return (
    <div style={S.shell}>
      {/* Header */}
      <div style={{ ...S.header, borderLeft: `3px solid ${colour}` }}>
        <ProTaggerMiniJersey primary={colour} secondary={secondaryColour ?? "#ffffff"} size={18} />
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
              const isRed = disciplineStatus?.get(p.id) === "RED";
              return (
                <button
                  key={slot}
                  disabled={isRed}
                  style={{
                    ...S.playerBtn,
                    border: `1px solid ${colour}`,
                    ...(isRed ? S.playerBtnRed : {}),
                  }}
                  onClick={() => tap(p)}
                >
                  {renderTileContent(p, "")}
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
              {bench.map((p) => {
                const isRed = disciplineStatus?.get(p.id) === "RED";
                return (
                  <button
                    key={p.id}
                    disabled={isRed}
                    style={{ ...S.subBtn, ...(isRed ? S.playerBtnRed : {}) }}
                    onClick={() => tap(p)}
                  >
                    {renderTileContent(p, "SUB")}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Explicit no-player selection — still resolves to onSelect(null). */}
      <div style={S.nullRow}>
        <button style={S.nullBtn} onClick={() => onSelect(null)}>
          No player / Unknown
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
  // Applied on top of playerBtn/subBtn for a Red-Carded player — visibly
  // disabled (dimmed, no pointer cursor) but the tile and number stay put;
  // never removed from the grid. The "RED" text label (not colour alone) is
  // the actual signal — see statusRed below.
  playerBtnRed: {
    opacity: 0.45,
    cursor: "default",
    borderColor: "#6e7681",
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

  // ── Discipline status labels — text, never colour alone ─────────────────────
  statusRed: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.04em",
    color: "#f85149",
    marginTop: 2,
    textAlign: "center" as const,
    whiteSpace: "nowrap" as const,
    lineHeight: "1.2",
  },
  statusSinBin: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.02em",
    color: "#f0883e",
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
