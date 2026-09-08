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
  /**
   * Pins the number's font size independent of `size`. Use this whenever the
   * jersey is tuned smaller (or larger) but the number must NOT scale with
   * it — the visual tuning pass shrank the Starting 15 jersey ~20% while
   * explicitly keeping the number at its prior, already-verified size (see
   * ProTaggerLineupFormation.tsx). Falls back to the size-proportional
   * default when omitted.
   */
  numberFontSize?: number;
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
export function ProTaggerLineupJerseyTile({ player, primary, secondary, size = 40, numberFontSize }: Props) {
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
  // Font scales with the jersey by default so the number stays dominant and
  // legible at every size this tile could be rendered at — verified against
  // 1, 8, 10, 11, 15, 27. Callers that shrink the jersey without wanting the
  // number to shrink with it (see ProTaggerLineupFormation.tsx) pass an
  // explicit numberFontSize instead, which wins over this default.
  const resolvedNumberFontSize = numberFontSize ?? Math.max(15, Math.round(size * 0.5));
  return (
    <div style={S.tile}>
      <div style={{ ...S.jerseyWrap, width: size }}>
        <ProTaggerMiniJersey primary={primary} secondary={secondary} size={size} />
        <span style={{ ...S.numberText, fontSize: resolvedNumberFontSize }}>{player.number}</span>
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
  // A soft neutral halo behind the jersey silhouette — separates it from
  // the pitch behind it (the pitch's grass/line colours vary in intensity
  // under the jersey) without drawing any shape, badge, or card. This is
  // the simplest contrast fix: one fixed stacked drop-shadow, the same for
  // every team colour, not a per-shirt-colour computed treatment.
  jerseyWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 0 2px rgba(4, 8, 14, 0.55)) drop-shadow(0 1px 3px rgba(4, 8, 14, 0.5))",
  },
  // Bold white number with a dark outline (WebkitTextStroke, with a
  // multi-directional text-shadow fallback for browsers without stroke
  // support) — no shape behind it. This is what keeps the number
  // high-contrast against any user-chosen jersey primary colour without
  // covering the jersey itself the way a solid badge did.
  // Outline thinned again (1px -> 0.75px) alongside the smaller ~13px
  // number size — a heavy outline started to read as a solid shape rather
  // than text at this size, overpowering the jersey underneath it.
  // top moved down from 44% to 56% (of the jersey's own rendered height) to
  // pull the number off the collar/shoulders and into the torso — the same
  // one rule for every jersey size and every number, one or two digits.
  numberText: {
    position: "absolute",
    top: "56%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontWeight: 900,
    color: "#ffffff",
    WebkitTextStroke: "0.75px rgba(6, 10, 16, 0.9)",
    textShadow: [
      "0 1px 1px rgba(0,0,0,0.6)",
      "-1px -1px 0 rgba(6,10,16,0.8)",
      "1px -1px 0 rgba(6,10,16,0.8)",
      "-1px 1px 0 rgba(6,10,16,0.8)",
      "1px 1px 0 rgba(6,10,16,0.8)",
    ].join(", "),
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.3px",
    lineHeight: 1,
    pointerEvents: "none",
  },
  // A compact PáircVision name plate — a translucent navy surface just big
  // enough for the text, not a card: no border, no glow, restrained corner
  // radius. Only rendered when the player has a name (see the `name &&`
  // guard above); a blank name renders no plate at all.
  name: {
    fontSize: 9,
    fontWeight: 700,
    color: "#e7f0f8",
    textAlign: "center" as const,
    maxWidth: 70,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.2,
    background: "rgba(8, 20, 34, 0.55)",
    borderRadius: 4,
    padding: "1px 6px",
  },
};
