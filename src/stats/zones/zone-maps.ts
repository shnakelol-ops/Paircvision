import type { ZoneDefinition, ZoneId, ZoneMap } from "./zone-types";

const V1_ZONE_STEP = 100 / 3;

function createBounds(lengthIndex: 0 | 1 | 2, widthIndex: 0 | 1 | 2) {
  const xMin = lengthIndex * V1_ZONE_STEP;
  const xMax = lengthIndex === 2 ? 100 : (lengthIndex + 1) * V1_ZONE_STEP;
  const yMin = widthIndex * V1_ZONE_STEP;
  const yMax = widthIndex === 2 ? 100 : (widthIndex + 1) * V1_ZONE_STEP;
  return { xMin, xMax, yMin, yMax };
}

function createZone(
  id: ZoneId,
  label: string,
  lengthIndex: 0 | 1 | 2,
  widthIndex: 0 | 1 | 2,
): ZoneDefinition {
  return {
    id,
    label,
    bounds: createBounds(lengthIndex, widthIndex),
  };
}

/**
 * Coordinate assumptions:
 * - v1 uses normalized pitch coordinates in a 0..100 domain.
 * - x runs along pitch length (defensive to attacking thirds).
 * - y runs across pitch width (left/centre/right channels).
 * - left/centre/right channels are interpreted in data-space using low/mid/high y buckets.
 */
export const ZONE_MAP_V1_NINE_GRID: ZoneMap = {
  id: "v1-nine-zone-grid",
  label: "Review Zone Engine v1 · 9 Zone Grid",
  coordinateMin: 0,
  coordinateMax: 100,
  zones: [
    createZone("DEFENSIVE_LEFT", "Defensive Left", 0, 0),
    createZone("DEFENSIVE_CENTRE", "Defensive Centre", 0, 1),
    createZone("DEFENSIVE_RIGHT", "Defensive Right", 0, 2),
    createZone("MIDDLE_LEFT", "Middle Left", 1, 0),
    createZone("MIDDLE_CENTRE", "Middle Centre", 1, 1),
    createZone("MIDDLE_RIGHT", "Middle Right", 1, 2),
    createZone("ATTACKING_LEFT", "Attacking Left", 2, 0),
    createZone("ATTACKING_CENTRE", "Attacking Centre", 2, 1),
    createZone("ATTACKING_RIGHT", "Attacking Right", 2, 2),
  ],
};
