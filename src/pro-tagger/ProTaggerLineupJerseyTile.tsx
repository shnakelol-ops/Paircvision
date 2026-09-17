import type { CSSProperties } from "react";
import type { ProTaggerJerseyStyle, ProTaggerSquadPlayer } from "./pro-tagger-session";

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
   * Number treatment ONLY (never jersey shape — see jerseyStyle below for
   * that): swaps in a minimal outline (no stroke, one soft shadow) instead
   * of numberCrisp/numberOutlineDefault, tuned for the live player picker's
   * small/dense tiles. Omit (or false) to keep today's default number
   * treatment exactly as-is — Squad Setup passes nothing here and is
   * unaffected.
   */
  livePicker?: boolean;
  /**
   * Jersey SHAPE only — where the secondary team colour appears: "chest"
   * (ChestJerseyMark below, a secondary chest band), "sleeves"
   * (LivePickerJerseyMark below, a secondary sleeves-only look), or "collar"
   * (CollarJerseyMark below, a secondary collar/neck detail only). All three
   * are built from the one shared JERSEY_BODY_PATH silhouette — see its own
   * comment. Defaults to "chest" when omitted, matching every caller's
   * behaviour before this prop existed. Deliberately orthogonal to
   * `livePicker`/`numberCrisp`, which control the NUMBER treatment only — a
   * squad can pick any jersey shape while the live picker's own crisp number
   * treatment stays exactly as it was. See pro-tagger-session.ts's
   * ProTaggerJerseyStyle for the full rationale.
   */
  jerseyStyle?: ProTaggerJerseyStyle;
}

// Shared base jersey silhouette (viewBox 0 0 20 22). Sloped shoulders,
// tapered/rounded sleeve tips, a subtly tapered torso, and a smooth curved
// neckline — replacing the earlier squared-off outline, which read as too
// blocky at small sizes. Every jersey style (chest/sleeves/collar) below is
// built from this ONE path (or, for "sleeves", the exact same silhouette
// split into JERSEY_TORSO_PATH + the two JERSEY_SLEEVE_*_PATH pieces, whose
// seams share exact coordinates with this outline) — so a style only ever
// changes WHERE the secondary colour appears, never the outer shape.
const JERSEY_BODY_PATH =
  "M3.5,21 L4.5,9 Q2,8 1,6.5 Q0,5 1,3.5 Q3,2 5,3 Q7,5 10,6.5 Q13,5 15,3 Q17,2 19,3.5 Q20,5 19,6.5 Q18,8 15.5,9 L16.5,21 Z";

// The same silhouette decomposed into a torso region and two sleeve
// regions for the "sleeves" style — filling all three with the same colour
// reproduces JERSEY_BODY_PATH pixel-for-pixel (the seams — the straight L
// segments from each shoulder point down to the torso — are shared
// boundaries, not independently drawn edges).
const JERSEY_TORSO_PATH = "M3.5,21 L4.5,9 L5,3 Q7,5 10,6.5 Q13,5 15,3 L15.5,9 L16.5,21 Z";
const JERSEY_SLEEVE_LEFT_PATH = "M5,3 L4.5,9 Q2,8 1,6.5 Q0,5 1,3.5 Q3,2 5,3 Z";
const JERSEY_SLEEVE_RIGHT_PATH = "M15,3 L15.5,9 Q18,8 19,6.5 Q20,5 19,3.5 Q17,2 15,3 Z";

// A thin collar/neck band for the "collar" style, tracing the exact same
// neckline curve JERSEY_BODY_PATH draws between its two shoulder points
// (5,3) and (15,3) — the only addition the "collar" style makes to the
// shared silhouette.
const JERSEY_COLLAR_PATH = "M5,3 Q7,5 10,6.5 Q13,5 15,3 Q13,4.1 10,4.6 Q7,4.1 5,3 Z";

