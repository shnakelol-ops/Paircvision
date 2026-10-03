/**
 * Tactical Slate player presentation — how every player token on a board is
 * drawn. Purely visual: a player's id, team, number, kit, label fields,
 * phases, ball possession and Shape Links are never touched by it.
 *
 *  - "normal"   — the selected token style at full size (today's default).
 *  - "compact"  — the selected token style at the existing Compact scale.
 *  - "practice" — Training Grass only: a fixed Vision V3 token at the same
 *                 Compact scale with no identity label (no number, initials
 *                 or name). Switching back reveals the unchanged label.
 *
 * Only Training boards persist a presentation (see persistPlayerPresentation
 * in createTacticalPadLiteSurface.ts); Pitch and Whiteboard payloads never
 * carry one.
 */
export type TacticalPlayerPresentation = "normal" | "compact" | "practice";

/** What a Training board without presentation metadata (incl. legacy boards) opens with. */
export const DEFAULT_TRAINING_PLAYER_PRESENTATION: TacticalPlayerPresentation = "practice";

export function sanitizePlayerPresentation(value: unknown): TacticalPlayerPresentation | null {
  return value === "normal" || value === "compact" || value === "practice" ? value : null;
}

export function resolvePlayerPresentation(flags: { compact: boolean; practice: boolean }): TacticalPlayerPresentation {
  if (flags.practice) return "practice";
  return flags.compact ? "compact" : "normal";
}

export function playerPresentationFlags(presentation: TacticalPlayerPresentation): { compact: boolean; practice: boolean } {
  return {
    compact: presentation === "compact",
    practice: presentation === "practice",
  };
}
