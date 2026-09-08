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
  /**
   * Swaps the default heavier outline (0.75px stroke + a 5-layer shadow
   * stack: four hard 1px-offset diagonal copies plus one blurred shadow)
   * for a lighter, single-shadow treatment with a thinner stroke. At very
   * small sizes (~13px, e.g. the live player picker) the default stack's
   * combined ink is close in width to a thin numeral's own stroke (the "1"
   * in 10/11/13/14/15 especially), reading as soft/blurry rather than
   * crisp. Omit (or false) to keep today's exact default treatment —
   * Squad Setup's lineup tile passes nothing here and is unaffected.
   */
  numberCrisp?: boolean;
  /**
   * Live-tagging jersey experiment: renders a simplified jersey mark
   * instead of ProTaggerMiniJersey — primary-coloured torso, secondary-
   * coloured sleeves, NO secondary chest stripe, NO collar accent — plus a
   * minimal number treatment (no stroke, one soft shadow) instead of
   * numberCrisp/numberOutlineDefault. Built locally in this file rather
   * than by modifying ProTaggerMiniJersey.tsx, which other screens (Squad
   * Setup's Team Colours preview, its own lineup jerseys) still use
   * unchanged. Omit (or false) to keep today's default jersey and number
   * treatment exactly as-is — Squad Setup passes nothing here and is
   * unaffected. See LivePickerJerseyMark below for the exact geometry.
   */
  livePicker?: boolean;
}

// Live-tagging jersey experiment (see the `livePicker` prop above): the
// SAME body+sleeve silhouette ProTaggerMiniJersey draws — its single path
// "M4,21 L4,8 L0,8 L0,4 L4,2 L7,5 L10,8 L13,5 L16,2 L20,4 L20,8 L16,8
// L16,21 Z" — decomposed here into three sub-paths (two sleeves, one
// torso) that share exact boundary coordinates with each other and with
// that original outline, so the outer silhouette/size is pixel-identical;
// only the internal fill split changes (secondary sleeves instead of one
// primary body, no chest-stripe rect, no collar triangle). Deliberately no
// stroke on any piece — a raglan-seam outline along the new internal sleeve
// edges would read as unrequested kit detail; this is meant to stay a
// plain information marker.
function LivePickerJerseyMark({ primary, secondary, size }: { primary: string; secondary: string; size: number }) {
  const h = Math.round((size * 22) / 20);
  return (
    <svg viewBox="0 0 20 22" width={size} height={h} style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      <path d="M4,8 L0,8 L0,4 L4,2 L7,5 Z" fill={secondary} />
      <path d="M16,8 L20,8 L20,4 L16,2 L13,5 Z" fill={secondary} />
      <path d="M4,21 L4,8 L7,5 L10,8 L13,5 L16,8 L16,21 Z" fill={primary} />
    </svg>
  );
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
export function ProTaggerLineupJerseyTile({ player, primary, secondary, size = 40, numberFontSize, numberCrisp, livePicker }: Props) {
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
  const outlineStyle: CSSProperties = livePicker
    ? S.numberOutlineLivePicker
    : numberCrisp
      ? S.numberOutlineCrisp
      : S.numberOutlineDefault;
  return (
    <div style={S.tile}>
      <div style={{ ...S.jerseyWrap, width: size }}>
        {livePicker ? (
          <LivePickerJerseyMark primary={primary} secondary={secondary} size={size} />
        ) : (
          <ProTaggerMiniJersey primary={primary} secondary={secondary} size={size} />
        )}
        <span style={{ ...S.numberText, ...outlineStyle, fontSize: resolvedNumberFontSize }}>{player.number}</span>
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
  // Bold white number — no shape behind it, just an outline (either variant
  // below) to keep it high-contrast against any user-chosen jersey primary
  // colour without covering the jersey itself the way a solid badge did.
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
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.3px",
    lineHeight: 1,
    pointerEvents: "none",
  },
  // Default outline (WebkitTextStroke, with a multi-directional text-shadow
  // fallback for browsers without stroke support) — unchanged since the
  // last tuning pass. Still used everywhere numberCrisp isn't explicitly
  // requested, so Squad Setup's lineup tile renders byte-identically.
  numberOutlineDefault: {
    WebkitTextStroke: "0.75px rgba(6, 10, 16, 0.9)",
    textShadow: [
      "0 1px 1px rgba(0,0,0,0.6)",
      "-1px -1px 0 rgba(6,10,16,0.8)",
      "1px -1px 0 rgba(6,10,16,0.8)",
      "-1px 1px 0 rgba(6,10,16,0.8)",
      "1px 1px 0 rgba(6,10,16,0.8)",
    ].join(", "),
  },
  // Lighter outline for very small/dense renderings (the live player
  // picker): a thinner stroke and a single, tighter shadow instead of the
  // default's four stacked hard-offset copies plus a blurred one. Modern
  // Android browsers render -webkit-text-stroke as a crisp vector outline,
  // so dropping the redundant shadow stack (built as a fallback for
  // browsers without stroke support) removes ink that was making thin
  // digits like the "1" in 10/11/13/14/15 look like it was being eaten by
  // its own outline, without losing edge contrast entirely.
  numberOutlineCrisp: {
    WebkitTextStroke: "0.5px rgba(6, 10, 16, 0.85)",
    textShadow: "0 1px 1px rgba(0,0,0,0.5)",
  },
  // Live-tagging jersey experiment: no stroke at all — a clean white
  // number with only one soft shadow for baseline contrast against an
  // arbitrary (including pale) primary jersey colour. This is testing
  // whether the uninterrupted primary chest plus a clean number (no
  // outline "eating" the glyph) reads better than either outline variant
  // above at live-picker scale.
  numberOutlineLivePicker: {
    textShadow: "0 1px 2px rgba(0,0,0,0.55)",
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
