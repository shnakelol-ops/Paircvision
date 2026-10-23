/**
 * Tactical Slate player-token size, shared by every token style. "normal" and
 * "compact" are the existing sizes; "mini" is MINI_TOKEN_SIZE_RATIO of Compact.
 *
 * The engine keeps Compact as its own flag and Mini as a second flag on top of
 * it, so Mini always also sets Compact and never draws on its own: a board
 * switched or loaded to Normal draws Normal, and Training's Practice
 * presentation always wins.
 *
 * Pitch and Whiteboard keep size as session state, exactly as the Compact
 * Tokens checkbox did. Training saves it as its player presentation (see
 * playerPresentation.ts).
 */
export type PlayerTokenSize = "normal" | "compact" | "mini";

/** Mini diameter as a share of the Compact diameter. */
export const MINI_TOKEN_SIZE_RATIO = 0.8;

export const PLAYER_TOKEN_SIZE_CHOICES: ReadonlyArray<{ value: PlayerTokenSize; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "compact", label: "Compact" },
  { value: "mini", label: "Mini" },
];

/** Whether Mini is what the board actually draws. */
export function isMiniTokenSizeActive(flags: { compact: boolean; mini: boolean; practice: boolean }): boolean {
  return flags.compact && flags.mini && !flags.practice;
}

export function resolvePlayerTokenSize(flags: { compact: boolean; mini: boolean }): PlayerTokenSize {
  if (!flags.compact) return "normal";
  return flags.mini ? "mini" : "compact";
}

export function playerTokenSizeFlags(size: PlayerTokenSize): { compact: boolean; mini: boolean } {
  return { compact: size !== "normal", mini: size === "mini" };
}
