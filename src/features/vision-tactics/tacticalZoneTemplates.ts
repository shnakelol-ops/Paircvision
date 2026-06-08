import type { ZoneRecord } from "../../movement-board/shell/types";

export type TacticalZoneTemplate = {
  id: string;
  label: string;
  zones: ZoneRecord[];
};

export const FOOTBALL_ZONE_TEMPLATES: TacticalZoneTemplate[] = [
  {
    id: "football-defensive-third",
    label: "Defensive Third",
    zones: [{ id: "fz-dt", shape: "rect", color: "blue", label: "", x: 1, y: 1, width: 31, height: 98 }],
  },
  {
    id: "football-middle-third",
    label: "Middle Third",
    zones: [{ id: "fz-mt", shape: "rect", color: "green", label: "", x: 33, y: 1, width: 34, height: 98 }],
  },
  {
    id: "football-attacking-third",
    label: "Attacking Third",
    zones: [{ id: "fz-at", shape: "rect", color: "yellow", label: "", x: 67, y: 1, width: 32, height: 98 }],
  },
  {
    id: "football-scoring-zone",
    label: "Scoring Zone",
    zones: [{ id: "fz-sz", shape: "circle", color: "yellow", label: "", x: 80, y: 50, radius: 18 }],
  },
  {
    id: "football-left-pocket",
    label: "Left Pocket",
    zones: [{ id: "fz-lp", shape: "rect", color: "blue", label: "", x: 65, y: 3, width: 33, height: 28 }],
  },
  {
    id: "football-right-pocket",
    label: "Right Pocket",
    zones: [{ id: "fz-rp", shape: "rect", color: "blue", label: "", x: 65, y: 69, width: 33, height: 28 }],
  },
  {
    id: "football-d-area",
    label: "D Area",
    zones: [{ id: "fz-da", shape: "rect", color: "red", label: "", x: 84, y: 30, width: 16, height: 40 }],
  },
  {
    id: "football-kickout-contest",
    label: "Kickout Contest",
    zones: [{ id: "fz-kc", shape: "circle", color: "red", label: "", x: 50, y: 50, radius: 14 }],
  },
  {
    id: "football-press-trap",
    label: "Press Trap",
    zones: [{ id: "fz-pt", shape: "rect", color: "red", label: "", x: 31, y: 15, width: 28, height: 70 }],
  },
];

export const HURLING_ZONE_TEMPLATES: TacticalZoneTemplate[] = [
  {
    id: "hurling-defensive-third",
    label: "Defensive Third",
    zones: [{ id: "hz-dt", shape: "rect", color: "blue", label: "", x: 1, y: 1, width: 31, height: 98 }],
  },
  {
    id: "hurling-middle-third",
    label: "Middle Third",
    zones: [{ id: "hz-mt", shape: "rect", color: "green", label: "", x: 33, y: 1, width: 34, height: 98 }],
  },
  {
    id: "hurling-attacking-third",
    label: "Attacking Third",
    zones: [{ id: "hz-at", shape: "rect", color: "yellow", label: "", x: 67, y: 1, width: 32, height: 98 }],
  },
  {
    id: "hurling-scoring-zone",
    label: "Scoring Zone",
    zones: [{ id: "hz-sz", shape: "circle", color: "yellow", label: "", x: 80, y: 50, radius: 18 }],
  },
  {
    id: "hurling-left-channel",
    label: "Left Channel",
    zones: [{ id: "hz-lc", shape: "rect", color: "blue", label: "", x: 65, y: 3, width: 33, height: 28 }],
  },
  {
    id: "hurling-right-channel",
    label: "Right Channel",
    zones: [{ id: "hz-rc", shape: "rect", color: "blue", label: "", x: 65, y: 69, width: 33, height: 28 }],
  },
  {
    id: "hurling-d-area",
    label: "D Area",
    zones: [{ id: "hz-da", shape: "rect", color: "red", label: "", x: 84, y: 30, width: 16, height: 40 }],
  },
  {
    id: "hurling-puckout-contest",
    label: "Puckout Contest",
    zones: [{ id: "hz-pc", shape: "circle", color: "red", label: "", x: 50, y: 50, radius: 14 }],
  },
  {
    id: "hurling-break-ball-zone",
    label: "Break Ball Zone",
    zones: [{ id: "hz-bb", shape: "circle", color: "green", label: "", x: 55, y: 50, radius: 12 }],
  },
];
