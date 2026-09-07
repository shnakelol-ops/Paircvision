import type { CSSProperties } from "react";
import { ProTaggerLineupJerseyTile } from "./ProTaggerLineupJerseyTile";
import { FORMATION_ROWS } from "./ProTaggerPlayerPicker";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";

interface Props {
  players: readonly ProTaggerSquadPlayer[];
  primary: string;
  secondary: string;
}

export type LineupSlots = {
  starters: ProTaggerSquadPlayer[];
  subs: ProTaggerSquadPlayer[];
};

/**
 * Splits a roster into the formation's starting 15 and substitutes for the
 * read-only Squad Setup lineup summary — see the Event Stats visual lineup
 * audit. Ranked by jersey number rather than exact number value or raw
 * array order: the lowest 15 by sort rank fill the fixed formation (slot N
 * gets the Nth-lowest number), everything else is a substitute in ascending
 * number order. This is robust against a gap or duplicate in `number` (never
 * throws, never leaves two slots claiming the same player) without needing
 * an exact number-to-slot match, which would leave blank slots for data
 * that doesn't happen to contain literally 1-15.
 *
 * Read-only: never mutates `number`, `position`, `isActive`, or
 * `activeSlot` — those remain exactly what ProTaggerLiveScreen's own
 * initSquad() derives at match start, untouched by this summary.
 */
export function deriveLineupSlots(players: readonly ProTaggerSquadPlayer[]): LineupSlots {
  const sorted = [...players].sort((a, b) => a.number - b.number);
  return { starters: sorted.slice(0, 15), subs: sorted.slice(15) };
}

// Read-only visual team-sheet summary for Squad Setup (Option A from the
// Event Stats visual lineup audit). Presentation only: no tap handlers, no
// drag/reassignment, no formation editing. Player names are still edited
// exclusively through ProTaggerSquadScreen's existing "Edit Player Names"
// list — this component never writes to squad state.
export function ProTaggerLineupFormation({ players, primary, secondary }: Props) {
  const { starters, subs } = deriveLineupSlots(players);

  return (
    <div style={S.wrap}>
      <div style={S.formation}>
        {FORMATION_ROWS.map((slots, ri) => (
          <div key={ri} style={S.row}>
            {slots.map((slot) => {
              const p = starters[slot - 1] ?? null;
              return (
                <ProTaggerLineupJerseyTile
                  key={p?.id ?? `empty-${slot}`}
                  player={p}
                  primary={primary}
                  secondary={secondary}
                />
              );
            })}
          </div>
        ))}
      </div>

      {subs.length > 0 && (
        <>
          <div style={S.subsDivider}>Substitutes</div>
          <div style={S.subsRow}>
            {subs.map((p) => (
              <ProTaggerLineupJerseyTile key={p.id} player={p} primary={primary} secondary={secondary} size={28} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
    marginBottom: 10,
    borderBottom: "1px solid #17324a",
  },
  formation: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  row: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  subsDivider: {
    alignSelf: "flex-start",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#7a95ad",
    marginTop: 4,
  },
  subsRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    justifyContent: "flex-start",
    gap: 8,
    width: "100%",
  },
};
