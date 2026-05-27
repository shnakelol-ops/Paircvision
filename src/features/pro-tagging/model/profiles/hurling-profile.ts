/**
 * hurling-profile.ts
 *
 * PáircVision Pro Tagging — Hurling Sport Profile
 *
 * DESIGN NOTE:
 * Hurling is the hardest speed test. If this profile works in live hurling,
 * it can work for every GAA code. Every UX and layout decision here
 * should be tested at hurling speed (high volume, fast events, sideline).
 *
 * Keyboard layout design:
 *   Portrait-first. All primary events visible without scroll.
 *   Hurling-specific events have a dedicated section (not hidden behind nav).
 *   Quality/effort events are collapsible (secondary importance).
 */

import {
  POSSESSION_END_KINDS,
  POSSESSION_START_KINDS,
  SCORING_KINDS,
} from "../pro-event-model";
import type { SportProfile } from "../sport-profile-types";

export const HURLING_PROFILE: SportProfile = {
  id: "HURLING",
  displayName: "Hurling",
  pitchSport: "hurling",
  restartLabel: "Puckout",

  // ── Enabled event kinds for hurling ────────────────────────────────────────
  enabledProKinds: new Set([
    // Scoring
    "GOAL",
    "POINT",
    "WIDE",
    "SHOT",
    "FREE_SCORED",
    "FREE_MISSED",
    // Restarts — puckout terminology applied via reportVocabulary
    "RESTART_WON",
    "RESTART_LOST",
    "SHORT_RESTART",
    "LONG_RESTART",
    // Possession
    "TURNOVER_WON",
    "TURNOVER_LOST",
    "POSSESSION_WON",
    "POSSESSION_LOST",
    // Frees
    "FREE_WON",
    "FREE_CONCEDED",
    // Delivery
    "DELIVERY_WON",
    "DELIVERY_LOST",
    "INSIDE_BALL_WON",
    "INSIDE_BALL_LOST",
    // Hurling-specific
    "BREAK_WON",
    "BREAK_LOST",
    "HOOK",
    "BLOCK",
    "SIXTY_FIVE",
    "SIDELINE",
    // Quality/Effort
    "GOOD_DECISION",
    "BAD_DECISION",
    "GOOD_PASS",
    "BAD_PASS",
    "WORK_RATE_PLUS",
    "WORK_RATE_MINUS",
    "REPEATED_MISTAKE",
  ]),

  scoringKinds: SCORING_KINDS,

  // ── Keyboard Layout ─────────────────────────────────────────────────────────
  keyboardLayout: {
    sections: [
      {
        id: "scoring",
        label: "Scoring",
        buttons: [
          { proKind: "GOAL",       label: "GOAL",    shortLabel: "G",   tone: "score",   category: "scoring" },
          { proKind: "POINT",      label: "POINT",   shortLabel: "P",   tone: "score",   category: "scoring" },
          { proKind: "WIDE",       label: "WIDE",    shortLabel: "W",   tone: "wide",    category: "scoring" },
          { proKind: "SHOT",       label: "SHOT",    shortLabel: "SH",  tone: "wide",    category: "scoring" },
        ],
      },
      {
        id: "restarts",
        label: "Puckout",
        buttons: [
          { proKind: "RESTART_WON",   label: "PUCKOUT WON",  shortLabel: "P+", tone: "restart", category: "restarts" },
          { proKind: "RESTART_LOST",  label: "PUCKOUT LOST", shortLabel: "P−", tone: "restart", category: "restarts" },
          { proKind: "SHORT_RESTART", label: "SHORT",        shortLabel: "SH", tone: "restart", category: "restarts" },
          { proKind: "LONG_RESTART",  label: "LONG",         shortLabel: "LG", tone: "restart", category: "restarts" },
        ],
      },
      {
        id: "possession",
        label: "Possession",
        buttons: [
          { proKind: "TURNOVER_WON",   label: "TURNOVER WON",  shortLabel: "T+", tone: "turnover", category: "possession" },
          { proKind: "TURNOVER_LOST",  label: "TURNOVER LOST", shortLabel: "T−", tone: "turnover", category: "possession" },
          { proKind: "POSSESSION_WON", label: "POSS WON",      shortLabel: "PW", tone: "turnover", category: "possession" },
          { proKind: "POSSESSION_LOST",label: "POSS LOST",     shortLabel: "PL", tone: "turnover", category: "possession" },
        ],
      },
      {
        id: "hurling-specific",
        label: "Hurling",
        buttons: [
          { proKind: "BREAK_WON",  label: "BREAK WON",  shortLabel: "BW", tone: "hurling", category: "hurling-specific" },
          { proKind: "BREAK_LOST", label: "BREAK LOST", shortLabel: "BL", tone: "hurling", category: "hurling-specific" },
          { proKind: "HOOK",       label: "HOOK",       shortLabel: "HK", tone: "hurling", category: "hurling-specific" },
          { proKind: "BLOCK",      label: "BLOCK",      shortLabel: "BK", tone: "hurling", category: "hurling-specific" },
          { proKind: "SIXTY_FIVE", label: "65",         shortLabel: "65", tone: "free",    category: "hurling-specific" },
          { proKind: "SIDELINE",   label: "SIDELINE",   shortLabel: "SL", tone: "hurling", category: "hurling-specific" },
        ],
      },
      {
        id: "frees",
        label: "Frees",
        buttons: [
          { proKind: "FREE_WON",      label: "FREE WON",    shortLabel: "F+", tone: "free", category: "frees" },
          { proKind: "FREE_CONCEDED", label: "FREE CONCEDED",shortLabel: "F−", tone: "free", category: "frees" },
          { proKind: "FREE_SCORED",   label: "FREE SCORED", shortLabel: "FS", tone: "score",category: "frees" },
          { proKind: "FREE_MISSED",   label: "FREE MISSED", shortLabel: "FM", tone: "wide", category: "frees" },
        ],
      },
      {
        id: "delivery",
        label: "Delivery",
        collapsible: true,
        buttons: [
          { proKind: "DELIVERY_WON",    label: "DELIVERY WON",    shortLabel: "DW", tone: "delivery", category: "delivery" },
          { proKind: "DELIVERY_LOST",   label: "DELIVERY LOST",   shortLabel: "DL", tone: "delivery", category: "delivery" },
          { proKind: "INSIDE_BALL_WON", label: "INSIDE BALL WON", shortLabel: "IW", tone: "delivery", category: "delivery" },
          { proKind: "INSIDE_BALL_LOST",label: "INSIDE BALL LOST",shortLabel: "IL", tone: "delivery", category: "delivery" },
        ],
      },
      {
        id: "effort",
        label: "Effort / Quality",
        collapsible: true,
        buttons: [
          { proKind: "GOOD_DECISION",   label: "GOOD DECISION",    shortLabel: "GD", tone: "effort", category: "effort" },
          { proKind: "BAD_DECISION",    label: "BAD DECISION",     shortLabel: "BD", tone: "effort", category: "effort" },
          { proKind: "GOOD_PASS",       label: "GOOD PASS",        shortLabel: "GP", tone: "effort", category: "effort" },
          { proKind: "BAD_PASS",        label: "BAD PASS",         shortLabel: "BP", tone: "effort", category: "effort" },
          { proKind: "WORK_RATE_PLUS",  label: "WORK RATE+",       shortLabel: "W+", tone: "effort", category: "effort" },
          { proKind: "WORK_RATE_MINUS", label: "WORK RATE−",       shortLabel: "W−", tone: "effort", category: "effort" },
          { proKind: "REPEATED_MISTAKE",label: "REPEATED MISTAKE", shortLabel: "RM", tone: "effort", category: "effort" },
        ],
      },
    ],
  },

  // ── Chain Timing Windows ────────────────────────────────────────────────────
  // Hurling plays faster — windows tighter than football
  chainTimingWindows: [
    { anchorKind: "RESTART_WON",  maxGapSeconds: 60, maxWindowSeconds: 60 },
    { anchorKind: "RESTART_LOST", maxGapSeconds: 60, maxWindowSeconds: 60 },
    { anchorKind: "TURNOVER_WON", maxGapSeconds: 45, maxWindowSeconds: 45 },
    { anchorKind: "BREAK_WON",    maxGapSeconds: 30, maxWindowSeconds: 30 },
    { anchorKind: "FREE_WON",     maxGapSeconds: 30, maxWindowSeconds: 30 },
  ],

  // ── Possession Rules ────────────────────────────────────────────────────────
  possessionRule: {
    startKinds: POSSESSION_START_KINDS,
    endKinds: POSSESSION_END_KINDS,
    // Hurling: shorter implicit gap before a possession break is inferred
    maxImplicitGapSeconds: 30,
  },

  // ── Report Vocabulary ───────────────────────────────────────────────────────
  reportVocabulary: {
    restart:          "Puckout",
    restartWon:       "Puckout won",
    restartLost:      "Puckout lost",
    breakdown:        "Hook / Block",
    insideBall:       "Ball into the square",
    secondBall:       "Second ball / Break",
    placeBallRestart: "65",
    sideline:         "Sideline",
  },
};
