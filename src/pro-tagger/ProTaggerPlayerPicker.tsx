import type { CSSProperties } from "react";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";
import { ProTaggerMiniJersey } from "./ProTaggerMiniJersey";
import { ProTaggerLineupJerseyTile } from "./ProTaggerLineupJerseyTile";
import { ProTaggerLineupPitchBackground } from "./ProTaggerLineupPitchBackground";
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

// Visual language alignment with the approved Squad Setup lineup tile
// (ProTaggerLineupFormation.tsx) — same jersey/number sizes, so the live
// picker and pre-match team sheet read as one consistent PáircVision
// player marker rather than two different systems.
const FORMATION_JERSEY_SIZE = 26;
const FORMATION_NUMBER_FONT_SIZE = 13;
const BENCH_JERSEY_SIZE = 22;
const BENCH_NUMBER_FONT_SIZE = 13;

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

  // Visual language alignment: jersey + centred number + optional compact
  // name plate (ProTaggerLineupJerseyTile — the same presentational tile
  // Squad Setup's approved lineup uses), no position abbreviations, no
  // rectangular tile card. Status label still always replaces the name
  // line (never colour alone) and the tile is disabled only for RED —
  // SIN_BIN stays fully tappable; that rule is unchanged, just applied to
  // the new tile instead of the old inline number/name/position stack.
  function renderTile(p: ProTaggerSquadPlayer, size: number, numberFontSize: number) {
    const status = disciplineStatus?.get(p.id);
    // Suppress the tile's own name plate when a status label must show
    // instead — ProTaggerLineupJerseyTile only renders a name when one is
    // present, so a blank name here reproduces "no placeholder" for free.
    const tilePlayer = status ? { ...p, name: "" } : p;
    return (
      <>
        <ProTaggerLineupJerseyTile
          player={tilePlayer} primary={colour} secondary={secondaryColour ?? "#ffffff"}
          size={size} numberFontSize={numberFontSize}
        />
        {status === "RED" && <span style={S.statusRed}>RED</span>}
        {status === "SIN_BIN" && <span style={S.statusSinBin}>SIN BIN</span>}
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

        {/* Static GAA pitch behind the formation only — spatial reference for
            "these are the 15 players in their formation", not a redesign of
            the capture flow. Reuses ProTaggerLineupPitchBackground exactly as
            Squad Setup does (same component, unmodified): it takes no props,
            has no pointer handlers, no coordinate/orientation/attacking-
            direction logic, and is not ProTaggerPitchView.tsx (the live
            capture pitch) — this is the dumb, purely decorative reproduction.
            pointerEvents: "none" plus sitting behind the formation layer in
            the stacking order (zIndex 0 vs 1) means it can never intercept a
            player tap. The picker's own additional opacity dims it further
            than the Squad Setup rendering — a busier, smaller live-capture
            screen needs the jersey to stay dominant regardless of team
            colour, without touching the shared component or team colours. */}
        <div style={S.pitchArea}>
          <div style={S.pitchLayer} aria-hidden="true">
            <ProTaggerLineupPitchBackground />
          </div>
          <div style={S.formationRows}>
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
                      style={{ ...S.playerBtn, ...(isRed ? S.playerBtnRed : {}) }}
                      onClick={() => tap(p)}
                    >
                      {renderTile(p, FORMATION_JERSEY_SIZE, FORMATION_NUMBER_FONT_SIZE)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

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
                    {renderTile(p, BENCH_JERSEY_SIZE, BENCH_NUMBER_FONT_SIZE)}
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
  // Wraps only the formation-rows block (not the bench, not the header, not
  // No player/Unknown) so the pitch belongs strictly to the 15-slot canvas.
  // Purely a stacking/positioning container — no size, gap, or alignment
  // change versus how these rows sat directly in .scroll before.
  pitchArea: {
    position: "relative",
    width: "100%",
  },
  // Decorative pitch layer, absolutely filling pitchArea behind the
  // formation. pointerEvents: "none" plus zIndex 0 (below formationRows'
  // zIndex 1) is a double guarantee it can never intercept a player tap.
  // The extra opacity here is picker-local — ProTaggerLineupPitchBackground
  // itself is unmodified and untouched by this change.
  pitchLayer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: 0.55,
    zIndex: 0,
  },
  // Same flex/gap/alignment the rows previously had as direct children of
  // .scroll — formation row layout, spacing, and order are unchanged, only
  // now stacked above the pitch layer instead of directly in .scroll.
  formationRows: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
  },
  // Visual language alignment: a large, transparent tap target — no card
  // background/border around the player, matching Squad Setup's "jersey is
  // the marker, not a rectangle" treatment (ProTaggerLineupJerseyTile is
  // 76px wide regardless of jersey size, so this stays at least as wide as
  // that; height comfortably fits jersey + optional name plate). The hit
  // area is intentionally larger than the visible jersey — tapping near it,
  // not precisely on the shirt, must still register.
  playerBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    outline: "none",
    width: 80,
    minHeight: 64,
    padding: "4px 2px",
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
    background: "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    outline: "none",
    width: 80,
    minHeight: 58,
    padding: "4px 2px",
    WebkitTapHighlightColor: "transparent",
    flexShrink: 0,
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
