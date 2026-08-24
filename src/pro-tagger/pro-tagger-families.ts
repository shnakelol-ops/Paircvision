import type { ProTaggerSport } from "./pro-tagger-session";

export type ProTaggerFamilyId =
  | "GOAL"
  | "POINT"
  | "TWO_POINT"
  | "SHOT"
  | "WIDE"
  | "RESTART"
  | "FORTY_FIVE"
  | "SIDELINE"
  | "TURNOVER"
  | "FREE"
  | "DISCIPLINE";

export type ProTaggerTile = {
  label: string;
  altLabel?: string;
  altForSports?: readonly ProTaggerSport[];
  /**
   * Display-only. On the opposition (minus) row, this tile represents a
   * mistake made by the *other* team (not the row's own team) — e.g. an
   * opposition-row "HP Error" only makes sense once you know whose handpass
   * error it was. When true, the rendered label is prefixed with the other
   * team's short name. Does not change the stored tile value/tag.
   */
  attributeOtherTeamOnOppositionRow?: boolean;
};

export type ProTaggerFamily = {
  id: ProTaggerFamilyId;
  label: string;
  altLabel?: string;
  altLabelForSports?: readonly ProTaggerSport[];
  colour: string;
  textColour: string;
  tiles: readonly ProTaggerTile[];
  hideForSports?: readonly ProTaggerSport[];
  hasMinus: boolean;
  /** Renders the same restart-owner FOR/OPP toggle as RESTART, and shares its
   *  Won/Conceded derivation (see resolveRestartOutcome in pro-tagger-adapter.ts):
   *  tapping a row records the restart as WON when that row matches the
   *  current owner, CONCEDED (attributed to the owner) otherwise. */
  hasOwnerToggle?: boolean;
  /** Rendered collapsed by default, behind a tap-to-expand header, so a rare
   *  action (e.g. Discipline) never competes with the core tiles for visual
   *  weight or thumb space. */
  secondary?: boolean;
};

const FORTY_FIVE_TILE: ProTaggerTile = {
  label: "45",
  altLabel: "65",
  altForSports: ["hurling", "camogie"],
};

export const PRO_TAGGER_FAMILIES: readonly ProTaggerFamily[] = [
  {
    id: "GOAL",
    label: "Goal",
    colour: "#22c55e",
    textColour: "#052e16",
    tiles: [
      { label: "Play" },
      { label: "Free" },
      { label: "Penalty" },
      { label: "Mark" },
      FORTY_FIVE_TILE,
    ],
    hasMinus: true,
  },
  {
    id: "POINT",
    label: "Point",
    colour: "#16a34a",
    textColour: "#ffffff",
    tiles: [
      { label: "Play" },
      { label: "Free" },
      { label: "Penalty" },
      { label: "Mark" },
      FORTY_FIVE_TILE,
    ],
    hasMinus: true,
  },
  {
    id: "TWO_POINT",
    label: "2PT",
    colour: "#15803d",
    textColour: "#ffffff",
    tiles: [
      { label: "Play" },
      { label: "Free" },
      { label: "Penalty" },
      { label: "Mark" },
      { label: "45" },
    ],
    hideForSports: ["hurling", "camogie"],
    hasMinus: true,
  },
  {
    id: "SHOT",
    label: "Shot",
    colour: "#ca8a04",
    textColour: "#fef9c3",
    tiles: [
      { label: "Short" },
      { label: "Block/Save" },
      { label: "Post" },
      FORTY_FIVE_TILE,
      { label: "Mark" },
    ],
    hasMinus: true,
  },
  {
    id: "WIDE",
    label: "Wide",
    colour: "#dc2626",
    textColour: "#ffffff",
    tiles: [
      { label: "Play" },
      { label: "Free" },
      { label: "Penalty" },
      { label: "Mark" },
      FORTY_FIVE_TILE,
    ],
    hasMinus: true,
  },
  {
    id: "RESTART",
    label: "Kickout",
    altLabel: "Puckout",
    altLabelForSports: ["hurling", "camogie"],
    colour: "#9333ea",
    textColour: "#ffffff",
    tiles: [
      { label: "Clean" },
      { label: "Break" },
      { label: "Foul" },
    ],
    hasMinus: true,
    hasOwnerToggle: true,
  },
  {
    // Restart award only — deliberately distinct from the existing "45"/"65"
    // tag on Goal/Point/Shot/Wide, which records the *outcome* of a shot
    // taken from a 45/65, not the restart being earned. Minimal granularity
    // by design: a single "Won" tile, Won/Conceded derived the same way as
    // Kickout via the shared owner toggle (see resolveRestartOutcome).
    id: "FORTY_FIVE",
    label: "45",
    altLabel: "65",
    altLabelForSports: ["hurling", "camogie"],
    colour: "#0891b2",
    textColour: "#ffffff",
    tiles: [
      { label: "Won" },
    ],
    hasMinus: true,
    hasOwnerToggle: true,
  },
  {
    id: "SIDELINE",
    label: "Sideline",
    colour: "#0e7490",
    textColour: "#ffffff",
    tiles: [
      { label: "Won" },
    ],
    hasMinus: true,
    hasOwnerToggle: true,
  },
  {
    id: "TURNOVER",
    label: "Turnover",
    colour: "#ea580c",
    textColour: "#ffffff",
    tiles: [
      { label: "Tackle" },
      { label: "Interception" },
      { label: "HP Error", attributeOtherTeamOnOppositionRow: true },
      { label: "KP Error", attributeOtherTeamOnOppositionRow: true },
      { label: "Overcarried", attributeOtherTeamOnOppositionRow: true },
    ],
    hasMinus: true,
  },
  {
    id: "FREE",
    label: "Free",
    colour: "#e11d48",
    textColour: "#ffffff",
    tiles: [
      { label: "Won" },
      { label: "Conceded" },
    ],
    hasMinus: false,
  },
  {
    // Secondary/collapsed by default (see ProTaggerFamily.secondary) — a card
    // is rare relative to scoring/turnover/restart taps and must not compete
    // with them for thumb space. FOR/OPP records which team's player was
    // sanctioned; Sin Bin is kept as its own distinct kind (not a Yellow
    // alias) so a later pass can derive the resulting player-count window
    // from it without re-tagging historical data.
    id: "DISCIPLINE",
    label: "Discipline",
    colour: "#78716c",
    textColour: "#ffffff",
    tiles: [
      { label: "Yellow" },
      { label: "Sin Bin" },
      { label: "Red" },
    ],
    hasMinus: true,
    secondary: true,
  },
];

