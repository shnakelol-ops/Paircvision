import type { ProTaggerSport } from "./pro-tagger-session";

export type ProTaggerFamilyId =
  | "GOAL"
  | "POINT"
  | "TWO_POINT"
  | "SHOT"
  | "WIDE"
  | "RESTART"
  | "TURNOVER"
  | "FREE";

export type ProTaggerTile = {
  label: string;
  altLabel?: string;
  altForSports?: readonly ProTaggerSport[];
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
  },
  {
    id: "TURNOVER",
    label: "Turnover",
    colour: "#ea580c",
    textColour: "#ffffff",
    tiles: [
      { label: "Tackle" },
      { label: "Intercept" },
      { label: "Error" },
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
      { label: "Scored" },
      { label: "Missed" },
    ],
    hasMinus: false,
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
