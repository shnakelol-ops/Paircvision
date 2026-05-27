/**
 * sport-profile-types.ts
 *
 * PáircVision Pro Tagging — Sport Profile type system.
 *
 * A SportProfile defines everything a sport code needs:
 *   - Which events are enabled
 *   - How the event keyboard is laid out
 *   - Labels for restarts, scoring, terminology
 *   - Timing windows for chain detection
 *   - Possession boundary rules
 *   - Report vocabulary
 *
 * Four profiles are defined in profiles/:
 *   - football-profile.ts
 *   - ladies-football-profile.ts
 *   - hurling-profile.ts
 *   - camogie-profile.ts
 */

import type { ProEventKind, ProEventCategory } from "./pro-event-model";

// ---------------------------------------------------------------------------
// Sport Profile ID
// ---------------------------------------------------------------------------

export type SportProfileId = "FOOTBALL" | "LADIES_FOOTBALL" | "HURLING" | "CAMOGIE";

// ---------------------------------------------------------------------------
// Event Button Definition
// ---------------------------------------------------------------------------

export type EventTone =
  | "score"       // green — scoring events
  | "wide"        // amber — miss/wide
  | "turnover"    // orange — possession turnover
  | "restart"     // blue — kickout/puckout
  | "free"        // purple — free
  | "delivery"    // teal — delivery/inside ball
  | "hurling"     // red — hurling-specific (hook, block, break)
  | "effort";     // grey — decision/work rate quality events

export type EventButtonDef = {
  proKind: ProEventKind;
  /** Primary button label (shown on keyboard) */
  label: string;
  /** Optional short label for very compact layouts */
  shortLabel?: string;
  /** Colour tone category */
  tone: EventTone;
  /** Event semantic category */
  category: ProEventCategory;
};

// ---------------------------------------------------------------------------
// Keyboard Layout
// ---------------------------------------------------------------------------

export type KeyboardSection = {
  id: string;
  /** Optional section header label */
  label?: string;
  /** Whether this section starts as collapsed (expandable on tap) */
  collapsible?: boolean;
  buttons: readonly EventButtonDef[];
};

export type KeyboardLayout = {
  sections: readonly KeyboardSection[];
};

// ---------------------------------------------------------------------------
// Chain Timing Window
// ---------------------------------------------------------------------------

export type ChainTimingWindow = {
  anchorKind: ProEventKind;
  maxGapSeconds: number;
  maxWindowSeconds: number;
};

// ---------------------------------------------------------------------------
// Possession Rules
// ---------------------------------------------------------------------------

export type PossessionRule = {
  startKinds: ReadonlySet<ProEventKind>;
  endKinds: ReadonlySet<ProEventKind>;
  /** Max seconds between events in same possession before implicit break */
  maxImplicitGapSeconds: number;
};

// ---------------------------------------------------------------------------
// Report Vocabulary
// ---------------------------------------------------------------------------

export type SportReportVocabulary = {
  /** "Kickout" or "Puckout" */
  restart: string;
  /** "Kickout won" or "Puckout won" */
  restartWon: string;
  /** "Kickout lost" or "Puckout lost" */
  restartLost: string;
  /** "Hook / Block" or "Tackle / Break" */
  breakdown: string;
  /** "Inside ball" or "Ball into the square" */
  insideBall: string;
  /** "Second ball" or "Break ball" — hurling specific, fallback to "loose ball" */
  secondBall: string;
  /** "65" or "45" — place ball restart */
  placeBallRestart: string | null;
  /** "Sideline" — hurling specific, or null for football */
  sideline: string | null;
};

// ---------------------------------------------------------------------------
// Sport Profile
// ---------------------------------------------------------------------------

export type SportProfile = {
  id: SportProfileId;
  /** Human-readable name — "Football", "Hurling", etc. */
  displayName: string;
  /** Pitch render style */
  pitchSport: "gaelic" | "hurling";
  /** Restart terminology for UI labels */
  restartLabel: string;
  /** Complete set of enabled ProEventKind for this sport */
  enabledProKinds: ReadonlySet<ProEventKind>;
  /** Scoring events for scoreboard and reports */
  scoringKinds: ReadonlySet<ProEventKind>;
  /** Event keyboard layout — ordered sections */
  keyboardLayout: KeyboardLayout;
  /** Chain detection timing windows (sport-specific) */
  chainTimingWindows: readonly ChainTimingWindow[];
  /** Possession boundary rules */
  possessionRule: PossessionRule;
  /** Vocabulary for reports and review mode */
  reportVocabulary: SportReportVocabulary;
};
