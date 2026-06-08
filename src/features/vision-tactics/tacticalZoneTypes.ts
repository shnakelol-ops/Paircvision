export type { ZoneShape, ZoneColor, ZoneRecord as TacticalZone } from "../../movement-board/shell/types";

export const ZONE_COLOR_CSS: Record<string, string> = {
  yellow: "rgba(242, 201, 76, 0.88)",
  red:    "rgba(220, 38, 38, 0.78)",
  blue:   "rgba(37, 99, 235, 0.78)",
  green:  "rgba(22, 163, 74, 0.78)",
};

export const ZONE_COLOR_LABEL: Record<string, string> = {
  yellow: "Opportunity",
  red:    "Danger",
  blue:   "Structure",
  green:  "Trigger",
};

export const ZONE_COLOR_OPTIONS = ["yellow", "red", "blue", "green"] as const;
