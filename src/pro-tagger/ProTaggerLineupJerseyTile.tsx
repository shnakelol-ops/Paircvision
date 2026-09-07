import type { CSSProperties } from "react";
import { ProTaggerMiniJersey } from "./ProTaggerMiniJersey";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";

interface Props {
  /** Null renders a dimmed, numberless "ghost" jersey — a formation slot with
   *  no roster entry to fill it (fewer than 15 players on this squad). */
  player: ProTaggerSquadPlayer | null;
  primary: string;
  secondary: string;
  size?: number;
}

// Read-only jersey + number + name tile for the Squad Setup lineup summary
// (ProTaggerLineupFormation). Composes the existing ProTaggerMiniJersey
// rather than duplicating jersey art — this file only adds the number/name
// overlay. No taps, no editing: player names are still changed exclusively
// through ProTaggerSquadScreen's existing "Edit Player Names" list, which
// this tile never reads from or writes to.
export function ProTaggerLineupJerseyTile({ player, primary, secondary, size = 34 }: Props) {
  if (!player) {
    return (
      <div style={S.tile}>
        <div style={{ ...S.jerseyWrap, width: size }}>
          <ProTaggerMiniJersey primary="#17324a" secondary="#1c3a52" size={size} />
        </div>
      </div>
    );
  }

  const name = player.name.trim();
  return (
    <div style={S.tile}>
      <div style={{ ...S.jerseyWrap, width: size }}>
        <ProTaggerMiniJersey primary={primary} secondary={secondary} size={size} />
        <span style={S.number}>{player.number}</span>
      </div>
      {name && <span style={S.name}>{name}</span>}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  tile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    width: 46,
    flexShrink: 0,
  },
  jerseyWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  number: {
    position: "absolute",
    top: "44%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 11,
    fontWeight: 800,
    color: "#ffffff",
    textShadow: "0 1px 2px rgba(0,0,0,0.55)",
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
  },
  name: {
    fontSize: 10,
    fontWeight: 600,
    color: "#dce8f4",
    textAlign: "center" as const,
    maxWidth: 48,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.15,
  },
};
