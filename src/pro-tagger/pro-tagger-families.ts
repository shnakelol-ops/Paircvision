import type { ProTaggerSport } from "./pro-tagger-session";
import { getDisciplineOptions, type ProTaggerDisciplineCardKind } from "./pro-tagger-discipline";

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
   * Display-only labels for the FOR row and the OPP (minus) row, used where
   * one stored tile value reads differently depending on which row it sits
   * on (Turnover: "Tackle" is our Tackle when we win the ball, "Dispossessed"
   * when we lose it). The tap always sends `label` — the stored tile
   * value/tag is never affected. Falls back to the sport-resolved label.
   */
  forRowLabel?: string;
  oppRowLabel?: string;
  /**
   * Per-tile colour override — used only where tiles within one family
   * mean visibly different things (Discipline's Yellow/Sin Bin/Red).
   * Overrides family.colour (FOR row fill) and family.textColour (FOR row
   * text) for this tile only; falls back to the family's colours when
   * absent, which is every tile in every other family. The OPP/minus row's
   * outline also switches to this colour when present, replacing the
   * universal opposition outline colour for that one tile only.
   */
  colour?: string;
  textColour?: string;
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
  /**
   * Only meaningful alongside hasOwnerToggle. Suppresses the "OUR K/O /
   * THEIR K/O"-style owner-toggle control in the header, and the tapped
   * row's own side is used as the restart owner instead of a separately
   * manipulated toggle — so tapping "Home Won" always means Home owns the
   * restart, tapping "Away Won" always means Away does. This can only ever
   * produce the WON outcome (owner === the tapped side, by construction);
   * there is no way to record CONCEDED through this presentation. Used by
   * 45/65 and Sideline, where the coach only needs to answer "who won it" —
   * not by Kickout, which keeps the manipulable owner toggle because a
   * kickout's owner (who is taking it) is a distinct fact from who wins the
   * resulting break.
   */
  ownerImplicitFromTappedSide?: boolean;
  /** Rendered collapsed by default, behind a tap-to-expand header, so a rare
   *  action never competes with the core tiles for visual weight or thumb
   *  space. */
  secondary?: boolean;
  /** Display-only headings for the FOR and OPP rows. When absent, the FOR
   *  row has no heading and the OPP row is headed by the opposition's name. */
  rowHeadings?: { for: string; opp: string; forColour: string; oppColour: string };
  /** Both rows open OUR (home) player picker instead of the tapped row's
   *  team — the row only decides the outcome (Turnover Won / Turnover Lost),
   *  never whose player is tagged. See resolvePickerTeamSide. */
  pickerAlwaysFor?: boolean;
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
    // Non-scoring shot outcomes only. Deliberately excludes:
    //  - "45" — a shot deflected out for a 45 is already captured as the
    //    canonical FORTY_FIVE_WON restart-award event; a second "45" tag
    //    here would be a duplicate semantic representation of the same fact.
    //  - "Mark" — a Mark is a shot *source* (where the shot came from), not
    //    a non-scoring outcome; Mark-sourced shots that score are already
    //    captured via Goal/Point/2PT/Wide -> Mark.
    id: "SHOT",
    label: "Shot",
    colour: "#ca8a04",
    textColour: "#fef9c3",
    tiles: [
      { label: "Short" },
      { label: "Block/Save" },
      { label: "Post" },
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
    // by design: a single "Won" tile per side. Still resolves through the
    // same owner-derived Won/Conceded pathway as Kickout (resolveRestartOutcome)
    // underneath, but ownerImplicitFromTappedSide means the coach only ever
    // answers "who won it" — no manipulable owner toggle, no CONCEDED shown.
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
    ownerImplicitFromTappedSide: true,
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
    ownerImplicitFromTappedSide: true,
  },
  {
    id: "TURNOVER",
    label: "Turnover",
    colour: "#ea580c",
    textColour: "#ffffff",
    // FOR row = our turnovers won, OPP row = our turnovers lost, and both
    // tag OUR player (who regained / who lost possession). Stored tile
    // values — and so the TACKLE / INTERCEPTION / HP ERROR / KP ERROR /
    // OVERCARRIED tags — are unchanged; only the row labels differ. The
    // adapter still stores the OPP row as TURNOVER_LOST with teamSide "FOR",
    // so the opposition's turnover is derived from the same event.
    tiles: [
      { label: "Tackle",       forRowLabel: "Tackle",                 oppRowLabel: "Dispossessed" },
      { label: "Interception", forRowLabel: "Interception",           oppRowLabel: "Intercepted" },
      { label: "HP Error",     forRowLabel: "Opposition HP Error",    oppRowLabel: "HP Error" },
      { label: "KP Error",     forRowLabel: "Opposition KP Error",    oppRowLabel: "KP Error" },
      { label: "Overcarried",  forRowLabel: "Opposition Overcarried", oppRowLabel: "Overcarried" },
    ],
    hasMinus: true,
    // Heading colours: CLAUDE.md's canonical Turnover Won / Turnover Lost.
    rowHeadings: { for: "OUR TURNOVERS WON", opp: "OUR TURNOVERS LOST", forColour: "#a78bfa", oppColour: "#f97316" },
    pickerAlwaysFor: true,
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
    // Always-expanded, first-class family — Discipline matters enough to
    // stay visible, not hidden behind a collapse arrow. FOR/OPP records
    // which team's player was sanctioned; Sin Bin is kept as its own
    // distinct kind (not a Yellow alias) so a later pass can derive the
    // resulting player-count window from it without re-tagging historical
    // data. Per-tile colours (below) are the real sanction signal — the
    // family-level colour/textColour here only back the small category dot
    // next to the "DISCIPLINE" heading, never a tile.
    id: "DISCIPLINE",
    label: "Discipline",
    colour: "#f59e0b",
    textColour: "#ffffff",
    tiles: [
      // Colours match the canonical per-kind colours already used for
      // YELLOW_CARD/SIN_BIN/RED_CARD in reviewPdfExport.ts's EVENT_COLORS —
      // same sanction, same colour, wherever it's shown.
      { label: "Yellow", colour: "#facc15", textColour: "#422006" },
      { label: "Sin Bin", colour: "#fb923c", textColour: "#431407" },
      { label: "Red", colour: "#dc2626", textColour: "#ffffff" },
    ],
    hasMinus: true,
  },
];

