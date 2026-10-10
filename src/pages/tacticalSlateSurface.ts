import type { PitchSport } from "../core/pitch/pitch-config";
import type { QuickBoardSurface } from "../features/quickboard/storage/quickboard-types";
import type { TacticalPitchTheme } from "../tactical-lite/pixi/tacticalPitchTheme";
import type { TacticalSlateInitialRoster } from "../engine/pixi/tacticalSlateDefaultPlayers";
import {
  DEFAULT_TRAINING_PLAYER_PRESENTATION,
  type TacticalPlayerPresentation,
} from "../engine/pixi/playerPresentation";

/**
 * Tactical Slate work surfaces. All of them run the same tactical engine
 * (surfaceVariant "tactical"); a surface only chooses the pitch visuals and
 * which isolated board library/draft the page reads and writes.
 *
 *  - "pitch"         — Gaelic Pitch at /vision-board (the default): Gaelic
 *                      markings and goals on the mown bands.
 *  - "training"      — Training Grass: mown bands without markings or goals.
 *  - "tacticalBoard" — Tactical Board: the Gaelic pitch on the original turf
 *                      (gradient, glow and vignette), re-based onto Traditional GAA Green (#235431)
 *                      via its own "tacticalBoard" pitch theme.
 *  - "whiteboard" — the existing whiteboard renderer theme. This is NOT the
 *                   dormant legacy Whiteboard mode (PadMode "whiteboard"),
 *                   which stays unreachable.
 */
export type TacticalSlateSurface = QuickBoardSurface;

export const TACTICAL_SLATE_SURFACES: readonly TacticalSlateSurface[] = ["pitch", "training", "tacticalBoard", "whiteboard"];

export const TACTICAL_SLATE_SURFACE_ROUTES: Readonly<Record<TacticalSlateSurface, string>> = {
  pitch: "/vision-board",
  training: "/vision-board/training",
  tacticalBoard: "/vision-board/tactical",
  whiteboard: "/vision-board/whiteboard",
};

export const TACTICAL_SLATE_SURFACE_LABELS: Readonly<Record<TacticalSlateSurface, string>> = {
  pitch: "Gaelic Pitch",
  training: "Training Grass",
  tacticalBoard: "Tactical Board",
  whiteboard: "Whiteboard",
};

/**
 * Pitch theme for a surface. The mown-band Gaelic Pitch is Gaelic only: any
 * other sport on the Pitch surface (the internal Rugby Slate) keeps the
 * original turf, exactly as before.
 */
export function resolveSurfacePitchTheme(surface: TacticalSlateSurface, sport: PitchSport = "gaelic"): TacticalPitchTheme {
  switch (surface) {
    case "pitch":
      return sport === "gaelic" ? "gaelicBands" : "default";
    case "training":
      return "grass";
    case "whiteboard":
      return "whiteboard";
    case "tacticalBoard":
      return "tacticalBoard";
    default:
      return "default";
  }
}

/**
 * Storage namespace for the board library + autosave draft. The public
 * Gaelic Pitch resolves to "" — the exact existing GAA key strings. Any other
 * sport and/or surface gets its own `${baseKey}:${namespace}` keys (see
 * namespacedKey in quickboard-storage.ts), so a Training or Whiteboard board
 * can never load into, or overwrite, the coach's Pitch boards.
 */
export function resolveBoardStorageNamespace(sport: PitchSport, surface: TacticalSlateSurface): string {
  const parts: string[] = [];
  if (sport !== "gaelic") parts.push(sport);
  if (surface !== "pitch") parts.push(surface);
  return parts.join(":");
}

/**
 * Training Grass opens empty — a practice is built up with the Teams
 * controls rather than cleared down from the Gaelic XV. Every other surface
 * keeps the formation exactly as before.
 */
export function resolveSurfaceInitialRoster(surface: TacticalSlateSurface): TacticalSlateInitialRoster {
  return surface === "training" ? "empty" : "formation";
}

/**
 * Only Training boards save their player presentation (Normal / Compact /
 * Practice) and offer Practice; Pitch and Whiteboard keep today's
 * session-only Player Tokens behaviour and unchanged board payloads.
 */
export function surfaceUsesPlayerPresentation(surface: TacticalSlateSurface): boolean {
  return surface === "training";
}

/** Presentation a fresh board opens with: Practice on Training, Normal elsewhere (today's default). */
export function resolveSurfaceDefaultPlayerPresentation(surface: TacticalSlateSurface): TacticalPlayerPresentation {
  return surfaceUsesPlayerPresentation(surface) ? DEFAULT_TRAINING_PLAYER_PRESENTATION : "normal";
}

export const PLAYER_PRESENTATION_CHOICES: ReadonlyArray<{ value: TacticalPlayerPresentation; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "compact", label: "Compact" },
  { value: "practice", label: "Practice" },
];

/**
 * The PáircVision watermark is drawn in black only on the Whiteboard, whose
 * face is pale; every other surface keeps the standard light watermark.
 */
export function surfaceUsesDarkWatermark(surface: TacticalSlateSurface): boolean {
  return surface === "whiteboard";
}

/**
 * Training Grass rectangles are Practice Areas: transparent boundaries that
 * can be selected, moved, resized, duplicated, recoloured, made Dead Zones
 * and deleted. Pitch and Whiteboard keep today's filled tactical zones.
 */
export function surfaceUsesPracticeAreas(surface: TacticalSlateSurface): boolean {
  return surface === "training";
}
