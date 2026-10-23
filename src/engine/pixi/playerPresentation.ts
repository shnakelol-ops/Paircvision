import { sanitizeStoredPlayerTokenStyle, type PlayerTokenStyle } from "./playerTokenRenderer";
import type { PlayerTokenSize } from "./playerTokenSize";

/**
 * Training Grass player-token settings, saved per board. Purely visual: a
 * player's id, team, number, kit, label fields, phases, ball possession and
 * Shape Links are never touched by them.
 *
 * Only Training boards persist them (see persistPlayerPresentation in
 * createTacticalPadLiteSurface.ts): `playerPresentation` holds the size and
 * `playerTokenStyle` the style. Pitch and Whiteboard payloads carry neither.
 *
 * `playerPresentation` is read as stored, including two legacy shapes that
 * are never written any more:
 *  - "practice" — the retired Practice presentation (a numberless Vision V3
 *    token at the Compact scale).
 *  - absent — every Training board saved before presentations existed, which
 *    opened as Practice.
 * Both open as Bib Token at Compact: the same diameter, still numberless.
 * The stored board is never rewritten; it only changes if the coach saves.
 */
export type TacticalPlayerPresentation = PlayerTokenSize | "practice";

export type TrainingTokenSettings = { style: PlayerTokenStyle; size: PlayerTokenSize };

/** What a new Training board, and a legacy Practice board, opens with. */
export const DEFAULT_TRAINING_TOKEN_SETTINGS: Readonly<TrainingTokenSettings> = { style: "bib", size: "compact" };

/**
 * Style for a Normal / Compact / Mini Training board saved before the style
 * was stored: the app's default style — never whatever board was open before,
 * so one board's style cannot leak into another.
 */
export const LEGACY_TRAINING_TOKEN_STYLE: PlayerTokenStyle = "vision-v3";

export function sanitizePlayerPresentation(value: unknown): TacticalPlayerPresentation | null {
  return value === "normal" || value === "compact" || value === "mini" || value === "practice" ? value : null;
}

/** What a stored Training board opens with. Pure: reads the fields, never writes them. */
export function resolveStoredTrainingTokenSettings(state: {
  playerPresentation?: unknown;
  playerTokenStyle?: unknown;
}): TrainingTokenSettings {
  const presentation = sanitizePlayerPresentation(state.playerPresentation);
  if (presentation === null || presentation === "practice") return { ...DEFAULT_TRAINING_TOKEN_SETTINGS };
  return {
    style: sanitizeStoredPlayerTokenStyle(state.playerTokenStyle) ?? LEGACY_TRAINING_TOKEN_STYLE,
    size: presentation,
  };
}
