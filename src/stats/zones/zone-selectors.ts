import { ZONE_MAP_V1_NINE_GRID } from "./zone-maps";
import {
  buildZoneOverlayModel,
  getEventZone,
  getPitchZone,
  getZoneCounts,
  getZoneHotspots,
} from "./zone-engine";
import type { ZoneCoordinateEvent, ZoneMap } from "./zone-types";

export function selectPitchZone(x: number, y: number, zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID) {
  return getPitchZone(x, y, zoneMap);
}

export function selectEventZone<TEvent extends ZoneCoordinateEvent>(
  event: TEvent,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
) {
  return getEventZone(event, zoneMap);
}

export function selectZoneCounts<TEvent extends ZoneCoordinateEvent>(
  events: readonly TEvent[],
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
) {
  return getZoneCounts(events, zoneMap);
}

export function selectZoneHotspots<TEvent extends ZoneCoordinateEvent>(
  events: readonly TEvent[],
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
) {
  return getZoneHotspots(events, zoneMap);
}

export function selectZoneOverlayModel<TEvent extends ZoneCoordinateEvent>(
  events: readonly TEvent[],
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
) {
  return buildZoneOverlayModel(events, zoneMap);
}
