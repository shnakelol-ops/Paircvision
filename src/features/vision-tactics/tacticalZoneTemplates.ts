import type { ZoneRecord } from "../../movement-board/shell/types";

export type TacticalZoneTemplate = {
  id: string;
  label: string;
  zones: ZoneRecord[];
};

export const FOOTBALL_ZONE_TEMPLATES: TacticalZoneTemplate[] = [
  {
    id: "football-scoring-zone",
    label: "Scoring Zone",
    zones: [{ id: "fz-sz", shape: "circle", color: "yellow", label: "", x: 80, y: 50, radius: 18 }],
  },
  {
    id: "football-pocket-left",
    label: "Pocket Left",
    zones: [{ id: "fz-pl", shape: "rect", color: "blue", label: "", x: 65, y: 3, width: 33, height: 28 }],
  },
  {
    id: "football-pocket-right",
    label: "Pocket Right",
    zones: [{ id: "fz-pr", shape: "rect", color: "blue", label: "", x: 65, y: 69, width: 33, height: 28 }],
  },
  {
    id: "football-d-area",
    label: "D Area",
    zones: [{ id: "fz-da", shape: "rect", color: "red", label: "", x: 84, y: 30, width: 16, height: 40 }],
  },
  {
    id: "football-middle-eight",
    label: "Middle Eight",
    zones: [{ id: "fz-me", shape: "rect", color: "green", label: "", x: 31, y: 8, width: 38, height: 84 }],
  },
  {
    id: "football-kickout-contest",
    label: "Kickout Contest",
    zones: [{ id: "fz-kc", shape: "circle", color: "red", label: "", x: 50, y: 50, radius: 14 }],
  },
  {
    id: "football-trap-zone",
    label: "Trap Zone",
    zones: [{ id: "fz-tz", shape: "rect", color: "red", label: "", x: 31, y: 15, width: 28, height: 70 }],
  },
];

export const HURLING_ZONE_TEMPLATES: TacticalZoneTemplate[] = [
  {
    id: "hurling-scoring-zone",
    label: "Scoring Zone",
    zones: [{ id: "hz-sz", shape: "circle", color: "yellow", label: "", x: 80, y: 50, radius: 18 }],
  },
  {
    id: "hurling-pocket-left",
    label: "Pocket Left",
    zones: [{ id: "hz-pl", shape: "rect", color: "blue", label: "", x: 65, y: 3, width: 33, height: 28 }],
  },
  {
    id: "hurling-pocket-right",
    label: "Pocket Right",
    zones: [{ id: "hz-pr", shape: "rect", color: "blue", label: "", x: 65, y: 69, width: 33, height: 28 }],
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
    id: "hurling-third-man",
    label: "Third-Man Zone",
    zones: [{ id: "hz-tm", shape: "rect", color: "green", label: "", x: 42, y: 15, width: 22, height: 70 }],
  },
  {
    id: "hurling-midfield-squeeze",
    label: "Midfield Squeeze",
    zones: [{ id: "hz-ms", shape: "rect", color: "green", label: "", x: 36, y: 8, width: 28, height: 84 }],
  },
];