export function getFamiliesForSport(sport: ProTaggerSport): readonly ProTaggerFamily[] {
  return PRO_TAGGER_FAMILIES.filter((f) => !f.hideForSports?.includes(sport));
}

export function getTileLabel(tile: ProTaggerTile, sport: ProTaggerSport): string {
  if (tile.altLabel && tile.altForSports?.includes(sport)) return tile.altLabel;
  return tile.label;
}

export function getFamilyLabel(family: ProTaggerFamily, sport: ProTaggerSport): string {
  if (family.altLabel && family.altLabelForSports?.includes(sport)) return family.altLabel;
  return family.label;
}

// ── Restart (kickout/puckout) terminology ────────────────────────────────────

function isHurlingOrCamogie(sport: ProTaggerSport): boolean {
  return sport === "hurling" || sport === "camogie";
}

/** Full word for the RESTART family, sport-aware: "Kickout" / "Puckout". */
export function getRestartTerm(sport: ProTaggerSport): "Kickout" | "Puckout" {
  return isHurlingOrCamogie(sport) ? "Puckout" : "Kickout";
}

/** Short form for the RESTART family, sport-aware: "K/O" / "P/O". */
export function getRestartAbbreviation(sport: ProTaggerSport): "K/O" | "P/O" {
  return isHurlingOrCamogie(sport) ? "P/O" : "K/O";
}

/** "OUR K/O" / "THEIR K/O" (or P/O for hurling/camogie) — used by both the
 *  restart-owner toggle and the team-winner row headings, so the two never
 *  disagree on wording. */
export function getRestartOwnerLabel(sport: ProTaggerSport, owner: "FOR" | "OPP"): string {
  const abbrev = getRestartAbbreviation(sport);
  return owner === "FOR" ? `OUR ${abbrev}` : `THEIR ${abbrev}`;
}

/**
 * Display-only lookup: does this tile, when shown on the opposition (minus)
 * row, need its label prefixed with the *other* team's name to stay
 * unambiguous? Looked up by resolved tile label so callers never have to
 * duplicate the family/tile data. Never affects the stored tile value.
 */
export function tileNeedsOppositionAttribution(
  familyId: ProTaggerFamilyId,
  tileLabel: string,
  sport: ProTaggerSport,
): boolean {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === familyId);
  const tile = family?.tiles.find((t) => getTileLabel(t, sport) === tileLabel);
  return tile?.attributeOtherTeamOnOppositionRow === true;
}