// ── Automatic number contrast ────────────────────────────────────────────
// The jersey number's fill colour must stay readable against whatever
// primary colour the coach picks — a white jersey with a white number is
// unreadable. This codebase already has the same relative-luminance /
// threshold approach in several PixiJS token renderers (e.g.
// src/engine/pixi/createNamePillPlayerToken.ts's own relativeLuminance +
// readableTextColor), but each of those keeps its own local copy rather
// than sharing one canonical helper, and all of them operate on packed
// 0xRRGGBB PixiJS colour numbers — a different representation from the
// "#rrggbb" hex colour STRINGS every prop in this file already uses. This
// is the same formula (standard perceived-brightness weights) and the same
// 0.58 threshold, adapted for hex strings, rather than a new algorithm.
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

// Exported for direct testing. Dark ("#0f172a" — the same readable-dark
// tone the existing pixi token helpers already use) on a light primary,
// white on a dark primary. Deterministic and pure: no canvas sampling, no
// CSS filters, no manual per-team configuration.
export function readableNumberColour(primary: string): string {
  return relativeLuminance(primary) > 0.58 ? "#0f172a" : "#ffffff";
}

// "chest" jersey style: the shared silhouette, primary-filled, with a
// secondary chest band. This owns the jerseyStyle-driven "chest" shape —
// ProTaggerMiniJersey.tsx (a similar-looking but separate decorative icon
// used elsewhere, e.g. the live picker's header and Squad Setup's colour
// preview) is untouched and unrelated, so refining this silhouette never
// has to also touch that out-of-scope icon.
function ChestJerseyMark({ primary, secondary, size }: { primary: string; secondary: string; size: number }) {
  const h = Math.round((size * 22) / 20);
  return (
    <svg viewBox="0 0 20 22" width={size} height={h} style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      <path
        d={JERSEY_BODY_PATH}
        fill={primary}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <rect x="4.5" y="11" width="11" height="3" fill={secondary} />
    </svg>
  );
}

