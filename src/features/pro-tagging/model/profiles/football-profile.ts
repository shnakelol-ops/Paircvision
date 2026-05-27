/**
 * football-profile.ts
 *
 * PáircVision Pro Tagging — Gaelic Football Sport Profile
 *
 * Football has more pauses than hurling, allowing slightly richer tagging.
 * Events: 2PT, MARK (football-specific), plus shared event set.
 * Delivery and effort sections are collapsible secondary capture.
 *
 * Phase 4: MARK added — ProEventKind only, no MatchEventKind equivalent.
 */

import {
  POSSESSION_END_KINDS,
  POSSESSION_START_KINDS,
  SCORING_KINDS,
} from "../pro-event-model";
import type { SportProfile } from "../sport-profile-types";

export const FOOTBALL_PROFILE: SportProfile = {
  id: "FOOTBALL",
  displayName: "Football",
  pitchSport: "gaelic",
  restartLabel: "Kickout",

  enabledProKinds: new Set([
    // Scoring
    "GOAL",
    "POINT",
    "WIDE",
    "SHOT",
    "FREE_SCORED",
    "FREE_MISSED",
    "TWO_POINTER",
    // Football-specific
    "MARK",
    // Restarts
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
    // Effort/Quality
    "GOOD_DECISION",
    "BAD_DECISION",
    "GOOD_PASS",
    "BAD_PASS",
    "WORK_RATE_PLUS",
    "WORK_RATE_MINUS",
    "REPEATED_MISTAKE",
  ]),

  scoringKinds: new Set([
    "GOAL",
    "POINT",
    "TWO_POINTER",
    "FREE_SCORED",
    ...SCORING_KINDS,
  ]),

  keyboardLayout: {
    sections: [
      {
        id: "scoring",
        label: "Scoring",
        // 6 buttons: 3 columns × 2 rows
        buttons: [
          { proKind: "GOAL",        label: "GOAL",   shortLabel: "G",   tone: "score", category: "scoring" },
          { proKind: "POINT",       label: "POINT",  shortLabel: "P",   tone: "score", category: "scoring" },
          { proKind: "TWO_POINTER", label: "2PT",    shortLabel: "2",   tone: "score", category: "scoring" },
          { proKind: "WIDE",        label: "WIDE",   shortLabel: "W",   tone: "wide",  category: "scoring" },
          { proKind: "SHOT",        label: "SHOT",   shortLabel: "SH",  tone: "wide",  category: "scoring" },
          // MARK: football/LGFA specific — ball won from kickout/pass + free position
          { proKind: "MARK",        label: "MARK",   shortLabel: "MK",  tone: "restart", category: "football-specific" },
        ],
      },
      {
        id: "restarts",
        label: "Kickout",
        buttons: [
          { proKind: "RESTART_WON",   label: "KICKOUT WON",  shortLabel: "K+", tone: "restart", category: "restarts" },
          { proKind: "RESTART_LOST",  label: "KICKOUT LOST", shortLabel: "K−", tone: "restart", category: "restarts" },
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
        id: "frees",
        label: "Frees",
        buttons: [
          { proKind: "FREE_WON",      label: "FREE WON",     shortLabel: "F+", tone: "free",  category: "frees" },
          { proKind: "FREE_CONCEDED", label: "FREE CONCEDED",shortLabel: "F−", tone: "free",  category: "frees" },
          { proKind: "FREE_SCORED",   label: "FREE SCORED",  shortLabel: "FS", tone: "score", category: "frees" },
          { proKind: "FREE_MISSED",   label: "FREE MISSED",  shortLabel: "FM", tone: "wide",  category: "frees" },
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
          { proKind: "GOOD_DECISION",   label: "GOOD DECISION",   shortLabel: "GD", tone: "effort", category: "effort" },
          { proKind: "BAD_DECISION",    label: "BAD DECISION",    shortLabel: "BD", tone: "effort", category: "effort" },
          { proKind: "GOOD_PASS",       label: "GOOD PASS",       shortLabel: "GP", tone: "effort", category: "effort" },
          { proKind: "BAD_PASS",        label: "BAD PASS",        shortLabel: "BP", tone: "effort", category: "effort" },
          { proKind: "WORK_RATE_PLUS",  label: "WORK RATE+",      shortLabel: "W+", tone: "effort", category: "effort" },
          { proKind: "WORK_RATE_MINUS", label: "WORK RATE−",      shortLabel: "W−", tone: "effort", category: "effort" },
          { proKind: "REPEATED_MISTAKE",label: "REPEATED MISTAKE",shortLabel: "RM", tone: "effort", category: "effort" },
        ],
      },
    ],
  },

  chainTimingWindows: [
    { anchorKind: "RESTART_WON",  maxGapSeconds: 90, maxWindowSeconds: 90 },
    { anchorKind: "RESTART_LOST", maxGapSeconds: 90, maxWindowSeconds: 90 },
    { anchorKind: "TURNOVER_WON", maxGapSeconds: 60, maxWindowSeconds: 60 },
    { anchorKind: "FREE_WON",     maxGapSeconds: 30, maxWindowSeconds: 30 },
    { anchorKind: "MARK",         maxGapSeconds: 30, maxWindowSeconds: 30 },
  ],

  possessionRule: {
    startKinds: POSSESSION_START_KINDS,
    endKinds: POSSESSION_END_KINDS,
    maxImplicitGapSeconds: 45,
  },

  reportVocabulary: {
    restart:          "Kickout",
    restartWon:       "Kickout won",
    restartLost:      "Kickout lost",
    breakdown:        "Tackle / Intercept",
    insideBall:       "Inside ball",
    secondBall:       "Loose ball",
    placeBallRestart: "45",
    sideline:         null,
  },
};
