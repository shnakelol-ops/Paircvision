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
  // Badge scales with the jersey rather than using a fixed size, so the
  // number stays the dominant, legible element at every tile size this
  // component is asked to render (starters vs. the smaller subs row).
  // Floors guard 2-digit numbers (tested against 1, 8, 10, 11, 15, 27) at
  // small sizes; a solid dark badge (not text-shadow alone) guarantees
  // contrast regardless of the jersey's own primary colour.
  const badgeSize = Math.max(18, Math.round(size * 0.68));
  const numberFontSize = Math.max(10, Math.round(size * 0.38));
  return (
    <div style={S.tile}>
      <div style={{ ...S.jerseyWrap, width: size }}>
        <ProTaggerMiniJersey primary={primary} secondary={secondary} size={size} />
        <div style={{ ...S.numberBadge, width: badgeSize, height: badgeSize }}>
          <span style={{ ...S.numberText, fontSize: numberFontSize }}>{player.number}</span>
        </div>
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
    width: 72,
    flexShrink: 0,
  },
  jerseyWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // A solid, high-contrast circular badge behind the number — dominant on
  // the jersey and legible against any user-chosen jersey colour, unlike
  // text-shadow-only overlays which can wash out on light/pale primaries.
  numberBadge: {
    position: "absolute",
    top: "44%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    background: "rgba(5, 12, 20, 0.85)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  numberText: {
    fontWeight: 800,
    color: "#ffffff",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.3px",
    lineHeight: 1,
  },
  name: {
    fontSize: 10,
    fontWeight: 600,
    color: "#dce8f4",
    textAlign: "center" as const,
    maxWidth: 68,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.15,
  },
};
