import type { PlayerTokenStyle } from "./playerTokenRenderer";

/**
 * Tactical Slate player-token size. "normal" and "compact" are the sizes every
 * style already has (the Compact Tokens toggle / Training's Normal | Compact).
 * "mini" exists only for the Bib Token: MINI_TOKEN_SIZE_RATIO of Compact.
 *
 * The engine keeps Compact as its own flag and Mini as a second flag on top of
 * it, so Mini always also sets Compact. A style without Mini, or Training's
 * Practice presentation, simply ignores the Mini flag and falls back to
 * Compact — the nearest size it has — rather than silently growing to Normal.
 * Mini is never saved: a Training board stores its existing "compact"
 * presentation, and loading a board keeps the coach's Mini choice on top of
 * whatever Compact/Normal it carries, just as the token style itself is kept.
 */
export type PlayerTokenSize = "normal" | "compact" | "mini";

/** Mini diameter as a share of the Compact diameter. */
export const MINI_TOKEN_SIZE_RATIO = 0.8;

export const PLAYER_TOKEN_SIZE_CHOICES: ReadonlyArray<{ value: PlayerTokenSize; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "compact", label: "Compact" },
  { value: "mini", label: "Mini" },
];

export function tokenStyleSupportsMini(style: PlayerTokenStyle): boolean {
  return style === "bib";
}

/**
 * Whether Mini is what the board actually draws. Mini refines Compact, so a
 * board switched (or loaded) to Normal draws Normal, and Practice always wins.
 */
export function isMiniTokenSizeActive(flags: {
  compact: boolean;
  mini: boolean;
  practice: boolean;
  style: PlayerTokenStyle;
}): boolean {
  return flags.compact && flags.mini && !flags.practice && tokenStyleSupportsMini(flags.style);
}

export function resolvePlayerTokenSize(flags: { compact: boolean; mini: boolean; style: PlayerTokenStyle }): PlayerTokenSize {
  if (!flags.compact) return "normal";
  return flags.mini && tokenStyleSupportsMini(flags.style) ? "mini" : "compact";
}

export function playerTokenSizeFlags(size: PlayerTokenSize): { compact: boolean; mini: boolean } {
  return { compact: size !== "normal", mini: size === "mini" };
}
