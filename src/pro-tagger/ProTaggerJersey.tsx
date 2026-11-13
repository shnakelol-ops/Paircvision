import { useId } from "react";
import { resolveJerseyKit, type JerseyKit, type JerseyPattern } from "./jersey-kit";

// Jersey Designer V2 — the one jersey drawing for Event Stats: Squads
// lineup (Starting XV + subs), the Live Player Picker, and the small header
// icons (via ProTaggerMiniJersey). Draws the shirt only; numbers and names
// are overlaid by ProTaggerLineupJerseyTile.
//
// Construction: one body silhouette is used as a clip-path, and every
// colour layer (body, pattern, sleeves, cuffs, collar, shading) is clipped
// to it, so no layer can ever spill outside the shirt. viewBox 40x44 keeps
// the previous 20x22 aspect ratio exactly, so the rendered width/height for
// a given `size`, and therefore every pitch position, are unchanged.

export const JERSEY_VIEWBOX_W = 40;
export const JERSEY_VIEWBOX_H = 44;

/** Outer shirt: shallow scooped neck, angled set-in short sleeves, rounded hem. */
export const JERSEY_BODY_PATH =
  "M14,2.6 Q20,6.4 26,2.6 L32.6,5 L39.4,12.6 L34.8,17.6 L32.4,15.2 L32.4,40.8 Q32.4,42.6 30.6,42.6 " +
  "L9.4,42.6 Q7.6,42.6 7.6,40.8 L7.6,15.2 L5.2,17.6 L0.6,12.6 L7.4,5 Z";

const SLEEVE_PATHS = [
  "M7.4,5 L0.6,12.6 L5.2,17.6 L7.6,15.2 L10.2,4.2 Z",
  "M32.6,5 L39.4,12.6 L34.8,17.6 L32.4,15.2 L29.8,4.2 Z",
] as const;

const CUFF_PATHS = [
  "M0.6,12.6 L5.2,17.6 L6.4,16.4 L1.8,11.3 Z",
  "M39.4,12.6 L34.8,17.6 L33.6,16.4 L38.2,11.3 Z",
] as const;

const COLLAR_PATH = "M14,2.6 Q20,6.4 26,2.6 L27.4,3.2 Q20,9.4 12.6,3.2 Z";

// Pattern layers in the secondary colour. All sit clear of, or behind, the
// number (which is centred at 56% of the height): the Chest V ends above
// it, the Hoop sits on the chest above it, and only the centre stripe runs
// behind it.
export const JERSEY_PATTERN_PATHS: Record<JerseyPattern, string | null> = {
  plain: null,
  chestV: "M7.6,8.5 L20,19.5 L32.4,8.5 L32.4,13.2 L20,24.2 L7.6,13.2 Z",
  hoop: "M0,10.6 H40 V16.6 H0 Z",
  stripes: "M10.4,0 h3.6 v44 h-3.6 Z M18.2,0 h3.6 v44 h-3.6 Z M26,0 h3.6 v44 h-3.6 Z",
};

interface Props {
  primary: string;
  secondary: string;
  /** Missing, partial or invalid values fall back to DEFAULT_JERSEY_KIT. */
  kit?: JerseyKit | null;
  /** Rendered width in px; height keeps the 20:22 jersey aspect ratio. */
  size: number;
}

export function ProTaggerJersey({ primary, secondary, kit, size }: Props) {
  // useId is unique per mounted instance; it is reduced to characters that
  // are always safe inside url(#…) so 30+ jerseys on one screen can never
  // share a clipPath or gradient id.
  const uid = `pvj${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clipId = `${uid}-clip`;
  const shadeId = `${uid}-shade`;

  const k = resolveJerseyKit(kit);
  const sleeveFill = k.sleeves === "secondary" ? secondary : primary;
  const trimFill = k.collar === "secondary" ? secondary : primary;
  const pattern = JERSEY_PATTERN_PATHS[k.pattern];
  const h = Math.round((size * JERSEY_VIEWBOX_H) / JERSEY_VIEWBOX_W);

  return (
    <svg
      viewBox={`0 0 ${JERSEY_VIEWBOX_W} ${JERSEY_VIEWBOX_H}`}
      width={size}
      height={h}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
      data-jersey-pattern={k.pattern}
      data-jersey-sleeves={k.sleeves}
      data-jersey-collar={k.collar}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={JERSEY_BODY_PATH} />
        </clipPath>
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={JERSEY_BODY_PATH} fill={primary} data-layer="body" />
        {pattern && <path d={pattern} fill={secondary} data-layer="pattern" />}
        {SLEEVE_PATHS.map((d) => <path key={d} d={d} fill={sleeveFill} data-layer="sleeve" />)}
        {CUFF_PATHS.map((d) => <path key={d} d={d} fill={trimFill} data-layer="cuff" />)}
        <path d={COLLAR_PATH} fill={trimFill} data-layer="collar" />
        <path d={JERSEY_BODY_PATH} fill={`url(#${shadeId})`} data-layer="shade" />
      </g>
      {/* Light hairline edge. Real-size testing showed a dark edge cannot
          separate dark-green sleeves or bodies from the green pitch (the
          shirt read as a sleeveless vest); a light edge outlines any dark
          kit, while light kits already stand out from the grass. The tile's
          dark drop-shadow halo still sits behind it. */}
      <path
        d={JERSEY_BODY_PATH}
        fill="none"
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        data-layer="edge"
      />
    </svg>
  );
}
