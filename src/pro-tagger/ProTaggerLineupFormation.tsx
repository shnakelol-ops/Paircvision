import type { CSSProperties } from "react";
import { ProTaggerLineupJerseyTile } from "./ProTaggerLineupJerseyTile";
import { ProTaggerLineupPitchBackground } from "./ProTaggerLineupPitchBackground";
import { LINEUP_FORMATION_POSITIONS, LINEUP_PITCH_VIEWBOX } from "./pro-tagger-lineup-geometry";
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
// Event Stats visual lineup audit), now rendered over a decorative static
// pitch background (ProTaggerLineupPitchBackground) instead of a plain grid.
// Presentation only: no tap handlers, no drag/reassignment, no formation
// editing, and the pitch itself carries no coordinate/orientation semantics
// — see that component's header. Player names are still edited exclusively
// through ProTaggerSquadScreen's existing "Edit Player Names" list — this
// component never writes to squad state.
//
// Formation slot positions come from pro-tagger-lineup-geometry.ts (plain
// data, no React) rather than being computed here, so a future non-React
// renderer (e.g. a canvas-based share-card export) can lay out the identical
// team sheet from that one shared source of truth — see that file's header.
export function ProTaggerLineupFormation({ players, primary, secondary }: Props) {
  const { starters, subs } = deriveLineupSlots(players);

  return (
    <div style={S.wrap}>
      <div
        style={{
          ...S.pitchBox,
          aspectRatio: `${LINEUP_PITCH_VIEWBOX.w} / ${LINEUP_PITCH_VIEWBOX.h}`,
        }}
      >
        <ProTaggerLineupPitchBackground />
        {Object.entries(LINEUP_FORMATION_POSITIONS).map(([slotKey, pos]) => {
          const slot = Number(slotKey);
          const p = starters[slot - 1] ?? null;
          return (
            <div
              key={p?.id ?? `empty-${slot}`}
              style={{ ...S.slot, left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <ProTaggerLineupJerseyTile player={p} primary={primary} secondary={secondary} size={30} />
            </div>
          );
        })}
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
  pitchBox: {
    position: "relative",
    width: "100%",
    maxWidth: 320,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #17324a",
  },
  slot: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
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
