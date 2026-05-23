import { ZONE_MAP_V1_NINE_GRID } from "./zone-maps";
import type {
  ZoneCoordinateEvent,
  ZoneCount,
  ZoneDefinition,
  ZoneHotspot,
  ZoneMap,
  ZoneOverlayModel,
  ZoneOverlayZone,
} from "./zone-types";

const COORDINATE_EPSILON = 1e-9;

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeToZoneCoordinate(value: number, zoneMap: ZoneMap): number {
  const mapRange = zoneMap.coordinateMax - zoneMap.coordinateMin;
  // Compatibility rule: event coordinates in [0, 1] are treated as normalized fractions.
  // This lets current canonical review events (nx/ny, x/y on 0..1 scale) feed this engine.
  const maybePercentValue = value >= 0 && value <= 1
    ? zoneMap.coordinateMin + value * mapRange
    : value;
  // Out-of-bounds policy for v1: clamp into map range for deterministic counting.
  return clampToRange(maybePercentValue, zoneMap.coordinateMin, zoneMap.coordinateMax);
}

function extractCoordinateValue(
  primary: number | undefined,
  fallback: number | undefined,
  zoneMap: ZoneMap,
): number | null {
  const sourceValue = typeof primary === "number" && Number.isFinite(primary)
    ? primary
    : typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : null;
  if (sourceValue == null) return null;
  return normalizeToZoneCoordinate(sourceValue, zoneMap);
}

function compareZonesByCountThenLabel(a: ZoneCount, b: ZoneCount): number {
  if (b.count !== a.count) return b.count - a.count;
  return a.label.localeCompare(b.label, "en");
}

function computeTotalCount(zoneCounts: readonly ZoneCount[]): number {
  let total = 0;
  for (const zone of zoneCounts) total += zone.count;
  return total;
}

function buildHotspotsFromCounts(zoneCounts: readonly ZoneCount[]): ZoneHotspot[] {
  const totalCount = computeTotalCount(zoneCounts);
  if (totalCount === 0) return [];

  const sorted = [...zoneCounts]
    .filter((zone) => zone.count > 0)
    .sort(compareZonesByCountThenLabel);

  return sorted.map((zone, index) => ({
    zoneId: zone.id,
    label: zone.label,
    bounds: zone.bounds,
    count: zone.count,
    percentage: (zone.count / totalCount) * 100,
    rank: index + 1,
  }));
}

export function getPitchZone(x: number, y: number, zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID): ZoneDefinition | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const normalizedX = normalizeToZoneCoordinate(x, zoneMap);
  const normalizedY = normalizeToZoneCoordinate(y, zoneMap);

  for (const zone of zoneMap.zones) {
    const { xMin, xMax, yMin, yMax } = zone.bounds;
    const inX =
      normalizedX >= xMin &&
      (normalizedX < xMax ||
        (Math.abs(normalizedX - zoneMap.coordinateMax) <= COORDINATE_EPSILON &&
          Math.abs(xMax - zoneMap.coordinateMax) <= COORDINATE_EPSILON));
    const inY =
      normalizedY >= yMin &&
      (normalizedY < yMax ||
        (Math.abs(normalizedY - zoneMap.coordinateMax) <= COORDINATE_EPSILON &&
          Math.abs(yMax - zoneMap.coordinateMax) <= COORDINATE_EPSILON));
    if (inX && inY) return zone;
  }

  return null;
}

export function getEventZone<TEvent extends ZoneCoordinateEvent>(
  event: TEvent,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
): ZoneDefinition | null {
  const resolvedX = extractCoordinateValue(event.x, event.nx, zoneMap);
  const resolvedY = extractCoordinateValue(event.y, event.ny, zoneMap);
  if (resolvedX == null || resolvedY == null) return null;
  return getPitchZone(resolvedX, resolvedY, zoneMap);
}

export function getZoneCounts<TEvent extends ZoneCoordinateEvent>(
  events: readonly TEvent[],
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
): ZoneCount[] {
  const countsByZoneId = new Map(zoneMap.zones.map((zone) => [zone.id, 0]));

  for (const event of events) {
    const zone = getEventZone(event, zoneMap);
    if (!zone) continue;
    countsByZoneId.set(zone.id, (countsByZoneId.get(zone.id) ?? 0) + 1);
  }

  return zoneMap.zones.map((zone) => ({
    ...zone,
    count: countsByZoneId.get(zone.id) ?? 0,
  }));
}

export function getZoneHotspots<TEvent extends ZoneCoordinateEvent>(
  events: readonly TEvent[],
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
): ZoneHotspot[] {
  const zoneCounts = getZoneCounts(events, zoneMap);
  return buildHotspotsFromCounts(zoneCounts);
}

export function buildZoneOverlayModel<TEvent extends ZoneCoordinateEvent>(
  events: readonly TEvent[],
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
): ZoneOverlayModel {
  const zoneCounts = getZoneCounts(events, zoneMap);
  const totalEvents = computeTotalCount(zoneCounts);
  const hotspots = buildHotspotsFromCounts(zoneCounts);
  const hotspotRankByZoneId = new Map(hotspots.map((hotspot) => [hotspot.zoneId, hotspot.rank]));

  const zones: ZoneOverlayZone[] = zoneCounts.map((zone) => {
    const hotspotRank = hotspotRankByZoneId.get(zone.id) ?? null;
    return {
      id: zone.id,
      label: zone.label,
      bounds: zone.bounds,
      count: zone.count,
      percentage: totalEvents > 0 ? (zone.count / totalEvents) * 100 : 0,
      hotspotRank,
      isHotspot: hotspotRank != null,
    };
  });

  return {
    zoneMapId: zoneMap.id,
    totalEvents,
    zones,
    hotspots,
  };
}
