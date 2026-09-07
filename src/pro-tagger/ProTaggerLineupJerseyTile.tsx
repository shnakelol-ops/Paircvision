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

// Read-only jersey-first tile for the Squad Setup lineup summary
// (ProTaggerLineupFormation). Composes the existing ProTaggerMiniJersey
// rather than duplicating jersey art — this file only adds the number/name
// overlay. No taps, no editing: player names are still changed exclusively
// through ProTaggerSquadScreen's existing "Edit Player Names" list, which
// this tile never reads from or writes to.
//
// Visual hierarchy is jersey -> number -> name, matching a real team sheet:
// the jersey is the dominant shape (enlarged here, not shrunk to make room
// for a badge), and the number sits directly on the jersey as bold,
// high-contrast text — a white fill with a dark outline, the standard way a
// printed jersey number stays legible against any shirt colour, not a
// solid circular badge sitting on top of it (that read as a Tactical
// Slate/player-token marker, not a team sheet, and is deliberately not
// used here).
export function ProTaggerLineupJerseyTile({ player, primary, secondary, size = 40 }: Props) {
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
  // Font scales with the jersey so the number stays dominant and legible at
  // every size this tile is actually rendered at (starters vs. the smaller
  // subs row) — verified against 1, 8, 10, 11, 15, 27.
  const numberFontSize = Math.max(15, Math.round(size * 0.5));
  return (
    <div style={S.tile}>
      <div style={{ ...S.jerseyWrap, width: size }}>
        <ProTaggerMiniJersey primary={primary} secondary={secondary} size={size} />
        <span style={{ ...S.numberText, fontSize: numberFontSize }}>{player.number}</span>
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
    gap: 3,
    width: 76,
    flexShrink: 0,
  },
  jerseyWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // Bold white number with a dark outline (WebkitTextStroke, with a
  // multi-directional text-shadow fallback for browsers without stroke
  // support) — no shape behind it. This is what keeps the number
  // high-contrast against any user-chosen jersey primary colour without
  // covering the jersey itself the way a solid badge did.
  numberText: {
    position: "absolute",
    top: "44%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontWeight: 900,
    color: "#ffffff",
    WebkitTextStroke: "1.5px rgba(6, 10, 16, 0.92)",
    textShadow: [
      "0 1px 2px rgba(0,0,0,0.65)",
      "-1px -1px 0 rgba(6,10,16,0.85)",
      "1px -1px 0 rgba(6,10,16,0.85)",
      "-1px 1px 0 rgba(6,10,16,0.85)",
      "1px 1px 0 rgba(6,10,16,0.85)",
    ].join(", "),
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.5px",
    lineHeight: 1,
    pointerEvents: "none",
  },
  name: {
    fontSize: 10,
    fontWeight: 600,
    color: "#dce8f4",
    textAlign: "center" as const,
    maxWidth: 72,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.15,
  },
};
