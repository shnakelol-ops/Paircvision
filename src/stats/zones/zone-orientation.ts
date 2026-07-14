// Team-relative zone labelling.
//
// zone-engine.ts classifies coordinates in a fixed "canonical, RIGHT-attacking"
// orientation by design (see zone-maps.ts) — low x is always "Defensive", high
// x is always "Attacking", with no notion of which way anyone was actually
// attacking. Every report in this codebase is written for one team (FOR /
// the home side) — "Attacking" and "Defensive" always mean *that* team's
// attacking and defensive thirds, for every event in the report, including
// events belonging to the opposition. A Mungret score that lands in Adare's
// defensive third must read "Defensive Centre" (that's where Adare conceded
// it), never "Attacking Centre" from Mungret's own point of view — the
// report has one owner and one consistent orientation throughout.
//
// Opposition Shot Profile is the one exception: its captions describe where
// the opposition scored from *their* attacking third, so coaches never need
// to mentally reverse the pitch on that page.
//
// The FOR team's attacking direction flips once, at half-time (ends swap).
// This module resolves that per-period direction and, only when it's LEFT,
// rotates a coordinate 180° about the pitch centre before handing it to the
// unmodified zone-engine — a genuine rotation (both axes flip together),
// not the kind of single-axis mirror that caused the earlier coordinate
// capture bug. The event's real stored x/y/nx/ny are never touched; the
// rotated copy exists only for this classification lookup. Assumes
// normalised 0..1 coordinates (nx/ny, x/y), matching PdfExportEvent and
// LoggedMatchEvent.
import { ZONE_MAP_V1_NINE_GRID } from "./zone-maps";
import { buildZoneOverlayModel, getEventZone, getZoneCounts, getZoneHotspots } from "./zone-engine";
import type {
  ZoneBounds,
  ZoneCoordinateEvent,
  ZoneCount,
  ZoneHotspot,
  ZoneMap,
  ZoneOverlayModel,
} from "./zone-types";
import type { MatchEventPeriod } from "../../core/stats/stats-event-model";

export type AttackingDirection = "LEFT" | "RIGHT";

/** REPORT = FOR/home thirds for every event. OPP = opposition's own thirds (Shot Profile only). */
export type ZoneLabelPerspective = "REPORT" | "OPP";

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
 * Effective attacking direction for zone-labelling purposes.
 *
 * REPORT (default): always the FOR team's direction for that event's half —
 * one consistent orientation across mixed FOR/OPP subsets (Zone Analysis,
 * Turnover & Territory danger zone, etc.).
 *
 * OPP: the opposition's own attacking direction (opposite of FOR for that
 * half) — used only on Opposition Shot Profile so captions read from their
 * point of view.
 */
export function resolveEventAttackingDirection(
  teamSide: "FOR" | "OPP" | string | null | undefined,
  period: MatchEventPeriod | null | undefined,
  firstHalfAttackingDirection: AttackingDirection,
  perspective: ZoneLabelPerspective = "REPORT",
): AttackingDirection {
  void teamSide;
  const forDirection = resolveForAttackingDirection(period, firstHalfAttackingDirection);
  return perspective === "OPP" ? oppositeDirection(forDirection) : forDirection;
}

/**
 * Returns a coordinate-rotated *copy* of the event for zone-classification
 * purposes only — a no-op when the effective direction is RIGHT. Never
 * mutates the input and never touches any field but the coordinate ones.
 */
export function toTeamRelativeZoneEvent<TEvent extends TeamRelativeZoneEvent>(
  event: TEvent,
  firstHalfAttackingDirection: AttackingDirection,
  perspective: ZoneLabelPerspective = "REPORT",
): TEvent {
  const direction = resolveEventAttackingDirection(
    event.teamSide,
    event.period,
    firstHalfAttackingDirection,
    perspective,
  );
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
  perspective: ZoneLabelPerspective = "REPORT",
): TEvent[] {
  return events.map((event) => toTeamRelativeZoneEvent(event, firstHalfAttackingDirection, perspective));
}

export function getTeamRelativeZoneCounts<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  firstHalfAttackingDirection: AttackingDirection,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
  perspective: ZoneLabelPerspective = "REPORT",
): ZoneCount[] {
  return getZoneCounts(toTeamRelativeZoneEvents(events, firstHalfAttackingDirection, perspective), zoneMap);
}

export function getTeamRelativeZoneHotspots<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  firstHalfAttackingDirection: AttackingDirection,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
  perspective: ZoneLabelPerspective = "REPORT",
): ZoneHotspot[] {
  return getZoneHotspots(toTeamRelativeZoneEvents(events, firstHalfAttackingDirection, perspective), zoneMap);
}

export function buildTeamRelativeZoneOverlayModel<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  firstHalfAttackingDirection: AttackingDirection,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
  perspective: ZoneLabelPerspective = "REPORT",
): ZoneOverlayModel {
  return buildZoneOverlayModel(toTeamRelativeZoneEvents(events, firstHalfAttackingDirection, perspective), zoneMap);
}

function reflectBounds(bounds: ZoneBounds): ZoneBounds {
  return {
    xMin: 100 - bounds.xMax,
    xMax: 100 - bounds.xMin,
    yMin: 100 - bounds.yMax,
    yMax: 100 - bounds.yMin,
  };
}

/**
 * A ZoneDefinition's `.bounds` are always the fixed canonical bounds for
 * that zone id (zone-maps.ts) — never rotated, even when the events that
 * landed in it were. Drawing a highlight rectangle straight from those
 * bounds puts it on the wrong physical side of the pitch whenever the
 * contributing events needed rotation (e.g. a team attacking LEFT), even
 * though the zone *label* is now correct — the box would sit opposite the
 * individual event dots plotted at their real, physical positions.
 *
 * This resolves the majority effective attacking direction among the
 * events that actually produced `zoneId` and reflects the bounds back to
 * physical space to match, so a highlight box drawn from the result lines
 * up with the real dots. Falls back to the unrotated bounds when no
 * contributing event needed rotation (the common, single-direction case).
 */
export function getTeamRelativeZoneDisplayBounds<TEvent extends TeamRelativeZoneEvent>(
  events: readonly TEvent[],
  zoneId: string,
  zoneBounds: ZoneBounds,
  firstHalfAttackingDirection: AttackingDirection,
  zoneMap: ZoneMap = ZONE_MAP_V1_NINE_GRID,
  perspective: ZoneLabelPerspective = "REPORT",
): ZoneBounds {
  let leftCount = 0;
  let rightCount = 0;
  for (const event of events) {
    const zone = getEventZone(
      toTeamRelativeZoneEvent(event, firstHalfAttackingDirection, perspective),
      zoneMap,
    );
    if (!zone || zone.id !== zoneId) continue;
    const direction = resolveEventAttackingDirection(
      event.teamSide,
      event.period,
      firstHalfAttackingDirection,
      perspective,
    );
    if (direction === "LEFT") leftCount++; else rightCount++;
  }
  return leftCount > rightCount ? reflectBounds(zoneBounds) : zoneBounds;
}
