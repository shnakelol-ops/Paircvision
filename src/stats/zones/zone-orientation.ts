// Team-relative zone labelling.
//
// zone-engine.ts classifies coordinates in a fixed "canonical, RIGHT-attacking"
// orientation by design (see zone-maps.ts) — low x is always "Defensive", high
// x is always "Attacking", regardless of which team the event belongs to or
// which way that team was actually attacking. A team's attacking direction
// flips twice: FOR and OPP attack opposite ends, and both swap ends at
// half-time. Feeding raw coordinates straight into the canonical engine for
// every team/half combination mislabels roughly half of all events —
// e.g. a team attacking LEFT has its attacking-third events at low x, which
// the canonical map calls "Defensive".
//
// This module resolves each event's own effective attacking direction and,
// only when that direction is LEFT, rotates its coordinate 180° about the
// pitch centre before handing it to the unmodified zone-engine — a genuine
// rotation (both axes flip together), not the kind of single-axis mirror
// that caused the earlier coordinate capture bug. The event's real stored
// x/y/nx/ny are never touched; the rotated copy exists only for this
// classification lookup. Assumes normalised 0..1 coordinates (nx/ny, x/y),
// matching PdfExportEvent and LoggedMatchEvent.
import { ZONE_MAP_V1_NINE_GRID } from "./zone-maps";
import { getZoneCounts, getZoneHotspots, buildZoneOverlayModel } from "./zone-engine";
import type {
  ZoneCoordinateEvent,
  ZoneCount,
  ZoneHotspot,
  ZoneMap,
  ZoneOverlayModel,
} from "./zone-types";
import type { MatchEventPeriod } from "../../core/stats/stats-event-model";

export type AttackingDirection = "LEFT" | "RIGHT";

export type TeamRelativeZoneEvent = ZoneCoordinateEvent & {
  teamSide?: "FOR" | "OPP" | string | null;
  period?: MatchEventPeriod | null;
};

function oppositeDirection(direction: AttackingDirection): AttackingDirection {
  return direction === "LEFT" ? "RIGHT" : "LEFT";
}

/**
 * The FOR team's attacking direction for a given period, given the direction
 * they attacked in the first half. Teams swap ends at half-time.
 */
export function resolveForAttackingDirection(
  period: MatchEventPeriod | null | undefined,
  firstHalfAttackingDirection: AttackingDirection,
): AttackingDirection {
  return period === "2H" ? oppositeDirection(firstHalfAttackingDirection) : firstHalfAttackingDirection;
}

/**
 * An individual event's effective attacking direction: which physical end
 * *this event's team* was attacking during *this event's half*. OPP always
 * attacks the opposite end from FOR in the same half.
 */
export function resolveEventAttackingDirection(
  teamSide: "FOR" | "OPP" | string | null | undefined,
  period: MatchEventPeriod | null | undefined,
  firstHalfAttackingDirection: AttackingDirection,
): AttackingDirection {
  const forDirection = resolveForAttackingDirection(period, firstHalfAttackingDirection);
  return teamSide === "OPP" ? oppositeDirection(forDirection) : forDirection;
}

/**
 * Returns a coordinate-rotated *copy* of the event for zone-classification
 * purposes only — a no-op when the event's team was already attacking RIGHT
 * that half. Never mutates the input and never touches any field but the
 * coordinate ones.
 */
export function toTeamRelativeZoneEvent<TEvent extends TeamRelativeZoneEvent>(
  event: TEvent,
  firstHalfAttackingDirection: AttackingDirection,
): TEvent {
  const direction = resolveEventAttackingDirection(event.teamSide, event.period, firstHalfAttackingDirection);
  if (direction === "RIGHT") return event;
  return {
    ...event,
    ...(event.x != null ? { x: 1 - event.x } : {}),
    ...(event.y != null ? { y: 1 - event.y } : {}),
    ...(event.nx != null ? { nx: 1 - event.nx } : {}),
    ...(event.ny != null ? { ny: 1 - event.ny } : {}),
  };
}

function toTeamRelativeZoneEvents<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  firstHalfAttackingDirection: AttackingDirection,
): TEvent[] {
  return events.map((event) => toTeamRelativeZoneEvent(event, firstHalfAttackingDirection));
}

export function getTeamRelativeZoneCounts<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  firstHalfAttackingDirection: AttackingDirection,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
): ZoneCount[] {
  return getZoneCounts(toTeamRelativeZoneEvents(events, firstHalfAttackingDirection), zoneMap);
}

export function getTeamRelativeZoneHotspots<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  firstHalfAttackingDirection: AttackingDirection,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
): ZoneHotspot[] {
  return getZoneHotspots(toTeamRelativeZoneEvents(events, firstHalfAttackingDirection), zoneMap);
}

export function buildTeamRelativeZoneOverlayModel<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  firstHalfAttackingDirection: AttackingDirection,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
): ZoneOverlayModel {
  return buildZoneOverlayModel(toTeamRelativeZoneEvents(events, firstHalfAttackingDirection), zoneMap);
}
