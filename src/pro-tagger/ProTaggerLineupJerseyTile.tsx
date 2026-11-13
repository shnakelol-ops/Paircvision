import type { CSSProperties } from "react";
import { ProTaggerJersey } from "./ProTaggerJersey";
import type { JerseyKit } from "./jersey-kit";
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
  /**
   * Jersey Designer V2 kit (pattern, sleeve and collar colour). Omitted or
   * invalid renders DEFAULT_JERSEY_KIT — see jersey-kit.ts.
   */
  kit?: JerseyKit | null;
}

// Read-only jersey-first player marker for the Squad Setup lineup summary
// (ProTaggerLineupFormation) and the Live Player Picker: the shared
// ProTaggerJersey, the player's number centred directly below it, then the
// optional name plate. No taps, no editing here: the picker wraps the whole
// marker in one button, so jersey and number select together. Player names
// are still changed only through ProTaggerSquadScreen's "Edit Player Names".
//
// Visual hierarchy is jersey -> number -> name, matching a real team sheet.
// The number sits on the pitch, not on the shirt, so it reads the same on
// every kit and pattern: bold white with a subtle dark outline, the one
// treatment for Squads and the picker alike. No badge or shape behind it
// (a badge read as a Tactical Slate player token, not a team sheet).
export function ProTaggerLineupJerseyTile({ player, primary, secondary, size = 40, numberFontSize, kit }: Props) {
  if (!player) {
    return (
      <div style={S.tile}>
        <div style={{ ...S.jerseyWrap, width: size }}>
          <ProTaggerJersey primary="#17324a" secondary="#1c3a52" size={size} />
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
        <ProTaggerJersey primary={primary} secondary={secondary} kit={kit} size={size} />
      </div>
      <span style={{ ...S.numberText, fontSize: resolvedNumberFontSize }}>{player.number}</span>
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
  // Player number, centred below the jersey. Bold white with a subtle dark
  // outline (a thin stroke plus one soft shadow) so it reads on the green
  // pitch and on the picker's dark bench area alike, without the heavier
  // multi-layer outline an on-shirt number needed.
  numberText: {
    display: "block",
    fontWeight: 900,
    color: "#ffffff",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.3px",
    lineHeight: 1,
    textAlign: "center" as const,
    WebkitTextStroke: "0.5px rgba(6, 10, 16, 0.85)",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.7)",
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
