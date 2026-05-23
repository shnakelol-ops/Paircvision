export type ZoneCoordinateEvent = {
  x?: number;
  y?: number;
  nx?: number;
  ny?: number;
};

export type ZoneBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type ZoneId =
  | "DEFENSIVE_LEFT"
  | "DEFENSIVE_CENTRE"
  | "DEFENSIVE_RIGHT"
  | "MIDDLE_LEFT"
  | "MIDDLE_CENTRE"
  | "MIDDLE_RIGHT"
  | "ATTACKING_LEFT"
  | "ATTACKING_CENTRE"
  | "ATTACKING_RIGHT";

export type ZoneDefinition = {
  id: ZoneId;
  label: string;
  bounds: ZoneBounds;
};

export type ZoneMap = {
  id: string;
  label: string;
  coordinateMin: number;
  coordinateMax: number;
  zones: readonly ZoneDefinition[];
};

export type ZoneCount = ZoneDefinition & {
  count: number;
};

export type ZoneHotspot = {
  zoneId: ZoneId;
  label: string;
  bounds: ZoneBounds;
  count: number;
  percentage: number;
  rank: number;
};

export type ZoneOverlayZone = ZoneDefinition & {
  count: number;
  percentage: number;
  hotspotRank: number | null;
  isHotspot: boolean;
};

export type ZoneOverlayModel = {
  zoneMapId: string;
  totalEvents: number;
  zones: ZoneOverlayZone[];
  hotspots: ZoneHotspot[];
};