// "sleeves" jersey style: the shared silhouette split into JERSEY_TORSO_PATH
// (primary) + the two JERSEY_SLEEVE_*_PATH pieces (secondary) — no chest
// band, no collar accent. Filling all three regions the same colour
// reproduces JERSEY_BODY_PATH exactly (see that constant's own comment),
// so this is pixel-identical in outer shape to "chest"/"collar", only the
// sleeves are secondary-filled instead of primary. Deliberately no stroke
// on the sleeve pieces — a raglan-seam outline along the internal seams
// would read as unrequested kit detail; this stays a plain colour marker.
function LivePickerJerseyMark({ primary, secondary, size }: { primary: string; secondary: string; size: number }) {
  const h = Math.round((size * 22) / 20);
  return (
    <svg viewBox="0 0 20 22" width={size} height={h} style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      <path d={JERSEY_SLEEVE_LEFT_PATH} fill={secondary} />
      <path d={JERSEY_SLEEVE_RIGHT_PATH} fill={secondary} />
      <path
        d={JERSEY_TORSO_PATH}
        fill={primary}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// "collar" jersey style: the shared silhouette (primary-filled body and
// sleeves) plus the JERSEY_COLLAR_PATH neck band (secondary) — no chest
// band, no other decorative addition.
function CollarJerseyMark({ primary, secondary, size }: { primary: string; secondary: string; size: number }) {
  const h = Math.round((size * 22) / 20);
  return (
    <svg viewBox="0 0 20 22" width={size} height={h} style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      <path
        d={JERSEY_BODY_PATH}
        fill={primary}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path d={JERSEY_COLLAR_PATH} fill={secondary} />
    </svg>
  );
}

// Resolves the shape prop to a concrete style, defaulting absent/legacy
// squads to "chest" — see ProTaggerJerseyStyle's own comment for why that's
// the correct default (it's what every squad already looked like before
// this prop existed).
function renderJerseyShape(resolvedStyle: ProTaggerJerseyStyle, primary: string, secondary: string, size: number) {
  if (resolvedStyle === "sleeves") return <LivePickerJerseyMark primary={primary} secondary={secondary} size={size} />;
  if (resolvedStyle === "collar") return <CollarJerseyMark primary={primary} secondary={secondary} size={size} />;
  return <ChestJerseyMark primary={primary} secondary={secondary} size={size} />;
}

// Read-only jersey-first tile for the Squad Setup lineup summary
// (ProTaggerLineupFormation) and the live Player Picker. Renders one of the
// three shared-silhouette jersey marks above — this file only adds the
// number/name overlay. No taps, no editing: player names are still changed
// exclusively through ProTaggerSquadScreen's existing "Edit Player Names"
// list, which this tile never reads from or writes to.
//
// Visual hierarchy is jersey -> number -> name, matching a real team sheet:
// the jersey is the dominant shape (enlarged here, not shrunk to make room
// for a badge), and the number sits directly on the jersey as bold,
// high-contrast text with a dark outline — the standard way a printed
// jersey number stays legible against any shirt colour, not a solid
// circular badge sitting on top of it (that read as a Tactical Slate/
// player-token marker, not a team sheet, and is deliberately not used
// here). The number's own FILL colour is computed from the jersey's
// primary colour (see readableNumberColour above) rather than fixed white,
// so a white/light jersey still gets a readable dark number.
export function ProTaggerLineupJerseyTile({ player, primary, secondary, size = 40, numberFontSize, numberCrisp, livePicker, jerseyStyle }: Props) {
  const resolvedJerseyStyle: ProTaggerJerseyStyle = jerseyStyle ?? "chest";

  if (!player) {
    return (
      <div style={S.tile}>
        <div style={{ ...S.jerseyWrap, width: size }}>
          {renderJerseyShape(resolvedJerseyStyle, "#17324a", "#1c3a52", size)}
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
  // Number treatment is deliberately independent of jerseyStyle — livePicker
  // and numberCrisp are the only two inputs here, exactly as before this
  // prop existed. See the jerseyStyle prop's own comment above.
  const outlineStyle: CSSProperties = livePicker
    ? S.numberOutlineLivePicker
    : numberCrisp
      ? S.numberOutlineCrisp
      : S.numberOutlineDefault;
  // Automatic contrast is a THIRD, independent axis from jerseyStyle
  // (shape) and livePicker/numberCrisp (outline/shadow treatment) — it only
  // overrides the base numberText.color, never the outline styles above.
  const numberColour = readableNumberColour(primary);
  return (
    <div style={S.tile}>
      <div style={{ ...S.jerseyWrap, width: size }}>
        {renderJerseyShape(resolvedJerseyStyle, primary, secondary, size)}
        <span style={{ ...S.numberText, ...outlineStyle, fontSize: resolvedNumberFontSize, color: numberColour }}>
          {player.number}
        </span>
      </div>
      {name && <span style={S.name}>{name}</span>}
    </div>
  );
}

// Bare jersey-shape swatch — no number, no name plate — reusing the exact
// same renderJerseyShape() the full tile above uses, so a selector preview
// is pixel-identical in shape to what the same jerseyStyle renders
// everywhere else. Built for Squad Setup's compact jersey-style selector
// (see ProTaggerSquadScreen.tsx) rather than adding a fourth jersey
// implementation there.
export function ProTaggerJerseyStyleSwatch({
  jerseyStyle,
  primary,
  secondary,
  size = 36,
}: {
  jerseyStyle: ProTaggerJerseyStyle;
  primary: string;
  secondary: string;
  size?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      {renderJerseyShape(jerseyStyle, primary, secondary, size)}
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
  // Bold number — no shape behind it, just an outline (either variant
  // below) to keep it high-contrast against any user-chosen jersey primary
  // colour without covering the jersey itself the way a solid badge did.
  // top moved down from 44% to 56% (of the jersey's own rendered height) to
  // pull the number off the collar/shoulders and into the torso — the same
  // one rule for every jersey size and every number, one or two digits.
  // `color` here is only the fallback baseline (white) — the caller always
  // overrides it inline with readableNumberColour(primary) above, which
  // resolves to dark on light jerseys and white on dark ones.
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
