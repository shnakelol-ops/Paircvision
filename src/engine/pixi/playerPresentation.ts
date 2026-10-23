import { sanitizeStoredPlayerTokenStyle, type PlayerTokenStyle } from "./playerTokenRenderer";
import type { PlayerTokenSize } from "./playerTokenSize";

/**
 * Tactical Slate player-token settings — style and size — saved with every
 * board on every surface. Purely visual: a player's id, team, number, kit,
 * label fields, phases, ball possession and Shape Links are never touched.
 *
 * Stored as two optional board fields: `playerPresentation` (the size) and
 * `playerTokenStyle`. Older boards are read through a compatibility mapping
 * (resolveStoredTokenSettings) and are never rewritten: a stored board only
 * changes when the coach saves it.
 *
 * Legacy shapes that are read but never written any more:
 *  - `playerPresentation: "practice"` — Training's retired Practice
 *    presentation (a numberless Vision V3 token at the Compact scale). Opens
 *    as Bib Token at Compact: the same diameter, still numberless.
 *  - no `playerPresentation` — any board saved before token settings were
 *    stored. Opens with its surface's default (TokenSurfaceKind), which is
 *    exactly what it opened with before: Training boards opened as Practice
 *    (now Bib Token at Compact), every other surface as Vision V3 at Normal.
 *  - a size without `playerTokenStyle` — Training boards saved before the
 *    style was stored. Opens as Vision V3 at that size, never as the style of
 *    whatever board was open before.
 */
export type TacticalPlayerPresentation = PlayerTokenSize | "practice";

export type PlayerTokenSettings = { style: PlayerTokenStyle; size: PlayerTokenSize };

/** The Tactical Slate surfaces (QuickBoardSurface) as far as token defaults go. */
export type TokenSurfaceKind = "pitch" | "training" | "tacticalBoard" | "whiteboard";

/** What a new Training board, and a legacy Practice board, opens with. */
export const DEFAULT_TRAINING_TOKEN_SETTINGS: Readonly<PlayerTokenSettings> = { style: "bib", size: "compact" };

/** What a new board on every other surface opens with (today's default). */
export const DEFAULT_TOKEN_SETTINGS: Readonly<PlayerTokenSettings> = { style: "vision-v3", size: "normal" };

/** Style for a stored size without a stored style (see above). */
export const LEGACY_TOKEN_STYLE: PlayerTokenStyle = "vision-v3";

export function resolveSurfaceDefaultTokenSettings(surface: TokenSurfaceKind): PlayerTokenSettings {
  return { ...(surface === "training" ? DEFAULT_TRAINING_TOKEN_SETTINGS : DEFAULT_TOKEN_SETTINGS) };
}

export function sanitizePlayerPresentation(value: unknown): TacticalPlayerPresentation | null {
  return value === "normal" || value === "compact" || value === "mini" || value === "practice" ? value : null;
}

/** What a stored board opens with. Pure: reads the fields, never writes them. */
export function resolveStoredTokenSettings(
  state: { playerPresentation?: unknown; playerTokenStyle?: unknown },
  surface: TokenSurfaceKind,
): PlayerTokenSettings {
  const presentation = sanitizePlayerPresentation(state.playerPresentation);
  if (presentation === "practice") return { ...DEFAULT_TRAINING_TOKEN_SETTINGS };
  if (presentation === null) return resolveSurfaceDefaultTokenSettings(surface);
  return {
    style: sanitizeStoredPlayerTokenStyle(state.playerTokenStyle) ?? LEGACY_TOKEN_STYLE,
    size: presentation,
  };
}
