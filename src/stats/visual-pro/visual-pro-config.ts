/**
 * visual-pro-config.ts — Phase 0
 *
 * Config-driven row/tile definitions for the Visual Pro Tag capture panel.
 *
 * Data hierarchy (HOW-first):
 *   Row  = one (kind + teamSide) combination — e.g. KICKOUT_WON FOR
 *   Tile = one HOW detail — e.g. "Clean" → detailTag "CLEAN"
 *
 * One tile tap already encodes: kind + teamSide + tags[].
 * Player and pitch steps that follow add identity and coordinates only.
 *
 * Phase 0 scope: KICKOUT and POSSESSION sections only.
 * SCORING, FREES, DELIVERY rows are added in later phases.
 *
 * Tag string constraints:
 *   All detailTag values are taken verbatim from the FollowupTag union in
 *   StatsModeSurface.tsx (lines 55–75). The PDF export and review label
 *   helpers already recognise every string used here. No new tag strings
 *   are introduced.
 *
 * Kind string constraints:
 *   All kind values are members of MATCH_EVENT_KINDS in stats-event-model.ts.
 *   TypeScript enforces this via VisualProTile.kind: MatchEventKind.
 *   NOTE: "KICKOUT_CONCEDED" is the correct model value — not "KICKOUT_LOST".
 */

import type { VisualProConfig, VisualProTile } from "./visual-pro-types";

// ─── Tile factories ───────────────────────────────────────────────────────────
// Each factory pins the invariant fields for a row so tiles can't drift from
// their parent row's kind/teamSide/section/family/tone by accident.

function kWonTile(label: string, detailTag: string): VisualProTile {
  return {
    family: "KICKOUT",
    section: "KICKOUT",
    kind: "KICKOUT_WON",
    teamSide: "FOR",
    opensPlayerTeam: "FOR",
    prefix: "K+",
    label,
    detailTag,
    visualTone: "kickout-won",
  };
}

function kLostTile(label: string, detailTag: string): VisualProTile {
  return {
    family: "KICKOUT",
    section: "KICKOUT",
    kind: "KICKOUT_CONCEDED",
    teamSide: "FOR",
    opensPlayerTeam: "FOR",
    prefix: "K−",
    label,
    detailTag,
    visualTone: "kickout-lost",
  };
}

function tWonTile(label: string, detailTag: string): VisualProTile {
  return {
    family: "POSSESSION",
    section: "POSSESSION",
    kind: "TURNOVER_WON",
    teamSide: "FOR",
    opensPlayerTeam: "FOR",
    prefix: "T+",
    label,
    detailTag,
    visualTone: "turnover-won",
  };
}

function tLostTile(label: string, detailTag: string): VisualProTile {
  return {
    family: "POSSESSION",
    section: "POSSESSION",
    kind: "TURNOVER_LOST",
    teamSide: "FOR",
    opensPlayerTeam: "FOR",
    prefix: "T−",
    label,
    detailTag,
    visualTone: "turnover-lost",
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const VISUAL_PRO_CONFIG: VisualProConfig = {
  rows: [
    // ── KICKOUT section ────────────────────────────────────────────────────

    {
      heading: "K+ Kickout Won",
      section: "KICKOUT",
      tiles: [
        kWonTile("Clean",    "CLEAN"),
        kWonTile("Break",    "BREAK"),
        kWonTile("Foul Won", "FOUL_WON"),
        // 4th slot reserved — SHORT delivery tag is valid here in Phase 1+
        // kWonTile("Short", "SHORT"),
      ],
    },

    {
      heading: "K− Kickout Lost",
      section: "KICKOUT",
      tiles: [
        kLostTile("Clean",     "CLEAN"),
        kLostTile("Break",     "BREAK"),
        kLostTile("Foul Con.", "FOUL_CONCEDED"),
        kLostTile("Dead Ball", "KICKED_DEAD"),
      ],
    },

    // ── POSSESSION section ─────────────────────────────────────────────────

    {
      heading: "T+ Turnover Won",
      section: "POSSESSION",
      tiles: [
        tWonTile("Tackle",    "TACKLE"),
        tWonTile("Press",     "PRESS"),
        tWonTile("Swarm",     "SWARM"),
        tWonTile("Intercept", "INTERCEPT"),
      ],
    },

    {
      heading: "T− Turnover Lost",
      section: "POSSESSION",
      tiles: [
        tLostTile("HP Error",    "SLACK_HAND_PASS"),
        tLostTile("KP Error",    "SLACK_KICK_PASS"),
        tLostTile("Overcarried", "OVERCARRIED"),
        tLostTile("Tackled",     "STRIPPED"),
      ],
    },
  ],
};
