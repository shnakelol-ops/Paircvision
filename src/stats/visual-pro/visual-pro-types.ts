import type { MatchEventKind } from "../../core/stats/stats-event-model";

// Section labels rendered as group headers in the Visual Pro Tag panel.
// DELIVERY is reserved for Phase 1+ expansion.
export type VisualProSection =
  | "KICKOUT"
  | "POSSESSION"
  | "SCORING"
  | "FREES"
  | "DELIVERY";

// Maps to a CSS colour token / background class at render time.
// Defined here so the config carries full visual intent — the panel can
// apply colour without needing to re-derive it from kind or section.
export type VisualProVisualTone =
  | "kickout-won"
  | "kickout-lost"
  | "turnover-won"
  | "turnover-lost"
  | "score"
  | "wide"
  | "free-won"
  | "free-conceded"
  | "shot";

/**
 * A single HOW tile in the Visual Pro Tag panel.
 *
 * One tap on a tile fully determines:
 *   kind      — the MatchEventKind written to the event
 *   teamSide  — "FOR" | "OPP" written to event.teamSide
 *   tags      — [detailTag] written to event.tags
 *
 * The player picker and pitch tap that follow only add coordinates and
 * player identity — they do not change the event family or outcome.
 *
 * All detailTag values must be strings already present in the
 * FollowupTag union in StatsModeSurface.tsx and consumed by the PDF
 * export and review label helpers. Do not introduce new tag strings
 * without updating those consumers.
 */
export type VisualProTile = {
  /** Event category grouping — e.g. "KICKOUT", "POSSESSION". */
  family: string;
  /** UI section this tile belongs to — used for section header rendering. */
  section: VisualProSection;
  /** Must be a value from MATCH_EVENT_KINDS. TypeScript enforces this. */
  kind: MatchEventKind;
  /** Written to event.teamSide. Always "FOR" or "OPP" — no legacy aliases. */
  teamSide: "FOR" | "OPP";
  /** Which squad's player list opens after this tile is tapped. */
  opensPlayerTeam: "FOR" | "OPP";
  /** Short accessibility/visibility prefix — readable in rain or sun. e.g. "K+", "T−" */
  prefix: string;
  /** HOW detail label displayed on the tile face. e.g. "Clean", "Break", "Tackle" */
  label: string;
  /** Injected into event.tags[0]. Must match an existing FollowupTag string. */
  detailTag: string;
  /** Visual tone for background colour. Resolved to CSS at render time. */
  visualTone: VisualProVisualTone;
};

/**
 * A row in the Visual Pro Tag panel.
 *
 * One row = one (kind + teamSide) combination.
 * Tiles within the row are the HOW options for that combination.
 * The section field drives section header rendering — consecutive rows
 * with the same section are grouped under one header.
 */
export type VisualProRow = {
  /** Displayed above the tile row. e.g. "K+ Kickout Won" */
  heading: string;
  /** Section group this row belongs to. */
  section: VisualProSection;
  /** Ordered HOW tiles. Typically 3–4 per row to fill a 4-wide grid. */
  tiles: readonly VisualProTile[];
};

/**
 * The full Visual Pro Tag panel configuration.
 * Rows are rendered top-to-bottom. Section headers are injected
 * automatically when the section value changes between consecutive rows.
 */
export type VisualProConfig = {
  rows: readonly VisualProRow[];
};