export function getFamiliesForSport(sport: ProTaggerSport): readonly ProTaggerFamily[] {
  return PRO_TAGGER_FAMILIES.filter((f) => !f.hideForSports?.includes(sport));
}

// Maps the DISCIPLINE family's tile labels to the sanction kind
// getDisciplineOptions() reasons about. Case matches tile.label exactly
// (resolveKindAndSide upper-cases it separately for the stored tag).
const DISCIPLINE_TILE_CARD_KIND: Record<string, ProTaggerDisciplineCardKind> = {
  "Yellow": "YELLOW_CARD",
  "Sin Bin": "SIN_BIN",
  "Red": "RED_CARD",
};

/**
 * A family's tiles for the given sport. Identical to family.tiles for every
 * family except DISCIPLINE, whose tiles are filtered against
 * getDisciplineOptions(sport) — e.g. Sin Bin never renders for Camogie.
 * Non-destructive: PRO_TAGGER_FAMILIES itself is never mutated, so this must
 * be called at render time by anything that iterates a family's tiles.
 */
export function getFamilyTiles(family: ProTaggerFamily, sport: ProTaggerSport): readonly ProTaggerTile[] {
  if (family.id !== "DISCIPLINE") return family.tiles;
  const allowed = getDisciplineOptions(sport);
  return family.tiles.filter((tile) => {
    const cardKind = DISCIPLINE_TILE_CARD_KIND[tile.label];
    return cardKind == null || allowed.includes(cardKind);
  });
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
 * The restartOwner value ProTaggerFamilyGrid should pass to onTileTap for a
 * tap on the given family + row. Three cases:
 *  - No hasOwnerToggle at all (most families): undefined, unchanged.
 *  - hasOwnerToggle + ownerImplicitFromTappedSide (45/65, Sideline): the
 *    tapped row's own side IS the owner — the shared toggle value is never
 *    consulted, so it's impossible to reach the CONCEDED branch of
 *    resolveRestartOutcome from this presentation.
 *  - hasOwnerToggle without that flag (Kickout): the shared toggle value,
 *    exactly as before — unaffected by which row was tapped.
 */
export function resolveTileRestartOwner(
  family: ProTaggerFamily,
  tappedTeamSide: "FOR" | "OPP",
  toggledOwner: "FOR" | "OPP",
): "FOR" | "OPP" | undefined {
  if (!family.hasOwnerToggle) return undefined;
  if (family.ownerImplicitFromTappedSide) return tappedTeamSide;
  return toggledOwner;
}

/**
 * Display-only: the label a tile shows on the given row — its forRowLabel /
 * oppRowLabel when it has one, otherwise the sport-resolved label. Never
 * affects the stored tile value.
 */
export function getTileRowLabel(tile: ProTaggerTile, sport: ProTaggerSport, row: "FOR" | "OPP"): string {
  const rowLabel = row === "FOR" ? tile.forRowLabel : tile.oppRowLabel;
  return rowLabel ?? getTileLabel(tile, sport);
}

/**
 * getTileRowLabel looked up by family + resolved tile label (the value the
 * grid taps with), for callers that only hold the pending action.
 */
export function getTileRowLabelFor(
  familyId: ProTaggerFamilyId,
  tileLabel: string,
  sport: ProTaggerSport,
  row: "FOR" | "OPP",
): string {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === familyId);
  const tile = family?.tiles.find((t) => getTileLabel(t, sport) === tileLabel);
  return tile ? getTileRowLabel(tile, sport, row) : tileLabel;
}

/**
 * Whose squad the player picker opens for a tap on `tappedRow`. The tapped
 * row's own team for every family, except those with pickerAlwaysFor
 * (Turnover), where both rows tag OUR player.
 */
export function resolvePickerTeamSide(familyId: ProTaggerFamilyId, tappedRow: "FOR" | "OPP"): "FOR" | "OPP" {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === familyId);
  return family?.pickerAlwaysFor ? "FOR" : tappedRow;
}
